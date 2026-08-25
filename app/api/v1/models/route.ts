import { failure, requireMutationAuth, success } from '@/lib/api';
import { readModels } from '@/lib/model-store';

export async function GET(request: Request) {
  try {
    await requireMutationAuth(request);
    const deviceId = new URL(request.url).searchParams.get('deviceId') ?? undefined;
    return success(readModels(deviceId));
  } catch (error) {
    return failure(error);
  }
}
