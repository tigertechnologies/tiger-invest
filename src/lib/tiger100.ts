const CAP = 0.15          // teto de peso por moeda
const TILT = 0.15         // tilt máximo de momentum (±15%) pela performance de 7d

// Computa o índice Tiger 100 (ao vivo) a partir do top 100 do CoinGecko.
export async function computeTiger100() {
  const r = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&price_change_percentage=24h,7d', { next: { revalidate: 120 }, headers: { accept: 'application/json' } })
  if (!r.ok) return null
  const arr = await r.json()
  const coins = (Array.isArray(arr) ? arr : []).filter((c: any) => c.market_cap > 0)
  if (!coins.length) return null

  const totalMcap = coins.reduce((s: number, c: any) => s + c.market_cap, 0)
  const shares = coins.map((c: any) => c.market_cap / totalMcap)
  const capped = shares.map((s: number) => Math.min(s, CAP))
  const sumCap = capped.reduce((a: number, b: number) => a + b, 0)
  const baseW = capped.map((x: number) => x / sumCap)
  const tilt = coins.map((c: any) => 1 + Math.max(-TILT, Math.min(TILT, (c.price_change_percentage_7d_in_currency || 0) / 100)))
  const tw = baseW.map((w: number, i: number) => w * tilt[i])
  const sumTw = tw.reduce((a: number, b: number) => a + b, 0)
  const weight = tw.map((x: number) => x / sumTw)

  const ret24 = coins.reduce((s: number, c: any, i: number) => s + weight[i] * ((c.price_change_percentage_24h_in_currency || 0) / 100), 0) * 100
  const ret7d = coins.reduce((s: number, c: any, i: number) => s + weight[i] * ((c.price_change_percentage_7d_in_currency || 0) / 100), 0) * 100
  const up = coins.filter((c: any) => (c.price_change_percentage_24h_in_currency || 0) > 0).length
  const btc = coins.find((c: any) => c.id === 'bitcoin')
  const btcDom = btc ? btc.market_cap / totalMcap * 100 : null

  const enriched = coins.map((c: any, i: number) => ({
    id: c.id, symbol: (c.symbol || '').toUpperCase(), name: c.name, img: c.image,
    price: c.current_price, ch24: c.price_change_percentage_24h_in_currency ?? null,
    ch7d: c.price_change_percentage_7d_in_currency ?? null, weight: weight[i] * 100, rank: c.market_cap_rank,
  }))
  const gainers = [...enriched].sort((a, b) => (b.ch24 ?? -999) - (a.ch24 ?? -999)).slice(0, 5)
  const losers = [...enriched].sort((a, b) => (a.ch24 ?? 999) - (b.ch24 ?? 999)).slice(0, 5)
  const composition = [...enriched].sort((a, b) => b.weight - a.weight).slice(0, 15)

  return { ret24, ret7d, up, down: coins.length - up, count: coins.length, totalMcap, btcDom, gainers, losers, composition }
}
