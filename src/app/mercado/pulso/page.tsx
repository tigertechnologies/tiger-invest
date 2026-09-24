import { PlanGate } from '@/components/plan-gate';
import { PulsoView } from './view';

export const metadata = { title: 'Pulso do Mercado' };
export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <PlanGate min={2} feature="Pulso do Mercado">
      <PulsoView />
    </PlanGate>
  );
}
