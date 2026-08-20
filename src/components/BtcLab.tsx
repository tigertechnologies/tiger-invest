'use client'
import { useEffect, useState } from 'react'

const usd = (n: number | null) => n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US')
const pct = (n: number | null) => n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(1) + '%'
const abbr = (n: number | null) => n == null ? '—' : n >= 1e12 ? '$' + (n / 1e12).toFixed(2) + 'T' : n >= 1e9 ? '$' + (n / 1e9).toFixed(1) + 'B' : '$' + Math.round(n).toLocaleString('en-US')
const dBR = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}` }

export default function BtcLab() {
  const [b, setB] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetch('/api/btclab').then(r => r.json()).then(setB).catch(() => setB({})).finally(() => setLoading(false)) }, [])

  if (loading) return <><div className="eyebrow">₿ Bitcoin Lab · on-chain</div><div className="skel skel-tall" /><div className="skel skel-block" /><div className="skel skel-block" /></>
  if (!b || b.price == null) return <><div className="eyebrow">₿ Bitcoin Lab · on-chain</div><p className="foot-note">Dados indisponíveis agora. Tente novamente em instantes.</p></>

  const mayer = b.mayer as number | null
  const mayerColor = mayer == null ? 'var(--muted)' : mayer < 1 ? 'var(--green)' : mayer <= 2.4 ? '#F5A623' : 'var(--red)'
  const mayerLabel = mayer == null ? '—' : mayer < 1 ? 'Barato (abaixo da MM200)' : mayer <= 2.4 ? 'Neutro' : 'Caro (historicamente)'
  const mayerPos = mayer == null ? 0 : Math.max(0, Math.min(100, (mayer - 0.5) / (3 - 0.5) * 100)) // escala 0,5×–3×

  // gráfico 200d + linha da MM200
  const chart = (() => {
    const s: number[] = b.priceSeries || []
    if (s.length < 2) return null
    const W = 320, H = 130
    const extra = b.ma200 ? [b.ma200] : []
    const mn = Math.min(...s, ...extra), mx = Math.max(...s, ...extra), sp = mx - mn || 1
    const y = (v: number) => H - ((v - mn) / sp) * (H - 8) - 4
    const path = s.map((v, i) => `${(i / (s.length - 1)) * W},${y(v)}`).join(' ')
    return { W, H, path, yMa: b.ma200 ? y(b.ma200) : null, up: s[s.length - 1] >= s[0] }
  })()

  return (
    <>
      <div className="eyebrow">₿ Bitcoin Lab · on-chain</div>

      {/* Preço + gráfico + MM200 */}
      <div className="card">
        <div className="big-kv"><span className="k">Preço BTC</span><span className="v num">{usd(b.price)}</span></div>
        <div className="big-kv"><span className="k">24h · 7d</span><span className="v num"><span style={{ color: (b.change24h || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>{pct(b.change24h)}</span> · <span style={{ color: (b.change7d || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>{pct(b.change7d)}</span></span></div>
        {chart && (
          <svg viewBox={`0 0 ${chart.W} ${chart.H}`} preserveAspectRatio="none" style={{ width: '100%', height: 130, marginTop: 12 }}>
            {chart.yMa != null && <line x1="0" y1={chart.yMa} x2={chart.W} y2={chart.yMa} stroke="#F5A623" strokeWidth="1.2" strokeDasharray="4 4" />}
            <polyline points={chart.path} fill="none" stroke={chart.up ? 'var(--green)' : 'var(--red)'} strokeWidth="2" strokeLinejoin="round" />
          </svg>
        )}
        <div className="btc-legend"><span>200 dias</span>{b.ma200 != null && <span style={{ color: '#F5A623' }}>— MM200 {usd(b.ma200)}</span>}<span style={{ color: 'var(--red)' }}>{pct(b.athChange)} do topo</span></div>
      </div>

      {/* Mayer Multiple como medidor */}
      <div className="card section-gap">
        <div className="mon-h"><span className="eyebrow" style={{ margin: 0 }}>Valuation · Mayer Multiple</span><b style={{ color: mayerColor, fontFamily: "'Sora'", fontWeight: 800, fontSize: 22 }}>{mayer != null ? mayer.toFixed(2) + '×' : '—'}</b></div>
        <div className="btc-gauge">
          <div className="btc-gauge-track">
            <span className="btc-z" style={{ flex: (1 - 0.5), background: 'rgba(43,255,154,.25)' }} />
            <span className="btc-z" style={{ flex: (2.4 - 1), background: 'rgba(245,166,35,.25)' }} />
            <span className="btc-z" style={{ flex: (3 - 2.4), background: 'rgba(255,77,109,.25)' }} />
            <span className="btc-gauge-mark" style={{ left: `${mayerPos}%`, background: mayerColor }} />
          </div>
          <div className="btc-gauge-lbl"><span>0,5×</span><span>1× barato</span><span>2,4×</span><span>3× caro</span></div>
        </div>
        <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 8 }}>Leitura: <b style={{ color: mayerColor }}>{mayerLabel}</b>. Preço ÷ média de 200 dias ({usd(b.ma200)}). Abaixo de 1× = historicamente barato; acima de ~2,4× = esticado.</p>
      </div>

      {/* Halving */}
      <div className="card section-gap">
        <div className="eyebrow" style={{ marginBottom: 8 }}>Próximo halving</div>
        <div className="trio">
          <div className="stat"><div className="k">Faltam (dias)</div><div className="v num">{b.halvingDays != null ? b.halvingDays.toLocaleString('pt-BR') : '—'}</div></div>
          <div className="stat"><div className="k">Blocos</div><div className="v num">{b.halvingBlocksLeft != null ? (b.halvingBlocksLeft / 1000).toFixed(0) + 'k' : '—'}</div></div>
          <div className="stat"><div className="k">Data est.</div><div className="v num" style={{ fontSize: 14 }}>{b.halvingDate ? dBR(b.halvingDate) : '—'}</div></div>
        </div>
      </div>

      <p className="foot-note">Dados on-chain ao vivo: mempool.space + CoinGecko, sem chave. Não é recomendação de investimento.</p>
    </>
  )
}
