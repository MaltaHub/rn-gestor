-- Pedidos explicitos do Kaic (2026-11-06):
--  1) Situacao do CRLV ganha o estado PROCURACAO (antes era mapeado para BRANCO).
--     Ordem: AGUARDANDO < BRANCO < PROCURACAO < VIRADO (arquivo nunca rebaixa).
--     O documento "Procuracao" classificado na pasta passa a marcar PROCURACAO.
--  2) Fornecedor (remetentes) ganha o campo contato.

insert into public.lookups (domain, code, name, sort_order, is_active)
values ('estados_transferencia', 'PROCURACAO', 'Procuração', 3, true)
on conflict (domain, code) do update
  set name = excluded.name, sort_order = excluded.sort_order, is_active = true, updated_at = now();

update public.lookups set sort_order = 4, updated_at = now()
 where domain = 'estados_transferencia' and code = 'VIRADO';

alter table public.remetentes add column if not exists contato text;
comment on column public.remetentes.contato is 'Contato do fornecedor (telefone, e-mail, pessoa).';

-- Os 10 veiculos que estavam como PROCURACAO antes de 2026-11-05 (snapshot) e
-- foram para BRANCO por falta do estado voltam a PROCURACAO.
update public.documentos
   set estado_transferencia = 'PROCURACAO'
 where estado_transferencia = 'BRANCO'
   and carro_id in (
     'ae28d273-71fb-4a82-b9cd-1986bda3659f', 'd961ee1e-de7c-4427-a48b-3179c9563ed5',
     '4f2a875e-8fd9-4a87-b219-f9c473235ffd', 'bdea4030-7bc7-4d8d-b3a6-7f023d319415',
     'cbf6b002-4df2-44ef-ad83-f13f24b7d39a', '89ca9210-f24e-4df7-8497-375aaa06ae9f',
     '7d482953-dd81-4812-bf63-291b866abe7e', '5b33d77a-42ee-4909-a0a3-1d574c70f852',
     'b3ba2f59-6e2e-42d5-badc-a7ad8599f190', '47ff7321-e0dc-4bb6-9d6d-e83b911ac436'
   );

create or replace function public.fn_documentos_normaliza_crlv()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_resp text := upper(btrim(coalesce(new.responsavel_virado, '')));
  v_estado_mudou boolean;
  v_resp_mudou boolean;
begin
  if tg_op = 'INSERT' then
    -- No INSERT o default da coluna (AGUARDANDO) nao conta como escolha.
    v_estado_mudou := coalesce(new.estado_transferencia, 'AGUARDANDO') <> 'AGUARDANDO';
    v_resp_mudou := true;
  else
    v_estado_mudou := new.estado_transferencia is distinct from old.estado_transferencia;
    v_resp_mudou := new.responsavel_virado is distinct from old.responsavel_virado;
  end if;

  if v_resp in ('NÃO CHEGOU', 'NAO CHEGOU') then
    new.estado_transferencia := 'AGUARDANDO';
    new.responsavel_virado := null;
  elsif v_resp in ('PROCURAÇÃO', 'PROCURACAO') then
    new.estado_transferencia := 'PROCURACAO';
    new.responsavel_virado := null;
  elsif v_resp = 'BRANCO' then
    new.estado_transferencia := 'BRANCO';
    new.responsavel_virado := null;
  elsif v_resp = '' then
    new.responsavel_virado := null;
  elsif v_resp_mudou and not v_estado_mudou then
    -- Titular informado (sem escolher a situacao) = CRLV virado no nome dele.
    new.estado_transferencia := 'VIRADO';
  end if;

  if new.estado_transferencia is null then
    new.estado_transferencia := 'AGUARDANDO';
  end if;
  -- Titular so existe com o CRLV virado.
  if new.estado_transferencia <> 'VIRADO' then
    new.responsavel_virado := null;
  end if;
  return new;
end;
$function$;

create or replace function public.fn_documentos_parse_token(p_filename text, p_carro_placa text)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_norm text;
  v_placa text;
  v_result jsonb := '{}'::jsonb;
  v_match text;
