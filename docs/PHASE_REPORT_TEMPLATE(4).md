# Phase Report Template — Core Backend and Database

**Reference only. Read after finishing a prompt/phase and fill these headings in chat. Do not create a filled Markdown report or a separate phase-report file. Use N/A when a section genuinely does not apply.**

## Phase name
Phase ID/name; outcome: COMPLETE / PARTIAL / BLOCKED. State the verified environment and authorization scope.

## Files changed
Actual relevant paths and one-line purposes; include new migrations and TODO/Source of Truth edits. Separate pre-existing changes. No full secret-bearing configuration dumps.

## Summary of changes
What works now; affected C1–C8 feature IDs; what was reused rather than rebuilt.

## UI / behavior changes
Working user flow and exact local/manual verification steps. State restart/reload persistence, empty/error handling and anything still backend-only.

## Mock-data changes
Synthetic fixtures added/changed; core mock fallbacks removed; supporting prototypes left untouched. Distinguish mocks from real PostgreSQL/provider integration tests.

## New placeholder routes or modals
None expected. Disclose any placeholder honestly; do not use one to satisfy feature acceptance.

## Database and security changes
Migration IDs and review status; test/managed environments actually changed; constraints/grants; authorization/PII/concurrency checks; rollback boundary. Say “no changes” when applicable.

## Tests run and results
| Command/test | Environment | Result | What it proves |
|---|---|---|---|
| Exact executed command or test | Isolated / managed-dev / mocked | PASS / FAIL / NOT RUN | Specific evidence |

Include relevant rejection, retry, race and regression tests. Preserve exit codes. Skipped tests are not PASS; compile success is not security assurance.

## Issues found
Severity, evidence, affected scope and whether progress is blocked. Explain any business rule that sources did not establish.

## TODO rundown
Exact checklist IDs newly checked, reopened or still pending, with concise evidence. Confirm `TODO.md` was actually updated; do not merely promise an update.

## Source of Truth updates
Sections/contracts changed and evidence. Requirements/permissions may change only with an explicit developer decision; do not rewrite a requirement to match incomplete code.

## What still needs follow-up
Remaining phase work, managed-provider checks and genuinely deferred supporting scope.

## Human intervention required
Write “None” when no intervention is needed. Otherwise, for each blocker use:

**HUMAN INTERVENTION REQUIRED — <title>**

Evidence and risk: <specific observation and consequence>.

Developer steps:
1. Open <exact repository path, tool, screen or local directory>.
2. Perform <specific decision or safe operation; distinguish local from managed-dev>.
3. Confirm <expected sanitized result/exit code> and reply with <precise decision/evidence; never secrets>.

Blocked work: <specific scope>. Safe work remaining: <specific scope or none>.
Resume condition: <test/evidence and exact authorization reply>.
Do not proceed with affected work before that condition is met.

## Readiness for the next phase
- Current phase acceptance: PASS / PARTIAL / BLOCKED.
- Next phase: <ID/name, or none after P07>.
- Ready to proceed: YES / NO, with one sentence.
- Local implementation / managed-dev verification: <separate statuses>.
- Required next reply: <exact next-phase authorization token, or blocker-resolution token>.

**HARD STOP — awaiting explicit developer authorization.**
