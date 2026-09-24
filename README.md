# Tiger Labs

Plataforma de análise de criptoativos: análise técnica, scanners, position trading, pools e DeFi — agora com o **Tiger Invest integrado**: Minha Carteira, Pulso do Mercado, Radar, BTC Lab, Índice Tiger 100, Ideias de Pools, Perps (Ondo), planos pagos por PIX (Mercado Pago) e programa de indicação.
Stack: **Next.js 14 (App Router) + TypeScript + Tailwind**, **Supabase** (login, banco, chat em tempo real) e **Vercel** (hospedagem + agendamento). Um só login, um só banco, um só site.

---

## Passo a passo para colocar no ar (cerca de 20 minutos)

### 1. Supabase (banco de dados e login)
1. Crie uma conta em https://supabase.com, clique em **New project** e escolha a região **South America (São Paulo)**.
2. Abra **SQL Editor > New query**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Em **Project Settings > API**, copie:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` (secreta) → `SUPABASE_SERVICE_ROLE_KEY`
4. Em **Authentication > URL Configuration**, preencha **Site URL** com o seu domínio (ex.: `https://tigerlabs.com.br`) e adicione em **Redirect URLs**: `https://SEU-DOMINIO/auth/callback`.

### 2. GitHub
1. Crie um repositório vazio (ex.: `tiger-labs`), **privado**.
2. Na pasta do projeto:
   ```bash
   git init
   git add .
   git commit -m "Tiger Labs"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/tiger-labs.git
   git push -u origin main
   ```
   Sem terminal? Use **Add file > Upload files** no GitHub e arraste todo o conteúdo da pasta (menos `node_modules` e `.next`).

### 3. Vercel
1. Em https://vercel.com clique em **Add New > Project** e importe o repositório.
2. Em **Environment Variables**, cadastre as variáveis de `.env.example`:
   - obrigatórias: as 3 do Supabase, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`, `ADMIN_EMAILS`;
   - planos/PIX: `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_ACCOUNT_LABEL` e `ENFORCE_PLANS`;
   - opcionais: `NEXT_PUBLIC_REQUIRE_LOGIN`, `FINNHUB_API_KEY` (ações na carteira), `COINGECKO_API_KEY`, `RPC_*`.
3. Clique em **Deploy**. O `vercel.json` já coloca as funções em São Paulo (`gru1`) e cria 3 agendamentos diários: scanners de mercado, position trading e o `/api/cron/daily` (foto diária da carteira e das pools, índice Tiger 100 e alertas das pools vigiadas).
4. Para usar seu domínio: **Settings > Domains**.

### 4. Virar administrador
1. Acesse o site, clique no ícone da conta e crie seu cadastro.
2. No Supabase (SQL Editor), rode trocando o e-mail:
   ```sql
   update public.profiles set role = 'admin', is_subscriber = true where email = 'seu@email.com';
   ```
3. Coloque o mesmo e-mail em `ADMIN_EMAILS` na Vercel.
4. Entre em `/admin` para cadastrar pools, relatórios, tutoriais, dados da empresa, redes sociais e responder o chat, e em `/admin/assinaturas` para planos e assinantes.

> **Já usava o Tiger Invest em outro projeto Supabase?** O `schema.sql` cria todas as tabelas dele aqui (carteira, pools, perps, planos, indicações). Para migrar os dados, exporte cada tabela do projeto antigo em CSV (Table Editor → Export) e importe no novo. Os usuários precisam existir no novo projeto (mesmo `id`), então o caminho mais simples é usar o projeto Supabase do Tiger Invest como banco do Tiger Labs: rode o `schema.sql` nele (é idempotente e não apaga nada).

### 5. Planos e PIX (Mercado Pago)
1. Em https://www.mercadopago.com.br/developers/panel/app crie uma aplicação e copie o **Access Token de produção** → `MP_ACCESS_TOKEN`.
2. Em **Webhooks**, cadastre a URL `https://SEU-DOMINIO/api/mercadopago/webhook`, marque o evento **Pagamentos** e copie a **assinatura secreta** → `MP_WEBHOOK_SECRET`.
3. Enquanto testa, deixe `ENFORCE_PLANS=false` (tudo liberado para quem tem login). Quando quiser cobrar, troque para `true` e faça um novo deploy.
4. Os planos (START, PRO, ALPHA), preços, benefícios e a taxa do Mercado Pago usada nas comissões são editados em **/admin/assinaturas**. Lá você também vê pedidos, ativa plano manualmente e ajusta créditos.
5. O que cada plano libera: START = Minha Carteira, Tiger 100, Ideias de Pools e conteúdo exclusivo do Labs; PRO = + Pulso, Radar, BTC Lab e Perps; ALPHA = + fluxo de caixa completo e pools avançadas. Admin e quem estiver com `is_subscriber = true` no perfil têm tudo.

### 6. Indicações
Cada usuário tem um código em **/indicacoes**. O link `https://SEU-DOMINIO/assinar?ref=CODIGO` (ou `/login?ref=CODIGO`) registra quem indicou já no cadastro. A cada pagamento do indicado, o padrinho ganha de 3% a 10% do valor líquido em créditos (conforme quantos indicados ativos tem), que podem pagar a própria assinatura.

