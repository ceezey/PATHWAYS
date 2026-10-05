# Evaluation Write Path Reconcile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land teammate branch `origin/feat/evaluation-write-path` (`00da2868`) on dev as migration `0064_evaluation_write_path`, with the disclosed draft-edit RLS gap closed and every replay gate green.

**Architecture:** Merge the branch into a worktree cut from dev, renumber its migration from 0063 to 0064 (dev already ships `0063_rules_scope_memo`, applied on devV2), add a DRAFT->DRAFT permission check to `p3_guard_evaluation`, and bring the grant count, existing SQL suites and a new runtime suite in line.

**Tech Stack:** PostgreSQL migrations (raw SQL, Prisma migrate), NestJS + Vitest, Next.js, PowerShell replay harness.

**Spec:** `docs/cr-pathways-evaluation-write-path.md` on the branch (the change record is the spec); developer decisions 2026-10-06: evaluation is 0064, beneficiary reach/KPI becomes 0065; close the draft-edit gap in the trigger.

## Global Constraints

- Migration directory: `apps/api/prisma/migrations/0064_evaluation_write_path/`; precondition requires `0063_rules_scope_memo` finished; every "0063" message in that file becomes "0064".
- `role_permissions` after 0064 is 314 (312 - 1 SA `evaluations.weights.configure` + 3 grants).
- No other schema change beyond the branch migration and the trigger check below.
- Comments one-liner, no emojis; markdown kebab-case.
- Never disable triggers; never touch devV2 from an implementer task.

## Review Focus

- Project Manager UPDATE of a DRAFT evaluation (title, period, commentary, evaluated_by_id) as `pathways_runtime` must fail with 23514.
- Project Manager return (SUBMITTED -> DRAFT, clearing evaluated_at and overall_score, setting commentary) must still succeed.
- The owner seed path (`prisma` connection, no app.user_id) must still write the EHK evaluation: the defense `--verify` stays 23/23.
- Same person reviewing and signing off now succeeds; the evaluator still cannot review or sign off.
- A second M&E officer resubmitting a returned draft fails unless evaluated_by_id is their own (actor binding).

---

### Task 1: Worktree, merge and renumber

