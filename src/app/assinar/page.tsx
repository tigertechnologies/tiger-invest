'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Background from '@/components/Background'
import { createClient } from '@/lib/supabase/client'
import { PLANS } from '@/lib/plans'

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

export default function Assinar() {
  const router = useRouter()
  const supabase = createClient()
  const [planId, setPlanId] = useState('pro')
  const [cycle, setCycle] = useState('mensal')
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const [city, setCity] = useState(''); const [uf, setUf] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [msg, setMsg] = useState(''); const [ok, setOk] = useState(false); const [loading, setLoading] = useState(false)

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (q.get('plano')) setPlanId(q.get('plano')!)
    if (q.get('ciclo')) setCycle(q.get('ciclo')!)
  }, [])

  const plan = PLANS.find(p => p.id === planId) || PLANS[1]
  const price = cycle === 'anual' ? (plan.price * 12) : plan.price

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!accepted) { setMsg('Você precisa aceitar os termos para continuar.'); return }
    setLoading(true); setMsg('')
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name, city, state: uf, plan: planId, cycle, accepted_terms: true, accepted_at: new Date().toISOString() } },
    })
    setLoading(false)
    if (error) { setMsg(error.message); return }
    setOk(true)
    if (data.session) { setMsg('Conta criada! Redirecionando para o sistema…'); setTimeout(() => router.push('/dashboard'), 1400) }
    else setMsg(`Conta criada com o plano ${plan.name}! Enviamos um e-mail de confirmação para ${email}. Confirme para ativar e acessar o sistema.`)
  }

  return (
    <>
      <Background />
      <main className="as-wrap">
        <div className="as-card">
          <div className="as-plan-badge">★ {plan.name} · {cycle === 'anual' ? 'Anual' : 'Mensal'} · R$ {price.toFixed(2).replace('.', ',')}{cycle === 'anual' ? '/ano' : '/mês'}</div>
          <h1>Criar sua conta</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 8 }}>Preencha seus dados para assinar o {plan.name}.</p>

          {!ok && (
            <form onSubmit={submit}>
              <label>Nome completo</label>
              <input value={name} onChange={e => setName(e.target.value)} required placeholder="Seu nome" />
              <label>E-mail</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="voce@email.com" />
              <label>Senha</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="mínimo 6 caracteres" minLength={6} />
              <div className="grid2">
                <div style={{ flex: 2 }}><label>Cidade</label><input value={city} onChange={e => setCity(e.target.value)} required placeholder="Sua cidade" /></div>
                <div style={{ flex: 1 }}><label>Estado</label><select value={uf} onChange={e => setUf(e.target.value)} required><option value="">UF</option>{UFS.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
              </div>

              <label className="as-accept">
                <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} />
                <span>Li e aceito os <Link href="/termos" target="_blank">Termos de Uso e a Política de Privacidade (LGPD)</Link>. Declaro estar ciente de que a Tiger Invest é uma plataforma de tecnologia, <strong>não é recomendação de investimento</strong> e não se responsabiliza por decisões ou perdas financeiras.</span>
              </label>

              <button className="btn" style={{ marginTop: 18 }} disabled={loading || !accepted}>{loading ? '...' : 'Criar conta e assinar'}</button>
              <p style={{ fontSize: 11.5, color: 'var(--faint)', textAlign: 'center', marginTop: 12 }}>Pagamento via PIX será solicitado após a confirmação. Cancele quando quiser.</p>
            </form>
          )}

          {msg && <p className="as-msg">{msg}</p>}
          {ok && <div style={{ marginTop: 16 }}><Link className="lp-btn ghost" href="/login" style={{ width: '100%' }}>Ir para o login</Link></div>}
          <p style={{ textAlign: 'center', marginTop: 16 }}><Link className="lp-link" href="/">← voltar</Link></p>
        </div>
      </main>
    </>
  )
}
