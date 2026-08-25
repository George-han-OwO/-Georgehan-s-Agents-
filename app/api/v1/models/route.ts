import { assertDeviceScope, failure, requireMutationAuth, success } from '@/lib/api';
import { readModels } from '@/lib/model-store';

export async function GET(request: Request) {
  try {
    const context = await requireMutationAuth(request);
    const deviceId = new URL(request.url).searchParams.get('deviceId') ?? undefined;
    if (deviceId) assertDeviceScope(context, deviceId);
    else if (context.kind === 'device') return success(readModels(context.deviceId));
    return success(readModels(deviceId));
  } catch (error) {
    return failure(error);
  }
}
