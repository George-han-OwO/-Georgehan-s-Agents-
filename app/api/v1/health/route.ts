import { success } from '@/lib/api';
import { stats } from '@/lib/room-store';

export function GET() {
  return success({ status: 'ok', service: 'murmur', now: new Date().toISOString(), ...stats() });
}
