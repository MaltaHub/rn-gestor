-- Veiculo de TROCA aponta para o seu ponto de entrada (a venda em que entrou).
-- Trigger em venda_entradas: vale para criar e editar a venda (RPCs) e para o
-- grid. A troca removida da venda limpa o ponteiro se ainda apontava para ela.

create or replace function public.fn_venda_entradas_ponto_de_entrada()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.carro_troca_id is not null
     and (tg_op = 'DELETE' or new.carro_troca_id is distinct from old.carro_troca_id) then
    update public.documentos
       set origem_venda_id = null
     where carro_id = old.carro_troca_id and origem_venda_id = old.venda_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.carro_troca_id is not null then
    update public.documentos
       set origem_venda_id = new.venda_id, origem = 'TROCA'
     where carro_id = new.carro_troca_id
       and (origem_venda_id is distinct from new.venda_id or origem is distinct from 'TROCA');
  end if;

  return null;
end;
$function$;

drop trigger if exists trg_venda_entradas_ponto_de_entrada on public.venda_entradas;
create trigger trg_venda_entradas_ponto_de_entrada
  after insert or update of carro_troca_id, venda_id or delete on public.venda_entradas
  for each row execute function public.fn_venda_entradas_ponto_de_entrada();

-- Trocas ja registradas (hoje nenhuma tem carro_troca_id, mas fica idempotente).
update public.documentos d
   set origem_venda_id = e.venda_id, origem = 'TROCA'
  from public.venda_entradas e
 where e.carro_troca_id = d.carro_id
   and d.origem_venda_id is null;
