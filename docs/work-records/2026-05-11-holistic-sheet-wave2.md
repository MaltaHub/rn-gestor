# Holistic Sheet Wave 2

## Context

Wave 2 continues the extraction of `components/ui-grid/holistic-sheet.tsx` on branch `refactor/holistic-sheet-wave2`.

## Diff Contract

- Objective: extract 2 to 4 focused hooks from `HolisticSheet` while preserving the public component API.
- Scope: `components/ui-grid/holistic-sheet.tsx`, new files under `components/ui-grid/hooks/`, and this work record.
- Out of scope: schema changes, API changes, dependency additions, broad rewrites, and inline edit extraction if refs or optimistic mutation surfaces become too wide.
- Validation: after each hook extraction, run `npm run test:unit` and `npx tsc --noEmit`; revert the extraction immediately if either fails.
- Rollback: revert the extraction commit for the failing hook.

## Reuse Decision

Existing Wave 1 hooks use local `useState` or small effect ownership under `components/ui-grid/hooks/`. Wave 2 will follow that style instead of adding a new abstraction layer outside `ui-grid`.
