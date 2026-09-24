'use client';
import { Crud } from '../crud';

export default function Page() {
  return (
    <Crud
      title="Pools sugeridas"
      table="suggested_pools"
      order={{ col: 'sort', asc: true }}
      onBeforeSave={(r) => ({ ...r, token0: String(r.token0).toUpperCase(), token1: String(r.token1).toUpperCase(), updated_at: new Date().toISOString() })}
      fields={[
        { key: 'strategy', label: 'Seção', type: 'select', options: ['suggested', 'one_percent'], defaultValue: 'suggested', list: true, help: 'suggested = Pools sugeridas · one_percent = Estratégia 1%' },
        { key: 'token0', label: 'Token base (ex.: ETH)', type: 'text', required: true, list: true },
        { key: 'token1', label: 'Token de cotação (ex.: USDC)', type: 'text', required: true, list: true, defaultValue: 'USDC' },
        { key: 'range_min', label: 'Faixa mínima', type: 'number', required: true, list: true, help: 'Em unidades do token de cotação por token base' },
        { key: 'range_max', label: 'Faixa máxima', type: 'number', required: true, list: true },
        { key: 'fee', label: 'Fee (%)', type: 'number', required: true, defaultValue: 0.05 },
        { key: 'wallet_pct', label: '% da carteira', type: 'number' },
        { key: 'network', label: 'Rede', type: 'select', options: ['Base', 'Ethereum', 'Arbitrum', 'Optimism', 'Polygon', 'BNB Chain', 'Solana'], defaultValue: 'Base', list: true },
        { key: 'risk', label: 'Risco', type: 'select', options: ['Baixo', 'Moderado', 'Alto'], defaultValue: 'Moderado', list: true },
        { key: 'simulate_url', label: 'Link de simulação', type: 'url' },
        { key: 'sort', label: 'Ordem', type: 'number', defaultValue: 0 },
        { key: 'active', label: 'Ativa', type: 'bool', defaultValue: true, list: true },
        { key: 'notes', label: 'Observações internas', type: 'textarea' },
      ]}
    />
  );
}
