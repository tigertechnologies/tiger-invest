'use client'
import { useEffect, useState } from 'react'

type Props = {
  par1: string; par2: string; cgId: string
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

export default function PoolChart({ par1, par2, cgId, price, low, high, currentValue, aporte, entryPrice }: Props) {
  const [prices, setPrices] = useState<number[] | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open || prices || !cgId) return
    fetch(`/api/history?id=${encodeURIComponent(cgId)}&days=30`).then(r => r.json()).then(d => setPrices(d.prices || [])).catch(() => setPrices([]))
  }, [open, prices, cgId])

  const inRange = price >= low && price <= high && low > 0
  const cur = split(price, low, high)
  const ent = entryPrice && entryPrice > 0 ? split(entryPrice, low, high) : null

  // ---- Faixa + liquidez (SVG) ----
  const lo = Math.min(low, price) * 0.94, hi = Math.max(high, price) * 1.06
  const X = (p: number) => Math.max(0, Math.min(100, (p - lo) / (hi - lo) * 100))
  const xLow = X(low), xHigh = X(high), xCur = X(price)

  // ---- Gráfico de preço (SVG) ----
  const chart = (() => {
    if (!prices || prices.length < 2) return null
    const W = 300, H = 90
    const series = prices
    const lows = [...series, low, high].filter(v => v > 0)
    const mn = Math.min(...lows), mx = Math.max(...lows)
    const yx = (v: number) => H - ((v - mn) / (mx - mn || 1)) * H
    const xx = (i: number) => (i / (series.length - 1)) * W
    const path = series.map((v, i) => `${i === 0 ? 'M' : 'L'}${xx(i).toFixed(1)},${yx(v).toFixed(1)}`).join(' ')
    return { W, H, path, yLow: yx(low), yHigh: yx(high), yCur: yx(price), up: series[series.length - 1] >= series[0] }
  })()

  return (
    <div className="pcr">
      {/* Faixa + liquidez concentrada */}
      <div className="pcr-sec">Faixa & liquidez</div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="pcr-range">
        <rect x={xLow} y="8" width={Math.max(0.5, xHigh - xLow)} height="24" rx="2" fill="url(#pcrg)" />
        <line x1={xCur} y1="2" x2={xCur} y2="38" stroke={inRange ? '#2BFFC6' : '#FF4D6D'} strokeWidth="1.2" />
        <circle cx={xCur} cy="20" r="2.4" fill={inRange ? '#2BFFC6' : '#FF4D6D'} />
        <defs><linearGradient id="pcrg" x1="0" x2="1"><stop offset="0" stopColor="#A855F7" stopOpacity="0.55" /><stop offset="1" stopColor="#2BFFC6" stopOpacity="0.55" /></linearGradient></defs>
      </svg>
      <div className="pcr-axis"><span>{fmt(low)}</span><span className={inRange ? 'in' : 'out'}>{price > 0 ? fmt(price) : '—'}</span><span>{fmt(high)}</span></div>

      {/* Divisão dos ativos */}
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

      {/* Gráfico do ativo com a faixa */}
      <button className="pcr-toggle" onClick={() => setOpen(!open)}>{open ? 'ocultar gráfico ▲' : `gráfico do ${par1} (30d) com a faixa ▼`}</button>
      {open && (
        <div className="pcr-chartbox">
          {!prices && <div className="pcr-load">carregando…</div>}
          {prices && prices.length < 2 && <div className="pcr-load">sem dados de gráfico para {par1}.</div>}
          {chart && (
            <svg viewBox={`0 0 ${chart.W} ${chart.H}`} preserveAspectRatio="none" className="pcr-chart">
              <rect x="0" y={Math.min(chart.yHigh, chart.yLow)} width={chart.W} height={Math.abs(chart.yLow - chart.yHigh)} fill="rgba(43,255,198,.08)" />
              <line x1="0" y1={chart.yHigh} x2={chart.W} y2={chart.yHigh} stroke="rgba(255,255,255,.25)" strokeWidth="0.7" strokeDasharray="3 3" />
              <line x1="0" y1={chart.yLow} x2={chart.W} y2={chart.yLow} stroke="rgba(255,255,255,.25)" strokeWidth="0.7" strokeDasharray="3 3" />
              <path d={chart.path} fill="none" stroke={chart.up ? '#2BFFC6' : '#FF4D6D'} strokeWidth="1.6" />
              <line x1="0" y1={chart.yCur} x2={chart.W} y2={chart.yCur} stroke="var(--pink-bright)" strokeWidth="0.6" strokeDasharray="2 4" opacity="0.6" />
            </svg>
          )}
          {chart && <div className="pcr-axis" style={{ marginTop: 4 }}><span>faixa {fmt(low)}</span><span className="in">atual {fmt(price)}</span><span>{fmt(high)}</span></div>}
        </div>
      )}
    </div>
  )
}
