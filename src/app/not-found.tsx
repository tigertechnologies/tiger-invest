import Link from 'next/link';
import { LogoMark } from '@/components/logo';
export default function NotFound() {
  return (
    <div className="card mx-auto flex max-w-lg flex-col items-center p-10 text-center">
      <LogoMark size={56} />
      <h1 className="mt-4 font-display text-3xl font-bold">Página não encontrada</h1>
      <p className="mt-2 text-sm text-muted">O endereço pode ter mudado.</p>
      <Link href="/" className="btn-neon mt-6">Voltar ao início</Link>
    </div>
  );
}
