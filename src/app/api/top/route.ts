import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Top 50 criptos por market cap (CoinGecko), pra aba Cotação.
export async function GET() {
  try {
    const r = await fetch(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&price_change_percentage=24h',
      { next: { revalidate: 120 }, headers: { accept: 'application/json' } }
    )
    if (!r.ok) return NextResponse.json({ coins: [] })
    const arr = await r.json()
    const coins = (Array.isArray(arr) ? arr : []).map((c: any) => ({
      id: c.id, symbol: (c.symbol || '').toUpperCase(), name: c.name, img: c.image,
      usd: c.current_price ?? 0, ch24: c.price_change_percentage_24h ?? null, rank: c.market_cap_rank ?? null,
    }))
    return NextResponse.json({ coins })
  } catch {
    return NextResponse.json({ coins: [] })
  }
}
