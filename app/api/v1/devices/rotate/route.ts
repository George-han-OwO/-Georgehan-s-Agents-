import { failure, readJson, requireAdminAuth, success } from '@/lib/api';
import { rotateDeviceKey } from '@/lib/device-auth';
import type { RotateDeviceKeyRequest } from '@/lib/protocol';

export async function POST(request: Request) {
  try {
    await requireAdminAuth(request);
    return success(await rotateDeviceKey(await readJson<RotateDeviceKeyRequest>(request)));
  } catch (error) {
    return failure(error);
  }
}
