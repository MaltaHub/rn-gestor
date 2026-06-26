-- =====================================================================
-- RESERVA — STAGE 5: "Disponibilizar" um carro RESERVADO.
-- fn_carros_disponibilizar(carro_id): APAGA a(s) venda(s) em aberto ('aberta')
-- do carro (venda_entradas/venda_documentos somem junto por FK ON DELETE
-- CASCADE) e devolve o carro a 'DISPONÍVEL' + em_estoque/participa_calculos =
-- true. So age se o carro estiver RESERVADO (nao mexe em vendido). Diferente do
-- "Cancelar" da venda concluida (que PRESERVA o historico como 'cancelada').
-- SECURITY DEFINER; a rota aplica o RBAC (Gerente/Admin). Funcao chamavel via
-- rpc -> types regenerados.
-- =====================================================================
create or replace function public.fn_carros_disponibilizar(p_carro_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.normalize_business_token(
       (select estado_venda from public.carros where id = p_carro_id)
     ) is distinct from 'reservado' then
    raise exception 'CARRO_NAO_RESERVADO' using errcode = 'check_violation';
  end if;

  delete from public.vendas
   where carro_id = p_carro_id and estado_venda = 'aberta';

  update public.carros
     set estado_venda = 'DISPONÍVEL', em_estoque = true, participa_calculos = true
   where id = p_carro_id;
end;
$$;

revoke all on function public.fn_carros_disponibilizar(uuid) from public, anon, authenticated;
