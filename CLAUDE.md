# CLAUDE.md — rn-gestor

> Spec única do projeto para agentes (invariantes, padrões, ambiente local, fluxo de trabalho).
> Se algo aqui estiver desatualizado, **corrija aqui antes de codar**. Mapa das pastas no
> [README.md](README.md#mapa-das-pastas).

## O que este repo é

App **Next.js 15 (App Router) + React 19 + Supabase**. O nome `rn-gestor` é histórico — **não é
React Native**. Backend-mediated: o browser fala com as API Routes do Next, e só o servidor toca o
Supabase com `service_role`. Deploy na Vercel a cada push na `main`.

## Invariantes não-óbvios (leia antes de tocar em código)

1. **Nenhum componente de cliente acessa Supabase direto em tabelas do `public`.** RLS está habilitado
   sem políticas em muitas tabelas, por design. Toda leitura/escrita passa por `app/api/v1/**`.
2. **`SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` só existem no servidor.** Nunca importe
   [lib/api/supabase-admin.ts](lib/api/supabase-admin.ts) em arquivo de cliente.
3. **Rotas de API são finas.** Validação, persistência e regras vão em `lib/api/**` ou
   `lib/domain/**`. Contrato canônico: [lib/api/execute.ts](lib/api/execute.ts).
4. **Grid e Files são config-driven com allow-list.** Nunca aceite `table`/`column`/`row_id`
   arbitrários do cliente — cruze com `GRID_TABLE_POLICIES` em
   [lib/domain/grid-policy.ts](lib/domain/grid-policy.ts).
5. **RBAC é hierárquico:** `VENDEDOR < SECRETARIO < GERENTE < ADMINISTRADOR`. Use
   `requireRole(actor, "GERENTE")` de [lib/api/auth.ts](lib/api/auth.ts), não comparações ad-hoc.
6. **Migrações são a fonte de verdade do schema** (`supabase/migrations/`). Mudou tabela/coluna/
   policy? Gere o `.sql` antes de mexer em TS.
7. **Mojibake é uma realidade do banco.** Use [lib/ux/mojibake.ts](lib/ux/mojibake.ts) ao exibir
   strings legadas — não normalize na origem sem migração explícita.
8. **Schema só depois da análise do Kaic.** Proponha campo a campo (com o uso real) e espere a
   aprovação antes de qualquer migration que adicione/remova campos. Campos que ele pediu
   explicitamente podem ser aplicados.

## Padrões canônicos — copie destes arquivos

| Cenário | Olhe primeiro |
|---|---|
| Rota de API autenticada | [app/api/v1/me/route.ts](app/api/v1/me/route.ts) (`executeAuthenticatedApi`) |
| Rota com papel mínimo | [app/api/v1/insights/anuncios/missing-rows/route.ts](app/api/v1/insights/anuncios/missing-rows/route.ts) (`requireRole` + `apiOk`) |
| Serviço de domínio | [lib/domain/file-automations/service.ts](lib/domain/file-automations/service.ts) (`ApiHttpError` + types do `Database`) |
| Cliente HTTP no browser | [lib/api/http-client.ts](lib/api/http-client.ts) (`apiFetch`/`parseEnvelope`) — usado por [components/files/api.ts](components/files/api.ts) |
| Mutação de grid | [lib/api/grid/mutation-dispatcher.ts](lib/api/grid/mutation-dispatcher.ts) (valida a policy) |
| Form flutuante (qualquer um) | [components/ui/dialog/focus-dialog.tsx](components/ui/dialog/focus-dialog.tsx) — casca ÚNICA: foco preso, Esc, empilha (form aberto por cima de form). Casos especiais entram como conteúdo/props, nunca como outra casca. `dock` = mesma casca acoplada ao lado (form principal do grid no desktop, divisor arrastável) |
| Confirmação / texto curto | `confirmDialog`, `promptDialog`, `alertDialog`, `copyDialog` ([confirm.tsx](components/ui/dialog/confirm.tsx)) — nunca `window.confirm/alert/prompt` |
| Lista de escolha | `ChoiceList` / `ChoiceListDialog` ([choice-list.tsx](components/ui/dialog/choice-list.tsx)); popovers de lista (filtro de coluna) com [popover.module.css](components/ui/dialog/popover.module.css) |
| Form de descrição (justificar ação) | `DescriptionDialog` ([description-dialog.tsx](components/ui/dialog/description-dialog.tsx)) — ex.: contexto de alteração de preço |
| Form de registro (qualquer tabela) | `RecordFormDialog` ([record-form-dialog.tsx](components/ui-grid/record-form-dialog.tsx)) — "+" ao lado de FK abre outro por cima; CARROS é a exceção (busca de placa). Interior com as peças de [record-form-parts.tsx](components/ui-grid/record-form-parts.tsx) (`FormField`, `ToggleField`, `FormGroup`) e rótulos de `humanizeColumn` ([column-labels.ts](lib/domain/column-labels.ts)) |
| Auditoria (motivo da gravação) | `describeAudit("…")` de [audit-context.ts](lib/api/audit-context.ts) antes de gravar; a trigger do banco registra quem/o quê. Tela: `AuditExplorer` ([audit-explorer.tsx](components/audit/audit-explorer.tsx)) sobre `GET /api/v1/auditoria` (cursor) |
| Insights do grid | `collectGridInsights` ([grid-insights.ts](lib/domain/grid-insights.ts), puro: 1 ocorrência = 1 problema × 1 linha) + `InsightsDialog` ([insights-dialog.tsx](components/ui-grid/insights/insights-dialog.tsx)) — botão ÚNICO, modos Fila (por problema) e Pesquisa (por placa); a última etapa rola até a linha |
| Área do vendedor (lista/painel) | `GET /api/v1/vendedor/veiculos[/:id]` ([lib/domain/vendedor/service.ts](lib/domain/vendedor/service.ts)) — paginado no banco, capas em miniatura ([cover-thumbs.ts](lib/files/cover-thumbs.ts)); cliente em [components/vendedor/api.ts](components/vendedor/api.ts) + `useVeiculosVendedor` |
| Documento da venda (Word) | Categoria ([categorias.ts](lib/domain/venda-documentos/categorias.ts)) + cláusulas prontas ([clausulas.ts](lib/domain/venda-documentos/clausulas.ts)) + seções condicionais ([condicoes.ts](lib/domain/venda-documentos/condicoes.ts)): UM template por categoria, nunca um por caso de pagamento. Modelos do sistema em [modelos.ts](lib/domain/venda-documentos/modelos.ts) |
| Página interna | `AppFrame` ([app-frame.tsx](components/workspace/app-frame.tsx)) — cabeçalho + conteúdo do tamanho da tela; a página nunca rola |
| Teste unitário de domínio | [lib/domain/__tests__/anuncios-insights.test.ts](lib/domain/__tests__/anuncios-insights.test.ts) |
| Spec E2E | [tests/e2e/files.spec.ts](tests/e2e/files.spec.ts) (Playwright contra `127.0.0.1:3100`) |

## DO / DON'T

```ts
// DON'T — cast direto do body, sem validação runtime
const body = (await req.json()) as { table: string; column: string };
// DO — validar antes de usar
const body = await req.json();
if (!isValidGridMutation(body)) throw new ApiHttpError(400, "BAD_BODY", "Payload inválido.");

// DON'T — vazar o objeto de erro do Supabase ao cliente
if (error) throw new ApiHttpError(500, "X_FAILED", "Falhou.", error);
// DO — logar no servidor, devolver mensagem segura
if (error) { console.error("[X_FAILED]", { requestId, error }); throw new ApiHttpError(500, "X_FAILED", "Falhou."); }

// DON'T — mais um fetchWithTimeout local / Supabase direto no cliente
const { data } = await createSupabaseBrowserClient().from("carros").select("*");
// DO — API Route + cliente HTTP compartilhado
import { apiFetch } from "@/lib/api/http-client";
```

## Gotchas

1. **Monólitos.** `HolisticSheet` (~8k linhas), `PlaygroundWorkspace` (~7k), `globals.css` (~11k).
   Partes já extraídas — mantenha assim: explorer em `components/files/explorer/**`, chrome do grid em
   `components/ui-grid/{grid-command-bar,tables-drawer}.tsx` (barra 1 = tabela/registros; barra 2 =
   `GridToolsBar`, a visão do grid), diálogos/listas em `components/ui/dialog`, layout em `AppFrame`.
   CSS novo em `*.module.css`, nunca de volta no `globals.css`. Antes de adicionar feature num
   monólito, **extraia primeiro**.
2. **`fetchWithTimeout` duplicado** em `components/ui-grid/api.ts`, `components/admin/api.ts` e
   `components/profile/api.ts`. Se tocar em um, consolide em `lib/api/http-client.ts`.
3. **`/api/v1/price-contexts`** aceita `table/row_id/column` livres e usa `client: any`. Área
   sensível — adicione allow-list antes de qualquer mudança.
4. **Auditoria é do BANCO, não do app.** A trigger `trg_00_auditoria` (`fn_auditoria_registrar`) grava
   `log_alteracoes` em toda tabela auditada: UPDATE só com os campos que mudaram (carimbos como `updated_at`
   não contam), autor = usuário dos cabeçalhos `x-rn-*` que `getSupabaseAdmin` manda (contexto em
   [lib/api/audit-context.ts](lib/api/audit-context.ts)); alteração automática (outra trigger, cascata, cron) = autor
   **SISTEMA**. Não grave log à mão: chame `describeAudit("motivo")` ANTES de gravar. Tabela nova que precisa
   de auditoria → trigger na migration + [lib/domain/auditoria/tables.ts](lib/domain/auditoria/tables.ts). Retenção
   (pg_cron, por tabela): 30 dias ou 5.000 linhas.
5. **`citext` está em `public`** e o leaked-password protection do Auth está desligado. Não dependa disso.
6. **Arquivos = índice no cliente.** `/arquivos` carrega `GET /api/v1/files/index` (árvore +
   metadados, SEM URLs) uma vez e navega em memória. URLs assinadas só via `POST /api/v1/files/sign`
   em lote. Mutação devolve só o que mudou. Upload: `uploads/prepare` → PUT no Storage → `uploads/finalize`.
7. **OCR é um domínio só.** Leitura = `components/files/ocr/ocr-runtime.ts`; regras =
   `lib/domain/ocr/engine.ts` (puro); destinos SÓ pela allow-list `lib/domain/ocr/destinations.ts`;
   regras das pastas = `lib/domain/file-automations/rules.ts`.
8. **Processo documental = 4 eixos + perícia** (ver [docs/processo-documental.md](docs/processo-documental.md)).
   `documentos.estado_transferencia` é a **situação do CRLV** (`AGUARDANDO | BRANCO | PROCURACAO | VIRADO`);
   `responsavel_virado_id` (→ `responsaveis_virado`, chave CPF/CNPJ só dígitos) só existe quando VIRADO e VIRADO exige o titular — informar o titular vira sozinho (trigger `fn_documentos_normaliza_crlv`); classificar CRLV VIRADO NÃO vira sozinho (o titular vem do OCR ou à mão). Trigger que barra regra levanta `REGRA: <mensagem>` e o servidor repassa (`databaseRuleMessage`). Notas e
   perícias = 1 registro por arquivo, criados pelo banco ao classificar (`fn_documentos_reparse_carro`).
   Comprador em `vendas`; fornecedor em `documentos.remetente_id`.
9. **Finalização APAGA dados de produção.** 90 dias após `carros.data_venda`: `pg_cron` →
   `POST /api/v1/internal/finalizacao` → `fn_finalizar_veiculo` (snapshot em `finalizados`, veículo
   apagado; documentos ficam 5 anos). Liga/desliga em `internal.app_settings.finalizacao_ativa`. Ao
   criar FK nova para `carros`, decida o que acontece na finalização.
10. **`value-format.ts` / `toDisplay`:** só formate como data strings **ISO 8601 reais**. `Date.parse`
    é leniente ("CRETA 1.6" virava "06/01/2001") e o grid filtra pelo valor exibido. Anos/números/
    códigos (`ano_*`, `*_numero`, `codigo*`) saem sem separador de milhar.
11. **Fuso em datas:** `YYYY-MM-DD` parseado como UTC e lido com getters locais volta um dia. Trate os
    componentes direto (ver `lib/domain/string-transform.ts`).
12. **Não remova os campos `__*` das rows do grid** (`__has_pending_action`, `__missing_data`…) — são
    contrato com a UI.

## Ambiente local (Windows)

- **Windows + PowerShell** por padrão; há também um tool Bash (Git Bash). Caminho do repo tem espaço
  (`Admin Kaic`) — cite paths entre aspas. Heredoc com conteúdo complexo falha no Git Bash: grave
  scripts com a ferramenta de escrita e rode com `node`. Arquivos são CRLF: normalize antes de substituir.
- A **CLI do Supabase NÃO está no PATH.**
- `supabase/.temp/` é gerado e ignorado — não versione (contém project-ref, pooler-url).

## Banco / migrations

- Project ref **`ppcwxswgsrnrvpojzedc`**. Aplicação no remoto pela Management API
  (`scripts/db/run-supabase-sql.js`, token `SUPABASE_ACCESS_TOKEN` do `.env.local`) ou pelo MCP
  `apply_migration` quando disponível.
- ⚠️ **Sempre commite o `.sql`** mesmo depois de aplicar no remoto. Se o remoto atribuir outro
  `version`, renomeie o arquivo do git para casar (`<version>_<name>.sql`).
- ⚠️ **Regenere `lib/supabase/database.types.ts` na MESMA mudança** de qualquer migration de schema
  (e `npm run relations:generate`). O CI (`schema-types-sync`) falha sem isso; escape `[skip-types]`
  no commit só para migrations que não mudam os types (RLS/dados).
- **Mudanças destrutivas: expand/contract.** O banco é único e compartilhado com a produção:
  (1) adiciona o novo → (2) deploya o código na `main` → (3) remove o antigo em migration separada.

## Fluxo de trabalho (Kaic, dono solo)

- Trabalho direto na **`main`**. Commit + push ao concluir cada feature (deploy = push).
- Só commite arquivos da feature. Relatórios gerados (`docs/css-audit.md`, `docs/ui-inventory.md`) e
  capturas de diagnóstico ficam fora do git. `tests/e2e/visual/` faz parte da suíte: regere as
  referências quando o layout mudar de propósito (apague o `.png` antes — a tolerância é 1%).
- **Reuso primeiro:** procure função/hook/componente existente antes de criar; abstração nova só com
  repetição real.
- **Registro de trabalho:** mudança de arquitetura, segurança ou que cruza features ganha
  `docs/work-records/AAAA-MM-DD-titulo.md` (modelo em `docs/work-records/_modelo.md`).
- Responda ao Kaic em **português**.

## Antes de concluir (checklist)

- O diff cumpre o pedido e ficou no escopo; sem `any`, sem comentário óbvio (só o "porquê").
- Entrada validada e autorização explícita nas rotas ("e se um VENDEDOR chamar isso?").
- Nenhum segredo exposto (`node scripts/check-secrets.mjs` roda no CI).
- Testes no nível certo: unitário para domínio (`__tests__/`), Playwright para grid/files/forms.
- `npx tsc --noEmit`, `npm run lint`, `npm run test:unit`; e2e com `--workers=1`.
- Rollback possível e riscos residuais anotados no registro de trabalho.

## Comandos

| | |
|---|---|
| `npm run dev` | Next dev (porta 3000; e2e usa 3100) |
| `npm run build` | build de produção |
| `npm run lint` / `npm run test:unit` | ESLint / Vitest |
| `npm run test:e2e` | Playwright (`127.0.0.1:3100`) |
| `npm run supabase:types` | regenera `lib/supabase/database.types.ts` |
| `npm run relations:generate` | regenera o mapa de FKs do grid |

## Estilo

TS strict, 2 espaços, arquivos em kebab-case, hooks `useCamelCase`, imports `@/`. Unitários
`*.test.ts(x)` em `__tests__/`; e2e `*.spec.ts` em `tests/e2e/`. Commits no imperativo com escopo
(`feat(grid): …`), nunca amende commit já enviado.

## Memória persistente

Há memória de projeto em `~/.claude/.../memory/` (índice em `MEMORY.md`): contexto de tarefas
pausadas e decisões anteriores. Atualize quando algo não-óbvio mudar.
