-- =====================================================================
-- Categoria dos documentos Word da venda (pedido do Kaic em 2026-11-09:
-- "classifique os documentos como 'Recibo de Venda', 'Termo de Entrega'").
--
-- Expand puro: duas colunas opcionais, nada é removido.
--   documento_templates.categoria -> "Novo documento" pede só a categoria e
--                                    cria a partir do template dela;
--   venda_documentos.categoria    -> checklist da venda (o que já foi gerado).
--
-- O catálogo (rótulos, quando cada documento entra, modelos embutidos) vive
-- em lib/domain/venda-documentos/categorias.ts — mantenha a lista do CHECK
-- igual à de lá.
-- =====================================================================

alter table public.documento_templates add column if not exists categoria text;
alter table public.venda_documentos add column if not exists categoria text;

alter table public.documento_templates drop constraint if exists documento_templates_categoria_check;
alter table public.documento_templates
  add constraint documento_templates_categoria_check check (
    categoria is null or categoria in (
      'recibo_venda', 'contrato_venda', 'termo_entrega', 'termo_garantia',
      'recibo_sinal', 'termo_troca', 'procuracao_transferencia', 'outro'
    )
  );

alter table public.venda_documentos drop constraint if exists venda_documentos_categoria_check;
alter table public.venda_documentos
  add constraint venda_documentos_categoria_check check (
    categoria is null or categoria in (
      'recibo_venda', 'contrato_venda', 'termo_entrega', 'termo_garantia',
      'recibo_sinal', 'termo_troca', 'procuracao_transferencia', 'outro'
    )
  );

comment on column public.documento_templates.categoria is
  'Categoria do documento da venda (recibo_venda, termo_entrega...). Catálogo: lib/domain/venda-documentos/categorias.ts';
comment on column public.venda_documentos.categoria is
  'Categoria do documento gerado (mesmo catálogo de documento_templates.categoria).';

-- O template que já existe ("Recibo de Venda (Financiado Com Entrada e IPVA
-- Pago)") passa a ser da categoria Recibo de Venda.
update public.documento_templates
   set categoria = 'recibo_venda'
 where categoria is null
   and titulo ilike 'recibo de venda%';
