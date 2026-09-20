// ============================================================
// Perps (Ondo Perps) — tipos, metadados de mercado e fórmulas de risco.
//
// Modelo Ondo: cross margin, USD-settled. Preço de liquidação, margem e
// margin ratio seguem a doc oficial (docs.ondoperps.xyz/leverage).
//   initial_margin      = notional / leverage
//   maintenance_margin  = notional_no_mark * MMR         (tier único)
//   margin_balance      = colateral + Σ uPnL             (equity da conta)
//   margin_ratio        = maintenance_margin / margin_balance  (1 = liquida)
// MMR = metade da taxa de margem inicial no leverage máximo = 0,5 / maxLev.
// ============================================================

export type PerpSide = 'long' | 'short'

export type PerpPosition = {
  id?: string
  user_id?: string
  market: string          // CRCL-USD.P
  symbol: string          // CRCL
  name: string            // Circle
  side: PerpSide
  leverage: number
  size: number            // quantidade (contratos)
  entry_price: number
  margin: number          // margem inicial alocada (USDC)
  opened_at: string
  status: 'open' | 'closed'
  close_price?: number | null
  closed_at?: string | null
  realized_pnl?: number | null
  note?: string
}

export type PerpAccount = { user_id?: string; collateral: number; updated_at?: string }

// preço/estado ao vivo de um mercado (vem de /api/perps -> Ondo público)
export type PerpMarket = {
  market: string
  symbol: string
  name: string
  klass: 'equity' | 'index' | 'commodity' | 'etf'
  maxLev: number
  mmr: number             // maintenance margin rate (fração)
  last: number            // último preço (mark aproximado)
  index: number           // preço do ativo subjacente
  chg24: number           // variação 24h (%)
  fundingRate: number     // funding do próximo intervalo (fração por intervalo)
  disabled: boolean
  isClosed: boolean       // mercado subjacente fechado (fora do horário)
}

// Metadados fixos dos mercados suportados (docs.ondoperps.xyz/markets).
// maxLev define o MMR (0,5/maxLev). Usados como fallback quando o mercado
// ainda não apareceu na resposta ao vivo, e para popular o seletor offline.
type MetaRow = { name: string; klass: PerpMarket['klass']; maxLev: number }
export const PERP_META: Record<string, MetaRow> = {
  // Equities 20x
  AAPL: { name: 'Apple', klass: 'equity', maxLev: 20 },
  // Equities 10x
  AMD: { name: 'AMD', klass: 'equity', maxLev: 10 },
  AMZN: { name: 'Amazon', klass: 'equity', maxLev: 10 },
  COIN: { name: 'Coinbase', klass: 'equity', maxLev: 10 },
  CRCL: { name: 'Circle', klass: 'equity', maxLev: 10 },
  GOOGL: { name: 'Alphabet (Google)', klass: 'equity', maxLev: 10 },
  HOOD: { name: 'Robinhood', klass: 'equity', maxLev: 10 },
  INTC: { name: 'Intel', klass: 'equity', maxLev: 10 },
  META: { name: 'Meta', klass: 'equity', maxLev: 10 },
  MRVL: { name: 'Marvell', klass: 'equity', maxLev: 10 },
  MSFT: { name: 'Microsoft', klass: 'equity', maxLev: 10 },
  MSTR: { name: 'MicroStrategy', klass: 'equity', maxLev: 10 },
  MU: { name: 'Micron', klass: 'equity', maxLev: 10 },
  NFLX: { name: 'Netflix', klass: 'equity', maxLev: 10 },
  NVDA: { name: 'NVIDIA', klass: 'equity', maxLev: 10 },
  ORCL: { name: 'Oracle', klass: 'equity', maxLev: 10 },
  PLTR: { name: 'Palantir', klass: 'equity', maxLev: 10 },
  SPCX: { name: 'SpaceX', klass: 'equity', maxLev: 10 },
  TSLA: { name: 'Tesla', klass: 'equity', maxLev: 10 },
  // Índices 20x
  US500: { name: 'S&P 500', klass: 'index', maxLev: 20 },
  US100: { name: 'Nasdaq 100', klass: 'index', maxLev: 20 },
  // Commodities
  XAU: { name: 'Ouro', klass: 'commodity', maxLev: 20 },
  XAG: { name: 'Prata', klass: 'commodity', maxLev: 20 },
  WTI: { name: 'Petróleo WTI', klass: 'commodity', maxLev: 20 },
  BRENT: { name: 'Petróleo Brent', klass: 'commodity', maxLev: 15 },
  // ETFs 10x
  DRAM: { name: 'Roundhill Memory ETF', klass: 'etf', maxLev: 10 },
  EWY: { name: 'iShares South Korea ETF', klass: 'etf', maxLev: 10 },
}

