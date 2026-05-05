# Work Record: Governor Tooling Scope Enhancement

Date: 2026-05-04
Status: completed
Risk: medium

## Strategic Pre-Plan

The request is to enhance the engineering-quality ecosystem so the consultant stays active for every software prompt, audits missing project fundamentals, guides installation of MCPs and scoped skills, and identifies project-specific tools so they can be removed during migrations without damaging the reusable ecosystem.

## Gaps And Assumptions

- Assumption: the reusable ecosystem remains `plugins/engineering-quality-governor/`.
- Assumption: project-specific tool records belong in `docs/project-control/tool-registry.json`.
- Assumption: project-scoped skills should live under `docs/project-control/project-tools/skills/` unless the user explicitly promotes them to the reusable ecosystem.
- Assumption: no project-scoped MCP or scoped skill is installed yet in this request; only the registry and guidance are being added.

## Diff Contract

Objective:

- Add always-on governance instructions, project health audit support, tool recommendation support, and scoped tool registry support.

Scope:

- Update the governor skill, plugin metadata, skill UI metadata, project config, and `AGENTS.md`.
- Add references for project health audits and tooling scope.
- Add scripts for health audit, tool recommendations, and registry management.
- Add migration cleanup-plan support for project-scoped tools/assets.
- Add tool registry docs and project-tools folder.

Out of scope:

- Installing actual MCP servers or adding credentials.
- Creating project-specific Supabase/GitHub/Playwright skills without a separate approval/request.
- Running broad application gates.

Architecture:

- The standard ecosystem owns reusable scripts, references, templates, and the central skill.
- Project overlays and project-scoped tools are recorded in project-control docs.
- Tool cleanup is registry-driven, not based on guessing paths.

Validation:

- Compile new Python scripts.
- Run health audit, tool recommendations, and registry list commands.
- Validate JSON files.

Rollback:

- Remove newly added references/scripts/assets from the governor plugin.
- Remove `docs/project-control/tool-registry.*` and `docs/project-control/project-tools/` if registry support is not wanted.
- Revert the added `AGENTS.md` governor section if always-on project guidance is not wanted.

## Progress

- [x] Update plugin and skill metadata for always-on governance.
- [x] Add `AGENTS.md` project instruction for active governance on each software task.
- [x] Add project health audit and tooling-scope references.
- [x] Add CLI scripts for health audit, tool recommendation, and registry management.
- [x] Add project-scoped tool registry and project-tools folder.
- [x] Validate scripts and registry.

## Validation Evidence

- `python -m py_compile`: `audit_project_health.py`, `recommend_tools.py`, and `manage_tool_registry.py` compiled successfully.
- `audit_project_health.py .`: 8 passes, 1 warning, 0 failures. The warning is the absence of a versioned `.env.example`; README and local env signals exist.
- `recommend_tools.py .`: recommended Supabase MCP as `project_scoped`, GitHub MCP as standard or project-scoped depending configuration, Playwright workflow skill as `project_scoped`, and Next.js quality skill as standard or project-scoped depending content.
- `manage_tool_registry.py . list`: registry lists the reusable governor as `standard_ecosystem`, the rn-gestor overlay as `project_scoped`, and no installed project-scoped tools yet.
- `manage_tool_registry.py . cleanup-plan`: lists project-scoped delete candidates and standard ecosystem paths to keep. `AGENTS.md` is treated as shared config; cleanup removes only the governor section.
- `tool-registry.json` and `plugin.json`: valid JSON.
- `.agents/plugins/marketplace.json`: valid JSON.
- `check_secrets.py .`: no obvious secrets detected.
- `discover_project_docs.py .`: found `docs/project-control` and both work records.

## Current Tool Scope Inventory

- Standard ecosystem: `engineering-quality-governor` plugin, bundled skill, references, templates, and scripts.
- Project-scoped assets: `.engineering-quality.yaml`, `docs/project-control/`, and the `AGENTS.md` governor section.
- Project-scoped tools installed from this project request: none.

## Residual Risks

- Actual MCP installation still requires user approval, credentials policy, and a registry entry.
- A sanitized `.env.example` is still recommended for better onboarding, but this repository currently documents env usage in README and has local env state.
