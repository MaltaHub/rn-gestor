# Repository Guidelines

## Project Structure & Module Organization

- `app/`: pages, layouts, and API route handlers. API endpoints live under `app/api/v1/**/route.ts`.
- `components/`: React UI modules, grouped by feature (`ui-grid`, `files`, `auth`, `admin`) plus shared atoms in `components/atoms/`.
- `lib/`: domain, API, Supabase, formatting, guard, mapper, and shared service code. Prefer placing business logic here instead of inside route handlers.
- `styles/` and `app/globals.css`: global styling and design tokens.
- `supabase/`: migrations, config, README, and Edge Functions.
- `tests/e2e/`: Playwright specs and fixtures. Unit tests live near source in `__tests__`.
- `docs/` and `scripts/`: refactor plans, metrics baselines, and automation.

## Build, Test, and Development Commands

- `npm ci`: install exact dependencies from `package-lock.json`.
- `npm run dev`: start the local Next.js server.
- `npm run build`: create a production build.
- `npm run start`: serve the production build.
- `npm run lint`: run the configured Next/TypeScript ESLint rules.
- `npm run test:unit`: run Vitest unit tests.
- `npm run test:e2e`: run Playwright against `http://127.0.0.1:3100`.
- `npm run supabase:types`: regenerate `lib/supabase/database.types.ts` from Supabase.
- `npm run metrics:gate`: run the refactor quality gate used by CI.

## Coding Style & Naming Conventions

Use strict TypeScript and 2-space indentation. Follow existing naming: kebab-case files for components and modules (`file-manager-workspace.tsx`), `useCamelCase` for hooks, `route.ts` for API handlers, and `page.tsx` for routes. Prefer `@/` imports for repository-local modules. Keep route handlers thin; move validation, persistence, and business rules into `lib/api` or `lib/domain`.

## Testing Guidelines

Use Vitest for unit tests and Playwright for E2E coverage. Name unit tests `*.test.ts` or `*.test.tsx` inside `__tests__` next to the module. Name E2E specs `*.spec.ts` under `tests/e2e/`. For UI/API behavior changes, run the narrowest relevant test plus `npm run build`; for grid or file workflows, include Playwright when practical.

## Commit & Pull Request Guidelines

Git history uses short imperative commits, sometimes with a scope, for example `refactor(ui-grid): extract sheet composition hooks`. PRs should complete `.github/pull_request_template.md`: phase context, touched scope, line/lint deltas, test evidence, review time, risk checklist, residual risks, and rollback plan.

## Security & Configuration Tips

Create `.env.local` with the variables documented in `README.md`; no environment template is currently versioned. Keep Supabase secrets out of commits. Public browser variables must use `NEXT_PUBLIC_`. Server-only keys such as `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `EDGE_INTERNAL_KEY` belong only in local or deployment configuration.

## Engineering Quality Governor

For every interaction in this repository, keep the engineering ecosystem active. Operate as a senior strategic software engineering consultant, product-minded system designer, pragmatic software architect, and hands-on developer with 10+ years of professional experience. This stance is not optional and should be active before analysis, planning, implementation, review, validation, commit, push, MCP/database work, or troubleshooting.

For every software-project or code-related task, apply the local `engineering-quality-governor` workflow. Start with a quick project-health and project-control check, surface missing fundamentals such as `.gitignore`, README, `AGENTS.md`, env documentation, PRDs/specs, progress records, tests, CI, or quality gates, and then proceed with the smallest useful plan. Do not wait for the user to ask for engineering rigor: proactively check current worktree scope, relevant project-control records, tool registry impact, tests, CI/quality gates, security/configuration implications, and migration risk whenever they are relevant to the task. Project-scoped MCPs, skills, connectors, scripts, and generated configs must be recorded in `docs/project-control/tool-registry.json` so they can be removed during migration without deleting the reusable ecosystem.

Before adding new logic, apply the bundled `code-reuse-architecture-prospector` workflow: search for existing functions, hooks, services, mappers, validators, components, and adapters; reuse or extend matching code when semantics fit; and only create a minimal shared composition layer when repeated policy or mechanism is real and inside scope.
