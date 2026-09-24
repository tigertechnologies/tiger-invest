'use client';

type K = [number, number, number, number, number]; // t o h l c

/** Gráfico de velas leve em SVG, com linhas opcionais (suporte, resistência, stop, alvos). */
export function CandleChart({ data, lines = [], height = 220 }: { data: K[]; lines?: { price: number; label: string; tone: 'up' | 'down' | 'neon' | 'warn' }[]; height?: number }) {
  if (!data.length) return null;
  const W = 800;
  const H = height;
  const pad = { l: 8, r: 64, t: 10, b: 10 };
  const allLines = lines.map((l) => l.price);
  const hi = Math.max(...data.map((d) => d[2]), ...allLines);
  const lo = Math.min(...data.map((d) => d[3]), ...allLines);
  const y = (p: number) => pad.t + ((hi - p) / (hi - lo || 1)) * (H - pad.t - pad.b);
  const step = (W - pad.l - pad.r) / data.length;
  const bw = Math.max(step * 0.6, 1);
  const color = { up: 'rgb(var(--up))', down: 'rgb(var(--down))', neon: 'rgb(var(--neon))', warn: 'rgb(var(--warn))' };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" preserveAspectRatio="none" role="img" aria-label="Gráfico de preço">
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={pad.l} x2={W - pad.r} y1={pad.t + f * (H - pad.t - pad.b)} y2={pad.t + f * (H - pad.t - pad.b)} stroke="rgb(var(--line))" strokeDasharray="3 5" />
      ))}
      {data.map((d, i) => {
        const up = d[4] >= d[1];
        const x = pad.l + i * step + step / 2;
        const c = up ? color.up : color.down;
        return (
          <g key={d[0]}>
            <line x1={x} x2={x} y1={y(d[2])} y2={y(d[3])} stroke={c} strokeWidth="1" />
            <rect x={x - bw / 2} y={y(Math.max(d[1], d[4]))} width={bw} height={Math.max(Math.abs(y(d[1]) - y(d[4])), 1)} fill={c} rx="0.5" />
          </g>
        );
      })}
      {lines.map((l, i) => (
        <g key={i}>
          <line x1={pad.l} x2={W - pad.r} y1={y(l.price)} y2={y(l.price)} stroke={color[l.tone]} strokeDasharray="6 4" strokeWidth="1.2" />
          <text x={W - pad.r + 4} y={y(l.price) + 4} fontSize="11" fill={color[l.tone]}>{l.label}</text>
        </g>
      ))}
    </svg>
  );
}
