# Work Record: Code Reuse Architecture Prospector

Date: 2026-05-04
Status: completed
Risk: medium

## Strategic Pre-Plan

The request is to improve the engineering-quality ecosystem with a dedicated capability for intelligent code reuse and pragmatic architecture prospecting. The agent should avoid duplicating logic, search for existing code that already solves similar needs, and, when duplication becomes structural, propose or create a minimal shared composition layer that unifies behavior without drifting outside scope.

## Gaps And Assumptions

- Assumption: this capability should be a reusable standard ecosystem skill bundled under `plugins/engineering-quality-governor/skills/`.
- Assumption: the skill should be integrated into the central governor workflow so it is invoked before implementation and during refactors.
- Assumption: scripts should be dependency-free and conservative, producing candidates and signals rather than rewriting code automatically.
- Assumption: "design pattern composer" is interpreted as a pragmatic composition pattern: factor shared behavior into a small composable module, adapter, hook, service, or utility that covers repeated demands without creating an overbroad framework.

## Diff Contract

Objective:

- Add a reusable skill for code reuse, clone detection, and pragmatic architecture prospecting.

Scope:

- Create a new standard ecosystem skill under the governor plugin.
- Add references, templates, and scripts for reuse discovery, clone detection, and composition planning.
- Update the central governor skill to call this capability before writing new code.
- Update registry/config/docs to identify the new skill as standard ecosystem tooling.

Out of scope:

- Refactoring the application codebase itself in this request.
- Running broad app gates.
- Introducing external dependencies.

Architecture:

- The central governor remains the orchestration layer.
- The new skill owns reusable-code discovery and architecture prospecting.
- Scripts provide candidate evidence; the agent still makes the design decision.

Validation:

- Compile Python scripts.
- Run reuse/clone scripts against the repository.
- Validate JSON registry/plugin files and run secret scan.

Rollback:

- Remove the new skill folder and registry/config references if this capability is not wanted.

## Progress

- [x] Initialize skill.
- [x] Add references, scripts, and templates.
- [x] Integrate with central governor and registry.
- [x] Validate.

## Validation Evidence

- `python -m py_compile`: all new reuse/prospecting scripts compiled successfully.
- `inventory_symbols.py . --limit 5`: inventoried 1,642 reusable symbols in project source after pruning generated/tooling directories.
- `find_reuse_candidates.py . --query "file upload manager workspace" --limit 5`: found existing file workspace/upload candidates such as `FileManagerWorkspace` and upload handlers.
- `detect_code_clones.py . --min-lines 8 --limit 5`: detected clone groups in app source, including repeated API route response/pagination patterns.
- `prospect_composition.py . --query "file upload manager workspace" --limit 5`: recommended a feature component hook or shared component module based on reuse candidates and clone evidence.
- `tool-registry.json`, `plugin.json`, and `.agents/plugins/marketplace.json`: valid JSON.
- `manage_tool_registry.py . list`: new `code-reuse-architecture-prospector` skill is registered as `standard_ecosystem`.
- `manage_tool_registry.py . cleanup-plan`: project cleanup keeps `plugins/engineering-quality-governor/` and `.agents/plugins/marketplace.json`.
- `check_secrets.py .`: no obvious secrets detected.
- `quick_validate.py`: still blocked by missing local Python module `yaml`.

## Current Reuse Capability

- Standard skill: `plugins/engineering-quality-governor/skills/code-reuse-architecture-prospector/`.
- Main workflow: reuse-first search, semantic candidate comparison, clone detection, and conservative composition planning.
- Scripts: symbol inventory, reuse candidate ranking, clone detection, and composition prospecting.

## Residual Risks

- Clone detection is heuristic and must be followed by human/agent inspection before refactoring.
- The official skill validator still requires `PyYAML` in the local Python environment.
- Broad application gates were not run because this change updates the engineering ecosystem, not app runtime behavior.
