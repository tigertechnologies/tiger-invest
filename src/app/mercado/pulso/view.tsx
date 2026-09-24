'use client';
import { Activity, ArrowDownRight, ArrowUpRight, Droplets, Flame, Gauge as GaugeIcon, Layers, PieChart, Search } from 'lucide-react';
import { fmtCompact, fmtPct } from '@/lib/format';
import { BrainLoader, Breadcrumb, Disclaimer, Donut, ErrorBox, Gauge, Hero, SectionTitle, TokenIcon, cx } from '@/components/ui';
import { Sparkline } from '@/components/charts';
import { useJson } from '@/components/use-json';

type Coin = { symbol: string; name: string; image?: string; ch24: number | null; ch7d?: number | null; vol?: number; mcap?: number; rank?: number | null };
type Cat = { name: string; chg24: number; mcap: number };
type Pulse = {
  fng: number | null; fngLabel: string; btcDom: number | null; totalChg24: number | null; domDir: 'btc' | 'alts' | 'neutro';
  breadth: number | null; majors: Coin[]; hype: Coin[]; trending?: Coin[]; narratives: { up: Cat[]; down: Cat[] } | [];
  score: number | null; regime: 'acumular' | 'neutro' | 'distribuir'; regimeLabel: string;
};
type Monitor = {
  regime: { totalMcap: number; btc: number; eth: number; stableDom: number; alt: number; mcapChange24h: number | null } | null;
  chains: { name: string; tvl: number; d7: number | null; d30: number | null; spark: number[] }[];
  stables: { total: number; d30: number | null; spark: number[] } | null;
  fng: { value: number; label: string; spark: number[] } | null;
};

const FNG_PT: Record<string, string> = { 'Extreme Fear': 'Medo extremo', Fear: 'Medo', Neutral: 'Neutro', Greed: 'Ganância', 'Extreme Greed': 'Ganância extrema' };
const pctCls = (v: number | null | undefined) => (v == null ? 'text-muted' : v >= 0 ? 'text-up' : 'text-down');

