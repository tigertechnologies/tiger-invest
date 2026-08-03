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
