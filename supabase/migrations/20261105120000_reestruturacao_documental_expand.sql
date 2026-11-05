-- Reestruturacao documental — ETAPA 1 (expand). So ADICIONA e MIGRA dados:
-- nenhuma coluna sai aqui. As colunas antigas de documentos (nota_entrada,
-- nota_saida, recibo_compra, tipo_de_processo, proposito, chave_reserva, pericia)
-- saem na etapa de contract, em migration separada, depois do deploy do codigo.
--
-- Processo de uma loja de usados = 4 eixos:
--   nota de entrada (compra) · CRLV BRANCO (ainda no nome do antigo dono)
--   CRLV VIRADO (transferido) · nota de saida (venda)
-- + pericia (laudo com arquivo, autorizada, data, hodometro, status, observacao).

-- ---------------------------------------------------------------------------
-- 1) CRV no veiculo (o CRLV virado traz um CRV novo: o OCR atualiza).
-- ---------------------------------------------------------------------------
alter table public.carros
  add column if not exists crv text,
  add column if not exists crv_codigo_seguranca text;

alter table public.carros
  add constraint carros_crv_digits_check
    check (crv is null or crv ~ '^[0-9]{6,20}$'),
  add constraint carros_crv_codigo_seguranca_digits_check
    check (crv_codigo_seguranca is null or crv_codigo_seguranca ~ '^[0-9]{6,20}$');

comment on column public.carros.crv is
  'Numero do CRV atual (muda quando o veiculo e virado/transferido).';
comment on column public.carros.crv_codigo_seguranca is
  'Codigo de seguranca do CRV (usado para emitir a ATPV-e).';

-- ---------------------------------------------------------------------------
-- 2) Notas fiscais. So os dados da nota: comprador fica em vendas e fornecedor
--    em documentos.remetente_id. 1 arquivo = 1 nota (arquivo_id unico).
-- ---------------------------------------------------------------------------
create table if not exists public.notas_fiscais (
  id uuid primary key default gen_random_uuid(),
  carro_id uuid not null references public.carros(id) on update cascade on delete cascade,
  tipo text not null,
  numero text,
  serie text,
  chave_acesso text unique,
  data_emissao date,
  valor numeric,
  arquivo_id uuid unique references public.arquivos_arquivos(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notas_fiscais_tipo_check check (tipo in ('ENTRADA', 'SAIDA')),
  constraint notas_fiscais_chave_acesso_check check (chave_acesso is null or chave_acesso ~ '^[0-9]{44}$'),
  constraint notas_fiscais_valor_check check (valor is null or valor >= 0)
);

create index if not exists notas_fiscais_carro_tipo_idx on public.notas_fiscais (carro_id, tipo);

alter table public.notas_fiscais enable row level security;

comment on table public.notas_fiscais is
  'Notas fiscais do veiculo: ENTRADA (compra) e SAIDA (venda). Criada ao classificar o arquivo; dados por OCR ou manual.';

-- ---------------------------------------------------------------------------
-- 3) Pericias (laudo). Varias por veiculo (refeita apos DESAPROVADO).
-- ---------------------------------------------------------------------------
create table if not exists public.pericias (
  id uuid primary key default gen_random_uuid(),
  carro_id uuid not null references public.carros(id) on update cascade on delete cascade,
  autorizada text,
  data_pericia date,
  hodometro integer,
  status text,
  observacao text,
  arquivo_id uuid unique references public.arquivos_arquivos(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pericias_status_check check (status is null or status in ('APROVADO', 'DESAPROVADO', 'APROVADO_COM_APONTAMENTO')),
  constraint pericias_hodometro_check check (hodometro is null or hodometro >= 0)
);

create index if not exists pericias_carro_idx on public.pericias (carro_id);

alter table public.pericias enable row level security;

comment on table public.pericias is
  'Pericias do veiculo: autorizada que fez, data, hodometro, status e observacao. Criada ao classificar o arquivo.';

create trigger trg_notas_fiscais_timestamps before insert or update on public.notas_fiscais
  for each row execute function public.fn_set_timestamps();
create trigger trg_pericias_timestamps before insert or update on public.pericias
  for each row execute function public.fn_set_timestamps();
create trigger trg_backup_row_webhook after insert or delete or update on public.notas_fiscais
  for each row execute function public.backup_row_webhook();
create trigger trg_backup_row_webhook after insert or delete or update on public.pericias
  for each row execute function public.backup_row_webhook();

-- ---------------------------------------------------------------------------
-- 4) Situacao do CRLV = documentos.estado_transferencia com 3 estados.
--    Envelope perde os estados nunca usados.
-- ---------------------------------------------------------------------------
update public.lookups
   set name = case code
                when 'AGUARDANDO' then 'Aguardando (não chegou)'
                when 'BRANCO' then 'Branco (nome do antigo dono)'
                else 'Virado'
              end,
       sort_order = case code when 'AGUARDANDO' then 1 when 'BRANCO' then 2 else 3 end,
       is_active = true,
       updated_at = now()
 where domain = 'estados_transferencia' and code in ('AGUARDANDO', 'BRANCO', 'VIRADO');

