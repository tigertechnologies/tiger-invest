export type Kind = 'crypto' | 'stock' | 'cash' | 'pool'

export type Holding = {
  id?: string
  user_id?: string
  kind: Kind
  name: string
  symbol: string
  cg_id: string
  qty: number
  price: number
  invested: number
  current_value: number | null
  meta_pct: number
  color: string
  sort?: number
}

export type Flow = {
  id?: string
  user_id?: string
  kind: 'in' | 'out'
  amount: number
  note?: string
  move_date?: string
  created_at?: string
}

// IMPORTANTE: conta nova começa ZERADA. Não semeamos nenhuma carteira de
// exemplo — dados reais de um usuário jamais podem virar seed de outro.
// (Antes, este array continha a carteira real do admin e vazava p/ todo
// cadastro novo, além de ir parar no bundle público do client.)
export const DEFAULT_HOLDINGS: Omit<Holding, 'id' | 'user_id'>[] = []

// Detalhes de pool genéricos (placeholder neutro; sem dados de ninguém).
export const POOL_INFO = {
  dapp: 'Uniswap v3', chain: 'Base', pair: 'ETH / USDC',
  fees: 0, aprMonth: 0, aprYear: 0, days: 0,
  low: 0, high: 0, entry: '', retDay: 0,
}

// Cambio de referencia p/ a aba Aportes (R$)
export const BRL_RATE = 5.07
export const DEFAULT_APORTES = { in: 242508.95, out: 136048.23 } // historico BLADE (informativo)

export function value(h: Holding): number {
  if (h.kind === 'cash' || h.kind === 'pool') return h.current_value ?? 0
  return h.qty * h.price
}

// Formatadores estilo pt-BR ($1.361,53)
const fmt = (n: number, d = 2) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)
export const usd = (n: number) => '$' + fmt(n)
export const pct = (n: number) => (n > 0 ? '+' : '') + fmt(n) + '%'
export const brl = (n: number) => 'R$ ' + fmt(n)
export { fmt }

// ---- v2: ledger de compras ----
export type Transaction = {
  id?: string
  user_id?: string
  symbol: string
  name: string
  cg_id: string
  color: string
  rede: string
  corretora: string
  carteira: string
  buy_date: string
  qty: number
  buy_price: number
  stop_limit: number
  target: number
  meta_pct: number
  move_kind?: 'buy' | 'to_pool' | 'from_pool' | 'sell'
  note?: string
}

export type Live = { usd: number; ch24: number | null; ch30: number | null; ch1y: number | null; img?: string }

export function daysSince(dateStr: string): number {
  const d = new Date(dateStr); const now = new Date()
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86400000))
}

// ---- v3/v4: sinais técnicos ----
export type Signal = {
  price: number; rsi: number | null
  bmsbMid: number; cyclePos: 'above' | 'in' | 'below'
  structure: 'alta' | 'baixa' | 'lateral'; structHint: string
  supports: { price: number; touches: number; dist: number }[]
  resistances: { price: number; touches: number; dist: number }[]
  keySup: number; keyRes: number; upside: number; downside: number; rr: number
  trigger: { buy: string; sell: string }
  verdict: { label: string; tone: 'buy' | 'sell' | 'neutral'; text: string }
  rangePos: number; high52: number; low52: number; maAbove: number
  rsiHint: string; maHint: string; confirm: string
}


// ---- v4: pools de liquidez ----
export type Pool = {
  id?: string; user_id?: string
  par1: string; par1_cg_id: string; par2: string
  dapp: string; rede: string; link: string
  aporte: number; current_value: number
  low_range: number; high_range: number
  entry_date: string; fees: number
  pool_address?: string; network?: string
  position_id?: string   // NFT ID da posição (p/ sincronizar saldo e taxas automaticamente)
}
// Placeholder neutro. Usado apenas como fallback na migração de pool legada
// (holding -> tabela pools) de contas antigas; nunca como seed de conta nova.
export const DEFAULT_POOL: Omit<Pool, 'id' | 'user_id'> = {
  par1: 'ETH', par1_cg_id: 'ethereum', par2: 'USDC', dapp: 'Uniswap v3', rede: 'Base',
  link: '',
  aporte: 0, current_value: 0, low_range: 0, high_range: 0,
  entry_date: '2025-01-01', fees: 0, pool_address: '', network: 'base',
}

// ---- v6: níveis personalizados ----
export type Level = {
  id?: string; user_id?: string
  symbol: string
  kind: 'support' | 'resistance'
  price: number
  note?: string
}
