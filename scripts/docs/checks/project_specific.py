"""Project-specific check: the minimum header metadata of project-specific artifacts."""

import re

from .common import doc_md_files, is_change_layer_path, rel


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
        if is_change_layer_path(p):
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
