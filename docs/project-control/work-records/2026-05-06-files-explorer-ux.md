# 2026-05-06 Files Explorer UX

## Scope

Improve the `Arquivos` workspace UI/UX so it behaves more like a folder explorer, while keeping the existing backend contracts for folders, files, uploads, rename, move, delete, and ordering.

## Non-goals

- Do not implement vehicle-sale automation yet.
- Do not add automatic `Vendidos` triggers in this phase.
- Do not change the storage bucket or file ownership model unless required by the Explorer UI.

## Initial Findings

- The files module already supports nested folders, folder move, file move, upload queueing, file rename, delete, preview, and folder breadcrumbs.
- The sidebar currently renders only root folders, so nested folders are navigable from the main list but not visible as a persistent Explorer tree.
- Existing helpers in `components/files/folder-tree.ts` can be extended instead of adding a separate tree model.

## Plan

1. Add reusable folder-tree helpers for descendant expansion and selected-folder ancestry.
2. Replace the root-only sidebar with a recursive Explorer tree, including expand/collapse, active folder state, drag/drop targets, and counts.
3. Refine the browser/list surface to make folder/file rows read more like a file explorer.
4. Cover new tree helpers with Vitest and run targeted plus full validations.

## Status

- Items 1, 2, 3, and 4 are implemented and validated.
- The sidebar now exposes a recursive tree with active-path expansion and breadcrumb context.
- The medium browser view uses explorer-style rows and a clearer header.
- The preview and folder summary panels now surface the current folder path.
- A Playwright smoke test now covers the `/arquivos` explorer flow with mocked folder data.
- No vehicle-sale automation was added in this phase.

## Validation

- `npx tsc --noEmit --pretty false`
- `npx eslint components/files/file-manager-workspace.tsx components/files/folder-tree.ts components/files/__tests__/folder-tree.test.ts`
- `npx vitest run components/files/__tests__/folder-tree.test.ts components/files/__tests__/file-order.test.ts`
- `npx eslint tests/e2e/files.spec.ts`
- `npx playwright test tests/e2e/files.spec.ts --workers=1`
- `npm run test:unit`
- `npm run build`
