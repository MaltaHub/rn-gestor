#!/usr/bin/env python3
import argparse
import re
import subprocess
import sys
from pathlib import Path

SKIP_DIRS = {
    ".git",
    ".next",
    "node_modules",
    "playwright-report",
    "test-results",
    "dist",
    "build",
    "coverage",
}

SECRET_PATTERNS = [
    ("private_key", re.compile(r"-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----")),
    ("aws_access_key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("generic_secret_assignment", re.compile(r"(?i)\b(secret|token|api[_-]?key|service[_-]?role[_-]?key)\b\s*[:=]\s*['\"][^'\"]{20,}['\"]")),
    ("supabase_service_role", re.compile(r"(?i)SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['\"]?[^'\"\s]{20,}")),
]

TEXT_SUFFIXES = {
    ".env",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".md",
    ".txt",
    ".sql",
    ".ps1",
    ".sh",
    ".py",
}


def git_files(repo: Path) -> list[Path]:
    try:
        tracked = subprocess.run(
            ["git", "ls-files"],
            cwd=repo,
            check=True,
            capture_output=True,
            text=True,
        )
        untracked = subprocess.run(
            ["git", "ls-files", "--others", "--exclude-standard"],
            cwd=repo,
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return []
    paths = []
    seen = set()
    for line in [*tracked.stdout.splitlines(), *untracked.stdout.splitlines()]:
        if line and line not in seen:
            seen.add(line)
            paths.append(repo / line)
    return paths


def fallback_files(repo: Path) -> list[Path]:
    files = []
    for path in repo.rglob("*"):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        if path.is_file():
            files.append(path)
    return files


def is_text_candidate(path: Path) -> bool:
    if path.name.startswith(".env"):
        return True
    return path.suffix.lower() in TEXT_SUFFIXES


def main() -> int:
    parser = argparse.ArgumentParser(description="Scan text files for common secret leaks.")
    parser.add_argument("repo", nargs="?", default=".", help="Repository root")
    args = parser.parse_args()

    repo = Path(args.repo).resolve()
    files = git_files(repo) or fallback_files(repo)
    findings = []

    for path in files:
        if any(part in SKIP_DIRS for part in path.relative_to(repo).parts):
            continue
        if not is_text_candidate(path):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for index, line in enumerate(text.splitlines(), start=1):
            for name, pattern in SECRET_PATTERNS:
                if pattern.search(line):
                    findings.append((path.relative_to(repo), index, name))

    if findings:
        for path, line, name in findings:
            print(f"{path}:{line}: possible {name}", file=sys.stderr)
        return 1

    print("No obvious secrets detected.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
