do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'arquivos_imagens'
      and c.relkind = 'r'
  ) then
    alter table public.arquivos_imagens rename to arquivos_arquivos;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'ix_arquivos_imagens_pasta_ordem'
      and c.relkind = 'i'
  ) then
    alter index public.ix_arquivos_imagens_pasta_ordem rename to ix_arquivos_arquivos_pasta_ordem;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'arquivos_imagens_pasta_id_fkey'
  ) then
    alter table public.arquivos_arquivos
      rename constraint arquivos_imagens_pasta_id_fkey to arquivos_arquivos_pasta_id_fkey;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'arquivos_imagens_uploaded_by_fkey'
  ) then
    alter table public.arquivos_arquivos
      rename constraint arquivos_imagens_uploaded_by_fkey to arquivos_arquivos_uploaded_by_fkey;
  end if;
end
$$;

alter table if exists public.arquivos_arquivos enable row level security;

update storage.buckets
set
  file_size_limit = 20971520,
  allowed_mime_types = null
where id = 'gestor-arquivos';
