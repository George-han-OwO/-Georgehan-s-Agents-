import { failure, readJson, requireMutationAuth, success } from '@/lib/api';
import { createTask } from '@/lib/room-store';
import type { TaskRequest } from '@/lib/protocol';

export async function POST(request: Request) {
  try {
    requireMutationAuth(request);
    return success(createTask(await readJson<TaskRequest>(request)), 201);
  } catch (error) {
    return failure(error);
  }
}
