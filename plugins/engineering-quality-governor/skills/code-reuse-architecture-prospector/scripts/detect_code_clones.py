#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

from reuse_lib import clone_windows


def main() -> int:
    parser = argparse.ArgumentParser(description="Detect normalized repeated code windows.")
    parser.add_argument("repo", nargs="?", default=".", help="Repository root")
    parser.add_argument("--min-lines", type=int, default=8, help="Minimum normalized lines in a clone window")
    parser.add_argument("--include-tests", action="store_true", help="Include test files")
    parser.add_argument("--limit", type=int, default=30, help="Maximum clone groups to print")
    args = parser.parse_args()

    clones = clone_windows(Path(args.repo), min_lines=args.min_lines, include_tests=args.include_tests)
    print(
        json.dumps(
            {
                "clone_groups": len(clones),
                "min_lines": args.min_lines,
                "clones": clones[: args.limit],
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
