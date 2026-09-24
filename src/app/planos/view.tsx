'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Check, Crown, Gift, QrCode, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import type { Plan } from '@/lib/invest/plans';
import { Breadcrumb, Hero, Pills, cx } from '@/components/ui';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const ICON: Record<string, React.ReactNode> = { start: <Zap className="h-5 w-5" />, pro: <Sparkles className="h-5 w-5" />, alpha: <Crown className="h-5 w-5" /> };

const MATRIX: { label: string; plans: [boolean, boolean, boolean] }[] = [
  { label: 'Análise técnica, scanners e Position Trading', plans: [true, true, true] },
  { label: 'Minha Carteira (cripto, ações, caixa e pools)', plans: [true, true, true] },
  { label: 'Relatórios semanais e tutoriais exclusivos', plans: [true, true, true] },
  { label: 'Índice Tiger 100 + comparador', plans: [true, true, true] },
  { label: 'Ideias de Pools (Nota de Yield) e watchlist', plans: [true, true, true] },
  { label: 'Pulso do Mercado, Radar e BTC Lab', plans: [false, true, true] },
  { label: 'Perps (Ondo) com TP/SL e auto-fechamento', plans: [false, true, true] },
  { label: 'Fluxo de caixa completo (P/L por período)', plans: [false, false, true] },
  { label: 'Controle avançado de pools com tração ao vivo', plans: [false, false, true] },
];

export function PlanosView({ plans, current, periodEnd, logged }: { plans: Plan[]; current: string | null; periodEnd: string | null; logged: boolean }) {
  const [cycle, setCycle] = useState<'mensal' | 'anual'>('mensal');
  return (
    <>
      <Breadcrumb items={[{ label: 'Planos' }]} />
      <Hero
        badge={<><Crown className="h-3.5 w-3.5" /> Tiger Labs</>}
        title="Escolha seu plano"
        subtitle="Análise, carteira e DeFi em um só lugar. Pagamento por PIX com liberação automática. Sem fidelidade: cancele quando quiser."
      >
        {current && (
          <div className="inline-flex items-center gap-2 rounded-xl border border-neon/40 bg-neon/10 px-3 py-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-neon" /> Seu plano: <b className="text-neon">TIGER {current.toUpperCase()}</b>
            {periodEnd && <span className="text-muted">até {new Date(periodEnd).toLocaleDateString('pt-BR')}</span>}
          </div>
        )}
      </Hero>

      <div className="mb-6 flex justify-center">
        <Pills
          value={cycle}
          onChange={setCycle}
          options={[
            { value: 'mensal', label: 'Mensal' },
            { value: 'anual', label: 'Anual (12 meses)' },
          ]}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((p) => {
          const price = cycle === 'anual' ? p.price * 12 : p.price;
          const isCur = current === p.id;
          return (
            <div key={p.id} className={cx('card relative flex flex-col p-6', p.popular && 'border-neon/60 shadow-neon')}>
              {p.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-neon to-lime px-3 py-1 text-xs font-bold text-on-neon">MAIS ESCOLHIDO</div>}
              <div className="mb-3 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-neon/15 text-neon">{ICON[p.id] ?? <Zap className="h-5 w-5" />}</div>
                <div>
                  <div className="font-display text-lg font-bold">{p.name}</div>
                  <div className="text-xs text-muted">{p.tag}</div>
                </div>
              </div>
              <div className="mb-4">
                <span className="font-display text-4xl font-bold">{brl(price)}</span>
                <span className="text-sm text-muted">/{cycle === 'anual' ? 'ano' : 'mês'}</span>
                {cycle === 'anual' && <div className="text-xs text-muted">equivale a {brl(p.price)}/mês</div>}
              </div>
              <ul className="mb-6 flex-1 space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-neon" />
                    <span className={f.endsWith(':') ? 'font-semibold' : 'text-fg/85'}>{f}</span>
                  </li>
                ))}
              </ul>
              <Link href={`/assinar?plano=${p.id}&ciclo=${cycle}`} className={cx('w-full justify-center', p.popular ? 'btn-neon' : 'btn-ghost')}>
                <QrCode className="h-4 w-4" /> {isCur ? 'Renovar com PIX' : `Assinar ${p.name.replace('TIGER ', '')}`}
              </Link>
            </div>
          );
        })}
      </div>

      <div className="card mt-8 overflow-hidden">
        <div className="table-wrap border-0">
          <table className="tbl">
            <thead>
              <tr>
                <th>O que cada plano libera</th>
                <th className="text-center">START</th>
                <th className="text-center">PRO</th>
                <th className="text-center">ALPHA</th>
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  {r.plans.map((ok, i) => (
                    <td key={i} className="text-center">
                      {ok ? <Check className="mx-auto h-4 w-4 text-neon" /> : <span className="text-muted">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <Info icon={<QrCode className="h-5 w-5" />} title="PIX com liberação na hora">
          O QR Code é gerado pelo Mercado Pago. Assim que o pagamento cai, seu plano é ativado automaticamente.
        </Info>
        <Info icon={<Gift className="h-5 w-5" />} title="Indique e ganhe créditos">
          Cada amigo que assina pelo seu link gera de 3% a 10% de comissão em créditos, que pagam sua própria assinatura.{' '}
          {logged ? (
            <Link href="/indicacoes" className="text-neon hover:underline">
              Pegar meu link
            </Link>
          ) : null}
        </Info>
        <Info icon={<ShieldCheck className="h-5 w-5" />} title="Sem fidelidade">
          Renovação manual: nada é cobrado sem você pagar. Ao renovar antes do vencimento, os dias restantes são somados.
        </Info>
      </div>
      <p className="mt-6 text-center text-xs text-muted">
        Ao assinar você concorda com os <Link href="/termos" className="underline">Termos de Uso e Política de Privacidade</Link>. Conteúdo educacional, não é recomendação de investimento.
      </p>
    </>
  );
}

function Info({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center gap-2 font-display font-semibold">
        <span className="text-neon">{icon}</span> {title}
      </div>
      <p className="text-sm text-muted">{children}</p>
    </div>
  );
}
