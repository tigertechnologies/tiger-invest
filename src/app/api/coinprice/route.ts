import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Preço de mercado de uma moeda numa DATA passada (pra compra retroativa).
// Ex.: /api/coinprice?id=bitcoin&date=2025-02-14
export async function GET(req: Request) {
  const u = new URL(req.url)
  const id = (u.searchParams.get('id') || '').trim()
  const date = (u.searchParams.get('date') || '').trim() // YYYY-MM-DD
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ price: null })
  const [y, m, d] = date.split('-')
  const cgDate = `${d}-${m}-${y}` // CoinGecko usa DD-MM-YYYY
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/history?date=${cgDate}&localization=false`, { next: { revalidate: 86400 }, headers: { accept: 'application/json' } })
    if (!r.ok) return NextResponse.json({ price: null, error: 'indisponível' })
    const j = await r.json()
    const price = j?.market_data?.current_price?.usd ?? null
    return NextResponse.json({ price })
  } catch { return NextResponse.json({ price: null, error: 'indisponível' }) }
}
