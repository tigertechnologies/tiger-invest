import { Suspense } from 'react';
import { WalletView } from './view';
export const metadata = { title: 'Rastreador de Carteiras' };
export default function Page() {
  return (
    <Suspense>
      <WalletView />
    </Suspense>
  );
}
