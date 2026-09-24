import Link from 'next/link';
import { Crown, Lock, LogIn } from 'lucide-react';
import { getAccess, PLAN_LABEL } from '@/lib/access';

/**
 * Bloqueia o conteúdo quando ENFORCE_PLANS=true e o plano do usuário é menor que `min`.
 * min: 1 = START · 2 = PRO · 3 = ALPHA
 */
export async function PlanGate({ min, feature, children }: { min: number; feature: string; children: React.ReactNode }) {
  const a = await getAccess();
  if (a.rank >= min) return <>{children}</>;
  const need = PLAN_LABEL[min] ?? 'PRO';
  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="card relative overflow-hidden p-8 text-center">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-neon/20 blur-3xl" />
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-neon/40 bg-neon/10 text-neon shadow-neon-sm">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="font-display text-2xl font-bold">{feature}</h1>
        <p className="mt-2 text-sm text-muted">
          Disponível a partir do plano <b className="text-neon">TIGER {need}</b>. Libere agora com PIX e acesse na hora.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Link href="/planos" className="btn-neon">
            <Crown className="h-4 w-4" /> Ver planos
          </Link>
          {!a.user && (
            <Link href="/login" className="btn-ghost">
              <LogIn className="h-4 w-4" /> Já sou assinante
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
