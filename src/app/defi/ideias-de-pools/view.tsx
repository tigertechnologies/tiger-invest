'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Calculator, ExternalLink, Layers, ShieldCheck, Sparkles, Star, TrendingUp } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { fmtCompact, fmtPct } from '@/lib/format';
import { useApp } from '@/components/providers';
import { BrainLoader, Breadcrumb, Disclaimer, Empty, ErrorBox, Hero, Pills, SectionTitle, cx } from '@/components/ui';
import { useJson } from '@/components/use-json';

type Idea = {
  name: string; dex: string; network: string; dexUrl?: string | null; dataUrl?: string | null; gtUrl?: string | null;
  tvl: number; vol24: number; feeApr: number | null; rewardApr?: number; netApr?: number; il: string; ilLevel: number;
  sustainable?: boolean; maxEntry?: number; daysToCoverIL?: number | null; yieldScore?: number; yieldGrade?: string;
  yieldBreak?: { retorno: number; sustent: number; il: number; liquidez: number }; outlook?: string; outlookProb?: number | null;
  apyMean30d?: number | null; verdictLabel: string; verdictTone: 'buy' | 'neutral' | 'sell'; verdict: string; highlight: boolean;
};
type Net = 'all' | 'eth' | 'base' | 'arbitrum' | 'solana' | 'bsc' | 'polygon';
const NETS: { value: Net; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'eth', label: 'Ethereum' },
  { value: 'base', label: 'Base' },
  { value: 'arbitrum', label: 'Arbitrum' },
  { value: 'solana', label: 'Solana' },
  { value: 'bsc', label: 'BNB' },
  { value: 'polygon', label: 'Polygon' },
];
const NET_LABEL: Record<string, string> = { eth: 'Ethereum', base: 'Base', arbitrum: 'Arbitrum', solana: 'Solana', bsc: 'BNB Chain', polygon: 'Polygon' };
const gradeCls = (g?: string) =>
  g === 'A' ? 'border-neon/60 bg-neon/15 text-neon' : g === 'B' ? 'border-lime/50 bg-lime/10 text-lime' : g === 'C' ? 'border-warn/50 bg-warn/10 text-warn' : 'border-down/50 bg-down/10 text-down';

