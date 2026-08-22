import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeTiger100, tiger100History } from '@/lib/tiger100'

export const dynamic = 'force-dynamic'

export async function GET() {
  const live = await computeTiger100()
  let level: number | null = null, history: any[] = []
  let snapCount = 0
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('tiger100_snapshot').select('snap_date,level').order('snap_date')
    if (Array.isArray(data) && data.length) { history = data.map((d: any) => ({ ...d, real: true })); snapCount = data.length; level = data[data.length - 1].level }
  } catch { }
  // Histórico reconstruído do CoinGecko (com teto de 15%, igual ao índice ao vivo).
  // Usado só para PREENCHER o período ANTERIOR aos snapshots reais — nunca para
  // substituí-los. Os snapshots reais têm a metodologia completa (100 moedas + tilt);
  // o reconstruído é aproximado (12 maiores + cap) e vem marcado como tal (real:false).
  try {
    const rebuilt = await tiger100History(90)
    const rdates = Object.keys(rebuilt).sort()
    if (rdates.length >= 4) {
      const endReb = rebuilt[rdates[rdates.length - 1]]
      const factor = (level != null && endReb) ? level / endReb : 1        // escala p/ casar com o nível atual
      const rebHist = rdates.map(d => ({ snap_date: d, level: Math.round(rebuilt[d] * factor), real: false }))
      if (snapCount === 0) {
        history = rebHist                                                   // sem snapshots ainda: usa o aproximado inteiro
      } else {
        const firstReal = history[0].snap_date
        const prefix = rebHist.filter(r => r.snap_date < firstReal)        // só os dias ANTERIORES ao 1º snapshot real
        history = [...prefix, ...history]
      }
      if (level == null) level = rebHist[rebHist.length - 1].level
    }
  } catch { }
  if (level == null) level = 1000
  return NextResponse.json({ ...(live || {}), level, history, snapCount })
}
