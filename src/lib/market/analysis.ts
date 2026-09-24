import type { Candle, Interval } from './binance';
import {
  adx as adxFn,
  atr as atrFn,
  bollinger,
  candlePatterns,
  classicPivots,
  crossProjection,
  crossed,
  ema,
  fibonacci,
  ichimoku,
  last,
  macd as macdFn,
  obv as obvFn,
  pearson,
  returns,
  rsi as rsiFn,
  rsiDivergence,
  sma,
  stochastic,
  supportResistance,
  vwap as vwapFn,
  type Level,
} from './indicators';

export type Side = 'buy' | 'sell';
export type Signal = {
  id: string;
  name: string;
  side: Side;
  weight: number; // peso final (após multiplicadores)
  base: number; // peso original
  detail: string;
  trend?: boolean; // sinal de seguimento de tendência (amplificado com ADX > 50)
  reversal?: boolean; // conta para o scanner de reversão
};

export type Recommendation = 'COMPRA FORTE' | 'COMPRA' | 'MANTER' | 'VENDA' | 'VENDA FORTE';

export const r2 = (x: number, d = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

export function recommend(net: number, confidence: number): Recommendation {
  const high = confidence >= 75;
  if (net >= 4 && high) return 'COMPRA FORTE';
  if (net >= 2) return 'COMPRA';
  if (net <= -4 && high) return 'VENDA FORTE';
  if (net <= -2) return 'VENDA';
  return 'MANTER'; // -2 < net < 2
}

export function confidenceLabel(c: number) {
  if (c >= 90) return 'MUITO ALTA';
  if (c >= 75) return 'ALTA';
  if (c >= 50) return 'MÉDIA';
  return 'BAIXA';
}

const HORIZON: Record<Interval, string> = {
  '15m': '2-8h',
  '1h': '6-24h',
  '4h': '1-3d',
  '1d': '1-4 sem',
  '1w': '1-3 meses',
  '1M': '3-12 meses',
};

export type Analysis = ReturnType<typeof analyze>;

export function analyze(c: Candle[], interval: Interval, opts: { btcCloses?: number[]; weekly?: Candle[] } = {}) {
  if (c.length < 60) throw new Error('Histórico insuficiente para análise (mínimo de 60 velas).');
  const closes = c.map((x) => x.c);
  const price = last(closes);
  const signals: Signal[] = [];
  const add = (s: Omit<Signal, 'weight' | 'base'> & { w: number }) =>
    signals.push({ ...s, weight: s.w, base: s.w });

  /* RSI */
  const rsiS = rsiFn(closes, 14);
  const rsi = last(rsiS);
  if (rsi < 30) add({ id: 'rsi', name: 'RSI em sobrevenda', side: 'buy', w: 2, detail: `RSI ${rsi.toFixed(1)} < 30`, reversal: true });
  else if (rsi > 70) add({ id: 'rsi', name: 'RSI em sobrecompra', side: 'sell', w: 2, detail: `RSI ${rsi.toFixed(1)} > 70`, reversal: true });

  /* MACD */
  const m = macdFn(closes);
  const mLine = last(m.line);
  const mSig = last(m.signal);
  const mCross = crossed(m.line, m.signal, 3);
  if (mCross === 'up') add({ id: 'macd_x', name: 'Cruzamento de alta do MACD', side: 'buy', w: 2, detail: 'Linha MACD cruzou acima da linha de sinal', reversal: true, trend: true });
  else if (mCross === 'down') add({ id: 'macd_x', name: 'Cruzamento de baixa do MACD', side: 'sell', w: 2, detail: 'Linha MACD cruzou abaixo da linha de sinal', reversal: true, trend: true });
  else if (mLine > mSig) add({ id: 'macd', name: 'MACD acima do sinal', side: 'buy', w: 1, detail: 'Momento positivo', trend: true });
  else add({ id: 'macd', name: 'MACD abaixo do sinal', side: 'sell', w: 1, detail: 'Momento negativo', trend: true });
  const zeroCross = crossed(m.line, m.line.map(() => 0), 3);
  if (zeroCross) add({ id: 'macd_0', name: zeroCross === 'up' ? 'MACD cruzou acima de zero' : 'MACD cruzou abaixo de zero', side: zeroCross === 'up' ? 'buy' : 'sell', w: 0.5, detail: 'Mudança de tendência no MACD', trend: true });

  /* Bollinger */
  const bb = bollinger(closes, 20, 2);
  const bbU = last(bb.upper);
  const bbL = last(bb.lower);
  const bbM = last(bb.mid);
  const bbPos = (price - bbL) / (bbU - bbL);
  if (price <= bbL * 1.003) add({ id: 'bb', name: 'Preço na banda inferior de Bollinger', side: 'buy', w: 1.5, detail: 'Possível suporte / sobrevenda', reversal: true });
  else if (price >= bbU * 0.997) add({ id: 'bb', name: 'Preço na banda superior de Bollinger', side: 'sell', w: 1.5, detail: 'Possível resistência / sobrecompra', reversal: true });
  const volatility = last(bb.width);
  const squeeze = volatility <= Math.min(...bb.width.slice(-120).filter(Number.isFinite)) * 1.1;

  /* Médias móveis */
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const ema7 = ema(closes, 7);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const s50 = last(sma50);
  const s200 = last(sma200);
  if (Number.isFinite(s200)) {
    if (price > s200) add({ id: 'ma200', name: 'Preço acima da MA 200', side: 'buy', w: 1, detail: 'Tendência de longo prazo positiva', trend: true });
    else add({ id: 'ma200', name: 'Preço abaixo da MA 200', side: 'sell', w: 1, detail: 'Tendência de longo prazo negativa', trend: true });
    const gc = crossed(sma50, sma200, 5);
    if (gc === 'up') add({ id: 'golden', name: 'Cruzamento Dourado (MA 50 × 200)', side: 'buy', w: 2, detail: 'MA 50 cruzou acima da MA 200', trend: true });
    if (gc === 'down') add({ id: 'death', name: 'Cruzamento da Morte (MA 50 × 200)', side: 'sell', w: 2, detail: 'MA 50 cruzou abaixo da MA 200', trend: true });
  }
  const ex = crossed(ema7, ema21, 3);
  if (ex === 'up') add({ id: 'ema_x', name: 'Cruzamento de alta EMA 7/21', side: 'buy', w: 1.5, detail: 'EMA 7 cruzou acima da EMA 21', trend: true, reversal: true });
  else if (ex === 'down') add({ id: 'ema_x', name: 'Cruzamento de baixa EMA 7/21', side: 'sell', w: 1.5, detail: 'EMA 7 cruzou abaixo da EMA 21', trend: true, reversal: true });
  else if (last(ema7) > last(ema21)) add({ id: 'ema', name: 'EMA 7 acima da EMA 21', side: 'buy', w: 0.5, detail: 'Curto prazo positivo', trend: true });
  else add({ id: 'ema', name: 'EMA 7 abaixo da EMA 21', side: 'sell', w: 0.5, detail: 'Curto prazo negativo', trend: true });

  /* BMSB (semanal) */
  let bmsb: { sma20: number | null; ema21: number | null; status: 'acima' | 'dentro' | 'abaixo' | null } = { sma20: null, ema21: null, status: null };
  const wk = opts.weekly ?? (interval === '1w' ? c : undefined);
  if (wk && wk.length >= 22) {
    const wc = wk.map((x) => x.c);
    const s20 = last(sma(wc, 20));
    const e21 = last(ema(wc, 21));
    const top = Math.max(s20, e21);
    const bot = Math.min(s20, e21);
    const status = price > top ? 'acima' : price < bot ? 'abaixo' : 'dentro';
    bmsb = { sma20: r2(s20), ema21: r2(e21), status };
    if (status === 'acima') add({ id: 'bmsb', name: 'Acima da Banda de Suporte (BMSB)', side: 'buy', w: 1, detail: 'Mercado de alta sustentado', trend: true });
    if (status === 'abaixo') add({ id: 'bmsb', name: 'Abaixo da Banda de Suporte (BMSB)', side: 'sell', w: 1, detail: 'Perda da banda semanal', trend: true });
  }

  /* Estocástico */
  const st = stochastic(c, 14, 3);
  const k = last(st.k);
  const d = last(st.d);
  const stX = crossed(st.k, st.d, 2);
  if (k < 20 && stX === 'up') add({ id: 'stoch', name: 'Estocástico: cruzamento de alta em sobrevenda', side: 'buy', w: 1.5, detail: `%K ${k.toFixed(0)} cruzou %D`, reversal: true });
  else if (k > 80 && stX === 'down') add({ id: 'stoch', name: 'Estocástico: cruzamento de baixa em sobrecompra', side: 'sell', w: 1.5, detail: `%K ${k.toFixed(0)} cruzou %D`, reversal: true });
  else if (k < 20) add({ id: 'stoch', name: 'Estocástico em sobrevenda', side: 'buy', w: 0.5, detail: `%K ${k.toFixed(0)}`, reversal: true });
  else if (k > 80) add({ id: 'stoch', name: 'Estocástico em sobrecompra', side: 'sell', w: 0.5, detail: `%K ${k.toFixed(0)}`, reversal: true });

  /* Fibonacci */
  const fib = fibonacci(c, 100);
  const near = (lvl: number) => Math.abs(price / lvl - 1) <= 0.015;
  const keyFib = fib.retracement.find((x) => [0.382, 0.5, 0.618].includes(x.f) && near(x.price));
  if (keyFib) {
    add({
      id: 'fib',
      name: `Preço na retração de ${(keyFib.f * 100).toFixed(1).replace(".", ",")}% de Fibonacci`,
      side: fib.uptrend ? 'buy' : 'sell',
      w: keyFib.f === 0.618 ? 1.5 : 1,
      detail: fib.uptrend ? 'Recuo em tendência de alta' : 'Repique em tendência de baixa',
      reversal: true,
    });
  }

  /* Suporte e resistência */
  const levels = supportResistance(c, 200);
  const supports = levels.filter((l) => l.type === 'support').sort((a, b) => b.price - a.price);
  const resistances = levels.filter((l) => l.type === 'resistance').sort((a, b) => a.price - b.price);
  const ns = supports[0];
  const nr = resistances[0];
  if (ns && (price / ns.price - 1) * 100 <= 1.5 && ns.touches >= 3) add({ id: 'sr', name: 'Próximo de suporte forte', side: 'buy', w: 1, detail: `Suporte em ${fmt(ns.price)} (${ns.touches} toques)`, reversal: true });
  if (nr && (nr.price / price - 1) * 100 <= 1.5 && nr.touches >= 3) add({ id: 'sr_r', name: 'Próximo de resistência forte', side: 'sell', w: 1, detail: `Resistência em ${fmt(nr.price)} (${nr.touches} toques)`, reversal: true });
  const prev = c[c.length - 2];
  const piv = classicPivots(prev);

  /* Volume */
  const vols = c.map((x) => x.v);
  const vAvg = sma(vols, 20);
  const vNow = last(vols);
  const vRel = vNow / last(vAvg);
  const ob = obvFn(c);
  const obvUp = last(ob) > ob[ob.length - 6];
  const priceUp = price > closes[closes.length - 6];
  const volUp = last(sma(vols, 5)) > last(vAvg);
  const vw = vwapFn(c, 50);
  if (priceUp && volUp && obvUp) add({ id: 'vol', name: 'Confirmação de alta pelo volume', side: 'buy', w: 1.5, detail: 'Preço, volume e OBV subindo', trend: true });
  else if (!priceUp && volUp && !obvUp) add({ id: 'vol', name: 'Confirmação de baixa pelo volume', side: 'sell', w: 1.5, detail: 'Preço caindo com volume e OBV negativo', trend: true });
  if (price > vw) add({ id: 'vwap', name: 'Preço acima do VWAP', side: 'buy', w: 0.5, detail: `VWAP ${fmt(vw)}` });
  else add({ id: 'vwap', name: 'Preço abaixo do VWAP', side: 'sell', w: 0.5, detail: `VWAP ${fmt(vw)}` });
  const hh = Math.max(...c.slice(-20).map((x) => x.h));
  if (last(c).h >= hh && last(sma(vols, 5)) < last(vAvg) * 0.85) add({ id: 'vol_div', name: 'Divergência de volume', side: 'sell', w: 1, detail: 'Nova máxima com volume em queda', reversal: true });
  const spike = vRel >= 2;

  /* ATR */
  const atrS = atrFn(c, 14);
  const atr = last(atrS);
  const atrPct = (atr / price) * 100;
  const atrChange = (atr / atrS[atrS.length - 15] - 1) * 100;
  if (atrChange >= 20) add({ id: 'atr', name: 'Expansão de volatilidade (ATR)', side: priceUp ? 'buy' : 'sell', w: 1, detail: `ATR +${atrChange.toFixed(0)}% em 14 velas`, trend: true });
  const volClass = atrPct < 2 ? 'baixa' : atrPct <= 5 ? 'normal' : 'alta';

  /* Ichimoku */
  const ich = ichimoku(c);
  const tenkan = last(ich.tenkan);
  const kijun = last(ich.kijun);
  const cloudTop = Math.max(ich.spanA, ich.spanB);
  const cloudBot = Math.min(ich.spanA, ich.spanB);
  const cloudPos = price > cloudTop ? 'acima' : price < cloudBot ? 'abaixo' : 'dentro';
  const futureBull = ich.futureA > ich.futureB;
  const twist = Math.sign(ich.prevFutureA - ich.prevFutureB) !== Math.sign(ich.futureA - ich.futureB) ? (futureBull ? 'alta' : 'baixa') : null;
  if (Number.isFinite(cloudTop)) {
    const cloudBull = ich.spanA > ich.spanB;
    if (cloudPos === 'acima' && cloudBull && tenkan > kijun) add({ id: 'ichi', name: 'Ichimoku: configuração forte de alta', side: 'buy', w: 2.5, detail: 'Preço acima da nuvem verde e Tenkan > Kijun', trend: true });
    if (cloudPos === 'abaixo' && !cloudBull && tenkan < kijun) add({ id: 'ichi', name: 'Ichimoku: configuração forte de baixa', side: 'sell', w: 2.5, detail: 'Preço abaixo da nuvem vermelha e Tenkan < Kijun', trend: true });
    const tk = crossed(ich.tenkan, ich.kijun, 3);
    if (tk) add({ id: 'tk', name: tk === 'up' ? 'Cruzamento TK de alta' : 'Cruzamento TK de baixa', side: tk === 'up' ? 'buy' : 'sell', w: 1.5, detail: 'Tenkan cruzou a Kijun', trend: true, reversal: true });
  }
  const cloudEdgeAlert =
    Number.isFinite(cloudTop) && cloudPos !== 'dentro' && Math.min(Math.abs(price / cloudTop - 1), Math.abs(price / cloudBot - 1)) <= 0.02;

  /* Divergências de RSI */
  const divs = rsiDivergence(c, rsiS);
  const DIV_NAMES = {
    regular_bull: 'Divergência altista regular',
    regular_bear: 'Divergência baixista regular',
    hidden_bull: 'Divergência altista oculta',
    hidden_bear: 'Divergência baixista oculta',
  };
  for (const dv of divs) {
    const regular = dv.type.startsWith('regular');
    add({
      id: 'div_' + dv.type,
      name: DIV_NAMES[dv.type] + (dv.strong ? ' (forte)' : ''),
      side: dv.type.endsWith('bull') ? 'buy' : 'sell',
      w: regular ? (dv.strong ? 3 : 2) : 1.5,
      detail: `Diferença de RSI de ${dv.rsiDiff.toFixed(1)} pontos`,
      reversal: regular,
      trend: !regular,
    });
  }

  /* Padrões de candle */
  const patterns = candlePatterns(c);
  for (const p of patterns) {
    if (p.score === 0) continue;
    add({ id: 'cdl_' + p.key, name: `Padrão: ${p.name}`, side: p.score > 0 ? 'buy' : 'sell', w: Math.abs(p.score), detail: `${p.score > 0 ? '+' : ''}${p.score} pontos`, reversal: true });
  }

  /* ADX: filtro e confirmação */
  const ad = adxFn(c, 14);
  const adx = last(ad.adx);
  const pdi = last(ad.plusDI);
  const mdi = last(ad.minusDI);
  if (adx >= 25 && adx <= 50) add({ id: 'adx', name: `ADX ${adx.toFixed(0)}: tendência forte`, side: pdi > mdi ? 'buy' : 'sell', w: 1.5, detail: pdi > mdi ? '+DI acima de -DI' : '-DI acima de +DI', trend: true });

  const modifiers: string[] = [];
  if (adx > 50) {
    signals.forEach((s) => s.trend && (s.weight *= 1.2));
    modifiers.push('ADX > 50: sinais de tendência +20%');
  }
  if (adx < 20) {
    signals.forEach((s) => (s.weight *= 0.3));
    modifiers.push('ADX < 20: mercado lateral, todos os sinais −70%');
  }
  if (cloudPos === 'dentro') {
    signals.forEach((s) => (s.weight *= 0.9));
    modifiers.push('Preço dentro da nuvem Ichimoku: sinais −10%');
  }
  signals.forEach((s) => (s.weight = Math.round(s.weight * 100) / 100));

  /* Correlação com BTC */
  let correlation: number | null = null;
  if (opts.btcCloses && opts.btcCloses.length > 31) {
    correlation = r2(pearson(returns(closes.slice(-31)), returns(opts.btcCloses.slice(-31))));
  }

  /* Placar */
  const buy = signals.filter((s) => s.side === 'buy').reduce((a, s) => a + s.weight, 0);
  const sell = signals.filter((s) => s.side === 'sell').reduce((a, s) => a + s.weight, 0);
  const net = Math.round((buy - sell) * 100) / 100;
  const total = buy + sell;
  let confidence = total ? (Math.max(buy, sell) / total) * 100 : 0;
  if (total < 3) confidence = Math.min(confidence, 60); // poucos sinais: nunca "alta"
  confidence = Math.round(confidence);
  const recommendation = recommend(net, confidence);

  /* Sugestão de trade (stop 2×ATR; alvos 1,5R / 2,5R / 4R) */
  const direction = net > 0 ? 'LONG' : net < 0 ? 'SHORT' : 'NEUTRO';
  const long = direction !== 'SHORT';
  const risk = 2 * atr;
  const entry = price;
  const stop = long ? entry - risk : entry + risk;
  const tps = [1.5, 2.5, 4].map((rr) => ({ rr, price: long ? entry + risk * rr : entry - risk * rr }));
  const refLevel = long ? ns : nr;

  /* Ranges para pools */
  const coverage = (pct: number) => {
    const lo = price * (1 - pct / 100);
    const hi = price * (1 + pct / 100);
    const s = closes.slice(-100);
    return Math.round((s.filter((x) => x >= lo && x <= hi).length / s.length) * 100);
  };
  const poolRanges = [
    { key: 'estreita', label: 'Faixa Estreita', pct: 5 },
    { key: 'media', label: 'Faixa Média', pct: 15 },
    { key: 'ampla', label: 'Faixa Ampla', pct: 30 },
  ].map((r) => ({ ...r, min: price * (1 - r.pct / 100), max: price * (1 + r.pct / 100), coverage: coverage(r.pct) }));
  const poolRecommended = atrPct < 2 ? 'estreita' : atrPct <= 5 ? 'media' : 'ampla';

  const dec = (x: number) => r2(x, price < 1 ? 8 : 2);

  return {
    interval,
    price,
    change: r2((price / closes[closes.length - 2] - 1) * 100),
    signals: signals.sort((a, b) => b.weight - a.weight),
    modifiers,
    score: { buy: r2(buy), sell: r2(sell), net, confidence, confidenceLabel: confidenceLabel(confidence), recommendation },
    trade: {
      direction,
      entry: dec(entry),
      stop: dec(stop),
      stopPct: r2(((stop - entry) / entry) * 100),
      targets: tps.map((t) => ({ rr: t.rr, price: dec(t.price), pct: r2(((t.price - entry) / entry) * 100) })),
      reference: refLevel
        ? { type: refLevel.type, price: dec(refLevel.price), touches: refLevel.touches, distPct: r2(((price - refLevel.price) / refLevel.price) * 100) }
        : null,
      riskLabel: atrPct > 8 ? 'MUITO ALTA' : atrPct > 5 ? 'ALTA' : atrPct >= 2 ? 'NORMAL' : 'BAIXA',
      horizon: HORIZON[interval],
    },
    indicators: {
      rsi: r2(rsi),
      rsiStatus: rsi < 30 ? 'Sobrevenda' : rsi > 70 ? 'Sobrecompra' : 'Neutro',
      macd: { line: dec(mLine), signal: dec(mSig), hist: dec(mLine - mSig), cross: mCross, zeroCross },
      bollinger: { upper: dec(bbU), mid: dec(bbM), lower: dec(bbL), position: r2(bbPos * 100, 0), squeeze },
      ma: {
        sma50: dec(s50),
        sma200: dec(s200),
        ema7: dec(last(ema7)),
        ema21: dec(last(ema21)),
        ema50: dec(last(ema50)),
        ema200: dec(last(ema200)),
        emaCross: ex,
        emaProjection: crossProjection(ema7, ema21),
        smaProjection: Number.isFinite(s200) ? crossProjection(sma50, sma200) : null,
        goldenState: Number.isFinite(s200) ? (s50 > s200 ? 'golden' : 'death') : null,
      },
      bmsb,
      stochastic: { k: r2(k), d: r2(d), cross: stX },
      fibonacci: {
        hi: dec(fib.hi),
        lo: dec(fib.lo),
        uptrend: fib.uptrend,
        position: r2(fib.position * 100, 1),
        retracement: fib.retracement.map((x) => ({ f: x.f, price: dec(x.price) })),
        extension: fib.extension.map((x) => ({ f: x.f, price: dec(x.price) })),
      },
      levels: {
        supports: supports.slice(0, 3).map((l) => lvl(l, price, dec)),
        resistances: resistances.slice(0, 3).map((l) => lvl(l, price, dec)),
        pivots: Object.fromEntries(Object.entries(piv).map(([k2, v]) => [k2, dec(v)])),
      },
      adx: { adx: r2(adx), plusDI: r2(pdi), minusDI: r2(mdi), label: adx < 20 ? 'Sem tendência' : adx < 25 ? 'Tendência fraca' : adx <= 50 ? 'Tendência forte' : 'Tendência muito forte' },
      atr: { value: dec(atr), pct: r2(atrPct), change: r2(atrChange), class: volClass, stopLong: dec(price - 2 * atr), stopShort: dec(price + 2 * atr) },
      ichimoku: {
        tenkan: dec(tenkan),
        kijun: dec(kijun),
        spanA: dec(ich.spanA),
        spanB: dec(ich.spanB),
        position: cloudPos,
        cloud: ich.spanA > ich.spanB ? 'alta' : 'baixa',
        twist,
        chikou: Number.isFinite(ich.chikouRef) ? (price > ich.chikouRef ? 'acima' : 'abaixo') : null,
        edgeAlert: cloudEdgeAlert,
      },
      volume: { relative: r2(vRel), spike, obvTrend: obvUp ? 'alta' : 'baixa', vwap: dec(vw), trend: volUp ? 'crescente' : 'decrescente' },
      volatility: { width: r2(volatility), class: volatility > 15 ? 'alta' : volatility >= 8 ? 'média' : 'baixa' },
      divergences: divs.map((dv) => ({ ...dv, rsiDiff: r2(dv.rsiDiff) })),
      patterns,
      correlation,
    },
    pools: { ranges: poolRanges.map((p) => ({ ...p, min: dec(p.min), max: dec(p.max) })), recommended: poolRecommended },
  };
}

function lvl(l: Level, price: number, dec: (x: number) => number | null) {
  return { price: dec(l.price), touches: l.touches, strength: l.strength, distPct: r2(((l.price - price) / price) * 100) };
}

function fmt(x: number) {
  return x >= 1 ? x.toFixed(2) : x.toPrecision(4);
}

/* ---------- Resumo de reversão (scanner) ---------- */
export function reversalSummary(a: Analysis) {
  const rev = a.signals.filter((s) => s.reversal);
  const buy = rev.filter((s) => s.side === 'buy');
  const sell = rev.filter((s) => s.side === 'sell');
  const net = Math.round(buy.reduce((x, s) => x + s.weight, 0) - sell.reduce((x, s) => x + s.weight, 0));
  if (Math.abs(net) < 3) return null;
  const side = net > 0 ? buy : sell;
  return {
    type: net > 0 ? ('alta' as const) : ('baixa' as const),
    strength: Math.abs(net) >= 5 ? ('forte' as const) : ('moderada' as const),
    score: net,
    count: side.length,
    signals: side.map((s) => ({ name: s.name, detail: s.detail, weight: s.weight })),
  };
}
