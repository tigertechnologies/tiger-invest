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
