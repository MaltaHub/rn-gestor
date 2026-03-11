create table if not exists public.arquivos_pastas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  nome_slug text not null unique,
  descricao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios_acesso(id) on delete set null,
  updated_by uuid references public.usuarios_acesso(id) on delete set null
);

create index if not exists ix_arquivos_pastas_nome
  on public.arquivos_pastas (nome);

create table if not exists public.arquivos_imagens (
  id uuid primary key default gen_random_uuid(),
  pasta_id uuid not null references public.arquivos_pastas(id) on delete cascade,
  bucket_id text not null,
  storage_path text not null unique,
  nome_arquivo text not null,
  mime_type text not null,
  tamanho_bytes bigint not null check (tamanho_bytes >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  uploaded_by uuid references public.usuarios_acesso(id) on delete set null
);

create index if not exists ix_arquivos_imagens_pasta_ordem
  on public.arquivos_imagens (pasta_id, sort_order, created_at);

alter table public.arquivos_pastas enable row level security;
alter table public.arquivos_imagens enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'gestor-arquivos',
  'gestor-arquivos',
  false,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml']
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
