-- Vendas 2.0: mais dados do comprador (RG, CEP e Cidade-Estado separados do
-- endereco) e campo livre de debitos do veiculo (IPVA/multas pendentes) que a
-- UI destaca em vermelho. Todos opcionais.
alter table public.vendas
  add column if not exists comprador_rg text,
  add column if not exists comprador_cep text,
  add column if not exists comprador_cidade_estado text,
  add column if not exists debitos text;

comment on column public.vendas.comprador_rg is 'RG do comprador (documento de identidade).';
comment on column public.vendas.comprador_cep is 'CEP do endereco do comprador (separado de comprador_endereco).';
comment on column public.vendas.comprador_cidade_estado is 'Cidade - Estado do comprador (ex.: "Natal - RN").';
comment on column public.vendas.debitos is 'Debitos pendentes do veiculo (IPVA, multas). Texto livre; UI destaca em vermelho. Nao obrigatorio.';

-- A RPC de criacao precisa enxergar as colunas novas (insere explicitamente).
create or replace function public.fn_vendas_criar_v2(p_venda jsonb, p_entradas jsonb)
returns public.vendas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_in public.vendas;
  v_venda public.vendas;
begin
  v_in := jsonb_populate_record(null::public.vendas, p_venda);

  insert into public.vendas (
    carro_id, vendedor_auth_user_id, created_by_user_id,
    data_venda, data_entrega, canal_cliente,
    valor_total, desconto, forma_pagamento, estado_venda, observacao, debitos,
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
    coalesce(v_in.estado_venda, 'concluida'), v_in.observacao, v_in.debitos,
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
    carro_troca_id, descricao
  )
  select v_venda.id, e.tipo, e.valor, e.cartao_parcelas_qtde, e.cartao_parcela_valor,
         e.carro_troca_id, e.descricao
    from jsonb_to_recordset(coalesce(p_entradas, '[]'::jsonb)) as e(
      tipo text,
      valor numeric,
      cartao_parcelas_qtde integer,
      cartao_parcela_valor numeric,
      carro_troca_id uuid,
      descricao text
    );

  select * into v_venda from public.vendas where id = v_venda.id;
  return v_venda;
end;
$$;

revoke all on function public.fn_vendas_criar_v2(jsonb, jsonb) from public, anon, authenticated;
