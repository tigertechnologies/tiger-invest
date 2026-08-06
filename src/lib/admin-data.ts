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

  return {
    users, orders: orderList, plans,
    metrics: {
      totalUsers: users.length,
      activeSubs: users.filter(u => u.status === 'active').length,
      signups30d, revenueCents, paidCount: paid.length, mrrCents, byPlan,
    },
  }
}
