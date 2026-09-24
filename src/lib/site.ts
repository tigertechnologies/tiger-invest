export const SITE = {
  name: 'Tiger Labs',
  tagline: 'Análise técnica e DeFi com indicadores em tempo real',
  description:
    'Ferramentas avançadas de análise e trading de criptomoedas, com indicadores técnicos, scanners e estratégias DeFi.',
  url: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
};

export type NavItem = { href: string; label: string; desc?: string };
export type NavGroup = { label: string; key: string; items: NavItem[] };

export const NAV: (NavItem | NavGroup)[] = [
  { href: '/invest', label: 'Minha Carteira' },
  {
    label: 'Mercado',
    key: 'mercado',
    items: [
      { href: '/mercado/pulso', label: 'Pulso do Mercado', desc: 'Fear & Greed, dominância, stablecoins e TVL' },
      { href: '/mercado/radar', label: 'Radar', desc: 'Top, altcoins, memes, ganhadores e sinais' },
      { href: '/mercado/btc-lab', label: 'BTC Lab', desc: 'On-chain, ciclo, halving e mempool' },
      { href: '/mercado/tiger-100', label: 'Índice Tiger 100', desc: 'As 100 maiores em um índice + comparador' },
    ],
  },
  {
    label: 'Análises',
    key: 'analises',
    items: [
      { href: '/', label: 'Análise Técnica', desc: 'Sinal, score e trade sugerido por token' },
      { href: '/reversals', label: 'Sinais de Reversão', desc: 'Padrões de reversão em 140+ tokens' },
      { href: '/rsi', label: 'Scanner RSI', desc: 'Sobrecompra e sobrevenda no 4h' },
      { href: '/support-resistance', label: 'Suporte e Resistência', desc: 'Níveis fortes a ±2% do preço' },
      { href: '/indicators', label: 'Guia de Indicadores', desc: 'Aprenda cada indicador do motor' },
    ],
  },
  {
    label: 'Estratégias',
    key: 'estrategias',
    items: [
      { href: '/position-trading', label: 'Position Trading', desc: 'Score de acumulação 0-100' },
      { href: '/position-trading/opportunities', label: 'Melhores Oportunidades', desc: 'Ranking de compra e realização' },
      { href: '/position-trading/history', label: 'Histórico do Score', desc: 'Score diário de BTC, ETH e SOL' },
      { href: '/pools', label: 'Sugestões de Pools', desc: 'Pools e ranges selecionados' },
      { href: '/weekly-reports', label: 'Relatórios Semanais', desc: 'Leitura semanal do mercado' },
    ],
  },
  {
    label: 'DeFi',
    key: 'defi',
    items: [
      { href: '/defi/dashboard', label: 'Dashboard DeFi', desc: 'Estratégia 1% e alocações' },
      { href: '/defi/stablecoin-pools', label: 'Pools de Stablecoins', desc: 'TVL e APY via DeFiLlama' },
      { href: '/defi/token-pools', label: 'Pools de Tokens', desc: 'Hot pools e APY alto' },
      { href: '/defi/wallet-tracker', label: 'Rastreador de Carteiras', desc: 'Saldos, Aave e LPs multichain' },
      { href: '/defi/pools-tracker', label: 'Análise de Pools', desc: 'Uniswap V3: range, taxas e IL' },
      { href: '/defi/ideias-de-pools', label: 'Ideias de Pools', desc: 'Nota de Yield, watchlist e calculadora de IL' },
    ],
  },
  { href: '/tutorials', label: 'Tutoriais' },
  { href: '/planos', label: 'Planos' },
];

export const DEFAULT_TOKENS = ['BTC', 'ETH', 'BNB', 'SOL'];

// ~140 tokens com par USDT na Binance usados pelos scanners
export const SCAN_TOKENS = [
  'BTC','ETH','BNB','SOL','XRP','DOGE','ADA','TRX','AVAX','LINK','DOT','TON','SHIB','BCH','LTC','NEAR','UNI','APT','ICP','ETC',
  'PEPE','FET','RENDER','ATOM','XLM','FIL','HBAR','ARB','OP','INJ','IMX','STX','SUI','VET','MKR','GRT','TAO','AAVE','THETA','RUNE',
  'SEI','ALGO','FLOW','EGLD','SAND','MANA','AXS','GALA','CHZ','APE','LDO','CRV','SNX','COMP','DYDX','GMX','PENDLE','JUP','PYTH','TIA',
  'WLD','ENA','ETHFI','ONDO','JTO','BONK','WIF','FLOKI','ORDI','KAS','XEC','KAVA','ZEC','DASH','NEO','IOTA','XTZ','EOS','QNT','MINA',
  'ROSE','CFX','CKB','KSM','ONE','ZIL','ENJ','BAT','1INCH','SUSHI','YFI','BAL','ZRX','LRC','ANKR','CELO','SKL','STORJ','AR','ICX',
  'RVN','WOO','GMT','MAGIC','BLUR','ID','ARKM','CYBER','SUPER','AGLD','ACE','NFP','AI','XAI','MANTA','ALT','PIXEL','STRK','PORTAL','AXL',
  'W','TNSR','SAGA','OMNI','REZ','BB','NOT','IO','ZK','LISTA','ZRO','BANANA','RSR','COTI','CELR','HOT','IOTX','JASMY','LPT','MASK',
];
