'use client';
import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, ChevronDown, Clock, TrendingDown, TrendingUp } from 'lucide-react';
import type { MarketRow } from '@/lib/market/scanners';
import { fmtPrice, fmtTime } from '@/lib/format';
import { BrainLoader, Breadcrumb, Disclaimer, Empty, ErrorBox, Hero, Pills, Th, TokenIcon, cx, useSort } from '@/components/ui';
import { useJson } from '@/components/use-json';

type Row = MarketRow & { reversal: NonNullable<MarketRow['reversal']> };

export function ReversalsView() {
  const { data, error, reload } = useJson<{ rows: MarketRow[]; updatedAt: string }>('/api/scanner/market', 5 * 60_000);
  const [filter, setFilter] = useState<'all' | 'alta' | 'baixa'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => (data?.rows.filter((r) => r.reversal) ?? []) as Row[], [data]);
  const shown = useMemo(() => rows.filter((r) => filter === 'all' || r.reversal.type === filter), [rows, filter]);
  const { sorted, sort, toggle } = useSort(shown, { key: 'score', dir: 'desc' }, {
    score: (r) => r.reversal.score,
    strength: (r) => (r.reversal.strength === 'forte' ? 2 : 1) * Math.sign(r.reversal.score),
    count: (r) => r.reversal.count,
  });
  const up = rows.filter((r) => r.reversal.type === 'alta').length;

  return (
    <>
      <Breadcrumb items={[{ label: 'Sinais de Reversão' }]} />
      <Hero
        title="Scanner de Padrões de Reversão"
        subtitle="Reversões de alta e de baixa em mais de 130 tokens, no gráfico de 4 horas, combinando RSI, divergências, padrões de candle, Bollinger, Estocástico e níveis de suporte e resistência."
        kpis={[
          { icon: <TrendingUp className="h-5 w-5" />, value: data ? up : '—', label: 'Reversões de alta' },
          { icon: <TrendingDown className="h-5 w-5" />, value: data ? rows.length - up : '—', label: 'Reversões de baixa' },
          { icon: <BarChart3 className="h-5 w-5" />, value: data ? rows.length : '—', label: 'Total de sinais' },
          { icon: <Clock className="h-5 w-5" />, value: data ? fmtTime(data.updatedAt) : '—', label: 'Última atualização' },
        ]}
      />
      <div className="mb-4">
        <Pills value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Todos os sinais' }, { value: 'alta', label: 'Apenas alta' }, { value: 'baixa', label: 'Apenas baixa' }]} />
      </div>
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !data ? (
        <BrainLoader title="Procurando reversões" />
      ) : sorted.length === 0 ? (
        <Empty>Nenhum sinal de reversão no momento.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th className="w-10" />
                <Th label="Token" k="symbol" sort={sort} toggle={toggle} />
                <Th label="Preço" k="price" sort={sort} toggle={toggle} />
                <th>Tipo</th>
                <Th label="Força" k="strength" sort={sort} toggle={toggle} />
                <Th label="Pontuação" k="score" sort={sort} toggle={toggle} />
                <Th label="Indicadores" k="count" sort={sort} toggle={toggle} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const up = r.reversal.type === 'alta';
                return (
                  <Fragment key={r.symbol}>
                    <tr className={cx('cursor-pointer transition', up ? 'bg-up/[0.04] hover:bg-up/10' : 'bg-down/[0.04] hover:bg-down/10')} onClick={() => setOpen(open === r.symbol ? null : r.symbol)}>
                      <td><ChevronDown className={cx('h-4 w-4 text-muted transition', open === r.symbol && 'rotate-180')} /></td>
                      <td><Link href={`/?symbol=${r.symbol}&interval=4h`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 font-semibold hover:text-neon"><TokenIcon symbol={r.symbol} size={22} />{r.symbol}</Link></td>
                      <td className="font-mono">{fmtPrice(r.price)}</td>
                      <td><span className={up ? 'chip-up' : 'chip-down'}>{up ? 'Alta' : 'Baixa'}</span></td>
                      <td><span className={r.reversal.strength === 'forte' ? (up ? 'chip-up' : 'chip-down') : 'chip-warn'}>{r.reversal.strength}</span></td>
                      <td className={cx('font-display text-lg font-bold', up ? 'text-up' : 'text-down')}>{r.reversal.score > 0 ? '+' : ''}{r.reversal.score}</td>
                      <td>{r.reversal.count}</td>
                    </tr>
                    {open === r.symbol && (
                      <tr>
                        <td colSpan={7} className="bg-bg-soft/60">
                          <div className="grid gap-2 py-1 md:grid-cols-2">
                            {r.reversal.signals.map((s, i) => (
                              <div key={i} className="card-2 flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                <div><div className="font-medium">{s.name}</div><div className="text-xs text-muted">{s.detail}</div></div>
                                <span className={cx('font-mono text-xs font-bold', up ? 'text-up' : 'text-down')}>{up ? '+' : '−'}{s.weight}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Disclaimer className="mt-6" />
    </>
  );
}
