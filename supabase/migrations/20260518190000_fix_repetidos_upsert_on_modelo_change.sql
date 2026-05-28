-- Fix: ao mudar modelo_id (ou cor/ano) em public.carros, o trigger
-- handle_repetidos_after_carros_update chama refresh_repetidos_projection_group
-- para cada grupo afetado (antigo e novo). A função DELETA apenas as linhas de
-- public.repetidos cujo grupo bate com (p_modelo_id, p_cor, p_ano_mod, p_ano_fab)
-- e em seguida INSERE no novo grupo. Quando o carro estava em um grupo antigo
-- (ex.: GOL 1.0 MPI) e migra para outro grupo (ex.: GOL 1.0 URBAN), a chamada
-- que processa o grupo novo NÃO remove a linha do grupo antigo — e como
-- public.repetidos tem (carro_id) como primary key, o INSERT viola
-- repetidos_pkey (Postgres 23505).
--
-- A correção converte o INSERT em UPSERT em ambas as funções de projeção:
--   ON CONFLICT (carro_id) DO UPDATE SET grupo_id = excluded.grupo_id,
--                                        updated_at = now()
-- Isto garante a invariante "1 carro pertence a no máximo 1 grupo" mesmo
-- quando a ordem de processamento de grupos antigos/novos é arbitrária, sem
-- depender da ordem do iterador no trigger nem de cleanup adicional.

