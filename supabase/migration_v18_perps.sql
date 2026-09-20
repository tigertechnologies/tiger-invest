-- ============================================================
-- Tiger Invest v18 — Perps (Ondo Perps): posições long/short alavancadas
-- Rode no SQL Editor do projeto Supabase.
-- Seguro rodar mais de uma vez (IF NOT EXISTS / DROP POLICY).
--
-- Modelo: uma "conta" de perps por usuário (colateral/equity depositado na
-- Ondo, em USDC) + N posições. O tracking ao vivo puxa o mark price público
-- da Ondo (/api/perps) e recalcula uPnL, margin ratio e preço de liquidação.
-- Nada de credencial de trade é guardado — a execução acontece na Ondo.
-- ============================================================

-- Conta de perps (1 linha por usuário) --------------------------------------
create table if not exists public.perps_account (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  collateral  numeric not null default 0,   -- colateral/equity em USDC depositado na Ondo (cross margin)
  updated_at  timestamptz default now()
);

alter table public.perps_account enable row level security;

drop policy if exists "own_perps_account" on public.perps_account;
create policy "own_perps_account" on public.perps_account
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Posições de perps ---------------------------------------------------------
create table if not exists public.perps_positions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  market        text not null,                 -- ex: CRCL-USD.P
  symbol        text not null,                 -- ex: CRCL
  name          text default '',               -- ex: Circle
  side          text not null default 'long',  -- 'long' | 'short'
  leverage      integer not null default 1,    -- 1..maxLev do mercado
  size          numeric not null default 0,    -- quantidade (contratos) — ex: 1.1
  entry_price   numeric not null default 0,    -- preço de entrada em USD
  margin        numeric not null default 0,    -- margem inicial alocada (USDC) = notional/leverage
  opened_at     date not null default current_date,
  status        text not null default 'open',  -- 'open' | 'closed'
  close_price   numeric,                        -- preço de fechamento (quando encerrada)
  closed_at     date,
  realized_pnl  numeric,                        -- PnL realizado no fechamento (líquido, informativo)
  note          text default '',
  created_at    timestamptz default now()
);

alter table public.perps_positions enable row level security;

drop policy if exists "own_perps_positions" on public.perps_positions;
create policy "own_perps_positions" on public.perps_positions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists perps_positions_user_status_idx
  on public.perps_positions(user_id, status);
