import { Suspense } from 'react';
import { PoolsTrackerView } from './view';
export const metadata = { title: 'Análise de Pools' };
export default function Page() {
  return (
    <Suspense>
      <PoolsTrackerView />
    </Suspense>
  );
}
