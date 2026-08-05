'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function Redefinir() {
  const router = useRouter()
  const supabase = createClient()
  const [ready, setReady] = useState(false)
  const [pass, setPass] = useState(''); const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState(''); const [ok, setOk] = useState(false); const [loading, setLoading] = useState(false)

  // o link do e-mail cria uma sessão de recuperação; aguardamos ela existir
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true)
    })
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true) })
    const t = setTimeout(() => setReady(true), 1500) // fallback
    return () => { sub.subscription.unsubscribe(); clearTimeout(t) }
  }, [supabase])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pass.length < 6) { setMsg('A senha deve ter ao menos 6 caracteres.'); return }
    if (pass !== confirm) { setMsg('As senhas não coincidem.'); return }
    setLoading(true); setMsg('')
    const { error } = await supabase.auth.updateUser({ password: pass })
    setLoading(false)
    if (error) { setMsg(error.message.includes('session') ? 'Link inválido ou expirado. Peça um novo em "Esqueci minha senha".' : error.message); return }
    setOk(true); setMsg('Senha redefinida com sucesso! Redirecionando…')
    setTimeout(() => router.push('/dashboard'), 1400)
  }

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="mark" aria-hidden><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 5.3L20 8l-4 4 1 6-5-3-5 3 1-6-4-4 5.6-.7L12 2z" /></svg></div>
          <div><b>Tiger Invest</b><span>Controle de Ativos</span></div>
        </div>
        <h1 className="auth-title">Criar nova senha</h1>
        {!ok && (
          <form onSubmit={submit}>
            <label>Nova senha</label>
            <input type="password" value={pass} onChange={e => setPass(e.target.value)} required placeholder="mínimo 6 caracteres" minLength={6} />
            <label>Confirmar nova senha</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="repita a senha" minLength={6} />
            <button className="btn" disabled={loading || !ready}>{loading ? '...' : ready ? 'Salvar nova senha' : 'Validando link…'}</button>
          </form>
        )}
        {msg && <p className="auth-msg">{msg}</p>}
      </div>
    </main>
  )
}
