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

## Como o dado chega (fila → lote → confirmação)

1. A trigger `trg_backup_row_webhook` só marca a **chave** como suja em `internal.backup_fila`
   (10 alterações na mesma linha = 1 item; update sem mudança não entra).
2. `internal.backup_despachar()` (pg_cron, 1/min) lê a linha **atual** e envia um lote de até 200
   operações (~1 MB). Linha existe → `upsert`; sumiu → `delete`. Um lote por vez.
3. O item só sai da fila com o `ok` do Apps Script. Sem resposta em 3 min ou com erro, é reenviado
   com espera crescente (1, 2, 4… 64 min). Após 3 falhas vai sozinho, sem travar os outros.
4. Linha alterada enquanto o lote está em voo volta para a fila (a confirmação antiga não a apaga).

```jsonc
// aplicar
{ "token": "…", "ops": [ { "table": "carros", "key": "<pk>", "op": "upsert", "row": { } } ] }
// → { "ok": true, "results": [ { "ok": true, "table": "carros", "key": "<pk>" } ] }

// validar
{ "token": "…", "action": "verify", "table": "carros", "pk": ["id"], "cols": ["id", "…"],
  "rows": [ ["<pk>", "<md5>"], ["<pk a caminho>", "*"] ] }
// → { "ok": true, "action": "verify", "sheetRows": 142, "missing": [], "different": [], "orphan": [], "manual": 0 }
```

## Validação em rotina

O banco manda `(chave, md5)` de cada linha; o Apps Script recalcula o md5 **a partir das células**
e responde o que **falta**, **difere** ou **sobra**. O que divergiu volta para a fila e se repara
sozinho. Roda **todo dia às 03:10** (Brasília) para todas as tabelas, 2 por minuto (~20 min).

```sql
select * from internal.backup_status();          -- situação por tabela (problemas primeiro)
select internal.backup_validar();                -- agenda tudo agora
select internal.backup_validar('carros');        -- só uma tabela
select internal.backup_validar('carros', true);  -- libera exclusões bloqueadas (confira antes!)
select * from internal.backup_validacoes order by id desc limit 50;  -- histórico (30 dias)
select * from internal.backup_fila where ultimo_erro is not null;
```

| Situação | Significado | O que fazer |
|---|---|---|
| `OK` | espelho idêntico na última validação | nada |
| `DIVERGENTE` | havia diferença e o reparo foi enfileirado | validar de novo depois; se repetir, investigar |
| `BLOQUEADA` | sobram na planilha mais de 20 linhas **e** mais de 10% | conferir se o banco perdeu dados; só então liberar |
| `ERRO` | sem resposta ou script desatualizado | ler `detalhe` |
| `ERRO_ENVIO` / `FILA_ATRASADA` | entrega falhando / item parado há +15 min | ler `detalhe` |
| `NUNCA_VALIDADA` / `VALIDACAO_ATRASADA` | sem validação / há +36 h | conferir o pg_cron |
| `SEM_BACKUP` | tabela nova sem a trigger | criar a trigger e adicionar ao registry |

**Contenção:** a validação nunca apaga em massa. Se o banco perder linhas sem passar pela trigger
(truncate, restore, trigger desligada), o espelho é preservado e a tabela fica `BLOQUEADA`.
Exclusões feitas normalmente (`delete`, inclusive em massa) **continuam** refletidas na hora.
Linhas com alteração manual ainda sem SQL (`CORE_MANUAL_CHANGES`) não são tocadas pela validação;
depois de "Marcar como incluídas", o banco volta a mandar.

Na planilha, a aba `CORE_VALIDATION` mostra o último resultado de cada tabela.

## Fidelidade das células

O Sheets reinterpreta texto: `00123456789` (RENAVAM, CPF/CNPJ) perde o zero, a chave de NF-e de 44
dígitos vira notação científica, `2026-01-02` vira data e `=…` vira **fórmula**. Por isso todo texto
é gravado com apóstrofo (texto literal; não faz parte do valor). Célula acima de 49.000 caracteres
vai em partes para `CORE_OVERFLOW`. Dado gravado antes disso é consertado pela primeira validação.

O espelho cobre os **dados** do banco. Os **arquivos** do Storage (fotos e PDFs) não são copiados:
só os registros que apontam para eles.

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

- Token obrigatório no POST (Script Property `WEBHOOK_TOKEN`/`ERP_WEBHOOK_TOKEN`).
- **Grid web (GET):** só o dono da planilha, ou quem tiver `?k=<GRID_KEY>` (Script Property
  opcional, mínimo 24 caracteres). O deployment é público por causa do webhook.
- `LockService` serializa as escritas; `flush()` antes de confirmar ao banco.
- Whitelist de tabelas (registry); operação rejeitada não derruba o resto do lote.
- Mapeamento **sempre por nome de coluna** + **auto-grow** do header. Update faz **MERGE**.
- **Nunca** limpa/replace a aba inteira. Linha igual não é regravada.
- Aba `CORE_BACKUP_LOG` (máx **500** linhas, FIFO): data/hora, origem, aba, op, pk, **valor anterior**.
- `npm run test:unit` falha se uma tabela ou coluna nova ficar fora do registry.

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

## Importer de CSV — reserva manual (menu 📥)

A carga dos dados já existentes agora sai da própria validação (o que falta é enfileirado). O
importador fica como reserva, para quando o banco não puder enviar. O backfill automático (rota `/api/v1/backup/backfill` + RPCs `backup_plan`/`backup_chunk`/
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

## Banco

Migrations: `20260622124350` (trigger genérica) e `20261126120000` (fila + validação). Ficam fora do
espelho, de propósito, `log_alteracoes` (volume) e `client_errors` (telemetria). DML em massa não
precisa mais desligar a trigger: a fila entrega em lotes (~12.000 linhas por hora).
`public.dispatch_backup_payload` ficou sem uso e sai numa migration futura (expand/contract).

**Ordem de publicação:** primeiro o Apps Script (aceita o banco antigo e o novo), depois a migration,
depois `select internal.backup_validar();`.
