# Composition Pattern

The composer pattern in this ecosystem means creating a small module that assembles reusable policies and mechanisms into one coherent workflow. It is not a license to build a large framework.

## Composer Shapes

Function composer:

- Use for repeated pure transformations or validation chains.
- Keep inputs explicit.
- Return structured results instead of throwing everywhere.

Hook composer:

- Use when React components repeat state, effects, and event orchestration.
- Keep rendering outside the hook.
- Keep server-only behavior out of client hooks.

Service composer:

- Use when routes or UI workflows repeat use-case orchestration.
- Keep transport concerns out of the service.
- Inject infrastructure clients when that improves testability.

Adapter composer:

- Use when external API/database interactions need consistent mapping, retries, or error normalization.
- Keep provider-specific details behind the adapter.

Mapper composer:

- Use when multiple workflows repeat DTO/domain/UI transformations.
- Keep mapping deterministic and testable.

## Minimal API Rules

- Name the module after the domain capability.
- Expose the fewest functions needed by real call sites.
- Avoid boolean flag APIs; prefer explicit functions or strategy objects.
- Keep extension points concrete.
- Write tests for the shared invariant.

## Placement

Choose the most specific stable home:

- `lib/domain/` for business rules.
- `lib/api/` for request/use-case support.
- `lib/supabase/` for Supabase-specific persistence.
- `components/<feature>/` for feature-specific UI composition.
- `components/atoms/` only for genuinely shared atoms.

Do not place project-specific domain logic in a generic utility folder.
