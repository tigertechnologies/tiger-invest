'use client'
import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Background from './Background'
import {
  Holding, Flow, Transaction, Pool, Signal, DEFAULT_HOLDINGS, DEFAULT_POOL, BRL_RATE,
  value as valOf, usd, pct, brl, fmt, daysSince, Level,
} from '@/lib/data'

type Tab = 'inicio' | 'carteira' | 'cotacao' | 'radar' | 'pools' | 'aportes' | 'metas'
const uniq = (a: string[]) => Array.from(new Set(a.filter(Boolean)))
const agg = (arr: string[]) => { const u = uniq(arr); return u.length === 0 ? '—' : u.length === 1 ? u[0] : 'várias' }
const num = (v: any) => parseFloat(String(v).replace(',', '.')) || 0

// XIRR — retorno anualizado ponderado pelo dinheiro e pelas datas reais dos aportes/retiradas.
// cfs: aporte = valor NEGATIVO (saiu do bolso), retirada/valor atual = POSITIVO. Resolve por bisseção.
function xirr(cfs: { date: string; amount: number }[]): number | null {
  const cf = cfs.filter(c => c.amount !== 0).slice().sort((a, b) => a.date.localeCompare(b.date))
  if (cf.length < 2 || !cf.some(c => c.amount > 0) || !cf.some(c => c.amount < 0)) return null
  const t0 = new Date(cf[0].date + 'T00:00:00').getTime()
  const yrs = (d: string) => (new Date(d + 'T00:00:00').getTime() - t0) / (365.25 * 86400000)
  const npv = (r: number) => cf.reduce((s, c) => s + c.amount / Math.pow(1 + r, yrs(c.date)), 0)
  let lo = -0.9999, hi = 10, flo = npv(lo), fhi = npv(hi)
  if (flo * fhi > 0) { hi = 100; fhi = npv(hi); if (flo * fhi > 0) return null }
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, fm = npv(mid)
    if (!isFinite(fm)) return null
    if (Math.abs(fm) < 1e-7) return mid
    if (flo * fm < 0) hi = mid; else { lo = mid; flo = fm }
  }
  return (lo + hi) / 2
}

