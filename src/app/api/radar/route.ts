import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const CG = 'https://api.coingecko.com/api/v3'
const STABLE = new Set(['usdt', 'usdc', 'dai', 'busd', 'tusd', 'fdusd', 'usde', 'usds', 'pyusd', 'usdd', 'gusd', 'frax', 'lusd'])
const MAJORS = new Set(['btc', 'eth', 'wbtc', 'weth', 'steth', 'wsteth', 'wbeth', 'weeth', 'reth'])
// principais memecoins por id (confiável, sem depender de categoria)
const MEME_IDS = ['dogecoin', 'shiba-inu', 'pepe', 'dogwifcoin', 'bonk', 'floki', 'based-brett', 'popcat', 'mog-coin', 'spx6900', 'book-of-meme', 'pudgy-penguins', 'cat-in-a-dogs-world', 'gigachad-2']

function mapCoin(c: any) {
  return {
    id: c.id, symbol: (c.symbol || '').toUpperCase(), name: c.name, image: c.image,
    price: c.current_price, ch24: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? 0,
    ch7d: c.price_change_percentage_7d_in_currency ?? null, vol: c.total_volume ?? 0, mcap: c.market_cap ?? 0,
  }
}
async function markets(qs: string) { const r = await fetch(`${CG}/coins/markets?${qs}`, { next: { revalidate: 180 } }); if (!r.ok) return []; const j = await r.json(); return Array.isArray(j) ? j : [] }
async function gecko(url: string) { const r = await fetch(url, { next: { revalidate: 180 }, headers: { accept: 'application/json' } }); if (!r.ok) return null; return await r.json() }

export async function GET() {
  const out: any = { top: [], alts: [], memes: [], pools: [] }
  try { out.top = (await markets('vs_currency=usd&order=market_cap_desc&per_page=10&page=1&price_change_percentage=24h,7d')).map(mapCoin) } catch {}
  try {
    const a = await markets('vs_currency=usd&order=market_cap_desc&per_page=40&page=1&price_change_percentage=24h,7d')
    out.alts = a.map(mapCoin).filter((c: any) => !STABLE.has(c.symbol.toLowerCase()) && !MAJORS.has(c.symbol.toLowerCase())).slice(0, 10)
  } catch {}
  try {
    const m = await markets(`vs_currency=usd&ids=${MEME_IDS.join(',')}&order=market_cap_desc&per_page=20&page=1&price_change_percentage=24h,7d`)
    out.memes = m.map(mapCoin).sort((x: any, y: any) => y.mcap - x.mcap).slice(0, 10)
  } catch {}
  try {
    let d = await gecko('https://api.geckoterminal.com/api/v2/networks/trending_pools?page=1')
    if (!d?.data?.length) d = await gecko('https://api.geckoterminal.com/api/v2/networks/eth/trending_pools?page=1')
    out.pools = (d?.data || []).slice(0, 10).map((p: any) => {
      const a = p.attributes || {}; const net = (p.id || '').split('_')[0]
      return { name: a.name || '', network: net, vol24: parseFloat(a.volume_usd?.h24 || '0'), ch24: parseFloat(a.price_change_percentage?.h24 || '0'), tvl: parseFloat(a.reserve_in_usd || '0') }
    })
  } catch {}
  return NextResponse.json(out)
}
