"""PATHWAYS documentation governance checks.

Usage:
    python scripts/docs/check.py [TARGET] [--only voice,scrutiny,inception,trace,coverage,currency,filing,project-specific]
                                 [--strict]

TARGET defaults to the repo root. The usual call is `pnpm docs:check`
(`python scripts/docs/check.py docs`).

Exit code is non-zero if any check FAILS. By default warnings do not fail the
run; pass --strict to treat warnings as failures.

Voice rules: registered docs use zero em-dashes. The voice check FAILS on an
em-dash glyph (U+2014) or look-alike in any doc under docs/, the materialized root
AGENTS/BRAND/DESIGN, README.md, and root agent guide files. The en-dash for ranges
(1-3) is allowed. Root IDEA.md is an external source record (manuscript) and is
not voice-scanned. Banned stock phrases and AI-tool markup artifacts (oaicite,
contentReference, turn0search0-style placeholders, grok_card, attributableIndex)
FAIL on docs; inline and fenced code are skipped.
"""
import argparse
import html
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# The em-dash ban covers the em-dash and every dash look-alike, however encoded. A
# line is HTML-entity-decoded first (catches &mdash;, &#8212;, &#x2014;, etc. in one
# pass), then scanned for any Unicode "Dash Punctuation" (category Pd) character
# outside the allow-set: ASCII hyphen-minus and the en-dash (U+2013) for numeric
# ranges (1-3). This is a category sweep, not an enumerated glyph list, so a new
# dash look-alike (fullwidth hyphen, figure dash, horizontal bar, two/three-em dash,
# ...) is caught without needing to be named individually.
DASH_ALLOWED = {"-", "–"}
DASH_EXTRA_BANNED = {"\u2212"}  # minus sign (Sm); not caught by the Pd category sweep
REPLACEMENT = "�"  # errors="replace" yields this for a non-UTF-8 byte


def _has_banned_dash(line):
    decoded = html.unescape(line)
    return any(
        ch in DASH_EXTRA_BANNED or (unicodedata.category(ch) == "Pd" and ch not in DASH_ALLOWED)
        for ch in decoded
    )


def _has_spaced_endash_as_punct(line):
    """En-dash (U+2013) with whitespace on either side is punctuation, not a range."""
    decoded = html.unescape(line)
    for i, ch in enumerate(decoded):
        if ch != "\u2013":
            continue
        before = decoded[i - 1] if i > 0 else ""
        after = decoded[i + 1] if i + 1 < len(decoded) else ""
        if before.isspace() or after.isspace():
            return True
    return False

# Materialized root outputs (generated from a canonical doc). They are external
# surfaces, so the voice check scans them for em-dashes too, not just docs/.
EXTERNAL_ROOT_OUTPUTS = ("README.md", "BRAND.md", "DESIGN.md", "MODEL_CARD.md")

# System / guide files scanned for the em-dash glyph (NOT for banned phrases, which
# they legitimately quote when documenting the ban list). README/BRAND/DESIGN are
# handled separately as materialized root outputs.
GUIDE_FILES = ("AGENTS.md", "CLAUDE.md", "GEMINI.md", "CHANGELOG.md")
GUIDE_GLOBS = (".cursor/rules/*.mdc", ".cursor/rules/*.md")

# High-confidence stock phrases that never belong in a filled doc. Kept tight
# on purpose; judgment-based tells stay in the VOICE doc.
BANNED_PHRASES = [
    "in today's fast-paced world",
    "in the ever-evolving",
    "it's worth noting that",
    "it is worth noting that",
    "at the end of the day",
    "needless to say",
    "game-changing",
    "best-in-class",
    "great question!",
    "i'd be happy to help",
    "delve into",
    "delve deeper",
    "cutting-edge",
    "synergy",
    "world-class",
    "paradigm shift",
    "dive in",
    "that being said",
    "in the realm of",
    "a testament to",
    "serves as a testament",
    "left an indelible mark",
    "a stark reminder",
    "navigating the complexities",
    "unlock the full potential",
]
# This is a high-confidence subset on purpose: only phrases that are slop in any
# context. Curly apostrophes are normalized before matching. The broader anti-slop
# net (leverage-as-verb, robust-without-specifics, listicle voice, etc.) is
# judgment-based and lives in docs/voice-pathways.md, not here; a green voice
# check means "no high-confidence tells", not "no slop".

