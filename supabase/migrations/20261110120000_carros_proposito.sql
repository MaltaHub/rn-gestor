-- =====================================================================
-- Propósito do veículo (pedido do Kaic em 2026-11-10): o vendedor declara,
-- ao receber um carro na troca, se ele é para VENDA (vitrine) ou REPASSE.
--
--   carros.proposito  VENDA (padrão) | REPASSE
--
-- REPASSE fica fora da vitrine/catálogo (filtro no app) e dos cálculos de
-- preço/repetidos: participa_calculos = false, garantido aqui pelo banco
-- (mesmo padrão de fn_carros_desativa_reservado_vendido). Voltar para VENDA
-- reativa os cálculos, a não ser que o carro esteja reservado/vendido.
-- Expand puro: coluna nova com padrão; nada é removido.
-- =====================================================================

alter table public.carros add column if not exists proposito text not null default 'VENDA';

alter table public.carros drop constraint if exists carros_proposito_check;
alter table public.carros
  add constraint carros_proposito_check check (proposito in ('VENDA', 'REPASSE'));

comment on column public.carros.proposito is
  'VENDA (vai para a vitrine) ou REPASSE (fora da vitrine/catálogo e dos cálculos). Declarado no fluxo de venda para o carro da troca.';

create or replace function public.fn_carros_proposito_calculos()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.proposito = 'REPASSE' then
    new.participa_calculos := false;
  elsif tg_op = 'UPDATE'
    and old.proposito = 'REPASSE'
    and new.proposito = 'VENDA'
    and public.normalize_business_token(new.estado_venda) not in ('reservado', 'vendido') then
    new.participa_calculos := true;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_carros_proposito_calculos on public.carros;
create trigger trg_carros_proposito_calculos
  before insert or update of proposito, participa_calculos on public.carros
  for each row execute function public.fn_carros_proposito_calculos();
