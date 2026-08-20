'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Background from '@/components/Background'
import { PLANS } from '@/lib/plans'
import { getReferral, assinarComCreditos, type ReferralSummary } from '@/app/indicacoes/actions'

const brl = (c: number) => 'R$ ' + (c / 100).toFixed(2).replace('.', ',')

export default function ReferralApp({ linkBase }: { linkBase: string }) {
  const router = useRouter()
  const [data, setData] = useState<ReferralSummary | null>(null)
  const [erro, setErro] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  async function load() {
    const r = await getReferral()
    if (r.ok) setData(r.data); else setErro(r.erro)
  }
  useEffect(() => { load() }, [])

  const link = data ? `${linkBase || ''}/assinar?ref=${data.code}` : ''

  function copy() { navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }).catch(() => {}) }

  async function pagar(planId: string, cycle: string) {
    setBusy(planId + cycle); setMsg('')
    const r = await assinarComCreditos(planId, cycle)
    setBusy('')
    if (r.ok) { setMsg('✓ Assinatura ativada com seus créditos!'); await load(); setTimeout(() => router.push('/dashboard'), 1400) }
    else setMsg('✗ ' + r.erro)
  }

  return (
    <>
      <Background />
      <main className="ref-wrap">
        <div className="ref-top">
          <div className="ref-brand"><span className="ref-star">★</span> Tiger Invest <b>· Indicações</b></div>
          <button className="adm-gbtn" onClick={() => router.push('/dashboard')}>Voltar ao app</button>
        </div>

        {erro && <div className="ref-card" style={{ color: 'var(--red)' }}>{erro}</div>}
        {!data && !erro && <div className="ref-card" style={{ color: 'var(--muted)' }}>Carregando…</div>}

        {data && (<>
          <div className="ref-hero">
            <h1>Indique e ganhe créditos</h1>
            <p>Compartilhe seu link. Quando alguém assina por ele, você ganha <b>{data.tierPct}%</b> em crédito <b>a cada pagamento</b> — enquanto a pessoa continuar assinante. Os créditos abatem a sua própria assinatura.</p>
            <div className="ref-link"><input readOnly value={link} onClick={e => (e.target as HTMLInputElement).select()} /><button onClick={copy}>{copied ? 'Copiado ✓' : 'Copiar'}</button></div>
          </div>

          <div className="ref-cards">
            <div className="ref-card"><div className="ref-k">Saldo disponível</div><div className="ref-v" style={{ color: 'var(--green)' }}>{brl(data.balanceCents)}</div></div>
            <div className="ref-card"><div className="ref-k">Total ganho</div><div className="ref-v">{brl(data.earnedCents)}</div></div>
            <div className="ref-card"><div className="ref-k">Já usado</div><div className="ref-v">{brl(data.usedCents)}</div></div>
            <div className="ref-card"><div className="ref-k">Indicados (ativos)</div><div className="ref-v">{data.referredCount} <span style={{ fontSize: 14, color: 'var(--muted)' }}>({data.activeCount})</span></div></div>
          </div>

          <div className="ref-tier">Sua faixa atual: <b>{data.tierPct}%</b> · faixas por indicados ativos: 1 = 3% · 2–4 = 5% · 5–9 = 7% · 10+ = 10%</div>

          {/* Usar créditos */}
          <div className="ref-card" style={{ marginTop: 6 }}>
            <div className="ref-sec">Usar meus créditos ({brl(data.balanceCents)})</div>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 12px' }}>Se o saldo cobrir o plano, você ativa a assinatura direto com créditos, sem PIX.</p>
            {msg && <p style={{ fontSize: 13, marginBottom: 10, color: msg.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>{msg}</p>}
            <div className="ref-plans">
              {PLANS.map(p => {
                const mensal = Math.round(p.price * 100), anual = mensal * 12
                return (
                  <div key={p.id} className="ref-plan">
                    <div className="ref-plan-n">{p.name.replace('TIGER ', '')}</div>
                    <button disabled={data.balanceCents < mensal || !!busy} className="ref-pbtn" onClick={() => pagar(p.id, 'mensal')}>{busy === p.id + 'mensal' ? '...' : `Mês · ${brl(mensal)}`}</button>
                    <button disabled={data.balanceCents < anual || !!busy} className="ref-pbtn" onClick={() => pagar(p.id, 'anual')}>{busy === p.id + 'anual' ? '...' : `Ano · ${brl(anual)}`}</button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Extrato */}
          <div className="ref-card" style={{ marginTop: 6 }}>
            <div className="ref-sec">Extrato da carteira</div>
            {data.transactions.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>Nenhum crédito ainda. Compartilhe seu link!</p>}
            {data.transactions.map(t => (
              <div key={t.id} className="ref-tx">
                <div><b>{t.tipo === 'comissao' ? '💰 Comissão' : t.tipo === 'uso' ? '🛒 Uso' : '⚙️ Ajuste'}</b><span>{new Date(t.created_at).toLocaleDateString('pt-BR')} · {t.descricao}</span></div>
                <b style={{ color: t.valor_cents >= 0 ? 'var(--green)' : 'var(--red)' }}>{t.valor_cents >= 0 ? '+' : '-'}{brl(Math.abs(t.valor_cents)).replace('R$ ', 'R$ ')}</b>
              </div>
            ))}
          </div>
        </>)}
      </main>
    </>
  )
}
