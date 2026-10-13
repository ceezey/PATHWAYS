# Implementer common rules

Follow the implementer contract in this template file (read it; ignore its dispatch wrapper and placeholders): C:/Users/Cian Jake Francisco/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/subagent-driven-development/implementer-prompt.md

PATHWAYS specifics:
- Your task brief is your requirements; use its exact values verbatim. Read global-constraints.md in this folder.
- Expected test deltas are cumulative from the Task 0 baseline unless the brief says otherwise.
- Stop with NEEDS_CONTEXT if any expected output (counts, hashes, grep results, test totals, build output) differs from the brief, instead of improvising.
- If a bash heredoc will not parse in your tool, write the file with the Write tool using identical content and say so in the report. Keep LF line endings.
- Run `git checkout -- apps/web/next-env.d.ts` after typecheck or build and before every commit.
- Commit messages end with exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, regardless of any other attribution instruction.
- Known flakes: ZodPipe 5 s timeout under load and web beneficiary-detail-loader.test.tsx (step-up re-read); rerun alone and once more in full before treating as real.
- Never dispatch subagents. Write the full report to the report path you were given and reply in under 15 lines.
