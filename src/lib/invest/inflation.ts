// ============================================================
// Inflação do ATIVO (emissão de tokens novos) — NÃO é inflação do Real.
//
// Cada token cria novas unidades por ano (emissão). Isso DILUI quem segura:
// se a oferta cresce X% e o preço não acompanha, sua fatia da rede encolhe.
// Um ganho de preço só é "real" se SUPERA a emissão do próprio token —
// senão parte do lucro é só a moeda inflando, não valorização genuína.
// ============================================================

// Emissão anual estimada (% ao ano). Fonte: cronogramas on-chain / tokenomics
// oficiais / Coinbase Research — atualizado em set/2026. Muda devagar
// (cronograma) — revisar a cada halving/upgrade. Negativo = deflacionário (burn).
export const TOKEN_EMISSION: Record<string, number> = {
  BTC: 0.83,   // pós-halving 2024 (3,125 BTC/bloco); cai ~pela metade em 2028
  ETH: 0.5,    // pós-merge, líquido de burn; pode ficar levemente negativo em alta demanda
  SOL: 4.5,    // desinflacionário: cai 15%/ano rumo a 1,5% terminal
  BNB: -1.5,   // burn trimestral: oferta encolhe (deflacionário)
  XRP: 0.0,    // sem emissão de bloco (oferta pré-cunhada)
  ADA: 3.0,
  AVAX: 5.0,
  DOT: 7.0,    // inflação-alvo ~10% bruto, ~7% líquido conforme staking
  MATIC: 2.0,
  POL: 2.0,
  LINK: 0.0,
  DOGE: 3.7,   // 5 bi DOGE/ano fixos sobre oferta crescente
  LTC: 1.5,
  TRX: 0.0,
  TON: 0.6,
  NEAR: 5.0,
  ATOM: 10.0,  // alta emissao
  INJ: 6.0,
  SUI: 5.0,
  APT: 7.0,
  // Stablecoins: sem emissao relevante p/ o holder
  USDC: 0.0, USDT: 0.0, DAI: 0.0, USDE: 0.0,
}

export const emissionFor = (symbol: string): number | null => {
  const k = symbol.toUpperCase()
  return k in TOKEN_EMISSION ? TOKEN_EMISSION[k] : null
}

// Tom do chip: quanto MENOR a emissao, mais "moeda dura" (menos diluicao).
export function emissionTone(e: number | null): 'good' | 'ok' | 'warn' | 'bad' | 'none' {
  if (e == null) return 'none'
  if (e <= 1) return 'good'      // BTC, ETH, deflacionarios
  if (e <= 3) return 'ok'
  if (e <= 6) return 'warn'
  return 'bad'                    // emissao alta = diluicao forte
}

// Lucro real DESCONTANDO A EMISSAO DO TOKEN.
// A oferta cresceu `dilution` no periodo; pra "empatar" com a propria diluicao
// da rede o preco precisava subir isso. O que passar disso e ganho real.
//   custoAjustado = invested x (1 + emissao)^anos
//   lucroReal     = valor - custoAjustado
// Deflacionario (emissao < 0): custoAjustado < invested -> ganho real MAIOR.
export function dilutionAdjusted(
  invested: number, currentValue: number, days: number, emissionAnnual: number | null,
) {
  const years = Math.max(0, days) / 365
  const e = emissionAnnual ?? 0
  const factor = Math.pow(1 + e / 100, years)
  const dilutionPct = (factor - 1) * 100
  const custoAjustado = invested * factor
  const lucroReal = currentValue - custoAjustado
  const lucroNominal = currentValue - invested
  const nominalPct = invested > 0 ? (currentValue / invested - 1) * 100 : 0
  const realPct = custoAjustado > 0 ? (currentValue / custoAjustado - 1) * 100 : 0
  return { years, emission: e, has: emissionAnnual != null, dilutionPct, custoAjustado, lucroReal, lucroNominal, nominalPct, realPct }
}
