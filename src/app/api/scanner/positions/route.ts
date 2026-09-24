import { cached } from '@/lib/cache';
import { scanPositions } from '@/lib/market/scanners';
import { fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  try {
    const r = await cached('scan:positions', 60 * 60 * 1000, scanPositions);
    return ok({ rows: r.data, updatedAt: r.updatedAt }, 120);
  } catch (e) {
    return fail(e);
  }
}
