import 'server-only';
import { SCAN_TOKENS } from '../site';
import { getAllTickers, getKlines, mapLimit, type Ticker } from './binance';
import { analyze, reversalSummary, r2 } from './analysis';
import { supportResistance } from './indicators';
import { positionFor } from './position';
import { getMarketCaps } from './coingecko';

async function activeTokens(): Promise<{ tokens: string[]; tickers: Map<string, Ticker> }> {
  const all = await getAllTickers();
  const map = new Map(all.map((t) => [t.symbol, t]));
  const tokens = SCAN_TOKENS.filter((s) => {
    const t = map.get(`${s}USDT`);
    return t && t.count > 0 && +t.lastPrice > 0;
  });
  return { tokens, tickers: map };
}

export type MarketRow = {
  symbol: string;
  price: number;
  change24h: number;
  rsi: number | null;
  reversal: ReturnType<typeof reversalSummary>;
  levels: { price: number; distPct: number; type: 'support' | 'resistance'; touches: number; strength: number }[];
};

/** Varre ~140 tokens no gráfico de 4h: alimenta Reversões, Scanner RSI e Suporte/Resistência. */
export async function scanMarket(): Promise<MarketRow[]> {
  const { tokens, tickers } = await activeTokens();
  const rows = await mapLimit(tokens, 16, async (symbol) => {
    try {
      const c = await getKlines(symbol, '4h', 300);
      if (c.length < 80) return null;
      const a = analyze(c, '4h');
      const t = tickers.get(`${symbol}USDT`)!;
      const price = a.price;
      const levels = supportResistance(c, 200)
        .map((l) => ({ price: l.price, distPct: ((price - l.price) / l.price) * 100, type: l.type, touches: l.touches, strength: l.strength }))
        .filter((l) => l.touches >= 3 && Math.abs(l.distPct) <= 2);
      return {
        symbol,
        price,
        change24h: +(+t.priceChangePercent).toFixed(2),
        rsi: a.indicators.rsi,
        reversal: reversalSummary(a),
        levels: levels.map((l) => ({ ...l, distPct: r2(l.distPct)! })),
      } satisfies MarketRow;
    } catch {
      return null;
    }
  });
  return rows.filter(Boolean) as MarketRow[];
}

export type OpportunityRow = {
  symbol: string;
  name: string;
  image: string | null;
  price: number;
  score: number;
  label: string;
  tone: string;
  marketCap: number | null;
  rank: number | null;
  volume24h: number | null;
  volMcap: number | null;
  tags: string[];
};

/** Score de position trading para todos os tokens (página Oportunidades). */
export async function scanPositions(): Promise<OpportunityRow[]> {
  const { tokens, tickers } = await activeTokens();
  const caps = await getMarketCaps().catch(() => new Map());
  const rows = await mapLimit(tokens, 12, async (symbol) => {
    try {
      const p = await positionFor(symbol);
      const cap = caps.get(symbol);
      const t = tickers.get(`${symbol}USDT`);
      const vol = cap?.volume ?? (t ? +t.quoteVolume : null);
      const tags: string[] = [];
      if (p.raw.drawdown! < 10) tags.push('Próximo ao ATH');
      if (p.raw.drawdown! >= 60) tags.push('Desconto profundo');
      if (p.raw.bmsbStatus === 'acima' && p.raw.bmsbDist! > 10) tags.push('Estendido acima da banda');
      if (p.raw.bmsbStatus === 'abaixo') tags.push('Abaixo da banda');
      if ((p.rsi.d1 ?? 50) < 30) tags.push('RSI sobrevendido');
      if ((p.rsi.d1 ?? 50) > 70) tags.push('RSI sobrecomprado');
      if (p.raw.retracement! > 61.8 && p.raw.retracement! <= 100) tags.push('Zona áurea Fib');
      return {
        symbol,
        name: cap?.name ?? symbol,
        image: cap?.image ?? null,
        price: p.price,
        score: p.score,
        label: p.label,
        tone: p.tone,
        marketCap: cap?.marketCap ?? null,
        rank: cap?.rank ?? null,
        volume24h: vol,
        volMcap: cap?.marketCap && vol ? r2((vol / cap.marketCap) * 100) : null,
        tags,
      } satisfies OpportunityRow;
    } catch {
      return null;
    }
  });
  return (rows.filter(Boolean) as OpportunityRow[]).sort((a, b) => b.score - a.score);
}
