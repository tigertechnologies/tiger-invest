// Testa scanners e histórico com um fetch simulado da Binance (sem rede).
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const IV: Record<string, number> = { '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5, '1M': 2592e6 };
function klines(interval: string, limit: number, end?: number) {
  const step = IV[interval];
  const endT = end ?? Date.UTC(2026, 8, 22);
  const out: unknown[] = [];
  let p = 100;
  for (let i = limit - 1; i >= 0; i--) {
    const t = endT - i * step;
    const o = p, c = o * (1 + (rand() - 0.5) * 0.05);
    out.push([t, String(o), String(Math.max(o, c) * 1.01), String(Math.min(o, c) * 0.99), String(c), String(1000 + rand() * 900), t + step - 1]);
    p = c;
  }
  return out;
}
(globalThis as any).fetch = async (url: string) => {
  const u = new URL(url);
  let body: unknown = {};
  if (u.pathname.endsWith('/klines')) {
    const lim = +(u.searchParams.get('limit') || 500);
    const end = u.searchParams.get('endTime');
    // simula início da listagem: 1600 velas diárias no total
    const total = u.searchParams.get('interval') === '1d' ? 1600 : lim;
    body = klines(u.searchParams.get('interval')!, Math.min(lim, end ? Math.max(0, total - 1000) : lim), end ? +end : undefined);
  } else if (u.pathname.endsWith('/ticker/24hr')) {
    body = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'].map((s) => ({ symbol: s + 'USDT', lastPrice: '100', priceChangePercent: '1.5', quoteVolume: '1000000', volume: '1', count: 10 }));
  } else if (u.hostname.includes('coingecko')) body = [];
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
};

(async () => {
  const { scanMarket, scanPositions } = await import('../src/lib/market/scanners');
  const { positionHistory, positionFor } = await import('../src/lib/market/position');
  const t0 = Date.now();
  const m = await scanMarket();
  console.log('scanMarket:', m.length, 'tokens', m.map((r) => `${r.symbol} rsi=${r.rsi} rev=${r.reversal?.type ?? '-'} levels=${r.levels.length}`).join(' | '));
  const p = await scanPositions();
  console.log('scanPositions:', p.map((r) => `${r.symbol}:${r.score}`).join(' '));
  const one = await positionFor('BTC');
  console.log('positionFor BTC:', one.score, one.label, one.components.map((c) => `${c.key}=${c.score}`).join(','));
  const t1 = Date.now();
  const h = await positionHistory('BTC', 1460);
  console.log('history rows:', h.length, 'first:', JSON.stringify(h[0]), 'tempo', Date.now() - t1, 'ms');
  if (!m.length || !p.length || h.length < 1000) process.exit(1);
  console.log('OK em', Date.now() - t0, 'ms');
})();
