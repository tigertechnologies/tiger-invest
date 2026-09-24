import { getKlines, getKlinesPaged, type Candle } from './binance';
import { ema, last, rsi as rsiFn, sma, supportResistance } from './indicators';
import { r2 } from './analysis';

export const POSITION_WEIGHTS = {
  ath: 0.25,
  fib: 0.25,
  bmsb: 0.25,
  support: 0.15,
  rsi: 0.08,
  volume: 0.02,
} as const;

export type PositionInputs = {
  price: number;
  ath: number;
  fibHi: number;
  fibLo: number;
  sma20w: number;
  ema21w: number;
  support: { price: number; strength: number } | null;
  rsi4h: number | null;
  rsi1d: number;
  rsi1w: number;
  volNow: number; // média de volume das últimas 20 velas diárias
  volPrev: number; // média das 20 anteriores
  priceFalling: boolean;
};

export type PositionComponent = {
  key: keyof typeof POSITION_WEIGHTS;
  label: string;
  score: number;
  weight: number;
  value: string;
  diagnosis: string;
};

export function positionLabel(score: number) {
  if (score >= 75) return { label: 'Excelente zona de compra', tone: 'up' as const };
  if (score >= 60) return { label: 'Boa zona de acumulação', tone: 'up' as const };
  if (score >= 40) return { label: 'HOLD — zona neutra', tone: 'warn' as const };
  return { label: 'Próximo de topos — considere reduzir exposição', tone: 'down' as const };
}

