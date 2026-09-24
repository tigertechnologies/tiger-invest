const nf = (min: number, max: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max });

export function decimalsFor(x: number) {
  const a = Math.abs(x);
  if (a >= 1000) return 2;
  if (a >= 1) return 2;
  if (a >= 0.01) return 4;
  if (a >= 0.0001) return 6;
  return 8;
}

export function fmtPrice(x: number | null | undefined, prefix = '$') {
  if (x == null || !Number.isFinite(x)) return '—';
  const d = decimalsFor(x);
  return `${x < 0 ? '-' : ''}${prefix}${nf(d, d).format(Math.abs(x))}`;
}

export function fmtNum(x: number | null | undefined, d = 2) {
  if (x == null || !Number.isFinite(x)) return '—';
  return nf(0, d).format(x);
}

export function fmtPct(x: number | null | undefined, d = 2, sign = true) {
  if (x == null || !Number.isFinite(x)) return '—';
  return `${sign && x > 0 ? '+' : ''}${nf(d, d).format(x)}%`;
}

export function fmtCompact(x: number | null | undefined, prefix = '$') {
  if (x == null || !Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  const units: [number, string][] = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [v, u] of units) if (a >= v) return `${prefix}${nf(0, 2).format(x / v)}${u}`;
  return `${prefix}${nf(0, 2).format(x)}`;
}

export function fmtTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtDate(iso: string | null | undefined, long = false) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return d.toLocaleDateString('pt-BR', long ? { day: '2-digit', month: 'long', year: 'numeric' } : undefined);
}

export const shortAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a);
