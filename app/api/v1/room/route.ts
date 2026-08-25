import { requireMutationAuth, success, failure } from '@/lib/api';
import { readSnapshot } from '@/lib/room-store';

export async function GET(request: Request) {
  try {
    await requireMutationAuth(request);
    return success(readSnapshot());
  } catch (error) {
    return failure(error);
  }
}
