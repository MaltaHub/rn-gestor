-- Post-it sem veiculo pode ter um titulo definido pelo usuario
-- (aparece no lugar de "Sem veiculo" na listagem).
alter table public.observacoes add column if not exists titulo text;

comment on column public.observacoes.titulo is
  'Titulo opcional do post-it (rotulo exibido quando nao ha veiculo vinculado).';
