-- Remove ano_fab da CONTABILIDADE (chave de calculo) de repetidos e anuncios,
-- e simplifica os insights operacionais de anuncios.
--
-- 1) Repetidos: a chave do grupo deixa de considerar ano_fab (passa a
--    modelo_id + cor + ano_mod + caracteristicas_visuais). ano_fab fica como
--    valor informativo (min) na linha do grupo, sem participar do agrupamento.
-- 2) Anuncios: o matching de "gemeo identico" deixa de comparar ano_fab.
-- 3) Insights: hierarquia simplificada (so 1 por linha):
--      SUBSTITUIR  -> veiculo VENDIDO e existe repetido disponivel sem anuncio
--      APAGAR      -> veiculo vendido/fora sem repetido disponivel
--      ATUALIZAR   -> preco divergente
--    Removidos: MULTIPLOS_ANUNCIOS_GRUPO, "apagar duplicado pois representante
--    ja tem anuncio" e "substituir pelo repetido disponivel" (otimizacao de
--    representante). Representante de veiculo ainda anunciado nao gera insight.

-- =====================================================================
-- 1) REPETIDOS: agrupamento sem ano_fab na chave
-- =====================================================================

create or replace function public.refresh_repetidos_projection_group(
  p_modelo_id uuid,
  p_cor text,
  p_ano_mod integer,
  p_ano_fab integer  -- mantido por compatibilidade do trigger; nao usado na chave
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
    and g.ano_mod is not distinct from p_ano_mod;

  delete from public.grupos_repetidos as g
  where g.modelo_id = p_modelo_id
    and g.cor = display_cor
    and g.ano_mod is not distinct from p_ano_mod;

  return query
  with candidate_cars as (
    select c.id, c.modelo_id,
      public.normalize_repetidos_cor(c.cor) as cor_normalizada,
      public.display_repetidos_cor(c.cor) as cor,
      c.ano_mod, c.ano_fab, c.preco_original, c.hodometro
    from public.carros as c
    where c.em_estoque = true
      and public.is_carro_disponivel_ou_novo(c.estado_venda)
      and c.modelo_id = p_modelo_id
      and public.normalize_repetidos_cor(c.cor) = normalized_cor
      and c.ano_mod is not distinct from p_ano_mod
  ),
  visuais_por_carro as (
    select ccv.carro_id,
      array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id) as caracteristicas_visuais_ids,
      string_agg(distinct cv.caracteristica, ' | ' order by cv.caracteristica) as caracteristicas_visuais_resumo
    from public.carro_caracteristicas_visuais as ccv
    join candidate_cars as cc on cc.id = ccv.carro_id
    join public.caracteristicas_visuais as cv on cv.id = ccv.caracteristica_id
    group by ccv.carro_id
  ),
  duplicated_groups as (
    select cc.modelo_id, cc.cor_normalizada, cc.cor, cc.ano_mod,
      min(cc.ano_fab) as ano_fab,
      coalesce(vpc.caracteristicas_visuais_ids, '{}'::uuid[]) as caracteristicas_visuais_ids,
      coalesce(vpc.caracteristicas_visuais_resumo, '') as caracteristicas_visuais_resumo,
      case when min(cc.preco_original) is not distinct from max(cc.preco_original) then min(cc.preco_original) else null end as preco_original,
      min(cc.preco_original) as preco_min, max(cc.preco_original) as preco_max,
      min(cc.hodometro) as hodometro_min, max(cc.hodometro) as hodometro_max,
      count(*)::integer as qtde,
      array_agg(cc.id order by cc.id) as carros_ids
    from candidate_cars as cc
    left join visuais_por_carro as vpc on vpc.carro_id = cc.id
    group by cc.modelo_id, cc.cor_normalizada, cc.cor, cc.ano_mod,
      coalesce(vpc.caracteristicas_visuais_ids, '{}'::uuid[]),
      coalesce(vpc.caracteristicas_visuais_resumo, '')
    having count(*) > 1
  ),
  inserted_groups as (
    insert into public.grupos_repetidos (
      grupo_id, modelo_id, cor, ano_mod, ano_fab, caracteristicas_visuais_ids,
      caracteristicas_visuais_resumo, preco_original, preco_min, preco_max,
      hodometro_min, hodometro_max, qtde, atualizado_em
    )
    select gen_random_uuid(), dg.modelo_id, dg.cor, dg.ano_mod, dg.ano_fab,
      dg.caracteristicas_visuais_ids, dg.caracteristicas_visuais_resumo, dg.preco_original,
      dg.preco_min, dg.preco_max, dg.hodometro_min, dg.hodometro_max, dg.qtde, now()
    from duplicated_groups as dg
    returning grupo_id, modelo_id, cor, ano_mod, caracteristicas_visuais_ids
  ),
  inserted_items as (
    insert into public.repetidos (carro_id, grupo_id)
    select repeated.carro_id, ig.grupo_id
    from inserted_groups as ig
    join duplicated_groups as dg
      on dg.modelo_id = ig.modelo_id and dg.cor = ig.cor
     and dg.ano_mod is not distinct from ig.ano_mod
     and dg.caracteristicas_visuais_ids is not distinct from ig.caracteristicas_visuais_ids
    cross join lateral unnest(dg.carros_ids) as repeated(carro_id)
    on conflict (carro_id) do update set grupo_id = excluded.grupo_id, updated_at = now()
    returning 1
  )
  select coalesce((select count(*) from inserted_groups), 0)::integer,
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
    select c.modelo_id,
      public.normalize_repetidos_cor(c.cor) as cor_normalizada,
      public.display_repetidos_cor(c.cor) as cor,
      c.ano_mod, count(*)::integer as qtde_base
    from public.carros as c
    where c.em_estoque = true and public.is_carro_disponivel_ou_novo(c.estado_venda)
    group by c.modelo_id, public.normalize_repetidos_cor(c.cor), public.display_repetidos_cor(c.cor), c.ano_mod
    having count(*) > 1
  ),
  candidate_cars as (
    select c.id, c.modelo_id,
      public.normalize_repetidos_cor(c.cor) as cor_normalizada,
      public.display_repetidos_cor(c.cor) as cor,
      c.ano_mod, c.ano_fab, c.preco_original, c.hodometro
    from public.carros as c
    join base_groups as bg
      on bg.modelo_id = c.modelo_id
     and bg.cor_normalizada = public.normalize_repetidos_cor(c.cor)
     and bg.ano_mod is not distinct from c.ano_mod
    where c.em_estoque = true and public.is_carro_disponivel_ou_novo(c.estado_venda)
  ),
  visuais_por_carro as (
    select ccv.carro_id,
      array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id) as caracteristicas_visuais_ids,
      string_agg(distinct cv.caracteristica, ' | ' order by cv.caracteristica) as caracteristicas_visuais_resumo
    from public.carro_caracteristicas_visuais as ccv
    join candidate_cars as cc on cc.id = ccv.carro_id
    join public.caracteristicas_visuais as cv on cv.id = ccv.caracteristica_id
    group by ccv.carro_id
  ),
  duplicated_groups as (
    select cc.modelo_id, cc.cor_normalizada, cc.cor, cc.ano_mod,
      min(cc.ano_fab) as ano_fab,
      coalesce(vpc.caracteristicas_visuais_ids, '{}'::uuid[]) as caracteristicas_visuais_ids,
      coalesce(vpc.caracteristicas_visuais_resumo, '') as caracteristicas_visuais_resumo,
      case when min(cc.preco_original) is not distinct from max(cc.preco_original) then min(cc.preco_original) else null end as preco_original,
      min(cc.preco_original) as preco_min, max(cc.preco_original) as preco_max,
      min(cc.hodometro) as hodometro_min, max(cc.hodometro) as hodometro_max,
      count(*)::integer as qtde,
      array_agg(cc.id order by cc.id) as carros_ids
    from candidate_cars as cc
    left join visuais_por_carro as vpc on vpc.carro_id = cc.id
    group by cc.modelo_id, cc.cor_normalizada, cc.cor, cc.ano_mod,
      coalesce(vpc.caracteristicas_visuais_ids, '{}'::uuid[]),
      coalesce(vpc.caracteristicas_visuais_resumo, '')
    having count(*) > 1
  ),
  inserted_groups as (
    insert into public.grupos_repetidos (
      grupo_id, modelo_id, cor, ano_mod, ano_fab, caracteristicas_visuais_ids,
      caracteristicas_visuais_resumo, preco_original, preco_min, preco_max,
      hodometro_min, hodometro_max, qtde, atualizado_em
    )
    select gen_random_uuid(), dg.modelo_id, dg.cor, dg.ano_mod, dg.ano_fab,
      dg.caracteristicas_visuais_ids, dg.caracteristicas_visuais_resumo, dg.preco_original,
      dg.preco_min, dg.preco_max, dg.hodometro_min, dg.hodometro_max, dg.qtde, now()
    from duplicated_groups as dg
    returning grupo_id, modelo_id, cor, ano_mod, caracteristicas_visuais_ids
  ),
  inserted_items as (
    insert into public.repetidos (carro_id, grupo_id)
    select repeated.carro_id, ig.grupo_id
    from inserted_groups as ig
    join duplicated_groups as dg
      on dg.modelo_id = ig.modelo_id and dg.cor = ig.cor
     and dg.ano_mod is not distinct from ig.ano_mod
     and dg.caracteristicas_visuais_ids is not distinct from ig.caracteristicas_visuais_ids
    cross join lateral unnest(dg.carros_ids) as repeated(carro_id)
    on conflict (carro_id) do update set grupo_id = excluded.grupo_id, updated_at = now()
    returning 1
  )
  select coalesce((select count(*) from inserted_groups), 0)::integer,
         coalesce((select count(*) from inserted_items), 0)::integer;
