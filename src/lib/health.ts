// ============================================================
// Saúde da carteira — scanner analítico dos SEUS próprios dados.
// Levanta bandeiras com o NÚMERO que disparou e o "o que significa".
// Nunca diz "compre/venda" — descreve exposição, não dá ordem.
// Único caso de ação: rebalanceamento contra as SUAS metas (régua sua).
// ============================================================

export type Severity = 'crit' | 'warn' | 'info' | 'ok'
export type Flag = { id: string; sev: Severity; title: string; detail: string; meaning: string }

export type HealthHolding = {
  symbol: string; kind: string; value: number; metaPct: number
  years: number; hasStop: boolean; emission: number | null; nominalPct: number
}
export type HealthInput = {
  patr: number
  holdings: HealthHolding[]
  cashVal: number
  poolsVal: number
  perpsOpen: { symbol: string; side: string; margin: number; leverage: number }[]
  perpEquity: number
  perpCollateral: number
  perpUpnl: number
  perpMarginRatio: number      // 0..1 (maint/equity); 1 = liquida
  perpMinLiqDist: number | null // menor distância % até liquidação
  cycleRegime?: 'acumular' | 'neutro' | 'distribuir' | null
}

const money = (n: number) => '$' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const p1 = (n: number) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1) + '%'

export function buildHealth(inp: HealthInput): { score: number; status: Severity; flags: Flag[] } {
  const flags: Flag[] = []
  const patr = inp.patr || 0

  // 1) Concentração num único ativo
  const risk = inp.holdings.filter(h => h.kind === 'crypto' || h.kind === 'stock')
  const top = risk.slice().sort((a, b) => b.value - a.value)[0]
  if (top && patr > 0) {
    const share = top.value / patr * 100
    if (share >= 60) flags.push({ id: 'conc', sev: 'crit', title: 'Concentração alta', detail: `${top.symbol} = ${share.toFixed(0)}% do patrimônio`, meaning: 'Um único ativo domina a carteira — o resultado depende quase só dele.' })
    else if (share >= 40) flags.push({ id: 'conc', sev: 'warn', title: 'Concentração relevante', detail: `${top.symbol} = ${share.toFixed(0)}% do patrimônio`, meaning: 'Boa parte do resultado vem de um ativo só — pouca diversificação.' })
  }

  // 2) Perps na mesma direção (correlação / mesma aposta)
  const longs = inp.perpsOpen.filter(p => p.side === 'long').length
  const shorts = inp.perpsOpen.filter(p => p.side === 'short').length
  if (inp.perpsOpen.length >= 2 && (longs === 0 || shorts === 0)) {
    flags.push({ id: 'perp-dir', sev: inp.perpsOpen.length >= 3 ? 'warn' : 'info', title: 'Perps na mesma direção', detail: `${inp.perpsOpen.length} posições, todas ${longs ? 'Long' : 'Short'}`, meaning: 'Sem hedge: numa virada do mercado, todas caem juntas e a folga de margem some rápido.' })
  }

  // 3) Margin ratio (proximidade da liquidação, nível de conta)
  if (inp.perpsOpen.length > 0) {
    const mr = inp.perpMarginRatio * 100
    if (mr >= 80) flags.push({ id: 'mr', sev: 'crit', title: 'Risco de liquidação', detail: `Margin ratio ${mr.toFixed(0)}%`, meaning: 'Margin ratio mede o quão perto a conta está da liquidação (100% = liquida).' })
    else if (mr >= 50) flags.push({ id: 'mr', sev: 'warn', title: 'Margem apertada', detail: `Margin ratio ${mr.toFixed(0)}%`, meaning: 'A conta está usando boa parte da margem — pouca folga pra oscilação.' })
  }

  // 4) Distância até a liquidação (posição mais exposta)
  if (inp.perpMinLiqDist != null && inp.perpsOpen.length > 0) {
    const d = inp.perpMinLiqDist
    if (d < 8) flags.push({ id: 'liq', sev: 'crit', title: 'Liquidação próxima', detail: `Posição mais exposta a ${d.toFixed(1)}% da liquidação`, meaning: 'Uma queda pequena no ativo já dispara a liquidação dessa posição.' })
    else if (d < 18) flags.push({ id: 'liq', sev: 'warn', title: 'Folga de liquidação baixa', detail: `Menor distância: ${d.toFixed(1)}%`, meaning: 'A posição mais exposta liquida com uma queda moderada no ativo.' })
  }

  // 5) Posições alavancadas sem rede (stop/alvo)
  if (inp.perpsOpen.length > 0) {
    flags.push({ id: 'perp-nostop', sev: 'warn', title: 'Alavancagem sem rede', detail: `${inp.perpsOpen.length} posição(ões) alavancada(s) sem stop/alvo definido`, meaning: 'Alavancagem sem saída planejada é o ponto mais frágil — reversões rápidas comem o lucro e mais.' })
  }

  // 6) Lucro alavancado frágil (não realizado, grande sobre a margem)
  if (inp.perpUpnl > 0 && inp.perpCollateral > 0) {
    const roe = inp.perpUpnl / inp.perpCollateral * 100
    if (roe >= 15) flags.push({ id: 'frag', sev: 'info', title: 'Lucro alavancado não realizado', detail: `+${money(inp.perpUpnl)} (${p1(roe)} sobre a margem)`, meaning: 'Ganho alavancado no papel é volátil — pode evaporar antes de virar caixa.' })
  }

  // 7) Ativo perdendo pra própria emissão (diluição)
  for (const h of risk) {
    if (h.emission == null || h.years <= 0) continue
    const dilut = ((Math.pow(1 + h.emission / 100, h.years) - 1) * 100)
    if (h.emission > 0 && h.nominalPct < dilut && h.value / patr >= 0.03) {
      flags.push({ id: 'dilu-' + h.symbol, sev: 'info', title: `${h.symbol} abaixo da diluição`, detail: `preço ${p1(h.nominalPct)} vs emissão +${dilut.toFixed(1)}% no período`, meaning: 'Parte do ganho é só a oferta inflando — em fatia de rede você está atrás.' })
    }
  }

  // 8) Ciclo x exposição
  if (inp.cycleRegime === 'distribuir') flags.push({ id: 'cycle', sev: 'info', title: 'Ciclo em distribuição', detail: 'Termômetro no vermelho', meaning: 'Sentimento aquecido costuma marcar topos — período historicamente ruim pra aumentar risco.' })

  // 9) Reserva de caixa baixa quando há risco/alavancagem
  if (patr > 0) {
    const cashShare = inp.cashVal / patr * 100
    const hasLeverage = inp.perpsOpen.length > 0
    if (cashShare < 5 && (hasLeverage || (top && top.value / patr >= 0.4))) {
      flags.push({ id: 'cash', sev: 'warn', title: 'Reserva de caixa baixa', detail: `Caixa = ${cashShare.toFixed(0)}% do patrimônio`, meaning: 'Pouca reserva reduz sua capacidade de aguentar quedas ou aproveitar oportunidades.' })
    }
  }

  // Score e status
  let score = 100
  for (const f of flags) score -= f.sev === 'crit' ? 26 : f.sev === 'warn' ? 13 : 3
  score = Math.max(4, Math.min(100, score))
  const status: Severity = flags.some(f => f.sev === 'crit') ? 'crit' : flags.some(f => f.sev === 'warn') ? 'warn' : 'ok'

  // Ordena por severidade (crit > warn > info)
  const rank = { crit: 0, warn: 1, info: 2, ok: 3 }
  flags.sort((a, b) => rank[a.sev] - rank[b.sev])
  return { score, status, flags }
}
