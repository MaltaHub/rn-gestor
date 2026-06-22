-- =====================================================================
-- RPCs do backfill CHUNKED (para o botao com progresso no app).
-- O trabalho pesado (paginacao/serializacao) fica aqui; a rota da API le 1
-- chunk e POSTa ao Apps Script. Todas security definer, revogadas de
-- anon/authenticated (so a rota chama, via service_role).
-- =====================================================================

-- conjunto canonico das 34 tabelas do backup (= o do backup_backfill)
create or replace function public.backup_tables_() returns text[]
language sql immutable set search_path = '' as $$
  select array[
    'anuncios','anuncios_insight_verifications','arquivo_automacao_config','arquivo_automacao_folders',
    'arquivos_arquivos','arquivos_pastas','caracteristicas_tecnicas','caracteristicas_visuais',
    'carro_caracteristicas_tecnicas','carro_caracteristicas_visuais','carros','controle_envelopes',
    'documento_templates','documentos','finalizados','grupos_repetidos',
    'lookup_announcement_statuses','lookup_audit_actions','lookup_locations','lookup_sale_statuses',
    'lookup_user_roles','lookup_user_statuses','lookup_vehicle_states','lookups','modelos','observacoes',
    'price_change_contexts','print_templates','remetentes','repetidos','usuarios_acesso',
    'venda_documentos','venda_entradas','vendas'
  ]::text[];
$$;

-- Plano: tabelas + total de linhas + total geral (p/ a barra de progresso).
create or replace function public.backup_plan()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t text; v_n bigint; v_arr jsonb := '[]'::jsonb; v_total bigint := 0;
begin
  foreach t in array public.backup_tables_() loop
    execute format('select count(*) from public.%I', t) into v_n;
    v_arr := v_arr || jsonb_build_object('table', t, 'total', v_n);
    v_total := v_total + v_n;
  end loop;
  return jsonb_build_object('tables', v_arr, 'grand_total', v_total);
end; $$;

-- Chunk: le um lote (offset/limit) ordenado por ctid; retorna {total, rows[]}.
create or replace function public.backup_chunk(p_table text, p_offset int, p_limit int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_total bigint; v_rows jsonb;
begin
  if not (p_table = any(public.backup_tables_())) then
    raise exception 'backup_chunk: tabela nao permitida: %', p_table;
  end if;
  execute format('select count(*) from public.%I', p_table) into v_total;
  execute format($f$
    select coalesce(jsonb_agg((to_jsonb(x) - 'backup_rn') order by x.backup_rn), '[]'::jsonb)
    from (
      select t.*, row_number() over (order by t.ctid) as backup_rn
      from public.%I t
      order by t.ctid
      offset %s limit %s
    ) x
  $f$, p_table, greatest(coalesce(p_offset, 0), 0), greatest(coalesce(p_limit, 1), 1))
  into v_rows;
  return jsonb_build_object('total', v_total, 'rows', coalesce(v_rows, '[]'::jsonb));
end; $$;

-- Alvo: url+token do Apps Script (lidos do internal.app_settings; ficam no servidor).
create or replace function public.backup_target()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_url text; v_token text;
begin
  select nullif(trim(s.value), '') into v_url   from internal.app_settings s where s.key = 'url_appscript_supply';
  select nullif(trim(s.value), '') into v_token from internal.app_settings s where s.key = 'token_appscript_supply';
  return jsonb_build_object('url', v_url, 'token', v_token);
end; $$;

revoke all on function public.backup_tables_() from anon, authenticated;
revoke all on function public.backup_plan() from anon, authenticated;
revoke all on function public.backup_chunk(text, int, int) from anon, authenticated;
revoke all on function public.backup_target() from anon, authenticated;