end;
$$;

revoke all on function public.refresh_repetidos_projection_group(uuid, text, integer, integer) from anon, authenticated;
revoke all on function public.refresh_repetidos_projection() from anon, authenticated;
grant execute on function public.refresh_repetidos_projection_group(uuid, text, integer, integer) to service_role;
grant execute on function public.refresh_repetidos_projection() to service_role;

-- =====================================================================
-- 2) ANUNCIOS: matching de gemeo sem ano_fab + insights simplificados
-- =====================================================================

-- anuncios_missing_reference: remove ano_fab do matching de gemeo (mantem
-- a logica de ANUNCIO_SEM_REFERENCIA / AUSENTE_EXTRA).
create or replace view public.anuncios_missing_reference as
with active_group_ads as (
  select distinct r.grupo_id, c.preco_original as preco_anunciado
    from public.repetidos r
    join public.anuncios a on a.carro_id = r.carro_id
    join public.carros c on c.id = r.carro_id and c.em_estoque = true and public.is_carro_disponivel_ou_novo(c.estado_venda)
   where a.estado_anuncio = 'ANUNCIADO'
),
reference_missing_rows as (
  select ar.carro_id, ar.grupo_id, ar.origem_repetido, ar.criterio_referencia,
         ar.modelo_id, ar.placa, ar.nome, ar.local, ar.cor, ar.ano_mod, ar.ano_fab,
         ar.preco_original as preco_carro_atual,
         ('Veiculo de referencia sem anuncio cadastrado: ' || coalesce(nullif(ar.nome, ''), 'Sem nome'))
           || case when nullif(ar.placa, ''::citext) is not null then ' | ' || ar.placa::text else '' end as insight_message,
         'ANUNCIO_SEM_REFERENCIA'::text as insight_code, 20 as insight_rank
    from public.anuncios_referencia ar
   where not exists (select 1 from public.anuncios a where a.carro_id = ar.carro_id)
     and not (ar.origem_repetido and exists (
       select 1 from active_group_ads aga
        where not (aga.grupo_id is distinct from ar.grupo_id)
          and not (aga.preco_anunciado is distinct from ar.preco_original)))
     and not exists (
       select 1 from public.carros twin
         join public.anuncios a on a.carro_id = twin.id and a.estado_anuncio = 'ANUNCIADO'
        where twin.modelo_id = ar.modelo_id
          and public.display_repetidos_cor(twin.cor) = public.display_repetidos_cor(ar.cor)
          and not (twin.ano_mod is distinct from ar.ano_mod)
          and twin.em_estoque = true and public.is_carro_disponivel_ou_novo(twin.estado_venda)
          and twin.id is distinct from ar.carro_id
          and not (
            coalesce((select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id) from public.carro_caracteristicas_visuais ccv where ccv.carro_id = twin.id), '{}'::uuid[])
            is distinct from
            coalesce((select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id) from public.carro_caracteristicas_visuais ccv where ccv.carro_id = ar.carro_id), '{}'::uuid[])))
),
ausente_extra_rows as (
  select c.id as carro_id, r.grupo_id, true as origem_repetido,
         'REPETIDO_AUSENTE_EXTRA'::text as criterio_referencia,
         c.modelo_id, c.placa, c.nome, c.local, c.cor, c.ano_mod, c.ano_fab,
         c.preco_original as preco_carro_atual,
         ('Veiculo repetido sem anuncio proprio, em grupo ja anunciado, com preco diferente: ' || coalesce(nullif(c.nome, ''), 'Sem nome'))
           || case when nullif(c.placa, ''::citext) is not null then ' | ' || c.placa::text else '' end as insight_message,
         'AUSENTE_EXTRA'::text as insight_code, 10 as insight_rank
    from public.repetidos r
    join public.carros c on c.id = r.carro_id and c.em_estoque = true and public.is_carro_disponivel_ou_novo(c.estado_venda)
   where not exists (select 1 from public.anuncios a where a.carro_id = c.id)
     and exists (select 1 from active_group_ads aga where not (aga.grupo_id is distinct from r.grupo_id) and aga.preco_anunciado is distinct from c.preco_original)
     and not exists (select 1 from active_group_ads aga where not (aga.grupo_id is distinct from r.grupo_id) and not (aga.preco_anunciado is distinct from c.preco_original))
),
identical_twin_extra_rows as (
  select c.id as carro_id, null::uuid as grupo_id, false as origem_repetido,
         'IDENTICAL_TWIN_AUSENTE_EXTRA'::text as criterio_referencia,
         c.modelo_id, c.placa, c.nome, c.local, c.cor, c.ano_mod, c.ano_fab,
         c.preco_original as preco_carro_atual,
         ('Veiculo sem preco com gemeo identico anunciado: ' || coalesce(nullif(c.nome, ''), 'Sem nome'))
           || case when nullif(c.placa, ''::citext) is not null then ' | ' || c.placa::text else '' end as insight_message,
         'AUSENTE_EXTRA'::text as insight_code, 15 as insight_rank
    from public.carros c
   where c.em_estoque = true and public.is_carro_disponivel_ou_novo(c.estado_venda)
     and c.preco_original is null
     and not exists (select 1 from public.anuncios a where a.carro_id = c.id)
     and not exists (select 1 from public.repetidos r where r.carro_id = c.id)
     and exists (
       select 1 from public.carros twin
         join public.anuncios a on a.carro_id = twin.id and a.estado_anuncio = 'ANUNCIADO'
        where twin.modelo_id = c.modelo_id
          and public.display_repetidos_cor(twin.cor) = public.display_repetidos_cor(c.cor)
          and not (twin.ano_mod is distinct from c.ano_mod)
          and twin.em_estoque = true and public.is_carro_disponivel_ou_novo(twin.estado_venda)
          and twin.id is distinct from c.id
          and not (
            coalesce((select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id) from public.carro_caracteristicas_visuais ccv where ccv.carro_id = twin.id), '{}'::uuid[])
            is distinct from
            coalesce((select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id) from public.carro_caracteristicas_visuais ccv where ccv.carro_id = c.id), '{}'::uuid[])))
),
ranked_rows as (
  select cr.*, row_number() over (partition by cr.carro_id order by cr.insight_rank, cr.carro_id) as row_rank
    from (select * from ausente_extra_rows union all select * from identical_twin_extra_rows union all select * from reference_missing_rows) cr
)
select ('missing:' || carro_id::text) as grid_row_id,
       carro_id, grupo_id, origem_repetido, criterio_referencia,
       modelo_id, placa, nome, local, cor, ano_mod, ano_fab,
       preco_carro_atual, insight_message, insight_code
  from ranked_rows where row_rank = 1;

