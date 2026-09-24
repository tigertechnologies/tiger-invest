import Link from 'next/link';
import { Activity, BookOpen, Droplets, LineChart, Radar, Target, Wallet } from 'lucide-react';
import { LeadForm } from './lead-form';

export const metadata = { title: 'Entre no Tiger Labs' };

const FEATURES = [
  { icon: LineChart, t: 'Análise técnica automática', d: 'Mais de 15 indicadores, score de compra e venda e trade sugerido com stop e alvos por ATR.' },
  { icon: Radar, t: 'Scanners de mercado', d: 'Reversões, RSI e suporte/resistência em 130+ tokens, atualizados a cada 15 minutos.' },
  { icon: Target, t: 'Position trading', d: 'Score de ciclo 0-100 com histórico de 4 anos e ranking de oportunidades.' },
  { icon: Droplets, t: 'Estratégias DeFi', d: 'Pools sugeridas, estratégia 1% e explorador de pools com dados do DeFiLlama.' },
  { icon: Wallet, t: 'Rastreador on-chain', d: 'Saldos, Aave e posições Uniswap V3 em 6 redes, com taxas e perda impermanente.' },
  { icon: BookOpen, t: 'Tutoriais e relatórios', d: 'Aulas em vídeo, guia de indicadores e relatório semanal do mercado.' },
];

export default function Page() {
  return (
    <>
      <section className="hero mb-10 grid gap-8 md:grid-cols-[1.2fr_1fr] md:items-center">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-neon/40 bg-bg/40 px-3 py-1 text-xs font-semibold text-neon"><Activity className="h-3.5 w-3.5" /> Dados em tempo real</div>
          <h1 className="font-display text-4xl font-bold leading-tight md:text-5xl">Opere cripto com <span className="text-gradient">dados</span>, não com palpite.</h1>
          <p className="mt-4 max-w-xl text-fg/80">O Tiger Labs junta análise técnica, scanners, position trading e DeFi em um só painel. Deixe seu contato e receba o acesso.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/" className="btn-ghost">Ver a plataforma</Link>
            <Link href="/indicators" className="btn-ghost">Como funcionam os sinais</Link>
          </div>
        </div>
        <LeadForm />
      </section>
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ icon: I, t, d }) => (
          <div key={t} className="card p-6">
            <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-neon/15 text-neon shadow-neon-sm"><I className="h-5 w-5" /></div>
            <h2 className="font-display text-lg font-semibold">{t}</h2>
            <p className="mt-1 text-sm text-muted">{d}</p>
          </div>
        ))}
      </section>
      <p className="mt-8 text-center text-xs text-muted">Conteúdo educacional. Não é recomendação de investimento.</p>
    </>
  );
}
