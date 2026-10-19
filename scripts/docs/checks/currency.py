"""Currency check: verified dates older than the allowed age."""

import re
from datetime import date

from .common import rel


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
