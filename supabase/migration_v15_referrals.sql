-- ============================================================
-- Tiger Invest v15 — Indicações (Tigre Embaixador) + Carteira de créditos
-- Rode no SQL Editor do Supabase.
-- ============================================================

-- Código de indicação de cada usuário + quem o indicou.
create table if not exists public.referrals (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  referral_code text unique not null,
  referred_by   text,                    -- referral_code de quem indicou
  created_at    timestamptz default now()
);
alter table public.referrals enable row level security;
drop policy if exists "ref_own_read" on public.referrals;
create policy "ref_own_read" on public.referrals for select using (auth.uid() = user_id);

-- Carteira: razão de créditos (ganhos e usos).
create table if not exists public.credit_transactions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  tipo                text not null,       -- comissao | uso | ajuste
  valor_cents         int  not null,       -- + ganho, - uso
  descricao           text default '',
  referred_id         uuid,                -- indicado que gerou a comissão
  percentual_aplicado numeric,
  payment_ref         text,                -- idempotência (id do pagamento)
  created_at          timestamptz default now()
);
alter table public.credit_transactions enable row level security;
drop policy if exists "credit_own_read" on public.credit_transactions;
create policy "credit_own_read" on public.credit_transactions for select using (auth.uid() = user_id);
create index if not exists credit_user_idx on public.credit_transactions(user_id);
create unique index if not exists credit_comissao_unica on public.credit_transactions(payment_ref) where tipo = 'comissao' and payment_ref is not null;

-- Configurações simples (chave/valor). Ex.: taxa do Mercado Pago para o líquido.
create table if not exists public.app_settings (key text primary key, value text);
insert into public.app_settings(key, value) values ('taxa_mp', '1') on conflict (key) do nothing;

-- Garante (e cria) o código de indicação do usuário logado; grava quem indicou (uma vez).
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

-- Credita a comissão de indicação (chamada pelo webhook, com service_role). Idempotente.
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

-- Paga a assinatura usando créditos (cobertura total). Atômico: checa saldo, debita e ativa.
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
