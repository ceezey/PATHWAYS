"""Inception check: a locked IDEA must carry its load-bearing fields."""

import re

from .common import docs_ancestor, docs_roots, rel


# Load-bearing IDEA labels (IDEA lock bar).
_IDEA_LOAD_BEARING = (
    (r"(?im)^\*\*One-line pitch:\*\*\s*(.*)$", "One-line pitch"),
    (r"(?im)^\*\*Problem:\*\*\s*(.*)$", "Problem"),
    (r"(?im)^\*\*Insight \(why us, why now\):\*\*\s*(.*)$", "Insight"),
    (r"(?im)^\*\*Primary user \(named, specific\):\*\*\s*(.*)$", "Primary user"),
    (r"(?im)^\*\*Their moment of pain:\*\*\s*(.*)$", "Their moment of pain"),
    (r"(?im)^\*\*If we only ship one thing:\*\*\s*(.*)$", "If we only ship one thing"),
)


def _is_locked_status(text):
    if re.search(r"(?im)^\s*\*?\*?Status\*?\*?[\s:*|]+.*\bLocked\b", text):
        return True
    return bool(re.search(r"(?i)\bStatus\b[^\n]{0,40}\bLocked\b", text))


def _is_hollow_idea_value(value):
    v = (value or "").strip()
    if not v:
        return True
    if v.startswith("{{"):
        return True
    low = v.lower()
    if low in {"tbd", "...", "…", "-", "n/a", "todo", "tbc"}:
        return True
    if low.startswith("tbd ") or low.startswith("tbd;") or low.startswith("tbd,"):
        return True
    return False


def _idea_paths(target):
    """Filled IDEA docs under docs/ plus root IDEA.md next to a docs/ root."""
    paths = []
    for d in docs_roots(target):
        paths.extend(sorted(d.glob("idea-*.md")))
        root_idea = d.parent / "IDEA.md"
        if root_idea.is_file():
            paths.append(root_idea)
    # Target itself may be a project root with IDEA.md and no nested scan yet
    if (target / "IDEA.md").is_file() and (target / "IDEA.md") not in paths:
        paths.append(target / "IDEA.md")
    # Dedupe preserving order
    seen = set()
    out = []
    for p in paths:
        rp = p.resolve()
        if rp not in seen:
            seen.add(rp)
            out.append(p)
    return out


def check_inception(target):
    """Locked IDEA must have non-hollow load-bearing fields. Optional pitch IDEA link WARN."""
    failures, warnings = [], []
    for path in _idea_paths(target):
        text = path.read_text(encoding="utf-8", errors="replace")
        if not _is_locked_status(text):
            continue
        for pattern, label in _IDEA_LOAD_BEARING:
            m = re.search(pattern, text)
            if not m:
                failures.append(
                    f"{rel(path)}: Locked IDEA missing load-bearing field '{label}' "
                    f"(IDEA lock bar / inception)"
                )
                continue
            if _is_hollow_idea_value(m.group(1)):
                failures.append(
                    f"{rel(path)}: Locked IDEA hollow '{label}': {m.group(1)!r} "
                    f"(IDEA lock bar / inception)"
                )
    for path in sorted(p for p in target.rglob("pitch-*.md") if docs_ancestor(p)):
        text = path.read_text(encoding="utf-8", errors="replace")
        if not _is_locked_status(text):
            continue
        if not re.search(r"(?im)^\*\*IDEA:\*\*\s*.*idea-", text) and not re.search(
            r"(?im)^\*\*IDEA:\*\*\s*\[[^\]]+\]\([^)]*idea-", text
        ):
            # Also accept plain path after IDEA:
            if not re.search(r"(?im)^\*\*IDEA:\*\*\s*\S*idea-\S+", text):
                warnings.append(
                    f"{rel(path)}: Locked PITCH has no IDEA link to an idea-*.md "
                    f"(continuity)"
                )
    return failures, warnings
