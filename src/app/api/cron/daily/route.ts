import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Preços de cripto (USD) do CoinGecko, em lotes de 250.
async function cgPrices(ids: string[]): Promise<Record<string, number>> {
  const map: Record<string, number> = {}
  for (let i = 0; i < ids.length; i += 250) {
    const batch = ids.slice(i, i + 250).join(',')
    try {
      const r = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(batch)}&per_page=250`, { cache: 'no-store' })
      if (r.ok) { const arr = await r.json(); for (const c of arr) map[c.id] = c.current_price ?? 0 }
    } catch { }
  }
  return map
}
async function brlRate(): Promise<number> {
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=brl', { cache: 'no-store' })
    if (r.ok) { const b = await r.json(); return b?.tether?.brl ?? 0 }
  } catch { }
  return 0
}

function siteBase(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (prod) return `https://${prod}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return ''
}

export async function GET(req: Request) {
  // Proteção: Vercel Cron envia "Authorization: Bearer <CRON_SECRET>" quando a env existe.
  const secret = process.env.CRON_SECRET
  if (secret && (req.headers.get('authorization') || '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)
  const result: any = { ok: true, date: today }

  // ---------- 1) SNAPSHOTS DIÁRIOS (histórico garantido, mesmo com app fechado) ----------
  try {
    const [{ data: holdings }, { data: pools }] = await Promise.all([
      admin.from('holdings').select('user_id,kind,symbol,cg_id,qty,price,invested,current_value'),
      admin.from('pools').select('user_id,aporte,current_value'),
    ])
    const H = (holdings || []) as any[], P = (pools || []) as any[]
    const cgIds = Array.from(new Set(H.filter(h => h.cg_id).map(h => h.cg_id)))
    const [prices, rate] = await Promise.all([cgPrices(cgIds), brlRate()])

    const acc: Record<string, { patr: number; custo: number }> = {}
    const add = (uid: string, patr: number, custo: number) => { const a = acc[uid] || (acc[uid] = { patr: 0, custo: 0 }); a.patr += patr; a.custo += custo }
    for (const h of H) {
      // mesma valoração do cliente: cash = current_value; cripto/ação = qty × preço
      let val = 0
      if (h.kind === 'cash') val = h.current_value ?? 0
      else if (h.kind === 'crypto') val = (h.qty || 0) * (h.cg_id && prices[h.cg_id] ? prices[h.cg_id] : (h.price || 0))
      else if (h.kind === 'stock') val = (h.qty || 0) * (h.price || 0)
      else val = h.current_value ?? (h.qty || 0) * (h.price || 0)
      add(h.user_id, val, h.invested || 0)
    }
    for (const p of P) add(p.user_id, p.current_value || 0, p.aporte || 0)

    const rows = Object.entries(acc)
      .filter(([, v]) => v.patr > 0 && v.custo > 0)
      .map(([uid, v]) => ({ user_id: uid, snap_date: today, patrimonio_usd: +v.patr.toFixed(2), custo_usd: +v.custo.toFixed(2), brl_rate: +rate.toFixed(4) }))
    if (rows.length) await admin.from('portfolio_snapshot').upsert(rows, { onConflict: 'user_id,snap_date' })
    result.snapshots = rows.length
  } catch (e: any) { result.snapshotError = String(e?.message || e) }

  // ---------- 2) ALERTAS DE POOL VIGIADA (dispara quando entra em bom momento) ----------
  try {
    const base = siteBase()
    const { data: watch } = await admin.from('pool_watch').select('user_id,pool_key,name,network,dex')
    if (base && watch && watch.length) {
      const r = await fetch(`${base}/api/poolideas?net=all`, { cache: 'no-store' })
      const ideas = r.ok ? ((await r.json()).ideas || []) : []
      const byKey: Record<string, any> = {}
      for (const it of ideas) byKey[`${it.name}|${it.network}`] = it

      const alerts = (watch as any[])
        .map(w => { const it = byKey[w.pool_key]; return it && (it.highlight || it.yieldGrade === 'A') ? { w, it } : null })
        .filter(Boolean)
        .map(({ w, it }: any) => ({
          user_id: w.user_id, pool_key: w.pool_key, alert_date: today,
          name: it.name, network: it.network, dex: it.dex, grade: it.yieldGrade || '', net_apr: it.netApr ?? 0,
          message: `Sua pool vigiada ${it.name} está em bom momento — Nota ${it.yieldGrade || '-'}${it.netApr != null ? ` · ${it.netApr}%/ano líq.` : ''}.`,
        }))
      if (alerts.length) await admin.from('pool_alert').upsert(alerts, { onConflict: 'user_id,pool_key,alert_date', ignoreDuplicates: true })
      result.poolAlerts = alerts.length
    } else result.poolAlerts = 0
  } catch (e: any) { result.alertError = String(e?.message || e) }

  // ---------- 3) ÍNDICE TIGER 100 (nível diário, base 1000 compondo o retorno) ----------
  try {
    const { computeTiger100 } = await import('@/lib/tiger100')
    const idx = await computeTiger100()
    if (idx) {
      const { data: last } = await admin.from('tiger100_snapshot').select('snap_date,level').order('snap_date', { ascending: false }).limit(1)
      const prevLevel = last && last.length && last[0].snap_date !== today ? Number(last[0].level) : (last && last.length ? Number(last[0].level) : 1000)
      // se já existe hoje, mantém base; senão compõe o retorno 24h sobre o último nível
      const already = last && last.length && last[0].snap_date === today
      const level = already ? Number(last[0].level) : prevLevel * (1 + idx.ret24 / 100)
      await admin.from('tiger100_snapshot').upsert({
        snap_date: today, level: +level.toFixed(2), ret24: +idx.ret24.toFixed(2),
        mcap_total: Math.round(idx.totalMcap), btc_dom: idx.btcDom != null ? +idx.btcDom.toFixed(2) : 0, breadth_up: idx.up,
      }, { onConflict: 'snap_date' })
      result.tiger100 = +level.toFixed(2)
    }
  } catch (e: any) { result.tiger100Error = String(e?.message || e) }

  return NextResponse.json(result)
}
