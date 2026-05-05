#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

from reuse_lib import clone_windows, inventory_symbols, score_symbol, tokenize_query


def suggested_layer(paths: list[str]) -> str:
    if all(path.startswith("components/") for path in paths):
        return "feature component hook or shared component module"
    if all(path.startswith("lib/domain/") for path in paths):
        return "domain module"
    if all(path.startswith("lib/api/") or path.startswith("app/api/") for path in paths):
        return "lib/api service or request helper"
    if all(path.startswith("lib/supabase/") or path.startswith("supabase/") for path in paths):
        return "Supabase adapter or persistence helper"
    if any(path.startswith("app/api/") for path in paths):
        return "thin route handler plus lib/api or lib/domain extraction"
    if any(path.startswith("components/") for path in paths):
        return "feature-local hook/service before global abstraction"
    return "small owned module near the repeated capability"


def main() -> int:
    parser = argparse.ArgumentParser(description="Prospect a conservative composition plan from reuse and clone evidence.")
    parser.add_argument("repo", nargs="?", default=".", help="Repository root")
    parser.add_argument("--query", required=True, help="Capability terms to prospect")
    parser.add_argument("--min-lines", type=int, default=8, help="Minimum normalized lines in clone detection")
    parser.add_argument("--limit", type=int, default=12, help="Maximum candidates to include")
    args = parser.parse_args()

    repo = Path(args.repo)
    terms = tokenize_query(args.query)
    symbols = inventory_symbols(repo)
    scored = []
    for symbol in symbols:
        score, matches = score_symbol(symbol, terms)
        if score > 0:
            scored.append({**symbol, "score": score, "matches": matches})
    scored.sort(key=lambda item: (-item["score"], item["path"], item["line"]))

    clones = clone_windows(repo, min_lines=args.min_lines)
    relevant_paths = sorted({item["path"] for item in scored[: args.limit]})
    clone_matches = [
        clone
        for clone in clones
        if any(path in relevant_paths for path in clone["files"])
    ][: args.limit]

    all_paths = sorted(set(relevant_paths + [path for clone in clone_matches for path in clone["files"]]))
    if clone_matches and len(all_paths) >= 2:
        outcome = "composition_layer"
        reason = "Reuse candidates overlap with repeated code windows across multiple files."
    elif len(relevant_paths) >= 1:
        outcome = "reuse_or_small_extension"
        reason = "Existing symbols match the requested capability; inspect semantics before adding new code."
    else:
        outcome = "new_local_implementation"
        reason = "No strong reuse candidate was found; keep implementation local until a second real use case appears."

    print(
        json.dumps(
            {
                "query": args.query,
                "query_terms": terms,
                "recommended_outcome": outcome,
                "reason": reason,
                "suggested_layer": suggested_layer(all_paths),
                "reuse_candidates": scored[: args.limit],
                "clone_evidence": clone_matches,
                "composition_rules": [
                    "Reuse directly when semantics match.",
                    "Extract only repeated policy or mechanism, not coincidental syntax.",
                    "Keep the public API minimal and owned by the most specific stable layer.",
                    "Add tests around the shared invariant before widening adoption.",
                ],
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
