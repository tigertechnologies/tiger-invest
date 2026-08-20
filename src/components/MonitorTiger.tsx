'use client'
import { useEffect, useState } from 'react'

const abbr = (n: number) => {
  if (!n) return '$0'
  if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T'
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'
  return '$' + Math.round(n).toLocaleString('en-US')
}
const pct = (n: number | null) => n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(1) + '%'
const CHAIN_COLOR: Record<string, string> = { Ethereum: '#7C5CFF', Solana: '#2BFFC6', Base: '#3C7DFF', Arbitrum: '#3AA0FF', BSC: '#F5A623', Polygon: '#A855F7' }

function Spark({ data, color, h = 34 }: { data: number[]; color: string; h?: number }) {
  if (!data || data.length < 2) return null
  const W = 100, mn = Math.min(...data), mx = Math.max(...data), sp = mx - mn || 1
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${h - ((v - mn) / sp) * (h - 3) - 1.5}`).join(' ')
  return <svg viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h }}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" /></svg>
}

export default function MonitorTiger() {
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState(false)
  useEffect(() => { fetch('/api/monitor').then(r => r.json()).then(setD).catch(() => setErr(true)) }, [])

  if (err) return <div className="card section-gap"><div className="eyebrow">Monitor Tiger</div><p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 8 }}>Não foi possível carregar os dados on-chain agora. Tente novamente em instantes.</p></div>
  if (!d) return <div className="card section-gap"><div className="eyebrow">Monitor Tiger · on-chain</div><p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 8 }}>Carregando dados on-chain…</p></div>

  const r = d.regime
  // leitura de regime
  const regimeRead = r ? (r.stableDom > 12 ? { t: 'Cautela · muita pólvora seca', c: '#F5A623' } : r.btc > 55 ? { t: 'BTC no comando', c: 'var(--pink-bright)' } : r.alt > 35 ? { t: 'Apetite por altcoins', c: 'var(--green)' } : { t: 'Mercado equilibrado', c: 'var(--muted)' }) : null

  return (
    <>
      <div className="card section-gap">
        <div className="eyebrow" style={{ marginBottom: 4 }}>🐯 Monitor Tiger · leitura on-chain do mercado</div>
        <p className="foot-note" style={{ textAlign: 'left', padding: 0, margin: '0 0 6px' }}>Dados on-chain reais (DefiLlama, CoinGecko, Fear&Greed) — para onde o capital está indo.</p>
      </div>

      {/* 1) Regime / dominância */}
      {r && (
        <div className="card section-gap">
          <div className="mon-h"><span className="eyebrow" style={{ margin: 0 }}>Regime de mercado · dominância</span>{regimeRead && <b style={{ color: regimeRead.c, fontFamily: "'Sora'", fontSize: 12 }}>{regimeRead.t}</b>}</div>
          <div className="mon-dombar">
            <div style={{ width: `${r.btc}%`, background: '#F5A623' }} title="BTC" />
            <div style={{ width: `${r.eth}%`, background: '#7C5CFF' }} title="ETH" />
            <div style={{ width: `${r.alt}%`, background: '#2BFFC6' }} title="Altcoins" />
            <div style={{ width: `${r.stableDom}%`, background: '#5A6473' }} title="Stablecoins" />
          </div>
          <div className="mon-domlbl">
            <span><i style={{ background: '#F5A623' }} />BTC {r.btc.toFixed(1)}%</span>
            <span><i style={{ background: '#7C5CFF' }} />ETH {r.eth.toFixed(1)}%</span>
            <span><i style={{ background: '#2BFFC6' }} />Alts {r.alt.toFixed(1)}%</span>
            <span><i style={{ background: '#5A6473' }} />Stables {r.stableDom.toFixed(1)}%</span>
          </div>
          <div className="mon-stat"><span>Cap. total do mercado</span><b>{abbr(r.totalMcap)} {r.mcapChange24h != null && <em style={{ color: r.mcapChange24h >= 0 ? 'var(--green)' : 'var(--red)' }}>{pct(r.mcapChange24h)} 24h</em>}</b></div>
        </div>
      )}

      {/* 2) Fluxo de capital por rede (TVL DeFi) */}
      {d.chains?.length > 0 && (
        <div className="card section-gap">
          <div className="eyebrow" style={{ marginBottom: 4 }}>Fluxo de capital por rede · TVL DeFi</div>
          <p className="foot-note" style={{ textAlign: 'left', padding: 0, margin: '0 0 10px' }}>Onde o dinheiro está entrando ou saindo. Conecta com suas pools.</p>
          {d.chains.map((c: any) => (
            <div className="mon-chain" key={c.name}>
              <div className="mon-chain-l"><i style={{ background: CHAIN_COLOR[c.name] || '#999' }} /><b>{c.name}</b><span>{abbr(c.tvl)}</span></div>
              <div className="mon-chain-spark"><Spark data={c.spark} color={CHAIN_COLOR[c.name] || '#999'} /></div>
              <div className="mon-chain-r"><span className={c.d7 >= 0 ? 'up' : 'down'}>{pct(c.d7)} 7d</span><span className={c.d30 >= 0 ? 'up' : 'down'}>{pct(c.d30)} 30d</span></div>
            </div>
          ))}
        </div>
      )}

      {/* 3) Pólvora seca (stablecoins) */}
      {d.stables && (
        <div className="card section-gap">
          <div className="mon-h"><span className="eyebrow" style={{ margin: 0 }}>Pólvora seca · oferta de stablecoins</span><b className={d.stables.d30 >= 0 ? 'up' : 'down'} style={{ fontFamily: "'JetBrains Mono'" }}>{pct(d.stables.d30)} 30d</b></div>
          <div className="mon-stat" style={{ marginTop: 6 }}><span>Total em stablecoins</span><b>{abbr(d.stables.total)}</b></div>
          <Spark data={d.stables.spark} color="#2BFFC6" h={44} />
          <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 8 }}>{d.stables.d30 >= 2 ? 'Oferta subindo — capital entrando na lateral, pronto pra comprar (bullish de liquidez).' : d.stables.d30 <= -2 ? 'Oferta caindo — capital saindo de stables (indo pra risco ou saindo do mercado).' : 'Oferta estável — liquidez sem grande mudança.'}</p>
        </div>
      )}

      {/* 4) Medo & Ganância */}
      {d.fng && (() => {
        const v = d.fng.value
        const col = v >= 75 ? 'var(--red)' : v >= 55 ? '#F5A623' : v >= 45 ? 'var(--muted)' : v >= 25 ? '#8BD450' : 'var(--green)'
        return (
          <div className="card section-gap">
            <div className="mon-h"><span className="eyebrow" style={{ margin: 0 }}>Medo & Ganância</span><b style={{ color: col, fontFamily: "'Sora'" }}>{d.fng.label}</b></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
              <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 40, color: col }}>{v}</div>
              <div style={{ flex: 1 }}>
                <div style={{ height: 8, borderRadius: 999, background: 'linear-gradient(90deg,var(--green),#8BD450,#F5A623,var(--red))', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: `${v}%`, top: -3, width: 3, height: 14, background: '#fff', borderRadius: 2, transform: 'translateX(-50%)' }} />
                </div>
                <Spark data={d.fng.spark} color={col} h={30} />
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}
