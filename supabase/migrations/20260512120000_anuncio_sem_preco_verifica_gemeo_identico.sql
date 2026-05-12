-- Vehicles without price may not belong to any repetido group, but should still
-- be classified as ANUNCIADO_REPETIDO when an identical vehicle (same modelo_id,
-- ano_mod, ano_fab, cor, caracteristicas_visuais) has an active ad.
-- This adds a fallback twin-check before falling through to AUSENTE.

create or replace function public.resolve_carro_estado_anuncio(p_carro_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with own_ad as (
    select a.estado_anuncio
    from public.anuncios as a
    where a.carro_id = p_carro_id
    order by a.updated_at desc nulls last, a.created_at desc nulls last, a.id
    limit 1
  ),
  target_car as (
    select
      c.id,
      c.preco_original,
      c.modelo_id,
      public.display_repetidos_cor(c.cor) as cor,
      c.ano_mod,
      c.ano_fab
    from public.carros as c
    where c.id = p_carro_id
  ),
  target_visuais as (
    select coalesce(
      (select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id)
       from public.carro_caracteristicas_visuais as ccv
       where ccv.carro_id = p_carro_id),
      '{}'::uuid[]
    ) as ids
  ),
  target_group as (
    select public.resolve_carro_repetido_grupo_id(p_carro_id) as grupo_id
  ),
  active_group_ads as (
    select distinct
      advertised_car.preco_original as preco_anunciado
    from target_group as tg
    join public.repetidos as r
      on r.grupo_id = tg.grupo_id
    join public.carros as advertised_car
      on advertised_car.id = r.carro_id
     and advertised_car.em_estoque = true
     and public.is_carro_disponivel_ou_novo(advertised_car.estado_venda)
    join public.anuncios as a
      on a.carro_id = r.carro_id
    where tg.grupo_id is not null
      and r.carro_id is distinct from p_carro_id
      and a.estado_anuncio = 'ANUNCIADO'
  ),
  identical_twin_with_ad as (
    select 1
    from target_car as tc
    cross join target_visuais as tv
    join public.carros as twin
      on twin.modelo_id = tc.modelo_id
     and public.display_repetidos_cor(twin.cor) = tc.cor
     and twin.ano_mod is not distinct from tc.ano_mod
     and twin.ano_fab is not distinct from tc.ano_fab
     and twin.em_estoque = true
     and public.is_carro_disponivel_ou_novo(twin.estado_venda)
     and twin.id is distinct from tc.id
    join public.anuncios as a
      on a.carro_id = twin.id
     and a.estado_anuncio = 'ANUNCIADO'
    where coalesce(
      (select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id)
       from public.carro_caracteristicas_visuais as ccv
       where ccv.carro_id = twin.id),
      '{}'::uuid[]
    ) is not distinct from tv.ids
    limit 1
  )
  select coalesce(
    (select estado_anuncio from own_ad),
    case
      when exists (
        select 1
        from active_group_ads as aga
        join target_car as tc on true
        where aga.preco_anunciado is not distinct from tc.preco_original
      ) then 'ANUNCIADO_REPETIDO'
      when exists (
        select 1
        from active_group_ads as aga
        join target_car as tc on true
        where aga.preco_anunciado is distinct from tc.preco_original
      ) then 'AUSENTE_EXTRA'
      when exists (select 1 from identical_twin_with_ad) then 'ANUNCIADO_REPETIDO'
      else 'AUSENTE'
    end
  );
$$;

