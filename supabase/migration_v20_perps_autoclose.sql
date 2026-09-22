-- ============================================================
-- Tiger Invest v20 — Auto-fechamento de perps por preço (TP/SL/Liquidação).
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.
--
-- O Tiger já lê o mark price público da Ondo e você cadastra TP/SL.
-- Quando o mark atravessa o nível, o Tiger deduz o fechamento e encerra
-- a posição sozinho — SEM credencial da sua conta. É inferência por preço,
-- não leitura autenticada da Ondo.
-- ============================================================

-- motivo do fechamento: 'tp' | 'sl' | 'liq' | 'manual'
alter table public.perps_positions add column if not exists close_reason text;

-- interruptor por usuário do auto-fechamento (liga/desliga)
alter table public.perps_account add column if not exists auto_close boolean not null default true;
