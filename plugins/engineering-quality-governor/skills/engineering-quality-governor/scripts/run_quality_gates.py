#!/usr/bin/env python3
import argparse
import json
import subprocess
import sys
from pathlib import Path


def load_package_scripts(repo: Path) -> dict:
    package_json = repo / "package.json"
    if not package_json.is_file():
        return {}
    try:
        data = json.loads(package_json.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    scripts = data.get("scripts")
    return scripts if isinstance(scripts, dict) else {}


def load_yaml_gates(repo: Path) -> dict:
    config = repo / ".engineering-quality.yaml"
    if not config.is_file():
        return {}
    gates = {}
    in_gates = False
    for raw_line in config.read_text(encoding="utf-8").splitlines():
        if not raw_line.strip() or raw_line.lstrip().startswith("#"):
            continue
        if raw_line.startswith("gates:"):
            in_gates = True
            continue
        if in_gates:
            if raw_line and not raw_line.startswith(" "):
                break
            stripped = raw_line.strip()
            if ":" in stripped:
                key, value = stripped.split(":", 1)
                value = value.strip().strip("'\"")
                if key and value:
                    gates[key.strip()] = value
    return gates


def detect_gates(repo: Path) -> dict:
    configured = load_yaml_gates(repo)
    if configured:
        return configured

    scripts = load_package_scripts(repo)
    candidates = {
        "lint": "npm run lint",
        "test_unit": "npm run test:unit",
        "build": "npm run build",
        "test_e2e": "npm run test:e2e",
        "metrics": "npm run metrics:gate",
    }
    return {name: command for name, command in candidates.items() if command.split("npm run ", 1)[-1] in scripts}


def main() -> int:
    parser = argparse.ArgumentParser(description="Run repository quality gates.")
    parser.add_argument("repo", nargs="?", default=".", help="Repository root")
    parser.add_argument("--dry-run", action="store_true", help="Print detected gates without running them")
    parser.add_argument("--only", help="Comma-separated gate names to run")
    args = parser.parse_args()

    repo = Path(args.repo).resolve()
    gates = detect_gates(repo)
    if args.only:
        selected = {name.strip() for name in args.only.split(",") if name.strip()}
        gates = {name: command for name, command in gates.items() if name in selected}

    if not gates:
        print("No quality gates detected.")
        return 0

    print(json.dumps(gates, indent=2))
    if args.dry_run:
        return 0

    failed = []
    for name, command in gates.items():
        print(f"\n==> {name}: {command}", flush=True)
        completed = subprocess.run(command, cwd=repo, shell=True)
        if completed.returncode != 0:
            failed.append((name, completed.returncode))

    if failed:
        for name, code in failed:
            print(f"Gate failed: {name} exited with {code}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
