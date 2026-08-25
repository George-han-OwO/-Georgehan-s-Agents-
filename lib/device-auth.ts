import { StoreError } from './room-store';
import { loadState, saveState } from './state-store';
import type {
  CompleteDevicePairingRequest,
  RevokeDeviceRequest,
  RotateDeviceKeyRequest,
  StartDevicePairingRequest,
} from './protocol';

const DEVICE_AUTH_KEY = '__murmurDeviceAuthV1';
const PAIRING_TTL_MS = 5 * 60_000;
const SIGNATURE_CLOCK_SKEW_MS = 60_000;
const NONCE_TTL_MS = 2 * 60_000;
const MAX_PAIRINGS = 100;

export type DeviceAuthContext =
  | { kind: 'admin' }
  | { kind: 'device'; deviceId: string; keyVersion: number };

type DeviceCredential = {
  deviceId: string;
  deviceName: string;
  algorithm: 'Ed25519';
  publicKey: string;
  keyVersion: number;
  createdAt: string;
  rotatedAt: string | null;
  revokedAt: string | null;
};

type PairingRecord = {
  id: string;
  codeHash: string;
  expectedDeviceId: string | null;
  expectedDeviceName: string | null;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
};

type DeviceAuthStore = {
  credentials: Record<string, DeviceCredential>;
  pairings: PairingRecord[];
  usedNonces: Record<string, number>;
};

const isoNow = () => new Date().toISOString();

function getStore() {
  return loadState<DeviceAuthStore>(DEVICE_AUTH_KEY, () => ({ credentials: {}, pairings: [], usedNonces: {} }));
}

function persist(store: DeviceAuthStore) {
  saveState(DEVICE_AUTH_KEY, store);
}

function text(value: unknown, field: string, maxLength = 180) {
  if (typeof value !== 'string' || !value.trim()) throw new StoreError(`${field} 不能为空`);
  if (value.length > maxLength) throw new StoreError(`${field} 不能超过 ${maxLength} 个字符`);
  return value.trim();
}

function randomBytes(size: number) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new StoreError('公钥或签名不是有效的 base64url 编码');
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return encodeBase64Url(new Uint8Array(digest));
}

async function validatePublicKey(publicKey: string) {
  const encoded = text(publicKey, 'publicKey', 1_000);
  const bytes = decodeBase64Url(encoded);
  if (bytes.length > 256) throw new StoreError('公钥大小不符合要求');
  try {
    await crypto.subtle.importKey('spki', bytes, { name: 'Ed25519' } as AlgorithmIdentifier, false, ['verify']);
  } catch {
    throw new StoreError('publicKey 不是有效的 Ed25519 公钥');
  }
  return encoded;
}

function prune(store: DeviceAuthStore, now = Date.now()) {
  let changed = false;
  const previousPairingCount = store.pairings.length;
  store.pairings = store.pairings.filter((pairing) => Date.parse(pairing.expiresAt) > now || pairing.usedAt !== null).slice(-MAX_PAIRINGS);
  changed ||= store.pairings.length !== previousPairingCount;
  for (const [nonce, expiresAt] of Object.entries(store.usedNonces)) {
    if (expiresAt <= now) {
      delete store.usedNonces[nonce];
      changed = true;
    }
  }
  return changed;
}

export async function startPairing(input: StartDevicePairingRequest = {}) {
  const now = new Date();
  const pairingCode = encodeBase64Url(randomBytes(18));
  const codeHash = await sha256(pairingCode);
  const store = getStore();
  prune(store);
  const record: PairingRecord = {
    id: `pair_${crypto.randomUUID()}`,
    codeHash,
    expectedDeviceId: input.deviceId ? text(input.deviceId, 'deviceId', 100) : null,
    expectedDeviceName: input.deviceName ? text(input.deviceName, 'deviceName', 120) : null,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PAIRING_TTL_MS).toISOString(),
    usedAt: null,
  };
  store.pairings.push(record);
  persist(store);
  return {
    pairingId: record.id,
    pairingCode,
    expectedDeviceId: record.expectedDeviceId,
    expectedDeviceName: record.expectedDeviceName,
    expiresAt: record.expiresAt,
    oneTime: true,
  };
}

export async function completePairing(input: CompleteDevicePairingRequest) {
  const pairingCode = text(input?.pairingCode, 'pairingCode', 256);
  const deviceId = text(input?.deviceId, 'deviceId', 100);
  const deviceName = text(input?.deviceName, 'deviceName', 120);
  const publicKey = await validatePublicKey(input?.publicKey);
  const hash = await sha256(pairingCode);
  const store = getStore();
  prune(store);
  const pairing = store.pairings.find((candidate) => candidate.codeHash === hash && candidate.usedAt === null && Date.parse(candidate.expiresAt) > Date.now());
  if (!pairing) throw new StoreError('配对码无效、已使用或已过期', 401);
  if (pairing.expectedDeviceId && pairing.expectedDeviceId !== deviceId) {
    throw new StoreError('配对码没有授权这台设备', 403);
  }
  const existing = store.credentials[deviceId];
  if (existing && !existing.revokedAt) throw new StoreError('设备已经配对，请先吊销旧凭证再重新配对', 409);
  const now = isoNow();
  const credential: DeviceCredential = {
    deviceId,
    deviceName: pairing.expectedDeviceName ?? deviceName,
    algorithm: 'Ed25519',
    publicKey,
    keyVersion: existing ? existing.keyVersion + 1 : 1,
    createdAt: existing?.createdAt ?? now,
    rotatedAt: existing ? now : null,
    revokedAt: null,
  };
  pairing.usedAt = now;
  store.credentials[deviceId] = credential;
  persist(store);
  return {
    deviceId: credential.deviceId,
    deviceName: credential.deviceName,
    algorithm: credential.algorithm,
    keyVersion: credential.keyVersion,
    pairedAt: now,
    expiresAt: null,
    note: '私钥不会发送给服务器，请只在设备本地保存私钥。',
  };
}

