import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Redes suportadas (mesmo mapa do radar)
const POOL_NETWORKS: Record<string, string> = {
  eth: 'eth', solana: 'solana', base: 'base', bsc: 'bsc', arbitrum: 'arbitrum', polygon: 'polygon_pos',
}

const STABLE = new Set(['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FDUSD', 'USDE', 'USDS', 'PYUSD', 'USDD', 'GUSD', 'FRAX', 'LUSD', 'USDBC', 'CRVUSD', 'GHO'])
const GOLD = new Set(['PAXG', 'XAUT', 'KAU', 'XAUT0'])
// "blue-chip" voláteis (majors) — pares entre eles tendem a ser correlacionados (IL menor)
const BLUE = new Set(['ETH', 'WETH', 'STETH', 'WSTETH', 'WEETH', 'RETH', 'CBETH', 'BTC', 'WBTC', 'CBBTC', 'TBTC', 'SOL', 'WSOL', 'BNB', 'WBNB', 'MATIC', 'WMATIC', 'ARB', 'OP', 'AVAX', 'WAVAX', 'LINK'])

type Tier = 'stable' | 'gold' | 'vol-vol' | 'vol-stable' | 'other'

// Classifica o par e estima o risco de impermanent loss a partir da composição.
function classify(name: string): { tier: Tier; il: string; ilLevel: number } {
  const parts = (name || '').toUpperCase().split('/').map(s => s.trim().split(/\s+/)[0]).filter(Boolean)
  const a = parts[0] || '', b = parts[1] || ''
  const stA = STABLE.has(a), stB = STABLE.has(b)
  const goA = GOLD.has(a), goB = GOLD.has(b)
  const blA = BLUE.has(a), blB = BLUE.has(b)

  if (stA && stB) return { tier: 'stable', il: 'Mínimo', ilLevel: 1 }
  if ((goA && stB) || (goB && stA)) return { tier: 'gold', il: 'Baixo', ilLevel: 2 }
  // majors correlacionados entre si (ex.: WBTC/ETH) — andam juntos, IL menor que vs. stable
  if (blA && blB) return { tier: 'vol-vol', il: 'Médio', ilLevel: 3 }
  if ((blA && stB) || (blB && stA)) return { tier: 'vol-stable', il: 'Médio-Alto', ilLevel: 3 }
  return { tier: 'other', il: 'Alto', ilLevel: 4 }
}

// Fator que penaliza IL alto no score (tração boa vale menos se o IL come o lucro).
const IL_FACTOR: Record<number, number> = { 1: 1.0, 2: 0.92, 3: 0.72, 4: 0.4 }

const VERDICT: Record<Tier, { tone: 'buy' | 'neutral' | 'sell'; txt: string }> = {
  stable: { tone: 'buy', txt: 'Estável/estável — IL mínimo. Base conservadora; o retorno vem de taxa e incentivos.' },
  gold: { tone: 'neutral', txt: 'Ouro tokenizado/dólar — IL baixo, mas ouro é volátil: uma alta forte gera perda impermanente.' },
  'vol-vol': { tone: 'neutral', txt: 'Cripto/cripto correlacionado — IL médio; boa geração de taxa quando os dois andam juntos.' },
  'vol-stable': { tone: 'neutral', txt: 'Volátil/estável — mais taxa, porém IL relevante em tendência forte do ativo.' },
  other: { tone: 'sell', txt: 'Contém ativo fora do blue-chip — IL e risco de token elevados. Cheque contrato e liquidez.' },
}

async function gecko(url: string) {
  const r = await fetch(url, { next: { revalidate: 300 }, headers: { accept: 'application/json' } })
  if (!r.ok) return null
  return await r.json()
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const netKey = (url.searchParams.get('net') || 'eth').toLowerCase()
  const network = POOL_NETWORKS[netKey] ?? 'eth'

  // Piso de TVL por rede: mainnet exige mais folga; L2/alt um pouco menos.
  const floor = network === 'eth' ? 800_000 : 300_000

  try {
    // Top pools por volume 24h na rede (fallback: trending, se o sort não vier).
    let d = await gecko(`https://api.geckoterminal.com/api/v2/networks/${network}/pools?page=1&sort=h24_volume_usd_desc`)
    if (!d?.data?.length) d = await gecko(`https://api.geckoterminal.com/api/v2/networks/${network}/trending_pools?page=1`)

    const raw = (d?.data || []).map((p: any) => {
      const at = p.attributes || {}
      const net = (p.id || '').split('_')[0]
      const tvl = parseFloat(at.reserve_in_usd || '0')
      const vol24 = parseFloat(at?.volume_usd?.h24 || '0')
      const ch24 = parseFloat(at?.price_change_percentage?.h24 || '0')
      const name = at.name || ''
      const c = classify(name)
      const volTvl = tvl > 0 ? vol24 / tvl : 0
      const tracao = volTvl >= 0.3 ? 'Alta' : volTvl >= 0.1 ? 'Média' : 'Baixa'
      const score = volTvl * (IL_FACTOR[c.ilLevel] ?? 0.4)
      // "Destaque": tração real com IL controlado, OU tração muito alta que paga um IL médio.
      // É o cruzamento risco/retorno que vale a pena entrar.
      const highlight = (volTvl >= 0.25 && c.ilLevel <= 2) || (volTvl >= 0.5 && c.ilLevel <= 3)
      const v = VERDICT[c.tier]
      return { name, network: net, tvl, vol24, ch24, volTvl, tracao, score, highlight, verdict: v.txt, verdictTone: v.tone, ...c }
    })
      // qualidade: TVL com folga, sem candidatos absurdamente descolados
      .filter((x: any) => x.tvl >= floor && Math.abs(x.ch24) < 60 && x.tier !== 'other' && x.volTvl > 0)
      // um por par (evita 3 versões da mesma pool)
      .filter((x: any, i: number, arr: any[]) => arr.findIndex((y: any) => y.name.toUpperCase() === x.name.toUpperCase()) === i)
      .sort((x: any, y: any) => (Number(y.highlight) - Number(x.highlight)) || (y.score - x.score))
      .slice(0, 10)

    return NextResponse.json({ net: netKey, ideas: raw })
  } catch {
    return NextResponse.json({ net: netKey, ideas: [] })
  }
}
