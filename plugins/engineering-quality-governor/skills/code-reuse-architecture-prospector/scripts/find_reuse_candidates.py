#!/usr/bin/env python3
import argparse
import json
from collections import defaultdict
from pathlib import Path

from reuse_lib import inventory_symbols, score_symbol, tokenize_query


def main() -> int:
    parser = argparse.ArgumentParser(description="Find symbols and files that may already implement a capability.")
    parser.add_argument("repo", nargs="?", default=".", help="Repository root")
    parser.add_argument("--query", required=True, help="Capability terms to search for")
    parser.add_argument("--include-tests", action="store_true", help="Include test files")
    parser.add_argument("--limit", type=int, default=20, help="Maximum candidates to print")
    args = parser.parse_args()

    terms = tokenize_query(args.query)
    symbols = inventory_symbols(Path(args.repo), include_tests=args.include_tests)
    ranked = []
    file_scores = defaultdict(lambda: {"score": 0, "matches": set(), "symbols": []})

    for symbol in symbols:
        score, matches = score_symbol(symbol, terms)
        if score <= 0:
            continue
        ranked.append({**symbol, "score": score, "matches": matches})
        file_item = file_scores[symbol["path"]]
        file_item["score"] += score
        file_item["matches"].update(matches)
        file_item["symbols"].append(symbol["name"])

    ranked.sort(key=lambda item: (-item["score"], item["path"], item["line"]))
    files = [
        {
            "path": path,
            "score": data["score"],
            "matches": sorted(data["matches"]),
            "symbols": sorted(set(data["symbols"]))[:10],
        }
        for path, data in file_scores.items()
    ]
    files.sort(key=lambda item: (-item["score"], item["path"]))

    print(
        json.dumps(
            {
                "query": args.query,
                "query_terms": terms,
                "symbol_candidates": ranked[: args.limit],
                "file_candidates": files[: args.limit],
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
