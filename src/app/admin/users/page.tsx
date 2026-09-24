'use client';
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Spinner, cx } from '@/components/ui';

type P = { id: string; email: string; full_name: string | null; role: string; is_subscriber: boolean; created_at: string };

export default function Page() {
  const sb = supabaseBrowser();
  const [rows, setRows] = useState<P[] | null>(null);
  const [q, setQ] = useState('');
  const load = () => sb?.from('profiles').select('id, email, full_name, role, is_subscriber, created_at').order('created_at', { ascending: false }).then(({ data }) => setRows((data as P[]) ?? []));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const update = async (id: string, patch: Partial<P>) => {
    await sb?.from('profiles').update(patch).eq('id', id);
    load();
  };
  const shown = (rows ?? []).filter((r) => `${r.email} ${r.full_name}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <h1 className="mb-4 font-display text-2xl font-bold">Usuários</h1>
      <div className="relative mb-4 max-w-sm"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted" /><input className="input pl-9" placeholder="Buscar por nome ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {!rows ? <Spinner /> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Nome</th><th>E-mail</th><th>Cadastro</th><th>Assinante</th><th>Admin</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>{r.full_name ?? '—'}</td><td>{r.email}</td><td>{new Date(r.created_at).toLocaleDateString('pt-BR')}</td>
                  <td><button onClick={() => update(r.id, { is_subscriber: !r.is_subscriber })} className={cx('chip', r.is_subscriber ? 'border-up/50 text-up' : 'border-line text-muted')}>{r.is_subscriber ? 'Sim' : 'Não'}</button></td>
                  <td><button onClick={() => confirm(`${r.role === 'admin' ? 'Remover' : 'Dar'} acesso admin para ${r.email}?`) && update(r.id, { role: r.role === 'admin' ? 'user' : 'admin' })} className={cx('chip', r.role === 'admin' ? 'border-neon/50 text-neon' : 'border-line text-muted')}>{r.role === 'admin' ? 'Sim' : 'Não'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">Assinantes veem os tutoriais marcados como exclusivos. Integre seu checkout (Hotmart, Kiwify, Stripe…) atualizando o campo is_subscriber via webhook.</p>
    </>
  );
}
