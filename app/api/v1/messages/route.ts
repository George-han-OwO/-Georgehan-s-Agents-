import { failure, readJson, requireMutationAuth, success } from '@/lib/api';
import { addMessage } from '@/lib/room-store';
import type { MessageRequest } from '@/lib/protocol';

export async function POST(request: Request) {
  try {
    await requireMutationAuth(request);
    return success(addMessage(await readJson<MessageRequest>(request)), 201);
  } catch (error) {
    return failure(error);
  }
}
