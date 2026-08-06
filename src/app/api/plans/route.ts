import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PLANS, rowToPlan } from '@/lib/plans'

export const dynamic = 'force-dynamic'

// Planos públicos (landing/checkout). Lê do banco; cai nos defaults se a tabela não existir.
export async function GET() {
  try {
    const supabase = createClient()
    const { data, error } = await supabase.from('plans').select('*').eq('active', true).order('sort', { ascending: true })
    if (error || !data || !data.length) return NextResponse.json(PLANS)
    return NextResponse.json(data.map(rowToPlan))
  } catch {
    return NextResponse.json(PLANS)
  }
}
