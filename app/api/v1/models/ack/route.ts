import { assertDeviceScope, failure, readJson, requireMutationAuth, success } from '@/lib/api';
import { acknowledgeModelSwitch, deviceIdForModelRequest } from '@/lib/model-store';
import type { AcknowledgeModelRequest } from '@/lib/protocol';

export async function POST(request: Request) {
  try {
    const context = await requireMutationAuth(request);
    const input = await readJson<AcknowledgeModelRequest>(request);
    assertDeviceScope(context, deviceIdForModelRequest(input.requestId));
    return success(acknowledgeModelSwitch(input));
  } catch (error) {
    return failure(error);
  }
}
