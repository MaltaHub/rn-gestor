-- Atualiza a logica de "representante" de grupo de repetidos e introduz dois
-- novos estados de anuncio:
--
--   * AUSENTE_ELEGIVEL  - representante de um grupo de repetidos sem anuncio
--                         ativo no grupo. E o veiculo eleito para virar anuncio.
--   * AUSENTE_UNICO     - veiculo sem grupo de repetidos e sem anuncio proprio.
--                         Tambem e elegivel para anuncio (representante de si).
--
-- Criterio de escolha do representante: MENOR HODOMETRO. Em caso de empate,
-- desempate deterministico por carro_id ASC.
--
-- Mudancas:
--   1. lookup_announcement_statuses: insere AUSENTE_ELEGIVEL e AUSENTE_UNICO.
--   2. anuncios_referencia (MV): ORDER BY trocado de
--        (data_entrada, created_at, carro_id)
--      para
--        (hodometro ASC NULLS LAST, carro_id).
--      Mantida a particao por (grupo_id, preco_original) -> a logica de
--      AUSENTE_EXTRA / ANUNCIADO_REPETIDO permanece inalterada.
--   3. resolve_carro_estado_anuncio: novo branch para
--        - AUSENTE_ELEGIVEL  (rep de grupo sem anuncio no grupo)
--        - AUSENTE_UNICO     (sem grupo, sem anuncio)
--      As demais classificacoes (ANUNCIADO/ANUNCIADO_REPETIDO/AUSENTE_EXTRA)
--      permanecem identicas.
--   4. Reclassifica public.carros.estado_anuncio para todos os carros.
--
-- As views dependentes (anuncios_missing_reference e
-- anuncios_operational_insights) sao recriadas sem alteracao funcional porque
-- DROP MATERIALIZED VIEW CASCADE remove-as junto com a MV.

begin;

-- 1. Lookup ----------------------------------------------------------------

insert into public.lookup_announcement_statuses (code, name, description, is_active, sort_order)
values
  ('AUSENTE_ELEGIVEL', 'Ausente Elegivel',
   'Representante de grupo de repetidos sem anuncio ativo (menor hodometro). Elegivel para virar anuncio.',
   true, 1),
  ('AUSENTE_UNICO', 'Ausente Unico',
   'Veiculo sem grupo de repetidos e sem anuncio proprio. Elegivel para virar anuncio.',
   true, 2)
on conflict (code) do update
   set name = excluded.name,
       description = excluded.description,
       is_active = excluded.is_active,
       sort_order = excluded.sort_order;

-- 2. MV anuncios_referencia + views dependentes ----------------------------

drop materialized view if exists public.anuncios_referencia cascade;

create materialized view public.anuncios_referencia as
with repeated_candidates as (
  select r.grupo_id,
         c.id as carro_id,
         c.modelo_id, c.placa, c.nome, c.local, c.cor,
         c.ano_mod, c.ano_fab, c.preco_original,
         c.created_at, c.data_entrada, c.hodometro
    from public.repetidos r
    join public.carros c on c.id = r.carro_id
   where c.em_estoque = true
     and public.is_carro_disponivel_ou_novo(c.estado_venda)
),
ranked_repeated_candidates as (
  select rc.grupo_id, rc.carro_id, rc.modelo_id, rc.placa, rc.nome,
         rc.local, rc.cor, rc.ano_mod, rc.ano_fab, rc.preco_original,
         rc.hodometro,
         row_number() over (
           partition by rc.grupo_id, rc.preco_original
           order by rc.hodometro asc nulls last, rc.carro_id
         ) as preco_rank,
         (count(*) over (partition by rc.grupo_id, rc.preco_original))::integer as carros_mesmo_preco
    from repeated_candidates rc
),
selected_repeated_reference as (
  select rrc.carro_id, rrc.grupo_id,
         true as origem_repetido,
         'REPETIDO_PRECO_UNICO'::text as criterio_referencia,
         rrc.modelo_id, rrc.placa, rrc.nome, rrc.local, rrc.cor,
         rrc.ano_mod, rrc.ano_fab, rrc.preco_original,
         rrc.carros_mesmo_preco,
         coalesce(gr.qtde, 1) as carros_grupo_qtde
    from ranked_repeated_candidates rrc
    left join public.grupos_repetidos gr on gr.grupo_id = rrc.grupo_id
   where rrc.preco_rank = 1
),
non_repeated_reference as (
  select c.id as carro_id, null::uuid as grupo_id,
         false as origem_repetido,
         'CARRO_UNICO'::text as criterio_referencia,
         c.modelo_id, c.placa, c.nome, c.local, c.cor,
         c.ano_mod, c.ano_fab, c.preco_original,
         1 as carros_mesmo_preco, 1 as carros_grupo_qtde
    from public.carros c
   where c.em_estoque = true
     and public.is_carro_disponivel_ou_novo(c.estado_venda)
     and not exists (select 1 from public.repetidos r where r.carro_id = c.id)
)
select * from non_repeated_reference
union all
select * from selected_repeated_reference;

