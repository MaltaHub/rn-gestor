-- Keep car/ad state and car date bookkeeping consistent.

insert into public.lookup_announcement_statuses (code, name, description, is_active, sort_order, updated_at)
values ('AUSENTE', 'Ausente', 'Sem anuncio ativo vinculado ao veiculo.', true, 0, now())
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    is_active = true,
    sort_order = excluded.sort_order,
    updated_at = now();

insert into public.lookup_vehicle_states (code, name, description, is_active, sort_order, updated_at)
values ('PREPARAÇÃO', 'Preparação', 'Veiculo em preparacao operacional.', true, 11, now())
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    is_active = true,
    sort_order = excluded.sort_order,
    updated_at = now();

alter table public.carros
  alter column estado_veiculo set default 'PREPARAÇÃO',
  alter column estado_anuncio set default 'AUSENTE';

alter table public.anuncios
  alter column estado_anuncio set default 'AUSENTE';

update public.carros
set estado_veiculo = 'PREPARAÇÃO'
where estado_veiculo is null
   or btrim(estado_veiculo) = '';

update public.carros as c
set estado_anuncio = coalesce(
  (
    select a.estado_anuncio
    from public.anuncios as a
    where a.carro_id = c.id
    limit 1
  ),
  'AUSENTE'
)
where c.estado_anuncio is distinct from coalesce(
  (
    select a.estado_anuncio
    from public.anuncios as a
    where a.carro_id = c.id
    limit 1
  ),
  'AUSENTE'
);

create or replace function public.fn_set_carros_timestamps()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.created_at is null then
      new.created_at := now();
    end if;

    if new.data_entrada is null then
      new.data_entrada := current_date;
    end if;

    new.estado_veiculo := coalesce(nullif(btrim(new.estado_veiculo), ''), 'PREPARAÇÃO');
    new.estado_anuncio := coalesce(nullif(btrim(new.estado_anuncio), ''), 'AUSENTE');
  else
    new.created_at := old.created_at;
    new.data_entrada := old.data_entrada;

    if new.estado_veiculo is null or btrim(new.estado_veiculo) = '' then
      new.estado_veiculo := coalesce(old.estado_veiculo, 'PREPARAÇÃO');
    end if;

    if new.estado_anuncio is null or btrim(new.estado_anuncio) = '' then
      new.estado_anuncio := coalesce(old.estado_anuncio, 'AUSENTE');
    end if;
  end if;

  new.updated_at := now();
  new.ultima_alteracao := new.updated_at;
  return new;
end;
$$;

create or replace function public.handle_anuncios_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    with affected as (
      select distinct carro_id
      from new_rows
      where carro_id is not null
    ),
    resolved as (
      select
        affected.carro_id,
        coalesce(
          (
            select a.estado_anuncio
            from public.anuncios as a
            where a.carro_id = affected.carro_id
            limit 1
          ),
          'AUSENTE'
        ) as estado_anuncio
      from affected
    )
    update public.carros as c
    set estado_anuncio = resolved.estado_anuncio
    from resolved
    where c.id = resolved.carro_id
      and c.estado_anuncio is distinct from resolved.estado_anuncio;
  elsif tg_op = 'UPDATE' then
    with affected as (
      select carro_id
      from old_rows
      where carro_id is not null
      union
      select carro_id
      from new_rows
      where carro_id is not null
    ),
    resolved as (
      select
        affected.carro_id,
        coalesce(
          (
            select a.estado_anuncio
            from public.anuncios as a
            where a.carro_id = affected.carro_id
            limit 1
          ),
          'AUSENTE'
        ) as estado_anuncio
      from affected
    )
    update public.carros as c
    set estado_anuncio = resolved.estado_anuncio
    from resolved
    where c.id = resolved.carro_id
      and c.estado_anuncio is distinct from resolved.estado_anuncio;
  elsif tg_op = 'DELETE' then
    with affected as (
      select distinct carro_id
      from old_rows
      where carro_id is not null
    ),
    resolved as (
      select
        affected.carro_id,
        coalesce(
          (
            select a.estado_anuncio
            from public.anuncios as a
            where a.carro_id = affected.carro_id
            limit 1
          ),
          'AUSENTE'
        ) as estado_anuncio
      from affected
    )
    update public.carros as c
    set estado_anuncio = resolved.estado_anuncio
    from resolved
    where c.id = resolved.carro_id
      and c.estado_anuncio is distinct from resolved.estado_anuncio;
  end if;

  perform public.refresh_anuncios_reference_projection();
  return null;
end;
$$;

revoke all on function public.handle_anuncios_after_change() from public, anon, authenticated;
grant execute on function public.handle_anuncios_after_change() to service_role;

update public.modelos
set modelo = upper(btrim(modelo::text))
where modelo::text is distinct from upper(btrim(modelo::text));

create or replace function public.fn_normalize_modelos_modelo()
returns trigger
language plpgsql
as $$
begin
  new.modelo := upper(btrim(new.modelo::text));
  return new;
end;
$$;

drop trigger if exists trg_modelos_normalize_modelo on public.modelos;
create trigger trg_modelos_normalize_modelo
before insert or update of modelo on public.modelos
for each row
execute function public.fn_normalize_modelos_modelo();

alter table public.modelos
  drop constraint if exists ck_modelos_modelo_uppercase;

alter table public.modelos
  add constraint ck_modelos_modelo_uppercase
  check (modelo::text = upper(modelo::text));

comment on column public.modelos.modelo is 'Modelo normalizado em UPPERCASE por trigger e constraint ck_modelos_modelo_uppercase.';

create table if not exists public.documentos (
  carro_id uuid primary key references public.carros(id) on update cascade on delete cascade,
  doc_entrada boolean not null default false,
  envelope boolean not null default false,
  pericia boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.documentos enable row level security;

drop trigger if exists trg_documentos_timestamps on public.documentos;
create trigger trg_documentos_timestamps
before insert or update on public.documentos
for each row
execute function public.fn_set_timestamps();

comment on table public.documentos is 'Checklist documental por veiculo; carro_id e chave primaria e referencia public.carros(id).';
comment on column public.documentos.doc_entrada is 'Documento de entrada recebido.';
comment on column public.documentos.envelope is 'Envelope documental recebido.';
comment on column public.documentos.pericia is 'Pericia documental recebida.';