export async function rotateDeviceKey(input: RotateDeviceKeyRequest) {
  const deviceId = text(input?.deviceId, 'deviceId', 100);
  const publicKey = await validatePublicKey(input?.publicKey);
  const store = getStore();
  const current = store.credentials[deviceId];
  if (!current || current.revokedAt) throw new StoreError('设备不存在或凭证已吊销', 404);
  const now = isoNow();
  current.publicKey = publicKey;
  current.keyVersion += 1;
  current.rotatedAt = now;
  persist(store);
  return { deviceId, keyVersion: current.keyVersion, rotatedAt: now };
}

export function revokeDevice(input: RevokeDeviceRequest) {
  const deviceId = text(input?.deviceId, 'deviceId', 100);
  const store = getStore();
  const credential = store.credentials[deviceId];
  if (!credential || credential.revokedAt) throw new StoreError('设备不存在或已经吊销', 404);
  const now = isoNow();
  credential.revokedAt = now;
  persist(store);
  return { deviceId, revokedAt: now, reason: input.reason?.trim().slice(0, 240) || '管理员吊销' };
}

export function listDevices() {
  const store = getStore();
  if (prune(store)) persist(store);
  return Object.values(store.credentials).map((credential) => ({
    deviceId: credential.deviceId,
    deviceName: credential.deviceName,
    algorithm: credential.algorithm,
    keyVersion: credential.keyVersion,
    createdAt: credential.createdAt,
    rotatedAt: credential.rotatedAt,
    revokedAt: credential.revokedAt,
  }));
}

async function bodyHash(request: Request) {
  const body = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.clone().text();
  return sha256(body);
}

function signatureHeadersPresent(request: Request) {
  return ['x-device-id', 'x-key-version', 'x-timestamp', 'x-nonce', 'x-signature'].every((name) => request.headers.has(name));
}

export async function verifyDeviceRequest(request: Request): Promise<DeviceAuthContext> {
  const deviceId = text(request.headers.get('x-device-id'), 'X-Device-Id', 100);
  const versionText = text(request.headers.get('x-key-version'), 'X-Key-Version', 20);
  const timestampText = text(request.headers.get('x-timestamp'), 'X-Timestamp', 30);
  const nonce = text(request.headers.get('x-nonce'), 'X-Nonce', 120);
  const signature = text(request.headers.get('x-signature'), 'X-Signature', 1_000);
  const keyVersion = Number(versionText);
  const timestamp = Number(timestampText);
  if (!Number.isSafeInteger(keyVersion) || keyVersion < 1) throw new StoreError('X-Key-Version 无效', 401);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > SIGNATURE_CLOCK_SKEW_MS) {
    throw new StoreError('请求时间戳过期或时钟偏差过大', 401);
  }
  const credential = getStore().credentials[deviceId];
  if (!credential || credential.revokedAt) throw new StoreError('设备未配对或凭证已吊销', 401);
  if (credential.keyVersion !== keyVersion) throw new StoreError('设备密钥版本已更新，请重新加载凭证', 401);
  const nonceKey = `${deviceId}:${nonce}`;
  const canonical = [
    timestampText,
    nonce,
    request.method.toUpperCase(),
    new URL(request.url).pathname,
    await bodyHash(request),
  ].join('\n');
  let valid = false;
  try {
    const key = await crypto.subtle.importKey('spki', decodeBase64Url(credential.publicKey), { name: 'Ed25519' } as AlgorithmIdentifier, false, ['verify']);
    valid = await crypto.subtle.verify({ name: 'Ed25519' } as AlgorithmIdentifier, key, decodeBase64Url(signature), new TextEncoder().encode(canonical));
  } catch {
    valid = false;
  }
  if (!valid) throw new StoreError('设备签名无效', 401);
  // Re-read after async WebCrypto verification so concurrent valid requests
  // cannot overwrite each other's nonce record during the replay window.
  const current = getStore();
  prune(current);
  const currentCredential = current.credentials[deviceId];
  if (!currentCredential || currentCredential.revokedAt || currentCredential.keyVersion !== keyVersion) {
    throw new StoreError('设备凭证已变更或已吊销', 401);
  }
  if (current.usedNonces[nonceKey]) throw new StoreError('检测到重复请求（nonce 已使用）', 409);
  current.usedNonces[nonceKey] = Date.now() + NONCE_TTL_MS;
  persist(current);
  return { kind: 'device', deviceId, keyVersion };
}

export { signatureHeadersPresent };
