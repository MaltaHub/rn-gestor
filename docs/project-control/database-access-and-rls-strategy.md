# Database Access and RLS Strategy

## Current Strategy

`rn-gestor` uses Supabase as the database and auth provider, but browser data access should go through the Next.js API surface. Server code resolves the authenticated actor, applies role checks, and uses server-only Supabase credentials for persistence and operational views.

This means public tables with RLS enabled and no `anon`/`authenticated` policies are intentional only when every read/write path is mediated by the backend. Direct table access from browser clients is not part of the current contract unless a module explicitly adds least-privilege RLS policies and matching tests.

## Required Rules

- Keep `SUPABASE_SECRET_KEY` and `SUPABASE_SERVICE_ROLE_KEY` server-only.
- Browser code may use `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for Supabase Auth, not for direct business-table reads/writes.
- API route handlers must stay thin and delegate authorization, validation, persistence, and business rules to `lib/api` or `lib/domain`.
- SQL-backed business rules, especially anuncios insights and repeated-car projections, stay authored in migrations/views/functions and are surfaced through backend APIs.
- Any new direct Supabase browser access requires an explicit RLS policy design, a migration, and focused tests.

## Audit Notes From 2026-05-05

- Supabase advisors reported many public tables with RLS enabled and no policies.
- This is acceptable only under the backend-mediated contract above.
- `anuncios_operational_insights` is a core backend-authored view, but the MCP read-only database user cannot execute `resolve_carro_repetido_grupo_id(uuid)`, so read-only MCP inspection of that view currently fails.
- `service_role` can execute the function; `anon` and `authenticated` cannot.

## Hardening Notes From 2026-05-06

- The project-scoped Supabase MCP was changed to `read_only=false` after explicit approval so remote maintenance can be applied through controlled migrations.
- `function_search_path_mutable` advisor warnings were resolved by migration `20260506150338_harden_trigger_function_search_path`.
- `unindexed_foreign_keys` performance advisor warnings were resolved by migration `20260506150820_add_indexes_for_unindexed_foreign_keys`.
- RLS no-policy notices remain intentionally unresolved until a direct browser-table access contract is designed.

## Next Decisions

- Decide whether the read-only MCP role should receive execute on read-only-safe helper functions, or whether an audit-only view/function should be created for MCP inspection.
- Keep `anon`/`authenticated` blocked from helper functions unless direct client data access becomes an intentional product path.
- Enable Supabase Auth leaked-password protection in the Supabase dashboard or management flow.
- Review `citext` in `public` separately before moving the extension because it can affect dependent column/function definitions.
