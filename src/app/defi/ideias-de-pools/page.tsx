import { PlanGate } from '@/components/plan-gate';
import { PoolIdeasView } from './view';

export const metadata = { title: 'Ideias de Pools' };
export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <PlanGate min={1} feature="Ideias de Pools">
      <PoolIdeasView />
    </PlanGate>
  );
}
