import { assertDeviceScope, failure, readJson, requireMutationAuth, success } from '@/lib/api';
import { registerModels } from '@/lib/model-store';
import type { RegisterModelsRequest } from '@/lib/protocol';

export async function POST(request: Request) {
  try {
    const context = await requireMutationAuth(request);
    const input = await readJson<RegisterModelsRequest>(request);
    assertDeviceScope(context, input.deviceId);
    return success(registerModels(input), 201);
  } catch (error) {
    return failure(error);
  }
}
