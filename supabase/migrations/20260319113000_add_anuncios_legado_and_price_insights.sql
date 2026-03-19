alter table public.anuncios
add column if not exists anuncio_legado boolean not null default false,
add column if not exists id_anuncio_legado text,
add column if not exists descricao text;

create or replace view public.anuncios_price_insights as
select
  a.id as anuncio_id,
  a.carro_id,
  a.valor_anuncio,
  c.preco_original as preco_carro_atual,
  a.valor_anuncio is distinct from c.preco_original as has_pending_action,
  case
    when a.valor_anuncio is not distinct from c.preco_original then null
    when a.valor_anuncio is null and c.preco_original is not null then 'ANUNCIO_SEM_PRECO'
    when a.valor_anuncio is not null and c.preco_original is null then 'CARRO_SEM_PRECO'
    else 'PRECO_DIVERGENTE'
  end as insight_code,
  case
    when a.valor_anuncio is not distinct from c.preco_original then null
    when a.valor_anuncio is null and c.preco_original is not null then 'Anuncio sem preco e carro com preco cadastrado.'
    when a.valor_anuncio is not null and c.preco_original is null then 'Carro sem preco cadastrado e anuncio com preco informado.'
    else 'Preco do anuncio diferente do preco atual do carro.'
  end as insight_message
from public.anuncios as a
left join public.carros as c
  on c.id = a.carro_id;