grant select on public.anuncios_referencia to service_role;

-- Recria anuncios_missing_reference (definicao identica a anterior).
create or replace view public.anuncios_missing_reference as
with active_group_ads as (
  select distinct r.grupo_id, c.preco_original as preco_anunciado
    from public.repetidos r
    join public.anuncios a on a.carro_id = r.carro_id
    join public.carros c on c.id = r.carro_id
                        and c.em_estoque = true
                        and public.is_carro_disponivel_ou_novo(c.estado_venda)
   where a.estado_anuncio = 'ANUNCIADO'
),
reference_missing_rows as (
  select ar.carro_id, ar.grupo_id, ar.origem_repetido, ar.criterio_referencia,
         ar.modelo_id, ar.placa, ar.nome, ar.local, ar.cor, ar.ano_mod, ar.ano_fab,
         ar.preco_original as preco_carro_atual,
         ('Veiculo de referencia sem anuncio cadastrado: ' || coalesce(nullif(ar.nome, ''), 'Sem nome'))
           || case when nullif(ar.placa, ''::citext) is not null then ' | ' || ar.placa::text else '' end
           as insight_message,
         'ANUNCIO_SEM_REFERENCIA'::text as insight_code,
         20 as insight_rank
    from public.anuncios_referencia ar
   where not exists (select 1 from public.anuncios a where a.carro_id = ar.carro_id)
     and not (ar.origem_repetido and exists (
       select 1 from active_group_ads aga
        where not (aga.grupo_id is distinct from ar.grupo_id)
          and not (aga.preco_anunciado is distinct from ar.preco_original)
     ))
     and not exists (
       select 1
         from public.carros twin
         join public.anuncios a on a.carro_id = twin.id and a.estado_anuncio = 'ANUNCIADO'
        where twin.modelo_id = ar.modelo_id
          and public.display_repetidos_cor(twin.cor) = public.display_repetidos_cor(ar.cor)
          and not (twin.ano_mod is distinct from ar.ano_mod)
          and not (twin.ano_fab is distinct from ar.ano_fab)
          and twin.em_estoque = true
          and public.is_carro_disponivel_ou_novo(twin.estado_venda)
          and twin.id is distinct from ar.carro_id
          and not (
            coalesce((select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id)
                        from public.carro_caracteristicas_visuais ccv where ccv.carro_id = twin.id), '{}'::uuid[])
            is distinct from
            coalesce((select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id)
                        from public.carro_caracteristicas_visuais ccv where ccv.carro_id = ar.carro_id), '{}'::uuid[])
          )
     )
),
ausente_extra_rows as (
  select c.id as carro_id, r.grupo_id, true as origem_repetido,
         'REPETIDO_AUSENTE_EXTRA'::text as criterio_referencia,
         c.modelo_id, c.placa, c.nome, c.local, c.cor, c.ano_mod, c.ano_fab,
         c.preco_original as preco_carro_atual,
         ('Veiculo repetido sem anuncio proprio, em grupo ja anunciado, com preco diferente: '
            || coalesce(nullif(c.nome, ''), 'Sem nome'))
           || case when nullif(c.placa, ''::citext) is not null then ' | ' || c.placa::text else '' end
           as insight_message,
         'AUSENTE_EXTRA'::text as insight_code,
         10 as insight_rank
    from public.repetidos r
    join public.carros c on c.id = r.carro_id
                        and c.em_estoque = true
                        and public.is_carro_disponivel_ou_novo(c.estado_venda)
   where not exists (select 1 from public.anuncios a where a.carro_id = c.id)
     and exists (
       select 1 from active_group_ads aga
        where not (aga.grupo_id is distinct from r.grupo_id)
          and aga.preco_anunciado is distinct from c.preco_original
     )
     and not exists (
       select 1 from active_group_ads aga
        where not (aga.grupo_id is distinct from r.grupo_id)
          and not (aga.preco_anunciado is distinct from c.preco_original)
     )
),
identical_twin_extra_rows as (
  select c.id as carro_id, null::uuid as grupo_id, false as origem_repetido,
         'IDENTICAL_TWIN_AUSENTE_EXTRA'::text as criterio_referencia,
         c.modelo_id, c.placa, c.nome, c.local, c.cor, c.ano_mod, c.ano_fab,
         c.preco_original as preco_carro_atual,
         ('Veiculo sem preco com gemeo identico anunciado: ' || coalesce(nullif(c.nome, ''), 'Sem nome'))
           || case when nullif(c.placa, ''::citext) is not null then ' | ' || c.placa::text else '' end
           as insight_message,
         'AUSENTE_EXTRA'::text as insight_code,
         15 as insight_rank
    from public.carros c
   where c.em_estoque = true
     and public.is_carro_disponivel_ou_novo(c.estado_venda)
     and c.preco_original is null
     and not exists (select 1 from public.anuncios a where a.carro_id = c.id)
     and not exists (select 1 from public.repetidos r where r.carro_id = c.id)
     and exists (
       select 1
         from public.carros twin
         join public.anuncios a on a.carro_id = twin.id and a.estado_anuncio = 'ANUNCIADO'
        where twin.modelo_id = c.modelo_id
          and public.display_repetidos_cor(twin.cor) = public.display_repetidos_cor(c.cor)
          and not (twin.ano_mod is distinct from c.ano_mod)
          and not (twin.ano_fab is distinct from c.ano_fab)
          and twin.em_estoque = true
          and public.is_carro_disponivel_ou_novo(twin.estado_venda)
          and twin.id is distinct from c.id
          and not (
            coalesce((select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id)
                        from public.carro_caracteristicas_visuais ccv where ccv.carro_id = twin.id), '{}'::uuid[])
            is distinct from
            coalesce((select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id)
                        from public.carro_caracteristicas_visuais ccv where ccv.carro_id = c.id), '{}'::uuid[])
          )
     )
),
ranked_rows as (
  select cr.*,
         row_number() over (partition by cr.carro_id order by cr.insight_rank, cr.carro_id) as row_rank
    from (
      select * from ausente_extra_rows
      union all
      select * from identical_twin_extra_rows
      union all
      select * from reference_missing_rows
    ) cr
)
select ('missing:' || carro_id::text) as grid_row_id,
       carro_id, grupo_id, origem_repetido, criterio_referencia,
       modelo_id, placa, nome, local, cor, ano_mod, ano_fab,
       preco_carro_atual, insight_message, insight_code
  from ranked_rows
 where row_rank = 1;

