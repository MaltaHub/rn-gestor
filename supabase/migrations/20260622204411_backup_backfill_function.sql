-- =====================================================================
-- Backfill do backup: popula o Apps Script com os dados JA existentes.
-- Le cada tabela, monta lotes (p_batch linhas) no contrato do monolito
-- {token, source:'backfill', ops:[{table, op:'upsert', row}]} e dispara via
-- pg_net (fire-and-forget). Idempotente (upsert por PK) — pode re-rodar.
--
-- Uso:
--   select * from public.backup_backfill();                 -- todas (34 tabelas), lotes de 100
--   select * from public.backup_backfill(array['carros']);  -- so uma tabela
--   select * from public.backup_backfill(null, 200);        -- lote maior
--
-- OBS: dispara TODOS os lotes de uma vez (pg_net async). Para datasets grandes,
-- prefira o botao de backfill no app (chunked + progresso, respeita quota/lock).
-- =====================================================================
create or replace function public.backup_backfill(p_tables text[] default null, p_batch integer default 100)
returns table(tbl text, total_rows bigint, batches integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
  v_tables text[];
  t text;
begin
  select nullif(trim(s.value), '') into v_url   from internal.app_settings s where s.key = 'url_appscript_supply';
  select nullif(trim(s.value), '') into v_token from internal.app_settings s where s.key = 'token_appscript_supply';
  if v_url is null or v_token is null then
    raise exception 'backup_backfill: url_appscript_supply/token_appscript_supply ausentes em internal.app_settings';
  end if;

  v_tables := coalesce(p_tables, array[
    'anuncios','anuncios_insight_verifications','arquivo_automacao_config','arquivo_automacao_folders',
    'arquivos_arquivos','arquivos_pastas','caracteristicas_tecnicas','caracteristicas_visuais',
    'carro_caracteristicas_tecnicas','carro_caracteristicas_visuais','carros','controle_envelopes',
    'documento_templates','documentos','finalizados','grupos_repetidos',
    'lookup_announcement_statuses','lookup_audit_actions','lookup_locations','lookup_sale_statuses',
    'lookup_user_roles','lookup_user_statuses','lookup_vehicle_states','lookups','modelos','observacoes',
    'price_change_contexts','print_templates','remetentes','repetidos','usuarios_acesso',
    'venda_documentos','venda_entradas','vendas'
  ]);

  foreach t in array v_tables loop
    tbl := t; total_rows := 0; batches := 0;
    execute format($f$
      with numbered as (
        select to_jsonb(x) as row, ((row_number() over (order by ctid)) - 1) / %s::int as grp
        from public.%I x
      ),
      batched as (
        select grp,
               jsonb_build_object('token', %L, 'source', 'backfill', 'ops',
                 jsonb_agg(jsonb_build_object('table', %L, 'op', 'upsert', 'row', numbered.row))) as body,
               count(*) as n
        from numbered group by grp
      ),
      sent as (
        select net.http_post(url := %L, headers := '{"Content-Type":"application/json"}'::jsonb,
                             body := b.body, timeout_milliseconds := 20000) as req, b.n as n
        from batched b
      )
      select coalesce(sum(n), 0)::bigint, count(*)::int from sent
    $f$, p_batch, t, v_token, t, v_url)
    into total_rows, batches;
    return next;
  end loop;
end;
$$;

revoke all on function public.backup_backfill(text[], integer) from anon, authenticated;
