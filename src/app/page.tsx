import { Suspense } from 'react';
import { AnalysisView } from './analysis-view';
import { Spinner } from '@/components/ui';

export default function Home() {
  return (
    <Suspense fallback={<div className="grid h-96 place-items-center"><Spinner className="h-8 w-8" /></div>}>
      <AnalysisView />
    </Suspense>
  );
}
