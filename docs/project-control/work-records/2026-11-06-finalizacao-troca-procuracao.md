# 2026-11-06 — Finalização (90 dias), troca, PROCURAÇÃO, contato e colunas de qualquer tabela

## Pedidos
- Estado PROCURAÇÃO na situação do CRLV; campo contato no fornecedor (remetentes).
- Colunas estrangeiras de QUALQUER tabela (não só pela FK do grid), em qualquer grid.
- Botões no form do grid para ir direto ao documento (CRLV, Perícia…).
- Veículo de troca apontando para o seu ponto de entrada (a venda).
- Finalizados acessível; veículo apagado 90 dias após a venda com snapshot (valores, comprador,
  fornecedor); ponteiros antigos passam para o snapshot; documentos mantidos 5 anos.
- Consertar as falhas dos testes.

Proposta T/F/R aprovada pelo Kaic: R1 (base = carros.data_venda, preenchida à mão ou pelo fluxo de
venda; sem data = listar), R2 (fotos apagadas), R3 (Finalizados só GERENTE+), F1 (campos ok).

## O que mudou
- `20261106120000_crlv_procuracao_remetente_contato.sql`: estado PROCURACAO (ordem BRANCO <
  PROCURAÇÃO < VIRADO; arquivo "Procuração" marca PROCURACAO), `remetentes.contato`; os 10 veículos que
  eram PROCURAÇÃO antes de 2026-11-05 voltaram a PROCURACAO (snapshot).
- `20261106140000_finalizacao_e_troca.sql`: trigger da venda preenche `carros.data_venda` (+ backfill
  pela venda concluída); `documentos.origem_venda_id/origem_finalizado_id`,
  `venda_entradas.carro_troca_finalizado_id`; `finalizados` com snapshot completo; `fn_finalizar_veiculo`;
  token/chave em `internal.app_settings`; `pg_cron` de hora em hora chamando a rota interna.
  **Começa DESLIGADA** (`finalizacao_ativa = 'false'`): só relatório.
- `20261106150000_troca_ponto_de_entrada.sql`: trigger em `venda_entradas` grava/limpa o ponto de entrada.
- App: `lib/domain/finalizacao/service.ts` + `POST /api/v1/internal/finalizacao`; inconsistência
  "Vendido sem data de venda"; Finalizados GERENTE+ com os campos novos.
- Grid: colunas de qualquer tabela (caminho pelas FKs nos dois sentidos, agregação último/primeiro/
  lista/quantidade e filtro opcional) — `core/foreign-columns.ts`, `foreign-column-dialog.tsx`;
  botões de documento no form (`form-vehicle-documents.tsx`).
- Testes e2e de impressão reescritos para o print-composer; teste do botão global de impressão
  removido (função removida de propósito em 6c152ba).

## Verificação
- Testes de banco em transação revertida: finalização (snapshot, ponteiros, pasta arquivada) e
  trigger da troca (grava e limpa o ponto de entrada).
- vitest completo, tsc, eslint.
- E2E NÃO rodado nesta etapa: o Claude Code encerrou o servidor de desenvolvimento por falta de
  memória e pediu para não reiniciá-lo sem autorização. Pendentes de rodar: ui-grid (impressão
  reescrita, inserção em massa, colunas de qualquer tabela).

## Pendente
- Ligar a finalização (`update internal.app_settings set value = 'true' where key = 'finalizacao_ativa'`)
  depois que o Kaic conferir o relatório.
- Diagnosticar os 2 e2e de inserção em massa (precisam rodar).
- Deploy manual do .gs do backup (registry atualizado).