# "--" used as punctuation (a spaced em-dash substitute) on a content line, after
# inline code is removed (where "--" is legitimate: CLI flags, shell). Whitespace on
# either side catches `foo --bar` and `word --`; unspaced `word--word` badge tokens
# stay allowed.
_INLINE_CODE = re.compile(r"`[^`]*`")
_DASH_PUNCT = re.compile(r"(?<!-)(?<=\s)--(?!-)|(?<!-)--(?=\s)(?!-)")
# A GFM table separator row (e.g. "| -- | ------- |") is not prose punctuation.
_TABLE_SEP = re.compile(r"^\s*\|[\s:\-|]+\|\s*$")

# Hallucinated markup from AI tools pasted without editing. Zero-tolerance in prose.
AI_MARKUP_ARTIFACTS = (
    "oaicite",
    "contentReference",
    "grok_card",
    "attributableIndex",
)
_AI_TURN_ARTIFACT = re.compile(r"turn\d+(?:search|view|news)\d+", re.I)


def _markup_artifacts_in_prose(line):
    """Return artifact labels found in line after stripping inline code."""
    prose = _INLINE_CODE.sub("", line)
    found = [a for a in AI_MARKUP_ARTIFACTS if a in prose]
    if _AI_TURN_ARTIFACT.search(prose):
        found.append("turn0search0-style placeholder")
    return found


def _dashdash_as_punct(line):
    if _TABLE_SEP.match(line):
        return False
    # HTML comment delimiters (the materialization banner) are markup, not prose.
    prose = _INLINE_CODE.sub("", line).replace("<!--", "").replace("-->", "")
    return bool(_DASH_PUNCT.search(prose))


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


def _docs_ancestor(path):
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
        ancestor = _docs_ancestor(p)
        if ancestor is not None:
            roots.add(ancestor)
    return roots


def doc_md_files(target):
    """Every *.md under any docs/ folder under target (including nested subdirs)."""
    return sorted(
        p
        for p in target.rglob("*.md")
        if "benchmarks" not in p.parts and _docs_ancestor(p) is not None
    )


# --- checks ---------------------------------------------------------------


def _voice_targets(target):
    """Files the voice check scans: every doc in a docs/ folder, plus the
    materialized root outputs (README/BRAND/DESIGN/MODEL_CARD) and materialized
    AGENTS.md. Root IDEA.md is an external source record and is not scanned."""
    files = list(doc_md_files(target))
    roots = {target} | docs_roots(target)
    if target.name == "docs":
        roots.add(target.parent)
    for d in docs_roots(target):
        roots.add(d.parent)
    for d in roots:
        for name in EXTERNAL_ROOT_OUTPUTS:
            p = d / name
            if p.is_file() and p not in files:
                files.append(p)
        agents = d / "AGENTS.md"
        if agents.is_file() and agents not in files:
            try:
                head = agents.read_text(encoding="utf-8", errors="replace")[:200]
            except OSError:
                head = ""
            if "MATERIALIZED" in head:
                files.append(agents)
    return files


def _system_files(target):
    """Root agent guide files: scanned for the em-dash glyph only."""
    files = []
    for relname in GUIDE_FILES:
        p = target / relname
        if p.is_file():
            files.append(p)
    for g in GUIDE_GLOBS:
        files += sorted(p for p in target.glob(g) if p.is_file())
    return files


