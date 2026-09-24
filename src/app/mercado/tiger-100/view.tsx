'use client';
import { useState } from 'react';
import { BarChart3, GitCompareArrows, LineChart as LineIcon, PieChart, TrendingDown, TrendingUp } from 'lucide-react';
import { fmtCompact, fmtNum, fmtPct, fmtPrice } from '@/lib/format';
import { BrainLoader, Breadcrumb, Disclaimer, ErrorBox, Hero, Pills, SectionTitle, Spinner, TokenIcon, cx } from '@/components/ui';
import { LineChart } from '@/components/charts';
import { useJson } from '@/components/use-json';

type Comp = { id: string; symbol: string; name: string; img: string; price: number; ch24: number | null; ch7d: number | null; weight: number; rank: number };
type T100 = {
  level: number; ret24?: number; ret7d?: number; up?: number; down?: number; count?: number; totalMcap?: number; btcDom?: number | null;
  gainers?: Comp[]; losers?: Comp[]; composition?: Comp[]; history: { snap_date: string; level: number; real: boolean }[]; snapCount: number;
};
type Cmp = {
  a: string; b: string; dates: string[]; seriesA?: number[]; seriesB?: number[]; perfA?: number; perfB?: number;
  correlation: number | null; points?: number; confidence?: string; note?: string; error?: string;
};

const ASSETS = [
  { v: 'tiger100', l: 'Tiger 100' },
  { v: 'bitcoin', l: 'Bitcoin' },
  { v: 'ethereum', l: 'Ethereum' },
  { v: 'solana', l: 'Solana' },
  { v: 'nasdaq', l: 'NASDAQ 100' },
  { v: 'sp500', l: 'S&P 500' },
  { v: 'gold', l: 'Ouro' },
];
const pctCls = (v: number | null | undefined) => (v == null ? 'text-muted' : v >= 0 ? 'text-up' : 'text-down');
const dLabel = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

function corrRead(c: number | null) {
  if (c == null) return '—';
  const a = Math.abs(c);
  const k = a >= 0.7 ? 'forte' : a >= 0.4 ? 'moderada' : a >= 0.2 ? 'fraca' : 'quase nula';
  return `${c >= 0 ? 'Correlação positiva' : 'Correlação negativa'} ${k}`;
}

