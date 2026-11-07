-- codigo_nota_fiscal é ÚNICO entre os veículos (pedido do Kaic, 2026-11-07).
-- Compara sem espaços nas pontas e sem diferença de maiúsculas; vazio não conta.
-- A coluna nasceu vazia na migration anterior: o índice entra sem conflito.
create unique index if not exists carros_codigo_nota_fiscal_key
  on public.carros ((upper(btrim(codigo_nota_fiscal))))
  where nullif(btrim(codigo_nota_fiscal), '') is not null;
