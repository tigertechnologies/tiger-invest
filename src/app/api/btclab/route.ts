import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

async function j(url: string) {
  try { const r = await fetch(url, { next: { revalidate: 120 }, headers: { accept: 'application/json' } }); return r.ok ? await r.json() : null } catch { return null }
}

export async function GET() {
  const [mkt, chart, fees, hash, diff, mp, tip] = await Promise.all([
    j('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin&price_change_percentage=24h,7d'),
    j('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=200&interval=daily'),
    j('https://mempool.space/api/v1/fees/recommended'),
    j('https://mempool.space/api/v1/mining/hashrate/3d'),
    j('https://mempool.space/api/v1/difficulty-adjustment'),
    j('https://mempool.space/api/mempool'),
    j('https://mempool.space/api/blocks/tip/height'),
  ])

  const m = Array.isArray(mkt) ? mkt[0] : null
  const price = m?.current_price ?? null
  // Mayer Multiple = preço / média móvel 200d (sinal clássico de valuation do BTC)
  let ma200: number | null = null, mayer: number | null = null
  let priceSeries: number[] = []
  if (chart?.prices?.length) {
    const px = chart.prices.map((p: any) => p[1]).filter((x: number) => x > 0)
    priceSeries = px
    if (px.length) { ma200 = px.reduce((s: number, x: number) => s + x, 0) / px.length; if (price && ma200) mayer = price / ma200 }
  }

  const height = typeof tip === 'number' ? tip : null
  let halvingBlocksLeft: number | null = null, halvingDays: number | null = null, halvingDate: string | null = null
  if (height != null) {
    const next = (Math.floor(height / 210000) + 1) * 210000
    halvingBlocksLeft = next - height
    halvingDays = Math.round(halvingBlocksLeft * 10 / 60 / 24)
    halvingDate = new Date(Date.now() + halvingDays * 86400000).toISOString().slice(0, 10)
  }

  return NextResponse.json({
    price,
    change24h: m?.price_change_percentage_24h_in_currency ?? m?.price_change_percentage_24h ?? null,
    change7d: m?.price_change_percentage_7d_in_currency ?? null,
    marketCap: m?.market_cap ?? null,
    ath: m?.ath ?? null,
    athChange: m?.ath_change_percentage ?? null,
    ma200, mayer, priceSeries,
    athPrice: m?.ath ?? null,
    hashrate: hash?.currentHashrate ?? null,          // H/s
    difficulty: hash?.currentDifficulty ?? diff?.difficulty ?? null,
    nextAdjustPct: diff?.difficultyChange ?? null,     // % estimado do próximo reajuste
    adjustProgress: diff?.progressPercent ?? null,
    adjustRemaining: diff?.remainingBlocks ?? null,
    fees: fees ? { fast: fees.fastestFee, halfHour: fees.halfHourFee, hour: fees.hourFee, economy: fees.economyFee } : null, // sat/vB
    mempoolCount: mp?.count ?? null,
    mempoolVsize: mp?.vsize ?? null,
    height,
    halvingBlocksLeft, halvingDays, halvingDate,
  })
}
