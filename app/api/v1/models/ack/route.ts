import { failure, readJson, requireMutationAuth, success } from '@/lib/api';
import { acknowledgeModelSwitch } from '@/lib/model-store';
import type { AcknowledgeModelRequest } from '@/lib/protocol';

export async function POST(request: Request) {
  try {
    requireMutationAuth(request);
    return success(acknowledgeModelSwitch(await readJson<AcknowledgeModelRequest>(request)));
  } catch (error) {
    return failure(error);
  }
}
