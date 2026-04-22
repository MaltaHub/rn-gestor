-- Harden runtime access around service-role-only tables and privileged helpers.

alter table public.price_change_contexts enable row level security;
alter table public.anuncios_insight_verifications enable row level security;

create index if not exists ix_price_change_contexts_created_by_created_at
  on public.price_change_contexts (created_by, created_at desc)
  where created_by is not null;

create index if not exists ix_anuncios_insight_verifications_verified_by_at
  on public.anuncios_insight_verifications (verified_by, verified_at desc)
  where verified_by is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'price_change_contexts_created_by_fkey'
      and conrelid = 'public.price_change_contexts'::regclass
  ) then
    alter table public.price_change_contexts
      add constraint price_change_contexts_created_by_fkey
      foreign key (created_by) references public.usuarios_acesso(id)
      on update cascade
      on delete set null
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'anuncios_insight_verifications_verified_by_fkey'
      and conrelid = 'public.anuncios_insight_verifications'::regclass
  ) then
    alter table public.anuncios_insight_verifications
      add constraint anuncios_insight_verifications_verified_by_fkey
      foreign key (verified_by) references public.usuarios_acesso(id)
      on update cascade
      on delete set null
      not valid;
  end if;
end $$;

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
  fallback_role text;
  default_status text;
  approved_status text;
  pending_status text;
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
  into pending_status
  from public.lookup_user_statuses
  where code = 'PENDENTE'
    and is_active = true
  limit 1;

  if pending_status is null then
    select code
    into pending_status
    from public.lookup_user_statuses
    where is_active = true
    order by sort_order asc, code asc
    limit 1;
  end if;

  if pending_status is null then
    raise exception 'LOOKUP_USER_STATUS_MISSING';
  end if;

  select code
  into approved_status
  from public.lookup_user_statuses
  where code = 'APROVADO'
    and is_active = true
  limit 1;

  if approved_status is null then
    approved_status := pending_status;
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

  if fallback_role is null then
    raise exception 'LOOKUP_USER_ROLE_MISSING';
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

  default_status := approved_status;
  if exists (
    select 1
    from public.usuarios_acesso
    where auth_user_id is not null
  ) then
    default_role := fallback_role;
    default_status := pending_status;
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
    case when default_status = approved_status then now() else null end,
    auth_record.last_sign_in_at,
    now(),
    now()
  )
  returning id into existing_profile_id;

  return existing_profile_id;
end;
$$;

do $$
declare
  function_signature text;
  target_function regprocedure;
  protected_functions text[] := array[
    'internal.handle_auth_user_profile_sync()',
    'internal.upsert_usuario_acesso_from_auth(uuid)',
    'public.dispatch_supply_carros_payload(jsonb)',
    'public.handle_anuncios_after_change()',
    'public.handle_repetidos_after_carro_caracteristicas_visuais_change()',
    'public.handle_repetidos_after_carro_caracteristicas_visuais_delete()',
    'public.handle_repetidos_after_carro_caracteristicas_visuais_insert()',
    'public.handle_repetidos_after_carro_caracteristicas_visuais_update()',
    'public.handle_repetidos_after_carros_delete()',
    'public.handle_repetidos_after_carros_insert()',
    'public.handle_repetidos_after_carros_update()',
    'public.refresh_anuncios_reference_projection()',
    'public.refresh_repetidos_projection()',
    'public.refresh_repetidos_projection_for_carro(uuid)',
    'public.refresh_repetidos_projection_group(uuid,text,integer,integer)',
    'public.supply_carros_webhook()'
  ];
begin
  revoke usage on schema internal from public, anon, authenticated;
  grant usage on schema internal to service_role;

  foreach function_signature in array protected_functions loop
    target_function := to_regprocedure(function_signature);

    if target_function is not null then
      execute format('revoke all on function %s from public, anon, authenticated', target_function);
      execute format('grant execute on function %s to service_role', target_function);
    end if;
  end loop;
end $$;
