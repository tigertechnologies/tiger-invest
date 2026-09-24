-- =====================================================================
-- TIGER LABS — Schema do Supabase
-- Cole TODO este arquivo em: Supabase > SQL Editor > New query > Run
-- Pode ser executado mais de uma vez sem erro.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- PERFIS (1 por usuário do Auth)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  role text not null default 'user' check (role in ('user','admin')),
  is_subscriber boolean not null default false,
  language text not null default 'pt',
  theme text not null default 'dark',
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_subscriber()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and (is_subscriber or role = 'admin'));
$$;

-- cria o perfil automaticamente no cadastro
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- impede que o próprio usuário se promova a admin/assinante
create or replace function public.protect_profile_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- só trava pedidos feitos por um usuário logado comum (SQL Editor e service_role passam)
  if auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
    new.is_subscriber := old.is_subscriber;
  end if;
  return new;
end $$;

drop trigger if exists protect_profile on public.profiles;
create trigger protect_profile before update on public.profiles
  for each row execute function public.protect_profile_fields();

alter table public.profiles enable row level security;
drop policy if exists "perfil: ler o próprio ou admin" on public.profiles;
create policy "perfil: ler o próprio ou admin" on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists "perfil: editar o próprio ou admin" on public.profiles;
create policy "perfil: editar o próprio ou admin" on public.profiles for update using (id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
-- CACHE DOS SCANNERS (escrito só pelo servidor com a service role)
-- ---------------------------------------------------------------------
create table if not exists public.scanner_cache (
  key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.scanner_cache enable row level security;
drop policy if exists "cache: leitura pública" on public.scanner_cache;
create policy "cache: leitura pública" on public.scanner_cache for select using (true);

-- ---------------------------------------------------------------------
-- CONFIGURAÇÕES DO SITE (dashboard DeFi, rodapé, redes sociais)
-- ---------------------------------------------------------------------
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;
drop policy if exists "settings: leitura pública" on public.site_settings;
create policy "settings: leitura pública" on public.site_settings for select using (true);
drop policy if exists "settings: admin escreve" on public.site_settings;
create policy "settings: admin escreve" on public.site_settings for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- POOLS SUGERIDAS (Estratégias > Sugestões de Pools)
-- ---------------------------------------------------------------------
create table if not exists public.suggested_pools (
  id uuid primary key default gen_random_uuid(),
  strategy text not null default 'suggested' check (strategy in ('suggested','one_percent')),
  token0 text not null,          -- ex.: ETH  (token base)
  token1 text not null,          -- ex.: USDC (token de cotação)
  range_min numeric not null,
  range_max numeric not null,
  fee numeric not null default 0.05,   -- em %
  wallet_pct numeric,                  -- % da carteira
  network text not null default 'Base',
  risk text not null default 'Moderado' check (risk in ('Baixo','Moderado','Alto')),
  simulate_url text,
  notes text,
  active boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.suggested_pools enable row level security;
drop policy if exists "pools: leitura pública" on public.suggested_pools;
create policy "pools: leitura pública" on public.suggested_pools for select using (active or public.is_admin());
drop policy if exists "pools: admin escreve" on public.suggested_pools;
create policy "pools: admin escreve" on public.suggested_pools for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- RELATÓRIOS SEMANAIS (Markdown)
-- ---------------------------------------------------------------------
create table if not exists public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  week_start date not null,
  content_md text not null default '',
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.weekly_reports enable row level security;
drop policy if exists "reports: leitura publicados" on public.weekly_reports;
create policy "reports: leitura publicados" on public.weekly_reports for select using (published or public.is_admin());
drop policy if exists "reports: admin escreve" on public.weekly_reports;
create policy "reports: admin escreve" on public.weekly_reports for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- TUTORIAIS + PROGRESSO
-- ---------------------------------------------------------------------
create table if not exists public.tutorials (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text not null default 'Plataforma',
  difficulty text not null default 'Iniciante' check (difficulty in ('Iniciante','Intermediário','Avançado')),
  duration_min int not null default 10,
  video_url text,          -- YouTube, Vimeo ou arquivo .mp4
  thumbnail_url text,
  premium boolean not null default false,
  published boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.tutorials enable row level security;
drop policy if exists "tutoriais: leitura" on public.tutorials;
create policy "tutoriais: leitura" on public.tutorials for select using (public.is_admin());
drop policy if exists "tutoriais: admin escreve" on public.tutorials;
create policy "tutoriais: admin escreve" on public.tutorials for all using (public.is_admin()) with check (public.is_admin());

-- leitura pública pela view: o link do vídeo premium só é entregue a assinantes
drop view if exists public.tutorials_public;
create view public.tutorials_public as
  select id, title, description, category, difficulty, duration_min, thumbnail_url, premium, sort, created_at,
         case when premium and not public.is_subscriber() then null else video_url end as video_url
  from public.tutorials where published;
grant select on public.tutorials_public to anon, authenticated;

create table if not exists public.tutorial_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  tutorial_id uuid not null references public.tutorials(id) on delete cascade,
  completed boolean not null default false,
  watched_minutes int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, tutorial_id)
);
alter table public.tutorial_progress enable row level security;
drop policy if exists "progresso: dono" on public.tutorial_progress;
create policy "progresso: dono" on public.tutorial_progress for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- CARTEIRAS FIXADAS
-- ---------------------------------------------------------------------
create table if not exists public.pinned_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  address text not null,
  label text,
  created_at timestamptz not null default now(),
  unique (user_id, address)
);
alter table public.pinned_wallets enable row level security;
drop policy if exists "carteiras: dono" on public.pinned_wallets;
create policy "carteiras: dono" on public.pinned_wallets for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- LEADS ("Quero entrar no Labs agora") — inseridos pela API com service role
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  whatsapp text,
  interest text,
  source text,
  created_at timestamptz not null default now()
);
alter table public.leads enable row level security;
drop policy if exists "leads: admin lê" on public.leads;
create policy "leads: admin lê" on public.leads for select using (public.is_admin());
drop policy if exists "leads: admin apaga" on public.leads;
create policy "leads: admin apaga" on public.leads for delete using (public.is_admin());

