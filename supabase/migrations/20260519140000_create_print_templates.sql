-- Templates de impressao do print-composer. Cada usuario pode salvar
-- multiplas configuracoes nomeadas por aba (carros, anuncios, vendas, etc.).
-- Acesso pelo service_role (RLS habilitada sem policies), isolamento por
-- user_id e feito no servico da API.

create table if not exists public.print_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on update cascade on delete cascade,
  sheet_key text not null check (length(btrim(sheet_key)) > 0),
  title text not null check (length(btrim(title)) > 0),
  config jsonb not null,
  anchor_filter jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_print_templates_user_sheet_title unique (user_id, sheet_key, title)
);

alter table public.print_templates enable row level security;

create index if not exists ix_print_templates_user_sheet
  on public.print_templates (user_id, sheet_key);

create index if not exists ix_print_templates_updated_at
  on public.print_templates (updated_at desc);

comment on table public.print_templates is
  'Templates de impressao salvos por usuario para o composer de impressao. Acessado via service_role; isolamento por user_id e feito no servico.';
comment on column public.print_templates.sheet_key is
  'Chave da aba ativa (ex.: carros, anuncios, vendas). Templates so aparecem na aba correspondente.';
comment on column public.print_templates.config is
  'Payload do template: titulo, escopo, colunas, ordenacao, secoes, filtros, highlights (StoredPrintConfig estendido).';
comment on column public.print_templates.anchor_filter is
  'Pre-filtro independente que estreita o dataset ANTES do print job.';

create or replace function public.fn_print_templates_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.fn_print_templates_set_updated_at() from public, anon, authenticated;

drop trigger if exists trg_print_templates_set_updated_at on public.print_templates;
create trigger trg_print_templates_set_updated_at
  before update on public.print_templates
  for each row
  execute function public.fn_print_templates_set_updated_at();
