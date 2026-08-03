'use client'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Background from './Background'
import {
  Holding, Flow, DEFAULT_HOLDINGS, POOL_INFO, BRL_RATE, DEFAULT_APORTES,
  value as valOf, usd, pct, brl, fmt,
} from '@/lib/data'

type Tab = 'inicio' | 'carteira' | 'pools' | 'aportes' | 'metas'

export default function DashboardApp({
  userEmail, initialHoldings, initialFlows,
}: { userEmail: string; initialHoldings: Holding[]; initialFlows: Flow[] }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [holdings, setHoldings] = useState<Holding[]>(initialHoldings)
  const [flows, setFlows] = useState<Flow[]>(initialFlows)
  const [tab, setTab] = useState<Tab>('inicio')
  const [live, setLive] = useState<Record<string, number>>({})
  const [userId, setUserId] = useState<string>('')
  const [draft, setDraft] = useState<Holding | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [mvType, setMvType] = useState<'in' | 'out'>('in')
  const [mvVal, setMvVal] = useState('')

  // user id
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? '')) }, [supabase])

  const refetch = useCallback(async () => {
    const { data: h } = await supabase.from('holdings').select('*').order('sort', { ascending: true })
    if (h) setHoldings(h as Holding[])
    const { data: f } = await supabase.from('flows').select('*').order('created_at', { ascending: false })
    if (f) setFlows(f as Flow[])
  }, [supabase])

  // auto-seed na primeira vez
  useEffect(() => {
    if (holdings.length === 0 && userId) {
      const rows = DEFAULT_HOLDINGS.map(r => ({ ...r, user_id: userId }))
      supabase.from('holdings').insert(rows).then(() => refetch())
    }
  }, [holdings.length, userId, supabase, refetch])

  // cotacao ao vivo (CoinGecko)
  useEffect(() => {
    const ids = Array.from(new Set(holdings.filter(h => h.cg_id).map(h => h.cg_id))).join(',')
    if (!ids) return
    let active = true
    const load = () => fetch(`/api/prices?ids=${ids}`).then(r => r.json()).then((d) => {
      if (!active) return
      const map: Record<string, number> = {}
      Object.keys(d || {}).forEach(k => { if (d[k]?.usd) map[k] = d[k].usd })
      setLive(map)
    }).catch(() => {})
    load()
    const t = setInterval(load, 60000)
    return () => { active = false; clearInterval(t) }
  }, [holdings])

  const ph = useCallback((h: Holding): Holding =>
    (h.cg_id && live[h.cg_id]) ? { ...h, price: live[h.cg_id] } : h, [live])

  const priced = useMemo(() => holdings.map(ph), [holdings, ph])

  // ---- totais ----
  const t = useMemo(() => {
    const sum = (arr: Holding[]) => arr.reduce((s, h) => s + valOf(h), 0)
    const inv = (arr: Holding[]) => arr.reduce((s, h) => s + h.invested, 0)
    const crypto = priced.filter(h => h.kind === 'crypto')
    const stock = priced.filter(h => h.kind === 'stock')
    const cash = priced.filter(h => h.kind === 'cash')
    const pool = priced.filter(h => h.kind === 'pool')
    const patr = sum(priced)
    const riskArr = priced.filter(h => ['crypto', 'stock', 'pool'].includes(h.kind))
    const riskInv = inv(riskArr), riskVal = sum(riskArr)
    return {
      patr,
      criptoVal: sum(crypto) + sum(stock), criptoInv: inv(crypto) + inv(stock),
      cashVal: sum(cash), poolVal: sum(pool), poolInv: inv(pool),
      aportTotal: riskInv + inv(cash), pl: riskVal - riskInv, riskInv,
    }
  }, [priced])

  const plpct = t.riskInv ? (t.pl / t.riskInv) * 100 : 0
  const criptoPl = t.criptoInv ? ((t.criptoVal - t.criptoInv) / t.criptoInv) * 100 : 0
  const poolPl = t.poolInv ? ((t.poolVal - t.poolInv) / t.poolInv) * 100 : 0

  // ---- donut ----
  const cats = useMemo(() => {
    const bySym = (s: string) => priced.filter(h => h.symbol === s).reduce((a, h) => a + valOf(h), 0)
    const other = priced.filter(h => h.kind === 'crypto' && !['ETH', 'BTC', 'SOL'].includes(h.symbol)).reduce((a, h) => a + valOf(h), 0)
    const list = [
      { n: 'Ethereum', v: bySym('ETH'), c: '#A855F7' },
      { n: 'Bitcoin', v: bySym('BTC'), c: '#FF2E9A' },
      { n: 'Solana', v: bySym('SOL'), c: '#22D3EE' },
      { n: 'Altcoins', v: other, c: '#C77DFF' },
      { n: 'Ações', v: priced.filter(h => h.kind === 'stock').reduce((a, h) => a + valOf(h), 0), c: '#7C5CFF' },
      { n: 'Caixa', v: priced.filter(h => h.kind === 'cash').reduce((a, h) => a + valOf(h), 0), c: '#9D7CFF' },
      { n: 'Pools', v: priced.filter(h => h.kind === 'pool').reduce((a, h) => a + valOf(h), 0), c: '#2BFFC6' },
    ].filter(x => x.v > 0)
    return list
  }, [priced])

  const donutTot = cats.reduce((s, x) => s + x.v, 0) || 1
  let off = 0
  const segs = cats.map((x, i) => {
    const p = (x.v / donutTot) * 100
    const seg = (
      <circle key={i} cx="21" cy="21" r="15.915" fill="transparent" stroke={x.c} strokeWidth="5.5"
        strokeDasharray={`${p} ${100 - p}`} strokeDashoffset={25 - off} />
    )
    off += p
    return seg
  })

  // ---- CRUD ----
  function openEdit(h: Holding) { setDraft({ ...h }); setIsNew(false) }
  function openNew() {
    const maxSort = holdings.reduce((m, h) => Math.max(m, h.sort ?? 0), 0)
    setDraft({ kind: 'crypto', name: '', symbol: '', cg_id: '', qty: 0, price: 0, invested: 0, current_value: null, meta_pct: 0, color: '#A855F7', sort: maxSort + 1 })
    setIsNew(true)
  }
  async function saveDraft() {
    if (!draft) return
    const payload: any = { ...draft, user_id: userId }
    delete payload.id
    if (isNew) await supabase.from('holdings').insert(payload)
    else await supabase.from('holdings').update(payload).eq('id', draft.id!)
    setDraft(null); await refetch()
  }
  async function delDraft() {
    if (!draft?.id) return
    await supabase.from('holdings').delete().eq('id', draft.id)
    setDraft(null); await refetch()
  }
  async function addFlow() {
    const v = parseFloat(mvVal.replace(',', '.'))
    if (!v || v <= 0) return
    await supabase.from('flows').insert({ user_id: userId, kind: mvType, amount: v })
    setMvVal(''); await refetch()
  }
  async function signOut() { await supabase.auth.signOut(); router.push('/login') }

  const dset = (patch: Partial<Holding>) => setDraft(d => d ? { ...d, ...patch } : d)
  const usdSplit = (n: number) => { const s = usd(n); const i = s.lastIndexOf(','); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i)] }
  const [hi, cent] = usdSplit(t.patr)
  const res = t.patr - t.aportTotal

  // ---- aportes ----
  const extraIn = flows.filter(f => f.kind === 'in').reduce((s, f) => s + f.amount, 0)
  const extraOut = flows.filter(f => f.kind === 'out').reduce((s, f) => s + f.amount, 0)
  const tin = DEFAULT_APORTES.in + extraIn, tout = DEFAULT_APORTES.out + extraOut, net = tin - tout
  const apPl = net ? ((t.patr * BRL_RATE - net) / net) * 100 : 0

  return (
    <>
      <Background />
      <div className="app">
        <div className="top">
          <div className="mark" aria-hidden>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 5.3L20 8l-4 4 1 6-5-3-5 3 1-6-4-4 5.6-.7L12 2z" /></svg>
          </div>
          <div className="brand"><b>Tiger Invest</b><span>Controle de Ativos</span></div>
          <div className="top-actions">
            <div className="top-date">{userEmail.split('@')[0]}<b>ao vivo</b></div>
            <button className="logout" onClick={signOut}>Sair</button>
          </div>
        </div>

        <div className="scroll">
          {/* INICIO */}
          <section className={`screen ${tab === 'inicio' ? 'active' : ''}`}>
            <div className="hero">
              <div className="hero-label">Patrimônio total</div>
              <div className="hero-value num">{hi}<span className="cents">{cent}</span></div>
              <span className={`pill ${t.pl >= 0 ? 'up' : 'down'}`}>
                {t.pl >= 0 ? '▲' : '▼'} {pct(plpct)} · {(t.pl >= 0 ? '+' : '-') + usd(Math.abs(t.pl)).slice(1)}
              </span>
              <div className="hero-row">
                <div className="hero-mini"><div className="k">Aportado</div><div className="v num">{usd(t.aportTotal)}</div></div>
                <div className="hero-mini"><div className="k">Resultado</div><div className={`v num ${res >= 0 ? 'up' : 'down'}`}>{(res >= 0 ? '+' : '-') + usd(Math.abs(res)).slice(1)}</div></div>
              </div>
            </div>

            <div className="card section-gap">
              <div className="eyebrow">Alocação atual</div>
              <div className="donut-wrap">
                <div className="donut">
                  <svg viewBox="0 0 42 42">
                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="rgba(255,255,255,.05)" strokeWidth="5.5" />
                    {segs}
                  </svg>
                  <div className="center"><small>Total</small><b className="num">${fmt(donutTot, 0)}</b></div>
                </div>
                <div className="legend">
                  {cats.map((x, i) => (
                    <div className="leg" key={i}>
                      <span className="dot" style={{ background: x.c, color: x.c }} />
                      <span>{x.n}</span>
                      <span className="lpct">{fmt((x.v / donutTot) * 100, 1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="eyebrow section-gap">Blocos</div>
            <div className="trio">
              <div className="stat"><div className="k">Cripto/Ações</div><div className="v num">{usd(t.criptoVal)}</div><div className={`s num ${criptoPl >= 0 ? 'up' : 'down'}`}>{pct(criptoPl)}</div></div>
              <div className="stat"><div className="k">Caixa</div><div className="v num">{usd(t.cashVal)}</div><div className="s" style={{ color: 'var(--muted)' }}>reserva</div></div>
              <div className="stat"><div className="k">Pools</div><div className="v num">{usd(t.poolVal)}</div><div className={`s num ${poolPl >= 0 ? 'up' : 'down'}`}>{pct(poolPl)}</div></div>
            </div>
          </section>

          {/* CARTEIRA */}
          <section className={`screen ${tab === 'carteira' ? 'active' : ''}`}>
            <div className="eyebrow">Carteira · toque para editar</div>
            {priced.filter(h => h.kind === 'crypto' || h.kind === 'stock').slice().sort((a, b) => valOf(b) - valOf(a)).map(h => {
              const v = valOf(h), pl = v - h.invested, plp = h.invested ? (pl / h.invested) * 100 : 0
              const real = t.patr ? (v / t.patr) * 100 : 0, denom = Math.max(h.meta_pct, real, 1)
              return (
                <div className="asset" key={h.id} onClick={() => openEdit(holdings.find(x => x.id === h.id)!)}>
                  <div className="sym" style={{ background: `linear-gradient(145deg,${h.color},${h.color}88)` }}>{h.symbol.slice(0, 4)}</div>
                  <div className="a-main">
                    <div className="a-name">{h.name}</div>
                    <div className="a-sub">{fmt(h.qty, h.qty < 1 ? 5 : 3)} · {usd(h.price)}</div>
                    <div className="metabar">
                      <div className="track"><div className="fill" style={{ width: `${Math.min(real / denom * 100, 100)}%` }} /><div className="goal" style={{ left: `${Math.min(h.meta_pct / denom * 100, 100)}%` }} /></div>
                      <div className="lbls"><span>real {fmt(real, 1)}%</span><span>meta {h.meta_pct}%</span></div>
                    </div>
                  </div>
                  <div className="a-right"><div className="a-val">{usd(v)}</div><div className={`a-pl ${pl >= 0 ? 'up' : 'down'}`}>{pct(plp)}</div></div>
                </div>
              )
            })}
            <button className="addbtn" onClick={openNew}>+ adicionar ativo</button>
            <div className="card section-gap">
              {holdings.filter(h => h.kind === 'cash').map(h => (
                <div className="kv" key={h.id} onClick={() => openEdit(h)} style={{ cursor: 'pointer' }}>
                  <span className="k">{h.name}</span><span className="v num">{usd(h.current_value ?? 0)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* POOLS */}
          <section className={`screen ${tab === 'pools' ? 'active' : ''}`}>
            {holdings.filter(h => h.kind === 'pool').map(h => {
              const cur = h.current_value ?? 0, pnl = cur - h.invested, pnlp = h.invested ? pnl / h.invested * 100 : 0
              return (
                <div key={h.id}>
                  <div className="hero">
                    <div className="hero-label">{POOL_INFO.dapp} · {POOL_INFO.pair}</div>
                    <div className="hero-value num" style={{ fontSize: 32 }}>{usd(cur)}</div>
                    <span className={`pill ${pnl >= 0 ? 'up' : 'down'}`}>{pnl >= 0 ? '▲' : '▼'} {pct(pnlp)}</span>
                    <div className="chips">
                      <span className="chip">rede <b>{POOL_INFO.chain}</b></span>
                      <span className="chip">entrada <b>{POOL_INFO.entry}</b></span>
                      <span className="chip">taxa <b>1%</b></span>
                    </div>
                  </div>
                  <div className="card section-gap" onClick={() => openEdit(h)} style={{ cursor: 'pointer' }}>
                    <div className="kv"><span className="k">Aporte</span><span className="v num">{usd(h.invested)}</span></div>
                    <div className="kv"><span className="k">Saldo atual</span><span className="v num">{usd(cur)}</span></div>
                    <div className="kv"><span className="k">Resultado (PNL)</span><span className={`v num ${pnl >= 0 ? 'up' : 'down'}`}>{(pnl >= 0 ? '+' : '-') + usd(Math.abs(pnl)).slice(1)}</span></div>
                    <div className="kv"><span className="k">Taxas geradas</span><span className="v num up">{usd(POOL_INFO.fees)}</span></div>
                    <div className="kv"><span className="k">Faixa (range)</span><span className="v num">{fmt(POOL_INFO.low)} – {fmt(POOL_INFO.high)}</span></div>
                    <div className="kv"><span className="k">Dias na pool</span><span className="v num">{POOL_INFO.days} dias</span></div>
                  </div>
                  <div className="card gauge-card section-gap">
                    <div className="eyebrow" style={{ marginBottom: 2 }}>Meta 1% ao dia</div>
                    <Gauge val={POOL_INFO.retDay} />
                    <div className="chips" style={{ justifyContent: 'center' }}>
                      <span className="chip">APR mês <b>{fmt(POOL_INFO.aprMonth)}%</b></span>
                      <span className="chip">APR ano <b>{fmt(POOL_INFO.aprYear)}%</b></span>
                    </div>
                  </div>
                </div>
              )
            })}
          </section>

          {/* APORTES */}
          <section className={`screen ${tab === 'aportes' ? 'active' : ''}`}>
            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 4 }}>Fluxo de capital (R$)</div>
              <div className="big-kv"><span className="k">Total aportado</span><span className="v num up">{brl(tin)}</span></div>
              <div className="big-kv"><span className="k">Total retirado</span><span className="v num down">{brl(tout)}</span></div>
              <div className="big-kv"><span className="k">Saldo líquido aportado</span><span className="v num">{brl(net)}</span></div>
              <div className="big-kv"><span className="k">Resultado sobre aportes</span><span className={`v num ${apPl >= 0 ? 'up' : 'down'}`}>{pct(apPl)}</span></div>
            </div>
            <div className="card section-gap">
              <div className="eyebrow" style={{ marginBottom: 4 }}>Registrar movimento</div>
              <div className="form-row">
                <select value={mvType} onChange={e => setMvType(e.target.value as 'in' | 'out')}>
                  <option value="in">Aporte</option><option value="out">Retirada</option>
                </select>
                <input inputMode="decimal" placeholder="Valor R$" value={mvVal} onChange={e => setMvVal(e.target.value)} />
              </div>
              <div style={{ marginTop: 9 }}><button className="btn" onClick={addFlow}>Adicionar movimento</button></div>
            </div>
            {flows.length > 0 && (
              <div className="card section-gap">
                <div className="eyebrow" style={{ marginBottom: 4 }}>Movimentos</div>
                {flows.map(f => (
                  <div className="flow-item" key={f.id}>
                    <div className={`flow-ic ${f.kind === 'in' ? 'flow-in' : 'flow-out'}`}>{f.kind === 'in' ? '↓' : '↑'}</div>
                    <div className="flow-t"><b>{f.kind === 'in' ? 'Aporte' : 'Retirada'}</b><span>{f.created_at ? new Date(f.created_at).toLocaleDateString('pt-BR') : ''}</span></div>
                    <div className={`flow-v ${f.kind === 'in' ? 'up' : 'down'}`}>{brl(f.amount)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* METAS */}
          <section className={`screen ${tab === 'metas' ? 'active' : ''}`}>
            <div className="eyebrow">Meta de aporte vs. real</div>
            <div className="card">
              {priced.filter(h => h.meta_pct > 0).slice().sort((a, b) => b.meta_pct - a.meta_pct).map((h, idx) => {
                const real = t.patr ? valOf(h) / t.patr * 100 : 0, denom = Math.max(h.meta_pct, real, 1), gap = real - h.meta_pct
                return (
                  <div key={h.id} style={{ padding: '10px 0', borderTop: idx > 0 ? '1px solid var(--line)' : undefined }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 600, fontSize: 13.5 }}>{h.symbol}</span>
                      <span className="num" style={{ fontSize: 12, color: Math.abs(gap) < 0.5 ? 'var(--muted)' : (gap < 0 ? 'var(--pink)' : 'var(--red)') }}>
                        {gap < 0 ? 'faltam ' : 'sobra '}{fmt(Math.abs(gap), 1)}%
                      </span>
                    </div>
                    <div className="metabar" style={{ marginTop: 8 }}>
                      <div className="track"><div className="fill" style={{ width: `${Math.min(real / denom * 100, 100)}%` }} /><div className="goal" style={{ left: `${Math.min(h.meta_pct / denom * 100, 100)}%` }} /></div>
                      <div className="lbls"><span>real {fmt(real, 1)}%</span><span>meta {h.meta_pct}%</span></div>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="foot-note">A barra mostra quanto você já alocou (rosa) contra a meta (linha ciano).</p>
          </section>

          <p className="foot-note">Tiger Invest · cotação de cripto ao vivo via CoinGecko · dados por usuário no Supabase (RLS). Ferramenta de controle — não é recomendação de investimento.</p>
        </div>

        {/* NAV */}
        <nav className="nav">
          {([
            ['inicio', 'Início', <path key="a" d="M3 11l9-8 9 8M5 10v10h14V10" />],
            ['carteira', 'Carteira', <><rect key="a" x="3" y="6" width="18" height="13" rx="2" /><path key="b" d="M16 12h3" /></>],
            ['pools', 'Pools', <path key="a" d="M12 3s6 6 6 10a6 6 0 01-12 0c0-4 6-10 6-10z" />],
            ['aportes', 'Aportes', <><path key="a" d="M7 17V9m0 0l-3 3m3-3l3 3" /><path key="b" d="M17 7v8m0 0l3-3m-3 3l-3-3" /></>],
            ['metas', 'Metas', <><circle key="a" cx="12" cy="12" r="8" /><circle key="b" cx="12" cy="12" r="3.2" /></>],
          ] as [Tab, string, React.ReactNode][]).map(([k, label, icon]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              <svg viewBox="0 0 24 24">{icon}</svg>{label}
            </button>
          ))}
        </nav>

        {/* MODAL */}
        {draft && (
          <div className="modal" onClick={e => { if (e.target === e.currentTarget) setDraft(null) }}>
            <div className="sheet">
              <div className="grabber" />
              <h3>
                <span className="sym" style={{ width: 32, height: 32, background: `linear-gradient(145deg,${draft.color},${draft.color}88)` }}>{(draft.symbol || '?').slice(0, 4)}</span>
                {isNew ? 'Novo ativo' : draft.name}
              </h3>
              {isNew && (<>
                <div className="field"><label>Nome</label><input value={draft.name} onChange={e => dset({ name: e.target.value })} /></div>
                <div className="form-row">
                  <div className="field" style={{ flex: 1 }}><label>Símbolo</label><input value={draft.symbol} onChange={e => dset({ symbol: e.target.value.toUpperCase() })} /></div>
                  <div className="field" style={{ flex: 1 }}><label>ID CoinGecko</label><input value={draft.cg_id} onChange={e => dset({ cg_id: e.target.value })} placeholder="ex: solana" /></div>
                </div>
                <div className="field"><label>Meta (%)</label><input inputMode="decimal" value={draft.meta_pct} onChange={e => dset({ meta_pct: parseFloat(e.target.value.replace(',', '.')) || 0 })} /></div>
              </>)}
              {(draft.kind === 'crypto' || draft.kind === 'stock') && (<>
                <div className="field"><label>Quantidade</label><input inputMode="decimal" value={draft.qty} onChange={e => dset({ qty: parseFloat(e.target.value.replace(',', '.')) || 0 })} /></div>
                <div className="field"><label>Preço atual (US$){draft.cg_id ? ' — ao vivo' : ''}</label><input inputMode="decimal" value={draft.price} onChange={e => dset({ price: parseFloat(e.target.value.replace(',', '.')) || 0 })} /></div>
                {isNew && <div className="field"><label>Total aportado (US$)</label><input inputMode="decimal" value={draft.invested} onChange={e => dset({ invested: parseFloat(e.target.value.replace(',', '.')) || 0 })} /></div>}
              </>)}
              {(draft.kind === 'cash' || draft.kind === 'pool') && (<>
                {draft.kind === 'pool' && <div className="field"><label>Aporte (US$)</label><input inputMode="decimal" value={draft.invested} onChange={e => dset({ invested: parseFloat(e.target.value.replace(',', '.')) || 0 })} /></div>}
                <div className="field"><label>Valor atual (US$)</label><input inputMode="decimal" value={draft.current_value ?? 0} onChange={e => dset({ current_value: parseFloat(e.target.value.replace(',', '.')) || 0 })} /></div>
              </>)}
              <div className="modal-preview"><span>Valor atual</span><b className="num">{usd(valOf(draft))}</b></div>
              <div className="form-row" style={{ marginTop: 16 }}>
                {!isNew && <button className="btn danger" onClick={delDraft}>Excluir</button>}
                <button className="btn ghost" onClick={() => setDraft(null)}>Cancelar</button>
                <button className="btn" onClick={saveDraft}>Salvar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function Gauge({ val }: { val: number }) {
  const max = 2, r = 80, cx = 100, cy = 100
  const ang = (f: number) => Math.PI - f * Math.PI
  const pt = (f: number, rad: number): [number, number] => [cx + rad * Math.cos(ang(f)), cy - rad * Math.sin(ang(f))]
  const arc = (f0: number, f1: number, rad: number, col: string, w: number) => {
    const [a0x, a0y] = pt(f0, rad), [a1x, a1y] = pt(f1, rad)
    const large = f1 - f0 > 0.5 ? 1 : 0
    return `M ${a0x} ${a0y} A ${rad} ${rad} 0 ${large} 1 ${a1x} ${a1y}`
  }
  const f = Math.max(0, Math.min(1, val / max))
  const [nx, ny] = pt(f, r - 6), [tx, ty] = pt(0.5, r + 9), [tx2, ty2] = pt(0.5, r - 9)
  return (
    <div className="gauge">
      <svg viewBox="0 0 200 118">
        <path d={arc(0, 1, r, '', 12)} stroke="rgba(255,255,255,.07)" strokeWidth="12" fill="none" strokeLinecap="round" />
        <path d={arc(0, 0.5, r, '', 12)} stroke="#FF4D6D" strokeWidth="12" fill="none" strokeLinecap="round" />
        <path d={arc(0.5, 1, r, '', 12)} stroke="#2BFF9A" strokeWidth="12" fill="none" strokeLinecap="round" />
        <line x1={tx} y1={ty} x2={tx2} y2={ty2} stroke="#F4EDFF" strokeWidth="2" />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#FF2E9A" strokeWidth="3" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="6" fill="#FF2E9A" />
      </svg>
      <div className="read"><b className="num">{fmt(val)}%</b><small>retorno diário</small></div>
    </div>
  )
}