### 7. (Opcional) Scanners a cada 15 minutos
O plano gratuito da Vercel roda o agendamento só 1x por dia. Os scanners também se atualizam sozinhos quando alguém abre a página e o cache venceu (15 min). Para manter sempre pronto:
1. Supabase > **Database > Extensions**: ative `pg_cron` e `pg_net`.
2. Edite `supabase/cron.sql` (domínio e `CRON_SECRET`) e rode no SQL Editor.

---

## Subir por cima do Tiger Invest (mesmo Supabase, GitHub e Vercel)
1. **Backup**: Supabase → Database → Backups (ou exporte as tabelas em CSV).
2. **Supabase**: rode o `supabase/schema.sql` no SQL Editor. Ele só cria o que falta; carteiras, assinaturas, indicações e usuários continuam.
   Em **Authentication → URL Configuration → Redirect URLs** adicione `https://SEU-DOMINIO/auth/callback`.
3. **GitHub**: numa branch nova (`tiger-labs`), apague o código antigo e coloque o deste projeto. Faça push.
4. **Vercel**: a branch gera um link de Preview. Em Settings → Environment Variables, deixe as variáveis valendo também para **Preview** e adicione `NEXT_PUBLIC_SITE_URL` e `CRON_SECRET` se ainda não existirem. Teste o Preview.
5. Tudo certo? Faça merge da branch na `main`. O domínio atual passa a abrir o Tiger Labs; `/dashboard` redireciona para `/invest` (o app instalado no celular continua funcionando).
6. Em `/admin/assinaturas`, revise o texto dos planos (os planos antigos são mantidos como estavam).

## Rodar localmente
```bash
cp .env.example .env.local   # preencha as chaves
npm install
npm run dev                  # http://localhost:3000
npm run test:engine          # testes do motor de indicadores
```

## Páginas
| Rota | O que faz |
|---|---|
| `/` | Análise técnica por token e período (15m a 1M), score, trade sugerido, 15+ indicadores, força do sinal e faixas de pool |
| `/reversals` · `/rsi` · `/support-resistance` | Scanners de 130+ tokens no 4h |
| `/position-trading` · `/history` · `/opportunities` | Score de ciclo 0-100, histórico diário de 4 anos (CSV) e ranking |
| `/pools` | Pools sugeridas com status da faixa ao vivo |
| `/weekly-reports` | Relatórios em Markdown |
| `/defi/dashboard` | Estratégia 1% (editável no admin) |
| `/defi/stablecoin-pools` · `/defi/token-pools` | Explorador de pools (DeFiLlama) |
| `/defi/wallet-tracker` · `/defi/pools-tracker` | Saldos, Aave e Uniswap V3 on-chain em 6 redes |
| `/tutorials` · `/indicators` | Vídeos com progresso e guia completo dos indicadores |
| `/join` | Captura de leads ("Quero entrar no Labs agora") |
| `/invest` | **Minha Carteira**: cripto, ações, caixa, pools, perps (Ondo), aportes, metas, alertas e níveis (app completo do Tiger Invest; instalável no celular) |
| `/mercado/pulso` | Termômetro de ciclo, Fear & Greed, dominância, hype, narrativas, TVL por rede e stablecoins |
| `/mercado/radar` | Top 10, altcoins e memes com leitura estrutural (tendência, suportes, resistências, gatilhos) |
| `/mercado/btc-lab` | Múltiplo de Mayer, halving, taxas, mempool, hashrate e dificuldade |
| `/mercado/tiger-100` | Índice das 100 maiores + comparador (cripto x NASDAQ x S&P 500 x ouro) |
| `/defi/ideias-de-pools` | Pools V3 ranqueadas pela Nota de Yield, watchlist com alertas e calculadora de IL |
| `/planos` · `/assinar` | Planos e checkout PIX (Mercado Pago) |
| `/indicacoes` | Link de indicação, comissões e créditos |
| `/termos` · `/redefinir` | Termos (LGPD) e redefinição de senha |
| `/admin` | Painel administrativo (conteúdo do Labs) |
| `/admin/assinaturas` | Assinantes, pedidos, planos, créditos e taxa do Mercado Pago |

## Fontes de dados (sem custo)
- **Binance** (`data-api.binance.vision`): candles e preços.
- **CoinGecko**: market cap e ranking (chave Demo opcional em `COINGECKO_API_KEY`).
- **DeFiLlama**: TVL e APY das pools.
- **RPCs públicos (publicnode)**: carteiras, Aave e Uniswap V3. Para mais velocidade, use RPCs próprios (`RPC_*`).
- **mempool.space**, **alternative.me** (Fear & Greed), **DeFiLlama Yields/Stablecoins**, **GeckoTerminal**, **stooq** (índices e ouro), **Ondo Perps** e **Finnhub** (ações, chave grátis).

## Personalização
- Cores: `src/app/globals.css` (variáveis `--neon`, `--lime`, etc.).
- Logo: `src/components/logo.tsx` e `src/app/icon.svg`.
- Tokens dos scanners: `SCAN_TOKENS` em `src/lib/site.ts`.
- Pesos e regras de pontuação: `src/lib/market/analysis.ts` e `src/lib/market/position.ts`.
- Idiomas do menu: `src/lib/i18n.ts`.

> Conteúdo educacional. Não é recomendação de investimento.
