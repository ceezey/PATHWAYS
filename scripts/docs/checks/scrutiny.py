"""Scrutiny check: the verified-claim trust rule and the blocking decision gate."""

import re

from .common import parse_tables, rel
from .filing import FILING_RE


_VERDICT_CELL = re.compile(r"\bunverified\b|\bverified\b", re.I)
# URL, DOI, or a year-bearing citation (academic / report style). Pure vibes fail.
_SOURCE_PROVENANCE = re.compile(
    r"(?i)https?://|www\.|doi:\s*\d|10\.\d{4,}/|\b(19|20)\d{2}\b"
)


def _is_verified_finding(cell):
    """Exact verdict match; 'Partially verified' and 'Not verified' do not count."""
    return cell.strip().lower() == "verified"


def _source_has_provenance(src):
    """Cheap signal: Verified sources need a URL, DOI, or year-bearing cite."""
    s = (src or "").strip()
    if not s:
        return False
    return bool(_SOURCE_PROVENANCE.search(s))


def check_scrutiny(target):
    failures, warnings = [], []
    for path in target.rglob("scrutiny-*.md"):
        text = path.read_text(encoding="utf-8", errors="replace")
        if not re.search(r"[Cc]laims extracted\s*:", text):
            failures.append(f"{rel(path)}: missing the claim-coverage line (Claims extracted: N ...)")
        for header, rows in parse_tables(text):
            low = [h.lower() for h in header]
            fi = next((i for i, h in enumerate(low) if "finding" in h or "verdict" in h), None)
            if fi is None:
                if any(_VERDICT_CELL.search(cell) for row in rows for cell in row):
                    failures.append(
                        f"{rel(path)}: a table has Verified/Unverified-looking cells but no "
                        f"recognizable Finding/Verdict column; the trust rule could not run"
                    )
                continue
            verified = [row for row in rows if fi < len(row) and _is_verified_finding(row[fi])]
            if not verified:
                continue
            si = next((i for i, h in enumerate(low)
                       if any(k in h for k in ("source", "evidence", "citation", "reference")) or h == "ref"), None)
            if si is None:
                failures.append(
                    f"{rel(path)}: a table has Verified claims but no recognizable Source "
                    f"column (source/evidence/citation/reference); the trust rule could not run"
                )
                continue
            for row in verified:
                if si >= len(row):
                    continue
                src = row[si].strip()
                if not src or src.startswith("{{") or src.lower() in {"-", "n/a", "tbd", "..."}:
                    failures.append(
                        f"{rel(path)}: 'Verified' claim with no source: {row[:si + 1]}"
                    )
                elif not _source_has_provenance(src):
                    warnings.append(
                        f"{rel(path)}: Verified source looks free-text only "
                        f"(prefer a URL, DOI, or year-bearing cite): {src[:80]}"
                    )
        # Locked scrutiny must not carry a blocking Decision.
        # Match the header Status field only (line-anchored). A loose body search
        # false-positives on Self-Check lines like "Status is not Locked".
        locked = bool(re.search(r"(?im)^\s*\*?\*?Status\*?\*?[\s:*|]+.*\bLocked\b", text))
        decision = re.search(
            r"(?i)(?:Decision|Verdict)\s*[:|*]*\s*(PROCEED(?: WITH FIXES)?|DO NOT BUILD YET)",
            text,
        )
        if locked and decision and "DO NOT BUILD YET" in decision.group(1).upper():
            failures.append(
                f"{rel(path)}: Locked with Decision DO NOT BUILD YET "
                f"(unlock or fix the IDEA before claiming a green suite)"
            )
        # a blocking gate must not sit beside a generated suite.
        if decision and "DO NOT BUILD YET" in decision.group(1).upper():
            failures.extend(_suite_docs_under_blocking_gate(path))
    return failures, warnings


# When Scrutiny says DO NOT BUILD YET, only inception-side docs may share the folder.
_GATE_STOP_ALLOW_PREFIXES = ("idea-", "scrutiny-", "val-", "voice-", "log-")


def _suite_docs_under_blocking_gate(scrutiny_path):
    """FAIL if DO NOT BUILD YET coexists with PRD/SDD/etc. (hollow / blocked e2e)."""
    docs_dir = scrutiny_path.parent
    out = []
    for p in sorted(docs_dir.glob("*.md")):
        name = p.name
        low = name.lower()
        if low == "index.md":
            continue
        if any(low.startswith(pref) for pref in _GATE_STOP_ALLOW_PREFIXES):
            continue
        if FILING_RE.match(name):
            out.append(
                f"{rel(scrutiny_path)}: Decision DO NOT BUILD YET but suite doc exists: "
                f"{name} (stop the build)"
            )
    return out