update public.lookups set is_active = false, updated_at = now()
 where (domain = 'estados_transferencia' and code in ('EM_ANDAMENTO', 'CONCLUIDA', 'PROBLEMA'))
    or (domain = 'estados_envelope' and code in ('PRESENTE', 'PROBLEMA'));

-- ---------------------------------------------------------------------------
-- 5) Dados: responsavel_virado guardava nomes E estados. Nome = titular em nome
--    de quem o carro foi virado (=> VIRADO). Estados vao para a situacao.
-- ---------------------------------------------------------------------------
update public.documentos d
   set estado_transferencia = case
         when upper(btrim(coalesce(d.responsavel_virado, ''))) in ('NÃO CHEGOU', 'NAO CHEGOU') then 'AGUARDANDO'
         when upper(btrim(coalesce(d.responsavel_virado, ''))) in ('PROCURAÇÃO', 'PROCURACAO', 'BRANCO') then 'BRANCO'
         when nullif(btrim(coalesce(d.responsavel_virado, '')), '') is not null then 'VIRADO'
         when d.estado_transferencia in ('AGUARDANDO', 'BRANCO', 'VIRADO') then d.estado_transferencia
         when d.estado_transferencia = 'CONCLUIDA' then 'VIRADO'
         when d.estado_transferencia = 'EM_ANDAMENTO' then 'BRANCO'
         else 'AGUARDANDO'
       end,
       responsavel_virado = case
         when upper(btrim(coalesce(d.responsavel_virado, ''))) in ('NÃO CHEGOU', 'NAO CHEGOU', 'PROCURAÇÃO', 'PROCURACAO', 'BRANCO', '') then null
         else d.responsavel_virado
       end;

alter table public.documentos alter column responsavel_virado drop default;
alter table public.documentos alter column estado_transferencia set default 'AGUARDANDO';

comment on column public.documentos.estado_transferencia is
  'Situacao do CRLV: AGUARDANDO (nao chegou) | BRANCO (nome do antigo dono) | VIRADO (transferido).';
comment on column public.documentos.responsavel_virado is
  'Titular em nome de quem o CRLV foi virado (so quando VIRADO).';

-- Trigger: mantem "titular so quando VIRADO" e aceita o formato antigo
-- (estado digitado no campo do responsavel) enquanto o app antigo roda.
drop trigger if exists trg_documentos_default_responsavel_virado on public.documentos;
drop function if exists public.documentos_default_responsavel_virado();

create or replace function public.fn_documentos_normaliza_crlv()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_resp text := upper(btrim(coalesce(new.responsavel_virado, '')));
  v_estado_mudou boolean;
  v_resp_mudou boolean;
