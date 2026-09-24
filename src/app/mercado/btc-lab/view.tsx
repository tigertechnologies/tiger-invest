'use client';
import { Bitcoin, Blocks, Cpu, Gauge as GaugeIcon, Hourglass, Mountain, Timer, Zap } from 'lucide-react';
import { fmtCompact, fmtNum, fmtPct, fmtPrice } from '@/lib/format';
import { Bar, BrainLoader, Breadcrumb, Disclaimer, ErrorBox, Hero, SectionTitle, cx } from '@/components/ui';
import { LineChart } from '@/components/charts';
import { useJson } from '@/components/use-json';

type Btc = {
  price: number | null; change24h: number | null; change7d: number | null; marketCap: number | null;
  ath: number | null; athChange: number | null; ma200: number | null; mayer: number | null; priceSeries: number[];
  hashrate: number | null; difficulty: number | null; nextAdjustPct: number | null; adjustProgress: number | null; adjustRemaining: number | null;
  fees: { fast: number; halfHour: number; hour: number; economy: number } | null;
  mempoolCount: number | null; mempoolVsize: number | null; height: number | null;
  halvingBlocksLeft: number | null; halvingDays: number | null; halvingDate: string | null;
};

// Leitura do Múltiplo de Mayer (preço / média de 200 dias)
function mayerRead(m: number | null) {
  if (m == null) return { label: '—', tone: 'muted', text: '' };
  if (m < 0.8) return { label: 'Barato histórico', tone: 'up', text: 'Abaixo de 0,8: historicamente zonas de acumulação raras.' };
  if (m < 1) return { label: 'Abaixo da média', tone: 'up', text: 'Preço abaixo da média de 200 dias: desconto.' };
  if (m < 1.5) return { label: 'Faixa justa', tone: 'warn', text: 'Entre 1 e 1,5: mercado em tendência saudável.' };
  if (m < 2.4) return { label: 'Esticado', tone: 'warn', text: 'Acima de 1,5: preço bem acima da média, cautela com aportes grandes.' };
  return { label: 'Euforia', tone: 'down', text: 'Acima de 2,4: historicamente perto de topos de ciclo.' };
}

const hashFmt = (h: number | null) => (h == null ? '—' : `${(h / 1e18).toFixed(0)} EH/s`);

