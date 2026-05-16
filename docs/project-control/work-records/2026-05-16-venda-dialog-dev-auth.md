# 2026-05-16 - Venda dialog dev auth validation

## Context

The venda dialog opened from the carros editor failed in local Playwright/dev mode before calling `/api/v1/vendas`.

## Root Cause

The local development actor had `authUserId: null`, but the dialog requires an authenticated seller id for `vendedor_auth_user_id`.

## Scope

- Added deterministic dev `authUserId` values per role in the shared auth-session domain module.
- Propagated the dev auth user id through client API headers and the development-only API actor parser.
- Added Playwright coverage for registering a venda from the carros form dialog.

## Validation

- `npx playwright test tests/e2e/ui-grid.spec.ts --grep "modo editor|registra venda" --workers=1 --reporter=list --max-failures=1`
- `npm run build`
