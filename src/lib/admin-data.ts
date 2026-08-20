import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { rowToPlan, PLANS, type Plan } from '@/lib/plans'

export type AdminUser = {
  id: string; email: string; name: string; city: string; uf: string
  createdAt: string; lastSignIn: string | null
  plan: string | null; status: string | null; periodEnd: string | null
}
export type AdminOrder = { id: string; userId: string; email: string; planId: string; cycle: string; amountCents: number; status: string; createdAt: string; paidAt: string | null }
export type AdminData = {
  users: AdminUser[]
  orders: AdminOrder[]
  plans: Plan[]
  metrics: {
    totalUsers: number; activeSubs: number; signups30d: number
    revenueCents: number; paidCount: number; mrrCents: number
    byPlan: Record<string, number>
  }
  referral: {
    taxaMp: number
    totalComissaoCents: number; totalUsadoCents: number; saldoCirculacaoCents: number
    indicadores: { userId: string; email: string; name: string; ativos: number; pct: number; saldoCents: number; ganhoCents: number }[]
    transacoes: { id: string; email: string; tipo: string; valor_cents: number; descricao: string; created_at: string }[]
  }
}

export async function loadAdminData(): Promise<AdminData> {
  const admin = createAdminClient()

  // usuários (auth) — servidor apenas
  const authList = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const authUsers = authList.data?.users ?? []
  const emailById: Record<string, string> = {}
  authUsers.forEach(u => { emailById[u.id] = u.email ?? '' })

  const [{ data: subs }, { data: orders }, { data: planRows }] = await Promise.all([
    admin.from('subscriptions').select('*'),
    admin.from('plan_orders').select('*').order('created_at', { ascending: false }),
    admin.from('plans').select('*').order('sort', { ascending: true }),
  ])

  const subByUser: Record<string, any> = {}
  ;(subs ?? []).forEach((s: any) => { subByUser[s.user_id] = s })

  const plans: Plan[] = (planRows && planRows.length) ? planRows.map(rowToPlan) : PLANS
  const priceById: Record<string, number> = {}
  plans.forEach(p => { priceById[p.id] = p.price })

  const now = Date.now()
  const users: AdminUser[] = authUsers.map(u => {
    const s = subByUser[u.id]
    const active = s && s.status === 'active' && new Date(s.current_period_end).getTime() > now
    const m = (u.user_metadata as any) || {}
    return {
      id: u.id, email: u.email ?? '', name: m.full_name || '', city: m.city || '', uf: m.state || '',
      createdAt: u.created_at, lastSignIn: u.last_sign_in_at ?? null,
      plan: active ? s.plan_id : (s ? s.plan_id : null),
      status: active ? 'active' : (s ? (s.status === 'active' ? 'expired' : s.status) : null),
      periodEnd: s?.current_period_end ?? null,
    }
  })

  const orderList: AdminOrder[] = (orders ?? []).map((o: any) => ({
    id: o.id, userId: o.user_id, email: emailById[o.user_id] || '', planId: o.plan_id, cycle: o.cycle,
    amountCents: o.amount_cents, status: o.status, createdAt: o.created_at, paidAt: o.paid_at ?? null,
  }))

  const paid = orderList.filter(o => o.status === 'paid')
  const revenueCents = paid.reduce((a, o) => a + o.amountCents, 0)
  const byPlan: Record<string, number> = {}
  let mrrCents = 0
  users.forEach(u => {
    if (u.status === 'active' && u.plan) {
      byPlan[u.plan] = (byPlan[u.plan] || 0) + 1
      const monthly = (priceById[u.plan] || 0) // preço mensal do plano
      mrrCents += Math.round(monthly * 100)
    }
  })
  const signups30d = users.filter(u => Date.now() - new Date(u.createdAt).getTime() < 30 * 864e5).length

  // ---- Indicações / carteira de créditos ----
  const nameById: Record<string, string> = {}
  authUsers.forEach(u => { nameById[u.id] = ((u.user_metadata as any)?.full_name) || '' })
  const [{ data: refRows }, { data: creditRows }, { data: taxaRow }] = await Promise.all([
    admin.from('referrals').select('user_id,referral_code,referred_by'),
    admin.from('credit_transactions').select('id,user_id,tipo,valor_cents,descricao,created_at').order('created_at', { ascending: false }),
    admin.from('app_settings').select('value').eq('key', 'taxa_mp').maybeSingle(),
  ])
  const credits = creditRows || []
  const refs = refRows || []
  const codeByUser: Record<string, string> = {}
  refs.forEach((r: any) => { codeByUser[r.user_id] = r.referral_code })
  const activeSet = new Set(users.filter(u => u.status === 'active').map(u => u.id))
  const saldoByUser: Record<string, number> = {}, ganhoByUser: Record<string, number> = {}
  credits.forEach((c: any) => { saldoByUser[c.user_id] = (saldoByUser[c.user_id] || 0) + c.valor_cents; if (c.valor_cents > 0) ganhoByUser[c.user_id] = (ganhoByUser[c.user_id] || 0) + c.valor_cents })
  const refTier = (n: number) => n >= 10 ? 10 : n >= 5 ? 7 : n >= 2 ? 5 : 3
  const indicadores = refs.filter((r: any) => refs.some((x: any) => x.referred_by === r.referral_code))
    .map((r: any) => {
      const ativos = refs.filter((x: any) => x.referred_by === r.referral_code && activeSet.has(x.user_id)).length
      return { userId: r.user_id, email: emailById[r.user_id] || '', name: nameById[r.user_id] || '', ativos, pct: refTier(ativos), saldoCents: saldoByUser[r.user_id] || 0, ganhoCents: ganhoByUser[r.user_id] || 0 }
    }).sort((a: any, b: any) => b.ganhoCents - a.ganhoCents)
  const totalComissaoCents = credits.filter((c: any) => c.tipo === 'comissao').reduce((s: number, c: any) => s + c.valor_cents, 0)
  const totalUsadoCents = -credits.filter((c: any) => c.valor_cents < 0).reduce((s: number, c: any) => s + c.valor_cents, 0)
  const saldoCirculacaoCents = credits.reduce((s: number, c: any) => s + c.valor_cents, 0)
  const transacoes = credits.slice(0, 200).map((c: any) => ({ id: c.id, email: emailById[c.user_id] || '', tipo: c.tipo, valor_cents: c.valor_cents, descricao: c.descricao, created_at: c.created_at }))

  return {
    users, orders: orderList, plans,
    metrics: {
      totalUsers: users.length,
      activeSubs: users.filter(u => u.status === 'active').length,
      signups30d, revenueCents, paidCount: paid.length, mrrCents, byPlan,
    },
    referral: {
      taxaMp: Number((taxaRow as any)?.value ?? 1),
      totalComissaoCents, totalUsadoCents, saldoCirculacaoCents, indicadores, transacoes,
    },
  }
}
