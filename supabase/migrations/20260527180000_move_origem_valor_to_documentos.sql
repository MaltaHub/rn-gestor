-- Correcao: origem e valor de entrada pertencem a DOCUMENTOS (nao a carros).
-- Reverte carros.origem/valor_entrada (adicionados por engano) e adiciona em
-- documentos. preco_original em carros NAO e tocado (feature de contexto de preco).

alter table public.carros drop column if exists origem;
alter table public.carros drop column if exists valor_entrada;

alter table public.documentos
  add column if not exists origem text references public.lookup_origens_veiculo(code) on update cascade on delete set null,
  add column if not exists valor_entrada numeric;

comment on column public.documentos.origem is 'Origem do veiculo na entrada (troca/compra), definida manualmente.';
comment on column public.documentos.valor_entrada is 'Valor do veiculo na entrada (custo de aquisicao).';
