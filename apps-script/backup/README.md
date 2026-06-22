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

1. No projeto Apps Script da planilha: cole `backup-monolith.gs` como **o** arquivo de backend e
   crie um arquivo HTML chamado `print-sidebar` (conteúdo de `print-sidebar.html`). Remova outros
   `.gs` que definam `onOpen`/`doPost`/`jsonResponse_` (não pode haver funções duplicadas). O
   "Abrir Sistema (tela cheia)" foi removido — não há mais `doGet`/`include`/`app.html` (o `app.html`
   pode ser apagado do projeto).
2. Script Properties → defina `WEBHOOK_TOKEN` = o mesmo valor de
   `internal.app_settings.token_appscript_supply` no Supabase.
3. Deploy → New deployment → **Web app** (Execute as: você; Who has access: qualquer um com link).
4. Menu **🚗 ERP Backup**: **🧱 Inicializar / Validar Abas de Backup** (cria as abas) e
   **🖨️ Barra de Impressão** (sidebar de impressão por aba).
5. No Supabase, `internal.app_settings.url_appscript_supply` = a URL `/exec` do deployment.

## Sidebar de impressão (substitui o "Abrir Sistema")

Menu **🖨️ Barra de Impressão** → sidebar (`print-sidebar.html`) que copia o sistema de impressão do
projeto, operando sobre a **aba ativa** (header linha 2, dados linha 3+): seleção de colunas + ordem,
filtros por valor, ordenação, título e **expansão de FK** (botão ⮕ por coluna — resolve id/código
para o nome legível cruzando as outras abas; ex.: `modelo_id`→modelo, `carro_id`→placa, lookups→name).
"Imprimir" abre um modal com o layout + o diálogo de impressão
do navegador (`window.print()`). A última config é memorizada **por aba** (DocumentProperties, chave
`printcfg::<aba>`). Funções server: `printContext`/`printColumnValues`/`printRun`/`printSaveConfig`
(públicas, sem `_`, para `google.script.run`). Fora do v1 (extensível): seções, highlights
condicionais, labels/overrides, anchor-filter, templates nomeados.

## Back-end ALINHADO (feito)

O Postgres já espelha **34 tabelas** (todas menos `log_alteracoes`, por quota) via trigger genérica
`backup_row_webhook` → `{token, source, table, op, row}` por `pg_net` fire-and-forget (migration
`20260622124350`). O supply antigo de `carros` (flat → aba "Estoque") foi substituído — a aba de
impressão "Estoque" parou de auto-atualizar (vira mapeador à parte se precisar).

### Ainda opcional
- **Reconciliação** periódica (`pg_cron`): compara contagens/linhas e reenvia divergências (o
  "confirmou o backup?" de verdade).
- **Backfill inicial** paginado dos dados já existentes (lotes pequenos via `ops[]`).
