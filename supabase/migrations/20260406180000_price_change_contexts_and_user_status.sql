create table if not exists public.price_change_contexts (
  id uuid primary key default gen_random_uuid(),
  table_name text not null check (table_name in ('carros','anuncios')),
  row_id uuid not null,
  column_name text not null check (column_name in ('preco_original','valor_anuncio')),
  old_value numeric,
  new_value numeric,
  context text not null,
  created_by uuid null,
  created_at timestamptz not null default now()
);

create index if not exists ix_price_change_contexts_table_row
  on public.price_change_contexts (table_name, row_id, created_at desc);

-- Ensure BANIDO status exists in lookup_user_statuses
insert into public.lookup_user_statuses (code, name, description, is_active, sort_order, created_at, updated_at)
select 'BANIDO', 'Banido', 'Usuario banido, sem acesso ao sistema.', true, 9999, now(), now()
where not exists (
  select 1 from public.lookup_user_statuses where code ilike 'BANIDO' or name ilike 'BANIDO'
);

