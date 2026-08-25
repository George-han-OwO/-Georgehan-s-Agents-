import { failure, readJson, requireAdminAuth, success } from '@/lib/api';
import { revokeDevice } from '@/lib/device-auth';
import type { RevokeDeviceRequest } from '@/lib/protocol';

export async function POST(request: Request) {
  try {
    await requireAdminAuth(request);
    return success(revokeDevice(await readJson<RevokeDeviceRequest>(request)));
  } catch (error) {
    return failure(error);
  }
}
