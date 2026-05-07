alter table public.carros
  add column if not exists tem_fotos boolean not null default false;

insert into public.arquivos_pastas (nome, nome_slug, descricao)
values
  ('Fotos dos Veiculos', 'fotos-dos-veiculos', 'Repositorio de fotos dos veiculos nao vendidos.'),
  ('Vendidos', 'vendidos', 'Repositorio de fotos dos veiculos vendidos.'),
  ('Documentos', 'documentos', 'Repositorio de documentos dos veiculos.'),
  ('Documentos Vendidos', 'documentos-vendidos', 'Arquivo de documentos de veiculos vendidos ou removidos.')
on conflict (nome_slug) do nothing;

alter table public.arquivos_pastas
  drop constraint if exists arquivos_pastas_nome_slug_key;

drop index if exists public.arquivos_pastas_nome_slug_key;
drop index if exists public.ux_arquivos_pastas_root_slug;
drop index if exists public.ux_arquivos_pastas_parent_slug;

create unique index ux_arquivos_pastas_root_slug
  on public.arquivos_pastas (nome_slug)
  where parent_folder_id is null;

create unique index ux_arquivos_pastas_parent_slug
  on public.arquivos_pastas (parent_folder_id, nome_slug)
  where parent_folder_id is not null;

create table if not exists public.arquivo_automacao_config (
  automation_key text primary key,
  repository_folder_id uuid not null references public.arquivos_pastas(id) on update cascade on delete restrict,
  display_field text not null default 'placa',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.usuarios_acesso(id) on delete set null,
  constraint arquivo_automacao_config_key_check
    check (automation_key in (
      'vehicle_photos_active',
      'vehicle_photos_sold',
      'vehicle_documents_active',
      'vehicle_documents_archive'
    )),
  constraint arquivo_automacao_config_display_field_check
    check (display_field in ('placa', 'nome', 'chassi', 'modelo', 'id'))
);

alter table public.arquivo_automacao_config enable row level security;

drop trigger if exists trg_arquivo_automacao_config_timestamps on public.arquivo_automacao_config;
create trigger trg_arquivo_automacao_config_timestamps
before insert or update on public.arquivo_automacao_config
for each row
execute function public.fn_set_timestamps();

insert into public.arquivo_automacao_config (automation_key, repository_folder_id, display_field)
select 'vehicle_photos_active', id, 'placa'
from public.arquivos_pastas
where parent_folder_id is null and nome_slug = 'fotos-dos-veiculos'
on conflict (automation_key) do nothing;

insert into public.arquivo_automacao_config (automation_key, repository_folder_id, display_field)
select 'vehicle_photos_sold', id, 'placa'
from public.arquivos_pastas
where parent_folder_id is null and nome_slug = 'vendidos'
on conflict (automation_key) do nothing;

insert into public.arquivo_automacao_config (automation_key, repository_folder_id, display_field)
select 'vehicle_documents_active', id, 'placa'
from public.arquivos_pastas
where parent_folder_id is null and nome_slug = 'documentos'
on conflict (automation_key) do nothing;

insert into public.arquivo_automacao_config (automation_key, repository_folder_id, display_field)
select 'vehicle_documents_archive', id, 'placa'
from public.arquivos_pastas
where parent_folder_id is null and nome_slug = 'documentos-vendidos'
on conflict (automation_key) do nothing;

create table if not exists public.arquivo_automacao_folders (
  id uuid primary key default gen_random_uuid(),
  automation_key text not null,
  folder_id uuid not null references public.arquivos_pastas(id) on update cascade on delete cascade,
  carro_id uuid references public.carros(id) on update cascade on delete set null,
  entity_snapshot jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint arquivo_automacao_folders_key_check
    check (automation_key in ('vehicle_photos', 'vehicle_documents')),
  constraint arquivo_automacao_folders_snapshot_object_check
    check (jsonb_typeof(entity_snapshot) = 'object')
);

alter table public.arquivo_automacao_folders enable row level security;

drop trigger if exists trg_arquivo_automacao_folders_timestamps on public.arquivo_automacao_folders;
create trigger trg_arquivo_automacao_folders_timestamps
before insert or update on public.arquivo_automacao_folders
for each row
execute function public.fn_set_timestamps();

create unique index if not exists ux_arquivo_automacao_folders_folder
  on public.arquivo_automacao_folders (folder_id);

create unique index if not exists ux_arquivo_automacao_folders_active_car
  on public.arquivo_automacao_folders (automation_key, carro_id)
  where carro_id is not null;

create index if not exists ix_arquivo_automacao_config_repository
  on public.arquivo_automacao_config (repository_folder_id);

create index if not exists ix_arquivo_automacao_folders_carro
  on public.arquivo_automacao_folders (carro_id);

comment on column public.carros.tem_fotos is 'Indica se o veiculo tem ao menos um arquivo na pasta de fotos gerenciada pela automacao.';
comment on table public.arquivo_automacao_config is 'Configuracao dos repositorios usados pelas automacoes de arquivos.';
comment on table public.arquivo_automacao_folders is 'Mapeamento entre pastas gerenciadas por automacao e veiculos.';
