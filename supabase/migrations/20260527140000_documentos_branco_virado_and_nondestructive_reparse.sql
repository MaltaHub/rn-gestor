-- Documentos: (1) adiciona valor 'BRANCO' (em branco / pendente) a todos os
-- lookups de estado, (2) adiciona 'VIRADO' ao estado_transferencia (slot
-- crlv_virado), e (3) torna o reparse NAO-DESTRUTIVO:
--   - nunca apaga a linha de documentos;
--   - so atualiza os campos que casaram um token (COALESCE), preservando
--     valores ja existentes (inclusive ajustes manuais, ex.: envelope).
-- Isso permite controle manual coexistir com a automacao por nome de arquivo.

-- 1) 'BRANCO' em todos os lookups de estado de documento.
insert into public.lookup_tipos_processo (code, name, sort_order) values ('BRANCO', 'Em branco', 0) on conflict (code) do nothing;
insert into public.lookup_origens_veiculo (code, name, sort_order) values ('BRANCO', 'Em branco', 0) on conflict (code) do nothing;
insert into public.lookup_propositos (code, name, sort_order) values ('BRANCO', 'Em branco', 0) on conflict (code) do nothing;
insert into public.lookup_estados_chave_reserva (code, name, sort_order) values ('BRANCO', 'Em branco', 0) on conflict (code) do nothing;
insert into public.lookup_estados_pericia (code, name, sort_order) values ('BRANCO', 'Em branco', 0) on conflict (code) do nothing;
insert into public.lookup_estados_envelope (code, name, sort_order) values ('BRANCO', 'Em branco', 0) on conflict (code) do nothing;
insert into public.lookup_estados_transferencia (code, name, sort_order) values ('BRANCO', 'Em branco', 0) on conflict (code) do nothing;

-- 2) 'VIRADO' no estado_transferencia (slot crlv_virado -> estado_transferencia=VIRADO).
insert into public.lookup_estados_transferencia (code, name, sort_order) values ('VIRADO', 'Virado', 25) on conflict (code) do nothing;

-- 3) Reparse nao-destrutivo.
create or replace function public.fn_documentos_reparse_carro(p_carro_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_placa text;
  v_root_folder uuid;
  v_acc jsonb := '{}'::jsonb;
  v_file record;
begin
  select c.placa::text into v_placa from public.carros c where c.id = p_carro_id;
  if v_placa is null then return; end if;

  select folder_id into v_root_folder
    from public.arquivo_automacao_folders
   where automation_key = 'vehicle_documents'
     and carro_id = p_carro_id
     and archived_at is null
   limit 1;

  -- Sem pasta de documentos: nao faz nada (NAO apaga a linha existente).
  if v_root_folder is null then
    return;
  end if;

  for v_file in
    with recursive subtree(folder_id) as (
      select v_root_folder
      union all
      select f.id from public.arquivos_pastas f
       join subtree s on f.parent_folder_id = s.folder_id
    )
    select a.nome_arquivo, a.created_at
      from public.arquivos_arquivos a
      join subtree s on s.folder_id = a.pasta_id
     order by a.created_at asc, a.id asc
  loop
    v_acc := v_acc || public.fn_documentos_parse_token(v_file.nome_arquivo, v_placa);
  end loop;

  -- Nenhum token reconhecido: nao faz nada (NAO apaga, NAO cria linha vazia).
  if v_acc = '{}'::jsonb then
    return;
  end if;

  -- Upsert NAO-DESTRUTIVO: so sobrescreve um campo quando o parse trouxe valor
  -- pra ele; caso contrario mantem o valor atual (manual ou parse anterior).
  insert into public.documentos as d (
    carro_id, tipo_de_processo, origem_veiculo, proposito, chave_reserva,
    remetente, pericia, envelope, estado_transferencia
  ) values (
    p_carro_id,
    v_acc->>'tipo_de_processo',
    v_acc->>'origem_veiculo',
    v_acc->>'proposito',
    v_acc->>'chave_reserva',
    v_acc->>'remetente',
    v_acc->>'pericia',
    v_acc->>'envelope',
    v_acc->>'estado_transferencia'
  )
  on conflict (carro_id) do update set
    tipo_de_processo = coalesce(excluded.tipo_de_processo, d.tipo_de_processo),
    origem_veiculo = coalesce(excluded.origem_veiculo, d.origem_veiculo),
    proposito = coalesce(excluded.proposito, d.proposito),
    chave_reserva = coalesce(excluded.chave_reserva, d.chave_reserva),
    remetente = coalesce(excluded.remetente, d.remetente),
    pericia = coalesce(excluded.pericia, d.pericia),
    envelope = coalesce(excluded.envelope, d.envelope),
    estado_transferencia = coalesce(excluded.estado_transferencia, d.estado_transferencia),
    updated_at = now();
end;
$function$;
revoke execute on function public.fn_documentos_reparse_carro(uuid) from public, anon, authenticated;
