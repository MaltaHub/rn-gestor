-- Finalizacao de vendidos (90 dias) + vinculo da troca. Aprovado pelo Kaic em
-- 2026-11-06 (propostas T/F/R; R1: data base = carros.data_venda, preenchida a
-- mao ou pelo fluxo de venda; sem data = lista de inconsistencias; R2: fotos
-- apagadas; R3: Finalizados so GERENTE+; F1: campos abaixo).
--
-- Rotina: o app (rota interna, disparada pelo pg_cron) apaga as FOTOS do storage
-- e chama fn_finalizar_veiculo, que grava o snapshot em finalizados, repassa os
-- ponteiros de troca para o snapshot, arquiva a pasta de documentos (5 anos) e
-- apaga o veiculo com todos os seus dados. Comeca DESLIGADA (so relatorio):
-- internal.app_settings.finalizacao_ativa = 'false'.

-- ---------------------------------------------------------------------------
-- 1) Fluxo de venda preenche carros.data_venda (e os vendidos antigos recebem
--    a data da venda concluida). Data menor que a entrada fica vazia (lista).
-- ---------------------------------------------------------------------------
create or replace function public.fn_vendas_cascade_carro_status()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.estado_venda = 'concluida' then
    update public.carros
       set estado_venda = 'VENDIDO'
     where id = new.carro_id
       and estado_venda is distinct from 'VENDIDO';
    update public.carros
       set data_venda = new.data_venda
     where id = new.carro_id
       and data_venda is null
       and new.data_venda is not null
       and new.data_venda >= data_entrada;
  elsif new.estado_venda = 'aberta' then
    update public.carros
       set estado_venda = 'RESERVADO'
     where id = new.carro_id
       and public.is_carro_disponivel_ou_novo(estado_venda);
  end if;
  return new;
end;
$function$;

update public.carros c
   set data_venda = v.data_venda
  from (
    select distinct on (carro_id) carro_id, data_venda
      from public.vendas
     where estado_venda = 'concluida' and data_venda is not null
     order by carro_id, data_venda desc, created_at desc
  ) v
 where v.carro_id = c.id
   and c.estado_venda = 'VENDIDO'
   and c.data_venda is null
   and v.data_venda >= c.data_entrada;

-- ---------------------------------------------------------------------------
-- 2) Troca: ponto de entrada do veiculo de troca e ponteiros para o snapshot.
-- ---------------------------------------------------------------------------
alter table public.documentos
  add column if not exists origem_venda_id uuid references public.vendas(id) on update cascade on delete set null,
  add column if not exists origem_finalizado_id uuid references public.finalizados(id) on update cascade on delete set null;

comment on column public.documentos.origem_venda_id is
  'Veiculo de TROCA: a venda em que ele entrou (ponto de entrada).';
comment on column public.documentos.origem_finalizado_id is
  'Veiculo de TROCA cuja venda de origem ja foi finalizada: aponta para o snapshot em finalizados.';

create index if not exists documentos_origem_venda_idx on public.documentos (origem_venda_id) where origem_venda_id is not null;
create index if not exists documentos_origem_finalizado_idx on public.documentos (origem_finalizado_id) where origem_finalizado_id is not null;

alter table public.venda_entradas
  add column if not exists carro_troca_finalizado_id uuid references public.finalizados(id) on update cascade on delete set null;

comment on column public.venda_entradas.carro_troca_finalizado_id is
  'Carro recebido na troca que ja foi finalizado: aponta para o snapshot em finalizados.';