begin
  if p_filename is null or p_carro_placa is null then return '{}'::jsonb; end if;
  v_norm := lower(p_filename);
  v_placa := lower(btrim(p_carro_placa));
  if v_placa = '' then return '{}'::jsonb; end if;

  if strpos(v_norm, 'crlv_virado_' || v_placa) > 0 or strpos(v_norm, 'estado_transferencia_virado_' || v_placa) > 0 then
    v_result := v_result || '{"crlv": "VIRADO"}'::jsonb;
  elsif strpos(v_norm, 'procuracao_' || v_placa) > 0 then
    v_result := v_result || '{"crlv": "PROCURACAO"}'::jsonb;
  elsif strpos(v_norm, 'crlv_branco_' || v_placa) > 0 or strpos(v_norm, 'crlv_' || v_placa) > 0 then
    v_result := v_result || '{"crlv": "BRANCO"}'::jsonb;
  end if;

  if strpos(v_norm, 'nota_entrada_' || v_placa) > 0 then
    v_result := v_result || '{"nota": "ENTRADA"}'::jsonb;
  elsif strpos(v_norm, 'nota_saida_' || v_placa) > 0 then
    v_result := v_result || '{"nota": "SAIDA"}'::jsonb;
  end if;

  if strpos(v_norm, 'pericia_' || v_placa) > 0 then
    v_result := v_result || '{"pericia": true}'::jsonb;
  end if;

  select code into v_match from public.lookups
   where domain = 'estados_envelope' and is_active
     and strpos(v_norm, 'envelope_' || lower(code) || '_' || v_placa) > 0
   order by sort_order desc, code desc
   limit 1;
  if v_match is not null then v_result := v_result || jsonb_build_object('envelope', v_match); end if;

  return v_result;
end;
$function$;

create or replace function public.fn_documentos_reparse_carro(p_carro_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_placa text;
  v_root_folder uuid;
  v_paused boolean;
  v_file record;
  v_tokens jsonb;
  v_rank int := 0;
  v_file_rank int;
  v_crlv text;
  v_envelope text;
  v_rank_atual int;
begin
  select c.placa::text into v_placa from public.carros c where c.id = p_carro_id;
  if v_placa is null then return; end if;

  select folder_id, automation_paused into v_root_folder, v_paused
    from public.arquivo_automacao_folders
   where automation_key = 'vehicle_documents' and carro_id = p_carro_id and archived_at is null
   limit 1;
  if v_root_folder is null then return; end if;
  if coalesce(v_paused, false) then return; end if;

  for v_file in
    with recursive subtree(folder_id) as (
      select v_root_folder
      union all
      select f.id from public.arquivos_pastas f join subtree s on f.parent_folder_id = s.folder_id
    )
    select a.id, a.nome_arquivo
      from public.arquivos_arquivos a join subtree s on s.folder_id = a.pasta_id
     order by a.created_at asc, a.id asc
  loop
    v_tokens := public.fn_documentos_parse_token(v_file.nome_arquivo, v_placa);

    -- Mais forte vence: VIRADO (3) > PROCURACAO (2) > BRANCO (1).
    if v_tokens ? 'crlv' then
      v_file_rank := case v_tokens->>'crlv' when 'VIRADO' then 3 when 'PROCURACAO' then 2 else 1 end;
      if v_file_rank > v_rank then
        v_rank := v_file_rank;
        v_crlv := v_tokens->>'crlv';
      end if;
    end if;
    if v_tokens ? 'envelope' then v_envelope := v_tokens->>'envelope'; end if;

    if v_tokens ? 'nota' then
      insert into public.notas_fiscais (carro_id, tipo, arquivo_id)
      values (p_carro_id, v_tokens->>'nota', v_file.id)
      on conflict (arquivo_id) do nothing;
    end if;
    if v_tokens ? 'pericia' then
      insert into public.pericias (carro_id, arquivo_id)
      values (p_carro_id, v_file.id)
      on conflict (arquivo_id) do nothing;
    end if;
  end loop;

  if v_crlv is null and v_envelope is null then return; end if;

  select case d.estado_transferencia when 'VIRADO' then 3 when 'PROCURACAO' then 2 when 'BRANCO' then 1 else 0 end
    into v_rank_atual
    from public.documentos d where d.carro_id = p_carro_id;

  insert into public.documentos as d (carro_id, estado_transferencia, envelope)
  values (p_carro_id, coalesce(v_crlv, 'AGUARDANDO'), v_envelope)
  on conflict (carro_id) do update set
    -- Arquivo nunca rebaixa a situacao (so sobe).
    estado_transferencia = case when v_crlv is not null and v_rank > coalesce(v_rank_atual, 0) then v_crlv else d.estado_transferencia end,
    envelope = coalesce(v_envelope, d.envelope),
    updated_at = now()
  where (v_crlv is not null and v_rank > coalesce(v_rank_atual, 0))
     or (v_envelope is not null and d.envelope is distinct from v_envelope);
end;
$function$;
