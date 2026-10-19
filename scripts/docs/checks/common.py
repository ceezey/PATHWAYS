"""Shared helpers of the documentation checks: the repository root, path display, tables and docs folder discovery."""

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]


def rel(path):
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def parse_tables(text):
    """Return [(header_cells, [row_cells, ...]), ...] for each pipe table."""
    tables = []
    lines = text.splitlines()
    sep_re = re.compile(r"^\s*\|[\s:\-|]+\|\s*$")
    row_re = re.compile(r"^\s*\|.*\|\s*$")
    i = 0
    while i < len(lines):
        if row_re.match(lines[i]) and i + 1 < len(lines) and sep_re.match(lines[i + 1]):
            header = [c.strip() for c in lines[i].strip().strip("|").split("|")]
            rows = []
            j = i + 2
            while j < len(lines) and row_re.match(lines[j]) and not sep_re.match(lines[j]):
                rows.append([c.strip() for c in lines[j].strip().strip("|").split("|")])
                j += 1
            tables.append((header, rows))
            i = j
        else:
            i += 1
    return tables


def docs_ancestor(path):
    """Return the nearest docs/ directory ancestor of path, or None."""
    for parent in [path.parent, *path.parents]:
        if parent.name == "docs":
            return parent
    return None


def docs_roots(target):
    """Every docs/ folder under target that contains at least one *.md file.

    `benchmarks/` folders hold fixtures, not project docs; skip them.
    """
    roots = set()
    for p in target.rglob("*.md"):
        if "benchmarks" in p.parts:
            continue
        ancestor = docs_ancestor(p)
        if ancestor is not None:
            roots.add(ancestor)
    return roots


def doc_md_files(target):
    """Every *.md under any docs/ folder under target (including nested subdirs)."""
    return sorted(
        p
        for p in target.rglob("*.md")
        if "benchmarks" not in p.parts and docs_ancestor(p) is not None
    )


def is_change_layer_path(path):
    """Historical and change-layer paths skip index/trace filing rules.

    docs/specs/ and docs/changes/ are the change layer. docs/archive/ is historical
    knowledge: deliberately outside the Active context, so it is not held to Locked
    freshness or index-row rules. The voice check still scans all of it.
    """
    parts = path.parts
    try:
        docs_i = parts.index("docs")
    except ValueError:
        return False
    if docs_i + 1 < len(parts) and parts[docs_i + 1] in {"specs", "changes", "archive"}:
        return True
    return False
