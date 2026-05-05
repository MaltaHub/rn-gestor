# Testing and Validation

Validation should match risk and blast radius.

## Test Selection

- Pure logic: unit tests.
- Data mapping or service behavior: unit plus focused integration-style tests when dependencies are meaningful.
- API behavior: route/service tests, contract checks, or integration tests.
- UI behavior: component tests for local interactions, Playwright for user workflows.
- Database or auth changes: migration checks, RLS/permission tests, and generated type validation where supported.

## Gate Strategy

Run the narrowest relevant check during development. Before finalizing medium-or-higher risk work, run broader gates.

Common gates:

- lint
- typecheck
- unit tests
- build
- E2E tests for affected flows
- metrics or complexity gates
- secret scan

Use `scripts/run_quality_gates.py --dry-run` to see detected commands.

## Evidence

Final output should state:

- commands run
- pass/fail result
- skipped checks and why
- residual risk

Do not claim validation that was not run.

## Test Quality

- Test behavior, not implementation details.
- Cover failure and permission paths when risk justifies it.
- Keep fixtures realistic but small.
- Avoid brittle snapshots for complex UI unless they are intentionally visual contracts.
- Add regression tests for bugs when practical.
