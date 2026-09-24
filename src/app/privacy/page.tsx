import { LegalPage } from '@/components/legal';
export const metadata = { title: 'Política de Privacidade' };
export default function Page() {
  return (
    <LegalPage title="Política de Privacidade" updated="setembro de 2026">
      <p>Esta política explica como o Tiger Labs trata dados pessoais, nos termos da Lei nº 13.709/2018 (LGPD).</p>
      <h2>Dados que coletamos</h2>
      <ul>
        <li><b>Conta:</b> nome e e-mail informados no cadastro.</li>
        <li><b>Contato:</b> nome, e-mail, WhatsApp e interesse enviados no formulário &quot;Quero entrar no Labs&quot;.</li>
        <li><b>Uso da plataforma:</b> preferências (idioma e tema), progresso nos tutoriais, carteiras fixadas e mensagens do chat de suporte.</li>
        <li><b>Endereços de carteira</b> consultados: usados só para ler dados públicos da blockchain e, se você fixar, salvos na sua conta.</li>
      </ul>
      <h2>Finalidades e bases legais</h2>
      <ul>
        <li>Prestar o serviço e manter sua conta (execução de contrato, art. 7º, V).</li>
        <li>Responder contatos e enviar comunicações que você pediu (consentimento, art. 7º, I).</li>
        <li>Segurança e prevenção a fraudes (legítimo interesse, art. 7º, IX).</li>
      </ul>
      <h2>Compartilhamento</h2>
      <p>Usamos provedores de infraestrutura (Supabase para banco de dados e autenticação, Vercel para hospedagem). Não vendemos dados pessoais.</p>
      <h2>Seus direitos</h2>
      <p>Você pode pedir confirmação, acesso, correção, exclusão, portabilidade e revogação do consentimento (art. 18) pelo e-mail de contato no rodapé.</p>
      <h2>Retenção</h2>
      <p>Mantemos os dados enquanto a conta estiver ativa ou pelo prazo necessário para cumprir obrigações legais.</p>
    </LegalPage>
  );
}
