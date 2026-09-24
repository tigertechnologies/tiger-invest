'use client';
import Link from 'next/link';
import { BarChart3, BookOpen, GraduationCap, Info, Instagram, LineChart, Mail, MessageCircle, MessagesSquare, Rocket, Send, Target, TrendingDown, TrendingUp, Users, Wrench, Youtube, Droplets, FileText, ArrowUpDown, Activity, Wallet, Sparkles, Crown } from 'lucide-react';
import type { FooterSettings } from '@/lib/supabase/public';
import { Logo } from './logo';
import { useApp } from './providers';

export function Footer({ s }: { s: FooterSettings }) {
  const { t } = useApp();
  const col = 'mb-3 flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wider text-neon';
  const link = 'flex items-center gap-2 py-1 text-sm text-fg/80 hover:text-neon';
  const socials = [
    { href: s.instagram, icon: Instagram, label: 'Instagram' },
    { href: s.youtube, icon: Youtube, label: 'YouTube' },
    { href: s.telegram, icon: Send, label: 'Telegram' },
    { href: s.whatsapp, icon: MessageCircle, label: 'WhatsApp' },
  ].filter((x) => x.href);
  return (
    <footer className="relative mt-20 overflow-hidden border-t border-neon/40 bg-gradient-to-b from-neon/[0.08] via-bg-soft to-bg">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-[70%] -translate-x-1/2 rounded-full bg-neon/20 blur-3xl" />
      <div className="container relative grid gap-10 py-12 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-4 text-sm text-fg/75">Ferramentas avançadas de análise e trading de criptomoedas, movidas por indicadores técnicos e dados on-chain.</p>
          <Link href="/join" className="btn-neon mt-5 w-full">
            <Rocket className="h-4 w-4" /> {t('Quero entrar no Labs agora')}
          </Link>
        </div>
        <div>
          <div className={col}><BarChart3 className="h-4 w-4" /> {t('Ferramentas de análise')}</div>
          <Link className={link} href="/"><LineChart className="h-4 w-4" /> {t('Análise Técnica')}</Link>
          <Link className={link} href="/reversals"><TrendingDown className="h-4 w-4" /> {t('Sinais de Reversão')}</Link>
          <Link className={link} href="/rsi"><BarChart3 className="h-4 w-4" /> {t('Scanner RSI')}</Link>
          <Link className={link} href="/support-resistance"><ArrowUpDown className="h-4 w-4" /> {t('Suporte e Resistência')}</Link>
          <Link className={link} href="/position-trading"><Target className="h-4 w-4" /> {t('Position Trading')}</Link>
          <Link className={link} href="/mercado/pulso"><Activity className="h-4 w-4" /> {t('Pulso do Mercado')}</Link>
          <Link className={link} href="/mercado/tiger-100"><BarChart3 className="h-4 w-4" /> {t('Índice Tiger 100')}</Link>
        </div>
        <div>
          <div className={col}><Wrench className="h-4 w-4" /> {t('Trading e recursos')}</div>
          <Link className={link} href="/invest"><Wallet className="h-4 w-4" /> {t('Minha Carteira')}</Link>
          <Link className={link} href="/pools"><Droplets className="h-4 w-4" /> {t('Sugestões de Pools')}</Link>
          <Link className={link} href="/defi/ideias-de-pools"><Sparkles className="h-4 w-4" /> {t('Ideias de Pools')}</Link>
          <Link className={link} href="/planos"><Crown className="h-4 w-4" /> {t('Planos')}</Link>
          <Link className={link} href="/weekly-reports"><FileText className="h-4 w-4" /> {t('Relatórios Semanais')}</Link>
          <Link className={link} href="/tutorials"><GraduationCap className="h-4 w-4" /> {t('Tutoriais')}</Link>
          <Link className={link} href="/indicators"><BookOpen className="h-4 w-4" /> {t('Guia de Indicadores')}</Link>
          {s.course_url && <a className={link} href={s.course_url} target="_blank" rel="noreferrer"><GraduationCap className="h-4 w-4" /> {t('Curso')}</a>}
          {s.mentorship_url && <a className={link} href={s.mentorship_url} target="_blank" rel="noreferrer"><Users className="h-4 w-4" /> {t('Mentoria')}</a>}
        </div>
        <div>
          <div className={col}><MessagesSquare className="h-4 w-4" /> {t('Contato e suporte')}</div>
          <a className={link} href={`mailto:${s.email}`}><Mail className="h-4 w-4" /> {t('Fale conosco')}</a>
          <Link className={link} href="/about"><Info className="h-4 w-4" /> {t('Sobre nós')}</Link>
          {socials.length > 0 && (
            <>
              <div className="mb-2 mt-4 text-xs text-muted">{t('Siga-nos')}</div>
              <div className="flex gap-2">
                {socials.map(({ href, icon: I, label }) => (
                  <a key={label} href={href} target="_blank" rel="noreferrer" aria-label={label} className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-card-2 text-fg/80 hover:border-neon hover:text-neon">
                    <I className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="container relative flex flex-col gap-3 border-t border-line/70 py-6 text-xs text-muted md:flex-row md:items-center md:justify-between">
        <div>
          <div>© {new Date().getFullYear()} {s.company}. {t('Todos os direitos reservados.')}</div>
          {(s.legal_name || s.cnpj) && <div className="mt-1 opacity-80">{[s.legal_name, s.cnpj && `CNPJ: ${s.cnpj}`].filter(Boolean).join(' · ')}</div>}
          <div className="mt-1 opacity-80">Dados de mercado: Binance, CoinGecko e DeFiLlama. Conteúdo educacional, não é recomendação de investimento.</div>
        </div>
        <div className="flex gap-4">
          <Link href="/privacy" className="hover:text-neon">{t('Privacidade')}</Link>
          <Link href="/termos" className="hover:text-neon">{t('Termos')}</Link>
        </div>
      </div>
    </footer>
  );
}
