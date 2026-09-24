'use client';
import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Markdown } from '@/components/markdown';
import { Spinner, cx } from '@/components/ui';

export type Field = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea' | 'markdown' | 'bool' | 'date' | 'url';
  options?: string[];
  required?: boolean;
  list?: boolean; // aparece na tabela
  help?: string;
  defaultValue?: unknown;
};

type Row = Record<string, unknown> & { id: string };

export function Crud({ table, fields, order, title, onBeforeSave }: { table: string; fields: Field[]; order: { col: string; asc: boolean }; title: string; onBeforeSave?: (r: Record<string, unknown>) => Record<string, unknown> }) {
  const sb = supabaseBrowser();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [edit, setEdit] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sb) return;
    const { data, error } = await sb.from(table).select('*').order(order.col, { ascending: order.asc });
    if (error) setErr(error.message);
    setRows((data as Row[]) ?? []);
  }, [sb, table, order.col, order.asc]);
  useEffect(() => {
    load();
  }, [load]);

  const blank = () => Object.fromEntries(fields.map((f) => [f.key, f.defaultValue ?? (f.type === 'bool' ? false : f.type === 'number' ? null : '')]));

  const save = async () => {
    if (!sb || !edit) return;
    setBusy(true);
    setErr(null);
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      let v = edit[f.key];
      if (f.type === 'number') v = v === '' || v == null ? null : Number(v);
      if ((f.type === 'text' || f.type === 'url' || f.type === 'date') && v === '') v = null;
      if (f.required && (v == null || v === '')) {
        setErr(`Preencha: ${f.label}`);
        setBusy(false);
        return;
      }
      payload[f.key] = v;
    }
    const data = onBeforeSave ? onBeforeSave(payload) : payload;
    const res = edit.id ? await sb.from(table).update(data).eq('id', edit.id) : await sb.from(table).insert(data);
    setBusy(false);
    if (res.error) return setErr(res.error.message);
    setEdit(null);
    load();
  };

  const remove = async (r: Row) => {
    if (!sb || !confirm('Excluir este item? Esta ação não pode ser desfeita.')) return;
    const { error } = await sb.from(table).delete().eq('id', r.id);
    if (error) setErr(error.message);
    load();
  };

  const listFields = fields.filter((f) => f.list);
  const show = (f: Field, v: unknown) => (f.type === 'bool' ? (v ? 'Sim' : 'Não') : v == null || v === '' ? '—' : String(v).slice(0, 60));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        <button className="btn-neon" onClick={() => setEdit(blank())}><Plus className="h-4 w-4" /> Novo</button>
      </div>
      {err && <p className="mb-3 rounded-xl border border-down/40 bg-down/10 px-3 py-2 text-sm text-down">{err}</p>}
      {rows == null ? (
        <Spinner />
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>{listFields.map((f) => <th key={f.key}>{f.label}</th>)}<th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {listFields.map((f) => <td key={f.key}>{show(f, r[f.key])}</td>)}
                  <td className="text-right">
                    <button className="btn-ghost mr-2 px-2 py-1" onClick={() => setEdit({ ...r })} aria-label="Editar"><Pencil className="h-4 w-4" /></button>
                    <button className="btn-ghost px-2 py-1 text-down" onClick={() => remove(r)} aria-label="Excluir"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={listFields.length + 1} className="text-center text-muted">Nenhum item.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {edit && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-line bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">{edit.id ? 'Editar' : 'Novo item'}</h2>
              <button onClick={() => setEdit(null)} className="rounded-full border border-neon/40 p-1.5 text-neon" aria-label="Fechar"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {fields.map((f) => (
                <label key={f.key} className={cx('block', (f.type === 'textarea' || f.type === 'markdown') && 'md:col-span-2')}>
                  <span className="mb-1 block text-xs font-semibold text-muted">{f.label}{f.required && ' *'}</span>
                  <FieldInput f={f} value={edit[f.key]} onChange={(v) => setEdit({ ...edit, [f.key]: v })} />
                  {f.help && <span className="mt-1 block text-xs text-muted">{f.help}</span>}
                </label>
              ))}
            </div>
            {err && <p className="mt-3 text-sm text-down">{err}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setEdit(null)}>Cancelar</button>
              <button className="btn-neon" onClick={save} disabled={busy}>{busy ? <Spinner className="text-on-neon" /> : <Save className="h-4 w-4" />} Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldInput({ f, value, onChange }: { f: Field; value: unknown; onChange: (v: unknown) => void }) {
  const [preview, setPreview] = useState(false);
  const v = value == null ? '' : String(value);
  switch (f.type) {
    case 'bool':
      return (
        <button type="button" onClick={() => onChange(!value)} className={cx('btn w-full', value ? 'bg-neon text-on-neon' : 'border border-line text-muted')}>
          {value ? 'Sim' : 'Não'}
        </button>
      );
    case 'select':
      return <select className="input" value={v} onChange={(e) => onChange(e.target.value)}>{f.options!.map((o) => <option key={o}>{o}</option>)}</select>;
    case 'textarea':
      return <textarea className="input min-h-[100px]" value={v} onChange={(e) => onChange(e.target.value)} />;
    case 'markdown':
      return (
        <div>
          <div className="mb-2 flex gap-2 text-xs">
            <button type="button" className={cx('rounded px-2 py-1', !preview && 'bg-neon/15 text-neon')} onClick={() => setPreview(false)}>Escrever</button>
            <button type="button" className={cx('rounded px-2 py-1', preview && 'bg-neon/15 text-neon')} onClick={() => setPreview(true)}>Pré-visualizar</button>
          </div>
          {preview ? <div className="card-2 min-h-[300px] p-4"><Markdown>{v}</Markdown></div> : <textarea className="input min-h-[300px] font-mono" value={v} onChange={(e) => onChange(e.target.value)} placeholder={'# Título\n\nTexto em **Markdown**...'} />}
        </div>
      );
    default:
      return <input className="input" type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'url' ? 'url' : 'text'} step="any" value={v} onChange={(e) => onChange(e.target.value)} />;
  }
}
