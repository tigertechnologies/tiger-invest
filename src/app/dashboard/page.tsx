import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardApp from '@/components/DashboardApp'
import type { Holding, Flow, Transaction } from '@/lib/data'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: holdings } = await supabase.from('holdings').select('*').order('sort', { ascending: true })
  const { data: flows } = await supabase.from('flows').select('*').order('created_at', { ascending: false })
  const { data: txs } = await supabase.from('transactions').select('*').order('buy_date', { ascending: true })

  return (
    <DashboardApp
      userEmail={user.email ?? ''}
      initialHoldings={(holdings ?? []) as Holding[]}
      initialFlows={(flows ?? []) as Flow[]}
      initialTx={(txs ?? []) as Transaction[]}
    />
  )
}