export function scorePosition(p: PositionInputs) {
  const comps: PositionComponent[] = [];

  // 1. Distância do ATH
  const dd = (1 - p.price / p.ath) * 100;
  const athScore = dd >= 80 ? 100 : dd >= 60 ? 80 : dd >= 40 ? 60 : dd >= 20 ? 40 : 20;
  comps.push({
    key: 'ath',
    label: 'Distância do ATH',
    score: athScore,
    weight: POSITION_WEIGHTS.ath,
    value: `-${dd.toFixed(1)}%`,
    diagnosis:
      dd < 10 ? 'Muito próximo da máxima histórica' : dd < 20 ? 'Perto do topo histórico' : dd < 40 ? 'Correção moderada desde o topo' : dd < 60 ? 'Desconto relevante sobre o topo' : 'Desconto profundo em relação ao ATH',
  });

  // 2. Retração de Fibonacci
  const range = p.fibHi - p.fibLo;
  const retr = range > 0 ? Math.min(Math.max((p.fibHi - p.price) / range, 0), 1.2) : 0;
  const fibScore = retr > 0.786 ? 100 : retr >= 0.618 ? 85 : retr >= 0.5 ? 60 : retr >= 0.382 ? 40 : 20;
  comps.push({
    key: 'fib',
    label: 'Retração de Fibonacci',
    score: fibScore,
    weight: POSITION_WEIGHTS.fib,
    value: `${(retr * 100).toFixed(1)}%`,
    diagnosis:
      retr > 0.786 ? 'Retração profunda, abaixo de 78,6%' : retr >= 0.618 ? 'Na zona da proporção áurea (61,8%-78,6%)' : retr >= 0.5 ? 'Retração média (50%-61,8%)' : retr >= 0.382 ? 'Retração rasa (38,2%-50%)' : 'Pouca retração, acima de 38,2%',
  });

  // 3. BMSB semanal
  const top = Math.max(p.sma20w, p.ema21w);
  const bot = Math.min(p.sma20w, p.ema21w);
  const distTop = (p.price / top - 1) * 100;
  const distBot = (p.price / bot - 1) * 100;
  let bmsbScore: number;
  let bmsbDiag: string;
  if (p.price < bot) {
    bmsbScore = distBot < -10 ? 100 : 85;
    bmsbDiag = 'Abaixo da banda semanal: zona de acumulação';
  } else if (p.price <= top) {
    bmsbScore = 60;
    bmsbDiag = 'Dentro da banda: transição';
  } else {
    bmsbScore = distTop > 10 ? 15 : 40;
    bmsbDiag = distTop > 10 ? 'Esticado acima da banda semanal' : 'Levemente acima da banda';
  }
  comps.push({ key: 'bmsb', label: 'Bull Market Support Band', score: bmsbScore, weight: POSITION_WEIGHTS.bmsb, value: `${distTop >= 0 ? '+' : ''}${distTop.toFixed(1)}%`, diagnosis: bmsbDiag });

  // 4. Proximidade de suporte
  let supScore = 20;
  let supVal = '—';
  let supDiag = 'Nenhum suporte relevante abaixo do preço';
  if (p.support) {
    const d = (p.price / p.support.price - 1) * 100;
    supVal = `${d.toFixed(2)}%`;
    if (d <= 2 && p.support.strength >= 3) {
      supScore = 100;
      supDiag = `Sobre suporte forte (${p.support.strength}/5)`;
    } else if (d <= 2) {
      supScore = 80;
      supDiag = 'Muito próximo de um suporte';
    } else if (d <= 5) {
      supScore = 60;
      supDiag = 'Suporte a menos de 5%';
    } else if (d <= 10) {
      supScore = 40;
      supDiag = 'Suporte entre 5% e 10% abaixo';
    } else supDiag = 'Suporte distante (mais de 10%)';
  }
  comps.push({ key: 'support', label: 'Proximidade de Suporte', score: supScore, weight: POSITION_WEIGHTS.support, value: supVal, diagnosis: supDiag });

  // 5. RSI multi-timeframe
  const rs = [p.rsi4h, p.rsi1d, p.rsi1w].filter((x): x is number => Number.isFinite(x as number));
  const low = rs.filter((x) => x < 40).length;
  const avg = rs.reduce((a, b) => a + b, 0) / (rs.length || 1);
  const rsiScore = low >= 3 ? 100 : low === 2 ? 85 : low === 1 ? 70 : avg < 50 ? 50 : avg <= 70 ? 30 : 10;
  comps.push({
    key: 'rsi',
    label: 'RSI Multi-Timeframe',
    score: rsiScore,
    weight: POSITION_WEIGHTS.rsi,
    value: [p.rsi4h, p.rsi1d, p.rsi1w].map((x) => (x == null ? '—' : x.toFixed(0))).join(' / '),
    diagnosis: low >= 2 ? 'RSI baixo em vários tempos gráficos' : low === 1 ? 'RSI baixo em um tempo gráfico' : avg > 70 ? 'RSI esticado' : 'RSI neutro',
  });

  // 6. Exaustão de volume
  const falling = p.volNow < p.volPrev * 0.9;
  const volScore = falling && p.priceFalling ? 100 : falling ? 70 : p.priceFalling ? 30 : 50;
  comps.push({
    key: 'volume',
    label: 'Exaustão de Volume',
    score: volScore,
    weight: POSITION_WEIGHTS.volume,
    value: `${((p.volNow / p.volPrev - 1) * 100).toFixed(0)}%`,
    diagnosis: falling && p.priceFalling ? 'Volume secando na queda: exaustão vendedora' : falling ? 'Volume em queda' : p.priceFalling ? 'Queda com volume: pressão vendedora' : 'Volume estável',
  });

  const score = Math.round(comps.reduce((a, c) => a + c.score * c.weight, 0));
  return {
    score,
    ...positionLabel(score),
    favorable: comps.filter((c) => c.score >= 60).length,
    components: comps,
    raw: { drawdown: r2(dd), retracement: r2(retr * 100, 1), bmsbDist: r2(distTop), bmsbStatus: p.price < bot ? 'abaixo' : p.price <= top ? 'dentro' : 'acima' },
  };
}

export type PositionResult = ReturnType<typeof scorePosition> & {
  symbol: string;
  price: number;
  ath: number;
  rsi: { h4: number | null; d1: number | null; w1: number | null };
};

/** Janela de Fibonacci: máxima das últimas 104 semanas e a mínima anterior a ela. */
function fibRange(weekly: Candle[]) {
  const w = weekly.slice(-104);
  let hiI = 0;
  w.forEach((x, i) => x.h > w[hiI].h && (hiI = i));
  const before = w.slice(0, hiI + 1);
  const lo = Math.min(...(before.length > 1 ? before : w).map((x) => x.l));
  return { hi: w[hiI].h, lo };
}