grant select, insert, update, delete, references, trigger, truncate
  on public.anuncios_missing_reference to service_role;

-- Recria anuncios_operational_insights (definicao identica a anterior).
create or replace view public.anuncios_operational_insights as
with base as (
  select a.id as anuncio_id, a.carro_id, a.valor_anuncio, a.estado_anuncio,
         a.updated_at as anuncio_updated_at,
         c.preco_original as preco_carro_atual,
         c.em_estoque, c.estado_venda, c.updated_at as carro_updated_at,
         public.resolve_carro_repetido_grupo_id(a.carro_id) as grupo_id
    from public.anuncios a
    left join public.carros c on c.id = a.carro_id
),
chosen_reference as (
  select b.anuncio_id, ar.carro_id as chosen_carro_id
    from base b
    left join public.anuncios_referencia ar
      on ((b.grupo_id is not null and ar.grupo_id = b.grupo_id and not (ar.preco_original is distinct from b.preco_carro_atual))
       or (b.grupo_id is null and ar.carro_id = b.carro_id))
),
ads_per_group_price as (
  select r.grupo_id, c.preco_original as preco, count(distinct a.id)::integer as ad_count
    from public.repetidos r
    join public.anuncios a on a.carro_id = r.carro_id
    join public.carros c on c.id = r.carro_id
                        and c.em_estoque = true
                        and public.is_carro_disponivel_ou_novo(c.estado_venda)
   where a.estado_anuncio = 'ANUNCIADO'
   group by r.grupo_id, c.preco_original
),
computed as (
  select b.anuncio_id, b.carro_id, b.preco_carro_atual, b.valor_anuncio, b.grupo_id,
         cr.chosen_carro_id,
         (b.valor_anuncio is distinct from b.preco_carro_atual) as needs_update_price,
         (cr.chosen_carro_id is not null and cr.chosen_carro_id is distinct from b.carro_id) as needs_update_reference,
         (coalesce(b.em_estoque, false) = false or not public.is_carro_disponivel_ou_novo(b.estado_venda)) as needs_delete,
         (coalesce(gpp.ad_count, 0) > 1) as has_group_duplicate_ads,
         exists (
           select 1 from public.anuncios chosen_ad
            where chosen_ad.carro_id = cr.chosen_carro_id
              and chosen_ad.id is distinct from b.anuncio_id
         ) as chosen_reference_has_own_ad,
         case
           when b.grupo_id is not null
            and cr.chosen_carro_id is not null
            and cr.chosen_carro_id is distinct from b.carro_id
            and exists (
              select 1
                from public.repetidos current_repeated
                join public.repetidos replacement_repeated
                  on replacement_repeated.grupo_id = current_repeated.grupo_id
                 and replacement_repeated.carro_id = cr.chosen_carro_id
               where current_repeated.carro_id = b.carro_id
            )
            and not exists (
              select 1 from public.anuncios chosen_ad where chosen_ad.carro_id = cr.chosen_carro_id
            )
           then cr.chosen_carro_id
           else null::uuid
         end as replacement_carro_id,
         greatest(
           coalesce(b.anuncio_updated_at, '1970-01-01 00:00:00'::timestamp without time zone::timestamp with time zone),
           coalesce(b.carro_updated_at, '1970-01-01 00:00:00'::timestamp without time zone::timestamp with time zone)
         ) as last_change
    from base b
    left join chosen_reference cr on cr.anuncio_id = b.anuncio_id
    left join ads_per_group_price gpp
      on not (gpp.grupo_id is distinct from b.grupo_id)
     and not (gpp.preco is distinct from b.preco_carro_atual)
),
with_verification as (
  select c.*,
         exists (
           select 1 from public.anuncios_insight_verifications v
            where v.anuncio_id = c.anuncio_id
              and v.insight_code = 'ATUALIZAR_ANUNCIO'
              and v.verified_at > c.last_change
         ) as update_verified
    from computed c
),
prioritized as (
  select wv.*,
         case
           when wv.replacement_carro_id is not null and wv.needs_update_reference then 'SUBSTITUIR_ANUNCIO_REPRESENTANTE'
           when wv.needs_delete then 'APAGAR_ANUNCIO_RECOMENDADO'
           when wv.grupo_id is not null and wv.needs_update_reference and wv.chosen_reference_has_own_ad then 'APAGAR_ANUNCIO_RECOMENDADO'
           when wv.has_group_duplicate_ads then 'MULTIPLOS_ANUNCIOS_GRUPO'
           when (wv.needs_update_reference or wv.needs_update_price) and not wv.update_verified then 'ATUALIZAR_ANUNCIO'
           else null
         end as primary_insight_code
    from with_verification wv
)
select anuncio_id, carro_id, preco_carro_atual,
       (primary_insight_code is not null) as has_pending_action,
       (primary_insight_code = 'APAGAR_ANUNCIO_RECOMENDADO') as delete_recommended,
       primary_insight_code as insight_code,
       case
         when primary_insight_code = 'SUBSTITUIR_ANUNCIO_REPRESENTANTE' and needs_delete
           then 'Trocar anuncio: veiculo vendido, mover anuncio para o repetido disponivel sem anuncio proprio: ' || replacement_carro_id::text
         when primary_insight_code = 'SUBSTITUIR_ANUNCIO_REPRESENTANTE'
           then 'Substituir este anuncio pelo veiculo repetido disponivel sem anuncio proprio: ' || replacement_carro_id::text
         when primary_insight_code = 'APAGAR_ANUNCIO_RECOMENDADO' and needs_delete
           then 'Recomendado apagar anuncio: veiculo fora da operacao ativa sem repetido disponivel para substituicao.'
         when primary_insight_code = 'APAGAR_ANUNCIO_RECOMENDADO'
           then 'Recomendado apagar anuncio duplicado: o representante real deste grupo de repetidos ja possui anuncio proprio.'
         when primary_insight_code = 'MULTIPLOS_ANUNCIOS_GRUPO'
           then 'Mais de um veiculo deste grupo esta anunciado no mesmo preco; mantenha apenas o representante.'
         when primary_insight_code = 'ATUALIZAR_ANUNCIO' and needs_update_reference
           then 'Atualizar anuncio para o veiculo representativo do grupo.'
         when primary_insight_code = 'ATUALIZAR_ANUNCIO' and needs_update_price
           then 'Preco do anuncio diferente do preco atual do carro.'
         else null
       end as insight_message,
       has_group_duplicate_ads,
       (primary_insight_code = 'SUBSTITUIR_ANUNCIO_REPRESENTANTE') as replace_recommended,
       case when primary_insight_code = 'SUBSTITUIR_ANUNCIO_REPRESENTANTE' then replacement_carro_id else null::uuid end as replacement_carro_id
  from prioritized;

