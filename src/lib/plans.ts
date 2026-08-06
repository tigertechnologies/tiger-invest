export type Plan = { id: string; name: string; price: number; tag: string; popular?: boolean; features: string[] }

// Defaults / fallback. A fonte de verdade em produção é a tabela `plans` (editável no painel admin).
export const PLANS: Plan[] = [
  {
    id: 'start', name: 'TIGER START', price: 5.99, tag: 'O começo do controle',
    features: [
      'Carteira completa: cripto, ações, caixa e pools',
      'Custo médio automático por transação',
      'Cotação de cripto ao vivo',
      'Alocação, blocos por nicho e metas',
      'Patrimônio e resultado em tempo real',
    ],
  },
  {
    id: 'pro', name: 'TIGER PRO', price: 9.99, tag: 'Análise e radar', popular: true,
    features: [
      'Tudo do START, e mais:',
      'Análise técnica estrutural (suporte, resistência e gatilhos)',
      'Bull Market Support Band + RSI + tendência',
      'Radar de mercado: top, altcoins, memes e pools',
      'Níveis personalizados por ativo',
      'Alertas inteligentes',
    ],
  },
  {
    id: 'alpha', name: 'TIGER ALPHA', price: 19.99, tag: 'O predador completo',
    features: [
      'Tudo do PRO, e mais:',
      'Fluxo de caixa completo (P/L por período)',
      'Controle avançado de pools com tração ao vivo',
      'Prioridade em novos recursos',
    ],
  },
]

// Converte uma linha da tabela `plans` para o tipo Plan.
export function rowToPlan(r: any): Plan {
  return { id: r.id, name: r.name, price: (r.price_cents ?? 0) / 100, tag: r.tag ?? '', popular: !!r.popular, features: Array.isArray(r.features) ? r.features : [] }
}
