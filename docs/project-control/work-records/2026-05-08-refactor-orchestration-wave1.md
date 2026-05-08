# 2026-05-08 — Refactor orchestration (Wave 1)

## Context

Codex gpt-5.5 xhigh audit (sessão `019e07da-427d-7b00-9cb6-856f294e8b19`) identificou prioridades P0/P1 no repo. Após reescrita do `AGENTS.md` no estilo Karpathy, Wave 1 do refactor foi disparada em paralelo com distribuição entre Codex e sub-agentes Claude.

## Distribution

| Tarefa | Prioridade | Agente | Worktree | Razão da escolha |
|---|---|---|---|---|
| Quebrar `HolisticSheet` (~6.8k linhas) | P1 (mais difícil) | Codex gpt-5.5 xhigh | `.claude/worktrees/refactor-holistic-sheet` (`refactor/holistic-sheet-monolith`) | Trabalho estrutural pesado, exige raciocínio profundo sobre acoplamento cruzado |
| Sanitizar `details` de erro em prod | P0 (segurança) | Claude general-purpose | isolated (auto) | Repo-wide pattern matching, edição em vários callsites |
| Consolidar client API (`fetchWithTimeout`/`parseApi` 3× duplicado) | P1 | Claude general-purpose | isolated (auto) | Cross-cutting, requer mover código sem quebrar consumers |
| Endurecer `price-contexts` (`any`, allow-list, role) | P1 (segurança) | Claude general-purpose | isolated (auto) | Escopo focado em uma área, alta sensibilidade |

## Conflict surface

