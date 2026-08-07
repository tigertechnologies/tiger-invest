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

// endereço do token a partir do id do GeckoTerminal ("base_0xABC..." -> "0xABC...")
function tokenAddr(rel: any): string {
  const id = rel?.data?.id || ''
  const i = id.indexOf('_')
  return i >= 0 ? id.slice(i + 1) : id
}

// slug da rede no app da Uniswap
const UNI_CHAIN: Record<string, string> = { eth: 'ethereum', base: 'base', arbitrum: 'arbitrum', polygon_pos: 'polygon', bsc: 'bnb', avalanche: 'avalanche', optimism: 'optimism' }

// Link DIRETO pro local de adicionar liquidez no próprio DEX (não pro GeckoTerminal).
// Uniswap: página da pool específica (tem "Add liquidity"). Outros: fluxo de depósito por token.
// Onde não dá pra montar link específico confiável, retorna null (a UI cai no gráfico).
function dexLink(dexId: string, network: string, address: string, t0: string, t1: string): string | null {
  const d = (dexId || '').toLowerCase()
  const uni = UNI_CHAIN[network]
  if (d.includes('uniswap') && uni && address) return `https://app.uniswap.org/explore/pools/${uni}/${address}`
  if (d.includes('uniswap') && uni && t0 && t1) return `https://app.uniswap.org/#/add/${t0}/${t1}?chain=${uni}`
  if (d.includes('pancake') && t0 && t1) return `https://pancakeswap.finance/add/${t0}/${t1}`
  if (d.includes('aerodrome') && t0 && t1) return `https://aerodrome.finance/deposit?token0=${t0}&token1=${t1}`
  if (d.includes('velodrome') && t0 && t1) return `https://velodrome.finance/deposit?token0=${t0}&token1=${t1}`
  if (d.includes('sushi')) return 'https://www.sushi.com/pool'
  if (d.includes('curve')) return 'https://curve.finance/#/'
  if (d.includes('balancer')) return 'https://balancer.fi/pools'
  if (d.includes('raydium')) return 'https://raydium.io/liquidity-pools/'
  if (d.includes('orca')) return 'https://www.orca.so/pools'
  if (d.includes('meteora')) return 'https://app.meteora.ag/'
  return null
}

// Pool concentrada (v3/v4/Slipstream/Algebra/CLMM) exige gestão de faixa;
// passiva (v2/vAMM/sAMM/stable) é "deixa rodar". Detecta pelo id do DEX.
function isConcentrated(dexId: string): boolean {
  const d = (dexId || '').toLowerCase()
  return /(^|[-_])(v3|v4|cl|clmm)([-_]|$)/.test(d) || /slipstream|algebra|concentrat|pancakeswap-v3|pancakeswap-v4/.test(d)
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
    const rel = p.relationships || {}
    const t0 = tokenAddr(rel.base_token), t1 = tokenAddr(rel.quote_token)
    const dexUrl = dexLink(dexId, network, address, t0, t1)
    const gtUrl = address ? `https://www.geckoterminal.com/${network}/pools/${address}` : null
    const concentrated = isConcentrated(dexId)

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
    // Guarda: par com altcoin (IL altíssimo) NÃO recebe "ENTRAR". Um APR anualizado de
    // pico de volume engana — e o IL é severo se a altcoin cair. Vira oportunista, não entrada.
    if (c.ilLevel >= 4 && label === 'ENTRAR') {
      label = 'AVALIAR'; tone = 'neutral'
      reasons.push('⚠ APR alto em par com altcoin costuma ser pico de volume passageiro, e o IL é severo se o alt cair — trate como oportunista, não como entrada segura.')
    }
    if (concentrated) reasons.push('Pool concentrada (v3): exige gestão de faixa — fora do range para de render taxa e o IL trava no ativo mais fraco.')

    const score = (feeApr != null ? feeApr / hurdle : volTvl * (IL_FACTOR[c.ilLevel] ?? 0.4))
    const highlight = label === 'ENTRAR'

    return {
      name, dex, network: net, gtUrl, dexUrl, concentrated, poolType: concentrated ? 'Concentrada' : 'Passiva', tvl, vol24, ch24, volTvl, tracao,
      feeApr: feeApr != null ? Math.round(feeApr) : null,
      il: c.il, ilLevel: c.ilLevel, tier: c.tier,
      verdictLabel: label, verdictTone: tone, verdict: reasons.join(' '), highlight, score, _floor: floor,
    }
  }).filter((x: any) => x.tvl >= x._floor && Math.abs(x.ch24) < 70 && x.tier !== 'other' && x.volTvl > 0.02)
}

