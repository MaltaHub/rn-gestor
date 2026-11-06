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
| Diálogo / confirmação | [components/ui/dialog](components/ui/dialog) (`FocusDialog`, `confirmDialog`, `promptDialog`) — nunca `window.confirm/alert/prompt` |
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
   `components/ui-grid/{grid-command-bar,tables-drawer}.tsx`, diálogos em `components/ui/dialog`.
   CSS novo em `*.module.css`, nunca de volta no `globals.css`. Antes de adicionar feature num
   monólito, **extraia primeiro**.
2. **`fetchWithTimeout` duplicado** em `components/ui-grid/api.ts`, `components/admin/api.ts` e
   `components/profile/api.ts`. Se tocar em um, consolide em `lib/api/http-client.ts`.
3. **`/api/v1/price-contexts`** aceita `table/row_id/column` livres e usa `client: any`. Área
   sensível — adicione allow-list antes de qualquer mudança.
4. **`auditoria/dashboard`** filtra em memória e busca autores/tabelas sem paginação. Não adicione carga.
5. **`citext` está em `public`** e o leaked-password protection do Auth está desligado. Não dependa disso.
6. **Arquivos = índice no cliente.** `/arquivos` carrega `GET /api/v1/files/index` (árvore +
   metadados, SEM URLs) uma vez e navega em memória. URLs assinadas só via `POST /api/v1/files/sign`
   em lote. Mutação devolve só o que mudou. Upload: `uploads/prepare` → PUT no Storage → `uploads/finalize`.
7. **OCR é um domínio só.** Leitura = `components/files/ocr/ocr-runtime.ts`; regras =
   `lib/domain/ocr/engine.ts` (puro); destinos SÓ pela allow-list `lib/domain/ocr/destinations.ts`;
   regras das pastas = `lib/domain/file-automations/rules.ts`.
8. **Processo documental = 4 eixos + perícia** (ver [docs/processo-documental.md](docs/processo-documental.md)).
   `documentos.estado_transferencia` é a **situação do CRLV** (`AGUARDANDO | BRANCO | PROCURACAO | VIRADO`);
   `responsavel_virado` só existe quando VIRADO (trigger `fn_documentos_normaliza_crlv`). Notas e
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