export function PoolIdeasView() {
  const [net, setNet] = useState<Net>('all');
  const [onlyWatch, setOnlyWatch] = useState(false);
  const { data, error, reload } = useJson<{ ideas: Idea[] }>(`/api/poolideas?net=${net}`, 10 * 60_000);
  const { user } = useApp();
  const sb = supabaseBrowser();
  const [watch, setWatch] = useState<Set<string>>(new Set());

  const loadWatch = useCallback(async () => {
    if (!sb || !user) return;
    const { data: rows } = await sb.from('pool_watch').select('pool_key').eq('user_id', user.id);
    setWatch(new Set((rows ?? []).map((r: { pool_key: string }) => r.pool_key)));
  }, [sb, user]);
  useEffect(() => {
    loadWatch();
  }, [loadWatch]);

  const toggleWatch = async (i: Idea) => {
    if (!sb || !user) return alert('Entre na sua conta para vigiar pools e receber alertas.');
    const key = `${i.name}|${i.network}`;
    const next = new Set(watch);
    if (watch.has(key)) {
      next.delete(key);
      setWatch(next);
      await sb.from('pool_watch').delete().eq('user_id', user.id).eq('pool_key', key);
    } else {
      next.add(key);
      setWatch(next);
      await sb.from('pool_watch').upsert({ user_id: user.id, pool_key: key, name: i.name, network: i.network, dex: i.dex }, { onConflict: 'user_id,pool_key' });
    }
  };

  const ideas = useMemo(() => (data?.ideas ?? []).filter((i) => !onlyWatch || watch.has(`${i.name}|${i.network}`)), [data, onlyWatch, watch]);
  const top = data?.ideas?.[0];
  const entrar = (data?.ideas ?? []).filter((i) => i.verdictTone === 'buy').length;

  return (
    <>
      <Breadcrumb items={[{ label: 'DeFi' }, { label: 'Ideias de Pools' }]} />
      <Hero
        badge={<><Sparkles className="h-3.5 w-3.5" /> Nota de Yield</>}
        title="Ideias de Pools"
        subtitle="Pools de liquidez concentrada (V3) ranqueadas pela Nota de Yield: APR líquido (taxa menos perda impermanente), sustentabilidade, risco de IL e liquidez. Vigie as que interessam e receba alerta quando entrarem em bom momento."
        kpis={[
          { icon: <Sparkles className="h-5 w-5" />, value: top ? `${top.yieldGrade ?? '—'} · ${top.yieldScore ?? '—'}` : '—', label: top ? `Melhor nota: ${top.name}` : 'Melhor nota' },
          { icon: <TrendingUp className="h-5 w-5" />, value: data ? entrar : '—', label: 'Com veredito ENTRAR' },
          { icon: <Layers className="h-5 w-5" />, value: data ? data.ideas.length : '—', label: 'Pools avaliadas' },
          { icon: <Star className="h-5 w-5" />, value: user ? watch.size : '—', label: user ? 'Na sua watchlist' : 'Entre para vigiar' },
        ]}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Pills value={net} onChange={setNet} options={NETS} />
        <button onClick={() => setOnlyWatch((v) => !v)} className={cx('btn', onlyWatch ? 'bg-neon text-on-neon' : 'border border-line bg-card-2/60 text-muted hover:text-fg')}>
          <Star className="h-4 w-4" /> Só vigiadas
        </button>
      </div>

      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !data ? (
        <BrainLoader title="Avaliando pools em 6 redes" />
      ) : ideas.length === 0 ? (
        <Empty>{onlyWatch ? 'Nenhuma pool vigiada nesta rede. Toque na estrela de uma pool para vigiá-la.' : 'Nenhuma pool passou nos filtros agora.'}</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ideas.map((i) => {
            const key = `${i.name}|${i.network}`;
            const on = watch.has(key);
            return (
              <div key={key} className={cx('card flex flex-col p-5', i.highlight && 'border-neon/50 shadow-neon-sm')}>
                <div className="mb-3 flex items-start gap-3">
                  <div className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-xl border font-display text-xl font-bold', gradeCls(i.yieldGrade))}>{i.yieldGrade ?? '?'}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-lg font-bold">{i.name}</div>
                    <div className="text-xs text-muted">
                      {i.dex} · {NET_LABEL[i.network] ?? i.network}
                      {i.yieldScore != null && <> · nota {i.yieldScore}/100</>}
                    </div>
                  </div>
                  <button onClick={() => toggleWatch(i)} aria-label={on ? 'Parar de vigiar' : 'Vigiar pool'} className={cx('rounded-lg p-1.5', on ? 'text-warn' : 'text-muted hover:text-warn')}>
                    <Star className={cx('h-5 w-5', on && 'fill-current')} />
                  </button>
                </div>
                <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                  <Mini label="APR líquido" value={i.netApr != null ? `${i.netApr > 0 ? '+' : ''}${i.netApr}%` : '—'} tone={i.netApr != null ? (i.netApr > 0 ? 'up' : 'down') : undefined} />
                  <Mini label="Taxa (APR)" value={i.feeApr != null ? `${i.feeApr}%` : '—'} />
                  <Mini label="Risco IL" value={i.il} tone={i.ilLevel <= 2 ? 'up' : i.ilLevel === 3 ? 'warn' : 'down'} />
                  <Mini label="TVL" value={fmtCompact(i.tvl)} />
                  <Mini label="Volume 24h" value={fmtCompact(i.vol24)} />
                  <Mini label="Aporte máx." value={i.maxEntry ? fmtCompact(i.maxEntry) : '—'} />
                </div>
                {i.yieldBreak && (
                  <div className="mb-3 space-y-1">
                    {(
                      [
                        ['Retorno', i.yieldBreak.retorno, 45],
                        ['Sustentabilidade', i.yieldBreak.sustent, 20],
                        ['Risco IL', i.yieldBreak.il, 20],
                        ['Liquidez', i.yieldBreak.liquidez, 15],
                      ] as [string, number, number][]
                    ).map(([l, v, max]) => (
                      <div key={l} className="flex items-center gap-2 text-xs">
                        <span className="w-28 text-muted">{l}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-card-2">
                          <div className="h-full rounded-full bg-gradient-to-r from-neon to-lime" style={{ width: `${(v / max) * 100}%` }} />
                        </div>
                        <span className="w-10 text-right font-mono">
                          {v}/{max}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={i.verdictTone === 'buy' ? 'chip-up' : i.verdictTone === 'sell' ? 'chip-down' : 'chip-warn'}>{i.verdictLabel}</span>
                  {i.outlook && <span className="chip-info">Previsão: {i.outlook}{i.outlookProb ? ` (${i.outlookProb}%)` : ''}</span>}
                  {i.sustainable === false && <span className="chip-warn">Pico de taxa</span>}
                  {(i.rewardApr ?? 0) > 0 && <span className="chip-muted">+{i.rewardApr}% emissões</span>}
                </div>
                <p className="mb-4 flex-1 text-sm text-fg/80">{i.verdict}</p>
                <div className="flex gap-2">
                  {i.dexUrl && (
                    <a href={i.dexUrl} target="_blank" rel="noreferrer" className="btn-neon flex-1 justify-center">
                      Abrir na DEX <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {(i.dataUrl || i.gtUrl) && (
                    <a href={(i.dataUrl || i.gtUrl) as string} target="_blank" rel="noreferrer" className="btn-ghost">
                      Dados <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <IlCalculator />
      <p className="mt-6 text-sm text-muted">
        Já está numa pool? Cadastre em <Link href="/invest" className="text-neon hover:underline">Minha Carteira → Pools</Link> para acompanhar range, taxas e resultado x HODL, ou use a{' '}
        <Link href="/defi/pools-tracker" className="text-neon hover:underline">Análise de Pools</Link> pela carteira on-chain.
      </p>
      <Disclaimer className="mt-6" />
    </>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' | 'warn' }) {
  return (
    <div className="rounded-lg border border-line bg-card-2/60 px-2 py-1.5">
      <div className={cx('truncate font-mono text-sm font-bold', tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : tone === 'warn' ? 'text-warn' : '')}>{value}</div>
      <div className="truncate text-[10px] uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

/** Perda impermanente de uma pool 50/50 e de uma V3 concentrada, pela variação de preço. */
function IlCalculator() {
  const [move, setMove] = useState(30);
  const [width, setWidth] = useState(20);
  const [apr, setApr] = useState(25);
  const [days, setDays] = useState(30);
  const r = 1 + move / 100;
  const ilV2 = r > 0 ? ((2 * Math.sqrt(r)) / (1 + r) - 1) * 100 : -100;
  // V3: faixa simétrica ±width% — capital concentrado amplifica o IL enquanto dentro da faixa
  const lo = 1 - width / 100;
  const hi = 1 + width / 100;
  const pc = Math.min(Math.max(r, lo), hi);
  const v3 = (p: number) => {
    const sp = Math.sqrt(p);
    const sa = Math.sqrt(lo);
    const sb = Math.sqrt(hi);
    const x = 1 / sp - 1 / sb; // token volátil (por unidade de liquidez)
    const y = sp - sa; // stable
    return { x, y };
  };
  const start = v3(1);
  const end = v3(pc);
  const valStart = start.x * 1 + start.y;
  const valLp = end.x * r + end.y;
  const valHodl = start.x * r + start.y;
  const ilV3 = valHodl > 0 ? (valLp / valHodl - 1) * 100 : 0;
  const outOfRange = r < lo || r > hi;
  const fees = (apr / 365) * days;
  const net = fees + ilV3;
  return (
    <div className="card mt-8 p-5">
      <SectionTitle icon={<Calculator className="h-5 w-5" />}>Calculadora de perda impermanente</SectionTitle>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Slider label="Variação do preço do ativo volátil" value={move} min={-90} max={300} step={5} onChange={setMove} fmt={(v) => `${v > 0 ? '+' : ''}${v}%`} />
          <Slider label="Largura da faixa V3 (±)" value={width} min={2} max={100} step={1} onChange={setWidth} fmt={(v) => `±${v}%`} />
          <Slider label="APR de taxas esperado" value={apr} min={0} max={200} step={1} onChange={setApr} fmt={(v) => `${v}%`} />
          <Slider label="Tempo na pool" value={days} min={1} max={365} step={1} onChange={setDays} fmt={(v) => `${v} dias`} />
        </div>
        <div className="grid grid-cols-2 gap-3 self-start">
          <Box label="IL pool 50/50 (V2)" value={fmtPct(ilV2)} tone="down" />
          <Box label={`IL V3 (±${width}%)`} value={fmtPct(ilV3)} tone="down" hint={outOfRange ? 'Fora da faixa: parou de render taxa' : 'Dentro da faixa'} />
          <Box label={`Taxas em ${days} dias`} value={fmtPct(fees)} tone="up" />
          <Box label="Resultado V3 x HODL" value={fmtPct(net)} tone={net >= 0 ? 'up' : 'down'} hint={net >= 0 ? 'As taxas pagaram o IL' : 'O IL superou as taxas'} />
          <p className="col-span-2 text-xs text-muted">
            <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-neon" />
            Faixas mais estreitas rendem mais taxa, mas o IL cresce mais rápido e o preço sai da faixa com mais facilidade. Valor inicial da posição: 1 unidade ({valStart.toFixed(3)}).
          </p>
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <label className="block">
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-muted">{label}</span>
        <b className="font-mono text-neon">{fmt(value)}</b>
      </div>
      <input type="range" className="w-full accent-[rgb(var(--neon))]" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Box({ label, value, tone, hint }: { label: string; value: string; tone: 'up' | 'down'; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card-2/60 p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={cx('font-display text-2xl font-bold', tone === 'up' ? 'text-up' : 'text-down')}>{value}</div>
      {hint && <div className="text-[11px] text-muted">{hint}</div>}
    </div>
  );
}
