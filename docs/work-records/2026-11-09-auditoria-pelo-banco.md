# 2026-11-09 — Auditoria pelo banco (trigger), autor SISTEMA e retenção

## Pedido
"Vamos refatorar a auditoria? Tem muita limitação, e o design está engessado! Parece que não registra
tudo, porque eu inseri uma CRLV, mas só registrou o update_at de toda a automação!" — verificar o que
tem/não tem/precisa/não precisa de auditoria e definir a regra "no máximo 30 dias ou 5 mil linhas para
cada tabela auditada". Durante o trabalho: "A auditagem precisa identificar com o autor SISTEMA quando for
alteração automática!" e confirmou 5 mil **por tabela** (a dúvida era se pesaria: não pesa — 452
alterações em 30 dias, ~1 KB cada).

## Diagnóstico
- A auditoria era gravada **pelo app** (`writeAuditLog`, ~55 chamadas): tudo que o banco faz sozinho
  (classificar o CRLV → `documentos`, envelopes, cascatas, finalização, cron) não aparecia.
- O log guardava a linha inteira antes/depois. O OCR regravava o titular com o mesmo valor, então a
  única diferença era `updated_at` — o "só registrou o update_at".
- A tela listava cada campo de um INSERT como uma linha, sem placa, sem agrupar a ação.

## O que mudou
- Banco: `20261109150000_auditoria_pelo_banco.sql`
  - `fn_auditoria_registrar` (trigger `trg_00_auditoria`, AFTER, por linha) em 34 tabelas +
    `internal.app_settings` só para `finalizacao_ativa`. UPDATE guarda só os campos alterados; se só
    mudou carimbo (`updated_at`, `ultima_alteracao`, `updated_by…`, e por tabela `ultimo_login`,
    `entity_snapshot`, `os_supply_appscript_check`), não registra. Colunas grandes (`conteudo`,
    `exemplo_ocr`, `snapshot`) entram como "conteúdo alterado".
  - Autor: cabeçalhos `x-rn-ator-id/nome`, `x-rn-detalhe` (base64), `x-rn-requisicao`, `x-rn-lote`,
    lidos de `request.headers` — só quando o papel não é anon/authenticated (o cliente do navegador
    não consegue se passar por alguém). `pg_trigger_depth() > 1` (outra trigger, cascata de FK) ou sem
    usuário (cron/SQL) = **SISTEMA**, com "Automático: efeito da ação de <usuário> — <motivo>".
  - `lote_id` = id da requisição (ou `tx:<txid>`): junta a ação e os efeitos.
  - Veículo (`carro_id` + placa) em `__veiculo` nos dados (para filtrar por placa); arquivos/pastas
    sobem a árvore até a pasta automática do carro.
  - Retenção `fn_auditoria_retencao` (pg_cron `rn-gestor-auditoria-retencao`, minuto 17 de cada hora):
    por tabela, apaga > 30 dias e o que passa das 5.000 linhas mais novas.
  - Sem campo novo em `log_alteracoes` (só default `autor = 'SISTEMA'` e índices `(tabela, data_hora)`
    e `(lote_id)`).
- App:
  - `lib/api/audit-context.ts`: AsyncLocalStorage por requisição (aberto em `executeApi`; autor em
    `executeAuthenticatedApi`) + `auditAwareFetch` no `getSupabaseAdmin` → toda chamada leva os
    cabeçalhos. `describeAudit(motivo, { batch })` antes de gravar.
  - `lib/api/audit.ts` (writeAuditLog) apagado; leituras "oldData" que só serviam ao log saíram.
  - API: `GET /api/v1/auditoria` (cursor por `data_hora,id`; filtros tabela/acao/origem/autor/q/de/ate/
    lote/pk com allow-list; `meta=1`). `auditoria/dashboard` apagado.
  - Domínio: `lib/domain/auditoria/{tables,changes,service}.ts` (diff puro, nomes dos ids de FK).
  - Tela: `components/audit/audit-explorer.tsx` — linha do tempo por dia, ação + efeitos SISTEMA no
    mesmo cartão, placa clicável, histórico do registro, filtros numa linha, endereço compartilhável.
    CSS antigo `.audit-*` saiu do `globals.css`.

## Tabelas
- Auditadas: carros, documentos, vendas, venda_entradas, venda_documentos, anuncios,
  anuncios_insight_verifications, observacoes, controle_envelopes, modelos, remetentes,
  responsaveis_virado, notas_fiscais, pericias, carro_caracteristicas_(visuais|tecnicas),
  caracteristicas_(visuais|tecnicas), finalizados, arquivos_arquivos, arquivos_pastas,
  arquivo_automacao_(folders|config|regras), ocr_templates, documento_templates, usuarios_acesso, lookups,
  lookup_* (6), internal.app_settings (só `finalizacao_ativa`).
- Não auditadas: log_alteracoes, client_errors, price_change_contexts (já é log), repetidos e
  grupos_repetidos (recalculadas: ruído), print_templates (pessoal), lookup_audit_actions,
  demais chaves de internal.app_settings (segredos).

## Verificação
- Simulação em transação desfeita com dados reais (TDV2E99): carimbo sozinho não registra; mudança do
  Kaic = só `observacao`; upload de CRLV = arquivo (Kaic) + `documentos` AGUARDANDO→BRANCO (SISTEMA,
  mesmo lote); anon com cabeçalho falso = SISTEMA; sem cabeçalho = SISTEMA. Retenção: 6.163 de 6.609.
- Função temporária via REST com a chave secreta: cabeçalhos chegam, papel `service_role`, UTF-8 ok.
- Unitários (`changes.test.ts`, `route.test.ts`), suíte toda; e2e `tests/e2e/auditoria.spec.ts` no CI.

## Riscos e rollback
- A trigger nunca derruba a gravação (`exception when others` → `raise warning`).
- Linhas apagadas pela retenção: exportadas antes em JSON (fora do git).
- Rollback: `drop trigger trg_00_auditoria` nas tabelas + `cron.unschedule('rn-gestor-auditoria-retencao')`;
  o app antigo está no git (`lib/api/audit.ts`).
- Tabela nova não entra sozinha: precisa da trigger (migration) e de `tables.ts`.
