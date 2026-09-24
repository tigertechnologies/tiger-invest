import { NextRequest } from 'next/server';
import { cached } from '@/lib/cache';
import { scanMarket } from '@/lib/market/scanners';
import { fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(_req: NextRequest) {
  try {
    const r = await cached('scan:market', 15 * 60 * 1000, scanMarket);
    return ok({ rows: r.data, updatedAt: r.updatedAt }, 60);
  } catch (e) {
    return fail(e);
  }
}
