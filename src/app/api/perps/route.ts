import { NextResponse } from 'next/server'
import { PERP_META, metaFor, mmrFor, type PerpMarket } from '@/lib/invest/perps'

// Ondo Perps — mercados e preços AO VIVO (endpoint público, sem credencial).
// GET https://api.ondoperps.xyz/v1/perps/contracts
// Retorna { markets: PerpMarket[], map: { [symbol]: PerpMarket } }.
// A execução do trade acontece na Ondo; aqui só lemos preço/funding p/ tracking.
export async function GET() {
  const map: Record<string, PerpMarket> = {}
  try {
    const res = await fetch('https://api.ondoperps.xyz/v1/perps/contracts', {
      headers: { accept: 'application/json' },
      next: { revalidate: 20 },
    })
    if (res.ok) {
      const j = await res.json()
      const arr: any[] = Array.isArray(j?.result) ? j.result : []
      for (const c of arr) {
        const base = String(c.baseCurrency || '').toUpperCase()
        if (!base) continue
        const meta = metaFor(base)
        const last = parseFloat(c.lastPrice) || parseFloat(c.indexPrice) || 0
        map[base] = {
          market: c.market || `${base}-USD.P`,
          symbol: base,
          name: c.displayName || meta.name,
          klass: meta.klass,
          maxLev: meta.maxLev,
          mmr: mmrFor(meta.maxLev),
          last,
          index: parseFloat(c.indexPrice) || last,
          chg24: parseFloat(c.priceChangePercent) || 0,
          fundingRate: parseFloat(c.nextFundingRate) || parseFloat(c.fundingRate) || 0,
          disabled: !!c.disabled,
          isClosed: !!c.isClosed,
        }
      }
    }
  } catch {}

  // Fallback: se a API falhar, ainda devolve o catálogo de mercados (sem preço)
  // para o seletor não ficar vazio.
  if (Object.keys(map).length === 0) {
    for (const [sym, meta] of Object.entries(PERP_META)) {
      map[sym] = {
        market: `${sym}-USD.P`, symbol: sym, name: meta.name, klass: meta.klass,
        maxLev: meta.maxLev, mmr: mmrFor(meta.maxLev),
        last: 0, index: 0, chg24: 0, fundingRate: 0, disabled: false, isClosed: false,
      }
    }
  }

  const markets = Object.values(map).sort((a, b) => a.symbol.localeCompare(b.symbol))
  return NextResponse.json({ markets, map })
}
