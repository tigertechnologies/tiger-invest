'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, Clock, TrendingDown, TrendingUp } from 'lucide-react';
import type { MarketRow } from '@/lib/market/scanners';
import { fmtNum, fmtPct, fmtPrice, fmtTime } from '@/lib/format';
import { BrainLoader, Breadcrumb, Disclaimer, Empty, ErrorBox, Hero, Pills, Th, TokenIcon, cx, useSort } from '@/components/ui';
import { useJson } from '@/components/use-json';

const status = (r: number) => (r < 30 ? 'Sobrevenda' : r > 70 ? 'Sobrecompra' : r < 40 ? 'Fraco' : r > 60 ? 'Forte' : 'Neutro');

export function RsiView() {
  const { data, error, reload } = useJson<{ rows: MarketRow[]; updatedAt: string }>('/api/scanner/market', 5 * 60_000);
  const [filter, setFilter] = useState<'all' | 'over' | 'under'>('all');
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => r.rsi != null), [data]);
  const shown = rows.filter((r) => filter === 'all' || (filter === 'under' ? r.rsi! < 30 : r.rsi! > 70));
  const { sorted, sort, toggle } = useSort(shown, { key: 'rsi', dir: 'desc' });
  const under = rows.filter((r) => r.rsi! < 30).length;
  const over = rows.filter((r) => r.rsi! > 70).length;

  return (
    <>
      <Breadcrumb items={[{ label: 'Scanner RSI' }]} />
      <Hero
        title="Scanner RSI"
        subtitle="RSI de 14 períodos no gráfico de 4 horas para mais de 130 tokens. Abaixo de 30 indica sobrevenda; acima de 70, sobrecompra."
        kpis={[
          { icon: <TrendingUp className="h-5 w-5" />, value: data ? under : '—', label: 'Em sobrevenda (<30)' },
          { icon: <TrendingDown className="h-5 w-5" />, value: data ? over : '—', label: 'Em sobrecompra (>70)' },
          { icon: <BarChart3 className="h-5 w-5" />, value: data ? rows.length : '—', label: 'Tokens analisados' },
          { icon: <Clock className="h-5 w-5" />, value: data ? fmtTime(data.updatedAt) : '—', label: 'Última atualização' },
        ]}
      />
      <div className="mb-4">
        <Pills value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Todos' }, { value: 'under', label: `Sobrevenda (${under})` }, { value: 'over', label: `Sobrecompra (${over})` }]} />
      </div>
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !data ? (
        <BrainLoader title="Calculando o RSI" />
      ) : sorted.length === 0 ? (
        <Empty>Nenhum token neste filtro agora.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <Th label="Token" k="symbol" sort={sort} toggle={toggle} />
                <Th label="Preço" k="price" sort={sort} toggle={toggle} />
                <Th label="RSI (4h)" k="rsi" sort={sort} toggle={toggle} />
                <th className="w-48">Nível</th>
                <th>Status</th>
                <Th label="24h" k="change24h" sort={sort} toggle={toggle} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const v = r.rsi!;
                const tone = v < 30 ? 'text-up' : v > 70 ? 'text-down' : 'text-fg';
                return (
                  <tr key={r.symbol} className={cx(v > 70 && 'bg-down/[0.06]', v < 30 && 'bg-up/[0.06]')}>
                    <td><Link href={`/?symbol=${r.symbol}&interval=4h`} className="flex items-center gap-2 font-semibold hover:text-neon"><TokenIcon symbol={r.symbol} size={22} />{r.symbol}</Link></td>
                    <td className="font-mono">{fmtPrice(r.price)}</td>
                    <td className={cx('font-display text-lg font-bold', tone)}>{fmtNum(v, 1)}</td>
                    <td>
                      <div className="relative h-2 rounded-full bg-card-2">
                        <div className="absolute inset-y-0 left-[30%] right-[30%] bg-line/60" />
                        <div className={cx('absolute -top-1 h-4 w-1.5 rounded', v < 30 ? 'bg-up' : v > 70 ? 'bg-down' : 'bg-neon')} style={{ left: `calc(${v}% - 3px)` }} />
                      </div>
                    </td>
                    <td><span className={v < 30 ? 'chip-up' : v > 70 ? 'chip-down' : 'chip-muted'}>{status(v)}</span></td>
                    <td className={r.change24h >= 0 ? 'text-up' : 'text-down'}>{fmtPct(r.change24h)}</td>
                  </tr>
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
