import type { Candle } from './binance';

/* Todas as séries retornam arrays alinhados com a entrada (NaN onde não há dados suficientes). */

export const last = <T>(a: T[], n = 1): T => a[a.length - n];
const isNum = (x: number) => Number.isFinite(x);

export function sma(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Suavização de Wilder (RMA). */
function rma(values: number[], period: number, start = 0): number[] {
  const out = new Array(values.length).fill(NaN);
  if (values.length - start < period) return out;
  let prev = 0;
  for (let i = start; i < start + period; i++) prev += values[i];
  prev /= period;
  out[start + period - 1] = prev;
  for (let i = start + period; i < values.length; i++) {
    prev = (prev * (period - 1) + values[i]) / period;
    out[i] = prev;
  }
  return out;
}

export function rsi(closes: number[], period = 14): number[] {
  const out = new Array(closes.length).fill(NaN);
  if (closes.length <= period) return out;
  const gains: number[] = [0];
  const losses: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(Math.max(d, 0));
    losses.push(Math.max(-d, 0));
  }
  const ag = rma(gains, period, 1);
  const al = rma(losses, period, 1);
  for (let i = 0; i < closes.length; i++) {
    if (!isNum(ag[i])) continue;
    out[i] = al[i] === 0 ? 100 : 100 - 100 / (1 + ag[i] / al[i]);
  }
  return out;
}

export function macd(closes: number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(closes, fast);
  const s = ema(closes, slow);
  const line = closes.map((_, i) => f[i] - s[i]);
  const firstValid = line.findIndex(isNum);
  const sig = new Array(closes.length).fill(NaN);
  if (firstValid >= 0) {
    const e = ema(line.slice(firstValid), signal);
    e.forEach((v, i) => (sig[firstValid + i] = v));
  }
  const hist = line.map((v, i) => v - sig[i]);
  return { line, signal: sig, hist };
}

export function stddev(values: number[], period: number): number[] {
  const m = sma(values, period);
  return values.map((_, i) => {
    if (i < period - 1) return NaN;
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += (values[j] - m[i]) ** 2;
    return Math.sqrt(s / period);
  });
}

export function bollinger(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period);
  const sd = stddev(closes, period);
  const upper = mid.map((m, i) => m + mult * sd[i]);
  const lower = mid.map((m, i) => m - mult * sd[i]);
  const width = mid.map((m, i) => ((upper[i] - lower[i]) / m) * 100);
  return { mid, upper, lower, width };
}

export function trueRange(c: Candle[]): number[] {
  return c.map((x, i) =>
    i === 0 ? x.h - x.l : Math.max(x.h - x.l, Math.abs(x.h - c[i - 1].c), Math.abs(x.l - c[i - 1].c)),
  );
}

export function atr(c: Candle[], period = 14) {
  return rma(trueRange(c), period);
}

export function adx(c: Candle[], period = 14) {
  const plusDM = [0];
  const minusDM = [0];
  for (let i = 1; i < c.length; i++) {
    const up = c[i].h - c[i - 1].h;
    const down = c[i - 1].l - c[i].l;
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }
  const tr = trueRange(c);
  const trS = rma(tr, period, 1);
  const pS = rma(plusDM, period, 1);
  const mS = rma(minusDM, period, 1);
  const plusDI = trS.map((t, i) => (100 * pS[i]) / t);
  const minusDI = trS.map((t, i) => (100 * mS[i]) / t);
  const dx = plusDI.map((p, i) => {
    const s = p + minusDI[i];
    return s === 0 ? 0 : (100 * Math.abs(p - minusDI[i])) / s;
  });
  const first = dx.findIndex(isNum);
  const adxS = new Array(c.length).fill(NaN);
  if (first >= 0) rma(dx.slice(first), period).forEach((v, i) => (adxS[first + i] = v));
  return { adx: adxS, plusDI, minusDI };
}

export function stochastic(c: Candle[], kPeriod = 14, dPeriod = 3) {
  const k = c.map((_, i) => {
    if (i < kPeriod - 1) return NaN;
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      hh = Math.max(hh, c[j].h);
      ll = Math.min(ll, c[j].l);
    }
    return hh === ll ? 50 : ((c[i].c - ll) / (hh - ll)) * 100;
  });
  const first = k.findIndex(isNum);
  const d = new Array(c.length).fill(NaN);
  if (first >= 0) sma(k.slice(first), dPeriod).forEach((v, i) => (d[first + i] = v));
  return { k, d };
}

