-- ============================================================
-- Tiger Invest v10 — Histórico de patrimônio (snapshots diários)
-- Rode no SQL Editor do projeto Supabase. Seguro rodar mais de uma vez.
-- Guarda 1 registro por dia por usuário; habilita resultado real de 1/7/30 dias.
-- ============================================================

create table if not exists public.portfolio_snapshot (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  snap_date      date not null,                 -- dia do registro (1 por dia)
  patrimonio_usd numeric not null default 0,    -- valor total da carteira em USD
  custo_usd      numeric not null default 0,    -- capital investido (custo) em USD
  brl_rate       numeric not null default 0,    -- cotação USD->BRL usada no dia
  created_at     timestamptz default now(),
  unique (user_id, snap_date)                   -- upsert por dia
);

alter table public.portfolio_snapshot enable row level security;

drop policy if exists "own_portfolio_snapshot" on public.portfolio_snapshot;
create policy "own_portfolio_snapshot" on public.portfolio_snapshot
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists portfolio_snapshot_user_date_idx
  on public.portfolio_snapshot(user_id, snap_date);