create or replace function public.refresh_repetidos_projection_group(
  p_modelo_id uuid,
  p_cor text,
  p_ano_mod integer,
  p_ano_fab integer
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
    and g.ano_mod is not distinct from p_ano_mod
    and g.ano_fab is not distinct from p_ano_fab;

  delete from public.grupos_repetidos as g
  where g.modelo_id = p_modelo_id
    and g.cor = display_cor
    and g.ano_mod is not distinct from p_ano_mod
    and g.ano_fab is not distinct from p_ano_fab;

  return query
  with candidate_cars as (
    select
      c.id,
      c.modelo_id,
      public.normalize_repetidos_cor(c.cor) as cor_normalizada,
      public.display_repetidos_cor(c.cor) as cor,
      c.ano_mod,
      c.ano_fab,
      c.preco_original,
      c.hodometro
    from public.carros as c
    where c.em_estoque = true
      and public.is_carro_disponivel_ou_novo(c.estado_venda)
      and c.modelo_id = p_modelo_id
      and public.normalize_repetidos_cor(c.cor) = normalized_cor
      and c.ano_mod is not distinct from p_ano_mod
      and c.ano_fab is not distinct from p_ano_fab
  ),
  visuais_por_carro as (
    select
      ccv.carro_id,
      array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id) as caracteristicas_visuais_ids,
      string_agg(distinct cv.caracteristica, ' | ' order by cv.caracteristica) as caracteristicas_visuais_resumo
    from public.carro_caracteristicas_visuais as ccv
    join candidate_cars as cc
      on cc.id = ccv.carro_id
    join public.caracteristicas_visuais as cv
      on cv.id = ccv.caracteristica_id
    group by ccv.carro_id
  ),
  duplicated_groups as (
    select
      cc.modelo_id,
      cc.cor_normalizada,
      cc.cor,
      cc.ano_mod,
      cc.ano_fab,
      coalesce(vpc.caracteristicas_visuais_ids, '{}'::uuid[]) as caracteristicas_visuais_ids,
      coalesce(vpc.caracteristicas_visuais_resumo, '') as caracteristicas_visuais_resumo,
      case
        when min(cc.preco_original) is not distinct from max(cc.preco_original) then min(cc.preco_original)
        else null
      end as preco_original,
      min(cc.preco_original) as preco_min,
      max(cc.preco_original) as preco_max,
      min(cc.hodometro) as hodometro_min,
      max(cc.hodometro) as hodometro_max,
      count(*)::integer as qtde,
      array_agg(cc.id order by cc.id) as carros_ids
    from candidate_cars as cc
    left join visuais_por_carro as vpc
      on vpc.carro_id = cc.id
    group by
      cc.modelo_id,
      cc.cor_normalizada,
      cc.cor,
      cc.ano_mod,
      cc.ano_fab,
      coalesce(vpc.caracteristicas_visuais_ids, '{}'::uuid[]),
      coalesce(vpc.caracteristicas_visuais_resumo, '')
    having count(*) > 1
  ),
  inserted_groups as (
    insert into public.grupos_repetidos (
      grupo_id,
      modelo_id,
      cor,
      ano_mod,
      ano_fab,
      caracteristicas_visuais_ids,
      caracteristicas_visuais_resumo,
      preco_original,
      preco_min,
      preco_max,
      hodometro_min,
      hodometro_max,
      qtde,
      atualizado_em
    )
    select
      gen_random_uuid(),
      dg.modelo_id,
      dg.cor,
      dg.ano_mod,
      dg.ano_fab,
      dg.caracteristicas_visuais_ids,
      dg.caracteristicas_visuais_resumo,
      dg.preco_original,
      dg.preco_min,
      dg.preco_max,
      dg.hodometro_min,
      dg.hodometro_max,
      dg.qtde,
      now()
    from duplicated_groups as dg
    returning grupo_id, modelo_id, cor, ano_mod, ano_fab, caracteristicas_visuais_ids
  ),
  inserted_items as (
    insert into public.repetidos (carro_id, grupo_id)
    select repeated.carro_id, ig.grupo_id
    from inserted_groups as ig
    join duplicated_groups as dg
      on dg.modelo_id = ig.modelo_id
     and dg.cor = ig.cor
     and dg.ano_mod is not distinct from ig.ano_mod
     and dg.ano_fab is not distinct from ig.ano_fab
     and dg.caracteristicas_visuais_ids is not distinct from ig.caracteristicas_visuais_ids
    cross join lateral unnest(dg.carros_ids) as repeated(carro_id)
    on conflict (carro_id) do update
      set grupo_id = excluded.grupo_id,
          updated_at = now()
    returning 1
  )
  select
    coalesce((select count(*) from inserted_groups), 0)::integer,
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
    select
      c.modelo_id,
      public.normalize_repetidos_cor(c.cor) as cor_normalizada,
      public.display_repetidos_cor(c.cor) as cor,
      c.ano_mod,
      c.ano_fab,
      count(*)::integer as qtde_base
    from public.carros as c
    where c.em_estoque = true
      and public.is_carro_disponivel_ou_novo(c.estado_venda)
    group by
      c.modelo_id,
      public.normalize_repetidos_cor(c.cor),
      public.display_repetidos_cor(c.cor),
      c.ano_mod,
      c.ano_fab
    having count(*) > 1
  ),
  candidate_cars as (
    select
      c.id,
      c.modelo_id,
      public.normalize_repetidos_cor(c.cor) as cor_normalizada,
      public.display_repetidos_cor(c.cor) as cor,
      c.ano_mod,
      c.ano_fab,
      c.preco_original,
      c.hodometro
    from public.carros as c
    join base_groups as bg
      on bg.modelo_id = c.modelo_id
     and bg.cor_normalizada = public.normalize_repetidos_cor(c.cor)
     and bg.ano_mod is not distinct from c.ano_mod
     and bg.ano_fab is not distinct from c.ano_fab
    where c.em_estoque = true
      and public.is_carro_disponivel_ou_novo(c.estado_venda)
  ),
  visuais_por_carro as (
    select
      ccv.carro_id,
      array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id) as caracteristicas_visuais_ids,
      string_agg(distinct cv.caracteristica, ' | ' order by cv.caracteristica) as caracteristicas_visuais_resumo
    from public.carro_caracteristicas_visuais as ccv
    join candidate_cars as cc
      on cc.id = ccv.carro_id
    join public.caracteristicas_visuais as cv
      on cv.id = ccv.caracteristica_id
    group by ccv.carro_id
  ),
  duplicated_groups as (
    select
      cc.modelo_id,
      cc.cor_normalizada,
      cc.cor,
      cc.ano_mod,
      cc.ano_fab,
      coalesce(vpc.caracteristicas_visuais_ids, '{}'::uuid[]) as caracteristicas_visuais_ids,
      coalesce(vpc.caracteristicas_visuais_resumo, '') as caracteristicas_visuais_resumo,
      case
        when min(cc.preco_original) is not distinct from max(cc.preco_original) then min(cc.preco_original)
        else null
      end as preco_original,
      min(cc.preco_original) as preco_min,
      max(cc.preco_original) as preco_max,
      min(cc.hodometro) as hodometro_min,
      max(cc.hodometro) as hodometro_max,
      count(*)::integer as qtde,
      array_agg(cc.id order by cc.id) as carros_ids
    from candidate_cars as cc
    left join visuais_por_carro as vpc
      on vpc.carro_id = cc.id
    group by
      cc.modelo_id,
      cc.cor_normalizada,
      cc.cor,
      cc.ano_mod,
      cc.ano_fab,
      coalesce(vpc.caracteristicas_visuais_ids, '{}'::uuid[]),
      coalesce(vpc.caracteristicas_visuais_resumo, '')
    having count(*) > 1
  ),
  inserted_groups as (
    insert into public.grupos_repetidos (
      grupo_id,
      modelo_id,
      cor,
      ano_mod,
      ano_fab,
      caracteristicas_visuais_ids,
      caracteristicas_visuais_resumo,
      preco_original,
      preco_min,
      preco_max,
      hodometro_min,
      hodometro_max,
      qtde,
      atualizado_em
    )
    select
      gen_random_uuid(),
      dg.modelo_id,
      dg.cor,
      dg.ano_mod,
      dg.ano_fab,
      dg.caracteristicas_visuais_ids,
      dg.caracteristicas_visuais_resumo,
      dg.preco_original,
      dg.preco_min,
      dg.preco_max,
      dg.hodometro_min,
      dg.hodometro_max,
      dg.qtde,
      now()
    from duplicated_groups as dg
    returning grupo_id, modelo_id, cor, ano_mod, ano_fab, caracteristicas_visuais_ids
  ),
  inserted_items as (
    insert into public.repetidos (carro_id, grupo_id)
    select repeated.carro_id, ig.grupo_id
    from inserted_groups as ig
    join duplicated_groups as dg
      on dg.modelo_id = ig.modelo_id
     and dg.cor = ig.cor
     and dg.ano_mod is not distinct from ig.ano_mod
     and dg.ano_fab is not distinct from ig.ano_fab
     and dg.caracteristicas_visuais_ids is not distinct from ig.caracteristicas_visuais_ids
    cross join lateral unnest(dg.carros_ids) as repeated(carro_id)
    on conflict (carro_id) do update
      set grupo_id = excluded.grupo_id,
          updated_at = now()
    returning 1
  )
  select
    coalesce((select count(*) from inserted_groups), 0)::integer,
    coalesce((select count(*) from inserted_items), 0)::integer;
end;
$$;

revoke all on function public.refresh_repetidos_projection_group(uuid, text, integer, integer) from anon, authenticated;
revoke all on function public.refresh_repetidos_projection() from anon, authenticated;

grant execute on function public.refresh_repetidos_projection_group(uuid, text, integer, integer) to service_role;
grant execute on function public.refresh_repetidos_projection() to service_role;

-- Reconciliação: como o bug pode ter deixado a tabela com inconsistências
-- após updates parciais bem-sucedidos, recalcula a projeção completa.
do $$
begin
  perform public.refresh_repetidos_projection();
end;
$$;
