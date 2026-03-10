-- Renomeia anuncios.target_id -> anuncios.carro_id (idempotente)

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'anuncios'
      and column_name = 'target_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'anuncios'
      and column_name = 'carro_id'
  ) then
    execute 'alter table public.anuncios rename column target_id to carro_id';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'anuncios_target_id_fkey'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'anuncios_carro_id_fkey'
  ) then
    execute 'alter table public.anuncios rename constraint anuncios_target_id_fkey to anuncios_carro_id_fkey';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'i'
      and c.relname = 'anuncios_target_id_idx'
  ) and not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'i'
      and c.relname = 'anuncios_carro_id_idx'
  ) then
    execute 'alter index public.anuncios_target_id_idx rename to anuncios_carro_id_idx';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'anuncios'
      and column_name = 'carro_id'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'anuncios_carro_id_fkey'
  ) then
    alter table public.anuncios
      add constraint anuncios_carro_id_fkey
      foreign key (carro_id) references public.carros(id);
  end if;
end $$;
