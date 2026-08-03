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
const money = (n: number) => '$' + new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

function compute(closes: number[]) {
  const price = closes[closes.length - 1]
  const s20 = sma(closes, 20), s50 = sma(closes, 50), s200 = sma(closes, 200)
  const r = rsi(closes)
  const high52 = Math.max(...closes), low52 = Math.min(...closes)
  const rangePos = high52 > low52 ? ((price - low52) / (high52 - low52)) * 100 : 50
  const last30 = closes.slice(-30)
  const support = Math.min(...last30), resistance = Math.max(...last30)
  const maAbove = [price > s20, price > s50, price > s200].filter(Boolean).length

  // traduções (leigo)
  const rsiHint = r == null ? '—' : r < 30 ? 'sobrevendido (barato)' : r < 45 ? 'neutro-baixo' : r <= 55 ? 'neutro' : r < 70 ? 'neutro-alto' : 'sobrecomprado (caro)'
  const rangeHint = rangePos < 25 ? 'muito perto do fundo (barato)' : rangePos < 45 ? 'abaixo do meio' : rangePos <= 55 ? 'no meio do range' : rangePos < 75 ? 'acima do meio' : 'perto do topo (caro)'
  const maHint = maAbove === 0 ? 'abaixo de todas — tendência de baixa' : maAbove === 1 ? 'tendência mista' : maAbove === 2 ? 'tendência de alta' : 'acima de todas — alta forte'

  // VEREDITO único (valor/timing manda; tendência é nuance)
  const cheap = rangePos <= 30 || (r != null && r <= 35)
  const expensive = rangePos >= 70 || (r != null && r >= 65)
  let verdict: { label: string; tone: 'buy' | 'sell' | 'neutral'; text: string }
  if (cheap) {
    verdict = {
      label: 'ZONA DE COMPRA', tone: 'buy',
      text: `Preço perto do fundo do ano${maAbove < 2 ? ' e ainda caindo — acumule aos poucos e espere sinal de reversão' : ' e já reagindo — boa região para comprar'}. Suporte por volta de ${money(support)}.`,
    }
  } else if (expensive) {
    verdict = {
      label: 'ZONA DE VENDA', tone: 'sell',
      text: `Preço perto do topo${maAbove > 1 ? ' e em alta forte — considere realizar lucro / reduzir posição' : ' porém enfraquecendo — atenção para realizar'}. Resistência por volta de ${money(resistance)}.`,
    }
  } else {
    verdict = {
      label: 'OBSERVAR', tone: 'neutral',
      text: `Preço em região intermediária, sem gatilho claro. Compra fica interessante perto de ${money(support)}; realização perto de ${money(resistance)}.`,
    }
  }
  return { price, rsi: r, sma20: s20, sma50: s50, sma200: s200, high52, low52, rangePos, support, resistance, maAbove, verdict, rsiHint, rangeHint, maHint }
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
