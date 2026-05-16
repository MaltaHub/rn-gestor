-- Afrouxa obrigatoriedade do registro de venda e adiciona estado 'obsoleta'.
--
-- Mudancas:
-- - valor_total: vira nullable (operador pode registrar venda sem preco e
--   preencher depois).
-- - comprador_nome: vira nullable (venda anonima/cadastro de comprador
--   incremental).
-- - estado_venda: aceita 'obsoleta' alem de 'concluida'/'cancelada'.
--
-- Semantica dos estados:
--   concluida (default): venda valida e contabilizada; ocupa o slot do
--     unique partial index, encadeia carros.estado_venda='VENDIDO'.
--   cancelada: venda desfeita (erro/cliente desistiu). NAO ocupa o slot,
--     nao surte efeito na logica. Operador decide se reverte estado do
--     carro manualmente.
--   obsoleta: venda DE FATO aconteceu mas o carro voltou para a loja e
--     pode ser vendido de novo. Preserva historico, nao ocupa o slot,
--     nao surte efeito na logica. Distinta de cancelada porque o
--     comprador efetivamente comprou em algum momento.
--
-- O partial unique index (where estado_venda='concluida') ja restringe
-- corretamente, entao obsoleta libera o slot para nova venda.

alter table public.vendas
  alter column valor_total drop not null,
  alter column comprador_nome drop not null;

alter table public.vendas
  drop constraint if exists vendas_estado_venda_check;

alter table public.vendas
  add constraint vendas_estado_venda_check
    check (estado_venda in ('concluida', 'cancelada', 'obsoleta'));

comment on column public.vendas.valor_total is 'Valor total da venda (opcional). NULL = preenche depois.';
comment on column public.vendas.comprador_nome is 'Nome do comprador (opcional). NULL = cadastro depois.';
comment on column public.vendas.estado_venda is 'concluida (venda valida, ocupa slot) | cancelada (desfeita, sem efeito) | obsoleta (carro retornou a loja, historico mantido).';
