from __future__ import annotations

import hashlib
import os
import re
from collections import Counter
from pathlib import Path

SKIP_DIRS = {
    ".git",
    ".next",
    ".turbo",
    "node_modules",
    "playwright-report",
    "test-results",
    "coverage",
    "dist",
    "build",
    "__pycache__",
}

SKIP_PREFIXES = {
    ".agents/",
    "plugins/engineering-quality-governor/",
}

SOURCE_SUFFIXES = {
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".py",
}

SYMBOL_PATTERNS = [
    ("function", re.compile(r"\bexport\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)")),
    ("function", re.compile(r"\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)")),
    ("class", re.compile(r"\bexport\s+class\s+([A-Za-z_$][\w$]*)")),
    ("class", re.compile(r"\bclass\s+([A-Za-z_$][\w$]*)")),
    ("interface", re.compile(r"\bexport\s+interface\s+([A-Za-z_$][\w$]*)")),
    ("type", re.compile(r"\bexport\s+type\s+([A-Za-z_$][\w$]*)")),
    ("const", re.compile(r"\bexport\s+const\s+([A-Za-z_$][\w$]*)\b")),
    ("const", re.compile(r"\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>")),
    ("python_function", re.compile(r"^\s*def\s+([A-Za-z_][\w]*)\s*\(", re.MULTILINE)),
    ("python_class", re.compile(r"^\s*class\s+([A-Za-z_][\w]*)\s*[:(]", re.MULTILINE)),
]


def iter_source_files(repo: Path, include_tests: bool = False) -> list[Path]:
    repo = repo.resolve()
    files = []
    for root, dirnames, filenames in os.walk(repo):
        rel_root = str(Path(root).relative_to(repo)).replace("\\", "/")
        rel_root_prefix = "" if rel_root == "." else f"{rel_root}/"
        if any(rel_root_prefix.startswith(prefix) for prefix in SKIP_PREFIXES):
            dirnames[:] = []
            continue
        dirnames[:] = [dirname for dirname in dirnames if dirname not in SKIP_DIRS]
        root_path = Path(root)
        for filename in filenames:
            path = root_path / filename
            if path.suffix.lower() not in SOURCE_SUFFIXES:
                continue
            rel_text = str(path.relative_to(repo)).replace("\\", "/").lower()
            if any(rel_text.startswith(prefix) for prefix in SKIP_PREFIXES):
                continue
            if not include_tests and any(marker in rel_text for marker in ["__tests__", ".test.", ".spec.", "tests/e2e"]):
                continue
            files.append(path)
    return sorted(files)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def split_words(value: str) -> list[str]:
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", value)
    spaced = re.sub(r"[^A-Za-z0-9_]+", " ", spaced)
    words = []
    for raw in spaced.replace("_", " ").split():
        word = raw.lower()
        if len(word) >= 2:
            words.append(word)
    return words


def path_keywords(path: Path) -> list[str]:
    words = []
    for part in path.parts:
        words.extend(split_words(part))
    return words


def symbol_role(kind: str, name: str) -> str:
    if name.startswith("use") and len(name) > 3 and name[3].isupper():
        return "hook"
    if name[:1].isupper() and kind in {"function", "const"}:
        return "component_or_factory"
    if kind in {"class", "python_class"}:
        return "class"
    if kind in {"interface", "type"}:
        return "type_contract"
    return "callable"


def line_number(text: str, index: int) -> int:
    return text.count("\n", 0, index) + 1


def inventory_symbols(repo: Path, include_tests: bool = False) -> list[dict]:
    repo = repo.resolve()
    symbols = []
    seen = set()
    for file_path in iter_source_files(repo, include_tests=include_tests):
        text = read_text(file_path)
        rel = file_path.relative_to(repo)
        rel_text = str(rel).replace("\\", "/")
        for kind, pattern in SYMBOL_PATTERNS:
            for match in pattern.finditer(text):
                name = match.group(1)
                line = line_number(text, match.start())
                key = (rel_text, name, line)
                if key in seen:
                    continue
                seen.add(key)
                exported = "export" in text[max(0, match.start() - 24) : match.start() + 24]
                keywords = sorted(set(split_words(name) + path_keywords(rel)))
                symbols.append(
                    {
                        "name": name,
                        "kind": kind,
                        "role": symbol_role(kind, name),
                        "path": rel_text,
                        "line": line,
                        "exported": exported,
                        "keywords": keywords,
                    }
                )
    return symbols


def tokenize_query(query: str) -> list[str]:
    stop = {
        "the",
        "and",
        "for",
        "with",
        "from",
        "para",
        "com",
        "uma",
        "que",
        "por",
        "de",
        "do",
        "da",
        "em",
        "no",
        "na",
        "um",
    }
    return [word for word in split_words(query) if word not in stop]


def score_symbol(symbol: dict, query_terms: list[str]) -> tuple[int, list[str]]:
    haystack = set(symbol.get("keywords", []))
    haystack.update(split_words(symbol.get("name", "")))
    haystack.update(path_keywords(Path(symbol.get("path", ""))))
    matches = sorted(term for term in set(query_terms) if term in haystack)
    score = len(matches) * 10
    name_words = set(split_words(symbol.get("name", "")))
    score += len(name_words.intersection(query_terms)) * 8
    if symbol.get("exported"):
        score += 3
    if symbol.get("role") in {"hook", "callable", "component_or_factory"}:
        score += 2
    return score, matches


def normalize_code_line(line: str) -> str:
    line = re.sub(r"//.*$", "", line)
    line = re.sub(r"#.*$", "", line)
    line = re.sub(r"(['\"])(?:\\.|(?!\1).)*\1", "STR", line)
    line = re.sub(r"\b\d+(?:\.\d+)?\b", "NUM", line)
    line = re.sub(r"\s+", " ", line.strip())
    return line


def clone_windows(repo: Path, min_lines: int = 8, include_tests: bool = False) -> list[dict]:
    repo = repo.resolve()
    windows = {}
    for file_path in iter_source_files(repo, include_tests=include_tests):
        rel = str(file_path.relative_to(repo)).replace("\\", "/")
        lines = read_text(file_path).splitlines()
        normalized = [normalize_code_line(line) for line in lines]
        useful = [(index + 1, line) for index, line in enumerate(normalized) if line and line not in {"{", "}", ");", "};"}]
        for offset in range(0, max(0, len(useful) - min_lines + 1)):
            slice_lines = useful[offset : offset + min_lines]
            joined = "\n".join(line for _, line in slice_lines)
            if len(joined) < 80:
                continue
            digest = hashlib.sha1(joined.encode("utf-8")).hexdigest()
            windows.setdefault(digest, {"sample": joined, "locations": []})["locations"].append(
                {
                    "path": rel,
                    "start_line": slice_lines[0][0],
                    "end_line": slice_lines[-1][0],
                }
            )
    clones = []
    for digest, data in windows.items():
        unique_paths = {location["path"] for location in data["locations"]}
        if len(data["locations"]) < 2 or len(unique_paths) < 2:
            continue
        clones.append(
            {
                "hash": digest,
                "occurrences": len(data["locations"]),
                "files": sorted(unique_paths),
                "locations": data["locations"],
                "sample": data["sample"].splitlines()[: min(5, min_lines)],
            }
        )
    clones.sort(key=lambda item: (-item["occurrences"], item["files"]))
    return clones


def top_terms(symbols: list[dict], limit: int = 20) -> list[tuple[str, int]]:
    counter: Counter[str] = Counter()
    for symbol in symbols:
        counter.update(symbol.get("keywords", []))
    return counter.most_common(limit)
