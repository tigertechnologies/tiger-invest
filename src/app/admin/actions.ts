'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadAdminData, type AdminData } from '@/lib/admin-data'

/** Garante que quem chama é admin (e-mail em ADMIN_EMAILS). Lança se não for. */
async function requireAdmin(): Promise<void> {
  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  const email = (data.user?.email || '').toLowerCase()
  const admins = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (!email || !admins.includes(email)) throw new Error('Acesso negado.')
}

export async function adminRefresh(): Promise<AdminData> {
  await requireAdmin()
  return loadAdminData()
}

/** Define/renova o plano de um usuário manualmente (upgrade, downgrade, cortesia). */
export async function setUserPlan(userId: string, planId: string, months: number): Promise<{ ok: boolean; erro?: string }> {
  await requireAdmin()
  if (!userId || !planId) return { ok: false, erro: 'Dados inválidos.' }
  const admin = createAdminClient()
  const end = new Date(Date.now() + Math.max(1, months) * 30 * 864e5).toISOString()
  const cycle = months >= 12 ? 'anual' : 'mensal'
  const { error } = await admin.from('subscriptions').upsert(
    { user_id: userId, plan_id: planId, cycle, status: 'active', current_period_end: end, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )
  return error ? { ok: false, erro: error.message } : { ok: true }
}

/** Cancela a assinatura (marca como cancelada; acesso cai no próximo carregamento). */
export async function cancelUserSub(userId: string): Promise<{ ok: boolean; erro?: string }> {
  await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('subscriptions').update({ status: 'canceled', updated_at: new Date().toISOString() }).eq('user_id', userId)
  return error ? { ok: false, erro: error.message } : { ok: true }
}

/** Salva um plano (nome, preço, textos, destaque, ativo). */
export async function savePlan(id: string, patch: { name: string; priceReais: number; tag: string; features: string[]; popular: boolean; active: boolean }): Promise<{ ok: boolean; erro?: string }> {
  await requireAdmin()
  if (!id) return { ok: false, erro: 'Plano inválido.' }
  const admin = createAdminClient()
  const { error } = await admin.from('plans').update({
    name: patch.name, price_cents: Math.round((patch.priceReais || 0) * 100), tag: patch.tag,
    features: patch.features, popular: patch.popular, active: patch.active, updated_at: new Date().toISOString(),
  }).eq('id', id)
  return error ? { ok: false, erro: error.message } : { ok: true }
}

/** Ajuste manual de créditos na carteira de um usuário (bônus/correção). */
export async function ajustarCredito(userId: string, valorReais: number, motivo: string): Promise<{ ok: boolean; erro?: string }> {
  await requireAdmin()
  if (!userId || !valorReais) return { ok: false, erro: 'Dados inválidos.' }
  const admin = createAdminClient()
  const { error } = await admin.from('credit_transactions').insert({
    user_id: userId, tipo: 'ajuste', valor_cents: Math.round(valorReais * 100), descricao: motivo || 'Ajuste manual',
  })
  return error ? { ok: false, erro: error.message } : { ok: true }
}

/** Define a taxa do Mercado Pago (%) usada no líquido da comissão. */
export async function setTaxaMp(pct: number): Promise<{ ok: boolean; erro?: string }> {
  await requireAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('app_settings').upsert({ key: 'taxa_mp', value: String(pct) }, { onConflict: 'key' })
  return error ? { ok: false, erro: error.message } : { ok: true }
}
