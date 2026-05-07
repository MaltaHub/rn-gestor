# 2026-05-07 File Automations Plan

## Scope

Plan a configurable vehicle file automation system on top of the existing `Arquivos` module.

Requested automations:

- Photo folders for vehicles, split between non-sold and sold repositories.
- Document folders for vehicles, with archive behavior when a vehicle is deleted.
- Admin-selectable repository folders, stored by folder id so renames do not break automation.
- Admin-selectable vehicle display field for managed folders, while the stored folder name remains the vehicle id.
- New `carros.tem_fotos` field.
- Protection against deleting folders selected as automation repositories.

## Current Findings

- The existing files module already has `arquivos_pastas`, `arquivos_arquivos`, nested folders, rename, move, delete, upload, ordering, signed previews, and audit logs.
- File storage paths are based on folder ids, so folder rename/move does not break storage object paths.
- `arquivos_pastas.nome_slug` is currently globally unique. This must change before vehicle-id folders can exist under both photo and document repositories.
- `carros` mutations already flow through `lib/domain/carros/service.ts` from the grid mutation dispatcher.
- `/api/v1/finalizados/[id]` marks a car as sold by updating `estado_venda`, `em_estoque`, and `data_venda`.
- `documentos` exists as a checklist table keyed by `carro_id`, but it is not yet connected to file folders.
- A previous files UX work record explicitly left vehicle-sale automation out of scope, so this is a new phase rather than a continuation already implemented.

## Proposed Data Model

1. Add `carros.tem_fotos boolean not null default false`.
2. Replace global folder slug uniqueness with parent-scoped uniqueness:
   - Allow the same vehicle id slug under `Fotos`, `Documentos`, and archive roots.
   - Keep uniqueness for siblings under the same parent.
3. Add automation configuration table, tentatively `arquivo_automacao_config`:
   - `automation_key`: `vehicle_photos_active`, `vehicle_photos_sold`, `vehicle_documents_active`, `vehicle_documents_archive`.
   - `repository_folder_id`: FK to `arquivos_pastas(id)` with delete restricted.
   - `display_field`: whitelisted vehicle display column, default `placa`.
   - `enabled`, `updated_at`, `updated_by`.
4. Add managed folder mapping table, tentatively `arquivo_automacao_folders`:
   - `automation_key`
   - `folder_id`
   - `carro_id` nullable for archived folders after car deletion
   - `entity_snapshot jsonb` for archived label data such as plate/model
   - unique constraints for active vehicle mappings and folder ownership.

## Automation Rules

### Photos

- Every current vehicle should have one managed photo folder under the repository matching its sale state.
- Physical managed folder name and slug should be the vehicle id.
- UI label should come from the configured vehicle display field, usually `placa`, with id fallback.
- When a vehicle becomes sold, move its managed photo folder to the sold photo repository by updating `parent_folder_id`.
- `carros.tem_fotos` should be recalculated from the managed photo folder file count. Proposed invariant: `true` only when the vehicle has at least one file in its managed photo folder subtree; `false` when the folder is missing or empty.

### Documents

- Every vehicle in `carros` should have one managed document folder under the configured documents repository.
- Physical managed folder name and slug should be the vehicle id.
- On vehicle delete:
  - if the managed document folder subtree has files, move that folder to the configured document archive repository and keep a snapshot label;
  - if it has no files, delete the empty managed folder subtree.
- The existing `documentos` checklist table can continue to cascade on vehicle delete; file archive behavior is separate and folder-backed.

## API And UI Plan

1. Add backend service in `lib/domain/file-automations/` for:
   - loading config,
   - validating folder repositories,
   - ensuring vehicle folders,
   - moving folders on sale/delete,
   - recalculating `tem_fotos`,
   - checking whether a folder is protected by automation.
2. Add admin API routes:
   - `GET /api/v1/files/automation-config`
   - `PATCH /api/v1/files/automation-config`
   - optional `POST /api/v1/files/automations/reconcile` for manual backfill/recovery.
