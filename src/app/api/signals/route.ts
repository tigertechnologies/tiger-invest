import { NextResponse } from 'next/server'

const money = (n: number) => '$' + new Intl.NumberFormat('pt-BR', { minimumFractionDigits: n < 1 ? 4 : n < 100 ? 2 : 0, maximumFractionDigits: n < 1 ? 4 : n < 100 ? 2 : 0 }).format(n)
function sma(a: number[], n: number) { if (a.length < n) n = a.length; const s = a.slice(-n); return s.reduce((x, y) => x + y, 0) / n }
function ema(a: number[], n: number) { if (a.length < n) n = a.length; const k = 2 / (n + 1); let e = a.slice(0, n).reduce((s, x) => s + x, 0) / n; for (let i = n; i < a.length; i++) e = a[i] * k + e * (1 - k); return e }
function rsi(a: number[], p = 14) { if (a.length < p + 1) return null; let g = 0, l = 0; for (let i = a.length - p; i < a.length; i++) { const d = a[i] - a[i - 1]; if (d >= 0) g += d; else l -= d } const ag = g / p, al = l / p; if (al === 0) return 100; return 100 - 100 / (1 + ag / al) }

// ---- detecção de swings/pivôs (price action) ----
function swings(closes: number[], w = 7, minMovePct = 7) {
  const raw: { i: number; price: number; t: 'H' | 'L' }[] = []
  for (let i = w; i < closes.length - w; i++) {
    let isH = true, isL = true
    for (let j = i - w; j <= i + w; j++) { if (closes[j] > closes[i]) isH = false; if (closes[j] < closes[i]) isL = false }
    if (isH) raw.push({ i, price: closes[i], t: 'H' })
    if (isL) raw.push({ i, price: closes[i], t: 'L' })
  }
  raw.sort((a, b) => a.i - b.i)
  const merged: typeof raw = []
  for (const p of raw) {
    const last = merged[merged.length - 1]
    if (last && last.t === p.t) { if ((p.t === 'H' && p.price > last.price) || (p.t === 'L' && p.price < last.price)) merged[merged.length - 1] = p }
    else merged.push(p)
  }
  const filt: typeof raw = []
  for (const p of merged) {
    const last = filt[filt.length - 1]
    if (!last) { filt.push(p); continue }
    const move = Math.abs(p.price - last.price) / last.price * 100
    if (move >= minMovePct) filt.push(p)
    else if (p.t === last.t && ((p.t === 'H' && p.price > last.price) || (p.t === 'L' && p.price < last.price))) filt[filt.length - 1] = p
  }
  return filt
}

