-- Débitos COM VALOR (aprovado pelo Kaic em 2026-11-10: "um total por veículo"):
--   vendas.debitos_valor         -> total dos débitos do veículo VENDIDO (o texto
--                                   `vendas.debitos` continua dizendo o que é e quem paga);
--   venda_entradas.debitos       -> o que o veículo da TROCA deve (IPVA, multas, quitação...);
--   venda_entradas.debitos_valor -> o total desses débitos.
-- Só registro: NÃO abatem do valor da troca nem mexem no pagamento.

alter table public.vendas
  add column if not exists debitos_valor numeric(12, 2);

alter table public.vendas
  drop constraint if exists vendas_debitos_valor_check;
alter table public.vendas
  add constraint vendas_debitos_valor_check check (debitos_valor is null or debitos_valor >= 0);

alter table public.venda_entradas
  add column if not exists debitos text,
  add column if not exists debitos_valor numeric(12, 2);

alter table public.venda_entradas
  drop constraint if exists venda_entradas_debitos_valor_check;
alter table public.venda_entradas
  add constraint venda_entradas_debitos_valor_check check (debitos_valor is null or debitos_valor >= 0);

comment on column public.vendas.debitos_valor is 'Total dos débitos do veículo vendido (R$). O texto em `debitos` descreve o que é e quem paga.';
comment on column public.venda_entradas.debitos is 'Débitos do veículo recebido na troca (IPVA, multas, quitação...).';
comment on column public.venda_entradas.debitos_valor is 'Total dos débitos do veículo da troca (R$). Só registro: não abate do valor da troca.';
