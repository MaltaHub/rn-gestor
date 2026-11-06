-- Remocao de carros.nome (pedido do Kaic, 2026-11-06) — etapa 1 (compativel):
-- as views de referencia de anuncios deixam de depender de carros.nome. A
-- mensagem do insight passa a usar o MODELO do catalogo. O app nao le a coluna
-- `nome` destas views (so grid_row_id/carro_id/preco/insight_*). A coluna
-- carros.nome sai na etapa 2, depois do deploy do codigo.

drop view if exists public.anuncios_missing_reference;
drop materialized view if exists public.anuncios_referencia;

-- anuncios_referencia e MATERIALIZADA (refresh_anuncios_reference_projection).
create materialized view public.anuncios_referencia as
with repeated_candidates as (
  select r.grupo_id, c.id as carro_id, c.modelo_id, c.placa, m.modelo::text as modelo_nome, c.local, c.cor,
         c.ano_mod, c.ano_fab, c.preco_original, c.created_at, c.data_entrada, c.hodometro
    from public.repetidos r
    join public.carros c on c.id = r.carro_id
    left join public.modelos m on m.id = c.modelo_id
   where public.is_carro_elegivel_calculo(c.em_estoque, c.estado_venda, c.participa_calculos)
), ranked_repeated_candidates as (
  select rc.grupo_id, rc.carro_id, rc.modelo_id, rc.placa, rc.modelo_nome, rc.local, rc.cor, rc.ano_mod, rc.ano_fab,
         rc.preco_original, rc.hodometro,
         row_number() over (partition by rc.grupo_id, rc.preco_original order by rc.hodometro, rc.carro_id) as preco_rank,
         count(*) over (partition by rc.grupo_id, rc.preco_original)::integer as carros_mesmo_preco
    from repeated_candidates rc
), selected_repeated_reference as (
  select rrc.carro_id, rrc.grupo_id, true as origem_repetido, 'REPETIDO_PRECO_UNICO'::text as criterio_referencia,
         rrc.modelo_id, rrc.placa, rrc.modelo_nome, rrc.local, rrc.cor, rrc.ano_mod, rrc.ano_fab, rrc.preco_original,
         rrc.carros_mesmo_preco, coalesce(gr.qtde, 1) as carros_grupo_qtde
    from ranked_repeated_candidates rrc
    left join public.grupos_repetidos gr on gr.grupo_id = rrc.grupo_id
   where rrc.preco_rank = 1
), non_repeated_reference as (
  select c.id as carro_id, null::uuid as grupo_id, false as origem_repetido, 'CARRO_UNICO'::text as criterio_referencia,
         c.modelo_id, c.placa, m.modelo::text as modelo_nome, c.local, c.cor, c.ano_mod, c.ano_fab, c.preco_original,
         1 as carros_mesmo_preco, 1 as carros_grupo_qtde
    from public.carros c
    left join public.modelos m on m.id = c.modelo_id
   where public.is_carro_elegivel_calculo(c.em_estoque, c.estado_venda, c.participa_calculos)
     and not exists (select 1 from public.repetidos r where r.carro_id = c.id)
)
select carro_id, grupo_id, origem_repetido, criterio_referencia, modelo_id, placa, modelo_nome, local, cor, ano_mod,
       ano_fab, preco_original, carros_mesmo_preco, carros_grupo_qtde
  from non_repeated_reference
union all
select carro_id, grupo_id, origem_repetido, criterio_referencia, modelo_id, placa, modelo_nome, local, cor, ano_mod,
       ano_fab, preco_original, carros_mesmo_preco, carros_grupo_qtde
  from selected_repeated_reference
with data;

