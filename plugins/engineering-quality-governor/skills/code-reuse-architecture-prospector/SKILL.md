---
name: code-reuse-architecture-prospector
description: Intelligent code reuse and pragmatic architecture prospecting for software tasks. Use before writing new code, during refactors, when similar logic may already exist, when duplicated code appears, when hooks/services/utilities/components overlap, or when Codex should compose a minimal shared abstraction, helper, hook, adapter, service, or framework-like module that unifies repeated logic without widening scope.
---

# Code Reuse Architecture Prospector

## Overview

Use this skill to prevent unnecessary code duplication and to prospect a lean architecture before implementation. The goal is to search first, reuse existing behavior when possible, and only introduce a shared composition layer when repeated logic is real, stable, and worth unifying.

## Reuse-First Workflow

1. Clarify the behavior being requested.
   - Name the capability in domain terms.
   - Identify inputs, outputs, side effects, persistence, and UI/API boundaries.
   - Separate exact behavior from incidental implementation details.

2. Search for existing code before adding new code.
   - Use repository search for domain terms, route names, component names, hook names, data mappers, validators, formatters, clients, and service functions.
   - Run `scripts/inventory_symbols.py <repo>` to map reusable symbols.
   - Run `scripts/find_reuse_candidates.py <repo> --query "<capability terms>"` when the task has clear terms.
   - Prefer calling or extending existing functions over copying logic.

3. Compare candidate semantics, not just names.
   - Confirm the candidate has compatible behavior, constraints, error handling, and ownership.
   - Do not reuse code that only looks similar but encodes a different invariant.
   - If a candidate is close but incomplete, prefer extending it in-place only when its ownership still fits.

4. Detect duplication when the codebase shows repeated patterns.
   - Run `scripts/detect_code_clones.py <repo>` for line-window clone signals.
   - Treat script output as evidence to inspect, not as automatic truth.
   - For broad refactors, read `references/architecture-prospecting.md`.

5. Prospect a composition layer when repetition is structural.
   - Run `scripts/prospect_composition.py <repo> --query "<capability terms>"`.
   - Create a shared abstraction only when at least two real call sites need the same policy or mechanism.
   - Keep the abstraction minimal: one helper, hook, adapter, service, mapper, strategy object, or small module.
   - Do not create a broad framework unless a macro pattern has stable variants and clear extension points.

6. Apply the smallest safe design.
   - Reuse directly when an existing function already fits.
   - Extract shared logic when duplication exists inside the changed scope.
   - Compose a small module when multiple workflows need the same reusable behavior.
   - Leave unrelated duplication alone unless the user requested a refactor or the duplication blocks the task.

7. Record the reuse decision for medium-or-higher risk changes.
   - State what was searched.
   - State what was reused or why reuse was rejected.
   - State whether a new composition layer was created.
   - Use `assets/composition-plan-template.md` for substantial refactors.

## Decision Rules

- Reuse beats rewrite when semantics match.
- Extension beats duplication when ownership is correct.
- Extraction beats framework when the need is local.
- Composition beats inheritance unless the repository already uses inheritance for the same pattern.
- A new abstraction must reduce net complexity in the current or near-term codebase.
- Avoid "utility dumping"; place shared code in the layer that owns the concept.
- Keep public contracts stable unless the task explicitly changes them.

## Reference Selection

- `references/reuse-first-workflow.md`: practical search and semantic matching guidance.
- `references/architecture-prospecting.md`: how to evaluate repeated code and choose extraction vs composition.
- `references/composition-pattern.md`: minimal composer-style patterns for hooks, services, adapters, and domain utilities.

Load only the references needed for the current task.

## Scripts

- `scripts/inventory_symbols.py <repo>`: list reusable functions, classes, hooks, components, exported constants, and modules.
- `scripts/find_reuse_candidates.py <repo> --query "<terms>"`: rank symbols and files that may already solve the requested behavior.
- `scripts/detect_code_clones.py <repo> [--min-lines 8]`: find normalized repeated line windows as clone signals.
- `scripts/prospect_composition.py <repo> --query "<terms>"`: combine reuse and clone evidence into a conservative composition plan.

Prefer `rg` and repository-native search for precise follow-up inspection after scripts surface candidates.