-- ---------------------------------------------------------------------
-- CHAT DE SUPORTE (tempo real)
-- ---------------------------------------------------------------------
create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text,
  status text not null default 'open' check (status in ('open','closed')),
  last_message_at timestamptz not null default now(),
  unread_admin int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.chat_conversations enable row level security;
drop policy if exists "conversa: dono ou admin" on public.chat_conversations;
create policy "conversa: dono ou admin" on public.chat_conversations for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "conversa: dono cria" on public.chat_conversations;
create policy "conversa: dono cria" on public.chat_conversations for insert with check (user_id = auth.uid());
drop policy if exists "conversa: dono ou admin atualiza" on public.chat_conversations;
create policy "conversa: dono ou admin atualiza" on public.chat_conversations for update using (user_id = auth.uid() or public.is_admin());

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender text not null check (sender in ('user','admin')),
  sender_id uuid references auth.users(id),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_conv_idx on public.chat_messages(conversation_id, created_at);
alter table public.chat_messages enable row level security;
drop policy if exists "mensagens: ler" on public.chat_messages;
create policy "mensagens: ler" on public.chat_messages for select using (
  public.is_admin() or exists (select 1 from public.chat_conversations c where c.id = conversation_id and c.user_id = auth.uid())
);
drop policy if exists "mensagens: enviar" on public.chat_messages;
create policy "mensagens: enviar" on public.chat_messages for insert with check (
  sender_id = auth.uid() and (
    (sender = 'admin' and public.is_admin()) or
    (sender = 'user' and exists (select 1 from public.chat_conversations c where c.id = conversation_id and c.user_id = auth.uid() and c.status = 'open'))
  )
);

create or replace function public.touch_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.chat_conversations
     set last_message_at = new.created_at,
         unread_admin = case when new.sender = 'user' then unread_admin + 1 else 0 end
   where id = new.conversation_id;
  return new;
end $$;
drop trigger if exists on_chat_message on public.chat_messages;
create trigger on_chat_message after insert on public.chat_messages
  for each row execute function public.touch_conversation();

-- habilita tempo real para o chat
do $$ begin
  begin alter publication supabase_realtime add table public.chat_messages; exception when others then null; end;
  begin alter publication supabase_realtime add table public.chat_conversations; exception when others then null; end;
end $$;

