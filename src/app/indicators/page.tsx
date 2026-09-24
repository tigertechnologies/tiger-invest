import Link from 'next/link';
import { AlertTriangle, BarChart3, Clock, Coins, Layers, TrendingUp } from 'lucide-react';
import { PATTERNS } from '@/lib/market/indicators';
import { SCAN_TOKENS } from '@/lib/site';
import { Breadcrumb, Hero } from '@/components/ui';
import { CATEGORY, SECTIONS, type Tone } from './content';

export const metadata = { title: 'Guia de Indicadores Técnicos' };

const toneText: Record<Tone, string> = { up: 'text-up', down: 'text-down', warn: 'text-warn', info: 'text-info', violet: 'text-violet', neon: 'text-neon' };
const toneBorder: Record<Tone, string> = { up: 'border-up/40', down: 'border-down/40', warn: 'border-warn/40', info: 'border-info/40', violet: 'border-violet/40', neon: 'border-neon/40' };
const dot: Record<Tone, string> = { up: 'bg-up', down: 'bg-down', warn: 'bg-warn', info: 'bg-info', violet: 'bg-violet', neon: 'bg-neon' };

export default function Page() {
  const patterns = Object.entries(PATTERNS);
  return (
    <>
      <Breadcrumb items={[{ label: 'Indicadores Técnicos' }]} />
      <Hero
        badge={<><BarChart3 className="h-3.5 w-3.5" /> Análise técnica</>}
        title="Domine os indicadores técnicos"
        subtitle="Como cada indicador do motor Tiger Labs funciona, como ler os sinais e quanto cada um pesa na pontuação."
        kpis={[
          { icon: <Layers className="h-5 w-5" />, value: SECTIONS.length, label: 'Seções no guia' },
          { icon: <Coins className="h-5 w-5" />, value: `${SCAN_TOKENS.length}+`, label: 'Tokens monitorados' },
          { icon: <Clock className="h-5 w-5" />, value: '24/7', label: 'Dados em tempo real' },
          { icon: <TrendingUp className="h-5 w-5" />, value: 6, label: 'Tempos gráficos' },
        ]}
      />
      <div className="mx-auto max-w-4xl">
        <section className="mb-10">
          <h2 className="mb-2 font-display text-2xl font-bold">Introdução</h2>
          <p className="text-fg/80">O motor analisa preço e volume da Binance com vários indicadores ao mesmo tempo. Cada um gera sinais de compra ou de venda com um peso; somados, eles formam a pontuação líquida, a recomendação e a sugestão de trade exibidas na página de análise.</p>
        </section>

        <section className="mb-10">
          <h2 className="mb-3 font-display text-2xl font-bold">📑 Navegação rápida</h2>
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="card-2 flex items-center gap-2 px-4 py-3 text-sm font-medium hover:border-neon/60 hover:text-neon">
                <span>{s.emoji}</span> {s.title.replace(/ \(.+\)$/, '')}
              </a>
            ))}
            <a href="#candles" className="card-2 flex items-center gap-2 px-4 py-3 text-sm font-medium hover:border-neon/60 hover:text-neon">🕯️ Padrões de candlestick</a>
          </div>
        </section>

        <section className="mb-12">
          <h2 className="mb-3 font-display text-2xl font-bold text-neon">📋 Resumo dos indicadores</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {(Object.keys(CATEGORY) as (keyof typeof CATEGORY)[]).map((k) => (
              <div key={k} className={`card border p-5 ${toneBorder[CATEGORY[k].tone]}`}>
                <h3 className={`mb-3 font-display text-lg font-semibold ${toneText[CATEGORY[k].tone]}`}>{CATEGORY[k].emoji} {CATEGORY[k].title}</h3>
                <ul className="space-y-1.5 text-sm">
                  {SECTIONS.filter((s) => s.category === k).map((s) => (
                    <li key={s.id}><a href={`#${s.id}`} className="font-semibold hover:text-neon">{s.title.replace(/ \(.+\)$/, '')}</a> <span className="text-muted">— {s.short}</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="tip mt-4"><b className="text-neon">Dica:</b> nenhum indicador acerta sempre. A força do motor está em cruzar vários sinais e filtrar os mercados laterais. Use gestão de risco em toda operação.</p>
        </section>

        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="mb-14 scroll-mt-24">
            <h2 className="mb-4 font-display text-2xl font-bold text-neon">{s.emoji} {s.title}</h2>
            <h3 className="mb-1 font-semibold">{s.what.q}</h3>
            <p className="mb-5 text-fg/75">{s.what.a}</p>
            {s.groups.map((g) => (
              <div key={g.title} className="mb-5">
                <h3 className="mb-2 font-semibold">{g.title}</h3>
                {g.intro && <p className="mb-2 text-fg/75">{g.intro}</p>}
                <ul className="space-y-2">
                  {g.items.map((it) => (
                    <li key={it.label} className="flex gap-3 text-fg/80">
                      <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${dot[it.tone]}`} />
                      <span><b className={toneText[it.tone]}>{it.label}:</b> {it.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="tip"><b className="text-neon">Dica de negociação:</b> {s.tip}</p>
          </section>
        ))}

        <section className="mb-14 rounded-2xl border-2 border-down/50 bg-down/5 p-6">
          <h2 className="mb-2 flex items-center gap-2 font-display text-xl font-bold text-down"><AlertTriangle className="h-5 w-5" /> Aviso importante</h2>
          <p className="text-sm text-fg/85">Esta ferramenta faz análise técnica com base em fórmulas matemáticas e dados históricos. <b className="text-down">Não é recomendação de investimento.</b></p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-fg/80">
            <li>Faça sua própria pesquisa antes de qualquer operação.</li>
            <li>Desempenho passado não garante resultados futuros.</li>
            <li>Criptoativos envolvem risco elevado de perda.</li>
            <li>Nunca invista mais do que pode perder.</li>
            <li>Se necessário, consulte um profissional certificado.</li>
          </ul>
        </section>

        <section id="candles" className="mb-12 scroll-mt-24">
          <h2 className="mb-2 font-display text-2xl font-bold">🕯️ Padrões de candlestick</h2>
          <p className="mb-5 text-fg/75">Formações de uma a três velas que sugerem reversão. O motor detecta os padrões abaixo na última vela e soma a pontuação ao scanner de reversão.</p>
          {[
            { title: 'Reversão de alta', filter: (s: number) => s > 0, cls: 'border-up/40 bg-up/5', t: 'text-up' },
            { title: 'Reversão de baixa', filter: (s: number) => s < 0, cls: 'border-down/40 bg-down/5', t: 'text-down' },
            { title: 'Neutro', filter: (s: number) => s === 0, cls: 'border-warn/40 bg-warn/5', t: 'text-warn' },
          ].map((grp) => (
            <div key={grp.title} className="mb-6">
              <h3 className="mb-2 font-semibold">{grp.title}</h3>
              <div className="space-y-2">
                {patterns.filter(([, p]) => grp.filter(p.score)).sort((a, b) => Math.abs(b[1].score) - Math.abs(a[1].score)).map(([k, p]) => (
                  <div key={k} className={`rounded-xl border p-4 ${grp.cls}`}>
                    <div className={`font-semibold ${grp.t}`}>{p.name}</div>
                    <div className="text-sm text-fg/80">{p.desc}</div>
                    <div className={`mt-1 text-xs ${grp.t}`}>Pontuação: {p.score > 0 ? '+' : ''}{p.score} {Math.abs(p.score) === 1 ? 'ponto' : 'pontos'}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="rounded-xl border border-info/40 bg-info/5 p-5">
            <h3 className="mb-2 font-semibold text-info">Como usar</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-fg/80">
              <li>Os padrões aparecem na análise quando surgem na vela mais recente.</li>
              <li>Cada padrão entra automaticamente no scanner de reversão.</li>
              <li>Combine com RSI, MACD e volume para sinais mais consistentes.</li>
              <li>Padrões perto de suporte ou resistência têm mais relevância.</li>
            </ul>
          </div>
        </section>
        <div className="text-center"><Link href="/" className="btn-neon">Voltar ao início</Link></div>
      </div>
    </>
  );
}
