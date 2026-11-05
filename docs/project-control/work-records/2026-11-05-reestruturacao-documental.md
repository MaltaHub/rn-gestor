# 2026-11-05 — Reestruturação documental (etapa 1: expand)

## Pedido
Consolidar schema e processo documental/administrativo: campo CRV, tabela de notas fiscais,
processo em torno de nota de entrada, nota de saída, CRLV BRANCO e CRLV VIRADO; remover os
estados redundantes. Proposta campo a campo aprovada pelo Kaic antes de aplicar (decisões D1–D9).

## Decisões aprovadas
- D1: nomes em `responsavel_virado` = titular do CRLV virado ⇒ 155 linhas viraram VIRADO;
  PROCURAÇÃO (10) e BRANCO (5) ⇒ BRANCO.
- D2: NÃO CHEGOU (11) ⇒ AGUARDANDO.
- D3: perícia = tabela própria (arquivo, autorizada, data, hodômetro, status, observação).
- D4: `proposito` sai. D5: CRV número + código de segurança. D6: notas sem contraparte
  (comprador em vendas, fornecedor em `remetente_id`). D7: nenhum "outro documento" sai.
- D8: envelope perde PRESENTE/PROBLEMA. D9: "Remetentes" exibido como "Fornecedores".

## O que mudou
- Migration `20261105120000_reestruturacao_documental_expand.sql` (aplicada no remoto e
  registrada em `schema_migrations` com a mesma versão): `carros.crv`/`crv_codigo_seguranca`,
  `notas_fiscais`, `pericias`, lookups, migração de dados, trigger `fn_documentos_normaliza_crlv`,
  parser/reparse novos, 21 arquivos renomeados para o token curto, template "CRLV LOJA" → `crlv_virado`.
- Snapshot local antes de aplicar (documentos, arquivos, templates, lookups) — fora do repo.
- Grid: Documentos enxuto (compra + CRLV + envelope), abas NOTAS FISCAIS e PERICIAS, FORNECEDORES.
- Insight "PRONTO sem responsável" ⇒ "PRONTO com CRLV aguardando" (`CRLV_AGUARDANDO`).
- Arquivos: catálogo novo (12 tipos), dica do que cada tipo registra, inconsistências de notas.
- OCR: link "arquivo" (grava no registro do arquivo enviado), destinos CRV/chave/status;
  upload devolve `fileId` e o OCR grava depois do upload.
- Backup Apps Script: registry com colunas/tabelas novas (falta deploy manual do .gs).
- Docs: `docs/processo-documental.md`, AGENTS.md gotcha #11.

## Etapa 2: contract — APLICADA depois do deploy de d0145c6 (Vercel success + CI verde)
`20261105140000_reestruturacao_documental_contract.sql`: dropou de `documentos`: nota_entrada, nota_saida, recibo_compra, tipo_de_processo, proposito,
chave_reserva, pericia (+ colunas `*_domain` e FKs); remover domínios de lookups
(estados_recibo_compra, tipos_processo, propositos, estados_chave_reserva, estados_pericia) e os
valores inativos; registry do backup atualizado. Tokens antigos seguem aceitos no parser/cliente
(inofensivo; os 21 arquivos ja foram renomeados).

## Verificação
- Teste de triggers em transação revertida (RAISE no fim): estados, titular, notas/perícia por arquivo.
- vitest (636), tsc, eslint dos arquivos tocados, e2e `files.spec.ts` (13).
- Grid real em dev (só leitura): Documentos com situação/titular, abas novas.
