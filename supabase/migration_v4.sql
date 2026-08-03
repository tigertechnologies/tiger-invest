-- ============================================================
-- Tiger Invest v4 — Pools de liquidez (rode no SQL Editor)
-- ============================================================
create table if not exists public.pools (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  par1          text not null default 'ETH',
  par1_cg_id    text default 'ethereum',   -- p/ detectar dentro/fora do range
  par2          text not null default 'USDC',
  dapp          text default 'Uniswap v3',
  rede          text default 'Base',
  link          text default '',
  aporte        double precision not null default 0,
  current_value double precision not null default 0,
  low_range     double precision default 0,
  high_range    double precision default 0,
  entry_date    date not null default now(),
  fees          double precision default 0,
  created_at    timestamptz default now()
);
alter table public.pools enable row level security;
drop policy if exists "own_pools" on public.pools;
create policy "own_pools" on public.pools
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists pools_user_idx on public.pools(user_id);
