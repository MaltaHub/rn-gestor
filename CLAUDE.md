# CLAUDE.md

> **Leia [AGENTS.md](AGENTS.md) primeiro — é a spec canônica** (invariantes, RBAC,
> DO/DON'T, arquivos canônicos, segurança, estrutura, comandos, estilo).
> Este arquivo **não repete** o AGENTS.md: só registra o que é específico do ambiente
> Claude Code e da operação local deste repo. Se algo aqui conflitar com o AGENTS.md,
> **o AGENTS.md vence** — e corrija lá.

## Ambiente local

- **Windows + PowerShell.** Sintaxe PowerShell por padrão (`$null`, `$env:VAR`, backtick
  para continuação). Há também um tool Bash para scripts POSIX.
- A **CLI do Supabase NÃO está no PATH** — não conte com `supabase ...` no terminal.
- Caminho do repo tem espaço (`Admin Kaic`); cite paths entre aspas.

## Banco / migrations (como aplicar aqui)

- Schema é fonte de verdade em `supabase/migrations/` (ver AGENTS.md, invariante #6).
- Como a CLI não está no PATH, **migrations são aplicadas no remoto via MCP
  `apply_migration`** — project_id **`ppcwxswgsrnrvpojzedc`**. Para inspeção use
  `execute_sql` / `list_migrations` do mesmo MCP.
- ⚠️ **Sempre commite o arquivo `.sql`** mesmo depois de aplicar via MCP. Já aconteceu de
  uma migration ficar aplicada no remoto mas órfã no git (buraco no histórico de schema).

## Fluxo de trabalho deste dev (Kaic, dono solo)

- Trabalho direto na **`main`** (linha de polish). Commit + push ao concluir cada feature.
- Features grandes/experimentais vão para branches `feat/*`.
- O **`/editor`** (editor de fluxos: canvas, runtime, schema, vars + rotas/migrations
  `editor-*`) foi separado para **`feat/editor`** (já em `origin/feat/editor`) para manter
  a `main` sem essa feature.
- Só commite arquivos da feature em questão; deixe artefatos de polish/auditoria
  (`docs/*-audit*`, `scripts/css-audit.mjs`, `tests/e2e/visual`) fora a menos que pedido.

## Gotchas (complementam os do AGENTS.md)

- **`value-format.ts` / `toDisplay`:** só formate como data strings **ISO 8601 reais**
  (regex data+hora). `Date.parse` é leniente e inventa datas para texto qualquer — "CRETA
  1.6" virava "06/01/2001" (o "T" de CRE**T**A passava no check antigo). Como o grid filtra
  pelo valor exibido, o item ainda sumia da busca. Ver `__tests__/value-format.test.ts`.
- **Fuso em datas:** strings `YYYY-MM-DD` (date-only) parseadas como UTC e lidas com getters
  locais voltam um dia. Trate os componentes direto (ver `lib/domain/string-transform.ts`).
- **`supabase/.temp/`** é gerado e ignorado — não versione (contém project-ref, pooler-url).

## Memória persistente

Há memória de projeto em `~/.claude/.../memory/` (índice em `MEMORY.md`). Consulte para
contexto de tarefas pausadas e decisões anteriores; atualize quando algo não-óbvio mudar.
