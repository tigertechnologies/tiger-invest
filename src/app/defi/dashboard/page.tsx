import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Coins, Eye, HandCoins, Layers, PieChart, Shield, Target } from 'lucide-react';
import { DEFI_DEFAULT, type DefiDashboard } from '@/lib/defi/dashboard';
import { getSetting } from '@/lib/supabase/public';
import { fmtDate } from '@/lib/format';
import { Breadcrumb, Disclaimer, Donut, Hero, TokenIcon } from '@/components/ui';

export const metadata = { title: 'Dashboard DeFi' };
export const revalidate = 120;

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h2 className="mb-4 flex items-center gap-2 font-display font-semibold"><span className="text-neon">{icon}</span>{title}</h2>
      {children}
    </div>
  );
}

export default async function Page() {
  const d = { ...DEFI_DEFAULT, ...(await getSetting<Partial<DefiDashboard>>('defi_dashboard', {})) };
  return (
    <>
      <Breadcrumb items={[{ label: 'DeFi' }, { label: 'Dashboard' }]} />
      <Hero badge={<><Target className="h-3.5 w-3.5" /> Estratégia 1%</>} title="Dashboard DeFi" subtitle={`Alocação atual da estratégia de empréstimo com garantia + pools de liquidez. Atualizado em ${fmtDate(d.updated_at)}.`}>
        <div className="flex flex-wrap gap-2">
          <Link href="/pools#um-porcento" className="btn-neon">Ver pools da estratégia</Link>
          <Link href="/defi/wallet-tracker" className="btn-ghost">Acompanhar minha carteira</Link>
        </div>
      </Hero>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card icon={<PieChart className="h-5 w-5" />} title="Divisão entre plataformas">
          <Donut data={d.platforms} center={<span className="font-display text-sm font-bold">Lending</span>} />
        </Card>
        <Card icon={<Coins className="h-5 w-5" />} title="Alocação sugerida das garantias">
          <Donut data={d.collateral_allocation} center={<span className="font-display text-sm font-bold">Garantia</span>} />
        </Card>
        <Card icon={<Layers className="h-5 w-5" />} title="Pools por perfil de risco">
          <Donut half data={d.profiles} center={<span className="font-display text-xs font-bold text-muted">Perfil</span>} />
        </Card>
        <Card icon={<Shield className="h-5 w-5" />} title="Ativos de garantia">
          <div className="flex flex-wrap gap-2">{d.collateral_assets.map((a) => <span key={a} className="card-2 flex items-center gap-2 px-3 py-2 text-sm font-semibold"><TokenIcon symbol={a} size={20} />{a}</span>)}</div>
          <h3 className="mb-2 mt-5 flex items-center gap-2 text-sm font-semibold text-muted"><HandCoins className="h-4 w-4" /> Ativos para empréstimo</h3>
          <div className="flex flex-wrap gap-2">{d.borrow_assets.map((a) => <span key={a} className="card-2 flex items-center gap-2 px-3 py-2 text-sm font-semibold"><TokenIcon symbol={a} size={20} />{a}</span>)}</div>
        </Card>
        <Card icon={<Target className="h-5 w-5" />} title="Visão geral da estratégia">
          <p className="text-sm text-fg/80">{d.overview}</p>
          <h3 className="mb-2 mt-4 text-sm font-semibold text-muted">Benefícios</h3>
          <ul className="space-y-1.5 text-sm">{d.benefits.map((b) => <li key={b} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-up" />{b}</li>)}</ul>
        </Card>
        <div className="space-y-4">
          <div className="rounded-2xl border border-warn/50 bg-warn/5 p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display font-semibold text-warn"><AlertTriangle className="h-5 w-5" /> Importante</h2>
            <ul className="space-y-2 text-sm">{d.rules.map((r) => <li key={r} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />{r}</li>)}</ul>
          </div>
          <Card icon={<Eye className="h-5 w-5" />} title="Ativos monitorados">
            <div className="flex flex-wrap gap-2">{d.monitored.map((a) => <Link key={a} href={`/?symbol=${a.replace(/^cb/i, '')}`} className="chip-muted normal-case hover:text-neon"><TokenIcon symbol={a} size={14} /> {a}</Link>)}</div>
          </Card>
        </div>
      </div>
      <Disclaimer className="mt-6" />
    </>
  );
}
