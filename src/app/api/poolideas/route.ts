import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Redes suportadas (mesmo mapa do radar) — chave -> slug GeckoTerminal
const POOL_NETWORKS: Record<string, string> = {
  eth: 'eth', solana: 'solana', base: 'base', bsc: 'bsc', arbitrum: 'arbitrum', polygon: 'polygon_pos',
}

const STABLE = new Set(['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FDUSD', 'USDE', 'USDS', 'PYUSD', 'USDD', 'GUSD', 'FRAX', 'LUSD', 'USDBC', 'CRVUSD', 'GHO', 'USDC.E'])
const GOLD = new Set(['PAXG', 'XAUT', 'KAU', 'XAUT0'])
// "blue-chip" voláteis (majors). Pares entre eles são correlacionados (IL menor).
const BLUE = new Set(['ETH', 'WETH', 'STETH', 'WSTETH', 'WEETH', 'RETH', 'CBETH', 'BTC', 'WBTC', 'CBBTC', 'TBTC', 'LBTC', 'SOL', 'WSOL', 'JITOSOL', 'BNB', 'WBNB', 'MATIC', 'WMATIC', 'POL', 'ARB', 'OP', 'AVAX', 'WAVAX', 'LINK'])

type Tier = 'stable' | 'gold' | 'vol-vol' | 'vol-stable' | 'alt-stable' | 'misto' | 'other'

// Classifica o par e estima o RISCO DE IL pela composição dos dois ativos.
function classify(name: string): { tier: Tier; il: string; ilLevel: number } {
  const parts = (name || '').toUpperCase().split('/').map(s => s.trim().split(/\s+/)[0]).filter(Boolean)
  const a = parts[0] || '', b = parts[1] || ''
  const stA = STABLE.has(a), stB = STABLE.has(b)
  const goA = GOLD.has(a), goB = GOLD.has(b)
  const blA = BLUE.has(a), blB = BLUE.has(b)

  if (stA && stB) return { tier: 'stable', il: 'Mínimo', ilLevel: 1 }
  if ((goA && stB) || (goB && stA)) return { tier: 'gold', il: 'Baixo', ilLevel: 2 }
  if (blA && blB) return { tier: 'vol-vol', il: 'Médio', ilLevel: 3 }        // majors correlacionados (WBTC/ETH)
  if ((blA && stB) || (blB && stA)) return { tier: 'vol-stable', il: 'Médio-Alto', ilLevel: 3 }
  if ((stA && !blB && !goB) || (stB && !blA && !goA)) return { tier: 'alt-stable', il: 'Alto', ilLevel: 4 } // alt/stable
  if (blA || blB || goA || goB) return { tier: 'misto', il: 'Alto', ilLevel: 4 }  // major + alt
  return { tier: 'other', il: 'Alto', ilLevel: 4 }
}

const IL_FACTOR: Record<number, number> = { 1: 1.0, 2: 0.92, 3: 0.72, 4: 0.45 }
// APR de taxa (%) que o par precisa gerar p/ "pagar" o IL. Base da leitura fundamentalista.
const TIER_HURDLE: Record<Tier, number> = { stable: 3, gold: 6, 'vol-vol': 10, 'vol-stable': 18, 'alt-stable': 30, misto: 30, other: 30 }
const TIER_DESC: Record<Tier, string> = {
  stable: 'estável/estável', gold: 'ouro/dólar', 'vol-vol': 'cripto/cripto correlacionado',
  'vol-stable': 'volátil/estável', 'alt-stable': 'altcoin/estável', misto: 'major/altcoin', other: 'fora do blue-chip',
}

// extrai a faixa de fee do nome ("cbBTC / WETH 0.009%") -> 0.009 (em %)
function feeFromName(name: string): number | null {
  const m = (name || '').match(/(\d+(?:\.\d+)?)\s*%/)
  if (!m) return null
  const f = parseFloat(m[1])
  return f > 0 && f < 5 ? f : null
}