-- ---------------------------------------------------------------------
-- DADOS INICIAIS (edite depois pelo painel /admin)
-- ---------------------------------------------------------------------
insert into public.site_settings (key, value) values
('defi_dashboard', '{
  "updated_at": "2026-09-22",
  "platforms": [{"name":"AAVE","pct":50},{"name":"Morpho","pct":50}],
  "collateral_allocation": [{"name":"BTC","pct":60},{"name":"ETH","pct":40}],
  "collateral_assets": ["cbBTC","ETH","USDC"],
  "borrow_assets": ["USDC","USDT"],
  "profiles": [{"name":"Conservador","pct":50},{"name":"Moderado","pct":30},{"name":"Agressivo","pct":20}],
  "overview": "Deposite BTC e ETH como garantia, tome emprestado stablecoins com folga de segurança e aloque em pools de liquidez selecionadas. O objetivo é buscar cerca de 1% ao mês mantendo exposição aos ativos principais.",
  "benefits": ["Mantém exposição a BTC e ETH","Rendimento em stablecoins","Risco controlado pelo Health Factor","Rebalanceamento simples"],
  "rules": ["No máximo $500 emprestados a cada $1.000 em garantia","Mantenha o Health Factor sempre acima de 1,5","Revise as faixas das pools toda semana"],
  "monitored": ["BTC","ETH","USDC","USDT","cbBTC"]
}'),
('footer', '{
  "company": "Tiger Labs",
  "legal_name": "",
  "cnpj": "",
  "email": "contato@tigerlabs.com.br",
  "instagram": "https://instagram.com/",
  "youtube": "https://youtube.com/",
  "telegram": "https://t.me/",
  "whatsapp": "https://wa.me/55",
  "course_url": "",
  "mentorship_url": ""
}')
on conflict (key) do nothing;

insert into public.suggested_pools (strategy, token0, token1, range_min, range_max, fee, wallet_pct, network, risk, simulate_url, sort)
select * from (values
  ('suggested','ETH','USDC', 3800, 5200, 0.05, 30, 'Base', 'Moderado', 'https://app.uniswap.org/positions/create', 1),
  ('suggested','BTC','USDC', 95000, 130000, 0.05, 30, 'Base', 'Baixo', 'https://app.uniswap.org/positions/create', 2),
  ('suggested','SOL','USDC', 170, 260, 0.30, 20, 'Arbitrum', 'Alto', 'https://app.uniswap.org/positions/create', 3),
  ('one_percent','ETH','USDC', 4200, 4600, 0.05, null, 'Base', 'Alto', null, 1)
) as v(strategy, token0, token1, range_min, range_max, fee, wallet_pct, network, risk, simulate_url, sort)
where not exists (select 1 from public.suggested_pools);

insert into public.tutorials (title, description, category, difficulty, duration_min, video_url, premium, sort)
select * from (values
  ('Boas-vindas ao Tiger Labs', 'Tour completo pela plataforma e por onde começar', 'Plataforma', 'Iniciante', 8, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', false, 1),
  ('Tutorial de Análise Técnica', 'Como ler o score, a sugestão de trade e os indicadores', 'Análise Técnica', 'Iniciante', 10, null, false, 2),
  ('Position Trading na prática', 'Montando posições de longo prazo com o score 0-100', 'Estratégias', 'Intermediário', 15, null, true, 3),
  ('Pools de liquidez concentrada', 'Escolhendo faixas, taxas e acompanhando a IL', 'DeFi', 'Avançado', 20, null, true, 4)
) as v(title, description, category, difficulty, duration_min, video_url, premium, sort)
where not exists (select 1 from public.tutorials);

insert into public.weekly_reports (title, week_start, content_md, published, published_at)
select 'Semana de 21 de setembro de 2026', '2026-09-21',
'# Resumo da semana

O mercado abriu a semana em **consolidação**, com o BTC respeitando a Banda de Suporte semanal.

## Pontos de atenção
- RSI diário neutro nos principais ativos
- Volume abaixo da média de 20 dias
- Pools de ETH/USDC seguem dentro da faixa sugerida

## Plano
Manter as posições de acumulação e revisar as faixas das pools na sexta-feira.', true, now()
where not exists (select 1 from public.weekly_reports);


-- =====================================================================
-- MINHA CARTEIRA (Tiger Invest integrado) · planos · Mercado Pago · indicações
-- Tudo idempotente: pode rodar o arquivo inteiro de novo sem perder dados.
-- =====================================================================

alter table public.profiles add column if not exists city text;
alter table public.profiles add column if not exists state text;

-- ---------- Carteira ----------
create table if not exists public.holdings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null default 'crypto',   -- crypto | stock | cash | pool
  name          text not null,
  symbol        text not null default '',
  cg_id         text default '',
  qty           double precision not null default 0,
  price         double precision not null default 0,
  invested      double precision not null default 0,
  current_value double precision,
  meta_pct      double precision not null default 0,
  color         text default '#00FF88',
  sort          int default 0,
  created_at    timestamptz default now()
);
create index if not exists holdings_user_idx on public.holdings(user_id);

