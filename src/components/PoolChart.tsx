'use client'
import { useEffect, useState } from 'react'

type Props = {
  par1: string; par2: string; cgId: string; poolId?: string
  price: number; low: number; high: number
  currentValue: number; aporte: number; entryPrice?: number
}

const usd = (n: number) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (n: number, d = 2) => (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })

// v3: fração de valor em cada ativo dado preço P e faixa [pa,pb]
function split(P: number, pa: number, pb: number) {
  if (!(P > 0 && pa > 0 && pb > pa)) return { vol: P >= pb ? 0 : 100, stb: P >= pb ? 100 : 0 }
  const sp = Math.sqrt(P), spa = Math.sqrt(pa), spb = Math.sqrt(pb)
  let a0: number, a1: number
  if (P <= pa) { a0 = (spb - spa) / (spa * spb); a1 = 0 }
  else if (P >= pb) { a0 = 0; a1 = spb - spa }
  else { a0 = (spb - sp) / (sp * spb); a1 = sp - spa }
  const v0 = a0 * P, v1 = a1, t = v0 + v1
  return t ? { vol: v0 / t * 100, stb: v1 / t * 100 } : { vol: 0, stb: 0 }
}

type PnlPoint = { date: string; pnl: number; fees: number; divLoss: number }

export default function PoolChart({ par1, par2, cgId, poolId, price, low, high, currentValue, aporte, entryPrice }: Props) {
  const [prices, setPrices] = useState<number[] | null>(null)
  const [hist, setHist] = useState<PnlPoint[] | null>(null)
  const [tab, setTab] = useState<'liq' | 'pnl' | 'price'>('liq')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    if (tab === 'price' && !prices && cgId) {
      fetch(`/api/history?id=${encodeURIComponent(cgId)}&days=30`).then(r => r.json()).then(d => setPrices(d.prices || [])).catch(() => setPrices([]))
    }
    if (tab === 'pnl' && !hist && poolId) {
      fetch(`/api/poolhistory?pool_id=${encodeURIComponent(poolId)}`).then(r => r.json()).then(d => setHist(d.points || [])).catch(() => setHist([]))
    }
  }, [open, tab, prices, hist, cgId, poolId])

  const inRange = price >= low && price <= high && low > 0
  const cur = split(price, low, high)
  const ent = entryPrice && entryPrice > 0 ? split(entryPrice, low, high) : null

  // ---- Faixa & liquidez concentrada (distribuição em barras, estilo Revert) ----
  // Numa posição v3/v4, a SUA liquidez é constante dentro de [low,high] e zero fora.
  // Desenhamos N barras: cheias dentro da faixa, vazias fora, marcador no preço atual.
  const liqDist = (() => {
    const lo = Math.min(low, price) * 0.90, hi = Math.max(high, price) * 1.10
    if (!(hi > lo)) return null
    const N = 40
    const bars = Array.from({ length: N }, (_, i) => {
      const p0 = lo + (hi - lo) * (i / N), p1 = lo + (hi - lo) * ((i + 1) / N)
      const mid = (p0 + p1) / 2
      const inside = mid >= low && mid <= high
      return { inside, active: price >= p0 && price < p1 }
    })
    const X = (p: number) => Math.max(0, Math.min(100, (p - lo) / (hi - lo) * 100))
    return { bars, xCur: X(price), xLow: X(low), xHigh: X(high), lo, hi }
  })()

  // ---- Curva de PnL vs HODL no tempo (a partir dos snapshots do cron) ----
  const pnlChart = (() => {
    if (!hist || hist.length < 2) return null
    const W = 300, H = 90
    const vals = hist.map(p => p.pnl)
    const mn = Math.min(0, ...vals), mx = Math.max(0, ...vals)
    const yx = (v: number) => H - ((v - mn) / (mx - mn || 1)) * H
    const xx = (i: number) => (i / (hist.length - 1)) * W
    const path = hist.map((p, i) => `${i === 0 ? 'M' : 'L'}${xx(i).toFixed(1)},${yx(p.pnl).toFixed(1)}`).join(' ')
    const last = vals[vals.length - 1]
    return { W, H, path, yZero: yx(0), up: last >= 0, last, first: hist[0].date, lastDate: hist[hist.length - 1].date }
  })()

  // ---- Gráfico de preço do ativo (30d) ----
  const priceChart = (() => {
    if (!prices || prices.length < 2) return null
    const W = 300, H = 90
    const lows = [...prices, low, high].filter(v => v > 0)
    const mn = Math.min(...lows), mx = Math.max(...lows)
    const yx = (v: number) => H - ((v - mn) / (mx - mn || 1)) * H
    const xx = (i: number) => (i / (prices.length - 1)) * W
    const path = prices.map((v, i) => `${i === 0 ? 'M' : 'L'}${xx(i).toFixed(1)},${yx(v).toFixed(1)}`).join(' ')
    return { W, H, path, yLow: yx(low), yHigh: yx(high), yCur: yx(price), up: prices[prices.length - 1] >= prices[0] }
  })()

  return (
    <div className="pcr">
      {/* Faixa & liquidez — distribuição em barras */}
      <div className="pcr-sec">Faixa & liquidez</div>
      {liqDist && (
        <div className="pcr-liq">
          {liqDist.bars.map((b, i) => (
            <div key={i} className={`pcr-bar ${b.inside ? 'in' : 'out'} ${b.active ? 'act' : ''}`} style={{ height: b.inside ? '100%' : '28%' }} />
          ))}
          <div className="pcr-cur" style={{ left: `${liqDist.xCur}%` }} title={`preço ${fmt(price)}`} />
        </div>
      )}
      <div className="pcr-axis"><span>{fmt(low)}</span><span className={inRange ? 'in' : 'out'}>{price > 0 ? fmt(price) : '—'}</span><span>{fmt(high)}</span></div>

      {/* Ativos na posição */}
      <div className="pcr-sec" style={{ marginTop: 14 }}>Ativos na posição</div>
      <div className="pcr-assets">
        <div className="pcr-arow"><span className="pcr-lab">Agora</span>
          <span>{fmt(currentValue * cur.vol / 100 / (price || 1), 5)} {par1} <b>({usd(currentValue * cur.vol / 100)})</b></span>
          <span>{fmt(currentValue * cur.stb / 100, 2)} {par2} <b>({usd(currentValue * cur.stb / 100)})</b></span>
        </div>
        {ent && (<div className="pcr-arow"><span className="pcr-lab">Entrada</span>
          <span>{fmt(aporte * ent.vol / 100 / entryPrice!, 5)} {par1} <b>({usd(aporte * ent.vol / 100)})</b></span>
          <span>{fmt(aporte * ent.stb / 100, 2)} {par2} <b>({usd(aporte * ent.stb / 100)})</b></span>
        </div>)}
      </div>

      {/* Gráficos com abas */}
      <button className="pcr-toggle" onClick={() => setOpen(!open)}>{open ? 'ocultar gráficos ▲' : 'ver gráficos ▼'}</button>
      {open && (
        <div className="pcr-chartbox">
          <div className="pcr-tabs">
            <button className={tab === 'liq' ? 'on' : ''} onClick={() => setTab('liq')}>Liquidez</button>
            <button className={tab === 'pnl' ? 'on' : ''} onClick={() => setTab('pnl')}>PnL (vs HODL)</button>
            <button className={tab === 'price' ? 'on' : ''} onClick={() => setTab('price')}>Preço 30d</button>
          </div>

          {tab === 'liq' && liqDist && (
            <div className="pcr-bigliq">
              {liqDist.bars.map((b, i) => (
                <div key={i} className={`pcr-bar ${b.inside ? 'in' : 'out'} ${b.active ? 'act' : ''}`} style={{ height: b.inside ? '100%' : '24%' }} />
              ))}
              <div className="pcr-cur" style={{ left: `${liqDist.xCur}%` }} />
            </div>
          )}

          {tab === 'pnl' && (
            <>
              {!hist && <div className="pcr-load">carregando…</div>}
              {hist && hist.length < 2 && <div className="pcr-load">O gráfico de PnL vai aparecer conforme os dias passam — ele começa a ser registrado a partir de agora (1 ponto por dia). {hist.length === 1 ? '1 dia registrado.' : 'nenhum dia ainda.'}</div>}
              {pnlChart && (<>
                <svg viewBox={`0 0 ${pnlChart.W} ${pnlChart.H}`} preserveAspectRatio="none" className="pcr-chart">
                  <line x1="0" y1={pnlChart.yZero} x2={pnlChart.W} y2={pnlChart.yZero} stroke="rgba(255,255,255,.25)" strokeWidth="0.6" strokeDasharray="3 3" />
                  <path d={`${pnlChart.path} L${pnlChart.W},${pnlChart.yZero} L0,${pnlChart.yZero} Z`} fill={pnlChart.up ? 'rgba(43,255,198,.12)' : 'rgba(255,77,109,.12)'} stroke="none" />
                  <path d={pnlChart.path} fill="none" stroke={pnlChart.up ? '#2BFFC6' : '#FF4D6D'} strokeWidth="1.8" />
                </svg>
                <div className="pcr-axis" style={{ marginTop: 4 }}><span>{pnlChart.first}</span><span className={pnlChart.up ? 'in' : 'out'}>resultado {usd(pnlChart.last)}</span><span>{pnlChart.lastDate}</span></div>
              </>)}
            </>
          )}

          {tab === 'price' && (
            <>
              {!prices && <div className="pcr-load">carregando…</div>}
              {prices && prices.length < 2 && <div className="pcr-load">sem dados de gráfico para {par1}.</div>}
              {priceChart && (<>
                <svg viewBox={`0 0 ${priceChart.W} ${priceChart.H}`} preserveAspectRatio="none" className="pcr-chart">
                  <rect x="0" y={Math.min(priceChart.yHigh, priceChart.yLow)} width={priceChart.W} height={Math.abs(priceChart.yLow - priceChart.yHigh)} fill="rgba(43,255,198,.08)" />
                  <line x1="0" y1={priceChart.yHigh} x2={priceChart.W} y2={priceChart.yHigh} stroke="rgba(255,255,255,.25)" strokeWidth="0.7" strokeDasharray="3 3" />
                  <line x1="0" y1={priceChart.yLow} x2={priceChart.W} y2={priceChart.yLow} stroke="rgba(255,255,255,.25)" strokeWidth="0.7" strokeDasharray="3 3" />
                  <path d={priceChart.path} fill="none" stroke={priceChart.up ? '#2BFFC6' : '#FF4D6D'} strokeWidth="1.6" />
                  <line x1="0" y1={priceChart.yCur} x2={priceChart.W} y2={priceChart.yCur} stroke="var(--pink-bright)" strokeWidth="0.6" strokeDasharray="2 4" opacity="0.6" />
                </svg>
                <div className="pcr-axis" style={{ marginTop: 4 }}><span>faixa {fmt(low)}</span><span className="in">atual {fmt(price)}</span><span>{fmt(high)}</span></div>
              </>)}
            </>
          )}
        </div>
      )}
    </div>
  )
}
