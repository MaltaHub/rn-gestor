# Reuse-First Workflow

Use this guide before writing new code.

## Search Targets

Search for:

- Existing hooks, services, utilities, mappers, validators, guards, adapters, formatters, and API clients.
- Domain nouns and verbs from the user's request.
- Route, page, component, table, event, action, and state names.
- Error messages, labels, constants, test names, and fixture names.

Use both exact search and broader semantic terms. A good search often includes:

- The domain concept.
- The data shape.
- The action verb.
- The UI/API location.
- Related test names.

## Semantic Match

Before reusing code, compare:

- Inputs and output shape.
- Validation and normalization rules.
- Error behavior.
- Authorization or permission assumptions.
- Side effects.
- Cache/state/persistence effects.
- Ownership layer.

Only reuse code when the behavior matches. Similar syntax is not enough.

## Reuse Outcomes

Choose one:

- Direct call: existing function already fits.
- Small extension: existing function owns the concept and can safely support the new variant.
- Adapter: behavior fits but interface differs.
- Extraction: duplicated local logic should move into a shared module.
- Composition layer: repeated policy/mechanism needs a small framework-like module.
- No reuse: similar code has different semantics; document why.

## Anti-Patterns

- Copying a block because it is faster than finding the owner.
- Creating a generic helper from one use case.
- Merging logic with different domain invariants.
- Moving code only to reduce line count.
- Creating abstractions that hide security, auth, or persistence decisions.
