-- Post-it: novo tipo 'fixo' (fixado no topo) + campo 'prazo' (deadline).
alter table public.observacoes drop constraint if exists observacoes_tipo_check;
alter table public.observacoes add constraint observacoes_tipo_check
  check (tipo = any (array['urgente'::text, 'observacao'::text, 'fixo'::text]));

alter table public.observacoes add column if not exists prazo date;

comment on column public.observacoes.prazo is
  'Prazo/deadline do post-it (opcional, date). Quanto mais proximo, mais alto na ordenacao.';