# Public-surface leakage. Anything a stranger reads must not carry internal
# agent-workflow vocabulary. Conservative, high-confidence patterns only: each one is
# something no human-written public surface would contain by accident.
_PUBLIC_LEAKS = (
    (re.compile(r"\bsub-?agents?\b", re.I), "subagent vocabulary"),
    (re.compile(r"\bagent instructions\b", re.I), "leftover Agent Instructions block"),
    (re.compile(r"\bdo not trigger\b", re.I), "trigger-matrix vocabulary"),
    (re.compile(r"\btrigger phrase", re.I), "trigger-phrase vocabulary"),
    (re.compile(r"\bquick mode\b", re.I), "template vocabulary"),
    (re.compile(r"\b(?:PRD-F|BRD-V|BRD-M|UES-E|UES-D)\d+"), "internal traceability ID"),
    (re.compile(r"\{\{[A-Za-z_ ]"), "unreplaced template placeholder"),
)

# The root README documents agent instructions, so that pattern is dropped there.
_PUBLIC_LEAKS_README = tuple(
    entry for entry in _PUBLIC_LEAKS
    if entry[1] != "leftover Agent Instructions block"
)

# Public surfaces under docs/ (materialized root outputs are handled separately).
_PUBLIC_DOC_PREFIXES = ("pitch-", "prop-")


def _public_surface_files(target):
    """(path, patterns) for every file a stranger reads."""
    files = []
    for path in _voice_targets(target):
        name = path.name
        if name in EXTERNAL_ROOT_OUTPUTS:
            leaks = _PUBLIC_LEAKS_README if name == "README.md" else _PUBLIC_LEAKS
            files.append((path, leaks))
        elif _docs_ancestor(path) is not None and name.startswith(_PUBLIC_DOC_PREFIXES):
            files.append((path, _PUBLIC_LEAKS))
    return files


def check_voice(target):
    failures, warnings = [], []

    # Docs use zero em-dashes, with no exceptions, so there is no skip list.

    # Generated docs + materialized root outputs: em-dash, "--"-as-punctuation, and
    # banned-phrase checks. The "--" check skips fenced code blocks (where "--" is a
    # legitimate CLI/shell token); em-dash checks run on every line. Banned-phrase
    # matching runs per paragraph, not per line, so a phrase split across a
    # line-wrap is still caught.
    for path in _voice_targets(target):
        in_code = False
        para_lines, para_start = [], None

        def flush_paragraph():
            if not para_lines:
                return
            joined = " ".join(para_lines).lower().replace("’", "'")  # normalize curly apostrophe
            for phrase in BANNED_PHRASES:
                if phrase in joined:
                    failures.append(f"{rel(path)}:{para_start}: banned phrase '{phrase}'")

        for n, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            stripped = line.lstrip()
            is_fence = stripped.startswith("```") or stripped.startswith("~~~")
            if is_fence:
                in_code = not in_code
            if _has_banned_dash(line):
                failures.append(f"{rel(path)}:{n}: em-dash or em-dash substitute (docs use none)")
            if not in_code and _has_spaced_endash_as_punct(line):
                failures.append(f"{rel(path)}:{n}: spaced en-dash as punctuation (use a comma, colon, or period; unspaced ranges like 1–3 are allowed)")
            if REPLACEMENT in line:
                failures.append(f"{rel(path)}:{n}: non-UTF-8 byte (file is not valid UTF-8; save as UTF-8)")
            if not in_code and _dashdash_as_punct(line):
                failures.append(f"{rel(path)}:{n}: '--' as punctuation (VOICE bans it; use a comma, colon, or period)")
            if not in_code:
                for artifact in _markup_artifacts_in_prose(line):
                    failures.append(
                        f"{rel(path)}:{n}: AI-tool markup artifact '{artifact}' (paste from an AI tool; remove)"
                    )

            if not line.strip() or is_fence:
                flush_paragraph()
                para_lines, para_start = [], None
            else:
                if para_start is None:
                    para_start = n
                para_lines.append(line)
        flush_paragraph()

    # Public surfaces must not leak internal agent vocabulary.
    for path, leaks in _public_surface_files(target):
        in_code = False
        for n, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            stripped = line.lstrip()
            if stripped.startswith("```") or stripped.startswith("~~~"):
                in_code = not in_code
                continue
            if in_code:
                continue
            probe = _INLINE_CODE.sub("", line)
            for pattern, label in leaks:
                m = pattern.search(probe)
                if m:
                    failures.append(
                        f"{rel(path)}:{n}: public surface leaks {label} "
                        f"('{m.group(0)}'); rewrite for the reader"
                    )

    # Guide files: em-dash + encoding check only.
    for path in _system_files(target):
        for n, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if _has_banned_dash(line):
                failures.append(f"{rel(path)}:{n}: em-dash or em-dash substitute (docs use none)")
            if _has_spaced_endash_as_punct(_INLINE_CODE.sub("", line)):
                failures.append(f"{rel(path)}:{n}: spaced en-dash as punctuation (use a comma, colon, or period; unspaced ranges like 1–3 are allowed)")
            if REPLACEMENT in line:
                failures.append(f"{rel(path)}:{n}: non-UTF-8 byte (file is not valid UTF-8; save as UTF-8)")
    return failures, warnings


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


