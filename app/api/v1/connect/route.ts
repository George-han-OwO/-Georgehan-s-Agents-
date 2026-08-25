import { assertDeviceScope, failure, readJson, requireMutationAuth, success } from '@/lib/api';
import { registerDevice } from '@/lib/room-store';
import type { ConnectRequest } from '@/lib/protocol';

export async function POST(request: Request) {
  try {
    const context = await requireMutationAuth(request);
    const input = await readJson<ConnectRequest>(request);
    assertDeviceScope(context, input.device.id);
    return success(registerDevice(input), 201);
  } catch (error) {
    return failure(error);
  }
}
