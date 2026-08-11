import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeTiger100 } from '@/lib/tiger100'

export const dynamic = 'force-dynamic'

export async function GET() {
  const live = await computeTiger100()
  let level: number | null = null, history: any[] = []
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('tiger100_snapshot').select('snap_date,level').order('snap_date')
    if (Array.isArray(data) && data.length) { history = data; level = data[data.length - 1].level }
  } catch { }
  if (level == null) level = 1000
  return NextResponse.json({ ...(live || {}), level, history })
}
