-- ANUNCIADO_REPETIDO nao dizia DE QUEM o veiculo e repetido. Agora carros e
-- anuncios guardam a placa do anuncio representante (placa_anunciado_repetido),
-- e o calculo de anuncios (sync_carros_estado_anuncio) mantem esse campo.

alter table public.carros
  add column if not exists placa_anunciado_repetido text;
alter table public.anuncios
  add column if not exists placa_anunciado_repetido text;

comment on column public.carros.placa_anunciado_repetido is
  'Placa do anuncio representante de quem este carro e repetido (so quando estado_anuncio=ANUNCIADO_REPETIDO). Calculado por sync_carros_estado_anuncio.';
comment on column public.anuncios.placa_anunciado_repetido is
  'Placa do anuncio representante (espelha carros.placa_anunciado_repetido quando o anuncio esta ANUNCIADO_REPETIDO).';

-- Resolve a placa do anuncio "de quem este carro e repetido". Espelha as
-- condicoes do ANUNCIADO_REPETIDO em resolve_carro_estado_anuncio:
--   1) carro do MESMO grupo de repetidos, elegivel, com anuncio ANUNCIADO e
--      MESMO preco_original; senao
--   2) gemeo identico (modelo + cor + ano_mod + visuais) anunciado, quando o
--      proprio carro tem preco.
-- Representante = menor hodometro (mesma regra de is_group_representative).
create or replace function public.resolve_carro_placa_anunciado_repetido(p_carro_id uuid)
returns text language sql stable security definer set search_path to ''
as $function$
  with target_car as (
    select c.id, c.preco_original, c.modelo_id, c.hodometro,
           public.display_repetidos_cor(c.cor) as cor, c.ano_mod
      from public.carros c where c.id = p_carro_id
  ),
  target_visuais as (
    select coalesce((select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id)
                      from public.carro_caracteristicas_visuais ccv where ccv.carro_id = p_carro_id), '{}'::uuid[]) as ids
  ),
  target_group as (select public.resolve_carro_repetido_grupo_id(p_carro_id) as grupo_id),
  group_same_price as (
    select advertised_car.placa, advertised_car.hodometro
      from target_group tg
      join public.repetidos r on r.grupo_id = tg.grupo_id
      join public.carros advertised_car on advertised_car.id = r.carro_id
        and public.is_carro_elegivel_calculo(advertised_car.em_estoque, advertised_car.estado_venda, advertised_car.participa_calculos)
      join public.anuncios a on a.carro_id = r.carro_id and a.estado_anuncio = 'ANUNCIADO'
      join target_car tc on true
     where tg.grupo_id is not null
       and r.carro_id is distinct from p_carro_id
       and advertised_car.preco_original is not distinct from tc.preco_original
     order by advertised_car.hodometro asc nulls last, advertised_car.placa
     limit 1
  ),
  twin_with_ad as (
    select twin.placa, twin.hodometro
      from target_car tc cross join target_visuais tv
      join public.carros twin
        on twin.modelo_id = tc.modelo_id
       and public.display_repetidos_cor(twin.cor) = tc.cor
       and twin.ano_mod is not distinct from tc.ano_mod
       and public.is_carro_elegivel_calculo(twin.em_estoque, twin.estado_venda, twin.participa_calculos)
       and twin.id is distinct from tc.id
      join public.anuncios a on a.carro_id = twin.id and a.estado_anuncio = 'ANUNCIADO'
     where coalesce((select array_agg(distinct ccv.caracteristica_id order by ccv.caracteristica_id)
                       from public.carro_caracteristicas_visuais ccv where ccv.carro_id = twin.id), '{}'::uuid[])
        is not distinct from tv.ids
       and tc.preco_original is not null
     order by twin.hodometro asc nulls last, twin.placa
     limit 1
  )
  select coalesce((select placa from group_same_price), (select placa from twin_with_ad));
$function$;

revoke all on function public.resolve_carro_placa_anunciado_repetido(uuid) from public, anon, authenticated;

-- O sync agora ATUALIZA anuncios (placa_anunciado_repetido). O trigger
-- handle_anuncios_after_change chamava refresh -> sync -> update anuncios ->
-- trigger... (recursao). Guarda contra reentrancia: durante o sync (flag on),
-- o trigger nao reprocessa — o refresh ja foi feito pelo chamador.
create or replace function public.handle_anuncios_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.syncing_carros_estado_anuncio', true), 'off') = 'on' then
    return null;
  end if;
  perform public.refresh_anuncios_reference_projection();
  return null;
end;
$$;

revoke all on function public.handle_anuncios_after_change() from public, anon, authenticated;
grant execute on function public.handle_anuncios_after_change() to service_role;

-- sync passa a manter estado_anuncio E placa_anunciado_repetido em carros e
-- anuncios. A placa so e preenchida quando o estado e ANUNCIADO_REPETIDO.
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
    select c.id,
           public.resolve_carro_estado_anuncio(c.id) as estado_anuncio
    from public.carros as c
    where p_carro_ids is null or c.id = any(p_carro_ids)
  ),
  resolved as (
    select t.id, t.estado_anuncio,
           case when t.estado_anuncio = 'ANUNCIADO_REPETIDO'
                then public.resolve_carro_placa_anunciado_repetido(t.id)
                else null end as placa_rep
    from target t
  )
  update public.carros as c
  set estado_anuncio = r.estado_anuncio,
      placa_anunciado_repetido = r.placa_rep
  from resolved r
  where c.id = r.id
    and (c.estado_anuncio is distinct from r.estado_anuncio
         or c.placa_anunciado_repetido is distinct from r.placa_rep);

  get diagnostics affected_count = row_count;

  -- Espelha em anuncios: a placa do representante quando o proprio anuncio
  -- esta ANUNCIADO_REPETIDO (senao limpa).
  update public.anuncios as a
  set placa_anunciado_repetido = case
        when a.estado_anuncio = 'ANUNCIADO_REPETIDO'
        then public.resolve_carro_placa_anunciado_repetido(a.carro_id)
        else null end
  from public.carros as c
  where a.carro_id = c.id
    and (p_carro_ids is null or c.id = any(p_carro_ids))
    and a.placa_anunciado_repetido is distinct from (case
          when a.estado_anuncio = 'ANUNCIADO_REPETIDO'
          then public.resolve_carro_placa_anunciado_repetido(a.carro_id)
          else null end);

  perform set_config('app.syncing_carros_estado_anuncio', 'off', true);
  return affected_count;
exception
  when others then
    perform set_config('app.syncing_carros_estado_anuncio', 'off', true);
    raise;
end;
$$;

revoke all on function public.sync_carros_estado_anuncio(uuid[]) from public, anon, authenticated;

-- Backfill geral.
select public.sync_carros_estado_anuncio(null);
