'use client';
import { useId, useMemo, useState } from 'react';

/** Mini-gráfico de linha (sem eixos). */
export function Sparkline({ data, width = 120, height = 36, tone }: { data: number[]; width?: number; height?: number; tone?: 'up' | 'down' | 'neon' }) {
  const id = useId();
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * width, height - 2 - ((v - min) / span) * (height - 4)]);
  const t = tone ?? (data[data.length - 1] >= data[0] ? 'up' : 'down');
  const color = t === 'up' ? 'rgb(var(--up))' : t === 'down' ? 'rgb(var(--down))' : 'rgb(var(--neon))';
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${width} ${height} L0 ${height} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export type Series = { name: string; data: number[]; color?: string; dashed?: boolean };

const COLORS = ['rgb(var(--neon))', 'rgb(var(--info))', 'rgb(var(--lime))', 'rgb(var(--warn))', 'rgb(var(--violet))'];

/** Gráfico de linhas com eixo Y, rótulos de data e tooltip ao passar o mouse. */
export function LineChart({
  labels,
  series,
  height = 260,
  format = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }),
  area = true,
}: {
  labels: string[];
  series: Series[];
  height?: number;
  format?: (v: number) => string;
  area?: boolean;
}) {
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 800;
  const H = height;
  const P = { l: 8, r: 76, t: 12, b: 26 };
  const n = labels.length;
  const { min, max } = useMemo(() => {
    const all = series.flatMap((s) => s.data.filter((v) => Number.isFinite(v)));
    const mn = Math.min(...all);
    const mx = Math.max(...all);
    const pad = (mx - mn) * 0.08 || Math.abs(mx) * 0.05 || 1;
    return { min: mn - pad, max: mx + pad };
  }, [series]);
  if (n < 2 || !series.length) return <div className="grid h-40 place-items-center text-sm text-muted">Sem dados suficientes.</div>;
  const x = (i: number) => P.l + (i / (n - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - min) / (max - min)) * (H - P.t - P.b);
  const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);
  const xt = [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];
  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - P.l) / (W - P.l - P.r)) * (n - 1));
          setHover(Math.max(0, Math.min(n - 1, i)));
        }}
      >
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--neon))" stopOpacity="0.28" />
            <stop offset="100%" stopColor="rgb(var(--neon))" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="rgb(var(--line))" strokeDasharray="3 5" />
            <text x={W - P.r + 6} y={y(t) + 4} fontSize="11" className="fill-muted">
              {format(t)}
            </text>
          </g>
        ))}
        {xt.map((i) => (
          <text key={i} x={x(i)} y={H - 6} fontSize="11" textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="fill-muted">
            {labels[i]}
          </text>
        ))}
        {series.map((s, si) => {
          const color = s.color ?? COLORS[si % COLORS.length];
          const d = s.data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
          return (
            <g key={s.name}>
              {area && si === 0 && <path d={`${d} L${x(n - 1)} ${H - P.b} L${x(0)} ${H - P.b} Z`} fill={`url(#${gid})`} />}
              <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeDasharray={s.dashed ? '6 5' : undefined} strokeLinejoin="round" />
            </g>
          );
        })}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} stroke="rgb(var(--muted))" strokeDasharray="2 4" />
            {series.map((s, si) => (
              <circle key={s.name} cx={x(hover)} cy={y(s.data[hover])} r="4.5" fill={s.color ?? COLORS[si % COLORS.length]} stroke="rgb(var(--bg))" strokeWidth="2" />
            ))}
          </g>
        )}
      </svg>
      {hover != null && (
        <div
          className="pointer-events-none absolute top-2 rounded-xl border border-line bg-card/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
          style={{ left: `${Math.min(70, (x(hover) / W) * 100)}%` }}
        >
          <div className="mb-1 text-muted">{labels[hover]}</div>
          {series.map((s, si) => (
            <div key={s.name} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color ?? COLORS[si % COLORS.length] }} />
              {s.name} <b className="ml-auto pl-3 font-mono">{format(s.data[hover])}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