- **Codex (HolisticSheet) ↔ Agent 2 (Client API)** podem ambos tocar `components/ui-grid/api.ts`. Resolução em merge — Codex foi instruído a evitar reorganização desse arquivo.
- Outros: tarefas tocam áreas disjuntas (lib/api/response.ts vs app/api/v1/price-contexts/** vs components/ui-grid/holistic-sheet.tsx).

## Out of scope (Wave 2, próxima orquestração)

- Quebra de `FileManagerWorkspace` (~2.7k) e `PlaygroundWorkspace` (~3.7k) — Codex xhigh em sequência
- Validação runtime padronizada (Zod ou guards) nas rotas P0
- CI expandido (`lint` + `test:unit` + `build` em PR)
- Paginação server-side em `auditoria/dashboard`
- Testes que garantam que nenhuma tela usa Supabase direto em tabelas sem policy

## Validation strategy

Cada agente roda testes escopados na sua worktree. Antes de qualquer merge: `npm ci && npm run lint && npm run test:unit && npm run build` no resultado consolidado.

## Status (linha do tempo)

| Hora | Evento |
|---|---|
| 2026-05-08 ~14:05 | AGENTS.md reescrito (Karpathy method) no worktree `sharp-joliot-221f0d` |
| 2026-05-08 ~14:10 | Worktree `refactor-holistic-sheet` criado a partir de `main` |
| 2026-05-08 ~14:10 | Wave 1 disparada em paralelo |
| 2026-05-08 ~14:17 | Agent P0 (errors) finalizou |
| 2026-05-08 ~14:18 | Agent P1 (client API) finalizou |
| 2026-05-08 ~14:19 | Agent P1 (price-contexts) finalizou |
| 2026-05-08 — | Codex (HolisticSheet) em andamento |

## Resultados Wave 1

### ✅ P0 — Sanitização de erros
- **Branch:** `worktree-agent-a71e81d29fd09a2f6`
- **Worktree:** `.claude/worktrees/agent-a71e81d29fd09a2f6`
- **Commits:** `eb4b184` (testes), `0824d86` (filtro)
- **Mudanças:** `lib/api/response.ts` filtra `details` em prod; `lib/api/execute.ts` loga `console.error("[CODE]", { requestId, error })` antes do throw
- **Testes:** 69/69 ✅ (4 novos)
- **Risco residual:** ~150 callsites passam erro Supabase cru — proteção agora está na serialização. Refactor explícito por callsite fica para PR futura.

### ✅ P1 — Consolidação do cliente HTTP
- **Branch:** `worktree-agent-a304ec88102467fb2`
- **Worktree:** `.claude/worktrees/agent-a304ec88102467fb2`
- **Commits:** `bb0ab98` (módulo), `fd1442c` (ui-grid), `58fcb44` (files), `a937ba4` (admin)
- **Novo módulo:** `lib/api/http-client.ts` exportando `apiFetch`, `parseEnvelope`, `ApiClientError`
- **Migração:** 3 consumers (`components/ui-grid/api.ts`, `components/files/api.ts`, `components/admin/api.ts`) — API pública preservada via re-export
- **Testes:** 74/74 ✅ (9 novos)
- **Trade-off:** branch de aborto externo do admin agora distingue entre timeout interno e abort externo (mais correto, sem caller-impact)

### ✅ P1 — Hardening price-contexts
- **Branch:** `worktree-agent-af0d32ac346c988ef`
- **Worktree:** `.claude/worktrees/agent-af0d32ac346c988ef`
- **Commits:** `5aa673a` (policy), `54f700f` (refactor), `4da4268` (testes)
- **Allow-list:** `carros.preco_original` + `anuncios.valor_anuncio` em `lib/domain/price-contexts/policy.ts`
- **Role mínimo:** `GERENTE` (alinhado com `/api/v1/auditoria`)
- **`any` removidos:** 2 (em ambas as rotas), tipados via `SupabaseClient<Database>`
- **Testes:** 81/81 ✅ (16 novos)
- **Risco residual:** UI em `app/price-contexts/page.tsx` ainda aceita query params livres — precisará de error UX amigável; middleware não filtra role no edge (descobre só após fetch)

### ✅ P1 — Quebra do HolisticSheet
- **Branch:** `refactor/holistic-sheet-monolith`
- **Worktree:** `.claude/worktrees/refactor-holistic-sheet`
- **Agente:** Codex gpt-5.5 xhigh (291k tokens; 2 falsas-partidas de stdin antes de funcionar com `< /dev/null`)
- **Commits:** `bdaa948` (stored state), `8b312d8` (car form state), `1c586e4` (price context dialogs), `4c38406` (anuncio insights)
- **Hooks extraídos** em `components/ui-grid/hooks/`:
  - `useGridStoredState.ts` (118 linhas) — localStorage/persistência
  - `useGridCarFormState.ts` (131 linhas) — estado do form de carro
  - `useGridPriceContextDialogs.ts` (143 linhas) — diálogos de contexto de preço
  - `useGridAnuncioInsights.ts` (173 linhas) — insights de anúncio
- **`holistic-sheet.tsx`:** 7.402 → 7.176 linhas (-506 locais, +705 em hooks dedicados — modularidade, não compressão)
- **Testes:** 65/65 ✅, `tsc --noEmit` limpo após cada extração
- **Parada deliberada:** Codex parou antes de seleção-por-teclado, drawers e edição inline — cortes que cruzam refs/layout/mutações e exigem mais cuidado. Documentado no commit `4c38406`.

## Caveat de processo

Os 3 sub-agentes Claude bootaram a partir de `main`, então leram a versão **antiga** do AGENTS.md (47 linhas). O AGENTS.md Karpathy reescrito vive em `sharp-joliot-221f0d`. Em ordem de merge: **landar AGENTS.md primeiro** para que agentes futuros tenham contexto rico.

## Próximos passos

1. Aguardar Codex completar
2. Validar cada branch: `npm ci && npm run lint && npm run test:unit && npm run build`
3. Decidir ordem de merge (sugestão: AGENTS.md → P0 errors → http-client → price-contexts → HolisticSheet)
4. Wave 2: FileManagerWorkspace, PlaygroundWorkspace, validação Zod, CI expandido