def _index_lists_file(row, filename):
    """True when filename appears as a link target or a manifest table cell, not a substring."""
    if re.search(r"\]\(" + re.escape(filename) + r"\)", row):
        return True
    cells = [c.strip() for c in row.strip().strip("|").split("|")]
    return filename in cells


def _header_field(text, name):
    """Extract a bold or plain header field value (Version, Status, …)."""
    m = re.search(
        rf"(?im)^\s*(?:\*\*)?{re.escape(name)}(?:\*\*)?\s*:\s*(.+?)\s*$",
        text,
    )
    if not m:
        return ""
    return re.sub(r"\*+", "", m.group(1)).strip()


def check_cr_propagation(target):
    """Applied CRs must have every Affected=Yes propagation row Done=[x]."""
    failures, warnings = [], []
    for d in sorted(docs_roots(target)):
        for path in sorted(d.glob("cr-*.md")):
            text = path.read_text(encoding="utf-8", errors="replace")
            status = _header_field(text, "Status")
            if not re.search(r"\bApplied\b", status, re.I):
                continue
            for header, rows in parse_tables(text):
                low = [h.lower().strip() for h in header]
                if not any("affected" in h for h in low):
                    continue
                if not any(h == "done" or h.startswith("done") for h in low):
                    continue
                ai = next(i for i, h in enumerate(low) if "affected" in h)
                di = next(i for i, h in enumerate(low) if h == "done" or h.startswith("done"))
                for n, row in enumerate(rows, 1):
                    if max(ai, di) >= len(row):
                        continue
                    affected = row[ai].strip().lower()
                    if affected not in ("yes", "y"):
                        continue
                    done = row[di].strip().lower()
                    if "[x]" in done or done in ("x", "yes", "y", "✓", "✅"):
                        continue
                    failures.append(
                        f"{rel(path)}: Applied CR has Affected=Yes row {n} with Done unticked "
                        f"(propagation incomplete)"
                    )
    return failures, warnings


