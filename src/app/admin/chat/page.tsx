'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, RotateCcw, Send } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useApp } from '@/components/providers';
import { Pills, cx } from '@/components/ui';

type Conv = { id: string; user_email: string | null; status: 'open' | 'closed'; last_message_at: string; unread_admin: number };
type Msg = { id: string; sender: 'user' | 'admin'; body: string; created_at: string };

export default function Page() {
  const sb = supabaseBrowser();
  const { user } = useApp();
  const [convs, setConvs] = useState<Conv[]>([]);
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [sel, setSel] = useState<Conv | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);

  const loadConvs = useCallback(async () => {
    if (!sb) return;
    const { data } = await sb.from('chat_conversations').select('*').eq('status', status).order('last_message_at', { ascending: false }).limit(100);
    setConvs((data as Conv[]) ?? []);
  }, [sb, status]);

  useEffect(() => {
    loadConvs();
    if (!sb) return;
    const ch = sb.channel('admin-convs').on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations' }, () => loadConvs()).subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [sb, loadConvs]);

  useEffect(() => {
    if (!sb || !sel) return;
    sb.from('chat_messages').select('id, sender, body, created_at').eq('conversation_id', sel.id).order('created_at').then(({ data }) => setMsgs((data as Msg[]) ?? []));
    sb.from('chat_conversations').update({ unread_admin: 0 }).eq('id', sel.id).then(() => undefined);
    const ch = sb
      .channel(`admin-msg-${sel.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${sel.id}` }, (p) => {
        const m = p.new as Msg;
        setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      })
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [sb, sel]);

  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [msgs]);

  const send = async () => {
    if (!sb || !sel || !user || !text.trim()) return;
    const { data } = await sb.from('chat_messages').insert({ conversation_id: sel.id, sender: 'admin', sender_id: user.id, body: text.trim() }).select('id, sender, body, created_at').single();
    if (data) setMsgs((p) => (p.some((x) => x.id === data.id) ? p : [...p, data as Msg]));
    setText('');
  };
  const setConvStatus = async (s: 'open' | 'closed') => {
    if (!sb || !sel) return;
    await sb.from('chat_conversations').update({ status: s }).eq('id', sel.id);
    setSel(null);
    loadConvs();
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Chat de suporte</h1>
        <Pills value={status} onChange={(s) => { setStatus(s); setSel(null); }} options={[{ value: 'open', label: 'Abertos' }, { value: 'closed', label: 'Encerrados' }]} />
      </div>
      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <div className="card max-h-[70vh] overflow-y-auto p-2">
          {convs.length === 0 && <p className="p-4 text-sm text-muted">Nenhuma conversa.</p>}
          {convs.map((c) => (
            <button key={c.id} onClick={() => setSel(c)} className={cx('w-full rounded-xl px-3 py-2 text-left hover:bg-neon/10', sel?.id === c.id && 'bg-neon/10')}>
              <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{c.user_email ?? 'Usuário'}</span>{c.unread_admin > 0 && <span className="rounded-full bg-neon px-2 text-xs font-bold text-on-neon">{c.unread_admin}</span>}</div>
              <div className="text-xs text-muted">{new Date(c.last_message_at).toLocaleString('pt-BR')}</div>
            </button>
          ))}
        </div>
        <div className="card flex h-[70vh] flex-col">
          {!sel ? <div className="grid flex-1 place-items-center text-sm text-muted">Selecione uma conversa.</div> : (
            <>
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <b className="truncate">{sel.user_email}</b>
                {sel.status === 'open' ? <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setConvStatus('closed')}><CheckCircle2 className="h-4 w-4" /> Encerrar</button> : <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setConvStatus('open')}><RotateCcw className="h-4 w-4" /> Reabrir</button>}
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {msgs.map((m) => (
                  <div key={m.id} className={cx('flex', m.sender === 'admin' ? 'justify-end' : 'justify-start')}>
                    <div className={cx('max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm', m.sender === 'admin' ? 'bg-neon text-on-neon' : 'border border-line bg-card-2')}>{m.body}<div className="mt-1 text-[10px] opacity-70">{new Date(m.created_at).toLocaleString('pt-BR')}</div></div>
                  </div>
                ))}
                <div ref={end} />
              </div>
              <div className="flex gap-2 border-t border-line p-3">
                <textarea className="input resize-none" rows={2} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Responder..." />
                <button className="btn-neon w-14" onClick={send} aria-label="Enviar"><Send className="h-5 w-5" /></button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
