-- Entrada do veiculo + refatoracao de documentos:
--  (1) carros.origem (troca/compra) e carros.valor_entrada definidos na entrada;
--  (2) nova tabela remetentes (id, nome, endereco, cpf_cnpj) e documentos.remetente_id;
--  (3) documentos.responsavel -> responsavel_virado (texto livre);
--  (4) remove documentos.origem_veiculo (origem agora vive no carro);
--  (5) parser/reparse atualizados (sem origem_veiculo e sem remetente por token).

-- 1) Entrada do veiculo: origem + valor.
alter table public.carros
  add column if not exists origem text references public.lookup_origens_veiculo(code) on update cascade on delete set null,
  add column if not exists valor_entrada numeric;
comment on column public.carros.origem is 'Origem do veiculo na entrada (troca/compra). FK lookup_origens_veiculo.';
comment on column public.carros.valor_entrada is 'Valor do veiculo na entrada (custo de aquisicao).';

-- 2) Tabela de remetentes (entidade, nao mais lookup por code).
create table if not exists public.remetentes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) > 0),
  endereco text,
  cpf_cnpj text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.remetentes enable row level security;
comment on table public.remetentes is 'Remetentes da documentacao (nome, endereco, CPF/CNPJ).';

create or replace function public.fn_remetentes_set_updated_at()
returns trigger language plpgsql security invoker set search_path to '' as $$
begin new.updated_at := now(); return new; end; $$;
revoke execute on function public.fn_remetentes_set_updated_at() from public, anon, authenticated;
drop trigger if exists trg_remetentes_set_updated_at on public.remetentes;
create trigger trg_remetentes_set_updated_at before update on public.remetentes
  for each row execute function public.fn_remetentes_set_updated_at();

-- 3) documentos: remove origem_veiculo e remetente(code); adiciona remetente_id;
--    renomeia responsavel -> responsavel_virado.
alter table public.documentos drop column if exists origem_veiculo;
alter table public.documentos drop column if exists remetente;
alter table public.documentos
  add column if not exists remetente_id uuid references public.remetentes(id) on update cascade on delete set null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'documentos' and column_name = 'responsavel'
  ) then
    alter table public.documentos rename column responsavel to responsavel_virado;
  end if;
end $$;

comment on column public.documentos.remetente_id is 'Remetente da documentacao. FK remetentes(id).';
comment on column public.documentos.responsavel_virado is 'Nome para o qual os documentos foram virados (texto livre).';

-- Trigger uppercase agora atua em responsavel_virado.
create or replace function public.fn_documentos_uppercase()
returns trigger language plpgsql security invoker set search_path to '' as $$
begin
  if new.responsavel_virado is not null then
    new.responsavel_virado := upper(btrim(new.responsavel_virado));
  end if;
  return new;
end; $$;
revoke execute on function public.fn_documentos_uppercase() from public, anon, authenticated;
drop trigger if exists trg_documentos_uppercase on public.documentos;
create trigger trg_documentos_uppercase before insert or update on public.documentos
  for each row execute function public.fn_documentos_uppercase();

-- 4) Parser de token: remove origem_veiculo e remetente (remetente agora e manual por id).
create or replace function public.fn_documentos_parse_token(
  p_filename text,
  p_carro_placa text
) returns jsonb
language plpgsql stable security invoker set search_path to ''
as $function$
declare
  v_norm text;
  v_placa text;
  v_result jsonb := '{}'::jsonb;
  v_match text;
begin
  if p_filename is null or p_carro_placa is null then return '{}'::jsonb; end if;
  v_norm := lower(p_filename);
  v_placa := lower(btrim(p_carro_placa));
  if v_placa = '' then return '{}'::jsonb; end if;

  select code into v_match from public.lookup_tipos_processo
   where is_active and v_norm like '%tipo_de_processo_' || lower(code) || '_' || v_placa || '%'
   order by sort_order desc, code desc limit 1;
  if v_match is not null then v_result := v_result || jsonb_build_object('tipo_de_processo', v_match); v_match := null; end if;

  select code into v_match from public.lookup_propositos
   where is_active and v_norm like '%proposito_' || lower(code) || '_' || v_placa || '%'
   order by sort_order desc, code desc limit 1;
  if v_match is not null then v_result := v_result || jsonb_build_object('proposito', v_match); v_match := null; end if;

  select code into v_match from public.lookup_estados_chave_reserva
   where is_active and v_norm like '%chave_reserva_' || lower(code) || '_' || v_placa || '%'
   order by sort_order desc, code desc limit 1;
  if v_match is not null then v_result := v_result || jsonb_build_object('chave_reserva', v_match); v_match := null; end if;

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

-- 5) Reparse nao-destrutivo, sem origem_veiculo e sem remetente.
create or replace function public.fn_documentos_reparse_carro(p_carro_id uuid)
returns void language plpgsql security definer set search_path to ''
as $function$
declare
  v_placa text;
  v_root_folder uuid;
  v_acc jsonb := '{}'::jsonb;
  v_file record;
begin
  select c.placa::text into v_placa from public.carros c where c.id = p_carro_id;
  if v_placa is null then return; end if;

  select folder_id into v_root_folder
    from public.arquivo_automacao_folders
   where automation_key = 'vehicle_documents' and carro_id = p_carro_id and archived_at is null
   limit 1;
  if v_root_folder is null then return; end if;

  for v_file in
    with recursive subtree(folder_id) as (
      select v_root_folder
      union all
      select f.id from public.arquivos_pastas f join subtree s on f.parent_folder_id = s.folder_id
    )
    select a.nome_arquivo, a.created_at
      from public.arquivos_arquivos a join subtree s on s.folder_id = a.pasta_id
     order by a.created_at asc, a.id asc
  loop
    v_acc := v_acc || public.fn_documentos_parse_token(v_file.nome_arquivo, v_placa);
  end loop;

  if v_acc = '{}'::jsonb then return; end if;

  insert into public.documentos as d (
    carro_id, tipo_de_processo, proposito, chave_reserva, pericia, envelope, estado_transferencia
  ) values (
    p_carro_id,
    v_acc->>'tipo_de_processo',
    v_acc->>'proposito',
    v_acc->>'chave_reserva',
    v_acc->>'pericia',
    v_acc->>'envelope',
    v_acc->>'estado_transferencia'
  )
  on conflict (carro_id) do update set
    tipo_de_processo = coalesce(excluded.tipo_de_processo, d.tipo_de_processo),
    proposito = coalesce(excluded.proposito, d.proposito),
    chave_reserva = coalesce(excluded.chave_reserva, d.chave_reserva),
    pericia = coalesce(excluded.pericia, d.pericia),
    envelope = coalesce(excluded.envelope, d.envelope),
    estado_transferencia = coalesce(excluded.estado_transferencia, d.estado_transferencia),
    updated_at = now();
end;
$function$;
revoke execute on function public.fn_documentos_reparse_carro(uuid) from public, anon, authenticated;

-- 6) lookup_remetentes nao e mais usado.
drop table if exists public.lookup_remetentes;
