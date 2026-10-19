"""Agents check: the SAD roster against the agent definitions."""

import re

from .common import docs_roots, parse_tables, rel


_AGENT_COORDINATORS = {"sad-orchestrator": "sonnet", "release-integrator": "opus", "requirements-qa-gate": "opus"}
_AGENT_MODELS = {"opus", "sonnet", "haiku", "inherit"}


def check_agents(target):
    """SAD roster role names and models must match .claude/agents definitions."""
    failures, warnings = [], []
    for d in sorted(docs_roots(target)):
        sad = d / "sad-pathways.md"
        agents_dir = d.parent / ".claude" / "agents"
        if not sad.exists() or not agents_dir.is_dir():
            continue
        roster = dict(_AGENT_COORDINATORS)
        roles = set()
        for header, rows in parse_tables(sad.read_text(encoding="utf-8", errors="replace")):
            low = [h.strip().lower() for h in header]
            if low and low[0] == "specialist" and "model" in low:
                mi = low.index("model")
                for row in rows:
                    if row and row[0].strip():
                        roles.add(row[0].strip())
                        roster[row[0].strip()] = row[mi].strip() if mi < len(row) else ""
        names = set()
        for p in agents_dir.glob("*.md"):
            text = p.read_text(encoding="utf-8", errors="replace")
            m = re.search(r"^name:\s*(\S+)", text, re.M)
            if not m:
                continue
            name = m.group(1)
            names.add(name)
            model = re.search(r"^model:\s*(\S+)", text, re.M)
            model = model.group(1) if model else ""
            if model not in _AGENT_MODELS:
                failures.append(f"{rel(p)}: missing or invalid model '{model}'")
            elif name in roster and roster[name] != model:
                failures.append(f"{rel(p)}: model '{model}' differs from SAD '{roster[name]}'")
        if not roles:
            failures.append(f"{rel(sad)}: roster table with Specialist and Model columns not found")
        for role in sorted(roles - names):
            failures.append(f"{rel(sad)}: SAD role '{role}' has no .claude/agents definition")
        for name in sorted(names - set(roster)):
            failures.append(f"{rel(agents_dir)}: agent '{name}' is not in the SAD roster")
    return failures, warnings
