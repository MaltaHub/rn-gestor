# Project Health Audit

Use this reference when a software task starts in an unfamiliar repository or when the repository appears to lack engineering fundamentals.

## Audit Targets

Check for:

- Version-control hygiene: `.gitignore`, ignored env files, generated artifacts, dependency folders, build output, and local tool state.
- Project orientation: `README.md` with setup, development commands, environment variables, and deployment notes.
- Agent orientation: `AGENTS.md` with structure, commands, conventions, tests, security, and PR expectations.
- Environment safety: `.env.example` or README-documented variables, without committing real secrets.
- Project control: PRDs, specs, contracts, epics, ADRs, work records, and progress tracking.
- Quality gates: lint, typecheck/build, unit tests, E2E tests, metrics, and CI.
- Test structure: unit tests near source, E2E tests for critical workflows, fixtures when needed.
- Architecture signals: clear domain/service/infrastructure boundaries.
- Security signals: auth, permissions, secret handling, database rules, and input validation.

## Recommendation Style

Give practical next steps, not generic warnings.

Use this priority:

1. Safety risks: secrets, missing `.gitignore`, auth/data concerns.
2. Reproducibility risks: missing README, env docs, install/build commands.
3. Governance risks: missing `AGENTS.md`, project-control docs, PRD/spec records.
4. Quality risks: missing tests, lint/build gates, CI.
5. Architecture risks: unclear module boundaries or unowned business logic.

## How To Report

For small tasks, summarize only blocking or high-value findings.

For project setup, onboarding, migrations, or new feature work, include:

- Current health snapshot.
- Missing fundamentals.
- Recommended next steps.
- Suggested MCPs, skills, or automations when useful.
- Whether each recommendation is standard ecosystem, project-scoped, or optional.

Do not block the user's requested work unless a missing fundamental creates high risk.
