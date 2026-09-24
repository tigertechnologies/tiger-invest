'use client';
import { useEffect, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Spinner } from '@/components/ui';

type Lead = { id: string; name: string; email: string; whatsapp: string | null; interest: string | null; created_at: string };

export default function Page() {
  const sb = supabaseBrowser();
  const [rows, setRows] = useState<Lead[] | null>(null);
  const load = () => sb?.from('leads').select('*').order('created_at', { ascending: false }).then(({ data }) => setRows((data as Lead[]) ?? []));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const csv = () => {
    const body = (rows ?? []).map((r) => [r.created_at, r.name, r.email, r.whatsapp ?? '', r.interest ?? ''].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([['data,nome,email,whatsapp,interesse', ...body].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tiger-labs-leads.csv';
    a.click();
  };
  const del = async (id: string) => {
    if (!confirm('Excluir este lead?')) return;
    await sb?.from('leads').delete().eq('id', id);
    load();
  };
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Leads</h1>
        <button className="btn-neon" onClick={csv} disabled={!rows?.length}><Download className="h-4 w-4" /> Exportar CSV</button>
      </div>
      {!rows ? <Spinner /> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Data</th><th>Nome</th><th>E-mail</th><th>WhatsApp</th><th>Interesse</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.created_at).toLocaleString('pt-BR')}</td><td>{r.name}</td><td><a className="text-neon" href={`mailto:${r.email}`}>{r.email}</a></td>
                  <td>{r.whatsapp ? <a className="text-neon" href={`https://wa.me/${r.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">{r.whatsapp}</a> : '—'}</td>
                  <td>{r.interest ?? '—'}</td>
                  <td><button className="text-down" onClick={() => del(r.id)} aria-label="Excluir"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="text-center text-muted">Nenhum lead ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
