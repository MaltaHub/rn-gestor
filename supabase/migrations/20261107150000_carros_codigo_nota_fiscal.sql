-- Código da nota fiscal de entrada do veículo (pedido explícito do Kaic,
-- 2026-11-07). O OCR confere o código lido na nota com este campo (trava do
-- template "nota fiscal de entrada"). Só expande: coluna nova, opcional.
alter table public.carros add column if not exists codigo_nota_fiscal text;

comment on column public.carros.codigo_nota_fiscal is
  'Código da nota fiscal de entrada do veículo; o OCR confere o código lido na nota com este valor.';
