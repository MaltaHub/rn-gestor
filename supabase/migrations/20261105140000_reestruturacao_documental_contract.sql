-- Reestruturacao documental — ETAPA 2 (contract). Aplicar SO depois do deploy
-- do codigo da etapa 1 (d0145c6): o app nao le mais estas colunas.
--
-- Sai de documentos o que a etapa 1 substituiu ou o Kaic aprovou remover:
--   nota_entrada / nota_saida  -> tabela notas_fiscais
--   pericia                    -> tabela pericias
--   recibo_compra              -> a nota de entrada cobre
--   tipo_de_processo           -> situacao do CRLV (BRANCO = procuracao/em branco)
--   proposito                  -> nao usado (sem repasse)
--   chave_reserva              -> carros.tem_chave_r + controle_envelopes
-- As FKs compostas para lookups e os checks *_domain caem junto com as colunas.

alter table public.documentos
  drop column if exists nota_entrada,
  drop column if exists nota_saida,
  drop column if exists recibo_compra,
  drop column if exists recibo_compra_domain,
  drop column if exists tipo_de_processo,
  drop column if exists tipo_de_processo_domain,
  drop column if exists proposito,
  drop column if exists proposito_domain,
  drop column if exists chave_reserva,
  drop column if exists chave_reserva_domain,
  drop column if exists pericia,
  drop column if exists pericia_domain;

-- Dominios que ficaram sem coluna e valores aposentados na etapa 1.
-- (FK on delete restrict: se algo ainda referenciasse, a migration falharia.)
delete from public.lookups
 where domain in ('estados_recibo_compra', 'tipos_processo', 'propositos', 'estados_chave_reserva', 'estados_pericia');

delete from public.lookups
 where (domain = 'estados_transferencia' and code in ('EM_ANDAMENTO', 'CONCLUIDA', 'PROBLEMA'))
    or (domain = 'estados_envelope' and code in ('PRESENTE', 'PROBLEMA'));
