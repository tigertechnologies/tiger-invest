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

  if (loading) return <><div className="eyebrow">₿ Bitcoin Lab · on-chain</div><p className="foot-note">Lendo a rede Bitcoin…</p></>
  if (!b || b.price == null) return <><div className="eyebrow">₿ Bitcoin Lab · on-chain</div><p className="foot-note">Dados indisponíveis agora. Tente novamente em instantes.</p></>

  const eh = b.hashrate != null ? (b.hashrate / 1e18).toFixed(0) : null
  const diffT = b.difficulty != null ? (b.difficulty / 1e12).toFixed(1) : null
  const mayer = b.mayer as number | null
  const mayerColor = mayer == null ? 'var(--muted)' : mayer < 1 ? 'var(--green)' : mayer <= 2.4 ? '#F5A623' : 'var(--red)'
  const mayerLabel = mayer == null ? '—' : mayer < 1 ? 'Barato (abaixo da MM200)' : mayer <= 2.4 ? 'Neutro' : 'Caro (historicamente)'
  const mayerPos = mayer == null ? 0 : Math.max(0, Math.min(100, (mayer - 0.5) / (3 - 0.5) * 100)) // escala 0,5×–3×

  // saúde da rede pela taxa rápida + mempool
  const fast = b.fees?.fast ?? null
  const health = fast == null ? null : fast <= 6 ? { t: 'Tranquila', c: 'var(--green)' } : fast <= 25 ? { t: 'Normal', c: '#F5A623' } : { t: 'Congestionada', c: 'var(--red)' }

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

  const epochDays = b.adjustRemaining != null ? Math.round(b.adjustRemaining * 10 / 60 / 24) : null

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

      {/* Rede + ajuste de dificuldade */}
      <div className="card section-gap">
        <div className="eyebrow" style={{ marginBottom: 8 }}>Segurança da rede</div>
        <div className="trio">
          <div className="stat"><div className="k">Hashrate</div><div className="v num">{eh ? eh + ' EH/s' : '—'}</div></div>
          <div className="stat"><div className="k">Dificuldade</div><div className="v num">{diffT ? diffT + 'T' : '—'}</div></div>
          <div className="stat"><div className="k">Bloco</div><div className="v num" style={{ fontSize: 15 }}>{b.height != null ? b.height.toLocaleString('pt-BR') : '—'}</div></div>
        </div>
        {b.adjustProgress != null && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
              <span>Ajuste de dificuldade · {b.adjustProgress.toFixed(0)}% do ciclo</span>
              <b style={{ color: (b.nextAdjustPct || 0) >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: "'JetBrains Mono'" }}>próx. {pct(b.nextAdjustPct)}</b>
            </div>
            <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${b.adjustProgress}%`, background: 'linear-gradient(90deg,#7C5CFF,#FF2E9A)', borderRadius: 999 }} /></div>
            {b.adjustRemaining != null && <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 6 }}>Faltam <b>{b.adjustRemaining.toLocaleString('pt-BR')}</b> blocos {epochDays != null ? <>(~{epochDays}d)</> : null} para o reajuste.</p>}
          </div>
        )}
      </div>

      {/* Taxas + mempool + saúde */}
      <div className="card section-gap">
        <div className="mon-h"><span className="eyebrow" style={{ margin: 0 }}>Taxas & mempool</span>{health && <b style={{ color: health.c, fontFamily: "'Sora'" }}>Rede {health.t}</b>}</div>
        {b.fees ? <div className="trio" style={{ marginTop: 8 }}>
          <div className="stat"><div className="k">Rápida</div><div className="v num">{b.fees.fast} <span style={{ fontSize: 10, color: 'var(--muted)' }}>sat/vB</span></div></div>
          <div className="stat"><div className="k">~30 min</div><div className="v num">{b.fees.halfHour}</div></div>
          <div className="stat"><div className="k">Econômica</div><div className="v num">{b.fees.economy}</div></div>
        </div> : <p className="foot-note">Indisponível agora.</p>}
        {b.mempoolCount != null && <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 8 }}><b>{b.mempoolCount.toLocaleString('pt-BR')}</b> transações na fila (mempool).{health ? ` Rede ${health.t.toLowerCase()} — bom momento pra ${health.t === 'Congestionada' ? 'esperar' : 'transacionar'}.` : ''}</p>}
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
