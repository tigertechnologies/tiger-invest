'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, BarChart3, Clock, LayoutGrid, List, TrendingDown, TrendingUp } from 'lucide-react';
import type { OpportunityRow } from '@/lib/market/scanners';
import { fmtCompact, fmtNum, fmtPrice, fmtTime } from '@/lib/format';
import { Bar, BrainLoader, Breadcrumb, Empty, ErrorBox, Hero, Th, TokenIcon, cx, scoreTone, useSort } from '@/components/ui';
import { useJson } from '@/components/use-json';

type Cap = 'all' | '50' | '100' | '200';
const liq = (v: number | null) => (v == null ? null : v >= 10 ? { l: 'Alta', c: 'chip-up' } : v >= 3 ? { l: 'Média', c: 'chip-warn' } : { l: 'Baixa', c: 'chip-down' });

export function OppView() {
  const { data, error, reload } = useJson<{ rows: OpportunityRow[]; updatedAt: string }>('/api/scanner/positions');
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [cap, setCap] = useState<Cap>('all');
  const [grid, setGrid] = useState(false);
  const all = useMemo(() => (data?.rows ?? []).filter((r) => cap === 'all' || (r.rank != null && r.rank <= +cap)), [data, cap]);
  const buy = all.filter((r) => r.score >= 60);
  const sell = all.filter((r) => r.score < 40);
  const list = tab === 'buy' ? buy : sell;
  const { sorted, sort, toggle } = useSort(list, { key: 'score', dir: tab === 'buy' ? 'desc' : 'asc' });

  return (
    <>
      <Breadcrumb items={[{ href: '/position-trading', label: 'Position Trading' }, { label: 'Oportunidades' }]} />
      <Hero
        title="Oportunidades de Position Trading"
        subtitle="Score de ciclo (0-100) calculado para todos os tokens monitorados. Compra: score ≥ 60. Realização de lucro: score < 40."
        kpis={[
          { icon: <BarChart3 className="h-5 w-5" />, value: data ? data.rows.length : '—', label: 'Tokens analisados' },
          { icon: <TrendingUp className="h-5 w-5" />, value: data ? data.rows.filter((r) => r.score >= 60).length : '—', label: 'Oportunidades de compra' },
          { icon: <TrendingDown className="h-5 w-5" />, value: data ? data.rows.filter((r) => r.score < 40).length : '—', label: 'Realização de lucro' },
          { icon: <Clock className="h-5 w-5" />, value: data ? fmtTime(data.updatedAt) : '—', label: 'Última atualização' },
        ]}
      />
      <p className="mb-4 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" /> Esta lista é gerada por indicadores e não é recomendação financeira. Confirme sempre com sua própria análise.</p>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex rounded-xl border border-line bg-card-2/60 p-1">
          <button onClick={() => setTab('buy')} className={cx('btn', tab === 'buy' ? 'bg-up text-on-neon' : 'text-muted')}><TrendingUp className="h-4 w-4" /> Compra <span className="rounded-full bg-bg/30 px-2 text-xs">{buy.length}</span></button>
          <button onClick={() => setTab('sell')} className={cx('btn', tab === 'sell' ? 'bg-down text-white' : 'text-muted')}><TrendingDown className="h-4 w-4" /> Realização de lucro <span className="rounded-full bg-bg/30 px-2 text-xs">{sell.length}</span></button>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted" htmlFor="cap">Market cap</label>
          <select id="cap" className="input w-36" value={cap} onChange={(e) => setCap(e.target.value as Cap)}>
            <option value="all">Todos</option>
            <option value="50">Top 50</option>
            <option value="100">Top 100</option>
            <option value="200">Top 200</option>
          </select>
          <div className="flex rounded-xl border border-line p-1">
            <button onClick={() => setGrid(false)} className={cx('rounded-lg p-1.5', !grid && 'bg-neon/15 text-neon')} aria-label="Lista"><List className="h-4 w-4" /></button>
            <button onClick={() => setGrid(true)} className={cx('rounded-lg p-1.5', grid && 'bg-neon/15 text-neon')} aria-label="Grade"><LayoutGrid className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !data ? (
        <BrainLoader title="Analisando tokens" />
      ) : sorted.length === 0 ? (
        <Empty>Nenhum token nesta categoria com o filtro atual.</Empty>
      ) : grid ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((r) => (
            <Link key={r.symbol} href={`/position-trading?symbol=${r.symbol}`} className="card p-5 transition hover:border-neon/60">
              <div className="flex items-center gap-3"><TokenIcon symbol={r.symbol} src={r.image} size={32} /><div><div className="font-bold">{r.symbol}</div><div className="text-xs text-muted">{r.name}</div></div><div className={cx('ml-auto font-display text-3xl font-bold', `text-${scoreTone(r.score)}`)}>{r.score}</div></div>
              <Bar value={r.score} tone={scoreTone(r.score)} className="mt-3" />
              <div className="mt-3 flex justify-between text-sm"><span className="font-mono">{fmtPrice(r.price)}</span><span className="text-muted">{r.rank ? `#${r.rank} · ` : ''}{fmtCompact(r.marketCap)}</span></div>
              <div className="mt-3 flex flex-wrap gap-1">{r.tags.map((t) => <span key={t} className="chip-muted normal-case">{t}</span>)}</div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <Th label="Token" k="symbol" sort={sort} toggle={toggle} />
                <Th label="Preço" k="price" sort={sort} toggle={toggle} />
                <Th label="Pontuação" k="score" sort={sort} toggle={toggle} />
                <Th label="Market cap" k="marketCap" sort={sort} toggle={toggle} />
                <Th label="Vol/MCap" k="volMcap" sort={sort} toggle={toggle} />
                <th>Classificação</th>
                <th>Indicadores</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const l = liq(r.volMcap);
                return (
                  <tr key={r.symbol}>
                    <td><div className="flex items-center gap-2"><TokenIcon symbol={r.symbol} src={r.image} size={24} /><div><div className="font-semibold">{r.symbol}</div><div className="text-xs text-muted">{r.name}</div></div></div></td>
                    <td className="font-mono">{fmtPrice(r.price)}</td>
                    <td><div className="flex items-center gap-2"><b className={cx('font-display text-lg', `text-${scoreTone(r.score)}`)}>{r.score}</b><Bar value={r.score} tone={scoreTone(r.score)} className="w-16" /></div></td>
                    <td>{fmtCompact(r.marketCap)}{r.rank && <div className="text-xs text-muted">#{r.rank}</div>}</td>
                    <td>{r.volMcap != null ? `${fmtNum(r.volMcap, 1)}%` : '—'} {l && <span className={cx(l.c, 'ml-1')}>{l.l}</span>}</td>
                    <td className="text-xs">{r.label}</td>
                    <td><div className="flex max-w-xs flex-wrap gap-1">{r.tags.map((t) => <span key={t} className="chip-muted normal-case">{t}</span>)}</div></td>
                    <td><Link href={`/position-trading?symbol=${r.symbol}`} className="btn-ghost px-3 py-1 text-xs">Analisar</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
