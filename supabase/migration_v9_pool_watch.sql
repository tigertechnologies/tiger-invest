-- ============================================================
-- Tiger Invest v9 — Watchlist de pools (sincronizada entre aparelhos)
-- Rode no SQL Editor do projeto Supabase.
-- Seguro rodar mais de uma vez (tudo com IF NOT EXISTS / DROP POLICY).
-- ============================================================

create table if not exists public.pool_watch (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  pool_key   text not null,                 -- identificador do par vigiado: "NOME|rede" (ex: "ETH / USDC|base")
  name       text default '',               -- nome do par (ex: "ETH / USDC")
  network    text default '',               -- rede (ex: base, eth, arbitrum)
  dex        text default '',               -- DEX (ex: Uniswap V3, Aerodrome)
  added_at   timestamptz default now(),
  unique (user_id, pool_key)                -- 1 registro por par por usuário (habilita upsert)
);

alter table public.pool_watch enable row level security;

drop policy if exists "own_pool_watch" on public.pool_watch;
create policy "own_pool_watch" on public.pool_watch
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists pool_watch_user_idx on public.pool_watch(user_id);
