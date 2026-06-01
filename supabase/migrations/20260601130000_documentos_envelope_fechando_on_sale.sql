-- (1) Novo estado de envelope 'FECHANDO' (entre PRONTO e FECHADO).
-- (2) Quando um veiculo entra em 'VENDIDO', o envelope dos documentos dele entra
--     automaticamente em 'FECHANDO' (cria a linha de documentos se nao existir).
--
-- Override intencional: a venda forca o envelope para FECHANDO mesmo que ja
-- houvesse outro valor. O reparse de nomes de arquivo ainda pode sobrescrever
-- depois se um token de envelope casar (comportamento "nome do arquivo vence").

begin;

insert into public.lookup_estados_envelope (code, name, sort_order)
values ('FECHANDO', 'Fechando', 15)
on conflict (code) do nothing;

create or replace function public.fn_carros_sold_set_envelope_fechando()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.estado_venda = 'VENDIDO'
     and (tg_op = 'INSERT' or old.estado_venda is distinct from new.estado_venda) then
    insert into public.documentos as d (carro_id, envelope)
    values (new.id, 'FECHANDO')
    on conflict (carro_id) do update set envelope = 'FECHANDO', updated_at = now();
  end if;
  return null;
end;
$function$;
revoke execute on function public.fn_carros_sold_set_envelope_fechando() from public, anon, authenticated;

drop trigger if exists trg_carros_sold_envelope_fechando on public.carros;
create trigger trg_carros_sold_envelope_fechando
  after insert or update of estado_venda on public.carros
  for each row
  execute function public.fn_carros_sold_set_envelope_fechando();

commit;
