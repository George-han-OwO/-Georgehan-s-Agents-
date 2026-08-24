import { success } from '@/lib/api';
import { readSnapshot } from '@/lib/room-store';

export function GET() {
  return success(readSnapshot());
}
