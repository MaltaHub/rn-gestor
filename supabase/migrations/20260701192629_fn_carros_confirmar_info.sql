-- =====================================================================
-- RECONSTRUCAO DE HISTORICO: esta migration foi aplicada no remoto em
-- 2026-07-01 via MCP mas o .sql ficou orfao (nao entrou no git). Conteudo
-- extraido do banco (pg_get_functiondef) em 2026-07-07 para fechar o buraco
-- no historico de schema. Nao reaplicar manualmente.
--
-- fn_carros_confirmar_info(uuid): seta info_confirmada=true; o trigger
-- BEFORE (fn_carros_info_confirmada_gate) reverte se faltar campo
-- importante, e ai a funcao levanta CARRO_INFO_INCOMPLETA (23514).
-- =====================================================================
create or replace function public.fn_carros_confirmar_info(p_carro_id uuid)
returns public.carros
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_carro public.carros;
begin
  update public.carros set info_confirmada = true where id = p_carro_id
    returning * into v_carro;
  if not found then
    raise exception 'CARRO_NAO_ENCONTRADO' using errcode = 'no_data_found';
  end if;
  -- O trigger BEFORE zera info_confirmada se faltar campo importante; se voltou
  -- false, o carro esta incompleto e nao pode ser confirmado.
  if not v_carro.info_confirmada then
    raise exception 'CARRO_INFO_INCOMPLETA' using errcode = 'check_violation';
  end if;
  return v_carro;
end;
$$;