grant select, insert, update, delete, references, trigger, truncate on public.anuncios_missing_reference to service_role;

-- anuncios_operational_insights: regras simplificadas (1 insight por linha).
create or replace view public.anuncios_operational_insights as
with base as (
  select a.id as anuncio_id, a.carro_id, a.valor_anuncio, a.estado_anuncio,
         a.updated_at as anuncio_updated_at,
         c.preco_original as preco_carro_atual,
         c.em_estoque, c.estado_venda, c.updated_at as carro_updated_at,
         c.modelo_id, c.cor, c.ano_mod
    from public.anuncios a
    left join public.carros c on c.id = a.carro_id
),
flags as (
  select b.*,
         (b.valor_anuncio is distinct from b.preco_carro_atual) as needs_update_price,
         (coalesce(b.em_estoque, false) = false or not public.is_carro_disponivel_ou_novo(b.estado_venda)) as needs_delete,
         greatest(
           coalesce(b.anuncio_updated_at, '1970-01-01 00:00:00'::timestamptz),
           coalesce(b.carro_updated_at, '1970-01-01 00:00:00'::timestamptz)
         ) as last_change
    from base b
),
-- Para anuncio de veiculo que saiu da operacao: gemeo disponivel sem anuncio
-- proprio (modelo + cor + ano_mod + visuais; ano_fab NAO entra no matching).
sold_replacement as (
  select f.anuncio_id,
    (select twin.id
       from public.carros twin
      where twin.modelo_id = f.modelo_id
        and public.display_repetidos_cor(twin.cor) = public.display_repetidos_cor(f.cor)
        and not (twin.ano_mod is distinct from f.ano_mod)
        and twin.em_estoque = true and public.is_carro_disponivel_ou_novo(twin.estado_venda)
        and twin.id is distinct from f.carro_id
        and not exists (select 1 from public.anuncios aa where aa.carro_id = twin.id)
        and not (
          coalesce((select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id) from public.carro_caracteristicas_visuais ccv where ccv.carro_id = twin.id), '{}'::uuid[])
          is distinct from
          coalesce((select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id) from public.carro_caracteristicas_visuais ccv where ccv.carro_id = f.carro_id), '{}'::uuid[]))
      order by twin.hodometro asc nulls last, twin.id
      limit 1) as replacement_carro_id
    from flags f
   where f.needs_delete
),
with_verification as (
  select f.*, sr.replacement_carro_id,
         exists (
           select 1 from public.anuncios_insight_verifications v
            where v.anuncio_id = f.anuncio_id and v.insight_code = 'ATUALIZAR_ANUNCIO' and v.verified_at > f.last_change
         ) as update_verified
    from flags f
    left join sold_replacement sr on sr.anuncio_id = f.anuncio_id
),
prioritized as (
  select wv.*,
         case
           when wv.needs_delete and wv.replacement_carro_id is not null then 'SUBSTITUIR_ANUNCIO_REPRESENTANTE'
           when wv.needs_delete then 'APAGAR_ANUNCIO_RECOMENDADO'
           when wv.needs_update_price and not wv.update_verified then 'ATUALIZAR_ANUNCIO'
           else null
         end as primary_insight_code
    from with_verification wv
)
select anuncio_id, carro_id, preco_carro_atual,
       (primary_insight_code is not null) as has_pending_action,
       (primary_insight_code = 'APAGAR_ANUNCIO_RECOMENDADO') as delete_recommended,
       primary_insight_code as insight_code,
       case
         when primary_insight_code = 'SUBSTITUIR_ANUNCIO_REPRESENTANTE'
           then 'Veiculo vendido: substituir o anuncio pelo repetido disponivel sem anuncio proprio: ' || replacement_carro_id::text
         when primary_insight_code = 'APAGAR_ANUNCIO_RECOMENDADO'
           then 'Recomendado apagar anuncio: veiculo vendido/fora de estoque, sem repetido disponivel para substituicao.'
         when primary_insight_code = 'ATUALIZAR_ANUNCIO'
           then 'Preco do anuncio diferente do preco atual do carro.'
         else null
       end as insight_message,
       false as has_group_duplicate_ads,
       (primary_insight_code = 'SUBSTITUIR_ANUNCIO_REPRESENTANTE') as replace_recommended,
       case when primary_insight_code = 'SUBSTITUIR_ANUNCIO_REPRESENTANTE' then replacement_carro_id else null::uuid end as replacement_carro_id
  from prioritized;

