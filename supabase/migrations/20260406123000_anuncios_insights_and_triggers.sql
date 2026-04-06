-- Consolidation of anuncios insights, verifications and triggers

create table if not exists public.anuncios_insight_verifications (
  anuncio_id uuid not null references public.anuncios(id) on delete cascade,
  insight_code text not null,
  verified_by uuid null,
  verified_at timestamptz not null default now(),
  primary key (anuncio_id, insight_code)
);

-- View that centralizes operational insights for anuncios
create or replace view public.anuncios_operational_insights as
with base as (
  select
    a.id as anuncio_id,
    a.carro_id,
    a.valor_anuncio,
    a.updated_at as anuncio_updated_at,
    c.preco_original as preco_carro_atual,
    c.em_estoque,
    c.estado_venda,
    c.updated_at as carro_updated_at,
    r.grupo_id
  from public.anuncios as a
  left join public.carros as c
    on c.id = a.carro_id
  left join public.repetidos as r
    on r.carro_id = a.carro_id
)
, chosen_reference as (
  -- For repeated cars, pick current chosen representative for the same group and price
  select
    b.anuncio_id,
    ar.carro_id as chosen_carro_id
  from base as b
  left join public.anuncios_referencia as ar
    on ar.grupo_id is not distinct from b.grupo_id
   and ar.preco_original is not distinct from b.preco_carro_atual
)
, computed as (
  select
    b.anuncio_id,
    b.carro_id,
    b.preco_carro_atual,
    -- Price pending: anuncio price differs from current car price
    (b.valor_anuncio is distinct from b.preco_carro_atual) as needs_update_price,
    -- Reference pending: anuncio points to a car that is not the current chosen representative (when applicable)
    (cr.chosen_carro_id is not null and cr.chosen_carro_id is distinct from b.carro_id) as needs_update_reference,
    -- Delete recommended when vehicle is sold/out of stock
    ((b.em_estoque = false) or (not public.is_carro_disponivel_ou_novo(b.estado_venda))) as needs_delete,
    greatest(coalesce(b.anuncio_updated_at, timestamp 'epoch'), coalesce(b.carro_updated_at, timestamp 'epoch')) as last_change
  from base as b
  left join chosen_reference as cr
    on cr.anuncio_id = b.anuncio_id
)
, with_verification as (
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
)
select
  wv.anuncio_id,
  wv.carro_id,
  wv.preco_carro_atual,
  -- yellow highlight when update needed and not verified
  ((wv.needs_update_price or wv.needs_update_reference) and not wv.update_verified) as has_pending_action,
  -- purple state
  wv.needs_delete as delete_recommended,
  -- primary code/message focused on update; clients may use delete_recommended separately
  case
    when (wv.needs_update_price or wv.needs_update_reference) and not wv.update_verified then 'ATUALIZAR_ANUNCIO'
    else null
  end as insight_code,
  case
    when (wv.needs_update_reference) and not wv.update_verified then 'Atualizar anuncio para o veiculo representativo do grupo.'
    when (wv.needs_update_price) and not wv.update_verified then 'Preco do anuncio diferente do preco atual do carro.'
    else null
  end as insight_message
from with_verification as wv;

-- Keep anuncios_referencia up to date when anuncios change (affects chosen representative)
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

drop trigger if exists trg_refresh_anuncios_reference_after_anuncios_insert on public.anuncios;
create trigger trg_refresh_anuncios_reference_after_anuncios_insert
after insert on public.anuncios
referencing new table as new_rows
for each statement
execute function public.handle_anuncios_after_change();

drop trigger if exists trg_refresh_anuncios_reference_after_anuncios_update on public.anuncios;
create trigger trg_refresh_anuncios_reference_after_anuncios_update
after update on public.anuncios
referencing old table as old_rows new table as new_rows
for each statement
execute function public.handle_anuncios_after_change();

drop trigger if exists trg_refresh_anuncios_reference_after_anuncios_delete on public.anuncios;
create trigger trg_refresh_anuncios_reference_after_anuncios_delete
after delete on public.anuncios
referencing old table as old_rows
for each statement
execute function public.handle_anuncios_after_change();

revoke all on function public.handle_anuncios_after_change() from anon, authenticated;
grant execute on function public.handle_anuncios_after_change() to service_role;

