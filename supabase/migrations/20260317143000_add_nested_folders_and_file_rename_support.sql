alter table public.arquivos_pastas
  add column if not exists parent_folder_id uuid null references public.arquivos_pastas(id) on delete cascade;

create index if not exists ix_arquivos_pastas_parent_folder
  on public.arquivos_pastas (parent_folder_id, nome);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'arquivos_pastas_parent_not_self'
  ) then
    alter table public.arquivos_pastas
      add constraint arquivos_pastas_parent_not_self
      check (parent_folder_id is null or parent_folder_id <> id);
  end if;
end
$$;