export function PulsoView() {
  const { data: p, error, reload } = useJson<Pulse>('/api/pulse', 5 * 60_000);
  const { data: m } = useJson<Monitor>('/api/monitor', 15 * 60_000);
  const nar = p && !Array.isArray(p.narratives) ? p.narratives : null;

  return (
    <>
      <Breadcrumb items={[{ label: 'Mercado' }, { label: 'Pulso do Mercado' }]} />
      <Hero
        badge={<><Activity className="h-3.5 w-3.5" /> Termômetro de ciclo</>}
        title="Pulso do Mercado"
        subtitle="Sentimento, amplitude, dominância e para onde o capital está fluindo agora. Leitura contrária: medo extremo costuma ser zona de acumulação; ganância extrema, de distribuição."
        kpis={[
          { icon: <GaugeIcon className="h-5 w-5" />, value: p?.fng ?? '—', label: `Fear & Greed · ${FNG_PT[p?.fngLabel ?? ''] ?? (p?.fngLabel || '—')}` },
          { icon: <PieChart className="h-5 w-5" />, value: p?.btcDom != null ? `${p.btcDom.toFixed(1)}%` : '—', label: 'Dominância do BTC' },
          { icon: <Activity className="h-5 w-5" />, value: p?.breadth != null ? `${p.breadth}%` : '—', label: 'Top 250 no verde (24h)' },
          { icon: <Layers className="h-5 w-5" />, value: p?.totalChg24 != null ? fmtPct(p.totalChg24) : '—', label: 'Market cap total 24h' },
        ]}
      />

      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !p ? (
        <BrainLoader title="Medindo o pulso do mercado" />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card flex flex-col items-center p-6 text-center">
              <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted">Termômetro Tiger</div>
              <Gauge value={p.score ?? 50} label="CICLO" size={220} />
              <span className={cx('mt-2', p.regime === 'acumular' ? 'chip-up' : p.regime === 'distribuir' ? 'chip-down' : 'chip-warn')}>
                {p.regime === 'acumular' ? 'ACUMULAR' : p.regime === 'distribuir' ? 'DISTRIBUIR' : 'NEUTRO'}
              </span>
              <p className="mt-3 text-sm text-fg/80">{p.regimeLabel}</p>
            </div>

            <div className="card p-6">
              <SectionTitle icon={<PieChart className="h-5 w-5" />}>Pra onde vai o capital</SectionTitle>
              <div className={cx('mb-4 rounded-xl border px-3 py-2 text-sm', p.domDir === 'btc' ? 'border-warn/40 bg-warn/10' : p.domDir === 'alts' ? 'border-up/40 bg-up/10' : 'border-line bg-card-2/50')}>
                {p.domDir === 'btc'
                  ? 'BTC batendo o mercado: capital se concentrando no Bitcoin (postura defensiva).'
                  : p.domDir === 'alts'
                    ? 'Mercado batendo o BTC: capital rotacionando para altcoins.'
                    : 'Sem rotação clara entre BTC e altcoins agora.'}
              </div>
              {m?.regime ? (
                <Donut
                  half
                  size={220}
                  data={[
                    { name: 'BTC', pct: Math.round(m.regime.btc) },
                    { name: 'ETH', pct: Math.round(m.regime.eth) },
                    { name: 'Stables', pct: Math.round(m.regime.stableDom) },
                    { name: 'Alts', pct: Math.round(m.regime.alt) },
                  ]}
                  center={<div className="font-display text-lg font-bold">{fmtCompact(m.regime.totalMcap)}</div>}
                />
              ) : (
                <div className="h-32 animate-pulse rounded-xl bg-card-2/60" />
              )}
            </div>

            <div className="card p-6">
              <SectionTitle icon={<Activity className="h-5 w-5" />}>Majors</SectionTitle>
              <div className="space-y-3">
                {p.majors.map((c) => (
                  <div key={c.symbol} className="flex items-center gap-3">
                    <TokenIcon symbol={c.symbol} src={c.image} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{c.symbol}</div>
                      <div className="truncate text-xs text-muted">{c.name}</div>
                    </div>
                    <div className="text-right text-sm">
                      <div className={cx('font-mono font-bold', pctCls(c.ch24))}>{fmtPct(c.ch24)}</div>
                      <div className={cx('font-mono text-xs', pctCls(c.ch7d))}>7d {fmtPct(c.ch7d ?? null)}</div>
                    </div>
                  </div>
                ))}
              </div>
              {m?.fng && (
                <div className="mt-5 border-t border-line pt-4">
                  <div className="mb-1 flex items-center justify-between text-xs text-muted">
                    <span>Fear & Greed · 30 dias</span>
                    <b className="text-fg">{m.fng.value}</b>
                  </div>
                  <Sparkline data={m.fng.spark} width={260} height={44} tone="neon" />
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-6">
              <SectionTitle icon={<Flame className="h-5 w-5" />}>Em hype (maiores altas 24h)</SectionTitle>
              <CoinList coins={p.hype} showVol />
            </div>
            <div className="card p-6">
              <SectionTitle icon={<Search className="h-5 w-5" />}>Mais buscadas agora</SectionTitle>
              {p.trending?.length ? <CoinList coins={p.trending} showRank /> : <p className="text-sm text-muted">Sem dados de tendência agora.</p>}
            </div>
          </div>

          {nar && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="card p-6">
                <SectionTitle icon={<ArrowUpRight className="h-5 w-5" />}>Narrativas recebendo capital</SectionTitle>
                <CatList cats={nar.up} />
              </div>
              <div className="card p-6">
                <SectionTitle icon={<ArrowDownRight className="h-5 w-5" />}>Narrativas perdendo capital</SectionTitle>
                <CatList cats={nar.down} />
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card min-w-0 p-6 lg:col-span-2">
              <SectionTitle icon={<Layers className="h-5 w-5" />}>Fluxo de capital por rede (TVL)</SectionTitle>
              {!m ? (
                <div className="h-40 animate-pulse rounded-xl bg-card-2/60" />
              ) : (
                <div className="table-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Rede</th>
                        <th>TVL</th>
                        <th>7d</th>
                        <th>30d</th>
                        <th className="hidden sm:table-cell">Tendência</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.chains.map((c) => (
                        <tr key={c.name}>
                          <td className="font-semibold">{c.name}</td>
                          <td className="font-mono">{fmtCompact(c.tvl)}</td>
                          <td className={cx('font-mono', pctCls(c.d7))}>{fmtPct(c.d7)}</td>
                          <td className={cx('font-mono', pctCls(c.d30))}>{fmtPct(c.d30)}</td>
                          <td className="hidden sm:table-cell">
                            <Sparkline data={c.spark} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="card p-6">
              <SectionTitle icon={<Droplets className="h-5 w-5" />}>Pólvora seca</SectionTitle>
              <p className="mb-3 text-sm text-muted">Oferta total de stablecoins: dinheiro pronto para entrar no mercado.</p>
              {m?.stables ? (
                <>
                  <div className="font-display text-3xl font-bold">{fmtCompact(m.stables.total)}</div>
                  <div className={cx('mb-3 font-mono text-sm', pctCls(m.stables.d30))}>{fmtPct(m.stables.d30)} em 30 dias</div>
                  <Sparkline data={m.stables.spark} width={280} height={70} tone="neon" />
                  <p className="mt-3 text-xs text-muted">
                    {(m.stables.d30 ?? 0) > 0 ? 'Oferta crescendo: combustível para alta chegando.' : 'Oferta encolhendo: menos liquidez nova entrando.'}
                  </p>
                </>
              ) : (
                <div className="h-32 animate-pulse rounded-xl bg-card-2/60" />
              )}
            </div>
          </div>
          <Disclaimer />
        </div>
      )}
    </>
  );
}

function CoinList({ coins, showVol, showRank }: { coins: Coin[]; showVol?: boolean; showRank?: boolean }) {
  return (
    <div className="divide-y divide-line/60">
      {coins.map((c) => (
        <div key={c.symbol + c.name} className="flex items-center gap-3 py-2.5">
          <TokenIcon symbol={c.symbol} src={c.image} size={28} />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{c.symbol}</div>
            <div className="truncate text-xs text-muted">
              {c.name}
              {showRank && c.rank ? ` · #${c.rank}` : ''}
              {showVol && c.vol ? ` · vol ${fmtCompact(c.vol)}` : ''}
            </div>
          </div>
          <div className={cx('font-mono text-sm font-bold', pctCls(c.ch24))}>{c.ch24 == null ? '—' : fmtPct(c.ch24)}</div>
        </div>
      ))}
    </div>
  );
}

function CatList({ cats }: { cats: Cat[] }) {
  const max = Math.max(...cats.map((c) => Math.abs(c.chg24)), 1);
  return (
    <div className="space-y-3">
      {cats.map((c) => (
        <div key={c.name}>
          <div className="mb-1 flex items-center justify-between gap-2 text-sm">
            <span className="truncate font-medium">{c.name}</span>
            <span className={cx('font-mono font-bold', pctCls(c.chg24))}>{fmtPct(c.chg24)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-card-2">
            <div className={cx('h-full rounded-full', c.chg24 >= 0 ? 'bg-up' : 'bg-down')} style={{ width: `${(Math.abs(c.chg24) / max) * 100}%` }} />
          </div>
          <div className="mt-0.5 text-xs text-muted">mcap {fmtCompact(c.mcap)}</div>
        </div>
      ))}
    </div>
  );
}
