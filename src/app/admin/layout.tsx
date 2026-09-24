import Link from 'next/link';
import { Droplets, FileText, GraduationCap, LayoutDashboard, MessageCircle, Settings, UserPlus, Users } from 'lucide-react';
import { getSessionUser } from '@/lib/supabase/server';
import { hasSupabase } from '@/lib/supabase/env';

export const dynamic = 'force-dynamic';

const LINKS = [
  { href: '/admin', label: 'Visão geral', icon: LayoutDashboard },
  { href: '/admin/pools', label: 'Pools sugeridas', icon: Droplets },
  { href: '/admin/reports', label: 'Relatórios', icon: FileText },
  { href: '/admin/tutorials', label: 'Tutoriais', icon: GraduationCap },
  { href: '/admin/settings', label: 'DeFi e rodapé', icon: Settings },
  { href: '/admin/chat', label: 'Chat de suporte', icon: MessageCircle },
  { href: '/admin/leads', label: 'Leads', icon: UserPlus },
  { href: '/admin/users', label: 'Usuários', icon: Users },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!hasSupabase()) return <div className="card p-8 text-center">Configure o Supabase (veja o README) para usar o painel admin.</div>;
  const { user, profile } = await getSessionUser();
  if (!user) return <div className="card p-8 text-center">Faça <Link href="/login?next=/admin" className="text-neon underline">login</Link> para acessar o painel.</div>;
  if (profile?.role !== 'admin')
    return (
      <div className="card mx-auto max-w-xl p-8 text-center text-sm">
        <h1 className="mb-2 font-display text-xl font-bold">Acesso restrito</h1>
        <p className="text-muted">Sua conta ({user.email}) não é administradora. No Supabase, rode no SQL Editor:</p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-bg-soft p-3 text-left text-xs">{`update public.profiles set role = 'admin', is_subscriber = true\nwhere email = '${user.email}';`}</pre>
      </div>
    );
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <aside className="card h-fit p-3 lg:sticky lg:top-24">
        <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-muted">Painel admin</div>
        {LINKS.map(({ href, label, icon: I }) => (
          <Link key={href} href={href} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-neon/10 hover:text-neon">
            <I className="h-4 w-4" /> {label}
          </Link>
        ))}
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
