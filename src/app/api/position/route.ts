import { NextRequest } from 'next/server';
import { cached } from '@/lib/cache';
import { positionFor } from '@/lib/market/position';
import { cleanSymbol, fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const symbol = cleanSymbol(req.nextUrl.searchParams.get('symbol'));
  try {
    const r = await cached(`position:${symbol}`, 10 * 60 * 1000, () => positionFor(symbol));
    return ok({ ...r.data, updatedAt: r.updatedAt }, 60);
  } catch (e) {
    return fail(e);
  }
}
