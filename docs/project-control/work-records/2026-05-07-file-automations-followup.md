# 2026-05-07 File Automations Follow-Up

## Scope

Apply the follow-up rule corrections and UI fixes requested after the first vehicle file automation rollout.

## Requested Changes

- Active photo and document repositories must contain only vehicles whose `estado_venda` is different from `VENDIDO`.
- Sold repositories must contain only vehicles whose `estado_venda` is exactly `VENDIDO`.
- Automation repository selectors must allow only root folders.
- The Arquivos UI must avoid overlapping labels, buttons, and panel content.
- The Arquivos header must stop causing top-anchor issues while scrolling.
- The grid must reserve more usable vertical room on mobile landscape.

## Implementation Notes

- File automation routing now treats only normalized `estado_venda = VENDIDO` as sold.
- Current sold vehicles keep document folders under `Documentos vendidos`; unsold vehicles stay under `Documentos`.
- Sold photo folders are moved to the sold photo repository only when the managed photo folder has files, preserving the previous no-empty-sold-photo-folder decision.
- Backend settings validation rejects automation repository folders that are not root folders.
- The automation config UI lists only root folders in repository selectors.
- Arquivos received a final CSS containment layer for command bars, section heads, action groups, labels, and sticky header behavior.
- The grid received a mobile-landscape height override so the table area does not collapse to a single visible row.

## Validation

- `npx tsc --noEmit --pretty false`
- `npx vitest run lib/domain/file-automations/__tests__/service.test.ts components/files/__tests__/folder-tree.test.ts lib/api/grid/__tests__/contract.test.ts`
- `npm run test:unit`
- `npx playwright test tests/e2e/files.spec.ts --workers=1 --reporter=list`
- `npx playwright test tests/e2e/ui-grid.spec.ts --grep "mobile horizontal" --workers=1 --reporter=list`
- `npm run build`
- `git diff --check`
- `npm run metrics:gate` with temporary PR_BODY evidence.
- Remote config root check: all four automation repositories have `parent_folder_id = NULL`.
- Remote reconcile endpoint: processed 116 vehicles.
- Remote distribution after reconcile:
  - `vehicle_documents` in `vehicle_documents_active`: 62 active, 0 sold.
  - `vehicle_documents` in `vehicle_documents_archive`: 54 sold, 0 active.
  - `vehicle_photos` in `vehicle_photos_active`: 62 active, 0 sold.
  - `vehicle_photos` in `vehicle_photos_sold`: 5 sold, 0 active.
  - `carros.tem_fotos`: 7 true, 109 false.
