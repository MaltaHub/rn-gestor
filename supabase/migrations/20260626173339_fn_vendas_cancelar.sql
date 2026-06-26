-- =====================================================================
-- RESERVA — STAGE 4: cancelar uma venda devolve o carro ao estoque.
-- fn_vendas_cancelar(venda_id):
--   1) marca a venda como 'cancelada' (preserva o historico);
--   2) carro volta a 'DISPONÍVEL' + em_estoque/participa_calculos = true
--      (o trigger BEFORE so DESATIVA em reservado/vendido, nao reativa);
--   3) se a venda tinha fechado o envelope (FECHANDO/FECHADO), volta a 'ABERTO'.
-- Serve para reserva ('aberta') e venda concluida. SECURITY DEFINER; a rota
-- aplica o RBAC (Gerente/Admin). Funcao chamavel via rpc -> types regenerados.
-- =====================================================================
create or replace function public.fn_vendas_cancelar(p_venda_id uuid)
returns public.vendas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venda public.vendas;
  v_carro_id uuid;
begin
  select * into v_venda from public.vendas where id = p_venda_id;
  if not found then
    raise exception 'VENDA_NAO_ENCONTRADA' using errcode = 'no_data_found';
  end if;
  v_carro_id := v_venda.carro_id;

  update public.vendas set estado_venda = 'cancelada' where id = p_venda_id
    returning * into v_venda;

  update public.carros
     set estado_venda = 'DISPONÍVEL', em_estoque = true, participa_calculos = true
   where id = v_carro_id;

  update public.documentos
     set envelope = 'ABERTO', updated_at = now()
   where carro_id = v_carro_id and envelope in ('FECHANDO', 'FECHADO');

  return v_venda;
end;
$$;

revoke all on function public.fn_vendas_cancelar(uuid) from public, anon, authenticated;
