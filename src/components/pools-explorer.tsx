'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ExternalLink, Flame, Minus, RotateCcw, Search, X } from 'lucide-react';
import type { PoolRow } from '@/lib/defi/llama';
import { fmtCompact, fmtNum, fmtTime } from '@/lib/format';
import { useJson } from './use-json';
import { BrainLoader, Empty, ErrorBox, Th, TokenIcon, cx, useSort } from './ui';

const TVL = [0, 10e3, 50e3, 100e3, 1e6, 10e6, 50e6];
const APY = [0, 5, 30, 60, 100, 200, 365];
const MCAP = [0, 10e6, 100e6, 1e9, 10e9];

type Filters = { tvl: number; apy1d: number; apy30d: number; mcap: number; protocols: string[]; chains: string[]; tokens: string[]; hot: boolean };

export function PoolsExplorer({ kind }: { kind: 'stable' | 'token' }) {
  const { data, error, reload } = useJson<{ rows: PoolRow[]; updatedAt: string }>(`/api/defi/pools?kind=${kind}`);
  const defaults: Filters = { tvl: 100e3, apy1d: 0, apy30d: 0, mcap: kind === 'token' ? 10e6 : 0, protocols: [], chains: [], tokens: [], hot: false };
  const cleared: Filters = { tvl: 0, apy1d: 0, apy30d: 0, mcap: 0, protocols: [], chains: [], tokens: [], hot: false };
  const [f, setF] = useState<Filters>(defaults);
  const [limit, setLimit] = useState(100);
  const rows = useMemo(() => data?.rows ?? [], [data]);

  const opts = useMemo(() => {
    const count = (arr: string[]) => {
      const m = new Map<string, number>();
      arr.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
      return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    };
    return {
      protocols: count(rows.map((r) => r.project)),
      chains: count(rows.map((r) => r.chain)),
      tokens: count(rows.flatMap((r) => r.tokens.map((t) => t.toUpperCase()))),
    };
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.tvl >= f.tvl &&
          r.apy1d >= f.apy1d &&
          r.apy30d >= f.apy30d &&
          (kind === 'stable' || !f.mcap || (r.marketCap ?? 0) >= f.mcap) &&
          (!f.protocols.length || f.protocols.includes(r.project)) &&
          (!f.chains.length || f.chains.includes(r.chain)) &&
          (!f.tokens.length || r.tokens.some((t) => f.tokens.includes(t.toUpperCase()))) &&
          (!f.hot || r.hot),
      ),
    [rows, f, kind],
  );
  const { sorted, sort, toggle } = useSort(filtered, { key: 'tvl', dir: 'desc' });
  useEffect(() => setLimit(100), [f]);

  const Sel = ({ label, k, values, fmt }: { label: string; k: 'tvl' | 'apy1d' | 'apy30d' | 'mcap'; values: number[]; fmt: (v: number) => string }) => (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <select className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: +e.target.value })}>
        {values.map((v) => <option key={v} value={v}>{v === 0 ? 'Todos' : `> ${fmt(v)}`}</option>)}
      </select>
    </label>
  );

  return (
    <>
      <div className="card mb-4 space-y-4 p-5">
        <div className={cx('grid gap-3', kind === 'token' ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3')}>
          <Sel label="TVL" k="tvl" values={TVL} fmt={(v) => fmtCompact(v)} />
          <Sel label="APY 1 dia" k="apy1d" values={APY} fmt={(v) => `${v}%`} />
          <Sel label="APY médio 30 dias" k="apy30d" values={APY} fmt={(v) => `${v}%`} />
          {kind === 'token' && <Sel label="Market cap do token" k="mcap" values={MCAP} fmt={(v) => fmtCompact(v)} />}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Multi label="Protocolos" options={opts.protocols} value={f.protocols} onChange={(v) => setF({ ...f, protocols: v })} />
          <Multi label="Redes" options={opts.chains} value={f.chains} onChange={(v) => setF({ ...f, chains: v })} />
          <Multi label={kind === 'stable' ? 'Stablecoins do par' : 'Tokens do par'} options={opts.tokens} value={f.tokens} onChange={(v) => setF({ ...f, tokens: v })} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => setF(defaults)}><RotateCcw className="h-4 w-4" /> Restaurar padrões</button>
            <button className="btn-ghost" onClick={() => setF(cleared)}><X className="h-4 w-4" /> Limpar todos</button>
            {kind === 'token' && (
              <button className={cx('btn', f.hot ? 'bg-warn text-black' : 'border border-warn/50 text-warn')} onClick={() => setF({ ...f, hot: !f.hot })}>
                <Flame className="h-4 w-4" /> Hot pools
              </button>
            )}
          </div>
          <div className="text-sm text-muted">
            Mostrando <b className="text-fg">{fmtNum(Math.min(limit, sorted.length), 0)}</b> de <b className="text-fg">{fmtNum(sorted.length, 0)}</b> pools{data && <> · atualizado {fmtTime(data.updatedAt)}</>}
          </div>
        </div>
      </div>

      {error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : !data ? (
        <BrainLoader title="Carregando pools do DeFiLlama" />
      ) : sorted.length === 0 ? (
        <Empty>Nenhuma pool com esses filtros.</Empty>
      ) : (
        <>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <Th label="Pool" k="symbol" sort={sort} toggle={toggle} />
                  <Th label="TVL" k="tvl" sort={sort} toggle={toggle} />
                  <Th label="APY 1D" k="apy1d" sort={sort} toggle={toggle} />
                  <Th label="APY 30D" k="apy30d" sort={sort} toggle={toggle} />
                  {kind === 'token' && <Th label="Market cap" k="marketCap" sort={sort} toggle={toggle} />}
                  {kind === 'token' && <Th label="Volume 24h" k="volume24h" sort={sort} toggle={toggle} />}
                  <Th label="Protocolo" k="project" sort={sort} toggle={toggle} />
                  <Th label="Rede" k="chain" sort={sort} toggle={toggle} />
                  <th />
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, limit).map((r) => (
                  <tr key={r.id} className={cx(r.hot && kind === 'token' && 'bg-warn/[0.05]')}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-2">{r.tokens.slice(0, 3).map((t) => <TokenIcon key={t} symbol={t} size={22} />)}</div>
                        <div>
                          <div className="flex items-center gap-1 font-semibold">{r.symbol}{r.hot && kind === 'token' && <Flame className="h-4 w-4 text-warn" aria-label="Hot pool" />}</div>
                          {r.fee && <div className="text-xs text-muted">{r.fee}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="font-mono">{fmtCompact(r.tvl)}</td>
                    <td className="font-semibold text-up">
                      <span className="inline-flex items-center gap-1">
                        {fmtNum(r.apy1d)}%
                        {r.trend === 'up' ? <ArrowUp className="h-3.5 w-3.5 text-up" /> : r.trend === 'down' ? <ArrowDown className="h-3.5 w-3.5 text-down" /> : <Minus className="h-3.5 w-3.5 text-muted" />}
                      </span>
                    </td>
                    <td>{fmtNum(r.apy30d)}%</td>
                    {kind === 'token' && <td>{fmtCompact(r.marketCap)}{r.capToken && <div className="text-xs text-muted">{r.capToken}</div>}</td>}
                    {kind === 'token' && <td>{fmtCompact(r.volume24h)}</td>}
                    <td>{r.project}</td>
                    <td><span className="chip-info normal-case">{r.chain}</span></td>
                    <td><a href={r.url} target="_blank" rel="noreferrer" className="text-muted hover:text-neon" aria-label="Abrir no DeFiLlama"><ExternalLink className="h-4 w-4" /></a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {limit < sorted.length && (
            <div className="mt-4 text-center"><button className="btn-ghost" onClick={() => setLimit(limit + 100)}>Carregar mais 100</button></div>
          )}
        </>
      )}
      <p className="mt-4 text-xs text-muted">Dados: DeFiLlama. A seta compara o APY de hoje com a média de 30 dias. Hot pool = volume 24h ≥ 50% do TVL.{kind === 'token' && ' O market cap é o do token volátil do par (o menor, se houver dois).'}</p>
    </>
  );
}

function Multi({ label, options, value, onChange }: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const list = options.filter((o) => o.toLowerCase().includes(q.toLowerCase())).slice(0, 200);
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <div ref={ref} className="relative">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <button type="button" onClick={() => setOpen(!open)} className="input flex min-h-[40px] flex-wrap items-center gap-1 text-left">
        {value.length === 0 ? <span className="text-muted">Todos</span> : value.slice(0, 4).map((v) => (
          <span key={v} className="chip-up normal-case" onClick={(e) => { e.stopPropagation(); toggle(v); }}>{v} <X className="h-3 w-3" /></span>
        ))}
        {value.length > 4 && <span className="text-xs text-muted">+{value.length - 4}</span>}
        <ChevronDown className="ml-auto h-4 w-4 text-muted" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-line bg-card p-2 shadow-2xl">
          <div className="relative mb-2"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted" /><input autoFocus className="input pl-8" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="mb-2 flex gap-2 text-xs">
            <button className="text-neon hover:underline" onClick={() => onChange(Array.from(new Set([...value, ...list])))}>Selecionar todos</button>
            <button className="text-muted hover:underline" onClick={() => onChange([])}>Limpar todos</button>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {list.map((o) => (
              <label key={o} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-neon/10">
                <input type="checkbox" checked={value.includes(o)} onChange={() => toggle(o)} className="accent-[rgb(var(--neon))]" />
                {o}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
