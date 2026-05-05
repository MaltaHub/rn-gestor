#!/usr/bin/env python3
import argparse
import json
from datetime import date
from pathlib import Path

DEFAULT_REGISTRY = Path("docs/project-control/tool-registry.json")


def default_registry() -> dict:
    return {
        "schema_version": 1,
        "ecosystem": {
            "name": "engineering-quality-governor",
            "standard_ecosystem_paths": [
                "plugins/engineering-quality-governor/",
                ".agents/plugins/marketplace.json",
            ],
            "cleanup_policy": "Keep these paths when migrating the reusable ecosystem; remove them only when uninstalling the governor.",
        },
        "project_scoped_assets": [
            {
                "id": "rn-gestor-engineering-quality-overlay",
                "type": "config",
                "scope": "project_scoped",
                "source": "user_project_request",
                "reason": "Project-specific quality configuration and audit-control folder for rn-gestor.",
                "paths": [
                    ".engineering-quality.yaml",
                    "docs/project-control/",
                ],
                "config_files": [
                    ".engineering-quality.yaml",
                    "docs/project-control/tool-registry.json",
                    "AGENTS.md",
                ],
                "secrets_policy": "No real secrets; project-control records may contain project-sensitive planning data.",
                "cleanup": "For migration cleanup, remove project-scoped files only after exporting required project documentation; in AGENTS.md remove only the Engineering Quality Governor section.",
                "created_at": "2026-05-04",
            }
        ],
        "project_scoped_tools": [],
        "standard_ecosystem_tools": [
            {
                "id": "engineering-quality-governor",
                "type": "plugin",
                "scope": "standard_ecosystem",
                "source": "local_ecosystem",
                "reason": "Reusable engineering governance plugin, skill, references, templates, and scripts.",
                "paths": ["plugins/engineering-quality-governor/"],
                "config_files": [".agents/plugins/marketplace.json"],
                "cleanup": "Do not delete during project-specific cleanup unless uninstalling the ecosystem.",
                "created_at": "2026-05-04",
            },
            {
                "id": "code-reuse-architecture-prospector",
                "type": "skill",
                "scope": "standard_ecosystem",
                "source": "local_ecosystem",
                "reason": "Reusable skill for code reuse discovery, clone detection, and lean architecture composition prospecting.",
                "paths": ["plugins/engineering-quality-governor/skills/code-reuse-architecture-prospector/"],
                "config_files": [".engineering-quality.yaml", "AGENTS.md"],
                "cleanup": "Do not delete during project-specific cleanup unless removing the reusable ecosystem skill.",
                "created_at": "2026-05-04",
            }
        ],
    }


def registry_path(repo: Path) -> Path:
    return repo / DEFAULT_REGISTRY


def read_registry(repo: Path) -> dict:
    path = registry_path(repo)
    if not path.is_file():
        return default_registry()
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default_registry()


def write_registry(repo: Path, data: dict) -> None:
    path = registry_path(repo)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def cmd_init(repo: Path) -> int:
    data = read_registry(repo)
    write_registry(repo, data)
    print(f"Registry ready: {registry_path(repo)}")
    return 0


def cmd_list(repo: Path, scope: str | None) -> int:
    data = read_registry(repo)
    sections = ["standard_ecosystem_tools", "project_scoped_assets", "project_scoped_tools"]
    output = {}
    for section in sections:
        items = data.get(section, [])
        if scope:
            items = [item for item in items if item.get("scope") == scope]
        output[section] = items
    print(json.dumps(output, indent=2, ensure_ascii=False))
    return 0


def cmd_add(repo: Path, args: argparse.Namespace) -> int:
    data = read_registry(repo)
    entry = {
        "id": args.id,
        "type": args.type,
        "scope": args.scope,
        "source": args.source,
        "reason": args.reason,
        "paths": split_csv(args.paths),
        "config_files": split_csv(args.config_files),
        "secrets_policy": args.secrets_policy,
        "cleanup": args.cleanup,
        "created_at": args.created_at or date.today().isoformat(),
    }
    section = "standard_ecosystem_tools" if args.scope == "standard_ecosystem" else "project_scoped_tools"
    existing = [item for item in data.get(section, []) if item.get("id") != args.id]
    existing.append(entry)
    data[section] = existing
    write_registry(repo, data)
    print(json.dumps(entry, indent=2, ensure_ascii=False))
    return 0


def cmd_cleanup_plan(repo: Path) -> int:
    data = read_registry(repo)
    entries = []
    for section in ["project_scoped_assets", "project_scoped_tools"]:
        for item in data.get(section, []):
            entries.append(
                {
                    "id": item.get("id"),
                    "type": item.get("type"),
                    "scope": item.get("scope"),
                    "paths": item.get("paths", []),
                    "config_files": item.get("config_files", []),
                    "cleanup": item.get("cleanup", ""),
                    "note": "Review before deleting; export valuable project records first.",
                }
            )
    print(
        json.dumps(
            {
                "repo": str(repo),
                "delete_candidates": entries,
                "keep": data.get("ecosystem", {}).get("standard_ecosystem_paths", []),
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Manage scoped engineering tool registry.")
    parser.add_argument("repo", help="Repository root")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("init")

    list_parser = subparsers.add_parser("list")
    list_parser.add_argument("--scope", choices=["standard_ecosystem", "project_scoped"])

    subparsers.add_parser("cleanup-plan")

    add_parser = subparsers.add_parser("add")
    add_parser.add_argument("--id", required=True)
    add_parser.add_argument("--type", required=True, choices=["mcp", "skill", "script", "app", "connector", "config", "plugin", "automation"])
    add_parser.add_argument("--scope", required=True, choices=["standard_ecosystem", "project_scoped"])
    add_parser.add_argument("--source", default="user_project_request")
    add_parser.add_argument("--reason", required=True)
    add_parser.add_argument("--paths", default="")
    add_parser.add_argument("--config-files", default="")
    add_parser.add_argument("--secrets-policy", default="No secrets stored in repository.")
    add_parser.add_argument("--cleanup", default="Review registry entry before deletion.")
    add_parser.add_argument("--created-at")

    args = parser.parse_args()
    repo = Path(args.repo).resolve()
    if args.command == "init":
        return cmd_init(repo)
    if args.command == "list":
        return cmd_list(repo, args.scope)
    if args.command == "add":
        return cmd_add(repo, args)
    if args.command == "cleanup-plan":
        return cmd_cleanup_plan(repo)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
