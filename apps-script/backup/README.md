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
- Aba `CORE_BACKUP_LOG` (máx **500** linhas, FIFO): data/hora, origem, aba, op, pk, **valor anterior**.

## Deploy (manual — a CLI do Supabase/clasp não está no PATH)

1. No projeto Apps Script da planilha: cole `backup-monolith.gs` como **o** arquivo de backend e
   crie os arquivos HTML: `print-sidebar`, `import-sidebar`, **`grid-sidebar`**, **`sql-sidebar`** e
   **`styles`** (conteúdo dos `.html` de mesmo nome). O `styles` é o **design system compartilhado**
   (incluído por `<?!= include('styles') ?>` — por isso os sidebars agora são servidos via
   `createTemplateFromFile(...).evaluate()`). Remova outros
   `.gs` que definam `onOpen`/`doPost`/`doGet`/`jsonResponse_` (não pode haver funções duplicadas).
   O `doGet` agora serve o **Grid manual em tela cheia** (o `app.html` antigo pode ser apagado).
2. Script Properties → defina `WEBHOOK_TOKEN` = o mesmo valor de
   `internal.app_settings.token_appscript_supply` no Supabase.
3. Deploy → New deployment → **Web app** (Execute as: você; Who has access: qualquer um com link).
4. Menu **🚗 ERP Backup**: **🧱 Inicializar / Validar Abas de Backup** (cria as abas),
   **📥 Importar CSV (backup manual)** (carga inicial colando CSV) e
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

## Importer de CSV — carga inicial MANUAL (menu 📥)

A carga inicial dos dados **já existentes** é feita colando CSV, **não** mais por backfill via
trigger. O backfill automático (rota `/api/v1/backup/backfill` + RPCs `backup_plan`/`backup_chunk`/
`backup_backfill`/…) foi **removido** (migration `20260625165812_drop_backup_backfill_machinery`):
não escalava — empurrar dezenas de milhares de linhas pelo Apps Script estoura o limite de 6 min/
execução, a cota de `UrlFetch` e o throughput de escrita do Sheets.

**Fluxo:** no Supabase, exporte/copie a tabela em CSV → menu **📥 Importar CSV** → escolha a tabela,
cole o CSV, **Importar**. O Apps Script faz **upsert em lote por PK** numa única leitura + única
escrita (rápido, sem estourar quota). É **idempotente**: re-colar não duplica (casa pela PK); ordem
de tabelas e FKs não importam (é um espelho flat). O delimitador (vírgula / tab / ponto-e-vírgula) é
**auto-detectado**, então funciona tanto com "Export CSV" quanto com copiar células direto.

- **Requisito:** o CSV precisa trazer a(s) coluna(s) de **PK** da tabela (1ª linha = nomes das
  colunas). Linhas sem PK são puladas (contadas no resultado). Colunas novas → auto-grow do header.
- **Painel de controle** (aba `CORE_BACKUP_STATUS`): 1 linha por tabela com `linhas_na_aba`,
  `ultimo_import`, inseridas/atualizadas/puladas e origem. A própria sidebar mostra o que já tem
  backup, o que **falta** e quando foi feito.
- Funções server (públicas, sem `_`): `importContext` / `importCsv(tableKey, csvText, replace)`.

### Modo substituir (formata) — opcional, off por padrão
Checkbox **"Modo substituir (formata)"** na sidebar (`importCsv(..., replace=true)`): após o upsert,
**remove da aba as linhas cuja PK não está no CSV** → a aba vira espelho **exato** daquela tabela.
Use quando precisar refazer o backup do zero / limpar registros que foram deletados no banco. Pede
**confirmação** e tem **guarda anti-"apagou tudo"**: se o CSV não tiver nenhuma PK válida, aborta sem
mexer na aba. O retorno inclui `removed`. **Padrão (sem o checkbox) NUNCA apaga** — só adiciona/atualiza.

## Grid manual (CRUD + FKs) + backup REVERSO (Sheets → Supabase)