export default function DashboardApp({
  userEmail, plan = 'alpha', periodEnd = null, isAdmin = false, initialHoldings, initialFlows, initialTx, initialPools, initialLevels,
}: { userEmail: string; plan?: string; periodEnd?: string | null; isAdmin?: boolean; initialHoldings: Holding[]; initialFlows: Flow[]; initialTx: Transaction[]; initialPools: Pool[]; initialLevels: Level[] }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  // --- Gate por plano ---
  const RANK: Record<string, number> = { start: 1, pro: 2, alpha: 3 }
  const rank = RANK[plan] || 1
  const has = (min: number) => rank >= min
  const TAB_MIN: Record<string, number> = { inicio: 1, carteira: 1, cotacao: 1, metas: 1, pools: 1, radar: 2, aportes: 3 }
  const PLAN_NAME: Record<number, string> = { 2: 'TIGER PRO', 3: 'TIGER ALPHA' }
  const [upgrade, setUpgrade] = useState<{ tier: number; feature: string } | null>(null)
  // Aviso de renovação (aparece 5 dias antes, até o dia do vencimento)
  const planLabel = ({ start: 'TIGER START', pro: 'TIGER PRO', alpha: 'TIGER ALPHA' } as Record<string, string>)[plan] || 'plano'
  const daysToEnd = periodEnd ? Math.ceil((new Date(periodEnd).getTime() - Date.now()) / 86400000) : null
  const showRenew = daysToEnd != null && daysToEnd >= 0 && daysToEnd <= 5
  const [holdings, setHoldings] = useState<Holding[]>(initialHoldings)
  const [flows, setFlows] = useState<Flow[]>(initialFlows)
  const [txs, setTxs] = useState<Transaction[]>(initialTx)
  const [pools, setPools] = useState<Pool[]>(initialPools)
  const [levels, setLevels] = useState<Level[]>(initialLevels)
  const [levelForm, setLevelForm] = useState<any | null>(null)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [stockLive, setStockLive] = useState<Record<string, { price: number; ch24: number | null }>>({})
  const [tab, setTab] = useState<Tab>('inicio')
  const [live, setLive] = useState<Record<string, any>>({})
  const [brlRate, setBrlRate] = useState({ tether: BRL_RATE, usdc: BRL_RATE })
  const [signals, setSignals] = useState<Record<string, Signal>>({})
  const [sigTried, setSigTried] = useState(false)
  const [radar, setRadar] = useState<any | null>(null)
  const [radarSeg, setRadarSeg] = useState<'top' | 'alts' | 'memes' | 'pools'>('top')
  const [radarLoading, setRadarLoading] = useState(false)
  const [poolNet, setPoolNet] = useState('all')
  const [poolsLoading, setPoolsLoading] = useState(false)
  const [radarDetail, setRadarDetail] = useState<any | null>(null)
  const [radarSig, setRadarSig] = useState<Signal | null>(null)
  const [radarSigLoading, setRadarSigLoading] = useState(false)
  const [userId, setUserId] = useState('')
  const [detail, setDetail] = useState<Holding | null>(null)
  const [editDraft, setEditDraft] = useState<Holding | null>(null)
  const [cashInput, setCashInput] = useState('')
  const [assetEdit, setAssetEdit] = useState<any | null>(null)
  const [txForm, setTxForm] = useState<any | null>(null)
  const [poolForm, setPoolForm] = useState<any | null>(null)
  const [flowForm, setFlowForm] = useState<any | null>(null)
  const [curr, setCurr] = useState<'BRL' | 'USD'>('BRL')
  const [poolData, setPoolData] = useState<Record<string, any>>({})
  // "Onde abrir pool": melhores pares por Vol/TVL e risco de IL (dados ao vivo)
  const [ideas, setIdeas] = useState<any[] | null>(null)
  const [ideasNet, setIdeasNet] = useState('all')
  const [ideasLoading, setIdeasLoading] = useState(false)
  const [passiveOnly, setPassiveOnly] = useState(false)
  const [watchOnly, setWatchOnly] = useState(false)
  const [watch, setWatch] = useState<string[]>([])
  const [expandedIdea, setExpandedIdea] = useState<string | null>(null)
  const [calc, setCalc] = useState<any | null>(null)

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? '')) }, [supabase])

  const refetch = useCallback(async () => {
    const [h, f, t, p, l] = await Promise.all([
      supabase.from('holdings').select('*').order('sort', { ascending: true }),
      supabase.from('flows').select('*').order('created_at', { ascending: false }),
      supabase.from('transactions').select('*').order('buy_date', { ascending: true }),
      supabase.from('pools').select('*').order('created_at', { ascending: true }),
      supabase.from('levels').select('*').order('price', { ascending: false }),
    ])
    if (h.data) setHoldings(h.data as Holding[])
    if (f.data) setFlows(f.data as Flow[])
    if (t.data) setTxs(t.data as Transaction[])
    if (p.data) setPools(p.data as Pool[])
    if (l.data) setLevels(l.data as Level[])
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

  const loadPoolsNet = (net: string) => {
    if (net === poolNet && radar?.pools) return
    setPoolNet(net); setPoolsLoading(true)
    fetch(`/api/radar?net=${net}`).then(r => r.json()).then(d => setRadar((prev: any) => ({ ...(prev || {}), pools: d.pools || [] }))).catch(() => {}).finally(() => setPoolsLoading(false))
  }

  const loadIdeas = (net: string) => {
    setIdeasNet(net); setIdeasLoading(true)
    fetch(`/api/poolideas?net=${net}`).then(r => r.json()).then(d => setIdeas(d.ideas || [])).catch(() => setIdeas([])).finally(() => setIdeasLoading(false))
  }
  // carrega "onde abrir pool" ao abrir a aba Pools (só quem tem o recurso liberado)
  useEffect(() => {
    if (tab === 'pools' && ideas === null && !ideasLoading && has(2)) loadIdeas(ideasNet)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // abre a calculadora de IL, pré-preenchendo com a pool escolhida (se veio de um card)
  const openCalc = (it?: any) => setCalc({
    pair: it?.name || '', apr: it?.feeApr != null ? String(it.feeApr) : '', ilLabel: it?.il || '',
    capital: '1000', chg: '30', days: '30', v3: false, width: '20',
  })

  // Watchlist de pools. Cache local imediato + sync com a nuvem (tabela pool_watch) quando logado.
  useEffect(() => { try { const w = JSON.parse(localStorage.getItem('tiger_pool_watch') || '[]'); if (Array.isArray(w)) setWatch(w) } catch { } }, [])
  useEffect(() => {
    if (!userId) return
    // se a tabela ainda não existir (SQL não rodado), o erro é ignorado e segue no modo local
    supabase.from('pool_watch').select('pool_key').then(({ data, error }) => {
      if (!error && Array.isArray(data)) {
        const keys = data.map((r: any) => r.pool_key)
        setWatch(keys)
        try { localStorage.setItem('tiger_pool_watch', JSON.stringify(keys)) } catch { }
      }
    }, () => { })
  }, [userId, supabase])
  const keyOf = (it: any) => `${it.name}|${it.network}`
  const toggleStar = (it: any) => {
    const k = keyOf(it); const had = watch.includes(k)
    const nx = had ? watch.filter(x => x !== k) : [...watch, k]
    setWatch(nx)
    try { localStorage.setItem('tiger_pool_watch', JSON.stringify(nx)) } catch { }
    if (userId) {
      if (had) supabase.from('pool_watch').delete().eq('pool_key', k).then(() => { }, () => { })
      else supabase.from('pool_watch').upsert({ user_id: userId, pool_key: k, name: it.name, network: it.network, dex: it.dex }, { onConflict: 'user_id,pool_key' }).then(() => { }, () => { })
    }
  }

  useEffect(() => {
    const syms = Array.from(new Set(holdings.filter(h => h.kind === 'stock').map(h => h.symbol)))
    if (!syms.length) return
    let active = true
    const load = () => fetch(`/api/stocks?symbols=${syms.join(',')}`).then(r => r.json()).then(d => { if (active) setStockLive(d || {}) }).catch(() => {})
    load(); const t = setInterval(load, 60000)
    return () => { active = false; clearInterval(t) }
  }, [holdings])

  const ph = useCallback((h: Holding): Holding => {
    if (h.cg_id && live[h.cg_id]?.usd) return { ...h, price: live[h.cg_id].usd }
    if (h.kind === 'stock' && stockLive[h.symbol]?.price) return { ...h, price: stockLive[h.symbol].price }
    return h
  }, [live, stockLive])
  const priced = useMemo(() => holdings.map(ph), [holdings, ph])

  // ---- ALERTAS: varre preços ao vivo vs níveis/alvos/stops/range ----
  const alerts = useMemo(() => {
    const out: { id: string; tone: 'buy' | 'sell' | 'warn'; icon: string; title: string; text: string }[] = []
    // níveis personalizados atingidos
    for (const l of levels) {
      const h = priced.find(x => x.symbol === l.symbol && x.kind === 'crypto')
      if (!h || !h.price) continue
      const near = Math.abs(h.price - l.price) / l.price <= 0.02
      if (near) out.push({ id: 'lv' + l.id, tone: l.kind === 'support' ? 'buy' : 'sell', icon: l.kind === 'support' ? '▼' : '▲', title: `${l.symbol} no seu ${l.kind === 'support' ? 'suporte' : 'resistência'}`, text: `${usd(h.price)} ~ ${usd(l.price)}${l.note ? ' · ' + l.note : ''}` })
    }
    // alvo / stop das compras
    const bySym: Record<string, { target: number; stop: number; name: string; cg: string }> = {}
    for (const x of txs) {
      if (!bySym[x.symbol]) bySym[x.symbol] = { target: 0, stop: 0, name: x.name, cg: x.cg_id }
      if (x.target > bySym[x.symbol].target) bySym[x.symbol].target = x.target
      if (x.stop_limit > 0 && (bySym[x.symbol].stop === 0 || x.stop_limit > bySym[x.symbol].stop)) bySym[x.symbol].stop = x.stop_limit
    }
    for (const sym of Object.keys(bySym)) {
      const h = priced.find(x => x.symbol === sym && x.kind === 'crypto'); if (!h || !h.price) continue
      const b = bySym[sym]
      if (b.target > 0 && h.price >= b.target) out.push({ id: 'tg' + sym, tone: 'sell', icon: '🎯', title: `${sym} atingiu o alvo`, text: `${usd(h.price)} ≥ alvo ${usd(b.target)} — considere realizar` })
      if (b.stop > 0 && h.price <= b.stop) out.push({ id: 'st' + sym, tone: 'sell', icon: '🛑', title: `${sym} atingiu o stop`, text: `${usd(h.price)} ≤ stop ${usd(b.stop)} — reavalie a posição` })
    }
    // pools fora / perto de sair do range
    for (const p of pools) {
      const price = live[p.par1_cg_id]?.usd ?? 0
      if (!price || !p.low_range || !p.high_range) continue
      const span = p.high_range - p.low_range
      if (price < p.low_range || price > p.high_range) out.push({ id: 'plo' + p.id, tone: 'warn', icon: '⚠', title: `Pool ${p.par1}/${p.par2} FORA do range`, text: `${p.par1} em ${fmt(price)} · deixou de gerar taxas` })
      else if (span > 0) { const pos = (price - p.low_range) / span * 100; if (pos < 10 || pos > 90) out.push({ id: 'pln' + p.id, tone: 'warn', icon: '⚠', title: `Pool ${p.par1}/${p.par2} perto de sair`, text: `${p.par1} em ${fmt(price)} · chegando na borda da faixa` }) }
    }
    return out
  }, [priced, levels, txs, pools, live])
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

  // ---- Histórico de patrimônio (snapshots diários) ----
  const [snaps, setSnaps] = useState<any[]>([])
  const snapDoneRef = useRef(false)
  // ---- Alertas de pool em segundo plano (gerados pelo cron, lidos aqui) ----
  const [poolAlerts, setPoolAlerts] = useState<any[]>([])
  useEffect(() => {
    if (!userId) return
    supabase.from('pool_alert').select('id,name,network,message').eq('seen', false).order('created_at', { ascending: false }).then(({ data, error }) => {
      if (!error && Array.isArray(data)) setPoolAlerts(data.map((a: any) => ({ id: 'pa' + a.id, _row: a.id, tone: 'buy', icon: '💧', title: `Pool vigiada: ${a.name}`, text: a.message })))
    }, () => { })
  }, [userId, supabase])
  useEffect(() => {
    if (!alertsOpen || !poolAlerts.length) return
    const ids = poolAlerts.map(a => a._row).filter(Boolean)
    if (ids.length) supabase.from('pool_alert').update({ seen: true }).in('id', ids).then(() => { }, () => { })
  }, [alertsOpen, poolAlerts, supabase])
  useEffect(() => {
    if (!userId) return
    supabase.from('portfolio_snapshot').select('snap_date,patrimonio_usd,custo_usd,brl_rate').order('snap_date').then(({ data, error }) => {
      if (!error && Array.isArray(data)) setSnaps(data)
    }, () => { })
  }, [userId, supabase])
  useEffect(() => {
    if (!userId || snapDoneRef.current) return
    if (!(t.patr > 0 && t.totalInv > 0)) return               // não grava foto vazia (preços ainda carregando)
    const today = new Date().toISOString().slice(0, 10)
    if (snaps.some(s => s.snap_date === today)) { snapDoneRef.current = true; return }
    snapDoneRef.current = true
    const row = { snap_date: today, patrimonio_usd: +t.patr.toFixed(2), custo_usd: +t.totalInv.toFixed(2), brl_rate: +(brlRate.tether || 0).toFixed(4) }
    supabase.from('portfolio_snapshot').upsert({ user_id: userId, ...row }, { onConflict: 'user_id,snap_date' })
      .then(() => setSnaps(prev => [...prev.filter(s => s.snap_date !== today), row].sort((a, b) => a.snap_date.localeCompare(b.snap_date))), () => { })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, t.patr, t.totalInv, snaps])

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
  async function saveEdit() { if (!editDraft?.id) return; await supabase.from('holdings').update({ current_value: num(cashInput) }).eq('id', editDraft.id); setEditDraft(null); await refetch() }
  const openAssetEdit = (h: Holding) => setAssetEdit({ id: h.id, name: h.name, symbol: h.symbol, cg_id: h.cg_id, meta_pct: String(h.meta_pct ?? '') })
  async function saveAssetEdit() { const f = assetEdit; if (!f?.id) return; await supabase.from('holdings').update({ name: f.name, cg_id: f.cg_id, meta_pct: num(f.meta_pct) }).eq('id', f.id); setAssetEdit(null); setDetail(null); await refetch() }
  const fdate = (f: Flow) => f.move_date || (f.created_at ? f.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10))
  const abbr = (n: number) => { const a = Math.abs(n); return '$' + (a >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : a >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : a >= 1e3 ? (n / 1e3).toFixed(0) + 'K' : n.toFixed(0)) }
  async function saveFlow() { const f = flowForm; if (!f) return; const payload = { user_id: userId, kind: f.kind, amount: num(f.amount), move_date: f.move_date }; if (f.id) await supabase.from('flows').update(payload).eq('id', f.id); else await supabase.from('flows').insert(payload); setFlowForm(null); await refetch() }
  async function delFlow(id: string) { await supabase.from('flows').delete().eq('id', id); setFlowForm(null); await refetch() }

  // ---- Importar aportes/retiradas em lote (colar do Excel) ----
  const [importer, setImporter] = useState<any | null>(null)
  const parseBRL = (s: string): number => {
    let x = String(s || '').trim().replace(/R\$|\s/g, '')
    if (!x || x === '-' || x === '—') return 0
    if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.')
    else if ((x.match(/\./g) || []).length > 1) x = x.replace(/\./g, '')
    const n = parseFloat(x); return isFinite(n) ? Math.abs(n) : 0
  }
  const parseDate = (s: string): string | null => {
    let m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
    if (m) { let y = m[3]; if (y.length === 2) y = '20' + y; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` }
    m = s.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`
    return null
  }
  const parseImport = (text: string, mode: 'auto' | 'in' | 'out') => {
    const rows: { kind: 'in' | 'out'; amount: number; date: string }[] = []
    let bad = 0
    for (const raw of (text || '').split(/\r?\n/)) {
      const line = raw.trim(); if (!line) continue
      const cells = line.split(/\t|;/).map(c => c.trim())
      const di = cells.findIndex(c => parseDate(c))
      if (di < 0) { bad++; continue }
      const date = parseDate(cells[di])!
      const after = cells.slice(di + 1)                 // colunas DEPOIS da data (retirada, aporte, ...)
      if (mode === 'auto') {
        const vOut = parseBRL(after[0] || ''), vIn = parseBRL(after[1] || '')
        if (vOut > 0) rows.push({ kind: 'out', amount: vOut, date })
        if (vIn > 0) rows.push({ kind: 'in', amount: vIn, date })
        if (vOut <= 0 && vIn <= 0) bad++
      } else {
        const nums = after.map(parseBRL).filter(v => v > 0)
        const v = nums.length ? nums[0] : 0             // no modo single, o 1º valor após a data
        if (v > 0) rows.push({ kind: mode, amount: v, date }); else bad++
      }
    }
    return { rows, bad }
  }
  async function runImport() {
    const im = importer; if (!im) return
    const { rows } = parseImport(im.text, im.mode)
    if (!rows.length) return
    setImporter({ ...im, busy: true })
    if (im.replace) await supabase.from('flows').delete().eq('user_id', userId)
    // insere em blocos de 200
    for (let i = 0; i < rows.length; i += 200) {
      await supabase.from('flows').insert(rows.slice(i, i + 200).map(r => ({ user_id: userId, kind: r.kind, amount: r.amount, move_date: r.date })))
    }
    setImporter(null); await refetch()
  }
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
  const [hi, cent] = usdSplit(t.patr); const res = t.pl
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
  // ---- FLUXO DE CAIXA (metodologia da planilha): resultado sobre o LÍQUIDO APORTADO + XIRR ----
  const liquidoAportado = totIn - totOut                               // aportes − retiradas (R$)
  const resultadoFluxo = patrBrlF - liquidoAportado                    // saldo atual − líquido aportado
  const resultadoFluxoPct = liquidoAportado > 0 ? resultadoFluxo / liquidoAportado * 100 : 0
  const today = new Date().toISOString().slice(0, 10)
  const cfList = [
    ...inFlows.map(f => ({ date: fdate(f), amount: -f.amount })),      // aporte = saiu do bolso
    ...outFlows.map(f => ({ date: fdate(f), amount: f.amount })),      // retirada = voltou
    { date: today, amount: patrBrlF },                                // valor atual = como se liquidasse hoje
  ]
  const xirrAnnual = flows.length && patrBrlF > 0 ? xirr(cfList) : null
  const xirrPct = xirrAnnual != null ? xirrAnnual * 100 : null
  const xirrMensalPct = xirrAnnual != null ? (Math.pow(1 + xirrAnnual, 1 / 12) - 1) * 100 : null
  // período médio real dos aportes (ponderado pelo valor) — o "período correto"
  const wAporteDays = inFlows.reduce((s, f) => s + f.amount * daysSince(fdate(f)), 0)
  const avgAporteYears = totIn ? (wAporteDays / totIn) / 365.25 : 0
  // tempo DECORRIDO desde o 1º movimento (o "quanto tempo percorreu" da planilha)
  const firstFlowDate = flows.length ? flows.map(fdate).sort()[0] : null
  const spanDays = firstFlowDate ? daysSince(firstFlowDate) : 0
  const spanMonths = spanDays / 30.44, spanYears = spanDays / 365.25
  // P/L por período — método LINEAR da sua planilha (resultado ÷ tempo decorrido)
  const linAnualPct = spanYears > 0 ? resultadoFluxoPct / spanYears : null, linAnualBrl = spanYears > 0 ? resultadoFluxo / spanYears : null
  const linMensalPct = spanMonths > 0 ? resultadoFluxoPct / spanMonths : null, linMensalBrl = spanMonths > 0 ? resultadoFluxo / spanMonths : null
  const linDiarioPct = spanDays > 0 ? resultadoFluxoPct / spanDays : null, linDiarioBrl = spanDays > 0 ? resultadoFluxo / spanDays : null
  // conversor de moeda p/ a visão (valores estão em BRL; em USD divide pela cotação)
  const money = (brlVal: number) => curr === 'USD' ? usd(brlVal / (rate || 1)) : brl(brlVal)
  const moneySigned = (brlVal: number) => (brlVal >= 0 ? '+' : '-') + money(Math.abs(brlVal)).replace(/^[-+]?/, '')
  // Resultado REAL por janela, a partir do histórico de patrimônio (P&L = patr − custo, neutro a aportes)
  const nowPnlUsd = t.patr - t.totalInv
  const pnlDelta = (days: number) => {
    if (!snaps.length) return null
    const target = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    const prior = [...snaps].reverse().find(s => s.snap_date <= target)
    if (!prior) return null
    const priorPnl = (prior.patrimonio_usd || 0) - (prior.custo_usd || 0)
    const dUsd = nowPnlUsd - priorPnl
    return { pct: dUsd / Math.max(prior.custo_usd || 0, 1) * 100, brl: dUsd * rate }
  }
  const d1 = pnlDelta(1), d7 = pnlDelta(7), d30 = pnlDelta(30)
  const histDays = snaps.length ? Math.max(1, Math.round((Date.now() - new Date(snaps[0].snap_date + 'T00:00:00').getTime()) / 86400000)) : 0
  const allAlerts = [...poolAlerts, ...alerts]
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
  const openLevel = (symbol: string, l?: Level) => setLevelForm(l ? { ...l } : { symbol, kind: 'support', price: '', note: '' })
  async function saveLevel() { const f = levelForm; if (!f) return; const payload = { user_id: userId, symbol: f.symbol, kind: f.kind, price: num(f.price), note: f.note || '' }; if (f.id) await supabase.from('levels').update(payload).eq('id', f.id); else await supabase.from('levels').insert(payload); setLevelForm(null); await refetch() }
  async function delLevel(id: string) { await supabase.from('levels').delete().eq('id', id); setLevelForm(null); await refetch() }
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
          <div className="top-actions">
            <button className="bell" onClick={() => setAlertsOpen(true)} aria-label="Alertas"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" /></svg>{allAlerts.length > 0 && <span className="bell-badge">{allAlerts.length}</span>}</button>
            {isAdmin && <button className="logout" style={{ borderColor: 'rgba(255,176,32,.5)', color: '#FFB020' }} onClick={() => router.push('/admin')}>Admin</button>}
            <div className="top-date">{userEmail.split('@')[0]}<b>ao vivo</b></div><button className="logout" onClick={signOut}>Sair</button>
          </div>
        </div>

        <div className="scroll">
          {showRenew && (
            <div className={`renew-banner ${daysToEnd === 0 ? 'today' : ''}`}>
              <div className="rb-ic">⏳</div>
              <div className="rb-txt">
                <b>{daysToEnd === 0 ? `Seu ${planLabel} vence hoje!` : `Seu ${planLabel} vence em ${daysToEnd} ${daysToEnd === 1 ? 'dia' : 'dias'}`}</b>
                <span>Renove agora para não perder o acesso aos seus recursos.</span>
              </div>
              <button className="rb-btn" onClick={() => router.push('/assinar')}>Renovar</button>
            </div>
          )}
          {/* INÍCIO */}
          <section className={`screen ${tab === 'inicio' ? 'active' : ''}`}>
            <div className="hero">
              <div className="hero-label">Patrimônio total</div>
              <div className="hero-value num">{hi}<span className="cents">{cent}</span></div>
              <span className={`pill ${t.pl >= 0 ? 'up' : 'down'}`}>{t.pl >= 0 ? '▲' : '▼'} {pct(plpct)} · {(t.pl >= 0 ? '+' : '-') + usd(Math.abs(t.pl)).slice(1)}</span>
              <div className="hero-row">
                <div className="hero-mini"><div className="k">Investido</div><div className="v num">{usd(t.riskInv)}</div></div>
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
            <div className="card section-gap">{holdings.filter(h => h.kind === 'cash').map(h => (<div className="kv" key={h.id} onClick={() => { setEditDraft({ ...h }); setCashInput(String(h.current_value ?? 0).replace('.', ',')) }} style={{ cursor: 'pointer' }}><span className="k">{h.name}</span><span className="v num">{usd(h.current_value ?? 0)}</span></div>))}</div>
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
            {priced.filter(h => h.kind === 'stock').length > 0 && <>
              <div className="qsection">Ações / ETFs</div>
              {priced.filter(h => h.kind === 'stock').map(h => { const S = stockLive[h.symbol]; return (
                <div className="qrow" key={h.id}>
                  <div className="qsym" style={{ background: `linear-gradient(145deg,${h.color},${h.color}88)` }}>{h.symbol.slice(0, 4)}</div>
                  <div className="qname"><b>{h.name}</b><span>{h.symbol}</span></div>
                  <div className="qprice"><div className="p">{usd(h.price)}</div><div className="qchg" style={{ color: S?.ch24 == null ? 'var(--muted)' : S.ch24 >= 0 ? 'var(--green)' : 'var(--red)' }}>{S?.ch24 == null ? 'sem chave' : pct(S.ch24) + ' dia'}</div></div>
                </div>
              ) })}
            </>}
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
                {pd && has(3) && (<div className="pooltraction">
                  <div className="pt-cell"><span>TVL</span><b>{abbr(pd.tvl)}</b></div>
                  <div className="pt-cell"><span>Vol 24h</span><b>{abbr(pd.vol24)}</b></div>
                  <div className="pt-cell"><span>Tração</span><b className={trac != null && trac > 0.3 ? 'up' : trac != null && trac > 0.1 ? '' : 'down'}>{trac == null ? '—' : trac > 0.3 ? 'Alta' : trac > 0.1 ? 'Média' : 'Baixa'}</b></div>
                </div>)}
                {pd && !has(3) && (<div className="pooltraction" style={{ justifyContent: 'center', cursor: 'pointer' }} onClick={() => setUpgrade({ tier: 3, feature: 'Tração ao vivo' })}><div className="pt-cell" style={{ flex: 'none' }}><span>🔒 Tração ao vivo (TVL, volume)</span><b className="lock-badge">TIGER ALPHA →</b></div></div>)}
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

            {/* ---- ONDE ABRIR POOL · melhores pares por Vol/TVL e risco de IL ---- */}
            <div className="section-gap" />
            <div className="eyebrow">💧 Onde abrir pool · melhores pares agora</div>
            {!has(2) ? (
              <div className="lock-card">
                <div className="lk-ic">💧</div>
                <h4>Descubra os melhores pares</h4>
                <p>Ranking ao vivo dos pares com melhor tração (Vol/TVL) e menor risco de perda impermanente, por rede.</p>
                <button className="btn" style={{ maxWidth: 240, margin: '0 auto' }} onClick={() => setUpgrade({ tier: 2, feature: 'Onde abrir pool' })}>Liberar no TIGER PRO →</button>
              </div>
            ) : (() => {
              const shown = (ideas || []).filter((it: any) => (!passiveOnly || !it.concentrated) && (!watchOnly || watch.includes(keyOf(it))))
              return (<>
              <div className="niche-h">Ranking pela <b>Nota de Yield</b> — retorno ajustado ao risco. Toque num card para os detalhes.</div>
              <div className="netbar">
                {([['all', '🏆 Todas'], ['eth', 'Ethereum'], ['base', 'Base'], ['arbitrum', 'Arbitrum'], ['solana', 'Solana'], ['bsc', 'BSC'], ['polygon', 'Polygon']] as [string, string][]).map(([k, l]) => (
                  <button key={k} className={ideasNet === k ? 'netchip on' : 'netchip'} onClick={() => loadIdeas(k)}>{l}</button>
                ))}
              </div>
              <div className="pw-toggle" style={{ marginTop: 2 }}>
                <button className={!passiveOnly && !watchOnly ? 'on' : ''} onClick={() => { setPassiveOnly(false); setWatchOnly(false) }}>Todas</button>
                <button className={passiveOnly ? 'on' : ''} onClick={() => { setPassiveOnly(true); setWatchOnly(false) }}>🛡 Passivas</button>
                <button className={watchOnly ? 'on' : ''} onClick={() => { setWatchOnly(true); setPassiveOnly(false) }}>⭐ Vigiando{watch.length ? ` ${watch.length}` : ''}</button>
              </div>
              {ideasLoading && <p className="foot-note">Buscando pares…</p>}
              {!ideasLoading && ideas && shown.map((it: any, i: number) => {
                const net = it.netApr
                const netStr = net == null ? (it.feeApr != null ? it.feeApr + '%' : '—') : (net >= 0 ? '+' : '') + net + '%'
                const netColor = net == null ? 'var(--text)' : net >= 12 ? 'var(--green)' : net > 0 ? '#F5A623' : 'var(--red)'
                const ilColor = it.ilLevel <= 1 ? 'var(--green)' : it.ilLevel === 2 ? '#7CE0A0' : it.ilLevel === 3 ? '#F5A623' : 'var(--red)'
                const gc = it.yieldGrade === 'A' ? 'var(--green)' : it.yieldGrade === 'B' ? '#7CE0A0' : it.yieldGrade === 'C' ? '#F5A623' : 'var(--red)'
                const stColor = it.verdictTone === 'buy' ? 'var(--green)' : it.verdictTone === 'sell' ? 'var(--red)' : '#F5A623'
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1)
                const starred = watch.includes(keyOf(it))
                const dataLink = it.dataUrl || it.gtUrl
                const open = expandedIdea === keyOf(it)
                const stop = (e: any) => e.stopPropagation()
                return (
                  <div className={`poolcard ${it.highlight ? 'hot' : ''}`} key={i} style={{ cursor: 'pointer' }} onClick={() => setExpandedIdea(open ? null : keyOf(it))}>
                    {/* linha 1 — par + APR líquido (herói) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ fontSize: i < 3 ? 17 : 12, fontWeight: 700, minWidth: 24, textAlign: 'center', color: 'var(--muted)', flex: 'none' }}>{medal}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', fontFamily: "'JetBrains Mono'" }}>{it.dex} · {it.network}</div>
                      </div>
                      <div style={{ textAlign: 'right', flex: 'none' }}>
                        <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 19, color: netColor, lineHeight: 1 }}>{netStr}</div>
                        <div style={{ fontSize: 9.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .4 }}>APR líq.</div>
                      </div>
                      <button onClick={(e) => { stop(e); toggleStar(it) }} title="Vigiar" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 2px', color: starred ? '#F5C850' : 'var(--faint)', flex: 'none' }}>{starred ? '★' : '☆'}</button>
                    </div>
                    {/* linha 2 — chips essenciais */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      {it.yieldGrade && <span style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 10, color: '#04120b', background: gc, padding: '2px 8px', borderRadius: 999 }}>{it.yieldGrade} {it.yieldScore}</span>}
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono'", color: stColor }}><span style={{ width: 7, height: 7, borderRadius: 999, background: stColor, boxShadow: `0 0 7px ${stColor}` }} />{it.verdictLabel}</span>
                      <span style={{ fontSize: 10.5, color: ilColor, fontFamily: "'JetBrains Mono'" }}>IL {it.il}</span>
                      <span style={{ fontSize: 12 }}>{it.concentrated ? '⚙' : '🛡'}</span>
                      {it.sustainable === false && <span style={{ fontSize: 10, color: '#F5A623', fontWeight: 700 }}>⚠ Pico</span>}
                    </div>
                    {/* linha 3 — tvl + affordance */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 11, color: 'var(--muted)', fontFamily: "'JetBrains Mono'" }}>
                      <span>TVL {abbr(it.tvl)} · 24h {abbr(it.vol24)}</span>
                      <span style={{ color: 'var(--faint)' }}>{open ? 'fechar ▴' : 'detalhes ▾'}</span>
                    </div>

                    {/* EXPANDIDO — só no toque */}
                    {open && (
                      <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 14 }} onClick={stop}>
                        <div className={`verdict verdict-${it.verdictTone}`}>
                          <div className={`vic vic-${it.verdictTone}`}>{it.verdictTone === 'buy' ? '✓' : it.verdictTone === 'sell' ? '!' : '~'}</div>
                          <div><b>{it.verdictLabel}</b><p>{it.verdict}</p></div>
                        </div>
                        <div className="pooltraction" style={{ marginTop: 12 }}>
                          <div className="pt-cell"><span>Taxa base</span><b>{it.feeApr}%</b></div>
                          <div className="pt-cell"><span>Emissões</span><b style={{ color: it.rewardApr > 0 ? '#F5A623' : 'var(--muted)' }}>{it.rewardApr > 0 ? '+' + it.rewardApr + '%' : '—'}</b></div>
                          <div className="pt-cell"><span>Sustentável</span><b style={{ color: it.sustainable === false ? '#F5A623' : it.sustainable === true ? 'var(--green)' : 'var(--muted)' }}>{it.sustainable === false ? 'Pico' : it.sustainable === true ? 'Sim' : '—'}</b></div>
                        </div>
                        <div className="niche-h" style={{ margin: '10px 2px 0' }}>Nota: Retorno <b>{it.yieldBreak?.retorno}/45</b> · Sustent. <b>{it.yieldBreak?.sustent}/20</b> · IL <b>{it.yieldBreak?.il}/20</b> · Liquidez <b>{it.yieldBreak?.liquidez}/15</b>{it.outlook ? <> · 🔮 <b>{it.outlook}{it.outlookProb ? ` ${it.outlookProb}%` : ''}</b></> : null}{it.apyMean30d != null ? <> · média 30d <b>{it.apyMean30d}%</b></> : null}{it.maxEntry ? <> · aporte ≤ <b>{abbr(it.maxEntry)}</b></> : null}</div>
                        <div className="grid2" style={{ marginTop: 12 }}>
                          <a className="btn ghost" style={{ textDecoration: 'none', textAlign: 'center', lineHeight: '1.4' }} href={it.dexUrl || dataLink} target="_blank" rel="noreferrer" onClick={stop}>Abrir na {it.dex} ↗</a>
                          <button className="btn ghost" onClick={(e) => { stop(e); has(3) ? openCalc(it) : setUpgrade({ tier: 3, feature: 'Calculadora de IL' }) }}>🧮 Simular {!has(3) && '🔒'}</button>
                        </div>
                        {dataLink && <a className="btn ghost" style={{ textDecoration: 'none', textAlign: 'center', lineHeight: '1.6', marginTop: 8, fontSize: 12, opacity: .82 }} href={dataLink} target="_blank" rel="noreferrer" onClick={stop}>Ver dados e histórico ↗</a>}
                      </div>
                    )}
                  </div>
                )
              })}
              {!ideasLoading && ideas && shown.length === 0 && <p className="foot-note">{watchOnly ? 'Você ainda não está vigiando pools nessa visão — toque na ⭐ de um card.' : passiveOnly ? 'Nenhuma pool passiva de qualidade nessa rede agora.' : 'Sem pares de qualidade nessa rede agora — tente outra rede.'}</p>}
              {!ideasLoading && ideas && shown.length > 0 && (
                <button className="addbtn" style={{ marginTop: 12 }} onClick={() => has(3) ? openCalc() : setUpgrade({ tier: 3, feature: 'Calculadora de IL' })}>🧮 Simular IL e retorno {!has(3) && '🔒'}</button>
              )}
              <p className="foot-note"><b>Nota de Yield (0–100)</b> = retorno líquido + sustentabilidade + IL + liquidez. <b>APR líquido</b> = taxa − IL. Fonte: DefiLlama. Não é recomendação — estude cada pool antes de fornecer liquidez.</p>
            </>)
            })()}
          </section>

          {/* APORTES */}
          <section className={`screen ${tab === 'aportes' ? 'active' : ''}`}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div className="eyebrow" style={{ margin: 0 }}>Fluxo de caixa · visão geral</div>
              <div className="pw-toggle" style={{ width: 'auto', margin: 0 }}>
                <button className={curr === 'BRL' ? 'on' : ''} style={{ padding: '6px 14px', flex: 'none' }} onClick={() => setCurr('BRL')}>R$</button>
                <button className={curr === 'USD' ? 'on' : ''} style={{ padding: '6px 14px', flex: 'none' }} onClick={() => setCurr('USD')}>US$</button>
              </div>
            </div>
            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 4 }}>Capital & patrimônio ({curr === 'USD' ? 'US$' : 'R$'})</div>
              <div className="big-kv"><span className="k">Aportado <span style={{ color: 'var(--faint)', fontSize: 10 }}>· {inFlows.length}x</span></span><span className="v num up">{money(totIn)}</span></div>
              <div className="big-kv"><span className="k">Retirado <span style={{ color: 'var(--faint)', fontSize: 10 }}>· {outFlows.length}x</span></span><span className="v num down">{money(totOut)}</span></div>
              <div className="big-kv"><span className="k">Líquido aportado <span style={{ color: 'var(--faint)', fontSize: 10 }}>(aportes − retiradas)</span></span><span className="v num">{money(liquidoAportado)}</span></div>
              <div className="big-kv"><span className="k">Patrimônio atual</span><span className="v num">{money(patrBrlF)}</span></div>
              <div className="big-kv"><span className="k">Resultado (período)</span><span className={`v num ${resultadoFluxo >= 0 ? 'up' : 'down'}`}>{moneySigned(resultadoFluxo)} · {pct(resultadoFluxoPct)}</span></div>
            </div>
            <div className="card section-gap"><div className="eyebrow" style={{ marginBottom: 6 }}>Onde está o capital</div>
              {distrib.map((x, i) => (<div className="kv" key={i}><span className="k"><span className="dist-dot" style={{ background: x.c }} />{x.n}</span><span className="v num">{money(x.v * rate)} · {fmt(x.v / distTot * 100, 0)}%</span></div>))}
            </div>
            <div className="card section-gap"><div className="eyebrow" style={{ marginBottom: 8 }}>{flows.length ? 'Tempo decorrido (desde o 1º aporte)' : 'Tempo médio das posições'}</div>
              {flows.length
                ? <div className="trio"><div className="stat"><div className="k">Dias</div><div className="v num">{fmt(spanDays, 0)}</div></div><div className="stat"><div className="k">Meses</div><div className="v num">{fmt(spanMonths, 1)}</div></div><div className="stat"><div className="k">Anos</div><div className="v num">{fmt(spanYears, 1)}</div></div></div>
                : <div className="trio"><div className="stat"><div className="k">Dias</div><div className="v num">{fmt(avgDays, 0)}</div></div><div className="stat"><div className="k">Meses</div><div className="v num">{fmt(avgMonths, 1)}</div></div><div className="stat"><div className="k">Anos</div><div className="v num">{fmt(avgYears, 1)}</div></div></div>}
            </div>
            <div className="card section-gap"><div className="eyebrow" style={{ marginBottom: 6 }}>Resultado por período</div>
              <table className="pltable"><thead><tr><th></th><th>%</th><th>{curr === 'USD' ? 'US$' : 'R$'}</th></tr></thead><tbody>
                <tr><td>Período</td><td className={resultadoFluxoPct >= 0 ? 'up' : 'down'}>{pct(resultadoFluxoPct)}</td><td className={resultadoFluxo >= 0 ? 'up' : 'down'}>{money(resultadoFluxo)}</td></tr>
                <tr><td>Anual</td><td className={linAnualPct == null ? '' : linAnualPct >= 0 ? 'up' : 'down'}>{linAnualPct == null ? '—' : pct(linAnualPct)}</td><td className={linAnualBrl == null ? '' : linAnualBrl >= 0 ? 'up' : 'down'}>{linAnualBrl == null ? '—' : money(linAnualBrl)}</td></tr>
                <tr><td>Mensal</td><td className={linMensalPct == null ? '' : linMensalPct >= 0 ? 'up' : 'down'}>{linMensalPct == null ? '—' : pct(linMensalPct)}</td><td className={linMensalBrl == null ? '' : linMensalBrl >= 0 ? 'up' : 'down'}>{linMensalBrl == null ? '—' : money(linMensalBrl)}</td></tr>
                <tr><td>Diário</td><td className={linDiarioPct == null ? '' : linDiarioPct >= 0 ? 'up' : 'down'}>{linDiarioPct == null ? '—' : pct(linDiarioPct)}</td><td className={linDiarioBrl == null ? '' : linDiarioBrl >= 0 ? 'up' : 'down'}>{linDiarioBrl == null ? '—' : money(linDiarioBrl)}</td></tr>
                <tr><td style={{ color: 'var(--pink-bright)' }}>Retorno real (XIRR)</td><td className={xirrPct == null ? '' : xirrPct >= 0 ? 'up' : 'down'}>{xirrPct == null ? '—' : pct(xirrPct) + '/ano'}</td><td style={{ color: 'var(--muted)' }}>—</td></tr>
              </tbody></table>
              <p className="foot-note" style={{ textAlign: 'left', marginTop: 10, padding: 0 }}>{flows.length
                ? <><b>Período</b> = patrimônio − líquido aportado (sua metodologia). <b>Anual/Mensal/Diário</b> dividem esse resultado pelo tempo decorrido — igual à sua planilha. <b>Retorno real (XIRR)</b> é o retorno anualizado composto e ponderado pelas datas de cada aporte: mais preciso que a divisão linear, porque considera que aportes recentes renderam por menos tempo. Use o XIRR pra comparar performance; a divisão linear pra leitura rápida.</>
                : 'Cadastre seus aportes e retiradas (com data) para calcular o resultado real por período.'}</p>
            </div>
            <div className="card section-gap">
              <div className="eyebrow" style={{ marginBottom: 4 }}>Registrar movimento</div>
              <div className="big-kv"><span className="k">% de retiradas s/ aportes</span><span className="v num">{fmt(pctRetirada, 1)}%</span></div>
              <div className="grid2" style={{ marginTop: 10 }}>
                <button className="addbtn" style={{ marginTop: 0 }} onClick={() => openFlow(null)}>+ registrar</button>
                <button className="addbtn" style={{ marginTop: 0 }} onClick={() => setImporter({ text: '', mode: 'auto', replace: false })}>⬆ Importar em lote</button>
              </div>
            </div>
            {flows.length > 0 && <div className="card section-gap"><div className="eyebrow" style={{ marginBottom: 4 }}>Extrato · toque p/ editar a data e o valor</div>
              {flows.slice().sort((a, b) => fdate(b).localeCompare(fdate(a))).map(f => { const d = daysSince(fdate(f)); return (
                <div className="flow-item" key={f.id} onClick={() => openFlow(f)} style={{ cursor: 'pointer' }}>
                  <div className={`flow-ic ${f.kind === 'in' ? 'flow-in' : 'flow-out'}`}>{f.kind === 'in' ? '↓' : '↑'}</div>
                  <div className="flow-t"><b>{f.kind === 'in' ? 'Aporte' : 'Retirada'}</b><span>{new Date(fdate(f)).toLocaleDateString('pt-BR')} · há {d}d · {fmt(d / 365.25, 1)}a</span></div>
                  <div className={`flow-v ${f.kind === 'in' ? 'up' : 'down'}`}>{money(f.amount)}</div>
                </div>) })}
            </div>}
          </section>

          {/* METAS */}
          <section className={`screen ${tab === 'metas' ? 'active' : ''}`}>
            <div className="eyebrow">Meta de aporte vs. real</div>
            <div className="card">{priced.filter(h => h.meta_pct > 0).sort((a, b) => (b.kind === 'cash' ? 1 : 0) - (a.kind === 'cash' ? 1 : 0) || b.meta_pct - a.meta_pct).map((h, i) => {
              const real = t.patr ? valOf(h) / t.patr * 100 : 0, denom = Math.max(h.meta_pct, real, 1), gap = real - h.meta_pct
              const cashSurplus = h.kind === 'cash' && gap > 0.5
              const gapColor = cashSurplus ? 'var(--green)' : (Math.abs(gap) < 0.5 ? 'var(--muted)' : (gap < 0 ? 'var(--pink)' : 'var(--red)'))
              const gapLabel = cashSurplus ? 'disponível pra alocar ' : (gap < 0 ? 'faltam ' : 'sobra ')
              return (<div key={h.id} style={{ padding: '10px 0', borderTop: i > 0 ? '1px solid var(--line)' : undefined }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ fontWeight: 600, fontSize: 13.5 }}>{h.symbol}</span><span className="num" style={{ fontSize: 12, color: gapColor }}>{gapLabel}{fmt(Math.abs(gap), 1)}%</span></div><div className="metabar" style={{ marginTop: 8 }}><div className="track"><div className="fill" style={{ width: `${Math.min(real / denom * 100, 100)}%`, ...(cashSurplus ? { background: 'linear-gradient(90deg,#12b981,var(--green))', boxShadow: '0 0 12px rgba(43,255,154,.5)' } : {}) }} /><div className="goal" style={{ left: `${Math.min(h.meta_pct / denom * 100, 100)}%` }} /></div><div className="lbls"><span>real {fmt(real, 1)}%</span><span>meta {h.meta_pct}%</span></div></div></div>)
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
            {!radarLoading && radar && radarSeg === 'pools' && (
              <div className="netbar">
                {([['all', 'Todas'], ['eth', 'Ethereum'], ['solana', 'Solana'], ['base', 'Base'], ['bsc', 'BSC'], ['arbitrum', 'Arbitrum'], ['polygon', 'Polygon']] as [string, string][]).map(([k, l]) => (
                  <button key={k} className={poolNet === k ? 'netchip on' : 'netchip'} onClick={() => loadPoolsNet(k)}>{l}</button>
                ))}
              </div>
            )}
            {poolsLoading && radarSeg === 'pools' && <p className="foot-note">Buscando pools…</p>}
            {!radarLoading && !poolsLoading && radar && radarSeg === 'pools' && (radar.pools || []).map((p: any, i: number) => (
              <div className="qrow" key={i}>
                <div className="qsym" style={{ background: 'linear-gradient(145deg,#2BFFC6,#7C5CFF)' }}>{(p.network || '').slice(0, 3).toUpperCase()}</div>
                <div className="qname"><b>{p.name}</b><span>{p.network} · TVL {abbr(p.tvl)}</span></div>
                <div className="qprice"><div className="p">{abbr(p.vol24)}</div><div className="qchg" style={{ color: p.ch24 >= 0 ? 'var(--green)' : 'var(--red)' }}>{pct(p.ch24 || 0)} 24h</div></div>
              </div>
            ))}
            {!radarLoading && !poolsLoading && radar && radarSeg === 'pools' && (radar.pools || []).length === 0 && <p className="foot-note">Nenhuma pool com liquidez relevante nessa rede agora — tente outra rede.</p>}
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
          ] as [Tab, string, React.ReactNode][]).map(([k, label, icon]) => {
            const min = TAB_MIN[k] || 1
            const locked = !has(min)
            return (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => locked ? setUpgrade({ tier: min, feature: label }) : setTab(k)} style={locked ? { opacity: .55 } : undefined}>
                <svg viewBox="0 0 24 24">{icon}</svg>{label}{locked && <span className="nav-lock">🔒</span>}
              </button>
            )
          })}
        </nav>

        {/* UPGRADE (feature bloqueada por plano) */}
        {upgrade && (
          <div className="modal" onClick={e => { if (e.target === e.currentTarget) setUpgrade(null) }}>
            <div className="sheet"><div className="grabber" />
              <div className="lock-card" style={{ border: 'none', background: 'none', padding: '6px 0 0' }}>
                <div className="lk-ic">🔒</div>
                <h4>{upgrade.feature} faz parte do {PLAN_NAME[upgrade.tier]}</h4>
                <p>Faça upgrade do seu plano para desbloquear {upgrade.feature.toLowerCase()} e todos os recursos do {PLAN_NAME[upgrade.tier]}.</p>
              </div>
              <div className="grid2" style={{ marginTop: 4 }}>
                <button className="btn ghost" onClick={() => setUpgrade(null)}>Agora não</button>
                <button className="btn" onClick={() => router.push('/assinar')}>Fazer upgrade</button>
              </div>
            </div>
          </div>
        )}

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
                  <h3><span className="sym" style={{ width: 32, height: 32, background: `linear-gradient(145deg,${h.color},${h.color}88)` }}>{h.symbol.slice(0, 4)}</span>{h.name}<button className="mini-add" style={{ marginLeft: 'auto' }} onClick={() => openAssetEdit(h)}>✎ editar</button><span style={{ marginLeft: 8 }} className={`pill ${pl >= 0 ? 'up' : 'down'}`}>{pct(plp)}</span></h3>

                  {has(2) ? (<>
                  {sg ? <SigBody sg={sg} /> : h.kind === 'crypto' ? <p className="foot-note" style={{ marginTop: 14 }}>{sigTried ? 'Análise técnica indisponível para este ativo agora — tente reabrir em instantes.' : 'Analisando estrutura do gráfico…'}</p> : null}
                  {h.kind === 'crypto' && (() => {
                    const myLevels = levels.filter(l => l.symbol === h.symbol).sort((a, b) => b.price - a.price)
                    return (<div className="card" style={{ marginTop: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: myLevels.length ? 8 : 0 }}>
                        <div className="eyebrow" style={{ margin: 0 }}>Meus níveis</div>
                        <button className="mini-add" onClick={() => openLevel(h.symbol)}>+ adicionar</button>
                      </div>
                      {myLevels.map(l => (
                        <div className="lvlrow" key={l.id} onClick={() => openLevel(h.symbol, l)}>
                          <span className={`lvltag ${l.kind === 'support' ? 'sup' : 'res'}`}>{l.kind === 'support' ? 'Suporte' : 'Resist.'}</span>
                          <b className="num">{usd(l.price)}</b>
                          <span className="lvlnote">{l.note}</span>
                          <span className="lvldist num" style={{ color: l.price >= h.price ? 'var(--red)' : 'var(--green)' }}>{h.price ? ((l.price >= h.price ? '+' : '') + fmt((l.price / h.price - 1) * 100, 1) + '%') : ''}</span>
                        </div>
                      ))}
                      {myLevels.length === 0 && <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 6 }}>Fixe seus próprios suportes e resistências — eles complementam a análise do algoritmo com a sua leitura.</p>}
                    </div>)
                  })()}
                  </>) : (
                    <div className="lock-card" style={{ marginTop: 14 }}>
                      <div className="lk-ic">🔒</div>
                      <h4>Análise técnica é TIGER PRO</h4>
                      <p>Suporte, resistência, gatilhos, BMSB, RSI, veredito e níveis personalizados. Sua posição e histórico continuam disponíveis abaixo.</p>
                      <button className="btn" onClick={() => { setDetail(null); router.push('/assinar') }}>Fazer upgrade para PRO</button>
                    </div>
                  )}

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

        {/* IMPORTAR APORTES/RETIRADAS EM LOTE */}
        {importer && (() => {
          const { rows, bad } = parseImport(importer.text, importer.mode)
          const nIn = rows.filter(r => r.kind === 'in'), nOut = rows.filter(r => r.kind === 'out')
          const sumIn = nIn.reduce((s, r) => s + r.amount, 0), sumOut = nOut.reduce((s, r) => s + r.amount, 0)
          return (
            <div className="modal" onClick={e => { if (e.target === e.currentTarget && !importer.busy) setImporter(null) }}>
              <div className="sheet sheet-scroll"><div className="grabber" />
                <h3>⬆ Importar aportes / retiradas</h3>
                <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 6 }}>Cole direto do Excel — uma linha por movimento. No modo <b>Auto</b>, selecione as colunas <b>DATA, RETIRADA, APORTES</b> (nessa ordem) e cole. Data em dd/mm/aaaa.</p>
                <div className="pw-toggle" style={{ marginTop: 12 }}>
                  <button className={importer.mode === 'auto' ? 'on' : ''} onClick={() => setImporter({ ...importer, mode: 'auto' })}>Auto (2 colunas)</button>
                  <button className={importer.mode === 'in' ? 'on' : ''} onClick={() => setImporter({ ...importer, mode: 'in' })}>Só aportes</button>
                  <button className={importer.mode === 'out' ? 'on' : ''} onClick={() => setImporter({ ...importer, mode: 'out' })}>Só retiradas</button>
                </div>
                <div className="field" style={{ marginTop: 12 }}>
                  <label>Cole aqui</label>
                  <textarea value={importer.text} onChange={e => setImporter({ ...importer, text: e.target.value })} placeholder={"15/01/2021\t-\t21.500,00\n06/08/2021\t2.000,00\t-"} style={{ width: '100%', minHeight: 130, fontFamily: "'JetBrains Mono'", fontSize: 13, background: 'rgba(14,8,24,.65)', border: '1px solid var(--line-strong)', color: 'var(--text)', borderRadius: 11, padding: 12, resize: 'vertical' }} />
                </div>
                <div className="modal-preview" style={{ display: 'block' }}>
                  <div>Detectados: <b style={{ color: 'var(--green)' }}>{nIn.length} aportes</b> ({brl(sumIn)}) · <b style={{ color: 'var(--red)' }}>{nOut.length} retiradas</b> ({brl(sumOut)})</div>
                  {bad > 0 && <div style={{ color: '#F5A623', marginTop: 4 }}>{bad} linha(s) sem data/valor reconhecível — serão ignoradas.</div>}
                  {rows.length > 0 && <div style={{ color: 'var(--muted)', marginTop: 6, fontSize: 12 }}>1º: {rows[0].kind === 'in' ? 'Aporte' : 'Retirada'} {brl(rows[0].amount)} em {new Date(rows[0].date).toLocaleDateString('pt-BR')} · último: {rows[rows.length - 1].kind === 'in' ? 'Aporte' : 'Retirada'} {brl(rows[rows.length - 1].amount)} em {new Date(rows[rows.length - 1].date).toLocaleDateString('pt-BR')}</div>}
                </div>
                <label className="as-accept" style={{ marginTop: 12 }}><input type="checkbox" checked={!!importer.replace} onChange={e => setImporter({ ...importer, replace: e.target.checked })} /><span>Substituir tudo — apaga os {flows.length} movimentos atuais antes de importar (use se estiver recadastrando o histórico).</span></label>
                <div style={{ marginTop: 16, display: 'flex', gap: 9 }}>
                  <button className="btn" disabled={!rows.length || importer.busy} onClick={runImport}>{importer.busy ? 'Importando…' : `Importar ${rows.length}`}</button>
                  <button className="btn ghost" disabled={importer.busy} onClick={() => setImporter(null)}>Cancelar</button>
                </div>
              </div>
            </div>
          )
        })()}

        {/* CALCULADORA DE IL / RETORNO (plano completo) */}
        {calc && (() => {
          const cap = num(calc.capital), chg = num(calc.chg), days = num(calc.days), apr = num(calc.apr), w = num(calc.width)
          const k = 1 + chg / 100
          const outOfRange = calc.v3 && w > 0 && Math.abs(chg) >= w
          let E = 1
          if (calc.v3 && w > 0) { const pa = 1 - w / 100, pb = 1 + w / 100; const e = pa > 0 ? 1 / (1 - Math.pow(pa / pb, 0.25)) : 1; E = isFinite(e) && e > 1 ? e : 1 }
          const kUsed = outOfRange ? (chg > 0 ? 1 + w / 100 : Math.max(0.0001, 1 - w / 100)) : Math.max(0.0001, k)
          const ilBasePct = (2 * Math.sqrt(kUsed) / (1 + kUsed) - 1) * 100
          // O APR informado JÁ é o da pool (v3 já reflete a concentração). Não multiplicar pela
          // eficiência de novo — isso inflava o retorno. E fica só como informação de "porquê o APR é alto".
          const ilPctEff = ilBasePct
          const fees = cap * (apr / 100) * (days / 365)
          const ilLoss = cap * Math.abs(ilPctEff / 100)
          const net = fees - ilLoss
          return (
            <div className="modal" onClick={e => { if (e.target === e.currentTarget) setCalc(null) }}>
              <div className="sheet sheet-scroll"><div className="grabber" />
                <h3>🧮 Calculadora de IL{calc.pair ? <span className="sighint"> · {calc.pair}</span> : null}</h3>
                <div className="grid2">
                  <div className="field"><label>Capital U$</label><input inputMode="decimal" value={calc.capital} onChange={e => setCalc({ ...calc, capital: e.target.value })} /></div>
                  <div className="field"><label>Período (dias)</label><input inputMode="decimal" value={calc.days} onChange={e => setCalc({ ...calc, days: e.target.value })} /></div>
                </div>
                <div className="grid2">
                  <div className="field"><label>Variação do volátil (%)</label><input inputMode="decimal" value={calc.chg} onChange={e => setCalc({ ...calc, chg: e.target.value })} placeholder="30 = subiu 30%" /></div>
                  <div className="field"><label>APR de taxas da pool (%)</label><input inputMode="decimal" value={calc.apr} onChange={e => setCalc({ ...calc, apr: e.target.value })} placeholder="o APR que a pool mostra" /></div>
                </div>
                <div className="pw-toggle" style={{ marginTop: 12 }}>
                  <button className={!calc.v3 ? 'on' : ''} onClick={() => setCalc({ ...calc, v3: false })}>Full-range (v2)</button>
                  <button className={calc.v3 ? 'on' : ''} onClick={() => setCalc({ ...calc, v3: true })}>Concentrada (v3)</button>
                </div>
                {calc.v3 && <div className="field" style={{ marginTop: 10 }}><label>Largura da faixa ± (%)</label><input inputMode="decimal" value={calc.width} onChange={e => setCalc({ ...calc, width: e.target.value })} placeholder="20 = ±20%" /></div>}

                <div className="card" style={{ marginTop: 16 }}>
                  <div className="big-kv"><span className="k">Perda impermanente (IL)</span><span className="v" style={{ color: 'var(--red)' }}>{ilPctEff.toFixed(2)}% · -{usd(ilLoss).slice(1)}</span></div>
                  <div className="big-kv"><span className="k">Taxas no período</span><span className="v" style={{ color: 'var(--green)' }}>+{usd(fees).slice(1)}</span></div>
                  <div className="big-kv"><span className="k">Líquido vs. segurar</span><span className="v" style={{ color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>{net >= 0 ? '+' : '-'}{usd(Math.abs(net)).slice(1)}</span></div>
                  {calc.v3 && <div className="big-kv"><span className="k">Eficiência de capital (v3)</span><span className="v">{E.toFixed(1)}× <span className="sighint">(só informativo)</span></span></div>}
                </div>

                <div className={`verdict verdict-${net >= 0 ? 'buy' : 'sell'}`} style={{ marginTop: 12 }}>
                  <div className={`vic vic-${net >= 0 ? 'buy' : 'sell'}`}>{net >= 0 ? '✓' : '!'}</div>
                  <div><b>{net >= 0 ? 'TAXA COBRE O IL' : 'IL MAIOR QUE A TAXA'}</b><p>{net >= 0 ? `Neste cenário as taxas (${usd(fees)}) superam o IL — sobra líquida de ${usd(net)} vs. só segurar os ativos.` : `Neste cenário o IL (-${usd(ilLoss).slice(1)}) supera as taxas — você perde ${usd(Math.abs(net))} vs. só segurar.`}</p></div>
                </div>
                {outOfRange && <p className="foot-note" style={{ color: '#F5A623' }}>⚠ Com faixa de ±{calc.width}% e variação de {calc.chg}%, o preço <b>saiu do range</b>: a posição vira 100% do ativo mais fraco e para de gerar taxa. IL travado no limite da faixa.</p>}
                <p className="foot-note">Modelo 50/50 padrão. Use o <b>APR que a pool realmente mostra</b> — em v3 ele já embute a concentração (a eficiência ao lado só explica por que é alto; não multiplica o retorno). O maior risco do v3 é <b>sair da faixa</b>: aí para de render e o IL trava. Não considera gas. Concentrada também tende a um IL um pouco maior que o mostrado. Estimativa educacional — não é recomendação.</p>
                <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => setCalc(null)}>Fechar</button>
              </div>
            </div>
          )
        })()}

        {/* FLUXO: novo/editar movimento */}
        {flowForm && (
          <div className="modal" onClick={e => { if (e.target === e.currentTarget) setFlowForm(null) }}>
            <div className="sheet"><div className="grabber" />
              <h3>{flowForm.id ? 'Editar movimento' : 'Novo movimento'}</h3>
              <div className="field"><label>Tipo</label><select value={flowForm.kind} onChange={e => setFlowForm({ ...flowForm, kind: e.target.value })}><option value="in">Aporte</option><option value="out">Retirada</option></select></div>
              <div className="field"><label>Data do movimento {flowForm.kind === 'out' ? '(data da retirada)' : '(data do aporte)'}</label><input type="date" value={flowForm.move_date} onChange={e => setFlowForm({ ...flowForm, move_date: e.target.value })} /></div>
              <div className="field"><label>Valor R$</label><input inputMode="decimal" value={flowForm.amount} onChange={e => setFlowForm({ ...flowForm, amount: e.target.value })} /></div>
              <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 8 }}>A data entra no cálculo do tempo decorrido e do XIRR. Valores sempre em R$ (o botão US$ é só pra visualização).</p>
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

        {/* ALERTAS */}
        {alertsOpen && (
          <div className="modal" onClick={e => { if (e.target === e.currentTarget) setAlertsOpen(false) }}>
            <div className="sheet"><div className="grabber" />
              <div className="sheet-scroll">
                <h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 22, height: 22 }}><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" /></svg>Alertas</h3>
                {allAlerts.length === 0 && <p className="foot-note" style={{ marginTop: 18 }}>Nenhum alerta agora. Você é avisado quando o preço bate num nível seu, no alvo/stop de uma compra, ou quando uma pool sai do range.</p>}
                {allAlerts.map(a => (
                  <div className={`alert-item alert-${a.tone}`} key={a.id}>
                    <div className="alert-ic">{a.icon}</div>
                    <div className="alert-t"><b>{a.title}</b><span>{a.text}</span></div>
                  </div>
                ))}
                <div style={{ marginTop: 16 }}><button className="btn ghost" onClick={() => setAlertsOpen(false)}>Fechar</button></div>
              </div>
            </div>
          </div>
        )}

        {/* NÍVEIS: novo/editar */}
        {levelForm && (
          <div className="modal" onClick={e => { if (e.target === e.currentTarget) setLevelForm(null) }}>
            <div className="sheet"><div className="grabber" />
              <h3>{levelForm.id ? 'Editar nível' : 'Novo nível'} · {levelForm.symbol}</h3>
              <div className="field"><label>Tipo</label><select value={levelForm.kind} onChange={e => setLevelForm({ ...levelForm, kind: e.target.value })}><option value="support">Suporte</option><option value="resistance">Resistência</option></select></div>
              <div className="grid2"><div className="field"><label>Preço US$</label><input inputMode="decimal" value={levelForm.price} onChange={e => setLevelForm({ ...levelForm, price: e.target.value })} /></div><div className="field"><label>Nota (opcional)</label><input value={levelForm.note} onChange={e => setLevelForm({ ...levelForm, note: e.target.value })} placeholder="ex: LTB semanal" /></div></div>
              <div className="grid2" style={{ marginTop: 16 }}>{levelForm.id && <button className="btn ghost danger" onClick={() => delLevel(levelForm.id)}>Excluir</button>}<button className="btn ghost" onClick={() => setLevelForm(null)}>Cancelar</button><button className="btn" onClick={saveLevel}>Salvar</button></div>
            </div>
          </div>
        )}

        {/* EDIT CAIXA */}
        {editDraft && (
          <div className="modal" onClick={e => { if (e.target === e.currentTarget) setEditDraft(null) }}>
            <div className="sheet"><div className="grabber" />
              <h3>{editDraft.name}</h3>
              <div className="field"><label>Valor atual U$</label><input inputMode="decimal" value={cashInput} onChange={e => setCashInput(e.target.value)} placeholder="0,00" /></div>
              <div className="grid2" style={{ marginTop: 16 }}><button className="btn ghost" onClick={() => setEditDraft(null)}>Cancelar</button><button className="btn" onClick={saveEdit}>Salvar</button></div>
            </div>
          </div>
        )}

        {/* EDIT ATIVO: meta / nome / id coingecko */}
        {assetEdit && (
          <div className="modal" onClick={e => { if (e.target === e.currentTarget) setAssetEdit(null) }}>
            <div className="sheet"><div className="grabber" />
              <h3>Editar {assetEdit.symbol}</h3>
              <div className="grid2">
                <div className="field"><label>Nome</label><input value={assetEdit.name} onChange={e => setAssetEdit({ ...assetEdit, name: e.target.value })} /></div>
                <div className="field"><label>Meta %</label><input inputMode="decimal" value={assetEdit.meta_pct} onChange={e => setAssetEdit({ ...assetEdit, meta_pct: e.target.value })} placeholder="0" /></div>
              </div>
              <div className="field"><label>ID CoinGecko</label><input value={assetEdit.cg_id} onChange={e => setAssetEdit({ ...assetEdit, cg_id: e.target.value })} placeholder="ethereum" /></div>
              <p className="foot-note" style={{ marginTop: 10 }}>Ajuste a meta a qualquer momento, sem registrar compra. O símbolo ({assetEdit.symbol}) não é editável aqui para não desvincular o histórico de compras.</p>
              <div className="grid2" style={{ marginTop: 16 }}><button className="btn ghost" onClick={() => setAssetEdit(null)}>Cancelar</button><button className="btn" onClick={saveAssetEdit}>Salvar</button></div>
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
