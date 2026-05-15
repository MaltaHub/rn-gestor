-- Consolidacao do calculo de anuncios:
--
-- Bug 1: carro SEM preco com gemeo identico ANUNCIADO ficava como
-- 'ANUNCIADO_REPETIDO' silencioso e nao aparecia no grid de anuncios.
-- Agora retorna 'AUSENTE_EXTRA' e aparece como missing-reference visivel.
-- Carros COM preco mantem o comportamento atual (ANUNCIADO_REPETIDO).
--
-- Bug 2: carro vendido em grupo de repetidos com representante substituto
-- disponivel ficava com insight 'APAGAR_ANUNCIO_RECOMENDADO'. O substituto
-- (replacement_carro_id) era ignorado por causa de 'not needs_delete' na
-- branch SUBSTITUIR. Agora SUBSTITUIR vence APAGAR quando ha substituto,
-- mesmo se o carro foi vendido.

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
      when exists (select 1 from identical_twin_with_ad) then
        case
          when (select preco_original from target_car) is null
            then 'AUSENTE_EXTRA'
          else 'ANUNCIADO_REPETIDO'
        end
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
identical_twin_extra_rows as (
  -- Carros sem preco, fora de qualquer grupo de repetidos, mas com gemeo
  -- identico anunciado: aparecem como AUSENTE_EXTRA para o operador decidir
  -- se cria anuncio proprio ou confirma que o gemeo cobre.
  select
    c.id as carro_id,
    null::uuid as grupo_id,
    false as origem_repetido,
    'IDENTICAL_TWIN_AUSENTE_EXTRA'::text as criterio_referencia,
    c.modelo_id,
    c.placa,
    c.nome,
    c.local,
    c.cor,
    c.ano_mod,
    c.ano_fab,
    c.preco_original as preco_carro_atual,
    'Veiculo sem preco com gemeo identico anunciado: '
      || coalesce(nullif(c.nome, ''), 'Sem nome')
      || case
        when nullif(c.placa, '') is not null then ' | ' || c.placa
        else ''
      end as insight_message,
    'AUSENTE_EXTRA'::text as insight_code,
    15 as insight_rank
  from public.carros as c
  where c.em_estoque = true
    and public.is_carro_disponivel_ou_novo(c.estado_venda)
    and c.preco_original is null
    and not exists (
      select 1 from public.anuncios as a where a.carro_id = c.id
    )
    and not exists (
      select 1 from public.repetidos as r where r.carro_id = c.id
    )
    and exists (
      select 1
      from public.carros as twin
      join public.anuncios as a
        on a.carro_id = twin.id
       and a.estado_anuncio = 'ANUNCIADO'
      where twin.modelo_id = c.modelo_id
        and public.display_repetidos_cor(twin.cor) = public.display_repetidos_cor(c.cor)
        and twin.ano_mod is not distinct from c.ano_mod
        and twin.ano_fab is not distinct from c.ano_fab
        and twin.em_estoque = true
        and public.is_carro_disponivel_ou_novo(twin.estado_venda)
        and twin.id is distinct from c.id
        and coalesce(
          (select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id)
           from public.carro_caracteristicas_visuais as ccv
           where ccv.carro_id = twin.id),
          '{}'::uuid[]
        ) is not distinct from coalesce(
          (select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id)
           from public.carro_caracteristicas_visuais as ccv
           where ccv.carro_id = c.id),
          '{}'::uuid[]
        )
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
    select * from identical_twin_extra_rows
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
    on (
      b.grupo_id is not null
      and ar.grupo_id = b.grupo_id
      and ar.preco_original is not distinct from b.preco_carro_atual
    )
    or (
      b.grupo_id is null
      and ar.carro_id = b.carro_id
    )
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
      when b.grupo_id is not null
       and cr.chosen_carro_id is not null
       and cr.chosen_carro_id is distinct from b.carro_id
       and exists (
         select 1
         from public.repetidos as current_repeated
         join public.repetidos as replacement_repeated
           on replacement_repeated.grupo_id = current_repeated.grupo_id
          and replacement_repeated.carro_id = cr.chosen_carro_id
         where current_repeated.carro_id = b.carro_id
       )
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
      -- SUBSTITUIR vence APAGAR quando ha um representante substituto
      -- no mesmo grupo de repetidos disponivel sem anuncio proprio.
      -- Vale mesmo para carros vendidos (needs_delete=true): nesse caso
      -- a operacao desejada e mover o anuncio para o representante, nao
      -- apagar e deixar o grupo sem cobertura.
      when wv.replacement_carro_id is not null
       and wv.needs_update_reference
        then 'SUBSTITUIR_ANUNCIO_REPRESENTANTE'
      when wv.needs_delete
        then 'APAGAR_ANUNCIO_RECOMENDADO'
      when wv.grupo_id is not null
       and wv.needs_update_reference
       and wv.chosen_reference_has_own_ad
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
    when p.primary_insight_code = 'SUBSTITUIR_ANUNCIO_REPRESENTANTE' and p.needs_delete then
      'Trocar anuncio: veiculo vendido, mover anuncio para o repetido disponivel sem anuncio proprio: '
      || p.replacement_carro_id::text
    when p.primary_insight_code = 'SUBSTITUIR_ANUNCIO_REPRESENTANTE' then
      'Substituir este anuncio pelo veiculo repetido disponivel sem anuncio proprio: '
      || p.replacement_carro_id::text
    when p.primary_insight_code = 'APAGAR_ANUNCIO_RECOMENDADO' and p.needs_delete then
      'Recomendado apagar anuncio: veiculo fora da operacao ativa sem repetido disponivel para substituicao.'
    when p.primary_insight_code = 'APAGAR_ANUNCIO_RECOMENDADO' then
      'Recomendado apagar anuncio duplicado: o representante real deste grupo de repetidos ja possui anuncio proprio.'
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

revoke all on function public.resolve_carro_estado_anuncio(uuid) from public, anon, authenticated;
grant execute on function public.resolve_carro_estado_anuncio(uuid) to service_role;

select public.refresh_anuncios_reference_projection();
select public.sync_carros_estado_anuncio(null);
