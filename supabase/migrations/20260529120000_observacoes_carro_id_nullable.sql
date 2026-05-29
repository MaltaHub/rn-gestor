-- Permite post-it sem veiculo vinculado: carro_id passa a ser opcional.
-- A FK observacoes_carro_id_fkey ja aceita NULL (so valida quando preenchido).
alter table public.observacoes alter column carro_id drop not null;

comment on column public.observacoes.carro_id is
  'Veiculo vinculado (opcional). NULL = post-it geral, sem veiculo.';
