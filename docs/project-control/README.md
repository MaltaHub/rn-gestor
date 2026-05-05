# Project Control

This folder stores auditable engineering planning and progress records.

Use it for PRDs, specs, contracts, epics, ADRs, diff contracts, work records, validation evidence, and project-progress notes that should survive beyond a single chat session.

Default structure:

- `work-records/`: strategic pre-plans, diff contracts, implementation plans, progress updates, and validation evidence.
- `adrs/`: architecture decision records for decisions that should outlive one task.
- `project-tools/`: project-scoped skills, generated references, and helper assets.
- `tool-registry.json`: inventory that separates reusable ecosystem tools from project-scoped tools/assets.

The standard ecosystem also includes `code-reuse-architecture-prospector`, which should be used before adding new logic to find reusable code, detect duplication, and plan minimal composition layers.

The local engineering-quality configuration points here through `.engineering-quality.yaml`.