grant select, insert, update, delete, references, trigger, truncate on public.anuncios_operational_insights to service_role;

-- =====================================================================
-- 3) resolve_carro_estado_anuncio: matching de gemeo sem ano_fab
-- =====================================================================
create or replace function public.resolve_carro_estado_anuncio(p_carro_id uuid)
 returns text language sql stable security definer set search_path to ''
as $function$
  with own_ad as (
    select a.estado_anuncio from public.anuncios a where a.carro_id = p_carro_id
     order by a.updated_at desc nulls last, a.created_at desc nulls last, a.id limit 1
  ),
  target_car as (
    select c.id, c.preco_original, c.modelo_id, c.hodometro,
           public.display_repetidos_cor(c.cor) as cor, c.ano_mod, c.ano_fab
      from public.carros c where c.id = p_carro_id
  ),
  target_visuais as (
    select coalesce((select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id)
       from public.carro_caracteristicas_visuais ccv where ccv.carro_id = p_carro_id), '{}'::uuid[]) as ids
  ),
  target_group as (select public.resolve_carro_repetido_grupo_id(p_carro_id) as grupo_id),
  active_group_ads as (
    select distinct advertised_car.preco_original as preco_anunciado
      from target_group tg
      join public.repetidos r on r.grupo_id = tg.grupo_id
      join public.carros advertised_car on advertised_car.id = r.carro_id and advertised_car.em_estoque = true and public.is_carro_disponivel_ou_novo(advertised_car.estado_venda)
      join public.anuncios a on a.carro_id = r.carro_id
     where tg.grupo_id is not null and r.carro_id is distinct from p_carro_id and a.estado_anuncio = 'ANUNCIADO'
  ),
  identical_twin_with_ad as (
    select 1 from target_car tc cross join target_visuais tv
      join public.carros twin
        on twin.modelo_id = tc.modelo_id
       and public.display_repetidos_cor(twin.cor) = tc.cor
       and twin.ano_mod is not distinct from tc.ano_mod
       and twin.em_estoque = true and public.is_carro_disponivel_ou_novo(twin.estado_venda)
       and twin.id is distinct from tc.id
      join public.anuncios a on a.carro_id = twin.id and a.estado_anuncio = 'ANUNCIADO'
     where coalesce((select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id)
          from public.carro_caracteristicas_visuais ccv where ccv.carro_id = twin.id), '{}'::uuid[]) is not distinct from tv.ids
     limit 1
  ),
  is_group_representative as (
    select exists (
      select 1 from target_group tg
       where tg.grupo_id is not null
         and p_carro_id = (
           select r.carro_id from public.repetidos r
             join public.carros c on c.id = r.carro_id and c.em_estoque = true and public.is_carro_disponivel_ou_novo(c.estado_venda)
            where r.grupo_id = tg.grupo_id order by c.hodometro asc nulls last, c.id limit 1)
    ) as is_rep
  )
  select coalesce(
    (select estado_anuncio from own_ad),
    case
      when exists (select 1 from active_group_ads aga join target_car tc on true where aga.preco_anunciado is not distinct from tc.preco_original) then 'ANUNCIADO_REPETIDO'
      when exists (select 1 from active_group_ads aga join target_car tc on true where aga.preco_anunciado is distinct from tc.preco_original) then 'AUSENTE_EXTRA'
      when exists (select 1 from identical_twin_with_ad) then
        case when (select preco_original from target_car) is null then 'AUSENTE_EXTRA' else 'ANUNCIADO_REPETIDO' end
      when (select grupo_id from target_group) is not null then
        case when (select is_rep from is_group_representative) then 'AUSENTE_ELEGIVEL' else 'AUSENTE' end
      else 'AUSENTE_UNICO'
    end
  );
$function$;

-- =====================================================================
-- 4) Rebuild
-- =====================================================================
select public.refresh_repetidos_projection();
refresh materialized view public.anuncios_referencia;
select public.sync_carros_estado_anuncio(null);
