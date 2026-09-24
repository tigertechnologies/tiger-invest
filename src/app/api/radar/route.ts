import { NextResponse } from 'next/server'
import { getMarkets, getMarketsByIds } from '@/lib/invest/market'

export const dynamic = 'force-dynamic'

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

export async function GET(req: Request) {
  const url = new URL(req.url)
  const netKey = (url.searchParams.get('net') || 'all').toLowerCase()

  const out: any = { top: [], alts: [], memes: [], net: netKey }

  // FONTE ÚNICA: top-250 compartilhado (mesmo snapshot do Top 50, Carteira, etc.)
  const all = await getMarkets()

  // 1) TOP — maiores por market cap (sem stablecoins)
  out.top = all.map(mapCoin).filter((c: any) => !STABLE.has(c.symbol.toLowerCase())).slice(0, 10)
  const topIds = new Set(out.top.map((c: any) => c.id))

  // 2) MEMES — lista curada (fora do top-250 muitas vezes), tirando o que já está no Top
  try {
    const m = await getMarketsByIds(MEME_IDS)
    out.memes = m.map(mapCoin).filter((c: any) => !topIds.has(c.id)).sort((x: any, y: any) => y.mcap - x.mcap).slice(0, 10)
  } catch {}
  const memeIds = new Set(out.memes.map((c: any) => c.id))

  // 3) ALTCOINS — próximas por mcap, sem stables/majors e sem o que já apareceu em Top/Memes
  out.alts = all.map(mapCoin).filter((c: any) => {
    const s = c.symbol.toLowerCase()
    return !STABLE.has(s) && !MAJORS.has(s) && !topIds.has(c.id) && !memeIds.has(c.id)
  }).slice(0, 10)

  return NextResponse.json(out)
}

