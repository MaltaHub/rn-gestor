# 2026-05-11 - Playground anchor filters

## Context

Continuation of `feat/playground-anchor-filters` in the Playground feed model. The feature adds feed-owned filter anchors so a base filter can remain applied while runtime user filters stay separately clearable.

## Scope

- Added normalized `anchorFilterColumns` propagation through feed query/domain helpers, workbook migrations, and feed upsert/render utilities.
- Added Hub controls to mark active feed filters as fixed or release them back to regular runtime filters.
- Disabled runtime filter editing for locked feed columns in the canvas.
- Added unit and E2E coverage for anchor filter persistence, migration normalization, target locking, and Hub unanchoring.

## Validation

- `npx vitest run components/playground/__tests__/domain.test.ts components/playground/__tests__/grid-utils.test.ts components/playground/__tests__/migrations.test.ts` - passed, 32 tests.
- `npx playwright test tests/e2e/playground.spec.ts:628 --workers=1 --reporter=list` - target scenario passed; command later hit the tool timeout while the Playwright webserver was being held open.
- `npm run build` - passed. Existing repo warnings remain: hook dependency warnings in `components/playground/playground-workspace.tsx` and `components/ui-grid/holistic-sheet.tsx`, unused import warning in `components/ui-grid/api.ts`, and Next workspace-root warning caused by the nested worktree lockfile.
- `git diff --check` - passed; Git only reported CRLF normalization warnings.
