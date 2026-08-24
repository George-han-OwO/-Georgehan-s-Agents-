import { failure, readJson, requireMutationAuth, success } from '@/lib/api';
import { registerModels } from '@/lib/model-store';
import type { RegisterModelsRequest } from '@/lib/protocol';

export async function POST(request: Request) {
  try {
    requireMutationAuth(request);
    return success(registerModels(await readJson<RegisterModelsRequest>(request)), 201);
  } catch (error) {
    return failure(error);
  }
}
