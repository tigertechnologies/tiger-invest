-- ============================================================
-- Tiger Invest v8 — Planos editáveis (painel admin)
-- Rode no SQL Editor do Supabase (depois da v7).
-- ============================================================

create table if not exists public.plans (
  id           text primary key,          -- start | pro | alpha
  name         text not null,
  price_cents  int  not null,
  tag          text default '',
  features     jsonb not null default '[]'::jsonb,
  popular      boolean default false,
  sort         int default 0,
  active       boolean default true,
  updated_at   timestamptz default now()
);

alter table public.plans enable row level security;

-- Qualquer visitante pode ler os planos (landing/checkout).
drop policy if exists "plans_public_read" on public.plans;
create policy "plans_public_read" on public.plans for select using (true);
-- Escrita só via service_role (painel admin) — que ignora RLS. Sem policy de write.

-- Seed com os valores atuais (só insere se ainda não existir).
insert into public.plans (id, name, price_cents, tag, features, popular, sort, active) values
  ('start', 'TIGER START', 599, 'O começo do controle',
    '["Carteira completa: cripto, ações, caixa e pools","Custo médio automático por transação","Cotação de cripto ao vivo","Alocação, blocos por nicho e metas","Patrimônio e resultado em tempo real"]'::jsonb,
    false, 1, true),
  ('pro', 'TIGER PRO', 999, 'Análise e radar',
    '["Tudo do START, e mais:","Análise técnica estrutural (suporte, resistência e gatilhos)","Bull Market Support Band + RSI + tendência","Radar de mercado: top, altcoins, memes e pools","Níveis personalizados por ativo","Alertas inteligentes"]'::jsonb,
    true, 2, true),
  ('alpha', 'TIGER ALPHA', 1999, 'O predador completo',
    '["Tudo do PRO, e mais:","Fluxo de caixa completo (P/L por período)","Controle avançado de pools com tração ao vivo","Prioridade em novos recursos"]'::jsonb,
    false, 3, true)
on conflict (id) do nothing;
