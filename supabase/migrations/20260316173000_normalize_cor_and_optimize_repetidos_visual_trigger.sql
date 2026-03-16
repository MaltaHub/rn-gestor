create or replace function public.normalize_repetidos_cor(p_cor text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(coalesce(btrim(p_cor), ''));
$$;

create or replace function public.display_repetidos_cor(p_cor text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when public.normalize_repetidos_cor(p_cor) = '' then ''
    else initcap(public.normalize_repetidos_cor(p_cor))
  end;
$$;

drop index if exists ix_carros_repetidos_base_group;

create index if not exists ix_carros_repetidos_base_group
  on public.carros (modelo_id, public.normalize_repetidos_cor(cor), ano_mod, ano_fab)
  where em_estoque = true;

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
  normalized_cor text := public.normalize_repetidos_cor(p_cor);
  display_cor text := public.display_repetidos_cor(p_cor);
begin
  if p_modelo_id is null then
    return query select 0::integer, 0::integer;
    return;
  end if;

  delete from public.repetidos as r
  using public.grupos_repetidos as g
  where r.grupo_id = g.grupo_id
    and g.modelo_id = p_modelo_id
    and g.cor = display_cor
    and g.ano_mod is not distinct from p_ano_mod
    and g.ano_fab is not distinct from p_ano_fab;

  delete from public.grupos_repetidos as g
  where g.modelo_id = p_modelo_id
    and g.cor = display_cor
    and g.ano_mod is not distinct from p_ano_mod
    and g.ano_fab is not distinct from p_ano_fab;

  return query
  with candidate_cars as (
    select
      c.id,
      c.modelo_id,
      public.normalize_repetidos_cor(c.cor) as cor_normalizada,
      public.display_repetidos_cor(c.cor) as cor,
      c.ano_mod,
      c.ano_fab,
      c.preco_original,
      c.hodometro
    from public.carros as c
    where c.em_estoque = true
      and c.modelo_id = p_modelo_id
      and public.normalize_repetidos_cor(c.cor) = normalized_cor
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
      cc.cor_normalizada,
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
      cc.cor_normalizada,
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
      public.normalize_repetidos_cor(c.cor) as cor_normalizada,
      c.ano_mod,
      c.ano_fab,
      count(*)::integer as qtde_base
    from public.carros as c
    where c.em_estoque = true
    group by c.modelo_id, public.normalize_repetidos_cor(c.cor), c.ano_mod, c.ano_fab
    having count(*) > 1
  ),
  candidate_cars as (
    select
      c.id,
      c.modelo_id,
      public.normalize_repetidos_cor(c.cor) as cor_normalizada,
      public.display_repetidos_cor(c.cor) as cor,
      c.ano_mod,
      c.ano_fab,
      c.preco_original,
      c.hodometro
    from public.carros as c
    join base_groups as bg
      on bg.modelo_id = c.modelo_id
     and bg.cor_normalizada = public.normalize_repetidos_cor(c.cor)
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
      cc.cor_normalizada,
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
      cc.cor_normalizada,
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

create or replace function public.handle_repetidos_after_carro_caracteristicas_visuais_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_car record;
begin
  for affected_car in
    select distinct nr.carro_id
    from new_rows as nr
    where nr.carro_id is not null
  loop
    perform public.refresh_repetidos_projection_for_carro(affected_car.carro_id);
  end loop;

  return null;
end;
$$;

create or replace function public.handle_repetidos_after_carro_caracteristicas_visuais_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_car record;
begin
  for affected_car in
    with changed_cars as (
      select nr.carro_id
      from new_rows as nr
      where nr.carro_id is not null

      union

      select orw.carro_id
      from old_rows as orw
      where orw.carro_id is not null
    )
    select distinct carro_id
    from changed_cars
  loop
    perform public.refresh_repetidos_projection_for_carro(affected_car.carro_id);
  end loop;

  return null;
end;
$$;

create or replace function public.handle_repetidos_after_carro_caracteristicas_visuais_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_car record;
begin
  for affected_car in
    select distinct orw.carro_id
    from old_rows as orw
    where orw.carro_id is not null
  loop
    perform public.refresh_repetidos_projection_for_carro(affected_car.carro_id);
  end loop;

  return null;
end;
$$;

drop trigger if exists trg_refresh_repetidos_after_carro_caracteristicas_visuais_change
  on public.carro_caracteristicas_visuais;
drop trigger if exists trg_refresh_repetidos_after_carro_caracteristicas_visuais_chang
  on public.carro_caracteristicas_visuais;
drop trigger if exists trg_rep_car_vis_ins on public.carro_caracteristicas_visuais;
drop trigger if exists trg_rep_car_vis_upd on public.carro_caracteristicas_visuais;
drop trigger if exists trg_rep_car_vis_del on public.carro_caracteristicas_visuais;

create trigger trg_rep_car_vis_ins
after insert on public.carro_caracteristicas_visuais
referencing new table as new_rows
for each statement
execute function public.handle_repetidos_after_carro_caracteristicas_visuais_insert();

create trigger trg_rep_car_vis_upd
after update on public.carro_caracteristicas_visuais
referencing old table as old_rows new table as new_rows
for each statement
execute function public.handle_repetidos_after_carro_caracteristicas_visuais_update();

create trigger trg_rep_car_vis_del
after delete on public.carro_caracteristicas_visuais
referencing old table as old_rows
for each statement
execute function public.handle_repetidos_after_carro_caracteristicas_visuais_delete();

revoke all on function public.normalize_repetidos_cor(text) from anon, authenticated;
revoke all on function public.display_repetidos_cor(text) from anon, authenticated;
revoke all on function public.refresh_repetidos_projection() from anon, authenticated;
revoke all on function public.refresh_repetidos_projection_group(uuid, text, integer, integer) from anon, authenticated;
revoke all on function public.handle_repetidos_after_carro_caracteristicas_visuais_insert() from anon, authenticated;
revoke all on function public.handle_repetidos_after_carro_caracteristicas_visuais_update() from anon, authenticated;
revoke all on function public.handle_repetidos_after_carro_caracteristicas_visuais_delete() from anon, authenticated;

grant execute on function public.refresh_repetidos_projection() to service_role;
grant execute on function public.refresh_repetidos_projection_group(uuid, text, integer, integer) to service_role;

do $$
begin
  perform public.refresh_repetidos_projection();
end;
$$;