grant select, insert, update, delete, references, trigger, truncate
  on public.anuncios_operational_insights to service_role;

refresh materialized view public.anuncios_referencia;

-- 3. resolve_carro_estado_anuncio ------------------------------------------

create or replace function public.resolve_carro_estado_anuncio(p_carro_id uuid)
 returns text
 language sql
 stable security definer
 set search_path to ''
as $function$
  with own_ad as (
    select a.estado_anuncio
      from public.anuncios a
     where a.carro_id = p_carro_id
     order by a.updated_at desc nulls last, a.created_at desc nulls last, a.id
     limit 1
  ),
  target_car as (
    select c.id, c.preco_original, c.modelo_id, c.hodometro,
           public.display_repetidos_cor(c.cor) as cor,
           c.ano_mod, c.ano_fab
      from public.carros c
     where c.id = p_carro_id
  ),
  target_visuais as (
    select coalesce(
      (select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id)
         from public.carro_caracteristicas_visuais ccv
        where ccv.carro_id = p_carro_id),
      '{}'::uuid[]
    ) as ids
  ),
  target_group as (
    select public.resolve_carro_repetido_grupo_id(p_carro_id) as grupo_id
  ),
  active_group_ads as (
    select distinct advertised_car.preco_original as preco_anunciado
      from target_group tg
      join public.repetidos r on r.grupo_id = tg.grupo_id
      join public.carros advertised_car
        on advertised_car.id = r.carro_id
       and advertised_car.em_estoque = true
       and public.is_carro_disponivel_ou_novo(advertised_car.estado_venda)
      join public.anuncios a on a.carro_id = r.carro_id
     where tg.grupo_id is not null
       and r.carro_id is distinct from p_carro_id
       and a.estado_anuncio = 'ANUNCIADO'
  ),
  identical_twin_with_ad as (
    select 1
      from target_car tc
      cross join target_visuais tv
      join public.carros twin
        on twin.modelo_id = tc.modelo_id
       and public.display_repetidos_cor(twin.cor) = tc.cor
       and twin.ano_mod is not distinct from tc.ano_mod
       and twin.ano_fab is not distinct from tc.ano_fab
       and twin.em_estoque = true
       and public.is_carro_disponivel_ou_novo(twin.estado_venda)
       and twin.id is distinct from tc.id
      join public.anuncios a
        on a.carro_id = twin.id
       and a.estado_anuncio = 'ANUNCIADO'
     where coalesce(
       (select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id)
          from public.carro_caracteristicas_visuais ccv
         where ccv.carro_id = twin.id),
       '{}'::uuid[]
     ) is not distinct from tv.ids
     limit 1
  ),
  is_group_representative as (
    -- Vencedor do grupo: menor hodometro (NULLS LAST), desempate por carro_id.
    select exists (
      select 1
        from target_group tg
       where tg.grupo_id is not null
         and p_carro_id = (
           select r.carro_id
             from public.repetidos r
             join public.carros c
               on c.id = r.carro_id
              and c.em_estoque = true
              and public.is_carro_disponivel_ou_novo(c.estado_venda)
            where r.grupo_id = tg.grupo_id
            order by c.hodometro asc nulls last, c.id
            limit 1
         )
    ) as is_rep
  )
  select coalesce(
    (select estado_anuncio from own_ad),
    case
      when exists (
        select 1
          from active_group_ads aga
          join target_car tc on true
         where aga.preco_anunciado is not distinct from tc.preco_original
      ) then 'ANUNCIADO_REPETIDO'
      when exists (
        select 1
          from active_group_ads aga
          join target_car tc on true
         where aga.preco_anunciado is distinct from tc.preco_original
      ) then 'AUSENTE_EXTRA'
      when exists (select 1 from identical_twin_with_ad) then
        case
          when (select preco_original from target_car) is null then 'AUSENTE_EXTRA'
          else 'ANUNCIADO_REPETIDO'
        end
      when (select grupo_id from target_group) is not null then
        case
          when (select is_rep from is_group_representative) then 'AUSENTE_ELEGIVEL'
          else 'AUSENTE'
        end
      else 'AUSENTE_UNICO'
    end
  );
$function$;

-- 4. Reclassifica estado_anuncio de todos os carros ------------------------

select public.sync_carros_estado_anuncio(null);

commit;
