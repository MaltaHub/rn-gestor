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
    'rows', jsonb_build_array(
      jsonb_build_array(
        coalesce(modelo_nome, ''),
        coalesce(new.cor, ''),
        coalesce(new.ano_fab::text, ''),
        coalesce(new.ano_mod::text, ''),
        coalesce(new.placa, ''),
        coalesce(new.hodometro::text, ''),
        coalesce(new.preco_original::text, ''),
        coalesce(new.local, ''),
        case when new.em_estoque then 'sim' else 'nao' end
      )
    )
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

revoke all on function public.supply_carros_webhook() from anon, authenticated;
