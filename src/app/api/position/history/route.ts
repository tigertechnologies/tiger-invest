import { NextRequest } from 'next/server';
import { cached } from '@/lib/cache';
import { positionHistory } from '@/lib/market/position';
import { cleanSymbol, fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PERIODS: Record<string, number> = { '1m': 30, '3m': 90, '6m': 180, '1y': 365, '2y': 730, '4y': 1460 };

export async function GET(req: NextRequest) {
  const symbol = cleanSymbol(req.nextUrl.searchParams.get('symbol'));
  const period = req.nextUrl.searchParams.get('period') || '1y';
  const days = PERIODS[period] ?? 365;
  try {
    // calcula sempre 4 anos e recorta — um cache por token
    const r = await cached(`history:${symbol}`, 6 * 60 * 60 * 1000, () => positionHistory(symbol, 1460));
    return ok({ symbol, period, rows: r.data.slice(0, days), updatedAt: r.updatedAt }, 600);
  } catch (e) {
    return fail(e);
  }
}
