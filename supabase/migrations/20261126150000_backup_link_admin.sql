-- Link do Apps Script do backup (internal.app_settings.url_appscript_supply) editavel pelo
-- ADMINISTRADOR no site (/admin/backup). Sem campo novo: so leitura/gravacao da chave que ja
-- existe, pelo servidor (service_role). O token do webhook continua fora do alcance do app.
--
-- Trocar o link redireciona TODOS os dados do backup, por isso a troca e auditada (quem e
-- quando; o conteudo fica de fora, como as outras chaves de app_settings).

create or replace function public.fn_backup_link()
returns table (url text, atualizado_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.value, s.updated_at
  from internal.app_settings s
  where s.key = 'url_appscript_supply'
$$;

create or replace function public.fn_backup_link_definir(p_url text)
returns table (url text, atualizado_em timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_url is null or p_url !~ '^https://script\.google\.com/macros/s/[A-Za-z0-9_-]{20,}/exec$' then
    raise exception 'REGRA: Link inválido. Use o endereço /exec da implantação do Apps Script.';
  end if;

  insert into internal.app_settings as s (key, value)
  values ('url_appscript_supply', p_url)
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now()
    where s.value is distinct from excluded.value;

  return query
    select s.value, s.updated_at
    from internal.app_settings s
    where s.key = 'url_appscript_supply';
end;
$$;

revoke all on function public.fn_backup_link() from public, anon, authenticated;
revoke all on function public.fn_backup_link_definir(text) from public, anon, authenticated;
grant execute on function public.fn_backup_link() to service_role;
grant execute on function public.fn_backup_link_definir(text) to service_role;

drop trigger if exists trg_00_auditoria_backup_link on internal.app_settings;
create trigger trg_00_auditoria_backup_link
  after insert or update on internal.app_settings
  for each row
  when (new.key = 'url_appscript_supply')
  execute function public.fn_auditoria_registrar('key', 'value', '');