begin
  if tg_op = 'INSERT' then
    -- No INSERT o default da coluna (AGUARDANDO) nao conta como escolha.
    v_estado_mudou := coalesce(new.estado_transferencia, 'AGUARDANDO') <> 'AGUARDANDO';
    v_resp_mudou := true;
  else
    v_estado_mudou := new.estado_transferencia is distinct from old.estado_transferencia;
    v_resp_mudou := new.responsavel_virado is distinct from old.responsavel_virado;
  end if;

  if v_resp in ('NÃO CHEGOU', 'NAO CHEGOU') then
    new.estado_transferencia := 'AGUARDANDO';
    new.responsavel_virado := null;
  elsif v_resp in ('PROCURAÇÃO', 'PROCURACAO', 'BRANCO') then
    new.estado_transferencia := 'BRANCO';
    new.responsavel_virado := null;
  elsif v_resp = '' then
    new.responsavel_virado := null;
  elsif v_resp_mudou and not v_estado_mudou then
    -- Titular informado (sem escolher a situacao) = CRLV virado no nome dele.
    new.estado_transferencia := 'VIRADO';
  end if;

  if new.estado_transferencia is null then
    new.estado_transferencia := 'AGUARDANDO';
  end if;
  -- Titular so existe com o CRLV virado.
  if new.estado_transferencia <> 'VIRADO' then
    new.responsavel_virado := null;
  end if;
  return new;
end;
$function$;

create trigger trg_documentos_normaliza_crlv before insert or update on public.documentos
  for each row execute function public.fn_documentos_normaliza_crlv();

-- ---------------------------------------------------------------------------
-- 6) Parser de nomes de arquivo (tokens novos; antigos aceitos na transicao).
--    crlv_virado_<placa> -> VIRADO   crlv_branco_<placa> -> BRANCO (nunca rebaixa VIRADO)
--    nota_entrada_<placa> / nota_saida_<placa> -> cria a nota ligada ao arquivo
--    pericia_<placa> -> cria a pericia ligada ao arquivo
-- ---------------------------------------------------------------------------
create or replace function public.fn_documentos_parse_token(p_filename text, p_carro_placa text)
returns jsonb
language plpgsql
stable
set search_path to ''
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

  if strpos(v_norm, 'crlv_virado_' || v_placa) > 0 or strpos(v_norm, 'estado_transferencia_virado_' || v_placa) > 0 then
    v_result := v_result || '{"crlv": "VIRADO"}'::jsonb;
  elsif strpos(v_norm, 'crlv_branco_' || v_placa) > 0 or strpos(v_norm, 'crlv_' || v_placa) > 0 then
    v_result := v_result || '{"crlv": "BRANCO"}'::jsonb;
  end if;

  if strpos(v_norm, 'nota_entrada_' || v_placa) > 0 then
    v_result := v_result || '{"nota": "ENTRADA"}'::jsonb;
  elsif strpos(v_norm, 'nota_saida_' || v_placa) > 0 then
    v_result := v_result || '{"nota": "SAIDA"}'::jsonb;
  end if;

  if strpos(v_norm, 'pericia_' || v_placa) > 0 then
    v_result := v_result || '{"pericia": true}'::jsonb;
  end if;

  select code into v_match from public.lookups
   where domain = 'estados_envelope' and is_active
     and strpos(v_norm, 'envelope_' || lower(code) || '_' || v_placa) > 0
   order by sort_order desc, code desc
   limit 1;
  if v_match is not null then v_result := v_result || jsonb_build_object('envelope', v_match); end if;

  return v_result;
end;
$function$;