-- ---------------------------------------------------------------------------
-- 3) Finalizados = snapshot do veiculo apagado (mesmo id do carro).
-- ---------------------------------------------------------------------------
alter table public.finalizados
  add column if not exists crv text,
  add column if not exists data_entrada date,
  add column if not exists origem text,
  add column if not exists valor_compra numeric,
  add column if not exists fornecedor_nome text,
  add column if not exists fornecedor_documento text,
  add column if not exists fornecedor_contato text,
  add column if not exists forma_pagamento text,
  add column if not exists comprador_nome text,
  add column if not exists comprador_documento text,
  add column if not exists comprador_telefone text,
  add column if not exists comprador_email text,
  add column if not exists comprador_endereco text,
  add column if not exists nota_entrada_numero text,
  add column if not exists nota_entrada_chave text,
  add column if not exists nota_saida_numero text,
  add column if not exists nota_saida_chave text,
  add column if not exists origem_troca_carro_id uuid,
  add column if not exists carros_troca_ids uuid[] not null default '{}',
  add column if not exists documentos_pasta_id uuid references public.arquivos_pastas(id) on delete set null,
  add column if not exists documentos_expiram_em date,
  add column if not exists snapshot jsonb not null default '{}'::jsonb;

comment on table public.finalizados is
  'Snapshot dos veiculos apagados 90 dias apos a venda (mesmo id do carro). Documentos ficam 5 anos.';
comment on column public.finalizados.origem_troca_carro_id is
  'Se veio de troca: id do veiculo vendido na venda de origem (em carros ou em finalizados).';
comment on column public.finalizados.carros_troca_ids is
  'Veiculos recebidos na troca na venda deste (ids em carros ou em finalizados).';
comment on column public.finalizados.snapshot is
  'Copia integral: carro, documentos, fornecedor, vendas, entradas, notas, pericias, anuncios, observacoes.';

create index if not exists finalizados_documentos_expiram_idx on public.finalizados (documentos_expiram_em)
  where documentos_pasta_id is not null;

