'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setMsg('')
    if (mode === 'in') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMsg('E-mail ou senha incorretos.')
      else router.push('/dashboard')
    } else if (mode === 'up') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setMsg(error.message)
      else setMsg('Conta criada. Se a confirmação por e-mail estiver ativa, confirme e depois entre.')
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/redefinir` })
      if (error) setMsg(error.message)
      else setMsg('Se este e-mail estiver cadastrado, enviamos um link para redefinir sua senha. Verifique sua caixa de entrada (e o spam).')
    }
    setLoading(false)
  }

  const title = mode === 'in' ? 'Entrar' : mode === 'up' ? 'Criar conta' : 'Recuperar senha'
  const cta = mode === 'in' ? 'Entrar' : mode === 'up' ? 'Cadastrar' : 'Enviar link de recuperação'

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="mark" aria-hidden>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 5.3L20 8l-4 4 1 6-5-3-5 3 1-6-4-4 5.6-.7L12 2z" /></svg>
          </div>
          <div><b>Tiger Invest</b><span>Controle de Ativos</span></div>
        </div>
        <h1 className="auth-title">{title}</h1>
        {mode === 'reset' && <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 4 }}>Digite seu e-mail e enviaremos um link para você criar uma nova senha.</p>}
        <form onSubmit={submit}>
          <label>E-mail</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="voce@email.com" />
          {mode !== 'reset' && (<>
            <label>Senha</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="********" minLength={6} />
          </>)}
          <button className="btn" disabled={loading}>{loading ? '...' : cta}</button>
        </form>
        {msg && <p className="auth-msg">{msg}</p>}

        {mode === 'in' && (
          <button className="auth-switch" style={{ marginTop: 12 }} onClick={() => { setMode('reset'); setMsg('') }}>
            Esqueci minha senha
          </button>
        )}
        <button className="auth-switch" onClick={() => { setMode(mode === 'up' ? 'in' : mode === 'in' ? 'up' : 'in'); setMsg('') }}>
          {mode === 'in' ? 'Não tem conta? Cadastre-se' : mode === 'up' ? 'Já tem conta? Entrar' : 'Voltar para o login'}
        </button>
        <p style={{ textAlign: 'center', marginTop: 14 }}><Link className="auth-switch" href="/" style={{ display: 'inline' }}>← Página inicial</Link></p>
      </div>
    </main>
  )
}
