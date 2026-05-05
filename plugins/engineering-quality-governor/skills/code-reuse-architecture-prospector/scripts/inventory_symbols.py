#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

from reuse_lib import inventory_symbols, top_terms


def main() -> int:
    parser = argparse.ArgumentParser(description="Inventory reusable symbols in a repository.")
    parser.add_argument("repo", nargs="?", default=".", help="Repository root")
    parser.add_argument("--include-tests", action="store_true", help="Include test files")
    parser.add_argument("--limit", type=int, default=500, help="Maximum symbols to print")
    args = parser.parse_args()

    symbols = inventory_symbols(Path(args.repo), include_tests=args.include_tests)
    print(
        json.dumps(
            {
                "count": len(symbols),
                "top_terms": top_terms(symbols),
                "symbols": symbols[: args.limit],
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
