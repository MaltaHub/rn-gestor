-- documentos: renomeia valor_entrada -> valor_compra e adiciona recibo_compra
-- (estado manual + slot na pasta de documentos, com opcao 'Branco').

-- 1) Rename do valor de entrada -> valor de compra.
alter table public.documentos rename column valor_entrada to valor_compra;
comment on column public.documentos.valor_compra is 'Valor de compra do veiculo (entrada).';

-- 2) Lookup de estados do recibo de compra (inclui BRANCO).
create table if not exists public.lookup_estados_recibo_compra (
  code text primary key check (length(btrim(code)) > 0),
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.lookup_estados_recibo_compra enable row level security;
insert into public.lookup_estados_recibo_compra (code, name, sort_order) values
  ('BRANCO', 'Em branco', 0),
  ('PRESENTE', 'Presente', 10),
  ('AUSENTE', 'Ausente', 20),
  ('PROBLEMA', 'Problema', 30)
on conflict (code) do nothing;

-- 3) Campo recibo_compra (manual no form + alimentado pelo slot/parser).
alter table public.documentos
  add column if not exists recibo_compra text references public.lookup_estados_recibo_compra(code) on update cascade on delete set null;
comment on column public.documentos.recibo_compra is 'Estado do recibo de compra. FK lookup_estados_recibo_compra.';

-- 4) Parser: reconhece tambem recibo_compra.
create or replace function public.fn_documentos_parse_token(p_filename text, p_carro_placa text)
returns jsonb language plpgsql stable security invoker set search_path to ''
as $function$
declare
  v_norm text; v_placa text; v_result jsonb := '{}'::jsonb; v_match text;
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

  select code into v_match from public.lookup_estados_recibo_compra
   where is_active and v_norm like '%recibo_compra_' || lower(code) || '_' || v_placa || '%'
   order by sort_order desc, code desc limit 1;
  if v_match is not null then v_result := v_result || jsonb_build_object('recibo_compra', v_match); v_match := null; end if;

  return v_result;
end;
$function$;
revoke execute on function public.fn_documentos_parse_token(text, text) from public, anon, authenticated;

-- 5) Reparse: inclui recibo_compra no upsert nao-destrutivo.
create or replace function public.fn_documentos_reparse_carro(p_carro_id uuid)
returns void language plpgsql security definer set search_path to ''
as $function$
declare
  v_placa text; v_root_folder uuid; v_acc jsonb := '{}'::jsonb; v_file record;
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
    carro_id, tipo_de_processo, proposito, chave_reserva, pericia, envelope, estado_transferencia, recibo_compra
  ) values (
    p_carro_id, v_acc->>'tipo_de_processo', v_acc->>'proposito', v_acc->>'chave_reserva',
    v_acc->>'pericia', v_acc->>'envelope', v_acc->>'estado_transferencia', v_acc->>'recibo_compra'
  )
  on conflict (carro_id) do update set
    tipo_de_processo = coalesce(excluded.tipo_de_processo, d.tipo_de_processo),
    proposito = coalesce(excluded.proposito, d.proposito),
    chave_reserva = coalesce(excluded.chave_reserva, d.chave_reserva),
    pericia = coalesce(excluded.pericia, d.pericia),
    envelope = coalesce(excluded.envelope, d.envelope),
    estado_transferencia = coalesce(excluded.estado_transferencia, d.estado_transferencia),
    recibo_compra = coalesce(excluded.recibo_compra, d.recibo_compra),
    updated_at = now();
end;
$function$;
revoke execute on function public.fn_documentos_reparse_carro(uuid) from public, anon, authenticated;
