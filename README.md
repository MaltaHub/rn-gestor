# RN Gestor

Sistema de gestão da loja (estoque de veículos, anúncios, documentação, vendas e arquivos).
Next.js 15 (App Router) + React 19 + Supabase, com deploy automático na Vercel a cada push na `main`.

> Regras do projeto (invariantes, segurança, padrões): **[AGENTS.md](AGENTS.md)**.
> Particularidades do ambiente local com Claude Code: [CLAUDE.md](CLAUDE.md).

## Mapa das pastas

| Pasta | O que tem |
|---|---|
| `app/` | Páginas (`page.tsx`) e a API (`app/api/v1/**/route.ts`). Cada pasta é uma rota: `/` (Home/grid), `/arquivos`, `/vendedor`, `/playground`, `/auditoria`, `/admin/usuarios`, `/perfil`, `/catalogo`, `/galeria/[token]`, `/login`… `app/dev/` só existe fora de produção. |
| `components/` | Interface, uma pasta por área: `ui-grid` (Home/tabelas/forms), `files` (Arquivos + OCR), `vendedor` (área do vendedor + editor Word), `playground`, `admin`, `audit`, `auth`, `profile`, `workspace` (cabeçalho comum), `shared`. Testes unitários em `__tests__/` ao lado do código. |
| `lib/` | Lógica sem tela. `lib/domain/` = regras de negócio por assunto (carros, vendas, documentos, finalização…); `lib/api/` = autenticação, permissões e helpers das rotas; `lib/supabase/` = cliente do navegador e os *types* gerados do banco; `lib/files/`, `lib/core/`, `lib/ux/` = utilitários. |
| `supabase/` | Banco: `migrations/` é a **fonte de verdade do schema** (SQL versionado); `functions/` = Edge Function `consulta-placa`. |
| `styles/` | CSS das páginas públicas (catálogo, galeria, vendedor) e os tokens de design. O CSS global do app fica em `app/globals.css`; componentes novos usam `*.module.css`. |
| `public/` | Arquivos servidos como estão (logos). |
| `tests/e2e/` | Testes de ponta a ponta (Playwright). `visual/` = capturas de referência; `helpers/` = login de dev, mocks e fixtures. |
| `scripts/` | Utilitários de linha de comando: `generate-relations.mjs` (mapa de FKs do grid), `refactor-metrics.mjs` (portão de qualidade do CI), `css-audit.mjs`, `fix-mojibake.js` e `db/` (SQL e Management API do Supabase). |
| `apps-script/` | Código do backup em Google Sheets (Apps Script) — publicado à mão no editor do Google. |
| `docs/` | `processo-documental.md` (como funciona a documentação dos veículos), `project-control/work-records/` (registro de cada mudança grande), `refactor-metrics/` (base do CI) e `archive/` (diagnósticos e planos antigos, só para consulta). |
| `plugins/`, `.agents/`, `.engineering-quality.yaml` | Plugin e configuração do agente Codex (governança de qualidade). Não fazem parte do app. |
| `.github/` | CI (lint, typecheck, testes, build, sincronia schema/types) e modelo de PR. |

Gerados (não versionados): `node_modules/`, `.next/`, `test-results/`, `playwright-report/`, `tsconfig.tsbuildinfo`.

## Rodar localmente

```bash
npm ci
cp .env.example .env.local   # preencha as chaves do Supabase
npm run dev                  # http://localhost:3000
```

Fora de produção a tela de login tem o **modo local de desenvolvimento**: escolha um perfil
(VENDEDOR, SECRETARIO, GERENTE, ADMINISTRADOR) e entre sem Supabase Auth — é o que a suíte E2E usa.
Em produção vale só Supabase Auth + Bearer token, com permissão checada no servidor por perfil.

## Comandos

| Comando | Para quê |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | build de produção (o mesmo da Vercel) |
| `npm run lint` | ESLint |
| `npm run test:unit` | testes unitários (Vitest) |
| `npm run test:e2e` | testes de ponta a ponta (Playwright, porta 3100; use `--workers=1`) |
| `npm run supabase:types` | regenera `lib/supabase/database.types.ts` depois de mudar o schema |
| `npm run relations:generate` | regenera o mapa de FKs do grid a partir dos *types* |

## Banco de dados

O banco é único e compartilhado com a produção: toda mudança de schema entra como migration nova em
`supabase/migrations/` (nunca edite as antigas), os *types* são regenerados na mesma mudança e
alterações destrutivas seguem *expand/contract*. Detalhes e armadilhas em [AGENTS.md](AGENTS.md) e
[CLAUDE.md](CLAUDE.md).

## Variáveis de ambiente

Ver `.env.example`. Só as com prefixo `NEXT_PUBLIC_` chegam ao navegador; `SUPABASE_SECRET_KEY`
(ou `SUPABASE_SERVICE_ROLE_KEY`) e `EDGE_INTERNAL_KEY` são exclusivas do servidor.
