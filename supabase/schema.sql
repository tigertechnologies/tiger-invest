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
-- ============================================================
-- Tiger Invest v2 — ledger de compras (rode no SQL Editor)
-- ============================================================
create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  symbol      text not null,
  name        text not null default '',
  cg_id       text default '',
  color       text default '#A855F7',
  rede        text default '',           -- ex: BASE, BGX
  corretora   text default '',           -- ex: BYbit, PHTM
  carteira    text default '',           -- ex: METAMASK, TRADE
  buy_date    date not null default now(),
  qty         double precision not null default 0,
  buy_price   double precision not null default 0,  -- U$ na compra
  stop_limit  double precision default 0,
  target      double precision default 0,
  meta_pct    double precision not null default 0,
  created_at  timestamptz default now()
);
alter table public.transactions enable row level security;
drop policy if exists "own_tx" on public.transactions;
create policy "own_tx" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists tx_user_idx on public.transactions(user_id);
create index if not exists tx_symbol_idx on public.transactions(symbol);
-- ============================================================
-- Tiger Invest v3 — flag de seed único + sinais (rode no SQL Editor)
-- Corrige o bug de reaparecer/apagar dados: o app só semeia UMA vez.
-- ============================================================
create table if not exists public.app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seeded  boolean not null default false
);
alter table public.app_state enable row level security;
drop policy if exists "own_state" on public.app_state;
create policy "own_state" on public.app_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