create or replace function public.fn_documentos_reparse_carro(p_carro_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_placa text;
  v_root_folder uuid;
  v_paused boolean;
  v_file record;
  v_tokens jsonb;
  v_crlv text;
  v_envelope text;
begin
  select c.placa::text into v_placa from public.carros c where c.id = p_carro_id;
  if v_placa is null then return; end if;

  select folder_id, automation_paused into v_root_folder, v_paused
    from public.arquivo_automacao_folders
   where automation_key = 'vehicle_documents' and carro_id = p_carro_id and archived_at is null
   limit 1;
  if v_root_folder is null then return; end if;

  -- Automacao pausada para esta pasta: nao toca em nada (edicao manual fica).
  if coalesce(v_paused, false) then return; end if;

  for v_file in
    with recursive subtree(folder_id) as (
      select v_root_folder
      union all
      select f.id from public.arquivos_pastas f join subtree s on f.parent_folder_id = s.folder_id
    )
    select a.id, a.nome_arquivo
      from public.arquivos_arquivos a join subtree s on s.folder_id = a.pasta_id
     order by a.created_at asc, a.id asc
  loop
    v_tokens := public.fn_documentos_parse_token(v_file.nome_arquivo, v_placa);

    if v_tokens->>'crlv' = 'VIRADO' then
      v_crlv := 'VIRADO';
    elsif v_tokens->>'crlv' = 'BRANCO' and v_crlv is null then
      v_crlv := 'BRANCO';
    end if;
    if v_tokens ? 'envelope' then v_envelope := v_tokens->>'envelope'; end if;

    if v_tokens ? 'nota' then
      insert into public.notas_fiscais (carro_id, tipo, arquivo_id)
      values (p_carro_id, v_tokens->>'nota', v_file.id)
      on conflict (arquivo_id) do nothing;
    end if;
    if v_tokens ? 'pericia' then
      insert into public.pericias (carro_id, arquivo_id)
      values (p_carro_id, v_file.id)
      on conflict (arquivo_id) do nothing;
    end if;
  end loop;

  if v_crlv is null and v_envelope is null then return; end if;

  insert into public.documentos as d (carro_id, estado_transferencia, envelope)
  values (p_carro_id, coalesce(v_crlv, 'AGUARDANDO'), v_envelope)
  on conflict (carro_id) do update set
    estado_transferencia = case
      when v_crlv = 'VIRADO' then 'VIRADO'
      when v_crlv = 'BRANCO' and d.estado_transferencia is distinct from 'VIRADO' then 'BRANCO'
      else d.estado_transferencia
    end,
    envelope = coalesce(v_envelope, d.envelope),
    updated_at = now()
  where (v_crlv = 'VIRADO' and d.estado_transferencia is distinct from 'VIRADO')
     or (v_crlv = 'BRANCO' and d.estado_transferencia is distinct from 'VIRADO' and d.estado_transferencia is distinct from 'BRANCO')
     or (v_envelope is not null and d.envelope is distinct from v_envelope);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 7) Arquivos ja classificados: tokens novos e nomes curtos (= token + extensao).
--    "CRLV (VIRADO)" -> crlv_virado_<placa>   "CRLV (COMPRA)" -> crlv_branco_<placa>
-- ---------------------------------------------------------------------------
with recursive tree(folder_id, carro_id) as (
  select af.folder_id, af.carro_id
    from public.arquivo_automacao_folders af
   where af.automation_key = 'vehicle_documents' and af.archived_at is null and af.carro_id is not null
  union all
  select p.id, t.carro_id from public.arquivos_pastas p join tree t on p.parent_folder_id = t.folder_id
),
alvo as (
  select a.id,
         case when lower(a.nome_arquivo) like 'estado\_transferencia\_virado\_%' then 'crlv_virado_' else 'crlv_branco_' end
           || lower(c.placa::text) as token,
         coalesce('.' || lower(substring(a.nome_arquivo from '\.([A-Za-z0-9]{1,8})$')), '') as ext,
         row_number() over (
           partition by a.pasta_id, lower(a.nome_arquivo) like 'estado\_transferencia\_virado\_%'
           order by a.created_at, a.id
         ) as n
    from public.arquivos_arquivos a
    join tree t on t.folder_id = a.pasta_id
    join public.carros c on c.id = t.carro_id
   where lower(a.nome_arquivo) like 'estado\_transferencia\_virado\_' || lower(c.placa::text) || '%'
      or lower(a.nome_arquivo) like 'crlv\_' || lower(c.placa::text) || '%'
)
update public.arquivos_arquivos a
   set nome_arquivo = alvo.token || case when alvo.n > 1 then '-' || alvo.n else '' end || alvo.ext
  from alvo
 where alvo.id = a.id;

-- Templates de OCR acompanham os tipos novos.
update public.ocr_templates set tipo_documento = 'crlv_virado', updated_at = now() where tipo_documento = 'estado_transferencia';
update public.ocr_templates set tipo_documento = 'crlv_branco', updated_at = now() where tipo_documento = 'crlv';
