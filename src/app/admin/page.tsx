import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';

export default async function Page() {
  const sb = supabaseServer()!;
  const count = async (t: string, f?: [string, unknown]) => {
    let q = sb.from(t).select('*', { count: 'exact', head: true });
    if (f) q = q.eq(f[0], f[1]);
    return (await q).count ?? 0;
  };
  const [users, subs, leads, open, pools, reports] = await Promise.all([
    count('profiles'),
    count('profiles', ['is_subscriber', true]),
    count('leads'),
    count('chat_conversations', ['status', 'open']),
    count('suggested_pools', ['active', true]),
    count('weekly_reports', ['published', true]),
  ]);
  const { data: cache } = await sb.from('scanner_cache').select('key, updated_at').order('updated_at', { ascending: false }).limit(8);
  const cards = [
    ['Usuários', users, '/admin/users'],
    ['Assinantes', subs, '/admin/users'],
    ['Leads', leads, '/admin/leads'],
    ['Chats abertos', open, '/admin/chat'],
    ['Pools ativas', pools, '/admin/pools'],
    ['Relatórios publicados', reports, '/admin/reports'],
  ] as const;
  return (
    <>
      <h1 className="mb-4 font-display text-2xl font-bold">Visão geral</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map(([l, v, h]) => (
          <Link key={l} href={h} className="card p-5 hover:border-neon/60"><div className="text-xs text-muted">{l}</div><div className="font-display text-3xl font-bold">{v}</div></Link>
        ))}
      </div>
      <h2 className="mb-2 mt-8 font-display text-lg font-semibold">Cache dos scanners</h2>
      <div className="table-wrap">
        <table className="tbl"><thead><tr><th>Chave</th><th>Atualizado</th></tr></thead>
          <tbody>{(cache ?? []).map((c) => <tr key={c.key}><td className="font-mono">{c.key}</td><td>{new Date(c.updated_at).toLocaleString('pt-BR')}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">Os scanners são recalculados quando o cache expira (15 min para mercado, 60 min para position) ou pelo agendamento em /api/cron/refresh.</p>
    </>
  );
}
