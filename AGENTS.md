# AGENTS.md — rn-gestor-web

> Spec terso para agentes. Releia a cada turn. Se algo aqui está desatualizado, **corrija aqui antes de codar**.

## O que este repo é

App **Next.js 15 (App Router) + React 19 + Supabase**. O nome `rn-gestor` é histórico — **não é React Native**. Backend-mediated: o browser fala com Next API Routes, e só o servidor toca Supabase com `service_role`.

## Invariantes não-óbvios (leia antes de tocar em código)

1. **Nenhum componente de cliente acessa Supabase direto em tabelas do `public`.** RLS está habilitado mas sem políticas em muitas tabelas, por design. Toda leitura/escrita passa por `app/api/v1/**`. Quebrar isso = vazamento.
2. **`SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` só existem no servidor.** Nunca importe de `lib/supabase/admin.ts` em arquivos client.
3. **Rotas de API são thin.** Validação, persistência e regras vão em `lib/api/**` ou `lib/domain/**`. Veja [lib/api/execute.ts](lib/api/execute.ts) como contrato canônico.
4. **Grid e Files seguem config-driven com allow-list.** Nunca aceite `table`/`column`/`row_id` arbitrários do cliente — sempre cruze com `GRID_TABLE_POLICIES` em [lib/domain/grid-policy.ts](lib/domain/grid-policy.ts).
5. **RBAC é hierárquico:** `VENDEDOR < SECRETARIO < GERENTE < ADMINISTRADOR`. Use `requireRole(actor, "GERENTE")` de [lib/api/auth.ts](lib/api/auth.ts), não comparações ad-hoc.
6. **Migrações Supabase são fonte de verdade do schema.** Se mudou tabela/coluna/policy, gere `.sql` em `supabase/migrations/` antes de mexer em TS.
7. **Mojibake é uma realidade do banco.** Use [lib/ux/mojibake.ts](lib/ux/mojibake.ts) ao exibir strings legadas — não normalize na origem sem migração explícita.

## Padrões canônicos — copie destes arquivos