create view public.anuncios_missing_reference as
with active_group_ads as (
  select distinct r.grupo_id, c.preco_original as preco_anunciado
    from public.repetidos r
    join public.anuncios a on a.carro_id = r.carro_id
    join public.carros c on c.id = r.carro_id and public.is_carro_elegivel_calculo(c.em_estoque, c.estado_venda, c.participa_calculos)
   where a.estado_anuncio = 'ANUNCIADO'::text
), reference_missing_rows as (
  select ar.carro_id, ar.grupo_id, ar.origem_repetido, ar.criterio_referencia, ar.modelo_id, ar.placa, ar.local, ar.cor,
         ar.ano_mod, ar.ano_fab, ar.preco_original as preco_carro_atual,
         ('Veiculo de referencia sem anuncio cadastrado: '::text || coalesce(nullif(ar.modelo_nome, ''::text), 'Sem modelo'::text)) ||
           case when nullif(ar.placa, ''::citext) is not null then ' | '::text || ar.placa::text else ''::text end as insight_message,
         'ANUNCIO_SEM_REFERENCIA'::text as insight_code,
         20 as insight_rank
    from public.anuncios_referencia ar
   where not exists (select 1 from public.anuncios a where a.carro_id = ar.carro_id)
     and not (ar.origem_repetido and exists (
       select 1 from active_group_ads aga
        where not aga.grupo_id is distinct from ar.grupo_id and not aga.preco_anunciado is distinct from ar.preco_original))
     and not exists (
       select 1
         from public.carros twin
         join public.anuncios a on a.carro_id = twin.id and a.estado_anuncio = 'ANUNCIADO'::text
        where twin.modelo_id = ar.modelo_id
          and public.display_repetidos_cor(twin.cor) = public.display_repetidos_cor(ar.cor)
          and not twin.ano_mod is distinct from ar.ano_mod
          and public.is_carro_elegivel_calculo(twin.em_estoque, twin.estado_venda, twin.participa_calculos)
          and twin.id is distinct from ar.carro_id
          and not coalesce((select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id)
                              from public.carro_caracteristicas_visuais ccv where ccv.carro_id = twin.id), '{}'::uuid[])
                  is distinct from coalesce((select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id)
                              from public.carro_caracteristicas_visuais ccv where ccv.carro_id = ar.carro_id), '{}'::uuid[]))
), ausente_extra_rows as (
  select c.id as carro_id, r.grupo_id, true as origem_repetido, 'REPETIDO_AUSENTE_EXTRA'::text as criterio_referencia,
         c.modelo_id, c.placa, c.local, c.cor, c.ano_mod, c.ano_fab, c.preco_original as preco_carro_atual,
         ('Veiculo repetido sem anuncio proprio, em grupo ja anunciado, com preco diferente: '::text || coalesce(nullif(m.modelo::text, ''::text), 'Sem modelo'::text)) ||
           case when nullif(c.placa, ''::citext) is not null then ' | '::text || c.placa::text else ''::text end as insight_message,
         'AUSENTE_EXTRA'::text as insight_code,
         10 as insight_rank
    from public.repetidos r
    join public.carros c on c.id = r.carro_id and public.is_carro_elegivel_calculo(c.em_estoque, c.estado_venda, c.participa_calculos)
    left join public.modelos m on m.id = c.modelo_id
   where not exists (select 1 from public.anuncios a where a.carro_id = c.id)
     and exists (select 1 from active_group_ads aga where not aga.grupo_id is distinct from r.grupo_id and aga.preco_anunciado is distinct from c.preco_original)
     and not exists (select 1 from active_group_ads aga where not aga.grupo_id is distinct from r.grupo_id and not aga.preco_anunciado is distinct from c.preco_original)
), identical_twin_extra_rows as (
  select c.id as carro_id, null::uuid as grupo_id, false as origem_repetido, 'IDENTICAL_TWIN_AUSENTE_EXTRA'::text as criterio_referencia,
         c.modelo_id, c.placa, c.local, c.cor, c.ano_mod, c.ano_fab, c.preco_original as preco_carro_atual,
         ('Veiculo sem preco com gemeo identico anunciado: '::text || coalesce(nullif(m.modelo::text, ''::text), 'Sem modelo'::text)) ||
           case when nullif(c.placa, ''::citext) is not null then ' | '::text || c.placa::text else ''::text end as insight_message,
         'AUSENTE_EXTRA'::text as insight_code,
         15 as insight_rank
    from public.carros c
    left join public.modelos m on m.id = c.modelo_id
   where public.is_carro_elegivel_calculo(c.em_estoque, c.estado_venda, c.participa_calculos)
     and c.preco_original is null
     and not exists (select 1 from public.anuncios a where a.carro_id = c.id)
     and not exists (select 1 from public.repetidos r where r.carro_id = c.id)
     and exists (
       select 1
         from public.carros twin
         join public.anuncios a on a.carro_id = twin.id and a.estado_anuncio = 'ANUNCIADO'::text
        where twin.modelo_id = c.modelo_id
          and public.display_repetidos_cor(twin.cor) = public.display_repetidos_cor(c.cor)
          and not twin.ano_mod is distinct from c.ano_mod
          and public.is_carro_elegivel_calculo(twin.em_estoque, twin.estado_venda, twin.participa_calculos)
          and twin.id is distinct from c.id
          and not coalesce((select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id)
                              from public.carro_caracteristicas_visuais ccv where ccv.carro_id = twin.id), '{}'::uuid[])
                  is distinct from coalesce((select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id)
                              from public.carro_caracteristicas_visuais ccv where ccv.carro_id = c.id), '{}'::uuid[]))
), ranked_rows as (
  select cr.*, row_number() over (partition by cr.carro_id order by cr.insight_rank, cr.carro_id) as row_rank
    from (
      select * from ausente_extra_rows
      union all
      select * from identical_twin_extra_rows
      union all
      select * from reference_missing_rows
    ) cr
)
select 'missing:'::text || carro_id::text as grid_row_id, carro_id, grupo_id, origem_repetido, criterio_referencia, modelo_id,
       placa, local, cor, ano_mod, ano_fab, preco_carro_atual, insight_message, insight_code
  from ranked_rows
 where row_rank = 1;

-- Mesmas permissoes de antes: so o service_role (app, backend-mediated).
revoke all on public.anuncios_referencia from anon, authenticated;
revoke all on public.anuncios_missing_reference from anon, authenticated;
grant all on public.anuncios_referencia to service_role;
grant all on public.anuncios_missing_reference to service_role;
