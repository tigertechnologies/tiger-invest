import { Flame } from 'lucide-react';
import { Breadcrumb, Hero } from '@/components/ui';
import { PoolsExplorer } from '@/components/pools-explorer';

export const metadata = { title: 'Pools de Tokens' };

export default function Page() {
  return (
    <>
      <Breadcrumb items={[{ label: 'DeFi' }, { label: 'Pools de Tokens' }]} />
      <Hero badge={<><Flame className="h-3.5 w-3.5" /> APY alto, risco alto</>} title="Pools de Tokens" subtitle="Pools com pelo menos um token volátil. Use o filtro de market cap para evitar tokens muito pequenos e o botão Hot Pools para ver as de maior giro." />
      <PoolsExplorer kind="token" />
    </>
  );
}
