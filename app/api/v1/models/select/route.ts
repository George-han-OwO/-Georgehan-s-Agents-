import { assertDeviceScope, failure, readJson, requireMutationAuth, success } from '@/lib/api';
import { requestModelSwitch } from '@/lib/model-store';
import type { SelectModelRequest } from '@/lib/protocol';

export async function POST(request: Request) {
  try {
    const context = await requireMutationAuth(request);
    const input = await readJson<SelectModelRequest>(request);
    assertDeviceScope(context, input.deviceId);
    return success(requestModelSwitch(input), 201);
  } catch (error) {
    return failure(error);
  }
}
