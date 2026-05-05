# Tool Registry

This registry separates reusable ecosystem tools from project-scoped tools and assets.

Authoritative JSON:

- `docs/project-control/tool-registry.json`

Scope meanings:

- `standard_ecosystem`: belongs to the reusable Engineering Quality Governor ecosystem.
- `project_scoped`: exists because of this project and can be reviewed for cleanup during migration.
- `ephemeral`: temporary and should not be committed unless promoted to project scope.

Current inventory:

- Standard ecosystem: `engineering-quality-governor` plugin under `plugins/engineering-quality-governor/`, including the `engineering-quality-governor` and `code-reuse-architecture-prospector` skills.
- Project-scoped assets: `.engineering-quality.yaml`, `docs/project-control/`, and the project-level `AGENTS.md` governor section.
- Project-scoped tools installed from this project request: none yet.

Before adding a Supabase MCP, GitHub MCP, private project skill, or workspace connector, create or update a registry entry with paths, config files, secrets policy, validation evidence, and cleanup instructions.

For migration planning, run:

`python plugins/engineering-quality-governor/skills/engineering-quality-governor/scripts/manage_tool_registry.py . cleanup-plan`
