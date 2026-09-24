import 'server-only';
import { getPrices } from './market/binance';
import { supabasePublic } from './supabase/public';

export type SuggestedPool = {
  id: string;
  strategy: 'suggested' | 'one_percent';
  token0: string;
  token1: string;
  range_min: number;
  range_max: number;
  fee: number;
  wallet_pct: number | null;
  network: string;
  risk: 'Baixo' | 'Moderado' | 'Alto';
  simulate_url: string | null;
  notes: string | null;
  sort: number;
  updated_at: string;
};

export type PoolWithPrice = SuggestedPool & { price: number | null; status: 'dentro' | 'acima' | 'abaixo' | null; position: number | null };

export async function getSuggestedPools(): Promise<{ pools: PoolWithPrice[]; updatedAt: string | null; configured: boolean }> {
  const sb = supabasePublic();
  if (!sb) return { pools: [], updatedAt: null, configured: false };
  const { data } = await sb.from('suggested_pools').select('*').eq('active', true).order('sort');
  const pools = (data ?? []) as SuggestedPool[];
  const prices = await getPrices(pools.flatMap((p) => [p.token0, p.token1])).catch(() => ({} as Record<string, number>));
  const withPrice = pools.map((p) => {
    const a = prices[p.token0.toUpperCase()];
    const b = prices[p.token1.toUpperCase()];
    const price = a && b ? a / b : null;
    const min = Number(p.range_min);
    const max = Number(p.range_max);
    const status = price == null ? null : price < min ? 'abaixo' : price > max ? 'acima' : 'dentro';
    return { ...p, range_min: min, range_max: max, fee: Number(p.fee), wallet_pct: p.wallet_pct == null ? null : Number(p.wallet_pct), price, status, position: price == null ? null : ((price - min) / (max - min)) * 100 } as PoolWithPrice;
  });
  const updatedAt = pools.reduce<string | null>((a, p) => (!a || p.updated_at > a ? p.updated_at : a), null);
  return { pools: withPrice, updatedAt, configured: true };
}
