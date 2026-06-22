-- =====================================================================
-- Back-end do backup de contencao COMPLETO: trigger generica que espelha
-- toda manipulacao de dados para o Apps Script (contrato {table, op, row}),
-- async fire-and-forget (sem polling/bloqueio). Substitui o supply antigo
-- de carros (formato flat -> aba Estoque).
-- Escopo: 34 tabelas (todas menos log_alteracoes, por volume/quota).
-- =====================================================================

-- 1) Dispatch generico fire-and-forget (so enfileira o POST) -----------
create or replace function public.dispatch_backup_payload(payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  webhook_url text;
begin
  select nullif(trim(s.value), '')
  into webhook_url
  from internal.app_settings as s
  where s.key = 'url_appscript_supply';

  if webhook_url is null then
    return;
  end if;

  perform net.http_post(
    url := webhook_url,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := payload,
    timeout_milliseconds := 20000
  );
exception
  when others then
    return; -- best-effort: nunca derruba a transacao de negocio.
end;
$$;

-- 2) Trigger function generica (monta {token, source, table, op, row}) -
create or replace function public.backup_row_webhook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  webhook_token text;
  payload jsonb;
begin
  select nullif(trim(s.value), '')
  into webhook_token
  from internal.app_settings as s
  where s.key = 'token_appscript_supply';

  if webhook_token is not null then
    payload := jsonb_build_object(
      'token', webhook_token,
      'source', 'supabase-trigger',
      'table', tg_table_name,
      'op', case when tg_op = 'DELETE' then 'delete' else 'upsert' end,
      'row', case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end
    );
    perform public.dispatch_backup_payload(payload);
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.dispatch_backup_payload(jsonb) from anon, authenticated;
revoke all on function public.backup_row_webhook() from anon, authenticated;

-- 3) Remove o supply ANTIGO de carros (substituido pelo generico) ------
drop trigger if exists trg_supply_carros_webhook on public.carros;
drop trigger if exists trg_supply_carros_webhook_delete on public.carros;
drop function if exists public.supply_carros_webhook() cascade;
drop function if exists public.dispatch_supply_carros_payload(jsonb) cascade;

-- 4) Anexa a trigger generica nas 34 tabelas (todas menos log_alteracoes)
do $do$
declare
  t text;
  tables text[] := array[
    'anuncios','anuncios_insight_verifications','arquivo_automacao_config','arquivo_automacao_folders',
    'arquivos_arquivos','arquivos_pastas','caracteristicas_tecnicas','caracteristicas_visuais',
    'carro_caracteristicas_tecnicas','carro_caracteristicas_visuais','carros','controle_envelopes',
    'documento_templates','documentos','finalizados','grupos_repetidos',
    'lookup_announcement_statuses','lookup_audit_actions','lookup_locations','lookup_sale_statuses',
    'lookup_user_roles','lookup_user_statuses','lookup_vehicle_states','lookups','modelos','observacoes',
    'price_change_contexts','print_templates','remetentes','repetidos','usuarios_acesso',
    'venda_documentos','venda_entradas','vendas'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists trg_backup_row_webhook on public.%I', t);
    execute format(
      'create trigger trg_backup_row_webhook after insert or update or delete on public.%I for each row execute function public.backup_row_webhook()',
      t
    );
  end loop;
end
$do$;
