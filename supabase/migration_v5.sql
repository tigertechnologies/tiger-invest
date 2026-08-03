-- ============================================================
-- Tiger Invest v5 (Fase 2) — Fluxo de Caixa + tração de Pools
-- Rode no SQL Editor.
-- ============================================================
-- data do movimento (p/ dias/meses/anos e edição)
alter table public.flows add column if not exists move_date date not null default now();
-- endereço da pool p/ estatísticas ao vivo (GeckoTerminal) — opcional
alter table public.pools add column if not exists pool_address text default '';
alter table public.pools add column if not exists network text default 'base';