-- ---------------------------------------------------------------------------
-- 4) Finaliza UM veiculo (as fotos ja foram removidas do storage pelo app).
-- ---------------------------------------------------------------------------
create or replace function public.fn_finalizar_veiculo(p_carro_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_carro public.carros%rowtype;
  v_doc public.documentos%rowtype;
  v_rem public.remetentes%rowtype;
  v_venda public.vendas%rowtype;
  v_nf_ent public.notas_fiscais%rowtype;
  v_nf_sai public.notas_fiscais%rowtype;
  v_modelo text;
  v_vendedor text;
  v_pasta uuid;
  v_trocas uuid[];
  v_origem_troca uuid;
  v_snapshot jsonb;
begin
  select * into v_carro from public.carros where id = p_carro_id for update;
  if not found then return null; end if;
  if v_carro.estado_venda is distinct from 'VENDIDO' or v_carro.data_venda is null then
    raise exception 'Veiculo % nao esta VENDIDO com data de venda.', v_carro.placa;
  end if;

  select m.modelo::text into v_modelo from public.modelos m where m.id = v_carro.modelo_id;
  select * into v_doc from public.documentos where carro_id = p_carro_id;
  if v_doc.remetente_id is not null then
    select * into v_rem from public.remetentes where id = v_doc.remetente_id;
  end if;
  select * into v_venda from public.vendas
   where carro_id = p_carro_id and estado_venda = 'concluida'
   order by data_venda desc nulls last, created_at desc
   limit 1;
  if v_venda.id is not null then
    select u.nome into v_vendedor from public.usuarios_acesso u where u.auth_user_id = v_venda.vendedor_auth_user_id limit 1;
  end if;
  select * into v_nf_ent from public.notas_fiscais where carro_id = p_carro_id and tipo = 'ENTRADA' order by created_at desc limit 1;
  select * into v_nf_sai from public.notas_fiscais where carro_id = p_carro_id and tipo = 'SAIDA' order by created_at desc limit 1;
  select folder_id into v_pasta from public.arquivo_automacao_folders
   where automation_key = 'vehicle_documents' and carro_id = p_carro_id and archived_at is null
   limit 1;

  select coalesce(array_agg(distinct e.carro_troca_id) filter (where e.carro_troca_id is not null), '{}')
    into v_trocas
    from public.venda_entradas e join public.vendas v on v.id = e.venda_id
   where v.carro_id = p_carro_id;
  v_origem_troca := coalesce(v_doc.origem_finalizado_id, (select v.carro_id from public.vendas v where v.id = v_doc.origem_venda_id));

  v_snapshot := jsonb_build_object(
    'carro', to_jsonb(v_carro),
    'modelo', v_modelo,
    'documentos', case when v_doc.carro_id is null then null else to_jsonb(v_doc) end,
    'fornecedor', case when v_rem.id is null then null else to_jsonb(v_rem) end,
    'vendas', (select coalesce(jsonb_agg(to_jsonb(v) order by v.created_at), '[]'::jsonb) from public.vendas v where v.carro_id = p_carro_id),
    'entradas', (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]'::jsonb)
                   from public.venda_entradas e join public.vendas v on v.id = e.venda_id where v.carro_id = p_carro_id),
    'notas_fiscais', (select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at), '[]'::jsonb) from public.notas_fiscais n where n.carro_id = p_carro_id),
    'pericias', (select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at), '[]'::jsonb) from public.pericias p where p.carro_id = p_carro_id),
    'anuncios', (select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at), '[]'::jsonb) from public.anuncios a where a.carro_id = p_carro_id),
    'observacoes', (select coalesce(jsonb_agg(to_jsonb(o) order by o.created_at), '[]'::jsonb) from public.observacoes o where o.carro_id = p_carro_id),
    'controle_envelopes', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]'::jsonb) from public.controle_envelopes c where c.carro_id = p_carro_id)
  );

  insert into public.finalizados as f (
    id, placa, modelo, ano_fab, ano_mod, hodometro, cor, chassi, renavam, ano_ipva_pago, crv,
    data_entrada, data_venda, data_entrega, vendedor, valor_venda, valor_entrada, valor_seguro, seguradora,
    valor_financiamento, banco_financiamento, forma_pagamento,
    comprador_nome, comprador_documento, comprador_telefone, comprador_email, comprador_endereco,
    origem, valor_compra, fornecedor_nome, fornecedor_documento, fornecedor_contato,
    nota_entrada_numero, nota_entrada_chave, nota_saida_numero, nota_saida_chave,
    origem_troca_carro_id, carros_troca_ids, documentos_pasta_id, documentos_expiram_em, snapshot, finalizado_em
  ) values (
    v_carro.id, v_carro.placa, coalesce(v_modelo, '-'), v_carro.ano_fab, v_carro.ano_mod, v_carro.hodometro, v_carro.cor,
    v_carro.chassi, v_carro.renavam, v_carro.ano_ipva_pago, v_carro.crv,
    v_carro.data_entrada, v_carro.data_venda, v_venda.data_entrega, v_vendedor, v_venda.valor_total, v_venda.valor_entrada,
    v_venda.seguro_valor, v_venda.seguro_seguradora, v_venda.financ_valor, v_venda.financ_banco, v_venda.forma_pagamento,
    v_venda.comprador_nome, v_venda.comprador_documento, v_venda.comprador_telefone, v_venda.comprador_email,
    nullif(concat_ws(' - ', v_venda.comprador_endereco, v_venda.comprador_cidade_estado, v_venda.comprador_cep), ''),
    v_doc.origem, v_doc.valor_compra, v_rem.nome, v_rem.cpf_cnpj, v_rem.contato,
    v_nf_ent.numero, v_nf_ent.chave_acesso, v_nf_sai.numero, v_nf_sai.chave_acesso,
    v_origem_troca, v_trocas, v_pasta, (v_carro.data_venda + interval '5 years')::date, v_snapshot, now()
  )
  on conflict (id) do update set
    placa = excluded.placa, modelo = excluded.modelo, ano_fab = excluded.ano_fab, ano_mod = excluded.ano_mod,
    hodometro = excluded.hodometro, cor = excluded.cor, chassi = excluded.chassi, renavam = excluded.renavam,
    ano_ipva_pago = excluded.ano_ipva_pago, crv = excluded.crv, data_entrada = excluded.data_entrada,
    data_venda = excluded.data_venda, data_entrega = excluded.data_entrega, vendedor = excluded.vendedor,
    valor_venda = excluded.valor_venda, valor_entrada = excluded.valor_entrada, valor_seguro = excluded.valor_seguro,
    seguradora = excluded.seguradora, valor_financiamento = excluded.valor_financiamento,
    banco_financiamento = excluded.banco_financiamento, forma_pagamento = excluded.forma_pagamento,
    comprador_nome = excluded.comprador_nome, comprador_documento = excluded.comprador_documento,
    comprador_telefone = excluded.comprador_telefone, comprador_email = excluded.comprador_email,
    comprador_endereco = excluded.comprador_endereco, origem = excluded.origem, valor_compra = excluded.valor_compra,
    fornecedor_nome = excluded.fornecedor_nome, fornecedor_documento = excluded.fornecedor_documento,
    fornecedor_contato = excluded.fornecedor_contato, nota_entrada_numero = excluded.nota_entrada_numero,
    nota_entrada_chave = excluded.nota_entrada_chave, nota_saida_numero = excluded.nota_saida_numero,
    nota_saida_chave = excluded.nota_saida_chave, origem_troca_carro_id = excluded.origem_troca_carro_id,
    carros_troca_ids = excluded.carros_troca_ids, documentos_pasta_id = excluded.documentos_pasta_id,
    documentos_expiram_em = excluded.documentos_expiram_em, snapshot = excluded.snapshot, finalizado_em = now();

  -- Ponteiros que apontavam para este veiculo passam para o snapshot (mesmo id).
  update public.documentos
     set origem_finalizado_id = p_carro_id, origem_venda_id = null
   where origem_venda_id in (select v.id from public.vendas v where v.carro_id = p_carro_id);
  update public.venda_entradas
     set carro_troca_finalizado_id = p_carro_id, carro_troca_id = null
   where carro_troca_id = p_carro_id;

  -- Pasta de documentos fica arquivada (5 anos); fotos ja sairam do storage.
  update public.arquivo_automacao_folders
     set archived_at = now(), carro_id = null
   where automation_key = 'vehicle_documents' and carro_id = p_carro_id;
  delete from public.arquivo_automacao_folders where automation_key = 'vehicle_photos' and carro_id = p_carro_id;

  -- Dados do veiculo (vendas primeiro: carros.id e restrict em vendas).
  delete from public.vendas where carro_id = p_carro_id;
  delete from public.carros where id = p_carro_id;

  return jsonb_build_object('finalizado_id', p_carro_id, 'placa', v_carro.placa::text, 'documentos_pasta_id', v_pasta);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5) Disparo: token interno + chave liga/desliga + pg_cron (de hora em hora,
--    a rota processa um lote por vez).
-- ---------------------------------------------------------------------------
insert into internal.app_settings (key, value)
values ('token_cron_finalizacao', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;
insert into internal.app_settings (key, value) values ('finalizacao_ativa', 'false') on conflict (key) do nothing;

create or replace function public.fn_cron_token_valido(p_token text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(length(p_token), 0) >= 32 and exists (
    select 1 from internal.app_settings s where s.key = 'token_cron_finalizacao' and s.value = p_token
  );
$function$;

create or replace function public.fn_finalizacao_ativa()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (select 1 from internal.app_settings s where s.key = 'finalizacao_ativa' and s.value = 'true');
$function$;

create or replace function public.fn_disparar_finalizacao()
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_token text;
begin
  select value into v_token from internal.app_settings where key = 'token_cron_finalizacao';
  if v_token is null then return null; end if;
  return net.http_post(
    url := 'https://rn-gestor.vercel.app/api/v1/internal/finalizacao',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', v_token),
    timeout_milliseconds := 60000
  );
end;
$function$;

-- Nada disso e exposto: so o service_role (app) e o proprio banco (cron) chamam.
revoke all on function public.fn_finalizar_veiculo(uuid) from public, anon, authenticated;
revoke all on function public.fn_cron_token_valido(text) from public, anon, authenticated;
revoke all on function public.fn_finalizacao_ativa() from public, anon, authenticated;
revoke all on function public.fn_disparar_finalizacao() from public, anon, authenticated;
grant execute on function public.fn_finalizar_veiculo(uuid) to service_role;
grant execute on function public.fn_cron_token_valido(text) to service_role;
grant execute on function public.fn_finalizacao_ativa() to service_role;

select cron.schedule('rn-gestor-finalizacao', '0 * * * *', $cron$select public.fn_disparar_finalizacao()$cron$);
