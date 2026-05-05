#!/usr/bin/env python3
import argparse
import json
from pathlib import Path


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""


def has_any(repo: Path, paths: list[str]) -> bool:
    return any((repo / path).exists() for path in paths)


def package_scripts(repo: Path) -> dict:
    package = read_json(repo / "package.json")
    scripts = package.get("scripts")
    return scripts if isinstance(scripts, dict) else {}


def check_contains(text: str, terms: list[str]) -> bool:
    lowered = text.lower()
    return any(term.lower() in lowered for term in terms)


def add(checks: list[dict], name: str, status: str, severity: str, detail: str, recommendation: str = "") -> None:
    checks.append(
        {
            "name": name,
            "status": status,
            "severity": severity,
            "detail": detail,
            "recommendation": recommendation,
        }
    )


def audit(repo: Path) -> dict:
    repo = repo.resolve()
    checks: list[dict] = []

    gitignore = read_text(repo / ".gitignore")
    if gitignore:
        missing_ignores = [
            item
            for item in ["node_modules", ".env", ".next", "build", "test-results", "__pycache__"]
            if item not in gitignore
        ]
        if missing_ignores:
            add(
                checks,
                "gitignore",
                "warn",
                "medium",
                f".gitignore exists but misses common generated/sensitive patterns: {', '.join(missing_ignores)}.",
                "Add missing generated-artifact and secret patterns.",
            )
        else:
            add(checks, "gitignore", "pass", "low", ".gitignore exists and covers common patterns.")
    else:
        add(
            checks,
            "gitignore",
            "fail",
            "high",
            ".gitignore is missing.",
            "Create .gitignore before adding dependencies, env files, build outputs, or local tool state.",
        )

    readme = read_text(repo / "README.md")
    if not readme:
        add(checks, "readme", "fail", "medium", "README.md is missing.", "Create README with setup, commands, env vars, and deployment notes.")
    elif len(readme.strip()) < 500 or not check_contains(readme, ["npm", "install", "env", "supabase", "test", "build"]):
        add(checks, "readme", "warn", "medium", "README.md exists but may not fully document setup, env, and validation.", "Expand README with install, dev, test, build, env, and troubleshooting sections.")
    else:
        add(checks, "readme", "pass", "low", "README.md exists with useful setup signals.")

    agents = read_text(repo / "AGENTS.md")
    if not agents:
        add(checks, "agents", "fail", "medium", "AGENTS.md is missing.", "Create AGENTS.md with project structure, commands, style, tests, security, and PR rules.")
    else:
        expected = ["Project Structure", "Build", "Test", "Security"]
        missing = [term for term in expected if term.lower() not in agents.lower()]
        if missing:
            add(checks, "agents", "warn", "medium", f"AGENTS.md exists but misses sections: {', '.join(missing)}.", "Expand AGENTS.md so coding agents have stable repository guidance.")
        elif "Engineering Quality Governor" not in agents:
            add(checks, "agents", "warn", "low", "AGENTS.md does not mention the engineering-quality governor.", "Add an always-on governance note for software tasks.")
        else:
            add(checks, "agents", "pass", "low", "AGENTS.md includes repository and governor guidance.")

    env_local = has_any(repo, [".env.local", ".env"])
    env_example = has_any(repo, [".env.example", ".env.sample"])
    if env_example:
        add(checks, "env_documentation", "pass", "low", "Versioned env example exists.")
    elif env_local and check_contains(readme, ["env", "NEXT_PUBLIC_", "SUPABASE"]):
        add(checks, "env_documentation", "warn", "low", "Local env exists and README mentions env, but no versioned env example exists.", "Consider adding a sanitized .env.example or a dedicated README env section.")
    else:
        add(checks, "env_documentation", "fail", "high", "Environment variables are not clearly documented.", "Document required env vars without committing real secrets.")

    if (repo / "docs" / "project-control").is_dir():
        add(checks, "project_control", "pass", "low", "docs/project-control exists.")
    else:
        add(checks, "project_control", "warn", "medium", "No docs/project-control folder found.", "Create project-control docs for PRDs, specs, contracts, epics, ADRs, and work records.")

    planning_docs = []
    docs = repo / "docs"
    if docs.is_dir():
        for path in docs.rglob("*"):
            if path.is_file() and path.suffix.lower() in {".md", ".mdx", ".txt", ".yaml", ".yml", ".json"}:
                searchable = str(path.relative_to(repo)).replace("\\", "/").lower()
                if any(term in searchable for term in ["prd", "spec", "contract", "epic", "roadmap", "requirements"]):
                    planning_docs.append(str(path.relative_to(repo)))
    if planning_docs:
        add(checks, "prd_specs", "pass", "low", f"Planning artifacts found: {len(planning_docs)}.")
    else:
        add(checks, "prd_specs", "warn", "medium", "No PRD/spec/contract/epic artifacts found.", "Create lightweight PRD/spec records before large feature work.")

    scripts = package_scripts(repo)
    required_scripts = ["build", "lint"]
    missing_scripts = [script for script in required_scripts if script not in scripts]
    has_tests = any(name.startswith("test") for name in scripts) or (repo / "tests").is_dir()
    if missing_scripts:
        add(checks, "quality_gates", "warn", "medium", f"Missing package scripts: {', '.join(missing_scripts)}.", "Add standard build/lint scripts or configure gates in .engineering-quality.yaml.")
    elif not has_tests:
        add(checks, "quality_gates", "warn", "medium", "Build/lint exist but no tests were detected.", "Add unit or E2E tests for critical workflows.")
    else:
        add(checks, "quality_gates", "pass", "low", "Build/lint/test signals detected.")

    workflow_dir = repo / ".github" / "workflows"
    has_workflow = workflow_dir.is_dir() and (any(workflow_dir.glob("*.yml")) or any(workflow_dir.glob("*.yaml")))
    if has_workflow:
        add(checks, "ci", "pass", "low", "GitHub Actions workflow detected.")
    else:
        add(checks, "ci", "warn", "medium", "No GitHub Actions workflow detected.", "Add CI that runs lint, tests, build, and project-specific quality gates.")

    tsconfig = read_json(repo / "tsconfig.json")
    compiler = tsconfig.get("compilerOptions") if isinstance(tsconfig.get("compilerOptions"), dict) else {}
    if compiler.get("strict") is True:
        add(checks, "typescript_strict", "pass", "low", "TypeScript strict mode is enabled.")
    elif (repo / "tsconfig.json").is_file():
        add(checks, "typescript_strict", "warn", "medium", "TypeScript strict mode is not enabled.", "Enable strict mode or document why it cannot be enabled yet.")

    failed = sum(1 for check in checks if check["status"] == "fail")
    warned = sum(1 for check in checks if check["status"] == "warn")
    return {
        "repo": str(repo),
        "summary": {
            "pass": sum(1 for check in checks if check["status"] == "pass"),
            "warn": warned,
            "fail": failed,
            "health": "needs_attention" if failed or warned else "good",
        },
        "checks": checks,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit project engineering fundamentals.")
    parser.add_argument("repo", nargs="?", default=".", help="Repository root")
    args = parser.parse_args()
    print(json.dumps(audit(Path(args.repo)), indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
