# CLAUDE.md

Guia para agentes (e humanos) trabalharem neste repositório. Leia antes de mexer.

## O que é

`rn-gestor` — ERP de uma revenda de veículos. Domínio em **pt-BR** (carros, modelos,
anúncios, repetidos, vendas, documentos, envelopes). App web única usada pelo dono.

## Stack

- **Next.js 15** (App Router) · **React 19** · **TypeScript** estrito
- **Supabase** (Postgres) via `@supabase/supabase-js`
- **zod 4** para validação de schema no domínio
- Testes: **vitest** (unit) · **Playwright** (e2e)
- Ambiente de dev: **Windows + PowerShell** (a CLI do Supabase NÃO está no PATH)

## Comandos

```bash
npm run dev          # next dev
npm run build        # next build (rode antes de commitar mudanças grandes)
npm run lint         # next lint
npm run test:unit    # vitest run  (suíte unit — sempre rode antes de commitar)
npm run test:e2e     # playwright test
npm run supabase:types  # regenera lib/supabase/database.types.ts (precisa SUPABASE_PROJECT_REF)
```

Typecheck direto: `npx tsc --noEmit`.

## Arquitetura

### Grid genérico orientado a config (coração do app)
- **`lib/api/grid-config.ts`** — um `GridTableConfig` por tabela (colunas, lookups, FKs,
  campos editáveis). É a fonte de verdade do que o grid mostra/edita.
- **`app/api/v1/grid/[table]/`** — CRUD genérico que serve qualquer tabela da config.
- **`components/ui-grid/holistic-sheet.tsx`** — o componente monolítico (~8k linhas) que
  renderiza grid + formulário + diálogos. É grande de propósito; tentativas de quebrar
  estão em branches `refactor/holistic-sheet-*`. Mexa com cuidado e rode os testes.
- **`components/ui-grid/value-format.ts`** — `toDisplay` formata células. ⚠️ só formate
  como data strings ISO 8601 reais; `Date.parse` é leniente e "inventa" datas para texto
  qualquer (ex.: "CRETA 1.6" virava "06/01/2001" — ver `__tests__/value-format.test.ts`).

### Camada de domínio
- **`lib/domain/<área>/`** — schemas zod + regras puras + `__tests__`. Lógica testável
  fica aqui, fora dos componentes. Ex.: `lib/domain/string-transform.ts` (motor do
  "Alteração em massa", **sem eval** — pipeline de dados puro).

### API / autorização
- Rotas em **`app/api/v1/<recurso>/`** (route handlers).
- Padrão de segurança: **RLS habilitado, sem policies** — o acesso é via service-role e a
  autorização acontece na camada de app com `requireRole`. NÃO escreva policies esperando
  que o RLS filtre; ele só bloqueia acesso anônimo direto.

### Banco / migrations
- Migrations versionadas em **`supabase/migrations/`** (nome `YYYYMMDDHHMMSS_descricao.sql`).
- Aplicação no remoto é via **MCP `apply_migration`** (project_id `ppcwxswgsrnrvpojzedc`),
  porque a CLI não está no PATH. **Sempre commite o arquivo .sql** mesmo após aplicar —
  o histórico de schema precisa ser reproduzível pelo git.
- `lib/supabase/database.types.ts` é gerado; regenere com `npm run supabase:types`.

## Convenções

- Domínio em **português** (nomes de tabela/coluna/rota). Código/identificadores em inglês
  quando fizer sentido, mas siga o que já existe ao redor.
- Trabalho direto na **`main`** (linha de polish). Features grandes/experimentais vão para
  branches `feat/*`.
- Commits: mensagem em pt-BR no estilo `tipo(escopo): resumo`. Rode `test:unit` +
  `npx tsc --noEmit` antes; `npm run build` para mudanças de peso.
- Nunca use `eval` / `Function()` para lógica configurável pelo usuário — modele como dados.

## Gotchas

- `supabase/.temp/` é gerado pela CLI e **ignorado** — não versione (contém project-ref,
  pooler-url).
- O `/editor` (editor de fluxos) foi separado para a branch **`feat/editor`** para manter a
  `main` limpa. Não está na `main`.
- Datas: cuidado com fuso. Strings `YYYY-MM-DD` (date-only) parseadas como UTC e lidas com
  getters locais voltam um dia — trate os componentes direto (ver `string-transform.ts`).
