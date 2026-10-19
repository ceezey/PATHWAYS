"""Voice check: dashes, banned phrases, AI markup artifacts and public surface leaks."""

import html
import re
import unicodedata

from .common import doc_md_files, docs_ancestor, docs_roots, rel


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
        elif docs_ancestor(path) is not None and name.startswith(_PUBLIC_DOC_PREFIXES):
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
