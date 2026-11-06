# Arquivos UX redesign

## Objective

Refactor the Arquivos experience into a denser explorer-style workspace: simple text rows in the left folder tree, contextual folder/photo/document icons, a calmer central file browser, and a dedicated right action/inspection column.

## Scope

- Preserve the existing file API, upload, drag/drop, automation, selection, and preview behavior.
- Replace card-like folder rows in the left explorer with compact line rows.
- Use contextual icons for generic folders, photo repositories, document repositories, and file fallbacks.
- Keep desktop layout as left explorer, center browser/preview, and right actions.
- Extend Playwright coverage with objective visual-health checks for columns, row density, icon rendering, and horizontal overflow.

## Implementation

- Added `components/files/icons.tsx` with `FolderIcon` (generic / photos / documents kinds inferred from automation key) and `FileKindIcon` (image / pdf / video / audio / text / fallback / missing).
- Refactored `file-manager-workspace.tsx`:
  - Tree rows now render a label + count badge instead of stacked title/meta; the chevron toggle was replaced with a rotating SVG caret driven by a `--files-tree-depth` CSS var.
  - Directory cards, compact items, large items, and the file thumbnail fallback all use the new icon components.
  - The `files-manage-stack` is hoisted out of the main column and wrapped in its own `<aside className="files-workspace-column files-manage-column">` so the workspace is now a true `[left] [center] [right]` triple at desktop.
- Extended `app/globals.css` with a final "Arquivos UX redesign" block that declares grid-template-areas for 3 columns, sticky manage column, compact tree row sizing, contextual icon colors, and graceful collapse at ≤1279px (left + main, right stacked below) and ≤760px (single column stack).
- Updated `tests/e2e/files.spec.ts` to target the new `.files-tree-folder-label` class for the active folder name and added a new `"Arquivos mantem layout de tres colunas com explorer compacto"` spec that locks in:
  - Left → center → right columns are all visible at 1440×900 with strictly increasing x positions.
  - Every `.files-tree-folder` row renders ≤ 40px tall (density check).
  - At least one `svg[data-folder-icon]` is rendered inside the tree.
  - Document and each column produce no horizontal scroll overflow (>1px fails with a per-column label).

## Validation

- `npx vitest run components/files/__tests__` → 14 files, 42 tests passing.
- `npx tsc --noEmit -p tsconfig.json` → no new errors in the touched files (pre-existing zod/admin route errors are unrelated).
- `npx eslint components/files/icons.tsx components/files/file-manager-workspace.tsx tests/e2e/files.spec.ts` → clean.
- `npx playwright test tests/e2e/files.spec.ts` → 2/2 passed (existing explorer spec + new visual-health spec).
