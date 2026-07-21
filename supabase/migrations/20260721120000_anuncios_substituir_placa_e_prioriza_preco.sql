-- Reforma da logica de SUBSTITUICAO de anuncios (anuncios_operational_insights).
--
-- Dois ajustes pedidos:
--
-- 1) A mensagem do insight SUBSTITUIR_ANUNCIO_REPRESENTANTE indicava o UUID cru
--    do veiculo substituto ('... : <uuid>'). Agora indica a PLACA. Fallback pro
--    uuid so se a placa estiver vazia (defensivo).
--
-- 2) Ao escolher o repetido que recebe o anuncio de um veiculo vendido, o
--    algoritmo desempatava so por menor hodometro. Agora PRIORIZA o veiculo com
--    o MESMO preco do anuncio a substituir (valor_anuncio) — assim mover o
--    anuncio nao forca troca de preco; so entao cai no desempate por hodometro/id.
--
-- Somente a view muda. As colunas de SAIDA sao identicas (mesma assinatura para
-- lib/api/anuncios-insights.ts) — logo os types gerados NAO mudam. [skip-types]
-- se aplica: a placa vai dentro de insight_message, replacement_placa fica
-- interno ao calculo.

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
    c.participa_calculos,
    c.updated_at as carro_updated_at,
    c.modelo_id,
    c.cor,
    c.ano_mod
  from public.anuncios as a
  left join public.carros as c on c.id = a.carro_id
),
flags as (
  select
    b.*,
    (b.valor_anuncio is distinct from b.preco_carro_atual) as needs_update_price,
    (not public.is_carro_elegivel_calculo(b.em_estoque, b.estado_venda, b.participa_calculos)) as needs_delete,
    greatest(
      coalesce(b.anuncio_updated_at, '1970-01-01 00:00:00+00'::timestamptz),
      coalesce(b.carro_updated_at, '1970-01-01 00:00:00+00'::timestamptz)
    ) as last_change
  from base as b
),
sold_replacement as (
  -- Veiculo vendido: escolhe o repetido identico (modelo + cor + ano_mod +
  -- caracteristicas visuais) elegivel e SEM anuncio proprio para receber o anuncio.
  -- PRIORIDADE: primeiro os que tem o MESMO preco do anuncio a substituir
  -- (valor_anuncio); so entao desempata por menor hodometro e id.
  -- LATERAL para trazer id E placa da MESMA linha escolhida.
  select
    f.anuncio_id,
    repl.id as replacement_carro_id,
    repl.placa as replacement_placa
  from flags as f
  left join lateral (
    select twin.id, twin.placa
    from public.carros as twin
    where twin.modelo_id = f.modelo_id
      and public.display_repetidos_cor(twin.cor) = public.display_repetidos_cor(f.cor)
      and twin.ano_mod is not distinct from f.ano_mod
      and public.is_carro_elegivel_calculo(twin.em_estoque, twin.estado_venda, twin.participa_calculos)
      and twin.id is distinct from f.carro_id
      and not exists (
        select 1 from public.anuncios as aa where aa.carro_id = twin.id
      )
      and coalesce(
        (select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id)
         from public.carro_caracteristicas_visuais as ccv
         where ccv.carro_id = twin.id),
        '{}'::uuid[]
      ) is not distinct from coalesce(
        (select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id)
         from public.carro_caracteristicas_visuais as ccv
         where ccv.carro_id = f.carro_id),
        '{}'::uuid[]
      )
    -- false (0) quando o preco casa -> vem primeiro; true (1) quando difere.
    order by (twin.preco_original is distinct from f.valor_anuncio), twin.hodometro, twin.id
    limit 1
  ) as repl on true
  where f.needs_delete
),
with_verification as (
  select
    f.*,
    sr.replacement_carro_id,
    sr.replacement_placa,
    exists (
      select 1
      from public.anuncios_insight_verifications as v
      where v.anuncio_id = f.anuncio_id
        and v.insight_code = 'ATUALIZAR_ANUNCIO'
        and v.verified_at > f.last_change
    ) as update_verified
  from flags as f
  left join sold_replacement as sr on sr.anuncio_id = f.anuncio_id
),
prioritized as (
  select
    wv.*,
    case
      when wv.needs_delete and wv.replacement_carro_id is not null then 'SUBSTITUIR_ANUNCIO_REPRESENTANTE'
      when wv.needs_delete then 'APAGAR_ANUNCIO_RECOMENDADO'
      when wv.needs_update_price and not wv.update_verified then 'ATUALIZAR_ANUNCIO'
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
    when p.primary_insight_code = 'SUBSTITUIR_ANUNCIO_REPRESENTANTE'
      then 'Veiculo vendido: substituir o anuncio pelo repetido disponivel sem anuncio proprio (placa '
        || coalesce(nullif(p.replacement_placa, ''), p.replacement_carro_id::text)
        || ').'
    when p.primary_insight_code = 'APAGAR_ANUNCIO_RECOMENDADO'
      then 'Recomendado apagar anuncio: veiculo vendido/fora de estoque, sem repetido disponivel para substituicao.'
    when p.primary_insight_code = 'ATUALIZAR_ANUNCIO'
      then 'Preco do anuncio diferente do preco atual do carro.'
    else null
  end as insight_message,
  false as has_group_duplicate_ads,
  p.primary_insight_code = 'SUBSTITUIR_ANUNCIO_REPRESENTANTE' as replace_recommended,
  case
    when p.primary_insight_code = 'SUBSTITUIR_ANUNCIO_REPRESENTANTE' then p.replacement_carro_id
    else null::uuid
  end as replacement_carro_id
from prioritized as p;
