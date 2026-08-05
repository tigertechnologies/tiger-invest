import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Cotação de ações/ETFs ao vivo via Finnhub. Chave em FINNHUB_API_KEY (env da Vercel).
export async function GET(request: Request) {
  const symbols = new URL(request.url).searchParams.get('symbols')
  const key = process.env.FINNHUB_API_KEY
  const out: Record<string, { price: number; ch24: number | null }> = {}
  if (!symbols || !key) return NextResponse.json(out)
  const list = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 20)
  await Promise.all(list.map(async (sym) => {
    try {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${key}`, { next: { revalidate: 60 } })
      if (!r.ok) return
      const d = await r.json()
      // c = preço atual, dp = variação % do dia
      if (typeof d.c === 'number' && d.c > 0) out[sym] = { price: d.c, ch24: typeof d.dp === 'number' ? d.dp : null }
    } catch {}
  }))
  return NextResponse.json(out)
}
