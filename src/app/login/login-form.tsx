'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRound, Mail, UserPlus } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { LogoMark } from '@/components/logo';
import { Pills, Spinner } from '@/components/ui';

type Mode = 'login' | 'signup' | 'magic';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';
  const [mode, setMode] = useState<Mode>(params.get('modo') === 'cadastro' || params.get('ref') ? 'signup' : 'login');
  const [city, setCity] = useState('');
  const [uf, setUf] = useState('');
  const [refCode, setRefCode] = useState('');

  // código de indicação (?ref=CODIGO) — guardado para o cadastro
  useEffect(() => {
    const r = params.get('ref');
    try {
      if (r) localStorage.setItem('ti_ref', r.toUpperCase());
      setRefCode((r || localStorage.getItem('ti_ref') || '').toUpperCase());
    } catch {
      if (r) setRefCode(r.toUpperCase());
    }
  }, [params]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const sb = supabaseBrowser();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sb) return setMsg({ ok: false, text: 'Supabase não configurado. Veja o README.' });
    setBusy(true);
    setMsg(null);
    const redirect = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    try {
      if (mode === 'login') {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
      } else if (mode === 'signup') {
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name, city: city || undefined, state: uf || undefined, ref_code: refCode || undefined }, emailRedirectTo: redirect } });
        if (error) throw error;
        if (data.session) {
          router.replace(next);
          router.refresh();
        } else setMsg({ ok: true, text: 'Conta criada! Confirme pelo link enviado ao seu e-mail.' });
      } else {
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
        if (error) throw error;
        setMsg({ ok: true, text: 'Enviamos um link de acesso para o seu e-mail.' });
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : 'Erro';
      setMsg({ ok: false, text: /invalid login/i.test(m) ? 'E-mail ou senha incorretos.' : m });
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!sb) return setMsg({ ok: false, text: 'Supabase não configurado. Veja o README.' });
    if (!email) return setMsg({ ok: false, text: 'Digite seu e-mail acima e clique de novo em “Esqueci minha senha”.' });
    setBusy(true);
    setMsg(null);
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/redefinir')}`,
    });
    setBusy(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Enviamos um link para criar uma nova senha. Confira seu e-mail.' });
  };

  return (
    <div className="mx-auto max-w-md py-8">
      <div className="card p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark size={56} />
          <h1 className="mt-4 font-display text-2xl font-bold">
            {mode === 'signup' ? 'Crie sua conta' : 'Acesse o Tiger Labs'}
          </h1>
          <p className="mt-1 text-sm text-muted">Análises, scanners e DeFi em um só lugar.</p>
        </div>
        <div className="mb-5 flex justify-center">
          <Pills<Mode>
            value={mode}
            onChange={(m) => {
              setMode(m);
              setMsg(null);
            }}
            options={[
              { value: 'login', label: 'Entrar' },
              { value: 'signup', label: 'Criar conta' },
              { value: 'magic', label: 'Link por e-mail' },
            ]}
          />
        </div>
        <form onSubmit={submit} className="space-y-3">
          {mode === 'signup' && (
            <>
              <input className="input" placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} required />
              <div className="grid grid-cols-[1fr_96px] gap-2">
                <input className="input" placeholder="Cidade (opcional)" value={city} onChange={(e) => setCity(e.target.value)} />
                <select className="input" value={uf} onChange={(e) => setUf(e.target.value)} aria-label="Estado">
                  <option value="">UF</option>
                  {UFS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          <input className="input" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          {mode !== 'magic' && (
            <input className="input" type="password" placeholder="Senha (mín. 6 caracteres)" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          )}
          <button className="btn-neon w-full" disabled={busy}>
            {busy ? <Spinner className="text-on-neon" /> : mode === 'login' ? <KeyRound className="h-4 w-4" /> : mode === 'signup' ? <UserPlus className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
            {mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link'}
          </button>
        </form>
        {mode === 'login' && (
          <button type="button" onClick={forgot} className="mt-3 w-full text-center text-sm text-muted hover:text-neon" disabled={busy}>
            Esqueci minha senha
          </button>
        )}
        {mode === 'signup' && refCode && (
          <p className="mt-3 text-center text-xs text-muted">
            Indicado pelo código <span className="font-mono font-bold text-neon">{refCode}</span>
          </p>
        )}
        {msg && <p className={`mt-4 rounded-xl border px-3 py-2 text-sm ${msg.ok ? 'border-up/40 bg-up/10 text-up' : 'border-down/40 bg-down/10 text-down'}`}>{msg.text}</p>}
      </div>
    </div>
  );
}
