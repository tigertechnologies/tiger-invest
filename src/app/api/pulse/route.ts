import { NextResponse } from 'next/server'
import { getMarkets } from '@/lib/market'

export const dynamic = 'force-dynamic'
const CG = 'https://api.coingecko.com/api/v3'
const STABLE = new Set(['usdt', 'usdc', 'dai', 'busd', 'tusd', 'fdusd', 'usde', 'usds', 'pyusd', 'usdd'])

// Pulso do mercado: termômetro de ciclo (sentimento contrário), o que está em
// HYPE agora, e pra onde o capital está fluindo (dominância + narrativas).
// Fontes públicas: CoinGecko (global, markets, trending, categories) +
// Fear & Greed (alternative.me). Tudo com fallback — nada quebra a tela.
export async function GET() {
  const out: any = {
    fng: null, fngLabel: '', btcDom: null, totalChg24: null, domDir: 'neutro',
    breadth: null, majors: [], hype: [], narratives: [], score: null, regime: 'neutro', regimeLabel: '',
  }

  // 1) Global — dominância BTC + variação total 24h
  try {
    const r = await fetch(`${CG}/global`, { next: { revalidate: 300 } })
    if (r.ok) {
      const g = (await r.json())?.data
      out.btcDom = g?.market_cap_percentage?.btc ?? null
      out.totalChg24 = g?.market_cap_change_percentage_24h_usd ?? null
    }
  } catch {}

  // 2) Fear & Greed (0-100)
  try {
    const r = await fetch('https://api.alternative.me/fng/?limit=1', { next: { revalidate: 1800 } })
    if (r.ok) {
      const d = (await r.json())?.data?.[0]
      out.fng = d ? parseInt(d.value, 10) : null
      out.fngLabel = d?.value_classification || ''
    }
  } catch {}

  // 3) Markets top — majors, breadth, top gainers (FONTE ÚNICA compartilhada)
  let top: any[] = []
  try {
    top = await getMarkets()
  } catch {}
  if (top.length) {
    const nonStable = top.filter(c => !STABLE.has((c.symbol || '').toLowerCase()))
    const greens = nonStable.filter(c => (c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? 0) > 0).length
    out.breadth = nonStable.length ? Math.round(greens / nonStable.length * 100) : null
    const pick = (sym: string) => { const c = top.find(x => (x.symbol || '').toLowerCase() === sym); return c ? { symbol: (c.symbol || '').toUpperCase(), name: c.name, image: c.image, ch24: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? 0, ch7d: c.price_change_percentage_7d_in_currency ?? null } : null }
    out.majors = ['btc', 'eth', 'sol'].map(pick).filter(Boolean)
    // dominância: se BTC bate o mercado, capital consolida no BTC (defensivo); senão, rotaciona p/ alts
    const btc = pick('btc')
    if (btc && out.totalChg24 != null) out.domDir = btc.ch24 - out.totalChg24 > 0.4 ? 'btc' : btc.ch24 - out.totalChg24 < -0.4 ? 'alts' : 'neutro'
    // HYPE por movimento: maiores altas 24h no top-100 (fora stables), com liquidez mínima
    out.hype = nonStable
      .filter(c => (c.total_volume ?? 0) > 3_000_000)
      .map(c => ({ symbol: (c.symbol || '').toUpperCase(), name: c.name, image: c.image, ch24: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? 0, ch7d: c.price_change_percentage_7d_in_currency ?? null, vol: c.total_volume ?? 0, mcap: c.market_cap ?? 0 }))
      .sort((a, b) => b.ch24 - a.ch24).slice(0, 6)
  }

  // 4) Trending (buscas) — HYPE por atenção, complementa o de preço
  try {
    const r = await fetch(`${CG}/search/trending`, { next: { revalidate: 600 } })
    if (r.ok) {
      const j = await r.json()
      out.trending = (j?.coins || []).slice(0, 7).map((x: any) => ({
        symbol: (x.item?.symbol || '').toUpperCase(), name: x.item?.name, image: x.item?.thumb,
        rank: x.item?.market_cap_rank ?? null, ch24: x.item?.data?.price_change_percentage_24h?.usd ?? null,
      }))
    }
  } catch {}

  // 5) Narrativas — pra onde o capital flui (setores por variação de mcap 24h)
  try {
    const r = await fetch(`${CG}/coins/categories?order=market_cap_change_24h_desc`, { next: { revalidate: 600 } })
    if (r.ok) {
      const j = await r.json()
      if (Array.isArray(j)) {
        const clean = j.filter((c: any) => (c.market_cap ?? 0) > 2e8 && c.market_cap_change_24h != null)
        const up = clean.slice(0, 5)
        const down = clean.slice(-4).reverse()
        out.narratives = { up: up.map(mapCat), down: down.map(mapCat) }
      }
    }
  } catch {}

  // 6) Termômetro de ciclo — sentimento contrário, ancorado no Fear & Greed
  //    e ajustado pela amplitude (breadth). Baixo = acumular, alto = distribuir.
  let score = out.fng
  if (score == null && out.breadth != null) score = out.breadth
  if (score != null) {
    if (out.breadth != null) { if (out.breadth > 78) score = Math.min(100, score + 5); else if (out.breadth < 22) score = Math.max(0, score - 5) }
    out.score = Math.round(score)
    out.regime = score < 35 ? 'acumular' : score > 66 ? 'distribuir' : 'neutro'
    out.regimeLabel = score < 20 ? 'Medo extremo · zona de acumulação' : score < 35 ? 'Medo · favorável a acumular' : score <= 66 ? 'Neutro · mercado equilibrado' : score < 80 ? 'Ganância · cautela' : 'Ganância extrema · zona de distribuição'
  }

  return NextResponse.json(out)
}

function mapCat(c: any) {
  return { name: c.name, chg24: c.market_cap_change_24h ?? 0, mcap: c.market_cap ?? 0, top: (c.top_3_coins_id || []).slice(0, 3) }
}
