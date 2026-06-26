-- =====================================================================
-- RESERVA — STAGE 2: auto-finalizar 90 dias apos a data de entrega.
-- A funcao public.fn_vendas_auto_finalizar() ja existe (move estagio
-- 'fechado' -> 'finalizado' quando data_entrega < hoje - 90 dias). Aqui so
-- agendamos via pg_cron (diario), substituindo o calculo-na-leitura.
-- [skip-types] nao altera schema de tabelas/types.
-- =====================================================================

create extension if not exists pg_cron;

-- Reagenda de forma idempotente (remove o job antigo se existir).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'vendas-auto-finalizar') then
    perform cron.unschedule('vendas-auto-finalizar');
  end if;
end
$$;

-- 04:10 UTC todo dia.
select cron.schedule('vendas-auto-finalizar', '10 4 * * *', $cron$select public.fn_vendas_auto_finalizar();$cron$);
