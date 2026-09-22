-- ============================================================
-- Tiger Invest v19 — TP/SL (take-profit / stop-loss) nas posições de perps.
-- Rode no SQL Editor do Supabase. Seguro rodar mais de uma vez.
--
-- São níveis de ACOMPANHAMENTO no Tiger. A ordem que FECHA a posição
-- continua na Ondo (coluna TP/SL de lá) — aqui é o vigia, não o gatilho.
-- ============================================================

alter table public.perps_positions add column if not exists tp numeric;  -- take-profit (alvo) em USD
alter table public.perps_positions add column if not exists sl numeric;  -- stop-loss em USD
