'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AdminData, AdminUser } from '@/lib/admin-data'
import type { Plan } from '@/lib/plans'
import { adminRefresh, setUserPlan, cancelUserSub, savePlan, ajustarCredito, setTaxaMp } from '@/app/admin/actions'

const brl = (cents: number) => 'R$ ' + (cents / 100).toFixed(2).replace('.', ',')
const dt = (s: string | null) => s ? new Date(s).toLocaleDateString('pt-BR') : '—'
const PLAN_IDS = ['start', 'pro', 'alpha']
const planColor: Record<string, string> = { start: '#7C5CFF', pro: '#FF2E9A', alpha: '#FFB020' }

export default function AdminApp({ initial }: { initial: AdminData }) {
  const router = useRouter()
  const supabase = createClient()
  const [data, setData] = useState<AdminData>(initial)
  const [tab, setTab] = useState<'visao' | 'usuarios' | 'pedidos' | 'planos' | 'indicacoes'>('visao')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [q, setQ] = useState('')
  const [openUser, setOpenUser] = useState<string | null>(null)

  const m = data.metrics
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(''), 2500) }
  async function refresh() { try { setData(await adminRefresh()) } catch (e) { flash((e as Error).message) } }

  async function applyPlan(u: AdminUser, planId: string, months: number) {
    setBusy(true)
    const r = await setUserPlan(u.id, planId, months)
    setBusy(false)
    if (r.ok) { flash(`Plano de ${u.email} atualizado.`); await refresh(); setOpenUser(null) } else flash(r.erro || 'Erro')
  }
  async function cancel(u: AdminUser) {
    if (!confirm(`Cancelar a assinatura de ${u.email}?`)) return
    setBusy(true); const r = await cancelUserSub(u.id); setBusy(false)
    if (r.ok) { flash('Assinatura cancelada.'); await refresh() } else flash(r.erro || 'Erro')
  }

  const users = data.users.filter(u => {
    const s = (u.email + ' ' + u.name + ' ' + u.city).toLowerCase()
    return !q || s.includes(q.toLowerCase())
  })

  return (
    <div className="adm">
      <header className="adm-top">
        <div className="adm-brand"><span className="adm-star">★</span> Tiger Invest <b>· Admin</b></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="adm-gbtn" onClick={() => router.push('/dashboard')}>App</button>
          <button className="adm-gbtn" onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}>Sair</button>
        </div>
      </header>

      <nav className="adm-tabs">
        {([['visao', 'Visão geral'], ['usuarios', 'Usuários'], ['pedidos', 'Pedidos'], ['planos', 'Planos'], ['indicacoes', 'Indicações']] as [typeof tab, string][]).map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>

      <main className="adm-main">
        {tab === 'visao' && (
          <div className="adm-cards">
            <Card label="Usuários" value={String(m.totalUsers)} />
            <Card label="Assinantes ativos" value={String(m.activeSubs)} accent="#2BFFC6" />
            <Card label="Cadastros (30d)" value={String(m.signups30d)} />
            <Card label="Receita total" value={brl(m.revenueCents)} accent="#FF2E9A" />
            <Card label="Pedidos pagos" value={String(m.paidCount)} />
            <Card label="MRR estimado" value={brl(m.mrrCents)} accent="#FFB020" />
            <div className="adm-card" style={{ gridColumn: '1 / -1' }}>
              <div className="adm-card-l">Assinantes ativos por plano</div>
              <div style={{ display: 'flex', gap: 18, marginTop: 10, flexWrap: 'wrap' }}>
                {PLAN_IDS.map(pid => (
                  <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: planColor[pid] }} />
                    <b style={{ fontFamily: 'JetBrains Mono' }}>{m.byPlan[pid] || 0}</b>
                    <span style={{ color: 'var(--muted)', fontSize: 13, textTransform: 'capitalize' }}>{pid}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'usuarios' && (
          <div>
            <input className="adm-search" placeholder="Buscar por e-mail, nome ou cidade…" value={q} onChange={e => setQ(e.target.value)} />
            <div className="adm-list">
              {users.map(u => (
                <div key={u.id} className="adm-urow">
                  <div className="adm-uinfo" onClick={() => setOpenUser(openUser === u.id ? null : u.id)}>
                    <div className="adm-uhead">
                      <b>{u.name || '(sem nome)'}</b>
                      {u.plan && <span className="adm-badge" style={{ background: planColor[u.plan] + '22', color: planColor[u.plan], borderColor: planColor[u.plan] + '55' }}>{u.plan}{u.status !== 'active' ? ` · ${u.status}` : ''}</span>}
                      {!u.plan && <span className="adm-badge" style={{ opacity: .6 }}>sem plano</span>}
                    </div>
                    <div className="adm-usub">{u.email} · {u.city || '—'}/{u.uf || '—'} · cadastro {dt(u.createdAt)} · último acesso {dt(u.lastSignIn)}{u.periodEnd ? ` · vence ${dt(u.periodEnd)}` : ''}</div>
                  </div>
                  {openUser === u.id && (
                    <div className="adm-actions">
                      <div className="adm-act-label">Definir plano:</div>
                      <div className="adm-act-grid">
                        {PLAN_IDS.map(pid => (<button key={pid} disabled={busy} className="adm-pbtn" style={{ borderColor: planColor[pid] + '66' }} onClick={() => applyPlan(u, pid, 1)}>{pid} · 1 mês</button>))}
                        {PLAN_IDS.map(pid => (<button key={pid + 'y'} disabled={busy} className="adm-pbtn" style={{ borderColor: planColor[pid] + '66' }} onClick={() => applyPlan(u, pid, 12)}>{pid} · 12 meses</button>))}
                      </div>
                      <div className="adm-act-foot">
                        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Cortesia = escolha o plano e o período; grava direto.</span>
                        {u.plan && <button disabled={busy} className="adm-cancel" onClick={() => cancel(u)}>Cancelar assinatura</button>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {users.length === 0 && <p className="adm-empty">Nenhum usuário encontrado.</p>}
            </div>
          </div>
        )}

        {tab === 'pedidos' && (
          <div className="adm-list">
            {data.orders.map(o => (
              <div key={o.id} className="adm-orow">
                <div>
                  <b>{o.email || o.userId.slice(0, 8)}</b>
                  <div className="adm-usub">{o.planId} · {o.cycle} · {dt(o.createdAt)}{o.paidAt ? ` · pago ${dt(o.paidAt)}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 700 }}>{brl(o.amountCents)}</div>
                  <span className={`adm-ostat ${o.status}`}>{o.status === 'paid' ? 'pago' : o.status === 'pending' ? 'pendente' : o.status}</span>
                </div>
              </div>
            ))}
            {data.orders.length === 0 && <p className="adm-empty">Nenhum pedido ainda.</p>}
          </div>
        )}

        {tab === 'planos' && (
          <div className="adm-plans">
            {data.plans.map(p => <PlanEditor key={p.id} plan={p} onSaved={(msg) => { flash(msg); refresh() }} />)}
            <p className="adm-empty" style={{ textAlign: 'left', fontSize: 12 }}>As mudanças aqui refletem na landing e no checkout na hora (a autoridade de preço fica no servidor).</p>
          </div>
        )}
        {tab === 'indicacoes' && <AdminReferral data={data} onChange={(t) => { flash(t); refresh() }} />}
      </main>

      {toast && <div className="adm-toast">{toast}</div>}
    </div>
  )
}

function Card({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return <div className="adm-card"><div className="adm-card-l">{label}</div><div className="adm-card-v" style={accent ? { color: accent } : undefined}>{value}</div></div>
}

function PlanEditor({ plan, onSaved }: { plan: Plan; onSaved: (msg: string) => void }) {
  const [name, setName] = useState(plan.name)
  const [price, setPrice] = useState(String(plan.price).replace('.', ','))
  const [tag, setTag] = useState(plan.tag)
  const [feats, setFeats] = useState(plan.features.join('\n'))
  const [popular, setPopular] = useState(!!plan.popular)
  const [active, setActive] = useState(true)
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    const r = await savePlan(plan.id, {
      name, priceReais: parseFloat(price.replace(',', '.')) || 0, tag,
      features: feats.split('\n').map(s => s.trim()).filter(Boolean), popular, active,
    })
    setBusy(false)
    onSaved(r.ok ? `Plano ${name} salvo.` : (r.erro || 'Erro ao salvar'))
  }

  return (
    <div className="adm-plan">
      <div className="adm-plan-id">{plan.id}</div>
      <div className="adm-frow"><label>Nome</label><input value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="adm-frow"><label>Preço mensal (R$)</label><input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} /></div>
      <div className="adm-frow"><label>Chamada (tag)</label><input value={tag} onChange={e => setTag(e.target.value)} /></div>
      <div className="adm-frow"><label>Benefícios (um por linha)</label><textarea rows={6} value={feats} onChange={e => setFeats(e.target.value)} /></div>
      <div className="adm-checks">
        <label><input type="checkbox" checked={popular} onChange={e => setPopular(e.target.checked)} /> Destaque “mais escolhido”</label>
        <label><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Ativo (visível)</label>
      </div>
      <button className="adm-save" disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar plano'}</button>
    </div>
  )
}

function AdminReferral({ data, onChange }: { data: AdminData; onChange: (t: string) => void }) {
  const r = data.referral
  const [taxa, setTaxa] = useState(String(r.taxaMp))
  const [aba, setAba] = useState<'ranking' | 'extrato'>('ranking')
  const [aj, setAj] = useState<any>(null)
  const [valor, setValor] = useState(''); const [motivo, setMotivo] = useState(''); const [busy, setBusy] = useState(false)
  const brl2 = (c: number) => 'R$ ' + (c / 100).toFixed(2).replace('.', ',')

  async function salvarTaxa() { const rr = await setTaxaMp(Number(taxa.replace(',', '.'))); onChange(rr.ok ? 'Taxa salva.' : (rr.erro || 'Erro')) }
  async function salvarAjuste() {
    if (!aj) return; setBusy(true)
    const rr = await ajustarCredito(aj.userId, Number(valor.replace(',', '.')), motivo); setBusy(false)
    if (rr.ok) { setAj(null); setValor(''); setMotivo(''); onChange('Crédito ajustado.') } else onChange(rr.erro || 'Erro')
  }

  return (
    <div>
      <div className="adm-cards" style={{ marginBottom: 14 }}>
        <div className="adm-card"><div className="adm-card-l">Comissões pagas</div><div className="adm-card-v" style={{ color: '#2BFFC6' }}>{brl2(r.totalComissaoCents)}</div></div>
        <div className="adm-card"><div className="adm-card-l">Créditos usados</div><div className="adm-card-v" style={{ color: '#FFB020' }}>{brl2(r.totalUsadoCents)}</div></div>
        <div className="adm-card"><div className="adm-card-l">Saldo em circulação</div><div className="adm-card-v">{brl2(r.saldoCirculacaoCents)}</div></div>
        <div className="adm-card"><div className="adm-card-l">Indicadores</div><div className="adm-card-v">{r.indicadores.length}</div></div>
      </div>

      <div className="adm-card" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 13 }}>Taxa Mercado Pago</b>
        <input value={taxa} onChange={e => setTaxa(e.target.value)} style={{ width: 70, background: 'rgba(255,255,255,.05)', border: '1px solid var(--line)', borderRadius: 8, color: '#fff', padding: '7px 10px' }} /> <span style={{ color: 'var(--muted)' }}>%</span>
        <button className="adm-gbtn" onClick={salvarTaxa}>Salvar</button>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>desconta do líquido antes da comissão · faixas: 1=3% · 2–4=5% · 5–9=7% · 10+=10%</span>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <button className={`adm-gbtn ${aba === 'ranking' ? 'on' : ''}`} style={aba === 'ranking' ? { borderColor: 'var(--pink-bright)', color: '#fff' } : undefined} onClick={() => setAba('ranking')}>Ranking</button>
        <button className={`adm-gbtn ${aba === 'extrato' ? 'on' : ''}`} style={aba === 'extrato' ? { borderColor: 'var(--pink-bright)', color: '#fff' } : undefined} onClick={() => setAba('extrato')}>Extrato global</button>
      </div>

      {aba === 'ranking' && (
        <div className="adm-list">
          {r.indicadores.length === 0 && <p className="adm-empty">Nenhum indicador ainda.</p>}
          {r.indicadores.map(i => (
            <div key={i.userId} className="adm-orow">
              <div><b>{i.name || i.email}</b><div className="adm-usub">{i.email} · {i.ativos} ativos · faixa {i.pct}%</div></div>
              <div style={{ textAlign: 'right', display: 'flex', gap: 12, alignItems: 'center' }}>
                <div><div style={{ fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#2BFFC6' }}>{brl2(i.saldoCents)}</div><div className="adm-usub">ganho {brl2(i.ganhoCents)}</div></div>
                <button className="adm-gbtn" onClick={() => { setAj(i); setValor(''); setMotivo('') }}>Ajustar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {aba === 'extrato' && (
        <div className="adm-list">
          {r.transacoes.length === 0 && <p className="adm-empty">Sem transações.</p>}
          {r.transacoes.map(t => (
            <div key={t.id} className="adm-orow">
              <div><b>{t.email}</b><div className="adm-usub">{new Date(t.created_at).toLocaleDateString('pt-BR')} · {t.tipo} · {t.descricao}</div></div>
              <b style={{ fontFamily: 'JetBrains Mono', color: t.valor_cents >= 0 ? '#2BFFC6' : 'var(--red)' }}>{t.valor_cents >= 0 ? '+' : '-'}{brl2(Math.abs(t.valor_cents))}</b>
            </div>
          ))}
        </div>
      )}

      {aj && (
        <div className="modal" onClick={e => { if (e.target === e.currentTarget) setAj(null) }}>
          <div className="sheet"><div className="grabber" />
            <h3>Ajustar créditos — {aj.name || aj.email}</h3>
            <p className="foot-note" style={{ marginTop: 4 }}>Valor positivo credita, negativo debita (ex.: -10 tira R$10).</p>
            <div className="field"><label>Valor R$</label><input inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} placeholder="ex: 25 ou -10" /></div>
            <div className="field"><label>Motivo</label><input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="ex: bônus de campanha" /></div>
            <div className="grid2" style={{ marginTop: 16 }}><button className="btn ghost" onClick={() => setAj(null)}>Cancelar</button><button className="btn" disabled={busy} onClick={salvarAjuste}>Salvar ajuste</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
