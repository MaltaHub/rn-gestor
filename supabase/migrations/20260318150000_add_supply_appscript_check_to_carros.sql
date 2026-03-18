alter table public.carros
add column if not exists os_supply_appscript_check boolean not null default false;

create or replace function public.dispatch_supply_carros_payload(payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  webhook_url text;
  request_id bigint;
  response record;
  response_found boolean := false;
  response_body jsonb;
  attempt integer;
begin
  select nullif(trim(s.value), '')
  into webhook_url
  from internal.app_settings as s
  where s.key = 'url_appscript_supply';

  if webhook_url is null then
    return false;
  end if;

  begin
    select net.http_post(
      url := webhook_url,
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := payload
    )
    into request_id;
  exception
    when others then
      return false;
  end;

  if request_id is null or to_regclass('net._http_response') is null then
    return false;
  end if;

  for attempt in 1..40 loop
    execute
      'select status_code, timed_out, error_msg, content from net._http_response where id = $1'
      into response
      using request_id;

    if found then
      response_found := true;
      exit;
    end if;

    perform pg_sleep(0.25);
  end loop;

  if not response_found then
    return false;
  end if;

  if coalesce(response.timed_out, false) then
    return false;
  end if;

  if nullif(coalesce(response.error_msg, ''), '') is not null then
    return false;
  end if;

  if coalesce(response.status_code, 0) < 200 or coalesce(response.status_code, 0) >= 300 then
    return false;
  end if;

  if nullif(btrim(coalesce(response.content, '')), '') is null then
    return true;
  end if;

  begin
    response_body := response.content::jsonb;
  exception
    when others then
      return true;
  end;

  if response_body ? 'success' then
    return lower(coalesce(response_body ->> 'success', 'false')) in ('true', 't', '1', 'ok', 'success');
  end if;

  if response_body ? 'ok' then
    return lower(coalesce(response_body ->> 'ok', 'false')) in ('true', 't', '1', 'ok', 'success');
  end if;

  if nullif(coalesce(response_body ->> 'error', ''), '') is not null then
    return false;
  end if;

  if nullif(coalesce(response_body ->> 'erro', ''), '') is not null then
    return false;
  end if;

  if lower(coalesce(response_body ->> 'status', '')) in ('error', 'erro', 'fail', 'failed', 'failure') then
    return false;
  end if;

  return true;
exception
  when others then
    return false;
end;
$$;

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
    if webhook_token is null then
      return old;
    end if;

    payload := jsonb_build_object(
      'token', webhook_token,
      'action', 'remove',
      'placa', coalesce(old.placa, '')
    );

    perform public.dispatch_supply_carros_payload(payload);
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

  if not should_dispatch then
    return new;
  end if;

  if webhook_token is null then
    new.os_supply_appscript_check := false;
    return new;
  end if;

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

  new.os_supply_appscript_check := public.dispatch_supply_carros_payload(payload);
  return new;
end;
$$;

drop trigger if exists trg_supply_carros_webhook on public.carros;
create trigger trg_supply_carros_webhook
before insert or update of modelo_id, cor, ano_fab, ano_mod, placa, hodometro, preco_original, local, em_estoque
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
