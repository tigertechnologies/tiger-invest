'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, CheckCircle2, History, Trophy } from 'lucide-react';
import type { PositionResult } from '@/lib/market/position';
import { fmtPrice, fmtTime } from '@/lib/format';
import { Bar, Breadcrumb, Disclaimer, ErrorBox, Gauge, Spinner, TokenIcon, cx, scoreTone } from '@/components/ui';
import { useJson } from '@/components/use-json';
import { ExplainModal } from './explain';

export function PositionView() {
  const router = useRouter();
  const symbol = (useSearchParams().get('symbol') || 'BTC').toUpperCase();
  const { data, error, loading, reload } = useJson<PositionResult & { updatedAt: string }>(`/api/position?symbol=${symbol}`);
  const [explain, setExplain] = useState(false);
  const [q, setQ] = useState('');
  const pick = (s: string) => router.replace(`/position-trading?symbol=${s}`, { scroll: false });

  return (
    <>
      <Breadcrumb items={[{ label: 'Position Trading' }]} />
      <section className="hero mb-6">
        <div className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-neon/40 bg-bg/40 px-3 py-1 text-xs font-semibold text-neon">Estratégia de longo prazo</div>
            <h1 className="font-display text-2xl font-bold md:text-4xl">Análise de Position Trading</h1>
            <p className="mt-2 max-w-2xl text-sm text-fg/80 md:text-base">Seis componentes de ciclo resumidos em uma nota de 0 a 100 para identificar zonas de acumulação e de realização de lucro.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={() => setExplain(true)} className="btn-ghost"><BookOpen className="h-4 w-4" /> Como funciona</button>
              <Link href={`/position-trading/history?symbol=${symbol}`} className="btn-ghost"><History className="h-4 w-4" /> Ver dados históricos</Link>
              <Link href="/position-trading/opportunities" className="btn-neon"><Trophy className="h-4 w-4" /> Melhores oportunidades</Link>
            </div>
          </div>
          <div className="justify-self-center">{data ? <Gauge value={data.score} size={220} /> : <div className="grid h-32 w-56 place-items-center"><Spinner /></div>}</div>
        </div>
      </section>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {['BTC', 'ETH', 'SOL', 'BNB'].map((s) => (
          <button key={s} onClick={() => pick(s)} className={cx('btn', s === symbol ? 'bg-neon text-on-neon' : 'border border-line bg-card-2/60 text-muted hover:text-fg')}>
            <TokenIcon symbol={s} size={18} /> {s}
          </button>
        ))}
        <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) pick(q.trim().toUpperCase()); setQ(''); }} className="flex gap-2">
          <input className="input w-36" placeholder="Outro token" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-ghost">Analisar</button>
        </form>
        {loading && <Spinner />}
      </div>

      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !data ? null : (
        <>
          <section className="card mb-6 grid gap-6 p-6 md:grid-cols-3">
            <div>
              <div className="flex items-center gap-2"><TokenIcon symbol={data.symbol} size={28} /><h2 className="font-display text-2xl font-bold">{data.symbol}</h2></div>
              <div className="mt-2 font-display text-3xl font-bold">{fmtPrice(data.price)}</div>
              <div className="text-xs text-muted">ATH {fmtPrice(data.ath)} · atualizado {fmtTime(data.updatedAt)}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Pontuação</div>
              <div className={cx('font-display text-5xl font-bold', `text-${scoreTone(data.score)}`)}>{data.score}<span className="text-lg text-muted">/100</span></div>
              <div className={cx('mt-1 font-semibold', data.tone === 'up' ? 'text-up' : data.tone === 'warn' ? 'text-warn' : 'text-down')}>{data.label}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Indicadores favoráveis</div>
              <div className="font-display text-5xl font-bold">{data.favorable}<span className="text-lg text-muted">/6</span></div>
              <div className="mt-2 flex gap-1">{data.components.map((c) => <span key={c.key} className={cx('h-2 flex-1 rounded-full', c.score >= 60 ? 'bg-up' : 'bg-card-2')} />)}</div>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.components.map((c) => (
              <div key={c.key} className="card p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{c.label}</h3>
                    <div className="text-xs text-muted">Peso {Math.round(c.weight * 100)}%</div>
                  </div>
                  <span className="font-mono text-sm text-muted">{c.value}</span>
                </div>
                <div className={cx('mt-3 font-display text-3xl font-bold', `text-${scoreTone(c.score)}`)}>{c.score}</div>
                <Bar value={c.score} tone={scoreTone(c.score)} className="mt-2" />
                <p className="mt-3 flex items-start gap-2 text-sm text-fg/80">{c.score >= 60 && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-up" />}{c.diagnosis}</p>
                {c.key === 'rsi' && (
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    {([['4h', data.rsi.h4], ['1D', data.rsi.d1], ['1W', data.rsi.w1]] as const).map(([k, v]) => (
                      <div key={k} className="card-2 py-2"><div className="text-muted">{k}</div><div className="font-mono font-bold">{v ?? '—'}</div></div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      <Disclaimer className="mt-6" />
      {explain && <ExplainModal onClose={() => setExplain(false)} />}
    </>
  );
}
