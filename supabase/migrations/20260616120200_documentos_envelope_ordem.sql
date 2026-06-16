-- Ordenação "envelopes FECHANDO primeiro" na tabela documentos.
-- Coluna gerada usada como sort default (envelope_ordem asc, depois created_at
-- desc) — assim os envelopes a fechar aparecem no topo em TODAS as páginas
-- enquanto o usuário não aplica um sort/filtro próprio. Não entra no grid (não
-- está no header/colunas selecionáveis); só serve para ordenar no servidor.
alter table public.documentos
  add column if not exists envelope_ordem int
  generated always as (case when envelope = 'FECHANDO' then 0 else 1 end) stored;

comment on column public.documentos.envelope_ordem is
  'Rank de ordenação: 0 para envelope FECHANDO, 1 para o resto. Sort default do grid (FECHANDO primeiro).';