create or replace view public.anuncios_missing_reference as
with active_group_ads as (
  select distinct
    r.grupo_id,
    c.preco_original as preco_anunciado
  from public.repetidos as r
  join public.anuncios as a
    on a.carro_id = r.carro_id
  join public.carros as c
    on c.id = r.carro_id
   and c.em_estoque = true
   and public.is_carro_disponivel_ou_novo(c.estado_venda)
  where a.estado_anuncio = 'ANUNCIADO'
),
reference_missing_rows as (
  select
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
    'Veiculo de referencia sem anuncio cadastrado: '
      || coalesce(nullif(ar.nome, ''), 'Sem nome')
      || case
        when nullif(ar.placa, '') is not null then ' | ' || ar.placa
        else ''
      end as insight_message,
    'ANUNCIO_SEM_REFERENCIA'::text as insight_code,
    20 as insight_rank
  from public.anuncios_referencia as ar
  where not exists (
    select 1
    from public.anuncios as a
    where a.carro_id = ar.carro_id
  )
    and not (
      ar.origem_repetido
      and exists (
        select 1
        from active_group_ads as aga
        where aga.grupo_id is not distinct from ar.grupo_id
          and aga.preco_anunciado is not distinct from ar.preco_original
      )
    )
    and not exists (
      select 1
      from public.carros as twin
      join public.anuncios as a
        on a.carro_id = twin.id
       and a.estado_anuncio = 'ANUNCIADO'
      where twin.modelo_id = ar.modelo_id
        and public.display_repetidos_cor(twin.cor) = public.display_repetidos_cor(ar.cor)
        and twin.ano_mod is not distinct from ar.ano_mod
        and twin.ano_fab is not distinct from ar.ano_fab
        and twin.em_estoque = true
        and public.is_carro_disponivel_ou_novo(twin.estado_venda)
        and twin.id is distinct from ar.carro_id
        and coalesce(
          (select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id)
           from public.carro_caracteristicas_visuais as ccv
           where ccv.carro_id = twin.id),
          '{}'::uuid[]
        ) is not distinct from coalesce(
          (select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id)
           from public.carro_caracteristicas_visuais as ccv
           where ccv.carro_id = ar.carro_id),
          '{}'::uuid[]
        )
    )
),
ausente_extra_rows as (
  select
    c.id as carro_id,
    r.grupo_id,
    true as origem_repetido,
    'REPETIDO_AUSENTE_EXTRA'::text as criterio_referencia,
    c.modelo_id,
    c.placa,
    c.nome,
    c.local,
    c.cor,
    c.ano_mod,
    c.ano_fab,
    c.preco_original as preco_carro_atual,
    'Veiculo repetido sem anuncio proprio, em grupo ja anunciado, com preco diferente: '
      || coalesce(nullif(c.nome, ''), 'Sem nome')
      || case
        when nullif(c.placa, '') is not null then ' | ' || c.placa
        else ''
      end as insight_message,
    'AUSENTE_EXTRA'::text as insight_code,
    10 as insight_rank
  from public.repetidos as r
  join public.carros as c
    on c.id = r.carro_id
   and c.em_estoque = true
   and public.is_carro_disponivel_ou_novo(c.estado_venda)
  where not exists (
    select 1
    from public.anuncios as a
    where a.carro_id = c.id
  )
    and exists (
      select 1
      from active_group_ads as aga
      where aga.grupo_id is not distinct from r.grupo_id
        and aga.preco_anunciado is distinct from c.preco_original
    )
    and not exists (
      select 1
      from active_group_ads as aga
      where aga.grupo_id is not distinct from r.grupo_id
        and aga.preco_anunciado is not distinct from c.preco_original
    )
),
ranked_rows as (
  select
    candidate_rows.*,
    row_number() over (
      partition by candidate_rows.carro_id
      order by candidate_rows.insight_rank asc, candidate_rows.carro_id asc
    ) as row_rank
  from (
    select * from ausente_extra_rows
    union all
    select * from reference_missing_rows
  ) as candidate_rows
)
select
  ('missing:' || rr.carro_id::text) as grid_row_id,
  rr.carro_id,
  rr.grupo_id,
  rr.origem_repetido,
  rr.criterio_referencia,
  rr.modelo_id,
  rr.placa,
  rr.nome,
  rr.local,
  rr.cor,
  rr.ano_mod,
  rr.ano_fab,
  rr.preco_carro_atual,
  rr.insight_message,
  rr.insight_code
from ranked_rows as rr
where rr.row_rank = 1;

revoke all on function public.resolve_carro_estado_anuncio(uuid) from public, anon, authenticated;
grant execute on function public.resolve_carro_estado_anuncio(uuid) to service_role;

select public.refresh_anuncios_reference_projection();
select public.sync_carros_estado_anuncio(null);
