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
  created_at?: string
}

// Dados reais da planilha BLADE — usados só na primeira vez (auto-seed).
export const DEFAULT_HOLDINGS: Omit<Holding, 'id' | 'user_id'>[] = [
  { kind: 'crypto', name: 'Ethereum',   symbol: 'ETH',   cg_id: 'ethereum',    qty: 2.28508,  price: 1883.16,  invested: 9057.66, current_value: null, meta_pct: 28, color: '#A855F7', sort: 1 },
  { kind: 'crypto', name: 'Bitcoin',    symbol: 'BTC',   cg_id: 'bitcoin',     qty: 0.06690,  price: 63465.23, invested: 7027.38, current_value: null, meta_pct: 32, color: '#FF2E9A', sort: 2 },
  { kind: 'crypto', name: 'Solana',     symbol: 'SOL',   cg_id: 'solana',      qty: 3.27583,  price: 73.66,    invested: 474.00,  current_value: null, meta_pct: 7,  color: '#22D3EE', sort: 3 },
  { kind: 'crypto', name: 'Aave',       symbol: 'AAVE',  cg_id: 'aave',        qty: 0.26500,  price: 92.42,    invested: 60.00,   current_value: null, meta_pct: 2,  color: '#C77DFF', sort: 4 },
  { kind: 'crypto', name: 'Chainlink',  symbol: 'LINK',  cg_id: 'chainlink',   qty: 7.27174,  price: 8.35,     invested: 120.04,  current_value: null, meta_pct: 6,  color: '#6E8BFF', sort: 5 },
  { kind: 'crypto', name: 'EigenLayer', symbol: 'EIGEN', cg_id: 'eigenlayer',  qty: 68.89000, price: 0.18712,  invested: 60.01,   current_value: null, meta_pct: 2,  color: '#FF6EC7', sort: 6 },
  { kind: 'crypto', name: 'Arbitrum',   symbol: 'ARB',   cg_id: 'arbitrum',    qty: 593.406,  price: 0.08119,  invested: 142.80,  current_value: null, meta_pct: 4,  color: '#4CC9F0', sort: 7 },
  { kind: 'crypto', name: 'Celestia',   symbol: 'TIA',   cg_id: 'celestia',    qty: 43.0998,  price: 0.33,     invested: 40.34,   current_value: null, meta_pct: 4,  color: '#FF5CA8', sort: 8 },
  { kind: 'stock',  name: 'S&P 500 ETF',symbol: 'SPY',   cg_id: '',            qty: 0.2221,   price: 747.03,   invested: 165.90,  current_value: null, meta_pct: 0,  color: '#7C5CFF', sort: 9 },
  { kind: 'cash',   name: 'Caixa (dolar)', symbol: 'USD', cg_id: '',           qty: 0,        price: 0,        invested: 7410.00, current_value: 7410.00, meta_pct: 10, color: '#9D7CFF', sort: 10 },
  { kind: 'pool',   name: 'Uniswap ETH/USDC', symbol: 'LP', cg_id: '',         qty: 0,        price: 0,        invested: 2771.29, current_value: 1361.53, meta_pct: 5, color: '#2BFFC6', sort: 11 },
]

// Detalhes da pool (secundarios) — v1 como constante; podem ir pro DB depois.
export const POOL_INFO = {
  dapp: 'Uniswap v3', chain: 'Base', pair: 'ETH / USDC',
  fees: 13.19, aprMonth: 0.04, aprYear: 0.48, days: 337,
  low: 3487.69, high: 4978.96, entry: '30/08/2025', retDay: 0,
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
}

export type Live = { usd: number; ch24: number | null; ch30: number | null; ch1y: number | null; img?: string }

export function daysSince(dateStr: string): number {
  const d = new Date(dateStr); const now = new Date()
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86400000))
}

// ---- v3/v4: sinais técnicos ----
export type Signal = {
  price: number; rsi: number | null
  sma20: number; sma50: number; sma200: number
  high52: number; low52: number; rangePos: number
  support: number; resistance: number
  maAbove: number
  verdict: { label: string; tone: 'buy' | 'sell' | 'neutral'; text: string }
  rsiHint: string; rangeHint: string; maHint: string
}


// ---- v4: pools de liquidez ----
export type Pool = {
  id?: string; user_id?: string
  par1: string; par1_cg_id: string; par2: string
  dapp: string; rede: string; link: string
  aporte: number; current_value: number
  low_range: number; high_range: number
  entry_date: string; fees: number
}
export const DEFAULT_POOL: Omit<Pool, 'id' | 'user_id'> = {
  par1: 'ETH', par1_cg_id: 'ethereum', par2: 'USDC', dapp: 'Uniswap v3', rede: 'Base',
  link: 'https://app.uniswap.org/positions/v3/base/3831528',
  aporte: 2771.29, current_value: 1361.53, low_range: 3487.69, high_range: 4978.96,
  entry_date: '2025-08-30', fees: 13.19,
}
