import { failure, readJson, requirePairingRequest, success } from '@/lib/api';
import { completePairing } from '@/lib/device-auth';
import type { CompleteDevicePairingRequest } from '@/lib/protocol';

export async function POST(request: Request) {
  try {
    requirePairingRequest(request);
    return success(await completePairing(await readJson<CompleteDevicePairingRequest>(request)), 201);
  } catch (error) {
    return failure(error);
  }
}