export function BtcLabView() {
  const { data: d, error, reload } = useJson<Btc>('/api/btclab', 2 * 60_000);
  const mr = mayerRead(d?.mayer ?? null);
  const series = d?.priceSeries ?? [];
  const labels = series.map((_, i) => {
    const dt = new Date(Date.now() - (series.length - 1 - i) * 86400000);
    return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  });
  // média móvel "crescente" (média acumulada até o dia) só como referência visual da MA200
  const ma = d?.ma200 ? series.map(() => d.ma200 as number) : [];

  return (
    <>
      <Breadcrumb items={[{ label: 'Mercado' }, { label: 'BTC Lab' }]} />
      <Hero
        badge={<><Bitcoin className="h-3.5 w-3.5" /> On-chain ao vivo</>}
        title="BTC Lab"
        subtitle="O laboratório do Bitcoin: valuation pelo Múltiplo de Mayer, contagem para o halving, taxas da rede, mempool, hashrate e ajuste de dificuldade."
        kpis={[
          { icon: <Bitcoin className="h-5 w-5" />, value: d?.price ? fmtPrice(d.price) : '—', label: `24h ${fmtPct(d?.change24h ?? null)} · 7d ${fmtPct(d?.change7d ?? null)}` },
          { icon: <Mountain className="h-5 w-5" />, value: d?.athChange != null ? fmtPct(d.athChange, 1) : '—', label: `Distância do topo (${d?.ath ? fmtPrice(d.ath) : '—'})` },
          { icon: <GaugeIcon className="h-5 w-5" />, value: d?.mayer != null ? d.mayer.toFixed(2) : '—', label: `Múltiplo de Mayer · ${mr.label}` },
          { icon: <Hourglass className="h-5 w-5" />, value: d?.halvingDays != null ? `${fmtNum(d.halvingDays, 0)} dias` : '—', label: 'Para o próximo halving' },
        ]}
      />
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !d ? (
        <BrainLoader title="Lendo a blockchain do Bitcoin" />
      ) : (
        <div className="space-y-6">
          <div className="card p-5">
            <SectionTitle icon={<Bitcoin className="h-5 w-5" />} right={<span className="chip-muted">200 dias</span>}>
              Preço x média de 200 dias
            </SectionTitle>
            <LineChart
              labels={labels}
              series={[
                { name: 'BTC', data: series },
                ...(ma.length ? [{ name: 'Média 200d', data: ma, color: 'rgb(var(--warn))', dashed: true }] : []),
              ]}
              format={(v) => fmtCompact(v)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="card p-5">
              <SectionTitle icon={<GaugeIcon className="h-5 w-5" />}>Múltiplo de Mayer</SectionTitle>
              <div className={cx('font-display text-4xl font-bold', mr.tone === 'up' ? 'text-up' : mr.tone === 'down' ? 'text-down' : 'text-warn')}>{d.mayer?.toFixed(2) ?? '—'}</div>
              <div className="mb-3 text-sm font-semibold">{mr.label}</div>
              <div className="relative mb-2 h-2 rounded-full bg-gradient-to-r from-up via-warn to-down">
                {d.mayer != null && <span className="absolute -top-1 h-4 w-1.5 rounded bg-fg" style={{ left: `${Math.min(98, (d.mayer / 3) * 100)}%` }} />}
              </div>
              <div className="flex justify-between text-[11px] text-muted">
                <span>0</span>
                <span>1</span>
                <span>2,4</span>
                <span>3+</span>
              </div>
              <p className="mt-3 text-sm text-muted">{mr.text}</p>
              <p className="mt-1 text-xs text-muted">Média 200d: {d.ma200 ? fmtPrice(d.ma200) : '—'}</p>
            </div>

            <div className="card p-5">
              <SectionTitle icon={<Hourglass className="h-5 w-5" />}>Halving</SectionTitle>
              <div className="font-display text-4xl font-bold text-neon">{d.halvingDays != null ? fmtNum(d.halvingDays, 0) : '—'}</div>
              <div className="mb-3 text-sm text-muted">dias (estimativa: {d.halvingDate ? new Date(d.halvingDate + 'T12:00:00').toLocaleDateString('pt-BR') : '—'})</div>
              {d.height != null && d.halvingBlocksLeft != null && (
                <>
                  <Bar value={((210000 - d.halvingBlocksLeft) / 210000) * 100} />
                  <div className="mt-2 flex justify-between text-xs text-muted">
                    <span>Bloco {fmtNum(d.height, 0)}</span>
                    <span>faltam {fmtNum(d.halvingBlocksLeft, 0)}</span>
                  </div>
                </>
              )}
              <p className="mt-3 text-xs text-muted">A cada 210.000 blocos a emissão de novos BTC cai pela metade.</p>
            </div>

            <div className="card p-5">
              <SectionTitle icon={<Zap className="h-5 w-5" />}>Taxas da rede (sat/vB)</SectionTitle>
              {d.fees ? (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['Rápida', d.fees.fast, 'up'],
                    ['30 min', d.fees.halfHour, 'neon'],
                    ['1 hora', d.fees.hour, 'info'],
                    ['Econômica', d.fees.economy, 'muted'],
                  ].map(([l, v]) => (
                    <div key={l as string} className="rounded-xl border border-line bg-card-2/60 p-3 text-center">
                      <div className="font-display text-2xl font-bold">{v as number}</div>
                      <div className="text-xs text-muted">{l as string}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">Sem dados agora.</p>
              )}
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-muted">Mempool</span>
                <b>{d.mempoolCount != null ? `${fmtNum(d.mempoolCount, 0)} tx` : '—'}</b>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Tamanho</span>
                <b>{d.mempoolVsize != null ? `${(d.mempoolVsize / 1e6).toFixed(1)} MvB` : '—'}</b>
              </div>
            </div>

            <div className="card p-5">
              <SectionTitle icon={<Cpu className="h-5 w-5" />}>Hashrate</SectionTitle>
              <div className="font-display text-3xl font-bold">{hashFmt(d.hashrate)}</div>
              <p className="mt-2 text-sm text-muted">Poder computacional protegendo a rede. Subindo = mineradores confiantes.</p>
            </div>

            <div className="card p-5">
              <SectionTitle icon={<Timer className="h-5 w-5" />}>Ajuste de dificuldade</SectionTitle>
              <div className={cx('font-display text-3xl font-bold', (d.nextAdjustPct ?? 0) >= 0 ? 'text-up' : 'text-down')}>{d.nextAdjustPct != null ? fmtPct(d.nextAdjustPct) : '—'}</div>
              <p className="mb-2 text-sm text-muted">estimativa do próximo ajuste</p>
              {d.adjustProgress != null && <Bar value={d.adjustProgress} tone="info" />}
              <div className="mt-2 text-xs text-muted">
                {d.adjustRemaining != null ? `faltam ${fmtNum(d.adjustRemaining, 0)} blocos` : ''}
                {d.difficulty != null ? ` · dificuldade ${(d.difficulty / 1e12).toFixed(1)} T` : ''}
              </div>
            </div>

            <div className="card p-5">
              <SectionTitle icon={<Blocks className="h-5 w-5" />}>Tamanho do Bitcoin</SectionTitle>
              <div className="font-display text-3xl font-bold">{fmtCompact(d.marketCap)}</div>
              <p className="mt-2 text-sm text-muted">Capitalização de mercado do BTC.</p>
            </div>
          </div>
          <Disclaimer />
        </div>
      )}
    </>
  );
}
