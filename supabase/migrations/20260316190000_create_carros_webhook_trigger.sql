create extension if not exists pg_net with schema extensions;

create schema if not exists internal;

create table if not exists internal.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into internal.app_settings (key, value)
values
  ('url_appscript_supply', 'https://script.google.com/macros/s/AKfycbz1D4prFnJsygZ4ynWeJnRwqD0pNJiov4VZaYdpKlJO8mwwrzEN8FwjarcOptuIJXScXw/exec'),
  ('token_appscript_supply', 'J3sus3B0m&od1abon40pr32ta')
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

create or replace function public.supply_carros_webhook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  webhook_url text;
  webhook_token text;
  modelo_nome text;
  payload jsonb;
begin
  select nullif(trim(s.value), '')
  into webhook_url
  from internal.app_settings as s
  where s.key = 'url_appscript_supply';

  select nullif(trim(s.value), '')
  into webhook_token
  from internal.app_settings as s
  where s.key = 'token_appscript_supply';

  if webhook_url is null then
    return new;
  end if;

  select m.modelo
  into modelo_nome
  from public.modelos as m
  where m.id = new.modelo_id;

  payload := jsonb_build_object(
    'token', webhook_token,
    'modelo', modelo_nome,
    'cor', new.cor,
    'fabricacao', new.ano_fab,
    'ano', new.ano_mod,
    'placa', new.placa,
    'km', new.hodometro,
    'preco', new.preco_original,
    'local', new.local,
    'em_estoque', new.em_estoque
  );

  begin
    perform net.http_post(
      url := webhook_url,
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := payload
    );
  exception
    when others then
      raise warning 'supply_carros_webhook falhou para carro %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists trg_supply_carros_webhook on public.carros;
create trigger trg_supply_carros_webhook
after insert or update of modelo_id, cor, ano_fab, ano_mod, placa, hodometro, preco_original, local, em_estoque
on public.carros
for each row
execute function public.supply_carros_webhook();

revoke all on function public.supply_carros_webhook() from anon, authenticated;