create table if not exists public.flows (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,                       -- in | out
  amount     double precision not null,
  note       text default '',
  move_date  date not null default now(),
  created_at timestamptz default now()
);
alter table public.flows add column if not exists move_date date not null default now();
create index if not exists flows_user_idx on public.flows(user_id);

create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  symbol      text not null,
  name        text not null default '',
  cg_id       text default '',
  color       text default '#00FF88',
  rede        text default '',
  corretora   text default '',
  carteira    text default '',
  buy_date    date not null default now(),
  qty         double precision not null default 0,
  buy_price   double precision not null default 0,
  stop_limit  double precision default 0,
  target      double precision default 0,
  meta_pct    double precision not null default 0,
  created_at  timestamptz default now()
);
-- tipo do movimento: buy | sell | to_pool | from_pool
alter table public.transactions add column if not exists move_kind text not null default 'buy';
alter table public.transactions add column if not exists note text default '';
create index if not exists tx_user_idx on public.transactions(user_id);
create index if not exists tx_symbol_idx on public.transactions(symbol);

create table if not exists public.app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seeded  boolean not null default false
);

create table if not exists public.pools (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  par1          text not null default 'ETH',
  par1_cg_id    text default 'ethereum',
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
alter table public.pools add column if not exists pool_address text default '';
alter table public.pools add column if not exists network text default 'base';
alter table public.pools add column if not exists entry_price numeric not null default 0;
alter table public.pools add column if not exists position_id text default '';  -- NFT ID Uniswap V3 (sincronizar taxas)
create index if not exists pools_user_idx on public.pools(user_id);

create table if not exists public.levels (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  symbol     text not null,
  kind       text not null,          -- support | resistance
  price      double precision not null,
  note       text default '',
  created_at timestamptz default now()
);
create index if not exists levels_user_idx on public.levels(user_id);
create index if not exists levels_symbol_idx on public.levels(symbol);

create table if not exists public.pool_watch (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  pool_key   text not null,
  name       text default '',
  network    text default '',
  dex        text default '',
  added_at   timestamptz default now(),
  unique (user_id, pool_key)
);
create index if not exists pool_watch_user_idx on public.pool_watch(user_id);

create table if not exists public.portfolio_snapshot (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  snap_date      date not null,
  patrimonio_usd numeric not null default 0,
  custo_usd      numeric not null default 0,
  brl_rate       numeric not null default 0,
  created_at     timestamptz default now(),
  unique (user_id, snap_date)
);
create index if not exists portfolio_snapshot_user_date_idx on public.portfolio_snapshot(user_id, snap_date);

-- histórico diário de cada pool (gravado pelo cron /api/cron/daily)
create table if not exists public.pool_snapshot (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  pool_id       uuid not null references public.pools(id) on delete cascade,
  snap_date     date not null,
  current_value numeric not null default 0,
  aporte        numeric not null default 0,
  fees          numeric not null default 0,
  entry_price   numeric not null default 0,
  par1_price    numeric not null default 0,
  created_at    timestamptz default now(),
  unique (user_id, pool_id, snap_date)
);
create index if not exists pool_snapshot_user_pool_idx on public.pool_snapshot(user_id, pool_id, snap_date);

create table if not exists public.pool_alert (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  pool_key   text not null,
  alert_date date not null default current_date,
  name       text default '',
  network    text default '',
  dex        text default '',
  grade      text default '',
  net_apr    numeric default 0,
  message    text default '',
  seen       boolean default false,
  created_at timestamptz default now(),
  unique (user_id, pool_key, alert_date)
);
create index if not exists pool_alert_user_seen_idx on public.pool_alert(user_id, seen);

create table if not exists public.perps_account (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  collateral  numeric not null default 0,
  updated_at  timestamptz default now()
);
alter table public.perps_account add column if not exists auto_close boolean not null default true;

create table if not exists public.perps_positions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  market        text not null,
  symbol        text not null,
  name          text default '',
  side          text not null default 'long',
  leverage      integer not null default 1,
  size          numeric not null default 0,
  entry_price   numeric not null default 0,
  margin        numeric not null default 0,
  opened_at     date not null default current_date,
  status        text not null default 'open',
  close_price   numeric,
  closed_at     date,
  realized_pnl  numeric,
  note          text default '',
  created_at    timestamptz default now()
);
alter table public.perps_positions add column if not exists tp numeric;
alter table public.perps_positions add column if not exists sl numeric;
alter table public.perps_positions add column if not exists close_reason text;
create index if not exists perps_positions_user_status_idx on public.perps_positions(user_id, status);