def check_index_accuracy(target):
    """index.md Version/Status cells must match the linked doc headers."""
    failures, warnings = [], []
    for d in sorted(docs_roots(target)):
        index = d / "index.md"
        if not index.exists():
            continue
        itext = index.read_text(encoding="utf-8", errors="replace")
        for header, rows in parse_tables(itext):
            low = [h.lower().strip() for h in header]
            if "file" not in low or "version" not in low or "status" not in low:
                continue
            fi = low.index("file")
            vi = low.index("version")
            si = low.index("status")
            for row in rows:
                if max(fi, vi, si) >= len(row):
                    continue
                link = re.search(r"\]\(([^)]+\.md)\)", row[fi])
                if not link:
                    continue
                fname = Path(link.group(1)).name
                doc = d / fname
                if not doc.is_file():
                    warnings.append(
                        f"{rel(index)}: lists {fname} but file is missing"
                    )
                    continue
                dtext = doc.read_text(encoding="utf-8", errors="replace")
                doc_ver = _header_field(dtext, "Version")
                doc_status = _header_field(dtext, "Status")
                idx_ver = row[vi].strip()
                idx_status = row[si].strip()
                # Normalize: compare leading version token; status first word.
                if doc_ver and idx_ver not in ("-", "N/A", ""):
                    dv = re.match(r"[\d.]+", doc_ver)
                    iv = re.match(r"[\d.]+", idx_ver)
                    if dv and iv and dv.group() != iv.group():
                        warnings.append(
                            f"{rel(index)}: {fname} Version {idx_ver} != doc header {doc_ver}"
                        )
                if doc_status and idx_status not in ("-", "N/A", "") and "N/A" not in idx_status:
                    ds = re.search(r"(Draft|Locked|Superseded)", doc_status, re.I)
                    iss = re.search(r"(Draft|Locked|Superseded)", idx_status, re.I)
                    if ds and iss and ds.group(1).lower() != iss.group(1).lower():
                        warnings.append(
                            f"{rel(index)}: {fname} Status {idx_status} != doc header {doc_status}"
                        )
            break  # first Document Suite-shaped table only
    return failures, warnings


def check_sdd_contracts(target):
    """Soft WARNs: multi-entity SDD without erDiagram; rich API table without shapes/sequence."""
    failures, warnings = [], []
    for d in sorted(docs_roots(target)):
        for path in d.glob("sdd-*.md"):
            text = path.read_text(encoding="utf-8", errors="replace")
            table_count = len(re.findall(r"(?im)^\*\*Table:\s*`?", text))
            if table_count >= 2 and "erDiagram" not in text:
                if not re.search(r"(?i)bullets?\s+only|rapid|tiny", text):
                    warnings.append(
                        f"{rel(path)}: ≥2 tables but no mermaid erDiagram "
                        f"(add ERD or note Rapid/Tiny bullets-only)"
                    )
            # Count endpoint rows in Method|Path|Purpose-looking tables
            endpoint_rows = 0
            for header, rows in parse_tables(text):
                low = [h.lower().strip() for h in header]
                if "method" in low and ("path" in low or "endpoint" in low):
                    endpoint_rows += len(rows)
            has_shapes = bool(re.search(r"(?i)\bRequest\s*:", text)) or bool(
                re.search(r"(?i)openapi", text)
            )
            if endpoint_rows >= 3 and not has_shapes:
                warnings.append(
                    f"{rel(path)}: {endpoint_rows} endpoints listed but no Request: shapes "
                    f"or OpenAPI pointer (Medium+ should contract Must-Haves)"
                )
            has_seq = "sequenceDiagram" in text
            has_na = bool(re.search(r"(?i)N/A:\s*single-hop", text))
            if endpoint_rows >= 3 and not has_seq and not has_na:
                warnings.append(
                    f"{rel(path)}: multi-endpoint API without sequenceDiagram or "
                    f"'N/A: single-hop' (§4.1)"
                )
    return failures, warnings


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
        if _FILING_RE.match(name):
            out.append(
                f"{rel(scrutiny_path)}: Decision DO NOT BUILD YET but suite doc exists: "
                f"{name} (stop the build)"
            )
    return out


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
    for path in sorted(p for p in target.rglob("pitch-*.md") if _docs_ancestor(p)):
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


