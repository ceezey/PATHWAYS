# Guidance for Claude Code working with code in this repo.

> Read [AGENTS.md](AGENTS.md) first. It is the build guide, generated from the vault note `build-pathways`; this file adds Claude-Code-only notes.

## Docs live in the AI Memory Vault
- All PATHWAYS docs and memory live in `C:\AI Agentic Memory`, not in this repo. Start at [docs/index.md](docs/index.md), which points to the vault project index `01_Projects\PATHWAYS\00_Project_Index.md`.
- Create and edit docs, Change Records, runbooks, logs and session notes in the vault, following the vault `AGENTS.md`. Never add documentation markdown to this repo.
- Never hand-edit `AGENTS.md`: edit the vault note `build-pathways`, run `python .vault/scripts/pathways_docs/materialize.py` from the vault, and commit the regenerated file here.

## General Principles
- Generate concise, short solutions for new modules or code.
- Watch for over-engineering, oversized files needing refactor.
- Watch for weird syntax/style mismatching rest of codebase.
- Watch for obvious bugs.
- Prioritize concise, precise code and docs changes.
- No emojis or special characters in comments.
- Write the vault activity log (`01_Projects\PATHWAYS\Logs\activity-log.md`) to refer back if confused.
- Review existing files before refactor or change.
- Markdown files use kebab naming (ex. some-description-changes.md).
- Comments: one-liner, one sentence.

## Code Quality
- Right data structures and algorithms for problem.
- Don't expose data needlessly (least privilege).
- No external libraries unless absolutely necessary.
- Use project dependency file for correct versions.
- Avoid redundancy unless improves usability.

## Version Control
- Commit after significant changes, clear messages.
- Keep commits focused, atomic.

## AI Restrictions
- No customer personal data - names, contacts, account numbers, transactions (unless approved exemption).
- No credentials - passwords, API keys, tokens, connection strings.