Além do backup (Supabase → Sheets), agora dá pra **alterar os dados na planilha** e **gerar o SQL**
que leva essas mudanças **de volta** pro Supabase. Toda alteração manual é **lastreada** numa aba
própria, **separada** do backup (`CORE_BACKUP_LOG` = backup; `CORE_MANUAL_CHANGES` = manual).

### 🧩 Grid manual (CRUD + FKs) — `grid-sidebar.html`
Um grid parecido com o do app, operando sobre a **aba ativa** (ou escolhe outra no seletor). **Onde
abrir:**
- **Menu 🚗 ERP Backup → 🧩 Grid manual** → modal (o maior que o Google permite).
- **Tela cheia (recomendado):** botão **⛶ Tela cheia** dentro do grid → abre o **web app** numa aba do
  navegador (`<deployment>/exec?page=grid`, servido pelo `doGet`). Aí a tela ocupa o navegador inteiro.

Recursos:
- **Pesquisar** (busca global em todas as colunas, no valor **exibido** — casa pelo rótulo da FK) e
  **filtrar por coluna** (input embaixo de cada cabeçalho). Filtram sobre **todas** as linhas, não só a
  página.
- **Ordenar** clicando no nome da coluna (asc → desc → sem ordenação).
- **Expande FKs** (toggle): mostra o rótulo (`modelo_id`→modelo, `carro_id`→placa) cruzando as outras
  abas; o id fica no tooltip. Colunas FK aparecem com 🔗.
- **Reordena colunas** arrastando o cabeçalho (salvo **por tabela** em DocumentProperties `gridorder::<tabela>`).
- **Paginação** (50/100/250/500 por página) — a busca/filtro atualizam o total.
- **Botão ＋ Registro** + ✏️ editar (PK travada) + 🗑️ excluir. FKs viram dropdown com os rótulos.
- **Cada** insert/update/delete daqui é gravado em `CORE_MANUAL_CHANGES` com `origem=grid`.

### Menu 📌 Ativar rastreio de edições diretas
Instala um gatilho **onEdit** (installable). A partir daí, **editar célula direto na aba** também vira
uma alteração rastreada (`origem=edicao_direta`). As escritas do **backup** (feitas pelo script) **não**
disparam onEdit → a separação backup × manual é automática. *(Exclusão de linha direto na aba **não** é
capturada pelo onEdit — use o 🗑️ do grid p/ deletes rastreados.)*

### Menu 🧾 Gerar SQL das alterações manuais — `sql-sidebar.html`
Lê `CORE_MANUAL_CHANGES` e gera o SQL **na força bruta**. **Net por PK** (a última operação vence):
- 3 deletes em CARROS → 3 `DELETE ... WHERE id = '…';`
- inserts/updates → `INSERT … ON CONFLICT (pk) DO UPDATE SET …;` (só as colunas preenchidas — vazias
  ficam de fora p/ o default/trigger do banco agir).
- Literais são **quotados** (`'…'`) e o Postgres casta o `unknown` p/ o tipo da coluna
  (`'123'`→int, `'true'`→bool, uuid, timestamptz, jsonb…). Envolto em `BEGIN; … COMMIT;`.
- Botão **Copiar** (cola no SQL Editor do Supabase) e **Marcar como incluídas** (não some com o
  histórico — só evita regerar). Colunas `array`/`jsonb` complexas podem precisar de ajuste manual.

Funções server (públicas, sem `_`): `gridContext` / `gridReadPage(table, {offset,limit,query,filters,
sortCol,sortDir})` / `gridFkOptions` / `gridSaveRecord` / `gridDeleteRecord` / `gridSaveColumnOrder` /
`getGridUrl` / `manualSqlContext` / `manualGenerateSql` / `manualMarkIncluded`. `doGet` serve o grid em
tela cheia (mesmo deployment do webhook; a config **"Quem tem acesso"** do deploy controla quem abre a
tela). Aba de lastro: `CORE_MANUAL_CHANGES` (`seq, ts, tabela, op, pk, dados_json, origem,
incluido_no_sql`). FKs em `backupFks_()`.

### UI/UX + performance
- **Design system compartilhado** (`styles.html`, incluído em todos os sidebars): tipografia de
  sistema, botões/inputs/toasts/spinner consistentes, app-bar escura, tabela com zebra/hover/sticky.
