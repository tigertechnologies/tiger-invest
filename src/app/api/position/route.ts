import { NextResponse } from 'next/server'

// Tiger Invest — Sincronização de posição Uniswap V3 (por NFT ID)
// SEM subgraph e SEM API key: lê direto dos contratos via RPC público.
// Retorna: taxas TOTAIS não coletadas (pendentes + materializadas) em US$,
// valor atual da posição (US$) e a razão de preço (p/ status de range).
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

const SEL_POSITIONS  = '0x99fbab88' // positions(uint256)
const SEL_GETPOOL    = '0x1698ee82' // getPool(address,address,uint24)
const SEL_SLOT0      = '0x3850c7bd' // slot0()
const SEL_FG0        = '0xf3058399' // feeGrowthGlobal0X128()
const SEL_FG1        = '0x46141319' // feeGrowthGlobal1X128()
const SEL_TICKS      = '0xf30dba93' // ticks(int24)

const TOKENS: Record<string, { symbol: string; decimals: number; cg: string }> = {
  '0x4200000000000000000000000000000000000006': { symbol: 'WETH', decimals: 18, cg: 'ethereum' },
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': { symbol: 'CBBTC', decimals: 8, cg: 'coinbase-wrapped-btc' },
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { symbol: 'USDC', decimals: 6, cg: 'usd-coin' },
  '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2': { symbol: 'USDT', decimals: 6, cg: 'tether' },
}

const Q128 = 1n << 128n
const Q256 = 1n << 256n

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
function wordSigned(hex: string, i: number): bigint {
  const v = word(hex, i); const max = 1n << 255n
  return v >= max ? v - Q256 : v
}
function addrFromWord(hex: string, i: number): string {
  const c = hex.replace(/^0x/, '')
  return ('0x' + c.slice(i * 64, i * 64 + 64).slice(24)).toLowerCase()
}
function pad(a: string): string { return a.replace(/^0x/, '').toLowerCase().padStart(64, '0') }
function u24(n: number): string {
  // int24 em complemento de dois, empacotado em 32 bytes
  const v = n < 0 ? (Q256 + BigInt(n)) : BigInt(n)
  return v.toString(16).padStart(64, '0')
}
// subtração modular em 256 bits (feeGrowth "wraps around" de propósito)
function subMod(a: bigint, b: bigint): bigint {
  const r = (a - b) % Q256
  return r < 0n ? r + Q256 : r
}

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

function sqrtPriceX96FromTick(tick: number): number { return Math.sqrt(Math.pow(1.0001, tick)) * 2 ** 96 }
function amountsFromLiquidity(L: number, sqrtP: number, sqrtA: number, sqrtB: number) {
  const Q96 = 2 ** 96; let a0 = 0, a1 = 0
  if (sqrtP <= sqrtA) { a0 = L * (sqrtB - sqrtA) / (sqrtA * sqrtB / Q96) }
  else if (sqrtP < sqrtB) { a0 = L * (sqrtB - sqrtP) / (sqrtP * sqrtB / Q96); a1 = L * (sqrtP - sqrtA) / Q96 }
  else { a1 = L * (sqrtB - sqrtA) / Q96 }
  return { a0, a1 }
}

