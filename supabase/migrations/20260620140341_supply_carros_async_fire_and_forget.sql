-- =====================================================================
-- Backup de contencao (carros -> aba Estoque via Apps Script): troca o
-- desenho SINCRONO-BLOQUEANTE por ASSINCRONO fire-and-forget.
--
-- Antes: trigger BEFORE chamava dispatch que fazia POST + POLLING (ate ~10s,
-- pg_sleep x40) esperando a resposta DENTRO da transacao. Mas o pg_net so envia
-- o request DEPOIS do commit -> a funcao nunca via a resposta, dava timeout e
-- gravava os_supply_appscript_check=false SEMPRE (falso-negativo), alem de
-- atrasar ~10s cada escrita em carros.
--
-- Agora: dispatch apenas ENFILEIRA o POST (net.http_post) e retorna na hora;
-- trigger vira AFTER e NAO grava mais o flag. A confirmacao de sucesso ficara a
-- cargo da reconciliacao do backup completo (a construir). Base alinhada com ele.
-- =====================================================================

-- 1) dispatch: fire-and-forget (sem polling/bloqueio) ----------------
create or replace function public.dispatch_supply_carros_payload(payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  webhook_url text;
  request_id bigint;
begin
  select nullif(trim(s.value), '')
  into webhook_url
  from internal.app_settings as s
  where s.key = 'url_appscript_supply';

  if webhook_url is null then
    return false;
  end if;

  select net.http_post(
    url := webhook_url,
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := payload,
    timeout_milliseconds := 20000
  )
  into request_id;

  -- "enfileirado" (NAO "confirmado"): a resposta do Apps Script chega async,
  -- depois do commit; quem confirma o backup sera a reconciliacao do sistema novo.
  return request_id is not null;
exception
  when others then
    -- backup best-effort: nunca derruba a transacao do carro.
    return false;
end;
$$;

-- 2) trigger function: AFTER-compativel, sem gravar o flag -----------
create or replace function public.supply_carros_webhook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  webhook_token text;
  modelo_nome text;
  payload jsonb;
  should_dispatch boolean := false;
begin
  select nullif(trim(s.value), '')
  into webhook_token
  from internal.app_settings as s
  where s.key = 'token_appscript_supply';

  if tg_op = 'DELETE' then
    if webhook_token is not null then
      payload := jsonb_build_object(
        'token', webhook_token,
        'action', 'remove',
        'placa', coalesce(old.placa, '')
      );
      perform public.dispatch_supply_carros_payload(payload);
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    should_dispatch := true;
  elsif tg_op = 'UPDATE' then
    should_dispatch :=
      new.modelo_id is distinct from old.modelo_id
      or new.cor is distinct from old.cor
      or new.ano_fab is distinct from old.ano_fab
      or new.ano_mod is distinct from old.ano_mod
      or new.placa is distinct from old.placa
      or new.hodometro is distinct from old.hodometro
      or new.preco_original is distinct from old.preco_original
      or new.local is distinct from old.local
      or new.em_estoque is distinct from old.em_estoque;
  end if;

  if should_dispatch and webhook_token is not null then
    select m.modelo
    into modelo_nome
    from public.modelos as m
    where m.id = new.modelo_id;

    payload := jsonb_build_object(
      'token', webhook_token,
      'modelo', coalesce(modelo_nome, ''),
      'cor', coalesce(new.cor, ''),
      'fabricacao', coalesce(new.ano_fab::text, ''),
      'ano', coalesce(new.ano_mod::text, ''),
      'placa', coalesce(new.placa, ''),
      'km', coalesce(new.hodometro::text, ''),
      'preco', coalesce(new.preco_original::text, ''),
      'local', coalesce(new.local, ''),
      'em_estoque', case when coalesce(new.em_estoque, false) then 'sim' else 'nao' end
    );

    perform public.dispatch_supply_carros_payload(payload);
  end if;

  return null; -- AFTER trigger: retorno ignorado
end;
$$;

-- 3) triggers: INSERT/UPDATE vira AFTER (era BEFORE) -----------------
drop trigger if exists trg_supply_carros_webhook on public.carros;
create trigger trg_supply_carros_webhook
after insert or update of modelo_id, cor, ano_fab, ano_mod, placa, hodometro, preco_original, local, em_estoque
on public.carros
for each row
execute function public.supply_carros_webhook();

drop trigger if exists trg_supply_carros_webhook_delete on public.carros;
create trigger trg_supply_carros_webhook_delete
after delete
on public.carros
for each row
execute function public.supply_carros_webhook();

revoke all on function public.dispatch_supply_carros_payload(jsonb) from anon, authenticated;
revoke all on function public.supply_carros_webhook() from anon, authenticated;

-- 4) marca a coluna como vestigial (nao e mais gravada) --------------
comment on column public.carros.os_supply_appscript_check is
  'VESTIGIAL desde 2026-06-20: o webhook de supply virou AFTER fire-and-forget e nao grava mais este flag (fica sempre no ultimo valor). Sera substituido pela reconciliacao do backup completo. Nao confiar como prova de backup.';
