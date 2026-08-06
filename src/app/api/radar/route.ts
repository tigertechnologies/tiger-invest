import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const CG = 'https://api.coingecko.com/api/v3'
const STABLE = new Set(['usdt', 'usdc', 'dai', 'busd', 'tusd', 'fdusd', 'usde', 'usds', 'pyusd', 'usdd', 'gusd', 'frax', 'lusd'])
const MAJORS = new Set(['btc', 'eth', 'wbtc', 'weth', 'steth', 'wsteth', 'wbeth', 'weeth', 'reth'])
// principais memecoins por id (confiável, sem depender de categoria)
const MEME_IDS = ['dogecoin', 'shiba-inu', 'pepe', 'dogwifcoin', 'bonk', 'floki', 'based-brett', 'popcat', 'mog-coin', 'spx6900', 'book-of-meme', 'pudgy-penguins', 'cat-in-a-dogs-world', 'gigachad-2']

// redes suportadas no filtro de pools (GeckoTerminal)
const POOL_NETWORKS: Record<string, string> = {
  all: '', eth: 'eth', solana: 'solana', base: 'base', bsc: 'bsc', arbitrum: 'arbitrum', polygon: 'polygon_pos',
}

function mapCoin(c: any) {
  return {
    id: c.id, symbol: (c.symbol || '').toUpperCase(), name: c.name, image: c.image,
    price: c.current_price, ch24: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? 0,
    ch7d: c.price_change_percentage_7d_in_currency ?? null, vol: c.total_volume ?? 0, mcap: c.market_cap ?? 0,
  }
}
async function markets(qs: string) { const r = await fetch(`${CG}/coins/markets?${qs}`, { next: { revalidate: 180 } }); if (!r.ok) return []; const j = await r.json(); return Array.isArray(j) ? j : [] }
async function gecko(url: string) { const r = await fetch(url, { next: { revalidate: 180 }, headers: { accept: 'application/json' } }); if (!r.ok) return null; return await r.json() }

export async function GET(req: Request) {
  const url = new URL(req.url)
  const netKey = (url.searchParams.get('net') || 'all').toLowerCase()
  const network = POOL_NETWORKS[netKey] ?? ''

  const out: any = { top: [], alts: [], memes: [], pools: [], net: netKey }

  // 1) TOP — maiores por market cap (sem stablecoins)
  try {
    const tp = await markets('vs_currency=usd&order=market_cap_desc&per_page=15&page=1&price_change_percentage=24h,7d')
    out.top = tp.map(mapCoin).filter((c: any) => !STABLE.has(c.symbol.toLowerCase())).slice(0, 10)
  } catch {}
  const topIds = new Set(out.top.map((c: any) => c.id))

  // 2) MEMES — lista curada, tirando o que já está no Top (evita duplicar)
  try {
    const m = await markets(`vs_currency=usd&ids=${MEME_IDS.join(',')}&order=market_cap_desc&per_page=20&page=1&price_change_percentage=24h,7d`)
    out.memes = m.map(mapCoin).filter((c: any) => !topIds.has(c.id)).sort((x: any, y: any) => y.mcap - x.mcap).slice(0, 10)
  } catch {}
  const memeIds = new Set(out.memes.map((c: any) => c.id))

  // 3) ALTCOINS — próximas por mcap, sem stables/majors e sem o que já apareceu em Top/Memes
  try {
    const a = await markets('vs_currency=usd&order=market_cap_desc&per_page=60&page=1&price_change_percentage=24h,7d')
    out.alts = a.map(mapCoin).filter((c: any) => {
      const s = c.symbol.toLowerCase()
      return !STABLE.has(s) && !MAJORS.has(s) && !topIds.has(c.id) && !memeIds.has(c.id)
    }).slice(0, 10)
  } catch {}

  // 4) POOLS — por rede escolhida (ou trending geral)
  try {
    const base = network
      ? `https://api.geckoterminal.com/api/v2/networks/${network}/trending_pools?page=1`
      : `https://api.geckoterminal.com/api/v2/networks/trending_pools?page=1`
    let d = await gecko(base)
    if (!d?.data?.length && !network) d = await gecko('https://api.geckoterminal.com/api/v2/networks/eth/trending_pools?page=1')
    out.pools = (d?.data || []).map((p: any) => {
      const a = p.attributes || {}; const net = (p.id || '').split('_')[0]
      return { name: a.name || '', network: net, vol24: parseFloat(a.volume_usd?.h24 || '0'), ch24: parseFloat(a.price_change_percentage?.h24 || '0'), tvl: parseFloat(a.reserve_in_usd || '0') }
    })
      .filter((x: any) => {
        const parts = (x.name || '').toUpperCase().split('/').map((z: string) => z.trim().split(' ')[0])
        const BLUE = ['WETH', 'ETH', 'WBTC', 'BTC', 'CBBTC', 'SOL', 'WSOL', 'USDC', 'USDT', 'DAI', 'WBNB', 'BNB', 'MATIC', 'ARB', 'OP', 'AVAX', 'LINK']
        const hasBlue = parts.some((z: string) => BLUE.includes(z))
        return x.tvl >= 250000 && Math.abs(x.ch24) < 60 && hasBlue
      })
      .sort((x: any, y: any) => y.vol24 - x.vol24)
      .slice(0, 12)
  } catch {}

  return NextResponse.json(out)
}
