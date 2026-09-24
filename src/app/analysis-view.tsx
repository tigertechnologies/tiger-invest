'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Activity, BarChart3, Check, ChevronDown, ChevronUp, Cloud, Droplets, Gauge as GaugeIcon, GitCompare, Info, Layers, LineChart, Link2,
  Search, Sparkles, Target, TrendingDown, TrendingUp, Waves, Zap,
} from 'lucide-react';
import type { Analysis } from '@/lib/market/analysis';
import type { PositionResult } from '@/lib/market/position';
import { DEFAULT_TOKENS } from '@/lib/site';
import { fmtCompact, fmtNum, fmtPct, fmtPrice, fmtTime } from '@/lib/format';
import { CandleChart } from '@/components/candles';
import { Bar, Disclaimer, ErrorBox, Gauge, Spinner, TokenIcon, cx } from '@/components/ui';

type Resp = {
  symbol: string;
  interval: string;
  ticker: { change24h: number; volume24h: number } | null;
  analysis: Analysis;
  position: PositionResult | null;
  candles: [number, number, number, number, number][];
  updatedAt: string;
};
type TokenRow = { symbol: string; price: number; change24h: number; volume: number };

const INTERVALS = [
  { v: '15m', l: '15m' },
  { v: '1h', l: '1h' },
  { v: '4h', l: '4h' },
  { v: '1d', l: '1d' },
  { v: '1w', l: '1s' },
  { v: '1M', l: '1M' },
];

const NAMES: Record<string, string> = { BTC: 'Bitcoin', ETH: 'Ethereum', BNB: 'BNB', SOL: 'Solana', XRP: 'XRP', DOGE: 'Dogecoin', ADA: 'Cardano' };

const recTone = (r: string) => (r.includes('COMPRA') ? 'chip-up' : r.includes('VENDA') ? 'chip-down' : 'chip-warn');

