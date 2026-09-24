'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, BarChart3, Clock, Shield, ShieldAlert } from 'lucide-react';
import type { MarketRow } from '@/lib/market/scanners';
import { fmtPct, fmtPrice, fmtTime } from '@/lib/format';
import { BrainLoader, Breadcrumb, Disclaimer, Empty, ErrorBox, Hero, Pills, Th, TokenIcon, cx, useSort } from '@/components/ui';
import { useJson } from '@/components/use-json';

type Row = { key: string; symbol: string; price: number; level: number; distPct: number; type: 'support' | 'resistance'; touches: number; strength: number; change24h: number };

export function SrView() {
  const { data, error, reload } = useJson<{ rows: MarketRow[]; updatedAt: string }>('/api/scanner/market', 5 * 60_000);
  const [filter, setFilter] = useState<'all' | 'support' | 'resistance'>('all');
  const rows = useMemo<Row[]>(
    () =>
      (data?.rows ?? []).flatMap((r) =>
        r.levels.map((l, i) => ({ key: `${r.symbol}-${i}`, symbol: r.symbol, price: r.price, level: l.price, distPct: l.distPct, type: l.type, touches: l.touches, strength: l.strength, change24h: r.change24h })),
      ),
    [data],
  );
  const shown = rows.filter((r) => filter === 'all' || r.type === filter);
  const { sorted, sort, toggle } = useSort(shown, { key: 'distPct', dir: 'asc' });
  const sup = rows.filter((r) => r.type === 'support').length;

  return (
    <>
      <Breadcrumb items={[{ label: 'Suporte e Resistência' }]} />
      <Hero
        title="Suporte e Resistência"
        subtitle="Níveis com 3 ou mais toques a até ±2% do preço atual, no gráfico de 4 horas. Um token pode aparecer mais de uma vez."
        kpis={[
          { icon: <Shield className="h-5 w-5" />, value: data ? sup : '—', label: 'Suportes fortes' },
          { icon: <ShieldAlert className="h-5 w-5" />, value: data ? rows.length - sup : '—', label: 'Resistências fortes' },
          { icon: <BarChart3 className="h-5 w-5" />, value: data ? rows.length : '—', label: 'Total de sinais' },
          { icon: <Clock className="h-5 w-5" />, value: data ? fmtTime(data.updatedAt) : '—', label: 'Última atualização' },
        ]}
      />
      <div className="mb-4">
        <Pills value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Todos' }, { value: 'support', label: 'Suporte' }, { value: 'resistance', label: 'Resistência' }]} />
      </div>
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !data ? (
        <BrainLoader title="Mapeando suportes e resistências" />
      ) : sorted.length === 0 ? (
        <Empty>Nenhum nível forte perto do preço agora.</Empty>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th className="w-10" />
                <Th label="Token" k="symbol" sort={sort} toggle={toggle} />
                <Th label="Preço" k="price" sort={sort} toggle={toggle} />
                <Th label="Nível" k="level" sort={sort} toggle={toggle} />
                <Th label="Distância" k="distPct" sort={sort} toggle={toggle} />
                <th>Tipo</th>
                <Th label="Toques" k="touches" sort={sort} toggle={toggle} />
                <Th label="24h" k="change24h" sort={sort} toggle={toggle} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const s = r.type === 'support';
                return (
                  <tr key={r.key} className={s ? 'bg-up/[0.05]' : 'bg-down/[0.05]'}>
                    <td>{s ? <ArrowUp className="h-4 w-4 text-up" /> : <ArrowDown className="h-4 w-4 text-down" />}</td>
                    <td><Link href={`/?symbol=${r.symbol}&interval=4h`} className="flex items-center gap-2 font-semibold hover:text-neon"><TokenIcon symbol={r.symbol} size={22} />{r.symbol}</Link></td>
                    <td className="font-mono">{fmtPrice(r.price)}</td>
                    <td className="font-mono font-semibold">{fmtPrice(r.level)}</td>
                    <td className={cx('font-semibold', s ? 'text-up' : 'text-down')}>{fmtPct(r.distPct)}</td>
                    <td><span className={s ? 'chip-up' : 'chip-down'}>{s ? 'Suporte' : 'Resistência'}</span></td>
                    <td>{r.touches}</td>
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
