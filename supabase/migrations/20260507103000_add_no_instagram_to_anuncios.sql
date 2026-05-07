alter table public.anuncios
  add column if not exists no_instagram boolean not null default false;

comment on column public.anuncios.no_instagram is
  'Marca se o anuncio foi publicado no Instagram.';
