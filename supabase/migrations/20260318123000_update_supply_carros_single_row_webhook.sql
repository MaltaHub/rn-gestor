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

  if webhook_url is null or webhook_token is null then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    payload := jsonb_build_object(
      'token', webhook_token,
      'action', 'remove',
      'placa', coalesce(old.placa, '')
    );
  else
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
  end if;

  begin
    perform net.http_post(
      url := webhook_url,
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := payload
    );
  exception
    when others then
      raise warning 'supply_carros_webhook falhou para operacao % na placa %: %', tg_op, coalesce(new.placa, old.placa), sqlerrm;
  end;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

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

revoke all on function public.supply_carros_webhook() from anon, authenticated;
