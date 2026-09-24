import { Suspense } from 'react';
import { HistoryView } from './view';
export const metadata = { title: 'Histórico do Score de Position' };
export default function Page() {
  return (
    <Suspense>
      <HistoryView />
    </Suspense>
  );
}
