// ============================================================
// FONTE ÚNICA DE VERDADE para cotações spot (CoinGecko).
//
// Todos os módulos (Top 50, Radar, Carteira, Dashboard, Pulso, Metas)
// chamam getMarkets(). Como a URL e o `revalidate` são IDÊNTICOS, o
// Data Cache do Next.js deduplica: todas as rotas leem o MESMO snapshot
// de preços até o TTL comum expirar. Fim da divergência entre módulos.
//
// Preço spot = campo `current_price`. Mark price de Perps (Ondo) é OUTRA
// natureza e vive em /api/perps — nunca é tratado como cotação spot aqui.
// ============================================================

// Uma única URL, um único TTL. NÃO variar entre chamadores (senão quebra o dedupe).
export const MARKETS_URL =
  'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&price_change_percentage=24h,7d,30d,1y'
export const MARKETS_REVALIDATE = 60 // segundos — o mesmo relógio para todos

export type MarketCoin = {
  id: string; symbol: string; name: string; image: string
  current_price: number
  price_change_percentage_24h: number | null
  price_change_percentage_24h_in_currency: number | null
  price_change_percentage_7d_in_currency: number | null
  price_change_percentage_30d_in_currency: number | null
  price_change_percentage_1y_in_currency: number | null
  total_volume: number; market_cap: number; market_cap_rank: number | null
}

// Snapshot compartilhado do top-250. Deduplicado pelo Data Cache do Next.
export async function getMarkets(): Promise<any[]> {
  try {
    const r = await fetch(MARKETS_URL, { next: { revalidate: MARKETS_REVALIDATE }, headers: { accept: 'application/json' } })
    if (!r.ok) return []
    const j = await r.json()
    return Array.isArray(j) ? j : []
  } catch {
    return []
  }
}

// Busca dirigida para ids que possam estar FORA do top-250 (alts pequenas da
// carteira). Mesmo TTL. Para ids que já estão no snapshot, prefira getMarkets().
export async function getMarketsByIds(ids: string[]): Promise<any[]> {
  if (!ids.length) return []
  try {
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids.join(','))}&price_change_percentage=24h,7d,30d,1y&per_page=250`
    const r = await fetch(url, { next: { revalidate: MARKETS_REVALIDATE }, headers: { accept: 'application/json' } })
    if (!r.ok) return []
    const j = await r.json()
    return Array.isArray(j) ? j : []
  } catch {
    return []
  }
}