- **Grid:** toasts (no lugar da linha de status), overlay de carregamento, empty-state, atalhos de
  teclado (`/` foca a busca, `Esc` fecha o form, `Ctrl+Enter` salva, `F5` recarrega), form responsivo.
- **Cache de FK** (`CacheService`, TTL 120s, versão por tabela em `fkver::<tab>`): a expansão de FK
  não relê mais a aba de destino a cada página/busca; qualquer escrita (grid **ou** webhook do backup)
  invalida via `fkCacheInvalidate_` → nunca serve rótulo obsoleto.

## Ecossistema CORE_ — segurança, notificações e centralização no grid

**Abas de sistema com prefixo `CORE_`** (protegidas / não são backup de dados): `CORE_BACKUP_LOG`,
`CORE_MANUAL_CHANGES`, `CORE_BACKUP_STATUS`, `CORE_NOTIFICATIONS`. As abas legadas (`__X__`) são
**renomeadas automaticamente** p/ `CORE_` no menu **🧱 Inicializar** (preservando os dados —
`coreMigrateTabs_`). Helper `isCoreTab_()` protege essas abas (o onEdit-tracker as ignora). Convenção:
funções NOVAS do ecossistema nascem `core*`/`grid*`; as de backup seguem `backup*`.

**Notificações (`CORE_NOTIFICATIONS`) — "mudou o schema, mas não pode quebrar o backup!"** O ecossistema
avisa problemas em relação à sua atividade normal, sem quebrar o backup:
- **Webhook** recebe **tabela desconhecida** ou **coluna nova** (fora do registry) → o auto-grow evita
  quebrar, mas registra uma notificação "schema mudou: atualize o registry".
- Botão **🩺 Schema** (no grid) roda `coreCheckSchema()` — compara header de cada aba × registry.
- **UI:** um **🔔 sino com badge** (contador de abertas) na app-bar do grid, sempre visível; clicar abre
  o **histórico**. É **append-only**: o usuário só **marca como resolvido** (`coreNotifResolve`), nunca
  apaga. Funções: `coreNotifList` / `coreNotifResolve` / `coreCheckSchema`.

**Tudo centralizado no grid** (`grid-sidebar.html`): a app-bar em cima, o grid no meio (scroll próprio,
sem crescer o scroll da página) e um **rodapé fixo** embaixo com a paginação + **🧾 Gerar SQL**,
**📥 Importar CSV** e **🩺 Schema** — que abrem como **painéis (overlays) dentro do próprio grid**
(chamando `manualSqlContext`/`manualGenerateSql`/`manualMarkIncluded` e `importContext`/`importCsv`).
Não precisa mais sair do grid.

**FK: escolher o campo a expandir + filtro com opções.**
- Cada coluna FK tem um **seletor no cabeçalho** p/ escolher **qual coluna do destino** vira o rótulo
  (`gridSetFkLabel`, salvo por tabela/coluna em `fklabel::<tab>::<col>`; padrão em `backupFks_()`).
- Os **filtros por coluna** agora têm **datalist** (você digita **ou** escolhe de uma lista de valores
  existentes — `gridColumnValues`, cache versionado, carregado sob demanda no foco → leve).

## Back-end ALINHADO (feito)

O Postgres já espelha **34 tabelas** (todas menos `log_alteracoes`, por quota) via trigger genérica
`backup_row_webhook` → `{token, source, table, op, row}` por `pg_net` fire-and-forget (migration
`20260622124350`). O supply antigo de `carros` (flat → aba "Estoque") foi substituído — a aba de
impressão "Estoque" parou de auto-atualizar (vira mapeador à parte se precisar).

> ⚠️ **Fan-out em DML de massa:** a contenção dispara **1 POST por linha**. Operações normais (1
> registro) são tranquilas, mas um `update`/import em massa bombardeia o Apps Script e estoura cota —
> nesse caso desabilite a trigger `trg_backup_row_webhook` temporariamente e use o Importer de CSV.

### Ainda opcional
- **Reconciliação** periódica (`pg_cron`): compara contagens/linhas e reenvia divergências (o
  "confirmou o backup?" de verdade).
