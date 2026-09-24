import { Coins } from 'lucide-react';
import { Breadcrumb, Hero } from '@/components/ui';
import { PoolsExplorer } from '@/components/pools-explorer';

export const metadata = { title: 'Pools de Stablecoins' };

export default function Page() {
  return (
    <>
      <Breadcrumb items={[{ label: 'DeFi' }, { label: 'Pools de Stablecoins' }]} />
      <Hero badge={<><Coins className="h-3.5 w-3.5" /> Rendimento em dólar</>} title="Pools de Stablecoins" subtitle="Pools compostas só por stablecoins em todos os protocolos e redes, com TVL e APY atualizados." />
      <PoolsExplorer kind="stable" />
    </>
  );
}
