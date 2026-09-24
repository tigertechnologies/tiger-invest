'use client';
import { X } from 'lucide-react';

const ROWS = [
  ['Distância do ATH', '25%', '100 (80%+ abaixo do topo) · 80 (60-80%) · 60 (40-60%) · 40 (20-40%) · 20 (0-20%)'],
  ['Retração de Fibonacci', '25%', 'Faixa: máxima das últimas 104 semanas até a mínima anterior. 100 (abaixo de 78,6%) · 85 (61,8-78,6%) · 60 (50-61,8%) · 40 (38,2-50%) · 20 (acima de 38,2%)'],
  ['Bull Market Support Band', '25%', 'SMA 20 e EMA 21 semanais. Abaixo da banda = acumulação (85-100) · dentro = transição (60) · acima = 40 · mais de 10% acima = esticado (15)'],
  ['Proximidade de suporte', '15%', '100 com suporte a até 2% e força ≥ 3/5 · 80 (≤ 2%) · 60 (≤ 5%) · 40 (≤ 10%) · 20 (distante)'],
  ['RSI multi-timeframe', '8%', 'RSI 4h, 1D e 1W. 100 (os três < 40) · 85 (dois) · 70 (um) · 50/30/10 conforme a média'],
  ['Exaustão de volume', '2%', 'Volume das últimas 20 velas diárias vs. as 20 anteriores. Volume secando na queda = exaustão (100)'],
];

export function ExplainModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="explain-t">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-line bg-card p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 id="explain-t" className="font-display text-xl font-bold">Como funciona o score de Position Trading</h2>
            <p className="text-sm text-muted">Nota de 0 a 100 que indica se o ativo está em zona de acumulação de longo prazo ou perto de topos.</p>
          </div>
          <button onClick={onClose} className="rounded-full border border-neon/40 p-1.5 text-neon" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase text-muted"><th className="py-2 pr-3">Componente</th><th className="py-2 pr-3">Peso</th><th className="py-2">Regra</th></tr></thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r[0]} className="border-t border-line align-top"><td className="py-2 pr-3 font-semibold">{r[0]}</td><td className="py-2 pr-3 font-mono text-neon">{r[1]}</td><td className="py-2 text-fg/80">{r[2]}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="mb-2 mt-5 font-semibold">Faixas de recomendação</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-up/40 bg-up/10 p-3 text-sm"><b className="text-up">75-100</b> · Excelente zona de compra</div>
          <div className="rounded-xl border border-up/30 bg-up/5 p-3 text-sm"><b className="text-up">60-74</b> · Boa zona de acumulação</div>
          <div className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm"><b className="text-warn">40-59</b> · HOLD, zona neutra</div>
          <div className="rounded-xl border border-down/40 bg-down/10 p-3 text-sm"><b className="text-down">0-39</b> · Próximo de topos, considere reduzir exposição</div>
        </div>
        <p className="mt-4 text-xs text-muted">O score é uma ferramenta educacional de leitura de ciclo. Não é recomendação de investimento.</p>
      </div>
    </div>
  );
}
