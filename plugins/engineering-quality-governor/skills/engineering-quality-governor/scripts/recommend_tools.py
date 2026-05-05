#!/usr/bin/env python3
import argparse
import json
from pathlib import Path


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def has_dependency(package_data: dict, name: str) -> bool:
    for key in ["dependencies", "devDependencies", "peerDependencies"]:
        deps = package_data.get(key)
        if isinstance(deps, dict) and name in deps:
            return True
    return False


def recommend(repo: Path) -> dict:
    repo = repo.resolve()
    package_data = read_json(repo / "package.json")
    recommendations = []

    if (repo / "supabase").is_dir() or has_dependency(package_data, "@supabase/supabase-js"):
        recommendations.append(
            {
                "id": "supabase-mcp",
                "type": "mcp",
                "scope": "project_scoped",
                "reason": "Supabase schema, RLS, migrations, and database inspection benefit from direct project-aware tooling.",
                "secrets_policy": "Use least-privilege local credentials or user-level MCP config; do not commit service-role secrets.",
                "registry_required": True,
            }
        )

    if (repo / ".git").is_dir():
        recommendations.append(
            {
                "id": "github-mcp",
                "type": "mcp",
                "scope": "standard_or_project_scoped",
                "reason": "Repository PRs, issues, reviews, workflow runs, and CI evidence benefit from GitHub tooling.",
                "secrets_policy": "Prefer user-level auth; record as project-scoped only if configured for this repository/workspace.",
                "registry_required": "when_project_scoped",
            }
        )

    if has_dependency(package_data, "@playwright/test") or (repo / "tests" / "e2e").is_dir():
        recommendations.append(
            {
                "id": "playwright-workflow-skill",
                "type": "skill",
                "scope": "project_scoped",
                "reason": "Project-specific E2E fixtures, auth setup, ports, and workflows should be documented for repeatable UI validation.",
                "secrets_policy": "Keep test credentials in local env or CI secrets.",
                "registry_required": True,
            }
        )

    if has_dependency(package_data, "next"):
        recommendations.append(
            {
                "id": "nextjs-quality-skill",
                "type": "skill",
                "scope": "standard_or_project_scoped",
                "reason": "Next.js conventions, App Router rules, server/client boundaries, and performance patterns should be explicit.",
                "secrets_policy": "No secrets needed unless the skill includes project-private docs.",
                "registry_required": "when_project_scoped",
            }
        )

    if not (repo / "docs" / "project-control").is_dir():
        recommendations.append(
            {
                "id": "project-control-docs",
                "type": "automation",
                "scope": "project_scoped",
                "reason": "PRDs, specs, contracts, epics, ADRs, and work records need a durable audit folder.",
                "secrets_policy": "No secrets; documents may still contain business-sensitive content.",
                "registry_required": True,
            }
        )

    return {"repo": str(repo), "recommendations": recommendations}


def main() -> int:
    parser = argparse.ArgumentParser(description="Recommend scoped MCPs, skills, and automations.")
    parser.add_argument("repo", nargs="?", default=".", help="Repository root")
    args = parser.parse_args()
    print(json.dumps(recommend(Path(args.repo)), indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
