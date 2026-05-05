# Intake and Diff Contract

Use this workflow to transform a user prompt into a controlled engineering task.

## Strategic Pre-Plan

Create the pre-plan before the implementation plan. Its purpose is to improve the problem definition, not to prescribe code too early.

Capture:

- Real request: what outcome the user needs, not just the literal wording.
- Context: project, stack, affected workflow, existing constraints, and relevant documents.
- Problem shape: bug, feature, refactor, architecture, performance, security, testing, migration, or review.
- Success signal: what must be observable after the work.
- Likely solution direction: conservative first option and why it fits the repo.
- Gaps: missing facts that affect correctness or risk.
- Assumptions: non-blocking choices made to keep progress.

Ask the user only when a gap is blocking, high-risk, or impossible to infer from project context. Otherwise, record the assumption and proceed.

## Risk Classification

- Low: isolated code path, no persisted data, no auth, easy rollback.
- Medium: shared UI, API behavior, public interface, non-trivial state, or moderate refactor.
- High: database schema, RLS, auth, permissions, secrets, payments, data migration, external integration, or broad architecture.
- Critical: destructive operation, production mutation, credential rotation, compliance, or irreversible user-data impact.

Risk affects documentation depth and validation breadth. High and critical tasks require a written diff contract and explicit rollback thinking.

## Diff Contract

Define the contract before editing files.

Minimum fields:

- Objective: the exact outcome the diff must achieve.
- Scope: files, modules, layers, and workflows that may change.
- Out of scope: related improvements intentionally deferred.
- Architecture: boundaries that must hold.
- Data and state: persistence, migrations, cache, invalidation, and compatibility concerns.
- Security: validation, authorization, secrets, privacy, and abuse cases.
- Tests and gates: checks required for confidence.
- Acceptance criteria: observable behavior required for completion.
- Rollback: how to reverse or disable the change.

For small tasks, keep this concise. For medium-or-higher risk work, write the contract to the project-control folder.

## Implementation Rules

- Read the existing code before selecting a pattern.
- Prefer local conventions over generic best practice lists.
- Keep route handlers, controllers, and UI shells thin.
- Put business rules in domain or service modules.
- Keep infrastructure concerns behind adapters or repository-local clients.
- Avoid speculative abstractions.
- Preserve public contracts unless the requested task explicitly changes them.
- Keep the diff narrow enough to review.

## Final Review

Before finalizing:

- Compare the diff against the contract.
- Re-check assumptions that became invalid while coding.
- Confirm validation evidence.
- State any residual risk directly.
