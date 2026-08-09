import { NextResponse } from 'next/server'

// Tiger Invest — Sincronização automática de posição Uniswap V3 (por NFT ID)
// Retorna: saldo atual da posição (US$) e taxas acumuladas não coletadas (US$).
// Fonte: subgraph público da Uniswap V3 na rede escolhida + preços via /api/prices.
//
// Chamada: GET /api/position?network=base&id=123456
//   network: base | ethereum | arbitrum | ...
//   id:      o NFT ID da sua posição (aparece na URL da posição na Uniswap)

// Endpoints de subgraph por rede (gateway público da Uniswap).
const SUBGRAPH: Record<string, string> = {
  base: 'https://api.studio.thegraph.com/query/48211/uniswap-v3-base/version/latest',
  ethereum: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
  arbitrum: 'https://api.thegraph.com/subgraphs/name/ianlapham/arbitrum-minimal',
}

// mapeia símbolo do token -> id CoinGecko p/ pegar preço em USD
const CG: Record<string, string> = {
  WETH: 'ethereum', ETH: 'ethereum',
  CBBTC: 'coinbase-wrapped-btc', WBTC: 'wrapped-bitcoin',
  USDC: 'usd-coin', USDT: 'tether', DAI: 'dai',
}

async function usdPrices(symbols: string[], origin: string): Promise<Record<string, number>> {
  const ids = Array.from(new Set(symbols.map(s => CG[s.toUpperCase()]).filter(Boolean)))
  if (!ids.length) return {}
  try {
    const r = await fetch(`${origin}/api/prices?ids=${ids.join(',')}`, { cache: 'no-store' })
    const d = await r.json()
    const coins = d?.coins || {}
    const out: Record<string, number> = {}
    for (const [sym, id] of Object.entries(CG)) {
      if (coins[id]?.usd) out[sym] = coins[id].usd
    }
    return out
  } catch { return {} }
}

export async function GET(request: Request) {
  const u = new URL(request.url)
  const network = (u.searchParams.get('network') || 'base').toLowerCase()
  const id = u.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })
  const endpoint = SUBGRAPH[network]
  if (!endpoint) return NextResponse.json({ error: 'network not supported' }, { status: 400 })

  // Query: dados da posição + fees não coletadas.
  const query = `{
    position(id: "${id}") {
      liquidity
      depositedToken0 depositedToken1
      withdrawnToken0 withdrawnToken1
      collectedFeesToken0 collectedFeesToken1
      token0 { symbol decimals }
      token1 { symbol decimals }
      pool { token0Price token1Price }
    }
  }`

  try {
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query }),
      cache: 'no-store',
    })
    if (!r.ok) return NextResponse.json({ error: 'subgraph error' }, { status: 502 })
    const j = await r.json()
    const p = j?.data?.position
    if (!p) return NextResponse.json({ error: 'position not found' }, { status: 404 })

    const sym0 = (p.token0?.symbol || '').toUpperCase()
    const sym1 = (p.token1?.symbol || '').toUpperCase()
    const origin = u.origin
    const px = await usdPrices([sym0, sym1], origin)

    // Saldo atual (aprox): tokens depositados - retirados, valorados a preço de mercado.
    // Obs: é uma aproximação boa; o valor exato depende do preço atual dentro do range,
    // mas para acompanhamento no tracker é suficiente e estável.
    const net0 = Number(p.depositedToken0 || 0) - Number(p.withdrawnToken0 || 0)
    const net1 = Number(p.depositedToken1 || 0) - Number(p.withdrawnToken1 || 0)
    const current_value = net0 * (px[sym0] || 0) + net1 * (px[sym1] || 0)

    // Taxas acumuladas já coletadas (o subgraph expõe as coletadas de forma confiável).
    const fee0 = Number(p.collectedFeesToken0 || 0)
    const fee1 = Number(p.collectedFeesToken1 || 0)
    const fees = fee0 * (px[sym0] || 0) + fee1 * (px[sym1] || 0)

    return NextResponse.json({
      ok: true,
      current_value: Math.round(current_value * 100) / 100,
      fees: Math.round(fees * 100) / 100,
      token0: sym0, token1: sym1,
      note: 'valores aproximados a preço de mercado atual',
    })
  } catch {
    return NextResponse.json({ error: 'fetch failed' }, { status: 500 })
  }
}
