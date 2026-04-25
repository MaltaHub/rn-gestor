-- Centralize announcement status calculation and make anuncio insights mutually coherent.

insert into public.lookup_announcement_statuses (code, name, description, is_active, sort_order, updated_at)
values (
  'ANUNCIADO_REPETIDO',
  'Anunciado Repetido',
  'Veiculo sem anuncio proprio, mas representado por anuncio de um repetido.',
  true,
  15,
  now()
)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    is_active = true,
    sort_order = excluded.sort_order,
    updated_at = now();

create or replace function public.resolve_carro_repetido_grupo_id(p_carro_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with target_car as (
    select
      c.id,
      c.modelo_id,
      public.display_repetidos_cor(c.cor) as cor,
      c.ano_mod,
      c.ano_fab,
      coalesce(v.caracteristicas_visuais_ids, '{}'::uuid[]) as caracteristicas_visuais_ids
    from public.carros as c
    left join lateral (
      select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id) as caracteristicas_visuais_ids
      from public.carro_caracteristicas_visuais as ccv
      where ccv.carro_id = c.id
    ) as v on true
    where c.id = p_carro_id
  )
  select coalesce(
    (
      select r.grupo_id
      from public.repetidos as r
      where r.carro_id = p_carro_id
      order by r.grupo_id
      limit 1
    ),
    (
      select gr.grupo_id
      from public.grupos_repetidos as gr
      join target_car as tc
        on tc.modelo_id = gr.modelo_id
       and tc.cor = gr.cor
       and gr.ano_mod is not distinct from tc.ano_mod
       and gr.ano_fab is not distinct from tc.ano_fab
       and coalesce(gr.caracteristicas_visuais_ids, '{}'::uuid[]) is not distinct from tc.caracteristicas_visuais_ids
      order by gr.atualizado_em desc nulls last, gr.created_at desc nulls last, gr.grupo_id
      limit 1
    )
  );
$$;

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
  target_group as (
    select public.resolve_carro_repetido_grupo_id(p_carro_id) as grupo_id
  )
  select coalesce(
    (select estado_anuncio from own_ad),
    case
      when exists (
        select 1
        from target_group as tg
        join public.repetidos as r
          on r.grupo_id = tg.grupo_id
        join public.anuncios as a
          on a.carro_id = r.carro_id
        where tg.grupo_id is not null
          and r.carro_id is distinct from p_carro_id
          and a.estado_anuncio = 'ANUNCIADO'
      ) then 'ANUNCIADO_REPETIDO'
      else 'AUSENTE'
    end
  );
$$;

