'use client';
import { useState } from 'react';
import { CheckCircle2, Rocket } from 'lucide-react';
import { Spinner } from '@/components/ui';

export function LeadForm() {
  const [f, setF] = useState({ name: '', email: '', whatsapp: '', interest: 'Plataforma completa', consent: false });
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | string>('idle');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('busy');
    const r = await fetch('/api/leads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(f) });
    const j = await r.json().catch(() => ({}));
    setState(r.ok ? 'ok' : j.error || 'Não foi possível enviar.');
  };
  if (state === 'ok')
    return (
      <div className="card flex flex-col items-center p-8 text-center">
        <CheckCircle2 className="h-12 w-12 text-neon" />
        <h2 className="mt-3 font-display text-xl font-bold">Recebemos seu contato!</h2>
        <p className="mt-1 text-sm text-muted">Em breve nossa equipe fala com você.</p>
      </div>
    );
  return (
    <form onSubmit={submit} className="card space-y-3 p-6">
      <h2 className="font-display text-xl font-bold">Quero entrar no Labs</h2>
      <input className="input" placeholder="Seu nome" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input className="input" type="email" placeholder="Seu melhor e-mail" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <input className="input" placeholder="WhatsApp (opcional)" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} />
      <select className="input" value={f.interest} onChange={(e) => setF({ ...f, interest: e.target.value })} aria-label="Interesse">
        <option>Plataforma completa</option><option>Curso</option><option>Mentoria</option><option>Estratégias DeFi</option>
      </select>
      <label className="flex items-start gap-2 text-xs text-muted">
        <input type="checkbox" required checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} className="mt-0.5 accent-[rgb(var(--neon))]" />
        <span>Concordo em receber contato do Tiger Labs e li a <a href="/privacy" className="text-neon underline">Política de Privacidade</a>.</span>
      </label>
      <button className="btn-neon w-full" disabled={state === 'busy'}>{state === 'busy' ? <Spinner className="text-on-neon" /> : <Rocket className="h-4 w-4" />} Quero entrar agora</button>
      {state !== 'idle' && state !== 'busy' && <p className="text-sm text-down">{state}</p>}
    </form>
  );
}
