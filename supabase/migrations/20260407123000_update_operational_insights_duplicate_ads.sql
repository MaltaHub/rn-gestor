-- Atualiza a view de insights operacionais de anuncios para considerar
-- o caso de mais de um veiculo do mesmo grupo repetido estar anunciado.

create or replace view public.anuncios_operational_insights as
with base as (
  select
    a.id as anuncio_id,
    a.carro_id,
    a.valor_anuncio,
    a.updated_at as anuncio_updated_at,
    c.preco_original as preco_carro_atual,
    c.em_estoque,
    c.estado_venda,
    c.updated_at as carro_updated_at,
    r.grupo_id
  from public.anuncios as a
  left join public.carros as c
    on c.id = a.carro_id
  left join public.repetidos as r
    on r.carro_id = a.carro_id
)
, chosen_reference as (
  select
    b.anuncio_id,
    ar.carro_id as chosen_carro_id
  from base as b
  left join public.anuncios_referencia as ar
    on ar.grupo_id is not distinct from b.grupo_id
   and ar.preco_original is not distinct from b.preco_carro_atual
)
, ads_per_group as (
  select
    r.grupo_id,
    count(distinct a.id)::integer as ad_count
  from public.repetidos as r
  join public.anuncios as a
    on a.carro_id = r.carro_id
  group by r.grupo_id
)
, computed as (
  select
    b.anuncio_id,
    b.carro_id,
    b.preco_carro_atual,
    (b.valor_anuncio is distinct from b.preco_carro_atual) as needs_update_price,
    (cr.chosen_carro_id is not null and cr.chosen_carro_id is distinct from b.carro_id) as needs_update_reference,
    ((b.em_estoque = false) or (not public.is_carro_disponivel_ou_novo(b.estado_venda))) as needs_delete,
    coalesce(apg.ad_count, 0) > 1 as has_group_duplicate_ads,
    greatest(coalesce(b.anuncio_updated_at, timestamp 'epoch'), coalesce(b.carro_updated_at, timestamp 'epoch')) as last_change
  from base as b
  left join chosen_reference as cr on cr.anuncio_id = b.anuncio_id
  left join ads_per_group as apg on apg.grupo_id is not distinct from b.grupo_id
)
, with_verification as (
  select
    c.*,
    exists (
      select 1
      from public.anuncios_insight_verifications as v
      where v.anuncio_id = c.anuncio_id
        and v.insight_code = 'ATUALIZAR_ANUNCIO'
        and v.verified_at > c.last_change
    ) as update_verified
  from computed as c
)
select
  wv.anuncio_id,
  wv.carro_id,
  wv.preco_carro_atual,
  -- Considera pendencias por preco/referencia (nao verificado) ou duplicidade de anuncios no grupo
  ((wv.needs_update_price or wv.needs_update_reference) and not wv.update_verified)
    or wv.has_group_duplicate_ads as has_pending_action,
  wv.needs_delete as delete_recommended,
  case
    when wv.has_group_duplicate_ads then 'MULTIPLOS_ANUNCIOS_GRUPO'
    when (wv.needs_update_reference) and not wv.update_verified then 'ATUALIZAR_ANUNCIO'
    when (wv.needs_update_price) and not wv.update_verified then 'ATUALIZAR_ANUNCIO'
    else null
  end as insight_code,
  case
    when wv.has_group_duplicate_ads then 'Mais de um veiculo deste grupo esta anunciado; mantenha apenas o representativo.'
    when (wv.needs_update_reference) and not wv.update_verified then 'Atualizar anuncio para o veiculo representativo do grupo.'
    when (wv.needs_update_price) and not wv.update_verified then 'Preco do anuncio diferente do preco atual do carro.'
    else null
  end as insight_message
from with_verification as wv;

