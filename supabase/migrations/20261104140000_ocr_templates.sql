-- Templates de OCR montados no console de /arquivos: arquivo de exemplo,
-- campos (regiao + coringas + destino da allow-list). Validados no app
-- (lib/domain/ocr/schemas.ts). Backend-mediated: RLS ligado sem policies.

create table if not exists public.ocr_templates (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo_documento text,
  ativo boolean not null default true,
  modo_aplicacao text not null default 'confirm',
  marca_pronto boolean not null default false,
  arquivo_exemplo_id uuid references public.arquivos_arquivos(id) on delete set null,
  exemplo_ocr jsonb,
  campos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.usuarios_acesso(id) on delete set null,
  updated_by uuid references public.usuarios_acesso(id) on delete set null,
  constraint ocr_templates_nome_check check (length(btrim(nome)) between 1 and 120),
  constraint ocr_templates_modo_check check (modo_aplicacao in ('confirm', 'auto')),
  constraint ocr_templates_campos_check check (jsonb_typeof(campos) = 'array')
);

create index if not exists ocr_templates_tipo_documento_idx
  on public.ocr_templates (tipo_documento)
  where ativo;

create index if not exists ocr_templates_arquivo_exemplo_idx
  on public.ocr_templates (arquivo_exemplo_id);

alter table public.ocr_templates enable row level security;

comment on table public.ocr_templates is
  'Templates de extracao (OCR) por tipo de documento: campos com regiao, coringas e destino.';
