# Documentation Workflow

The project-control folder is the audit surface for planning, decisions, progress, and delivery evidence.

## Discovery

At the start of software-project or code-related work, quickly look for:

- `AGENTS.md`
- `.engineering-quality.yaml`
- `docs/project-control/`
- `docs/product/`
- `docs/prd/`
- `docs/specs/`
- `docs/contracts/`
- `docs/epics/`
- `docs/architecture/`
- `docs/adr/`
- `docs/roadmap/`
- `project-docs/`
- `.project/`
- `.specs/`

Use `scripts/discover_project_docs.py` when available. If the script is not practical, emulate it with a fast file search.

## Folder Selection

Choose the folder using this priority:

1. Explicit path provided by the user.
2. Existing folder named `docs/project-control`.
3. Existing folder containing work records, plans, specs, PRDs, contracts, epics, or ADRs.
4. Existing `docs/` folder when it clearly holds project planning documents.
5. New `docs/project-control/` folder when documentation is required and repository writes are allowed.

If several folders qualify, use the one with the clearest planning/progress purpose and mention the choice.

## What To Record

Record medium-or-higher risk work and any task where the user asks for auditability, planning, architecture, or project governance.

Use a work record for:

- Strategic pre-plan.
- Diff contract.
- Macro plan.
- Micro implementation plan.
- Progress checklist.
- Decisions and assumptions.
- Validation evidence.
- Residual risks and rollback.

Small read-only questions do not need a file record unless requested.

## Naming

Use stable, sortable names:

`YYYY-MM-DD-short-task-slug.md`

Place work records under:

`docs/project-control/work-records/`

Use ADRs only for decisions that should outlive the task:

`docs/project-control/adrs/ADR-YYYY-MM-DD-short-title.md`

## Progress Discipline

Update the work record as the plan changes. Do not let it become a fictional plan written only after the work is complete.

Recommended statuses:

- `pending`
- `in_progress`
- `blocked`
- `completed`
- `deferred`

Progress records should be concise and factual. They are for auditability, not ceremony.
