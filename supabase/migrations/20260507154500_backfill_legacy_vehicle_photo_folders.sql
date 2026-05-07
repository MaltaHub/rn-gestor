with config as (
  select
    max(repository_folder_id::text) filter (where automation_key = 'vehicle_photos_active')::uuid as active_folder_id,
    max(repository_folder_id::text) filter (where automation_key = 'vehicle_photos_sold')::uuid as sold_folder_id
  from public.arquivo_automacao_config
),
legacy_folders as (
  select
    old_folder.id as old_folder_id,
    c.id as carro_id,
    lower(c.id::text) as carro_slug,
    case
      when lower(public.normalize_business_token(c.estado_venda)) like '%vend%'
        or lower(public.normalize_business_token(c.estado_venda)) like '%finaliz%'
        or (c.data_venda is not null and c.em_estoque = false)
      then config.sold_folder_id
      else config.active_folder_id
    end as target_parent_folder_id,
    jsonb_build_object(
      'id', c.id,
      'placa', c.placa,
      'nome', c.nome,
      'chassi', c.chassi,
      'displayField', 'placa',
      'displayLabel', coalesce(nullif(btrim(c.placa), ''), c.id::text)
    ) as entity_snapshot
  from public.arquivos_pastas as old_folder
  cross join config
  join public.carros as c
    on upper(c.placa) = upper(old_folder.nome)
  where old_folder.parent_folder_id = config.active_folder_id
    and not exists (
      select 1
      from public.arquivo_automacao_folders as af
      where af.folder_id = old_folder.id
    )
    and exists (
      select 1
      from public.arquivos_arquivos as a
      where a.pasta_id = old_folder.id
    )
),
existing_managed as (
  select
    legacy_folders.*,
    af.folder_id as managed_folder_id
  from legacy_folders
  left join public.arquivo_automacao_folders as af
    on af.automation_key = 'vehicle_photos'
   and af.carro_id = legacy_folders.carro_id
),
inserted_folders as (
  insert into public.arquivos_pastas (nome, nome_slug, descricao, parent_folder_id)
  select
    existing_managed.carro_id::text,
    existing_managed.carro_slug,
    null,
    existing_managed.target_parent_folder_id
  from existing_managed
  where existing_managed.managed_folder_id is null
  on conflict do nothing
  returning id, nome_slug, parent_folder_id
),
resolved_managed as (
  select
    existing_managed.old_folder_id,
    existing_managed.carro_id,
    existing_managed.entity_snapshot,
    coalesce(
      existing_managed.managed_folder_id,
      inserted_folders.id,
      lookup_folder.id
    ) as managed_folder_id
  from existing_managed
  left join inserted_folders
    on inserted_folders.nome_slug = existing_managed.carro_slug
   and inserted_folders.parent_folder_id = existing_managed.target_parent_folder_id
  left join public.arquivos_pastas as lookup_folder
    on lookup_folder.nome_slug = existing_managed.carro_slug
   and lookup_folder.parent_folder_id = existing_managed.target_parent_folder_id
),
inserted_mappings as (
  insert into public.arquivo_automacao_folders (automation_key, folder_id, carro_id, entity_snapshot, archived_at)
  select
    'vehicle_photos',
    resolved_managed.managed_folder_id,
    resolved_managed.carro_id,
    resolved_managed.entity_snapshot,
    null
  from resolved_managed
  where resolved_managed.managed_folder_id is not null
    and not exists (
      select 1
      from public.arquivo_automacao_folders as af
      where af.automation_key = 'vehicle_photos'
        and af.carro_id = resolved_managed.carro_id
    )
  on conflict do nothing
  returning carro_id
),
moved_files as (
  update public.arquivos_arquivos as a
  set
    pasta_id = resolved_managed.managed_folder_id,
    updated_at = now()
  from resolved_managed
  where a.pasta_id = resolved_managed.old_folder_id
    and resolved_managed.managed_folder_id is not null
  returning resolved_managed.old_folder_id, resolved_managed.carro_id
),
deleted_legacy_folders as (
  delete from public.arquivos_pastas as p
  using (
    select distinct old_folder_id
    from moved_files
  ) as moved
  where p.id = moved.old_folder_id
    and not exists (
      select 1
      from public.arquivos_arquivos as a
      where a.pasta_id = p.id
    )
    and not exists (
      select 1
      from public.arquivos_pastas as child
      where child.parent_folder_id = p.id
    )
  returning p.id
)
update public.carros as c
set tem_fotos = true
where exists (
  select 1
  from moved_files
  where moved_files.carro_id = c.id
);
