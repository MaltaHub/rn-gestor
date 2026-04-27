-- Restore missing anuncio rows for repeated vehicles whose group already has an active ad.

create or replace view public.anuncios_missing_reference as
with repeated_groups_with_active_ads as (
  select distinct
    r.grupo_id
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
),
preco_extra_rows as (
  select
    c.id as carro_id,
    r.grupo_id,
    true as origem_repetido,
    'REPETIDO_PRECO_EXTRA'::text as criterio_referencia,
    c.modelo_id,
    c.placa,
    c.nome,
    c.local,
    c.cor,
    c.ano_mod,
    c.ano_fab,
    c.preco_original as preco_carro_atual,
    'Veiculo repetido com anuncio ativo no grupo; tratar como preco extra antes de anunciar: '
      || coalesce(nullif(c.nome, ''), 'Sem nome')
      || case
        when nullif(c.placa, '') is not null then ' | ' || c.placa
        else ''
      end as insight_message,
    'ANUNCIO_PRECO_EXTRA'::text as insight_code,
    10 as insight_rank
  from public.repetidos as r
  join repeated_groups_with_active_ads as rg
    on rg.grupo_id = r.grupo_id
  join public.carros as c
    on c.id = r.carro_id
   and c.em_estoque = true
   and public.is_carro_disponivel_ou_novo(c.estado_venda)
  where not exists (
    select 1
    from public.anuncios as a
    where a.carro_id = c.id
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
    select * from preco_extra_rows
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

select public.refresh_anuncios_reference_projection();
