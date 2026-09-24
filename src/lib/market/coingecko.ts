export type CapInfo = { id: string; name: string; image: string; marketCap: number; rank: number; volume: number; price: number };

let memo: { at: number; map: Map<string, CapInfo> } | null = null;

/** Top 500 por market cap (CoinGecko, sem chave). Chave opcional: COINGECKO_API_KEY (plano Demo). */
export async function getMarketCaps(): Promise<Map<string, CapInfo>> {
  if (memo && Date.now() - memo.at < 30 * 60 * 1000) return memo.map;
  const key = process.env.COINGECKO_API_KEY;
  const headers: Record<string, string> = key ? { 'x-cg-demo-api-key': key } : {};
  const map = new Map<string, CapInfo>();
  for (const page of [1, 2]) {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}`,
      { headers, cache: 'no-store' },
    );
    if (!res.ok) break;
    const list = (await res.json()) as {
      id: string; symbol: string; name: string; image: string; market_cap: number; market_cap_rank: number; total_volume: number; current_price: number;
    }[];
    for (const c of list) {
      const s = c.symbol.toUpperCase();
      if (!map.has(s)) map.set(s, { id: c.id, name: c.name, image: c.image, marketCap: c.market_cap, rank: c.market_cap_rank, volume: c.total_volume, price: c.current_price });
    }
  }
  if (map.size) memo = { at: Date.now(), map };
  return map;
}
