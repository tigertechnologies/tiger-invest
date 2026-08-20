'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLANS } from '@/lib/plans'

export type ReferralSummary = {
  code: string; balanceCents: number; earnedCents: number; usedCents: number
  referredCount: number; activeCount: number; tierPct: number
  transactions: { id: string; tipo: string; valor_cents: number; descricao: string; created_at: string }[]
}

function tier(active: number) { return active >= 10 ? 10 : active >= 5 ? 7 : active >= 2 ? 5 : 3 }

export async function getReferral(): Promise<{ ok: true; data: ReferralSummary } | { ok: false; erro: string }> {
  const supabase = createClient()
  const { data: u } = await supabase.auth.getUser()
  const user = u.user
  if (!user) return { ok: false, erro: 'Sessão expirada.' }

  const ref = (user.user_metadata as any)?.ref_code || null
  const { data: code, error } = await (supabase as any).rpc('ensure_referral', { p_ref: ref })
  if (error) {
    const m = (error.message || '').toLowerCase()
    if (m.includes('does not exist') || m.includes('function')) return { ok: false, erro: 'Indicações ainda não configuradas no banco (rode a migration v15).' }
    return { ok: false, erro: error.message }
  }

  const admin = createAdminClient()
  const [{ data: txs }, { data: referred }] = await Promise.all([
    admin.from('credit_transactions').select('id,tipo,valor_cents,descricao,created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
    admin.from('referrals').select('user_id').eq('referred_by', code),
  ])

  const list = txs || []
  const balanceCents = list.reduce((s: number, t: any) => s + t.valor_cents, 0)
  const earnedCents = list.filter((t: any) => t.valor_cents > 0).reduce((s: number, t: any) => s + t.valor_cents, 0)
  const usedCents = -list.filter((t: any) => t.valor_cents < 0).reduce((s: number, t: any) => s + t.valor_cents, 0)

  const referredIds = (referred || []).map((r: any) => r.user_id)
  let activeCount = 0
  if (referredIds.length) {
    const { data: subs } = await admin.from('subscriptions').select('user_id,status,current_period_end').in('user_id', referredIds)
    activeCount = (subs || []).filter((s: any) => s.status === 'active' && new Date(s.current_period_end).getTime() > Date.now()).length
  }

  return { ok: true, data: { code, balanceCents, earnedCents, usedCents, referredCount: referredIds.length, activeCount, tierPct: tier(activeCount), transactions: list as any } }
}

async function priceCents(planId: string, cycle: string): Promise<{ cents: number; name: string } | null> {
  const supabase = createClient()
  let base: number | null = null, name = ''
  try { const { data } = await supabase.from('plans').select('name,price_cents,active').eq('id', planId).maybeSingle(); if (data && data.active !== false) { base = data.price_cents as number; name = data.name as string } } catch {}
  if (base == null) { const p = PLANS.find(x => x.id === planId); if (!p) return null; base = Math.round(p.price * 100); name = p.name }
  return { cents: cycle === 'anual' ? base * 12 : base, name }
}

/** Paga a assinatura usando o saldo de créditos (cobertura total). */
export async function assinarComCreditos(planId: string, cycle: string): Promise<{ ok: boolean; erro?: string }> {
  const ciclo = cycle === 'anual' ? 'anual' : 'mensal'
  const preco = await priceCents(planId, ciclo)
  if (!preco) return { ok: false, erro: 'Plano inválido.' }
  const supabase = createClient()
  const { error } = await (supabase as any).rpc('spend_credits_and_fulfill', { p_plan: planId, p_cycle: ciclo, p_price_cents: preco.cents })
  if (error) {
    const m = (error.message || '').toLowerCase()
    if (m.includes('saldo')) return { ok: false, erro: 'Saldo de créditos insuficiente para cobrir este plano.' }
    return { ok: false, erro: error.message }
  }
  return { ok: true }
}
