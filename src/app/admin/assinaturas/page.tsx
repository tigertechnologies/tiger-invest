import { redirect } from 'next/navigation'
import { createClient } from '@/lib/invest/sb-server'
import { loadAdminData } from '@/lib/invest/admin-data'
import AdminApp from '@/components/invest/AdminApp'
import { isAdminUser } from '@/lib/admin-check'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (!(await isAdminUser(user))) redirect('/invest')

  const data = await loadAdminData()
  return <div className="ti"><AdminApp initial={data} /></div>
}