// nome do DEX a partir do id do GeckoTerminal ("uniswap-v3-base" -> "Uniswap V3")
function prettyDex(id: string, netSlug: string): string {
  if (!id) return 'DEX'
  let s = id.replace(new RegExp(`[-_]${netSlug}$`), '').replace(/[-_]/g, ' ').trim()
  s = s.replace(/\bv(\d)\b/gi, 'V$1')
  return s.split(' ').map(w => /^V\d$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

async function gecko(url: string) {
  const r = await fetch(url, { next: { revalidate: 300 }, headers: { accept: 'application/json' } })
  if (!r.ok) return null
  return await r.json()
}

// Monta as ideias de UMA rede (sem cortar em 10 — o corte é feito por quem chama).
async function buildForNetwork(netKey: string): Promise<any[]> {
  const network = POOL_NETWORKS[netKey] ?? 'eth'
  const floor = network === 'eth' ? 400_000 : 150_000
  // 2 páginas de top pools por volume 24h (fallback: trending) -> mais candidatos p/ chegar em 10
  const urls = [
    `https://api.geckoterminal.com/api/v2/networks/${network}/pools?page=1&sort=h24_volume_usd_desc`,
    `https://api.geckoterminal.com/api/v2/networks/${network}/pools?page=2&sort=h24_volume_usd_desc`,
  ]
  let pages = await Promise.all(urls.map(u => gecko(u)))
  let data: any[] = pages.flatMap(p => p?.data || [])
  if (!data.length) { const t = await gecko(`https://api.geckoterminal.com/api/v2/networks/${network}/trending_pools?page=1`); data = t?.data || [] }

  return data.map((p: any) => {
    const at = p.attributes || {}
    const net = (p.id || '').split('_')[0] || netKey
    const tvl = parseFloat(at.reserve_in_usd || '0')
    const vol24 = parseFloat(at?.volume_usd?.h24 || '0')
    const ch24 = parseFloat(at?.price_change_percentage?.h24 || '0')
    const name = at.name || ''
    const address = at.address || (p.id || '').split('_').slice(1).join('_')
    const dexId = p?.relationships?.dex?.data?.id || ''
    const dex = prettyDex(dexId, network)
    const gtUrl = address ? `https://www.geckoterminal.com/${network}/pools/${address}` : null

    const c = classify(name)
    const volTvl = tvl > 0 ? vol24 / tvl : 0
    const tracao = volTvl >= 0.3 ? 'Alta' : volTvl >= 0.1 ? 'Média' : 'Baixa'

    // --- leitura fundamentalista ---
    const feePct = feeFromName(name)                          // faixa de fee do par (%)
    const feeApr = feePct != null && tvl > 0 ? (vol24 * (feePct / 100)) / tvl * 365 * 100 : null
    const hurdle = TIER_HURDLE[c.tier]                        // APR mínimo p/ pagar o IL
    const tvlDeep = tvl >= 1_000_000
    const churny = volTvl > 8                                 // giro anormalmente alto
    const volatile = Math.abs(ch24) > 15

    // veredito cruzando taxa x IL x profundidade x volatilidade
    let label = 'AVALIAR', tone: 'buy' | 'neutral' | 'sell' = 'neutral'
    const reasons: string[] = []
    if (feeApr == null) {
      label = 'AVALIAR'; tone = 'neutral'
      reasons.push(`Par ${TIER_DESC[c.tier]} (IL ${c.il.toLowerCase()}). Sem faixa de fee no nome — julgue pela tração: gira ${volTvl.toFixed(1)}× o TVL em 24h.`)
    } else {
      const ratio = feeApr / hurdle
      if (ratio >= 2 && tvlDeep && !volatile) { label = 'ENTRAR'; tone = 'buy' }
      else if (ratio >= 1) { label = 'AVALIAR'; tone = 'neutral' }
      else { label = 'POUCO ATRATIVO'; tone = 'sell' }
      reasons.push(`Taxa estimada ~${Math.round(feeApr)}%/ano ${ratio >= 1 ? 'cobre' : 'NÃO cobre'} o IL ${c.il.toLowerCase()} deste par ${TIER_DESC[c.tier]} (piso ~${hurdle}%).`)
    }
    if (!tvlDeep) reasons.push(`TVL de ${tvl >= 1e6 ? (tvl / 1e6).toFixed(1) + 'M' : (tvl / 1e3).toFixed(0) + 'K'} é modesto — entradas grandes sofrem slippage.`)
    if (churny) reasons.push(`Giro de ${volTvl.toFixed(1)}×/dia é muito alto — confirme se não é volatilidade extrema.`)
    if (volatile) reasons.push(`Preço variou ${ch24.toFixed(0)}% em 24h — IL elevado neste momento.`)

    const score = (feeApr != null ? feeApr / hurdle : volTvl * (IL_FACTOR[c.ilLevel] ?? 0.4))
    const highlight = label === 'ENTRAR'

    return {
      name, dex, network: net, gtUrl, tvl, vol24, ch24, volTvl, tracao,
      feeApr: feeApr != null ? Math.round(feeApr) : null,
      il: c.il, ilLevel: c.ilLevel, tier: c.tier,
      verdictLabel: label, verdictTone: tone, verdict: reasons.join(' '), highlight, score, _floor: floor,
    }
  }).filter((x: any) => x.tvl >= x._floor && Math.abs(x.ch24) < 70 && x.tier !== 'other' && x.volTvl > 0.02)
}

const ALL_NETS = ['eth', 'base', 'arbitrum', 'solana', 'bsc', 'polygon']

export async function GET(req: Request) {
  const url = new URL(req.url)
  const netKey = (url.searchParams.get('net') || 'all').toLowerCase()

  try {
    if (netKey === 'all') {
      // Ranking GLOBAL: junta todas as redes e mostra o melhor par de cada, na melhor rede dele.
      const perNet = await Promise.all(ALL_NETS.map(n => buildForNetwork(n).catch(() => [])))
      const merged: any[] = perNet.flat()
      // dedup por par (nome), mantendo a instância de MAIOR score (a melhor rede pra aquele par)
      const best: Record<string, any> = {}
      for (const x of merged) {
        const key = (x.name || '').toUpperCase().replace(/\s*\d+(?:\.\d+)?%\s*/g, ' ').trim()
        if (!best[key] || x.score > best[key].score) best[key] = x
      }
      const ideas = Object.values(best)
        .sort((a: any, b: any) => (Number(b.highlight) - Number(a.highlight)) || (b.score - a.score))
        .slice(0, 15)
      return NextResponse.json({ net: 'all', ideas })
    }

    const ideas = (await buildForNetwork(netKey))
      .filter((x: any, i: number, arr: any[]) => arr.findIndex((y: any) => y.name.toUpperCase() === x.name.toUpperCase()) === i)
      .sort((x: any, y: any) => (Number(y.highlight) - Number(x.highlight)) || (y.score - x.score))
      .slice(0, 10)
    return NextResponse.json({ net: netKey, ideas })
  } catch {
    return NextResponse.json({ net: netKey, ideas: [] })
  }
}
