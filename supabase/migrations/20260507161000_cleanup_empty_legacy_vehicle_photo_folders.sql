with config as (
  select repository_folder_id as active_folder_id
  from public.arquivo_automacao_config
  where automation_key = 'vehicle_photos_active'
),
legacy_empty_folders as (
  select old_folder.id
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
    and not exists (
      select 1
      from public.arquivos_arquivos as a
      where a.pasta_id = old_folder.id
    )
    and not exists (
      select 1
      from public.arquivos_pastas as child
      where child.parent_folder_id = old_folder.id
    )
)
delete from public.arquivos_pastas as p
using legacy_empty_folders
where p.id = legacy_empty_folders.id;
