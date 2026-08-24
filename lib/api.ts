import { NextResponse } from 'next/server';
import { StoreError } from './room-store';
import { PROTOCOL_VERSION } from './protocol';

export function success<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, protocol: PROTOCOL_VERSION, data }, { status });
}

export function failure(error: unknown) {
  if (error instanceof StoreError) {
    return NextResponse.json({ ok: false, error: { message: error.message } }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : '请求格式不正确';
  return NextResponse.json({ ok: false, error: { message } }, { status: 400 });
}

export function requireMutationAuth(request: Request) {
  const configuredToken = process.env.MURMUR_API_TOKEN;
  if (!configuredToken) {
    if (process.env.NODE_ENV === 'production') {
      throw new StoreError('服务端尚未配置 MURMUR_API_TOKEN', 503);
    }
    return;
  }
  const authorization = request.headers.get('authorization') ?? '';
  const suppliedToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : request.headers.get('x-murmur-token');
  if (!suppliedToken || suppliedToken !== configuredToken) throw new StoreError('无效的接口凭证', 401);
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    throw new StoreError('请求体必须是有效 JSON');
  }
}
