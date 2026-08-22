import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Histórico diário de UMA pool do usuário logado (para o gráfico de PnL no tempo).
// Retorna os snapshots que o cron vem acumulando — vazio até o 1º dia salvo.
export async function GET(req: Request) {
  const u = new URL(req.url)
  const poolId = u.searchParams.get('pool_id') || ''
  if (!poolId) return NextResponse.json({ points: [] })
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ points: [] })
    const { data } = await supabase
      .from('pool_snapshot')
      .select('snap_date,current_value,aporte,fees,entry_price,par1_price')
      .eq('user_id', user.id).eq('pool_id', poolId)
      .order('snap_date', { ascending: true })
    // deriva PnL vs HODL por dia: hodl = aporte/2 + aporte/2 * (par1/entry); result = saldo + fees - hodl
    const points = (data || []).map((r: any) => {
      const hasHodl = r.entry_price > 0 && r.par1_price > 0
      const hodl = hasHodl ? (r.aporte / 2) + (r.aporte / 2) * (r.par1_price / r.entry_price) : r.aporte
      return {
        date: r.snap_date,
        pnl: +(r.current_value + r.fees - hodl).toFixed(2),   // resultado vs HODL
        fees: +r.fees.toFixed(4),
        divLoss: +(r.current_value - hodl).toFixed(2),        // divergência (IL em $)
      }
    })
    return NextResponse.json({ points })
  } catch { return NextResponse.json({ points: [] }) }
}