// feeGrowthInside para um dos tokens, dada a posição do tick atual
function feeGrowthInside(
  tickCurrent: number, tickLower: number, tickUpper: number,
  fgGlobal: bigint, fgOutsideLower: bigint, fgOutsideUpper: bigint
): bigint {
  let below: bigint, above: bigint
  if (tickCurrent >= tickLower) below = fgOutsideLower
  else below = subMod(fgGlobal, fgOutsideLower)
  if (tickCurrent < tickUpper) above = fgOutsideUpper
  else above = subMod(fgGlobal, fgOutsideUpper)
  return subMod(subMod(fgGlobal, below), above)
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
    const liquidity = word(posRes, 7)
    const fgInside0Last = word(posRes, 8)
    const fgInside1Last = word(posRes, 9)
    const owed0 = word(posRes, 10)
    const owed1 = word(posRes, 11)

    const t0 = TOKENS[token0], t1 = TOKENS[token1]
    if (!t0 || !t1) return NextResponse.json({ error: 'token desconhecido', token0, token1 }, { status: 422 })

    // pool
    const poolRes = await rpcCall(rpc, factory, SEL_GETPOOL + pad(token0) + pad(token1) + fee.toString(16).padStart(64, '0'))
    if (!poolRes || poolRes === '0x') return NextResponse.json({ error: 'pool not found' }, { status: 404 })
    const pool = addrFromWord(poolRes, 0)

    // slot0 (sqrtPrice + tick atual), feeGrowthGlobal, e ticks(lower/upper)
    const [slot0, fg0Res, fg1Res, tickLowerRes, tickUpperRes] = await Promise.all([
      rpcCall(rpc, pool, SEL_SLOT0),
      rpcCall(rpc, pool, SEL_FG0),
      rpcCall(rpc, pool, SEL_FG1),
      rpcCall(rpc, pool, SEL_TICKS + u24(tickLower)),
      rpcCall(rpc, pool, SEL_TICKS + u24(tickUpper)),
    ])
    if (!slot0 || !fg0Res || !fg1Res || !tickLowerRes || !tickUpperRes) {
      return NextResponse.json({ error: 'leitura on-chain incompleta' }, { status: 502 })
    }

    const sqrtP = Number(word(slot0, 0))
    const tickCurrent = Number(wordSigned(slot0, 1))
    const fgGlobal0 = word(fg0Res, 0)
    const fgGlobal1 = word(fg1Res, 0)

    // ticks(): retorna (liquidityGross, liquidityNet, feeGrowthOutside0X128, feeGrowthOutside1X128, ...)
    // índices: 0 gross, 1 net, 2 fgOutside0, 3 fgOutside1
    const fgOut0Lower = word(tickLowerRes, 2)
    const fgOut1Lower = word(tickLowerRes, 3)
    const fgOut0Upper = word(tickUpperRes, 2)
    const fgOut1Upper = word(tickUpperRes, 3)

    // feeGrowthInside atual
    const fgInside0 = feeGrowthInside(tickCurrent, tickLower, tickUpper, fgGlobal0, fgOut0Lower, fgOut0Upper)
    const fgInside1 = feeGrowthInside(tickCurrent, tickLower, tickUpper, fgGlobal1, fgOut1Lower, fgOut1Upper)

    // taxas pendentes = liquidity * (fgInside - fgInsideLast) / 2^128  + owed
    const pending0 = (liquidity * subMod(fgInside0, fgInside0Last)) / Q128
    const pending1 = (liquidity * subMod(fgInside1, fgInside1Last)) / Q128
    const totalFee0 = pending0 + owed0
    const totalFee1 = pending1 + owed1

    const origin = u.origin
    const px = await usdPrices([t0.cg, t1.cg], origin)
    const f0 = Number(totalFee0) / 10 ** t0.decimals
    const f1 = Number(totalFee1) / 10 ** t1.decimals
    const fees = f0 * (px[t0.cg] || 0) + f1 * (px[t1.cg] || 0)

    // valor atual da posição
    let current_value: number | null = null
    if (sqrtP > 0 && liquidity > 0n) {
      const sqrtA = sqrtPriceX96FromTick(tickLower)
      const sqrtB = sqrtPriceX96FromTick(tickUpper)
      const { a0, a1 } = amountsFromLiquidity(Number(liquidity), sqrtP, sqrtA, sqrtB)
      const amt0 = a0 / 10 ** t0.decimals, amt1 = a1 / 10 ** t1.decimals
      current_value = amt0 * (px[t0.cg] || 0) + amt1 * (px[t1.cg] || 0)
    }

    const sp = sqrtP / 2 ** 96
    const ratio_t1_per_t0 = sp * sp * 10 ** t0.decimals / 10 ** t1.decimals
    const ratio_t0_per_t1 = ratio_t1_per_t0 > 0 ? 1 / ratio_t1_per_t0 : null

    return NextResponse.json({
      ok: true,
      fees: Math.round(fees * 100000) / 100000,
      current_value: current_value != null ? Math.round(current_value * 100) / 100 : null,
      token0: t0.symbol, token1: t1.symbol,
      ratio_t1_per_t0, ratio_t0_per_t1,
      note: 'taxas pendentes+materializadas e saldo calculados on-chain',
    })
  } catch {
    return NextResponse.json({ error: 'decode failed' }, { status: 500 })
  }
}
