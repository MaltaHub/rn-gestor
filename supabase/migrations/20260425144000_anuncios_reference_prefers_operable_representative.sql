-- Pick the operable representative independently from the current ad holder.

drop view if exists public.anuncios_operational_insights;
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
    c.data_entrada
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
  p.replacement_carro_id
from prioritized as p;

select public.refresh_anuncios_reference_projection();
