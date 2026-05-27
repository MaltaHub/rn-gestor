-- editor_flow_runs: execucoes duraveis do editor de fluxos.
-- O cliente segura um lock via (lock_token uuid, locked_until timestamptz).
-- TTL: 30s renovado por heartbeat a cada 10s no cliente. Se locked_until
-- expira (cliente morreu), outro cliente pode reclamar o run.
--
-- Estados validos:
--   running                : executando agora (lock detido).
--   paused_at_tag          : pausa em TAG (Fase 6+) aguardando "Liberar".
--   paused_awaiting_form   : pausa em TAG com dialog (Mass Update, Imprimir) (Fase 7).
--   completed | failed | cancelled : terminais.
--
-- Unique partial index garante so uma run ativa por (flow_id, user_id).

create table if not exists public.editor_flow_runs (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.editor_flows(id) on update cascade on delete restrict,
  user_id uuid not null references auth.users(id) on update cascade on delete cascade,
  status text not null check (status in (
    'running', 'paused_at_tag', 'paused_awaiting_form',
    'completed', 'failed', 'cancelled'
  )),
  current_node_id text,
  context jsonb not null default '{}'::jsonb,
  paused_reason text,
  error text,
  lock_token uuid,
  locked_until timestamptz,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.editor_flow_runs enable row level security;

create index if not exists ix_flow_runs_user_status
  on public.editor_flow_runs (user_id, status);
create index if not exists ix_flow_runs_started_at
  on public.editor_flow_runs (started_at desc);

create unique index if not exists ix_flow_runs_active_per_flow_user
  on public.editor_flow_runs (flow_id, user_id)
  where status in ('running', 'paused_at_tag', 'paused_awaiting_form');

comment on table public.editor_flow_runs is
  'Execucoes do editor de fluxos. Estado duravel com pause/resume; lock por client via lock_token + locked_until (TTL 30s renovado por heartbeat). Snapshot do graph em context.graph_snapshot.';
comment on column public.editor_flow_runs.context is
  '{graph_snapshot: FlowGraph, stack_frames: StackFrame[], logs: LogEntry[], result?: RunResult, ...}';
comment on column public.editor_flow_runs.lock_token is
  'Token do client que detem o lock. Mutacoes exigem lock_token = $token e locked_until > now().';

create or replace function public.fn_editor_flow_runs_set_updated_at()
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
revoke execute on function public.fn_editor_flow_runs_set_updated_at() from public, anon, authenticated;

drop trigger if exists trg_editor_flow_runs_set_updated_at on public.editor_flow_runs;
create trigger trg_editor_flow_runs_set_updated_at
  before update on public.editor_flow_runs
  for each row
  execute function public.fn_editor_flow_runs_set_updated_at();
