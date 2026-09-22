import { NextResponse } from 'next/server'
import { getMarkets, getMarketsByIds } from '@/lib/market'

// Preço + variação (24h/30d/1y) para a carteira, e câmbio em BRL.
// Usa a FONTE ÚNICA (getMarkets): para coins no top-250 o preço é EXATAMENTE
// o mesmo que Top 50 / Radar / Pulso mostram. Coins fora do top-250 (alts
// pequenas) caem num fetch dirigido, com o mesmo TTL.
export async function GET(request: Request) {
  const ids = new URL(request.url).searchParams.get('ids')
  const out: { coins: Record<string, any>; brl: Record<string, number> } = { coins: {}, brl: {} }
  try {
    if (ids) {
      const want = ids.split(',').map(s => s.trim()).filter(Boolean)
      const snap = await getMarkets()
      const byId: Record<string, any> = {}
      for (const c of snap) byId[c.id] = c
      const missing = want.filter(id => !byId[id])
      if (missing.length) {
        for (const c of await getMarketsByIds(missing)) byId[c.id] = c
      }
      for (const id of want) {
        const c = byId[id]
        if (!c) continue
        out.coins[id] = {
          usd: c.current_price ?? 0,
          ch24: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? null,
          ch30: c.price_change_percentage_30d_in_currency ?? null,
          ch1y: c.price_change_percentage_1y_in_currency ?? null,
          img: c.image ?? '',
        }
      }
    }
    // câmbio: USDT/USDC em BRL (FX de referência — não é preço spot de coin)
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
