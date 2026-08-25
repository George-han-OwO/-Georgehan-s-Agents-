import { assertDeviceScope, failure, readJson, requireMutationAuth, success } from '@/lib/api';
import { recordHeartbeat } from '@/lib/room-store';
import type { HeartbeatRequest } from '@/lib/protocol';

export async function POST(request: Request) {
  try {
    const context = await requireMutationAuth(request);
    const input = await readJson<HeartbeatRequest>(request);
    assertDeviceScope(context, input.deviceId);
    return success(recordHeartbeat(input));
  } catch (error) {
    return failure(error);
  }
}
