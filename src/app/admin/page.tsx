import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadAdminData } from '@/lib/admin-data'
import AdminApp from '@/components/AdminApp'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admins = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (!admins.includes((user.email || '').toLowerCase())) redirect('/dashboard')

  const data = await loadAdminData()
  return <AdminApp initial={data} />
}
