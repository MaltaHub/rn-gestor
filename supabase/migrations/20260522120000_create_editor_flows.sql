-- editor_flows: catalogo da organizacao dos fluxos node-based do editor de
-- fluxos (`/editor`). Criado/editado por GERENTE+; lido por qualquer
-- usuario autenticado. Isolamento e role gating sao feitos no service
-- (RLS sem policies, acesso via service_role).
--
-- graph (jsonb) carrega o DAG completo: {nodes[], edges[], viewport, runtimeLimits}.
-- Ao iniciar uma execucao (editor_flow_runs, fase futura), o graph e
-- snapshotado para context.graph_snapshot, garantindo que edicoes posteriores
-- nao quebrem runs em andamento.

create table if not exists public.editor_flows (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  description text,
  sheet_key text,
  graph jsonb not null,
  created_by_user_id uuid not null references auth.users(id) on update cascade on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_editor_flows_title unique (title)
);

alter table public.editor_flows enable row level security;

create index if not exists ix_editor_flows_updated_at
  on public.editor_flows (updated_at desc);
create index if not exists ix_editor_flows_sheet_key
  on public.editor_flows (sheet_key);

comment on table public.editor_flows is
  'Catalogo de fluxos node-based da organizacao. Criado/editado por GERENTE/ADMIN; lido e executado por qualquer usuario autenticado. Isolamento e role gating feitos no service.';
comment on column public.editor_flows.sheet_key is
  'Aba primaria do fluxo, ou null para fluxos multi-aba.';
comment on column public.editor_flows.graph is
  'Definicao do grafo: {nodes[], edges[], viewport, runtimeLimits}. Snapshot ao executar para context.graph_snapshot.';

create or replace function public.fn_editor_flows_set_updated_at()
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
revoke execute on function public.fn_editor_flows_set_updated_at() from public, anon, authenticated;

drop trigger if exists trg_editor_flows_set_updated_at on public.editor_flows;
create trigger trg_editor_flows_set_updated_at
  before update on public.editor_flows
  for each row
  execute function public.fn_editor_flows_set_updated_at();
