# 2026-06-18 — Unificação de lookups não sensíveis + prevenção de drift git↔prod

## Contexto

O banco tinha 16 tabelas `lookup_*` com **forma idêntica** (`code, name, description, is_active,
sort_order, created_at, updated_at`). Objetivo: consolidar os domínios **não sensíveis** numa
única tabela, simplificando manutenção/admin e reduzindo a superfície do futuro backup de
contenção — **sem abrir mão da integridade referencial** que FKs garantiam. Ao inspecionar o
schema real (via MCP), descobriu-se que o **git divergiu da produção** (migrations/types
desatualizados), o que motivou um segundo eixo de trabalho: prevenção de drift.

## Escopo (decisão)

Inspeção do schema **real** (não do git, que estava furado) revelou os não sensíveis em dois grupos:

- **Set 1 — 9 domínios "puros" (UNIFICADOS):** `estados_chave_reserva, estados_envelope,
  estados_pericia, estados_recibo_compra, estados_transferencia, origens_veiculo, propositos,
  tipos_processo, canais_cliente`. Referenciados só por `documentos` (8 FKs) e `vendas.canal_cliente`.
- **Set 2 — 4 de status (MANTIDOS separados):** `sale_statuses, announcement_statuses,
  vehicle_states, locations`. Têm FK das colunas **core** de `carros`/`anuncios`
  (`estado_venda, estado_anuncio, estado_veiculo, local`) → unificá-los exigiria mexer no coração
  do `carros` + views atualizáveis. Alto risco, baixo retorno → fora.
- **Sensíveis (separados):** `user_roles`, `user_statuses` (RBAC) e `audit_actions` (auditoria).

> Correção importante: a 1ª versão do plano assumiu (pelo git) que os 4 de status não tinham FK.
> O schema real mostrou que **têm** — daí a re-decisão para Set 1 apenas.

## Mudanças de schema (migration `20260618143951_unify_lookups.sql`)

- **`public.lookups`**: `primary key (domain, code)`; RLS habilitada sem policy (acesso só via
  `service_role`, igual às demais — ver `database-access-and-rls-strategy.md`); trigger
  `before insert/update` reusando `public.fn_set_timestamps()` (criado **após** o seed p/ preservar
  `created_at`).
- **Integridade FORTE preservada via FK composta:** cada coluna referenciadora ganhou
  `<col>_domain text not null default '<dom>' check (= '<dom>')` e FK
  `(<col>_domain, <col>) → lookups(domain, code)` `on update cascade on delete restrict`. Remoção de
  um domínio passa a ser **soft-delete** (`is_active=false`), não DELETE.
- **`fn_documentos_parse_token`** reescrita para ler de `public.lookups` (filtrando por `domain`).
- As 9 tabelas do Set 1 foram **dropadas** (dados migrados antes).

## App

- `lib/api/lookups.ts`: os 6 domínios do Set 1 que aparecem no payload são lidos de `lookups` numa
  **única query** (filtrada por `domain` + papel); status e sensíveis seguem por tabela.
  `LookupsPayload` (`lib/core/types/lookups.ts`) **inalterado**.
- `lib/supabase/database.types.ts` **regenerado**: sincronizou repo↔remoto e removeu o órfão
  `lookup_remetentes` (existia nos types commitados, mas **não** no banco).

## Drift git↔prod: descoberta e prevenção (2026-06-19, Tier 1)

- **Causa raiz:** `apply_migration` (MCP) atribui o **próprio timestamp** de versão. Os arquivos do
  git usavam timestamps "redondos" feitos à mão → divergência sistêmica de numeração na janela
  ~19/mai–09/jun, e até a própria `unify_lookups` (git `…120000` × remoto `…143951`). Havia também
  drift de conteúdo (ex.: `lookup_remetentes` criado no git, dropado só no remoto).
- **Prevenção (escolha do dono: prevention-first, sem reescrever histórico):**
  - Renomeado `unify_lookups` para casar o `version` do remoto (`20260618143951`).
  - **CLAUDE.md**: convenção de migration (renomear o `.sql` p/ casar `list_migrations`; regenerar
    types na mesma mudança; **expand/contract** p/ destrutivas — adiciona → deploya código → só
    então remove, já que o remoto é único e a prod sente a migration na hora).
  - **CI**: novo job `schema-types-sync` falha se mexer em `supabase/migrations/**` sem regenerar
    `database.types.ts` (escape `[skip-types]` p/ RLS/dados puros).
- **Adiado deliberadamente:** reconciliação histórica completa dos ~23 arquivos divergentes (ROI
  baixo p/ dev solo num único prod). O `database.types.ts` regenerado **está fiel à prod**, que é o
  que o app consome.

## Defaults de formulário (2026-06-20, baixo risco)

Campo declarativo `GridTableConfig.newRecordDefaults`, aplicado no `openInsertForm` do
holistic-sheet: carros (`PREPARAÇÃO`/`DISPONÍVEL`, sem chave/manual), anuncios (`ANUNCIADO`, sem
`anuncio_legado`/`no_instagram`), documentos (`COMPRA`/`VENDA`).

## Segurança (advisors revisados, 2026-06-20)

- **`citext` em `public`**: revisado — 9 colunas de tipo `citext` em tabelas core + 89 dependentes;
  as únicas funções que referenciam `citext` são **internas da própria extensão**. Mover de schema
  é viável mas mexe no `search_path` dos roles → **mantido adiado** (risco > benefício agora).
- **leaked-password protection**: ainda **desligado** → ação de dashboard pendente (Auth → Policies).
- **RLS sem policy**: intencional (contrato backend-mediated).

## Verificação

- `select domain,count(*) from public.lookups` = **43** linhas, batendo com o baseline pré-migration.
- 0 tabelas antigas restantes; **9 FKs compostas** presentes; trava por domínio testada — código
  inválido **e** código de outro domínio **rejeitados** (sem mutar dados).
- `tsc --noEmit` verde; `vitest` **663/663**.
- `get_advisors` (security): `lookups` aparece com o mesmo lint INFO (`rls_enabled_no_policy`) de
  todas as tabelas; **nenhum WARN novo**.
- Migration aplicada no remoto (`project ppcwxswgsrnrvpojzedc`) e versionada no git.
