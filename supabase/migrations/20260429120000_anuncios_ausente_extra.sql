-- Identify repeated vehicles that are not advertised while their group already
-- has an active ad at another price.

insert into public.lookup_announcement_statuses (code, name, description, is_active, sort_order, updated_at)
values (
  'AUSENTE_EXTRA',
  'Ausente Extra',
  'Veiculo sem anuncio proprio em grupo de repetidos ja anunciado, mas com preco diferente do anuncio ativo.',
  true,
  16,
  now()
)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    is_active = true,
    sort_order = excluded.sort_order,
    updated_at = now();

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
    select c.id, c.preco_original
    from public.carros as c
    where c.id = p_carro_id
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