create or replace function public.sync_carros_estado_anuncio(p_carro_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_count integer;
begin
  perform set_config('app.syncing_carros_estado_anuncio', 'on', true);

  with target as (
    select c.id, public.resolve_carro_estado_anuncio(c.id) as estado_anuncio
    from public.carros as c
    where p_carro_ids is null
       or c.id = any(p_carro_ids)
  )
  update public.carros as c
  set estado_anuncio = target.estado_anuncio
  from target
  where c.id = target.id
    and c.estado_anuncio is distinct from target.estado_anuncio;

  get diagnostics affected_count = row_count;
  perform set_config('app.syncing_carros_estado_anuncio', 'off', true);
  return affected_count;
exception
  when others then
    perform set_config('app.syncing_carros_estado_anuncio', 'off', true);
    raise;
end;
$$;

create or replace function public.handle_repetidos_after_carros_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_group record;
begin
  if current_setting('app.syncing_carros_estado_anuncio', true) = 'on' then
    return null;
  end if;

  for affected_group in
    select distinct
      nr.modelo_id,
      public.display_repetidos_cor(nr.cor) as cor,
      nr.ano_mod,
      nr.ano_fab
    from new_rows as nr
    where nr.modelo_id is not null
  loop
    perform public.refresh_repetidos_projection_group(
      affected_group.modelo_id,
      affected_group.cor,
      affected_group.ano_mod,
      affected_group.ano_fab
    );
  end loop;

  perform public.refresh_anuncios_reference_projection();
  return null;
end;
$$;

create or replace function public.handle_repetidos_after_carros_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_group record;
begin
  if current_setting('app.syncing_carros_estado_anuncio', true) = 'on' then
    return null;
  end if;

  for affected_group in
    with changed_groups as (
      select
        nr.modelo_id,
        public.display_repetidos_cor(nr.cor) as cor,
        nr.ano_mod,
        nr.ano_fab
      from new_rows as nr
      where nr.modelo_id is not null

      union

      select
        orw.modelo_id,
        public.display_repetidos_cor(orw.cor) as cor,
        orw.ano_mod,
        orw.ano_fab
      from old_rows as orw
      where orw.modelo_id is not null
    )
    select distinct
      cg.modelo_id,
      cg.cor,
      cg.ano_mod,
      cg.ano_fab
    from changed_groups as cg
  loop
    perform public.refresh_repetidos_projection_group(
      affected_group.modelo_id,
      affected_group.cor,
      affected_group.ano_mod,
      affected_group.ano_fab
    );
  end loop;

  perform public.refresh_anuncios_reference_projection();
  return null;
end;
$$;

create or replace function public.handle_repetidos_after_carros_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_group record;
begin
  if current_setting('app.syncing_carros_estado_anuncio', true) = 'on' then
    return null;
  end if;

  for affected_group in
    select distinct
      orw.modelo_id,
      public.display_repetidos_cor(orw.cor) as cor,
      orw.ano_mod,
      orw.ano_fab
    from old_rows as orw
    where orw.modelo_id is not null
  loop
    perform public.refresh_repetidos_projection_group(
      affected_group.modelo_id,
      affected_group.cor,
      affected_group.ano_mod,
      affected_group.ano_fab
    );
  end loop;

  perform public.refresh_anuncios_reference_projection();
  return null;
end;
$$;

create or replace function public.refresh_anuncios_reference_projection()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  reference_count integer;
begin
  refresh materialized view public.anuncios_referencia;
  perform public.sync_carros_estado_anuncio(null);

  select count(*)::integer
  into reference_count
  from public.anuncios_referencia;

  return reference_count;
end;
$$;

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
  join public.carros as c on c.id = r.carro_id
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
    ((b.em_estoque = false) or (not public.is_carro_disponivel_ou_novo(b.estado_venda))) as needs_delete,
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
       and (wv.needs_delete or wv.needs_update_reference)
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
      'Recomendado apagar anuncio: veiculo vendido ou fora de estoque sem repetido disponivel para substituicao.'
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

create or replace function public.handle_anuncios_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_anuncios_reference_projection();
  return null;
end;
$$;

revoke all on function public.resolve_carro_repetido_grupo_id(uuid) from public, anon, authenticated;
revoke all on function public.resolve_carro_estado_anuncio(uuid) from public, anon, authenticated;
revoke all on function public.sync_carros_estado_anuncio(uuid[]) from public, anon, authenticated;
revoke all on function public.refresh_anuncios_reference_projection() from public, anon, authenticated;
revoke all on function public.handle_anuncios_after_change() from public, anon, authenticated;
revoke all on function public.handle_repetidos_after_carros_insert() from public, anon, authenticated;
revoke all on function public.handle_repetidos_after_carros_update() from public, anon, authenticated;
revoke all on function public.handle_repetidos_after_carros_delete() from public, anon, authenticated;

grant execute on function public.resolve_carro_repetido_grupo_id(uuid) to service_role;
grant execute on function public.resolve_carro_estado_anuncio(uuid) to service_role;
grant execute on function public.sync_carros_estado_anuncio(uuid[]) to service_role;
grant execute on function public.refresh_anuncios_reference_projection() to service_role;
grant execute on function public.handle_anuncios_after_change() to service_role;
grant execute on function public.handle_repetidos_after_carros_insert() to service_role;
grant execute on function public.handle_repetidos_after_carros_update() to service_role;
grant execute on function public.handle_repetidos_after_carros_delete() to service_role;

select public.refresh_anuncios_reference_projection();
