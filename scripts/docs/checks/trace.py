"""Trace check: PRD identifiers, index rows, locked dates, and the living-docs checks it runs."""

import re
from datetime import date
from pathlib import Path

from .common import docs_roots, is_change_layer_path, parse_tables, rel


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
            if is_change_layer_path(f):
                continue
            if index_rows and not any(_index_lists_file(row, f.name) for row in index_rows):
                failures.append(f"{rel(f)}: not listed in a manifest row in index.md")
        for f in d.rglob("*.md"):
            if f.name == "index.md" or f.name.startswith(("cr-", "pm-")):
                continue
            if is_change_layer_path(f):
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
