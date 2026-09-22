# Phase Report Template — Frontend-UI/UX → Backend-DB Integration

**Reference only. Read after completing a phase and use these headings in chat. Do not create a filled phase-report Markdown file. Use N/A only when genuinely inapplicable.**

## Phase name
Phase ID/name; outcome: COMPLETE / PARTIAL / BLOCKED. State exact local branch/commit scope and any managed/provider authorization.

## Git / branch state
Current branch, relevant local/remote SHAs, integration branch, merge/commit identity, dirty-state summary. Do not expose credential-bearing remote URLs.

## Files changed
Relevant paths with one-line purposes. Separate pre-existing/unrelated changes. Identify frontend presentation changes, backend wiring, shared contracts, tests and task-control updates.

## Frontend fidelity
State whether the latest pinned Frontend-UI/UX layout, visual design, navigation and interactions were preserved. List every intentional difference, including the OTP/MFA exception or truthful unavailable state.

## Backend / integration changes
Endpoints/services/contracts/persistence wired or implemented. State what was reused versus created.

## Missing features / temporary behavior
For each unresolved latest-frontend action:

| Feature | Why backend is missing/blocked | Recommendation | Temporary behavior | Blocks next phase? |
|---|---|---|---|---|

Never omit this section when a missing feature was discovered.

## Role / access result
Confirm no unrelated role/access permissions changed. State Project Manager indicator read/manage result and any exact authorized exception required.

## Auth / navigation
OTP/MFA UI result, login flow, workspace selection, redirects, logout and denied-access behavior.

## Beneficiary PIN
Confirm whether PIN remains `2468` and that backend authorization is still independently enforced.

## Mock / prototype cleanup
Runtime fabricated/mock paths removed or still present; test-only mocks/fixtures retained; user-facing mock/prototype/demo copy result.

## Database and security changes
Migration IDs/hashes if any, RLS/grant implications, organization/project scope, audit/validation implications, local vs managed environments. State `no changes` when applicable.

## Tests run and results

| Command/test | Environment | Result | What it proves |
|---|---|---|---|
| Exact command/test | Local / isolated / GitHub / managed-read-only | PASS / FAIL / NOT RUN | Evidence |

Preserve skipped tests and exit codes when available.

## GitHub state
Push status, remote integration branch, PR number/URL, base/head, GitHub checks. State `not pushed` / `PR not created` where appropriate.

## Issues found
Severity, evidence, scope and blocker status. Separate integration regressions from pre-existing unrelated issues.

## TODO rundown
Exact `FB-*` items checked/reopened/still pending and evidence. Confirm the task TODO was actually updated.

## Source of Truth updates
Sections/evidence/contracts updated. Do not rewrite security/business rules to match incomplete code.

## Deferred P07-W10 check
Confirm the deferred W10 state remained untouched, or explicitly state any authorized exception.

## Human intervention required
Write `None` when none is required.

Otherwise:

**HUMAN INTERVENTION REQUIRED — <title>**

Evidence and risk: <concise facts>.

Developer steps:
1. <exact action>
2. <exact action>
3. Reply with <specific sanitized evidence/authorization>

Blocked work: <scope>.
Safe work remaining: <scope or none>.
Resume condition: <exact condition/token>.

## Readiness for the next phase
- Current phase acceptance: PASS / PARTIAL / BLOCKED.
- Next phase: <ID/name>.
- Ready to proceed: YES / NO.
- Required next reply: <exact authorization phrase>.

**HARD STOP — awaiting explicit developer authorization.**