def check_trace(target):
    failures, warnings = [], []
    # Drive off every docs/ folder, not off prd-*.md, so the index and Locked-date
    # checks run even in a folder that has no PRD (they must not fail open).
    id_re = re.compile(r"PRD-F\d+|US-\d+")
    for d in sorted(docs_roots(target)):
        prds = list(d.rglob("prd-*.md"))
        defined = set()
        for prd in prds:
            defined |= set(id_re.findall(prd.read_text(encoding="utf-8", errors="replace")))
        downstream_ids = set()
        for kind in ("sdd", "qad", "build", "dsd", "clr", "rfc", "sad", "gtm", "aia"):
            for f in d.rglob(f"{kind}-*.md"):
                toks = set(id_re.findall(f.read_text(encoding="utf-8", errors="replace")))
                downstream_ids |= toks
                if prds:
                    for tok in toks:
                        if tok not in defined:
                            failures.append(f"{rel(f)}: references {tok}, not defined in the PRD")
                # Completeness: an SDD/QAD that cites no PRD-F#/US-# IDs breaks the
                # traceability chain AGENTS.md promises. Warn, do not fail.
                if kind in ("sdd", "qad") and defined and not toks:
                    failures.append(
                        f"{rel(f)}: references no PRD-F#/US-# IDs; traceability is incomplete"
                    )
        if not prds and downstream_ids:
            failures.append(
                f"{rel(d)}: downstream docs reference {len(downstream_ids)} PRD/US ID(s) but "
                f"no prd-*.md defines them; traceability could not be checked"
            )
        index = d / "index.md"
        if not index.exists():
            failures.append(f"{rel(d)}: no index.md")
            index_rows = []
        else:
            index_rows = [l for l in index.read_text(encoding="utf-8", errors="replace").splitlines() if l.lstrip().startswith("|")]
        for f in d.rglob("*.md"):
            if f.name == "index.md" or f.name.startswith(("cr-", "pm-")):
                continue
            if _is_change_layer_path(f):
                continue
            if index_rows and not any(_index_lists_file(row, f.name) for row in index_rows):
                failures.append(f"{rel(f)}: not listed in a manifest row in index.md")
        for f in d.rglob("*.md"):
            if f.name == "index.md" or f.name.startswith(("cr-", "pm-")):
                continue
            if _is_change_layer_path(f):
                continue
            text = f.read_text(encoding="utf-8", errors="replace")
            # Format-tolerant: catch the status value whether it is bolded
            # (**Status:** Locked), plain (Status: Locked), or in a table cell
            # (| Status | Locked |). Same for the reconciled date. A header reformat
            # must not become a silent skip.
            if re.search(r"status[\s:*|]+locked", text, re.I):
                lr = re.search(r"last\s*reconciled[\s:*|]+([^\n|]+)", text, re.I)
                val = lr.group(1).strip() if lr else ""
                date_m = re.search(r"(\d{4}-\d{2}-\d{2})", val)
                if not val or "n/a" in val.lower() or not date_m:
                    failures.append(f"{rel(f)}: Locked but Last reconciled is unset")
                else:
                    try:
                        date.fromisoformat(date_m.group(1))
                    except ValueError:
                        failures.append(f"{rel(f)}: Locked but Last reconciled date is invalid ({date_m.group(1)})")
    # Living-docs anti-rot + SDD contract soft WARNs
    for fn in (check_cr_propagation, check_index_accuracy, check_sdd_contracts):
        f2, w2 = fn(target)
        failures += f2
        warnings += w2
    return failures, warnings


