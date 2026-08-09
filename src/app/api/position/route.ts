import { NextResponse } from 'next/server'

// Tiger Invest — Sincronização de posição Uniswap V3 (por NFT ID)
// SEM subgraph e SEM API key: lê direto do contrato NonfungiblePositionManager
// via RPC público da rede. Retorna as TAXAS não coletadas (tokensOwed) em US$.
//
// GET /api/position?network=base&id=5748476

const RPC: Record<string, string> = {
  base: 'https://mainnet.base.org',
  ethereum: 'https://eth.llamarpc.com',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
}

// NonfungiblePositionManager por rede
const NPM: Record<string, string> = {
  base: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
  ethereum: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
  arbitrum: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
}

// selector positions(uint256) = 0x99fbab88
const POSITIONS_SELECTOR = '0x99fbab88'

// tokens conhecidos na Base: address(lowercase) -> { symbol, decimals, cg }
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
  const clean = hex.replace(/^0x/, '')
  const slice = clean.slice(i * 64, i * 64 + 64)
  return slice ? BigInt('0x' + slice) : 0n
}
function addrFromWord(hex: string, i: number): string {
  const clean = hex.replace(/^0x/, '')
  const slice = clean.slice(i * 64, i * 64 + 64)
  return ('0x' + slice.slice(24)).toLowerCase()
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

export async function GET(request: Request) {
  const u = new URL(request.url)
  const network = (u.searchParams.get('network') || 'base').toLowerCase()
  const id = u.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })
  const rpc = RPC[network], npm = NPM[network]
  if (!rpc || !npm) return NextResponse.json({ error: 'network not supported' }, { status: 400 })

  const idHex = BigInt(id).toString(16).padStart(64, '0')
  const data = POSITIONS_SELECTOR + idHex

  const res = await rpcCall(rpc, npm, data)
  if (!res || res === '0x') return NextResponse.json({ error: 'position not found' }, { status: 404 })

  // layout positions(): 2 token0 | 3 token1 | 10 tokensOwed0 | 11 tokensOwed1
  try {
    const token0 = addrFromWord(res, 2)
    const token1 = addrFromWord(res, 3)
    const owed0 = word(res, 10)
    const owed1 = word(res, 11)

    const t0 = TOKENS[token0]
    const t1 = TOKENS[token1]
    if (!t0 || !t1) {
      return NextResponse.json({ error: 'token desconhecido', token0, token1 }, { status: 422 })
    }

    const origin = u.origin
    const px = await usdPrices([t0.cg, t1.cg], origin)

    const fee0 = Number(owed0) / 10 ** t0.decimals
    const fee1 = Number(owed1) / 10 ** t1.decimals
    const fees = fee0 * (px[t0.cg] || 0) + fee1 * (px[t1.cg] || 0)

    return NextResponse.json({
      ok: true,
      fees: Math.round(fees * 100) / 100,
      token0: t0.symbol, token1: t1.symbol,
      raw: { owed0: owed0.toString(), owed1: owed1.toString() },
      note: 'taxas nao coletadas (tokensOwed) valoradas a preco de mercado',
    })
  } catch {
    return NextResponse.json({ error: 'decode failed' }, { status: 500 })
  }
}
