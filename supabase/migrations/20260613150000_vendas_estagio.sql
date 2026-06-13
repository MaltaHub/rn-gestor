-- Estagio do processo de venda:
--   aberto      (default ao criar a venda)
--   fechado     processo finalizado (entrega confirmada pelo vendedor)
--   na_garantia cliente solicitou um servico dentro da garantia
--   finalizado  passou 90 dias da data de entrega -> garantia encerrada
-- A transicao fechado -> finalizado (90 dias) e calculada na leitura
-- (sem pg_cron neste projeto); a funcao abaixo persiste quando chamada.
alter table public.vendas
  add column if not exists estagio text not null default 'aberto'
    check (estagio in ('aberto', 'fechado', 'na_garantia', 'finalizado'));

comment on column public.vendas.estagio is 'Estagio do processo: aberto, fechado (entregue), na_garantia, finalizado (90 dias apos a entrega).';

create index if not exists ix_vendas_estagio on public.vendas (estagio);

-- Backfill: vendas com entrega registrada ja passaram do "aberto".
update public.vendas
   set estagio = case
     when data_entrega is not null and data_entrega < current_date - interval '90 days' then 'finalizado'
     when data_entrega is not null then 'fechado'
     else estagio
   end
 where data_entrega is not null;

-- Persiste fechado -> finalizado para quem ja estourou 90 dias da entrega.
-- Backend pode chamar periodicamente (ou um cron externo).
create or replace function public.fn_vendas_auto_finalizar()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.vendas
     set estagio = 'finalizado'
   where estagio = 'fechado'
     and data_entrega is not null
     and data_entrega < current_date - interval '90 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.fn_vendas_auto_finalizar() from public, anon, authenticated;

comment on function public.fn_vendas_auto_finalizar() is 'Marca como finalizado as vendas fechadas ha mais de 90 dias da entrega. Backend-only.';
