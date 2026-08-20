import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

const j = async (url: string, revalidate = 900) => {
  try { const r = await fetch(url, { next: { revalidate }, headers: { accept: 'application/json' } }); return r.ok ? await r.json() : null } catch { return null }
}
const pctChange = (arr: number[], back: number) => {
  if (!arr.length) return null
  const last = arr[arr.length - 1], prev = arr[Math.max(0, arr.length - 1 - back)]
  return prev ? (last / prev - 1) * 100 : null
}

export async function GET() {
  const out: any = { regime: null, chains: [], stables: null, fng: null }

  // ---- 1) Regime / dominância (CoinGecko global + DefiLlama stablecoins) ----
  const [glob, stableList] = await Promise.all([
    j('https://api.coingecko.com/api/v3/global'),
    j('https://stablecoins.llama.fi/stablecoins?includePrices=false'),
  ])
  const g = glob?.data
  if (g?.market_cap_percentage) {
    const totalMcap = g.total_market_cap?.usd || 0
    const btc = g.market_cap_percentage.btc || 0
    const eth = g.market_cap_percentage.eth || 0
    let stableMcap = 0
    if (Array.isArray(stableList?.peggedAssets)) stableMcap = stableList.peggedAssets.reduce((s: number, p: any) => s + (p.circulating?.peggedUSD || 0), 0)
    const stableDom = totalMcap ? stableMcap / totalMcap * 100 : 0
    const alt = Math.max(0, 100 - btc - eth - stableDom)
    out.regime = { totalMcap, btc, eth, stableDom, alt, mcapChange24h: g.market_cap_change_percentage_24h_usd ?? null }
  }

  // ---- 2) Fluxo de capital por rede (DefiLlama TVL) ----
  const CHAINS = ['Ethereum', 'Solana', 'Base', 'Arbitrum', 'BSC', 'Polygon']
  const hist = await Promise.all(CHAINS.map(c => j(`https://api.llama.fi/v2/historicalChainTvl/${encodeURIComponent(c)}`, 3600)))
  out.chains = CHAINS.map((c, i) => {
    const h = hist[i]
    if (!Array.isArray(h) || !h.length) return { name: c, tvl: 0, d7: null, d30: null, spark: [] }
    const tvls = h.map((x: any) => x.tvl)
    return { name: c, tvl: tvls[tvls.length - 1], d7: pctChange(tvls, 7), d30: pctChange(tvls, 30), spark: tvls.slice(-30) }
  }).filter(c => c.tvl > 0).sort((a, b) => b.tvl - a.tvl)

  // ---- 3) Pólvora seca (oferta de stablecoins, DefiLlama) ----
  const sc = await j('https://stablecoins.llama.fi/stablecoincharts/all', 3600)
  if (Array.isArray(sc) && sc.length) {
    const val = (row: any) => { const v = row.totalCirculatingUSD; return typeof v === 'number' ? v : (v?.peggedUSD ?? Object.values(v || {}).reduce((a: number, b: any) => a + (Number(b) || 0), 0)) }
    const series = sc.map(val).filter((n: number) => n > 0)
    out.stables = { total: series[series.length - 1], d30: pctChange(series, 30), spark: series.slice(-60) }
  }

  // ---- 4) Medo & Ganância (alternative.me) ----
  const fng = await j('https://api.alternative.me/fng/?limit=30&format=json', 3600)
  if (Array.isArray(fng?.data) && fng.data.length) {
    const cur = fng.data[0]
    out.fng = { value: Number(cur.value), label: cur.value_classification, spark: fng.data.slice().reverse().map((d: any) => Number(d.value)) }
  }

  return NextResponse.json(out)
}
