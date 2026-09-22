// ============================================================
// ATENÇÃO AGORA — escolhe UM único risco, o mais relevante do momento,
// SEMPRE ponderado pelo peso financeiro no patrimônio.
// Quantidade não gera alerta grave: 9 Longs que são 2,4% da carteira
// não disparam nada. Só o que tem peso real aparece.
// Sem risco relevante -> null (a UI mostra "nenhum risco crítico").
// ============================================================

export type Sev = 'crit' | 'warn' | 'info'
export type TopRisk = { sev: Sev; title: string; detail: string } | null

export type RiskInput = {
  patr: number
  topAsset?: { symbol: string; share: number } | null   // share 0..1 do maior ativo
  perpEquity: number                                     // capital real em perps (USD)
  perpNotional: number                                   // exposição alavancada (USD)
  perpMarginRatio: number                                // 0..1
  perpMinLiqDist: number | null                          // menor distância % até liquidação
  perpsNoStop: number                                    // nº de perps abertas sem stop
  perpsOpen: number
  poolsOut: { par: string; weight: number }[]            // pools fora da faixa (weight 0..1)
  openPl: number                                         // PnL das posições abertas (USD)
  openPlPct: number                                      // %
}

const money = (n: number) => (n < 0 ? '−' : '') + 'US$ ' + Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const p0 = (n: number) => (n * 100).toFixed(0) + '%'

export function pickTopRisk(i: RiskInput): TopRisk {
  const patr = i.patr || 1
  const perpShare = i.perpEquity / patr
  const cands: { sev: Sev; title: string; detail: string; mat: number }[] = []

  // 1) Perp realmente próxima da liquidação (peso = capital em risco)
  if (i.perpMinLiqDist != null && i.perpMinLiqDist < 12 && perpShare >= 0.03)
    cands.push({ sev: 'crit', title: 'Perp próxima da liquidação', detail: `posição mais exposta a ${i.perpMinLiqDist.toFixed(1)}% da liquidação`, mat: 3 + perpShare })

  // 2) Prejuízo relevante nas posições abertas (peso >= 5% do patrimônio)
  if (i.openPl < 0 && Math.abs(i.openPl) / patr >= 0.05)
    cands.push({ sev: 'warn', title: 'Posições abertas em prejuízo', detail: `${i.openPlPct.toFixed(1)}% · ${money(i.openPl)}`, mat: 2 + Math.abs(i.openPl) / patr })

  // 3) Concentração excessiva num ativo
  if (i.topAsset && i.topAsset.share >= 0.4)
    cands.push({ sev: i.topAsset.share >= 0.6 ? 'crit' : 'warn', title: 'Concentração alta', detail: `${i.topAsset.symbol} = ${p0(i.topAsset.share)} do patrimônio`, mat: (i.topAsset.share >= 0.6 ? 3 : 2) + i.topAsset.share })

  // 4) Pool fora da faixa (peso >= 3% do patrimônio)
  const poolOut = i.poolsOut.filter(p => p.weight >= 0.03).sort((a, b) => b.weight - a.weight)[0]
  if (poolOut) cands.push({ sev: 'warn', title: 'Pool fora da faixa', detail: `${poolOut.par} parou de gerar taxas (${p0(poolOut.weight)} da carteira)`, mat: 2 + poolOut.weight })

  // 5) Alavancagem relevante SEM stop (peso >= 5%)
  if (i.perpsNoStop > 0 && perpShare >= 0.05)
    cands.push({ sev: 'warn', title: 'Alavancagem sem stop', detail: `${i.perpsNoStop} posição(ões) sem stop · ${p0(perpShare)} da carteira`, mat: 2 + perpShare })

  // 6) Margin ratio alto (conta perto do limite), peso relevante
  if (i.perpMarginRatio >= 0.6 && perpShare >= 0.05)
    cands.push({ sev: 'warn', title: 'Margem apertada', detail: `margin ratio ${p0(i.perpMarginRatio)}`, mat: 2 + i.perpMarginRatio })

  // 7) Exposição alavancada relevante (notional grande vs patrimônio)
  const lev = i.perpNotional / patr
  if (lev >= 0.3 && perpShare >= 0.05)
    cands.push({ sev: 'info', title: 'Alavancagem relevante', detail: `exposição perp = ${p0(lev)} do patrimônio`, mat: 1 + lev })

  if (!cands.length) return null
  const rank: Record<Sev, number> = { crit: 0, warn: 1, info: 2 }
  cands.sort((a, b) => rank[a.sev] - rank[b.sev] || b.mat - a.mat)
  const t = cands[0]
  return { sev: t.sev, title: t.title, detail: t.detail }
}
