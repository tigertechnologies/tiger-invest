import { NextResponse } from 'next/server'

// Tiger Invest — Sincronização de posição Uniswap V3 (por NFT ID)
// SEM subgraph e SEM API key: lê direto dos contratos via RPC público.
// Retorna: taxas não coletadas (US$), preço da razão (p/ status de range)
// e o VALOR ATUAL da posição em US$ (amount0/amount1 calculados via liquidez).
//
// GET /api/position?network=base&id=5748476

const RPC: Record<string, string> = {
  base: 'https://mainnet.base.org',
  ethereum: 'https://eth.llamarpc.com',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
}
const NPM: Record<string, string> = {
  base: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
  ethereum: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
  arbitrum: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
}
const FACTORY: Record<string, string> = {
  base: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
  ethereum: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  arbitrum: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
}

const SEL_POSITIONS = '0x99fbab88' // positions(uint256)
const SEL_GETPOOL   = '0x1698ee82' // getPool(address,address,uint24)
const SEL_SLOT0     = '0x3850c7bd' // slot0()

const TOKENS: Record<string, { symbol: string; decimals: number; cg: string }> = {
  '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18, cg: 'ethereum' },
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': { symbol: 'CBBTC', decimals: 8, cg: 'coinbase-wrapped-btc' },
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6, cg: 'usd-coin' },
  '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2': { symbol: 'USDT', decimals: 6, cg: 'tether' },
}

async function rpcCall(rpc: string, to: string, data: string): Promise<string | null> {
  try {
    const r = await fetch(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
      cache: 'no-store',
    })
    const j = await r.json()
    return j?.result ?? null
  } catch { return null }
}

function word(hex: string, i: number): bigint {
  const c = hex.replace(/^0x/, '')
  const s = c.slice(i * 64, i * 64 + 64)
  return s ? BigInt('0x' + s) : 0n
}
// lê int24/int com sinal a partir de um word (para ticks)
function wordSigned(hex: string, i: number): bigint {
  const v = word(hex, i)
  const max = 1n << 255n
  return v >= max ? v - (1n << 256n) : v
}
function addrFromWord(hex: string, i: number): string {
  const c = hex.replace(/^0x/, '')
  return ('0x' + c.slice(i * 64, i * 64 + 64).slice(24)).toLowerCase()
}
function pad(a: string): string { return a.replace(/^0x/, '').toLowerCase().padStart(64, '0') }
function feeHex(fee: number): string { return fee.toString(16).padStart(64, '0') }

async function usdPrices(cgIds: string[], origin: string): Promise<Record<string, number>> {
  const ids = Array.from(new Set(cgIds)).filter(Boolean)
  if (!ids.length) return {}
  try {
    const r = await fetch(`${origin}/api/prices?ids=${ids.join(',')}`, { cache: 'no-store' })
    const d = await r.json()
    const coins = d?.coins || {}
    const out: Record<string, number> = {}
    for (const id of ids) if (coins[id]?.usd) out[id] = coins[id].usd
    return out
  } catch { return {} }
}

// sqrt(1.0001^tick) * 2^96  — via Math (precisão suficiente p/ tracker)
function sqrtPriceX96FromTick(tick: number): number {
  return Math.sqrt(Math.pow(1.0001, tick)) * 2 ** 96
}
// quantidades de token0/token1 de uma posição concentrada (fórmulas oficiais Uniswap V3)
function amountsFromLiquidity(liquidity: number, sqrtP: number, sqrtA: number, sqrtB: number): { amount0: number; amount1: number } {
  const Q96 = 2 ** 96
  let amount0 = 0, amount1 = 0
  if (sqrtP <= sqrtA) {
    amount0 = liquidity * (sqrtB - sqrtA) / (sqrtA * sqrtB / Q96)
  } else if (sqrtP < sqrtB) {
    amount0 = liquidity * (sqrtB - sqrtP) / (sqrtP * sqrtB / Q96)
    amount1 = liquidity * (sqrtP - sqrtA) / Q96
  } else {
    amount1 = liquidity * (sqrtB - sqrtA) / Q96
  }
  return { amount0, amount1 }
}

