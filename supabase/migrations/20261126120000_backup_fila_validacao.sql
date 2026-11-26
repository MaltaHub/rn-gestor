-- Backup de contencao 2.0: FILA com confirmacao + VALIDACAO em rotina.
--
-- Antes: 1 POST por linha, fire-and-forget. Sem confirmacao, sem reenvio, sem ordem (duas
-- alteracoes seguidas podiam chegar invertidas) e DML em massa estourava a cota do Apps Script.
--
-- Agora:
--  * a trigger so marca a CHAVE como suja em internal.backup_fila (N alteracoes = 1 item);
--  * o despacho (pg_cron, 1/min) le a linha ATUAL e manda em lote (existe -> upsert, sumiu ->
--    delete), um lote por vez; so sai da fila com o "ok" do Apps Script, senao reenvia;
--  * a validacao manda (chave, assinatura md5) de cada linha; o Apps Script compara com o que
--    esta NAS CELULAS e devolve faltando/diferentes/sobrando, que voltam para a fila.
--
-- Uso (SQL Editor):
--   select internal.backup_validar();              -- agenda a validacao de todas as tabelas
--   select internal.backup_validar('carros');      -- so uma
--   select * from internal.backup_status();        -- situacao por tabela
--
-- Tudo em `internal` (fora da API). dispatch_backup_payload fica orfa de proposito
-- (expand/contract: sai em migration propria depois que isto estiver validado em producao).

-- ------------------------------------------------------------------ tabelas
create table if not exists internal.backup_fila (
  tabela text not null,
  chave text not null,
  pk jsonb not null,
  enfileirado_em timestamptz not null default now(),
  proximo_envio_em timestamptz not null default now(),
  tentativas integer not null default 0,
  request_id bigint,
  enviado_em timestamptz,
  ultimo_erro text,
  primary key (tabela, chave)
);

create index if not exists ix_backup_fila_pendente
  on internal.backup_fila (proximo_envio_em, enfileirado_em) where request_id is null;
create index if not exists ix_backup_fila_request
  on internal.backup_fila (request_id) where request_id is not null;

create table if not exists internal.backup_validacoes (
  id bigint generated always as identity primary key,
  tabela text not null,
  status text not null default 'agendada'
    check (status in ('agendada', 'enviada', 'ok', 'divergente', 'bloqueada', 'erro')),
  permitir_exclusoes boolean not null default false,
  agendada_em timestamptz not null default now(),
  request_id bigint,
  enviado_em timestamptz,
  concluido_em timestamptz,
  linhas_banco integer,
  linhas_planilha integer,
  faltando integer,
  diferentes integer,
  sobrando integer,
  reenfileirados integer,
  detalhe text
);

create index if not exists ix_backup_validacoes_tabela
  on internal.backup_validacoes (tabela, id desc);

alter table internal.backup_fila enable row level security;
alter table internal.backup_validacoes enable row level security;

-- ------------------------------------------------------------------ helpers
create or replace function internal.backup_pk_colunas(p_tabela text)
returns text[]
language sql
stable
set search_path = ''
as $$
  select array_agg(a.attname::text order by k.ordem)
  from pg_catalog.pg_index i
  cross join lateral unnest(i.indkey::int2[]) with ordinality as k(attnum, ordem)
  join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
  where i.indrelid = pg_catalog.to_regclass(pg_catalog.format('public.%I', p_tabela))
    and i.indisprimary
$$;

