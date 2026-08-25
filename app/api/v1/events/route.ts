import { failure, readJson, requireMutationAuth, success } from '@/lib/api';
import { addAuditEvent } from '@/lib/room-store';
import type { EventRequest } from '@/lib/protocol';

export async function POST(request: Request) {
  try {
    await requireMutationAuth(request);
    return success(addAuditEvent(await readJson<EventRequest>(request)), 201);
  } catch (error) {
    return failure(error);
  }
}
