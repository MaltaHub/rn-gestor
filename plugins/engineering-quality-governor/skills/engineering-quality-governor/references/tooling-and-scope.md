# Tooling and Scope

Use this reference before recommending or installing MCPs, scoped skills, scripts, apps, connectors, or generated tool configs.

## Scope Classes

`standard_ecosystem`:

- Belongs to the reusable engineering-quality ecosystem.
- Safe to migrate with the ecosystem.
- Examples: core governor skill, generic quality scripts, generic templates, architecture references.

`project_scoped`:

- Exists because of this project, repository, database, product, workspace, credentials, schema, or private workflow.
- Must be easy to identify and delete during project migration.
- Examples: Supabase MCP bound to one project, private API schema skill, project-specific PRD skill, Jira/Linear workspace integration, generated docs for a specific database.

`ephemeral`:

- Temporary investigation or one-off helper.
- Should not be committed unless it becomes a project-scoped artifact.

## Installation Policy

Before installing or creating a tool:

1. State why the tool is needed.
2. Classify the scope.
3. Identify where files/config will live.
4. Explain credential handling.
5. Confirm validation and rollback.
6. Record project-scoped tools in `docs/project-control/tool-registry.json`.

Do not store real secrets in repository files. Prefer local user config or environment variables for credentials.

## MCP Guidance

Recommend an MCP when direct tool access materially improves correctness or reduces manual work.

Common examples:

- Supabase MCP: useful for schema, policies, migrations, and database inspection. Usually `project_scoped` because it is tied to a project ref and credentials.
- GitHub MCP: useful for PRs, issues, reviews, workflow runs, and repository metadata. Usually reusable, but registry entries should mention repo-specific use if configured narrowly.
- Browser/Playwright automation: useful for UI verification. Usually standard if generic, project-scoped when fixtures or credentials are project-specific.

For high-risk MCPs, require least privilege and document what actions are allowed.

## Scoped Skill Guidance

Create a scoped skill when the project has durable knowledge Codex should reuse:

- domain vocabulary
- API contracts
- database schemas
- UI design system rules
- team-specific review standards
- product workflows

Store reusable ecosystem skills under the plugin. Store project-specific skills under a project-scoped folder and register them.

Recommended project path:

`docs/project-control/project-tools/skills/<skill-name>/`

## Registry Requirements

Every project-scoped tool entry should include:

- `id`
- `type`
- `scope`
- `source`
- `reason`
- `paths`
- `config_files`
- `secrets_policy`
- `cleanup`
- `created_at`

Use `scripts/manage_tool_registry.py <repo> add ...` when possible.

## Migration Cleanup

Before migrating or extracting the reusable ecosystem:

1. Run `manage_tool_registry.py <repo> cleanup-plan`.
2. Review each entry's cleanup instructions.
3. Delete only project-scoped paths/configs listed in the registry.
4. Keep `standard_ecosystem` paths unless intentionally uninstalling the governor.
