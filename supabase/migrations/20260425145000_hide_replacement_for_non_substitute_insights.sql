-- Expose replacement targets only when the primary insight is replacement.

create or replace view public.anuncios_operational_insights as
with base as (
  select
    a.id as anuncio_id,
    a.carro_id,
    a.valor_anuncio,
    a.estado_anuncio,
    a.updated_at as anuncio_updated_at,
    c.preco_original as preco_carro_atual,
    c.em_estoque,
    c.estado_venda,
    c.updated_at as carro_updated_at,
    public.resolve_carro_repetido_grupo_id(a.carro_id) as grupo_id
  from public.anuncios as a
  left join public.carros as c on c.id = a.carro_id
),
chosen_reference as (
  select
    b.anuncio_id,
    ar.carro_id as chosen_carro_id
  from base as b
  left join public.anuncios_referencia as ar
    on ar.grupo_id is not distinct from b.grupo_id
   and ar.preco_original is not distinct from b.preco_carro_atual
),
ads_per_group_price as (
  select
    r.grupo_id,
    c.preco_original as preco,
    count(distinct a.id)::integer as ad_count
  from public.repetidos as r
  join public.anuncios as a on a.carro_id = r.carro_id
  join public.carros as c
    on c.id = r.carro_id
   and c.em_estoque = true
   and public.is_carro_disponivel_ou_novo(c.estado_venda)
  where a.estado_anuncio = 'ANUNCIADO'
  group by r.grupo_id, c.preco_original
),
computed as (
  select
    b.anuncio_id,
    b.carro_id,
    b.preco_carro_atual,
    b.valor_anuncio,
    b.grupo_id,
    cr.chosen_carro_id,
    (b.valor_anuncio is distinct from b.preco_carro_atual) as needs_update_price,
    (cr.chosen_carro_id is not null and cr.chosen_carro_id is distinct from b.carro_id) as needs_update_reference,
    ((coalesce(b.em_estoque, false) = false) or (not public.is_carro_disponivel_ou_novo(b.estado_venda))) as needs_delete,
    coalesce(gpp.ad_count, 0) > 1 as has_group_duplicate_ads,
    exists (
      select 1
      from public.anuncios as chosen_ad
      where chosen_ad.carro_id = cr.chosen_carro_id
        and chosen_ad.id is distinct from b.anuncio_id
    ) as chosen_reference_has_own_ad,
    case
      when cr.chosen_carro_id is not null
       and cr.chosen_carro_id is distinct from b.carro_id
       and not exists (
         select 1
         from public.anuncios as chosen_ad
         where chosen_ad.carro_id = cr.chosen_carro_id
       )
      then cr.chosen_carro_id
      else null::uuid
    end as replacement_carro_id,
    greatest(coalesce(b.anuncio_updated_at, timestamp 'epoch'), coalesce(b.carro_updated_at, timestamp 'epoch')) as last_change
  from base as b
  left join chosen_reference as cr on cr.anuncio_id = b.anuncio_id
  left join ads_per_group_price as gpp
    on gpp.grupo_id is not distinct from b.grupo_id
   and gpp.preco is not distinct from b.preco_carro_atual
),
with_verification as (
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
),
prioritized as (
  select
    wv.*,
    case
      when wv.replacement_carro_id is not null
       and wv.needs_update_reference
       and not wv.needs_delete
        then 'SUBSTITUIR_ANUNCIO_REPRESENTANTE'
      when wv.needs_delete
        then 'APAGAR_ANUNCIO_RECOMENDADO'
      when wv.needs_update_reference and wv.chosen_reference_has_own_ad
        then 'APAGAR_ANUNCIO_RECOMENDADO'
      when wv.has_group_duplicate_ads
        then 'MULTIPLOS_ANUNCIOS_GRUPO'
      when (wv.needs_update_reference or wv.needs_update_price) and not wv.update_verified
        then 'ATUALIZAR_ANUNCIO'
      else null
    end as primary_insight_code
  from with_verification as wv
)
select
  p.anuncio_id,
  p.carro_id,
  p.preco_carro_atual,
  p.primary_insight_code is not null as has_pending_action,
  p.primary_insight_code = 'APAGAR_ANUNCIO_RECOMENDADO' as delete_recommended,
  p.primary_insight_code as insight_code,
  case
    when p.primary_insight_code = 'SUBSTITUIR_ANUNCIO_REPRESENTANTE' then
      'Substituir este anuncio pelo veiculo repetido disponivel sem anuncio proprio: '
      || p.replacement_carro_id::text
    when p.primary_insight_code = 'APAGAR_ANUNCIO_RECOMENDADO' and p.needs_delete then
      'Recomendado apagar anuncio: veiculo fora da operacao ativa sem repetido disponivel para substituicao.'
    when p.primary_insight_code = 'APAGAR_ANUNCIO_RECOMENDADO' then
      'Recomendado apagar anuncio: o representante deste grupo ja possui anuncio proprio.'
    when p.primary_insight_code = 'MULTIPLOS_ANUNCIOS_GRUPO' then
      'Mais de um veiculo deste grupo esta anunciado no mesmo preco; mantenha apenas o representante.'
    when p.primary_insight_code = 'ATUALIZAR_ANUNCIO' and p.needs_update_reference then
      'Atualizar anuncio para o veiculo representativo do grupo.'
    when p.primary_insight_code = 'ATUALIZAR_ANUNCIO' and p.needs_update_price then
      'Preco do anuncio diferente do preco atual do carro.'
    else null
  end as insight_message,
  p.has_group_duplicate_ads,
  p.primary_insight_code = 'SUBSTITUIR_ANUNCIO_REPRESENTANTE' as replace_recommended,
  case
    when p.primary_insight_code = 'SUBSTITUIR_ANUNCIO_REPRESENTANTE' then p.replacement_carro_id
    else null::uuid
  end as replacement_carro_id
from prioritized as p;