def check_coverage(target):
    """Cross-doc coverage (WARN). check_trace proves an ID is DEFINED; this proves a
    Must-Have is *referenced* in the SDD (realized) and the QAD (tested). It is a
    referential check: it confirms the ID is cited, not that the feature is genuinely
    tested well; real test quality stays with the QAD's own Self-Check and human
    review. Warn-only, so it never breaks an existing suite; promote to fail only as
    a deliberate later call. If it cannot locate the PRD feature table, it WARNS
    rather than passing quietly, so a header mismatch is never a silent no-op."""
    failures, warnings = [], []
    id_re = re.compile(r"PRD-F\d+")
    for d in sorted(docs_roots(target)):
        prds = list(d.rglob("prd-*.md"))
        if not prds:
            continue
        prd = prds[0]
        ptext = prd.read_text(encoding="utf-8", errors="replace")
        must = []  # Must-Have feature IDs from the PRD §3 table
        found_feature_table = False
        rows_seen = 0
        for header, rows in parse_tables(ptext):
            low = [h.lower().strip() for h in header]
            idi = next((i for i, h in enumerate(low) if h == "id" or h.endswith(" id")), None)
            pri = next((i for i, h in enumerate(low) if "priorit" in h or h in ("pri", "prio")), None)
            if idi is None or pri is None:
                continue
            found_feature_table = True
            rows_seen += len(rows)
            for row in rows:
                if max(idi, pri) >= len(row):
                    continue
                prio = re.sub(r"[\s-]", "", row[pri].lower())
                if "musthave" in prio or prio in ("p0", "critical"):  # MoSCoW + common synonyms
                    m = id_re.search(row[idi])
                    if m:
                        must.append(m.group())
        # The PRD clearly has features but no table with ID + Priority columns was
        # recognized. Warn instead of passing silently (NF-1: no silent no-op).
        if not found_feature_table and id_re.search(ptext):
            warnings.append(
                f"{rel(prd)}: could not parse a feature table (need an 'ID' column and "
                f"a 'Priority' column); Must-Have coverage was not checked"
            )
            continue
        # Header recognized but no data rows parsed (e.g. malformed rows missing a
        # trailing pipe). Warn rather than skip silently (M-1).
        if found_feature_table and rows_seen == 0:
            warnings.append(
                f"{rel(prd)}: feature table header recognized but no rows parsed "
                f"(check for malformed rows); Must-Have coverage was not checked"
            )
            continue
        # Table parsed with rows but zero Must-Haves recognized (e.g. P1/High/numeric
        # priorities, or a genuinely all-lower-priority PRD). Warn rather than skip (S-2).
        if found_feature_table and rows_seen > 0 and not must:
            warnings.append(
                f"{rel(prd)}: feature table has rows but no Must-Have recognized "
                f"(check Priority values, e.g. P1/High vs MoSCoW); Must-Have coverage was not checked"
            )
            continue
        if not must:
            continue
        for kind, verb in (("sdd", "realized in the SDD"), ("qad", "tested in the QAD")):
            matches = list(d.rglob(f"{kind}-*.md"))
            f = matches[0] if matches else None
            if f is None:
                warnings.append(
                    f"{rel(d)}: Must-Haves exist but no {kind}-*.md found; {verb.split()[-1]} coverage not checked"
                )
                continue
            refs = set(id_re.findall(f.read_text(encoding="utf-8", errors="replace")))
            for mid in must:
                if mid not in refs:
                    msg = f"{rel(f)}: Must-Have {mid} is not {verb}"
                    # Locked PRD → fail; Draft stays warn.
                    if re.search(r"(?i)\bStatus\b[^\n]{0,60}\bLocked\b", ptext):
                        failures.append(msg)
                    else:
                        warnings.append(msg)
    return failures, warnings


def check_currency(target, max_age_days=90):
    failures, warnings = [], []
    today = date.today()
    date_re = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
    files = list(target.rglob("build-*.md"))
    p = target / "AGENTS.md"
    if p.exists():
        files.append(p)
    for path in files:
        is_build = path.name.startswith("build-") and path.suffix == ".md"
        for n, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            # BUILD files parse any YYYY-MM-DD; guides still need a verif cue.
            if not is_build and "verif" not in line.lower():
                continue
            for y, m, dd in date_re.findall(line):
                try:
                    when = date(int(y), int(m), int(dd))
                except ValueError:
                    continue
                if (today - when).days > max_age_days:
                    warnings.append(
                        f"{rel(path)}:{n}: 'verified' date {when} is over {max_age_days} days old"
                    )
    return failures, warnings


# Doc-type prefixes (file-naming convention). Used by the filing check.
DOC_TYPES = ("idea", "scrutiny", "val", "pitch", "wrap", "voice", "brd", "ues", "prd",
             "dsd", "sdd", "rfc", "qad", "sad", "build", "clr", "gtm", "ops", "aia", "log")
_FILING_RE = re.compile(r"^(" + "|".join(DOC_TYPES) + r")-.+\.md$", re.I)


