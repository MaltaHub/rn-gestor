-- Formato fixo do codigo_nota_fiscal (pedido do Kaic, 2026-11-07): sempre como
-- O21_1_2026_5890 — letra + dígitos _ dígitos _ ano (4) _ dígitos, caixa alta.
-- Substitui a regra só de caixa alta (o formato já a inclui). Coluna ainda vazia.
alter table public.carros
  drop constraint if exists carros_codigo_nota_fiscal_caixa_alta;

alter table public.carros
  drop constraint if exists carros_codigo_nota_fiscal_formato;

alter table public.carros
  add constraint carros_codigo_nota_fiscal_formato
  check (codigo_nota_fiscal is null or codigo_nota_fiscal ~ '^[A-Z][0-9]+_[0-9]+_[0-9]{4}_[0-9]+$');
