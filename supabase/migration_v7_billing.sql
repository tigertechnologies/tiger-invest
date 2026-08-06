-- ============================================================
-- Tiger Invest v7 — Billing (Mercado Pago / PIX)
-- Rode no SQL Editor do projeto Supabase.
-- ============================================================

-- Pedidos de assinatura (um por tentativa de pagamento).
create table if not exists public.plan_orders (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  plan_id             text not null,                    -- start | pro | alpha
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
create policy "own_orders_select" on public.plan_orders
  for select using (auth.uid() = user_id);
drop policy if exists "own_orders_insert" on public.plan_orders;
create policy "own_orders_insert" on public.plan_orders
  for insert with check (auth.uid() = user_id);
create index if not exists plan_orders_user_idx on public.plan_orders(user_id);

-- Assinatura vigente (uma por usuário).
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
create policy "own_sub_select" on public.subscriptions
  for select using (auth.uid() = user_id);

-- Ativa/renova a assinatura a partir de um pedido pago.
-- Idempotente: se o pedido já estiver "paid", não faz nada.
create or replace function public.fulfill_plan_order(
  p_order_id           uuid,
  p_gateway            text,
  p_gateway_payment_id text,
  p_gateway_account    text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  o           public.plan_orders%rowtype;
  v_months    int;
  v_base      timestamptz;
begin
  select * into o from public.plan_orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido % não encontrado', p_order_id;
  end if;

  if o.status = 'paid' then
    return; -- já processado
  end if;

  update public.plan_orders
     set status = 'paid',
         paid_at = now(),
         gateway = coalesce(p_gateway, gateway),
         gateway_payment_id = coalesce(p_gateway_payment_id, gateway_payment_id),
         gateway_account = coalesce(p_gateway_account, gateway_account)
   where id = o.id;

  v_months := case when o.cycle = 'anual' then 12 else 1 end;

  -- Renovação estende a partir do fim do período atual (se ainda vigente).
  select greatest(now(), coalesce(current_period_end, now()))
    into v_base
    from public.subscriptions
   where user_id = o.user_id;
  if v_base is null then v_base := now(); end if;

  insert into public.subscriptions (user_id, plan_id, cycle, status, current_period_end, updated_at)
  values (o.user_id, o.plan_id, o.cycle, 'active', v_base + (v_months || ' months')::interval, now())
  on conflict (user_id) do update
    set plan_id = excluded.plan_id,
        cycle = excluded.cycle,
        status = 'active',
        current_period_end = excluded.current_period_end,
        updated_at = now();
end;
$$;

revoke all on function public.fulfill_plan_order(uuid, text, text, text) from public, anon, authenticated;
