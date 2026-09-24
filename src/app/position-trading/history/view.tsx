'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Download, Info } from 'lucide-react';
import { fmtDate, fmtNum, fmtPrice } from '@/lib/format';
import { BrainLoader, Breadcrumb, ErrorBox, Pills, Th, TokenIcon, cx, scoreTone, useSort } from '@/components/ui';
import { useJson } from '@/components/use-json';

type Row = { date: string; price: number; rsi: number | null; athDist: number | null; fib: number | null; bmsb: string; support: number | null; volume: number | null; score: number; label: string; tone: string };
type Period = '1m' | '3m' | '6m' | '1y' | '2y' | '4y';

const badge = (s: number | null) => (s == null ? 'chip-muted' : s >= 60 ? 'chip-up' : s >= 40 ? 'chip-warn' : 'chip-down');

export function HistoryView() {
  const router = useRouter();
  const sp = useSearchParams();
  const symbol = (sp.get('symbol') || 'BTC').toUpperCase();
  const [period, setPeriod] = useState<Period>('1y');
  const { data, error, reload } = useJson<{ rows: Row[] }>(`/api/position/history?symbol=${symbol}&period=${period}`);
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const { sorted, sort, toggle } = useSort(rows, { key: 'date', dir: 'desc' });
  const avg = useMemo(() => (rows.length ? rows.reduce((a, r) => a + r.score, 0) / rows.length : 0), [rows]);

  const csv = () => {
    const head = 'data,preco,rsi_1d,dist_ath_pct,fib_pct,bmsb,score_suporte,score_volume,score,recomendacao';
    const body = rows.map((r) => [r.date, r.price, r.rsi ?? '', r.athDist ?? '', r.fib ?? '', r.bmsb, r.support ?? '', r.volume ?? '', r.score, `"${r.label}"`].join(','));
    const blob = new Blob([[head, ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tiger-labs-position-${symbol}-${period}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <Breadcrumb items={[{ href: '/position-trading', label: 'Position Trading' }, { label: 'Histórico' }]} />
      <section className="hero mb-6">
        <h1 className="font-display text-2xl font-bold md:text-4xl">Histórico do Score de Position</h1>
        <p className="mt-2 max-w-3xl text-sm text-fg/80">Score recalculado dia a dia com os dados disponíveis em cada data. Use para ver como o indicador se comportou em topos e fundos anteriores.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href={`/position-trading?symbol=${symbol}`} className="btn-ghost"><ArrowLeft className="h-4 w-4" /> Voltar para análise atual</Link>
          <button onClick={csv} disabled={!rows.length} className="btn-neon"><Download className="h-4 w-4" /> Baixar CSV</button>
        </div>
      </section>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-2">
          {['BTC', 'ETH', 'SOL'].map((s) => (
            <button key={s} onClick={() => router.replace(`/position-trading/history?symbol=${s}`)} className={cx('btn', s === symbol ? 'bg-neon text-on-neon' : 'border border-line bg-card-2/60 text-muted')}>
              <TokenIcon symbol={s} size={18} /> {s}
            </button>
          ))}
        </div>
        <Pills<Period> value={period} onChange={setPeriod} options={[{ value: '1m', label: '1 mês' }, { value: '3m', label: '3 meses' }, { value: '6m', label: '6 meses' }, { value: '1y', label: '1 ano' }, { value: '2y', label: '2 anos' }, { value: '4y', label: '4 anos' }]} />
      </div>

      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !data ? (
        <BrainLoader title="Recalculando o histórico" />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="card p-4"><div className="text-xs text-muted">Dias</div><div className="font-display text-2xl font-bold">{rows.length}</div></div>
            <div className="card p-4"><div className="text-xs text-muted">Score médio</div><div className="font-display text-2xl font-bold">{fmtNum(avg, 0)}</div></div>
            <div className="card p-4"><div className="text-xs text-muted">Dias em zona de compra (≥60)</div><div className="font-display text-2xl font-bold text-up">{rows.filter((r) => r.score >= 60).length}</div></div>
            <div className="card p-4"><div className="text-xs text-muted">Dias perto de topos (&lt;40)</div><div className="font-display text-2xl font-bold text-down">{rows.filter((r) => r.score < 40).length}</div></div>
          </div>
          <ScoreChart rows={rows} />
          <div className="table-wrap mt-4 max-h-[70vh] overflow-y-auto">
            <table className="tbl">
              <thead className="sticky top-0 bg-card">
                <tr>
                  <Th label="Data" k="date" sort={sort} toggle={toggle} />
                  <Th label="Preço" k="price" sort={sort} toggle={toggle} />
                  <Th label="RSI 1D" k="rsi" sort={sort} toggle={toggle} />
                  <Th label="Dist. ATH" k="athDist" sort={sort} toggle={toggle} />
                  <Th label="Fibonacci" k="fib" sort={sort} toggle={toggle} />
                  <th>BMSB</th>
                  <Th label="Suporte" k="support" sort={sort} toggle={toggle} />
                  <Th label="Volume" k="volume" sort={sort} toggle={toggle} />
                  <Th label="Score" k="score" sort={sort} toggle={toggle} />
                  <th>Recomendação</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.date}>
                    <td>{fmtDate(r.date)}</td>
                    <td className="font-mono">{fmtPrice(r.price)}</td>
                    <td>{fmtNum(r.rsi, 1)}</td>
                    <td>-{fmtNum(r.athDist, 1)}%</td>
                    <td>{fmtNum(r.fib, 1)}%</td>
                    <td><span className={r.bmsb === 'abaixo' ? 'chip-up' : r.bmsb === 'dentro' ? 'chip-warn' : 'chip-down'}>{r.bmsb}</span></td>
                    <td><span className={badge(r.support)}>{r.support}</span></td>
                    <td><span className={badge(r.volume)}>{r.volume}</span></td>
                    <td className={cx('font-display text-lg font-bold', `text-${scoreTone(r.score)}`)}>{r.score}</td>
                    <td className="text-xs">{r.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <section className="card mt-6 p-5 text-sm">
        <h2 className="mb-2 flex items-center gap-2 font-semibold"><Info className="h-4 w-4 text-neon" /> Como ler estes dados</h2>
        <ul className="list-disc space-y-1 pl-5 text-fg/80">
          <li>Cada linha mostra o score como ele teria sido calculado naquele dia, sem usar dados futuros.</li>
          <li>No histórico, o RSI multi-timeframe usa o diário e o semanal (o de 4h entra só na análise atual).</li>
          <li>Scores altos por longos períodos costumam aparecer em fases de acumulação; scores baixos, perto de topos de ciclo.</li>
          <li><b className="text-warn">Desempenho passado não garante resultados futuros.</b></li>
        </ul>
      </section>
    </>
  );
}

function ScoreChart({ rows }: { rows: Row[] }) {
  const data = [...rows].reverse();
  if (data.length < 2) return null;
  const W = 900;
  const H = 180;
  const x = (i: number) => (i / (data.length - 1)) * W;
  const pMax = Math.max(...data.map((r) => r.price));
  const pMin = Math.min(...data.map((r) => r.price));
  const score = data.map((r, i) => `${i ? 'L' : 'M'}${x(i)},${H - (r.score / 100) * H}`).join('');
  const price = data.map((r, i) => `${i ? 'L' : 'M'}${x(i)},${H - ((r.price - pMin) / (pMax - pMin || 1)) * H}`).join('');
  return (
    <div className="card p-4">
      <div className="mb-2 flex gap-4 text-xs text-muted"><span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-neon" /> Score</span><span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-muted" /> Preço (escala relativa)</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" preserveAspectRatio="none" role="img" aria-label="Score e preço ao longo do tempo">
        <rect x="0" y="0" width={W} height={H * 0.25} fill="rgb(var(--up) / .06)" />
        <rect x="0" y={H * 0.6} width={W} height={H * 0.4} fill="rgb(var(--down) / .06)" />
        <path d={price} fill="none" stroke="rgb(var(--muted))" strokeWidth="1.2" opacity=".7" vectorEffect="non-scaling-stroke" />
        <path d={score} fill="none" stroke="rgb(var(--neon))" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
