-- Editor Word (/vendedor/word): templates de documentos.
-- conteudo = doc Tiptap (JSON). Leitura liberada a qualquer autenticado;
-- escrita (create/update/delete) restrita a GERENTE+ na camada de API.
-- RLS habilitado sem policies, por design (backend-mediated via service_role).

create table if not exists public.documento_templates (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(btrim(titulo)) > 0),
  descricao text,
  conteudo jsonb not null,
  is_active boolean not null default true,
  created_by_user_id uuid references auth.users(id)
    on update cascade
    on delete set null,
  updated_by_user_id uuid references auth.users(id)
    on update cascade
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.documento_templates enable row level security;

create index if not exists ix_documento_templates_is_active
  on public.documento_templates (is_active);

-- created_at / updated_at automaticos (reusa funcao existente do projeto).
drop trigger if exists trg_documento_templates_timestamps on public.documento_templates;
create trigger trg_documento_templates_timestamps
before insert or update on public.documento_templates
for each row
execute function public.fn_set_timestamps();

comment on table public.documento_templates is 'Templates do editor Word (/vendedor/word). conteudo = doc Tiptap (JSON). Leitura liberada; escrita restrita a GERENTE+ na API.';
comment on column public.documento_templates.conteudo is 'Documento Tiptap serializado (JSON). Pode conter tokens ${...} resolvidos no render.';
