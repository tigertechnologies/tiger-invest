export type DefiDashboard = {
  updated_at: string;
  platforms: { name: string; pct: number }[];
  collateral_allocation: { name: string; pct: number }[];
  collateral_assets: string[];
  borrow_assets: string[];
  profiles: { name: string; pct: number }[];
  overview: string;
  benefits: string[];
  rules: string[];
  monitored: string[];
};

export const DEFI_DEFAULT: DefiDashboard = {
  updated_at: new Date().toISOString().slice(0, 10),
  platforms: [{ name: 'AAVE', pct: 50 }, { name: 'Morpho', pct: 50 }],
  collateral_allocation: [{ name: 'BTC', pct: 60 }, { name: 'ETH', pct: 40 }],
  collateral_assets: ['cbBTC', 'ETH', 'USDC'],
  borrow_assets: ['USDC', 'USDT'],
  profiles: [{ name: 'Conservador', pct: 50 }, { name: 'Moderado', pct: 30 }, { name: 'Agressivo', pct: 20 }],
  overview: 'Deposite BTC e ETH como garantia, tome emprestado stablecoins com folga de segurança e aloque em pools selecionadas, buscando cerca de 1% ao mês sem abrir mão da exposição aos ativos principais.',
  benefits: ['Mantém exposição a BTC e ETH', 'Rendimento em stablecoins', 'Risco controlado pelo Health Factor', 'Rebalanceamento simples'],
  rules: ['No máximo $500 emprestados a cada $1.000 em garantia', 'Mantenha o Health Factor sempre acima de 1,5', 'Revise as faixas das pools toda semana'],
  monitored: ['BTC', 'ETH', 'USDC', 'USDT', 'cbBTC'],
};
