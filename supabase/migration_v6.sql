-- ============================================================
-- Tiger Invest v6 (Fase B) — níveis personalizados por ativo
-- Rode no SQL Editor.
-- ============================================================
create table if not exists public.levels (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  symbol     text not null,          -- ex: BTC (liga ao ativo)
  kind       text not null,          -- 'support' | 'resistance'
  price      double precision not null,
  note       text default '',
  created_at timestamptz default now()
);
alter table public.levels enable row level security;
drop policy if exists "own_levels" on public.levels;
create policy "own_levels" on public.levels
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists levels_user_idx on public.levels(user_id);
create index if not exists levels_symbol_idx on public.levels(symbol);
