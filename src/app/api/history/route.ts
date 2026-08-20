import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

// Histórico de preço (para o gráfico do ativo na pool). CoinGecko market_chart.
export async function GET(req: Request) {
  const u = new URL(req.url)
  const id = u.searchParams.get('id') || ''
  const days = u.searchParams.get('days') || '30'
  if (!id) return NextResponse.json({ prices: [] })
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}`, { next: { revalidate: 3600 }, headers: { accept: 'application/json' } })
    if (!r.ok) return NextResponse.json({ prices: [] })
    const j = await r.json()
    const prices: number[] = Array.isArray(j.prices) ? j.prices.map((p: any) => p[1]) : []
    return NextResponse.json({ prices })
  } catch { return NextResponse.json({ prices: [] }) }
}
