"""Materialize canonical PATHWAYS docs into project-root artifacts.

Usage:
    python scripts/docs/materialize.py [DOCS_DIR] [--out OUT_DIR]

Reads the canonical docs under DOCS_DIR (default: ./docs) and writes:
    AGENTS.md   from build-*.md   (verbatim + banner)
    BRAND.md    from dsd-*.md      (verbal-identity sections 0, 0.5, 1, 2, 8, 9)
    DESIGN.md   from dsd-*.md      (visual sections 2-8)
to OUT_DIR (default: the parent of DOCS_DIR).

Edit the canonical doc and re-run; never hand-edit the materialized root files as
the source of truth.
"""
import argparse
import re
import sys
from pathlib import Path


def banner(source_name):
    return (
        f"<!-- MATERIALIZED from {source_name} by scripts/docs/materialize.py. "
        f"Do not hand-edit; edit the canonical doc and re-run. -->\n\n"
    )


def split_sections(md):
    """Map each top-level '## ' section to its text, keyed by leading number."""
    sections = {}
    current_key = "_preamble"
    buf = []
    for line in md.splitlines(keepends=True):
        if line.startswith("## "):
            sections[current_key] = "".join(buf)
            buf = [line]
            m = re.match(r"^##\s+([0-9]+(?:\.[0-9]+)?)", line)
            current_key = m.group(1) if m else line.strip()
        else:
            buf.append(line)
    sections[current_key] = "".join(buf)
    return sections


def assemble(sections, keys):
    return "\n".join(sections[k].rstrip() for k in keys if k in sections) + "\n"


def find_one(docs, pattern):
    hits = sorted(docs.glob(pattern))
    return hits[0] if hits else None


def write(path, text):
    path.write_text(text, encoding="utf-8", newline="\n")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Materialize PATHWAYS docs to root artifacts.")
    parser.add_argument("docs", nargs="?", default="docs")
    parser.add_argument("--out", default=None)
    args = parser.parse_args(argv)

    docs = Path(args.docs).resolve()
    if not docs.is_dir():
        print(f"docs dir not found: {docs}")
        return 2
    out = Path(args.out).resolve() if args.out else docs.parent
    out.mkdir(parents=True, exist_ok=True)

    written = []

    build = find_one(docs, "build-*.md")
    if build:
        write(out / "AGENTS.md", banner(f"docs/{build.name}") + build.read_text(encoding="utf-8"))
        written.append("AGENTS.md")

    dsd = find_one(docs, "dsd-*.md")
    if dsd:
        sections = split_sections(dsd.read_text(encoding="utf-8"))
        brand = banner(f"docs/{dsd.name}") + (
            "# PATHWAYS Brand\n\n"
            "> Verbal identity, materialized from the DSD (sections 0, 0.5, 1, 2, 8, 9).\n\n"
            + assemble(sections, ["0", "0.5", "1", "2", "8", "9"])
        )
        design = banner(f"docs/{dsd.name}") + (
            "# PATHWAYS Design\n\n"
            "> Visual language, materialized from DSD sections 2-8.\n\n"
            + assemble(sections, ["2", "3", "4", "5", "6", "7", "8"])
        )
        write(out / "BRAND.md", brand)
        write(out / "DESIGN.md", design)
        written += ["BRAND.md", "DESIGN.md"]

    if not written:
        print(f"nothing to materialize in {docs} (no build-*.md or dsd-*.md)")
        return 1
    print(f"Materialized into {out}: {', '.join(written)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
