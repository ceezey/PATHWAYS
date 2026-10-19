"""Filing check: registered documents live inside a docs folder."""

import re

from .common import docs_ancestor, rel


# Doc-type prefixes (file-naming convention). Used by the filing check.
DOC_TYPES = ("idea", "scrutiny", "val", "pitch", "wrap", "voice", "brd", "ues", "prd",
             "dsd", "sdd", "rfc", "qad", "sad", "build", "clr", "gtm", "ops", "aia", "log")
FILING_RE = re.compile(r"^(" + "|".join(DOC_TYPES) + r")-.+\.md$", re.I)


def check_filing(target):
    """Fail-loud: a registered doc ({type}-*.md) saved outside a docs/ folder escapes
    the voice and trace checks entirely, so it fails rather than warns."""
    failures, warnings = [], []
    for p in target.rglob("*.md"):
        if docs_ancestor(p) is not None:
            continue
        if FILING_RE.match(p.name):
            failures.append(
                f"{rel(p)}: looks like a {p.name.split('-')[0].upper()} doc but is not "
                f"inside a docs/ folder; it escapes the voice and trace checks"
            )
    return failures, warnings
