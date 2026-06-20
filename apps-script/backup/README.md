# Backup de contenção — Apps Script (monólito)

Espelho vivo do Postgres (Supabase) numa Google Spreadsheet: **1 aba por tabela**.
O back-end (trigger Postgres) garante o espelhamento de toda manipulação de dados;
[`backup-monolith.gs`](backup-monolith.gs) tem **toda** a lógica de suporte/processamento
(sem imports — é um arquivo único, o backend `.gs` do projeto da planilha).

## Layout padrão (por aba)

| Linha | Conteúdo |
|---|---|
| 1 | título (`📦 <tabela> · PK · sync`) |
| 2 | header (nomes das colunas) — **congelada** |
| 3+ | dados |

## Contrato do payload (o back-end envia isto via POST JSON p/ o `/exec`)

```jsonc
{
  "token": "<igual à Script Property WEBHOOK_TOKEN>",
  "source": "supabase-trigger",        // opcional (auditoria; GAS não expõe IP)

  // uma operação:
  "table": "carros",
  "op": "upsert",                       // "upsert" | "delete"
  "row": { "id": "...", "placa": "...", "...": "..." },

  // OU um lote:
  "ops": [ { "table": "...", "op": "...", "row": { ... } } ]
}
```

- **`op: "upsert"`** — casa pela PK do registry; atualiza no lugar (MERGE: só as
  colunas presentes no `row`) ou insere ao fim. `row` deve trazer a linha completa (NEW).
- **`op: "delete"`** — casa pela PK e remove **só** aquela linha. Basta a PK no `row`.
- **`row` precisa conter a PK** — sem PK, nada é escrito (`BACKUP_MISSING_PK`).

## PK por tabela

Cada tabela casa pela **PK real do banco** (registry em `backupRegistry_()`). Inclui PKs
compostas (`lookups`=(domain,code), `carro_caracteristicas_*`=(carro_id,caracteristica_id),
`documentos`=carro_id, `editor_user_variables`=(user_id,name)…).

> **`carros` usa `id` (não `placa`).** Decisão deliberada: a PK do espelho precisa ser
> **imutável**; placa muda (correção / conversão Mercosul) e era justamente isso que obrigava
> o código antigo a fazer *fuzzy-match* de variantes de placa. Com `id`, upsert/delete são
> exatos. `placa` continua como coluna normal. Para reverter, troque a PK de `carros` no
> registry para `placa` (uma linha).

## Segurança / estabilidade

- Token obrigatório (Script Property `WEBHOOK_TOKEN`/`ERP_WEBHOOK_TOKEN`).
- `LockService` serializa todas as escritas.
- Whitelist de tabelas (registry) — tabela desconhecida é rejeitada.
- Mapeamento **sempre por nome de coluna** (nunca por posição) + **auto-grow** do header:
  coluna nova do schema não some; ordem divergente não corrompe.
- Update faz **MERGE** — nunca zera coluna que não veio no payload.
- **Nunca** limpa/replace a aba inteira (a causa antiga de "apagou tudo" foi removida).
- Aba `__LOG__` (máx **500** linhas, FIFO): data/hora, origem, aba, op, pk, **valor anterior**.

## Deploy (manual — a CLI do Supabase/clasp não está no PATH)

1. No projeto Apps Script da planilha, cole `backup-monolith.gs` como **o** arquivo de backend.
   Remova outros `.gs` que definam `onOpen`/`doGet`/`doPost`/`include`/`jsonResponse_`
   (o Apps Script não permite funções duplicadas). `doGet` espera um `app.html` — mantenha-o
   ou remova `doGet` se a planilha não serve a UI.
2. Script Properties → defina `WEBHOOK_TOKEN` = o mesmo valor de
   `internal.app_settings.token_appscript_supply` no Supabase.
3. Deploy → New deployment → **Web app** (Execute as: você; Who has access: qualquer um com link).
4. Rode o menu **🚗 ERP Backup → 🧱 Inicializar / Validar Abas de Backup** (cria as abas).
5. No Supabase, `internal.app_settings.url_appscript_supply` = a URL `/exec` do deployment.

## Falta no back-end (próxima etapa, a alinhar junto)

Hoje o Postgres só dispara para `carros` (trigger `supply_carros_webhook`, já **async**
fire-and-forget — migration `20260620140341`) no **formato antigo** (flat estoque, sem `table`).
Para o backup completo, o back-end precisa:

1. **Uma trigger genérica** anexada às tabelas do registry (AFTER INSERT/UPDATE/DELETE) que
   monta `{token, source, table, op, row}` (`row` = `to_jsonb(NEW)`/`to_jsonb(OLD)`) e dispara
   via `pg_net` **fire-and-forget** (sem polling — vide a migration de carros como base).
2. **Reconciliação** periódica (`pg_cron`) que compara contagens/linhas e reenvia divergências
   — é o "confirmou o backup?" de verdade (substitui o flag morto `os_supply_appscript_check`).
3. **Backfill inicial** paginado/resumável dos dados já existentes (respeitando o timeout do
   Apps Script — lotes pequenos via `ops[]`).

> A aba/planilha **"Estoque"** (view de impressão, 9 colunas, keyed por placa) é **outra coisa**
> — não é o backup. Se ela precisar continuar sendo atualizada, é um mapeador à parte.
