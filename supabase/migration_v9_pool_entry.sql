-- Tiger Invest v9 — preço de entrada da pool (para estimar IL)
alter table public.pools add column if not exists entry_price numeric not null default 0;
