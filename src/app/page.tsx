'use client'
import { useState } from 'react'
import Link from 'next/link'
import Background from '@/components/Background'
import { PLANS } from '@/lib/plans'

const Mark = () => (
  <div className="mark" aria-hidden><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 5.3L20 8l-4 4 1 6-5-3-5 3 1-6-4-4 5.6-.7L12 2z" /></svg></div>
)

export default function Landing() {
  const [annual, setAnnual] = useState(false)
  const priceOf = (p: number) => annual ? `R$ ${(p * 12).toFixed(2).replace('.', ',')}` : `R$ ${p.toFixed(2).replace('.', ',')}`

  const features = [
    { ic: '📊', h: 'Carteira inteligente', p: 'Cripto, ações, caixa e pools num só lugar. Custo médio automático por transação, patrimônio e resultado ao vivo.' },
    { ic: '🎯', h: 'Análise estrutural', p: 'Suporte, resistência e gatilhos por price action real — leitura de ciclo (BMSB), tendência e RSI para decidir com segurança.' },
    { ic: '🛰️', h: 'Radar de mercado', p: 'Top cryptos, altcoins, memecoins e pools que estão performando, com volume e variação. Seu cardápio para a próxima entrada.' },
    { ic: '💧', h: 'Controle de pools', p: 'Acompanhe cada pool de liquidez, com termômetro de range, alerta antes de sair da faixa e estatísticas de tração.' },
    { ic: '💰', h: 'Fluxo de caixa', p: 'Aportes, retiradas, distribuição do capital e P/L por período (em % e R$). O coração da sua operação, organizado.' },
    { ic: '🔔', h: 'Alertas inteligentes', p: 'Avisos automáticos quando o preço bate no seu nível, alvo ou stop, ou quando uma pool sai do range.' },
  ]

  return (
    <>
      <Background />
      <nav className="lp-nav">
        <div className="lp">
          <div className="lp-brand"><Mark /><b>Tiger Invest</b></div>
          <div className="lp-navlinks">
            <a className="lp-link" href="#recursos">Recursos</a>
            <a className="lp-link" href="#planos">Planos</a>
            <Link className="lp-link" href="/login">Entrar</Link>
            <a className="lp-btn primary" href="#planos">Assinar</a>
          </div>
        </div>
      </nav>

      <header className="lp-hero lp">
        <span className="lp-badge">Cripto · DeFi · Ações</span>
        <h1 className="lp-h1">Desbloqueie seu potencial no mercado <span className="grad">cripto e DeFi</span></h1>
        <p className="lp-sub">A plataforma de controle e análise que organiza toda a sua operação — carteira, pools, radar de mercado e sinais técnicos profissionais — para você investir com clareza e proteção.</p>
        <div className="lp-cta">
          <a className="lp-btn primary" href="#planos">Ver planos →</a>
          <Link className="lp-btn ghost" href="/login">Já sou assinante</Link>
        </div>
        <p className="lp-note">Sem custódia de valores · seus dados protegidos (LGPD) · cancele quando quiser</p>

        <div className="lp-stats">
          <div className="lp-stat"><b>Ao vivo</b><span>Cotações e sinais atualizados</span></div>
          <div className="lp-stat"><b>Price action</b><span>Suporte, resistência e gatilhos</span></div>
          <div className="lp-stat"><b>DeFi</b><span>Controle total de pools</span></div>
        </div>
      </header>

      <section className="lp-section lp" id="recursos">
        <div className="lp-eyebrow">Recursos</div>
        <h2 className="lp-h2">Tudo o que um investidor de cripto precisa</h2>
        <p className="lp-lead">Ferramentas de nível profissional, numa interface simples e direta.</p>
        <div className="lp-grid">
          {features.map((f, i) => (
            <div className="lp-card" key={i}>
              <div className="lp-ic">{f.ic}</div>
              <h3>{f.h}</h3>
              <p>{f.p}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section lp" id="planos">
        <div className="lp-eyebrow">Planos</div>
        <h2 className="lp-h2">Escolha o seu módulo</h2>
        <p className="lp-lead">Comece pelo essencial e evolua conforme sua operação cresce. Pagamento via PIX.</p>
        <div className="lp-toggle">
          <div className="lp-toggle-inner">
            <button className={!annual ? 'on' : ''} onClick={() => setAnnual(false)}>Mensal</button>
            <button className={annual ? 'on' : ''} onClick={() => setAnnual(true)}>Anual (12 meses)</button>
          </div>
        </div>
        <div className="lp-plans">
          {PLANS.map(p => (
            <div className={`lp-plan ${p.popular ? 'pop' : ''}`} key={p.id}>
              {p.popular && <span className="lp-pop-tag">MAIS ESCOLHIDO</span>}
              <h3>{p.name}</h3>
              <div className="tag">{p.tag}</div>
              <div className="lp-price"><span className="val">{priceOf(p.price)}</span><span className="per">{annual ? '/ano' : '/mês'}</span></div>
              <ul className="lp-feats">
                {p.features.map((f, i) => (<li key={i} className={f.endsWith(':') ? 'head' : ''}>{f}</li>))}
              </ul>
              <Link className={`lp-btn ${p.popular ? 'primary' : 'ghost'}`} href={`/assinar?plano=${p.id}&ciclo=${annual ? 'anual' : 'mensal'}`}>Assinar {p.name.replace('TIGER ', '')}</Link>
            </div>
          ))}
        </div>

        <div className="lp-legal">
          <b>⚖️ Aviso legal importante</b>
          <p>A Tiger Invest é uma <strong>plataforma de tecnologia</strong> para organização e análise de dados de mercado. <strong>Não somos uma instituição financeira nem uma plataforma de investimentos.</strong> Não custodiamos valores, não oferecemos produtos financeiros regulados e não prometemos lucros ou rentabilidade. Todas as decisões de investimento são de responsabilidade exclusiva do usuário e envolvem risco de perda. <Link href="/termos">Leia os termos completos e a política de privacidade →</Link></p>
        </div>
      </section>

      <footer className="lp-foot">
        <div style={{ marginBottom: 10 }}>
          <Link href="/termos">Termos & LGPD</Link>·
          <Link href="/login">Entrar</Link>·
          <a href="#planos">Assinar</a>
        </div>
        <div>Tiger Invest · uma solução Tiger Technologies · © {new Date().getFullYear()}</div>
        <div style={{ marginTop: 8, color: 'var(--faint)', fontSize: 11.5, maxWidth: 560, margin: '8px auto 0' }}>Não é recomendação de investimento. Todo e qualquer investimento é por conta e risco do usuário — estude os ativos antes de aplicar seu capital.</div>
      </footer>
    </>
  )
}
