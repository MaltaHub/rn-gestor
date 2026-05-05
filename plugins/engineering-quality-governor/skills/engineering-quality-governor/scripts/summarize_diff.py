#!/usr/bin/env python3
import argparse
import json
import subprocess
from pathlib import Path


def run_git(repo: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=repo,
        check=False,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def main() -> int:
    parser = argparse.ArgumentParser(description="Summarize the current git diff.")
    parser.add_argument("repo", nargs="?", default=".", help="Repository root")
    parser.add_argument("--staged", action="store_true", help="Summarize staged changes")
    args = parser.parse_args()

    repo = Path(args.repo).resolve()
    diff_args = ["--cached"] if args.staged else []
    name_status = run_git(repo, "diff", *diff_args, "--name-status")
    stat = run_git(repo, "diff", *diff_args, "--stat")
    numstat = run_git(repo, "diff", *diff_args, "--numstat")
    short_status = run_git(repo, "status", "--short")

    files = []
    seen_paths = set()
    for line in name_status.splitlines():
        parts = line.split("\t")
        if len(parts) >= 2:
            path = parts[-1]
            seen_paths.add(path)
            files.append({"status": parts[0], "path": path})

    for line in short_status.splitlines():
        if not line.startswith("?? "):
            continue
        path = line[3:]
        if path not in seen_paths:
            seen_paths.add(path)
            files.append({"status": "??", "path": path})

    totals = {"insertions": 0, "deletions": 0}
    for line in numstat.splitlines():
        parts = line.split("\t")
        if len(parts) >= 3:
            add, delete = parts[0], parts[1]
            if add.isdigit():
                totals["insertions"] += int(add)
            if delete.isdigit():
                totals["deletions"] += int(delete)

    print(
        json.dumps(
            {
                "files": files,
                "totals": totals,
                "untracked_files": [item["path"] for item in files if item["status"] == "??"],
                "stat": stat,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
