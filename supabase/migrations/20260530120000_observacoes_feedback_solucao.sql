-- Feedback de solucao para post-its: campo livre que o usuario preenche ao
-- resolver um post-it (ou ao editar) descrevendo COMO foi resolvido. Mantem o
-- contexto historico junto da linha resolvida (e o audit log).
alter table public.observacoes
  add column if not exists feedback_solucao text;

comment on column public.observacoes.feedback_solucao is
  'Texto livre descrevendo a solucao aplicada ao post-it. Costuma ser preenchido junto com a resolucao.';