-- RLS "cada um só vê o que é seu" em todas as tabelas da carteira
do $$
declare t text;
  tbls text[] := array['holdings','flows','transactions','app_state','pools','levels','pool_watch',
                       'portfolio_snapshot','pool_snapshot','pool_alert','perps_account','perps_positions'];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "own_%s" on public.%I;', t, t);
    execute format('create policy "own_%s" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id);', t, t);
  end loop;
end $$;

-- Índice Tiger 100 (global): todos logados leem, só o cron grava
create table if not exists public.tiger100_snapshot (
  snap_date   date primary key,
  level       numeric not null default 1000,
  ret24       numeric default 0,
  mcap_total  numeric default 0,
  btc_dom     numeric default 0,
  breadth_up  int default 0,
  created_at  timestamptz default now()
);
alter table public.tiger100_snapshot enable row level security;
drop policy if exists "read_tiger100" on public.tiger100_snapshot;
create policy "read_tiger100" on public.tiger100_snapshot for select using (auth.role() = 'authenticated');

-- ---------- Planos e assinaturas (Mercado Pago / PIX) ----------
create table if not exists public.plans (
  id           text primary key,          -- start | pro | alpha
  name         text not null,
  price_cents  int  not null,
  tag          text default '',
  features     jsonb not null default '[]'::jsonb,
  popular      boolean default false,
  sort         int default 0,
  active       boolean default true,
  updated_at   timestamptz default now()
);
alter table public.plans enable row level security;
drop policy if exists "plans_public_read" on public.plans;
create policy "plans_public_read" on public.plans for select using (true);

insert into public.plans (id, name, price_cents, tag, features, popular, sort, active) values
  ('start', 'TIGER START', 599, 'O começo do controle',
    '["Minha Carteira: cripto, ações, caixa e pools","Custo médio automático por transação","Cotação ao vivo","Alocação, blocos por nicho e metas","Patrimônio e resultado em tempo real","Relatórios semanais e conteúdo exclusivo do Labs"]'::jsonb, false, 1, true),
  ('pro', 'TIGER PRO', 999, 'Análise e radar',
    '["Tudo do START, e mais:","Pulso do mercado, Radar e BTC Lab","Níveis personalizados por ativo","Perps (Ondo) com TP/SL","Alertas inteligentes"]'::jsonb, true, 2, true),
  ('alpha', 'TIGER ALPHA', 1999, 'O predador completo',
    '["Tudo do PRO, e mais:","Fluxo de caixa completo (P/L por período)","Controle avançado de pools com tração ao vivo","Prioridade em novos recursos"]'::jsonb, false, 3, true)
on conflict (id) do nothing;

create table if not exists public.plan_orders (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  plan_id             text not null,
  cycle               text not null default 'mensal',   -- mensal | anual
  amount_cents        int  not null,
  status              text not null default 'pending',  -- pending | paid | failed
  gateway             text default 'mercadopago',
  gateway_payment_id  text default '',
  gateway_account     text default '',
  created_at          timestamptz default now(),
  paid_at             timestamptz
);
alter table public.plan_orders enable row level security;
drop policy if exists "own_orders_select" on public.plan_orders;
create policy "own_orders_select" on public.plan_orders for select using (auth.uid() = user_id);
drop policy if exists "own_orders_insert" on public.plan_orders;
create policy "own_orders_insert" on public.plan_orders for insert with check (auth.uid() = user_id);
create index if not exists plan_orders_user_idx on public.plan_orders(user_id);

create table if not exists public.subscriptions (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  plan_id             text not null,
  cycle               text not null default 'mensal',
  status              text not null default 'active',   -- active | expired | canceled
  current_period_end  timestamptz not null,
  updated_at          timestamptz default now()
);
alter table public.subscriptions enable row level security;
drop policy if exists "own_sub_select" on public.subscriptions;
create policy "own_sub_select" on public.subscriptions for select using (auth.uid() = user_id or public.is_admin());

