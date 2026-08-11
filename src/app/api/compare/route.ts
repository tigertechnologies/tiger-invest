import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// ativos disponíveis pra comparar
const ASSETS: Record<string, { label: string; kind: 'cg' | 'stooq' | 'index'; ref?: string }> = {
  tiger100: { label: 'Tiger 100', kind: 'index' },
  bitcoin: { label: 'Bitcoin', kind: 'cg', ref: 'bitcoin' },
  ethereum: { label: 'Ethereum', kind: 'cg', ref: 'ethereum' },
  solana: { label: 'Solana', kind: 'cg', ref: 'solana' },
  nasdaq: { label: 'NASDAQ 100', kind: 'stooq', ref: '^ndx' },
  sp500: { label: 'S&P 500', kind: 'stooq', ref: '^spx' },
  gold: { label: 'Ouro', kind: 'stooq', ref: 'xauusd' },
}

async function cgSeries(id: string, days: number): Promise<Record<string, number>> {
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=daily`, { next: { revalidate: 1800 }, headers: { accept: 'application/json' } })
    if (!r.ok) return {}
    const j = await r.json(); const out: Record<string, number> = {}
    for (const [ts, val] of (j.prices || [])) out[new Date(ts).toISOString().slice(0, 10)] = val
    return out
  } catch { return {} }
}
async function stooqSeries(sym: string, days: number): Promise<Record<string, number>> {
  try {
    const r = await fetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&i=d`, { next: { revalidate: 3600 } })
    if (!r.ok) return {}
    const txt = await r.text(); const out: Record<string, number> = {}
    const lines = txt.trim().split('\n'); // Date,Open,High,Low,Close,Volume
    const cut = new Date(Date.now() - (days + 5) * 86400000).toISOString().slice(0, 10)
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(','); if (c.length < 5) continue
      const d = c[0], close = parseFloat(c[4])
      if (d >= cut && isFinite(close)) out[d] = close
    }
    return out
  } catch { return {} }
}
async function indexSeries(days: number): Promise<Record<string, number>> {
  try {
    const admin = createAdminClient()
    const cut = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    const { data } = await admin.from('tiger100_snapshot').select('snap_date,level').gte('snap_date', cut).order('snap_date')
    const out: Record<string, number> = {}
    for (const row of (data || [])) out[row.snap_date] = Number(row.level)
    return out
  } catch { return {} }
}
async function series(key: string, days: number): Promise<Record<string, number>> {
  const a = ASSETS[key]; if (!a) return {}
  if (a.kind === 'cg') return cgSeries(a.ref!, days)
  if (a.kind === 'stooq') return stooqSeries(a.ref!, days)
  return indexSeries(days)
}

function pearson(x: number[], y: number[]): number | null {
  const n = Math.min(x.length, y.length); if (n < 3) return null
  let sx = 0, sy = 0, sxy = 0, sx2 = 0, sy2 = 0
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; sxy += x[i] * y[i]; sx2 += x[i] * x[i]; sy2 += y[i] * y[i] }
  const den = Math.sqrt((n * sx2 - sx * sx) * (n * sy2 - sy * sy))
  return den === 0 ? null : (n * sxy - sx * sy) / den
}

export async function GET(req: Request) {
  const u = new URL(req.url)
  const aKey = u.searchParams.get('a') || 'tiger100'
  const bKey = u.searchParams.get('b') || 'nasdaq'
  const days = Math.min(365, Math.max(14, parseInt(u.searchParams.get('days') || '90')))
  if (!ASSETS[aKey] || !ASSETS[bKey]) return NextResponse.json({ error: 'ativo inválido' }, { status: 400 })

  const [ma, mb] = await Promise.all([series(aKey, days), series(bKey, days)])
  // datas em comum, ordenadas
  const dates = Object.keys(ma).filter(d => d in mb).sort()
  if (dates.length < 3) return NextResponse.json({ a: ASSETS[aKey].label, b: ASSETS[bKey].label, dates: [], correlation: null, note: 'histórico insuficiente em comum' })

  const va = dates.map(d => ma[d]), vb = dates.map(d => mb[d])
  const base = (arr: number[]) => arr.map(v => v / arr[0] * 100)               // rebase 100
  const rets = (arr: number[]) => arr.slice(1).map((v, i) => arr[i] ? v / arr[i] - 1 : 0)
  const corr = pearson(rets(va), rets(vb))

  return NextResponse.json({
    a: ASSETS[aKey].label, b: ASSETS[bKey].label,
    dates, seriesA: base(va), seriesB: base(vb),
    perfA: (va[va.length - 1] / va[0] - 1) * 100, perfB: (vb[vb.length - 1] / vb[0] - 1) * 100,
    correlation: corr, days: dates.length,
  })
}
