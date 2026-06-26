-- =====================================================================
-- RESERVA — STAGE 1 (expand, aditivo): desacopla a RESERVA (carro RESERVADO)
-- da venda CONCLUIDA (carro VENDIDO).
--
-- Hoje a venda nasce 'concluida' e o trigger marca o carro VENDIDO na hora.
-- A partir daqui existe o estado 'aberta' (venda em aberto = reserva): o
-- trigger reserva o carro nesse estado e so marca VENDIDO quando 'concluida'.
-- O pos-venda (estagio aberto/fechado/finalizado + 90 dias) ja existe e nao
-- muda aqui. INERTE para os dados atuais (nao ha vendas 'aberta' ainda); o
-- seller flow passa a inserir 'aberta' no Stage 3.
--
-- [skip-types] so muda CHECK/indice/funcao — nao altera o schema dos types.
-- =====================================================================

-- 1) Novo estado 'aberta' (mantem concluida/cancelada/obsoleta). O default
--    segue 'concluida' por ora; o Stage 3 insere 'aberta' explicitamente.
alter table public.vendas drop constraint if exists vendas_estado_venda_check;
alter table public.vendas add constraint vendas_estado_venda_check
  check (estado_venda in ('aberta', 'concluida', 'cancelada', 'obsoleta'));

-- 2) No maximo UMA reserva ('aberta') por carro.
create unique index if not exists ux_vendas_carro_aberta
  on public.vendas (carro_id)
  where estado_venda = 'aberta';

-- 3) Trigger: 'concluida' -> carro VENDIDO (mantido); 'aberta' -> carro
--    RESERVADO, apenas se o carro estiver disponivel/novo (nao sobrescreve
--    vendido/atencao).
create or replace function public.fn_vendas_cascade_carro_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado_venda = 'concluida' then
    update public.carros
       set estado_venda = 'VENDIDO'
     where id = new.carro_id
       and estado_venda is distinct from 'VENDIDO';
  elsif new.estado_venda = 'aberta' then
    update public.carros
       set estado_venda = 'RESERVADO'
     where id = new.carro_id
       and public.is_carro_disponivel_ou_novo(estado_venda);
  end if;
  return new;
end;
$$;

revoke all on function public.fn_vendas_cascade_carro_status() from public, anon, authenticated;

comment on column public.vendas.estado_venda is
  'aberta (reserva: carro RESERVADO), concluida (venda valida: carro VENDIDO), cancelada (revertida), obsoleta.';
