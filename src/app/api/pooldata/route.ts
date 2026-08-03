import { NextResponse } from 'next/server'

// GeckoTerminal: estatísticas ao vivo da pool (TVL, volume 24h, taxas aprox.)
export async function GET(request: Request) {
  const u = new URL(request.url)
  const network = u.searchParams.get('network') || 'base'
  const address = u.searchParams.get('address')
  if (!address) return NextResponse.json({})
  try {
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/${network}/pools/${address}`, { next: { revalidate: 300 }, headers: { accept: 'application/json' } })
    if (!r.ok) return NextResponse.json({})
    const d = await r.json()
    const a = d?.data?.attributes || {}
    const tvl = parseFloat(a.reserve_in_usd || '0')
    const vol24 = parseFloat(a?.volume_usd?.h24 || '0')
    const ch24 = parseFloat(a?.price_change_percentage?.h24 || '0')
    return NextResponse.json({ tvl, vol24, ch24, name: a.name || '' })
  } catch { return NextResponse.json({}) }
}
