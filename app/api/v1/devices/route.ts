import { failure, requireAdminAuth, success } from '@/lib/api';
import { listDevices } from '@/lib/device-auth';

export async function GET(request: Request) {
  try {
    await requireAdminAuth(request);
    return success({ devices: listDevices() });
  } catch (error) {
    return failure(error);
  }
}
