-- Adiciona `codigo_oficial` ao catalogo de modelos.
-- Codigo do modelo (ex.: codigo de tabela/fabricante) acoplado ao modelo_id do
-- carro; exposto no editor Word (/vendedor/word) via o token ${codigo_oficial}.
alter table public.modelos
  add column if not exists codigo_oficial text;

comment on column public.modelos.codigo_oficial is
  'Codigo oficial do modelo (ex.: codigo de tabela/fabricante). Exposto nos documentos Word via ${codigo_oficial}.';
