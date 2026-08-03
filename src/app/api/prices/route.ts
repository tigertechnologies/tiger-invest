import { NextResponse } from 'next/server'

// Proxy da CoinGecko (evita CORS + cacheia 60s). Sem chave.
export async function GET(request: Request) {
  const ids = new URL(request.url).searchParams.get('ids')
  if (!ids) return NextResponse.json({})
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd`,
      { next: { revalidate: 60 } }
    )
    if (!res.ok) return NextResponse.json({}, { status: 200 })
    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({}, { status: 200 })
  }
}
