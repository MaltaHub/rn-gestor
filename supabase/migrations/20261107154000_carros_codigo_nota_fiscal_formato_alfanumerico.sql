-- Ajuste do formato do codigo_nota_fiscal (Kaic, 2026-11-07): o 1º trecho
-- (antes do 1º "_") é ALFANUMÉRICO, não só letra + dígitos. Ex.: O21_1_2026_5890.
-- Coluna ainda vazia: troca a constraint sem tocar em dados.
alter table public.carros
  drop constraint if exists carros_codigo_nota_fiscal_formato;

alter table public.carros
  add constraint carros_codigo_nota_fiscal_formato
  check (codigo_nota_fiscal is null or codigo_nota_fiscal ~ '^[A-Z0-9]+_[0-9]+_[0-9]{4}_[0-9]+$');
