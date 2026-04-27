-- Distinguish repeated vehicles with an active ad in the group from generic missing-reference rows.

create or replace view public.anuncios_missing_reference as
with repeated_groups_with_active_ads as (
  select distinct
    r.grupo_id
  from public.repetidos as r
  join public.anuncios as a
    on a.carro_id = r.carro_id
  join public.carros as c
    on c.id = r.carro_id
   and c.em_estoque = true
   and public.is_carro_disponivel_ou_novo(c.estado_venda)
  where a.estado_anuncio = 'ANUNCIADO'
)
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
  case
    when ar.origem_repetido
     and exists (
       select 1
       from repeated_groups_with_active_ads as rg
       where rg.grupo_id is not distinct from ar.grupo_id
     ) then
      'Veiculo repetido com anuncio ativo no grupo; tratar como preco extra antes de anunciar: '
      || coalesce(nullif(ar.nome, ''), 'Sem nome')
      || case
        when nullif(ar.placa, '') is not null then ' | ' || ar.placa
        else ''
      end
    else
      'Veiculo de referencia sem anuncio cadastrado: '
      || coalesce(nullif(ar.nome, ''), 'Sem nome')
      || case
        when nullif(ar.placa, '') is not null then ' | ' || ar.placa
        else ''
      end
  end as insight_message,
  case
    when ar.origem_repetido
     and exists (
       select 1
       from repeated_groups_with_active_ads as rg
       where rg.grupo_id is not distinct from ar.grupo_id
     ) then 'ANUNCIO_PRECO_EXTRA'
    else 'ANUNCIO_SEM_REFERENCIA'
  end as insight_code
from public.anuncios_referencia as ar
where not exists (
  select 1
  from public.anuncios as a
  where a.carro_id = ar.carro_id
);

select public.refresh_anuncios_reference_projection();
