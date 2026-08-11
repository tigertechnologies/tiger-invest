-- ============================================================
-- Tiger Invest v14 — CORREÇÃO CRÍTICA: vazamento via auto-seed
-- Rode no SQL Editor do Supabase.
--
-- Contexto: contas novas eram semeadas com a carteira do admin
-- (DEFAULT_HOLDINGS). Esta migration:
--   1) Zera os dados de EXEMPLO da conta do Otávio (mantém a assinatura PRO).
--   2) Garante RLS ligado + política própria em todas as tabelas de usuário.
--
-- Seguro rodar mais de uma vez.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Limpa a conta do Otávio SEM tocar na assinatura (continua PRO).
--    Remove só o que veio do seed: holdings, transações, pools, flows, levels.
--    Se ele tiver adicionado algo próprio no meio tempo, isso também sai —
--    é o preço de garantir que nada do admin permaneça. Ele recomeça zerado.
-- ------------------------------------------------------------
do $$
declare
  uid uuid;
begin
  select id into uid from auth.users
   where lower(email) = 'otaviofoli2005@gmail.com'
   limit 1;

  if uid is null then
    raise notice 'Usuario otaviofoli2005@gmail.com nao encontrado — nada a limpar.';
  else
    delete from public.holdings      where user_id = uid;
    delete from public.transactions  where user_id = uid;
    delete from public.pools         where user_id = uid;
    delete from public.flows         where user_id = uid;
    delete from public.levels        where user_id = uid;

    -- Marca como "seeded" para o app NÃO tentar semear de novo.
    insert into public.app_state (user_id, seeded)
    values (uid, true)
    on conflict (user_id) do update set seeded = true;

    -- OBS: public.subscriptions NÃO é tocado de propósito → PRO preservado.
    raise notice 'Conta % zerada (assinatura PRO preservada).', uid;
  end if;
end $$;

-- ------------------------------------------------------------
-- 2) Garante RLS + política "dono só vê o próprio" (idempotente).
--    Se qualquer tabela tiver ficado sem RLS na base de produção,
--    isto conserta. Rodar de novo não causa dano.
-- ------------------------------------------------------------
do $$
declare
  t text;
  tbls text[] := array['holdings','flows','transactions','app_state','pools','levels'];
begin
  foreach t in array tbls loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security;', t);
      execute format('drop policy if exists "own_%s" on public.%I;', t, t);
      execute format(
        'create policy "own_%s" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id);',
        t, t
      );
    end if;
  end loop;
end $$;
