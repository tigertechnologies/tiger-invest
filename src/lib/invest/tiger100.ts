const CAP = 0.15          // teto de peso por moeda
const TILT = 0.15         // tilt máximo de momentum (±15%) pela performance de 7d

const STABLE = new Set(['tether', 'usd-coin', 'dai', 'first-digital-usd', 'ethena-usde', 'usds', 'binance-usd', 'true-usd', 'paypal-usd', 'frax', 'usdd', 'gemini-dollar'])

// Reconstrói o histórico do índice (nível, base 1000) a partir da capitalização
// histórica dos maiores componentes — dá ao Tiger 100 histórico real na hora,
// sem depender de acumular snapshots diários. Retorna { 'YYYY-MM-DD': nível }.
export async function tiger100History(days: number): Promise<Record<string, number>> {
  try {
    const top = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=25&page=1', { next: { revalidate: 1800 }, headers: { accept: 'application/json' } })
    if (!top.ok) return {}
    const arr = await top.json()
    const ids: string[] = (Array.isArray(arr) ? arr : []).filter((c: any) => c.market_cap > 0 && !STABLE.has(c.id)).slice(0, 12).map((c: any) => c.id)
    if (!ids.length) return {}
    const d = Math.min(365, Math.max(7, days))
    const seriesList = await Promise.all(ids.map(async id => {
      try {
        const r = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${d}&interval=daily`, { next: { revalidate: 1800 }, headers: { accept: 'application/json' } })
        if (!r.ok) return {}
        const j = await r.json(); const out: Record<string, number> = {}
        for (const [ts, mc] of (j.market_caps || [])) out[new Date(ts).toISOString().slice(0, 10)] = mc
        return out
      } catch { return {} }
    }))
    // soma as capitalizações por data aplicando o MESMO teto de 15% do índice ao vivo,
    // pra que a linha histórica siga a mesma regra do número ao vivo (senão o BTC domina só no gráfico).
    const anchor = seriesList.reduce((a, b) => Object.keys(b).length > Object.keys(a).length ? b : a, {})
    const totals: Record<string, number> = {}
    for (const date of Object.keys(anchor)) {
      const caps: number[] = []
      let ok = true
      for (const s of seriesList) { const v = s[date]; if (v == null) { ok = false; break } caps.push(v) }
      if (!ok || !caps.length) continue
      const rawTotal = caps.reduce((a, b) => a + b, 0)
      if (rawTotal <= 0) continue
      // aplica teto de 15% no peso de cada moeda e re-soma o total efetivo (mcap ajustado)
      const capped = caps.map(mc => Math.min(mc / rawTotal, CAP))
      const sumCapped = capped.reduce((a, b) => a + b, 0)
      totals[date] = rawTotal * sumCapped   // total efetivo sob o teto — cresce/cai como o índice real
    }
    const dates = Object.keys(totals).sort()
    if (dates.length < 2) return {}
    const first = totals[dates[0]]
    const out: Record<string, number> = {}
    for (const date of dates) out[date] = totals[date] / first * 1000
    return out
  } catch { return {} }
}

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
