import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardApp from '@/components/DashboardApp'
import Paywall from '@/components/Paywall'
import type { Holding, Flow, Transaction, Pool, Level } from '@/lib/data'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Assinatura (usada tanto pro gate quanto pro aviso de vencimento).
  let sub: { plan_id: string; status: string; current_period_end: string } | null = null
  let subTableOk = true
  {
    const { data, error } = await supabase.from('subscriptions').select('plan_id,status,current_period_end').eq('user_id', user.id).maybeSingle()
    if (error) subTableOk = false
    else sub = (data as any) ?? null
  }
  const ativa = !!sub && sub.status === 'active' && new Date(sub.current_period_end).getTime() > Date.now()
  const periodEnd = sub?.current_period_end ?? null

  // Gate por plano: só é aplicado quando ENFORCE_PLANS === 'true'.
  // ADMIN_EMAILS (separados por vírgula) sempre têm acesso total.
  const enforce = process.env.ENFORCE_PLANS === 'true'
  const admins = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  const isAdmin = admins.includes((user.email || '').toLowerCase())

  let plan: string | null = 'alpha'
  if (enforce && !isAdmin && subTableOk) plan = ativa ? sub!.plan_id : null

  if (!plan) return <Paywall userEmail={user.email ?? ''} />

  const { data: holdings } = await supabase.from('holdings').select('*').order('sort', { ascending: true })
  const { data: flows } = await supabase.from('flows').select('*').order('created_at', { ascending: false })
  const { data: txs } = await supabase.from('transactions').select('*').order('buy_date', { ascending: true })
  const { data: pools } = await supabase.from('pools').select('*').order('created_at', { ascending: true })
  const { data: levels } = await supabase.from('levels').select('*').order('price', { ascending: false })

  return (
    <DashboardApp
      userEmail={user.email ?? ''}
      plan={plan}
      periodEnd={periodEnd}
      isAdmin={isAdmin}
      initialHoldings={(holdings ?? []) as Holding[]}
      initialFlows={(flows ?? []) as Flow[]}
      initialTx={(txs ?? []) as Transaction[]}
      initialPools={(pools ?? []) as Pool[]}
      initialLevels={(levels ?? []) as Level[]}
    />
  )
}
