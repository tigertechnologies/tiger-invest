export type Candle = { t: number; o: number; h: number; l: number; c: number; v: number; ct: number };
export type Interval = '15m' | '1h' | '4h' | '1d' | '1w' | '1M';

// data-api.binance.vision é o endpoint público de dados de mercado e funciona em regiões
// onde api.binance.com retorna 451 (ex.: servidores nos EUA). Os demais servem de fallback.
const BASES = [
  'https://data-api.binance.vision',
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://api-gcp.binance.com',
];

async function getJson<T>(path: string, timeoutMs = 9000): Promise<T> {
  let lastErr: unknown;
  for (const base of BASES) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(base + path, { signal: ctrl.signal, cache: 'no-store' });
      if (res.status === 400) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(new Error((body as { msg?: string }).msg || 'Símbolo inválido'), { fatal: true });
      }
      if (!res.ok) throw new Error(`Binance ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      if ((e as { fatal?: boolean }).fatal) throw e;
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Falha ao consultar a Binance');
}

type RawKline = [number, string, string, string, string, string, number, ...unknown[]];

const toCandle = (k: RawKline): Candle => ({
  t: k[0],
  o: +k[1],
  h: +k[2],
  l: +k[3],
  c: +k[4],
  v: +k[5],
  ct: k[6],
});

export const pair = (token: string, quote = 'USDT') => `${token.toUpperCase().replace(/USDT$/, '')}${quote}`;

export async function getKlines(token: string, interval: Interval, limit = 300, endTime?: number) {
  const q = new URLSearchParams({ symbol: pair(token), interval, limit: String(Math.min(limit, 1000)) });
  if (endTime) q.set('endTime', String(endTime));
  const raw = await getJson<RawKline[]>(`/api/v3/klines?${q}`);
  return raw.map(toCandle);
}

/** Busca mais de 1000 candles paginando para trás. */
export async function getKlinesPaged(token: string, interval: Interval, total: number) {
  let out: Candle[] = [];
  let end: number | undefined;
  while (out.length < total) {
    const batch = await getKlines(token, interval, Math.min(1000, total - out.length), end);
    if (!batch.length) break;
    out = [...batch, ...out];
    if (batch.length < 1000) break;
    end = batch[0].t - 1;
  }
  return out;
}

export type Ticker = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
  volume: string;
  count: number;
};

export async function getAllTickers() {
  return getJson<Ticker[]>('/api/v3/ticker/24hr', 15000);
}

export async function getTicker(token: string) {
  return getJson<Ticker>(`/api/v3/ticker/24hr?symbol=${pair(token)}`);
}

export async function getPrices(tokens: string[]): Promise<Record<string, number>> {
  const syms = Array.from(new Set(tokens.map((t) => t.toUpperCase()))).filter((t) => !STABLES.has(t));
  const out: Record<string, number> = {};
  STABLES.forEach((s) => (out[s] = 1));
  if (!syms.length) return out;
  const list = await getJson<{ symbol: string; price: string }[]>(
    `/api/v3/ticker/price?symbols=${encodeURIComponent(JSON.stringify(syms.map((s) => pair(ALIASES[s] || s))))}`,
  ).catch(async () => {
    // algum símbolo inválido derruba a chamada em lote — busca um a um
    const each = await Promise.all(
      syms.map((s) =>
        getJson<{ symbol: string; price: string }>(`/api/v3/ticker/price?symbol=${pair(ALIASES[s] || s)}`).catch(() => null),
      ),
    );
    return each.filter(Boolean) as { symbol: string; price: string }[];
  });
  for (const s of syms) {
    const hit = list.find((x) => x.symbol === pair(ALIASES[s] || s));
    if (hit) out[s] = +hit.price;
  }
  return out;
}

export const STABLES = new Set(['USDT', 'USDC', 'DAI', 'USDE', 'FDUSD', 'TUSD', 'USDS', 'PYUSD', 'USD', 'USDBC', 'GHO', 'LUSD', 'FRAX', 'CRVUSD']);

// wrapped / variações → token de preço na Binance
export const ALIASES: Record<string, string> = {
  WETH: 'ETH', CBETH: 'ETH', WSTETH: 'ETH', STETH: 'ETH', WEETH: 'ETH', RETH: 'ETH',
  WBTC: 'BTC', CBBTC: 'BTC', TBTC: 'BTC', BTCB: 'BTC',
  WBNB: 'BNB', WMATIC: 'POL', MATIC: 'POL', WPOL: 'POL', WAVAX: 'AVAX', WSOL: 'SOL',
};

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}