create or replace function public.fulfill_plan_order(
  p_order_id uuid, p_gateway text, p_gateway_payment_id text, p_gateway_account text
) returns void language plpgsql security definer set search_path = public as $$
declare o public.plan_orders%rowtype; v_months int; v_base timestamptz;
begin
  select * into o from public.plan_orders where id = p_order_id for update;
  if not found then raise exception 'Pedido % não encontrado', p_order_id; end if;
  if o.status = 'paid' then return; end if;
  update public.plan_orders
     set status = 'paid', paid_at = now(),
         gateway = coalesce(p_gateway, gateway),
         gateway_payment_id = coalesce(p_gateway_payment_id, gateway_payment_id),
         gateway_account = coalesce(p_gateway_account, gateway_account)
   where id = o.id;
  v_months := case when o.cycle = 'anual' then 12 else 1 end;
  select greatest(now(), coalesce(current_period_end, now())) into v_base from public.subscriptions where user_id = o.user_id;
  if v_base is null then v_base := now(); end if;
  insert into public.subscriptions (user_id, plan_id, cycle, status, current_period_end, updated_at)
  values (o.user_id, o.plan_id, o.cycle, 'active', v_base + (v_months || ' months')::interval, now())
  on conflict (user_id) do update
    set plan_id = excluded.plan_id, cycle = excluded.cycle, status = 'active',
        current_period_end = excluded.current_period_end, updated_at = now();
end $$;
revoke all on function public.fulfill_plan_order(uuid, text, text, text) from public, anon, authenticated;

-- Assinante do Labs = marcado manualmente, admin, OU com assinatura ativa paga
create or replace function public.is_subscriber()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and (is_subscriber or role = 'admin'))
      or exists (select 1 from public.subscriptions where user_id = auth.uid() and status = 'active' and current_period_end > now());
$$;

-- ---------- Indicações (Tigre Embaixador) + créditos ----------
create table if not exists public.referrals (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  referral_code text unique not null,
  referred_by   text,
  created_at    timestamptz default now()
);
alter table public.referrals enable row level security;
drop policy if exists "ref_own_read" on public.referrals;
create policy "ref_own_read" on public.referrals for select using (auth.uid() = user_id);

create table if not exists public.credit_transactions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  tipo                text not null,       -- comissao | uso | ajuste
  valor_cents         int  not null,
  descricao           text default '',
  referred_id         uuid,
  percentual_aplicado numeric,
  payment_ref         text,
  created_at          timestamptz default now()
);
alter table public.credit_transactions enable row level security;
drop policy if exists "credit_own_read" on public.credit_transactions;
create policy "credit_own_read" on public.credit_transactions for select using (auth.uid() = user_id);
create index if not exists credit_user_idx on public.credit_transactions(user_id);
create unique index if not exists credit_comissao_unica on public.credit_transactions(payment_ref) where tipo = 'comissao' and payment_ref is not null;

create table if not exists public.app_settings (key text primary key, value text);
alter table public.app_settings enable row level security;  -- só service_role lê/escreve
insert into public.app_settings(key, value) values ('taxa_mp', '1') on conflict (key) do nothing;

create or replace function public.ensure_referral(p_ref text default null)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); existing text; c text; ref_owner uuid; clean text;
begin
  if uid is null then raise exception 'sem sessão'; end if;
  select referral_code into existing from referrals where user_id = uid;
  if existing is not null then return existing; end if;
  loop
    c := upper(substr(md5(gen_random_uuid()::text), 1, 8));
    exit when not exists (select 1 from referrals where referral_code = c);
  end loop;
  clean := nullif(upper(coalesce(p_ref, '')), '');
  if clean is not null then
    select user_id into ref_owner from referrals where referral_code = clean;
    if ref_owner is null or ref_owner = uid then clean := null; end if;
  end if;
  insert into referrals(user_id, referral_code, referred_by) values (uid, c, clean);
  return c;
end $$;

