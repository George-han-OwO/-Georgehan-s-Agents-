import { NextResponse } from 'next/server';
import { StoreError } from './room-store';
import { loadState, saveState } from './state-store';
import { PROTOCOL_VERSION } from './protocol';
import {
  type DeviceAuthContext,
  signatureHeadersPresent,
  verifyDeviceRequest,
} from './device-auth';

const SECURITY_KEY = '__murmurApiSecurityV1';
const AUTH_MAX_FAILURES = 5;
const AUTH_LOCK_MS = 5 * 60_000;
const REQUEST_WINDOW_MS = 60_000;
const REQUEST_MAX_PER_WINDOW = 240;

type SecurityState = {
  failures: Record<string, { count: number; lockedUntil: number }>;
  requests: Record<string, { count: number; windowStartedAt: number }>;
};

function getSecurityState() {
  return loadState<SecurityState>(SECURITY_KEY, () => ({ failures: {}, requests: {} }));
}

function persistSecurityState(state: SecurityState) {
  saveState(SECURITY_KEY, state);
}

function getClientAddress(request: Request) {
  const forwarded = request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-real-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || 'direct-client';
}

function prune(state: SecurityState, now: number) {
  let changed = false;
  for (const [key, value] of Object.entries(state.failures)) {
    if (value.lockedUntil < now && value.count === 0) {
      delete state.failures[key];
      changed = true;
    }
  }
  for (const [key, value] of Object.entries(state.requests)) {
    if (now - value.windowStartedAt > REQUEST_WINDOW_MS * 2) {
      delete state.requests[key];
      changed = true;
    }
  }
  return changed;
}

function takeRequestSlot(request: Request) {
  const state = getSecurityState();
  const now = Date.now();
  prune(state, now);
  const key = `${getClientAddress(request)}:${new URL(request.url).pathname}`;
  const current = state.requests[key];
  if (!current || now - current.windowStartedAt >= REQUEST_WINDOW_MS) {
    state.requests[key] = { count: 1, windowStartedAt: now };
    persistSecurityState(state);
    return;
  }
  current.count += 1;
  persistSecurityState(state);
  if (current.count > REQUEST_MAX_PER_WINDOW) throw new StoreError('请求过于频繁，请稍后重试', 429);
}

async function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftDigest);
  const rightBytes = new Uint8Array(rightDigest);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < Math.max(leftBytes.length, rightBytes.length); index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export function success<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, protocol: PROTOCOL_VERSION, data }, { status });
}

export function failure(error: unknown) {
  if (error instanceof StoreError) {
    const headers = error.status === 429 ? { 'Retry-After': '60' } : undefined;
    return NextResponse.json({ ok: false, error: { message: error.message } }, { status: error.status, headers });
  }
  const message = error instanceof Error ? error.message : '请求格式不正确';
  return NextResponse.json({ ok: false, error: { message } }, { status: 400 });
}

async function authenticateAdmin(request: Request, configuredToken: string): Promise<DeviceAuthContext> {
  const authorization = request.headers.get('authorization') ?? '';
  const suppliedToken = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : request.headers.get('x-murmur-token');
  const key = getClientAddress(request);
  const now = Date.now();
  const state = getSecurityState();
  prune(state, now);
  const failure = state.failures[key];
  if (failure?.lockedUntil && failure.lockedUntil > now) throw new StoreError('接口暂时锁定，请稍后重试', 429);
  if (!suppliedToken || suppliedToken.length > 512 || !(await constantTimeEqual(suppliedToken, configuredToken))) {
    // Re-read after the asynchronous comparison so simultaneous failures from
    // one client cannot overwrite each other's lockout counter.
    const currentState = getSecurityState();
    const currentNow = Date.now();
    prune(currentState, currentNow);
    const currentFailure = currentState.failures[key];
    if (currentFailure?.lockedUntil && currentFailure.lockedUntil > currentNow) {
      throw new StoreError('接口暂时锁定，请稍后重试', 429);
    }
    const next = currentFailure && currentFailure.lockedUntil <= currentNow ? currentFailure : { count: 0, lockedUntil: 0 };
    next.count += 1;
    if (next.count >= AUTH_MAX_FAILURES) {
      next.lockedUntil = currentNow + AUTH_LOCK_MS;
      next.count = 0;
    }
    currentState.failures[key] = next;
    persistSecurityState(currentState);
    throw new StoreError('无效的接口凭证', 401);
  }
  const currentState = getSecurityState();
  delete currentState.failures[key];
  persistSecurityState(currentState);
  return { kind: 'admin' };
}

export async function requireMutationAuth(request: Request): Promise<DeviceAuthContext> {
  takeRequestSlot(request);
  const requestUrl = new URL(request.url);
  const forwardedProtocol = request.headers.get('x-forwarded-proto') ?? requestUrl.protocol.replace(':', '');
  if (process.env.MURMUR_ENFORCE_HTTPS === 'true' && forwardedProtocol !== 'https' && !['localhost', '127.0.0.1'].includes(requestUrl.hostname)) {
    throw new StoreError('写接口必须通过 HTTPS 访问', 426);
  }
  const configuredToken = process.env.MURMUR_API_TOKEN;
  if (signatureHeadersPresent(request)) return verifyDeviceRequest(request);
  if (!configuredToken) {
    if (process.env.NODE_ENV === 'production') {
      throw new StoreError('服务端尚未配置 MURMUR_API_TOKEN', 503);
    }
    return { kind: 'admin' };
  }
  return authenticateAdmin(request, configuredToken);
}

export function requirePairingRequest(request: Request) {
  takeRequestSlot(request);
  const requestUrl = new URL(request.url);
  const forwardedProtocol = request.headers.get('x-forwarded-proto') ?? requestUrl.protocol.replace(':', '');
  if (process.env.MURMUR_ENFORCE_HTTPS === 'true' && forwardedProtocol !== 'https' && !['localhost', '127.0.0.1'].includes(requestUrl.hostname)) {
    throw new StoreError('配对接口必须通过 HTTPS 访问', 426);
  }
}

export async function requireAdminAuth(request: Request): Promise<DeviceAuthContext> {
  const context = await requireMutationAuth(request);
  if (context.kind !== 'admin') throw new StoreError('此操作只允许管理员凭证执行', 403);
  return context;
}

export function assertDeviceScope(context: DeviceAuthContext, deviceId: string) {
  if (context.kind === 'device' && context.deviceId !== deviceId) {
    throw new StoreError('设备凭证不能操作其他设备', 403);
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (contentLength > 1_000_000) throw new StoreError('请求体过大', 413);
    const raw = await request.text();
    if (raw.length > 1_000_000) throw new StoreError('请求体过大', 413);
    return JSON.parse(raw) as T;
  } catch (error) {
    if (error instanceof StoreError) throw error;
    throw new StoreError('请求体必须是有效 JSON');
  }
}
