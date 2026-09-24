'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Crosshair, Flame, Layers, Radar, ShieldAlert, Target, TrendingDown, TrendingUp, X } from 'lucide-react';
import { fmtCompact, fmtPct, fmtPrice } from '@/lib/format';
import { Bar, BrainLoader, Breadcrumb, Disclaimer, ErrorBox, Hero, Pills, Spinner, Th, TokenIcon, cx, useSort } from '@/components/ui';
import { useJson } from '@/components/use-json';

type Coin = { id: string; symbol: string; name: string; image: string; price: number; ch24: number; ch7d: number | null; vol: number; mcap: number };
type RadarRes = { top: Coin[]; alts: Coin[]; memes: Coin[] };
type Zone = { price: number; touches: number; dist: number };
type Signal = {
  price: number; rsi: number | null; bmsbMid: number; cyclePos: 'above' | 'in' | 'below'; structure: 'alta' | 'baixa' | 'lateral'; structHint: string;
  supports: Zone[]; resistances: Zone[]; keySup: number; keyRes: number; upside: number; downside: number; rr: number;
  trigger: { buy: string; sell: string }; verdict: { label: string; tone: 'buy' | 'sell' | 'neutral'; text: string };
  rangePos: number; high52: number; low52: number; maAbove: number; rsiHint: string; maHint: string; confirm: string;
};
type Tab = 'top' | 'alts' | 'memes';

const pctCls = (v: number | null | undefined) => (v == null ? 'text-muted' : v >= 0 ? 'text-up' : 'text-down');

export function RadarView() {
  const { data, error, reload } = useJson<RadarRes>('/api/radar', 2 * 60_000);
  const [tab, setTab] = useState<Tab>('top');
  const [sel, setSel] = useState<Coin | null>(null);
  const rows = data?.[tab] ?? [];
  const { sorted, sort, toggle } = useSort(rows, { key: 'mcap', dir: 'desc' });
  const all = data ? [...data.top, ...data.alts, ...data.memes] : [];
  const best = all.length ? all.reduce((a, b) => (b.ch24 > a.ch24 ? b : a)) : null;
  const worst = all.length ? all.reduce((a, b) => (b.ch24 < a.ch24 ? b : a)) : null;
  const green = all.filter((c) => c.ch24 > 0).length;

  return (
    <>
      <Breadcrumb items={[{ label: 'Mercado' }, { label: 'Radar' }]} />
      <Hero
        badge={<><Radar className="h-3.5 w-3.5" /> Ao vivo</>}
        title="Radar de Mercado"
        subtitle="Top 10 por capitalização, as próximas altcoins e as principais memecoins. Clique em qualquer ativo para ver a leitura estrutural: tendência, suportes, resistências e gatilhos."
        kpis={[
          { icon: <TrendingUp className="h-5 w-5" />, value: best ? `${best.symbol} ${fmtPct(best.ch24, 1)}` : '—', label: 'Maior alta 24h' },
          { icon: <TrendingDown className="h-5 w-5" />, value: worst ? `${worst.symbol} ${fmtPct(worst.ch24, 1)}` : '—', label: 'Maior queda 24h' },
          { icon: <Flame className="h-5 w-5" />, value: all.length ? `${green}/${all.length}` : '—', label: 'Ativos no verde' },
          { icon: <Layers className="h-5 w-5" />, value: <Link href="/defi/ideias-de-pools" className="text-neon hover:underline">Ver pools →</Link>, label: 'Ideias de pools (Nota de Yield)' },
        ]}
      />
      <div className="mb-4">
        <Pills<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'top', label: 'Top 10' },
            { value: 'alts', label: 'Altcoins' },
            { value: 'memes', label: 'Memecoins' },
          ]}
        />
      </div>
      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !data ? (
        <BrainLoader title="Varredura do radar" />
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <Th label="Ativo" k="symbol" sort={sort} toggle={toggle} />
                <Th label="Preço" k="price" sort={sort} toggle={toggle} />
                <Th label="24h" k="ch24" sort={sort} toggle={toggle} />
                <Th label="7d" k="ch7d" sort={sort} toggle={toggle} className="hidden sm:table-cell" />
                <Th label="Volume" k="vol" sort={sort} toggle={toggle} className="hidden md:table-cell" />
                <Th label="Market cap" k="mcap" sort={sort} toggle={toggle} className="hidden md:table-cell" />
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.id} className="cursor-pointer" onClick={() => setSel(c)}>
                  <td>
                    <div className="flex items-center gap-3">
                      <TokenIcon symbol={c.symbol} src={c.image} />
                      <div>
                        <div className="font-semibold">{c.symbol}</div>
                        <div className="text-xs text-muted">{c.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="font-mono">{fmtPrice(c.price)}</td>
                  <td className={cx('font-mono font-semibold', pctCls(c.ch24))}>{fmtPct(c.ch24)}</td>
                  <td className={cx('hidden font-mono sm:table-cell', pctCls(c.ch7d))}>{fmtPct(c.ch7d)}</td>
                  <td className="hidden font-mono md:table-cell">{fmtCompact(c.vol)}</td>
                  <td className="hidden font-mono md:table-cell">{fmtCompact(c.mcap)}</td>
                  <td className="text-right">
                    <span className="chip-info whitespace-nowrap">
                      <Crosshair className="h-3 w-3" /> Análise
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Disclaimer className="mt-6" />
      {sel && <SignalSheet coin={sel} onClose={() => setSel(null)} />}
    </>
  );
}

