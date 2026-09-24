import { getAllTickers } from '@/lib/market/binance';
import { cached } from '@/lib/cache';
import { SCAN_TOKENS } from '@/lib/site';
import { fail, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data } = await cached('tokens:list', 5 * 60 * 1000, async () => {
      const all = await getAllTickers();
      const map = new Map(all.map((t) => [t.symbol, t]));
      return SCAN_TOKENS.map((s) => map.get(`${s}USDT`))
        .filter((t) => t && t.count > 0 && +t.lastPrice > 0)
        .map((t) => ({ symbol: t!.symbol.replace(/USDT$/, ''), price: +t!.lastPrice, change24h: +t!.priceChangePercent, volume: +t!.quoteVolume }));
    });
    return ok(data, 60);
  } catch (e) {
    return fail(e);
  }
}