const midpoint = (c: Candle[], end: number, period: number) => {
  if (end - period + 1 < 0) return NaN;
  let hh = -Infinity;
  let ll = Infinity;
  for (let j = end - period + 1; j <= end; j++) {
    hh = Math.max(hh, c[j].h);
    ll = Math.min(ll, c[j].l);
  }
  return (hh + ll) / 2;
};

/** Ichimoku. spanA/spanB "atuais" = valores projetados 26 períodos atrás (a nuvem sob o preço de hoje). */
export function ichimoku(c: Candle[], t = 9, k = 26, b = 52, disp = 26) {
  const n = c.length;
  const tenkan = c.map((_, i) => midpoint(c, i, t));
  const kijun = c.map((_, i) => midpoint(c, i, k));
  const rawA = tenkan.map((v, i) => (v + kijun[i]) / 2);
  const rawB = c.map((_, i) => midpoint(c, i, b));
  const i = n - 1;
  const spanA = rawA[i - disp] ?? NaN; // nuvem sob o preço atual
  const spanB = rawB[i - disp] ?? NaN;
  const futureA = rawA[i]; // nuvem projetada 26 à frente
  const futureB = rawB[i];
  const prevFutureA = rawA[i - 1];
  const prevFutureB = rawB[i - 1];
  const chikouRef = c[i - disp]?.c ?? NaN;
  return { tenkan, kijun, spanA, spanB, futureA, futureB, prevFutureA, prevFutureB, chikouRef };
}

export function obv(c: Candle[]): number[] {
  const out = [0];
  for (let i = 1; i < c.length; i++) {
    const p = out[i - 1];
    out.push(c[i].c > c[i - 1].c ? p + c[i].v : c[i].c < c[i - 1].c ? p - c[i].v : p);
  }
  return out;
}

/** VWAP das últimas `period` velas (preço típico ponderado por volume). */
export function vwap(c: Candle[], period = 50): number {
  const s = c.slice(-period);
  let pv = 0;
  let v = 0;
  for (const x of s) {
    pv += ((x.h + x.l + x.c) / 3) * x.v;
    v += x.v;
  }
  return v ? pv / v : NaN;
}

export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 5) return NaN;
  const x = a.slice(-n);
  const y = b.slice(-n);
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx += (x[i] - mx) ** 2;
    dy += (y[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : NaN;
}

export const returns = (closes: number[]) => closes.slice(1).map((c, i) => c / closes[i] - 1);

/* ---------------- Pivôs, suporte/resistência e Fibonacci ---------------- */

export type Pivot = { i: number; price: number; kind: 'high' | 'low' };

export function pivots(c: Candle[], left = 3, right = 3): Pivot[] {
  const out: Pivot[] = [];
  for (let i = left; i < c.length - right; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      // empates: o primeiro topo/fundo de uma sequência igual conta como pivô
      if (j < i ? c[j].h >= c[i].h : c[j].h > c[i].h) isHigh = false;
      if (j < i ? c[j].l <= c[i].l : c[j].l < c[i].l) isLow = false;
    }
    if (isHigh) out.push({ i, price: c[i].h, kind: 'high' });
    if (isLow) out.push({ i, price: c[i].l, kind: 'low' });
  }
  return out;
}

export type Level = { price: number; touches: number; strength: number; type: 'support' | 'resistance' };

/** Agrupa pivôs próximos e conta quantas velas "tocaram" cada nível. */
export function supportResistance(c: Candle[], lookback = 200, tolPct?: number): Level[] {
  const data = c.slice(-lookback);
  if (data.length < 20) return [];
  const price = last(data).c;
  const a = last(atr(data, 14));
  const tol = tolPct ?? Math.min(Math.max(((a / price) * 100) / 3, 0.35), 1.5); // % de tolerância
  const piv = pivots(data, 3, 3);
  const clusters: { sum: number; n: number }[] = [];
  for (const p of piv.sort((x, y) => x.price - y.price)) {
    const cl = clusters.find((k) => Math.abs(p.price / (k.sum / k.n) - 1) * 100 <= tol);
    if (cl) {
      cl.sum += p.price;
      cl.n++;
    } else clusters.push({ sum: p.price, n: 1 });
  }
  const levels: Level[] = clusters.map((k) => {
    const lvl = k.sum / k.n;
    let touches = 0;
    for (const x of data) {
      const band = lvl * (tol / 100);
      if (x.l <= lvl + band && x.h >= lvl - band) touches++;
    }
    touches = Math.max(touches, k.n);
    return {
      price: lvl,
      touches,
      strength: Math.min(5, Math.max(1, Math.round(k.n + touches / 4))),
      type: lvl <= price ? 'support' : 'resistance',
    };
  });
  // remove níveis quase idênticos mantendo o mais forte
  return levels
    .sort((x, y) => y.touches - x.touches)
    .filter((l, i, arr) => arr.findIndex((o) => Math.abs(o.price / l.price - 1) * 100 < tol) === i)
    .sort((x, y) => x.price - y.price);
}

