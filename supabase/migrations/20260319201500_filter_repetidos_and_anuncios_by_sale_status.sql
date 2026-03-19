create or replace function public.normalize_business_token(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    lower(
      translate(
        coalesce(btrim(p_value), ''),
        'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
      )
    ),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

create or replace function public.is_carro_disponivel_ou_novo(p_estado_venda text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select public.normalize_business_token(p_estado_venda) in ('disponivel', 'novo');
$$;

drop index if exists ix_carros_repetidos_base_group;

create index if not exists ix_carros_repetidos_base_group
  on public.carros (modelo_id, public.normalize_repetidos_cor(cor), ano_mod, ano_fab)
  where em_estoque = true
    and public.is_carro_disponivel_ou_novo(estado_venda);

create or replace view public.anuncios_price_insights as
select
  a.id as anuncio_id,
  a.carro_id,
  a.valor_anuncio,
  c.preco_original as preco_carro_atual,
  a.valor_anuncio is distinct from c.preco_original as has_pending_action,
  case
    when a.valor_anuncio is not distinct from c.preco_original then null
    when a.valor_anuncio is null and c.preco_original is not null then 'ANUNCIO_SEM_PRECO'
    when a.valor_anuncio is not null and c.preco_original is null then 'CARRO_SEM_PRECO'
    else 'PRECO_DIVERGENTE'
  end as insight_code,
  case
    when a.valor_anuncio is not distinct from c.preco_original then null
    when a.valor_anuncio is null and c.preco_original is not null then 'Anuncio sem preco e carro com preco cadastrado.'
    when a.valor_anuncio is not null and c.preco_original is null then 'Carro sem preco cadastrado e anuncio com preco informado.'
    else 'Preco do anuncio diferente do preco atual do carro.'
  end as insight_message
from public.anuncios as a
join public.carros as c
  on c.id = a.carro_id
where c.em_estoque = true
  and public.is_carro_disponivel_ou_novo(c.estado_venda);

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
      and public.is_carro_disponivel_ou_novo(c.estado_venda)
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
      and public.is_carro_disponivel_ou_novo(c.estado_venda)
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
      and public.is_carro_disponivel_ou_novo(c.estado_venda)
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

drop view if exists public.anuncios_missing_reference;
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
    and public.is_carro_disponivel_ou_novo(c.estado_venda)
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
    and public.is_carro_disponivel_ou_novo(c.estado_venda)
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

do $$
begin
  perform public.refresh_repetidos_projection();
  perform public.refresh_anuncios_reference_projection();
end;
$$;
