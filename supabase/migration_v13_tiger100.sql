-- ============================================================
-- Tiger Invest v13 — Histórico do índice Tiger 100 (compartilhado)
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.
-- É um índice GLOBAL (não por usuário): todos leem, só o cron (service role) grava.
-- ============================================================

create table if not exists public.tiger100_snapshot (
  snap_date   date primary key,
  level       numeric not null default 1000,   -- nível do índice (base 1000)
  ret24       numeric default 0,               -- retorno 24h do dia (%)
  mcap_total  numeric default 0,
  btc_dom     numeric default 0,
  breadth_up  int default 0,
  created_at  timestamptz default now()
);

alter table public.tiger100_snapshot enable row level security;

-- qualquer usuário logado pode LER o índice; ninguém insere (só o cron via service role)
drop policy if exists "read_tiger100" on public.tiger100_snapshot;
create policy "read_tiger100" on public.tiger100_snapshot
  for select using (auth.role() = 'authenticated');