create or replace function public.credit_referral_commission(p_payer uuid, p_payment_ref text, p_amount_cents int)
returns void language plpgsql security definer set search_path = public as $$
declare v_ref text; v_referrer uuid; v_taxa numeric; v_liquido numeric; v_active int; v_pct numeric; v_comm int;
begin
  select referred_by into v_ref from referrals where user_id = p_payer;
  if v_ref is null then return; end if;
  select user_id into v_referrer from referrals where referral_code = v_ref;
  if v_referrer is null or v_referrer = p_payer then return; end if;
  if exists (select 1 from credit_transactions where payment_ref = p_payment_ref and tipo = 'comissao') then return; end if;
  select coalesce(value::numeric, 1) into v_taxa from app_settings where key = 'taxa_mp';
  v_liquido := p_amount_cents * (1 - coalesce(v_taxa, 1) / 100.0);
  select count(*) into v_active
    from referrals r join subscriptions s on s.user_id = r.user_id
   where r.referred_by = v_ref and s.status = 'active' and s.current_period_end > now();
  v_pct := case when v_active >= 10 then 10 when v_active >= 5 then 7 when v_active >= 2 then 5 else 3 end;
  v_comm := round(v_liquido * v_pct / 100.0);
  if v_comm <= 0 then return; end if;
  insert into credit_transactions(user_id, tipo, valor_cents, descricao, referred_id, percentual_aplicado, payment_ref)
    values (v_referrer, 'comissao', v_comm, 'Comissão ' || v_pct || '% de indicação', p_payer, v_pct, p_payment_ref);
end $$;

create or replace function public.spend_credits_and_fulfill(p_plan text, p_cycle text, p_price_cents int)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_bal int; v_order uuid;
begin
  if uid is null then raise exception 'sem sessão'; end if;
  select coalesce(sum(valor_cents), 0) into v_bal from credit_transactions where user_id = uid;
  if v_bal < p_price_cents then raise exception 'saldo insuficiente'; end if;
  insert into plan_orders(user_id, plan_id, cycle, amount_cents, status, gateway)
    values (uid, p_plan, p_cycle, p_price_cents, 'pending', 'creditos') returning id into v_order;
  insert into credit_transactions(user_id, tipo, valor_cents, descricao)
    values (uid, 'uso', -p_price_cents, 'Assinatura ' || p_plan || ' (' || p_cycle || ') paga com créditos');
  perform fulfill_plan_order(v_order, 'creditos', 'creditos', 'creditos');
  return v_order::text;
end $$;

revoke all on function public.credit_referral_commission(uuid, text, int) from public, anon, authenticated;
grant execute on function public.ensure_referral(text) to authenticated;
grant execute on function public.spend_credits_and_fulfill(text, text, int) to authenticated;

-- Cadastro: cria o perfil (com cidade/UF) e já registra quem indicou (?ref=CODIGO)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare c text; ref text; ref_owner uuid;
begin
  insert into public.profiles (id, email, full_name, city, state)
  values (new.id, new.email,
          coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
          nullif(new.raw_user_meta_data->>'city', ''), nullif(new.raw_user_meta_data->>'state', ''))
  on conflict (id) do nothing;

  begin
    loop
      c := upper(substr(md5(gen_random_uuid()::text), 1, 8));
      exit when not exists (select 1 from public.referrals where referral_code = c);
    end loop;
    ref := nullif(upper(coalesce(new.raw_user_meta_data->>'ref_code', '')), '');
    if ref is not null then
      select user_id into ref_owner from public.referrals where referral_code = ref;
      if ref_owner is null then ref := null; end if;
    end if;
    insert into public.referrals(user_id, referral_code, referred_by) values (new.id, c, ref)
    on conflict (user_id) do nothing;
  exception when others then null;  -- nunca bloqueia o cadastro
  end;
  return new;
end $$;

-- Usuários que já existiam (ex.: base antiga do Tiger Invest) ganham perfil também
insert into public.profiles (id, email, full_name, city, state)
select u.id, u.email,
       coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1)),
       nullif(u.raw_user_meta_data->>'city', ''), nullif(u.raw_user_meta_data->>'state', '')
  from auth.users u
 where not exists (select 1 from public.profiles p where p.id = u.id);

-- ---------------------------------------------------------------------
-- DEPOIS DE CRIAR SUA CONTA NO SITE, torne-se admin (troque o e-mail):
-- update public.profiles set role = 'admin', is_subscriber = true where email = 'seu@email.com';
-- (ou coloque o e-mail em ADMIN_EMAILS na Vercel — vale para o painel de assinaturas também)
-- ---------------------------------------------------------------------
