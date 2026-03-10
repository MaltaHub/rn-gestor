create schema if not exists internal;

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on tables from authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon;
alter default privileges for role postgres in schema public revoke all on functions from authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on sequences from authenticated;

revoke all on function public.fn_set_timestamps() from anon, authenticated;
revoke all on function public.fn_set_carros_timestamps() from anon, authenticated;

drop table if exists public.sales_summary;
drop table if exists public.vehicles;

alter table public.usuarios_acesso
  add column if not exists auth_user_id uuid;

update public.usuarios_acesso as ua
set auth_user_id = au.id
from auth.users as au
where ua.auth_user_id is null
  and ua.email is not null
  and lower(btrim(ua.email::text)) = lower(btrim(au.email));

create unique index if not exists ux_usuarios_auth_user_id
  on public.usuarios_acesso (auth_user_id)
  where auth_user_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'usuarios_acesso_auth_user_id_fkey'
  ) then
    alter table public.usuarios_acesso
      add constraint usuarios_acesso_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users(id)
      on update cascade
      on delete set null;
  end if;
end $$;

alter table public.usuarios_acesso
  drop column if exists senha_hash,
  drop column if exists senha_salt;

create or replace function internal.upsert_usuario_acesso_from_auth(target_auth_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  auth_record auth.users%rowtype;
  existing_profile_id uuid;
  default_role text;
  default_status text;
  fallback_role text;
  fallback_status text;
  inferred_name text;
begin
  select *
  into auth_record
  from auth.users
  where id = target_auth_user_id;

  if not found then
    raise exception 'AUTH_USER_NOT_FOUND: %', target_auth_user_id;
  end if;

  inferred_name := nullif(
    btrim(
      coalesce(
        auth_record.raw_user_meta_data ->> 'full_name',
        auth_record.raw_user_meta_data ->> 'name',
        split_part(coalesce(auth_record.email, ''), '@', 1)
      )
    ),
    ''
  );

  if inferred_name is null then
    inferred_name := 'Usuario';
  end if;

  select code
  into default_status
  from public.lookup_user_statuses
  where code = 'APROVADO'
    and is_active = true
  limit 1;

  if default_status is null then
    select code
    into default_status
    from public.lookup_user_statuses
    where is_active = true
    order by sort_order asc, code asc
    limit 1;
  end if;

  if default_status is null then
    raise exception 'LOOKUP_USER_STATUS_MISSING';
  end if;

  select code
  into fallback_role
  from public.lookup_user_roles
  where code = 'VENDEDOR'
    and is_active = true
  limit 1;

  if fallback_role is null then
    select code
    into fallback_role
    from public.lookup_user_roles
    where is_active = true
    order by sort_order asc, code asc
    limit 1;
  end if;

  select code
  into default_role
  from public.lookup_user_roles
  where code = 'ADMINISTRADOR'
    and is_active = true
  limit 1;

  if default_role is null then
    default_role := fallback_role;
  end if;

  if exists (
    select 1
    from public.usuarios_acesso
    where auth_user_id is not null
  ) then
    default_role := fallback_role;
  end if;

  select id
  into existing_profile_id
  from public.usuarios_acesso
  where auth_user_id = target_auth_user_id
  limit 1;

  if existing_profile_id is null and auth_record.email is not null then
    select id
    into existing_profile_id
    from public.usuarios_acesso
    where auth_user_id is null
      and email is not null
      and lower(btrim(email::text)) = lower(btrim(auth_record.email))
    limit 1;
  end if;

  if existing_profile_id is not null then
    update public.usuarios_acesso
    set auth_user_id = target_auth_user_id,
        email = coalesce(auth_record.email, email),
        nome = case
          when nome is null or btrim(nome::text) = '' then inferred_name
          else nome
        end,
        ultimo_login = coalesce(auth_record.last_sign_in_at, ultimo_login),
        updated_at = now()
    where id = existing_profile_id;

    return existing_profile_id;
  end if;

  insert into public.usuarios_acesso (
    id,
    auth_user_id,
    nome,
    email,
    cargo,
    status,
    criado_em,
    aprovado_em,
    ultimo_login,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    target_auth_user_id,
    inferred_name,
    auth_record.email,
    default_role,
    default_status,
    now(),
    case when default_status = 'APROVADO' then now() else null end,
    auth_record.last_sign_in_at,
    now(),
    now()
  )
  returning id into existing_profile_id;

  return existing_profile_id;
end;
$$;

create or replace function internal.handle_auth_user_profile_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform internal.upsert_usuario_acesso_from_auth(new.id);
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_sync_usuarios_acesso_from_auth'
      and tgrelid = 'auth.users'::regclass
  ) then
    execute '
      create trigger trg_sync_usuarios_acesso_from_auth
      after insert or update of email, raw_user_meta_data, last_sign_in_at
      on auth.users
      for each row
      execute function internal.handle_auth_user_profile_sync()
    ';
  end if;
end $$;

do $$
declare
  auth_user record;
begin
  for auth_user in
    select id from auth.users
  loop
    perform internal.upsert_usuario_acesso_from_auth(auth_user.id);
  end loop;
end $$;

create index if not exists ix_carros_created_at_desc
  on public.carros (created_at desc);

create index if not exists ix_anuncios_created_at_desc
  on public.anuncios (created_at desc);

create or replace function public.refresh_repetidos_projection()
returns table(grupos_repetidos integer, registros_repetidos integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  truncate table public.repetidos, public.grupos_repetidos;

  return query
  with duplicated_groups as (
    select
      c.modelo_id,
      coalesce(c.cor, '') as cor,
      c.ano_mod,
      c.preco_original,
      min(coalesce(c.preco_original, 0)) as preco_min,
      max(coalesce(c.preco_original, 0)) as preco_max,
      min(coalesce(c.hodometro, 0)) as hodometro_min,
      max(coalesce(c.hodometro, 0)) as hodometro_max,
      count(*)::integer as qtde,
      array_agg(c.id order by c.id) as carros_ids
    from public.carros as c
    where c.em_estoque = true
    group by c.modelo_id, coalesce(c.cor, ''), c.ano_mod, c.preco_original
    having count(*) > 1
  ),
  inserted_groups as (
    insert into public.grupos_repetidos (
      grupo_id,
      modelo_id,
      cor,
      ano_mod,
      preco_original,
      preco_min,
      preco_max,
      hodometro_min,
      hodometro_max,
      qtde,
      atualizado_em
    )
    select
      gen_random_uuid(),
      dg.modelo_id,
      dg.cor,
      dg.ano_mod,
      dg.preco_original,
      dg.preco_min,
      dg.preco_max,
      dg.hodometro_min,
      dg.hodometro_max,
      dg.qtde,
      now()
    from duplicated_groups as dg
    returning grupo_id, modelo_id, cor, ano_mod, preco_original
  ),
  inserted_items as (
    insert into public.repetidos (carro_id, grupo_id)
    select repeated.carro_id, ig.grupo_id
    from inserted_groups as ig
    join duplicated_groups as dg
      on dg.modelo_id = ig.modelo_id
     and dg.cor = ig.cor
     and dg.ano_mod is not distinct from ig.ano_mod
     and dg.preco_original is not distinct from ig.preco_original
    cross join lateral unnest(dg.carros_ids) as repeated(carro_id)
    returning 1
  )
  select
    coalesce((select count(*) from inserted_groups), 0)::integer,
    coalesce((select count(*) from inserted_items), 0)::integer;
end;
$$;

revoke all on function public.refresh_repetidos_projection() from anon, authenticated;
grant execute on function public.refresh_repetidos_projection() to service_role;
