-- ============================================================
-- Tiger Invest v11 — Alertas de pool em segundo plano
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.
-- O cron diário grava aqui quando uma pool VIGIADA entra em bom momento.
-- ============================================================

create table if not exists public.pool_alert (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  pool_key   text not null,                 -- "NOME|rede" (mesmo formato da watchlist)
  alert_date date not null default current_date,
  name       text default '',
  network    text default '',
  dex        text default '',
  grade      text default '',               -- Nota de Yield no momento (A/B/C/D)
  net_apr    numeric default 0,             -- APR líquido no momento
  message    text default '',
  seen       boolean default false,
  created_at timestamptz default now(),
  unique (user_id, pool_key, alert_date)    -- no máximo 1 alerta por pool por dia
);

alter table public.pool_alert enable row level security;

drop policy if exists "own_pool_alert" on public.pool_alert;
create policy "own_pool_alert" on public.pool_alert
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists pool_alert_user_seen_idx on public.pool_alert(user_id, seen);
