-- Regras customizaveis das pastas de veiculo (fotos/documentos).
-- Singleton (id = 1). O JSON e validado/completado no app
-- (lib/domain/file-automations/rules.ts); '{}' = comportamento historico.
-- Backend-mediated: RLS ligado sem policies (so service_role le/escreve).

create table if not exists public.arquivo_automacao_regras (
  id smallint primary key default 1,
  regras jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.usuarios_acesso(id) on delete set null,
  constraint arquivo_automacao_regras_singleton check (id = 1),
  constraint arquivo_automacao_regras_objeto check (jsonb_typeof(regras) = 'object')
);

alter table public.arquivo_automacao_regras enable row level security;

insert into public.arquivo_automacao_regras (id, regras)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

comment on table public.arquivo_automacao_regras is
  'Regras customizaveis da automacao de pastas de veiculos (vendido, criacao, exclusao, capa, nome exibido).';
