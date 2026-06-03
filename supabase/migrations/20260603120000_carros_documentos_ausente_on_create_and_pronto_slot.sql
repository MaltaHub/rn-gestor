-- Automacao carros -> documentos:
-- (1) Ao CRIAR um veiculo, cria a linha de documentos ja com envelope 'AUSENTE'
--     (novo estado de envelope). Nao sobrescreve linha existente.
-- (2) Quando 'estado_veiculo' vira 'PRONTO', GARANTE que exista a linha de
--     documentos (slot) para o usuario preencher 'responsavel_virado'. O valor
--     e definido pelo usuario; o trigger nao preenche automaticamente.

begin;

-- Novo estado de envelope 'AUSENTE' (documentos.envelope tem FK para este lookup).
insert into public.lookup_estados_envelope (code, name, sort_order)
values ('AUSENTE', 'Ausente', 5)
on conflict (code) do nothing;

-- (1) Veiculo criado -> documentos com envelope 'AUSENTE'.
create or replace function public.fn_carros_created_set_envelope_ausente()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into public.documentos as d (carro_id, envelope)
  values (new.id, 'AUSENTE')
  on conflict (carro_id) do nothing;
  return null;
end;
$function$;
revoke execute on function public.fn_carros_created_set_envelope_ausente() from public, anon, authenticated;

drop trigger if exists trg_carros_created_envelope_ausente on public.carros;
create trigger trg_carros_created_envelope_ausente
  after insert on public.carros
  for each row
  execute function public.fn_carros_created_set_envelope_ausente();

-- (2) estado_veiculo -> 'PRONTO': garante a linha de documentos (slot para
--     responsavel_virado). O usuario preenche o valor manualmente.
create or replace function public.fn_carros_pronto_ensure_documentos()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.estado_veiculo = 'PRONTO'
     and (tg_op = 'INSERT' or old.estado_veiculo is distinct from new.estado_veiculo) then
    insert into public.documentos as d (carro_id)
    values (new.id)
    on conflict (carro_id) do nothing;
  end if;
  return null;
end;
$function$;
revoke execute on function public.fn_carros_pronto_ensure_documentos() from public, anon, authenticated;

drop trigger if exists trg_carros_pronto_ensure_documentos on public.carros;
create trigger trg_carros_pronto_ensure_documentos
  after insert or update of estado_veiculo on public.carros
  for each row
  execute function public.fn_carros_pronto_ensure_documentos();

commit;
