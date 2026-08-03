'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setMsg('')
    if (mode === 'in') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMsg(error.message)
      else router.push('/dashboard')
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setMsg(error.message)
      else setMsg('Conta criada. Se a confirmacao por e-mail estiver ativa, confirme e depois entre.')
    }
    setLoading(false)
  }

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="mark" aria-hidden>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 5.3L20 8l-4 4 1 6-5-3-5 3 1-6-4-4 5.6-.7L12 2z" /></svg>
          </div>
          <div><b>Tiger Invest</b><span>Controle de Ativos</span></div>
        </div>
        <h1 className="auth-title">{mode === 'in' ? 'Entrar' : 'Criar conta'}</h1>
        <form onSubmit={submit}>
          <label>E-mail</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="voce@email.com" />
          <label>Senha</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="********" />
          <button className="btn" disabled={loading}>{loading ? '...' : mode === 'in' ? 'Entrar' : 'Cadastrar'}</button>
        </form>
        {msg && <p className="auth-msg">{msg}</p>}
        <button className="auth-switch" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg('') }}>
          {mode === 'in' ? 'Nao tem conta? Cadastre-se' : 'Ja tem conta? Entrar'}
        </button>
      </div>
    </main>
  )
}
