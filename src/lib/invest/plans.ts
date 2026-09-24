export type Plan = { id: string; name: string; price: number; tag: string; popular?: boolean; features: string[] }

// Defaults / fallback. A fonte de verdade em produção é a tabela `plans` (editável no painel admin).
export const PLANS: Plan[] = [
  {
    id: 'start', name: 'TIGER START', price: 5.99, tag: 'O começo do controle',
    features: [
      'Minha Carteira: cripto, ações, caixa e pools',
      'Custo médio automático por transação',
      'Cotação ao vivo',
      'Alocação, blocos por nicho e metas',
      'Patrimônio e resultado em tempo real',
      'Relatórios semanais e conteúdo exclusivo do Labs',
    ],
  },
  {
    id: 'pro', name: 'TIGER PRO', price: 9.99, tag: 'Análise e radar', popular: true,
    features: [
      'Tudo do START, e mais:',
      'Pulso do mercado, Radar e BTC Lab',
      'Níveis personalizados por ativo',
      'Perps (Ondo) com TP/SL',
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