3. Extend file folder API responses with automation metadata:
   - `displayName`
   - `physicalName`
   - `automationKey`
   - `managedCarroId`
   - `isAutomationRepository`
   - `isManagedFolder`
4. Add a compact admin settings panel to `/arquivos`:
   - selectors for photo active repository, photo sold repository, documents repository, documents archive repository;
   - selector for vehicle display field;
   - action to run reconciliation.
5. Update folder tree/browser labels to render `displayName` while preserving the physical `name` for audit/detail context.

## Protection Rules

- DB-level protection: config FK to `arquivos_pastas(id)` must use restricted delete behavior.
- API-level protection: folder delete must reject deletion when the target folder or any descendant is configured as an automation repository.
- Folder rename remains allowed because automation uses folder ids.
- Moving a repository folder can remain allowed if its id is unchanged, but the UI should make the repository role visible.

## Implementation Sequence

1. Migration: `tem_fotos`, parent-scoped folder slug uniqueness, automation config/mapping tables, default config rows.
2. Type regeneration: `npm run supabase:types`.
3. Backend service and API routes for config, reconciliation, delete/sale hooks, and folder delete guard.
4. Integrate car lifecycle:
   - on create/update in `lib/domain/carros/service.ts`,
   - on delete in `deleteCarro`,
   - on finalize in `/api/v1/finalizados/[id]`.
5. Integrate file lifecycle:
   - recalc `tem_fotos` on upload, delete, move, and folder automation changes.
6. UI changes in `components/files/` for settings and display labels.
7. Tests and validation:
   - file automation service unit tests,
   - folder slug scoping tests,
   - folder delete protection tests,
   - grid contract test for `tem_fotos`,
   - targeted files Playwright flow when practical,
   - `npm run test:unit`,
   - `npm run build`,
   - Supabase dry run before remote push.

## Open Decisions

- Confirmed: `tem_fotos` is file-backed and should be true only when the managed photo folder subtree has at least one file.
- Confirmed: sold vehicles with no photos should not get an empty folder under the sold photo repository.
- Confirmed: managed vehicle folder display whitelist is `placa`, `nome`, `chassi`, `modelo`, `id`.
- Confirmed: default document archive name is `Documentos Vendidos`.

## Implementation Status

- Added migration `20260507143000_vehicle_file_automations.sql`.
- Added backfill migrations `20260507154500_backfill_legacy_vehicle_photo_folders.sql` and `20260507161000_cleanup_empty_legacy_vehicle_photo_folders.sql`.
- Added backend automation service, config API, and reconcile API.
- Connected car lifecycle hooks for create/update/finalize/delete.
- Connected file lifecycle hooks for upload, direct upload finalize, move, delete, and folder delete/move.
- Added `tem_fotos` to the Carros grid as a readable backend-authored field.
- Added file-manager admin controls for repository selectors, display-field selector, and reconciliation.

## Validation

- `npx tsc --noEmit --pretty false`
- `npx vitest run components/files/__tests__/folder-tree.test.ts lib/domain/file-automations/__tests__/service.test.ts lib/api/grid/__tests__/contract.test.ts`
- `npm run test:unit`
- `npm run build`
- `npx playwright test tests/e2e/files.spec.ts --workers=1 --reporter=list`
- `git diff --check`
- `npx supabase migration list`
- `npx supabase db push --dry-run`
- `npx supabase db push --yes`
- Local admin reconcile endpoint: `POST /api/v1/files/automations/reconcile`, processed 116 vehicles.
- Remote SQL checks:
  - `vehicle_documents`: 116 active links.
  - `vehicle_photos`: 67 active links after legacy photo backfill.
  - `carros.tem_fotos`: 7 true, 109 false.
  - legacy plate folders under the photo repository: 0 remaining.
- `npm run metrics:gate` with a temporary PR_BODY containing the required checklist/test evidence.
- Final isolated Playwright check: 1 passed.

## Remote Migration Status

- Remote migrations are aligned through `20260507161000_cleanup_empty_legacy_vehicle_photo_folders.sql`.
