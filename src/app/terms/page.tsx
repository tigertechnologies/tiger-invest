import { LegalPage } from '@/components/legal';
export const metadata = { title: 'Termos de Uso' };
export default function Page() {
  return (
    <LegalPage title="Termos de Uso" updated="setembro de 2026">
      <h2>1. O serviço</h2>
      <p>O Tiger Labs oferece ferramentas de análise de criptoativos com base em indicadores técnicos e dados públicos. O conteúdo tem caráter exclusivamente educacional e informativo.</p>
      <h2>2. Não é recomendação de investimento</h2>
      <p>Sinais, scores, faixas de pools e sugestões de trade são resultados de fórmulas aplicadas a dados históricos e não constituem recomendação, consultoria ou oferta de valores mobiliários. Decisões de investimento são de responsabilidade exclusiva do usuário.</p>
      <h2>3. Riscos</h2>
      <p>Criptoativos são voláteis e podem perder todo o valor. Protocolos DeFi envolvem riscos de contratos inteligentes, liquidação e perda impermanente. Desempenho passado não garante resultados futuros.</p>
      <h2>4. Disponibilidade dos dados</h2>
      <p>Os dados vêm de terceiros (Binance, CoinGecko, DeFiLlama e redes blockchain) e podem sofrer atrasos, falhas ou imprecisões.</p>
      <h2>5. Conta e conteúdo exclusivo</h2>
      <p>O acesso a conteúdo exclusivo é pessoal e intransferível. Podemos suspender contas em caso de uso abusivo.</p>
      <h2>6. Contato</h2>
      <p>Dúvidas sobre estes termos: use o e-mail indicado no rodapé.</p>
    </LegalPage>
  );
}
