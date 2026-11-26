# 2026-11-26 — Backup de contenção: fila com confirmação e validação em rotina

**Estado:** código commitado e testado localmente. **Nada aplicado em produção** (a migration
aguarda a aprovação dos campos; o Apps Script é publicado à mão).

## Problemas encontrados
- **Corrupção no espelho:** `setValues` sem forçar texto. No banco hoje há 77 RENAVAMs com zero à
  esquerda em `carros`, 18 em `finalizados`, números de NF-e, CPF/CNPJ, chaves de 44 dígitos e uma
  placa que o Sheets leria como fórmula. A planilha real não foi inspecionada: o efeito vem do
  comportamento do Sheets, e a primeira validação mostra a extensão.
- **Sem garantia de entrega:** 1 POST por linha, fire-and-forget, sem reenvio nem ordem.
- **`arquivo_automacao_regras` e `ocr_templates`** nunca entraram no espelho.
- **Grid web sem autenticação:** o deployment é público (webhook) e o `doGet` servia o grid, com
  leitura e escrita de todo o espelho, a quem tivesse a URL.
- Célula acima de 50.000 caracteres faria a gravação falhar (maior hoje: ~10,5 mil).
- O script relia a aba inteira e escrevia o log a cada operação.

## O que mudou
- `20261126120000_backup_fila_validacao.sql`: `internal.backup_fila`, `internal.backup_validacoes`,
  funções `internal.backup_*`, `backup_row_webhook` passa a enfileirar, 2 triggers novas, 2 jobs cron.
- `backup-monolith.gs`: lote por tabela, texto literal, `CORE_OVERFLOW`, ação `verify`,
  `CORE_VALIDATION`, `doGet` protegido. `grid-sidebar.html`: URL de tela cheia vem pronta.
- Testes: `apps-script/backup/__tests__/` (inclui guarda registry × `database.types.ts`).

## Campos novos (aguardando aprovação — CLAUDE.md, regra 8)
`internal.backup_fila`: tabela, chave, pk, enfileirado_em, proximo_envio_em, tentativas,
request_id, enviado_em, ultimo_erro.
`internal.backup_validacoes`: id, tabela, status, permitir_exclusoes, agendada_em, request_id,
enviado_em, concluido_em, linhas_banco, linhas_planilha, faltando, diferentes, sobrando,
reenfileirados, detalhe.
Nenhuma tabela do `public` muda; os types não mudam (`[skip-types]` no commit).

## Como foi testado
- Ponta a ponta fora do repo: a migration real num Postgres em memória (PGlite, com `net` e `cron`
  simulados) conversando com o `.gs` real sobre um Sheets simulado — 13 cenários.
- 11 testes unitários, `tsc`, lint e `check-secrets`.
- Banco real, só leitura: Postgres 17.6, pg_net 0.20 (`http_post(url, body, params, headers,
  timeout_milliseconds)`), pg_cron 1.6 (`schedule(job_name, schedule, command)`), nenhuma coluna
  com `domain` (a leitura por PK com `jsonb_populate_record` é segura), nada em `internal.backup_*`
  e sem branching/integração do GitHub (push não aplica migration).
- O backup atual entrega: nas 6 h que o `pg_net` guarda, 36 respostas `ok` do script e 5 timeouts
  de 20 s, que o banco nunca soube se foram gravados.
- **Não testado:** Google Sheets real, `pg_net`/`pg_cron` executando a migration nova e o `doGet`
  publicado.

## Publicar (nesta ordem)
1. Apps Script: colar `backup-monolith.gs` e `grid-sidebar.html`; **nova versão** do mesmo
   deployment (a URL não muda). O script novo aceita o banco antigo.
2. Aprovar os campos e aplicar a migration (token `SUPABASE_PROJECT_ACCESS_TOKEN`, já renovado),
   registrando a versão em `supabase_migrations.schema_migrations` como as anteriores.
3. `select internal.backup_validar();` e, após ~30 min, `select * from internal.backup_status();`.

## Riscos e rollback
- Latência passa de "imediata" para até ~1 min.
- Texto literal por apóstrofo é comportamento do Sheets reproduzido no simulador; se o Sheets real
  divergir, a validação acusa as mesmas linhas repetidamente.
- A primeira validação pode ficar `BLOQUEADA` em tabelas com muitas linhas antigas sobrando na
  planilha: conferir e liberar por tabela.
- Exclusão em massa normal continua sendo espelhada (o bloqueio vale só para a validação).
- Rollback: reaplicar `backup_row_webhook` da migration `20260622124350`, `cron.unschedule` dos jobs
  `rn-gestor-backup-%` e remover as 2 triggers novas. `dispatch_backup_payload` foi mantida.

## Pendente
- Remover `public.dispatch_backup_payload` (contract) e a coluna vestigial
  `carros.os_supply_appscript_check`.
- Arquivos do Storage seguem sem cópia.
- Alerta ativo (e-mail/tela) quando `backup_status()` tiver problema.
