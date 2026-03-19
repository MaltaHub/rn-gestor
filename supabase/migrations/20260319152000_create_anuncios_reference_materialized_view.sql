drop materialized view if exists public.anuncios_referencia;

create materialized view public.anuncios_referencia as
with repeated_candidates as (
  select
    r.grupo_id,
    c.id as carro_id,
    c.modelo_id,
    c.placa,
    c.nome,
    c.local,
    c.cor,
    c.ano_mod,
    c.ano_fab,
    c.preco_original,
    c.created_at,
    c.data_entrada,
    exists (
      select 1
      from public.anuncios as a
      where a.carro_id = c.id
    ) as already_announced
  from public.repetidos as r
  join public.carros as c
    on c.id = r.carro_id
  where c.em_estoque = true
),
ranked_repeated_candidates as (
  select
    rc.grupo_id,
    rc.carro_id,
    rc.modelo_id,
    rc.placa,
    rc.nome,
    rc.local,
    rc.cor,
    rc.ano_mod,
    rc.ano_fab,
    rc.preco_original,
    row_number() over (
      partition by rc.grupo_id, rc.preco_original
      order by
        case
          when rc.already_announced then 0
          else 1
        end,
        rc.data_entrada asc nulls last,
        rc.created_at asc,
        rc.carro_id asc
    ) as preco_rank,
    count(*) over (partition by rc.grupo_id, rc.preco_original)::integer as carros_mesmo_preco
  from repeated_candidates as rc
),
selected_repeated_reference as (
  select
    rrc.carro_id,
    rrc.grupo_id,
    true as origem_repetido,
    'REPETIDO_PRECO_UNICO'::text as criterio_referencia,
    rrc.modelo_id,
    rrc.placa,
    rrc.nome,
    rrc.local,
    rrc.cor,
    rrc.ano_mod,
    rrc.ano_fab,
    rrc.preco_original,
    rrc.carros_mesmo_preco,
    coalesce(gr.qtde, 1)::integer as carros_grupo_qtde
  from ranked_repeated_candidates as rrc
  left join public.grupos_repetidos as gr
    on gr.grupo_id = rrc.grupo_id
  where rrc.preco_rank = 1
),
non_repeated_reference as (
  select
    c.id as carro_id,
    null::uuid as grupo_id,
    false as origem_repetido,
    'CARRO_UNICO'::text as criterio_referencia,
    c.modelo_id,
    c.placa,
    c.nome,
    c.local,
    c.cor,
    c.ano_mod,
    c.ano_fab,
    c.preco_original,
    1::integer as carros_mesmo_preco,
    1::integer as carros_grupo_qtde
  from public.carros as c
  where c.em_estoque = true
    and not exists (
      select 1
      from public.repetidos as r
      where r.carro_id = c.id
    )
)
select
  nr.carro_id,
  nr.grupo_id,
  nr.origem_repetido,
  nr.criterio_referencia,
  nr.modelo_id,
  nr.placa,
  nr.nome,
  nr.local,
  nr.cor,
  nr.ano_mod,
  nr.ano_fab,
  nr.preco_original,
  nr.carros_mesmo_preco,
  nr.carros_grupo_qtde
from non_repeated_reference as nr

union all

select
  sr.carro_id,
  sr.grupo_id,
  sr.origem_repetido,
  sr.criterio_referencia,
  sr.modelo_id,
  sr.placa,
  sr.nome,
  sr.local,
  sr.cor,
  sr.ano_mod,
  sr.ano_fab,
  sr.preco_original,
  sr.carros_mesmo_preco,
  sr.carros_grupo_qtde
from selected_repeated_reference as sr;

create unique index if not exists ux_anuncios_referencia_carro_id
  on public.anuncios_referencia (carro_id);

create index if not exists ix_anuncios_referencia_grupo_preco
  on public.anuncios_referencia (grupo_id, preco_original);

create or replace view public.anuncios_missing_reference as
select
  ('missing:' || ar.carro_id::text) as grid_row_id,
  ar.carro_id,
  ar.grupo_id,
  ar.origem_repetido,
  ar.criterio_referencia,
  ar.modelo_id,
  ar.placa,
  ar.nome,
  ar.local,
  ar.cor,
  ar.ano_mod,
  ar.ano_fab,
  ar.preco_original as preco_carro_atual,
  (
    'Veiculo de referencia sem anuncio cadastrado: '
    || coalesce(nullif(ar.nome, ''), 'Sem nome')
    || case
      when nullif(ar.placa, '') is not null then ' | ' || ar.placa
      else ''
    end
  ) as insight_message
from public.anuncios_referencia as ar
where not exists (
  select 1
  from public.anuncios as a
  where a.carro_id = ar.carro_id
);

create or replace function public.refresh_anuncios_reference_projection()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  reference_count integer;
begin
  refresh materialized view public.anuncios_referencia;

  select count(*)::integer
  into reference_count
  from public.anuncios_referencia;

  return reference_count;
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
      public.display_repetidos_cor(nr.cor) as cor,
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

  perform public.refresh_anuncios_reference_projection();
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
        public.display_repetidos_cor(nr.cor) as cor,
        nr.ano_mod,
        nr.ano_fab
      from new_rows as nr
      where nr.modelo_id is not null

      union

      select
        orw.modelo_id,
        public.display_repetidos_cor(orw.cor) as cor,
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

  perform public.refresh_anuncios_reference_projection();
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
      public.display_repetidos_cor(orw.cor) as cor,
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

  perform public.refresh_anuncios_reference_projection();
  return null;
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

  perform public.refresh_anuncios_reference_projection();
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

  perform public.refresh_anuncios_reference_projection();
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

  perform public.refresh_anuncios_reference_projection();
  return null;
end;
$$;

revoke all on function public.refresh_anuncios_reference_projection() from anon, authenticated;
grant execute on function public.refresh_anuncios_reference_projection() to service_role;

do $$
begin
  perform public.refresh_repetidos_projection();
  perform public.refresh_anuncios_reference_projection();
end;
$$;