export function Tiger100View() {
  const { data: d, error, reload } = useJson<T100>('/api/tiger100', 5 * 60_000);
  const hist = d?.history ?? [];

  return (
    <>
      <Breadcrumb items={[{ label: 'Mercado' }, { label: 'Índice Tiger 100' }]} />
      <Hero
        badge={<><BarChart3 className="h-3.5 w-3.5" /> Base 1.000</>}
        title="Índice Tiger 100"
        subtitle="As 100 maiores criptos em um só número. Peso por capitalização com teto de 15% por moeda (o BTC não engole o índice) e leve inclinação para quem tem momentum na semana."
        kpis={[
          { icon: <LineIcon className="h-5 w-5" />, value: d ? fmtNum(d.level, 0) : '—', label: 'Nível do índice' },
          { icon: <TrendingUp className="h-5 w-5" />, value: <span className={pctCls(d?.ret24)}>{d?.ret24 != null ? fmtPct(d.ret24) : '—'}</span>, label: `24h · 7d ${d?.ret7d != null ? fmtPct(d.ret7d) : '—'}` },
          { icon: <PieChart className="h-5 w-5" />, value: d?.up != null ? `${d.up}/${d.count}` : '—', label: 'Componentes no verde' },
          { icon: <BarChart3 className="h-5 w-5" />, value: d?.totalMcap ? fmtCompact(d.totalMcap) : '—', label: `Market cap · BTC ${d?.btcDom != null ? d.btcDom.toFixed(1) + '%' : '—'}` },
        ]}
      />
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !d ? (
        <BrainLoader title="Calculando o índice" />
      ) : (
        <div className="space-y-6">
          <div className="card p-5">
            <SectionTitle icon={<LineIcon className="h-5 w-5" />} right={<span className="chip-muted">{d.snapCount ? `${d.snapCount} dias registrados` : 'histórico reconstruído'}</span>}>
              Histórico do Tiger 100
            </SectionTitle>
            <LineChart labels={hist.map((h) => dLabel(h.snap_date))} series={[{ name: 'Tiger 100', data: hist.map((h) => h.level) }]} format={(v) => fmtNum(v, 0)} />
            <p className="mt-2 text-xs text-muted">
              O período anterior aos registros diários é reconstruído a partir das 12 maiores moedas (aproximação). O cron diário grava o valor oficial todos os dias.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <MoverCard title="Puxando para cima" icon={<TrendingUp className="h-5 w-5" />} list={d.gainers ?? []} />
            <MoverCard title="Puxando para baixo" icon={<TrendingDown className="h-5 w-5" />} list={d.losers ?? []} />
          </div>

          <div className="card p-5">
            <SectionTitle icon={<PieChart className="h-5 w-5" />}>Maiores pesos do índice</SectionTitle>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Ativo</th>
                    <th>Peso</th>
                    <th>Preço</th>
                    <th>24h</th>
                    <th className="hidden sm:table-cell">7d</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.composition ?? []).map((c) => (
                    <tr key={c.id}>
                      <td className="text-muted">{c.rank}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <TokenIcon symbol={c.symbol} src={c.img} size={24} />
                          <b>{c.symbol}</b>
                          <span className="hidden text-xs text-muted md:inline">{c.name}</span>
                        </div>
                      </td>
                      <td className="min-w-[140px]">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-card-2">
                            <div className="h-full rounded-full bg-gradient-to-r from-neon to-lime" style={{ width: `${(c.weight / 15) * 100}%` }} />
                          </div>
                          <span className="w-12 text-right font-mono text-xs">{c.weight.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="font-mono">{fmtPrice(c.price)}</td>
                      <td className={cx('font-mono', pctCls(c.ch24))}>{fmtPct(c.ch24)}</td>
                      <td className={cx('hidden font-mono sm:table-cell', pctCls(c.ch7d))}>{fmtPct(c.ch7d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Comparator />
          <Disclaimer />
        </div>
      )}
    </>
  );
}

function MoverCard({ title, icon, list }: { title: string; icon: React.ReactNode; list: Comp[] }) {
  return (
    <div className="card p-5">
      <SectionTitle icon={icon}>{title}</SectionTitle>
      <div className="divide-y divide-line/60">
        {list.map((c) => (
          <div key={c.id} className="flex items-center gap-3 py-2">
            <TokenIcon symbol={c.symbol} src={c.img} size={26} />
            <div className="min-w-0 flex-1">
              <b>{c.symbol}</b> <span className="text-xs text-muted">{c.name}</span>
            </div>
            <span className="font-mono text-xs text-muted">peso {c.weight.toFixed(2)}%</span>
            <span className={cx('w-20 text-right font-mono font-bold', pctCls(c.ch24))}>{fmtPct(c.ch24)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Comparator() {
  const [a, setA] = useState('tiger100');
  const [b, setB] = useState('nasdaq');
  const [days, setDays] = useState<'30' | '90' | '180' | '365'>('90');
  const { data, error, loading } = useJson<Cmp>(a !== b ? `/api/compare?a=${a}&b=${b}&days=${days}` : null);
  return (
    <div className="card p-5">
      <SectionTitle icon={<GitCompareArrows className="h-5 w-5" />}>Comparador: cripto x bolsa x ouro</SectionTitle>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={a} onChange={(e) => setA(e.target.value)} aria-label="Ativo A">
          {ASSETS.map((x) => (
            <option key={x.v} value={x.v}>
              {x.l}
            </option>
          ))}
        </select>
        <span className="text-muted">vs</span>
        <select className="input w-auto" value={b} onChange={(e) => setB(e.target.value)} aria-label="Ativo B">
          {ASSETS.map((x) => (
            <option key={x.v} value={x.v}>
              {x.l}
            </option>
          ))}
        </select>
        <Pills
          value={days}
          onChange={setDays}
          options={[
            { value: '30', label: '30d' },
            { value: '90', label: '90d' },
            { value: '180', label: '180d' },
            { value: '365', label: '1a' },
          ]}
        />
      </div>
      {a === b ? (
        <p className="text-sm text-muted">Escolha dois ativos diferentes.</p>
      ) : error ? (
        <p className="text-sm text-down">{error}</p>
      ) : loading || !data ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted">
          <Spinner /> Cruzando as séries…
        </div>
      ) : !data.dates.length ? (
        <p className="py-8 text-center text-sm text-muted">{data.note || 'Sem dados suficientes agora.'}</p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="kpi flex-col items-start">
              <div className="text-xs text-muted">{data.a}</div>
              <div className={cx('font-display text-xl font-bold', pctCls(data.perfA))}>{fmtPct(data.perfA ?? null)}</div>
            </div>
            <div className="kpi flex-col items-start">
              <div className="text-xs text-muted">{data.b}</div>
              <div className={cx('font-display text-xl font-bold', pctCls(data.perfB))}>{fmtPct(data.perfB ?? null)}</div>
            </div>
            <div className="kpi col-span-2 flex-col items-start">
              <div className="text-xs text-muted">Correlação dos retornos diários ({data.points} pontos · {data.confidence})</div>
              <div className="font-display text-xl font-bold">
                {data.correlation != null ? data.correlation.toFixed(2) : '—'} <span className="text-sm font-medium text-muted">{corrRead(data.correlation)}</span>
              </div>
            </div>
          </div>
          <LineChart
            labels={data.dates.map(dLabel)}
            series={[
              { name: data.a, data: data.seriesA ?? [] },
              { name: data.b, data: data.seriesB ?? [], color: 'rgb(var(--info))' },
            ]}
            area={false}
            format={(v) => fmtNum(v, 1)}
          />
          <p className="mt-2 text-xs text-muted">Séries em base 100 no primeiro dia em comum (só dias em que os dois negociaram).</p>
        </>
      )}
    </div>
  );
}
