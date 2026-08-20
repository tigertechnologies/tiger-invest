import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ReferralApp from '@/components/ReferralApp'

export const dynamic = 'force-dynamic'

export default async function IndicacoesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  return <ReferralApp linkBase={base} />
}