**Files:**
- Rename: `apps/api/prisma/migrations/0063_evaluation_write_path/` -> `0064_evaluation_write_path/`
- Modify: `apps/api/prisma/migrations/0064_evaluation_write_path/migration.sql` (precondition and messages)
- Modify: `apps/api/src/modules/auth/rbac-contract.json:1851` (`"migration": "0064_evaluation_write_path"`)
- Modify: `apps/api/prisma/legacy-retirement.test.ts` (conflict: keep dev's `0063_rules_scope_memo` entry, add `0064_evaluation_write_path` after it)
- Modify: `docs/activity-log.md` (conflict: keep both entries, dev's first)
- Modify: `docs/cr-pathways-evaluation-write-path.md` (every `0063_evaluation_write_path` -> `0064_evaluation_write_path`, "after 0062" -> "after 0063")

- [ ] **Step 1: Create the worktree and merge**

```bash
git -C C:/PATHWAYS worktree add .worktrees/evaluation-write-path -b feature/evaluation-write-path dev
cd C:/PATHWAYS/.worktrees/evaluation-write-path
git merge --no-ff origin/feat/evaluation-write-path
```
Expected: conflicts in `apps/api/prisma/legacy-retirement.test.ts` and `docs/activity-log.md` only.

- [ ] **Step 2: Resolve the two conflicts as listed above, then rename the migration**

```bash
git mv apps/api/prisma/migrations/0063_evaluation_write_path apps/api/prisma/migrations/0064_evaluation_write_path
```

- [ ] **Step 3: Fix the precondition block**

Replace in `0064_evaluation_write_path/migration.sql`:
```sql
 IF current_user <> 'prisma' OR NOT EXISTS(SELECT FROM public._prisma_migrations WHERE migration_name='0063_rules_scope_memo'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
 THEN RAISE EXCEPTION '0064 requires the verified 0063 state and migration identity'; END IF;
```
and change the remaining `'0063 requires ...'` / `'0063 verification failed'` messages to `0064`.

- [ ] **Step 4: Update `rbac-contract.json` and the CR references; grep must be empty**

Run: `git grep -n "0063_evaluation_write_path"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Merge evaluation write path and renumber its migration to 0064"
```

### Task 2: Close the draft-edit gap in the lifecycle trigger

**Files:**
- Modify: `apps/api/prisma/migrations/0064_evaluation_write_path/migration.sql` (`p3_guard_evaluation` body, header comment, postcondition)
- Modify: `docs/cr-pathways-evaluation-write-path.md` section 4 (gap paragraph now reads as closed)

**Interfaces:**
- Produces: DRAFT -> DRAFT updates by `pathways_runtime` require `pathways.p05_has_project_permission('evaluations.submit', project_id)`; raises SQLSTATE 23514 `Draft evaluation edits require evaluations.submit`.

- [ ] **Step 1: In `p3_guard_evaluation`, inside `IF OLD.status='DRAFT' THEN`, add before the SUBMITTED branch:**

```sql
   -- Only the evaluator role may edit a draft at runtime; RLS cannot see the prior status.
   IF NEW.status='DRAFT' AND current_user='pathways_runtime'
    AND NOT pathways.p05_has_project_permission('evaluations.submit',NEW.project_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514',MESSAGE='Draft evaluation edits require evaluations.submit';
   END IF;
```
The function keeps `SET search_path TO 'pg_catalog'`, so the call stays schema-qualified.

- [ ] **Step 2: Replace the header comment sentence starting "RLS cannot see the row's prior status" with:** `-- RLS cannot see the prior status, so p3_guard_evaluation rejects runtime DRAFT->DRAFT edits without evaluations.submit.`

- [ ] **Step 3: Add to the postcondition DO block:**

```sql
 OR position('Draft evaluation edits require evaluations.submit' IN pg_catalog.pg_get_functiondef('pathways.p3_guard_evaluation()'::pg_catalog.regprocedure))=0
```

- [ ] **Step 4: Update CR section 4 gap paragraph and section 7 to state the gap is closed by the trigger, then commit**

```bash
git add -A && git commit -m "Reject runtime draft evaluation edits without evaluations.submit"
```

### Task 3: Grant count and existing SQL suites

**Files:**
- Modify: `infra/supabase/phase6/Verify-Forward.ps1:687` (`=312` -> `=314`)
- Modify: `apps/api/prisma/tests/finance-evaluation-decisions.sql:263-265`
- Check: any other replay-harness assertion on the migration list or count (`git grep -n "0063_rules_scope_memo" infra scripts apps/api/prisma/tests`)

- [ ] **Step 1: Change line 687 to `AND (SELECT count(*) FROM pathways.role_permissions)=314)::text;`**

- [ ] **Step 2: Replace the reviewer-cannot-sign-off assertion (line 263) with the new rule**

```sql
SELECT pg_temp.reject($q$UPDATE pathways.project_evaluations SET status='SIGNED_OFF',signed_off_by_id=pg_temp.u(11),signed_off_at=now() WHERE id=pg_temp.u(611)$q$,'23514','Evaluator cannot sign off');
```
Keep line 265 (sign-off by u(13)) as is.

- [ ] **Step 3: Wherever the harness lists the last expected migration (from the grep), add `0064_evaluation_write_path`; commit**

```bash
git add -A && git commit -m "Align grant count and evaluation suite with 0064"
```

### Task 4: Runtime suite for the write path

**Files:**
- Create: `apps/api/src/modules/evaluations/evaluations.local.test.ts` (pattern: `apps/api/src/modules/activity-extensions/activity-extensions.local.test.ts`; gate env `PATHWAYS_EVALUATIONS_LOCAL_TESTS=1`, `PATHWAYS_REPLAY_PORT`)

**Interfaces:**
- Consumes: `EvaluationsService` routes added on the branch (`createCriteria`, `publishCriteria`, `startEvaluation`, `saveScores`, `submit`, `returnToDraft`, `signOff` - use the exact method names in `evaluations.service.ts` on the branch).

- [ ] **Step 1: Write the suite with synthetic ids (prefix `a9640000-...`), roles M&E (n=2), second M&E (n=4), Project Manager (n=3), Program Manager (n=5); cases:**
  1. M&E creates, publishes criteria; starts an evaluation; scores; submits -> SUBMITTED.
  2. PM returns with a reason -> DRAFT, evaluated_at and overall_score null.
  3. PM raw `UPDATE project_evaluations SET title='PM edit'` on the DRAFT under its session -> rejects 23514 `Draft evaluation edits require evaluations.submit`.
  4. M&E edits commentary on the DRAFT -> succeeds.
  5. Second M&E submits the draft without changing evaluated_by_id -> rejected by RLS (actor binding).
  6. M&E resubmits; PM signs off (review and sign-off in one action) -> SIGNED_OFF with reviewed_by_id = signed_off_by_id = PM.
  7. Program Manager reads the evaluation and scores; any write -> forbidden.
- [ ] **Step 2: Run it on a replayed stack**

Run (from the worktree): `pwsh infra/supabase/phase6/Verify-Forward.ps1` (or the replay template runner per `docs/runbook-local-dev.md`), then
`PATHWAYS_EVALUATIONS_LOCAL_TESTS=1 PATHWAYS_REPLAY_PORT=<port> pnpm --filter @pathways/api exec vitest run src/modules/evaluations/evaluations.local.test.ts`
Expected: 7 passed.
- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "Add runtime suite for the evaluation write path"
```

### Task 5: Full verification and docs

- [ ] **Step 1:** Local replay 0000-0064 green, including `finance-evaluation-decisions.sql`, `f10-f11-rules-runtime.sql` and the 0063 suite.
- [ ] **Step 2:** `pnpm --filter @pathways/api typecheck && pnpm --filter @pathways/api lint && pnpm --filter @pathways/api test`; same three for `@pathways/web`.
- [ ] **Step 3:** Defense rehearsal: `pnpm db:local:reset`, wipe, `pnpm db:defense:local`, `node scripts/db/defense-demo.mjs --test-local --verify` -> 23/23.
- [ ] **Step 4:** CR status -> "Approved (developer, 2026-10-06)"; section 9 records real verification results; `docs/activity-log.md` entry; commit.

## Controller-only (not implementer tasks)

- SAD migration review of 0064 (migration-integrity-guardian, organization-isolation-checker, restraint-guardian).
- Apply 0064 to devV2 per the staging auto-migrate rule; merge `feature/evaluation-write-path` into local dev; push origin dev only when the developer says.
