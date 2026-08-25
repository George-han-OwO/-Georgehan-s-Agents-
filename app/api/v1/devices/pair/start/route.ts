import { failure, readJson, requireAdminAuth, success } from '@/lib/api';
import { startPairing } from '@/lib/device-auth';
import type { StartDevicePairingRequest } from '@/lib/protocol';

export async function POST(request: Request) {
  try {
    await requireAdminAuth(request);
    return success(await startPairing(await readJson<StartDevicePairingRequest>(request)), 201);
  } catch (error) {
    return failure(error);
  }
}