create or replace function internal.backup_chave(p_colunas text[], p_linha jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select string_agg(coalesce(p_linha ->> c.coluna, ''), '|' order by c.ordem)
  from unnest(p_colunas) with ordinality as c(coluna, ordem)
$$;

-- Tabelas espelhadas = as que tem a trigger do backup.
create or replace function internal.backup_tabelas()
returns setof text
language sql
stable
set search_path = ''
as $$
  select c.relname::text
  from pg_catalog.pg_trigger g
  join pg_catalog.pg_class c on c.oid = g.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where g.tgname = 'trg_backup_row_webhook' and not g.tgisinternal and n.nspname = 'public'
  order by 1
$$;

-- Formato que a planilha consegue guardar sem perda: jsonb/array viram o proprio texto, e
-- numero com mais de 15 digitos vira texto (o Sheets guarda numero como double).
create or replace function internal.backup_normalizar(p_linha jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when p_linha is null then null else coalesce((
    select jsonb_object_agg(e.key, case
      when jsonb_typeof(e.value) in ('object', 'array') then to_jsonb(e.value::text)
      when jsonb_typeof(e.value) = 'number'
        and length(regexp_replace(trim_scale((e.value #>> '{}')::numeric)::text, '[^0-9]', '', 'g')) > 15
        then to_jsonb(trim_scale((e.value #>> '{}')::numeric)::text)
      else e.value
    end)
    from jsonb_each(p_linha) e
  ), '{}'::jsonb) end
$$;

-- CONTRATO com backupSignature_() do Apps Script: colunas em ordem binaria,
-- "coluna<US>valor" unidas por <RS>; null = vazio; numero sem zeros a direita; CRLF = LF.
create or replace function internal.backup_assinatura(p_linha jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(coalesce(string_agg(
    e.key || chr(31) || replace(case jsonb_typeof(e.value)
      when 'null' then ''
      when 'number' then trim_scale((e.value #>> '{}')::numeric)::text
      else e.value #>> '{}'
    end, chr(13) || chr(10), chr(10)),
    chr(30) order by e.key collate "C"), ''))
  from jsonb_each(p_linha) e
$$;

-- Linha atual pela PK (usa o indice). null = nao existe mais (inclusive chave invalida
-- vinda de lixo digitado na planilha).
create or replace function internal.backup_linha(p_tabela text, p_pk jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
set timezone = 'UTC'
set datestyle = 'ISO, YMD'
set extra_float_digits = 1
as $$
declare
  v_onde text;
  v_linha jsonb;
begin
  select string_agg(format('t.%1$I = k.%1$I', c), ' and ')
    into v_onde
    from unnest(internal.backup_pk_colunas(p_tabela)) as c;
  if v_onde is null then
    raise exception 'backup: tabela sem PK ou inexistente: %', p_tabela;
  end if;
  begin
    execute format(
      'select to_jsonb(t) from public.%1$I t, jsonb_populate_record(null::public.%1$I, $1) k where %2$s',
      p_tabela, v_onde
    ) into v_linha using p_pk;
  exception when data_exception then
    return null;
  end;
  return internal.backup_normalizar(v_linha);
end;
$$;

create or replace function internal.backup_enfileirar(p_tabela text, p_chave text, p_pk jsonb)
returns void
language sql
set search_path = ''
as $$
  -- Chave suja de novo: solta do lote em voo, para a confirmacao antiga nao apaga-la.
  insert into internal.backup_fila as f (tabela, chave, pk)
  values (p_tabela, p_chave, p_pk)
  on conflict (tabela, chave) do update
    set pk = excluded.pk,
        request_id = null,
        enviado_em = null,
        tentativas = 0,
        proximo_envio_em = now(),
        ultimo_erro = null
$$;

-- ------------------------------------------------------------------ captura
-- Mesmo nome de antes: as triggers trg_backup_row_webhook ja existentes passam a enfileirar.
create or replace function public.backup_row_webhook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_colunas text[];
  v_antes jsonb;
  v_depois jsonb;
begin
  begin
    if tg_op <> 'INSERT' then v_antes := to_jsonb(old); end if;
    if tg_op <> 'DELETE' then v_depois := to_jsonb(new); end if;
    if tg_op = 'UPDATE' and v_antes = v_depois then
      return null;
    end if;

    v_colunas := internal.backup_pk_colunas(tg_table_name);

    if v_depois is not null then
      perform internal.backup_enfileirar(
        tg_table_name,
        internal.backup_chave(v_colunas, v_depois),
        (select jsonb_object_agg(c, v_depois -> c) from unnest(v_colunas) as c));
    end if;
    -- DELETE, ou UPDATE que trocou a PK: a chave antiga precisa sair do espelho.
    if v_antes is not null and (v_depois is null
        or internal.backup_chave(v_colunas, v_antes) <> internal.backup_chave(v_colunas, v_depois)) then
      perform internal.backup_enfileirar(
        tg_table_name,
        internal.backup_chave(v_colunas, v_antes),
        (select jsonb_object_agg(c, v_antes -> c) from unnest(v_colunas) as c));
    end if;
  exception when others then
    -- O backup nunca derruba a gravacao; a validacao diaria recupera o que escapar.
    raise warning 'backup falhou em %: %', tg_table_name, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.backup_row_webhook() from public, anon, authenticated;

-- Configuracoes criadas depois da primeira versao e que nunca entraram no espelho.
do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array['arquivo_automacao_regras', 'ocr_templates'] loop
    execute format('drop trigger if exists trg_backup_row_webhook on public.%I', v_tabela);
    execute format(
      'create trigger trg_backup_row_webhook after insert or update or delete on public.%I '
      || 'for each row execute function public.backup_row_webhook()', v_tabela);
  end loop;
end;
$$;

-- ------------------------------------------------------------------ envio
create or replace function internal.backup_json(p_texto text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_texto::jsonb;
exception when others then
  return null; -- pagina de erro HTML do Google, resposta truncada...
end;
$$;

create or replace function internal.backup_postar(p_corpo jsonb)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
begin
  select nullif(trim(s.value), '') into v_url
    from internal.app_settings s where s.key = 'url_appscript_supply';
  select nullif(trim(s.value), '') into v_token
    from internal.app_settings s where s.key = 'token_appscript_supply';
  if v_url is null or v_token is null then
    return null;
  end if;
  return net.http_post(
    url := v_url,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := p_corpo || jsonb_build_object('token', v_token, 'source', 'supabase-fila', 'protocol', 2),
    timeout_milliseconds := 90000
  );
end;
$$;

create or replace function internal.backup_falhar_item(p_tabela text, p_chave text, p_erro text)
returns void
language sql
set search_path = ''
as $$
  update internal.backup_fila f
     set request_id = null,
         enviado_em = null,
         tentativas = f.tentativas + 1,
         proximo_envio_em = now() + make_interval(mins => power(2, least(f.tentativas, 6))::integer),
         ultimo_erro = left(p_erro, 500)
   where f.tabela = p_tabela and f.chave = p_chave
$$;

create or replace function internal.backup_confirmar_envios()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_resposta record;
  v_json jsonb;
begin
  for v_resposta in
    select r.id, r.status_code, r.content, r.error_msg
    from net._http_response r
    where r.id in (select f.request_id from internal.backup_fila f where f.request_id is not null)
  loop
    v_json := internal.backup_json(v_resposta.content);
    if v_resposta.status_code = 200 and v_json ->> 'ok' = 'true' then
      perform internal.backup_falhar_item(f.tabela, f.chave, x.item ->> 'error')
        from jsonb_array_elements(coalesce(v_json -> 'results', '[]'::jsonb)) as x(item)
        join internal.backup_fila f
          on f.tabela = x.item ->> 'table' and f.chave = x.item ->> 'key' and f.request_id = v_resposta.id
       where x.item ->> 'ok' = 'false';
      delete from internal.backup_fila f where f.request_id = v_resposta.id;
    else
      perform internal.backup_falhar_item(f.tabela, f.chave, coalesce(
          v_json ->> 'error', v_resposta.error_msg, 'HTTP ' || v_resposta.status_code, 'sem resposta'))
        from internal.backup_fila f where f.request_id = v_resposta.id;
    end if;
  end loop;

  perform internal.backup_falhar_item(f.tabela, f.chave, 'sem resposta do Apps Script em 3 min')
    from internal.backup_fila f
   where f.request_id is not null and f.enviado_em < now() - interval '3 minutes';
end;
$$;

create or replace function internal.backup_enviar_lote(p_max_operacoes integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_item record;
  v_linha jsonb;
  v_operacao jsonb;
  v_operacoes jsonb[] := '{}';
  v_tabelas text[] := '{}';
  v_chaves text[] := '{}';
  v_bytes bigint := 0;
  v_request bigint;
begin
  -- Um lote por vez: preserva a ordem e nao disputa o lock do Apps Script.
  if exists (select 1 from internal.backup_fila f where f.request_id is not null) then
    return 0;
  end if;

  for v_item in
    select f.tabela, f.chave, f.pk, f.tentativas
    from internal.backup_fila f
    where f.request_id is null and f.proximo_envio_em <= now()
    order by (f.tentativas >= 3), f.enfileirado_em, f.tabela, f.chave
    limit greatest(p_max_operacoes, 1)
    for update skip locked
  loop
    -- Item que ja falhou 3x vai sozinho, para nao segurar os saudaveis.
    exit when cardinality(v_operacoes) > 0 and (v_item.tentativas >= 3 or v_bytes > 1000000);
    begin
      v_linha := internal.backup_linha(v_item.tabela, v_item.pk);
    exception when others then
      perform internal.backup_falhar_item(v_item.tabela, v_item.chave, sqlerrm);
      continue;
    end;
    v_operacao := jsonb_build_object(
      'table', v_item.tabela,
      'key', v_item.chave,
      'op', case when v_linha is null then 'delete' else 'upsert' end,
      'row', coalesce(v_linha, v_item.pk));
    v_operacoes := v_operacoes || v_operacao;
    v_tabelas := v_tabelas || v_item.tabela;
    v_chaves := v_chaves || v_item.chave;
    v_bytes := v_bytes + octet_length(v_operacao::text);
    exit when v_item.tentativas >= 3;
  end loop;

  if cardinality(v_operacoes) = 0 then
    return 0;
  end if;

  v_request := internal.backup_postar(jsonb_build_object('ops', to_jsonb(v_operacoes)));
  if v_request is null then
    return 0;
  end if;

  update internal.backup_fila f
     set request_id = v_request, enviado_em = now()
    from unnest(v_tabelas, v_chaves) as l(tabela, chave)
   where f.tabela = l.tabela and f.chave = l.chave;

  return cardinality(v_operacoes);
end;
$$;

-- ------------------------------------------------------------------ validacao
create or replace function internal.backup_validar(
  p_tabela text default null,
  p_permitir_exclusoes boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
begin
  if p_permitir_exclusoes and p_tabela is null then
    raise exception 'Liberar exclusoes exige informar a tabela.';
  end if;
  if p_tabela is not null and p_tabela not in (select internal.backup_tabelas()) then
    raise exception 'Tabela fora do backup: %', p_tabela;
  end if;

  delete from internal.backup_validacoes v
   where v.status = 'agendada' and (p_tabela is null or v.tabela = p_tabela);

  insert into internal.backup_validacoes (tabela, permitir_exclusoes)
  select t, p_permitir_exclusoes
  from internal.backup_tabelas() as t
  where p_tabela is null or t = p_tabela;
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

-- (chave, assinatura) de cada linha. Chave com envio pendente vai com '*': o Apps Script
-- nao a compara (ainda esta a caminho).
create or replace function internal.backup_manifesto(p_tabela text)
returns jsonb
language plpgsql
stable
set search_path = ''
set timezone = 'UTC'
set datestyle = 'ISO, YMD'
set extra_float_digits = 1
as $$
declare
  v_manifesto jsonb;
begin
  execute format($q$
    with banco as (
      select internal.backup_chave($2, to_jsonb(t)) as chave, to_jsonb(t) as linha from public.%I t
    ),
    pendente as (
      select f.chave from internal.backup_fila f where f.tabela = $1
    )
    select coalesce(jsonb_agg(jsonb_build_array(x.chave, x.assinatura)), '[]'::jsonb)
    from (
      select b.chave, case when p.chave is null
               then internal.backup_assinatura(internal.backup_normalizar(b.linha)) else '*' end as assinatura
        from banco b left join pendente p on p.chave = b.chave
      union all
      select p.chave, '*' from pendente p where not exists (select 1 from banco b where b.chave = p.chave)
    ) x
  $q$, p_tabela)
  into v_manifesto
  using p_tabela, internal.backup_pk_colunas(p_tabela);
  return v_manifesto;
end;
$$;

create or replace function internal.backup_enviar_validacoes()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_validacao record;
  v_request bigint;
  v_linhas integer;
  v_manifesto jsonb;
  v_total integer := 0;
  v_vagas integer;
begin
  select 2 - count(*) into v_vagas from internal.backup_validacoes v where v.status = 'enviada';
  if v_vagas <= 0 then
    return 0;
  end if;

  for v_validacao in
    select v.id, v.tabela from internal.backup_validacoes v
    where v.status = 'agendada'
    order by v.id
    limit v_vagas
    for update skip locked
  loop
    begin
      v_manifesto := internal.backup_manifesto(v_validacao.tabela);
      execute format('select count(*) from public.%I', v_validacao.tabela) into v_linhas;
      v_request := internal.backup_postar(jsonb_build_object(
        'action', 'verify',
        'table', v_validacao.tabela,
        'pk', to_jsonb(internal.backup_pk_colunas(v_validacao.tabela)),
        'cols', (
          select jsonb_agg(a.attname order by a.attnum)
          from pg_catalog.pg_attribute a
          where a.attrelid = pg_catalog.to_regclass(format('public.%I', v_validacao.tabela))
            and a.attnum > 0 and not a.attisdropped),
        'rows', v_manifesto));
      if v_request is null then
        raise exception 'url/token do Apps Script ausentes em internal.app_settings';
      end if;
      update internal.backup_validacoes
         set status = 'enviada', request_id = v_request, enviado_em = now(), linhas_banco = v_linhas
       where id = v_validacao.id;
      v_total := v_total + 1;
    exception when others then
      update internal.backup_validacoes
         set status = 'erro', concluido_em = now(), detalhe = left(sqlerrm, 500)
       where id = v_validacao.id;
    end;
  end loop;
  return v_total;
end;
$$;

create or replace function internal.backup_confirmar_validacoes()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_validacao record;
  v_json jsonb;
  v_colunas text[];
  v_chaves text[];
  v_sobrando text[];
  v_linhas_planilha integer;
  v_limite integer;
  v_bloqueado boolean;
  v_chave text;
  v_total integer;
begin
  for v_validacao in
    select v.id, v.tabela, v.permitir_exclusoes, r.status_code, r.content, r.error_msg
    from internal.backup_validacoes v
    join net._http_response r on r.id = v.request_id
    where v.status = 'enviada'
  loop
    v_json := internal.backup_json(v_validacao.content);
    if v_validacao.status_code is distinct from 200
       or v_json ->> 'ok' is distinct from 'true'
       or v_json ->> 'action' is distinct from 'verify' then
      update internal.backup_validacoes
         set status = 'erro', concluido_em = now(),
             detalhe = left(case
               when v_json ->> 'error' = 'BACKUP_MISSING_TABLE'
                 then 'Apps Script desatualizado: publique a nova versao do backup-monolith.gs.'
               else coalesce(v_json ->> 'error', v_validacao.error_msg,
                             'HTTP ' || v_validacao.status_code, 'resposta invalida')
             end, 500)
       where id = v_validacao.id;
      continue;
    end if;

    v_colunas := internal.backup_pk_colunas(v_validacao.tabela);
    v_linhas_planilha := coalesce((v_json ->> 'sheetRows')::integer, 0);
    v_sobrando := array(select jsonb_array_elements_text(coalesce(v_json -> 'orphan', '[]'::jsonb)));
    v_chaves := array(
      select jsonb_array_elements_text(coalesce(v_json -> 'missing', '[]'::jsonb))
      union
      select jsonb_array_elements_text(coalesce(v_json -> 'different', '[]'::jsonb)));

    -- Contencao: se o banco perder linhas em massa sem passar pela trigger (truncate,
    -- restore, trigger desligada), a validacao NAO propaga a perda para o espelho.
    v_limite := greatest(20, ceil(v_linhas_planilha * 0.10)::integer);
    v_bloqueado := cardinality(v_sobrando) > v_limite and not v_validacao.permitir_exclusoes;
    if not v_bloqueado then
      v_chaves := v_chaves || v_sobrando;
    end if;

    v_total := 0;
    foreach v_chave in array v_chaves loop
      perform internal.backup_enfileirar(
        v_validacao.tabela, v_chave,
        (select jsonb_object_agg(c.coluna, (string_to_array(v_chave, '|'))[c.ordem])
           from unnest(v_colunas) with ordinality as c(coluna, ordem)));
      v_total := v_total + 1;
    end loop;

    update internal.backup_validacoes
       set status = case
             when v_bloqueado then 'bloqueada'
             when jsonb_array_length(coalesce(v_json -> 'missing', '[]'::jsonb)) = 0
              and jsonb_array_length(coalesce(v_json -> 'different', '[]'::jsonb)) = 0
              and cardinality(v_sobrando) = 0 then 'ok'
             else 'divergente'
           end,
           concluido_em = now(),
           linhas_planilha = v_linhas_planilha,
           faltando = jsonb_array_length(coalesce(v_json -> 'missing', '[]'::jsonb)),
           diferentes = jsonb_array_length(coalesce(v_json -> 'different', '[]'::jsonb)),
           sobrando = cardinality(v_sobrando),
           reenfileirados = v_total,
           detalhe = concat_ws(' ',
             case when v_bloqueado then format(
               '%s linha(s) so existem na planilha (limite %s): nada foi apagado. Confira o banco e, se a exclusao for legitima, rode internal.backup_validar(%L, true).',
               cardinality(v_sobrando), v_limite, v_validacao.tabela) end,
             case when coalesce((v_json ->> 'manual')::integer, 0) > 0 then format(
               '%s linha(s) com alteracao manual pendente de SQL foram preservadas.', v_json ->> 'manual') end)
     where id = v_validacao.id;
  end loop;

  update internal.backup_validacoes
     set status = 'erro', concluido_em = now(), detalhe = 'sem resposta do Apps Script em 5 min'
   where status = 'enviada' and enviado_em < now() - interval '5 minutes';
end;
$$;

-- Tique do cron: confirma o que voltou e manda o proximo.
create or replace function internal.backup_despachar(p_max_operacoes integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operacoes integer;
  v_validacoes integer;
begin
  if not pg_try_advisory_xact_lock(hashtext('rn-gestor-backup-despacho')) then
    return jsonb_build_object('ocupado', true);
  end if;
  perform internal.backup_confirmar_envios();
  perform internal.backup_confirmar_validacoes();
  v_operacoes := internal.backup_enviar_lote(p_max_operacoes);
  v_validacoes := internal.backup_enviar_validacoes();
  return jsonb_build_object('operacoes', v_operacoes, 'validacoes', v_validacoes);
end;
$$;

-- ------------------------------------------------------------------ consulta
-- Uma linha por tabela: ultima validacao + fila. Tabela do public sem a trigger aparece
-- como SEM_BACKUP (log_alteracoes e client_errors ficam de fora de proposito).
create or replace function internal.backup_status()
returns table (
  tabela text,
  situacao text,
  validado_em timestamptz,
  linhas_banco integer,
  linhas_planilha integer,
  faltando integer,
  diferentes integer,
  sobrando integer,
  na_fila bigint,
  na_fila_desde timestamptz,
  com_erro bigint,
  detalhe text
)
language sql
stable
security definer
set search_path = ''
as $$
  with espelhadas as (select t as tabela from internal.backup_tabelas() as t),
  todas as (
    select c.relname::text as tabela
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname not in ('log_alteracoes', 'client_errors')
  )
  select * from (
  select
    a.tabela,
    case
      when e.tabela is null then 'SEM_BACKUP'
      when coalesce(fila.com_erro, 0) > 0 then 'ERRO_ENVIO'
      when fila.desde < now() - interval '15 minutes' then 'FILA_ATRASADA'
      when v.id is null then 'NUNCA_VALIDADA'
      when v.concluido_em < now() - interval '36 hours' then 'VALIDACAO_ATRASADA'
      else upper(v.status)
    end as situacao,
    v.concluido_em, v.linhas_banco, v.linhas_planilha, v.faltando, v.diferentes, v.sobrando,
    coalesce(fila.total, 0) as na_fila, fila.desde as na_fila_desde,
    coalesce(fila.com_erro, 0) as com_erro, coalesce(fila.erro, v.detalhe) as detalhe
  from todas a
  left join espelhadas e on e.tabela = a.tabela
  left join lateral (
    select * from internal.backup_validacoes x
    where x.tabela = a.tabela and x.concluido_em is not null
    order by x.id desc limit 1
  ) v on true
  left join lateral (
    select count(*) as total, min(f.enfileirado_em) as desde,
           count(*) filter (where f.ultimo_erro is not null) as com_erro,
           max(f.ultimo_erro) as erro
    from internal.backup_fila f where f.tabela = a.tabela
  ) fila on true
  ) s
  order by s.situacao = 'OK', s.tabela -- problemas primeiro
$$;

create or replace function internal.backup_rotina_diaria()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from internal.backup_validacoes where agendada_em < now() - interval '30 days';
  begin
    delete from cron.job_run_details d
     where d.end_time < now() - interval '7 days'
       and d.jobid in (select j.jobid from cron.job j where j.jobname like 'rn-gestor-backup-%');
  exception when others then
    raise warning 'limpeza do historico do cron falhou: %', sqlerrm; -- nao impede a validacao
  end;
  return internal.backup_validar();
end;
$$;

-- So as funcoes do backup: outras funcoes de `internal` mantem os grants que ja tem.
do $$
declare
  v_funcao regprocedure;
begin
  for v_funcao in
    select p.oid::regprocedure
    from pg_catalog.pg_proc p
    where p.pronamespace = 'internal'::regnamespace and p.proname like 'backup\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_funcao);
  end loop;
end;
$$;

-- ------------------------------------------------------------------ agenda
select cron.unschedule(jobid) from cron.job
 where jobname in ('rn-gestor-backup-despacho', 'rn-gestor-backup-validacao');
select cron.schedule('rn-gestor-backup-despacho', '* * * * *', 'select internal.backup_despachar()');
-- 06:10 UTC = 03:10 em Brasilia.
select cron.schedule('rn-gestor-backup-validacao', '10 6 * * *', 'select internal.backup_rotina_diaria()');