export function AnalysisView() {
  const router = useRouter();
  const sp = useSearchParams();
  const symbol = (sp.get('symbol') || 'BTC').toUpperCase();
  const interval = sp.get('interval') || '1d';
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'tech' | 'pools'>('tech');

  const go = useCallback(
    (s: string, i = interval) => router.replace(`/?symbol=${encodeURIComponent(s)}&interval=${i}`, { scroll: false }),
    [router, interval],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(`/api/analysis?symbol=${symbol}&interval=${interval}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Erro ao carregar a análise');
      setData(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }, [symbol, interval]);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <TokenPicker symbol={symbol} onPick={(s) => go(s)} />
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-xs text-muted">Período:</span>
          <div className="flex rounded-xl border border-line bg-card-2/60 p-1">
            {INTERVALS.map((i) => (
              <button key={i.v} onClick={() => go(symbol, i.v)} className={cx('rounded-lg px-3 py-1.5 text-xs font-semibold', interval === i.v ? 'bg-neon text-on-neon' : 'text-muted hover:text-fg')}>
                {i.l}
              </button>
            ))}
          </div>
        </div>
        {err ? (
          <ErrorBox message={err} onRetry={load} />
        ) : !data ? (
          <div className="card grid h-96 place-items-center"><Spinner className="h-8 w-8" /></div>
        ) : (
          <Main data={data} tab={tab} setTab={setTab} loading={loading} />
        )}
      </div>
    </div>
  );
}

/* ---------------- Seletor de token ---------------- */
function TokenPicker({ symbol, onPick }: { symbol: string; onPick: (s: string) => void }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<TokenRow[]>([]);
  const [more, setMore] = useState(false);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    fetch('/api/tokens').then((r) => r.json()).then((j) => Array.isArray(j) && setList(j)).catch(() => undefined);
  }, []);
  const byS = useMemo(() => new Map(list.map((t) => [t.symbol, t])), [list]);
  const others = list.filter((t) => !DEFAULT_TOKENS.includes(t.symbol) && t.symbol.includes(filter.toUpperCase()));

  const Row = ({ s }: { s: string }) => {
    const t = byS.get(s);
    const active = s === symbol;
    return (
      <button onClick={() => onPick(s)} className={cx('flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition', active ? 'border-neon bg-neon/10 shadow-neon-sm' : 'border-line bg-card-2/50 hover:border-neon/50')}>
        <TokenIcon symbol={s} size={32} />
        <div className="min-w-0 flex-1">
          <div className={cx('text-sm font-bold', active && 'text-neon')}>{s}</div>
          <div className="truncate text-xs text-muted">{NAMES[s] || (t ? fmtPrice(t.price) : '')}</div>
        </div>
        {t && <span className={cx('text-xs font-semibold', t.change24h >= 0 ? 'text-up' : 'text-down')}>{fmtPct(t.change24h, 1)}</span>}
        {active && <Check className="h-4 w-4 text-neon" />}
      </button>
    );
  };

  return (
    <aside className="card h-fit p-5 lg:sticky lg:top-24">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Selecionar Token</h2>
        <span className="chip-up"><TokenIcon symbol={symbol} size={14} /> {symbol}</span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) onPick(q.trim().toUpperCase());
          setQ('');
        }}
        className="flex gap-2"
      >
        <input className="input" placeholder="Token (ex.: ETH)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Símbolo do token" />
        <button className="btn-neon px-3">Analisar</button>
      </form>
      <p className="mt-2 text-xs text-muted">Digite qualquer símbolo com par USDT na Binance.</p>
      <div className="my-4 flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted">
        <span className="h-px flex-1 bg-line" /> ou selecione <span className="h-px flex-1 bg-line" />
      </div>
      <div className="space-y-2">
        {DEFAULT_TOKENS.map((s) => <Row key={s} s={s} />)}
        {!DEFAULT_TOKENS.includes(symbol) && <Row s={symbol} />}
      </div>
      <button onClick={() => setMore(!more)} className="btn-ghost mt-3 w-full">
        {more ? 'Mostrar menos' : `Mostrar mais tokens (mais ${Math.max(list.length - DEFAULT_TOKENS.length, 0)})`}
        {more ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {more && (
        <div className="mt-3">
          <div className="relative mb-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input className="input pl-9" placeholder="Filtrar" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
            {others.map((t) => (
              <button key={t.symbol} onClick={() => onPick(t.symbol)} className={cx('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-neon/10', t.symbol === symbol && 'bg-neon/10 text-neon')}>
                <TokenIcon symbol={t.symbol} size={20} />
                <span className="flex-1 font-semibold">{t.symbol}</span>
                <span className="text-xs text-muted">{fmtPrice(t.price)}</span>
                <span className={cx('w-14 text-right text-xs', t.change24h >= 0 ? 'text-up' : 'text-down')}>{fmtPct(t.change24h, 1)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

/* ---------------- Painel principal ---------------- */
function Main({ data, tab, setTab, loading }: { data: Resp; tab: 'tech' | 'pools'; setTab: (t: 'tech' | 'pools') => void; loading: boolean }) {
  const a = data.analysis;
  const p = data.position;
  const ind = a.indicators;
  const t = a.trade;
  const lines = [
    ...(t.direction !== 'NEUTRO' ? [{ price: t.stop!, label: 'Stop', tone: 'down' as const }, { price: t.targets[0].price!, label: 'TP1', tone: 'up' as const }] : []),
    ...(ind.levels.supports[0] ? [{ price: ind.levels.supports[0].price!, label: 'S1', tone: 'neon' as const }] : []),
    ...(ind.levels.resistances[0] ? [{ price: ind.levels.resistances[0].price!, label: 'R1', tone: 'warn' as const }] : []),
  ];

  return (
    <>
      <section className="card relative overflow-hidden p-5 md:p-6">
        {loading && <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden"><div className="h-full w-1/3 animate-scan bg-neon" /></div>}
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <TokenIcon symbol={data.symbol} size={36} />
              <h1 className="font-display text-3xl font-bold">
                {data.symbol}<span className="text-muted"> / USDT</span>
              </h1>
              <span className={recTone(a.score.recommendation)}>{a.score.recommendation}</span>
            </div>
            <div className="mt-4 text-xs text-muted">Preço atual</div>
            <div className="font-display text-4xl font-bold tracking-tight">{fmtPrice(a.price)}</div>
            <div className="mt-1 flex flex-wrap gap-3 text-sm">
              {data.ticker && <span className={data.ticker.change24h >= 0 ? 'text-up' : 'text-down'}>{fmtPct(data.ticker.change24h)} (24h)</span>}
              {data.ticker && <span className="text-muted">Vol. 24h {fmtCompact(data.ticker.volume24h)}</span>}
              <span className="text-muted">Atualizado {fmtTime(data.updatedAt)}</span>
            </div>
          </div>
          {p && (
            <Link href={`/position-trading?symbol=${data.symbol}`} className="flex flex-col items-center rounded-2xl border border-line bg-bg-soft/60 p-3 hover:border-neon/50" title="Score de position trading (0-100)">
              <Gauge value={p.score} size={170} label="SCORE POSITION" />
              <span className={cx('mt-1 max-w-[220px] text-center text-xs font-semibold', p.tone === 'up' ? 'text-up' : p.tone === 'warn' ? 'text-warn' : 'text-down')}>{p.label}</span>
            </Link>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 rounded-xl border border-line bg-card-2/60 p-1">
          <button onClick={() => setTab('tech')} className={cx('btn', tab === 'tech' ? 'bg-bg text-fg shadow' : 'text-muted')}><LineChart className="h-4 w-4" /> Análise Técnica</button>
          <button onClick={() => setTab('pools')} className={cx('btn', tab === 'pools' ? 'bg-bg text-fg shadow' : 'text-muted')}><Droplets className="h-4 w-4" /> Pools de Liquidez</button>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="flex items-center gap-1 text-muted">Confiança <Info className="h-3.5 w-3.5" aria-label="Concordância entre os indicadores" /></span>
            <b>{a.score.confidenceLabel} · {a.score.confidence}%</b>
          </div>
          <Bar value={a.score.confidence} />
        </div>
      </section>

      {tab === 'tech' ? (
        <>
          <TradeCard a={a} />
          <div className="card p-4">
            <CandleChart data={data.candles} lines={lines} />
          </div>
          <Indicators a={a} />
          <Strength a={a} />
        </>
      ) : (
        <PoolsTab a={a} symbol={data.symbol} />
      )}
      <Disclaimer />
    </>
  );
}

function TradeCard({ a }: { a: Analysis }) {
  const t = a.trade;
  const neutral = t.direction === 'NEUTRO';
  return (
    <section className={cx('card border-2 p-5', t.direction === 'LONG' ? 'border-up/40' : t.direction === 'SHORT' ? 'border-down/40' : 'border-line')}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-neon" />
          <h2 className="font-display font-semibold">Sugestão de Trade</h2>
          {t.reference && <span className={t.reference.type === 'support' ? 'chip-up' : 'chip-down'}>Próximo {t.reference.type === 'support' ? 'suporte' : 'resistência'}</span>}
        </div>
        <span className={cx('chip', t.direction === 'LONG' ? 'border-up/50 text-up' : t.direction === 'SHORT' ? 'border-down/50 text-down' : 'border-line text-muted')}>{t.direction}</span>
      </div>
      {t.reference && (
        <div className="card-2 mb-4 flex items-center justify-between px-4 py-3 text-sm">
          <div>
            <div className="flex items-center gap-2"><span className={cx('h-2 w-2 rounded-full', t.reference.type === 'support' ? 'bg-up' : 'bg-down')} /> Nível de {t.reference.type === 'support' ? 'suporte' : 'resistência'} ({t.reference.touches} toques)</div>
            <div className="text-xs text-muted">Preço está {fmtNum(Math.abs(t.reference.distPct ?? 0))}% {t.reference.type === 'support' ? 'acima deste suporte' : 'abaixo desta resistência'}</div>
          </div>
          <b className="font-mono">{fmtPrice(t.reference.price)}</b>
        </div>
      )}
      {neutral ? (
        <p className="text-sm text-muted">Sem direção clara: os sinais de compra e venda estão equilibrados. Aguarde confirmação.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div><div className="text-xs text-muted">Preço de entrada</div><div className="font-mono text-lg font-bold">{fmtPrice(t.entry)}</div></div>
            <div><div className="text-xs text-muted">Stop loss (2× ATR)</div><div className="font-mono text-lg font-bold text-down">{fmtPrice(t.stop)}</div><div className="text-xs text-down">{fmtPct(t.stopPct)}</div></div>
          </div>
          <div className="mt-4 text-xs text-muted">Alvos de lucro</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {t.targets.map((x, i) => (
              <div key={i} className="rounded-xl border border-up/30 bg-up/5 p-3">
                <div className="text-[11px] text-muted">TP{i + 1} ({String(x.rr).replace('.', ',')}R)</div>
                <div className="font-mono text-sm font-bold text-up">{fmtPrice(x.price)}</div>
                <div className="text-[11px] text-up">{fmtPct(x.pct)}</div>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="mt-4 flex items-center justify-between text-xs text-muted">
        <span>Risco (ATR): <b className={cx(t.riskLabel.includes('ALTA') ? 'text-warn' : 'text-fg')}>{t.riskLabel}</b></span>
        <span>Horizonte: {t.horizon}</span>
      </div>
    </section>
  );
}

function Tile({ icon, title, children, className }: { icon: React.ReactNode; title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx('card p-4', className)}>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted"><span className="text-neon">{icon}</span>{title}</div>
      {children}
    </div>
  );
}

const KV = ({ k, v, tone }: { k: string; v: React.ReactNode; tone?: string }) => (
  <div className="flex items-center justify-between gap-3 py-1 text-sm"><span className="text-muted">{k}</span><span className={cx('font-mono font-semibold', tone)}>{v}</span></div>
);

function Indicators({ a }: { a: Analysis }) {
  const i = a.indicators;
  const rsiTone = (i.rsi ?? 50) < 30 ? 'text-up' : (i.rsi ?? 50) > 70 ? 'text-down' : 'text-warn';
  const projection = (n: number | null) => (n ? `~${n} velas` : 'sem convergência');
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Tile icon={<Activity className="h-4 w-4" />} title="RSI (14)">
        <div className={cx('font-display text-3xl font-bold', rsiTone)}>{fmtNum(i.rsi)}</div>
        <div className="text-sm text-muted">{i.rsiStatus}</div>
        <div className="relative mt-3 h-2 rounded-full bg-gradient-to-r from-up via-warn to-down">
          <span className="absolute -top-1 h-4 w-1 rounded bg-fg" style={{ left: `${i.rsi ?? 50}%` }} />
        </div>
      </Tile>
      <Tile icon={<BarChart3 className="h-4 w-4" />} title="MACD (12, 26, 9)">
        <div className={cx('font-display text-2xl font-bold', (i.macd.hist ?? 0) >= 0 ? 'text-up' : 'text-down')}>{fmtNum(i.macd.line, 4)}</div>
        <KV k="Sinal" v={fmtNum(i.macd.signal, 4)} />
        <KV k="Histograma" v={fmtNum(i.macd.hist, 4)} tone={(i.macd.hist ?? 0) >= 0 ? 'text-up' : 'text-down'} />
        {i.macd.cross && <span className={i.macd.cross === 'up' ? 'chip-up' : 'chip-down'}>Cruzamento {i.macd.cross === 'up' ? 'de alta' : 'de baixa'}</span>}
      </Tile>
      <Tile icon={<Waves className="h-4 w-4" />} title="Bandas de Bollinger (20, 2)">
        <KV k="Superior" v={fmtPrice(i.bollinger.upper)} tone="text-down" />
        <KV k="Média" v={fmtPrice(i.bollinger.mid)} />
        <KV k="Inferior" v={fmtPrice(i.bollinger.lower)} tone="text-up" />
        <div className="mt-2 text-xs text-muted">Posição na banda: {i.bollinger.position}% {i.bollinger.squeeze && <span className="chip-warn ml-1">Squeeze</span>}</div>
      </Tile>
      <Tile icon={<Layers className="h-4 w-4" />} title="Retração de Fibonacci" className="md:col-span-2 xl:col-span-1">
        <div className="mb-2 flex justify-between text-xs text-muted"><span>Máx. {fmtPrice(i.fibonacci.hi)}</span><span>Mín. {fmtPrice(i.fibonacci.lo)}</span></div>
        {i.fibonacci.retracement.map((f) => (
          <KV key={f.f} k={`${(f.f * 100).toFixed(1).replace('.', ',')}%`} v={fmtPrice(f.price)} tone={f.f === 0.618 ? 'text-neon' : undefined} />
        ))}
        <div className="mt-2 border-t border-line pt-2 text-xs text-muted">Extensões</div>
        {i.fibonacci.extension.map((f) => <KV key={f.f} k={`${(f.f * 100).toFixed(1).replace('.', ',')}%`} v={fmtPrice(f.price)} />)}
      </Tile>
      <Tile icon={<TrendingUp className="h-4 w-4" />} title="Médias móveis">
        <KV k="SMA 50" v={fmtPrice(i.ma.sma50)} tone={a.price > (i.ma.sma50 ?? 0) ? 'text-up' : 'text-down'} />
        <KV k="SMA 200" v={fmtPrice(i.ma.sma200)} tone={a.price > (i.ma.sma200 ?? 0) ? 'text-up' : 'text-down'} />
        <KV k="EMA 7 / 21" v={`${fmtPrice(i.ma.ema7)} / ${fmtPrice(i.ma.ema21)}`} />
        <KV k="EMA 50 / 200" v={`${fmtPrice(i.ma.ema50)} / ${fmtPrice(i.ma.ema200)}`} />
      </Tile>
      <Tile icon={<GitCompare className="h-4 w-4" />} title="Cruzamentos">
        <KV k="EMA 7 × 21" v={i.ma.emaCross ? (i.ma.emaCross === 'up' ? 'Alta recente' : 'Baixa recente') : (i.ma.ema7 ?? 0) > (i.ma.ema21 ?? 0) ? 'EMA 7 acima' : 'EMA 7 abaixo'} tone={(i.ma.ema7 ?? 0) > (i.ma.ema21 ?? 0) ? 'text-up' : 'text-down'} />
        <KV k="Próximo (7×21)" v={projection(i.ma.emaProjection)} />
        <KV k="SMA 50 × 200" v={i.ma.goldenState === 'golden' ? 'Dourado' : i.ma.goldenState === 'death' ? 'Da morte' : '—'} tone={i.ma.goldenState === 'golden' ? 'text-up' : 'text-down'} />
        <KV k="Próximo (50×200)" v={projection(i.ma.smaProjection)} />
      </Tile>
      <Tile icon={<Target className="h-4 w-4" />} title="Bull Market Support Band">
        {i.bmsb.status ? (
          <>
            <div className={cx('font-display text-xl font-bold', i.bmsb.status === 'acima' ? 'text-up' : i.bmsb.status === 'abaixo' ? 'text-down' : 'text-warn')}>Preço {i.bmsb.status} da banda</div>
            <KV k="SMA 20 sem." v={fmtPrice(i.bmsb.sma20)} />
            <KV k="EMA 21 sem." v={fmtPrice(i.bmsb.ema21)} />
          </>
        ) : <p className="text-sm text-muted">Histórico semanal insuficiente.</p>}
      </Tile>
      <Tile icon={<GaugeIcon className="h-4 w-4" />} title="ADX (14)">
        <div className="font-display text-2xl font-bold">{fmtNum(i.adx.adx)}</div>
        <div className="text-sm text-muted">{i.adx.label}</div>
        <KV k="+DI" v={fmtNum(i.adx.plusDI)} tone="text-up" />
        <KV k="-DI" v={fmtNum(i.adx.minusDI)} tone="text-down" />
      </Tile>
      <Tile icon={<Sparkles className="h-4 w-4" />} title="ATR (14)">
        <div className="font-display text-2xl font-bold">{fmtPrice(i.atr.value)}</div>
        <div className="text-sm text-muted">{fmtNum(i.atr.pct)}% do preço · volatilidade {i.atr.class}</div>
        <KV k="Stop long (2×)" v={fmtPrice(i.atr.stopLong)} tone="text-down" />
        <KV k="Stop short (2×)" v={fmtPrice(i.atr.stopShort)} tone="text-down" />
        <KV k="Variação 14 velas" v={fmtPct(i.atr.change, 0)} />
      </Tile>
      <Tile icon={<Cloud className="h-4 w-4" />} title="Nuvem Ichimoku">
        <div className={cx('font-display text-lg font-bold', i.ichimoku.position === 'acima' ? 'text-up' : i.ichimoku.position === 'abaixo' ? 'text-down' : 'text-warn')}>Preço {i.ichimoku.position} da nuvem</div>
        <KV k="Tenkan / Kijun" v={`${fmtPrice(i.ichimoku.tenkan)} / ${fmtPrice(i.ichimoku.kijun)}`} />
        <KV k="Nuvem" v={i.ichimoku.cloud === 'alta' ? 'Verde (alta)' : 'Vermelha (baixa)'} tone={i.ichimoku.cloud === 'alta' ? 'text-up' : 'text-down'} />
        <KV k="Chikou" v={i.ichimoku.chikou ?? '—'} />
        {i.ichimoku.twist && <span className="chip-info mt-1">Torção de {i.ichimoku.twist}</span>}
        {i.ichimoku.edgeAlert && <span className="chip-warn ml-1 mt-1">A 2% da borda</span>}
      </Tile>
      <Tile icon={<BarChart3 className="h-4 w-4" />} title="Volume (OBV / VWAP)">
        <KV k="Volume relativo" v={`${fmtNum(i.volume.relative)}×`} tone={i.volume.spike ? 'text-warn' : undefined} />
        <KV k="OBV" v={i.volume.obvTrend === 'alta' ? 'Acumulação' : 'Distribuição'} tone={i.volume.obvTrend === 'alta' ? 'text-up' : 'text-down'} />
        <KV k="VWAP (50)" v={fmtPrice(i.volume.vwap)} tone={a.price > (i.volume.vwap ?? 0) ? 'text-up' : 'text-down'} />
        <KV k="Tendência" v={i.volume.trend} />
        {i.volume.spike && <span className="chip-warn">Pico de volume (2×+)</span>}
      </Tile>
      <Tile icon={<Activity className="h-4 w-4" />} title="Estocástico (14, 3)">
        <KV k="%K" v={fmtNum(i.stochastic.k)} tone={(i.stochastic.k ?? 50) < 20 ? 'text-up' : (i.stochastic.k ?? 50) > 80 ? 'text-down' : undefined} />
        <KV k="%D" v={fmtNum(i.stochastic.d)} />
        <KV k="Volatilidade (largura BB)" v={`${fmtNum(i.volatility.width)}% · ${i.volatility.class}`} />
        {i.correlation != null && <KV k="Correlação c/ BTC (30)" v={fmtNum(i.correlation)} />}
      </Tile>
      <Tile icon={<Layers className="h-4 w-4" />} title="Suporte e resistência">
        {i.levels.resistances.slice(0, 2).reverse().map((l, k) => <KV key={'r' + k} k={`Resistência (${l.touches} toques)`} v={fmtPrice(l.price)} tone="text-down" />)}
        {i.levels.supports.slice(0, 2).map((l, k) => <KV key={'s' + k} k={`Suporte (${l.touches} toques)`} v={fmtPrice(l.price)} tone="text-up" />)}
        <div className="mt-2 border-t border-line pt-2 text-xs text-muted">Pivô clássico: {fmtPrice(i.levels.pivots.p)} · R1 {fmtPrice(i.levels.pivots.r1)} · S1 {fmtPrice(i.levels.pivots.s1)}</div>
      </Tile>
      <Tile icon={<Link2 className="h-4 w-4" />} title="Divergências e padrões">
        {i.divergences.length === 0 && i.patterns.length === 0 && <p className="text-sm text-muted">Nenhuma divergência de RSI ou padrão de candle nas últimas velas.</p>}
        {i.divergences.map((d, k) => (
          <div key={k} className="py-1 text-sm"><span className={d.type.endsWith('bull') ? 'chip-up' : 'chip-down'}>{d.type.startsWith('regular') ? 'Regular' : 'Oculta'} {d.type.endsWith('bull') ? 'altista' : 'baixista'}</span> <span className="text-muted">RSI Δ {d.rsiDiff}{d.strong && ' · forte'}</span></div>
        ))}
        {i.patterns.map((p) => (
          <div key={p.key} className="py-1 text-sm"><span className={p.score > 0 ? 'chip-up' : p.score < 0 ? 'chip-down' : 'chip-warn'}>{p.name}</span> <span className="text-muted">{p.score > 0 ? '+' : ''}{p.score} pts</span></div>
        ))}
      </Tile>
    </div>
  );
}

function Strength({ a }: { a: Analysis }) {
  const total = (a.score.buy ?? 0) + (a.score.sell ?? 0) || 1;
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display font-semibold"><Target className="h-5 w-5 text-neon" /> Força do sinal</h2>
        <span className={recTone(a.score.recommendation)}>Líquido {a.score.net > 0 ? '+' : ''}{fmtNum(a.score.net)}</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-up/30 bg-up/5 p-4 text-center"><TrendingUp className="mx-auto h-5 w-5 text-up" /><div className="font-display text-3xl font-bold text-up">{fmtNum(a.score.buy, 1)}</div><div className="text-xs text-muted">Sinais de compra</div></div>
        <div className="rounded-xl border border-down/30 bg-down/5 p-4 text-center"><TrendingDown className="mx-auto h-5 w-5 text-down" /><div className="font-display text-3xl font-bold text-down">{fmtNum(a.score.sell, 1)}</div><div className="text-xs text-muted">Sinais de venda</div></div>
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full">
        <div className="bg-up" style={{ width: `${((a.score.buy ?? 0) / total) * 100}%` }} />
        <div className="bg-down" style={{ width: `${((a.score.sell ?? 0) / total) * 100}%` }} />
      </div>
      {a.modifiers.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">{a.modifiers.map((m) => <span key={m} className="chip-info normal-case">{m}</span>)}</div>
      )}
      <h3 className="mb-2 mt-5 text-sm font-semibold text-muted">Sinais ativos</h3>
      <ul className="divide-y divide-line/70">
        {a.signals.map((s, k) => (
          <li key={k} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              {s.side === 'buy' ? <TrendingUp className="h-4 w-4 shrink-0 text-up" /> : <TrendingDown className="h-4 w-4 shrink-0 text-down" />}
              <div><div>{s.name}</div><div className="text-xs text-muted">{s.detail}</div></div>
            </div>
            <span className={cx('font-mono text-xs font-bold', s.side === 'buy' ? 'text-up' : 'text-down')}>{s.side === 'buy' ? '+' : '−'}{fmtNum(s.weight)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PoolsTab({ a, symbol }: { a: Analysis; symbol: string }) {
  return (
    <section className="card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-display font-semibold"><Droplets className="h-5 w-5 text-neon" /> Faixas sugeridas para {symbol}/USDC</h2>
      <p className="mb-4 text-sm text-muted">A cobertura mostra em quantas das últimas 100 velas o preço ficou dentro da faixa. Com ATR de {fmtNum(a.indicators.atr.pct)}%, a faixa recomendada é a <b className="text-neon">{a.pools.recommended === 'estreita' ? 'estreita' : a.pools.recommended === 'media' ? 'média' : 'ampla'}</b>.</p>
      <div className="grid gap-3 md:grid-cols-3">
        {a.pools.ranges.map((r) => (
          <div key={r.key} className={cx('rounded-2xl border p-4', r.key === a.pools.recommended ? 'border-neon bg-neon/5 shadow-neon-sm' : 'border-line bg-card-2/50')}>
            <div className="flex items-center justify-between"><b>{r.label}</b><span className="chip-muted">±{r.pct}%</span></div>
            <div className="mt-3 text-xs text-muted">Mínimo</div><div className="font-mono font-semibold">{fmtPrice(r.min)}</div>
            <div className="mt-2 text-xs text-muted">Máximo</div><div className="font-mono font-semibold">{fmtPrice(r.max)}</div>
            <div className="mt-3 flex justify-between text-xs"><span className="text-muted">Cobertura histórica</span><b>{r.coverage}%</b></div>
            <Bar value={r.coverage} className="mt-1" />
            {r.key === a.pools.recommended && <div className="mt-3 text-xs font-semibold text-neon">Recomendada para a volatilidade atual</div>}
          </div>
        ))}
      </div>
      <Link href="/pools" className="btn-ghost mt-4">Ver pools sugeridas pela equipe</Link>
    </section>
  );
}