| Cenário | Olhe primeiro | Por quê |
|---|---|---|
| Nova rota de API autenticada | [app/api/v1/me/route.ts](app/api/v1/me/route.ts) | Usa `executeAuthenticatedApi` corretamente |
| Rota com role mínimo | [app/api/v1/insights/anuncios/missing-rows/route.ts](app/api/v1/insights/anuncios/missing-rows/route.ts) | Padrão `requireRole` + `apiOk` |
| Serviço de domínio | [lib/domain/file-automations/service.ts](lib/domain/file-automations/service.ts) | `ApiHttpError` + types do `Database` |
| Cliente HTTP no browser | [components/files/api.ts](components/files/api.ts) | (a consolidar — ver Gotcha #2) |
| Client Supabase no servidor | [lib/api/supabase-admin.ts](lib/api/supabase-admin.ts) | `getSupabaseAdmin()` com guarda de env |
| Hook de grid | [components/ui-grid/hooks/useGridDataSource.ts](components/ui-grid/hooks/useGridDataSource.ts) | Separação loading/seleção/mutação |
| Teste unitário de domínio | [lib/domain/__tests__/anuncios-insights.test.ts](lib/domain/__tests__/anuncios-insights.test.ts) | Vitest + fixtures inline |
| Spec E2E | [tests/e2e/files.spec.ts](tests/e2e/files.spec.ts) | Playwright contra `127.0.0.1:3100` |

## DO / DON'T

**Validação de input em rotas (P0 da auditoria).**
```ts
// DON'T — cast direto, sem validação runtime
const body = (await req.json()) as { table: string; column: string };

// DO — validar com guard ou schema antes de usar
const body = await req.json();
if (!isValidGridMutation(body)) throw new ApiHttpError(400, "BAD_BODY", "Payload inválido.");
```

**Resposta de erro (P0 da auditoria).**
```ts
// DON'T — vazar objeto Supabase cru ao cliente
if (error) throw new ApiHttpError(500, "X_FAILED", "Falhou.", error);

// DO — logar detalhes server-side, retornar mensagem segura
if (error) {
  console.error("[X_FAILED]", { requestId, error });
  throw new ApiHttpError(500, "X_FAILED", "Falhou.");
}
```

**Cliente HTTP duplicado (P1 da auditoria).**
```ts
// DON'T — criar mais um fetchWithTimeout local
async function myFetch(url: string) { /* ... */ }

// DO — reusar o módulo compartilhado (consolidar quando criado)
import { apiFetch } from "@/components/shared/api-client";
```

**Acesso ao banco no cliente.**
```ts
// DON'T
const supa = createSupabaseBrowserClient();
const { data } = await supa.from("carros").select("*");

// DO — sempre via API Route
const res = await fetch("/api/v1/carros");
```

**Mutação em grid.**
```ts
// DON'T — UPDATE direto sem allow-list
.from(table).update({ [column]: value }).eq("id", id);

// DO — passar pelo dispatcher que valida policy
import { dispatchGridMutation } from "@/lib/api/grid/mutation-dispatcher";
```

## Gotchas

1. **Monólitos quebram reviews.** `HolisticSheet` (~6.8k linhas), `FileManagerWorkspace` (~2.7k), `PlaygroundWorkspace` (~3.7k), `globals.css` (~9.3k). Antes de adicionar features novas aqui, **extraia primeiro** — ver `docs/refactor-roadmap-clean-architecture.md`.
2. **`fetchWithTimeout`/`parseApi` está duplicado** em `components/ui-grid/api.ts`, `components/files/api.ts`, `components/admin/api.ts`. Se for tocar em um, considere consolidar.
3. **`/api/v1/price-contexts`** aceita `table/row_id/column` livres e usa `client: any`. Tratar como área sensível — adicione allow-list antes de qualquer mudança.
4. **`auditoria/dashboard`** filtra busca em memória e busca autores/tabelas sem paginação. Não escala — não adicione carga.
5. **CI roda só `metrics:gate`.** Lint/build/testes ficam locais. Se mudar config de build, rode os três manualmente.
6. **Worktrees em `.claude/worktrees/**`** são scratch space — nunca commit a partir de lá sem alinhar com o usuário.
7. **`tmp-dev-server-*.log`** na raiz é lixo de execuções antigas. Não os trate como artefatos do projeto.
8. **`citext` está em `public`** e Supabase Auth tem leaked-password protection desabilitado. Não dependa desses estados — eles vão mudar.

## O que **não** fazer sem alinhamento

- Adicionar dependência (especialmente runtime). Justifique no PR.
- Mexer em `supabase/migrations/` antigas. Sempre crie nova migração com timestamp à frente.
- Reescrever monólitos em um único PR. Quebre por caso de uso (data loading → seleção → edição → impressão).
- Habilitar policies RLS sem desenhar o contrato de acesso direto cliente→banco. Hoje é deliberadamente backend-mediated.
- Remover `__has_pending_action`, `__missing_data` e outros campos `__*` em rows do grid — são contrato com a UI.

## Estrutura (resumo)

- `app/`: páginas, layouts, **API em `app/api/v1/**/route.ts`**
- `components/`: UI por feature (`ui-grid`, `files`, `auth`, `admin`, `playground`)
- `lib/api/`: helpers HTTP, auth, dispatcher de mutação
- `lib/domain/`: regras de negócio puras (testáveis sem Supabase)
- `lib/supabase/`: clientes (server, browser, admin) + types gerados
- `supabase/migrations/`: SQL versionado, fonte de verdade do schema
- `tests/e2e/`: Playwright; unitários ficam em `__tests__` ao lado do módulo
- `docs/project-control/`: work records, tool registry, estratégia RLS

## Comandos

| | |
|---|---|
| `npm ci` | install lockfile |
| `npm run dev` | Next dev (porta 3000) |
| `npm run build` | build produção |
| `npm run lint` | ESLint Next/TS |
| `npm run test:unit` | Vitest |
| `npm run test:e2e` | Playwright (`127.0.0.1:3100`) |
| `npm run supabase:types` | regenera `lib/supabase/database.types.ts` |
| `npm run metrics:gate` | quality gate de refactor (CI) |

## Estilo

- TS strict, indent 2 espaços
- kebab-case para arquivos (`file-manager-workspace.tsx`)
- `useCamelCase` para hooks, `route.ts` para handlers, `page.tsx` para páginas
- Imports `@/` para módulos do repo
- **Sem comentários óbvios.** Só comente o "porquê" não-óbvio.
- **Sem `any`** — se precisar, justifique no PR

## Testes

- Mudança em UI/API: rode o teste mais estreito relevante + `npm run build`
- Mudança em grid/files: inclua Playwright quando prático
- Nomes: `*.test.ts(x)` em `__tests__`, `*.spec.ts` em `tests/e2e/`
- Domain logic deve ter teste unitário sem Supabase mock — extraia funções puras

## Commits & PRs

- Imperativo curto, com escopo: `refactor(ui-grid): extract sheet composition hooks`
- PR completa `.github/pull_request_template.md`: phase context, scope, deltas de linha/lint, evidência de teste, risk checklist, rollback
- Não amende commits empurrados; crie commit novo

## Segurança & config

- `.env.local` segue `README.md` (sem template versionado)
- Vars públicas: prefixo `NEXT_PUBLIC_`
- Server-only: `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `EDGE_INTERNAL_KEY` — **nunca** importadas em código que vai pro bundle do browser
- Toda nova rota de API: pense "o que acontece se um VENDEDOR chamar isso?" antes de escrever

## Engineering ecosystem (ativo por padrão)

Atue como engenheiro sênior estratégico + arquiteto pragmático em todas as interações deste repo. Antes de plan/implementação/review/commit:

1. **Project-health quick check.** Faltou `.gitignore`, README, env doc, PRD, work record, teste, CI, gate? Sinalize.
2. **Code-reuse first.** Procure função/hook/serviço/mapper/validator/componente existente antes de criar novo. Reuse ou estenda quando a semântica bate. Crie nova abstração só quando há repetição real e dentro do escopo.
3. **Tool registry.** MCPs, skills, connectors, scripts e configs gerados pelo projeto vão em `docs/project-control/tool-registry.json` para serem removíveis em migração sem destruir o ecossistema.
4. **Work record.** Mudanças de arquitetura, segurança, ou que cruzam features ganham um arquivo em `docs/project-control/work-records/AAAA-MM-DD-titulo.md`.

Workflow detalhado: [plugins/engineering-quality-governor/skills/engineering-quality-governor/SKILL.md](plugins/engineering-quality-governor/skills/engineering-quality-governor/SKILL.md). Para reuso: [plugins/engineering-quality-governor/skills/code-reuse-architecture-prospector/SKILL.md](plugins/engineering-quality-governor/skills/code-reuse-architecture-prospector/SKILL.md).
