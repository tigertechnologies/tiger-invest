'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowDownUp, ArrowDown, ArrowUp, ChevronRight, Loader2, RefreshCw } from 'lucide-react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ---------- Breadcrumb ---------- */
export function Breadcrumb({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted" aria-label="Navegação estrutural">
      <Link href="/" className="hover:text-neon">Início</Link>
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5" />
          {it.href ? <Link href={it.href} className="hover:text-neon">{it.label}</Link> : <span className="text-fg">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/* ---------- Hero com KPIs ---------- */
export function Hero({ badge, title, subtitle, children, kpis }: { badge?: ReactNode; title: ReactNode; subtitle?: ReactNode; children?: ReactNode; kpis?: { icon?: ReactNode; value: ReactNode; label: string }[] }) {
  return (
    <section className="hero mb-6">
      <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-neon/20 blur-3xl" />
      {badge && <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-neon/40 bg-bg/40 px-3 py-1 text-xs font-semibold text-neon">{badge}</div>}
      <h1 className="font-display text-2xl font-bold tracking-tight md:text-4xl">{title}</h1>
      {subtitle && <p className="mt-2 max-w-3xl text-sm text-fg/80 md:text-base">{subtitle}</p>}
      {children && <div className="mt-4">{children}</div>}
      {kpis && (
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k, i) => (
            <div key={i} className="kpi">
              {k.icon && <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neon/15 text-neon">{k.icon}</div>}
              <div className="min-w-0">
                <div className="truncate font-display text-xl font-bold md:text-2xl">{k.value}</div>
                <div className="truncate text-xs text-muted">{k.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------- Estados ---------- */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('h-5 w-5 animate-spin text-neon', className)} />;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-8 text-center">
      <AlertTriangle className="h-8 w-8 text-warn" />
      <p className="max-w-lg text-sm text-muted">{message}</p>
      {onRetry && (
        <button className="btn-ghost" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" /> Tentar novamente
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card p-10 text-center text-sm text-muted">{children}</div>;
}

const FACTS = [
  'O RSI foi criado por J. Welles Wilder em 1978, o mesmo autor do ADX e do ATR.',
  'A Bull Market Support Band usa a SMA de 20 semanas e a EMA de 21 semanas.',
  'A proporção áurea de 61,8% é o nível de Fibonacci mais observado pelos traders.',
  'Com ADX abaixo de 20 o mercado está lateral e os sinais perdem força.',
  'Stops baseados em 2× ATR se adaptam à volatilidade de cada ativo.',
  'A nuvem Ichimoku é projetada 26 períodos à frente do preço.',
];

export function BrainLoader({ title = 'Analisando o mercado', progress }: { title?: string; progress?: number }) {
  // sorteio só no cliente para não divergir da renderização do servidor
  const [fact, setFact] = useState(FACTS[0]);
  useEffect(() => setFact(FACTS[Math.floor(Math.random() * FACTS.length)]), []);
  return (
    <div className="card mx-auto flex max-w-xl flex-col items-center gap-5 p-10 text-center">
      <div className="relative grid h-20 w-20 place-items-center rounded-2xl border border-neon/40 bg-neon/10 shadow-neon">
        <svg viewBox="0 0 24 24" className="h-10 w-10 animate-pulseGlow text-neon" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
          <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
          <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
          <path d="M12 18V5" />
        </svg>
      </div>
      <div>
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted">Calculando indicadores em dezenas de tokens. Isso pode levar alguns segundos.</p>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-card-2">
        {progress != null ? (
          <div className="h-full rounded-full bg-gradient-to-r from-neon to-lime transition-all" style={{ width: `${progress}%` }} />
        ) : (
          <div className="absolute inset-y-0 w-1/3 animate-scan rounded-full bg-gradient-to-r from-transparent via-neon to-transparent" />
        )}
      </div>
      <div className="w-full rounded-xl border border-line bg-bg-soft p-4 text-left text-sm">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neon">Você sabia?</div>
        {fact}
      </div>
    </div>
  );
}

/* ---------- Ordenação de tabelas ---------- */
export function useSort<T>(rows: T[], initial: { key: keyof T | string; dir: 'asc' | 'desc' }, getters: Record<string, (r: T) => number | string | null> = {}) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => {
    const get = getters[sort.key as string] ?? ((r: T) => (r as Record<string, unknown>)[sort.key as string] as number | string | null);
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === 'string' ? x.localeCompare(String(y)) : (x as number) - (y as number);
      return sort.dir === 'asc' ? c : -c;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);
  const toggle = (key: string) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
  return { sorted, sort, toggle };
}

export function Th({ label, k, sort, toggle, className }: { label: string; k?: string; sort?: { key: unknown; dir: string }; toggle?: (k: string) => void; className?: string }) {
  if (!k || !toggle) return <th className={className}>{label}</th>;
  const active = sort?.key === k;
  const Icon = !active ? ArrowDownUp : sort!.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={className}>
      <button className={cx('inline-flex items-center gap-1 uppercase hover:text-neon', active && 'text-neon')} onClick={() => toggle(k)}>
        {label} <Icon className="h-3 w-3" />
      </button>
    </th>
  );
}

/* ---------- Filtros em pílula ---------- */
export function Pills<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx('btn', value === o.value ? 'bg-neon text-on-neon shadow-neon-sm' : 'border border-line bg-card-2/60 text-muted hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Ícone de token ---------- */
export function TokenIcon({ symbol, src, size = 28 }: { symbol: string; src?: string | null; size?: number }) {
  const [err, setErr] = useState(false);
  const s = symbol.toLowerCase().replace(/^w(?=(eth|btc|bnb)$)/, '').replace(/^cb/, '');
  const url = src || `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/32/color/${s}.png`;
  if (err)
    return (
      <span className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-neon/80 to-lime/80 font-display text-[10px] font-bold text-on-neon" style={{ width: size, height: size }}>
        {symbol.slice(0, 3)}
      </span>
    );
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={symbol} width={size} height={size} className="shrink-0 rounded-full bg-card-2" onError={() => setErr(true)} />;
}

/* ---------- Barras e medidores ---------- */
export function Bar({ value, tone = 'neon', className }: { value: number; tone?: 'neon' | 'up' | 'down' | 'warn' | 'info'; className?: string }) {
  const color = { neon: 'bg-gradient-to-r from-neon to-lime', up: 'bg-up', down: 'bg-down', warn: 'bg-warn', info: 'bg-info' }[tone];
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-card-2', className)}>
      <div className={cx('h-full rounded-full transition-all', color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export const scoreTone = (s: number) => (s >= 60 ? 'up' : s >= 40 ? 'warn' : 'down');

/** Velocímetro semicircular 0-100. */
export function Gauge({ value, size = 180, label = 'SCORE' }: { value: number; size?: number; label?: string }) {
  const r = 80;
  const c = Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  const angle = Math.PI * (1 - pct);
  const nx = 100 + Math.cos(angle) * 62;
  const ny = 100 - Math.sin(angle) * 62;
  return (
    <svg viewBox="0 0 200 118" width={size} height={(size * 118) / 200} role="img" aria-label={`${label} ${Math.round(value)}`}>
      <defs>
        <linearGradient id="g-gauge" x1="0" x2="1">
          <stop offset="0%" stopColor="rgb(var(--down))" />
          <stop offset="50%" stopColor="rgb(var(--warn))" />
          <stop offset="100%" stopColor="rgb(var(--neon))" />
        </linearGradient>
      </defs>
      <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="rgb(var(--line))" strokeWidth="14" strokeLinecap="round" />
      <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="url(#g-gauge)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />
      <line x1="100" y1="100" x2={nx} y2={ny} stroke="rgb(var(--fg))" strokeWidth="3" strokeLinecap="round" />
      <circle cx="100" cy="100" r="6" fill="rgb(var(--neon))" />
      <text x="100" y="82" textAnchor="middle" className="fill-fg font-display" fontSize="30" fontWeight="700">{Math.round(value)}</text>
      <text x="100" y="116" textAnchor="middle" className="fill-muted" fontSize="10" letterSpacing="2">{label}</text>
    </svg>
  );
}

const PALETTE = ['rgb(var(--neon))', 'rgb(var(--lime))', 'rgb(var(--info))', 'rgb(var(--violet))', 'rgb(var(--warn))', 'rgb(var(--down))'];

/** Rosca (full) ou meia-lua (half). */
export function Donut({ data, half = false, size = 160, center }: { data: { name: string; pct: number }[]; half?: boolean; size?: number; center?: ReactNode }) {
  const r = 60;
  const circ = 2 * Math.PI * r;
  const span = half ? circ / 2 : circ;
  const total = data.reduce((a, d) => a + d.pct, 0) || 1;
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: half ? size / 2 + 10 : size }}>
        <svg viewBox={half ? '0 0 160 90' : '0 0 160 160'} width={size} height={half ? size / 2 + 10 : size}>
          <g transform={half ? 'translate(80 80) rotate(180)' : 'translate(80 80) rotate(-90)'}>
            <circle r={r} fill="none" stroke="rgb(var(--line))" strokeWidth="18" strokeDasharray={`${span} ${circ}`} />
            {data.map((d, i) => {
              const len = (d.pct / total) * span;
              const el = (
                <circle key={d.name} r={r} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="18" strokeDasharray={`${Math.max(len - 2, 0)} ${circ}`} strokeDashoffset={-offset} />
              );
              offset += len;
              return el;
            })}
          </g>
        </svg>
        {center && <div className={cx('absolute inset-x-0 grid place-items-center text-center', half ? 'bottom-0' : 'inset-y-0')}>{center}</div>}
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
        {data.map((d, i) => (
          <span key={d.name} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
            {d.name} <b className="text-fg">{d.pct}%</b>
          </span>
        ))}
      </div>
    </div>
  );
}

export function SectionTitle({ icon, children, right }: { icon?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        {icon && <span className="text-neon">{icon}</span>}
        {children}
      </h2>
      {right}
    </div>
  );
}

export function Disclaimer({ className }: { className?: string }) {
  return (
    <p className={cx('rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-xs text-fg/80', className)}>
      <b className="text-warn">Aviso:</b> conteúdo educacional baseado em indicadores técnicos. Não é recomendação de investimento. Criptoativos têm alto risco; faça sua própria análise.
    </p>
  );
}
