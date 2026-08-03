import { NextResponse } from 'next/server'

function sma(a: number[], n: number) { if (a.length < n) return a.reduce((s, x) => s + x, 0) / a.length; const s = a.slice(-n); return s.reduce((x, y) => x + y, 0) / n }
function rsi(a: number[], p = 14) {
  if (a.length < p + 1) return null
  let g = 0, l = 0
  for (let i = a.length - p; i < a.length; i++) { const d = a[i] - a[i - 1]; if (d >= 0) g += d; else l -= d }
  const ag = g / p, al = l / p
  if (al === 0) return 100
  return 100 - 100 / (1 + ag / al)
}
function compute(closes: number[]) {
  const price = closes[closes.length - 1]
  const s20 = sma(closes, 20), s50 = sma(closes, 50), s200 = sma(closes, 200)
  const r = rsi(closes)
  const high52 = Math.max(...closes), low52 = Math.min(...closes)
  const rangePos = high52 > low52 ? ((price - low52) / (high52 - low52)) * 100 : 50
  const last30 = closes.slice(-30)
  const support = Math.min(...last30), resistance = Math.max(...last30)
  const sig: number[] = []
  sig.push(price > s20 ? 1 : -1); sig.push(price > s50 ? 1 : -1); sig.push(price > s200 ? 1 : -1)
  if (r != null) sig.push(r < 30 ? 1 : r > 70 ? -1 : 0)
  const score = sig.reduce((a, b) => a + b, 0) / sig.length
  const label = score > 0.5 ? 'Compra Forte' : score > 0.1 ? 'Compra' : score > -0.1 ? 'Neutro' : score > -0.5 ? 'Venda' : 'Venda Forte'
  const maAbove = [price > s20, price > s50, price > s200].filter(Boolean).length
  let region: { label: string; tone: 'buy' | 'sell' | 'neutral' }
  if (rangePos <= 25 || (r != null && r <= 35)) region = { label: 'Fundo / Compra', tone: 'buy' }
  else if (rangePos >= 75 || (r != null && r >= 65)) region = { label: 'Topo / Venda', tone: 'sell' }
  else region = { label: 'Neutro', tone: 'neutral' }
  return { price, rsi: r, sma20: s20, sma50: s50, sma200: s200, high52, low52, rangePos, support, resistance, rating: { score, label }, region, maAbove }
}

export async function GET(request: Request) {
  const idsParam = new URL(request.url).searchParams.get('ids')
  const ids = idsParam ? idsParam.split(',').slice(0, 12) : []
  const out: Record<string, any> = {}
  for (const id of ids) {
    try {
      const r = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=365&interval=daily`, { next: { revalidate: 3600 } })
      if (!r.ok) continue
      const d = await r.json()
      const closes: number[] = (d.prices || []).map((p: number[]) => p[1])
      if (closes.length < 30) continue
      out[id] = compute(closes)
    } catch {}
  }
  return NextResponse.json(out)
}
