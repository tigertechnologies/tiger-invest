'use client'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Background from './Background'
import {
  Holding, Flow, Transaction, Live, DEFAULT_HOLDINGS, POOL_INFO, BRL_RATE, DEFAULT_APORTES,
  value as valOf, usd, pct, brl, fmt, daysSince,
} from '@/lib/data'

type Tab = 'inicio' | 'carteira' | 'cotacao' | 'pools' | 'aportes' | 'metas'
const uniq = (a: string[]) => Array.from(new Set(a.filter(Boolean)))
const agg = (arr: string[]) => { const u = uniq(arr); return u.length === 0 ? '—' : u.length === 1 ? u[0] : 'várias' }
const num = (v: string) => parseFloat(v.replace(',', '.')) || 0

export default function DashboardApp({
  userEmail, initialHoldings, initialFlows, initialTx,
}: { userEmail: string; initialHoldings: Holding[]; initialFlows: Flow[]; initialTx: Transaction[] }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [holdings, setHoldings] = useState<Holding[]>(initialHoldings)
  const [flows, setFlows] = useState<Flow[]>(initialFlows)
  const [txs, setTxs] = useState<Transaction[]>(initialTx)
  const [tab, setTab] = useState<Tab>('inicio')
  const [live, setLive] = useState<Record<string, Live>>({})
  const [brlRate, setBrlRate] = useState<{ tether: number; usdc: number }>({ tether: BRL_RATE, usdc: BRL_RATE })
  const [userId, setUserId] = useState('')
  const [detail, setDetail] = useState<Holding | null>(null)
  const [editDraft, setEditDraft] = useState<Holding | null>(null)
  const [txForm, setTxForm] = useState<any | null>(null)
  const [mvType, setMvType] = useState<'in' | 'out'>('in')
  const [mvVal, setMvVal] = useState('')

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? '')) }, [supabase])

  const refetch = useCallback(async () => {
    const [h, f, t] = await Promise.all([
      supabase.from('holdings').select('*').order('sort', { ascending: true }),
      supabase.from('flows').select('*').order('created_at', { ascending: false }),
      supabase.from('transactions').select('*').order('buy_date', { ascending: true }),
    ])
    if (h.data) setHoldings(h.data as Holding[])
    if (f.data) setFlows(f.data as Flow[])
    if (t.data) setTxs(t.data as Transaction[])
  }, [supabase])

  // auto-seed (holdings + 1 transação por cripto)
  useEffect(() => {
    if (holdings.length === 0 && userId) {
      (async () => {
        await supabase.from('holdings').insert(DEFAULT_HOLDINGS.map(r => ({ ...r, user_id: userId })))
        const cryptos = DEFAULT_HOLDINGS.filter(r => r.kind === 'crypto')
        await supabase.from('transactions').insert(cryptos.map(r => ({
          user_id: userId, symbol: r.symbol, name: r.name, cg_id: r.cg_id, color: r.color,
          rede: 'BASE', corretora: 'METAMASK', carteira: 'METAMASK', buy_date: '2025-06-27',
          qty: r.qty, buy_price: r.qty ? r.invested / r.qty : 0, stop_limit: 0, target: 0, meta_pct: r.meta_pct,
        })))
        await refetch()
      })()
    }
  }, [holdings.length, userId, supabase, refetch])

  // back-fill: conta antiga (tem holdings mas nenhuma transação) -> gera 1 compra por cripto
  useEffect(() => {
    if (userId && txs.length === 0) {
      const cryptos = holdings.filter(h => h.kind === 'crypto')
      if (cryptos.length > 0) {
        supabase.from('transactions').insert(cryptos.map(h => ({
          user_id: userId, symbol: h.symbol, name: h.name, cg_id: h.cg_id, color: h.color,
          rede: 'BASE', corretora: 'METAMASK', carteira: 'METAMASK', buy_date: '2025-06-27',
          qty: h.qty, buy_price: h.qty ? h.invested / h.qty : 0, stop_limit: 0, target: 0, meta_pct: h.meta_pct,
        }))).then(() => refetch())
      }
    }
  }, [userId, txs.length, holdings, supabase, refetch])

  // cotação ao vivo (markets + BRL)
  useEffect(() => {
    const ids = Array.from(new Set(holdings.filter(h => h.cg_id).map(h => h.cg_id)))
    const withStable = Array.from(new Set([...ids, 'tether', 'usd-coin'])).join(',')
    let active = true
    const load = () => fetch(`/api/prices?ids=${withStable}`).then(r => r.json()).then(d => {
      if (!active) return
      setLive(d.coins || {})
      setBrlRate({ tether: d.brl?.tether || BRL_RATE, usdc: d.brl?.['usd-coin'] || BRL_RATE })
    }).catch(() => {})
    load()
    const t = setInterval(load, 60000)
    return () => { active = false; clearInterval(t) }
  }, [holdings])

  const ph = useCallback((h: Holding): Holding =>
    (h.cg_id && live[h.cg_id]?.usd) ? { ...h, price: live[h.cg_id].usd } : h, [live])
  const priced = useMemo(() => holdings.map(ph), [holdings, ph])

  const t = useMemo(() => {
    const sum = (a: Holding[]) => a.reduce((s, h) => s + valOf(h), 0)
    const inv = (a: Holding[]) => a.reduce((s, h) => s + h.invested, 0)
    const crypto = priced.filter(h => h.kind === 'crypto'), stock = priced.filter(h => h.kind === 'stock')
    const cash = priced.filter(h => h.kind === 'cash'), pool = priced.filter(h => h.kind === 'pool')
    const risk = priced.filter(h => ['crypto', 'stock', 'pool'].includes(h.kind))
    return {
      patr: sum(priced), criptoVal: sum(crypto) + sum(stock), criptoInv: inv(crypto) + inv(stock),
      cashVal: sum(cash), poolVal: sum(pool), poolInv: inv(pool),
      totalInv: inv(risk) + inv(cash), aportTotal: inv(risk) + inv(cash),
      pl: sum(risk) - inv(risk), riskInv: inv(risk),
    }
  }, [priced])

  const plpct = t.riskInv ? (t.pl / t.riskInv) * 100 : 0
  const criptoPl = t.criptoInv ? ((t.criptoVal - t.criptoInv) / t.criptoInv) * 100 : 0
  const poolPl = t.poolInv ? ((t.poolVal - t.poolInv) / t.poolInv) * 100 : 0

  const cats = useMemo(() => {
    const bs = (s: string) => priced.filter(h => h.symbol === s).reduce((a, h) => a + valOf(h), 0)
    const other = priced.filter(h => h.kind === 'crypto' && !['ETH', 'BTC', 'SOL'].includes(h.symbol)).reduce((a, h) => a + valOf(h), 0)
    return [
      { n: 'Ethereum', v: bs('ETH'), c: '#A855F7' }, { n: 'Bitcoin', v: bs('BTC'), c: '#FF2E9A' },
      { n: 'Solana', v: bs('SOL'), c: '#22D3EE' }, { n: 'Altcoins', v: other, c: '#C77DFF' },
      { n: 'Ações', v: priced.filter(h => h.kind === 'stock').reduce((a, h) => a + valOf(h), 0), c: '#7C5CFF' },
      { n: 'Caixa', v: priced.filter(h => h.kind === 'cash').reduce((a, h) => a + valOf(h), 0), c: '#9D7CFF' },
      { n: 'Pools', v: priced.filter(h => h.kind === 'pool').reduce((a, h) => a + valOf(h), 0), c: '#2BFFC6' },
    ].filter(x => x.v > 0)
  }, [priced])
  const donutTot = cats.reduce((s, x) => s + x.v, 0) || 1
  let off = 0
  const segs = cats.map((x, i) => { const p = x.v / donutTot * 100; const s = (<circle key={i} cx="21" cy="21" r="15.915" fill="transparent" stroke={x.c} strokeWidth="5.5" strokeDasharray={`${p} ${100 - p}`} strokeDashoffset={25 - off} />); off += p; return s })

  // ---- recompute holding from its transactions ----
  const recompute = useCallback(async (symbol: string, name: string, cg: string, color: string, meta: number) => {
    const { data } = await supabase.from('transactions').select('*').eq('symbol', symbol)
    const list = (data || []) as Transaction[]
    if (list.length === 0) { await supabase.from('holdings').delete().eq('symbol', symbol).eq('kind', 'crypto'); return }
    const qty = list.reduce((s, x) => s + x.qty, 0), invested = list.reduce((s, x) => s + x.qty * x.buy_price, 0)
    const existing = holdings.find(h => h.symbol === symbol && h.kind === 'crypto')
    const payload: any = { user_id: userId, kind: 'crypto', symbol, name, cg_id: cg, color, meta_pct: meta, qty, price: existing?.price ?? (qty ? invested / qty : 0), invested, current_value: null, sort: existing?.sort ?? 50 }
    if (existing?.id) await supabase.from('holdings').update(payload).eq('id', existing.id)
    else await supabase.from('holdings').insert(payload)
  }, [supabase, holdings, userId])

  async function saveBuy() {
    if (!txForm) return
    const f = txForm
    const payload = {
      user_id: userId, symbol: f.symbol.toUpperCase(), name: f.name || f.symbol, cg_id: f.cg_id, color: f.color || '#A855F7',
      rede: f.rede, corretora: f.corretora, carteira: f.carteira, buy_date: f.buy_date,
      qty: num(String(f.qty)), buy_price: num(String(f.buy_price)), stop_limit: num(String(f.stop_limit)), target: num(String(f.target)), meta_pct: num(String(f.meta_pct)),
    }
    await supabase.from('transactions').insert(payload)
    await recompute(payload.symbol, payload.name, payload.cg_id, payload.color, payload.meta_pct)
    setTxForm(null); setDetail(null); await refetch()
  }
  async function delTx(id: string, h: Holding) {
    await supabase.from('transactions').delete().eq('id', id)
    await recompute(h.symbol, h.name, h.cg_id, h.color, h.meta_pct)
    await refetch()
  }
  async function delAsset(h: Holding) {
    await supabase.from('transactions').delete().eq('symbol', h.symbol)
    if (h.id) await supabase.from('holdings').delete().eq('id', h.id)
    setDetail(null); await refetch()
  }
  async function saveEdit() {
    if (!editDraft?.id) return
    await supabase.from('holdings').update({ current_value: editDraft.current_value, invested: editDraft.invested }).eq('id', editDraft.id)
    setEditDraft(null); await refetch()
  }
  async function addFlow() {
    const v = num(mvVal); if (v <= 0) return
    await supabase.from('flows').insert({ user_id: userId, kind: mvType, amount: v }); setMvVal(''); await refetch()
  }
  async function signOut() { await supabase.auth.signOut(); router.push('/login') }

  const usdSplit = (n: number) => { const s = usd(n); const i = s.lastIndexOf(','); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i)] }
  const [hi, cent] = usdSplit(t.patr); const res = t.patr - t.aportTotal
  const extraIn = flows.filter(f => f.kind === 'in').reduce((s, f) => s + f.amount, 0)
  const extraOut = flows.filter(f => f.kind === 'out').reduce((s, f) => s + f.amount, 0)
  const tin = DEFAULT_APORTES.in + extraIn, tout = DEFAULT_APORTES.out + extraOut, net = tin - tout
  const apPl = net ? ((t.patr * brlRate.tether - net) / net) * 100 : 0

  const cryptoHoldings = priced.filter(h => h.kind === 'crypto' || h.kind === 'stock').slice().sort((a, b) => valOf(b) - valOf(a))
  const openBuy = (h: Holding | null) => setTxForm(h
    ? { symbol: h.symbol, name: h.name, cg_id: h.cg_id, color: h.color, meta_pct: h.meta_pct, rede: '', corretora: '', carteira: '', buy_date: new Date().toISOString().slice(0, 10), qty: '', buy_price: live[h.cg_id]?.usd ?? h.price, stop_limit: '', target: '', isNew: false }
    : { symbol: '', name: '', cg_id: '', color: '#A855F7', meta_pct: '', rede: '', corretora: '', carteira: '', buy_date: new Date().toISOString().slice(0, 10), qty: '', buy_price: '', stop_limit: '', target: '', isNew: true })

  const chColor = (v: number | null | undefined) => v == null ? 'var(--muted)' : v >= 0 ? 'var(--green)' : 'var(--red)'
  const chTxt = (v: number | null | undefined) => v == null ? '—' : pct(v)

  return (
    <>
      <Background />
      <div className="app">
        <div className="top">
          <div className="mark" aria-hidden><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 5.3L20 8l-4 4 1 6-5-3-5 3 1-6-4-4 5.6-.7L12 2z" /></svg></div>
          <div className="brand"><b>Tiger Invest</b><span>Controle de Ativos</span></div>
          <div className="top-actions"><div className="top-date">{userEmail.split('@')[0]}<b>ao vivo</b></div><button className="logout" onClick={signOut}>Sair</button></div>
        </div>

        <div className="scroll">
          {/* INÍCIO */}
          <section className={`screen ${tab === 'inicio' ? 'active' : ''}`}>
            <div className="hero">
              <div className="hero-label">Patrimônio total</div>
              <div className="hero-value num">{hi}<span className="cents">{cent}</span></div>
              <span className={`pill ${t.pl >= 0 ? 'up' : 'down'}`}>{t.pl >= 0 ? '▲' : '▼'} {pct(plpct)} · {(t.pl >= 0 ? '+' : '-') + usd(Math.abs(t.pl)).slice(1)}</span>
              <div className="hero-row">
                <div className="hero-mini"><div className="k">Aportado</div><div className="v num">{usd(t.aportTotal)}</div></div>
                <div className="hero-mini"><div className="k">Resultado</div><div className={`v num ${res >= 0 ? 'up' : 'down'}`}>{(res >= 0 ? '+' : '-') + usd(Math.abs(res)).slice(1)}</div></div>
              </div>
            </div>
            <div className="card section-gap">
              <div className="eyebrow">Alocação atual</div>
              <div className="donut-wrap">
                <div className="donut"><svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="15.915" fill="transparent" stroke="rgba(255,255,255,.05)" strokeWidth="5.5" />{segs}</svg><div className="center"><small>Total</small><b className="num">${fmt(donutTot, 0)}</b></div></div>
                <div className="legend">{cats.map((x, i) => (<div className="leg" key={i}><span className="dot" style={{ background: x.c, color: x.c }} /><span>{x.n}</span><span className="lpct">{fmt(x.v / donutTot * 100, 1)}%</span></div>))}</div>
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
            <div className="eyebrow">Carteira · toque para ver detalhes</div>
            {cryptoHoldings.map(h => {
              const v = valOf(h), pl = v - h.invested, plp = h.invested ? pl / h.invested * 100 : 0
              const real = t.patr ? v / t.patr * 100 : 0, denom = Math.max(h.meta_pct, real, 1)
              return (
                <div className="asset" key={h.id} onClick={() => setDetail(holdings.find(x => x.id === h.id)!)}>
                  <div className="sym" style={{ background: `linear-gradient(145deg,${h.color},${h.color}88)` }}>{h.symbol.slice(0, 4)}</div>
                  <div className="a-main"><div className="a-name">{h.name}</div><div className="a-sub">{fmt(h.qty, h.qty < 1 ? 5 : 3)} · {usd(h.price)}</div>
                    <div className="metabar"><div className="track"><div className="fill" style={{ width: `${Math.min(real / denom * 100, 100)}%` }} /><div className="goal" style={{ left: `${Math.min(h.meta_pct / denom * 100, 100)}%` }} /></div><div className="lbls"><span>real {fmt(real, 1)}%</span><span>meta {h.meta_pct}%</span></div></div>
                  </div>
                  <div className="a-right"><div className="a-val">{usd(v)}</div><div className={`a-pl ${pl >= 0 ? 'up' : 'down'}`}>{pct(plp)}</div></div>
                </div>
              )
            })}
            <button className="addbtn" onClick={() => openBuy(null)}>+ registrar compra / novo ativo</button>
            <div className="card section-gap">
              {holdings.filter(h => h.kind === 'cash' || h.kind === 'pool').map(h => (
                <div className="kv" key={h.id} onClick={() => setEditDraft({ ...h })} style={{ cursor: 'pointer' }}>
                  <span className="k">{h.name}</span><span className="v num">{usd(h.current_value ?? 0)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* COTAÇÃO */}
          <section className={`screen ${tab === 'cotacao' ? 'active' : ''}`}>
            <div className="eyebrow">Cotação ao vivo · CoinGecko</div>
            {priced.filter(h => h.kind === 'crypto' && h.cg_id).sort((a, b) => valOf(b) - valOf(a)).map(h => {
              const L = live[h.cg_id]
              return (
                <div className="qrow" key={h.id}>
                  <div className="qsym" style={{ background: `linear-gradient(145deg,${h.color},${h.color}88)` }}>
                    {L?.img ? <img src={L.img} alt="" /> : h.symbol.slice(0, 3)}
                  </div>
                  <div className="qname"><b>{h.name}</b><span>{h.symbol}</span></div>
                  <div className="qprice"><div className="p">{L?.usd ? usd(L.usd) : usd(h.price)}</div><div className="qchg" style={{ color: chColor(L?.ch24) }}>{chTxt(L?.ch24)} 24h</div></div>
                </div>
              )
            })}
            <div className="qsection">Câmbio (R$)</div>
            <div className="qrow"><div className="qsym" style={{ background: 'linear-gradient(145deg,#2BFFC6,#158f6f)' }}>USD</div><div className="qname"><b>Dólar</b><span>USD / BRL</span></div><div className="qprice"><div className="p">{brl(brlRate.tether)}</div></div></div>
            <div className="qrow"><div className="qsym" style={{ background: 'linear-gradient(145deg,#26A17B,#0f6b4f)' }}>USDT</div><div className="qname"><b>Tether</b><span>USDT / BRL</span></div><div className="qprice"><div className="p">{brl(brlRate.tether)}</div></div></div>
            <div className="qrow"><div className="qsym" style={{ background: 'linear-gradient(145deg,#2775CA,#164a80)' }}>USDC</div><div className="qname"><b>USD Coin</b><span>USDC / BRL</span></div><div className="qprice"><div className="p">{brl(brlRate.usdc)}</div></div></div>
            <p className="foot-note">Novos ativos comprados aparecem aqui automaticamente. Preços atualizam a cada 60s.</p>
          </section>

          {/* POOLS */}
          <section className={`screen ${tab === 'pools' ? 'active' : ''}`}>
            {holdings.filter(h => h.kind === 'pool').map(h => {
              const cur = h.current_value ?? 0, pnl = cur - h.invested, pnlp = h.invested ? pnl / h.invested * 100 : 0
              return (
                <div key={h.id}>
                  <div className="hero"><div className="hero-label">{POOL_INFO.dapp} · {POOL_INFO.pair}</div><div className="hero-value num" style={{ fontSize: 32 }}>{usd(cur)}</div><span className={`pill ${pnl >= 0 ? 'up' : 'down'}`}>{pnl >= 0 ? '▲' : '▼'} {pct(pnlp)}</span>
                    <div className="chips"><span className="chip">rede <b>{POOL_INFO.chain}</b></span><span className="chip">entrada <b>{POOL_INFO.entry}</b></span><span className="chip">taxa <b>1%</b></span></div></div>
                  <div className="card section-gap"><div className="kv"><span className="k">Aporte</span><span className="v num">{usd(h.invested)}</span></div><div className="kv"><span className="k">Saldo atual</span><span className="v num">{usd(cur)}</span></div><div className="kv"><span className="k">PNL</span><span className={`v num ${pnl >= 0 ? 'up' : 'down'}`}>{(pnl >= 0 ? '+' : '-') + usd(Math.abs(pnl)).slice(1)}</span></div><div className="kv"><span className="k">Taxas geradas</span><span className="v num up">{usd(POOL_INFO.fees)}</span></div><div className="kv"><span className="k">Faixa</span><span className="v num">{fmt(POOL_INFO.low)} – {fmt(POOL_INFO.high)}</span></div><div className="kv"><span className="k">Dias</span><span className="v num">{POOL_INFO.days}</span></div></div>
                  <div className="card gauge-card section-gap"><div className="eyebrow" style={{ marginBottom: 2 }}>Meta 1% ao dia</div><Gauge val={POOL_INFO.retDay} /><div className="chips" style={{ justifyContent: 'center' }}><span className="chip">APR mês <b>{fmt(POOL_INFO.aprMonth)}%</b></span><span className="chip">APR ano <b>{fmt(POOL_INFO.aprYear)}%</b></span></div></div>
                </div>
              )
            })}
          </section>

          {/* APORTES */}
          <section className={`screen ${tab === 'aportes' ? 'active' : ''}`}>
            <div className="card"><div className="eyebrow" style={{ marginBottom: 4 }}>Fluxo de capital (R$)</div>
              <div className="big-kv"><span className="k">Total aportado</span><span className="v num up">{brl(tin)}</span></div>
              <div className="big-kv"><span className="k">Total retirado</span><span className="v num down">{brl(tout)}</span></div>
              <div className="big-kv"><span className="k">Saldo líquido</span><span className="v num">{brl(net)}</span></div>
              <div className="big-kv"><span className="k">Resultado</span><span className={`v num ${apPl >= 0 ? 'up' : 'down'}`}>{pct(apPl)}</span></div></div>
            <div className="card section-gap"><div className="eyebrow" style={{ marginBottom: 4 }}>Registrar movimento</div>
              <div className="form-row"><select value={mvType} onChange={e => setMvType(e.target.value as any)}><option value="in">Aporte</option><option value="out">Retirada</option></select><input inputMode="decimal" placeholder="Valor R$" value={mvVal} onChange={e => setMvVal(e.target.value)} /></div>
              <div style={{ marginTop: 9 }}><button className="btn" onClick={addFlow}>Adicionar</button></div></div>
            {flows.length > 0 && <div className="card section-gap"><div className="eyebrow" style={{ marginBottom: 4 }}>Movimentos</div>{flows.map(f => (<div className="flow-item" key={f.id}><div className={`flow-ic ${f.kind === 'in' ? 'flow-in' : 'flow-out'}`}>{f.kind === 'in' ? '↓' : '↑'}</div><div className="flow-t"><b>{f.kind === 'in' ? 'Aporte' : 'Retirada'}</b><span>{f.created_at ? new Date(f.created_at).toLocaleDateString('pt-BR') : ''}</span></div><div className={`flow-v ${f.kind === 'in' ? 'up' : 'down'}`}>{brl(f.amount)}</div></div>))}</div>}
          </section>

          {/* METAS */}
          <section className={`screen ${tab === 'metas' ? 'active' : ''}`}>
            <div className="eyebrow">Meta de aporte vs. real</div>
            <div className="card">{priced.filter(h => h.meta_pct > 0).sort((a, b) => b.meta_pct - a.meta_pct).map((h, i) => {
              const real = t.patr ? valOf(h) / t.patr * 100 : 0, denom = Math.max(h.meta_pct, real, 1), gap = real - h.meta_pct
              return (<div key={h.id} style={{ padding: '10px 0', borderTop: i > 0 ? '1px solid var(--line)' : undefined }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ fontWeight: 600, fontSize: 13.5 }}>{h.symbol}</span><span className="num" style={{ fontSize: 12, color: Math.abs(gap) < 0.5 ? 'var(--muted)' : (gap < 0 ? 'var(--pink)' : 'var(--red)') }}>{gap < 0 ? 'faltam ' : 'sobra '}{fmt(Math.abs(gap), 1)}%</span></div><div className="metabar" style={{ marginTop: 8 }}><div className="track"><div className="fill" style={{ width: `${Math.min(real / denom * 100, 100)}%` }} /><div className="goal" style={{ left: `${Math.min(h.meta_pct / denom * 100, 100)}%` }} /></div><div className="lbls"><span>real {fmt(real, 1)}%</span><span>meta {h.meta_pct}%</span></div></div></div>)
            })}</div>
          </section>

          <p className="foot-note">Tiger Invest · cotação ao vivo via CoinGecko · custo médio por transação · dados por usuário no Supabase (RLS). Não é recomendação de investimento.</p>
        </div>

        <nav className="nav">
          {([
            ['inicio', 'Início', <path key="a" d="M3 11l9-8 9 8M5 10v10h14V10" />],
            ['carteira', 'Carteira', <><rect key="a" x="3" y="6" width="18" height="13" rx="2" /><path key="b" d="M16 12h3" /></>],
            ['cotacao', 'Cotação', <path key="a" d="M4 18l5-6 4 3 6-8M4 18h16" />],
            ['pools', 'Pools', <path key="a" d="M12 3s6 6 6 10a6 6 0 01-12 0c0-4 6-10 6-10z" />],
            ['aportes', 'Aportes', <><path key="a" d="M7 17V9m0 0l-3 3m3-3l3 3" /><path key="b" d="M17 7v8m0 0l3-3m-3 3l-3-3" /></>],
            ['metas', 'Metas', <><circle key="a" cx="12" cy="12" r="8" /><circle key="b" cx="12" cy="12" r="3.2" /></>],
          ] as [Tab, string, React.ReactNode][]).map(([k, label, icon]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><svg viewBox="0 0 24 24">{icon}</svg>{label}</button>
          ))}
        </nav>

        {/* DETALHE DO ATIVO */}
        {detail && (() => {
          const h = priced.find(x => x.id === detail.id) || detail
          const my = txs.filter(x => x.symbol === h.symbol)
          const v = valOf(h), pl = v - h.invested, plp = h.invested ? pl / h.invested * 100 : 0
          const custoMedio = h.qty ? h.invested / h.qty : 0
          const pctInv = t.totalInv ? h.invested / t.totalInv * 100 : 0
          const firstDate = my.length ? my.map(x => x.buy_date).sort()[0] : ''
          const L = live[h.cg_id]
          return (
            <div className="modal" onClick={e => { if (e.target === e.currentTarget) setDetail(null) }}>
              <div className="sheet"><div className="grabber" />
                <div className="sheet-scroll">
                  <h3><span className="sym" style={{ width: 32, height: 32, background: `linear-gradient(145deg,${h.color},${h.color}88)` }}>{h.symbol.slice(0, 4)}</span>{h.name} <span style={{ marginLeft: 'auto' }} className={`pill ${pl >= 0 ? 'up' : 'down'}`}>{pct(plp)}</span></h3>
                  <div className="dgrid">
                    <div className="dcell"><div className="k">Saldo atual</div><div className="v">{usd(v)}</div></div>
                    <div className="dcell"><div className="k">Total geral</div><div className="v">{usd(h.invested)}</div></div>
                    <div className="dcell"><div className="k">Custo médio</div><div className="v">{usd(custoMedio)}</div></div>
                    <div className="dcell"><div className="k">Preço atual</div><div className="v">{usd(h.price)}</div></div>
                    <div className="dcell"><div className="k">Qtd. total</div><div className="v">{fmt(h.qty, h.qty < 1 ? 6 : 3)}</div></div>
                    <div className="dcell"><div className="k">% investimento</div><div className="v">{fmt(pctInv, 1)}%</div></div>
                    <div className="dcell"><div className="k">P/L diário</div><div className="v" style={{ color: chColor(L?.ch24) }}>{chTxt(L?.ch24)}</div></div>
                    <div className="dcell"><div className="k">P/L mensal</div><div className="v" style={{ color: chColor(L?.ch30) }}>{chTxt(L?.ch30)}</div></div>
                    <div className="dcell"><div className="k">P/L anual</div><div className="v" style={{ color: chColor(L?.ch1y) }}>{chTxt(L?.ch1y)}</div></div>
                    <div className="dcell"><div className="k">Total de dias</div><div className="v">{firstDate ? daysSince(firstDate) : '—'}</div></div>
                    <div className="dcell"><div className="k">Rede</div><div className="v" style={{ fontSize: 12 }}>{agg(my.map(x => x.rede))}</div></div>
                    <div className="dcell"><div className="k">Corretora</div><div className="v" style={{ fontSize: 12 }}>{agg(my.map(x => x.corretora))}</div></div>
                  </div>
                  <div className="eyebrow" style={{ marginTop: 18 }}>Compras ({my.length})</div>
                  {my.map(x => (
                    <div className="txitem" key={x.id}>
                      <div className="txhead"><span>{new Date(x.buy_date).toLocaleDateString('pt-BR')} · {daysSince(x.buy_date)}d</span><b>{fmt(x.qty, x.qty < 1 ? 5 : 3)} @ {usd(x.buy_price)}</b></div>
                      <div className="txmeta">
                        <span className="txtag">rede <b>{x.rede || '—'}</b></span>
                        <span className="txtag">corretora <b>{x.corretora || '—'}</b></span>
                        <span className="txtag">carteira <b>{x.carteira || '—'}</b></span>
                        <span className="txtag">saldo compra <b>{usd(x.qty * x.buy_price)}</b></span>
                        {x.stop_limit > 0 && <span className="txtag">stop <b>{usd(x.stop_limit)}</b></span>}
                        {x.target > 0 && <span className="txtag">alvo <b>{usd(x.target)}</b></span>}
                        <span className="txtag" style={{ cursor: 'pointer', color: 'var(--red)' }} onClick={() => delTx(x.id!, h)}>excluir ✕</span>
                      </div>
                    </div>
                  ))}
                  <div className="grid2" style={{ marginTop: 16 }}>
                    <button className="btn ghost danger" onClick={() => delAsset(h)}>Excluir ativo</button>
                    <button className="btn" onClick={() => openBuy(h)}>+ Registrar compra</button>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* FORM DE COMPRA / NOVO ATIVO */}
        {txForm && (
          <div className="modal" onClick={e => { if (e.target === e.currentTarget) setTxForm(null) }}>
            <div className="sheet"><div className="grabber" />
              <div className="sheet-scroll">
                <h3>{txForm.isNew ? 'Novo ativo / 1ª compra' : `Comprar ${txForm.symbol}`}</h3>
                {txForm.isNew && (<>
                  <div className="grid2">
                    <div className="field"><label>Nome</label><input value={txForm.name} onChange={e => setTxForm({ ...txForm, name: e.target.value })} placeholder="Ethereum" /></div>
                    <div className="field"><label>Símbolo</label><input value={txForm.symbol} onChange={e => setTxForm({ ...txForm, symbol: e.target.value.toUpperCase() })} placeholder="ETH" /></div>
                  </div>
                  <div className="grid2">
                    <div className="field"><label>ID CoinGecko</label><input value={txForm.cg_id} onChange={e => setTxForm({ ...txForm, cg_id: e.target.value })} placeholder="ethereum" /></div>
                    <div className="field"><label>Meta %</label><input inputMode="decimal" value={txForm.meta_pct} onChange={e => setTxForm({ ...txForm, meta_pct: e.target.value })} /></div>
                  </div>
                </>)}
                <div className="grid2">
                  <div className="field"><label>Rede</label><input value={txForm.rede} onChange={e => setTxForm({ ...txForm, rede: e.target.value })} placeholder="BASE" /></div>
                  <div className="field"><label>Corretora</label><input value={txForm.corretora} onChange={e => setTxForm({ ...txForm, corretora: e.target.value })} placeholder="BYbit" /></div>
                </div>
                <div className="grid2">
                  <div className="field"><label>Carteira</label><input value={txForm.carteira} onChange={e => setTxForm({ ...txForm, carteira: e.target.value })} placeholder="METAMASK" /></div>
                  <div className="field"><label>Data da compra</label><input type="date" value={txForm.buy_date} onChange={e => setTxForm({ ...txForm, buy_date: e.target.value })} /></div>
                </div>
                <div className="grid2">
                  <div className="field"><label>Qtd. na compra</label><input inputMode="decimal" value={txForm.qty} onChange={e => setTxForm({ ...txForm, qty: e.target.value })} /></div>
                  <div className="field"><label>Preço compra U$</label><input inputMode="decimal" value={txForm.buy_price} onChange={e => setTxForm({ ...txForm, buy_price: e.target.value })} /></div>
                </div>
                <div className="grid2">
                  <div className="field"><label>Stop limit U$</label><input inputMode="decimal" value={txForm.stop_limit} onChange={e => setTxForm({ ...txForm, stop_limit: e.target.value })} /></div>
                  <div className="field"><label>Alvo venda U$</label><input inputMode="decimal" value={txForm.target} onChange={e => setTxForm({ ...txForm, target: e.target.value })} /></div>
                </div>
                <div className="modal-preview"><span>Saldo desta compra</span><b className="num">{usd(num(String(txForm.qty)) * num(String(txForm.buy_price)))}</b></div>
                <div className="grid2" style={{ marginTop: 16 }}><button className="btn ghost" onClick={() => setTxForm(null)}>Cancelar</button><button className="btn" onClick={saveBuy}>Salvar compra</button></div>
              </div>
            </div>
          </div>
        )}

        {/* EDIT CAIXA / POOL */}
        {editDraft && (
          <div className="modal" onClick={e => { if (e.target === e.currentTarget) setEditDraft(null) }}>
            <div className="sheet"><div className="grabber" />
              <h3>{editDraft.name}</h3>
              {editDraft.kind === 'pool' && <div className="field"><label>Aporte U$</label><input inputMode="decimal" value={editDraft.invested} onChange={e => setEditDraft({ ...editDraft, invested: num(e.target.value) })} /></div>}
              <div className="field"><label>Valor atual U$</label><input inputMode="decimal" value={editDraft.current_value ?? 0} onChange={e => setEditDraft({ ...editDraft, current_value: num(e.target.value) })} /></div>
              <div className="grid2" style={{ marginTop: 16 }}><button className="btn ghost" onClick={() => setEditDraft(null)}>Cancelar</button><button className="btn" onClick={saveEdit}>Salvar</button></div>
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
  const arc = (f0: number, f1: number, rad: number) => { const [a0x, a0y] = pt(f0, rad), [a1x, a1y] = pt(f1, rad); const l = f1 - f0 > 0.5 ? 1 : 0; return `M ${a0x} ${a0y} A ${rad} ${rad} 0 ${l} 1 ${a1x} ${a1y}` }
  const f = Math.max(0, Math.min(1, val / max))
  const [nx, ny] = pt(f, r - 6), [tx, ty] = pt(0.5, r + 9), [tx2, ty2] = pt(0.5, r - 9)
  return (
    <div className="gauge"><svg viewBox="0 0 200 118">
      <path d={arc(0, 1, r)} stroke="rgba(255,255,255,.07)" strokeWidth="12" fill="none" strokeLinecap="round" />
      <path d={arc(0, 0.5, r)} stroke="#FF4D6D" strokeWidth="12" fill="none" strokeLinecap="round" />
      <path d={arc(0.5, 1, r)} stroke="#2BFF9A" strokeWidth="12" fill="none" strokeLinecap="round" />
      <line x1={tx} y1={ty} x2={tx2} y2={ty2} stroke="#F4EDFF" strokeWidth="2" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#FF2E9A" strokeWidth="3" strokeLinecap="round" /><circle cx={cx} cy={cy} r="6" fill="#FF2E9A" />
    </svg><div className="read"><b className="num">{fmt(val)}%</b><small>retorno diário</small></div></div>
  )
}
