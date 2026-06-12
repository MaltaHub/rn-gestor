-- Edicao de venda (wizard modo "atualizar"): substituir as entradas precisa
-- ser atomico — delete + insert em chamadas separadas perderia as entradas se
-- o insert falhasse. RPC backend-only (service_role), mesmo padrao da
-- fn_vendas_criar_v2. O trigger trg_venda_entradas_sync_total re-deriva
-- vendas.valor_entrada a cada linha.
create or replace function public.fn_venda_entradas_substituir(p_venda_id uuid, p_entradas jsonb)
returns setof public.venda_entradas
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.vendas where id = p_venda_id) then
    raise exception 'venda % nao encontrada', p_venda_id using errcode = 'P0002';
  end if;

  delete from public.venda_entradas where venda_id = p_venda_id;

  return query
  insert into public.venda_entradas (
    venda_id, tipo, valor, cartao_parcelas_qtde, cartao_parcela_valor,
    carro_troca_id, descricao
  )
  select p_venda_id, e.tipo, e.valor, e.cartao_parcelas_qtde, e.cartao_parcela_valor,
         e.carro_troca_id, e.descricao
    from jsonb_to_recordset(coalesce(p_entradas, '[]'::jsonb)) as e(
      tipo text,
      valor numeric,
      cartao_parcelas_qtde integer,
      cartao_parcela_valor numeric,
      carro_troca_id uuid,
      descricao text
    )
  returning *;
end;
$$;

revoke all on function public.fn_venda_entradas_substituir(uuid, jsonb) from public, anon, authenticated;

comment on function public.fn_venda_entradas_substituir(uuid, jsonb) is 'Substitui TODAS as entradas de uma venda atomicamente (Vendas 2.0, modo edicao). Backend-only.';
