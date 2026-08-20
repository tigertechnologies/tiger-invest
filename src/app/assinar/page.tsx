'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Background from '@/components/Background'
import { createClient } from '@/lib/supabase/client'
import { PLANS, type Plan } from '@/lib/plans'
import { criarPedidoEPix, consultarStatusPedido, type PixResultado } from './actions'
import Paywall from '@/components/Paywall'

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

  const [step, setStep] = useState<'form' | 'pix'>('form')
  const [logged, setLogged] = useState<null | boolean>(null)
  const [loggedEmail, setLoggedEmail] = useState('')
  const [pix, setPix] = useState<PixResultado | null>(null)
  const [pixLoading, setPixLoading] = useState(false)
  const [paid, setPaid] = useState(false)
  const [copied, setCopied] = useState(false)
  const pollRef = useRef<any>(null)

  const [refCode, setRefCode] = useState('')
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (q.get('plano')) setPlanId(q.get('plano')!)
    if (q.get('ciclo')) setCycle(q.get('ciclo')!)
    const ref = q.get('ref')
    if (ref) { setRefCode(ref.toUpperCase()); try { localStorage.setItem('ti_ref', ref.toUpperCase()) } catch {} }
    else { try { const s = localStorage.getItem('ti_ref'); if (s) setRefCode(s) } catch {} }
    supabase.auth.getUser().then(({ data }) => { setLogged(!!data.user); setLoggedEmail(data.user?.email || '') })
    fetch('/api/plans').then(r => r.json()).then(d => { if (Array.isArray(d) && d.length) setPlans(d) }).catch(() => {})
  }, [supabase])

  const [plans, setPlans] = useState<Plan[]>(PLANS)
  const plan = plans.find(p => p.id === planId) || plans[1] || plans[0]
  const price = cycle === 'anual' ? (plan.price * 12) : plan.price

  async function gerarPix() {
    setPixLoading(true); setMsg('')
    const r = await criarPedidoEPix(planId, cycle)
    setPix(r); setPixLoading(false)
    if (!r.ok) setMsg(r.erro)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!accepted) { setMsg('Você precisa aceitar os termos para continuar.'); return }
    setLoading(true); setMsg('')
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name, city, state: uf, plan: planId, cycle, accepted_terms: true, accepted_at: new Date().toISOString(), ref_code: refCode || undefined } },
    })
    setLoading(false)
    if (error) { setMsg(error.message); return }

    if (data.session) {
      setStep('pix')
      gerarPix()
    } else {
      setOk(true)
      setMsg(`Conta criada com o plano ${plan.name}! Enviamos um e-mail de confirmação para ${email}. Confirme e faça login para efetuar o pagamento.`)
    }
  }

  useEffect(() => {
    if (step !== 'pix' || !pix || !pix.ok || paid) return
    const orderId = pix.orderId
    pollRef.current = setInterval(async () => {
      const s = await consultarStatusPedido(orderId)
      if ('status' in s && s.status === 'paid') {
        setPaid(true)
        clearInterval(pollRef.current)
        setTimeout(() => router.push('/dashboard'), 1600)
      }
    }, 4000)
    return () => clearInterval(pollRef.current)
  }, [step, pix, paid, router])

  function copyCode() {
    if (!pix || !pix.ok) return
    navigator.clipboard?.writeText(pix.qrCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }).catch(() => {})
  }

  // Já logado → fluxo de upgrade (escolher plano + PIX), sem cadastro de novo.
  if (logged === null) return null
  if (logged) return <Paywall userEmail={loggedEmail} />

  return (
    <>
      <Background />
      <main className="as-wrap">
        <div className="as-card">
          <div className="as-plan-badge">★ {plan.name} · {cycle === 'anual' ? 'Anual' : 'Mensal'} · R$ {price.toFixed(2).replace('.', ',')}{cycle === 'anual' ? '/ano' : '/mês'}</div>

          {step === 'form' && (<>
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

                <button className="btn" style={{ marginTop: 18 }} disabled={loading || !accepted}>{loading ? '...' : 'Criar conta e ir para o pagamento'}</button>
                <p style={{ fontSize: 11.5, color: 'var(--faint)', textAlign: 'center', marginTop: 12 }}>Pagamento via PIX na próxima etapa. Cancele quando quiser.</p>
              </form>
            )}
          </>)}

          {step === 'pix' && (<>
            <h1>{paid ? 'Pagamento confirmado!' : 'Pague com PIX'}</h1>

            {paid && <p className="as-msg" style={{ color: 'var(--green)' }}>Assinatura ativada. Redirecionando para o sistema…</p>}
            {!paid && pixLoading && <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>Gerando seu PIX…</p>}

            {!paid && pix && pix.ok && (
              <div style={{ textAlign: 'center', marginTop: 6 }}>
                <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 14 }}>Escaneie o QR no app do seu banco ou use o copia-e-cola. A confirmação é automática.</p>
                {pix.qrBase64 && <img src={`data:image/png;base64,${pix.qrBase64}`} alt="QR Code PIX" style={{ width: 220, height: 220, borderRadius: 14, background: '#fff', padding: 8, margin: '0 auto', display: 'block' }} />}
                <div style={{ margin: '16px 0 6px', fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--muted)', wordBreak: 'break-all', background: 'rgba(255,255,255,.05)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', maxHeight: 84, overflow: 'auto' }}>{pix.qrCode}</div>
                <button className="btn" onClick={copyCode} style={{ marginTop: 8 }}>{copied ? 'Copiado ✓' : 'Copiar código PIX'}</button>
                <p style={{ fontSize: 12, color: 'var(--faint)', marginTop: 14 }}>Aguardando pagamento…</p>
              </div>
            )}

            {!paid && pix && !pix.ok && (
              <div style={{ marginTop: 8 }}>
                <p className="as-msg" style={{ color: 'var(--red)' }}>{pix.erro}</p>
                <button className="btn" onClick={gerarPix} style={{ marginTop: 8 }}>Tentar novamente</button>
              </div>
            )}
          </>)}

          {msg && step === 'form' && <p className="as-msg">{msg}</p>}
          {ok && <div style={{ marginTop: 16 }}><Link className="lp-btn ghost" href="/login" style={{ width: '100%' }}>Ir para o login</Link></div>}
          <p style={{ textAlign: 'center', marginTop: 16 }}><Link className="lp-link" href="/">← voltar</Link></p>
        </div>
      </main>
    </>
  )
}
