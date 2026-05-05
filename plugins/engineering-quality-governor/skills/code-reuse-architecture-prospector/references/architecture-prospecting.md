# Architecture Prospecting

Architecture prospecting is a short investigation that decides whether repeated code should stay local, be reused directly, be extracted, or be composed into a minimal shared structure.

## Signals For Extraction

Extract when:

- The same business rule appears in multiple places.
- The same data transformation is repeated.
- The same validation or permission check is repeated.
- Multiple components or routes coordinate the same workflow differently.
- Tests would need duplicated fixtures or assertions.

## Signals Against Extraction

Do not extract when:

- Similar code encodes different domain rules.
- Only one call site exists.
- The duplication is temporary and already scheduled for deletion.
- The abstraction would require many boolean flags.
- The new module would live in a vague `utils` bucket without ownership.

## Prospecting Steps

1. Inventory candidate symbols and modules.
2. Inspect candidate call sites.
3. Identify repeated policy vs repeated mechanism.
4. Choose the owning layer:
   - UI interaction: component or hook.
   - Use-case orchestration: application service.
   - Business rule: domain module.
   - Persistence/integration: adapter/client/repository-local module.
   - Formatting/mapping: mapper/formatter module.
5. Define the smallest public API.
6. Move one behavior at a time.
7. Add or update tests around the shared behavior.

## Refactor Size

Use a micro plan when the extraction affects one workflow or a few files.

Use a macro plan when:

- More than one feature area is involved.
- Public API contracts change.
- The change affects data, auth, or routing.
- Migration requires staged rollout.

For macro plans, record an ADR or work record before implementation.
