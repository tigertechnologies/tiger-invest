# 🐯 Tiger Invest

Controle profissional de ativos (cripto, ações, caixa e pools de liquidez).
Stack: **Next.js 14 (App Router) · TypeScript · Supabase (Auth + Postgres + RLS) · Vercel**.
Cotação de cripto **ao vivo** via CoinGecko. Visual pink/black neon.

---

## 1. Supabase (banco + login)

1. No projeto Supabase, abra **SQL Editor** e rode o conteúdo de `supabase/schema.sql`.
   Cria as tabelas `holdings` e `flows` com **RLS** (cada usuário só vê os próprios dados).
2. **Authentication → Providers → Email**: deixe habilitado.
   Para testar rápido, em **Authentication → Sign In / Providers**, desative "Confirm email"
   (assim o cadastro já entra sem confirmar o e-mail).
3. Em **Project Settings → API**, copie:
   - `Project URL`  → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public`  → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2. GitHub

```bash
git init
git add .
git commit -m "Tiger Invest — MVP"
git branch -M main
git remote add origin https://github.com/tigertechnologies/tiger-invest.git
git push -u origin main
```

## 3. Vercel

1. **Add New → Project** → importe o repo `tiger-invest`.
2. Framework: Next.js (detectado sozinho).
3. **Environment Variables** — adicione as duas:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **Deploy**. Pronto — cada `git push` re-deploya.

## Rodar localmente

```bash
cp .env.example .env.local   # preencha as 2 variáveis
npm install
npm run dev                  # http://localhost:3000
```

---

## Como funciona

- **Primeiro login** → o app popula automaticamente a carteira com os dados da BLADE
  (ETH, BTC, SOL, altcoins, SPY, caixa, pool). Depois é tudo editável.
- **Cotação ao vivo**: cripto atualiza sozinha a cada 60s (CoinGecko, campo `cg_id`).
  Ações/caixa/pool você atualiza manual (toque no ativo).
- **RLS**: cada conta enxerga só a própria carteira.
- Telas: **Início** (patrimônio + alocação), **Carteira** (editar/add/excluir),
  **Pools**, **Aportes** (registrar movimentos), **Metas** (meta vs. real).

## Próximos passos sugeridos
- Cotação de ações (ex.: Alpha Vantage / Finnhub) para o SPY.
- Persistir preço ao vivo no banco (histórico).
- Detalhes da pool (taxas/APR/range) no banco em vez de constante.
- PWA (instalar como app no celular) + push de alertas de meta.

> Ferramenta de controle pessoal — não é recomendação de investimento.
