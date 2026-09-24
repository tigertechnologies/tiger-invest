import Link from 'next/link';
import { LegalPage } from '@/components/legal';
export const metadata = { title: 'Sobre nós' };
export default function Page() {
  return (
    <LegalPage title="Sobre o Tiger Labs" updated="setembro de 2026">
      <p>O Tiger Labs é um laboratório de ferramentas para quem opera criptoativos: análise técnica automatizada, scanners de mercado, score de position trading e estratégias DeFi, tudo com dados públicos em tempo real.</p>
      <h2>Como trabalhamos</h2>
      <ul>
        <li>Preços e volumes da Binance; market cap da CoinGecko; rendimento de pools do DeFiLlama; carteiras lidas direto da blockchain.</li>
        <li>Todas as regras de pontuação estão abertas no <Link href="/indicators" className="text-neon underline">Guia de Indicadores</Link>.</li>
        <li>Conteúdo educacional: nada aqui é recomendação individual de investimento.</li>
      </ul>
      <p>Dúvidas? Use o chat no canto da tela ou o e-mail no rodapé.</p>
    </LegalPage>
  );
}
