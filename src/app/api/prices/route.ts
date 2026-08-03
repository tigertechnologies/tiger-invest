import { NextResponse } from 'next/server'

// CoinGecko: preço + variação 24h/30d/1y (markets) e câmbio em BRL.
export async function GET(request: Request) {
  const ids = new URL(request.url).searchParams.get('ids')
  const out: { coins: Record<string, any>; brl: Record<string, number> } = { coins: {}, brl: {} }
  try {
    if (ids) {
      const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids)}&price_change_percentage=24h,30d,1y&per_page=250`
      const res = await fetch(url, { next: { revalidate: 60 } })
      if (res.ok) {
        const arr = await res.json()
        for (const c of arr) {
          out.coins[c.id] = {
            usd: c.current_price ?? 0,
            ch24: c.price_change_percentage_24h_in_currency ?? null,
            ch30: c.price_change_percentage_30d_in_currency ?? null,
            ch1y: c.price_change_percentage_1y_in_currency ?? null,
            img: c.image ?? '',
          }
        }
      }
    }
    // câmbio: USDT/USDC em BRL (também serve de USD/BRL de referência)
    const bres = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=tether,usd-coin&vs_currencies=brl',
      { next: { revalidate: 60 } }
    )
    if (bres.ok) {
      const b = await bres.json()
      out.brl.tether = b?.tether?.brl ?? 0
      out.brl['usd-coin'] = b?.['usd-coin']?.brl ?? 0
    }
  } catch {}
  return NextResponse.json(out)
}
