-- Quando o veiculo entra em 'reservado' ou 'vendido', ele sai de estoque e dos
-- calculos automaticamente (em_estoque=false, participa_calculos=false).
-- Um trigger BEFORE cobre todos os caminhos de escrita (grid, venda, bulk, API),
-- entao a regra nao depende da camada de aplicacao.

create or replace function public.fn_carros_desativa_reservado_vendido()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.normalize_business_token(NEW.estado_venda) in ('reservado', 'vendido') then
    NEW.em_estoque := false;
    NEW.participa_calculos := false;
  end if;
  return NEW;
end;
$$;

comment on function public.fn_carros_desativa_reservado_vendido() is
  'Forca em_estoque=false e participa_calculos=false quando estado_venda e reservado/vendido.';

drop trigger if exists trg_carros_desativa_reservado_vendido on public.carros;
create trigger trg_carros_desativa_reservado_vendido
  before insert or update on public.carros
  for each row
  execute function public.fn_carros_desativa_reservado_vendido();

-- Backfill: corrige veiculos ja reservados/vendidos que ainda estejam marcados.
update public.carros
   set em_estoque = false,
       participa_calculos = false
 where public.normalize_business_token(estado_venda) in ('reservado', 'vendido')
   and (em_estoque is distinct from false or participa_calculos is distinct from false);