function SignalSheet({ coin, onClose }: { coin: Coin; onClose: () => void }) {
  const { data, error } = useJson<Record<string, Signal>>(`/api/signals?ids=${coin.id}`);
  const s = data?.[coin.id];
  const tone = s?.verdict.tone;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose} role="dialog" aria-modal="true">
      <aside className="h-full w-full max-w-lg overflow-y-auto border-l border-line bg-bg p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-3">
          <TokenIcon symbol={coin.symbol} src={coin.image} size={40} />
          <div className="flex-1">
            <div className="font-display text-xl font-bold">{coin.symbol}</div>
            <div className="text-sm text-muted">
              {coin.name} · {fmtPrice(coin.price)} <span className={pctCls(coin.ch24)}>{fmtPct(coin.ch24)}</span>
            </div>
          </div>
          <button className="rounded-lg p-2 text-muted hover:text-fg" onClick={onClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        {error ? (
          <p className="text-sm text-down">{error}</p>
        ) : !data ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted">
            <Spinner /> Lendo 1 ano de estrutura…
          </div>
        ) : !s ? (
          <p className="py-10 text-center text-sm text-muted">Histórico insuficiente para analisar este ativo agora.</p>
        ) : (
          <div className="space-y-4">
            <div className={cx('rounded-2xl border p-4', tone === 'buy' ? 'border-up/40 bg-up/10' : tone === 'sell' ? 'border-down/40 bg-down/10' : 'border-warn/40 bg-warn/10')}>
              <div className={cx('mb-1 font-display text-sm font-bold tracking-wide', tone === 'buy' ? 'text-up' : tone === 'sell' ? 'text-down' : 'text-warn')}>{s.verdict.label}</div>
              <p className="text-sm text-fg/90">{s.verdict.text}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Stat label="Estrutura" value={s.structure.toUpperCase()} hint={s.structHint} tone={s.structure === 'alta' ? 'up' : s.structure === 'baixa' ? 'down' : 'warn'} />
              <Stat label="RSI diário" value={s.rsi != null ? s.rsi.toFixed(0) : '—'} hint={s.rsiHint} />
              <Stat label="Médias 20/50/200" value={`${s.maAbove}/3`} hint={s.maHint} />
              <Stat label="Bull Market Band" value={s.cyclePos === 'above' ? 'ACIMA' : s.cyclePos === 'below' ? 'ABAIXO' : 'NA BANDA'} hint={s.confirm} tone={s.cyclePos === 'above' ? 'up' : s.cyclePos === 'below' ? 'down' : 'warn'} />
            </div>
            <div className="card-2 p-4">
              <div className="mb-2 flex justify-between text-xs text-muted">
                <span>Mín. 52s {fmtPrice(s.low52)}</span>
                <span>Máx. 52s {fmtPrice(s.high52)}</span>
              </div>
              <Bar value={s.rangePos} />
              <div className="mt-1 text-center text-xs text-muted">Posição no range anual: {s.rangePos.toFixed(0)}%</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Levels title="Resistências" zones={s.resistances} tone="down" />
              <Levels title="Suportes" zones={s.supports} tone="up" />
            </div>
            <div className="card-2 space-y-2 p-4 text-sm">
              <div className="flex items-start gap-2">
                <Target className="mt-0.5 h-4 w-4 shrink-0 text-up" />
                <span>{s.trigger.buy}</span>
              </div>
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-down" />
                <span>{s.trigger.sell}</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <Stat label="Até resistência" value={`+${s.upside.toFixed(1)}%`} tone="up" />
              <Stat label="Até suporte" value={`-${s.downside.toFixed(1)}%`} tone="down" />
              <Stat label="Risco/retorno" value={s.rr ? s.rr.toFixed(2) : '—'} tone={s.rr >= 2 ? 'up' : s.rr >= 1 ? 'warn' : 'down'} />
            </div>
            <Link href={`/?symbol=${coin.symbol}`} className="btn-ghost w-full justify-center">
              Abrir análise técnica completa de {coin.symbol}
            </Link>
          </div>
        )}
      </aside>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'up' | 'down' | 'warn' }) {
  return (
    <div className="rounded-xl border border-line bg-card-2/60 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className={cx('font-display text-lg font-bold', tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : tone === 'warn' ? 'text-warn' : '')}>{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

function Levels({ title, zones, tone }: { title: string; zones: Zone[]; tone: 'up' | 'down' }) {
  return (
    <div className="rounded-xl border border-line bg-card-2/60 p-3">
      <div className={cx('mb-2 text-xs font-semibold uppercase tracking-wider', tone === 'up' ? 'text-up' : 'text-down')}>{title}</div>
      {zones.length === 0 && <div className="text-xs text-muted">Nenhuma zona próxima.</div>}
      {zones.map((z) => (
        <div key={z.price} className="flex items-center justify-between py-0.5 text-sm">
          <span className="font-mono">{fmtPrice(z.price)}</span>
          <span className="text-xs text-muted">
            {z.dist.toFixed(1)}% · {z.touches}x
          </span>
        </div>
      ))}
    </div>
  );
}
