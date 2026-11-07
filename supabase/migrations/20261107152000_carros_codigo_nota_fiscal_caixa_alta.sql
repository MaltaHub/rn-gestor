-- codigo_nota_fiscal é sempre CAIXA ALTA e sem espaços nas pontas (pedido do
-- Kaic, 2026-11-07). O app já normaliza ao gravar; a regra garante no banco.
-- Coluna nova e vazia: a constraint entra validada sem tocar em dados.
alter table public.carros
  drop constraint if exists carros_codigo_nota_fiscal_caixa_alta;

alter table public.carros
  add constraint carros_codigo_nota_fiscal_caixa_alta
  check (codigo_nota_fiscal is null or codigo_nota_fiscal = upper(btrim(codigo_nota_fiscal)));
