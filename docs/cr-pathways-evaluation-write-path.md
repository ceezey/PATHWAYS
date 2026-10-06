# Change Record: Evaluation write path

**ID:** `cr-pathways-evaluation-write-path`
**Date:** 2026-10-06
**Status:** Approved (developer, 2026-10-06)

## 1. Trigger

The developer asked for an in-app way to run an OECD-DAC style evaluation on the Monitoring
& Evaluation tab, aligned with the DSD and UI foundations, with the Monitoring and Evaluation
Officer configuring criteria and other roles reading the result only. The repository already
recorded this as a gap: "In-app evaluation scoring and OECD-DAC presets" (deferred-features.md,
found 2026-10-05) and audit finding DR-08 (audit-pathways-defense-readiness-20261005.md). The
database already enforced the evaluation lifecycle, the weighted and overall score math, and a
three-person approval chain (migrations 0000-0026), but every evaluation write permission
(`evaluations.submit`, `.approve`, `.signoff`) was revoked by the revised RBAC baseline (0027)
and left reserved; the only live evaluation action was `evaluations.weights.configure`, granted to
both System Administrator and the M&E Officer, with no screen to create, score, submit, review
or sign off an evaluation. The EHK evaluation in the demo data exists only because the seed writes
it directly through the database owner connection.

## 2. Current Contract

- `ProjectEvaluationCriterion`, `ProjectEvaluation`, `ProjectEvaluationScore` and their triggers
  (`p3_guard_criterion`, `p3_guard_evaluation`, `p3_guard_score`) compute weighted and overall
  scores and enforce `DRAFT -> PUBLISHED` for criteria and
  `DRAFT -> SUBMITTED -> REVIEWED -> SIGNED_OFF -> ARCHIVED` for evaluations, with the reviewer
  and signer required to differ from the evaluator (and, until this change, from each other).
- `evaluations.submit`, `.approve`, `.signoff` and `.archive` are defined permission codes held by
  no role (`docs/cr-pathways-revised-rbac-baseline.md`, `docs/rfc-pathways-auth-rbac-isolation.md`).
- `EvaluationsService` supports only `initializeCriteria` (System Administrator,
  `settings.configure`) and `configureWeights` (`evaluations.weights.configure`); `get` returns
  only the latest evaluation's summary, with no scores.
- `live-evaluation-workspace.tsx` can display that summary and edit draft weights; it cannot
  create criteria (outside the Administrator path), publish them, or create, score, submit,
  review or sign off an evaluation.

## 3. Proposed Change

- **Criteria:** the Monitoring and Evaluation Officer creates, edits and publishes a project's
  evaluation criteria (an OECD-DAC set is a natural preset, entered the same way as any other set);
  the System Administrator keeps `settings.configure` for the existing seed path only, and loses
  `evaluations.weights.configure`.
- **Scoring:** four criterion types (KPI, Timeline compliance, Budget efficiency, Beneficiary
  reach) are scored automatically from project data; the fifth (Other, for Relevance, Coherence,
  Sustainability and similar judgment criteria) is scored manually with a required note. A
  computed type that cannot be computed from the project's data falls back to the same manual
  requirement, naming the reason. Beneficiary reach counts beneficiaries enrolled (active or
  completed by the evaluation period end), not the SADDD reached figure the project overview shows;
  counts of 1-4 are suppressed (not computable, never printed). Budget efficiency needs
  `budgets.read` and `expenses.read`, and M&E lacks `budgets.read`, so for M&E it is always not computable and takes a
  manual score and note.
- **Lifecycle:** M&E scores and submits; the Project Manager reviews and signs off in one action
  (or returns the evaluation to draft with a reason). Signed off is final and reportable.
- **Visibility:** every role that can already see the Monitor & Evaluate tab keeps read-only
  access to every evaluation and its scores; only M&E and the Project Manager can write.
- Several evaluations (Mid-term, Final, or a custom label) may exist per project, each with its
  own period; only one may be open (Draft, Submitted or Reviewed) at a time.

## 4. Impact

### Product
Closes the DR-08 gap for in-app evaluation; the EHK-style demo evaluation becomes reproducible
through the product instead of only through the seed.

