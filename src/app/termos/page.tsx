import Link from 'next/link'
import Background from '@/components/Background'

export const metadata = { title: 'Termos & Privacidade · Tiger Invest' }

export default function Termos() {
  return (
    <>
      <Background />
      <div className="tm">
        <Link className="lp-link" href="/" style={{ display: 'inline-block', marginBottom: 20 }}>← Voltar</Link>
        <h1>Termos de Uso e Política de Privacidade</h1>
        <div className="upd">Tiger Invest · uma solução Tiger Technologies</div>

        <div className="warn">
          <p><strong>Aviso legal essencial:</strong> A Tiger Invest é uma <strong>plataforma de tecnologia</strong> destinada à organização, acompanhamento e análise de dados do mercado de criptoativos, DeFi e ativos financeiros. <strong>NÃO somos uma instituição financeira, corretora, distribuidora de valores mobiliários nem plataforma de investimentos.</strong> Não custodiamos, guardamos ou movimentamos valores ou ativos dos usuários; não oferecemos produtos financeiros regulados; e <strong>não prometemos, garantimos ou sugerimos qualquer lucro ou rentabilidade.</strong></p>
        </div>

        <h2>1. Natureza do serviço</h2>
        <p>A Tiger Invest presta exclusivamente serviços de tecnologia (software como serviço). Nosso objetivo é ajudar o usuário a desbloquear seu potencial no mercado cripto e DeFi por meio de ferramentas de controle de carteira, análise técnica, radar de mercado e organização de dados. Todas as informações e análises exibidas têm caráter meramente informativo e educacional.</p>

        <h2>2. Não é recomendação de investimento</h2>
        <p>Nenhum conteúdo, sinal, indicador, veredito, nível ou análise apresentado na plataforma constitui recomendação, aconselhamento, oferta ou solicitação de compra ou venda de qualquer ativo. As decisões de investimento são de responsabilidade única e exclusiva do usuário. Investimentos em criptoativos e no mercado financeiro envolvem <strong>risco elevado, inclusive de perda total do capital</strong>. Rentabilidade passada não representa garantia de rentabilidade futura.</p>

        <h2>3. Isenção de responsabilidade</h2>
        <p>A Tiger Invest e a Tiger Technologies não se responsabilizam por perdas, prejuízos, lucros cessantes ou quaisquer danos decorrentes de decisões de investimento tomadas pelo usuário, de falhas, atrasos ou imprecisões nos dados fornecidos por terceiros (como CoinGecko, GeckoTerminal e provedores de cotação), ou da indisponibilidade temporária do serviço. Os dados podem conter atrasos e imprecisões. O usuário deve sempre estudar os ativos e, se necessário, consultar um profissional habilitado antes de investir.</p>

        <h2>4. Cadastro e assinatura</h2>
        <p>Para utilizar os módulos pagos, o usuário realiza cadastro com nome completo, e-mail, cidade e estado, e confirma seu e-mail. A assinatura é feita por PIX (mensal ou recorrente de 12 meses). O usuário pode cancelar a qualquer momento, cessando as cobranças futuras. Valores já pagos referentes ao período vigente não são reembolsáveis, salvo disposição legal em contrário.</p>

        <h2>5. Proteção de dados (LGPD)</h2>
        <p>Em conformidade com a Lei nº 13.709/2018 (LGPD), informamos:</p>
        <ul>
          <li><strong>Dados coletados:</strong> nome completo, e-mail, cidade, estado e os dados de carteira que você mesmo insere.</li>
          <li><strong>Finalidade:</strong> criar e manter sua conta, prestar o serviço contratado, processar a assinatura e enviar comunicações essenciais.</li>
          <li><strong>Base legal:</strong> execução de contrato e consentimento do titular.</li>
          <li><strong>Compartilhamento:</strong> não vendemos seus dados. Utilizamos provedores de infraestrutura (ex.: Supabase, Vercel) e de pagamento estritamente para operar o serviço.</li>
          <li><strong>Seus direitos:</strong> acesso, correção, exclusão, portabilidade e revogação do consentimento, mediante solicitação.</li>
          <li><strong>Segurança:</strong> seus dados de carteira são isolados por usuário (RLS) e acessíveis apenas por você.</li>
        </ul>

        <h2>6. Uso adequado</h2>
        <p>O usuário compromete-se a utilizar a plataforma de forma lícita, a não tentar burlar mecanismos de segurança e a manter a confidencialidade de suas credenciais. O uso indevido pode acarretar suspensão da conta.</p>

        <h2>7. Alterações</h2>
        <p>Estes termos podem ser atualizados a qualquer momento. Alterações relevantes serão comunicadas pelos canais oficiais. O uso continuado após a atualização implica concordância com os novos termos.</p>

        <p style={{ marginTop: 24, color: 'var(--faint)', fontSize: 12.5 }}>Ao criar uma conta e assinar, o usuário declara ter lido, compreendido e aceitado integralmente estes Termos de Uso e a Política de Privacidade.</p>
      </div>
    </>
  )
}
