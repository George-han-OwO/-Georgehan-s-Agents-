import { failure, success } from '@/lib/api';
import { readModels } from '@/lib/model-store';

export function GET(request: Request) {
  try {
    const deviceId = new URL(request.url).searchParams.get('deviceId') ?? undefined;
    return success(readModels(deviceId));
  } catch (error) {
    return failure(error);
  }
}
