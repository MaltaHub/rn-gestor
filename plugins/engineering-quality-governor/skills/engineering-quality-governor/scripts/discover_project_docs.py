#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

DOC_DIR_CANDIDATES = [
    "docs/project-control",
    "docs/product",
    "docs/prd",
    "docs/specs",
    "docs/contracts",
    "docs/epics",
    "docs/architecture",
    "docs/adr",
    "docs/roadmap",
    "project-docs",
    ".project",
    ".specs",
]

ARTIFACT_KEYWORDS = [
    "prd",
    "spec",
    "contract",
    "epic",
    "adr",
    "roadmap",
    "plan",
    "progress",
    "record",
    "requirements",
]


def score_dir(path: Path) -> int:
    score = 0
    lowered = str(path).replace("\\", "/").lower()
    if "project-control" in lowered:
        score += 50
    for keyword in ARTIFACT_KEYWORDS:
        if keyword in lowered:
            score += 8
    try:
        for child in path.iterdir():
            name = child.name.lower()
            if child.is_file() and any(keyword in name for keyword in ARTIFACT_KEYWORDS):
                score += 4
            elif child.is_dir() and any(keyword in name for keyword in ARTIFACT_KEYWORDS):
                score += 6
    except OSError:
        pass
    return score


def discover(repo: Path) -> dict:
    repo = repo.resolve()
    existing_dirs = []
    for candidate in DOC_DIR_CANDIDATES:
        path = repo / candidate
        if path.is_dir():
            existing_dirs.append(
                {
                    "path": str(path.relative_to(repo)),
                    "score": score_dir(path),
                }
            )

    docs_root = repo / "docs"
    if docs_root.is_dir():
        for path in docs_root.iterdir():
            if path.is_dir() and any(keyword in path.name.lower() for keyword in ARTIFACT_KEYWORDS):
                rel = str(path.relative_to(repo))
                if not any(item["path"] == rel for item in existing_dirs):
                    existing_dirs.append({"path": rel, "score": score_dir(path)})

    existing_dirs.sort(key=lambda item: (-item["score"], item["path"]))
    recommended = existing_dirs[0]["path"] if existing_dirs else "docs/project-control"

    artifacts = []
    for root in [repo / item["path"] for item in existing_dirs]:
        for file_path in root.rglob("*"):
            if file_path.is_file() and file_path.suffix.lower() in {".md", ".mdx", ".txt", ".yaml", ".yml", ".json"}:
                rel = str(file_path.relative_to(repo))
                searchable = rel.replace("\\", "/").lower()
                if any(keyword in searchable for keyword in ARTIFACT_KEYWORDS):
                    artifacts.append(rel)

    return {
        "repo": str(repo),
        "found": bool(existing_dirs),
        "recommended_folder": recommended,
        "folders": existing_dirs,
        "artifacts": sorted(artifacts),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Discover project-control documentation folders.")
    parser.add_argument("repo", nargs="?", default=".", help="Repository root")
    parser.add_argument("--create", action="store_true", help="Create the recommended folder when none exists")
    args = parser.parse_args()

    repo = Path(args.repo)
    result = discover(repo)
    if args.create and not result["found"]:
        target = repo / result["recommended_folder"]
        (target / "work-records").mkdir(parents=True, exist_ok=True)
        (target / "adrs").mkdir(parents=True, exist_ok=True)
        result = discover(repo)

    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
