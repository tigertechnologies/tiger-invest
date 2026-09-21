'use client'
import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Background from './Background'
import PoolChart from './PoolChart'
import MonitorTiger from './MonitorTiger'
import BtcLab from './BtcLab'
import {
  Holding, Flow, Transaction, Pool, Signal, DEFAULT_POOL, BRL_RATE,
  value as valOf, usd, pct, brl, fmt, daysSince, Level,
} from '@/lib/data'
import {
  PerpPosition, PerpMarket, PerpSide, metaFor, mmrFor, PERP_META, PERP_TAKER_FEE,
  upnl, notionalAt, liqPrice, liqDistancePct, accountSummary,
} from '@/lib/perps'
import { emissionFor, emissionTone, dilutionAdjusted } from '@/lib/inflation'
import { buildHealth, type Flag, type Severity } from '@/lib/health'

type Tab = 'inicio' | 'carteira' | 'cotacao' | 'radar' | 'pulso' | 'pools' | 'perps' | 'aportes' | 'metas' | 'lab' | 'tiger100'
const uniq = (a: string[]) => Array.from(new Set(a.filter(Boolean)))
const agg = (arr: string[]) => { const u = uniq(arr); return u.length === 0 ? '—' : u.length === 1 ? u[0] : 'várias' }
const num = (v: any) => parseFloat(String(v).replace(',', '.')) || 0
// Formata "YYYY-MM-DD" -> "DD/MM/YYYY" sem objeto Date (evita bug de fuso mostrando 1 dia antes)
const dBR = (iso: string) => { const p = String(iso || '').slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso || '') }

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
  userEmail, plan = 'alpha', periodEnd = null, isAdmin = false, initialHoldings, initialFlows, initialTx, initialPools, initialLevels, initialPerps = [], initialPerpAcct = 0,
}: { userEmail: string; plan?: string; periodEnd?: string | null; isAdmin?: boolean; initialHoldings: Holding[]; initialFlows: Flow[]; initialTx: Transaction[]; initialPools: Pool[]; initialLevels: Level[]; initialPerps?: PerpPosition[]; initialPerpAcct?: number }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  // --- Gate por plano ---
  const RANK: Record<string, number> = { start: 1, pro: 2, alpha: 3 }
  const rank = RANK[plan] || 1
  const has = (min: number) => rank >= min
  const TAB_MIN: Record<string, number> = { inicio: 1, carteira: 1, cotacao: 1, metas: 1, pools: 1, radar: 2, pulso: 2, perps: 2, aportes: 3, lab: 2, tiger100: 1 }
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
  const [seenAlerts, setSeenAlerts] = useState<string[]>([])
  const [sellFeePct, setSellFeePct] = useState(0.1)   // custo de vender (fee+spread) — recuperação de capital usa isto
  const [stockLive, setStockLive] = useState<Record<string, { price: number; ch24: number | null }>>({})
  const [tab, setTab] = useState<Tab>('inicio')
  const [live, setLive] = useState<Record<string, any>>({})
  const [brlRate, setBrlRate] = useState({ tether: BRL_RATE, usdc: BRL_RATE })
  const [signals, setSignals] = useState<Record<string, Signal>>({})
  const [sigTried, setSigTried] = useState(false)
  const [radar, setRadar] = useState<any | null>(null)
  const [radarSeg, setRadarSeg] = useState<'top' | 'alts' | 'memes'>('top')
  const [radarLoading, setRadarLoading] = useState(false)
  const [radarDetail, setRadarDetail] = useState<any | null>(null)
  const [radarSig, setRadarSig] = useState<Signal | null>(null)
  const [radarSigLoading, setRadarSigLoading] = useState(false)
  const [userId, setUserId] = useState('')
  const [detail, setDetail] = useState<Holding | null>(null)
  const [editDraft, setEditDraft] = useState<Holding | null>(null)
  const [cashInput, setCashInput] = useState('')
  const [assetEdit, setAssetEdit] = useState<any | null>(null)
  const [metaForm, setMetaForm] = useState<any | null>(null)
  const [txForm, setTxForm] = useState<any | null>(null)
  const [txEdit, setTxEdit] = useState<any | null>(null)
  const [coinQuery, setCoinQuery] = useState('')
  const [coinResults, setCoinResults] = useState<any[] | null>(null)
  const [coinSearching, setCoinSearching] = useState(false)
  const [coinManual, setCoinManual] = useState(false)
  const [metaCoinQuery, setMetaCoinQuery] = useState('')
  const [metaCoinResults, setMetaCoinResults] = useState<any[] | null>(null)
  const [metaCoinSearching, setMetaCoinSearching] = useState(false)
  const [poolCoinQuery, setPoolCoinQuery] = useState('')
  const [poolCoinResults, setPoolCoinResults] = useState<any[] | null>(null)
  const [poolCoinSearching, setPoolCoinSearching] = useState(false)
  const [histPrice, setHistPrice] = useState<number | null>(null)
  const [histLoading, setHistLoading] = useState(false)
  const [moveForm, setMoveForm] = useState<any | null>(null)
  const [poolForm, setPoolForm] = useState<any | null>(null)
  const [flowForm, setFlowForm] = useState<any | null>(null)
  const [curr, setCurr] = useState<'BRL' | 'USD'>('BRL')
  const [top50, setTop50] = useState<any[] | null>(null)
  const [top50Loading, setTop50Loading] = useState(false)
  const [btclab, setBtclab] = useState<any | null>(null)
  const [btclabLoading, setBtclabLoading] = useState(false)
  const [t100, setT100] = useState<any | null>(null)
  const [t100Loading, setT100Loading] = useState(false)
  const [cmp, setCmp] = useState<any | null>(null)
  const [cmpA, setCmpA] = useState('tiger100')
  const [cmpB, setCmpB] = useState('bitcoin')
  const [cmpDays, setCmpDays] = useState(90)
  const [cmpLoading, setCmpLoading] = useState(false)
  const loadCmp = (a: string, b: string, days: number) => {
    setCmpLoading(true)
    fetch(`/api/compare?a=${a}&b=${b}&days=${days}`).then(r => r.json()).then(d => setCmp(d)).catch(() => setCmp({})).finally(() => setCmpLoading(false))
  }
  useEffect(() => {
    // comparativo de correlação foi substituído pelo Monitor Tiger (painel on-chain)
  }, [tab])
  useEffect(() => {
    if (tab === 'tiger100' && t100 === null && !t100Loading) {
      setT100Loading(true)
      fetch('/api/tiger100').then(r => r.json()).then(d => setT100(d)).catch(() => setT100({})).finally(() => setT100Loading(false))
    }
  }, [tab, t100, t100Loading])
  useEffect(() => {
    if (tab === 'lab' && btclab === null && !btclabLoading) {
      setBtclabLoading(true)
      fetch('/api/btclab').then(r => r.json()).then(d => setBtclab(d)).catch(() => setBtclab({})).finally(() => setBtclabLoading(false))
    }
  }, [tab, btclab, btclabLoading])
  useEffect(() => {
    if (tab === 'cotacao' && top50 === null && !top50Loading) {
      setTop50Loading(true)
      fetch('/api/top').then(r => r.json()).then(d => setTop50(d.coins || [])).catch(() => setTop50([])).finally(() => setTop50Loading(false))
    }
  }, [tab, top50, top50Loading])
  const [syncing, setSyncing] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' | 'info' } | null>(null)
  const flash = (msg: string, type: 'ok' | 'err' | 'info' = 'info') => { setToast({ msg, type }); window.setTimeout(() => setToast(null), 3800) }
  const [poolRatio, setPoolRatio] = useState<Record<string, number>>({})
  const [poolData, setPoolData] = useState<Record<string, any>>({})
  // "Onde abrir pool": melhores pares por Vol/TVL e risco de IL (dados ao vivo)
  const [ideas, setIdeas] = useState<any[] | null>(null)
  const [ideasNet, setIdeasNet] = useState('all')
  const [ideasLoading, setIdeasLoading] = useState(false)
  const [watchOnly, setWatchOnly] = useState(false)
  const [watch, setWatch] = useState<string[]>([])
  const [watchData, setWatchData] = useState<Record<string, any>>({})  // cache do card de cada pool vigiada (p/ nunca sumir)
  const [watchRefreshing, setWatchRefreshing] = useState(false)
  const [expandedIdea, setExpandedIdea] = useState<string | null>(null)
  const [calc, setCalc] = useState<any | null>(null)
  // --- Perps (Ondo) ---
  const [perps, setPerps] = useState<PerpPosition[]>(initialPerps)
  const [perpCollateral, setPerpCollateral] = useState<number>(initialPerpAcct)
  const [perpMkts, setPerpMkts] = useState<Record<string, PerpMarket>>({})
  const [perpMktList, setPerpMktList] = useState<PerpMarket[]>([])
  const [perpForm, setPerpForm] = useState<any | null>(null)
  const [perpClose, setPerpClose] = useState<any | null>(null)
  const [perpAcctForm, setPerpAcctForm] = useState<string | null>(null)
  const [perpPick, setPerpPick] = useState('')
  const [pulse, setPulse] = useState<any | null>(null)
  const [pulseLoading, setPulseLoading] = useState(false)
  const [healthOpen, setHealthOpen] = useState(false)

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? '')) }, [supabase])

  const refetch = useCallback(async () => {
    if (!userId) return
    const [h, f, t, p, l, pp, pa] = await Promise.all([
      supabase.from('holdings').select('*').eq('user_id', userId).order('sort', { ascending: true }),
      supabase.from('flows').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('transactions').select('*').eq('user_id', userId).order('buy_date', { ascending: true }),
      supabase.from('pools').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      supabase.from('levels').select('*').eq('user_id', userId).order('price', { ascending: false }),
      supabase.from('perps_positions').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('perps_account').select('*').eq('user_id', userId).maybeSingle(),
    ])
    if (h.data) setHoldings(h.data as Holding[])
    if (f.data) setFlows(f.data as Flow[])
    if (t.data) setTxs(t.data as Transaction[])
    if (p.data) setPools(p.data as Pool[])
    if (l.data) setLevels(l.data as Level[])
    if (pp.data) setPerps(pp.data as PerpPosition[])
    if (pa.data) setPerpCollateral((pa.data as any).collateral ?? 0)
  }, [supabase, userId])

  // seed ÚNICO (gated por flag) — nunca reinjeta
  const seededRef = useRef(false)
  useEffect(() => {
    if (!userId || seededRef.current) return
    seededRef.current = true
    ;(async () => {
      const { data: st } = await supabase.from('app_state').select('seeded').eq('user_id', userId).maybeSingle()
      if (st?.seeded) return
      // Conta nova começa ZERADA — nunca semeamos carteira de exemplo.
      // Único backfill: contas LEGADAS que já têm holdings próprias mas ainda
      // não têm o ledger de transações (migração v2). Isso usa apenas os dados
      // do próprio usuário — nada é copiado de outra conta.
      if (holdings.length > 0 && txs.length === 0) {
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

  // Perps Ondo — mercados/preços ao vivo (só quando a aba está aberta ou há posição aberta)
  useEffect(() => {
    const need = tab === 'perps' || perps.some(p => p.status === 'open')
    if (!need) return
    let active = true
    const load = () => fetch('/api/perps').then(r => r.json()).then((d: any) => {
      if (!active) return
      setPerpMkts(d.map || {})
      setPerpMktList(d.markets || [])
    }).catch(() => {})
    load(); const t = setInterval(load, tab === 'perps' ? 15000 : 45000)
    return () => { active = false; clearInterval(t) }
  }, [tab, perps])

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

  useEffect(() => {
    if (tab !== 'pulso') return
    let active = true
    const load = (first: boolean) => {
      if (first && !pulse) setPulseLoading(true)
      fetch('/api/pulse').then(r => r.json()).then(d => { if (active) setPulse(d) }).catch(() => {}).finally(() => { if (active) setPulseLoading(false) })
    }
    load(true); const t = setInterval(() => load(false), 90000)
    return () => { active = false; clearInterval(t) }
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

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
  // cache do card completo de cada pool vigiada — garante que a pool aparece mesmo se sair do ranking/rede atual
  useEffect(() => { try { const d = JSON.parse(localStorage.getItem('tiger_pool_watch_data') || '{}'); if (d && typeof d === 'object') setWatchData(d) } catch { } }, [])
  const persistWatchData = (d: Record<string, any>) => { setWatchData(d); try { localStorage.setItem('tiger_pool_watch_data', JSON.stringify(d)) } catch { } }
  useEffect(() => { try { const f = parseFloat(localStorage.getItem('tiger_sell_fee') || ''); if (!isNaN(f) && f >= 0 && f < 10) setSellFeePct(f) } catch { } }, [])
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
    // guarda/remove o card completo no cache — é o que garante que a pool não some enquanto vigiada
    const nd = { ...watchData }
    if (had) delete nd[k]; else nd[k] = it
    persistWatchData(nd)
    if (userId) {
      if (had) supabase.from('pool_watch').delete().eq('pool_key', k).then(() => { }, () => { })
      else supabase.from('pool_watch').upsert({ user_id: userId, pool_key: k, name: it.name, network: it.network, dex: it.dex }, { onConflict: 'user_id,pool_key' }).then(() => { }, () => { })
    }
  }
  // sempre que um lote de ideias carrega, atualiza o cache das que estão vigiadas (mantém os dados frescos)
  useEffect(() => {
    if (!ideas || !ideas.length || !watch.length) return
    let changed = false; const nd = { ...watchData }
    for (const it of ideas) { const k = keyOf(it); if (watch.includes(k)) { nd[k] = it; changed = true } }
    if (changed) persistWatchData(nd)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideas])
  // ao abrir "Vigiando", busca todas as redes p/ refrescar as pools vigiadas que saíram da rede atual
  const refreshWatched = useCallback(async () => {
    if (!watch.length) return
    setWatchRefreshing(true)
    try {
      const d = await fetch('/api/poolideas?net=all').then(r => r.json())
      const list: any[] = d?.ideas || []
      if (list.length) {
        const nd = { ...watchData }
        for (const it of list) { const k = keyOf(it); if (watch.includes(k)) nd[k] = it }
        persistWatchData(nd)
      }
    } catch { } finally { setWatchRefreshing(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch, watchData])

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
    // cripto sem preço ao vivo (sem cg_id ou API fora): mostra NO CUSTO (0%), nunca um preço travado/errado.
    // Isso cura sozinho qualquer ativo antigo, por usuário, sem precisar rodar SQL.
    if (h.kind === 'crypto') return { ...h, price: h.qty ? h.invested / h.qty : h.price }
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

  // Perps: equity da conta (colateral + uPnL) = capital real na Ondo. NÃO é o notional.
  const perpSum = useMemo(() => accountSummary(
    perps, perpCollateral,
    (p) => perpMkts[p.symbol]?.last || 0,
    (p) => perpMkts[p.symbol]?.mmr ?? mmrFor(metaFor(p.symbol).maxLev),
  ), [perps, perpCollateral, perpMkts])
  const perpsActive = perpCollateral > 0 || perps.some(p => p.status === 'open')
  const perpsEquity = Math.max(0, perpSum.equity)
  const perpsPl = perpCollateral ? perpSum.totalUpnl / perpCollateral * 100 : 0

  const t = useMemo(() => {
    const sum = (a: Holding[]) => a.reduce((s, h) => s + valOf(h), 0)
    const inv = (a: Holding[]) => a.reduce((s, h) => s + h.invested, 0)
    const crypto = priced.filter(h => h.kind === 'crypto'), stock = priced.filter(h => h.kind === 'stock')
    const cash = priced.filter(h => h.kind === 'cash')
    const criptoVal = sum(crypto) + sum(stock), criptoInv = inv(crypto) + inv(stock)
    const cashVal = sum(cash)
    const riskInv = criptoInv + poolsInv + perpCollateral, riskVal = criptoVal + poolsVal + perpsEquity
    return { patr: criptoVal + cashVal + poolsVal + perpsEquity, criptoVal, criptoInv, cashVal, riskInv, pl: riskVal - riskInv, totalInv: riskInv + inv(cash), aportTotal: riskInv + inv(cash) }
  }, [priced, poolsVal, poolsInv, perpsEquity, perpCollateral])

  const plpct = t.riskInv ? (t.pl / t.riskInv) * 100 : 0
  const criptoPl = t.criptoInv ? ((t.criptoVal - t.criptoInv) / t.criptoInv) * 100 : 0
  const poolPl = poolsInv ? ((poolsVal - poolsInv) / poolsInv) * 100 : 0
  const cryptoVal = priced.filter(h => h.kind === 'crypto').reduce((a, h) => a + valOf(h), 0)
  const cryptoInv = holdings.filter(h => h.kind === 'crypto').reduce((a, h) => a + h.invested, 0)
  const cryptoPl = cryptoInv ? (cryptoVal - cryptoInv) / cryptoInv * 100 : 0
  const stockVal = priced.filter(h => h.kind === 'stock').reduce((a, h) => a + valOf(h), 0)
  const stockInv = holdings.filter(h => h.kind === 'stock').reduce((a, h) => a + h.invested, 0)
  const stockPl = stockInv ? (stockVal - stockInv) / stockInv * 100 : 0

  // Saúde da carteira — scanner de risco sobre os próprios dados
  const health = useMemo(() => {
    // por símbolo: 1ª compra e se há stop
    const bySym: Record<string, { firstDate: string; hasStop: boolean }> = {}
    txs.forEach(x => {
      const s = bySym[x.symbol] || (bySym[x.symbol] = { firstDate: x.buy_date, hasStop: false })
      if ((x.buy_date || '') < s.firstDate) s.firstDate = x.buy_date
      if ((x.stop_limit || 0) > 0) s.hasStop = true
    })
    const hh = priced.filter(h => h.kind === 'crypto' || h.kind === 'stock').map(h => {
      const info = bySym[h.symbol]
      const years = info ? daysSince(info.firstDate) / 365 : 0
      const v = valOf(h)
      const nominalPct = h.invested ? (v - h.invested) / h.invested * 100 : 0
      return { symbol: h.symbol, kind: h.kind, value: v, metaPct: h.meta_pct, years, hasStop: !!info?.hasStop, emission: h.kind === 'crypto' ? emissionFor(h.symbol) : null, nominalPct }
    })
    // perps: margin ratio + menor distância até liquidação
    const openP = perps.filter(p => p.status === 'open')
    let minLiq: number | null = null
    for (const p of openP) {
      const m = perpMkts[p.symbol]; const mark = m?.last || p.entry_price
      const mmr = m?.mmr ?? mmrFor(metaFor(p.symbol).maxLev)
      const maintI = notionalAt(p.size, mark) * mmr
      const u = upnl(p, mark)
      const A = perpSum.equity - u - perpSum.maintMargin + maintI
      const liq = liqPrice({ side: p.side, size: p.size, entry_price: p.entry_price, mmr }, A)
      const d = liq != null ? liqDistancePct(p.side, mark, liq) : null
      if (d != null && (minLiq == null || d < minLiq)) minLiq = d
    }
    return buildHealth({
      patr: t.patr, holdings: hh, cashVal: t.cashVal, poolsVal,
      perpsOpen: openP.map(p => ({ symbol: p.symbol, side: p.side, margin: p.margin, leverage: p.leverage, hasStop: (p.sl ?? 0) > 0 })),
      perpEquity: perpsEquity, perpCollateral, perpUpnl: perpSum.totalUpnl,
      perpMarginRatio: perpSum.marginRatio, perpMinLiqDist: minLiq,
      cycleRegime: pulse?.regime ?? null,
    })
  }, [priced, txs, t.patr, t.cashVal, poolsVal, perps, perpMkts, perpSum, perpsEquity, perpCollateral, pulse])

  const cats = useMemo(() => {
    const bs = (s: string) => priced.filter(h => h.symbol === s).reduce((a, h) => a + valOf(h), 0)
    const other = priced.filter(h => h.kind === 'crypto' && !['ETH', 'BTC', 'SOL'].includes(h.symbol)).reduce((a, h) => a + valOf(h), 0)
    return [
      { n: 'Ethereum', v: bs('ETH'), c: '#A855F7' }, { n: 'Bitcoin', v: bs('BTC'), c: '#FF2E9A' },
      { n: 'Solana', v: bs('SOL'), c: '#22D3EE' }, { n: 'Altcoins', v: other, c: '#C77DFF' },
      { n: 'Ações', v: priced.filter(h => h.kind === 'stock').reduce((a, h) => a + valOf(h), 0), c: '#7C5CFF' },
      { n: 'Caixa', v: priced.filter(h => h.kind === 'cash').reduce((a, h) => a + valOf(h), 0), c: '#9D7CFF' },
      { n: 'Pools', v: poolsVal, c: '#2BFFC6' },
      { n: 'Perps', v: perpsEquity, c: '#F5A623' },
    ].filter(x => x.v > 0)
  }, [priced, poolsVal, perpsEquity])
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
  // hidrata a lista de alertas já vistos
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem('tiger_seen_alerts') || '[]'); if (Array.isArray(s)) setSeenAlerts(s) } catch { } }, [])
  // poda: mantém em "visto" só o que ainda está ativo — alerta que sumiu volta a notificar se reaparecer
  useEffect(() => {
    const active = new Set([...poolAlerts.map(a => a.id), ...alerts.map(a => a.id)])
    setSeenAlerts(prev => { const nx = prev.filter(id => active.has(id)); if (nx.length !== prev.length) { try { localStorage.setItem('tiger_seen_alerts', JSON.stringify(nx)) } catch { } ; return nx } return prev })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolAlerts, alerts])
  // ao abrir o painel: marca tudo como visto (some do contador) e confirma os de pool no banco
  useEffect(() => {
    if (!alertsOpen) return
    const ids = [...poolAlerts.map(a => a.id), ...alerts.map(a => a.id)]
    setSeenAlerts(prev => { const nx = Array.from(new Set([...prev, ...ids])); try { localStorage.setItem('tiger_seen_alerts', JSON.stringify(nx)) } catch { } ; return nx })
    const rows = poolAlerts.map(a => a._row).filter(Boolean)
    if (rows.length) supabase.from('pool_alert').update({ seen: true }).in('id', rows).then(() => { }, () => { })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertsOpen])
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
    // qty final (saldo) = compras + retornos de pool − saidas p/ pool (soma via sinal da qty).
    const qty = list.reduce((s, x) => s + x.qty, 0)
    // preco medio REAL = media ponderada apenas das COMPRAS (saida/retorno de pool nao muda o que voce pagou).
    const buys = list.filter(x => (x.move_kind || 'buy') === 'buy')
    const buyQty = buys.reduce((s, x) => s + x.qty, 0)
    const avgCost = buyQty ? buys.reduce((s, x) => s + x.qty * x.buy_price, 0) / buyQty : 0
    // custo do que voce AINDA tem = preco medio real × saldo atual. Assim, coins que
    // sairam p/ pool levam seu custo junto (viram custo da pool) e nao distorcem este ativo.
    // resultado do ativo (saldo − invested) e o custo medio (invested/qty) ficam ambos reais.
    const invested = avgCost * qty
    const existing = holdings.find(h => h.symbol === symbol && h.kind === 'crypto')
    // preco guardado = custo medio atual (fallback). O preco AO VIVO sobrepoe na tela via ph()
    // quando ha cg_id. NUNCA congelar no 1o buy: sem isso o valor trava num preco antigo/errado.
    const payload: any = { user_id: userId, kind: 'crypto', symbol, name, cg_id: cg, color, meta_pct: meta || existing?.meta_pct || 0, qty, price: avgCost, invested, current_value: null, sort: existing?.sort ?? 50 }
    if (existing?.id) await supabase.from('holdings').update(payload).eq('id', existing.id)
    else await supabase.from('holdings').insert(payload)
  }, [supabase, holdings, userId])

  async function saveBuy() {
    const f = txForm; if (!f) return
    if (f.isNew && (!f.cg_id || !f.symbol)) { flash('Escolha a moeda na busca antes de salvar — assim o preço e o símbolo vêm certos do mercado.', 'err'); return }
    if (!num(f.qty)) { flash('Informe a quantidade que você comprou.', 'err'); return }
    const payload = { user_id: userId, symbol: f.symbol.toUpperCase(), name: f.name || f.symbol, cg_id: f.cg_id, color: f.color || '#A855F7', rede: f.rede, corretora: f.corretora, carteira: f.carteira, buy_date: f.buy_date, qty: num(f.qty), buy_price: num(f.buy_price), stop_limit: num(f.stop_limit), target: num(f.target), meta_pct: num(f.meta_pct) }
    await supabase.from('transactions').insert(payload)
    await recompute(payload.symbol, payload.name, payload.cg_id, payload.color, payload.meta_pct)
    setTxForm(null); setDetail(null); await refetch()
  }
  const openMove = (h: Holding, dir: 'to_pool' | 'from_pool' | 'sell') => setMoveForm({
    symbol: h.symbol, name: h.name, cg_id: h.cg_id, color: h.color,
    dir, qty: '', price: String(live[h.cg_id]?.usd ?? h.price ?? ''), note: '',
    buy_date: new Date().toISOString().slice(0, 10),
    toCash: true, maxQty: h.qty,
  })
  async function saveMove() {
    const f = moveForm; if (!f) return
    const q = num(f.qty); if (!q) { setMoveForm(null); return }
    const isSell = f.dir === 'sell'
    if (isSell && f.maxQty && Math.abs(q) > f.maxQty + 1e-9) { flash(`Você só tem ${fmt(f.maxQty, 5)} ${f.symbol}. Não dá pra vender mais do que possui.`, 'err'); return }
    // saída p/ pool e venda -> qty negativa; retorno -> qty positiva
    const signedQty = (f.dir === 'to_pool' || isSell) ? -Math.abs(q) : Math.abs(q)
    const payload: any = {
      user_id: userId, symbol: f.symbol.toUpperCase(), name: f.name, cg_id: f.cg_id, color: f.color || '#A855F7',
      rede: '', corretora: '', carteira: '', buy_date: f.buy_date,
      qty: signedQty, buy_price: num(f.price), stop_limit: 0, target: 0, meta_pct: 0,
      move_kind: f.dir, note: f.note || (f.dir === 'to_pool' ? 'saída para pool' : isSell ? 'venda' : 'retorno de pool'),
    }
    await supabase.from('transactions').insert(payload)
    await recompute(payload.symbol, payload.name, payload.cg_id, payload.color, 0)
    // venda: credita o valor recebido na Caixa (dólar), se marcado
    if (isSell && f.toCash) {
      const cash = holdings.find(h => h.kind === 'cash')
      if (cash?.id) await supabase.from('holdings').update({ current_value: (cash.current_value || 0) + Math.abs(q) * num(f.price) }).eq('id', cash.id)
    }
    setMoveForm(null); setDetail(null); await refetch()
  }

  async function delTx(id: string, h: Holding) { await supabase.from('transactions').delete().eq('id', id); await recompute(h.symbol, h.name, h.cg_id, h.color, h.meta_pct); await refetch() }
  // ---- Corrigir um movimento ja lancado (ex.: digitou 0,00247 e era 0,00297) ----
  const openTxEdit = (x: Transaction, h: Holding) => setTxEdit({
    id: x.id, symbol: h.symbol, name: h.name, cg_id: h.cg_id, color: h.color, meta_pct: h.meta_pct,
    move_kind: x.move_kind || 'buy',
    rede: x.rede || '', corretora: x.corretora || '', carteira: x.carteira || '',
    buy_date: x.buy_date, qty: String(Math.abs(x.qty)), buy_price: String(x.buy_price),
    stop_limit: x.stop_limit ? String(x.stop_limit) : '', target: x.target ? String(x.target) : '', note: x.note || '',
  })
  async function saveTxEdit() {
    const f = txEdit; if (!f?.id) return
    const q = Math.abs(num(f.qty)); if (!q) { setTxEdit(null); return }
    const isMove = f.move_kind === 'to_pool' || f.move_kind === 'from_pool' || f.move_kind === 'sell'
    // saida p/ pool e venda guardam qty negativa; compra e retorno guardam positiva
    const signedQty = (f.move_kind === 'to_pool' || f.move_kind === 'sell') ? -q : q
    const payload: any = { qty: signedQty, buy_price: num(f.buy_price), buy_date: f.buy_date }
    if (isMove) { payload.note = f.note || '' }
    else { payload.rede = f.rede; payload.corretora = f.corretora; payload.carteira = f.carteira; payload.stop_limit = num(f.stop_limit); payload.target = num(f.target) }
    await supabase.from('transactions').update(payload).eq('id', f.id)
    await recompute(f.symbol, f.name, f.cg_id, f.color, f.meta_pct)
    setTxEdit(null); setDetail(null); await refetch()
  }
  async function delAsset(h: Holding) { await supabase.from('transactions').delete().eq('symbol', h.symbol); if (h.id) await supabase.from('holdings').delete().eq('id', h.id); setDetail(null); await refetch() }
  async function saveEdit() { if (!editDraft?.id) return; await supabase.from('holdings').update({ current_value: num(cashInput) }).eq('id', editDraft.id); setEditDraft(null); await refetch() }
  const openAssetEdit = (h: Holding) => setAssetEdit({ id: h.id, name: h.name, symbol: h.symbol, cg_id: h.cg_id, meta_pct: String(h.meta_pct ?? '') })
  async function saveAssetEdit() { const f = assetEdit; if (!f?.id) return; await supabase.from('holdings').update({ name: f.name, cg_id: f.cg_id, meta_pct: num(f.meta_pct) }).eq('id', f.id); setAssetEdit(null); setDetail(null); await refetch() }

  // ---- METAS: definir/editar/excluir a meta (% ideal) de cada ativo ----
  const openMeta = (h?: Holding) => {
    setMetaCoinQuery(''); setMetaCoinResults(null)
    setMetaForm(h
      ? { id: h.id, symbol: h.symbol, meta_pct: String(h.meta_pct || '').replace('.', ','), isNew: false }
      : { id: '', symbol: '', meta_pct: '', isNew: true })
  }
  // busca online de moeda p/ criar meta de um ativo que o usuário ainda não tem
  useEffect(() => {
    if (!metaForm?.isNew) return
    const q = metaCoinQuery.trim()
    if (q.length < 2) { setMetaCoinResults(null); return }
    setMetaCoinSearching(true)
    const t = setTimeout(() => {
      fetch(`/api/coinsearch?q=${encodeURIComponent(q)}`).then(r => r.json()).then(d => setMetaCoinResults(d.coins || [])).catch(() => setMetaCoinResults([])).finally(() => setMetaCoinSearching(false))
    }, 400)
    return () => clearTimeout(t)
  }, [metaCoinQuery, metaForm?.isNew])
  const pickMetaCoin = (c: any) => {
    const sym = (c.symbol || '').toUpperCase()
    const existing = holdings.find(h => h.cg_id === c.id || (h.kind === 'crypto' && h.symbol === sym))
    setMetaForm((prev: any) => ({
      ...prev,
      id: existing?.id || '', symbol: sym, name: c.name, cg_id: c.id, img: c.image || '',
      color: existing?.color || '#A855F7', target: !existing,
      meta_pct: existing && existing.meta_pct > 0 ? String(existing.meta_pct).replace('.', ',') : prev.meta_pct,
    }))
    setMetaCoinQuery(''); setMetaCoinResults(null)
  }
  async function saveMeta() {
    const f = metaForm; if (!f) return
    const v = num(f.meta_pct)
    if (v < 0 || v > 100) { flash('A meta deve ficar entre 0% e 100%', 'err'); return }
    if (f.id) {
      // ativo já existente na carteira → só atualiza a meta
      await supabase.from('holdings').update({ meta_pct: v }).eq('id', f.id)
    } else if (f.cg_id && f.symbol) {
      // ativo novo (não está na carteira) → cria holding-alvo com saldo zero + meta
      await supabase.from('holdings').insert({
        user_id: userId, kind: 'crypto', symbol: f.symbol.toUpperCase(), name: f.name || f.symbol,
        cg_id: f.cg_id, color: f.color || '#A855F7', qty: 0, price: 0, invested: 0, current_value: null, meta_pct: v, sort: 50,
      })
    } else { flash('Escolha um ativo primeiro', 'err'); return }
    setMetaForm(null); await refetch(); flash('Meta salva', 'ok')
  }
  async function removeMeta(h: Holding) {
    if (!h.id) return
    // se for um ativo-alvo (saldo zero, sem histórico), remove o holding inteiro; senão só zera a meta
    const isTargetOnly = h.kind === 'crypto' && (h.qty || 0) === 0 && (h.invested || 0) === 0 && txs.filter(x => x.symbol === h.symbol).length === 0
    if (isTargetOnly) await supabase.from('holdings').delete().eq('id', h.id)
    else await supabase.from('holdings').update({ meta_pct: 0 }).eq('id', h.id)
    await refetch(); flash('Meta removida', 'ok')
  }
  const fdate = (f: Flow) => f.move_date || (f.created_at ? f.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10))
  const abbr = (n: number) => { const a = Math.abs(n); return '$' + (a >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : a >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : a >= 1e3 ? (n / 1e3).toFixed(0) + 'K' : n.toFixed(0)) }
  const abbrMC = (n: number) => { const a = Math.abs(n); return '$' + (a >= 1e12 ? (n / 1e12).toFixed(2) + 'T' : a >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : a >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : (n / 1e3).toFixed(0) + 'K') }
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
    const payload = { user_id: userId, par1: f.par1.toUpperCase(), par1_cg_id: f.par1_cg_id, par2: f.par2.toUpperCase(), dapp: f.dapp, rede: f.rede, link: f.link, aporte: num(f.aporte), current_value: num(f.current_value), low_range: num(f.low_range), high_range: num(f.high_range), entry_date: f.entry_date, entry_price: num(f.entry_price), fees: num(f.fees), pool_address: f.pool_address || '', network: f.network || 'base', position_id: f.position_id || '' }
    if (f.id) await supabase.from('pools').update(payload).eq('id', f.id)
    else await supabase.from('pools').insert(payload)
    setPoolForm(null); await refetch()
  }
  async function delPool(id: string) { await supabase.from('pools').delete().eq('id', id); setPoolForm(null); await refetch() }

  // ---- Perps (Ondo) ----
  const perpMark = useCallback((p: PerpPosition) => perpMkts[p.symbol]?.last || 0, [perpMkts])
  const perpMmr = useCallback((p: PerpPosition) => perpMkts[p.symbol]?.mmr ?? mmrFor(metaFor(p.symbol).maxLev), [perpMkts])

  function openPerpForm(m?: PerpMarket) {
    const mk = m || perpMktList.find(x => x.last > 0) || perpMktList[0]
    const meta = mk ? metaFor(mk.symbol) : { maxLev: 10 }
    setPerpForm({
      market: mk?.market || '', symbol: mk?.symbol || '', name: mk?.name || '',
      side: 'long' as PerpSide, leverage: Math.min(5, meta.maxLev), margin: '', entry: mk?.last ? String(mk.last) : '',
    })
    setPerpPick('')
  }
  function pickPerpMkt(m: PerpMarket) {
    setPerpForm((f: any) => ({ ...f, market: m.market, symbol: m.symbol, name: m.name, entry: m.last ? String(m.last) : (f?.entry || ''), leverage: Math.min(f?.leverage || 5, m.maxLev) }))
    setPerpPick('')
  }
  async function savePerp() {
    const f = perpForm; if (!f?.symbol) { flash('Escolha um mercado', 'err'); return }
    const entry = num(f.entry), lev = Math.max(1, Math.round(num(f.leverage) || 1))
    const sizeInput = num(f.size), marginInput = num(f.margin)
    if (!(entry > 0) || (!(marginInput > 0) && !(sizeInput > 0))) { flash('Preencha o preço de entrada e (margem OU tamanho)', 'err'); return }
    // Se o tamanho foi informado (posição já aberta), ele manda; senão deriva da margem.
    const size = sizeInput > 0 ? sizeInput : marginInput * lev / entry
    const margin = sizeInput > 0 ? size * entry / lev : marginInput
    const payload = {
      user_id: userId, market: f.market, symbol: f.symbol, name: f.name,
      side: f.side, leverage: lev, size, entry_price: entry, margin,
      tp: num(f.tp) > 0 ? num(f.tp) : null, sl: num(f.sl) > 0 ? num(f.sl) : null,
      opened_at: f.opened_at || new Date().toISOString().slice(0, 10), status: 'open', note: f.note || '',
    }
    if (f.id) await supabase.from('perps_positions').update(payload).eq('id', f.id)
    else await supabase.from('perps_positions').insert(payload)
    // se ainda não há colateral definido, assume a margem desta 1ª posição (editável depois)
    if (!perpCollateral) { await supabase.from('perps_account').upsert({ user_id: userId, collateral: margin, updated_at: new Date().toISOString() }); setPerpCollateral(margin) }
    setPerpForm(null); await refetch(); flash('Posição registrada', 'ok')
  }
  async function delPerp(id: string) { await supabase.from('perps_positions').delete().eq('id', id); setPerpForm(null); setPerpClose(null); await refetch() }
  async function closePerp() {
    const c = perpClose; if (!c?.id) return
    const px = num(c.price); if (!(px > 0)) { flash('Informe o preço de fechamento', 'err'); return }
    const dir = c.side === 'long' ? 1 : -1
    const gross = dir * c.size * (px - c.entry_price)
    const fees = (c.size * c.entry_price + c.size * px) * PERP_TAKER_FEE   // taxa de entrada + saída (taker)
    const realized = gross - fees
    await supabase.from('perps_positions').update({ status: 'closed', close_price: px, closed_at: new Date().toISOString().slice(0, 10), realized_pnl: realized }).eq('id', c.id)
    setPerpClose(null); await refetch(); flash(`Posição encerrada · ${realized >= 0 ? '+' : '−'}$${fmt(Math.abs(realized))}`, realized >= 0 ? 'ok' : 'info')
  }
  async function savePerpCollateral() {
    const v = num(perpAcctForm || '0')
    await supabase.from('perps_account').upsert({ user_id: userId, collateral: v, updated_at: new Date().toISOString() })
    setPerpCollateral(v); setPerpAcctForm(null); await refetch()
  }

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
  const unseenCount = allAlerts.filter(a => !seenAlerts.includes(a.id)).length
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

  const openBuy = (h: Holding | null) => { setCoinQuery(''); setCoinResults(null); setCoinManual(false); setHistPrice(null); setTxForm(h
    ? { symbol: h.symbol, name: h.name, cg_id: h.cg_id, color: h.color, meta_pct: h.meta_pct, rede: '', corretora: '', carteira: '', buy_date: new Date().toISOString().slice(0, 10), qty: '', buy_price: live[h.cg_id]?.usd ?? h.price, stop_limit: '', target: '', isNew: false }
    : { symbol: '', name: '', cg_id: '', color: '#A855F7', meta_pct: '', rede: '', corretora: '', carteira: '', buy_date: new Date().toISOString().slice(0, 10), qty: '', buy_price: '', stop_limit: '', target: '', isNew: true }) }
  // Busca da moeda (nome -> id/logo/preço corretos). Debounce pra não estourar a API.
  useEffect(() => {
    if (!txForm?.isNew) return
    const q = coinQuery.trim()
    if (q.length < 2) { setCoinResults(null); return }
    setCoinSearching(true)
    const t = setTimeout(() => {
      fetch(`/api/coinsearch?q=${encodeURIComponent(q)}`).then(r => r.json()).then(d => setCoinResults(d.coins || [])).catch(() => setCoinResults([])).finally(() => setCoinSearching(false))
    }, 400)
    return () => clearTimeout(t)
  }, [coinQuery, txForm?.isNew])
  const pickCoin = (c: any) => {
    setTxForm((prev: any) => ({ ...prev, name: c.name, symbol: c.symbol, cg_id: c.id, img: c.image || '', buy_price: c.price != null ? String(c.price) : prev.buy_price }))
    setCoinQuery(''); setCoinResults(null); setCoinManual(false)
  }
  // Busca da moeda do PAR 1 no cadastro de pool — grava o ID certo do CoinGecko a partir do nome.
  useEffect(() => {
    if (!poolForm) return
    const q = poolCoinQuery.trim()
    if (q.length < 2) { setPoolCoinResults(null); return }
    setPoolCoinSearching(true)
    const t = setTimeout(() => {
      fetch(`/api/coinsearch?q=${encodeURIComponent(q)}`).then(r => r.json()).then(d => setPoolCoinResults(d.coins || [])).catch(() => setPoolCoinResults([])).finally(() => setPoolCoinSearching(false))
    }, 400)
    return () => clearTimeout(t)
  }, [poolCoinQuery, poolForm])
  const pickPoolCoin = (c: any) => {
    setPoolForm((prev: any) => ({ ...prev, par1: (c.symbol || '').toUpperCase(), par1_cg_id: c.id }))
    setPoolCoinQuery(''); setPoolCoinResults(null)
  }
  // Compra retroativa: se a data for passada, busca o preço de mercado daquele dia (sugestão).
  useEffect(() => {
    const cg = txForm?.cg_id, date = txForm?.buy_date
    if (!cg || !date) { setHistPrice(null); return }
    const today = new Date().toISOString().slice(0, 10)
    if (date >= today) { setHistPrice(null); return }   // hoje/futuro usa o preço ao vivo já preenchido
    setHistLoading(true)
    const t = setTimeout(() => {
      fetch(`/api/coinprice?id=${encodeURIComponent(cg)}&date=${date}`).then(r => r.json()).then(d => setHistPrice(d.price ?? null)).catch(() => setHistPrice(null)).finally(() => setHistLoading(false))
    }, 400)
    return () => clearTimeout(t)
  }, [txForm?.cg_id, txForm?.buy_date])
  const openLevel = (symbol: string, l?: Level) => setLevelForm(l ? { ...l } : { symbol, kind: 'support', price: '', note: '' })
  async function saveLevel() { const f = levelForm; if (!f) return; const payload = { user_id: userId, symbol: f.symbol, kind: f.kind, price: num(f.price), note: f.note || '' }; if (f.id) await supabase.from('levels').update(payload).eq('id', f.id); else await supabase.from('levels').insert(payload); setLevelForm(null); await refetch() }
  async function delLevel(id: string) { await supabase.from('levels').delete().eq('id', id); setLevelForm(null); await refetch() }
  async function openRadarCoin(c: any) {
    setRadarDetail(c); setRadarSig(null); setRadarSigLoading(true)
    try { const r = await fetch(`/api/signals?ids=${c.id}`); const d = await r.json(); setRadarSig(d[c.id] || null) } catch {}
    setRadarSigLoading(false)
  }
  const openFlow = (f: Flow | null) => setFlowForm(f ? { id: f.id, kind: f.kind, amount: f.amount, move_date: f.move_date || (f.created_at ? f.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10)) } : { kind: 'in', amount: '', move_date: new Date().toISOString().slice(0, 10) })
  // Sincroniza saldo atual + taxas da posição direto da blockchain (via NFT ID)
  async function syncPosition(p: Pool) {
    if (!p.id) return
    if (!p.position_id) { flash('Cadastre o NFT ID da posição (campo "ID da posição") para sincronizar automaticamente.', 'err'); return }
    setSyncing(p.id)
    try {
      // tenta até 3x (RPC público às vezes recusa a 1ª rajada); só avisa se todas falharem
      let d: any = null
      for (let attempt = 0; attempt < 3; attempt++) {
        const r = await fetch(`/api/position?network=${p.network || 'base'}&id=${p.position_id}`)
        d = await r.json()
        if (d?.ok) break
        await new Promise(res => setTimeout(res, 700))
      }
      if (!d?.ok) { flash('O RPC não respondeu agora. Tente novamente em alguns segundos.', 'err'); return }
      await supabase.from('pools').update({ ...(d.fees != null ? { fees: d.fees } : {}), ...(d.current_value != null ? { current_value: d.current_value } : {}) }).eq('id', p.id)
      // escolhe automaticamente o ratio (cbBTC/WETH ou WETH/cbBTC) que cai dentro do range cadastrado
      const cands = [d.ratio_t0_per_t1, d.ratio_t1_per_t0].filter((x: any) => typeof x === 'number' && x > 0) as number[]
      const lo = p.low_range || 0, hi = p.high_range || 0
      let chosen = cands[0]
      if (lo > 0 && hi > 0) {
        const inside = cands.find(r => r >= lo * 0.5 && r <= hi * 1.5)
        if (inside) chosen = inside
      }
      if (chosen && p.id) setPoolRatio(prev => ({ ...prev, [p.id!]: chosen }))
      await refetch()
      flash(`Sincronizado ✓ saldo ${d.current_value != null ? 'US$ ' + d.current_value.toFixed(2) : '—'} · taxas ${d.fees != null ? 'US$ ' + d.fees.toFixed(5) : 'indisponível'}`, 'ok')
    } catch { flash('Falha ao sincronizar. Tente de novo em instantes.', 'err') }
    finally { setSyncing(null) }
  }

  // ao carregar, busca o preço on-chain das pools que têm NFT ID (atualiza status de range sem clique)
  useEffect(() => {
    pools.forEach(p => {
      if (p.position_id && p.id && !poolRatio[p.id]) {
        fetch(`/api/position?network=${p.network || 'base'}&id=${p.position_id}`).then(r => r.json()).then(async d => {
          if (!d?.ok) return
          const cands = [d.ratio_t0_per_t1, d.ratio_t1_per_t0].filter((x: any) => typeof x === 'number' && x > 0)
          const lo = p.low_range || 0, hi = p.high_range || 0
          let chosen = cands[0]
          if (lo > 0 && hi > 0) { const ins = cands.find((r: number) => r >= lo * 0.5 && r <= hi * 1.5); if (ins) chosen = ins }
          if (chosen) setPoolRatio(prev => ({ ...prev, [p.id!]: chosen }))
          // grava saldo + taxas automaticamente se mudaram (evita write desnecessário)
          const upd: any = {}
          if (d.fees != null && Math.abs((d.fees || 0) - (p.fees || 0)) > 0.00001) upd.fees = d.fees
          if (d.current_value != null && Math.abs((d.current_value || 0) - (p.current_value || 0)) > 0.01) upd.current_value = d.current_value
          if (Object.keys(upd).length && p.id) { await supabase.from('pools').update(upd).eq('id', p.id); refetch() }
        }).catch(() => {})
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pools])

  const openPool = (p: Pool | null) => { setPoolCoinQuery(''); setPoolCoinResults(null); setPoolForm(p ? { ...p } : { par1: 'ETH', par1_cg_id: 'ethereum', par2: 'USDC', dapp: 'Uniswap v3', rede: 'Base', link: '', aporte: '', current_value: '', low_range: '', high_range: '', entry_date: new Date().toISOString().slice(0, 10), entry_price: '', fees: '', pool_address: '', network: 'base', position_id: '' }) }

  const assetRow = (h: Holding) => {
    const v = valOf(h), pl = v - h.invested, plp = h.invested ? pl / h.invested * 100 : 0
    const real = t.patr ? v / t.patr * 100 : 0, denom = Math.max(h.meta_pct, real, 1)
    const emi = h.kind === 'crypto' ? emissionFor(h.symbol) : null
    const emiTone = emissionTone(emi)
    const emiColor = emiTone === 'good' ? 'var(--green)' : emiTone === 'ok' ? '#9EE7C5' : emiTone === 'warn' ? '#F5A623' : emiTone === 'bad' ? 'var(--red)' : 'var(--muted)'
    return (<div className="asset" key={h.id} onClick={() => setDetail(holdings.find(x => x.id === h.id)!)}>
      <div className="sym" style={{ background: `linear-gradient(145deg,${h.color},${h.color}88)` }}>{h.symbol.slice(0, 4)}</div>
      <div className="a-main"><div className="a-name">{h.name}{emi != null && <span className="emi-chip" style={{ color: emiColor, borderColor: emiColor + '55' }} title="Emissão anual do token (inflação de oferta)">🪙 {fmt(Math.abs(emi), emi === Math.floor(emi) ? 0 : 1)}%{emi < 0 ? ' burn' : '/ano'}</span>}</div><div className="a-sub">{fmt(h.qty, h.qty < 1 ? 5 : 3)} · {usd(h.price)}</div>
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
            <button className="bell" onClick={() => setAlertsOpen(true)} aria-label="Alertas"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" /></svg>{unseenCount > 0 && <span className="bell-badge">{unseenCount}</span>}</button>
            <button className="logout" style={{ borderColor: 'rgba(43,255,198,.5)', color: '#2BFFC6' }} onClick={() => router.push('/indicacoes')}>Indicar</button>
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

            {/* SAÚDE DA CARTEIRA */}
            {(() => {
              const statusColor = health.status === 'crit' ? 'var(--red)' : health.status === 'warn' ? '#F5A623' : 'var(--green)'
              const statusLabel = health.status === 'crit' ? 'Requer atenção' : health.status === 'warn' ? 'Pontos de cuidado' : 'Saudável'
              const crit = health.flags.filter(f => f.sev === 'crit').length
              const warn = health.flags.filter(f => f.sev === 'warn').length
              const sevColor = (s: Severity) => s === 'crit' ? 'var(--red)' : s === 'warn' ? '#F5A623' : s === 'info' ? 'var(--purple)' : 'var(--green)'
              const sevIcon = (s: Severity) => s === 'crit' ? '⛔' : s === 'warn' ? '⚠️' : s === 'info' ? 'ℹ️' : '✓'
              const shown = healthOpen ? health.flags : health.flags.slice(0, 2)
              return (
                <div className="card section-gap health-card" style={{ borderColor: statusColor + '44' }}>
                  <div className="health-head" onClick={() => setHealthOpen(o => !o)}>
                    <div className="health-ring" style={{ background: `conic-gradient(${statusColor} ${health.score * 3.6}deg, rgba(255,255,255,.07) 0)` }}>
                      <span className="num" style={{ color: statusColor }}>{health.score}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="eyebrow" style={{ margin: 0 }}>Saúde da carteira</div>
                      <b style={{ color: statusColor, fontSize: 16, fontFamily: 'Sora' }}>{statusLabel}</b>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{health.flags.length === 0 ? 'Nenhuma bandeira levantada' : `${crit ? crit + ' crítico · ' : ''}${warn ? warn + ' cuidado · ' : ''}${health.flags.length} no total`}</div>
                    </div>
                    <span style={{ color: 'var(--muted)', fontSize: 20, transform: healthOpen ? 'rotate(180deg)' : 'none', transition: '.2s' }}>⌄</span>
                  </div>
                  {health.flags.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      {shown.map(f => (
                        <div className="health-flag" key={f.id} style={{ borderLeftColor: sevColor(f.sev) }}>
                          <div className="hf-top"><span>{sevIcon(f.sev)} <b>{f.title}</b></span><span className="hf-detail num" style={{ color: sevColor(f.sev) }}>{f.detail}</span></div>
                          {healthOpen && <div className="hf-mean">{f.meaning}</div>}
                        </div>
                      ))}
                      {!healthOpen && health.flags.length > 2 && <div className="health-more" onClick={() => setHealthOpen(true)}>ver todas as {health.flags.length} bandeiras + o que significam ⌄</div>}
                    </div>
                  )}
                  {healthOpen && <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 10, fontSize: 10 }}>Espelho de risco dos seus próprios dados — mostra exposição, não prevê o mercado nem recomenda operações. Ausência de bandeira vermelha não é garantia de segurança.</p>}
                </div>
              )
            })()}

            <div className="card section-gap"><div className="eyebrow">Alocação atual</div>
              <div className="donut-wrap"><div className="donut"><svg viewBox="0 0 42 42"><circle cx="21" cy="21" r="15.915" fill="transparent" stroke="rgba(255,255,255,.05)" strokeWidth="5.5" />{segs}</svg><div className="center"><small>Total</small><b className="num">${fmt(donutTot, 0)}</b></div></div>
                <div className="legend">{cats.map((x, i) => (<div className="leg" key={i}><span className="dot" style={{ background: x.c, color: x.c }} /><span>{x.n}</span><span className="lpct">{fmt(x.v / donutTot * 100, 1)}%</span></div>))}</div></div></div>
            <div className="eyebrow section-gap">Blocos por nicho</div>
            <div className="trio trio4">
              <div className="stat"><div className="k">Cripto</div><div className="v num">{usd(cryptoVal)}</div><div className={`s num ${cryptoPl >= 0 ? 'up' : 'down'}`}>{pct(cryptoPl)}</div></div>
              <div className="stat"><div className="k">Ações / ETFs</div><div className="v num">{usd(stockVal)}</div><div className={`s num ${stockPl >= 0 ? 'up' : 'down'}`}>{pct(stockPl)}</div></div>
              <div className="stat"><div className="k">Caixa</div><div className="v num">{usd(t.cashVal)}</div><div className="s" style={{ color: 'var(--muted)' }}>reserva</div></div>
              <div className="stat"><div className="k">Pools</div><div className="v num">{usd(poolsVal)}</div><div className={`s num ${poolPl >= 0 ? 'up' : 'down'}`}>{pct(poolPl)}</div></div>
              {perpsActive && <div className="stat"><div className="k">Perps</div><div className="v num">{usd(perpsEquity)}</div><div className={`s num ${perpSum.totalUpnl >= 0 ? 'up' : 'down'}`}>{perpCollateral ? pct(perpsPl) : '—'}</div></div>}
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
            <div className="eyebrow">Cotação ao vivo · CoinGecko <span style={{ color: 'var(--faint)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· toque num ativo seu p/ análise</span></div>
            {priced.filter(h => h.kind === 'crypto' && h.cg_id).sort((a, b) => valOf(b) - valOf(a)).map(h => { const L = live[h.cg_id]; return (
              <div className="qrow" key={h.id} style={{ cursor: 'pointer' }} onClick={() => setDetail(holdings.find(x => x.id === h.id) || h)}>
                <div className="qsym" style={{ background: `linear-gradient(145deg,${h.color},${h.color}88)` }}>{L?.img ? <img src={L.img} alt="" /> : h.symbol.slice(0, 3)}</div>
                <div className="qname"><b>{h.name}</b><span>{h.symbol}</span>{signals[h.cg_id] && (<span className={`sigbadge sig-${signals[h.cg_id].verdict.tone}`} style={{ marginTop: 4, marginLeft: 8, display: 'inline-flex' }}>{signals[h.cg_id].verdict.tone === 'buy' ? '▲ COMPRA' : signals[h.cg_id].verdict.tone === 'sell' ? '▼ VENDA' : '● CAUTELA'}</span>)}</div>
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

            <div className="qsection">Top 50 · market cap</div>
            {top50Loading && <div>{[0,1,2,3,4].map(i => <div key={i} className="skel skel-row" style={{ height: 58, borderRadius: 14, marginBottom: 9 }} />)}</div>}
            {top50 && top50.slice().sort((a: any, b: any) => (b.mcap || 0) - (a.mcap || 0)).map((c: any, i: number) => (
              <div className="qrow" key={c.id}>
                <div className="qsym" style={{ background: '#1a1226' }}>{c.img ? <img src={c.img} alt="" /> : c.symbol.slice(0, 3)}</div>
                <div className="qname"><b><span style={{ color: 'var(--faint)', fontFamily: "'JetBrains Mono'", fontSize: 12 }}>{i + 1}. </span>{c.name}</b><span>{c.symbol} · MC {abbrMC(c.mcap || 0)}</span></div>
                <div className="qprice"><div className="p">{usd(c.usd)}</div><div className="qchg" style={{ color: chColor(c.ch24) }}>{chTxt(c.ch24)} 24h</div></div>
              </div>
            ))}
          </section>

          {/* POOLS */}
          <section className={`screen ${tab === 'pools' ? 'active' : ''}`}>
            <div className="eyebrow">Minhas pools de liquidez</div>
            {pools.map(p => {
              const price = (p.id && poolRatio[p.id]) ? poolRatio[p.id] : (live[p.par1_cg_id]?.usd ?? 0)
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
              // composição v3: em qual ativo o capital está agora
              const comp = (() => {
                const P = price, pa = p.low_range, pb = p.high_range
                if (!(P > 0 && pa > 0 && pb > pa)) return null
                const sp = Math.sqrt(P), spa = Math.sqrt(pa), spb = Math.sqrt(pb)
                let a0: number, a1: number
                if (P <= pa) { a0 = (spb - spa) / (spa * spb); a1 = 0 }
                else if (P >= pb) { a0 = 0; a1 = spb - spa }
                else { a0 = (spb - sp) / (sp * spb); a1 = sp - spa }
                const v0 = a0 * P, v1 = a1, tot = v0 + v1
                return tot ? { vol: v0 / tot * 100, stable: v1 / tot * 100 } : null
              })()
              // IL estimado vs. HODL (par com perna estável), a partir do preço de entrada
              const il = (p.entry_price && p.entry_price > 0 && price > 0)
                ? (() => { const r = price / p.entry_price!; return { chg: (r - 1) * 100, il: (2 * Math.sqrt(r) / (1 + r) - 1) * 100 } })()
                : null
              // ---- Decomposição vs HODL (metodologia Revert): separa o que é mercado do que é a pool ----
              // HODL = valor hoje se tivesse segurado os tokens da entrada (perna estável constante + volátil ajustada por r).
              // Assume split 50/50 na entrada (padrão de posição centrada). divLoss = pool vs HODL sem fees. resultado = +fees.
              const hodl = (p.entry_price && p.entry_price > 0 && price > 0)
                ? (p.aporte / 2) + (p.aporte / 2) * (price / p.entry_price!)
                : null
              const divLoss = hodl != null ? (p.current_value - hodl) : null          // perda/ganho por divergência (IL em $), sem fees
              const resultVsHodl = hodl != null ? (p.current_value + (p.fees || 0) - hodl) : null // o que a pool rendeu vs ter segurado
              const feeAprLiq = (p.aporte && dias > 0 && divLoss != null)
                ? ((p.fees || 0) + divLoss) / p.aporte / dias * 365 * 100 : null       // APR líquido (fee + IL) anualizado
              return (<div className="poolcard" key={p.id}>
                <div className="poolhead">
                  <div className="poolt"><b>{p.par1} / {p.par2}</b><span>{p.dapp} · {p.rede}</span></div>
                  <div className="poolval"><div className="num">{usd(p.current_value)}</div><div className={`num ${pnl >= 0 ? 'up' : 'down'}`}>{pct(pnlp)}</div></div>
                </div>
                <div className={`rangestatus ${inRange ? (nearEdge ? 'rs-warn' : 'rs-in') : 'rs-out'}`}>{inRange ? (nearEdge ? '⚠ PERTO DE SAIR DA FAIXA' : '✓ DENTRO DA FAIXA · gerando taxas') : below ? '▼ FORA — abaixo · sem taxas' : above ? '▲ FORA — acima · sem taxas' : 'faixa não definida'}</div>
                <PoolChart par1={p.par1} par2={p.par2} cgId={p.par1_cg_id} poolId={p.id} price={price} low={p.low_range} high={p.high_range} currentValue={p.current_value} aporte={p.aporte} entryPrice={p.entry_price} />
                {pd && has(3) && (<div className="pooltraction">
                  <div className="pt-cell"><span>TVL</span><b>{abbr(pd.tvl)}</b></div>
                  <div className="pt-cell"><span>Vol 24h</span><b>{abbr(pd.vol24)}</b></div>
                  <div className="pt-cell"><span>Tração</span><b className={trac != null && trac > 0.3 ? 'up' : trac != null && trac > 0.1 ? '' : 'down'}>{trac == null ? '—' : trac > 0.3 ? 'Alta' : trac > 0.1 ? 'Média' : 'Baixa'}</b></div>
                </div>)}
                {pd && !has(3) && (<div className="pooltraction" style={{ justifyContent: 'center', cursor: 'pointer' }} onClick={() => setUpgrade({ tier: 3, feature: 'Tração ao vivo' })}><div className="pt-cell" style={{ flex: 'none' }}><span>🔒 Tração ao vivo (TVL, volume)</span><b className="lock-badge">TIGER ALPHA →</b></div></div>)}
                <div style={{ marginTop: 12 }}>
                  <div className="kv"><span className="k">Aporte</span><span className="v num">{usd(p.aporte)}</span></div>
                  <div className="kv"><span className="k">Saldo atual</span><span className="v num">{usd(p.current_value)}</span></div>
                  <div className="kv"><span className="k">Taxas geradas</span><span className="v num up">{'$' + (Math.abs(p.fees || 0) > 0 && Math.abs(p.fees || 0) < 1 ? (p.fees || 0).toLocaleString('pt-BR', { minimumFractionDigits: 5, maximumFractionDigits: 5 }) : fmt(p.fees || 0))}</span></div>
                  {resultVsHodl != null
                    ? (<div className="kv"><span className="k">Resultado da pool (vs HODL)</span><span className={`v num ${resultVsHodl >= 0 ? 'up' : 'down'}`}>{(resultVsHodl >= 0 ? '+' : '−') + usd(Math.abs(resultVsHodl)).slice(1)}</span></div>)
                    : (<div className="kv"><span className="k">PNL</span><span className={`v num ${pnl >= 0 ? 'up' : 'down'}`}>{(pnl >= 0 ? '+' : '−') + usd(Math.abs(pnl)).slice(1)}</span></div>)}
                  {divLoss != null && (<div className="kv"><span className="k">Divergência (IL em $)</span><span className={`v num ${divLoss >= 0 ? 'up' : 'down'}`}>{(divLoss >= 0 ? '+' : '−') + usd(Math.abs(divLoss)).slice(1)}</span></div>)}
                  <div className="kv"><span className="k">Fee APR (bruto)</span><span className="v num">{fmt(apr)}%</span></div>
                  {feeAprLiq != null && (<div className="kv"><span className="k">APR líquido (fee + IL)</span><span className={`v num ${feeAprLiq >= 0 ? 'up' : 'down'}`}>{fmt(feeAprLiq)}%</span></div>)}
                  <div className="kv"><span className="k">Dias na pool</span><span className="v num">{dias}</span></div>
                  {il && (<><div className="kv"><span className="k">{p.par1} vs. entrada ({usd(p.entry_price!)})</span><span className={`v num ${il.chg >= 0 ? 'up' : 'down'}`}>{pct(il.chg)}</span></div>
                  <div className="kv"><span className="k">IL estimado (vs. HODL)</span><span className="v num down">{fmt(il.il, 2)}%</span></div></>)}
                </div>
                {(() => {
                  // A "perda" que as taxas devem cobrir é a DIVERGÊNCIA (IL), não a queda de preço do ativo.
                  // Se não há preço de entrada, cai no modo antigo (aporte vs saldo).
                  const loss = divLoss != null ? Math.max(0, -divLoss) : Math.max(0, (p.aporte || 0) - (p.current_value || 0))
                  const net = resultVsHodl != null ? resultVsHodl : ((p.current_value || 0) + (p.fees || 0) - (p.aporte || 0))
                  const cobriu = net >= 0
                  const cov = loss > 0 ? Math.min(100, (p.fees || 0) / loss * 100) : 100
                  const cor = cobriu ? 'var(--green)' : cov >= 50 ? '#F5A623' : 'var(--red)'
                  return (
                    <div className="card" style={{ marginTop: 12, background: 'rgba(14,8,24,.5)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="k" style={{ fontSize: 13 }}>Taxa já cobriu a divergência?</span>
                        <b style={{ fontFamily: "'Sora'", fontWeight: 800, color: cor }}>{cobriu ? '✓ SIM' : '✗ AINDA NÃO'}</b>
                      </div>
                      <div style={{ height: 7, borderRadius: 999, background: 'rgba(255,255,255,.08)', marginTop: 10, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${cov}%`, background: cor, borderRadius: 999, transition: 'width .3s' }} />
                      </div>
                      <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 8 }}>{loss > 0
                        ? <>Taxas cobriram <b style={{ color: cor }}>{fmt(cov, 0)}%</b> da divergência ({usd(p.fees || 0)} de {usd(loss)}). {cobriu ? `Resultado vs HODL: +${usd(net).slice(1)}.` : `Faltam ${usd(loss - (p.fees || 0))} em taxa pra empatar com quem só segurou.`}</>
                        : <>Pool à frente do HODL — as taxas ({usd(p.fees || 0)}) são ganho extra. Resultado vs HODL: <b style={{ color: 'var(--green)' }}>+{usd(net).slice(1)}</b>.</>}
                        {' '}Compara com ter segurado os tokens; a queda/alta do preço em si não entra aqui.</p>
                    </div>
                  )
                })()}
                <div className="grid2" style={{ marginTop: 12 }}><button className="btn ghost" onClick={() => openPool(p)}>Editar</button>{p.link ? <a className="btn ghost" style={{ textDecoration: 'none', textAlign: 'center', lineHeight: '1.6' }} href={p.link} target="_blank" rel="noreferrer">Abrir dApp</a> : null}</div>{p.position_id ? <button className="btn ghost" style={{ marginTop: 8, width: '100%' }} disabled={syncing === p.id} onClick={() => syncPosition(p)}>{syncing === p.id ? 'Sincronizando…' : '🔄 Sincronizar taxas'}</button> : null}
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
              // Vigiando: monta a lista a partir das chaves vigiadas (ideias frescas OU cache) — nunca some.
              // Caso normal: usa as ideias da rede escolhida (backend já entrega só V3 concentrada).
              const shown = watchOnly
                ? watch.map(k => (ideas || []).find((it: any) => keyOf(it) === k) || watchData[k]).filter(Boolean)
                : (ideas || [])
              return (<>
              <div className="niche-h">Ranking pela <b>Nota de Yield</b> — retorno ajustado ao risco. Toque num card para os detalhes. Só pools <b>concentradas V3</b>.</div>
              {!watchOnly && <div className="netbar">
                {([['all', '🏆 Todas'], ['eth', 'Ethereum'], ['base', 'Base'], ['arbitrum', 'Arbitrum'], ['solana', 'Solana'], ['bsc', 'BSC'], ['polygon', 'Polygon']] as [string, string][]).map(([k, l]) => (
                  <button key={k} className={ideasNet === k ? 'netchip on' : 'netchip'} onClick={() => loadIdeas(k)}>{l}</button>
                ))}
              </div>}
              <button className={watchOnly ? 'netchip on' : 'netchip'} style={{ marginTop: 8 }} onClick={() => { const nv = !watchOnly; setWatchOnly(nv); if (nv) refreshWatched() }}>⭐ Vigiando{watch.length ? ` (${watch.length})` : ''}</button>
              {watchOnly && watchRefreshing && <p className="foot-note">Atualizando pools vigiadas…</p>}
              {ideasLoading && !watchOnly && <p className="foot-note">Buscando pares…</p>}
              {(watchOnly || (!ideasLoading && ideas)) && shown.map((it: any, i: number) => {
                const net = it.netApr
                const netStr = net == null ? (it.feeApr != null ? it.feeApr + '%' : '—') : (net >= 0 ? '+' : '') + net + '%'
                const netColor = net == null ? 'var(--text)' : net >= 12 ? 'var(--green)' : net > 0 ? '#F5A623' : 'var(--red)'
                const ilColor = it.ilLevel <= 1 ? 'var(--green)' : it.ilLevel === 2 ? '#7CE0A0' : it.ilLevel === 3 ? '#F5A623' : 'var(--red)'
                const gc = it.yieldGrade === 'A' ? 'var(--green)' : it.yieldGrade === 'B' ? '#7CE0A0' : it.yieldGrade === 'C' ? '#F5A623' : 'var(--red)'
                const stColor = it.verdictTone === 'buy' ? 'var(--green)' : it.verdictTone === 'sell' ? 'var(--red)' : '#F5A623'
                const medal = watchOnly ? '⭐' : i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1)
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
              {!watchRefreshing && shown.length === 0 && <p className="foot-note">{watchOnly ? (watch.length ? 'Suas pools vigiadas ainda estão carregando — puxe de novo em instantes.' : 'Você ainda não está vigiando nenhuma pool — toque na ⭐ de um card.') : (ideasLoading ? '' : 'Sem pares de qualidade nessa rede agora — tente outra rede.')}</p>}
              {shown.length > 0 && (
                <button className="addbtn" style={{ marginTop: 12 }} onClick={() => has(3) ? openCalc() : setUpgrade({ tier: 3, feature: 'Calculadora de IL' })}>🧮 Simular IL e retorno {!has(3) && '🔒'}</button>
              )}
              <p className="foot-note"><b>Nota de Yield (0–100)</b> = retorno líquido + sustentabilidade + IL + liquidez. <b>APR líquido</b> = taxa − IL. Só pools concentradas V3 (fora passivas V2 e V4). Fonte: DefiLlama. Não é recomendação — estude cada pool antes de fornecer liquidez.</p>
            </>)
            })()}
          </section>

          {/* PERPS (ONDO) */}
          <section className={`screen ${tab === 'perps' ? 'active' : ''}`}>
            {(() => {
              const openPos = perps.filter(p => p.status === 'open')
              const closedPos = perps.filter(p => p.status === 'closed')
              const sum = accountSummary(perps, perpCollateral, perpMark, perpMmr)
              const mrPct = sum.marginRatio * 100
              const mrTone = mrPct >= 80 ? 'down' : mrPct >= 50 ? 'warn' : 'up'
              const priced = openPos.some(p => (perpMkts[p.symbol]?.last || 0) > 0)
              return (<>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div className="eyebrow" style={{ margin: 0 }}>Perps · Ondo</div>
                  <a href="https://app.ondoperps.xyz/" target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--purple)', fontWeight: 700, textDecoration: 'none' }}>app.ondoperps.xyz ↗</a>
                </div>

                {/* Conta de trading (espelho da Ondo) */}
                <div className="card" style={{ marginBottom: 12 }}>
                  <div className="eyebrow" style={{ marginBottom: 10 }}>Conta de trading</div>
                  <div className="perp-acct">
                    <div className="pa-cell"><span>Equity</span><b className="num">{usd(sum.equity)}</b></div>
                    <div className="pa-cell"><span>uPnL</span><b className={`num ${sum.totalUpnl >= 0 ? 'up' : 'down'}`}>{(sum.totalUpnl >= 0 ? '+' : '−') + usd(Math.abs(sum.totalUpnl)).slice(1)}</b></div>
                    <div className="pa-cell"><span>Margem disp.</span><b className="num">{usd(Math.max(0, sum.available))}</b></div>
                    <div className="pa-cell"><span>Margin ratio</span><b className={`num ${mrTone === 'down' ? 'down' : mrTone === 'up' ? 'up' : ''}`} style={mrTone === 'warn' ? { color: '#F5A623' } : undefined}>{fmt(mrPct, 1)}%</b></div>
                  </div>
                  {openPos.length > 0 && (
                    <div className="liqbar" style={{ marginTop: 12 }} title="Proximidade da liquidação">
                      <div className="liqbar-fill" style={{ width: `${Math.min(100, Math.max(2, mrPct))}%`, background: mrTone === 'down' ? 'var(--red)' : mrTone === 'warn' ? '#F5A623' : 'linear-gradient(90deg,var(--green),#F5A623)' }} />
                    </div>
                  )}
                  <div className="kv" style={{ marginTop: 10 }}>
                    <span className="k">Colateral depositado (USDC)</span>
                    <span className="v"><a onClick={() => setPerpAcctForm(String(perpCollateral || ''))} style={{ color: 'var(--purple)', cursor: 'pointer', fontWeight: 700 }} className="num">{usd(perpCollateral)} ✎</a></span>
                  </div>
                  {mrTone === 'down' && openPos.length > 0 && <div className="rangestatus rs-out" style={{ marginTop: 10 }}>⚠ RISCO DE LIQUIDAÇÃO — margin ratio elevado</div>}
                  {mrTone === 'warn' && openPos.length > 0 && <div className="rangestatus rs-warn" style={{ marginTop: 10 }}>⚠ ATENÇÃO — margem apertada, considere reduzir alavancagem</div>}
                </div>

                <button className="btn" onClick={() => openPerpForm()}>+ Abrir posição long / short</button>

                {!priced && openPos.length > 0 && <p className="foot-note" style={{ textAlign: 'left', padding: '8px 2px 0' }}>Puxando preços ao vivo da Ondo…</p>}

                {/* Posições abertas */}
                <div style={{ marginTop: 14 }}>
                  {openPos.map(p => {
                    const m = perpMkts[p.symbol]
                    const mark = m?.last || p.entry_price
                    const mmr = perpMmr(p)
                    const val = notionalAt(p.size, mark)
                    const u = upnl(p, mark)
                    const roe = p.margin ? u / p.margin * 100 : 0
                    const maintI = notionalAt(p.size, mark) * mmr
                    const A = sum.equity - u - sum.maintMargin + maintI
                    const liq = liqPrice({ side: p.side, size: p.size, entry_price: p.entry_price, mmr }, A)
                    const dist = liq != null ? liqDistancePct(p.side, mark, liq) : null
                    const distTone = dist == null ? '' : dist < 8 ? 'down' : dist < 20 ? 'warn' : 'up'
                    const funding = m?.fundingRate ?? 0
                    return (
                      <div className="poolcard perp-card" key={p.id} style={{ marginBottom: 12 }}>
                        <div className="poolhead">
                          <div className="poolt">
                            <b>{p.symbol} <span className={`side-pill ${p.side}`}>{p.side === 'long' ? 'Long' : 'Short'} {p.leverage}x</span></b>
                            <span>{p.name}{m?.isClosed ? ' · mercado fechado' : ''}</span>
                          </div>
                          <div className="poolval">
                            <div className="num">{usd(val)}</div>
                            <div className={`num ${u >= 0 ? 'up' : 'down'}`}>{(u >= 0 ? '+' : '−') + '$' + fmt(Math.abs(u))}</div>
                          </div>
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <div className="kv"><span className="k">Tamanho</span><span className="v num">{fmt(p.size, p.size < 10 ? 4 : 2)} {p.symbol}</span></div>
                          <div className="kv"><span className="k">Entrada</span><span className="v num">{usd(p.entry_price)}</span></div>
                          <div className="kv"><span className="k">Mark {m ? <span className={`chip ${(m.chg24 || 0) >= 0 ? 'up' : 'down'}`}>{pct(m.chg24 || 0)}</span> : null}</span><span className="v num">{mark > 0 ? usd(mark) : '—'}</span></div>
                          <div className="kv"><span className="k">Est. liquidação</span><span className="v num" style={{ color: '#F5A623' }}>{liq != null && liq > 0.001 ? usd(liq) : '—'}</span></div>
                          <div className="kv"><span className="k">uPnL (ROE)</span><span className={`v num ${u >= 0 ? 'up' : 'down'}`}>{(u >= 0 ? '+' : '−') + '$' + fmt(Math.abs(u))} ({(roe >= 0 ? '+' : '') + fmt(roe, 1)}%)</span></div>
                          <div className="kv"><span className="k">Margem</span><span className="v num">{usd(p.margin)}</span></div>
                          <div className="kv"><span className="k">Funding (próx.)</span><span className={`v num ${funding > 0 ? 'down' : funding < 0 ? 'up' : ''}`}>{funding ? (funding > 0 ? '−' : '+') + fmt(Math.abs(funding) * 100, 4) + '%' : '—'}</span></div>
                          {(() => {
                            const isLong = p.side === 'long'
                            const tpHit = p.tp && ((isLong && mark >= p.tp) || (!isLong && mark <= p.tp))
                            const slHit = p.sl && ((isLong && mark <= p.sl) || (!isLong && mark >= p.sl))
                            const near = (lvl?: number | null) => lvl && mark > 0 ? Math.abs(mark - lvl) / mark * 100 : null
                            const tpNear = near(p.tp), slNear = near(p.sl)
                            return (<>
                              <div className="kv"><span className="k">🎯 Alvo / TP</span><span className="v num">{p.tp ? <>{usd(p.tp)} {tpHit ? <span className="chip up">atingido ✓</span> : tpNear != null && tpNear < 3 ? <span className="chip up">{fmt(tpNear, 1)}%</span> : null}</> : <span style={{ color: 'var(--faint)' }}>—</span>}</span></div>
                              <div className="kv"><span className="k">🛑 Stop / SL</span><span className="v num">{p.sl ? <>{usd(p.sl)} {slHit ? <span className="chip down">rompido ⚠</span> : slNear != null && slNear < 3 ? <span className="chip down">{fmt(slNear, 1)}%</span> : null}</> : <span style={{ color: 'var(--faint)' }}>—</span>}</span></div>
                            </>)
                          })()}
                        </div>
                        {dist != null && (
                          <div style={{ marginTop: 10 }}>
                            <div className="niche-h" style={{ margin: '0 2px 5px' }}>Distância até liquidação: <b className={distTone === 'down' ? 'down' : distTone === 'up' ? 'up' : ''} style={distTone === 'warn' ? { color: '#F5A623' } : undefined}>{fmt(Math.abs(dist), 1)}%</b></div>
                            <div className="liqbar"><div className="liqbar-fill" style={{ width: `${Math.min(100, Math.max(3, 100 - Math.min(100, Math.abs(dist))))}%`, background: distTone === 'down' ? 'var(--red)' : distTone === 'warn' ? '#F5A623' : 'var(--green)' }} /></div>
                          </div>
                        )}
                        <div className="grid2" style={{ marginTop: 14 }}>
                          <a className="btn ghost" style={{ textDecoration: 'none', textAlign: 'center', lineHeight: '1.4' }} href="https://app.ondoperps.xyz/" target="_blank" rel="noreferrer">Gerenciar na Ondo ↗</a>
                          <button className="btn ghost" onClick={() => setPerpClose({ id: p.id, symbol: p.symbol, side: p.side, size: p.size, entry_price: p.entry_price, leverage: p.leverage, price: mark > 0 ? String(mark) : '' })}>Encerrar</button>
                        </div>
                        <div style={{ textAlign: 'center', marginTop: 8 }}><a onClick={() => setPerpForm({ id: p.id, market: p.market, symbol: p.symbol, name: p.name, side: p.side, leverage: p.leverage, margin: String(p.margin), size: String(p.size), entry: String(p.entry_price), tp: p.tp ? String(p.tp) : '', sl: p.sl ? String(p.sl) : '', opened_at: p.opened_at, note: p.note || '' })} style={{ fontSize: 11, color: 'var(--muted)', cursor: 'pointer' }}>editar dados</a></div>
                      </div>
                    )
                  })}
                  {openPos.length === 0 && <p className="foot-note" style={{ padding: '14px 8px' }}>Nenhuma posição aberta. Toque em <b>Abrir posição</b>, execute na Ondo e registre aqui para acompanhar uPnL, liquidação e funding ao vivo.</p>}
                </div>

                {/* Histórico encerrado */}
                {closedPos.length > 0 && (
                  <div className="card section-gap">
                    <div className="eyebrow" style={{ marginBottom: 8 }}>Encerradas</div>
                    {closedPos.map(p => (
                      <div className="kv" key={p.id}>
                        <span className="k" style={{ fontSize: 12.5 }}>{p.symbol} <span className={`side-pill sm ${p.side}`}>{p.side === 'long' ? 'L' : 'S'} {p.leverage}x</span> <span style={{ color: 'var(--faint)' }}>{dBR(p.closed_at || '')}</span></span>
                        <span className={`v num ${(p.realized_pnl || 0) >= 0 ? 'up' : 'down'}`}>{((p.realized_pnl || 0) >= 0 ? '+' : '−') + '$' + fmt(Math.abs(p.realized_pnl || 0))} <a onClick={() => delPerp(p.id!)} style={{ color: 'var(--faint)', cursor: 'pointer', marginLeft: 6 }}>✕</a></span>
                      </div>
                    ))}
                    {(() => { const tot = closedPos.reduce((s, p) => s + (p.realized_pnl || 0), 0); return (
                      <div className="kv" style={{ borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 8 }}><span className="k"><b>Total realizado</b></span><span className={`v num ${tot >= 0 ? 'up' : 'down'}`}><b>{(tot >= 0 ? '+' : '−') + '$' + fmt(Math.abs(tot))}</b></span></div>
                    )})()}
                  </div>
                )}

                <p className="foot-note"><b style={{ color: 'var(--pink-bright)' }}>Perps</b> = futuros perpétuos alavancados na Ondo (ações, índices e commodities tokenizados, USD-settled, cross margin). A execução é feita na Ondo; o Tiger acompanha mark, uPnL, funding e liquidação ao vivo. Alavancagem multiplica ganho <b>e</b> perda e pode zerar a posição na liquidação. Não é recomendação — opere por sua conta e risco.</p>
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
                  <div className="flow-t"><b>{f.kind === 'in' ? 'Aporte' : 'Retirada'}</b><span>{dBR(fdate(f))} · há {d}d · {fmt(d / 365.25, 1)}a</span></div>
                  <div className={`flow-v ${f.kind === 'in' ? 'up' : 'down'}`}>{money(f.amount)}</div>
                </div>) })}
            </div>}
          </section>

          {/* METAS */}
          <section className={`screen ${tab === 'metas' ? 'active' : ''}`}>
            <div className="eyebrow">🎯 Metas de alocação</div>
            <div className="card" style={{ background: 'linear-gradient(180deg,rgba(255,46,154,.08),rgba(20,12,32,.5))', border: '1px solid rgba(255,46,154,.22)' }}>
              <div style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Como funciona?</div>
              <p className="foot-note" style={{ textAlign: 'left', padding: 0, lineHeight: 1.55 }}>
                Defina o <b style={{ color: 'var(--text)' }}>% ideal</b> de cada ativo na sua carteira. A barra mostra onde você <b>está</b> (real) e onde <b>quer chegar</b> (meta). Quando o real fica abaixo da meta, é sinal de <b style={{ color: 'var(--pink-bright)' }}>aportar</b>; acima, de <b style={{ color: 'var(--red)' }}>realizar</b> pra reequilibrar. O ideal é a soma das metas fechar em <b>100%</b>.
              </p>
            </div>
            {(() => {
              const metas = priced.filter(h => h.meta_pct > 0).sort((a, b) => (b.kind === 'cash' ? 1 : 0) - (a.kind === 'cash' ? 1 : 0) || b.meta_pct - a.meta_pct)
              const somaMetas = metas.reduce((s, h) => s + h.meta_pct, 0)
              const somaColor = Math.abs(somaMetas - 100) < 0.5 ? 'var(--green)' : somaMetas > 100 ? 'var(--red)' : '#F5A623'
              const semMeta = priced.filter(h => (h.kind === 'crypto' || h.kind === 'stock' || h.kind === 'cash') && !(h.meta_pct > 0))
              return (<>
                <div className="card section-gap">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: metas.length ? 4 : 0 }}>
                    <div className="eyebrow" style={{ margin: 0 }}>Meta vs. real</div>
                    <span className="num" style={{ fontSize: 12, color: somaColor }}>soma {fmt(somaMetas, 1)}% <span style={{ color: 'var(--faint)' }}>/ 100%</span></span>
                  </div>
                  {metas.length === 0 && <p className="foot-note" style={{ textAlign: 'left', padding: 0 }}>Nenhuma meta definida ainda. Toque em <b>+ definir meta</b> pra criar a primeira.</p>}
                  {metas.map((h, i) => {
                    const real = t.patr ? valOf(h) / t.patr * 100 : 0, denom = Math.max(h.meta_pct, real, 1), gap = real - h.meta_pct
                    const cashSurplus = h.kind === 'cash' && gap > 0.5
                    const gapColor = cashSurplus ? 'var(--green)' : (Math.abs(gap) < 0.5 ? 'var(--muted)' : (gap < 0 ? 'var(--pink)' : 'var(--red)'))
                    const gapLabel = cashSurplus ? 'disponível pra alocar ' : (gap < 0 ? 'faltam ' : 'sobra ')
                    return (<div key={h.id} style={{ padding: '12px 0', borderTop: i > 0 ? '1px solid var(--line)' : undefined }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 13.5 }}>{h.symbol} <span style={{ color: 'var(--faint)', fontWeight: 400, fontSize: 11 }}>{h.name}</span></span>
                        <span className="num" style={{ fontSize: 12, color: gapColor }}>{gapLabel}{fmt(Math.abs(gap), 1)}%</span>
                      </div>
                      {(() => {
                        if (h.kind !== 'crypto' || !h.cg_id) return null
                        const sg = signals[h.cg_id]
                        const below = gap < -0.5   // real abaixo da meta = falta comprar
                        if (!sg && !sigTried) return <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--faint)' }}>analisando momento…</div>
                        if (!sg) return null
                        const tone = sg.verdict.tone   // buy | sell | neutral
                        const c = tone === 'buy' ? 'var(--green)' : tone === 'sell' ? 'var(--red)' : '#F5A623'
                        const label = tone === 'buy' ? '▲ MOMENTO DE APORTAR' : tone === 'sell' ? '▼ ESPERAR / REALIZAR' : '● CAUTELA'
                        const dcaHint = below && tone !== 'sell' ? ' · abaixo da meta, bom p/ DCA' : (!below && tone === 'buy' ? ' · já na meta' : '')
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 7 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, fontFamily: "'JetBrains Mono'", color: c, background: `${c}1a`, border: `1px solid ${c}55`, padding: '3px 9px', borderRadius: 999 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: c, boxShadow: `0 0 7px ${c}` }} />{label}</span>
                            <span style={{ fontSize: 10, color: 'var(--faint)' }}>{dcaHint}</span>
                          </div>
                        )
                      })()}
                      <div className="metabar" style={{ marginTop: 8 }}>
                        <div className="track"><div className="fill" style={{ width: `${Math.min(real / denom * 100, 100)}%`, ...(cashSurplus ? { background: 'linear-gradient(90deg,#12b981,var(--green))', boxShadow: '0 0 12px rgba(43,255,154,.5)' } : {}) }} /><div className="goal" style={{ left: `${Math.min(h.meta_pct / denom * 100, 100)}%` }} /></div>
                        <div className="lbls"><span>real {fmt(real, 1)}%</span><span>meta {fmt(h.meta_pct, 1)}%</span></div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <span className="txtag" style={{ cursor: 'pointer', color: 'var(--purple)' }} onClick={() => openMeta(h)}>editar ✎</span>
                        <span className="txtag" style={{ cursor: 'pointer', color: 'var(--red)' }} onClick={() => removeMeta(h)}>excluir ✕</span>
                      </div>
                    </div>)
                  })}
                  <button className="addbtn" onClick={() => openMeta()}>+ definir meta</button>
                </div>
                {semMeta.length > 0 && <p className="foot-note" style={{ textAlign: 'left' }}>Sem meta: {semMeta.map(h => h.symbol).join(', ')} — toque em <b>+ definir meta</b> pra incluir.</p>}
              </>)
            })()}
          </section>

          {/* RADAR */}
          <section className={`screen ${tab === 'radar' ? 'active' : ''}`}>
            <div className="eyebrow">Radar de mercado · cardápio</div>
            <div className="segbar">
              {([['top', 'Top'], ['alts', 'Altcoins'], ['memes', 'Memes']] as [string, string][]).map(([k, l]) => (
                <button key={k} className={radarSeg === k ? 'seg on' : 'seg'} onClick={() => setRadarSeg(k as any)}>{l}</button>
              ))}
            </div>
            {radarLoading && <div>{[0, 1, 2, 3, 4].map(i => <div key={i} className="skel skel-row" style={{ height: 62, borderRadius: 14, marginBottom: 9 }} />)}</div>}
            {!radarLoading && radar && (radar[radarSeg] || []).map((c: any, i: number) => (
              <div className="qrow" key={i}>
                <div className="qsym">{c.image ? <img src={c.image} alt="" /> : c.symbol.slice(0, 3)}</div>
                <div className="qname"><b>{c.name}</b><span>{c.symbol} · vol {abbr(c.vol)}</span></div>
                <div className="qprice"><div className="p">{usd(c.price)}</div><div className="qchg"><span style={{ color: c.ch24 >= 0 ? 'var(--green)' : 'var(--red)' }}>{pct(c.ch24 || 0)} 24h</span>{c.ch7d != null && <span style={{ color: c.ch7d >= 0 ? 'var(--green)' : 'var(--red)', marginLeft: 8 }}>{pct(c.ch7d)} 7d</span>}</div></div>
              </div>
            ))}
            {!radarLoading && radar && (!radar[radarSeg] || radar[radarSeg].length === 0) && <p className="foot-note">Sem dados agora — tente novamente em instantes.</p>}
            <p className="foot-note">Dados de mercado (CoinGecko). Cardápio para pesquisa — não é recomendação. As pools ficam na aba <b>Pools</b>. Estude cada ativo antes de investir.</p>
          </section>

          {/* PULSO — inteligência de mercado */}
          <section className={`screen ${tab === 'pulso' ? 'active' : ''}`}>
            <div className="eyebrow">Pulso do mercado</div>
            {pulseLoading && !pulse && <div>{[0, 1, 2].map(i => <div key={i} className="skel skel-row" style={{ height: 90, borderRadius: 16, marginBottom: 12 }} />)}</div>}
            {pulse && (<>
              {/* TERMÔMETRO DE CICLO */}
              {pulse.score != null && (() => {
                const s = pulse.score
                const tone = pulse.regime === 'acumular' ? 'var(--green)' : pulse.regime === 'distribuir' ? 'var(--red)' : '#F5A623'
                return (
                  <div className="card">
                    <div className="eyebrow" style={{ marginBottom: 10 }}>Termômetro de ciclo</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                      <b style={{ fontFamily: 'Sora', fontSize: 26, color: tone, textTransform: 'uppercase', letterSpacing: 1 }}>{pulse.regime}</b>
                      <span className="num" style={{ fontSize: 22, color: tone }}>{s}<span style={{ fontSize: 12, color: 'var(--muted)' }}>/100</span></span>
                    </div>
                    <div className="cyclebar"><div className="cyclebar-mark" style={{ left: `${s}%` }} /></div>
                    <div className="cyclebar-lbls"><span>Acumular</span><span>Neutro</span><span>Distribuir</span></div>
                    <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 10 }}>{pulse.regimeLabel}</p>
                    <div className="pooltraction" style={{ marginTop: 12 }}>
                      <div className="pt-cell"><span>Medo & Ganância</span><b style={{ color: tone }}>{pulse.fng ?? '—'}{pulse.fngLabel ? '' : ''}</b></div>
                      <div className="pt-cell"><span>Amplitude 24h</span><b className={pulse.breadth != null && pulse.breadth >= 50 ? 'up' : 'down'}>{pulse.breadth != null ? pulse.breadth + '% ↑' : '—'}</b></div>
                      <div className="pt-cell"><span>Mercado 24h</span><b className={pulse.totalChg24 != null && pulse.totalChg24 >= 0 ? 'up' : 'down'}>{pulse.totalChg24 != null ? pct(pulse.totalChg24) : '—'}</b></div>
                    </div>
                    <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 8, fontSize: 10 }}>Leitura <b>contrária</b>: medo extremo costuma marcar fundos (acumular), ganância extrema marca topos (distribuir). É sentimento, não garantia — combine com sua análise.</p>
                  </div>
                )
              })()}

              {/* FLUXO DE CAPITAL */}
              <div className="card section-gap">
                <div className="eyebrow" style={{ marginBottom: 10 }}>Fluxo de capital</div>
                <div className={`rangestatus ${pulse.domDir === 'btc' ? 'rs-out' : pulse.domDir === 'alts' ? 'rs-in' : 'rs-warn'}`}>
                  {pulse.domDir === 'btc' ? '🛡 Capital consolidando no BTC — modo defensivo' : pulse.domDir === 'alts' ? '🚀 Capital rotacionando para altcoins — apetite a risco' : '⚖ Capital equilibrado entre BTC e alts'}
                </div>
                {pulse.btcDom != null && <div className="kv"><span className="k">Dominância do BTC</span><span className="v num">{fmt(pulse.btcDom, 1)}%</span></div>}
                {(pulse.majors || []).map((m: any) => (
                  <div className="kv" key={m.symbol}><span className="k">{m.symbol} <span style={{ color: 'var(--muted)' }}>24h</span></span><span className={`v num ${m.ch24 >= 0 ? 'up' : 'down'}`}>{pct(m.ch24)}{m.ch7d != null && <span style={{ color: 'var(--muted)', marginLeft: 8, fontSize: 11 }}>{pct(m.ch7d)} 7d</span>}</span></div>
                ))}
                {pulse.narratives?.up?.length > 0 && (<>
                  <div className="niche-h" style={{ margin: '14px 2px 8px' }}>Setores atraindo capital (24h)</div>
                  {pulse.narratives.up.map((n: any, i: number) => (
                    <div className="kv" key={'u' + i}><span className="k" style={{ fontSize: 12.5 }}>▲ {n.name}</span><span className="v num up">{pct(n.chg24)}</span></div>
                  ))}
                  {pulse.narratives.down?.slice(0, 2).map((n: any, i: number) => (
                    <div className="kv" key={'d' + i}><span className="k" style={{ fontSize: 12.5 }}>▼ {n.name}</span><span className="v num down">{pct(n.chg24)}</span></div>
                  ))}
                </>)}
              </div>

              {/* HYPE AGORA */}
              <div className="card section-gap">
                <div className="eyebrow" style={{ marginBottom: 10 }}>🔥 Hype agora</div>
                {(pulse.trending || []).length > 0 && (<>
                  <div className="niche-h" style={{ margin: '0 2px 8px' }}>Em alta nas buscas</div>
                  <div className="hype-tags">
                    {pulse.trending.map((c: any, i: number) => (
                      <span className="hype-tag" key={i}>{c.symbol}{c.ch24 != null && <b className={c.ch24 >= 0 ? 'up' : 'down'} style={{ marginLeft: 5 }}>{pct(c.ch24)}</b>}</span>
                    ))}
                  </div>
                </>)}
                {(pulse.hype || []).length > 0 && (<>
                  <div className="niche-h" style={{ margin: '16px 2px 8px' }}>Maiores altas 24h (com liquidez)</div>
                  {pulse.hype.map((c: any, i: number) => (
                    <div className="kv" key={i}><span className="k" style={{ fontSize: 12.5 }}><b>{c.symbol}</b> <span style={{ color: 'var(--muted)' }}>{c.name}</span></span><span className="v"><span className="num up">{pct(c.ch24)}</span>{c.ch7d != null && <span className="num" style={{ color: 'var(--muted)', marginLeft: 8, fontSize: 11 }}>{pct(c.ch7d)} 7d</span>}</span></div>
                  ))}
                </>)}
              </div>

              <p className="foot-note">Sentimento (alternative.me) + mercado, dominância e narrativas (CoinGecko). Fotografia do momento, não recomendação — hype passa rápido e vira armadilha; use como contexto, não como gatilho de compra.</p>
            </>)}
            {!pulseLoading && !pulse && <p className="foot-note">Não consegui puxar os dados agora — tente reabrir em instantes.</p>}
          </section>

          <section className={`screen ${tab === 'lab' ? 'active' : ''}`}>
            {tab === 'lab' && <BtcLab />}
          </section>

          <section className={`screen ${tab === 'tiger100' ? 'active' : ''}`}>
            <div className="eyebrow">📊 Tiger 100 · índice do mercado cripto</div>
            <div className="card" style={{ background: 'linear-gradient(180deg,rgba(124,92,255,.10),rgba(20,12,32,.5))', border: '1px solid rgba(124,92,255,.25)' }}>
              <div style={{ fontFamily: "'Sora'", fontWeight: 700, fontSize: 14, marginBottom: 6 }}>O que é o Tiger 100?</div>
              <p className="foot-note" style={{ textAlign: 'left', padding: 0, lineHeight: 1.55 }}>
                É um <b style={{ color: 'var(--text)' }}>índice do mercado cripto</b> — como o Ibovespa é pra bolsa. Junta as <b>100 maiores moedas por valor de mercado</b> numa única linha (base 1.000), ponderadas por capitalização. Não tem nada a ver com a sua carteira: mede o mercado como um todo. Quando sobe, o conjunto das grandes cripto está subindo; quando cai, está caindo.
              </p>
              <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 8, lineHeight: 1.55 }}>
                <b style={{ color: 'var(--text)' }}>Como usar:</b> é o seu <b>referencial de mercado</b>. Serve pra ler o humor geral (alta, baixa, lateral) num número só e — se quiser — comparar por fora com o seu próprio resultado (aba <b>Aportes</b>) pra saber se você bateu ou ficou atrás do mercado no período.
              </p>
            </div>
            {t100Loading && <><div className="skel skel-tall" /><div className="skel skel-block" /></>}
            {t100 && t100.count && (() => {
              const x = t100
              const upPct = x.count ? x.up / x.count * 100 : 50
              return (<>
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: .5 }}>Nível do índice</div>
                      <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 34, lineHeight: 1 }}>{x.level != null ? x.level.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: "'Sora'", fontWeight: 800, fontSize: 20, color: (x.ret24 || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>{x.ret24 != null ? pct(x.ret24) : '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>24h · 7d {x.ret7d != null ? pct(x.ret7d) : '—'}</div>
                    </div>
                  </div>
                  {x.history && x.history.length >= 2 && (() => {
                    const pts = x.history.map((h: any) => Number(h.level))
                    const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1
                    const W = 300, H = 46
                    const d = pts.map((v: number, i: number) => `${(i / (pts.length - 1)) * W},${H - ((v - min) / span) * (H - 4) - 2}`).join(' ')
                    return <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 46, marginTop: 12 }}><polyline points={d} fill="none" stroke={pts[pts.length - 1] >= pts[0] ? 'var(--green)' : 'var(--red)'} strokeWidth="2" strokeLinejoin="round" /></svg>
                  })()}
                  {(!x.history || x.history.length < 2) && <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 10 }}>O gráfico começa a se formar a partir de hoje (base 1.000) — cada dia grava um ponto.</p>}
                </div>

                {/* MONITOR TIGER · painel on-chain */}
                <MonitorTiger />

                <div className="card section-gap">
                  <div className="eyebrow" style={{ marginBottom: 8 }}>Termômetro do mercado (24h)</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}><span style={{ color: 'var(--green)' }}>▲ {x.up} em alta</span><span style={{ color: 'var(--red)' }}>{x.down} em baixa ▼</span></div>
                  <div style={{ height: 9, borderRadius: 999, background: 'var(--red)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${upPct}%`, background: 'var(--green)' }} /></div>
                  <div className="trio" style={{ marginTop: 14 }}>
                    <div className="stat"><div className="k">Market cap (100)</div><div className="v num">{abbr(x.totalMcap)}</div></div>
                    <div className="stat"><div className="k">Dominância BTC</div><div className="v num">{x.btcDom != null ? fmt(x.btcDom, 1) + '%' : '—'}</div></div>
                    <div className="stat"><div className="k">Moedas</div><div className="v num">{x.count}</div></div>
                  </div>
                </div>

                <div className="grid2" style={{ marginTop: 16 }}>
                  <div className="card" style={{ margin: 0 }}>
                    <div className="eyebrow" style={{ marginBottom: 8 }}>▲ Maiores altas</div>
                    {x.gainers.map((c: any) => (<div className="kv" key={c.id}><span className="k" style={{ fontSize: 13 }}>{c.symbol}</span><span className="v num" style={{ color: 'var(--green)' }}>{pct(c.ch24 || 0)}</span></div>))}
                  </div>
                  <div className="card" style={{ margin: 0 }}>
                    <div className="eyebrow" style={{ marginBottom: 8 }}>▼ Maiores baixas</div>
                    {x.losers.map((c: any) => (<div className="kv" key={c.id}><span className="k" style={{ fontSize: 13 }}>{c.symbol}</span><span className="v num" style={{ color: 'var(--red)' }}>{pct(c.ch24 || 0)}</span></div>))}
                  </div>
                </div>

                <div className="card section-gap">
                  <div className="eyebrow" style={{ marginBottom: 8 }}>Composição · maiores pesos</div>
                  {x.composition.map((c: any) => (
                    <div key={c.id} style={{ marginBottom: 9 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 3 }}>
                        <span><b>{c.symbol}</b> <span style={{ color: 'var(--muted)' }}>{c.name}</span></span>
                        <span className="num" style={{ color: (c.ch24 || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(c.weight, 1)}%</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 999, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.min(100, c.weight / x.composition[0].weight * 100)}%`, background: 'linear-gradient(90deg,#7C5CFF,#2BFFC6)' }} /></div>
                    </div>
                  ))}
                </div>
                <p className="foot-note"><b>Tiger 100</b> = 100 maiores por market cap, ponderadas por capitalização com <b>teto de 15%</b> (pra BTC/ETH não dominarem) e <b>tilt de ±15%</b> pela performance de 7 dias. Nível base 1.000. Fonte: CoinGecko. O gráfico usa o histórico real registrado diariamente; o trecho anterior ao início do registro é uma reconstrução aproximada (12 maiores, com o mesmo teto de 15%). Não é recomendação.</p>
              </>)
            })()}
            {t100 && !t100.count && !t100Loading && <p className="foot-note">Índice indisponível agora — tente novamente em instantes.</p>}
          </section>

          <p className="foot-note"><b style={{color:'var(--pink-bright)',fontFamily:'Sora'}}>Tiger Invest</b> · Não é recomendação de investimento. Todo e qualquer investimento é por conta e risco do usuário — estude os ativos antes de aplicar seu capital.</p>
        </div>

        <nav className="nav">
          {([
            ['inicio', 'Início', <path key="a" d="M3 11l9-8 9 8M5 10v10h14V10" />],
            ['carteira', 'Carteira', <><rect key="a" x="3" y="6" width="18" height="13" rx="2" /><path key="b" d="M16 12h3" /></>],
            ['cotacao', 'Cotação', <path key="a" d="M4 18l5-6 4 3 6-8M4 18h16" />],
            ['radar', 'Radar', <><circle key="a" cx="12" cy="12" r="9" /><circle key="b" cx="12" cy="12" r="4.5" /><path key="c" d="M12 3v3M12 18v3M3 12h3M18 12h3" /></>],
            ['pulso', 'Pulso', <><path key="a" d="M3 12h4l2-6 4 14 2-8h6" /></>],
            ['lab', 'BTC Lab', <><path key="a" d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3" /></>],
            ['tiger100', 'T-100', <><path key="a" d="M4 19V5M4 19h16M8 16l4-5 3 3 5-7" /></>],
            ['pools', 'Pools', <path key="a" d="M12 3s6 6 6 10a6 6 0 01-12 0c0-4 6-10 6-10z" />],
            ['perps', 'Perps', <><path key="a" d="M3 17l5-5 3 3 4-6 3 4" /><path key="b" d="M3 21h18" /><path key="c" d="M14 7h4v4" /></>],
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

        {/* DEFINIR / EDITAR META */}
        {metaForm && (() => {
          const opts = priced.filter(h => (h.kind === 'crypto' || h.kind === 'stock' || h.kind === 'cash'))
          const cur = opts.find(h => h.id === metaForm.id)
          const realPct = cur && t.patr ? valOf(cur) / t.patr * 100 : null
          const chosen = metaForm.symbol && (metaForm.id || metaForm.cg_id)
          return (
          <div className="modal" onClick={e => { if (e.target === e.currentTarget) setMetaForm(null) }}>
            <div className="sheet"><div className="grabber" /><div className="sheet-scroll">
              <h3>{metaForm.isNew ? '🎯 Definir meta' : `🎯 Meta de ${metaForm.symbol}`}</h3>
              <p className="foot-note" style={{ marginTop: 4 }}>Defina o percentual ideal deste ativo na sua carteira. A soma de todas as metas idealmente fecha em 100%.</p>
              {metaForm.isNew && (<>
                <div className="field" style={{ marginTop: 12 }}><label>Buscar ativo (qualquer cripto, mesmo sem ter)</label>
                  <input value={metaCoinQuery} onChange={e => setMetaCoinQuery(e.target.value)} placeholder="Digite o nome ou sigla: Pepe, Solana, BONK…" />
                </div>
                {metaCoinSearching && <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 4 }}>Buscando…</p>}
                {metaCoinResults && metaCoinResults.length > 0 && (
                  <div className="card" style={{ marginTop: 8, padding: 6 }}>
                    {metaCoinResults.map((c: any) => (
                      <div key={c.id} onClick={() => pickMetaCoin(c)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px', cursor: 'pointer', borderRadius: 8 }}>
                        <div className="qsym" style={{ width: 28, height: 28, background: '#1a1226' }}>{c.image ? <img src={c.image} alt="" /> : (c.symbol || '').slice(0, 3)}</div>
                        <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 13 }}>{c.name}</b> <span style={{ color: 'var(--muted)', fontSize: 11 }}>{(c.symbol || '').toUpperCase()}</span></div>
                        {c.price != null && <span className="num" style={{ fontSize: 11, color: 'var(--muted)' }}>{usd(c.price)}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {metaCoinResults && metaCoinResults.length === 0 && !metaCoinSearching && <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 4 }}>Nenhuma moeda encontrada — tente outro nome.</p>}
                <div className="niche-h" style={{ margin: '14px 2px 6px' }}>ou escolha um ativo que você já tem</div>
                <div className="field"><label>Ativo da carteira</label>
                  <select value={metaForm.id} onChange={e => { const h = opts.find(x => x.id === e.target.value); setMetaForm({ ...metaForm, id: e.target.value, cg_id: '', symbol: h?.symbol || '', name: h?.name || '', meta_pct: h && h.meta_pct > 0 ? String(h.meta_pct).replace('.', ',') : metaForm.meta_pct }) }}>
                    <option value="">— escolha —</option>
                    {opts.map(h => <option key={h.id} value={h.id}>{h.symbol} · {h.name}{h.meta_pct > 0 ? ` (meta ${fmt(h.meta_pct, 1)}%)` : ''}</option>)}
                  </select>
                </div>
              </>)}
              {chosen && (
                <div className="modal-preview" style={{ marginTop: 12 }}><span>Ativo</span><b className="num">{metaForm.symbol}{metaForm.target ? ' · novo (saldo 0)' : ''}</b></div>
              )}
              <div className="field" style={{ marginTop: 12 }}><label>Meta (% da carteira)</label><input inputMode="decimal" value={metaForm.meta_pct} onChange={e => setMetaForm({ ...metaForm, meta_pct: e.target.value })} placeholder="ex: 25" /></div>
              {realPct != null && <div className="modal-preview"><span>Hoje você tem</span><b className="num">{fmt(realPct, 1)}%{num(metaForm.meta_pct) > 0 ? ` · meta ${fmt(num(metaForm.meta_pct), 1)}%` : ''}</b></div>}
              <div className="grid2" style={{ marginTop: 16 }}><button className="btn ghost" onClick={() => setMetaForm(null)}>Cancelar</button><button className="btn" onClick={saveMeta}>Salvar meta</button></div>
            </div></div>
          </div>
          )
        })()}

        {/* UPGRADE (feature bloqueada por plano) */}
        {toast && <div className={`toast toast-${toast.type}`} onClick={() => setToast(null)}>{toast.msg}</div>}
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
          // FIFO: vendas consomem as compras mais antigas primeiro → quanto resta de cada compra
          const fifoRemaining: Record<string, number> = {}
          {
            const buysAsc = my.filter(x => (x.move_kind || 'buy') === 'buy').slice().sort((a, b) => (a.buy_date || '').localeCompare(b.buy_date || ''))
            let sellQty = my.filter(x => x.move_kind === 'sell').reduce((s, x) => s + Math.abs(x.qty), 0)
            for (const b of buysAsc) { const consume = Math.min(b.qty, sellQty); fifoRemaining[b.id || ''] = b.qty - consume; sellQty -= consume }
          }
          const v = valOf(h), pl = v - h.invested, plp = h.invested ? pl / h.invested * 100 : 0
          const custoMedio = h.qty ? h.invested / h.qty : 0, pctInv = t.totalInv ? h.invested / t.totalInv * 100 : 0
          // ---- CAPITAL RECUPERADO (proteção): dinheiro que já voltou ao caixa via vendas ----
          // Real, caixa contra caixa. avgCost = custo médio só das compras (igual ao recompute()).
          const _buys = my.filter(x => (x.move_kind || 'buy') === 'buy')
          const _buyQty = _buys.reduce((s, x) => s + x.qty, 0)
          const _avgCost = _buyQty ? _buys.reduce((s, x) => s + x.qty * x.buy_price, 0) / _buyQty : 0
          const aporteTotal = _avgCost * _buyQty                                  // tudo que você pôs no ativo (US$)
          const sells = my.filter(x => x.move_kind === 'sell')
          const recebidoBruto = sells.reduce((s, x) => s + Math.abs(x.qty) * x.buy_price, 0)
          const recebidoLiq = recebidoBruto * (1 - sellFeePct / 100)            // desconta custo de vender
          const recuperado = Math.min(recebidoLiq, aporteTotal)                   // não passa de 100% do aporte
          const recuperadoPct = aporteTotal > 0 ? recuperado / aporteTotal * 100 : 0
          const faltaRecuperar = Math.max(0, aporteTotal - recebidoLiq)
          const lucroRealizado = sells.reduce((s, x) => s + Math.abs(x.qty) * (x.buy_price - _avgCost), 0) * (1 - sellFeePct / 100)
          const jaProtegido = faltaRecuperar <= 1e-6 && aporteTotal > 0
          // quanto vender AGORA (ao preço vivo) pra zerar o que falta recuperar, já contando o fee da venda:
          const precoVivo = h.price || 0
          const qtyRecuperar = (precoVivo > 0 && !jaProtegido) ? Math.min(h.qty, faltaRecuperar / (precoVivo * (1 - sellFeePct / 100))) : 0
          const L = live[h.cg_id], sg = signals[h.cg_id]
          const periodDays = my.length ? daysSince(my.map(x => x.buy_date).sort()[0]) : 0
          // Retorno REAL por janela. Padrao profissional (GIPS/CFA): periodo menor que a janela
          // NAO e extrapolado/anualizado (isso geraria numero ficticio). Entao 30d/12m so aparecem
          // depois que voce segura a posicao aquele tempo; antes disso ficam "—".
          const dayPct = L?.ch24 ?? null                              // 24h: valido sempre (a qtd nao muda em 1 dia)
          const dayUsd = dayPct != null ? v * dayPct / 100 : null
          const m30Pct = periodDays >= 30 ? (L?.ch30 ?? null) : null   // 30 dias: so se ja segurou >= 30 dias
          const y1Pct = periodDays >= 365 ? (L?.ch1y ?? null) : null   // 12 meses: so se ja segurou >= 1 ano
          const usdS = (val: number | null) => val == null ? '—' : (val >= 0 ? '+' : '−') + usd(Math.abs(val))
          return (
            <div className="modal" onClick={e => { if (e.target === e.currentTarget) setDetail(null) }}>
              <div className="sheet"><div className="grabber" />
                <div className="sheet-scroll">
                  <h3><span className="sym" style={{ width: 32, height: 32, background: `linear-gradient(145deg,${h.color},${h.color}88)` }}>{h.symbol.slice(0, 4)}</span>{h.name}<button className="mini-add" style={{ marginLeft: 'auto' }} onClick={() => openAssetEdit(h)}>✎ editar</button><span style={{ marginLeft: 8 }} className={`pill ${pl >= 0 ? 'up' : 'down'}`}>{pct(plp)}</span></h3>

                  {h.kind === 'crypto' && h.cg_id && !L?.usd && (
                    <div className="card" style={{ marginTop: 10, background: 'rgba(255,90,90,.10)', border: '1px solid rgba(255,90,90,.35)' }}>
                      <p className="foot-note" style={{ textAlign: 'left', padding: 0, color: '#FF8A8A' }}>⚠ Preço ao vivo não encontrado para o ID CoinGecko <b>"{h.cg_id}"</b>. Confira o ID em <b>✎ editar</b> — sem um ID válido, o valor deste ativo fica errado.</p>
                    </div>
                  )}
                  {h.kind === 'crypto' && L?.usd && custoMedio > 0 && Math.abs(L.usd - custoMedio) / custoMedio > 0.6 && (
                    <div className="card" style={{ marginTop: 10, background: 'rgba(255,90,90,.10)', border: '1px solid rgba(255,90,90,.35)' }}>
                      <p className="foot-note" style={{ textAlign: 'left', padding: 0, color: '#FF8A8A' }}>⚠ Preço ao vivo (<b>{usd(L.usd)}</b>) muito distante do seu custo médio (<b>{usd(custoMedio)}</b>). Quase sempre é <b>ID CoinGecko errado</b> (moeda trocada) ou <b>preço/quantidade</b> digitados errado. Confira o ID em <b>✎ editar</b>, ou corrija a compra no <b>✎ editar</b> do movimento abaixo.</p>
                    </div>
                  )}

                  {has(2) ? (<>
                  {h.kind === 'crypto' && emissionFor(h.symbol) != null && (() => {
                    // LUCRO REAL descontando a EMISSÃO DO TOKEN (diluição da rede).
                    const emi = emissionFor(h.symbol)!
                    const da = dilutionAdjusted(h.invested, v, periodDays, emi)
                    const tone = emissionTone(emi)
                    const emiColor = tone === 'good' ? 'var(--green)' : tone === 'ok' ? '#9EE7C5' : tone === 'warn' ? '#F5A623' : 'var(--red)'
                    const emiLabel = fmt(Math.abs(emi), emi === Math.floor(emi) ? 0 : 1) + '%' + (emi < 0 ? ' burn' : '/ano')
                    return (
                      <div className="card" style={{ marginTop: 12 }}>
                        <div className="eyebrow" style={{ marginBottom: 8 }}>Lucro real · descontando a emissão do token</div>
                        <div className="kv"><span className="k">Inflação do ativo (emissão)</span><span className="v num" style={{ color: emiColor }}>{emi < 0 ? '−' : ''}{emiLabel}</span></div>
                        <div className="kv"><span className="k">Lucro nominal</span><span className={`v num ${da.lucroNominal >= 0 ? 'up' : 'down'}`}>{(da.lucroNominal >= 0 ? '+' : '−') + usd(Math.abs(da.lucroNominal)).slice(1)} ({(da.nominalPct >= 0 ? '+' : '') + fmt(da.nominalPct, 1)}%)</span></div>
                        {periodDays > 0 && <div className="kv"><span className="k">Diluição no período ({fmt(da.years, 1)} ano{da.years >= 2 ? 's' : ''})</span><span className="v num" style={{ color: da.dilutionPct > 0 ? '#F5A623' : da.dilutionPct < 0 ? 'var(--green)' : 'var(--muted)' }}>{da.dilutionPct >= 0 ? '+' : ''}{fmt(da.dilutionPct, 1)}%</span></div>}
                        <div className="kv" style={{ borderTop: '1px solid var(--line)', marginTop: 6, paddingTop: 8 }}><span className="k"><b>Lucro real (acima da diluição)</b></span><span className={`v num ${da.lucroReal >= 0 ? 'up' : 'down'}`}><b>{(da.lucroReal >= 0 ? '+' : '−') + usd(Math.abs(da.lucroReal)).slice(1)} ({(da.realPct >= 0 ? '+' : '') + fmt(da.realPct, 1)}%)</b></span></div>
                        <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 8 }}>
                          {periodDays <= 0
                            ? <>Sem histórico de tempo de posse ainda — a diluição aparece conforme você segura o ativo.</>
                            : emi < 0
                              ? <>Token <b style={{ color: 'var(--green)' }}>deflacionário</b>: a oferta encolhe, então seu ganho real é <b>maior</b> que o nominal.</>
                              : da.realPct >= 0
                                ? <>Seu ganho <b>supera</b> a emissão do token — é valorização genuína, não só a moeda inflando.</>
                                : <>Cuidado: o preço <b style={{ color: 'var(--red)' }}>não superou</b> a própria emissão. Parte (ou tudo) do "lucro" foi diluído por tokens novos.</>}
                        </p>
                      </div>
                    )
                  })()}
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
                    <div className="dcell"><div className="k">Custo total</div><div className="v">{usd(h.invested)}</div></div>
                    <div className="dcell"><div className="k">Custo médio</div><div className="v">{usd(custoMedio)}</div></div>
                    <div className="dcell"><div className="k">Preço atual</div><div className="v">{usd(h.price)}</div></div>
                    <div className="dcell"><div className="k">Qtd. total</div><div className="v">{fmt(h.qty, h.qty < 1 ? 6 : 3)}</div></div>
                    <div className="dcell"><div className="k">% investimento</div><div className="v">{fmt(pctInv, 1)}%</div></div>
                    <div className="dcell"><div className="k">Resultado</div><div className="v" style={{ color: chColor(pl) }}>{pct(plp)} · {usdS(pl)}</div></div>
                    <div className="dcell"><div className="k">Hoje (24h)</div><div className="v" style={{ color: chColor(dayPct) }}>{dayPct == null ? '—' : pct(dayPct) + ' · ' + usdS(dayUsd)}</div></div>
                    <div className="dcell"><div className="k">30 dias</div><div className="v" style={{ color: chColor(m30Pct) }}>{chTxt(m30Pct)}</div></div>
                    <div className="dcell"><div className="k">12 meses</div><div className="v" style={{ color: chColor(y1Pct) }}>{chTxt(y1Pct)}</div></div>
                    <div className="dcell"><div className="k">Em carteira</div><div className="v">{periodDays ? periodDays + (periodDays === 1 ? ' dia' : ' dias') : '—'}</div></div>
                    <div className="dcell"><div className="k">Rede</div><div className="v" style={{ fontSize: 12 }}>{agg(my.map(x => x.rede))}</div></div>
                    <div className="dcell"><div className="k">Corretora</div><div className="v" style={{ fontSize: 12 }}>{agg(my.map(x => x.corretora))}</div></div>
                  </div>
                  <p className="foot-note" style={{ marginTop: 8 }}>
                    <b>Resultado</b> é o seu ganho/perda real desde a compra. <b>Hoje / 30 dias / 12 meses</b> é o retorno real da posição em cada janela — só aparecem depois que você segura o ativo por esse tempo ({periodDays} {periodDays === 1 ? 'dia' : 'dias'} até agora). Projetar um período curto para "mês" ou "ano" geraria número fictício, então o app espera a janela completar.
                  </p>
                  {h.kind === 'crypto' && aporteTotal > 0 && (
                    <div className="card" style={{ marginTop: 14, border: jaProtegido ? '1px solid rgba(74,222,128,.45)' : '1px solid var(--line)', background: jaProtegido ? 'rgba(74,222,128,.08)' : undefined }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                        <div className="eyebrow" style={{ margin: 0 }}>Capital recuperado</div>
                        <b className="num" style={{ color: jaProtegido ? 'var(--green)' : 'var(--text)' }}>{fmt(recuperadoPct, 0)}%</b>
                      </div>
                      <div style={{ height: 8, borderRadius: 6, background: 'rgba(255,255,255,.08)', overflow: 'hidden', marginBottom: 8 }}>
                        <div style={{ width: `${Math.min(100, recuperadoPct)}%`, height: '100%', background: jaProtegido ? 'var(--green)' : 'linear-gradient(90deg,var(--purple),#f0abfc)', transition: 'width .3s' }} />
                      </div>
                      {jaProtegido
                        ? <p className="foot-note" style={{ textAlign: 'left', padding: 0, color: 'var(--green)' }}><b>Capital 100% recuperado.</b> Você já tirou de volta os {usd(aporteTotal)} que pôs. O que resta no ativo ({usd(v)}) é lucro sobre risco zero.</p>
                        : <p className="foot-note" style={{ textAlign: 'left', padding: 0 }}>Já voltou ao caixa <b>{usd(recuperado)}</b> dos <b>{usd(aporteTotal)}</b> aportados. Faltam <b>{usd(faltaRecuperar)}</b> pra ficar de graça na posição.</p>}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                        <span className="txtag">realizado <b style={{ color: lucroRealizado >= 0 ? 'var(--green)' : 'var(--red)' }}>{(lucroRealizado >= 0 ? '+' : '−') + usd(Math.abs(lucroRealizado)).slice(1)}</b></span>
                        <span className="txtag">não realizado <b style={{ color: pl >= 0 ? 'var(--green)' : 'var(--red)' }}>{(pl >= 0 ? '+' : '−') + usd(Math.abs(pl)).slice(1)}</b></span>
                        <span className="txtag">fee venda <b>{fmt(sellFeePct, 2)}%</b> <span style={{ cursor: 'pointer', color: 'var(--purple)' }} onClick={() => { const s = prompt('Custo de vender (fee + spread) em %. Ex.: 0,1', String(sellFeePct).replace('.', ',')); if (s != null) { const f = parseFloat(s.replace(',', '.')); if (!isNaN(f) && f >= 0 && f < 10) { setSellFeePct(f); try { localStorage.setItem('tiger_sell_fee', String(f)) } catch { } } } }}>✎</span></span>
                      </div>
                      {!jaProtegido && qtyRecuperar > 0 && (
                        <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={() => setMoveForm({ symbol: h.symbol, name: h.name, cg_id: h.cg_id, color: h.color, dir: 'sell', qty: fmt(qtyRecuperar, qtyRecuperar < 1 ? 6 : 3).replace('.', ','), price: String(precoVivo), note: 'recuperação de capital', buy_date: new Date().toISOString().slice(0, 10), toCash: true, maxQty: h.qty })}>
                          ↘ Realizar parcial · recuperar capital ({usd(faltaRecuperar)})
                        </button>
                      )}
                      <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 8, fontSize: 10, color: 'var(--faint)' }}>Vender ~{fmt(qtyRecuperar, qtyRecuperar < 1 ? 6 : 3)} {h.symbol} ao preço atual traz o que falta ao caixa. Imposto sobre ganho de capital não está incluído — depende da sua faixa mensal de vendas no Brasil.</p>
                    </div>
                  )}

                  <div className="eyebrow" style={{ marginTop: 18 }}>Movimentos ({my.length})</div>
                  {my.map(x => (<div className="txitem" key={x.id}>
                    <div className="txhead"><span>{dBR(x.buy_date)} · {daysSince(x.buy_date)}d {(x.move_kind === 'to_pool') ? <b style={{ color: 'var(--red)' }}>· SAÍDA → POOL</b> : (x.move_kind === 'from_pool') ? <b style={{ color: 'var(--green)' }}>· RETORNO ← POOL</b> : (x.move_kind === 'sell') ? <b style={{ color: 'var(--red)' }}>· VENDA</b> : ''}</span><b>{fmt(x.qty, Math.abs(x.qty) < 1 ? 5 : 3)} @ {usd(x.buy_price)}</b></div>
                    <div className="txmeta">{(x.move_kind === 'to_pool' || x.move_kind === 'from_pool' || x.move_kind === 'sell') ? <><span className="txtag">nota <b>{x.note || '—'}</b></span><span className="txtag">{x.move_kind === 'sell' ? 'recebido' : 'valor'} <b>{usd(Math.abs(x.qty) * x.buy_price)}</b></span></> : <>{(() => { const rem = fifoRemaining[x.id || ''] ?? x.qty; const cur = h.price || 0; if (!cur || !x.buy_price) return null; const plPct = (cur / x.buy_price - 1) * 100; const plUsd = rem * (cur - x.buy_price); const sold = rem <= 1e-9; return <span className="txtag" style={{ fontWeight: 700, color: sold ? 'var(--muted)' : plPct >= 0 ? 'var(--green)' : 'var(--red)' }}>{sold ? '✓ vendido' : `${plPct >= 0 ? '▲ +' : '▼ '}${fmt(plPct, 1)}% · ${(plUsd >= 0 ? '+' : '-') + usd(Math.abs(plUsd)).slice(1)} · resta ${fmt(rem, rem < 1 ? 5 : 3)}`}</span> })()}<span className="txtag">rede <b>{x.rede || '—'}</b></span><span className="txtag">corretora <b>{x.corretora || '—'}</b></span><span className="txtag">carteira <b>{x.carteira || '—'}</b></span><span className="txtag">saldo <b>{usd(x.qty * x.buy_price)}</b></span>{x.stop_limit > 0 && <span className="txtag">stop <b>{usd(x.stop_limit)}</b></span>}{x.target > 0 && <span className="txtag">alvo <b>{usd(x.target)}</b></span>}</>}<span className="txtag" style={{ cursor: 'pointer', color: 'var(--purple)' }} onClick={() => openTxEdit(x, h)}>editar ✎</span><span className="txtag" style={{ cursor: 'pointer', color: 'var(--red)' }} onClick={() => delTx(x.id!, h)}>excluir ✕</span></div>
                  </div>))}
                  <div className="grid2" style={{ marginTop: 16 }}><button className="btn ghost" onClick={() => openMove(h, 'sell')}>↘ Vender</button><button className="btn" onClick={() => openBuy(h)}>+ Registrar compra</button></div><div className="grid2" style={{ marginTop: 8 }}><button className="btn ghost" onClick={() => openMove(h, 'to_pool')}>↗ Saída p/ pool</button><button className="btn ghost" onClick={() => openMove(h, 'from_pool')}>↙ Retorno de pool</button></div><div style={{ marginTop: 8 }}><button className="btn ghost danger" style={{ width: '100%' }} onClick={() => delAsset(h)}>Excluir ativo</button></div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* FORM DE MOVIMENTO (saída/retorno de pool) */}
        {moveForm && (
          <div className="modal" onClick={e => { if (e.target === e.currentTarget) setMoveForm(null) }}>
            <div className="sheet"><div className="grabber" /><div className="sheet-scroll">
              <h3>{moveForm.dir === 'sell' ? `↘ Vender ${moveForm.symbol}` : moveForm.dir === 'to_pool' ? `↗ Saída de ${moveForm.symbol} para pool` : `↙ Retorno de ${moveForm.symbol} da pool`}</h3>
              <p className="foot-note" style={{ marginTop: 4 }}>{moveForm.dir === 'sell' ? `Baixa a quantidade vendida do seu saldo de ${moveForm.symbol}, sem alterar o custo médio do que sobra. O valor recebido pode ser creditado na Caixa.` : moveForm.dir === 'to_pool' ? 'Registra a saída do ativo para uma pool. O saldo diminui, sem alterar seu custo médio.' : 'Registra o retorno do ativo quando você desmonta a pool. O saldo aumenta, sem alterar seu custo médio.'}</p>
              {moveForm.dir === 'sell' && moveForm.maxQty ? <p className="foot-note" style={{ marginTop: 6 }}>Saldo disponível: <b>{fmt(moveForm.maxQty, 5)} {moveForm.symbol}</b> <span style={{ color: 'var(--purple)', cursor: 'pointer' }} onClick={() => setMoveForm({ ...moveForm, qty: String(moveForm.maxQty) })}>· vender tudo</span></p> : null}
              <div className="grid2" style={{ marginTop: 12 }}>
                <div className="field"><label>Quantidade</label><input inputMode="decimal" value={moveForm.qty} onChange={e => setMoveForm({ ...moveForm, qty: e.target.value })} placeholder="ex: 1.04" /></div>
                <div className="field"><label>{moveForm.dir === 'sell' ? 'Preço de venda U$' : 'Preço U$ no momento'}</label><input inputMode="decimal" value={moveForm.price} onChange={e => setMoveForm({ ...moveForm, price: e.target.value })} placeholder="ex: 1917" /></div>
              </div>
              <div className="grid2">
                <div className="field"><label>Data</label><input type="date" value={moveForm.buy_date} onChange={e => setMoveForm({ ...moveForm, buy_date: e.target.value })} /></div>
                <div className="field"><label>Nota (livre)</label><input value={moveForm.note} onChange={e => setMoveForm({ ...moveForm, note: e.target.value })} placeholder={moveForm.dir === 'sell' ? 'ex: realizei parcial' : 'ex: pool cbBTC/WETH 0,05%'} /></div>
              </div>
              {moveForm.dir === 'sell' && <label className="as-accept" style={{ marginTop: 10 }}><input type="checkbox" checked={!!moveForm.toCash} onChange={e => setMoveForm({ ...moveForm, toCash: e.target.checked })} /><span>Creditar o valor recebido na <b>Caixa (US$)</b></span></label>}
              <div className="modal-preview"><span>{moveForm.dir === 'sell' ? 'Vai receber' : moveForm.dir === 'to_pool' ? 'Vai sair do saldo' : 'Vai voltar ao saldo'}</span><b className="num">{fmt(num(moveForm.qty), num(moveForm.qty) < 1 ? 5 : 3)} {moveForm.symbol} · {usd(num(moveForm.qty) * num(moveForm.price))}</b></div>
              <div className="grid2" style={{ marginTop: 16 }}><button className="btn ghost" onClick={() => setMoveForm(null)}>Cancelar</button><button className="btn" onClick={saveMove}>{moveForm.dir === 'sell' ? 'Confirmar venda' : 'Salvar movimento'}</button></div>
            </div></div>
          </div>
        )}

        {/* FORM DE CORRIGIR MOVIMENTO */}
        {txEdit && (() => {
          const isMove = txEdit.move_kind === 'to_pool' || txEdit.move_kind === 'from_pool' || txEdit.move_kind === 'sell'
          return (
          <div className="modal" onClick={e => { if (e.target === e.currentTarget) setTxEdit(null) }}>
            <div className="sheet"><div className="grabber" /><div className="sheet-scroll">
              <h3>{txEdit.move_kind === 'sell' ? `✎ Corrigir venda de ${txEdit.symbol}` : isMove ? (txEdit.move_kind === 'to_pool' ? `✎ Corrigir saída → pool (${txEdit.symbol})` : `✎ Corrigir retorno ← pool (${txEdit.symbol})`) : `✎ Corrigir compra de ${txEdit.symbol}`}</h3>
              <p className="foot-note" style={{ marginTop: 4 }}>Ajuste os dados deste movimento. O custo médio e os totais são recalculados ao salvar.</p>
              <div className="grid2" style={{ marginTop: 12 }}>
                <div className="field"><label>Quantidade</label><input inputMode="decimal" value={txEdit.qty} onChange={e => setTxEdit({ ...txEdit, qty: e.target.value })} placeholder="ex: 0,00297" /></div>
                <div className="field"><label>{isMove ? 'Preço U$ no momento' : 'Preço compra U$'}</label><input inputMode="decimal" value={txEdit.buy_price} onChange={e => setTxEdit({ ...txEdit, buy_price: e.target.value })} placeholder="ex: 1879,64" /></div>
              </div>
              <div className="grid2">
                <div className="field"><label>Data</label><input type="date" value={txEdit.buy_date} onChange={e => setTxEdit({ ...txEdit, buy_date: e.target.value })} /></div>
                {isMove
                  ? <div className="field"><label>Nota (livre)</label><input value={txEdit.note} onChange={e => setTxEdit({ ...txEdit, note: e.target.value })} placeholder="ex: pool ETH/USDC" /></div>
                  : <div className="field"><label>Rede</label><input value={txEdit.rede} onChange={e => setTxEdit({ ...txEdit, rede: e.target.value })} placeholder="BASE" /></div>}
              </div>
              {!isMove && (<>
                <div className="grid2"><div className="field"><label>Corretora</label><input value={txEdit.corretora} onChange={e => setTxEdit({ ...txEdit, corretora: e.target.value })} placeholder="OKX" /></div><div className="field"><label>Carteira</label><input value={txEdit.carteira} onChange={e => setTxEdit({ ...txEdit, carteira: e.target.value })} placeholder="LEDGER" /></div></div>
                <div className="grid2"><div className="field"><label>Stop limit U$</label><input inputMode="decimal" value={txEdit.stop_limit} onChange={e => setTxEdit({ ...txEdit, stop_limit: e.target.value })} /></div><div className="field"><label>Alvo venda U$</label><input inputMode="decimal" value={txEdit.target} onChange={e => setTxEdit({ ...txEdit, target: e.target.value })} /></div></div>
              </>)}
              <div className="modal-preview"><span>{txEdit.move_kind === 'sell' ? 'Valor recebido' : isMove ? (txEdit.move_kind === 'to_pool' ? 'Vai sair do saldo' : 'Vai voltar ao saldo') : 'Saldo deste movimento'}</span><b className="num">{fmt(num(txEdit.qty), num(txEdit.qty) < 1 ? 5 : 3)} {txEdit.symbol} · {usd(num(txEdit.qty) * num(txEdit.buy_price))}</b></div>
              <div className="grid2" style={{ marginTop: 16 }}><button className="btn ghost" onClick={() => setTxEdit(null)}>Cancelar</button><button className="btn" onClick={saveTxEdit}>Salvar correção</button></div>
            </div></div>
          </div>
          )
        })()}

        {/* FORM DE COMPRA */}
        {txForm && (
          <div className="modal" onClick={e => { if (e.target === e.currentTarget) setTxForm(null) }}>
            <div className="sheet"><div className="grabber" /><div className="sheet-scroll">
              <h3>{txForm.isNew ? 'Novo ativo / 1ª compra' : `Comprar ${txForm.symbol}`}</h3>
              {txForm.isNew && (<>
                <div className="field"><label>Moeda</label><input value={coinQuery} onChange={e => setCoinQuery(e.target.value)} placeholder="Digite o nome: Bitcoin, Solana, Pepe…" autoFocus /></div>
                {coinSearching && <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 4 }}>Buscando…</p>}
                {coinResults && coinResults.length > 0 && (
                  <div className="card" style={{ padding: 6, marginTop: 6 }}>
                    {coinResults.map((c: any) => (
                      <div key={c.id} onClick={() => pickCoin(c)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px', cursor: 'pointer', borderRadius: 8 }}>
                        {c.image ? <img src={c.image} alt="" width={24} height={24} style={{ borderRadius: '50%' }} /> : <span className="sym" style={{ width: 24, height: 24, background: 'linear-gradient(145deg,#A855F7,#A855F788)' }}>{c.symbol.slice(0, 3)}</span>}
                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700 }}>{c.name} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>{c.symbol}</span></div>{c.rank ? <div style={{ fontSize: 10, color: 'var(--muted)' }}>rank #{c.rank}</div> : null}</div>
                        <div className="num" style={{ fontSize: 12 }}>{c.price != null ? usd(c.price) : '—'}</div>
                      </div>
                    ))}
                  </div>
                )}
                {coinResults && coinResults.length === 0 && !coinSearching && <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 4 }}>Nenhuma moeda encontrada — tente outro nome{!coinManual && <> ou <a style={{ color: 'var(--purple)', cursor: 'pointer' }} onClick={() => setCoinManual(true)}>informe manualmente</a></>}.</p>}
                {txForm.cg_id && !coinManual && (
                  <div className="card" style={{ marginTop: 8, background: 'rgba(43,255,198,.08)', border: '1px solid rgba(43,255,198,.3)' }}>
                    <p className="foot-note" style={{ textAlign: 'left', padding: 0, color: '#2BFFC6' }}>✓ Selecionada: <b>{txForm.name} ({txForm.symbol})</b> — preço já preenchido pelo mercado. É só ajustar a quantidade e o que você pagou.</p>
                  </div>
                )}
                {coinManual && (
                  <>
                    <div className="grid2"><div className="field"><label>Nome</label><input value={txForm.name} onChange={e => setTxForm({ ...txForm, name: e.target.value })} placeholder="Ethereum" /></div><div className="field"><label>Símbolo</label><input value={txForm.symbol} onChange={e => setTxForm({ ...txForm, symbol: e.target.value.toUpperCase() })} placeholder="ETH" /></div></div>
                    <div className="field"><label>ID CoinGecko (avançado)</label><input value={txForm.cg_id} onChange={e => setTxForm({ ...txForm, cg_id: e.target.value })} placeholder="ethereum" /></div>
                  </>
                )}
                <div className="grid2"><div className="field"><label>Meta %</label><input inputMode="decimal" value={txForm.meta_pct} onChange={e => setTxForm({ ...txForm, meta_pct: e.target.value })} /></div><div className="field" /></div>
              </>)}
              {txForm.cg_id && (
                <div className="field">
                  <label>Ativo</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: '1px solid rgba(43,255,198,.28)', background: 'rgba(43,255,198,.06)' }}>
                    {txForm.img ? <img src={txForm.img} alt="" width={26} height={26} style={{ borderRadius: '50%' }} /> : <span className="sym" style={{ width: 26, height: 26, background: `linear-gradient(145deg,${txForm.color || '#A855F7'},${(txForm.color || '#A855F7')}88)` }}>{(txForm.symbol || '?').slice(0, 3)}</span>}
                    <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 14 }}>{txForm.name || txForm.symbol}</b> <span style={{ color: 'var(--muted)' }}>{txForm.symbol}</span></div>
                    {num(txForm.buy_price) ? <span className="num" style={{ fontSize: 13 }}>{usd(num(txForm.buy_price))}</span> : null}
                  </div>
                </div>
              )}
              <div className="grid2"><div className="field"><label>Rede</label><input value={txForm.rede} onChange={e => setTxForm({ ...txForm, rede: e.target.value })} placeholder="BASE" /></div><div className="field"><label>Corretora</label><input value={txForm.corretora} onChange={e => setTxForm({ ...txForm, corretora: e.target.value })} placeholder="BYbit" /></div></div>
              <div className="grid2"><div className="field"><label>Carteira</label><input value={txForm.carteira} onChange={e => setTxForm({ ...txForm, carteira: e.target.value })} placeholder="METAMASK" /></div><div className="field"><label>Data da compra</label><input type="date" value={txForm.buy_date} onChange={e => setTxForm({ ...txForm, buy_date: e.target.value })} /></div></div>
              <div className="grid2"><div className="field"><label>Qtd. na compra</label><input inputMode="decimal" value={txForm.qty} onChange={e => setTxForm({ ...txForm, qty: e.target.value })} /></div><div className="field"><label>Preço compra U$</label><input inputMode="decimal" value={txForm.buy_price} onChange={e => setTxForm({ ...txForm, buy_price: e.target.value })} /></div></div>
              {txForm.cg_id && histLoading && <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 2 }}>Buscando preço de mercado nessa data…</p>}
              {txForm.cg_id && !histLoading && histPrice != null && (
                <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 2 }}>
                  Preço de mercado em {txForm.buy_date.split('-').reverse().join('/')}: <b>{usd(histPrice)}</b> · <a onClick={() => setTxForm({ ...txForm, buy_price: String(histPrice) })} style={{ color: 'var(--purple)', cursor: 'pointer', fontWeight: 700 }}>usar este preço</a> (ou digite o valor exato que você pagou)
                </p>
              )}
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
              <div className="field"><label>Ativo volátil da pool (Par 1)</label><input value={poolCoinQuery} onChange={e => setPoolCoinQuery(e.target.value)} placeholder="Digite o nome: Bitcoin, Coinbase Wrapped BTC, Ethereum…" /></div>
              {poolCoinSearching && <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 4 }}>Buscando…</p>}
              {poolCoinResults && poolCoinResults.length > 0 && (
                <div className="card" style={{ padding: 6, marginTop: 6 }}>
                  {poolCoinResults.map((c: any) => (
                    <div key={c.id} onClick={() => pickPoolCoin(c)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px', cursor: 'pointer', borderRadius: 8 }}>
                      {c.image ? <img src={c.image} alt="" width={24} height={24} style={{ borderRadius: '50%' }} /> : <span className="sym" style={{ width: 24, height: 24, background: 'linear-gradient(145deg,#A855F7,#A855F788)' }}>{c.symbol.slice(0, 3)}</span>}
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700 }}>{c.name} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>{c.symbol}</span></div>{c.rank ? <div style={{ fontSize: 10, color: 'var(--muted)' }}>rank #{c.rank}</div> : null}</div>
                      <div className="num" style={{ fontSize: 12 }}>{c.price != null ? usd(c.price) : '—'}</div>
                    </div>
                  ))}
                </div>
              )}
              {poolCoinResults && poolCoinResults.length === 0 && !poolCoinSearching && <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 4 }}>Nenhuma moeda encontrada — tente outro nome.</p>}
              {poolForm.par1_cg_id && (
                <div className="card" style={{ marginTop: 8, background: 'rgba(43,255,198,.08)', border: '1px solid rgba(43,255,198,.3)' }}>
                  <p className="foot-note" style={{ textAlign: 'left', padding: 0, color: '#2BFFC6' }}>✓ Par 1: <b>{poolForm.par1}</b> · ID <b>{poolForm.par1_cg_id}</b> — preço e range vêm certos do mercado.</p>
                </div>
              )}
              <div className="grid2"><div className="field"><label>Símbolo Par 1</label><input value={poolForm.par1} onChange={e => setPoolForm({ ...poolForm, par1: e.target.value.toUpperCase() })} placeholder="ETH" /></div><div className="field"><label>Par 2 (estável)</label><input value={poolForm.par2} onChange={e => setPoolForm({ ...poolForm, par2: e.target.value.toUpperCase() })} placeholder="USDC" /></div></div>
              <div className="grid2"><div className="field"><label>dApp</label><input value={poolForm.dapp} onChange={e => setPoolForm({ ...poolForm, dapp: e.target.value })} placeholder="Uniswap v3" /></div><div className="field"><label>Rede</label><input value={poolForm.rede} onChange={e => setPoolForm({ ...poolForm, rede: e.target.value })} placeholder="Base" /></div></div>
              <div className="field"><label>Data de entrada</label><input type="date" value={poolForm.entry_date} onChange={e => setPoolForm({ ...poolForm, entry_date: e.target.value })} /></div>
              <div className="grid2"><div className="field"><label>Range LOW (preço)</label><input inputMode="decimal" value={poolForm.low_range} onChange={e => setPoolForm({ ...poolForm, low_range: e.target.value })} /></div><div className="field"><label>Range HIGH (preço)</label><input inputMode="decimal" value={poolForm.high_range} onChange={e => setPoolForm({ ...poolForm, high_range: e.target.value })} /></div></div>
              <div className="field"><label>Preço do {poolForm.par1 || 'ativo'} na entrada (p/ IL)</label><input inputMode="decimal" value={poolForm.entry_price ?? ''} onChange={e => setPoolForm({ ...poolForm, entry_price: e.target.value })} placeholder="ex: 2100" /></div>
              <div className="grid2"><div className="field"><label>Aporte U$</label><input inputMode="decimal" value={poolForm.aporte} onChange={e => setPoolForm({ ...poolForm, aporte: e.target.value })} /></div><div className="field"><label>Saldo atual U$</label><input inputMode="decimal" value={poolForm.current_value} onChange={e => setPoolForm({ ...poolForm, current_value: e.target.value })} /></div></div>
              <div className="grid2"><div className="field"><label>Taxas geradas U$</label><input inputMode="decimal" value={poolForm.fees} onChange={e => setPoolForm({ ...poolForm, fees: e.target.value })} /></div><div className="field"><label>Link da pool</label><input value={poolForm.link} onChange={e => setPoolForm({ ...poolForm, link: e.target.value })} placeholder="https://..." /></div></div>
              <div className="grid2"><div className="field"><label>Rede (p/ estatísticas)</label><input value={poolForm.network || 'base'} onChange={e => setPoolForm({ ...poolForm, network: e.target.value })} placeholder="base" /></div><div className="field"><label>Endereço da pool (tração)</label><input value={poolForm.pool_address || ''} onChange={e => setPoolForm({ ...poolForm, pool_address: e.target.value })} placeholder="0x... (opcional)" /></div></div>
              <div className="grid2"><div className="field"><label>ID da posição (p/ sincronizar taxas)</label><input value={poolForm.position_id || ''} onChange={e => setPoolForm({ ...poolForm, position_id: e.target.value })} placeholder="ex: 3831528 (NFT ID)" /></div><div className="field" /></div>
              <div className="grid2" style={{ marginTop: 16 }}>{poolForm.id && <button className="btn ghost danger" onClick={() => delPool(poolForm.id)}>Excluir</button>}<button className="btn ghost" onClick={() => setPoolForm(null)}>Cancelar</button><button className="btn" onClick={savePool}>Salvar</button></div>
            </div></div>
          </div>
        )}

        {/* ABRIR / EDITAR POSIÇÃO PERP */}
        {perpForm && (() => {
          const mk = perpMkts[perpForm.symbol]
          const meta = perpForm.symbol ? metaFor(perpForm.symbol) : { maxLev: 10, klass: 'equity' as const }
          const maxLev = mk?.maxLev || meta.maxLev
          const mmr = mk?.mmr ?? mmrFor(maxLev)
          const entry = num(perpForm.entry), lev = Math.max(1, Math.min(maxLev, Math.round(num(perpForm.leverage) || 1)))
          const sizeInput = num(perpForm.size), marginInput = num(perpForm.margin)
          const size = sizeInput > 0 ? sizeInput : (entry > 0 ? marginInput * lev / entry : 0)
          const margin = sizeInput > 0 ? size * entry / lev : marginInput
          const notion = size * entry
          const fee = notion * PERP_TAKER_FEE
          // liq estimada com base no colateral atual da conta (aprox.; refinada na tela após registrar)
          const liq = size > 0 ? liqPrice({ side: perpForm.side, size, entry_price: entry, mmr }, perpCollateral || margin) : null
          const filtered = perpMktList.filter(m => !perpPick || m.symbol.includes(perpPick.toUpperCase()) || m.name.toUpperCase().includes(perpPick.toUpperCase()))
          return (
          <div className="modal" onClick={e => { if (e.target === e.currentTarget) setPerpForm(null) }}>
            <div className="sheet"><div className="grabber" /><div className="sheet-scroll">
              <h3>{perpForm.id ? '✎ Editar posição' : '⚡ Abrir posição'}</h3>
              <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 4 }}>Escolha o mercado e os parâmetros, <b>execute na Ondo</b> e registre aqui para acompanhar ao vivo.</p>

              {!perpForm.id && (
                <div className="field" style={{ marginTop: 12 }}><label>Mercado</label>
                  <input value={perpPick} onChange={e => setPerpPick(e.target.value)} placeholder="Buscar: CRCL, NVDA, TSLA, Ouro…" />
                </div>
              )}
              {!perpForm.id && perpPick && filtered.length > 0 && (
                <div className="card" style={{ padding: 6, marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
                  {filtered.slice(0, 24).map(m => (
                    <div key={m.symbol} onClick={() => pickPerpMkt(m)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, cursor: 'pointer', borderRadius: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 13 }}>{m.symbol}</b> <span style={{ color: 'var(--muted)', fontSize: 11 }}>{m.name}</span> <span className="chip" style={{ background: 'rgba(168,85,247,.15)', color: 'var(--purple)' }}>{m.maxLev}x</span></div>
                      {m.last > 0 && <span className="num" style={{ fontSize: 12 }}>{usd(m.last)}</span>}
                    </div>
                  ))}
                </div>
              )}

              {perpForm.symbol && (
                <div className="card" style={{ marginTop: 8, background: 'rgba(168,85,247,.08)', border: '1px solid rgba(168,85,247,.3)' }}>
                  <p className="foot-note" style={{ textAlign: 'left', padding: 0, color: 'var(--purple)' }}>✓ <b>{perpForm.symbol}</b> · {perpForm.name} · máx {maxLev}x · MMR {fmt(mmr * 100, 1)}%{mk?.last ? <> · mark <b>{usd(mk.last)}</b></> : ''}</p>
                </div>
              )}

              <div className="field"><label>Direção</label>
                <div className="segbar">
                  {(['long', 'short'] as PerpSide[]).map(s => (
                    <button key={s} className={perpForm.side === s ? 'seg on' : 'seg'} onClick={() => setPerpForm({ ...perpForm, side: s })} style={perpForm.side === s ? { background: s === 'long' ? 'linear-gradient(135deg,#0f9d63,#2BFF9A)' : 'linear-gradient(135deg,#B21548,var(--red))' } : undefined}>{s === 'long' ? '▲ Long' : '▼ Short'}</button>
                  ))}
                </div>
              </div>

              <div className="field"><label>Alavancagem · {lev}x <span style={{ color: 'var(--muted)' }}>(máx {maxLev}x)</span></label>
                <input type="range" min={1} max={maxLev} step={1} value={lev} onChange={e => setPerpForm({ ...perpForm, leverage: e.target.value })} style={{ width: '100%' }} />
              </div>

              <div className="grid2">
                <div className="field"><label>Margem (USDC)</label><input inputMode="decimal" value={perpForm.margin || ''} onChange={e => setPerpForm({ ...perpForm, margin: e.target.value, size: '' })} placeholder="ex: 20" /></div>
                <div className="field"><label>Preço de entrada U$</label><input inputMode="decimal" value={perpForm.entry} onChange={e => setPerpForm({ ...perpForm, entry: e.target.value })} placeholder="ex: 91.09" /></div>
              </div>
              <div className="field"><label>Tamanho / Size <span style={{ color: 'var(--muted)' }}>(opcional — se a posição já está aberta)</span></label><input inputMode="decimal" value={perpForm.size || ''} onChange={e => setPerpForm({ ...perpForm, size: e.target.value })} placeholder={`ex: 1.1 ${perpForm.symbol || ''} — copie de Size na Ondo`} /></div>
              {sizeInput > 0 && <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 2 }}>Margem correspondente: <b>{usd(margin)}</b> (tamanho tem prioridade sobre a margem digitada)</p>}
              <div className="grid2" style={{ marginTop: 4 }}>
                <div className="field"><label>🎯 Alvo / TP U$ <span style={{ color: 'var(--muted)' }}>(opc.)</span></label><input inputMode="decimal" value={perpForm.tp || ''} onChange={e => setPerpForm({ ...perpForm, tp: e.target.value })} placeholder="onde realizar" /></div>
                <div className="field"><label>🛑 Stop / SL U$ <span style={{ color: 'var(--muted)' }}>(opc.)</span></label><input inputMode="decimal" value={perpForm.sl || ''} onChange={e => setPerpForm({ ...perpForm, sl: e.target.value })} placeholder="onde proteger" /></div>
              </div>
              {(() => {
                const tp = num(perpForm.tp), sl = num(perpForm.sl), isLong = perpForm.side === 'long'
                const warns: string[] = []
                if (tp > 0 && entry > 0 && ((isLong && tp <= entry) || (!isLong && tp >= entry))) warns.push(`Alvo deveria ficar ${isLong ? 'acima' : 'abaixo'} da entrada`)
                if (sl > 0 && entry > 0 && ((isLong && sl >= entry) || (!isLong && sl <= entry))) warns.push(`Stop deveria ficar ${isLong ? 'abaixo' : 'acima'} da entrada`)
                if (sl > 0 && liq != null && liq > 0.001 && ((isLong && sl <= liq) || (!isLong && sl >= liq))) warns.push('Stop está além da liquidação — o mercado te liquida antes dele agir')
                return warns.length ? <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 4, color: '#F5A623' }}>⚠ {warns.join(' · ')}</p> : null
              })()}
              <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 4, fontSize: 10 }}>Estes níveis são só acompanhamento. A ordem que fecha a posição você define na <b>Ondo</b> (coluna TP/SL de lá).</p>
              {mk?.last ? <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 2 }}>Mark agora: <b>{usd(mk.last)}</b> · <a onClick={() => setPerpForm({ ...perpForm, entry: String(mk.last) })} style={{ color: 'var(--purple)', cursor: 'pointer', fontWeight: 700 }}>usar como entrada</a></p> : null}

              <div className="modal-preview" style={{ flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}><span>Tamanho da posição</span><b className="num">{size > 0 ? fmt(size, size < 10 ? 4 : 2) + ' ' + perpForm.symbol : '—'}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}><span>Valor (notional)</span><b className="num">{usd(notion)}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}><span>Est. liquidação</span><b className="num" style={{ color: '#F5A623' }}>{liq != null && liq > 0.001 ? usd(liq) : '—'}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}><span>Taxa de entrada (taker)</span><b className="num">{usd(fee)}</b></div>
              </div>

              <a className="btn" style={{ textDecoration: 'none', textAlign: 'center', marginTop: 14, background: 'linear-gradient(135deg,#6D28D9,#A855F7)' }} href="https://app.ondoperps.xyz/" target="_blank" rel="noreferrer">Abrir na Ondo Perps ↗</a>
              <div className="grid2" style={{ marginTop: 10 }}>
                {perpForm.id && <button className="btn ghost danger" onClick={() => delPerp(perpForm.id)}>Excluir</button>}
                <button className="btn ghost" onClick={() => setPerpForm(null)}>Cancelar</button>
                <button className="btn" onClick={savePerp}>{perpForm.id ? 'Salvar' : 'Registrar posição'}</button>
              </div>
            </div></div>
          </div>
          )
        })()}

        {/* ENCERRAR POSIÇÃO PERP */}
        {perpClose && (() => {
          const px = num(perpClose.price), dir = perpClose.side === 'long' ? 1 : -1
          const gross = px > 0 ? dir * perpClose.size * (px - perpClose.entry_price) : 0
          const fees = px > 0 ? (perpClose.size * perpClose.entry_price + perpClose.size * px) * PERP_TAKER_FEE : 0
          const net = gross - fees
          return (
          <div className="modal" onClick={e => { if (e.target === e.currentTarget) setPerpClose(null) }}>
            <div className="sheet"><div className="grabber" /><div className="sheet-scroll">
              <h3>Encerrar {perpClose.symbol} <span className={`side-pill ${perpClose.side}`}>{perpClose.side === 'long' ? 'Long' : 'Short'} {perpClose.leverage}x</span></h3>
              <div className="field" style={{ marginTop: 10 }}><label>Preço de fechamento U$</label><input inputMode="decimal" value={perpClose.price} onChange={e => setPerpClose({ ...perpClose, price: e.target.value })} placeholder="preço de saída" /></div>
              <div className="modal-preview" style={{ flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}><span>PnL bruto</span><b className={`num ${gross >= 0 ? 'up' : 'down'}`}>{(gross >= 0 ? '+' : '−') + '$' + fmt(Math.abs(gross))}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}><span>Taxas (entrada+saída)</span><b className="num">−{usd(fees).slice(1)}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}><span><b>PnL líquido</b></span><b className={`num ${net >= 0 ? 'up' : 'down'}`}>{(net >= 0 ? '+' : '−') + '$' + fmt(Math.abs(net))}</b></div>
              </div>
              <div className="grid2" style={{ marginTop: 16 }}><button className="btn ghost" onClick={() => setPerpClose(null)}>Cancelar</button><button className="btn" onClick={closePerp}>Confirmar fechamento</button></div>
            </div></div>
          </div>
          )
        })()}

        {/* EDITAR COLATERAL DA CONTA PERP */}
        {perpAcctForm !== null && (
          <div className="modal" onClick={e => { if (e.target === e.currentTarget) setPerpAcctForm(null) }}>
            <div className="sheet"><div className="grabber" /><div className="sheet-scroll">
              <h3>💰 Colateral da conta</h3>
              <p className="foot-note" style={{ textAlign: 'left', padding: 0, marginTop: 4 }}>Total de colateral/equity depositado na Ondo (USDC). É a base do cálculo de liquidação em cross margin — copie o valor de <b>Equity</b> da sua conta na Ondo para bater exatamente.</p>
              <div className="field" style={{ marginTop: 12 }}><label>Colateral (USDC)</label><input inputMode="decimal" value={perpAcctForm} onChange={e => setPerpAcctForm(e.target.value)} placeholder="ex: 45" /></div>
              <div className="grid2" style={{ marginTop: 16 }}><button className="btn ghost" onClick={() => setPerpAcctForm(null)}>Cancelar</button><button className="btn" onClick={savePerpCollateral}>Salvar</button></div>
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
                  {rows.length > 0 && <div style={{ color: 'var(--muted)', marginTop: 6, fontSize: 12 }}>1º: {rows[0].kind === 'in' ? 'Aporte' : 'Retirada'} {brl(rows[0].amount)} em {dBR(rows[0].date)} · último: {rows[rows.length - 1].kind === 'in' ? 'Aporte' : 'Retirada'} {brl(rows[rows.length - 1].amount)} em {dBR(rows[rows.length - 1].date)}</div>}
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
                {allAlerts.slice().sort((a, b) => (seenAlerts.includes(a.id) ? 1 : 0) - (seenAlerts.includes(b.id) ? 1 : 0)).map(a => (
                  <div className={`alert-item alert-${a.tone}`} key={a.id} style={seenAlerts.includes(a.id) ? { opacity: .6 } : undefined}>
                    <div className="alert-ic">{a.icon}</div>
                    <div className="alert-t"><b>{a.title}{!seenAlerts.includes(a.id) && <span style={{ marginLeft: 8, fontSize: 9, color: 'var(--pink-bright)', fontFamily: "'JetBrains Mono'", verticalAlign: 'middle' }}>● NOVO</span>}</b><span>{a.text}</span></div>
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