### Data / Migration
New migration `0064_evaluation_write_path`:
- `p09_role_allows`: grants M&E `evaluations.submit`; grants the Project Manager
  `evaluations.approve` and `evaluations.signoff`; revokes System Administrator's
  `evaluations.weights.configure`. `role_permissions` rows updated to match.
- `project_evaluation_criteria` INSERT policy also accepts `evaluations.weights.configure`
  (previously `settings.configure` only); `p10_guard_evaluation_weight` (which blocked a
  weights-only holder from editing anything but the weight) is dropped, since the one role left
  with UPDATE access is exactly the role meant to edit and publish its own draft.
- `project_evaluations`: the `p3_evaluation_values` CHECK no longer requires `signed_off_by_id` to
  differ from `reviewed_by_id` (still must differ from `evaluated_by_id`), so one Project Manager
  action can review and sign off together. `p3_guard_evaluation` gains one transition,
  `SUBMITTED -> DRAFT` ("return for correction"), which clears `evaluated_at` and `overall_score`
  and freezes every other recorded field except the new `return_reason` column (the return
  reason never overwrites the evaluator's commentary). Only an `evaluations.approve` holder may
  return, a reason is required, and the CHECK plus the guard clear `return_reason` on resubmission
  and outside DRAFT. The postcondition asserts the policies, the column and the approve check.
- `project_evaluations`' `p09_update` RLS policy is rebuilt: no UPDATE could reach `DRAFT` before
  this change, so the baseline's `WITH CHECK` sent it to the generic `evaluations.submit` case.
  The Project Manager's return only holds `evaluations.approve`, so `DRAFT` now accepts either
  holder. RLS `WITH CHECK` only sees the proposed new row, not the prior status, so the gap
  is closed in the lifecycle trigger: `p3_guard_evaluation` rejects a runtime `DRAFT -> DRAFT`
  update unless the caller holds `evaluations.submit` on the project (SQLSTATE 23514, `Draft
  evaluation edits require evaluations.submit`). A Project Manager can therefore only return a
  submitted evaluation, not edit an unsubmitted draft's recorded fields.
- Two new RESTRICTIVE policies bind `evaluated_by_id` / `reviewed_by_id` / `signed_off_by_id` to
  the calling session on the statement that sets each one.
- `rbac-contract.json` updated (`permissions` map and a new `amendments` entry) to match.

### Authorization / Privacy
Evaluation actor names were already visible to monitoring.read holders. The evaluation response
now returns only an allowlisted criterion snapshot, and the reach criterion is an enrolled count
with the small-cell rule applied (counts 1-4 are never shown), which is distinct from the SADDD
reached figure.
The RBAC ceiling in `authorization-policy.ts` is updated alongside the database grants.

### API
New routes under `projects/:projectId/evaluation`: `POST criteria`, `POST criteria/publish`,
`POST evaluations`, `PATCH evaluations/:id/scores`, `POST evaluations/:id/submit`,
`POST evaluations/:id/return`, `POST evaluations/:id/signoff`. `GET` now returns every evaluation
(capped at 20) with its scores, not only the latest summary. New `EvaluationMetricsService`
computes the four data-backed criterion scores, reusing existing shared metric helpers
(`kpiAchievement`, `budgetUtilization`, `efficiencyRatio`) and the project's own indicator,
budget, activity and enrollment data.

### UI
`live-evaluation-workspace.tsx` gains: a Publish action on the criteria table; an evaluations list
with status, scores and who acted; a Start an evaluation form; a scoring table (computed rows
read-only with their formula, Other-type rows editable with a required note); Submit, Return and
Sign off actions, each behind a confirmation dialog matching the DSD's consequential-action rule.

### Tests
- `evaluations.service.test.ts`, `evaluations.assessment-detail.test.ts`: updated for the new
  constructor dependency and response shape; all pass.
- `core-feature-client.test.ts`: updated for the new response and request shapes; all pass.
- `live-evaluation-workspace.test.tsx`: updated plus five new tests covering publish, start,
  score + submit, return, and sign-off.
- `prisma/legacy-retirement.test.ts`: migration directory list updated.
- API and web `pnpm typecheck` and `pnpm lint` (biome) are clean; the full API (2222 tests) and
  the touched web suites pass.
- Migration, runtime suite and defense rehearsal were run locally; see section 9 for results.

### Documentation
This record; `deferred-features.md` (the "In-app evaluation scoring" row); `dsd-pathways.md`
section on evaluation approval stages; `sdd-pathways.md`'s evaluation entity note;
`activity-log.md`.

## 5. Alternatives Considered

- **Keep the three-person chain (M&E submits, PM reviews, Program/Grant Manager signs off)**:
  closer to the original design and needs no CHECK relaxation, but the developer asked for a
  two-person model (M&E and PM only); a third-role dependency was rejected as unnecessary scope
  for today.
- **Score every criterion type manually**: simplest, smallest diff, but ignores data PATHWAYS
  already holds and weakens the OECD-DAC "system evidence plus professional judgment" framing the
  developer specifically asked for.
- **Compute every criterion type, including Other**: rejected; Relevance, Coherence and
  Sustainability have no data to compute from, and scoring them automatically would read as an
  autonomous judgment, which conflicts with the project's no-autonomous-decisions stance.

## 6. Migration / Rollback

Apply `0064_evaluation_write_path` after `0063`. Rollback: revert the migration (restore
`p09_role_allows` to its pre-0064 body per the preserved SQL in 0055; restore the original
`p3_evaluation_values` CHECK, `p3_guard_evaluation` function body and `project_evaluations`
`p09_update` policy, all reproduced verbatim in this migration's predecessor state in
`0000_pathways_baseline_through_0026`; restore `p10_guard_evaluation_weight` and its trigger; drop
the two new actor-binding policies; reinstate the original `project_evaluation_criteria` INSERT
policy; drop the `return_reason` column and its constraint, revert the `role_permissions` and `rbac-contract.json` changes). Restoring the original
`p3_evaluation_values` CHECK needs `NOT VALID` or a data decision once one-action sign-offs exist
(a reviewer equal to the signer would violate it). Otherwise no destructive data change.

## 7. Verification

Completed locally (results in section 9): the migration applied through the full 0000-0064 replay;
`evaluations.local.test.ts` (8 cases) covers create, score, submit, return, resubmit and sign off,
the RLS denials for other roles (including a Project Manager `DRAFT -> DRAFT` edit, which the
trigger rejects) and evaluator self-binding; and the defense rehearsal stayed 23/23.

Not yet performed: the in-app UI walkthrough as M&E (create criteria, publish, start an evaluation,
score, submit), then as Project Manager (return, then sign off), then as a read-only role (Program
or Grant Manager). This is pending a human.

## 8. Approval

Approved by the developer on 2026-10-06.

## 9. Disposition

Verified locally on 2026-10-06 (worktree `feature/evaluation-write-path`); no hosted database, including devV2, was touched.

- Replay: `Replay-Local.ps1 -MigrationBaseline` exit 0 on 0000-0064 (161 PASS, 0 FAIL), including `F10_F11_RULES_RUNTIME`, `FORWARD_0063_RULES_SCOPE_MEMO_RUNTIME`, `RBAC_V4_GRANTS_RUNTIME` and `CURRENT_SCHEMA_API_RUNTIME`; the wired `evaluations.local.test.ts` ran inside the gate (8 passed).
- Suites: `f10-f11-rules-runtime.sql` PASS (75 checks) on the saved template. `finance-evaluation-decisions.sql` is a stale Phase 3 suite that already fails at its project fixture insert ("Source proof unavailable", rules source-proof trigger) before any evaluation logic; its 0064 assertion edit stays unexecuted and the new runtime suite covers that behavior.
- API: typecheck and biome clean; 116 test files passed (2222 tests, 20 skipped). Web: typecheck and biome clean; 203 files (1821 tests) passed. After the final review fixes (return reason column, snapshot allowlist, enrolled reach, budget visibility, guarded saves) the full MigrationBaseline replay was re-run: exit 0, 161 PASS lines, evaluations.local.test.ts 8 passed.
- Defense rehearsal on the local stack: `db:local:reset`, wipe, `db:defense:local`, `defense-demo.mjs --test-local --verify` returned 23/23.
- Not yet applied to devV2; controller SAD migration review is separate.
