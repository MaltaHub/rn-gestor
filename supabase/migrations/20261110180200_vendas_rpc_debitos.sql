-- As RPCs que gravam a venda e as entradas listam as colunas uma a uma: passam
-- a levar os débitos com valor (20261110180100_debitos_valor). Sem campos novos.
-- CREATE OR REPLACE mantém dono e permissões (só service_role executa).

create or replace function public.fn_vendas_criar_v2(p_venda jsonb, p_entradas jsonb)
returns public.vendas
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_in public.vendas;
  v_venda public.vendas;
begin
  v_in := jsonb_populate_record(null::public.vendas, p_venda);

  insert into public.vendas (
    carro_id, vendedor_auth_user_id, created_by_user_id,
    data_venda, data_entrega, canal_cliente,
    valor_total, desconto, forma_pagamento, estado_venda, observacao, debitos, debitos_valor,
    comprador_nome, comprador_documento, comprador_rg, comprador_telefone,
    comprador_email, comprador_endereco, comprador_cep, comprador_cidade_estado,
    financ_banco, financ_valor, financ_parcelas_qtde, financ_parcela_valor,
    financ_taxa_mensal, financ_primeira_em,
    cartao_parcelas_qtde, cartao_parcela_valor,
    tipo_transferencia, valor_transferencia,
    seguro_seguradora, seguro_apolice, seguro_valor, seguro_validade
  ) values (
    v_in.carro_id, v_in.vendedor_auth_user_id, v_in.created_by_user_id,
    coalesce(v_in.data_venda, current_date), v_in.data_entrega, v_in.canal_cliente,
    v_in.valor_total, v_in.desconto, v_in.forma_pagamento,
    coalesce(v_in.estado_venda, 'concluida'), v_in.observacao, v_in.debitos, v_in.debitos_valor,
    v_in.comprador_nome, v_in.comprador_documento, v_in.comprador_rg, v_in.comprador_telefone,
    v_in.comprador_email, v_in.comprador_endereco, v_in.comprador_cep, v_in.comprador_cidade_estado,
    v_in.financ_banco, v_in.financ_valor, v_in.financ_parcelas_qtde, v_in.financ_parcela_valor,
    v_in.financ_taxa_mensal, v_in.financ_primeira_em,
    v_in.cartao_parcelas_qtde, v_in.cartao_parcela_valor,
    v_in.tipo_transferencia, v_in.valor_transferencia,
    v_in.seguro_seguradora, v_in.seguro_apolice, v_in.seguro_valor, v_in.seguro_validade
  )
  returning * into v_venda;

  insert into public.venda_entradas (
    venda_id, tipo, valor, cartao_parcelas_qtde, cartao_parcela_valor,
    carro_troca_id, descricao, debitos, debitos_valor
  )
  select v_venda.id, e.tipo, e.valor, e.cartao_parcelas_qtde, e.cartao_parcela_valor,
         e.carro_troca_id, e.descricao, e.debitos, e.debitos_valor
    from jsonb_to_recordset(coalesce(p_entradas, '[]'::jsonb)) as e(
      tipo text,
      valor numeric,
      cartao_parcelas_qtde integer,
      cartao_parcela_valor numeric,
      carro_troca_id uuid,
      descricao text,
      debitos text,
      debitos_valor numeric
    );

  select * into v_venda from public.vendas where id = v_venda.id;
  return v_venda;
end;
$function$;

create or replace function public.fn_venda_entradas_substituir(p_venda_id uuid, p_entradas jsonb)
returns setof public.venda_entradas
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not exists (select 1 from public.vendas where id = p_venda_id) then
    raise exception 'venda % nao encontrada', p_venda_id using errcode = 'P0002';
  end if;

  delete from public.venda_entradas where venda_id = p_venda_id;

  return query
  insert into public.venda_entradas (
    venda_id, tipo, valor, cartao_parcelas_qtde, cartao_parcela_valor,
    carro_troca_id, descricao, debitos, debitos_valor
  )
  select p_venda_id, e.tipo, e.valor, e.cartao_parcelas_qtde, e.cartao_parcela_valor,
         e.carro_troca_id, e.descricao, e.debitos, e.debitos_valor
    from jsonb_to_recordset(coalesce(p_entradas, '[]'::jsonb)) as e(
      tipo text,
      valor numeric,
      cartao_parcelas_qtde integer,
      cartao_parcela_valor numeric,
      carro_troca_id uuid,
      descricao text,
      debitos text,
      debitos_valor numeric
    )
  returning *;
end;
$function$;