export function classicPivots(prev: Candle) {
  const p = (prev.h + prev.l + prev.c) / 3;
  return {
    p,
    r1: 2 * p - prev.l,
    s1: 2 * p - prev.h,
    r2: p + (prev.h - prev.l),
    s2: p - (prev.h - prev.l),
    r3: prev.h + 2 * (p - prev.l),
    s3: prev.l - 2 * (prev.h - p),
  };
}

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
export const FIB_EXT = [1.272, 1.618, 2.618];

export function fibonacci(c: Candle[], lookback = 100) {
  const d = c.slice(-lookback);
  let hi = -Infinity;
  let lo = Infinity;
  let hiI = 0;
  let loI = 0;
  d.forEach((x, i) => {
    if (x.h > hi) {
      hi = x.h;
      hiI = i;
    }
    if (x.l < lo) {
      lo = x.l;
      loI = i;
    }
  });
  const uptrend = loI < hiI; // mínima antes da máxima → retração medida de cima para baixo
  const range = hi - lo;
  const retracement = FIB_LEVELS.map((f) => ({ f, price: uptrend ? hi - range * f : lo + range * f }));
  const extension = FIB_EXT.map((f) => ({ f, price: uptrend ? lo + range * f : hi - range * f }));
  const price = last(d).c;
  const pos = range ? (uptrend ? (hi - price) / range : (price - lo) / range) : 0;
  return { hi, lo, uptrend, retracement, extension, position: pos };
}

/* ---------------- Divergências de RSI ---------------- */

export type Divergence = {
  type: 'regular_bull' | 'regular_bear' | 'hidden_bull' | 'hidden_bear';
  rsiDiff: number;
  strong: boolean;
};

export function rsiDivergence(c: Candle[], r: number[], window = 60, recent = 8): Divergence[] {
  const start = Math.max(0, c.length - window);
  const slice = c.slice(start);
  const piv = pivots(slice, 3, 2).map((p) => ({ ...p, i: p.i + start }));
  const lows = piv.filter((p) => p.kind === 'low' && isNum(r[p.i]));
  const highs = piv.filter((p) => p.kind === 'high' && isNum(r[p.i]));
  const out: Divergence[] = [];
  const lastIdx = c.length - 1;
  if (lows.length >= 2) {
    const [a, b] = lows.slice(-2);
    if (lastIdx - b.i <= recent) {
      const diff = Math.abs(r[b.i] - r[a.i]);
      if (b.price < a.price && r[b.i] > r[a.i]) out.push({ type: 'regular_bull', rsiDiff: diff, strong: diff > 10 });
      if (b.price > a.price && r[b.i] < r[a.i]) out.push({ type: 'hidden_bull', rsiDiff: diff, strong: diff > 10 });
    }
  }
  if (highs.length >= 2) {
    const [a, b] = highs.slice(-2);
    if (lastIdx - b.i <= recent) {
      const diff = Math.abs(r[b.i] - r[a.i]);
      if (b.price > a.price && r[b.i] < r[a.i]) out.push({ type: 'regular_bear', rsiDiff: diff, strong: diff > 10 });
      if (b.price < a.price && r[b.i] > r[a.i]) out.push({ type: 'hidden_bear', rsiDiff: diff, strong: diff > 10 });
    }
  }
  return out;
}

/* ---------------- Padrões de candlestick ---------------- */

export type CandlePattern = { key: string; name: string; score: number };

export const PATTERNS: Record<string, { name: string; score: number; desc: string }> = {
  morning_star: { name: 'Estrela da Manhã', score: 5, desc: 'Vela de baixa, vela pequena (ou doji) e vela de alta forte, em sequência.' },
  bull_engulfing: { name: 'Engolfo de Alta', score: 4, desc: 'Vela de alta cujo corpo cobre todo o corpo da vela de baixa anterior.' },
  hammer: { name: 'Martelo', score: 3, desc: 'Corpo pequeno no topo e pavio inferior com pelo menos 2x o corpo, após queda.' },
  piercing: { name: 'Linha Perfurante', score: 3, desc: 'Abre abaixo da mínima anterior e fecha acima da metade do corpo de baixa anterior.' },
  inverted_hammer: { name: 'Martelo Invertido', score: 2, desc: 'Corpo pequeno embaixo e pavio superior longo, após queda.' },
  evening_star: { name: 'Estrela da Tarde', score: -5, desc: 'Vela de alta, vela pequena (ou doji) e vela de baixa forte, em sequência.' },
  bear_engulfing: { name: 'Engolfo de Baixa', score: -4, desc: 'Vela de baixa cujo corpo cobre todo o corpo da vela de alta anterior.' },
  shooting_star: { name: 'Estrela Cadente', score: -3, desc: 'Corpo pequeno embaixo e pavio superior longo, após alta.' },
  dark_cloud: { name: 'Nuvem Negra', score: -3, desc: 'Abre acima da máxima anterior e fecha abaixo da metade do corpo de alta anterior.' },
  hanging_man: { name: 'Enforcado', score: -2, desc: 'Corpo pequeno no topo e pavio inferior longo, após alta.' },
  doji: { name: 'Doji', score: 0, desc: 'Abertura e fechamento quase iguais: indecisão.' },
};

