import { NextResponse } from 'next/server'
import { getMarkets } from '@/lib/invest/market'

export const dynamic = 'force-dynamic'

// Top 50 criptos por market cap. Consome a FONTE ÚNICA (getMarkets) —
// mesmo snapshot de preços que Radar, Carteira, Dashboard e Pulso.
export async function GET() {
  const arr = await getMarkets()
  const coins = arr.slice(0, 50).map((c: any) => ({
    id: c.id, symbol: (c.symbol || '').toUpperCase(), name: c.name, img: c.image,
    usd: c.current_price ?? 0, ch24: c.price_change_percentage_24h ?? null, rank: c.market_cap_rank ?? null,
    mcap: c.market_cap ?? 0,
  })).sort((a: any, b: any) => (b.mcap || 0) - (a.mcap || 0))
  return NextResponse.json({ coins })
}
