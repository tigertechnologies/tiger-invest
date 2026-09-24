import { redirect } from 'next/navigation'
import { createClient } from '@/lib/invest/sb-server'
import DashboardApp from '@/components/invest/DashboardApp'
import Paywall from '@/components/invest/Paywall'
import { getAccess } from '@/lib/access'
import type { Holding, Flow, Transaction, Pool, Level } from '@/lib/invest/data'
import type { PerpPosition } from '@/lib/invest/perps'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Minha Carteira' }

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Plano / acesso (ENFORCE_PLANS, admin, assinante manual e assinatura paga)
  const access = await getAccess()
  const isAdmin = access.isAdmin
  const periodEnd = access.periodEnd
  const RANK_PLAN: Record<number, string> = { 1: 'start', 2: 'pro', 3: 'alpha' }
  const plan: string | null = access.plan && !(access.rank === 3 && access.plan !== 'alpha') ? access.plan : RANK_PLAN[access.rank] ?? null

  if (!plan) return <div className="ti"><Paywall userEmail={user.email ?? ''} /></div>

  // Filtro user_id explícito em TODAS as leituras. O RLS já garante isolamento,
  // mas o filtro é uma segunda trava: se o RLS de alguma tabela for desligado
  // por engano, os dados continuam isolados por usuário.
  const { data: holdings } = await supabase.from('holdings').select('*').eq('user_id', user.id).order('sort', { ascending: true })
  const { data: flows } = await supabase.from('flows').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
  const { data: txs } = await supabase.from('transactions').select('*').eq('user_id', user.id).order('buy_date', { ascending: true })
  const { data: pools } = await supabase.from('pools').select('*').eq('user_id', user.id).order('created_at', { ascending: true })
  const { data: levels } = await supabase.from('levels').select('*').eq('user_id', user.id).order('price', { ascending: false })
  const { data: perps } = await supabase.from('perps_positions').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
  const { data: perpAcct } = await supabase.from('perps_account').select('*').eq('user_id', user.id).maybeSingle()

  return (
    <div className="ti">
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
      initialPerps={(perps ?? []) as PerpPosition[]}
      initialPerpAcct={(perpAcct?.collateral ?? 0) as number}
      initialAutoClose={(perpAcct?.auto_close ?? true) as boolean}
    />
    </div>
  )
}
