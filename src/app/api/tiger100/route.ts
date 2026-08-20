import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeTiger100, tiger100History } from '@/lib/tiger100'

export const dynamic = 'force-dynamic'

export async function GET() {
  const live = await computeTiger100()
  let level: number | null = null, history: any[] = []
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('tiger100_snapshot').select('snap_date,level').order('snap_date')
    if (Array.isArray(data) && data.length) { history = data; level = data[data.length - 1].level }
  } catch { }
  // Histórico real reconstruído do CoinGecko (o gráfico não depende de acumular snapshots).
  try {
    const rebuilt = await tiger100History(90)
    const rdates = Object.keys(rebuilt).sort()
    if (rdates.length >= 4) {
      const endReb = rebuilt[rdates[rdates.length - 1]]
      const factor = (level != null && endReb) ? level / endReb : 1        // escala p/ terminar no nível atual
      const rebHist = rdates.map(d => ({ snap_date: d, level: Math.round(rebuilt[d] * factor) }))
      if (rebHist.length > history.length) history = rebHist                // usa se for mais rico que os snapshots
      if (level == null) level = rebHist[rebHist.length - 1].level
    }
  } catch { }
  if (level == null) level = 1000
  return NextResponse.json({ ...(live || {}), level, history })
}