def check_filing(target):
    """Fail-loud: a registered doc ({type}-*.md) saved outside a docs/ folder escapes
    the voice and trace checks entirely, so it fails rather than warns."""
    failures, warnings = [], []
    # A docs suite should carry its operating position in docs/state.md (WARN).
    for root in sorted(docs_roots(target)):
        if (root / "state.md").is_file():
            continue
        generated = [
            p for p in root.glob("*.md")
            if _FILING_RE.match(p.name) and not p.name.startswith("log-")
        ]
        if generated:
            warnings.append(
                f"{rel(root)}: no state.md (operating position: milestone, signals, "
                f"assumptions). Create docs/state.md"
            )
    for p in target.rglob("*.md"):
        if _docs_ancestor(p) is not None:
            continue
        if _FILING_RE.match(p.name):
            failures.append(
                f"{rel(p)}: looks like a {p.name.split('-')[0].upper()} doc but is not "
                f"inside a docs/ folder; it escapes the voice and trace checks"
            )
    return failures, warnings


def _is_change_layer_path(path):
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


_PX_CLASS_RE = re.compile(r"^\*\*Class:\*\*\s*Project-specific", re.I | re.M)
_PX_REQUIRED = (
    ("Purpose", re.compile(r"^\*\*Purpose:\*\*", re.I | re.M)),
    ("Owner", re.compile(r"^\*\*Owner:\*\*", re.I | re.M)),
    (
        "Why baseline insufficient",
        re.compile(r"^\*\*Why baseline insufficient:\*\*", re.I | re.M),
    ),
    ("Status", re.compile(r"^\*\*Status:\*\*", re.I | re.M)),
    ("Promotion", re.compile(r"^\*\*Promotion:\*\*", re.I | re.M)),
)


def check_project_specific(target):
    """project-specific artifacts should carry minimum header metadata (WARN only)."""
    failures, warnings = [], []
    for p in doc_md_files(target):
        if _is_change_layer_path(p):
            continue
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if not _PX_CLASS_RE.search(text):
            continue
        for label, pat in _PX_REQUIRED:
            if not pat.search(text):
                warnings.append(
                    f"{rel(p)}: Class: Project-specific missing {label}"
                )
    return failures, warnings


CHECKS = {
    "voice": check_voice,
    "scrutiny": check_scrutiny,
    "inception": check_inception,
    "trace": check_trace,
    "coverage": check_coverage,
    "currency": check_currency,
    "filing": check_filing,
    "project-specific": check_project_specific,
}


def main(argv=None):
    parser = argparse.ArgumentParser(description="PATHWAYS documentation governance checks.")
    parser.add_argument("target", nargs="?", default=str(ROOT), help="dir to check (default: repo root)")
    parser.add_argument("--only", default="", help="comma list: " + ",".join(CHECKS))
    parser.add_argument(
        "--strict",
        action="store_true",
        help="treat warnings as failures (exit 1)",
    )
    args = parser.parse_args(argv)

    target = Path(args.target).resolve()
    if not target.exists():
        print(f"error: target does not exist: {rel(target)}")
        return 2
    if not any(target.rglob("*.md")):
        print(f"error: no markdown files found under {rel(target)}; nothing was checked")
        return 2
    selected = [c.strip() for c in args.only.split(",") if c.strip()] or list(CHECKS)

    all_fail, all_warn = [], []
    for name in selected:
        check = CHECKS.get(name)
        if not check:
            print(f"unknown check: {name}")
            return 2
        fails, warns = check(target)
        all_fail += [(name, m) for m in fails]
        all_warn += [(name, m) for m in warns]

    for name, m in all_warn:
        print(f"WARN  [{name}] {m}")
    for name, m in all_fail:
        print(f"FAIL  [{name}] {m}")

    print(f"\n{len(all_fail)} failure(s), {len(all_warn)} warning(s) over checks: {', '.join(selected)}")
    if all_fail:
        return 1
    if args.strict and all_warn:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
