// Teste offline do motor de indicadores com dados sintéticos (não precisa de rede).
import { analyze, recommend } from '../src/lib/market/analysis';
import { rsi, sma, ema, atr, adx, macd, supportResistance } from '../src/lib/market/indicators';
import { scorePosition } from '../src/lib/market/position';
import type { Candle } from '../src/lib/market/binance';

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function walk(n: number, start = 100, drift = 0): Candle[] {
  const out: Candle[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    const o = p;
    const c = o * (1 + (rand() - 0.5) * 0.04 + drift);
    const h = Math.max(o, c) * (1 + rand() * 0.015);
    const l = Math.min(o, c) * (1 - rand() * 0.015);
    out.push({ t: i * 864e5, o, h, l, c, v: 1000 + rand() * 500, ct: i * 864e5 + 1 });
    p = c;
  }
  return out;
}
const assert = (cond: boolean, msg: string) => { if (!cond) { console.error('FALHOU:', msg); process.exit(1); } console.log('ok -', msg); };

// SMA/EMA básicos
assert(sma([1, 2, 3, 4, 5], 5)[4] === 3, 'SMA(5) de 1..5 = 3');
assert(Math.abs(ema([1, 2, 3, 4, 5, 6], 3)[5] - 5) < 1e-9, 'EMA(3) converge corretamente');
// RSI: série só subindo => 100
assert(rsi(Array.from({ length: 30 }, (_, i) => i + 1))[29] === 100, 'RSI de série só de alta = 100');
const mixed = walk(300);
const r = rsi(mixed.map((c) => c.c));
assert(r.slice(20).every((x) => x >= 0 && x <= 100), 'RSI sempre entre 0 e 100');
const a14 = atr(mixed);
assert(a14.slice(20).every((x) => x > 0), 'ATR positivo');
const ad = adx(mixed);
assert(Number.isFinite(ad.adx[299]) && ad.adx[299] >= 0 && ad.adx[299] <= 100, 'ADX entre 0 e 100');
const m = macd(mixed.map((c) => c.c));
assert(Number.isFinite(m.signal[299]), 'MACD com linha de sinal');
const lv = supportResistance(mixed);
assert(lv.length > 0, `S/R encontrou ${lv.length} níveis`);

// Faixas de recomendação (sem buraco entre 1 e 2)
assert(recommend(1.5, 80) === 'MANTER', 'net 1,5 => MANTER');
assert(recommend(2, 40) === 'COMPRA', 'net 2 => COMPRA');
assert(recommend(4.2, 80) === 'COMPRA FORTE', 'net 4,2 com confiança alta => COMPRA FORTE');
assert(recommend(4.2, 60) === 'COMPRA', 'net 4,2 com confiança média => COMPRA');
assert(recommend(-4, 90) === 'VENDA FORTE', 'net -4 com confiança alta => VENDA FORTE');

// Análise completa
for (const [name, drift] of [['alta', 0.004], ['baixa', -0.004], ['lateral', 0]] as const) {
  const res = analyze(walk(500, 100, drift), '1d', { weekly: walk(60, 100, drift) });
  assert(res.signals.length > 0, `análise ${name}: ${res.signals.length} sinais, net ${res.score.net}, ${res.score.recommendation}, conf ${res.score.confidence}%`);
  assert(res.trade.targets.length === 3 && res.trade.stop != null, `análise ${name}: trade ${res.trade.direction} entry ${res.trade.entry} stop ${res.trade.stop}`);
  assert(res.pools.ranges.every((p) => p.coverage >= 0 && p.coverage <= 100), `análise ${name}: cobertura das pools válida`);
}

// Score de position
const top = scorePosition({ price: 100, ath: 102, fibHi: 102, fibLo: 40, sma20w: 80, ema21w: 78, support: { price: 90, strength: 2 }, rsi4h: 75, rsi1d: 78, rsi1w: 80, volNow: 100, volPrev: 100, priceFalling: false });
const bottom = scorePosition({ price: 20, ath: 110, fibHi: 110, fibLo: 18, sma20w: 30, ema21w: 32, support: { price: 19.8, strength: 4 }, rsi4h: 25, rsi1d: 28, rsi1w: 35, volNow: 60, volPrev: 100, priceFalling: true });
assert(top.score < 40, `perto do topo => score ${top.score} (${top.label})`);
assert(bottom.score >= 75, `fundo => score ${bottom.score} (${bottom.label})`);
const wsum = top.components.reduce((a, c) => a + c.weight, 0);
assert(Math.abs(wsum - 1) < 1e-9, 'pesos do position somam 100%');
console.log('\nTodos os testes do motor passaram.');