export function candlePatterns(c: Candle[]): CandlePattern[] {
  if (c.length < 8) return [];
  const [a, b, x] = c.slice(-3);
  const body = (k: Candle) => Math.abs(k.c - k.o);
  const range = (k: Candle) => k.h - k.l || 1e-12;
  const bull = (k: Candle) => k.c > k.o;
  const bear = (k: Candle) => k.c < k.o;
  const upper = (k: Candle) => k.h - Math.max(k.o, k.c);
  const lower = (k: Candle) => Math.min(k.o, k.c) - k.l;
  const prior = c.slice(-8, -1);
  const downtrend = prior[0].c > last(prior).c * 1.01;
  const uptrend = prior[0].c < last(prior).c * 0.99;
  const found: string[] = [];

  if (bear(a) && body(b) < body(a) * 0.4 && bull(x) && x.c > (a.o + a.c) / 2 && body(a) / range(a) > 0.5) found.push('morning_star');
  if (bull(a) && body(b) < body(a) * 0.4 && bear(x) && x.c < (a.o + a.c) / 2 && body(a) / range(a) > 0.5) found.push('evening_star');
  if (bear(b) && bull(x) && x.o <= b.c && x.c >= b.o && body(x) > body(b)) found.push('bull_engulfing');
  if (bull(b) && bear(x) && x.o >= b.c && x.c <= b.o && body(x) > body(b)) found.push('bear_engulfing');
  if (bear(b) && bull(x) && x.o < b.l && x.c > (b.o + b.c) / 2 && x.c < b.o) found.push('piercing');
  if (bull(b) && bear(x) && x.o > b.h && x.c < (b.o + b.c) / 2 && x.c > b.o) found.push('dark_cloud');

  const smallBody = body(x) / range(x) < 0.35;
  const longLower = lower(x) >= 2 * body(x) && upper(x) <= body(x) * 0.6 + range(x) * 0.05;
  const longUpper = upper(x) >= 2 * body(x) && lower(x) <= body(x) * 0.6 + range(x) * 0.05;
  if (smallBody && longLower && downtrend) found.push('hammer');
  if (smallBody && longLower && uptrend) found.push('hanging_man');
  if (smallBody && longUpper && downtrend) found.push('inverted_hammer');
  if (smallBody && longUpper && uptrend) found.push('shooting_star');
  if (body(x) / range(x) < 0.08 && !found.length) found.push('doji');

  return found.map((key) => ({ key, name: PATTERNS[key].name, score: PATTERNS[key].score }));
}

/* ---------------- Cruzamentos ---------------- */

/** Retorna 'up' | 'down' se houve cruzamento nas últimas `within` velas. */
export function crossed(fast: number[], slow: number[], within = 3): 'up' | 'down' | null {
  const n = fast.length;
  for (let i = n - 1; i >= Math.max(1, n - within); i--) {
    const d0 = fast[i - 1] - slow[i - 1];
    const d1 = fast[i] - slow[i];
    if (!isNum(d0) || !isNum(d1)) continue;
    if (d0 <= 0 && d1 > 0) return 'up';
    if (d0 >= 0 && d1 < 0) return 'down';
  }
  return null;
}

/** Estima em quantas velas as médias devem se cruzar, pela distância e velocidade de convergência. */
export function crossProjection(fast: number[], slow: number[], lookback = 5): number | null {
  const n = fast.length;
  const d1 = fast[n - 1] - slow[n - 1];
  const d0 = fast[n - 1 - lookback] - slow[n - 1 - lookback];
  if (!isNum(d0) || !isNum(d1)) return null;
  const slope = (d1 - d0) / lookback;
  if (slope === 0 || Math.sign(slope) === Math.sign(d1)) return null; // divergindo
  const candles = Math.abs(d1 / slope);
  return candles <= 60 ? Math.max(1, Math.round(candles)) : null;
}
