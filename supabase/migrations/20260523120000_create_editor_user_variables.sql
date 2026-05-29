-- editor_user_variables: variaveis globais per-user, cross-flow.
-- Permitem memoria de longo prazo entre execucoes do editor de fluxos.
-- SetVariable/GetVariable nodes leem/escrevem aqui.
--
-- Namespace reservado `system.*` para variaveis read-only de estado do grid
-- (selected_rows, hidden_rows, active_sheet, user_role, user_id) populadas
-- pelo runtime via dataSource.getSystemContext() — SetVariable rejeita
-- nomes com este prefixo no service.

create table if not exists public.editor_user_variables (
  user_id uuid not null references auth.users(id) on update cascade on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  value jsonb not null,
  type text not null default 'value',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, name)
);

alter table public.editor_user_variables enable row level security;

create index if not exists ix_editor_user_variables_updated_at
  on public.editor_user_variables (user_id, updated_at desc);

comment on table public.editor_user_variables is
  'Variaveis globais per-user do editor de fluxos. Cross-flow, persistente. SetVariable/GetVariable nodes leem/escrevem aqui. Reservados nomes com prefixo system.*.';

create or replace function public.fn_editor_user_variables_set_updated_at()
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
revoke execute on function public.fn_editor_user_variables_set_updated_at() from public, anon, authenticated;

drop trigger if exists trg_editor_user_variables_set_updated_at on public.editor_user_variables;
create trigger trg_editor_user_variables_set_updated_at
  before update on public.editor_user_variables
  for each row
  execute function public.fn_editor_user_variables_set_updated_at();
