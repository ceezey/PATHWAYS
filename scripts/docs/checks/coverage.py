"""Coverage check: every Must-Have is realized in the SDD and tested in the QAD."""

import re

from .common import docs_roots, parse_tables, rel


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
