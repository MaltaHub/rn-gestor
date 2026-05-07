# 2026-05-07 Anuncios `no_instagram` Field

## Scope

Add the `no_instagram` boolean column to `public.anuncios` so the app can track which ads were published on Instagram.

## Plan

1. Add a Supabase migration for the new column with a safe default.
2. Update generated database types and the anuncios domain/API contracts.
3. Expose the field in the anuncios grid config and ERP console form.
4. Align the relevant tests and validate the change path.

## Status

- Migration, contracts, UI, and tests were updated locally.
- `npx supabase db push --dry-run` confirms `20260507103000_add_no_instagram_to_anuncios.sql` is the pending migration.
- Remote push is blocked until `SUPABASE_DB_PASSWORD` is available in the shell environment.

## Validation

- `npx tsc --noEmit --pretty false`
- `npx eslint lib/domain/anuncios/service.ts app/api/v1/anuncios/route.ts app/api/v1/anuncios/[id]/route.ts lib/api/grid-config.ts lib/api/grid/__tests__/contract.test.ts components/erp-console.tsx tests/e2e/ui-grid.spec.ts`
- `npm run test:unit`
- `npm run build`
