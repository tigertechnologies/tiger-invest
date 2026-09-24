'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useApp } from './providers';
import { Spinner, cx } from './ui';

type Msg = { id: string; sender: 'user' | 'admin'; body: string; created_at: string };

export function ChatWidget() {
  const { user } = useApp();
  const pathname = usePathname();
  // na Minha Carteira (/invest) há uma barra de abas fixa embaixo no celular
  const lifted = pathname?.startsWith('/invest');
  const [open, setOpen] = useState(false);
  const [conv, setConv] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sb = supabaseBrowser();

  const load = useCallback(async () => {
    if (!sb || !user) return;
    const { data } = await sb.from('chat_conversations').select('id').eq('user_id', user.id).eq('status', 'open').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (data) {
      setConv(data.id);
      const { data: m } = await sb.from('chat_messages').select('id, sender, body, created_at').eq('conversation_id', data.id).order('created_at');
      setMsgs((m as Msg[]) ?? []);
    }
  }, [sb, user]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!sb || !conv) return;
    const ch = sb
      .channel(`chat-${conv}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conv}` }, (p) => {
        const m = p.new as Msg;
        setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      })
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [sb, conv]);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [msgs, open]);

  const send = async () => {
    const body = text.trim();
    if (!body || !sb || !user) return;
    setBusy(true);
    setErr(null);
    try {
      let id = conv;
      if (!id) {
        const { data, error } = await sb.from('chat_conversations').insert({ user_id: user.id, user_email: user.email }).select('id').single();
        if (error) throw error;
        id = data.id as string;
        setConv(id);
      }
      const { data, error } = await sb.from('chat_messages').insert({ conversation_id: id, sender: 'user', sender_id: user.id, body }).select('id, sender, body, created_at').single();
      if (error) throw error;
      setMsgs((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data as Msg]));
      setText('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Não foi possível enviar.');
    } finally {
      setBusy(false);
    }
  };

  const end = async () => {
    if (sb && conv) await sb.from('chat_conversations').update({ status: 'closed' }).eq('id', conv);
    setConv(null);
    setMsgs([]);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cx('fixed right-6 z-40 grid', lifted ? 'bottom-24 md:bottom-6' : 'bottom-6', ' h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-neon to-lime text-on-neon shadow-neon transition hover:scale-110')}
        aria-label="Abrir chat de suporte"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="chat-title" aria-describedby="chat-desc">
          <div className="flex h-[min(640px,90vh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h2 id="chat-title" className="font-display text-lg font-semibold">Chat de Suporte</h2>
                <p id="chat-desc" className="text-xs text-muted">Nossa equipe responde por aqui mesmo.</p>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-full border border-neon/40 p-1.5 text-neon hover:bg-neon/10" aria-label="Fechar">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {!sb ? (
                <Center title="Chat indisponível" sub="Configure o Supabase para ativar o chat de suporte." />
              ) : !user ? (
                <Center title="Entre para falar com o suporte" sub="Faça login para iniciar uma conversa com a nossa equipe.">
                  <Link href="/login" className="btn-neon mt-4" onClick={() => setOpen(false)}>Entrar</Link>
                </Center>
              ) : msgs.length === 0 ? (
                <Center title="Nenhuma mensagem ainda" sub="Inicie uma conversa com nossa equipe de suporte." />
              ) : (
                msgs.map((m) => (
                  <div key={m.id} className={cx('flex', m.sender === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={cx('max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm', m.sender === 'user' ? 'rounded-br-sm bg-neon text-on-neon' : 'rounded-bl-sm border border-line bg-card-2')}>
                      {m.body}
                      <div className={cx('mt-1 text-[10px]', m.sender === 'user' ? 'text-on-neon/70' : 'text-muted')}>
                        {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={endRef} />
            </div>
            {sb && user && (
              <div className="border-t border-line p-4">
                {err && <p className="mb-2 text-xs text-down">{err}</p>}
                <div className="flex gap-3">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    rows={2}
                    maxLength={4000}
                    placeholder="Digite sua mensagem..."
                    className="input resize-none"
                  />
                  <button onClick={send} disabled={busy || !text.trim()} className="btn-neon w-14 shrink-0" aria-label="Enviar">
                    {busy ? <Spinner className="text-on-neon" /> : <Send className="h-5 w-5" />}
                  </button>
                </div>
                <p className="mt-2 text-xs text-muted">
                  Enter envia, Shift+Enter quebra linha.{' '}
                  {conv && (
                    <button onClick={end} className="font-semibold text-neon underline">
                      Encerrar chat
                    </button>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Center({ title, sub, children }: { title: string; sub: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center py-10 text-center">
      <MessageCircle className="mb-3 h-12 w-12 text-muted/60" />
      <div className="font-medium">{title}</div>
      <div className="mt-1 text-sm text-muted">{sub}</div>
      {children}
    </div>
  );
}
