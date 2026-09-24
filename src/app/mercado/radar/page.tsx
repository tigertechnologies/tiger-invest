import { PlanGate } from '@/components/plan-gate';
import { RadarView } from './view';

export const metadata = { title: 'Radar de Mercado' };
export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <PlanGate min={2} feature="Radar de Mercado">
      <RadarView />
    </PlanGate>
  );
}
