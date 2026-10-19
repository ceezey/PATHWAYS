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
import sys
from pathlib import Path

from checks.agents import check_agents
from checks.common import ROOT, rel
from checks.coverage import check_coverage
from checks.currency import check_currency
from checks.filing import check_filing
from checks.inception import check_inception
from checks.project_specific import check_project_specific
from checks.scrutiny import check_scrutiny
from checks.trace import check_trace
from checks.voice import check_voice


CHECKS = {
    "agents": check_agents,
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
