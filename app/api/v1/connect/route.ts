import { failure, readJson, requireMutationAuth, success } from '@/lib/api';
import { registerDevice } from '@/lib/room-store';
import type { ConnectRequest } from '@/lib/protocol';

export async function POST(request: Request) {
  try {
    requireMutationAuth(request);
    return success(registerDevice(await readJson<ConnectRequest>(request)), 201);
  } catch (error) {
    return failure(error);
  }
}
