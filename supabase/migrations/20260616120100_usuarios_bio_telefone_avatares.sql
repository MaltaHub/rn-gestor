-- Perfil do vendedor (auto-servico em /perfil): bio + telefone, e bucket publico
-- de avatares. A `foto` (ja existente em usuarios_acesso) passa a ser preenchida
-- por upload neste bucket. O telefone vira o numero do WhatsApp por vendedor
-- usado no catalogo/galeria publicos.
alter table public.usuarios_acesso
  add column if not exists bio text,
  add column if not exists telefone text;

comment on column public.usuarios_acesso.bio is
  'Bio curta do usuario (auto-servico em /perfil).';
comment on column public.usuarios_acesso.telefone is
  'Telefone/WhatsApp do vendedor. Usado no botao de WhatsApp do catalogo/galeria (fallback: numero padrao da loja).';

-- Bucket PUBLICO de avatares: a foto de perfil aparece em paginas publicas
-- (catalogo/galeria), onde signed URLs com TTL nao servem. Leitura publica vem
-- do `public = true`; a escrita ocorre so via service_role (backend-mediated),
-- que ignora RLS — por isso nao e necessaria policy de escrita.
insert into storage.buckets (id, name, public)
values ('avatares', 'avatares', true)
on conflict (id) do update set public = true;