function compute(closes: number[]) {
  const price = closes[closes.length - 1]
  const high52 = Math.max(...closes), low52 = Math.min(...closes)
  const rangePos = high52 > low52 ? ((price - low52) / (high52 - low52)) * 100 : 50
  const r = rsi(closes)
  const s20 = sma(closes, 20), s50 = sma(closes, 50), s200 = sma(closes, 200)
  const maAbove = [price > s20, price > s50, price > s200].filter(Boolean).length
  const bmsbMid = (sma(closes, Math.min(140, closes.length)) + ema(closes, Math.min(147, closes.length))) / 2
  const cyclePos: 'above' | 'in' | 'below' = price > bmsbMid * 1.02 ? 'above' : price < bmsbMid * 0.98 ? 'below' : 'in'

  // ---- estrutura por swings ----
  const sw = swings(closes)
  const hs = sw.filter(p => p.t === 'H'), ls = sw.filter(p => p.t === 'L')
  const lastH = hs.slice(-3), lastL = ls.slice(-3)
  const descH = lastH.length >= 2 && lastH[lastH.length - 1].price < lastH[0].price
  const ascH = lastH.length >= 2 && lastH[lastH.length - 1].price > lastH[0].price
  const descL = lastL.length >= 2 && lastL[lastL.length - 1].price < lastL[0].price
  const ascL = lastL.length >= 2 && lastL[lastL.length - 1].price > lastL[0].price
  let structure: 'alta' | 'baixa' | 'lateral'
  if (descH && descL) structure = 'baixa'
  else if (ascH && ascL) structure = 'alta'
  else if (descH && !ascL) structure = 'baixa'
  else if (ascH && !descL) structure = 'alta'
  else structure = 'lateral'

  // ---- zonas por confluência ----
  const prices = sw.map(p => p.price).sort((a, b) => a - b)
  const clusters: { vals: number[]; avg: number }[] = []
  for (const pr of prices) {
    const last = clusters[clusters.length - 1]
    if (last && (pr - last.avg) / last.avg <= 0.04) { last.vals.push(pr); last.avg = last.vals.reduce((s, x) => s + x, 0) / last.vals.length }
    else clusters.push({ vals: [pr], avg: pr })
  }
  const zones = clusters.map(c => ({ price: c.avg, touches: c.vals.length }))
  const supports = zones.filter(z => z.price < price * 0.995).sort((a, b) => b.price - a.price)
  const resistances = zones.filter(z => z.price > price * 1.005).sort((a, b) => a.price - b.price)
  const keySup = supports[0]?.price ?? low52
  const keyRes = resistances[0]?.price ?? high52

  // ---- risco/retorno até GATILHOS (não extremos do ano) ----
  const upside = (keyRes / price - 1) * 100
  const downside = (1 - keySup / price) * 100
  const rr = downside > 0.1 ? upside / downside : 0

  // ---- gatilhos ----
  const nextSup = supports[1]?.price ?? keySup
  const trigger = {
    buy: `Romper ${money(keyRes)} com força quebra a sequência e vira o caráter.`,
    sell: `Perder ${money(keySup)} com fechamento abre queda até ${money(nextSup)}.`,
  }

  // ---- veredito (estrutura manda) ----
  const nearSup = (price - keySup) / price < 0.05
  const nearRes = (keyRes - price) / price < 0.05
  let verdict: { label: string; tone: 'buy' | 'sell' | 'neutral'; text: string }
  if (structure === 'baixa') {
    if (nearSup) verdict = { label: 'SUPORTE EM TENDÊNCIA DE BAIXA', tone: 'neutral', text: `Estrutura de baixa (topos descendentes), mas o preço testa o suporte ${money(keySup)}. Se segurar, há alívio; se perder com força, abre queda até ${money(nextSup)}. Compra só gradual e defendida — retomada real exige romper ${money(keyRes)}.` }
    else verdict = { label: 'TENDÊNCIA DE BAIXA', tone: 'sell', text: `Sequência de topos descendentes; viés corretivo. Enquanto abaixo de ${money(keyRes)}, o cenário é de baixa. Priorize proteção; só compre em reação nos suportes (${money(keySup)}).` }
  } else if (structure === 'alta') {
    if (nearRes) verdict = { label: 'PERTO DE RESISTÊNCIA', tone: 'sell', text: `Tendência de alta, porém testando a resistência ${money(keyRes)}. Considere realizar parcial; recompra ideal em pullback para ${money(keySup)}.` }
    else if (nearSup) verdict = { label: 'PULLBACK EM ALTA — RECOMPRA', tone: 'buy', text: `Tendência de alta (fundos ascendentes) corrigindo até o suporte ${money(keySup)} — zona de recompra enquanto defender esse nível.` }
    else verdict = { label: 'TENDÊNCIA DE ALTA', tone: 'buy', text: `Estrutura de alta preservada. Mantenha posição; suporte relevante em ${money(keySup)}, resistência em ${money(keyRes)}.` }
  } else {
    verdict = { label: 'LATERAL — OPERE AS BORDAS', tone: 'neutral', text: `Sem tendência definida. Range entre ${money(keySup)} e ${money(keyRes)}: comprar perto do suporte, realizar perto da resistência. O rompimento define o próximo movimento.` }
  }

  const structHint = structure === 'baixa' ? 'topos descendentes' : structure === 'alta' ? 'fundos ascendentes' : 'sem tendência clara'
  const rsiHint = r == null ? '—' : r < 30 ? 'sobrevendido' : r > 70 ? 'sobrecomprado' : 'neutro'
  const maHint = maAbove === 0 ? 'abaixo das médias' : maAbove === 3 ? 'acima de todas' : `acima de ${maAbove}/3`
  // confirmação: estrutura x ciclo
  const confirm = (structure === 'baixa' && cyclePos === 'below') || (structure === 'alta' && cyclePos === 'above')
    ? 'BMSB confirma a estrutura' : cyclePos === 'in' ? 'BMSB em zona de decisão' : 'BMSB diverge — atenção'

  return {
    price, rsi: r, bmsbMid, cyclePos, structure, structHint,
    supports: supports.slice(0, 4).map(z => ({ price: z.price, touches: z.touches, dist: (1 - z.price / price) * 100 })),
    resistances: resistances.slice(0, 4).map(z => ({ price: z.price, touches: z.touches, dist: (z.price / price - 1) * 100 })),
    keySup, keyRes, upside, downside, rr, trigger, verdict,
    rangePos, high52, low52, maAbove, rsiHint, maHint, confirm,
  }
}

export async function GET(request: Request) {
  const idsParam = new URL(request.url).searchParams.get('ids')
  const ids = idsParam ? idsParam.split(',').slice(0, 12) : []
  const out: Record<string, any> = {}
  for (const id of ids) {
    try {
      const r = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=max`, { next: { revalidate: 3600 } })
      if (!r.ok) continue
      const d = await r.json()
      const closes: number[] = (d.prices || []).map((p: number[]) => p[1])
      if (closes.length < 40) continue
      out[id] = compute(closes)
    } catch {}
  }
  return NextResponse.json(out)
}
