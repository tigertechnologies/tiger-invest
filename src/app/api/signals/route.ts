import { NextResponse } from 'next/server'

function sma(a: number[], n: number) { if (a.length < n) n = a.length; const s = a.slice(-n); return s.reduce((x, y) => x + y, 0) / n }
function ema(a: number[], n: number) { if (a.length < n) n = a.length; const k = 2 / (n + 1); let e = a.slice(0, n).reduce((s, x) => s + x, 0) / n; for (let i = n; i < a.length; i++) e = a[i] * k + e * (1 - k); return e }
function rsi(a: number[], p = 14) {
  if (a.length < p + 1) return null
  let g = 0, l = 0
  for (let i = a.length - p; i < a.length; i++) { const d = a[i] - a[i - 1]; if (d >= 0) g += d; else l -= d }
  const ag = g / p, al = l / p; if (al === 0) return 100
  return 100 - 100 / (1 + ag / al)
}
const money = (n: number) => '$' + new Intl.NumberFormat('pt-BR', { minimumFractionDigits: n < 1 ? 4 : 2, maximumFractionDigits: n < 1 ? 4 : 2 }).format(n)

function compute(closes: number[]) {
  const price = closes[closes.length - 1]
  const s20 = sma(closes, 20), s50 = sma(closes, 50), s200 = sma(closes, 200)
  const r = rsi(closes)
  const high52 = Math.max(...closes), low52 = Math.min(...closes)
  const rangePos = high52 > low52 ? ((price - low52) / (high52 - low52)) * 100 : 50
  const last30 = closes.slice(-30)
  const support = Math.min(...last30), resistance = Math.max(...last30)
  const maAbove = [price > s20, price > s50, price > s200].filter(Boolean).length

  // Bull Market Support Band: SMA 20 semanas (~140d) + EMA 21 semanas (~147d)
  const bmsbSma = sma(closes, Math.min(140, closes.length))
  const bmsbEma = ema(closes, Math.min(147, closes.length))
  const bmsbLow = Math.min(bmsbSma, bmsbEma), bmsbHigh = Math.max(bmsbSma, bmsbEma)
  const bmsbMid = (bmsbSma + bmsbEma) / 2
  const cyclePos: 'above' | 'in' | 'below' = price > bmsbHigh ? 'above' : price < bmsbLow ? 'below' : 'in'

  // risco/retorno até os extremos do ano
  const upsidePct = (high52 / price - 1) * 100
  const downsidePct = (1 - low52 / price) * 100
  const rr = downsidePct > 0.1 ? upsidePct / downsidePct : 0

  // traduções
  const rsiHint = r == null ? '—' : r < 30 ? 'sobrevendido (barato)' : r < 45 ? 'neutro-baixo' : r <= 55 ? 'neutro' : r < 70 ? 'neutro-alto' : 'sobrecomprado (caro)'
  const rangeHint = rangePos < 25 ? 'muito perto do fundo (barato)' : rangePos < 45 ? 'abaixo do meio' : rangePos <= 55 ? 'no meio do range' : rangePos < 75 ? 'acima do meio' : 'perto do topo (caro)'
  const maHint = maAbove === 0 ? 'abaixo das médias — baixa' : maAbove === 1 ? 'tendência mista' : maAbove === 2 ? 'tendência de alta' : 'alta forte'
  const cycleHint = cyclePos === 'above' ? 'ACIMA — ciclo comprador' : cyclePos === 'below' ? 'ABAIXO — ciclo enfraquecido' : 'NA BANDA — decisão'

  // VEREDITO ancorado em ciclo (proteção + lucratividade)
  const nearLow = rangePos <= 30 || (r != null && r <= 35)
  const nearHigh = rangePos >= 78 || (r != null && r >= 72)
  let verdict: { label: string; tone: 'buy' | 'sell' | 'neutral'; text: string }
  if (cyclePos === 'above') {
    if (nearHigh) verdict = { label: 'REALIZAR PARCIAL', tone: 'sell', text: `Acima da Bull Market Support Band (${money(bmsbMid)}) — ciclo comprador, porém esticado perto do topo do ano. Considere realizar parte e proteger o lucro. Recompra ideal em correções até a BMSB.` }
    else verdict = { label: 'MANTER / ACUMULAR', tone: 'buy', text: `Preço acima da Bull Market Support Band (${money(bmsbMid)}) — enquanto sustentar essa linha, o ciclo é comprador: mantenha posição. Correções até a BMSB são zonas de recompra.` }
  } else if (cyclePos === 'below') {
    if (nearLow) verdict = { label: 'ACUMULAR AOS POUCOS', tone: 'buy', text: `Abaixo da BMSB e perto do fundo do ano — zona historicamente boa para acumular, mas com ciclo enfraquecido: compre gradual (DCA), nunca de uma vez. Suporte maior em ${money(low52)}; retomada só confirma acima de ${money(bmsbMid)}.` }
    else verdict = { label: 'CAUTELA / PROTEGER', tone: 'neutral', text: `Preço abaixo da Bull Market Support Band (${money(bmsbMid)}) — ciclo enfraquecido, prioridade é proteger capital. Acumulação só gradual perto de ${money(low52)}. Reclaim (voltar acima) da BMSB confirmaria retomada.` }
  } else {
    verdict = { label: 'OBSERVAR', tone: 'neutral', text: `Preço na Bull Market Support Band (${money(bmsbMid)}) — zona de decisão do ciclo. Segurar acima = comprador; perder essa linha = cautela. Espere a confirmação antes de agir.` }
  }
  return { price, rsi: r, sma20: s20, sma50: s50, sma200: s200, high52, low52, rangePos, support, resistance, maAbove, bmsbMid, cyclePos, upsidePct, downsidePct, rr, verdict, rsiHint, rangeHint, maHint, cycleHint }
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