const ALL_NETS = ['eth', 'base', 'arbitrum', 'solana', 'bsc', 'polygon']

// ---------- FONTE PRIMÁRIA: DefiLlama Yields (APR base/emissões e IL MEDIDOS) ----------
const LLAMA_CHAIN: Record<string, string> = { eth: 'Ethereum', base: 'Base', arbitrum: 'Arbitrum', solana: 'Solana', bsc: 'BSC', polygon: 'Polygon' }
const CHAIN_TO_NET: Record<string, string> = { Ethereum: 'eth', Base: 'base', Arbitrum: 'arbitrum', Solana: 'solana', BSC: 'bsc', Polygon: 'polygon' }
// só DEXs AMM (fora lending/staking)
const DEX_PROJECTS = ['uniswap', 'aerodrome', 'pancakeswap', 'curve', 'balancer', 'sushiswap', 'velodrome', 'raydium', 'orca', 'camelot', 'quickswap', 'ramses', 'thena', 'trader-joe', 'meteora', 'maverick', 'fluid', 'shadow']
const nnum = (v: any) => { const f = parseFloat(v); return isFinite(f) ? f : 0 }
const abbrUsd = (n: number) => { const a = Math.abs(n); return '$' + (a >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : a >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : a >= 1e3 ? (n / 1e3).toFixed(0) + 'K' : n.toFixed(0)) }

let llamaCache: { at: number; data: any[] } | null = null
async function llamaPools(): Promise<any[]> {
  if (llamaCache && Date.now() - llamaCache.at < 600_000) return llamaCache.data
  try {
    const r = await fetch('https://yields.llama.fi/pools', { next: { revalidate: 600 }, headers: { accept: 'application/json' } })
    if (!r.ok) return llamaCache?.data || []
    const j = await r.json()
    const data = Array.isArray(j?.data) ? j.data : []
    if (data.length) llamaCache = { at: Date.now(), data }
    return data
  } catch { return llamaCache?.data || [] }
}

