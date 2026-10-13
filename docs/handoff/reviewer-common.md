# Reviewer common rules

Follow the task reviewer contract in this template file (read it; ignore its dispatch wrapper and placeholders): C:/Users/Cian Jake Francisco/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/subagent-driven-development/task-reviewer-prompt.md

PATHWAYS specifics:
- Read global-constraints.md in this folder; it is your attention lens.
- This refactor is behavior-preserving: flag any change to a route, status code, response body, audit row, permission decision, transaction boundary or SQL statement beyond what the brief allows.
- Do not re-run suites the implementer already ran; focused single-file runs are fine if needed to settle a doubt.
- Read-only: do not edit, commit or create worktrees. Reply in under 15 lines: spec verdict, quality verdict per task, findings as `severity | file:line | issue`, and cannot-verify items.
