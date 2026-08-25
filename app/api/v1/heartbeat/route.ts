import { failure, readJson, requireMutationAuth, success } from '@/lib/api';
import { recordHeartbeat } from '@/lib/room-store';
import type { HeartbeatRequest } from '@/lib/protocol';

export async function POST(request: Request) {
  try {
    await requireMutationAuth(request);
    return success(recordHeartbeat(await readJson<HeartbeatRequest>(request)));
  } catch (error) {
    return failure(error);
  }
}
