'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Background from '@/components/Background'
import { createClient } from '@/lib/supabase/client'
import { PLANS, type Plan } from '@/lib/plans'
import { criarPedidoEPix, consultarStatusPedido, type PixResultado } from '@/app/assinar/actions'

export default function Paywall({ userEmail }: { userEmail: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [planId, setPlanId] = useState('pro')
  const [cycle, setCycle] = useState('mensal')
  const [pix, setPix] = useState<PixResultado | null>(null)
  const [pixLoading, setPixLoading] = useState(false)
  const [paid, setPaid] = useState(false)
  const [copied, setCopied] = useState(false)
  const pollRef = useRef<any>(null)

  const [plans, setPlans] = useState<Plan[]>(PLANS)
  useEffect(() => { fetch('/api/plans').then(r => r.json()).then(d => { if (Array.isArray(d) && d.length) setPlans(d) }).catch(() => {}) }, [])
  const plan = plans.find(p => p.id === planId) || plans[1] || plans[0]
  const price = cycle === 'anual' ? plan.price * 12 : plan.price

  async function gerarPix() {
    setPixLoading(true)
    const r = await criarPedidoEPix(planId, cycle)
    setPix(r); setPixLoading(false)
  }

  useEffect(() => {
    if (!pix || !pix.ok || paid) return
    const orderId = pix.orderId
    pollRef.current = setInterval(async () => {
      const s = await consultarStatusPedido(orderId)
      if ('status' in s && s.status === 'paid') { setPaid(true); clearInterval(pollRef.current); setTimeout(() => router.push('/dashboard'), 1500) }
    }, 4000)
    return () => clearInterval(pollRef.current)
  }, [pix, paid, router])

  function copyCode() {
    if (!pix || !pix.ok) return
    navigator.clipboard?.writeText(pix.qrCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }).catch(() => {})
  }

  return (
    <>
      <Background />
      <main className="as-wrap">
        <div className="as-card" style={{ maxWidth: 460 }}>
          {!pix && (<>
            <h1>Ative sua assinatura</h1>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 14 }}>Escolha seu plano para liberar o Tiger Invest. Pagamento via PIX, cancele quando quiser.</p>

            <div className="pw-toggle">
              <button className={cycle === 'mensal' ? 'on' : ''} onClick={() => setCycle('mensal')}>Mensal</button>
              <button className={cycle === 'anual' ? 'on' : ''} onClick={() => setCycle('anual')}>Anual</button>
            </div>

            <div className="pw-plans">
              {plans.map(p => (
                <button key={p.id} className={`pw-plan ${planId === p.id ? 'on' : ''}`} onClick={() => setPlanId(p.id)}>
                  <div className="pw-plan-top"><b>{p.name.replace('TIGER ', '')}</b>{p.popular && <span className="pw-tag">popular</span>}</div>
                  <div className="pw-price">R$ {(cycle === 'anual' ? p.price * 12 : p.price).toFixed(2).replace('.', ',')}<span>{cycle === 'anual' ? '/ano' : '/mês'}</span></div>
                  <div className="pw-desc">{p.tag}</div>
                </button>
              ))}
            </div>

            <button className="btn" style={{ marginTop: 16 }} onClick={gerarPix} disabled={pixLoading}>{pixLoading ? 'Gerando PIX…' : `Assinar ${plan.name.replace('TIGER ', '')} · R$ ${price.toFixed(2).replace('.', ',')}`}</button>
            <button className="lp-link" style={{ display: 'block', margin: '14px auto 0', background: 'none', border: 'none', cursor: 'pointer' }} onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}>Sair</button>
          </>)}

          {pix && (<>
            <div className="as-plan-badge">★ {plan.name} · {cycle === 'anual' ? 'Anual' : 'Mensal'} · R$ {price.toFixed(2).replace('.', ',')}</div>
            <h1>{paid ? 'Pagamento confirmado!' : 'Pague com PIX'}</h1>
            {paid && <p className="as-msg" style={{ color: 'var(--green)' }}>Assinatura ativada. Entrando…</p>}
            {!paid && pix.ok && (
              <div style={{ textAlign: 'center', marginTop: 6 }}>
                <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 14 }}>Escaneie o QR ou use o copia-e-cola. A confirmação é automática.</p>
                {pix.qrBase64 && <img src={`data:image/png;base64,${pix.qrBase64}`} alt="QR PIX" style={{ width: 220, height: 220, borderRadius: 14, background: '#fff', padding: 8, margin: '0 auto', display: 'block' }} />}
                <div style={{ margin: '16px 0 6px', fontFamily: 'JetBrains Mono', fontSize: 11, color: 'var(--muted)', wordBreak: 'break-all', background: 'rgba(255,255,255,.05)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', maxHeight: 84, overflow: 'auto' }}>{pix.qrCode}</div>
                <button className="btn" onClick={copyCode} style={{ marginTop: 8 }}>{copied ? 'Copiado ✓' : 'Copiar código PIX'}</button>
                <p style={{ fontSize: 12, color: 'var(--faint)', marginTop: 14 }}>Aguardando pagamento…</p>
              </div>
            )}
            {!paid && !pix.ok && (<><p className="as-msg" style={{ color: 'var(--red)' }}>{pix.erro}</p><button className="btn" onClick={() => setPix(null)} style={{ marginTop: 8 }}>Voltar</button></>)}
          </>)}
        </div>
      </main>
    </>
  )
}
