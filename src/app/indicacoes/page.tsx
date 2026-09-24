import { redirect } from 'next/navigation'
import { createClient } from '@/lib/invest/sb-server'
import ReferralApp from '@/components/invest/ReferralApp'

export const metadata = { title: 'Indicações' }
export const dynamic = 'force-dynamic'

export default async function IndicacoesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
  return <div className="ti"><ReferralApp linkBase={base} /></div>
}