export async function GET(request: Request) {
  const u = new URL(request.url)
  const network = (u.searchParams.get('network') || 'base').toLowerCase()
  const id = u.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })
  const rpc = RPC[network], npm = NPM[network], factory = FACTORY[network]
  if (!rpc || !npm || !factory) return NextResponse.json({ error: 'network not supported' }, { status: 400 })

  const posRes = await rpcCall(rpc, npm, SEL_POSITIONS + BigInt(id).toString(16).padStart(64, '0'))
  if (!posRes || posRes === '0x') return NextResponse.json({ error: 'position not found' }, { status: 404 })

  try {
    const token0 = addrFromWord(posRes, 2)
    const token1 = addrFromWord(posRes, 3)
    const fee = Number(word(posRes, 4))
    const tickLower = Number(wordSigned(posRes, 5))
    const tickUpper = Number(wordSigned(posRes, 6))
    const liquidity = Number(word(posRes, 7))
    const owed0 = word(posRes, 10)
    const owed1 = word(posRes, 11)

    const t0 = TOKENS[token0], t1 = TOKENS[token1]
    if (!t0 || !t1) return NextResponse.json({ error: 'token desconhecido', token0, token1 }, { status: 422 })

    // pool + slot0 (sqrtPriceX96 atual)
    let sqrtP = 0, ratio_t1_per_t0: number | null = null
    const poolRes = await rpcCall(rpc, factory, SEL_GETPOOL + pad(token0) + pad(token1) + feeHex(fee))
    if (poolRes && poolRes !== '0x') {
      const pool = addrFromWord(poolRes, 0)
      const slot0 = await rpcCall(rpc, pool, SEL_SLOT0)
      if (slot0 && slot0 !== '0x') {
        sqrtP = Number(word(slot0, 0))
        const sp = sqrtP / 2 ** 96
        ratio_t1_per_t0 = sp * sp * 10 ** t0.decimals / 10 ** t1.decimals
      }
    }

    const origin = u.origin
    const px = await usdPrices([t0.cg, t1.cg], origin)

    // taxas não coletadas
    const fee0 = Number(owed0) / 10 ** t0.decimals
    const fee1 = Number(owed1) / 10 ** t1.decimals
    const fees = fee0 * (px[t0.cg] || 0) + fee1 * (px[t1.cg] || 0)

    // valor atual da posição (amount0/amount1 dentro do range)
    let current_value: number | null = null
    if (sqrtP > 0 && liquidity > 0) {
      const sqrtA = sqrtPriceX96FromTick(tickLower)
      const sqrtB = sqrtPriceX96FromTick(tickUpper)
      const { amount0, amount1 } = amountsFromLiquidity(liquidity, sqrtP, sqrtA, sqrtB)
      const amt0 = amount0 / 10 ** t0.decimals
      const amt1 = amount1 / 10 ** t1.decimals
      current_value = amt0 * (px[t0.cg] || 0) + amt1 * (px[t1.cg] || 0)
    }

    const ratio_t0_per_t1 = ratio_t1_per_t0 && ratio_t1_per_t0 > 0 ? 1 / ratio_t1_per_t0 : null

    return NextResponse.json({
      ok: true,
      fees: Math.round(fees * 100) / 100,
      current_value: current_value != null ? Math.round(current_value * 100) / 100 : null,
      token0: t0.symbol, token1: t1.symbol,
      ratio_t1_per_t0, ratio_t0_per_t1,
      note: 'saldo e taxas calculados on-chain a preco de mercado',
    })
  } catch {
    return NextResponse.json({ error: 'decode failed' }, { status: 500 })
  }
}
