import { PlanGate } from '@/components/plan-gate';
import { BtcLabView } from './view';

export const metadata = { title: 'BTC Lab' };
export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <PlanGate min={2} feature="BTC Lab">
      <BtcLabView />
    </PlanGate>
  );
}
