import { NextResponse } from 'next/server'

// Tiger Invest — Sincronização de posição Uniswap V3 (por NFT ID)
// SEM subgraph e SEM API key: lê direto dos contratos via RPC público.
// Retorna: taxas não coletadas (US$) + preço atual da razão token1/token0
// (ex.: cbBTC/WETH) lido do slot0 da pool, para status de range NATIVO.
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

// UniswapV3Factory por rede (para achar o endereço da pool)
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

// preço token1/token0 a partir do sqrtPriceX96 (ajustado por decimais)
function priceFromSqrt(sqrtX96: bigint, dec0: number, dec1: number): number {
  // price(token1 per token0) = (sqrtP/2^96)^2 * 10^dec0 / 10^dec1
  const sp = Number(sqrtX96) / 2 ** 96
  const raw = sp * sp
  return raw * 10 ** dec0 / 10 ** dec1
}

export async function GET(request: Request) {
  const u = new URL(request.url)
  const network = (u.searchParams.get('network') || 'base').toLowerCase()
  const id = u.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })
  const rpc = RPC[network], npm = NPM[network], factory = FACTORY[network]
  if (!rpc || !npm || !factory) return NextResponse.json({ error: 'network not supported' }, { status: 400 })

  // 1) positions(id)
  const posRes = await rpcCall(rpc, npm, SEL_POSITIONS + BigInt(id).toString(16).padStart(64, '0'))
  if (!posRes || posRes === '0x') return NextResponse.json({ error: 'position not found' }, { status: 404 })

  try {
    const token0 = addrFromWord(posRes, 2)
    const token1 = addrFromWord(posRes, 3)
    const fee = Number(word(posRes, 4))
    const owed0 = word(posRes, 10)
    const owed1 = word(posRes, 11)

    const t0 = TOKENS[token0], t1 = TOKENS[token1]
    if (!t0 || !t1) return NextResponse.json({ error: 'token desconhecido', token0, token1 }, { status: 422 })

    // 2) getPool(token0, token1, fee) -> endereço da pool
    const poolRes = await rpcCall(rpc, factory, SEL_GETPOOL + pad(token0) + pad(token1) + feeHex(fee))
    let ratio: number | null = null // preço token1 por token0 (ex.: WETH por cbBTC) -> invertendo dá cbBTC/WETH
    if (poolRes && poolRes !== '0x') {
      const pool = addrFromWord(poolRes, 0)
      // 3) slot0() -> sqrtPriceX96 (primeiro word)
      const slot0 = await rpcCall(rpc, pool, SEL_SLOT0)
      if (slot0 && slot0 !== '0x') {
        const sqrtP = word(slot0, 0)
        // price = token1 per token0
        const p1per0 = priceFromSqrt(sqrtP, t0.decimals, t1.decimals)
        // queremos a MESMA unidade que a Uniswap/Revert mostram: cbBTC/WETH
        // token0/token1 dependem da ordenação; devolvemos ambos e um "display" p/ par1
        ratio = p1per0 // token1 por token0
      }
    }

    const origin = u.origin
    const px = await usdPrices([t0.cg, t1.cg], origin)
    const fee0 = Number(owed0) / 10 ** t0.decimals
    const fee1 = Number(owed1) / 10 ** t1.decimals
    const fees = fee0 * (px[t0.cg] || 0) + fee1 * (px[t1.cg] || 0)

    // preço "cbBTC/WETH" = quantos cbBTC por 1 WETH.
    // Na Base, token0 costuma ser cbBTC e token1 WETH (ordem por endereço).
    // ratio = token1/token0. Para exibir como a Uniswap (cbBTC por WETH),
    // calculamos os dois e mandamos o inverso também.
    const ratio_t1_per_t0 = ratio
    const ratio_t0_per_t1 = ratio && ratio > 0 ? 1 / ratio : null

    return NextResponse.json({
      ok: true,
      fees: Math.round(fees * 100) / 100,
      token0: t0.symbol, token1: t1.symbol,
      ratio_t1_per_t0, // ex.: WETH por cbBTC
      ratio_t0_per_t1, // ex.: cbBTC por WETH  <-- normalmente é este que bate com a Uniswap
      note: 'fees=tokensOwed em US$; ratios lidos do slot0 da pool',
    })
  } catch {
    return NextResponse.json({ error: 'decode failed' }, { status: 500 })
  }
}
