-- Vendas 2.0: entradas multiplas (venda_entradas), nova taxonomia de
-- forma_pagamento, transferencia, cartao e desconto.
-- Migra dados legados (valor_entrada e troca_*) ANTES de apertar constraints.
-- A entrada "carro na troca" agora cadastra um carro real (carros + documentos
-- com origem=TROCA/valor_compra); as colunas troca_* de vendas sao removidas.

-- ---------------------------------------------------------------------------
-- 1) Tabela filha de entradas
-- ---------------------------------------------------------------------------
create table if not exists public.venda_entradas (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas(id)
    on update cascade
    on delete cascade,
  tipo text not null check (tipo in ('pix', 'cartao_credito', 'carro_troca', 'outro')),
  valor numeric(12, 2) not null check (valor >= 0),
  cartao_parcelas_qtde integer check (cartao_parcelas_qtde is null or cartao_parcelas_qtde > 0),
  cartao_parcela_valor numeric(12, 2) check (cartao_parcela_valor is null or cartao_parcela_valor >= 0),
  carro_troca_id uuid references public.carros(id)
    on update cascade
    on delete set null,
  descricao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint venda_entradas_troca_exige_tipo
    check (carro_troca_id is null or tipo = 'carro_troca')
);

alter table public.venda_entradas enable row level security;

create index if not exists ix_venda_entradas_venda_id
  on public.venda_entradas (venda_id);

create index if not exists ix_venda_entradas_carro_troca_id
  on public.venda_entradas (carro_troca_id)
  where carro_troca_id is not null;

drop trigger if exists trg_venda_entradas_timestamps on public.venda_entradas;
create trigger trg_venda_entradas_timestamps
before insert or update on public.venda_entradas
for each row
execute function public.fn_set_timestamps();

comment on table public.venda_entradas is 'Entradas (sinal) de uma venda: pix, cartao_credito (com parcelas), carro_troca (FK carros do veiculo recebido) ou outro (legado/sem tipo).';
comment on column public.venda_entradas.carro_troca_id is 'Carro recebido na troca, cadastrado em public.carros (documentos.origem=TROCA, valor_compra=valor da entrada).';

-- ---------------------------------------------------------------------------
-- 2) Novas colunas em vendas
-- ---------------------------------------------------------------------------
alter table public.vendas
  add column if not exists financ_valor numeric(12, 2)
    check (financ_valor is null or financ_valor >= 0),
  add column if not exists cartao_parcelas_qtde integer
    check (cartao_parcelas_qtde is null or cartao_parcelas_qtde > 0),
  add column if not exists cartao_parcela_valor numeric(12, 2)
    check (cartao_parcela_valor is null or cartao_parcela_valor >= 0),
  add column if not exists desconto numeric(12, 2)
    check (desconto is null or desconto >= 0),
  add column if not exists tipo_transferencia text
    check (tipo_transferencia is null or tipo_transferencia in ('loja', 'financiamento', 'cliente')),
  add column if not exists valor_transferencia numeric(12, 2)
    check (valor_transferencia is null or valor_transferencia >= 0);

comment on column public.vendas.financ_valor is 'Valor financiado (valor_total - desconto - soma das entradas).';
comment on column public.vendas.desconto is 'Abatimento geral no preco; o valor do carro de troca NAO entra aqui (e uma entrada).';
comment on column public.vendas.tipo_transferencia is 'Quem paga/executa a transferencia: loja, financiamento ou cliente.';
comment on column public.vendas.valor_transferencia is 'Custo da transferencia (UI sugere 990 quando tipo=loja).';

-- ---------------------------------------------------------------------------
-- 3) forma_pagamento: anota 'misto' ANTES do remap, depois migra valores
--    a_vista -> a_vista_pix | financiado -> financiamento
--    parcelado -> cartao_credito
--    misto -> financiamento (se houver financ_*) senao a_vista_pix
-- ---------------------------------------------------------------------------
alter table public.vendas drop constraint if exists vendas_forma_pagamento_check;

update public.vendas
   set observacao = concat_ws(' | ', observacao,
     '[migracao vendas 2.0] forma_pagamento original: misto')
 where forma_pagamento = 'misto';

update public.vendas
   set forma_pagamento = case forma_pagamento
     when 'a_vista'    then 'a_vista_pix'
     when 'financiado' then 'financiamento'
     when 'parcelado'  then 'cartao_credito'
     when 'misto'      then case
       when financ_banco is not null
         or financ_parcelas_qtde is not null
         or financ_parcela_valor is not null then 'financiamento'
       else 'a_vista_pix'
     end
     else forma_pagamento
   end
 where forma_pagamento in ('a_vista', 'financiado', 'parcelado', 'misto');

alter table public.vendas
  add constraint vendas_forma_pagamento_check
    check (forma_pagamento in ('financiamento', 'a_vista_pix', 'cartao_credito', 'consorcio'));

comment on column public.vendas.forma_pagamento is 'Forma do pagamento principal: financiamento, a_vista_pix, cartao_credito, consorcio.';

