-- ============================================================
-- Tiger Invest — schema Supabase (rode no SQL Editor do projeto)
-- ============================================================
create table if not exists public.holdings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null default 'crypto',   -- crypto | stock | cash | pool
  name          text not null,
  symbol        text not null default '',
  cg_id         text default '',                  -- id CoinGecko p/ cotacao ao vivo
  qty           double precision not null default 0,
  price         double precision not null default 0,
  invested      double precision not null default 0,
  current_value double precision,                 -- usado em caixa/pool
  meta_pct      double precision not null default 0,
  color         text default '#A855F7',
  sort          int default 0,
  created_at    timestamptz default now()
);
alter table public.holdings enable row level security;
drop policy if exists "own_holdings" on public.holdings;
create policy "own_holdings" on public.holdings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.flows (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,                       -- in | out
  amount     double precision not null,
  note       text default '',
  created_at timestamptz default now()
);
alter table public.flows enable row level security;
drop policy if exists "own_flows" on public.flows;
create policy "own_flows" on public.flows
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists holdings_user_idx on public.holdings(user_id);
create index if not exists flows_user_idx on public.flows(user_id);
