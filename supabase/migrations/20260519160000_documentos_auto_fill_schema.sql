-- Reformula `public.documentos` para auto-preenchimento via parser de tokens
-- nos nomes dos arquivos da pasta de documentos do veiculo.
--
-- Padrao do token: <campo>_<valor>_<placa>
-- Ex: pericia_autentica_ABC1111.pdf  -> documentos.pericia = 'AUTENTICA'
--     tipo_de_processo_procuracao_ABC1111.pdf -> documentos.tipo_de_processo = 'PROCURACAO'
--
-- Last-file-wins: quando dois arquivos claimam o mesmo campo, vence o mais
-- recente (ordem por created_at asc; o ultimo aplicado fica).
--
-- A tabela esta vazia (0 rows) no momento desta migration, por isso podemos
-- DROP/RENAME colunas sem migrar dados.

begin;

------------------------------------------------------------------------------
-- 1. LOOKUPS
------------------------------------------------------------------------------

create table if not exists public.lookup_tipos_processo (
  code text primary key check (length(btrim(code)) > 0),
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.lookup_tipos_processo enable row level security;
insert into public.lookup_tipos_processo (code, name, sort_order) values
  ('PROCURACAO', 'Procuracao', 10),
  ('TRANSFERENCIA', 'Transferencia', 20)
on conflict (code) do nothing;

create table if not exists public.lookup_origens_veiculo (
  code text primary key check (length(btrim(code)) > 0),
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.lookup_origens_veiculo enable row level security;
insert into public.lookup_origens_veiculo (code, name, sort_order) values
  ('TROCA', 'Troca', 10),
  ('COMPRA', 'Compra', 20)
on conflict (code) do nothing;

create table if not exists public.lookup_propositos (
  code text primary key check (length(btrim(code)) > 0),
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.lookup_propositos enable row level security;
insert into public.lookup_propositos (code, name, sort_order) values
  ('VENDA', 'Venda', 10),
  ('REPASSE', 'Repasse', 20)
on conflict (code) do nothing;

create table if not exists public.lookup_estados_chave_reserva (
  code text primary key check (length(btrim(code)) > 0),
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.lookup_estados_chave_reserva enable row level security;
insert into public.lookup_estados_chave_reserva (code, name, sort_order) values
  ('NO_ENVELOPE', 'No envelope', 10),
  ('AGUARDANDO', 'Aguardando', 20),
  ('AUSENTE', 'Ausente', 30),
  ('PROBLEMA', 'Problema', 40)
on conflict (code) do nothing;

create table if not exists public.lookup_remetentes (
  code text primary key check (length(btrim(code)) > 0),
  name text not null,
  description text,
  documento text,
  telefone text,
  email text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.lookup_remetentes enable row level security;
comment on column public.lookup_remetentes.documento is 'CPF ou CNPJ do remetente.';

create table if not exists public.lookup_estados_pericia (
  code text primary key check (length(btrim(code)) > 0),
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.lookup_estados_pericia enable row level security;
insert into public.lookup_estados_pericia (code, name, sort_order) values
  ('AUTENTICA', 'Autentica', 10),
  ('AUSENTE', 'Ausente', 20),
  ('PROBLEMA', 'Problema', 30)
on conflict (code) do nothing;

create table if not exists public.lookup_estados_envelope (
  code text primary key check (length(btrim(code)) > 0),
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.lookup_estados_envelope enable row level security;
insert into public.lookup_estados_envelope (code, name, sort_order) values
  ('PRESENTE', 'Presente', 10),
  ('AUSENTE', 'Ausente', 20),
  ('PROBLEMA', 'Problema', 30)
on conflict (code) do nothing;

create table if not exists public.lookup_estados_transferencia (
  code text primary key check (length(btrim(code)) > 0),
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.lookup_estados_transferencia enable row level security;
insert into public.lookup_estados_transferencia (code, name, sort_order) values
  ('AGUARDANDO', 'Aguardando', 10),
  ('EM_ANDAMENTO', 'Em andamento', 20),
  ('CONCLUIDA', 'Concluida', 30),
  ('PROBLEMA', 'Problema', 40)
on conflict (code) do nothing;

------------------------------------------------------------------------------
-- 2. ALTER `documentos`
------------------------------------------------------------------------------

-- Remove o trigger antigo que referenciava tipo/responsavel
drop trigger if exists trg_documentos_uppercase on public.documentos;
drop function if exists public.fn_documentos_uppercase();

-- Drop colunas antigas (com a tabela vazia, sem perda de dados)
alter table public.documentos drop column if exists tipo;
alter table public.documentos drop column if exists pericia;
alter table public.documentos drop column if exists envelope;
alter table public.documentos drop column if exists doc_entrada;

-- Add novas colunas (FK aos lookups)
alter table public.documentos
  add column if not exists tipo_de_processo text references public.lookup_tipos_processo(code) on update cascade on delete set null,
  add column if not exists origem_veiculo text references public.lookup_origens_veiculo(code) on update cascade on delete set null,
  add column if not exists proposito text references public.lookup_propositos(code) on update cascade on delete set null,
  add column if not exists chave_reserva text references public.lookup_estados_chave_reserva(code) on update cascade on delete set null,
  add column if not exists remetente text references public.lookup_remetentes(code) on update cascade on delete set null,
  add column if not exists pericia text references public.lookup_estados_pericia(code) on update cascade on delete set null,
  add column if not exists envelope text references public.lookup_estados_envelope(code) on update cascade on delete set null,
  add column if not exists estado_transferencia text references public.lookup_estados_transferencia(code) on update cascade on delete set null;

-- Recria o trigger uppercase apenas para `responsavel` (que continua livre)
create or replace function public.fn_documentos_uppercase()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
begin
  if new.responsavel is not null then
    new.responsavel := upper(btrim(new.responsavel));
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_documentos_uppercase() from public, anon, authenticated;

drop trigger if exists trg_documentos_uppercase on public.documentos;
create trigger trg_documentos_uppercase
  before insert or update on public.documentos
  for each row
  execute function public.fn_documentos_uppercase();

comment on column public.documentos.tipo_de_processo is
  'Tipo do processo documental (procuracao, transferencia, etc). FK lookup_tipos_processo. Preenchido automaticamente pelo parser de tokens em nomes de arquivo.';
comment on column public.documentos.origem_veiculo is
  'Origem do veiculo (troca, compra). FK lookup_origens_veiculo.';
comment on column public.documentos.proposito is
  'Proposito (venda, repasse). FK lookup_propositos.';
comment on column public.documentos.chave_reserva is
  'Estado da chave reserva. FK lookup_estados_chave_reserva.';
comment on column public.documentos.remetente is
  'Remetente da documentacao. FK lookup_remetentes.';
comment on column public.documentos.pericia is
  'Estado da pericia. FK lookup_estados_pericia. Ex: AUTENTICA, AUSENTE, PROBLEMA.';
comment on column public.documentos.envelope is
  'Estado do envelope. FK lookup_estados_envelope.';
comment on column public.documentos.estado_transferencia is
  'Estado da transferencia (ex-doc_entrada). FK lookup_estados_transferencia.';

------------------------------------------------------------------------------
-- 3. PARSER + REPARSE + TRIGGER
------------------------------------------------------------------------------

create or replace function public.fn_documentos_parse_token(
  p_filename text,
  p_carro_placa text
) returns jsonb
language plpgsql
stable
security invoker
set search_path to ''
as $function$
declare
  v_norm text;
  v_placa text;
  v_result jsonb := '{}'::jsonb;
  v_match text;
begin
  if p_filename is null or p_carro_placa is null then
    return '{}'::jsonb;
  end if;
  v_norm := lower(p_filename);
  v_placa := lower(btrim(p_carro_placa));
  if v_placa = '' then return '{}'::jsonb; end if;

  select code into v_match from public.lookup_tipos_processo
   where is_active and v_norm like '%tipo_de_processo_' || lower(code) || '_' || v_placa || '%'
   order by sort_order desc, code desc limit 1;
  if v_match is not null then v_result := v_result || jsonb_build_object('tipo_de_processo', v_match); v_match := null; end if;

  select code into v_match from public.lookup_origens_veiculo
   where is_active and v_norm like '%origem_veiculo_' || lower(code) || '_' || v_placa || '%'
   order by sort_order desc, code desc limit 1;
  if v_match is not null then v_result := v_result || jsonb_build_object('origem_veiculo', v_match); v_match := null; end if;

  select code into v_match from public.lookup_propositos
   where is_active and v_norm like '%proposito_' || lower(code) || '_' || v_placa || '%'
   order by sort_order desc, code desc limit 1;
  if v_match is not null then v_result := v_result || jsonb_build_object('proposito', v_match); v_match := null; end if;

  select code into v_match from public.lookup_estados_chave_reserva
   where is_active and v_norm like '%chave_reserva_' || lower(code) || '_' || v_placa || '%'
   order by sort_order desc, code desc limit 1;
  if v_match is not null then v_result := v_result || jsonb_build_object('chave_reserva', v_match); v_match := null; end if;

  select code into v_match from public.lookup_remetentes
   where is_active and v_norm like '%remetente_' || lower(code) || '_' || v_placa || '%'
   order by sort_order desc, code desc limit 1;
  if v_match is not null then v_result := v_result || jsonb_build_object('remetente', v_match); v_match := null; end if;

  select code into v_match from public.lookup_estados_pericia
   where is_active and v_norm like '%pericia_' || lower(code) || '_' || v_placa || '%'
   order by sort_order desc, code desc limit 1;
  if v_match is not null then v_result := v_result || jsonb_build_object('pericia', v_match); v_match := null; end if;

  select code into v_match from public.lookup_estados_envelope
   where is_active and v_norm like '%envelope_' || lower(code) || '_' || v_placa || '%'
   order by sort_order desc, code desc limit 1;
  if v_match is not null then v_result := v_result || jsonb_build_object('envelope', v_match); v_match := null; end if;

  select code into v_match from public.lookup_estados_transferencia
   where is_active and v_norm like '%estado_transferencia_' || lower(code) || '_' || v_placa || '%'
   order by sort_order desc, code desc limit 1;
  if v_match is not null then v_result := v_result || jsonb_build_object('estado_transferencia', v_match); v_match := null; end if;

  return v_result;
end;
$function$;
revoke execute on function public.fn_documentos_parse_token(text, text) from public, anon, authenticated;

create or replace function public.fn_documentos_reparse_carro(p_carro_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_placa text;
  v_root_folder uuid;
  v_acc jsonb := '{}'::jsonb;
  v_has_any boolean := false;
  v_file record;
begin
  select c.placa::text into v_placa from public.carros c where c.id = p_carro_id;
  if v_placa is null then return; end if;

  select folder_id into v_root_folder
    from public.arquivo_automacao_folders
   where automation_key = 'vehicle_documents'
     and carro_id = p_carro_id
     and archived_at is null
   limit 1;

  if v_root_folder is null then
    delete from public.documentos where carro_id = p_carro_id;
    return;
  end if;

  for v_file in
    with recursive subtree(folder_id) as (
      select v_root_folder
      union all
      select f.id from public.arquivos_pastas f
       join subtree s on f.parent_folder_id = s.folder_id
    )
    select a.nome_arquivo, a.created_at
      from public.arquivos_arquivos a
      join subtree s on s.folder_id = a.pasta_id
     order by a.created_at asc, a.id asc
  loop
    v_acc := v_acc || public.fn_documentos_parse_token(v_file.nome_arquivo, v_placa);
  end loop;

  v_has_any := v_acc <> '{}'::jsonb;

  if not v_has_any then
    delete from public.documentos where carro_id = p_carro_id;
    return;
  end if;

  insert into public.documentos as d (
    carro_id, tipo_de_processo, origem_veiculo, proposito, chave_reserva,
    remetente, pericia, envelope, estado_transferencia
  ) values (
    p_carro_id,
    v_acc->>'tipo_de_processo',
    v_acc->>'origem_veiculo',
    v_acc->>'proposito',
    v_acc->>'chave_reserva',
    v_acc->>'remetente',
    v_acc->>'pericia',
    v_acc->>'envelope',
    v_acc->>'estado_transferencia'
  )
  on conflict (carro_id) do update set
    tipo_de_processo = excluded.tipo_de_processo,
    origem_veiculo = excluded.origem_veiculo,
    proposito = excluded.proposito,
    chave_reserva = excluded.chave_reserva,
    remetente = excluded.remetente,
    pericia = excluded.pericia,
    envelope = excluded.envelope,
    estado_transferencia = excluded.estado_transferencia,
    updated_at = now();
end;
$function$;
revoke execute on function public.fn_documentos_reparse_carro(uuid) from public, anon, authenticated;

create or replace function public.fn_documentos_handle_arquivo_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_carro_id uuid;
  v_pasta_ids uuid[] := array[]::uuid[];
begin
  if (tg_op = 'INSERT' or tg_op = 'UPDATE') and new.pasta_id is not null then
    v_pasta_ids := array_append(v_pasta_ids, new.pasta_id);
  end if;
  if (tg_op = 'UPDATE' or tg_op = 'DELETE') and old.pasta_id is not null then
    v_pasta_ids := array_append(v_pasta_ids, old.pasta_id);
  end if;

  if array_length(v_pasta_ids, 1) is null then
    return null;
  end if;

  for v_carro_id in
    with recursive ancestors(folder_id, depth) as (
      select id, 0 from public.arquivos_pastas where id = any(v_pasta_ids)
      union all
      select p.parent_folder_id, a.depth + 1
        from public.arquivos_pastas p
        join ancestors a on p.id = a.folder_id
       where p.parent_folder_id is not null and a.depth < 20
    )
    select distinct af.carro_id
      from ancestors anc
      join public.arquivo_automacao_folders af on af.folder_id = anc.folder_id
     where af.automation_key = 'vehicle_documents'
       and af.archived_at is null
       and af.carro_id is not null
  loop
    perform public.fn_documentos_reparse_carro(v_carro_id);
  end loop;

  return null;
end;
$function$;
revoke execute on function public.fn_documentos_handle_arquivo_change() from public, anon, authenticated;

drop trigger if exists trg_documentos_handle_arquivo_change on public.arquivos_arquivos;
create trigger trg_documentos_handle_arquivo_change
  after insert or update or delete on public.arquivos_arquivos
  for each row
  execute function public.fn_documentos_handle_arquivo_change();

commit;