export const mmrFor = (maxLev: number) => 0.5 / maxLev
export const metaFor = (symbol: string): MetaRow =>
  PERP_META[symbol.toUpperCase()] || { name: symbol.toUpperCase(), klass: 'equity', maxLev: 10 }

// Fees Ondo (docs/markets): maker 0,015% · taker 0,035%
export const PERP_TAKER_FEE = 0.00035
export const PERP_MAKER_FEE = 0.00015

// ---- Cálculos de posição --------------------------------------------------

// uPnL em USD de UMA posição, dado o mark price.
export function upnl(p: { side: PerpSide; size: number; entry_price: number }, mark: number): number {
  const dir = p.side === 'long' ? 1 : -1
  return dir * p.size * (mark - p.entry_price)
}

// Notional (valor da posição) ao mark.
export const notionalAt = (size: number, price: number) => size * price

// Preço de liquidação (cross margin, replicando a Ondo).
// Considera o colateral total da conta + o PnL das OUTRAS posições ao mark
// atual (aproximação isolada-dentro-do-cross, padrão de exchange).
//   A = colateral + Σ_outras uPnL − Σ_outras maintMargin
//   Long : P = (size·entry − A) / (size·(1 − MMR))
//   Short: P = (A + size·entry) / (size·(1 + MMR))
export function liqPrice(
  p: { side: PerpSide; size: number; entry_price: number; mmr: number },
  A: number,
): number | null {
  const { size, entry_price: e, mmr } = p
  if (!(size > 0)) return null
  if (p.side === 'long') {
    const px = (size * e - A) / (size * (1 - mmr))
    return px > 0 ? px : 0.0000001   // conta muito colateralizada: liq ~0
  } else {
    return (A + size * e) / (size * (1 + mmr))
  }
}

// Resumo de toda a conta de perps, dado o colateral e os marks ao vivo.
export function accountSummary(
  positions: PerpPosition[],
  collateral: number,
  markOf: (p: PerpPosition) => number,
  mmrOf: (p: PerpPosition) => number,
) {
  const open = positions.filter(p => p.status === 'open')
  let totalUpnl = 0, maintMargin = 0, usedMargin = 0, notional = 0
  for (const p of open) {
    const mark = markOf(p) || p.entry_price
    totalUpnl += upnl(p, mark)
    maintMargin += notionalAt(p.size, mark) * mmrOf(p)
    usedMargin += p.margin
    notional += notionalAt(p.size, mark)
  }
  const equity = collateral + totalUpnl                 // margin balance
  const available = equity - usedMargin
  const marginRatio = equity > 0 ? maintMargin / equity : 0   // 1 = liquida
  const acctLev = equity > 0 ? notional / equity : 0
  return { open, totalUpnl, maintMargin, usedMargin, notional, equity, available, marginRatio, acctLev }
}

// Distância % do mark até a liquidação (positiva = folga).
export function liqDistancePct(side: PerpSide, mark: number, liq: number): number | null {
  if (!(mark > 0) || liq == null || !(liq > 0)) return null
  return side === 'long' ? (mark - liq) / mark * 100 : (liq - mark) / mark * 100
}
