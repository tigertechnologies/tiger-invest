import Link from 'next/link';
import { Droplets, ExternalLink, Percent, ShieldCheck, Sparkles } from 'lucide-react';
import { getSuggestedPools } from '@/lib/pools';
import { fmtDate, fmtNum, fmtPrice } from '@/lib/format';
import { Breadcrumb, Disclaimer, Empty, Hero, TokenIcon } from '@/components/ui';
import { RangeBar } from '@/components/range-bar';

export const metadata = { title: 'Sugestões de Pools' };
export const revalidate = 60;

const riskChip = { Baixo: 'chip-up', Moderado: 'chip-warn', Alto: 'chip-down' } as const;

const LINKS = [
  { name: 'Poolfish', desc: 'Simule o retorno de pools de liquidez concentrada antes de entrar.', url: 'https://www.poolfish.xyz/' },
  { name: 'Matcha', desc: 'Agregador de DEXs para trocar tokens com o melhor preço.', url: 'https://matcha.xyz/' },
  { name: 'Uniswap', desc: 'Crie e gerencie suas posições de liquidez V3/V4.', url: 'https://app.uniswap.org/positions' },
];

export default async function Page() {
  const { pools, updatedAt, configured } = await getSuggestedPools();
  const suggested = pools.filter((p) => p.strategy === 'suggested');
  const one = pools.filter((p) => p.strategy === 'one_percent');
  return (
    <>
      <Breadcrumb items={[{ label: 'Sugestões de Pools' }]} />
      <Hero badge={<><Sparkles className="h-3.5 w-3.5" /> Estratégias em destaque</>} title="Sugestões de Pools" subtitle={`Pools e faixas selecionadas pela equipe Tiger Labs. Preço e status da faixa atualizados ao vivo.${updatedAt ? ` Última revisão: ${fmtDate(updatedAt)}.` : ''}`}>
        <div className="flex flex-wrap gap-2">
          <a href="#sugeridas" className="btn-neon"><Droplets className="h-4 w-4" /> Pools sugeridas</a>
          <a href="#um-porcento" className="btn-ghost"><Percent className="h-4 w-4" /> Estratégia 1%</a>
        </div>
      </Hero>

      {!configured && <Empty>Conecte o Supabase para cadastrar pools pelo painel admin.</Empty>}

      <section id="sugeridas" className="mb-8 scroll-mt-24">
        <h2 className="mb-3 font-display text-xl font-semibold">Pools sugeridas</h2>
        {suggested.length === 0 ? <Empty>Nenhuma pool cadastrada.</Empty> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Par</th><th>Faixa</th><th>Preço atual</th><th>Fee</th><th>% carteira</th><th>Rede</th><th>Status</th><th>Risco</th><th /></tr></thead>
              <tbody>
                {suggested.map((p) => (
                  <tr key={p.id}>
                    <td><div className="flex items-center gap-2"><div className="flex -space-x-2"><TokenIcon symbol={p.token0} size={24} /><TokenIcon symbol={p.token1} size={24} /></div><b>{p.token0}/{p.token1}</b></div></td>
                    <td><div className="flex items-center gap-1 font-mono text-xs">{fmtPrice(p.range_min, '')}<RangeBar position={p.position} status={p.status} />{fmtPrice(p.range_max, '')}</div></td>
                    <td className="font-mono">{fmtPrice(p.price, '')}</td>
                    <td>{fmtNum(p.fee, 2)}%</td>
                    <td>{p.wallet_pct != null ? `${fmtNum(p.wallet_pct)}%` : '—'}</td>
                    <td><span className="chip-info">{p.network}</span></td>
                    <td>{p.status === 'dentro' ? <span className="chip-up"><ShieldCheck className="h-3 w-3" /> Ativo</span> : p.status ? <span className="chip-down">Ajustar faixa ({p.status})</span> : '—'}</td>
                    <td><span className={riskChip[p.risk]}>{p.risk}</span></td>
                    <td>{p.simulate_url && <a href={p.simulate_url} target="_blank" rel="noreferrer" className="btn-ghost px-3 py-1 text-xs">Simular <ExternalLink className="h-3 w-3" /></a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="um-porcento" className="mb-8 scroll-mt-24">
        <h2 className="mb-1 font-display text-xl font-semibold">Estratégia de range 1%</h2>
        <p className="mb-3 text-sm text-muted">Faixas curtas para capturar mais taxas, exigindo acompanhamento diário. Veja a estratégia completa no <Link href="/defi/dashboard" className="text-neon underline">Dashboard DeFi</Link>.</p>
        {one.length === 0 ? <Empty>Nenhuma pool cadastrada.</Empty> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Pool</th><th>Faixa</th><th>Preço atual</th><th>Fee</th><th>Rede</th><th>Status</th></tr></thead>
              <tbody>
                {one.map((p) => (
                  <tr key={p.id}>
                    <td><b>{p.token0}/{p.token1}</b></td>
                    <td><div className="flex items-center gap-1 font-mono text-xs">{fmtPrice(p.range_min, '')}<RangeBar position={p.position} status={p.status} />{fmtPrice(p.range_max, '')}</div></td>
                    <td className="font-mono">{fmtPrice(p.price, '')}</td>
                    <td>{fmtNum(p.fee, 2)}%</td>
                    <td><span className="chip-info">{p.network}</span></td>
                    <td>{p.status === 'dentro' ? <span className="chip-up">Dentro</span> : p.status ? <span className="chip-down">Fora ({p.status})</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl font-semibold">Links importantes</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {LINKS.map((l) => (
            <a key={l.name} href={l.url} target="_blank" rel="noreferrer" className="card group p-5 transition hover:border-neon/60">
              <div className="flex items-center justify-between"><b className="font-display text-lg">{l.name}</b><ExternalLink className="h-4 w-4 text-muted group-hover:text-neon" /></div>
              <p className="mt-2 text-sm text-muted">{l.desc}</p>
            </a>
          ))}
        </div>
      </section>
      <Disclaimer className="mt-6" />
    </>
  );
}
