-- Editor Word (/vendedor/word): documentos por processo de venda.
-- O "processo de venda" e a linha em `vendas`. Cada documento anexa a uma venda.
-- ON DELETE CASCADE com vendas: excluir o processo (admin) apaga os documentos.
-- conteudo = doc Tiptap (JSON) com tokens ${...} PRESERVADOS (resolvidos no render).
-- RLS habilitado sem policies, por design (backend-mediated via service_role).

create table if not exists public.venda_documentos (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas(id)
    on update cascade
    on delete cascade,
  -- carro_id denormalizado p/ agrupar a navbar por placa sem join extra.
  carro_id uuid not null references public.carros(id)
    on update cascade
    on delete cascade,
  titulo text not null check (length(btrim(titulo)) > 0),
  conteudo jsonb not null,
  template_id uuid references public.documento_templates(id)
    on update cascade
    on delete set null,
  created_by_user_id uuid references auth.users(id)
    on update cascade
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.venda_documentos enable row level security;

create index if not exists ix_venda_documentos_venda_id
  on public.venda_documentos (venda_id);

create index if not exists ix_venda_documentos_carro_id
  on public.venda_documentos (carro_id);

create index if not exists ix_venda_documentos_template_id
  on public.venda_documentos (template_id);

-- created_at / updated_at automaticos (reusa funcao existente do projeto).
drop trigger if exists trg_venda_documentos_timestamps on public.venda_documentos;
create trigger trg_venda_documentos_timestamps
before insert or update on public.venda_documentos
for each row
execute function public.fn_set_timestamps();

comment on table public.venda_documentos is 'Documentos Word por venda (/vendedor/word). conteudo = doc Tiptap (JSON, tokens ${...} preservados). ON DELETE CASCADE com vendas: excluir o processo de venda apaga os documentos.';
comment on column public.venda_documentos.carro_id is 'Denormalizado (= vendas.carro_id) p/ agrupar a navegacao por placa.';