-- ---------------------------------------------------------------------------
-- 4) Migra troca_* legado -> entrada carro_troca (sem FK; descricao preserva)
-- ---------------------------------------------------------------------------
insert into public.venda_entradas (venda_id, tipo, valor, descricao)
select id,
       'carro_troca',
       coalesce(troca_valor, 0),
       btrim(concat_ws(' ', 'Troca legada:', troca_marca, troca_modelo,
                       troca_ano::text, troca_placa))
  from public.vendas
 where troca_marca is not null
    or troca_modelo is not null
    or troca_ano is not null
    or troca_placa is not null
    or troca_valor is not null;

-- ---------------------------------------------------------------------------
-- 5) Migra valor_entrada legado -> entrada 'outro' (pula quando a troca ja
--    cobre o mesmo valor, evitando dobrar a entrada)
-- ---------------------------------------------------------------------------
insert into public.venda_entradas (venda_id, tipo, valor, descricao)
select id, 'outro', valor_entrada,
       'Migrado de vendas.valor_entrada (tipo nao informado).'
  from public.vendas
 where valor_entrada is not null
   and valor_entrada > 0
   and (troca_valor is null or troca_valor <> valor_entrada);

-- ---------------------------------------------------------------------------
-- 6) Drop troca_* (dados preservados em venda_entradas.descricao)
-- ---------------------------------------------------------------------------
alter table public.vendas
  drop column if exists troca_marca,
  drop column if exists troca_modelo,
  drop column if exists troca_ano,
  drop column if exists troca_placa,
  drop column if exists troca_valor;

-- ---------------------------------------------------------------------------
-- 7) valor_entrada vira denormalizado: soma das entradas, mantido por trigger
-- ---------------------------------------------------------------------------
create or replace function public.fn_venda_entradas_sync_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_venda_id uuid;
begin
  v_venda_id := coalesce(new.venda_id, old.venda_id);
  update public.vendas v
     set valor_entrada = (
       select sum(e.valor)
         from public.venda_entradas e
        where e.venda_id = v_venda_id
     )
   where v.id = v_venda_id;
  return coalesce(new, old);
end;
$$;

revoke all on function public.fn_venda_entradas_sync_total() from public, anon, authenticated;

drop trigger if exists trg_venda_entradas_sync_total on public.venda_entradas;
create trigger trg_venda_entradas_sync_total
after insert or update or delete on public.venda_entradas
for each row
execute function public.fn_venda_entradas_sync_total();

-- Sincroniza o estoque atual (linhas migradas nos passos 4/5)
update public.vendas v
   set valor_entrada = s.total
  from (
    select venda_id, sum(valor) as total
      from public.venda_entradas
     group by venda_id
  ) s
 where s.venda_id = v.id
   and v.valor_entrada is distinct from s.total;

comment on column public.vendas.valor_entrada is 'Denormalizado: soma de venda_entradas.valor (mantido por trigger). Nao editar manualmente.';

-- ---------------------------------------------------------------------------
-- 8) RPC atomica: venda + entradas em uma transacao. O trigger de cascade
--    carros.estado_venda=VENDIDO tambem participa do rollback. Backend-only
--    (service_role); revogada de anon/authenticated.
--    Insert com colunas explicitas + coalesce nos defaults para nao depender
--    do comportamento de jsonb_populate_record com chaves ausentes (null).
-- ---------------------------------------------------------------------------
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
    valor_total, desconto, forma_pagamento, estado_venda, observacao,
    comprador_nome, comprador_documento, comprador_telefone,
    comprador_email, comprador_endereco,
    financ_banco, financ_valor, financ_parcelas_qtde, financ_parcela_valor,
    financ_taxa_mensal, financ_primeira_em,
    cartao_parcelas_qtde, cartao_parcela_valor,
    tipo_transferencia, valor_transferencia,
    seguro_seguradora, seguro_apolice, seguro_valor, seguro_validade
  ) values (
    v_in.carro_id, v_in.vendedor_auth_user_id, v_in.created_by_user_id,
    coalesce(v_in.data_venda, current_date), v_in.data_entrega, v_in.canal_cliente,
    v_in.valor_total, v_in.desconto, v_in.forma_pagamento,
    coalesce(v_in.estado_venda, 'concluida'), v_in.observacao,
    v_in.comprador_nome, v_in.comprador_documento, v_in.comprador_telefone,
    v_in.comprador_email, v_in.comprador_endereco,
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

  -- Re-le a venda: o trigger de sync ja recalculou valor_entrada
  select * into v_venda from public.vendas where id = v_venda.id;
  return v_venda;
end;
$$;

revoke all on function public.fn_vendas_criar_v2(jsonb, jsonb) from public, anon, authenticated;

comment on function public.fn_vendas_criar_v2(jsonb, jsonb) is 'Cria venda + entradas atomicamente (Vendas 2.0). Chamada apenas pelo backend (service_role).';