function buildFromLlama(all: any[], netKey: string): any[] {
  const wantChains = netKey === 'all' ? new Set(Object.values(LLAMA_CHAIN)) : new Set([LLAMA_CHAIN[netKey]])
  const out: any[] = []
  for (const x of all) {
    const chain = x?.chain
    if (!wantChains.has(chain)) continue
    const project = String(x?.project || '')
    if (!DEX_PROJECTS.some(p => project.includes(p))) continue
    const symbol = String(x?.symbol || '')
    const toks = symbol.split(/[-\/]/).map(s => s.trim()).filter(Boolean)
    if (toks.length !== 2) continue                      // só pares de 2 ativos
    if (String(x?.exposure || 'multi') === 'single') continue

    const net = CHAIN_TO_NET[chain] || 'eth'
    const floor = net === 'eth' ? 400_000 : 150_000
    const tvl = nnum(x.tvlUsd)
    if (tvl < floor) continue

    const nameForClass = toks.join('/')
    const c = classify(nameForClass)
    if (c.tier === 'other') continue

    const feeApr = nnum(x.apyBase) || (x.apyReward == null ? nnum(x.apy) : 0)   // taxa de swap (sustentável)
    const rewardApr = nnum(x.apyReward)                                          // emissões (com risco do token)
    const vol24 = nnum(x.volumeUsd1d)
    const il7d = x.il7d != null ? nnum(x.il7d) : null                            // IL medido em 7d (%)
    const apyBase7d = x.apyBase7d != null ? nnum(x.apyBase7d) : null

    // custo anual estimado do IL: se há IL medido em 7d, anualiza (regime constante); senão, usa o piso da categoria
    const ilDrag = il7d != null ? Math.min(Math.abs(il7d) * (365 / 7), 400) : TIER_HURDLE[c.tier]
    const netApr = feeApr - ilDrag                                              // <<< APR LÍQUIDO (taxa − IL) = métrica principal

    const dexId = project
    const dex = prettyDex(project, '')
    const concentrated = isConcentrated(project)
    const us = Array.isArray(x.underlyingTokens) ? x.underlyingTokens : []
    const t0 = String(us[0] || ''), t1 = String(us[1] || '')
    const dexUrl = dexLink(dexId, net, '', t0, t1)
    const dataUrl = x.pool ? `https://defillama.com/yields/pool/${x.pool}` : null

    const tvlDeep = tvl >= 1_000_000
    const sustainable = apyBase7d != null ? feeApr <= 1.6 * Math.max(apyBase7d, 0.01) : true
    const maxEntry = tvl * 0.015
    const daysToCoverIL = (il7d != null && feeApr > 0) ? Math.ceil(Math.abs(il7d) / (feeApr / 365)) : null

    // ---- veredito por APR LÍQUIDO ----
    let label = 'AVALIAR', tone: 'buy' | 'neutral' | 'sell' = 'neutral'
    if (netApr <= 0) { label = 'POUCO ATRATIVO'; tone = 'sell' }
    else if (netApr >= 12 && tvlDeep && sustainable && c.ilLevel <= 3) { label = 'ENTRAR'; tone = 'buy' }
    else { label = 'AVALIAR'; tone = 'neutral' }
    if (c.ilLevel >= 4 && label === 'ENTRAR') { label = 'AVALIAR'; tone = 'neutral' }
    if (!sustainable && label === 'ENTRAR') { label = 'AVALIAR'; tone = 'neutral' }

    const reasons: string[] = []
    reasons.push(`APR líquido est. ${netApr >= 0 ? '+' : ''}${netApr.toFixed(0)}%/ano — taxa ${feeApr.toFixed(0)}% menos IL ${il7d != null ? '~' + ilDrag.toFixed(0) + '% (medido 7d)' : '~' + ilDrag.toFixed(0) + '% (est. categoria)'}.`)
    if (rewardApr > 0.5) reasons.push(`+ ${rewardApr.toFixed(0)}% em emissões (some se o incentivo parar; o token de reward tem risco próprio).`)
    if (daysToCoverIL != null) reasons.push(`A taxa cobre o IL de 7d em ~${daysToCoverIL} dias.`)
    reasons.push(`Aporte saudável ≤ ${abbrUsd(maxEntry)} (~1,5% do TVL) p/ evitar slippage.`)
    if (!sustainable) reasons.push(`⚠ Taxa bem acima da média de 7d — pico recente, pode não se sustentar.`)
    if (c.ilLevel >= 4) reasons.push(`⚠ Par com altcoin: IL severo se o alt cair. Oportunista, não entrada segura.`)
    if (concentrated) reasons.push(`Pool concentrada: exige gestão de faixa — fora do range para de render e o IL trava.`)

    const score = netApr + Math.min(rewardApr, 60) * 0.3
    out.push({
      name: toks.join(' / '), dex, network: net, dexUrl, dataUrl, concentrated, poolType: concentrated ? 'Concentrada' : 'Passiva',
      tvl, vol24, feeApr: Math.round(feeApr), rewardApr: Math.round(rewardApr), netApr: Math.round(netApr),
      il: c.il, ilLevel: c.ilLevel, tier: c.tier, sustainable, maxEntry, daysToCoverIL,
      verdictLabel: label, verdictTone: tone, verdict: reasons.join(' '), highlight: label === 'ENTRAR', score, source: 'llama',
    })
  }
  return out
}

function rankAll(list: any[], limit: number): any[] {
  // dedup por par (melhor rede/instância) e ordena por destaque + score (APR líquido)
  const best: Record<string, any> = {}
  for (const x of list) {
    const key = (x.name || '').toUpperCase().replace(/\s*\d+(?:\.\d+)?%\s*/g, ' ').trim()
    if (!best[key] || x.score > best[key].score) best[key] = x
  }
  return Object.values(best).sort((a: any, b: any) => (Number(b.highlight) - Number(a.highlight)) || (b.score - a.score)).slice(0, limit)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const netKey = (url.searchParams.get('net') || 'all').toLowerCase()

  try {
    // 1) PRIMÁRIO: DefiLlama (APR base/emissões e IL medidos)
    const all = await llamaPools()
    let ideas = buildFromLlama(all, netKey)
    if (ideas.length) return NextResponse.json({ net: netKey, ideas: rankAll(ideas, netKey === 'all' ? 15 : 10) })

    // 2) FALLBACK: GeckoTerminal (mantém a feature no ar se a DefiLlama falhar)
    if (netKey === 'all') {
      const perNet = await Promise.all(ALL_NETS.map(n => buildForNetwork(n).catch(() => [])))
      return NextResponse.json({ net: 'all', ideas: rankAll(perNet.flat(), 15) })
    }
    const gt = (await buildForNetwork(netKey))
      .filter((x: any, i: number, arr: any[]) => arr.findIndex((y: any) => y.name.toUpperCase() === x.name.toUpperCase()) === i)
      .sort((x: any, y: any) => (Number(y.highlight) - Number(x.highlight)) || (y.score - x.score))
      .slice(0, 10)
    return NextResponse.json({ net: netKey, ideas: gt })
  } catch {
    return NextResponse.json({ net: netKey, ideas: [] })
  }
}
