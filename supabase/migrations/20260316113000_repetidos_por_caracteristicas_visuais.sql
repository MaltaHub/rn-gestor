alter table public.grupos_repetidos
  add column if not exists ano_fab integer,
  add column if not exists caracteristicas_visuais_ids uuid[] not null default '{}'::uuid[],
  add column if not exists caracteristicas_visuais_resumo text not null default '';

create index if not exists ix_grupos_repetidos_base_group
  on public.grupos_repetidos (modelo_id, cor, ano_mod, ano_fab);

create index if not exists ix_carros_repetidos_base_group
  on public.carros (modelo_id, (coalesce(btrim(cor), '')), ano_mod, ano_fab)
  where em_estoque = true;

create index if not exists ix_carro_caracteristicas_visuais_carro_id
  on public.carro_caracteristicas_visuais (carro_id, caracteristica_id);

create or replace function public.refresh_repetidos_projection_group(
  p_modelo_id uuid,
  p_cor text,
  p_ano_mod integer,
  p_ano_fab integer
)
returns table(grupos_repetidos integer, registros_repetidos integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_cor text := coalesce(btrim(p_cor), '');
begin
  if p_modelo_id is null then
    return query select 0::integer, 0::integer;
    return;
  end if;

  delete from public.repetidos as r
  using public.grupos_repetidos as g
  where r.grupo_id = g.grupo_id
    and g.modelo_id = p_modelo_id
    and g.cor = normalized_cor
    and g.ano_mod is not distinct from p_ano_mod
    and g.ano_fab is not distinct from p_ano_fab;

  delete from public.grupos_repetidos as g
  where g.modelo_id = p_modelo_id
    and g.cor = normalized_cor
    and g.ano_mod is not distinct from p_ano_mod
    and g.ano_fab is not distinct from p_ano_fab;

  return query
  with candidate_cars as (
    select
      c.id,
      c.modelo_id,
      coalesce(btrim(c.cor), '') as cor,
      c.ano_mod,
      c.ano_fab,
      c.preco_original,
      c.hodometro
    from public.carros as c
    where c.em_estoque = true
      and c.modelo_id = p_modelo_id
      and coalesce(btrim(c.cor), '') = normalized_cor
      and c.ano_mod is not distinct from p_ano_mod
      and c.ano_fab is not distinct from p_ano_fab
  ),
  visuais_por_carro as (
    select
      ccv.carro_id,
      array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id) as caracteristicas_visuais_ids,
      string_agg(distinct cv.caracteristica, ' | ' order by cv.caracteristica) as caracteristicas_visuais_resumo
    from public.carro_caracteristicas_visuais as ccv
    join candidate_cars as cc
      on cc.id = ccv.carro_id
    join public.caracteristicas_visuais as cv
      on cv.id = ccv.caracteristica_id
    group by ccv.carro_id
  ),
  duplicated_groups as (
    select
      cc.modelo_id,
      cc.cor,
      cc.ano_mod,
      cc.ano_fab,
      coalesce(vpc.caracteristicas_visuais_ids, '{}'::uuid[]) as caracteristicas_visuais_ids,
      coalesce(vpc.caracteristicas_visuais_resumo, '') as caracteristicas_visuais_resumo,
      case
        when min(cc.preco_original) is not distinct from max(cc.preco_original) then min(cc.preco_original)
        else null
      end as preco_original,
      min(cc.preco_original) as preco_min,
      max(cc.preco_original) as preco_max,
      min(cc.hodometro) as hodometro_min,
      max(cc.hodometro) as hodometro_max,
      count(*)::integer as qtde,
      array_agg(cc.id order by cc.id) as carros_ids
    from candidate_cars as cc
    left join visuais_por_carro as vpc
      on vpc.carro_id = cc.id
    group by
      cc.modelo_id,
      cc.cor,
      cc.ano_mod,
      cc.ano_fab,
      coalesce(vpc.caracteristicas_visuais_ids, '{}'::uuid[]),
      coalesce(vpc.caracteristicas_visuais_resumo, '')
    having count(*) > 1
  ),
  inserted_groups as (
    insert into public.grupos_repetidos (
      grupo_id,
      modelo_id,
      cor,
      ano_mod,
      ano_fab,
      caracteristicas_visuais_ids,
      caracteristicas_visuais_resumo,
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
      dg.ano_fab,
      dg.caracteristicas_visuais_ids,
      dg.caracteristicas_visuais_resumo,
      dg.preco_original,
      dg.preco_min,
      dg.preco_max,
      dg.hodometro_min,
      dg.hodometro_max,
      dg.qtde,
      now()
    from duplicated_groups as dg
    returning grupo_id, modelo_id, cor, ano_mod, ano_fab, caracteristicas_visuais_ids
  ),
  inserted_items as (
    insert into public.repetidos (carro_id, grupo_id)
    select repeated.carro_id, ig.grupo_id
    from inserted_groups as ig
    join duplicated_groups as dg
      on dg.modelo_id = ig.modelo_id
     and dg.cor = ig.cor
     and dg.ano_mod is not distinct from ig.ano_mod
     and dg.ano_fab is not distinct from ig.ano_fab
     and dg.caracteristicas_visuais_ids is not distinct from ig.caracteristicas_visuais_ids
    cross join lateral unnest(dg.carros_ids) as repeated(carro_id)
    returning 1
  )
  select
    coalesce((select count(*) from inserted_groups), 0)::integer,
    coalesce((select count(*) from inserted_items), 0)::integer;
end;
$$;

create or replace function public.refresh_repetidos_projection_for_carro(p_carro_id uuid)
returns table(grupos_repetidos integer, registros_repetidos integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_group record;
begin
  select
    c.modelo_id,
    coalesce(btrim(c.cor), '') as cor,
    c.ano_mod,
    c.ano_fab
  into target_group
  from public.carros as c
  where c.id = p_carro_id;

  if not found then
    return query select 0::integer, 0::integer;
    return;
  end if;

  return query
  select *
  from public.refresh_repetidos_projection_group(
    target_group.modelo_id,
    target_group.cor,
    target_group.ano_mod,
    target_group.ano_fab
  );
end;
$$;

create or replace function public.refresh_repetidos_projection()
returns table(grupos_repetidos integer, registros_repetidos integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  truncate table public.repetidos, public.grupos_repetidos;

  return query
  with base_groups as (
    select
      c.modelo_id,
      coalesce(btrim(c.cor), '') as cor,
      c.ano_mod,
      c.ano_fab,
      count(*)::integer as qtde_base
    from public.carros as c
    where c.em_estoque = true
    group by c.modelo_id, coalesce(btrim(c.cor), ''), c.ano_mod, c.ano_fab
    having count(*) > 1
  ),
  candidate_cars as (
    select
      c.id,
      c.modelo_id,
      coalesce(btrim(c.cor), '') as cor,
      c.ano_mod,
      c.ano_fab,
      c.preco_original,
      c.hodometro
    from public.carros as c
    join base_groups as bg
      on bg.modelo_id = c.modelo_id
     and bg.cor = coalesce(btrim(c.cor), '')
     and bg.ano_mod is not distinct from c.ano_mod
     and bg.ano_fab is not distinct from c.ano_fab
    where c.em_estoque = true
  ),
  visuais_por_carro as (
    select
      ccv.carro_id,
      array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id) as caracteristicas_visuais_ids,
      string_agg(distinct cv.caracteristica, ' | ' order by cv.caracteristica) as caracteristicas_visuais_resumo
    from public.carro_caracteristicas_visuais as ccv
    join candidate_cars as cc
      on cc.id = ccv.carro_id
    join public.caracteristicas_visuais as cv
      on cv.id = ccv.caracteristica_id
    group by ccv.carro_id
  ),
  duplicated_groups as (
    select
      cc.modelo_id,
      cc.cor,
      cc.ano_mod,
      cc.ano_fab,
      coalesce(vpc.caracteristicas_visuais_ids, '{}'::uuid[]) as caracteristicas_visuais_ids,
      coalesce(vpc.caracteristicas_visuais_resumo, '') as caracteristicas_visuais_resumo,
      case
        when min(cc.preco_original) is not distinct from max(cc.preco_original) then min(cc.preco_original)
        else null
      end as preco_original,
      min(cc.preco_original) as preco_min,
      max(cc.preco_original) as preco_max,
      min(cc.hodometro) as hodometro_min,
      max(cc.hodometro) as hodometro_max,
      count(*)::integer as qtde,
      array_agg(cc.id order by cc.id) as carros_ids
    from candidate_cars as cc
    left join visuais_por_carro as vpc
      on vpc.carro_id = cc.id
    group by
      cc.modelo_id,
      cc.cor,
      cc.ano_mod,
      cc.ano_fab,
      coalesce(vpc.caracteristicas_visuais_ids, '{}'::uuid[]),
      coalesce(vpc.caracteristicas_visuais_resumo, '')
    having count(*) > 1
  ),
  inserted_groups as (
    insert into public.grupos_repetidos (
      grupo_id,
      modelo_id,
      cor,
      ano_mod,
      ano_fab,
      caracteristicas_visuais_ids,
      caracteristicas_visuais_resumo,
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
      dg.ano_fab,
      dg.caracteristicas_visuais_ids,
      dg.caracteristicas_visuais_resumo,
      dg.preco_original,
      dg.preco_min,
      dg.preco_max,
      dg.hodometro_min,
      dg.hodometro_max,
      dg.qtde,
      now()
    from duplicated_groups as dg
    returning grupo_id, modelo_id, cor, ano_mod, ano_fab, caracteristicas_visuais_ids
  ),
  inserted_items as (
    insert into public.repetidos (carro_id, grupo_id)
    select repeated.carro_id, ig.grupo_id
    from inserted_groups as ig
    join duplicated_groups as dg
      on dg.modelo_id = ig.modelo_id
     and dg.cor = ig.cor
     and dg.ano_mod is not distinct from ig.ano_mod
     and dg.ano_fab is not distinct from ig.ano_fab
     and dg.caracteristicas_visuais_ids is not distinct from ig.caracteristicas_visuais_ids
    cross join lateral unnest(dg.carros_ids) as repeated(carro_id)
    returning 1
  )
  select
    coalesce((select count(*) from inserted_groups), 0)::integer,
    coalesce((select count(*) from inserted_items), 0)::integer;
end;
$$;

create or replace function public.handle_repetidos_after_carros_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_group record;
begin
  for affected_group in
    select distinct
      nr.modelo_id,
      coalesce(btrim(nr.cor), '') as cor,
      nr.ano_mod,
      nr.ano_fab
    from new_rows as nr
    where nr.modelo_id is not null
  loop
    perform public.refresh_repetidos_projection_group(
      affected_group.modelo_id,
      affected_group.cor,
      affected_group.ano_mod,
      affected_group.ano_fab
    );
  end loop;

  return null;
end;
$$;

create or replace function public.handle_repetidos_after_carros_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_group record;
begin
  for affected_group in
    with changed_groups as (
      select
        nr.modelo_id,
        coalesce(btrim(nr.cor), '') as cor,
        nr.ano_mod,
        nr.ano_fab
      from new_rows as nr
      where nr.modelo_id is not null

      union

      select
        orw.modelo_id,
        coalesce(btrim(orw.cor), '') as cor,
        orw.ano_mod,
        orw.ano_fab
      from old_rows as orw
      where orw.modelo_id is not null
    )
    select distinct
      cg.modelo_id,
      cg.cor,
      cg.ano_mod,
      cg.ano_fab
    from changed_groups as cg
  loop
    perform public.refresh_repetidos_projection_group(
      affected_group.modelo_id,
      affected_group.cor,
      affected_group.ano_mod,
      affected_group.ano_fab
    );
  end loop;

  return null;
end;
$$;

create or replace function public.handle_repetidos_after_carros_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_group record;
begin
  for affected_group in
    select distinct
      orw.modelo_id,
      coalesce(btrim(orw.cor), '') as cor,
      orw.ano_mod,
      orw.ano_fab
    from old_rows as orw
    where orw.modelo_id is not null
  loop
    perform public.refresh_repetidos_projection_group(
      affected_group.modelo_id,
      affected_group.cor,
      affected_group.ano_mod,
      affected_group.ano_fab
    );
  end loop;

  return null;
end;
$$;

create or replace function public.handle_repetidos_after_carro_caracteristicas_visuais_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_repetidos_projection_for_carro(coalesce(new.carro_id, old.carro_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_refresh_repetidos_after_carros_insert on public.carros;
create trigger trg_refresh_repetidos_after_carros_insert
after insert on public.carros
referencing new table as new_rows
for each statement
execute function public.handle_repetidos_after_carros_insert();

drop trigger if exists trg_refresh_repetidos_after_carros_update on public.carros;
create trigger trg_refresh_repetidos_after_carros_update
after update on public.carros
referencing old table as old_rows new table as new_rows
for each statement
execute function public.handle_repetidos_after_carros_update();

drop trigger if exists trg_refresh_repetidos_after_carros_delete on public.carros;
create trigger trg_refresh_repetidos_after_carros_delete
after delete on public.carros
referencing old table as old_rows
for each statement
execute function public.handle_repetidos_after_carros_delete();

drop trigger if exists trg_refresh_repetidos_after_carro_caracteristicas_visuais_change
  on public.carro_caracteristicas_visuais;
create trigger trg_refresh_repetidos_after_carro_caracteristicas_visuais_change
after insert or update or delete on public.carro_caracteristicas_visuais
for each row
execute function public.handle_repetidos_after_carro_caracteristicas_visuais_change();

revoke all on function public.refresh_repetidos_projection() from anon, authenticated;
revoke all on function public.refresh_repetidos_projection_group(uuid, text, integer, integer) from anon, authenticated;
revoke all on function public.refresh_repetidos_projection_for_carro(uuid) from anon, authenticated;
revoke all on function public.handle_repetidos_after_carros_insert() from anon, authenticated;
revoke all on function public.handle_repetidos_after_carros_update() from anon, authenticated;
revoke all on function public.handle_repetidos_after_carros_delete() from anon, authenticated;
revoke all on function public.handle_repetidos_after_carro_caracteristicas_visuais_change() from anon, authenticated;

grant execute on function public.refresh_repetidos_projection() to service_role;
grant execute on function public.refresh_repetidos_projection_group(uuid, text, integer, integer) to service_role;
grant execute on function public.refresh_repetidos_projection_for_carro(uuid) to service_role;

do $$
begin
  perform public.refresh_repetidos_projection();
end;
$$;
