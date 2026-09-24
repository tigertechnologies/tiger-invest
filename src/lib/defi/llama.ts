import 'server-only';
import { ALIASES, STABLES } from '../market/binance';
import { getMarketCaps } from '../market/coingecko';

type LlamaPool = {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
  apyMean30d: number | null;
  stablecoin: boolean;
  exposure: string;
  poolMeta: string | null;
  volumeUsd1d: number | null;
};

let memo: { at: number; data: LlamaPool[] } | null = null;

async function allPools(): Promise<LlamaPool[]> {
  if (memo && Date.now() - memo.at < 10 * 60 * 1000) return memo.data;
  const res = await fetch('https://yields.llama.fi/pools', { cache: 'no-store' });
  if (!res.ok) throw new Error(`DeFiLlama ${res.status}`);
  const json = (await res.json()) as { data: LlamaPool[] };
  memo = { at: Date.now(), data: json.data };
  return json.data;
}

export type PoolRow = {
  id: string;
  symbol: string;
  tokens: string[];
  fee: string | null;
  project: string;
  chain: string;
  tvl: number;
  apy1d: number;
  apy30d: number;
  trend: 'up' | 'down' | 'flat';
  volume24h: number | null;
  hot: boolean;
  marketCap: number | null;
  capToken: string | null;
  url: string;
};

const pretty = (p: string) => p.split('-').map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' ');

export async function getPools(kind: 'stable' | 'token') {
  const pools = await allPools();
  const caps = kind === 'token' ? await getMarketCaps().catch(() => new Map()) : new Map();
  const rows: PoolRow[] = [];
  for (const p of pools) {
    if (p.tvlUsd < 10_000 || p.apy == null) continue;
    if (kind === 'stable' ? !p.stablecoin : p.stablecoin || p.exposure !== 'multi') continue;
    const tokens = p.symbol.split('-').map((s) => s.trim()).filter(Boolean);
    if (kind === 'stable' && tokens.length < 1) continue;
    // market cap do token volátil do par (não da stablecoin)
    let marketCap: number | null = null;
    let capToken: string | null = null;
    if (kind === 'token') {
      const vols = tokens.map((t) => ALIASES[t.toUpperCase()] || t.toUpperCase()).filter((t) => !STABLES.has(t));
      for (const t of vols) {
        const c = caps.get(t);
        if (c && (marketCap == null || c.marketCap < marketCap)) {
          marketCap = c.marketCap; // usa o menor market cap do par → filtro protege contra tokens pequenos
          capToken = t;
        }
      }
    }
    const apy30 = p.apyMean30d ?? p.apy;
    const diff = p.apy - apy30;
    rows.push({
      id: p.pool,
      symbol: p.symbol,
      tokens,
      fee: p.poolMeta && /%/.test(p.poolMeta) ? p.poolMeta : null,
      project: pretty(p.project),
      chain: p.chain,
      tvl: p.tvlUsd,
      apy1d: Math.round(p.apy * 100) / 100,
      apy30d: Math.round(apy30 * 100) / 100,
      trend: Math.abs(diff) < 0.5 ? 'flat' : diff > 0 ? 'up' : 'down',
      volume24h: p.volumeUsd1d ?? null,
      hot: !!p.volumeUsd1d && p.volumeUsd1d / p.tvlUsd >= 0.5,
      marketCap,
      capToken,
      url: `https://defillama.com/yields/pool/${p.pool}`,
    });
  }
  rows.sort((a, b) => b.tvl - a.tvl);
  return rows.slice(0, 4000);
}
