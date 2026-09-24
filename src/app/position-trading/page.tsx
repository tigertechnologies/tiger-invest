import { Suspense } from 'react';
import { PositionView } from './view';
export const metadata = { title: 'Position Trading' };
export default function Page() {
  return (
    <Suspense>
      <PositionView />
    </Suspense>
  );
}