export async function positionFor(symbol: string): Promise<PositionResult> {
  const [weekly, daily, h4] = await Promise.all([
    getKlines(symbol, '1w', 1000),
    getKlines(symbol, '1d', 300),
    getKlines(symbol, '4h', 120).catch(() => [] as Candle[]),
  ]);
  if (weekly.length < 22 || daily.length < 60) throw new Error('Histórico insuficiente para o score de position.');
  const price = last(daily).c;
  const ath = Math.max(...weekly.map((x) => x.h), ...daily.map((x) => x.h));
  const { hi, lo } = fibRange(weekly);
  const wc = weekly.map((x) => x.c);
  const levels = supportResistance(daily, 200).filter((l) => l.price <= price).sort((a, b) => b.price - a.price);
  const vols = daily.map((x) => x.v);
  const rsi4h = h4.length > 20 ? last(rsiFn(h4.map((x) => x.c))) : null;
  const rsi1d = last(rsiFn(daily.map((x) => x.c)));
  const rsi1w = last(rsiFn(wc));
  const res = scorePosition({
    price,
    ath,
    fibHi: hi,
    fibLo: lo,
    sma20w: last(sma(wc, 20)),
    ema21w: last(ema(wc, 21)),
    support: levels[0] ? { price: levels[0].price, strength: levels[0].strength } : null,
    rsi4h,
    rsi1d,
    rsi1w,
    volNow: avg(vols.slice(-20)),
    volPrev: avg(vols.slice(-40, -20)),
    priceFalling: price < daily[daily.length - 21].c,
  });
  return { ...res, symbol: symbol.toUpperCase(), price, ath, rsi: { h4: r2(rsi4h ?? NaN), d1: r2(rsi1d), w1: r2(rsi1w) } };
}

const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

/* ---------------- Histórico diário do score ---------------- */

const WEEK = 7 * 24 * 3600 * 1000;
// Semanas da Binance começam na segunda-feira 00:00 UTC
const weekStart = (t: number) => {
  const monday = Date.UTC(1970, 0, 5);
  return monday + Math.floor((t - monday) / WEEK) * WEEK;
};

export async function positionHistory(symbol: string, days: number) {
  const warm = 220; // velas diárias extras para aquecer S/R e RSI
  const [daily, weeklyAll] = await Promise.all([getKlinesPaged(symbol, '1d', days + warm), getKlines(symbol, '1w', 1000)]);
  if (daily.length < 80) throw new Error('Histórico insuficiente.');
  const dCloses = daily.map((x) => x.c);
  const rsiD = rsiFn(dCloses);
  const vols = daily.map((x) => x.v);
  const rows: {
    date: string;
    price: number;
    rsi: number | null;
    athDist: number | null;
    fib: number | null;
    bmsb: string;
    support: number | null;
    volume: number | null;
    score: number;
    label: string;
    tone: string;
  }[] = [];
  const start = Math.max(60, daily.length - days);
  for (let i = start; i < daily.length; i++) {
    const day = daily[i];
    const ws = weekStart(day.t);
    const done = weeklyAll.filter((w) => w.t < ws);
    if (done.length < 22) continue;
    const curWeek = daily.slice(Math.max(0, i - 7), i + 1).filter((x) => x.t >= ws);
    const partial: Candle = {
      t: ws,
      o: curWeek[0].o,
      h: Math.max(...curWeek.map((x) => x.h)),
      l: Math.min(...curWeek.map((x) => x.l)),
      c: day.c,
      v: curWeek.reduce((a, x) => a + x.v, 0),
      ct: ws + WEEK - 1,
    };
    const weekly = [...done, partial];
    const wc = weekly.map((x) => x.c);
    const ath = Math.max(...weekly.map((x) => x.h));
    const { hi, lo } = fibRange(weekly);
    const levels = supportResistance(daily.slice(Math.max(0, i - 199), i + 1), 200)
      .filter((l) => l.price <= day.c)
      .sort((a, b) => b.price - a.price);
    const res = scorePosition({
      price: day.c,
      ath,
      fibHi: hi,
      fibLo: lo,
      sma20w: last(sma(wc, 20)),
      ema21w: last(ema(wc, 21)),
      support: levels[0] ? { price: levels[0].price, strength: levels[0].strength } : null,
      rsi4h: null,
      rsi1d: rsiD[i],
      rsi1w: last(rsiFn(wc.slice(-120))),
      volNow: avg(vols.slice(i - 19, i + 1)),
      volPrev: avg(vols.slice(i - 39, i - 19)),
      priceFalling: day.c < daily[i - 20].c,
    });
    const comp = (k: string) => res.components.find((c) => c.key === k)!;
    rows.push({
      date: new Date(day.t).toISOString().slice(0, 10),
      price: day.c,
      rsi: r2(rsiD[i]),
      athDist: res.raw.drawdown,
      fib: res.raw.retracement,
      bmsb: res.raw.bmsbStatus,
      support: comp('support').score,
      volume: comp('volume').score,
      score: res.score,
      label: res.label,
      tone: res.tone,
    });
  }
  return rows.reverse();
}
