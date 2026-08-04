'use client'
import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Background from './Background'
import {
  Holding, Flow, Transaction, Pool, Signal, DEFAULT_HOLDINGS, DEFAULT_POOL, BRL_RATE,
  value as valOf, usd, pct, brl, fmt, daysSince,
} from '@/lib/data'

type Tab = 'inicio' | 'carteira' | 'cotacao' | 'radar' | 'pools' | 'aportes' | 'metas'
const uniq = (a: string[]) => Array.from(new Set(a.filter(Boolean)))
const agg = (arr: string[]) => { const u = uniq(arr); return u.length === 0 ? '—' : u.length === 1 ? u[0] : 'várias' }
const num = (v: any) => parseFloat(String(v).replace(',', '.')) || 0

export default function DashboardApp({
  userEmail, initialHoldings, initialFlows, initialTx, initialPools,
}: { userEmail: string; initialHoldings: Holding[]; initialFlows: Flow[]; initialTx: Transaction[]; initialPools: Pool[] }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [holdings, setHoldings] = useState<Holding[]>(initialHoldings)
  const [flows, setFlows] = useState<Flow[]>(initialFlows)
  const [txs, setTxs] = useState<Transaction[]>(initialTx)
  const [pools, setPools] = useState<Pool[]>(initialPools)
  const [tab, setTab] = useState<Tab>('inicio')
  const [live, setLive] = useState<Record<string, any>>({})
  const [brlRate, setBrlRate] = useState({ tether: BRL_RATE, usdc: BRL_RATE })
  const [signals, setSignals] = useState<Record<string, Signal>>({})
  const [sigTried, setSigTried] = useState(false)
  const [radar, setRadar] = useState<any | null>(null)
  const [radarSeg, setRadarSeg] = useState<'top' | 'alts' | 'memes' | 'pools'>('top')
  const [radarLoading, setRadarLoading] = useState(false)
  const [radarDetail, setRadarDetail] = useState<any | null>(null)
  const [radarSig, setRadarSig] = useState<Signal | null>(null)
  const [radarSigLoading, setRadarSigLoading] = useState(false)
  const [userId, setUserId] = useState('')
  const [detail, setDetail] = useState<Holding | null>(null)
  const [editDraft, setEditDraft] = useState<Holding | null>(null)
  const [txForm, setTxForm] = useState<any | null>(null)
  const [poolForm, setPoolForm] = useState<any | null>(null)
  const [flowForm, setFlowForm] = useState<any | null>(null)
  const [poolData, setPoolData] = useState<Record<string, any>>({})

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? '')) }, [supabase])

  const refetch = useCallback(async () => {
    const [h, f, t, p] = await Promise.all([
      supabase.from('holdings').select('*').order('sort', { ascending: true }),
      supabase.from('flows').select('*').order('created_at', { ascending: false }),
      supabase.from('transactions').select('*').order('buy_date', { ascending: true }),
      supabase.from('pools').select('*').order('created_at', { ascending: true }),
    ])
    if (h.data) setHoldings(h.data as Holding[])
    if (f.data) setFlows(f.data as Flow[])
    if (t.data) setTxs(t.data as Transaction[])
    if (p.data) setPools(p.data as Pool[])
  }, [supabase])

  // seed ÚNICO (gated por flag) — nunca reinjeta
  const seededRef = useRef(false)
  useEffect(() => {
    if (!userId || seededRef.current) return
    seededRef.current = true
    ;(async () => {
      const { data: st } = await supabase.from('app_state').select('seeded').eq('user_id', userId).maybeSingle()
      if (st?.seeded) return
      if (holdings.length === 0) {
        await supabase.from('holdings').insert(DEFAULT_HOLDINGS.filter(r => r.kind !== 'pool').map(r => ({ ...r, user_id: userId })))
        const cs = DEFAULT_HOLDINGS.filter(r => r.kind === 'crypto')
        await supabase.from('transactions').insert(cs.map(r => ({
          user_id: userId, symbol: r.symbol, name: r.name, cg_id: r.cg_id, color: r.color,
          rede: 'BASE', corretora: 'METAMASK', carteira: 'METAMASK', buy_date: '2025-06-27',
          qty: r.qty, buy_price: r.qty ? r.invested / r.qty : 0, stop_limit: 0, target: 0, meta_pct: r.meta_pct,
        })))
        await supabase.from('pools').insert({ ...DEFAULT_POOL, user_id: userId })
      } else if (txs.length === 0) {
        const cs = holdings.filter(h => h.kind === 'crypto')
        if (cs.length > 0) await supabase.from('transactions').insert(cs.map(h => ({
          user_id: userId, symbol: h.symbol, name: h.name, cg_id: h.cg_id, color: h.color,
          rede: 'BASE', corretora: 'METAMASK', carteira: 'METAMASK', buy_date: '2025-06-27',
          qty: h.qty, buy_price: h.qty ? h.invested / h.qty : 0, stop_limit: 0, target: 0, meta_pct: h.meta_pct,
        })))
      }
      await supabase.from('app_state').upsert({ user_id: userId, seeded: true })
      await refetch()
    })()
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // migração: pool antiga (holding) -> tabela pools (auto-encerra)
  useEffect(() => {
    if (!userId) return
    const poolHolding = holdings.find(h => h.kind === 'pool')
    if (pools.length === 0 && poolHolding) {
      (async () => {
        await supabase.from('pools').insert({ ...DEFAULT_POOL, aporte: poolHolding.invested, current_value: poolHolding.current_value ?? DEFAULT_POOL.current_value, user_id: userId })
        if (poolHolding.id) await supabase.from('holdings').delete().eq('id', poolHolding.id)
        await refetch()
      })()
    }
  }, [userId, pools.length, holdings, supabase, refetch])

  // cotação ao vivo
  useEffect(() => {
    const ids = holdings.filter(h => h.cg_id).map(h => h.cg_id)
    const poolIds = pools.map(p => p.par1_cg_id)
    const all = Array.from(new Set([...ids, ...poolIds, 'tether', 'usd-coin'])).join(',')
    let active = true
    const load = () => fetch(`/api/prices?ids=${all}`).then(r => r.json()).then(d => {
      if (!active) return
      setLive(d.coins || {}); setBrlRate({ tether: d.brl?.tether || BRL_RATE, usdc: d.brl?.['usd-coin'] || BRL_RATE })
    }).catch(() => {})
    load(); const t = setInterval(load, 60000)
    return () => { active = false; clearInterval(t) }
  }, [holdings, pools])

  // sinais técnicos
  useEffect(() => {
    const ids = uniq(holdings.filter(h => h.kind === 'crypto' && h.cg_id).map(h => h.cg_id))
    if (!ids.length) return
    let active = true
    fetch(`/api/signals?ids=${ids.join(',')}`).then(r => r.json()).then(d => { if (active) setSignals(d || {}) }).catch(() => {}).finally(() => { if (active) setSigTried(true) })
    return () => { active = false }
  }, [holdings])

  useEffect(() => {
    pools.forEach(p => {
      if (p.pool_address && p.id) {
        fetch(`/api/pooldata?network=${p.network || 'base'}&address=${p.pool_address}`).then(r => r.json()).then(d => {
          if (d && (d.tvl || d.vol24)) setPoolData(prev => ({ ...prev, [p.id!]: d }))
        }).catch(() => {})
      }
    })
  }, [pools])

  useEffect(() => {
    if (tab === 'radar' && !radar && !radarLoading) {
      setRadarLoading(true)
      fetch('/api/radar').then(r => r.json()).then(d => setRadar(d)).catch(() => {}).finally(() => setRadarLoading(false))
    }
  }, [tab, radar, radarLoading])

  const ph = useCallback((h: Holding): Holding => (h.cg_id && live[h.cg_id]?.usd) ? { ...h, price: live[h.cg_id].usd } : h, [live])
  const priced = useMemo(() => holdings.map(ph), [holdings, ph])
  const poolsVal = useMemo(() => pools.reduce((s, p) => s + p.current_value, 0), [pools])
  const poolsInv = useMemo(() => pools.reduce((s, p) => s + p.aporte, 0), [pools])

  const t = useMemo(() => {
    const sum = (a: Holding[]) => a.reduce((s, h) => s + valOf(h), 0)
    const inv = (a: Holding[]) => a.reduce((s, h) => s + h.invested, 0)
    const crypto = priced.filter(h => h.kind === 'crypto'), stock = priced.filter(h => h.kind === 'stock')
    const cash = priced.filter(h => h.kind === 'cash')
    const criptoVal = sum(crypto) + sum(stock), criptoInv = inv(crypto) + inv(stock)
    const cashVal = sum(cash)
    const riskInv = criptoInv + poolsInv, riskVal = criptoVal + poolsVal
    return { patr: criptoVal + cashVal + poolsVal, criptoVal, criptoInv, cashVal, riskInv, pl: riskVal - riskInv, totalInv: riskInv + inv(cash), aportTotal: riskInv + inv(cash) }
  }, [priced, poolsVal, poolsInv])

  const plpct = t.riskInv ? (t.pl / t.riskInv) * 100 : 0
  const criptoPl = t.criptoInv ? ((t.criptoVal - t.criptoInv) / t.criptoInv) * 100 : 0
  const poolPl = poolsInv ? ((poolsVal - poolsInv) / poolsInv) * 100 : 0
  const cryptoVal = priced.filter(h => h.kind === 'crypto').reduce((a, h) => a + valOf(h), 0)
  const cryptoInv = holdings.filter(h => h.kind === 'crypto').reduce((a, h) => a + h.invested, 0)
  const cryptoPl = cryptoInv ? (cryptoVal - cryptoInv) / cryptoInv * 100 : 0
  const stockVal = priced.filter(h => h.kind === 'stock').reduce((a, h) => a + valOf(h), 0)
  const stockInv = holdings.filter(h => h.kind === 'stock').reduce((a, h) => a + h.invested, 0)
  const stockPl = stockInv ? (stockVal - stockInv) / stockInv * 100 : 0

  const cats = useMemo(() => {
    const bs = (s: string) => priced.filter(h => h.symbol === s).reduce((a, h) => a + valOf(h), 0)
    const other = priced.filter(h => h.kind === 'crypto' && !['ETH', 'BTC', 'SOL'].includes(h.symbol)).reduce((a, h) => a + valOf(h), 0)
    return [
      { n: 'Ethereum', v: bs('ETH'), c: '#A855F7' }, { n: 'Bitcoin', v: bs('BTC'), c: '#FF2E9A' },
      { n: 'Solana', v: bs('SOL'), c: '#22D3EE' }, { n: 'Altcoins', v: other, c: '#C77DFF' },
      { n: 'Ações', v: priced.filter(h => h.kind === 'stock').reduce((a, h) => a + valOf(h), 0), c: '#7C5CFF' },
      { n: 'Caixa', v: priced.filter(h => h.kind === 'cash').reduce((a, h) => a + valOf(h), 0), c: '#9D7CFF' },
      { n: 'Pools', v: poolsVal, c: '#2BFFC6' },
    ].filter(x => x.v > 0)
  }, [priced, poolsVal])
  const donutTot = cats.reduce((s, x) => s + x.v, 0) || 1
  let off = 0
  const segs = cats.map((x, i) => { const p = x.v / donutTot * 100; const s = (<circle key={i} cx="21" cy="21" r="15.915" fill="transparent" stroke={x.c} strokeWidth="5.5" strokeDasharray={`${p} ${100 - p}`} strokeDashoffset={25 - off} />); off += p; return s })

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
    const f = txForm; if (!f) return
    const payload = { user_id: userId, symbol: f.symbol.toUpperCase(), name: f.name || f.symbol, cg_id: f.cg_id, color: f.color || '#A855F7', rede: f.rede, corretora: f.corretora, carteira: f.carteira, buy_date: f.buy_date, qty: num(f.qty), buy_price: num(f.buy_price), stop_limit: num(f.stop_limit), target: num(f.target), meta_pct: num(f.meta_pct) }
    await supabase.from('transactions').insert(payload)
    await recompute(payload.symbol, payload.name, payload.cg_id, payload.color, payload.meta_pct)
    setTxForm(null); setDetail(null); await refetch()
  }
  async function delTx(id: string, h: Holding) { await supabase.from('transactions').delete().eq('id', id); await recompute(h.symbol, h.name, h.cg_id, h.color, h.meta_pct); await refetch() }
  async function delAsset(h: Holding) { await supabase.from('transactions').delete().eq('symbol', h.symbol); if (h.id) await supabase.from('holdings').delete().eq('id', h.id); setDetail(null); await refetch() }
  async function saveEdit() { if (!editDraft?.id) return; await supabase.from('holdings').update({ current_value: editDraft.current_value }).eq('id', editDraft.id); setEditDraft(null); await refetch() }
  const fdate = (f: Flow) => f.move_date || (f.created_at ? f.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10))
  const abbr = (n: number) => { const a = Math.abs(n); return '$' + (a >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : a >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : a >= 1e3 ? (n / 1e3).toFixed(0) + 'K' : n.toFixed(0)) }
  async function saveFlow() { const f = flowForm; if (!f) return; const payload = { user_id: userId, kind: f.kind, amount: num(f.amount), move_date: f.move_date }; if (f.id) await supabase.from('flows').update(payload).eq('id', f.id); else await supabase.from('flows').insert(payload); setFlowForm(null); await refetch() }
  async function delFlow(id: string) { await supabase.from('flows').delete().eq('id', id); setFlowForm(null); await refetch() }
  async function savePool() {
    const f = poolForm; if (!f) return
    const payload = { user_id: userId, par1: f.par1.toUpperCase(), par1_cg_id: f.par1_cg_id, par2: f.par2.toUpperCase(), dapp: f.dapp, rede: f.rede, link: f.link, aporte: num(f.aporte), current_value: num(f.current_value), low_range: num(f.low_range), high_range: num(f.high_range), entry_date: f.entry_date, fees: num(f.fees), pool_address: f.pool_address || '', network: f.network || 'base' }
    if (f.id) await supabase.from('pools').update(payload).eq('id', f.id)
    else await supabase.from('pools').insert(payload)
    setPoolForm(null); await refetch()
  }
  async function delPool(id: string) { await supabase.from('pools').delete().eq('id', id); setPoolForm(null); await refetch() }
  async function signOut() { await supabase.auth.signOut(); router.push('/login') }

  const usdSplit = (n: number) => { const s = usd(n); const i = s.lastIndexOf(','); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i)] }
  const [hi, cent] = usdSplit(t.patr); const res = t.patr - t.aportTotal
  const rate = brlRate.tether
  const inFlows = flows.filter(f => f.kind === 'in'), outFlows = flows.filter(f => f.kind === 'out')
  const totIn = inFlows.reduce((s, f) => s + f.amount, 0), totOut = outFlows.reduce((s, f) => s + f.amount, 0)
  const pctRetirada = totIn ? totOut / totIn * 100 : 0
  // capital real (custo) x patrimônio
  const capInvestidoBrl = t.totalInv * rate, patrBrlF = t.patr * rate
  const resultBrl = patrBrlF - capInvestidoBrl
  const resultPct = t.totalInv > 0 ? (t.patr - t.totalInv) / t.totalInv * 100 : 0
  // idade média ponderada das posições (transações + pools)
  let wAge = 0, wSum = 0
  txs.forEach(x => { const w = x.qty * x.buy_price; wAge += daysSince(x.buy_date) * w; wSum += w })
  pools.forEach(pp => { wAge += daysSince(pp.entry_date) * pp.aporte; wSum += pp.aporte })
  const avgDays = wSum ? wAge / wSum : 0, avgMonths = avgDays / 30.44, avgYears = avgDays / 365.25
  const plPeriodoPct = resultPct
  const plAnualPct = avgYears > 0.02 ? plPeriodoPct / avgYears : plPeriodoPct
  const plMensalPct = avgMonths > 0.05 ? plPeriodoPct / avgMonths : 0
  const plDiarioPct = avgDays > 0.5 ? plPeriodoPct / avgDays : 0
  const plAnualBrl = avgYears > 0.02 ? resultBrl / avgYears : resultBrl
  const plMensalBrl = avgMonths > 0.05 ? resultBrl / avgMonths : 0
  const plDiarioBrl = avgDays > 0.5 ? resultBrl / avgDays : 0
  const distrib = [
    { n: 'Cripto', v: cryptoVal, c: '#FF2E9A' },
    { n: 'Ações/ETFs', v: stockVal, c: '#7C5CFF' },
    { n: 'Caixa', v: t.cashVal, c: '#9D7CFF' },
    { n: 'Pools', v: poolsVal, c: '#2BFFC6' },
  ].filter(x => x.v > 0)
  const distTot = distrib.reduce((s, x) => s + x.v, 0) || 1
  const cryptoHoldings = priced.filter(h => h.kind === 'crypto' || h.kind === 'stock').slice().sort((a, b) => valOf(b) - valOf(a))
  const chColor = (v: any) => v == null ? 'var(--muted)' : v >= 0 ? 'var(--green)' : 'var(--red)'
  const chTxt = (v: any) => v == null ? '—' : pct(v)

  const openBuy = (h: Holding | null) => setTxForm(h
    ? { symbol: h.symbol, name: h.name, cg_id: h.cg_id, color: h.color, meta_pct: h.meta_pct, rede: '', corretora: '', carteira: '', buy_date: new Date().toISOString().slice(0, 10), qty: '', buy_price: live[h.cg_id]?.usd ?? h.price, stop_limit: '', target: '', isNew: false }
    : { symbol: '', name: '', cg_id: '', color: '#A855F7', meta_pct: '', rede: '', corretora: '', carteira: '', buy_date: new Date().toISOString().slice(0, 10), qty: '', buy_price: '', stop_limit: '', target: '', isNew: true })
  async function openRadarCoin(c: any) {
    setRadarDetail(c); setRadarSig(null); setRadarSigLoading(true)
    try { const r = await fetch(`/api/signals?ids=${c.id}`); const d = await r.json(); setRadarSig(d[c.id] || null) } catch {}
    setRadarSigLoading(false)
  }
  const openFlow = (f: Flow | null) => setFlowForm(f ? { id: f.id, kind: f.kind, amount: f.amount, move_date: f.move_date || (f.created_at ? f.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10)) } : { kind: 'in', amount: '', move_date: new Date().toISOString().slice(0, 10) })
  const openPool = (p: Pool | null) => setPoolForm(p ? { ...p } : { par1: 'ETH', par1_cg_id: 'ethereum', par2: 'USDC', dapp: 'Uniswap v3', rede: 'Base', link: '', aporte: '', current_value: '', low_range: '', high_range: '', entry_date: new Date().toISOString().slice(0, 10), fees: '', pool_address: '', network: 'base' })

  const assetRow = (h: Holding) => {
    const v = valOf(h), pl = v - h.invested, plp = h.invested ? pl / h.invested * 100 : 0
    const real = t.patr ? v / t.patr * 100 : 0, denom = Math.max(h.meta_pct, real, 1)
    return (<div className="asset" key={h.id} onClick={() => setDetail(holdings.find(x => x.id === h.id)!)}>
      <div className="sym" style={{ background: `linear-gradient(145deg,${h.color},${h.color}88)` }}>{h.symbol.slice(0, 4)}</div>
      <div className="a-main"><div className="a-name">{h.name}</div><div className="a-sub">{fmt(h.qty, h.qty < 1 ? 5 : 3)} · {usd(h.price)}</div>
        <div className="metabar"><div className="track"><div className="fill" style={{ width: `${Math.min(real / denom * 100, 100)}%` }} /><div className="goal" style={{ left: `${Math.min(h.meta_pct / denom * 100, 100)}%` }} /></div><div className="lbls"><span>real {fmt(real, 1)}%</span><span>meta {h.meta_pct}%</span></div></div></div>
      <div className="a-right"><div className="a-val">{usd(v)}</div><div className={`a-pl ${pl >= 0 ? 'up' : 'down'}`}>{pct(plp)}</div></div></div>)
  }
  const cryptoList = priced.filter(h => h.kind === 'crypto').slice().sort((a, b) => valOf(b) - valOf(a))
  const stockList = priced.filter(h => h.kind === 'stock').slice().sort((a, b) => valOf(b) - valOf(a))

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
            <div className="card section-gap"><div className="eyebrow">Alocação atual</div>
              <div className="donut-wrap"><div className="donut"><svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="15.915" fill="transparent" stroke="rgba(255,255,255,.05)" strokeWidth="5.5" />{segs}</svg><div className="center"><small>Total</small><b className="num">${fmt(donutTot, 0)}</b></div></div>
                <div className="legend">{cats.map((x, i) => (<div className="leg" key={i}><span className="dot" style={{ background: x.c, color: x.c }} /><span>{x.n}</span><span className="lpct">{fmt(x.v / donutTot * 100, 1)}%</span></div>))}</div></div></div>
            <div className="eyebrow section-gap">Blocos por nicho</div>
            <div className="trio trio4">
              <div className="stat"><div className="k">Cripto</div><div className="v num">{usd(cryptoVal)}</div><div className={`s num ${cryptoPl >= 0 ? 'up' : 'down'}`}>{pct(cryptoPl)}</div></div>
              <div className="stat"><div className="k">Ações / ETFs</div><div className="v num">{usd(stockVal)}</div><div className={`s num ${stockPl >= 0 ? 'up' : 'down'}`}>{pct(stockPl)}</div></div>
              <div className="stat"><div className="k">Caixa</div><div className="v num">{usd(t.cashVal)}</div><div className="s" style={{ color: 'var(--muted)' }}>reserva</div></div>
              <div className="stat"><div className="k">Pools</div><div className="v num">{usd(poolsVal)}</div><div className={`s num ${poolPl >= 0 ? 'up' : 'down'}`}>{pct(poolPl)}</div></div>
            </div>
          </section>

          {/* CARTEIRA */}
          <section className={`screen ${tab === 'carteira' ? 'active' : ''}`}>
            <div className="eyebrow">Carteira · toque para ver detalhes</div>
            <div className="niche-h">Cripto · <b>{usd(cryptoVal)}</b></div>
            {cryptoList.map(assetRow)}
            {stockList.length > 0 && (<><div className="niche-h" style={{ marginTop: 18 }}>Ações / ETFs · <b>{usd(stockVal)}</b></div>{stockList.map(assetRow)}</>)}
            <button className="addbtn" onClick={() => openBuy(null)}>+ registrar compra / novo ativo</button>
            <div className="card section-gap">{holdings.filter(h => h.kind === 'cash').map(h => (<div className="kv" key={h.id} onClick={() => setEditDraft({ ...h })} style={{ cursor: 'pointer' }}><span className="k">{h.name}</span><span className="v num">{usd(h.current_value ?? 0)}</span></div>))}</div>
          </section>

          {/* COTAÇÃO */}
          <section className={`screen ${tab === 'cotacao' ? 'active' : ''}`}>
            <div className="eyebrow">Cotação ao vivo · CoinGecko</div>
            {priced.filter(h => h.kind === 'crypto' && h.cg_id).sort((a, b) => valOf(b) - valOf(a)).map(h => { const L = live[h.cg_id]; return (
              <div className="qrow" key={h.id}>
                <div className="qsym" style={{ background: `linear-gradient(145deg,${h.color},${h.color}88)` }}>{L?.img ? <img src={L.img} alt="" /> : h.symbol.slice(0, 3)}</div>
                <div className="qname"><b>{h.name}</b><span>{h.symbol}</span>{signals[h.cg_id] && (<span className={`sigbadge sig-${signals[h.cg_id].verdict.tone}`} style={{ marginTop: 4, display: 'inline-flex' }}>{signals[h.cg_id].verdict.tone === 'buy' ? '▲ COMPRA' : signals[h.cg_id].verdict.tone === 'sell' ? '▼ VENDA' : '● CAUTELA'}</span>)}</div>
                <div className="qprice"><div className="p">{L?.usd ? usd(L.usd) : usd(h.price)}</div><div className="qchg" style={{ color: chColor(L?.ch24) }}>{chTxt(L?.ch24)} 24h</div></div>
              </div>) })}
            <div className="qsection">Câmbio (R$)</div>
            <div className="qrow"><div className="qsym" style={{ background: 'linear-gradient(145deg,#2BFFC6,#158f6f)' }}>USD</div><div className="qname"><b>Dólar</b><span>USD / BRL</span></div><div className="qprice"><div className="p">{brl(brlRate.tether)}</div></div></div>
            <div className="qrow"><div className="qsym" style={{ background: 'linear-gradient(145deg,#26A17B,#0f6b4f)' }}>USDT</div><div className="qname"><b>Tether</b><span>USDT / BRL</span></div><div className="qprice"><div className="p">{brl(brlRate.tether)}</div></div></div>
            <div className="qrow"><div className="qsym" style={{ background: 'linear-gradient(145deg,#2775CA,#164a80)' }}>USDC</div><div className="qname"><b>USD Coin</b><span>USDC / BRL</span></div><div className="qprice"><div className="p">{brl(brlRate.usdc)}</div></div></div>
          </section>

          {/* POOLS */}
          <section className={`screen ${tab === 'pools' ? 'active' : ''}`}>
            <div className="eyebrow">Minhas pools de liquidez</div>
            {pools.map(p => {
              const price = live[p.par1_cg_id]?.usd ?? 0
              const below = price > 0 && p.low_range > 0 && price < p.low_range
              const above = price > 0 && p.high_range > 0 && price > p.high_range
              const inRange = price > 0 && !below && !above && p.low_range > 0
              const span = p.high_range - p.low_range
              const pos = (price > 0 && span > 0) ? Math.min(100, Math.max(0, (price - p.low_range) / span * 100)) : 50
              const nearEdge = inRange && (pos < 12 || pos > 88)
              const pnl = p.current_value - p.aporte, pnlp = p.aporte ? pnl / p.aporte * 100 : 0
              const dias = daysSince(p.entry_date), apr = p.aporte && dias > 0 ? p.fees / p.aporte / dias * 365 * 100 : 0
              const pd = p.id ? poolData[p.id] : null
              const trac = pd && pd.tvl ? pd.vol24 / pd.tvl : null
              return (<div className="poolcard" key={p.id}>
                <div className="poolhead">
                  <div className="poolt"><b>{p.par1} / {p.par2}</b><span>{p.dapp} · {p.rede}</span></div>
                  <div className="poolval"><div className="num">{usd(p.current_value)}</div><div className={`num ${pnl >= 0 ? 'up' : 'down'}`}>{pct(pnlp)}</div></div>
                </div>
                <div className={`rangestatus ${inRange ? (nearEdge ? 'rs-warn' : 'rs-in') : 'rs-out'}`}>{inRange ? (nearEdge ? '⚠ PERTO DE SAIR DA FAIXA' : '✓ DENTRO DA FAIXA · gerando taxas') : below ? '▼ FORA — abaixo · sem taxas' : above ? '▲ FORA — acima · sem taxas' : 'faixa não definida'}</div>
                <div className="poolrange2"><div className="pr-band" /><div className={`pr-cur ${inRange ? '' : 'out'}`} style={{ left: `${pos}%` }} /></div>
                <div className="poolrangelbl"><span>{fmt(p.low_range)}</span><span className="pr-now">{price > 0 ? fmt(price) : '—'}</span><span>{fmt(p.high_range)}</span></div>
                {pd && (<div className="pooltraction">
                  <div className="pt-cell"><span>TVL</span><b>{abbr(pd.tvl)}</b></div>
                  <div className="pt-cell"><span>Vol 24h</span><b>{abbr(pd.vol24)}</b></div>
                  <div className="pt-cell"><span>Tração</span><b className={trac != null && trac > 0.3 ? 'up' : trac != null && trac > 0.1 ? '' : 'down'}>{trac == null ? '—' : trac > 0.3 ? 'Alta' : trac > 0.1 ? 'Média' : 'Baixa'}</b></div>
                </div>)}
                <div style={{ marginTop: 12 }}>
                  <div className="kv"><span className="k">Aporte</span><span className="v num">{usd(p.aporte)}</span></div>
                  <div className="kv"><span className="k">Saldo atual</span><span className="v num">{usd(p.current_value)}</span></div>
                  <div className="kv"><span className="k">PNL</span><span className={`v num ${pnl >= 0 ? 'up' : 'down'}`}>{(pnl >= 0 ? '+' : '-') + usd(Math.abs(pnl)).slice(1)}</span></div>
                  <div className="kv"><span className="k">Taxas geradas</span><span className="v num up">{usd(p.fees)}</span></div>
                  <div className="kv"><span className="k">APR estimado</span><span className="v num">{fmt(apr)}%</span></div>
                  <div className="kv"><span className="k">Dias na pool</span><span className="v num">{dias}</span></div>
                </div>
                <div className="grid2" style={{ marginTop: 12 }}><button className="btn ghost" onClick={() => openPool(p)}>Editar</button>{p.link ? <a className="btn ghost" style={{ textDecoration: 'none', textAlign: 'center', lineHeight: '1.6' }} href={p.link} target="_blank" rel="noreferrer">Abrir dApp</a> : null}</div>
              </div>)
            })}
            <button className="addbtn" onClick={() => openPool(null)}>+ nova pool</button>
          </section>

          {/* APORTES */}
          <section className={`screen ${tab === 'aportes' ? 'active' : ''}`}>
            <div className="eyebrow">Fluxo de caixa · visão geral</div>
            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 4 }}>Capital & patrimônio (R$)</div>
              <div className="big-kv"><span className="k">Capital investido (custo)</span><span className="v num">{brl(capInvestidoBrl)}</span></div>
              <div className="big-kv"><span className="k">Patrimônio atual</span><span className="v num">{brl(patrBrlF)}</span></div>
              <div className="big-kv"><span className="k">Resultado</span><span className={`v num ${resultBrl >= 0 ? 'up' : 'down'}`}>{(resultBrl >= 0 ? '+' : '-') + brl(Math.abs(resultBrl)).slice(3)} · {pct(resultPct)}</span></div>
            </div>
            <div className="card section-gap"><div className="eyebrow" style={{ marginBottom: 6 }}>Onde está o capital</div>
              {distrib.map((x, i) => (<div className="kv" key={i}><span className="k"><span className="dist-dot" style={{ background: x.c }} />{x.n}</span><span className="v num">{brl(x.v * rate)} · {fmt(x.v / distTot * 100, 0)}%</span></div>))}
            </div>
            <div className="card section-gap"><div className="eyebrow" style={{ marginBottom: 8 }}>Tempo médio das posições</div>
              <div className="trio"><div className="stat"><div className="k">Dias</div><div className="v num">{fmt(avgDays, 0)}</div></div><div className="stat"><div className="k">Meses</div><div className="v num">{fmt(avgMonths, 1)}</div></div><div className="stat"><div className="k">Anos</div><div className="v num">{fmt(avgYears, 1)}</div></div></div>
            </div>
            <div className="card section-gap"><div className="eyebrow" style={{ marginBottom: 6 }}>Resultado por período</div>
              <table className="pltable"><thead><tr><th></th><th>%</th><th>R$</th></tr></thead><tbody>
                <tr><td>Período</td><td className={plPeriodoPct >= 0 ? 'up' : 'down'}>{pct(plPeriodoPct)}</td><td className={resultBrl >= 0 ? 'up' : 'down'}>{brl(resultBrl)}</td></tr>
                <tr><td>Anual</td><td className={plAnualPct >= 0 ? 'up' : 'down'}>{pct(plAnualPct)}</td><td className={plAnualBrl >= 0 ? 'up' : 'down'}>{brl(plAnualBrl)}</td></tr>
                <tr><td>Mensal</td><td className={plMensalPct >= 0 ? 'up' : 'down'}>{pct(plMensalPct)}</td><td className={plMensalBrl >= 0 ? 'up' : 'down'}>{brl(plMensalBrl)}</td></tr>
                <tr><td>Diário</td><td className={plDiarioPct >= 0 ? 'up' : 'down'}>{pct(plDiarioPct)}</td><td className={plDiarioBrl >= 0 ? 'up' : 'down'}>{brl(plDiarioBrl)}</td></tr>
              </tbody></table>
            </div>
            <div className="card section-gap">
              <div className="eyebrow" style={{ marginBottom: 4 }}>Movimentos de caixa (R$)</div>
              <div className="big-kv"><span className="k">Aportado</span><span className="v num up">{brl(totIn)} <span style={{ color: 'var(--muted)', fontSize: 11 }}>· {inFlows.length}x</span></span></div>
              <div className="big-kv"><span className="k">Retirado</span><span className="v num down">{brl(totOut)} <span style={{ color: 'var(--muted)', fontSize: 11 }}>· {outFlows.length}x</span></span></div>
              <div className="big-kv"><span className="k">% de retiradas</span><span className="v num">{fmt(pctRetirada, 1)}%</span></div>
              <div style={{ marginTop: 10 }}><button className="addbtn" onClick={() => openFlow(null)}>+ registrar aporte / retirada</button></div>
            </div>
            {flows.length > 0 && <div className="card section-gap"><div className="eyebrow" style={{ marginBottom: 4 }}>Extrato · toque p/ editar</div>
              {flows.slice().sort((a, b) => fdate(b).localeCompare(fdate(a))).map(f => { const d = daysSince(fdate(f)); return (
                <div className="flow-item" key={f.id} onClick={() => openFlow(f)} style={{ cursor: 'pointer' }}>
                  <div className={`flow-ic ${f.kind === 'in' ? 'flow-in' : 'flow-out'}`}>{f.kind === 'in' ? '↓' : '↑'}</div>
                  <div className="flow-t"><b>{f.kind === 'in' ? 'Aporte' : 'Retirada'}</b><span>{new Date(fdate(f)).toLocaleDateString('pt-BR')} · {d}d · {fmt(d / 30.44, 1)}m · {fmt(d / 365.25, 1)}a</span></div>
                  <div className={`flow-v ${f.kind === 'in' ? 'up' : 'down'}`}>{brl(f.amount)}</div>
                </div>) })}
            </div>}
          </section>

          {/* METAS */}
          <section className={`screen ${tab === 'metas' ? 'active' : ''}`}>
            <div className="eyebrow">Meta de aporte vs. real</div>
            <div className="card">{priced.filter(h => h.meta_pct > 0).sort((a, b) => b.meta_pct - a.meta_pct).map((h, i) => {
              const real = t.patr ? valOf(h) / t.patr * 100 : 0, denom = Math.max(h.meta_pct, real, 1), gap = real - h.meta_pct
              return (<div key={h.id} style={{ padding: '10px 0', borderTop: i > 0 ? '1px solid var(--line)' : undefined }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ fontWeight: 600, fontSize: 13.5 }}>{h.symbol}</span><span className="num" style={{ fontSize: 12, color: Math.abs(gap) < 0.5 ? 'var(--muted)' : (gap < 0 ? 'var(--pink)' : 'var(--red)') }}>{gap < 0 ? 'faltam ' : 'sobra '}{fmt(Math.abs(gap), 1)}%</span></div><div className="metabar" style={{ marginTop: 8 }}><div className="track"><div className="fill" style={{ width: `${Math.min(real / denom * 100, 100)}%` }} /><div className="goal" style={{ left: `${Math.min(h.meta_pct / denom * 100, 100)}%` }} /></div><div className="lbls"><span>real {fmt(real, 1)}%</span><span>meta {h.meta_pct}%</span></div></div></div>)
            })}</div>
          </section>

          {/* RADAR */}
          <section className={`screen ${tab === 'radar' ? 'active' : ''}`}>
            <div className="eyebrow">Radar de mercado · cardápio</div>
            <div className="segbar">
              {([['top', 'Top'], ['alts', 'Altcoins'], ['memes', 'Memes'], ['pools', 'Pools']] as [string, string][]).map(([k, l]) => (
                <button key={k} className={radarSeg === k ? 'seg on' : 'seg'} onClick={() => setRadarSeg(k as any)}>{l}</button>
              ))}
            </div>
            {radarLoading && <p className="foot-note">Carregando mercado…</p>}
            {!radarLoading && radar && radarSeg !== 'pools' && (radar[radarSeg] || []).map((c: any, i: number) => (
              <div className="qrow" key={i}>
                <div className="qsym">{c.image ? <img src={c.image} alt="" /> : c.symbol.slice(0, 3)}</div>
                <div className="qname"><b>{c.name}</b><span>{c.symbol} · vol {abbr(c.vol)}</span></div>
                <div className="qprice"><div className="p">{usd(c.price)}</div><div className="qchg"><span style={{ color: c.ch24 >= 0 ? 'var(--green)' : 'var(--red)' }}>{pct(c.ch24 || 0)} 24h</span>{c.ch7d != null && <span style={{ color: c.ch7d >= 0 ? 'var(--green)' : 'var(--red)', marginLeft: 8 }}>{pct(c.ch7d)} 7d</span>}</div></div>
              </div>
            ))}
            {!radarLoading && radar && radarSeg === 'pools' && (radar.pools || []).map((p: any, i: number) => (
              <div className="qrow" key={i}>
                <div className="qsym" style={{ background: 'linear-gradient(145deg,#2BFFC6,#7C5CFF)' }}>{(p.network || '').slice(0, 3).toUpperCase()}</div>
                <div className="qname"><b>{p.name}</b><span>{p.network} · TVL {abbr(p.tvl)}</span></div>
                <div className="qprice"><div className="p">{abbr(p.vol24)}</div><div className="qchg" style={{ color: p.ch24 >= 0 ? 'var(--green)' : 'var(--red)' }}>{pct(p.ch24 || 0)} 24h</div></div>
              </div>
            ))}
            {!radarLoading && radar && radarSeg !== 'pools' && (!radar[radarSeg] || radar[radarSeg].length === 0) && <p className="foot-note">Sem dados agora — tente novamente em instantes.</p>}
            <p className="foot-note">Dados de mercado (CoinGecko / GeckoTerminal). Cardápio para pesquisa — não é recomendação. Estude cada ativo antes de investir.</p>
          </section>

          <p className="foot-note"><b style={{color:'var(--pink-bright)',fontFamily:'Sora'}}>Tiger Invest</b> · Não é recomendação de investimento. Todo e qualquer investimento é por conta e risco do usuário — estude os ativos antes de aplicar seu capital.</p>
        </div>

        <nav className="nav">
          {([
            ['inicio', 'Início', <path key="a" d="M3 11l9-8 9 8M5 10v10h14V10" />],
            ['carteira', 'Carteira', <><rect key="a" x="3" y="6" width="18" height="13" rx="2" /><path key="b" d="M16 12h3" /></>],
            ['cotacao', 'Cotação', <path key="a" d="M4 18l5-6 4 3 6-8M4 18h16" />],
            ['radar', 'Radar', <><circle key="a" cx="12" cy="12" r="9" /><circle key="b" cx="12" cy="12" r="4.5" /><path key="c" d="M12 3v3M12 18v3M3 12h3M18 12h3" /></>],
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
          const custoMedio = h.qty ? h.invested / h.qty : 0, pctInv = t.totalInv ? h.invested / t.totalInv * 100 : 0
          const firstDate = my.length ? my.map(x => x.buy_date).sort()[0] : '', L = live[h.cg_id], sg = signals[h.cg_id]
          return (
            <div className="modal" onClick={e => { if (e.target === e.currentTarget) setDetail(null) }}>
              <div className="sheet"><div className="grabber" />
                <div className="sheet-scroll">
                  <h3><span className="sym" style={{ width: 32, height: 32, background: `linear-gradient(145deg,${h.color},${h.color}88)` }}>{h.symbol.slice(0, 4)}</span>{h.name}<span style={{ marginLeft: 'auto' }} className={`pill ${pl >= 0 ? 'up' : 'down'}`}>{pct(plp)}</span></h3>

                  {sg ? <SigBody sg={sg} /> : h.kind === 'crypto' ? <p className="foot-note" style={{ marginTop: 14 }}>{sigTried ? 'Análise técnica indisponível para este ativo agora — tente reabrir em instantes.' : 'Analisando estrutura do gráfico…'}</p> : null}

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
                  {my.map(x => (<div className="txitem" key={x.id}>
                    <div className="txhead"><span>{new Date(x.buy_date).toLocaleDateString('pt-BR')} · {daysSince(x.buy_date)}d</span><b>{fmt(x.qty, x.qty < 1 ? 5 : 3)} @ {usd(x.buy_price)}</b></div>
                    <div className="txmeta"><span className="txtag">rede <b>{x.rede || '—'}</b></span><span className="txtag">corretora <b>{x.corretora || '—'}</b></span><span className="txtag">carteira <b>{x.carteira || '—'}</b></span><span className="txtag">saldo <b>{usd(x.qty * x.buy_price)}</b></span>{x.stop_limit > 0 && <span className="txtag">stop <b>{usd(x.stop_limit)}</b></span>}{x.target > 0 && <span className="txtag">alvo <b>{usd(x.target)}</b></span>}<span className="txtag" style={{ cursor: 'pointer', color: 'var(--red)' }} onClick={() => delTx(x.id!, h)}>excluir ✕</span></div>
                  </div>))}
                  <div className="grid2" style={{ marginTop: 16 }}><button className="btn ghost danger" onClick={() => delAsset(h)}>Excluir ativo</button><button className="btn" onClick={() => openBuy(h)}>+ Registrar compra</button></div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* FORM DE COMPRA */}
        {txForm && (
          <div className="modal" onClick={e => { if (e.target === e.currentTarget) setTxForm(null) }}>
            <div className="sheet"><div className="grabber" /><div className="sheet-scroll">
              <h3>{txForm.isNew ? 'Novo ativo / 1ª compra' : `Comprar ${txForm.symbol}`}</h3>
              {txForm.isNew && (<>
                <div className="grid2"><div className="field"><label>Nome</label><input value={txForm.name} onChange={e => setTxForm({ ...txForm, name: e.target.value })} placeholder="Ethereum" /></div><div className="field"><label>Símbolo</label><input value={txForm.symbol} onChange={e => setTxForm({ ...txForm, symbol: e.target.value.toUpperCase() })} placeholder="ETH" /></div></div>
                <div className="grid2"><div className="field"><label>ID CoinGecko</label><input value={txForm.cg_id} onChange={e => setTxForm({ ...txForm, cg_id: e.target.value })} placeholder="ethereum" /></div><div className="field"><label>Meta %</label><input inputMode="decimal" value={txForm.meta_pct} onChange={e => setTxForm({ ...txForm, meta_pct: e.target.value })} /></div></div>
              </>)}
              <div className="grid2"><div className="field"><label>Rede</label><input value={txForm.rede} onChange={e => setTxForm({ ...txForm, rede: e.target.value })} placeholder="BASE" /></div><div className="field"><label>Corretora</label><input value={txForm.corretora} onChange={e => setTxForm({ ...txForm, corretora: e.target.value })} placeholder="BYbit" /></div></div>
              <div className="grid2"><div className="field"><label>Carteira</label><input value={txForm.carteira} onChange={e => setTxForm({ ...txForm, carteira: e.target.value })} placeholder="METAMASK" /></div><div className="field"><label>Data da compra</label><input type="date" value={txForm.buy_date} onChange={e => setTxForm({ ...txForm, buy_date: e.target.value })} /></div></div>
              <div className="grid2"><div className="field"><label>Qtd. na compra</label><input inputMode="decimal" value={txForm.qty} onChange={e => setTxForm({ ...txForm, qty: e.target.value })} /></div><div className="field"><label>Preço compra U$</label><input inputMode="decimal" value={txForm.buy_price} onChange={e => setTxForm({ ...txForm, buy_price: e.target.value })} /></div></div>
              <div className="grid2"><div className="field"><label>Stop limit U$</label><input inputMode="decimal" value={txForm.stop_limit} onChange={e => setTxForm({ ...txForm, stop_limit: e.target.value })} /></div><div className="field"><label>Alvo venda U$</label><input inputMode="decimal" value={txForm.target} onChange={e => setTxForm({ ...txForm, target: e.target.value })} /></div></div>
              <div className="modal-preview"><span>Saldo desta compra</span><b className="num">{usd(num(txForm.qty) * num(txForm.buy_price))}</b></div>
              <div className="grid2" style={{ marginTop: 16 }}><button className="btn ghost" onClick={() => setTxForm(null)}>Cancelar</button><button className="btn" onClick={saveBuy}>Salvar compra</button></div>
            </div></div>
          </div>
        )}

        {/* FORM DE POOL */}
        {poolForm && (
          <div className="modal" onClick={e => { if (e.target === e.currentTarget) setPoolForm(null) }}>
            <div className="sheet"><div className="grabber" /><div className="sheet-scroll">
              <h3>{poolForm.id ? 'Editar pool' : 'Nova pool'}</h3>
              <div className="grid2"><div className="field"><label>Par 1 (volátil)</label><input value={poolForm.par1} onChange={e => setPoolForm({ ...poolForm, par1: e.target.value.toUpperCase() })} placeholder="ETH" /></div><div className="field"><label>ID CoinGecko p/ range</label><input value={poolForm.par1_cg_id} onChange={e => setPoolForm({ ...poolForm, par1_cg_id: e.target.value })} placeholder="ethereum" /></div></div>
              <div className="grid2"><div className="field"><label>Par 2 (estável)</label><input value={poolForm.par2} onChange={e => setPoolForm({ ...poolForm, par2: e.target.value.toUpperCase() })} placeholder="USDC" /></div><div className="field"><label>dApp</label><input value={poolForm.dapp} onChange={e => setPoolForm({ ...poolForm, dapp: e.target.value })} placeholder="Uniswap v3" /></div></div>
              <div className="grid2"><div className="field"><label>Rede</label><input value={poolForm.rede} onChange={e => setPoolForm({ ...poolForm, rede: e.target.value })} placeholder="Base" /></div><div className="field"><label>Data de entrada</label><input type="date" value={poolForm.entry_date} onChange={e => setPoolForm({ ...poolForm, entry_date: e.target.value })} /></div></div>
              <div className="grid2"><div className="field"><label>Range LOW (preço)</label><input inputMode="decimal" value={poolForm.low_range} onChange={e => setPoolForm({ ...poolForm, low_range: e.target.value })} /></div><div className="field"><label>Range HIGH (preço)</label><input inputMode="decimal" value={poolForm.high_range} onChange={e => setPoolForm({ ...poolForm, high_range: e.target.value })} /></div></div>
              <div className="grid2"><div className="field"><label>Aporte U$</label><input inputMode="decimal" value={poolForm.aporte} onChange={e => setPoolForm({ ...poolForm, aporte: e.target.value })} /></div><div className="field"><label>Saldo atual U$</label><input inputMode="decimal" value={poolForm.current_value} onChange={e => setPoolForm({ ...poolForm, current_value: e.target.value })} /></div></div>
              <div className="grid2"><div className="field"><label>Taxas geradas U$</label><input inputMode="decimal" value={poolForm.fees} onChange={e => setPoolForm({ ...poolForm, fees: e.target.value })} /></div><div className="field"><label>Link da pool</label><input value={poolForm.link} onChange={e => setPoolForm({ ...poolForm, link: e.target.value })} placeholder="https://..." /></div></div>
              <div className="grid2"><div className="field"><label>Rede (p/ estatísticas)</label><input value={poolForm.network || 'base'} onChange={e => setPoolForm({ ...poolForm, network: e.target.value })} placeholder="base" /></div><div className="field"><label>Endereço da pool (tração)</label><input value={poolForm.pool_address || ''} onChange={e => setPoolForm({ ...poolForm, pool_address: e.target.value })} placeholder="0x... (opcional)" /></div></div>
              <div className="grid2" style={{ marginTop: 16 }}>{poolForm.id && <button className="btn ghost danger" onClick={() => delPool(poolForm.id)}>Excluir</button>}<button className="btn ghost" onClick={() => setPoolForm(null)}>Cancelar</button><button className="btn" onClick={savePool}>Salvar</button></div>
            </div></div>
          </div>
        )}

        {/* FLUXO: novo/editar movimento */}
        {flowForm && (
          <div className="modal" onClick={e => { if (e.target === e.currentTarget) setFlowForm(null) }}>
            <div className="sheet"><div className="grabber" />
              <h3>{flowForm.id ? 'Editar movimento' : 'Novo movimento'}</h3>
              <div className="field"><label>Tipo</label><select value={flowForm.kind} onChange={e => setFlowForm({ ...flowForm, kind: e.target.value })}><option value="in">Aporte</option><option value="out">Retirada</option></select></div>
              <div className="grid2"><div className="field"><label>Valor R$</label><input inputMode="decimal" value={flowForm.amount} onChange={e => setFlowForm({ ...flowForm, amount: e.target.value })} /></div><div className="field"><label>Data</label><input type="date" value={flowForm.move_date} onChange={e => setFlowForm({ ...flowForm, move_date: e.target.value })} /></div></div>
              <div className="grid2" style={{ marginTop: 16 }}>{flowForm.id && <button className="btn ghost danger" onClick={() => delFlow(flowForm.id)}>Excluir</button>}<button className="btn ghost" onClick={() => setFlowForm(null)}>Cancelar</button><button className="btn" onClick={saveFlow}>Salvar</button></div>
            </div>
          </div>
        )}

        {/* RADAR: análise estrutural do ativo */}
        {radarDetail && (
          <div className="modal" onClick={e => { if (e.target === e.currentTarget) setRadarDetail(null) }}>
            <div className="sheet"><div className="grabber" />
              <div className="sheet-scroll">
                <h3><span className="qsym" style={{ width: 32, height: 32 }}>{radarDetail.image ? <img src={radarDetail.image} alt="" /> : (radarDetail.symbol || '?').slice(0, 3)}</span>{radarDetail.name}<span style={{ marginLeft: 'auto', fontFamily: 'JetBrains Mono', fontSize: 14 }}>{usd(radarDetail.price)}</span></h3>
                {radarSigLoading && <p className="foot-note" style={{ marginTop: 14 }}>Analisando estrutura do gráfico…</p>}
                {!radarSigLoading && radarSig && <SigBody sg={radarSig} />}
                {!radarSigLoading && !radarSig && <p className="foot-note" style={{ marginTop: 14 }}>Análise técnica indisponível para este ativo agora.</p>}
                <div style={{ marginTop: 16 }}><button className="btn ghost" onClick={() => setRadarDetail(null)}>Fechar</button></div>
              </div>
            </div>
          </div>
        )}

        {/* EDIT CAIXA */}
        {editDraft && (
          <div className="modal" onClick={e => { if (e.target === e.currentTarget) setEditDraft(null) }}>
            <div className="sheet"><div className="grabber" />
              <h3>{editDraft.name}</h3>
              <div className="field"><label>Valor atual U$</label><input inputMode="decimal" value={editDraft.current_value ?? 0} onChange={e => setEditDraft({ ...editDraft, current_value: num(e.target.value) })} /></div>
              <div className="grid2" style={{ marginTop: 16 }}><button className="btn ghost" onClick={() => setEditDraft(null)}>Cancelar</button><button className="btn" onClick={saveEdit}>Salvar</button></div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}


function SigBody({ sg }: { sg: Signal }) {
  return (
    <div className="sigcard">
                    <div className={`verdict verdict-${sg.verdict.tone}`}>
                      <div className={`vic vic-${sg.verdict.tone}`}>{sg.verdict.tone === 'buy' ? '↑' : sg.verdict.tone === 'sell' ? '↓' : '≈'}</div>
                      <div><b>{sg.verdict.label}</b><p>{sg.verdict.text}</p></div>
                    </div>
                    <div className={`struct struct-${sg.structure}`}><span>Estrutura</span><b>{sg.structure === 'baixa' ? 'TENDÊNCIA DE BAIXA' : sg.structure === 'alta' ? 'TENDÊNCIA DE ALTA' : 'LATERAL'} · {sg.structHint}</b></div>
                    <div className="rr">
                      <div className="rr-cell up"><span>Até resistência</span><b>+{fmt(sg.upside, 0)}%</b></div>
                      <div className="rr-cell down"><span>Até suporte</span><b>-{fmt(sg.downside, 0)}%</b></div>
                      <div className="rr-cell"><span>Risco/Retorno</span><b>{sg.rr > 0 ? '1:' + fmt(sg.rr, 1) : '—'}</b></div>
                    </div>
                    <div className="levels">
                      <div className="lvl-col"><div className="lvl-h res">Resistências ▲</div>
                        {sg.resistances.length ? sg.resistances.map((z, i) => (<div className="lvl" key={'r' + i}><b className="down">{usd(z.price)}</b><span>+{fmt(z.dist, 0)}%{z.touches > 1 ? ` · ${z.touches}x` : ''}</span></div>)) : <div className="lvl"><span>—</span></div>}</div>
                      <div className="lvl-col"><div className="lvl-h sup">Suportes ▼</div>
                        {sg.supports.length ? sg.supports.map((z, i) => (<div className="lvl" key={'s' + i}><b className="up">{usd(z.price)}</b><span>-{fmt(z.dist, 0)}%{z.touches > 1 ? ` · ${z.touches}x` : ''}</span></div>)) : <div className="lvl"><span>—</span></div>}</div>
                    </div>
                    <div className="triggers">
                      <div className="trg trg-buy"><b>↑ Vira comprador</b><span>{sg.trigger.buy}</span></div>
                      <div className="trg trg-sell"><b>↓ Continua baixa</b><span>{sg.trigger.sell}</span></div>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <div className="sigrow"><span className="k">Ciclo (BMSB)</span><span className="v" style={{ color: sg.cyclePos === 'above' ? 'var(--green)' : sg.cyclePos === 'below' ? 'var(--red)' : '#F5A623' }}>{usd(sg.bmsbMid)}</span></div>
                      <div className="sigrow"><span className="k">Confirmação</span><span className="v sighint">{sg.confirm}</span></div>
                      <div className="sigrow"><span className="k">RSI (14)</span><span className="v">{sg.rsi != null ? fmt(sg.rsi, 0) : '—'} <span className="sighint">· {sg.rsiHint}</span></span></div>
                      <div className="sigrow"><span className="k">Médias</span><span className="v">{sg.maAbove}/3 <span className="sighint">· {sg.maHint}</span></span></div>
                    </div>
                  </div>
  )
}
