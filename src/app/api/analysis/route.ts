import { NextRequest } from 'next/server';
import { getKlines, getTicker, type Interval } from '@/lib/market/binance';
import { analyze } from '@/lib/market/analysis';
import { positionFor } from '@/lib/market/position';
import { cleanSymbol, fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const INTERVALS: Interval[] = ['15m', '1h', '4h', '1d', '1w', '1M'];

export async function GET(req: NextRequest) {
  const symbol = cleanSymbol(req.nextUrl.searchParams.get('symbol'));
  const iv = (req.nextUrl.searchParams.get('interval') || '1d') as Interval;
  const interval = INTERVALS.includes(iv) ? iv : '1d';
  try {
    const [candles, weekly, btc, ticker, position] = await Promise.all([
      getKlines(symbol, interval, 500),
      interval === '1w' || interval === '1M' ? Promise.resolve(undefined) : getKlines(symbol, '1w', 60).catch(() => undefined),
      symbol === 'BTC' ? Promise.resolve(undefined) : getKlines('BTC', interval, 60).catch(() => undefined),
      getTicker(symbol).catch(() => null),
      positionFor(symbol).catch(() => null),
    ]);
    const a = analyze(candles, interval, {
      weekly: interval === '1w' ? candles : weekly,
      btcCloses: btc?.map((x) => x.c),
    });
    return ok(
      {
        symbol,
        interval,
        ticker: ticker ? { change24h: +ticker.priceChangePercent, volume24h: +ticker.quoteVolume } : null,
        analysis: a,
        position,
        candles: candles.slice(-120).map((c) => [c.t, c.o, c.h, c.l, c.c]),
        updatedAt: new Date().toISOString(),
      },
      30,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (/invalid symbol/i.test(msg)) return fail(new Error(`Token ${symbol} não encontrado na Binance (par ${symbol}/USDT).`), 404);
    return fail(e);
  }
}
