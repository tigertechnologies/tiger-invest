-- =====================================================================
-- OPCIONAL: atualização automática dos scanners a cada 15 minutos
-- (o plano gratuito da Vercel só permite cron 1x por dia).
-- 1) Supabase > Database > Extensions: ative "pg_cron" e "pg_net"
-- 2) Troque SEU-DOMINIO e SEU_CRON_SECRET abaixo e rode no SQL Editor
-- =====================================================================

select cron.unschedule(jobname) from cron.job where jobname in ('tiger-market', 'tiger-positions');

select cron.schedule('tiger-market', '*/15 * * * *', $$
  select net.http_get(
    url := 'https://SEU-DOMINIO/api/cron/refresh?job=market&secret=SEU_CRON_SECRET',
    timeout_milliseconds := 60000
  );
$$);

select cron.schedule('tiger-positions', '5 * * * *', $$
  select net.http_get(
    url := 'https://SEU-DOMINIO/api/cron/refresh?job=positions&secret=SEU_CRON_SECRET',
    timeout_milliseconds := 60000
  );
$$);
