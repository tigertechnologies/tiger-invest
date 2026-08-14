import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Busca a moeda pelo NOME/símbolo no CoinGecko e devolve id correto, logo e preço ao vivo.
// Assim o usuário nunca precisa digitar o "ID CoinGecko" na mão (origem do ativo bagunçado).
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json({ coins: [] })
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`, { next: { revalidate: 300 }, headers: { accept: 'application/json' } })
    if (!r.ok) return NextResponse.json({ coins: [], error: 'busca indisponível agora' })
    const j = await r.json()
    // resultados já vêm ordenados por relevância/market cap; pega os primeiros
    const top = (j.coins || []).slice(0, 8).map((c: any) => ({
      id: c.id, symbol: (c.symbol || '').toUpperCase(), name: c.name,
      image: c.large || c.thumb || '', rank: c.market_cap_rank ?? null,
    }))
    // preços ao vivo dos resultados, em uma chamada só
    const ids = top.map((c: any) => c.id).join(',')
    const prices: Record<string, number> = {}
    if (ids) {
      try {
        const p = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`, { next: { revalidate: 120 }, headers: { accept: 'application/json' } })
        if (p.ok) { const pj = await p.json(); for (const id of Object.keys(pj)) prices[id] = pj[id]?.usd ?? 0 }
      } catch { /* segue sem preço */ }
    }
    return NextResponse.json({ coins: top.map((c: any) => ({ ...c, price: prices[c.id] ?? null })) })
  } catch { return NextResponse.json({ coins: [], error: 'busca indisponível agora' }) }
}
