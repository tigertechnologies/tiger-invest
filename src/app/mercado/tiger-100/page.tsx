import { PlanGate } from '@/components/plan-gate';
import { Tiger100View } from './view';

export const metadata = { title: 'Índice Tiger 100' };
export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <PlanGate min={1} feature="Índice Tiger 100">
      <Tiger100View />
    </PlanGate>
  );
}
