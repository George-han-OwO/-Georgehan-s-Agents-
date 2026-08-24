import { failure, readJson, requireMutationAuth, success } from '@/lib/api';
import { requestModelSwitch } from '@/lib/model-store';
import type { SelectModelRequest } from '@/lib/protocol';

export async function POST(request: Request) {
  try {
    requireMutationAuth(request);
    return success(requestModelSwitch(await readJson<SelectModelRequest>(request)), 201);
  } catch (error) {
    return failure(error);
  }
}
