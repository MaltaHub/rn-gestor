-- Tabela de telemetria de erros de cliente (Tier 1.3 do roadmap de observabilidade).
-- Alimentada por POST /api/v1/client-errors, que por sua vez recebe do
-- GlobalErrorListener quando um unhandledrejection/error global escapa no browser.
-- Objetivo: log consultavel de falhas que antes sumiam em silencio (ex.: o form
-- editor que nao abria em linhas seletas).
--
-- Backend-mediated (invariante #1): RLS habilitado SEM policies. Inserts chegam
-- via service_role (getSupabaseAdmin), que faz bypass de RLS. Nenhum acesso
-- direto cliente -> banco.

create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('unhandledrejection', 'error')),
  message text not null,
  stack text,
  source text,
  path text,
  user_agent text,
  request_id text,
  -- Ator que reportou. Sem FK de proposito: o logger de erro NUNCA pode falhar
  -- por causa de integridade referencial (ex.: usuario removido).
  actor_user_id uuid,
  role text
);

comment on table public.client_errors is
  'Telemetria de erros de cliente (unhandledrejection/error global). Escrita via service_role por /api/v1/client-errors.';

-- Consulta tipica: erros mais recentes primeiro.
create index if not exists client_errors_created_at_idx
  on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;
