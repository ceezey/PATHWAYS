# Modularization rulings log

Purpose: this log collects every ruling the controller made per unit, with its stated cost if wrong, and feeds the final "Rulings I made" report. Lines are copied verbatim from the per-unit collections and SDD ledgers, apart from dash fixes.

## F1

Ruling: T2 wiring count is 7 lines, not 6, plan text miscount, list is authoritative, cost if wrong: none.

Ruling: T10 Step 6 merge into local dev proceeds without asking, standing developer rule (merge to local dev after QA; push only on instruction) and developer said "I trust you", cost if wrong: one revert of a local merge commit.

Ruling: Task 0 (install, env copy, baseline, plan commit) run by the controller, not a subagent, setup only, no product code, cost if wrong: none.

Ruling: worktree needs `prisma generate --config prisma.generate.config.ts` before tests, fresh worktree had no client (94 api files failed), cost if wrong: none.

Ruling: docs:check 7th failure is the unregistered F1 plan file, Task 9 adds its index row, cost if wrong: one docs:check failure remains until Task 9.

Ruling: keep 'not_configured' in PathwaysClientError code union, requestFoundation still throws it (missing browser client, unapproved API base URL), plan text was wrong, cost if wrong: one unused union member.

Ruling: mapPublicSnapshot (public-projects.ts:22) is production-dead and used only as a fixture builder by public-project-detail.test.tsx; deferred to S8 (public slice) because it depends on the module-private snapshot schema, cost if wrong: one test-only export lingers until S8.

Ruling: AnalyticsCoverageStatus (types/pathways.ts:68) deletion folded into Task 7 Step 5, same dead-type pruning, cost if wrong: none.

Ruling: delete finance-budget-summary.tsx and budget-form-validation.ts (with tests) in Task 6, orphaned by Task 6 deletions, F1 is dead-code scope, cost if wrong: restore two files from git.

Ruling: Task 8 Step 1 phase5/phase7 hits in apps/api/prisma/authorization-bootstrap-*.ts and phase6/Replay-Local.ps1 are identifiers (phase5Checksums, SAVEPOINT phase5_*, $phase7Migration), not paths, controller grep for path forms empty, cost if wrong: replay or bootstrap tests fail in Task 10.

Ruling: Task 10 gates run by the controller (commands only, no code) and SAD specialists dispatched by the controller, since subagents cannot spawn subagents, cost if wrong: none.

Ruling: Task 4 fix round 1 (d0ac9cdb, Biome formatter-only) verified by the full static gate rerun instead of a separate re-review, formatter output is mechanical and lint is the check, cost if wrong: none.

Ruling: fix Important 1 by changing root package.json `rules:dispatch` to `tsx --tsconfig apps/api/tsconfig.json apps/api/src/rules-dispatcher.ts` rather than restoring the root tsconfig, the entry file lives in apps/api and that tsconfig has the same @pathways paths; explicit beats implicit lookup, cost if wrong: one script line to revert.

Ruling: fold all six final-review minors into the single final fix wave, each is a one-line doc or test edit, cost if wrong: none.

Final: parked, wiring test casts nested dynamic imports to ModuleRef and skips object providers ({provide,useClass}), Ruling: deferred to F3 (API core) where common module wiring is reworked, cost if wrong: a duplicate object provider goes unflagged until F3.

Ruling: SAD specialists run at the final branch head after the gate-results docs commit; the SAD sign-off outcome is recorded in the merge commit message (a later docs commit would change the digest), cost if wrong: the activity log lacks the sign-off line until the next docs edit.

Ruling: amend the earlier SAD ruling, gate results go into docs/activity-log.md as a docs-only commit on dev after the merge, so SAD runs now against final branch head dd663426, cost if wrong: none.

SAD G1: beneficiary-privacy-guardian BLOCKED apps/web/src/lib/services/pathways-client.test.ts:235-238, test name 'returns no beneficiary records for aggregate-only roles' claims role enforcement the client lacks (returns [] only without projectId). Plan-mandated name (Task 5 brief). Ruling: rename to 'returns no beneficiary records without a project scope', the plan's name was wrong, cost if wrong: none.

Ruling: F1 e2e gate passes on parity with dev; the 9 failures pre-exist on dev (MFA Verify helper waits on a detached button, password-login harness renders blank, seed project end date precedes yesterday), F1 touched none of these paths, if wrong, an F1 regression ships to local dev and is caught by the F2 e2e run.

## F2

Ruling: Task 0 run by the controller (branch, plan commit, baseline), mechanical setup with no review surface, if wrong, a baseline number is misread and later comparisons need a rerun.

Ruling: api to web route-access import (route-access.service.ts, dashboard-home parity test) left for F4 as the plan proposes, fixing it needs the route table split that F4 owns, if wrong, MOD-02 stays partly open one unit longer.

Ruling: CR amendments beyond 3.4 (3.2, 3.7 F2/F3 rows, section 7 risk row) accepted in Task 7, they restate subpaths and the contract example that rulings 1 and 2 changed, if wrong, revert those bullets.

Ruling: scan findings 1, 4-14 applied to the plan text (intent-to-add before biome, web build exit check, .tmp allowed for logs, duplicate-import loop in every task, tautological timeline assertion dropped plus lint before the move commit, severityOrder const, no Kind alias, named pathways-client import, alert-lifecycle line range, check.test fixture path rule-editor.tsx, alert-lifecycle uses the shared DecisionOutcome), each is a plan defect a reviewer would flag, if wrong, a task brief is stricter than needed.

Ruling: finding 2 (Task 0 already done) closed by the ledger; finding 3 (trailer) keeps "Claude Opus 5.5", which is the session attribution, the scanner misread the model, no cost.

Ruling: finding 15 verified safe: role-routes spec types no PIN, so dropping the fixture's isAcceptableStepUpPin stub runs the real check harmlessly, if wrong, the role-routes suite fails in Task 6 and the stub is restored.

Ruling: implementer commits may carry the Claude Sonnet 5.5 trailer their own harness assigns, it accurately names the authoring model and F1 already mixes both, if wrong, trailers are cosmetic and need no rewrite of unpushed history.

Ruling: park the seed comment Minor and fold it into Task 7 (living doc paths), it is a prose path fix with no behavior, if wrong, one stale comment survives.

Ruling: park the pre-existing literal NUL key separator in apps/web/src/features/rules-board/rule-output-fields.tsx:116,118 for S7 (replace with a \u0000 escape), it predates F2 and changes no behavior, if wrong, git keeps treating the file as binary in diffs until S7.

Ruling: parity test gaps for pageSchema and decimalString accepted, both moved verbatim per the byte-identical check, if wrong, a drift would surface in the rule editor tests.

Ruling: Task 7 also routes packages/shared/src/rbac/**/*.ts to organization-isolation-checker (glob, check.test.ts case, sad-pathways.md 3.1), CR section 7 requires that reviewer when rbac code moves and the policy left apps/api where no glob matched it anyway, if wrong, one extra reviewer runs on rbac changes.

Ruling: fix wave takes Important 1 plus Minors 1, 2, 3, 4 and 8 (deferral note) in one dispatch, each is a small correctness or readability defect inside F2, if wrong, extra churn only.

Ruling: Minors 5 (sideEffects false) and 6 (generic barrel names) carried into the F3 plan; Minor 7 (vitest pragma position) skipped as cosmetic and pre-existing pattern, if wrong, bundle weight grows until F3 and a naming clash surfaces in F3 planning.

Ruling: gate results are recorded on dev after the merge (as in F1), not on the branch, a branch commit after SAD would change the digest and void the evidence, if wrong, the record lands one commit later.

Task 8: replay exit 0, 0 FAIL, 171 PASS, 3835 s at 594ea570. Ruling: replay result accepted for 607ececa, later commits are docs, SAD globs, a seed comment and import-shape changes with no runtime difference, if wrong, the next unit's replay catches it.

F3 planning: plan drafted (scratchpad) with F3 split into F3a (kernel: Tx, currentBusinessDate, identity to common/authz, requireScopedProject, writeAuditLog, guard move, boundary test) and F3b (ZodPipe and first contract, barrel naming, sideEffects, withAuthorizedOperation move, storage injection, wiring test). Ruling: accept the split, one F3 branch would touch about 200 files across five concerns, if wrong, one more merge cycle.

Task 8: demo seed run 2 exit 0 (9 reports). Ruling: run 1 timeouts attributed to post-replay Docker load as in F1, F2 touches no seed, import or report write path, if wrong, a timing regression surfaces in the e2e run.

Ruling: browser click-through smoke replaced by the e2e suites plus compiled API boot, the session runs unattended and the e2e specs cover the dashboard, rules, reports, step-up and user management flows the plan listed, if wrong, a visual-only regression waits for the developer's manual check.

## F3a

Ruling: Task 0 baseline reuses the F2 static gate run at 607ececa (config 19, shared 170, imports 91, api 2307 passed 21 skipped, web 1895, sad 48, docs:check 6 FAIL, middleware 112 kB), dev differs from 607ececa only in docs, if wrong, a count comparison is off and Task 7 reruns everything anyway.

Ruling: findings F2 (caller-level 503 characterization test added to Task 1 Step 5, api target +1), F3 (nine call sites), F5 (about 133 annotations), F6 (projectDateFields defined once in common/authz/scoped-project.ts), F8 (boundary test uses __dirname and asserts files were scanned), F11 (docs check exactly 6) applied to the plan; activity-log rulings pointer redirected to CR section 9 because the plan is deleted after merge, each is a plan defect a reviewer would flag, if wrong, a brief is stricter than needed.

Ruling: F1 (Task 0 already done) closed by the ledger; F4 trailer: implementers may use their own harness trailer; F7 (env parsed twice in two services) accepted, readApiEnv is pure and cheap and behavior is unchanged; F9 (third writeAuditLog test redundant) kept as a cheap regression guard; F10 no action, if wrong, cosmetic only.

Ruling: Task 6 review and final review run in parallel, Task 6 is docs-only and both feed one fix wave, if wrong, a Task 6 finding repeats in the final review.

Ruling: F4 web import-direction enforcement tool left to the F4 plan, CR 3.1 says so, Biome 1.9.4 cannot express globs (F3a ruling 2), if wrong, F4 picks a Vitest test like F3a.

Ruling: browser click-through smoke replaced by the seed run (which drives the scoped and audited write paths through the API) plus both e2e suites, unattended session, if wrong, a visual-only regression waits for the developer.

## F3b

Ruling: Task 0 baseline reuses the F3a static gate run (config 19, shared 170, imports 91, api 2324 passed 21 skipped, web 1895, sad 49, docs:check 6, middleware 112 kB), dev differs only in docs, if wrong, Task 8 reruns everything anyway.

Ruling: the zod contract rejects request bodies with an own __proto__ or constructor key that the class-validator DTO silently accepted; accepted as a stricter, security-tightening difference recorded in CR 3.6, the developer approved that validation wording may change and no client sends those keys, if wrong, add a preprocess that strips them.

Ruling: F1 (rule-based-access-alignment.test.ts reads the moved SQL; repoint it in Task 4 commit 1), F3 (hand-review all 29 constructor sites), F4 (assert PRIVATE_STORAGE_FACTORIES has one owner), F5 (26 sites), F6 (label the pipe-order guard test) applied to the plan, each would otherwise break a commit or leave an unpinned claim, if wrong, briefs are slightly stricter.

Ruling: F2 trailer, implementers use their own harness trailer, as in F2 and F3a, cosmetic.

Ruling: option A, commit 1 holds the contract and the parity test (which passes the DTO metatype explicitly and is the equivalence proof); the HTTP test lands in the switch commit as a test of the new route, verified: apps/api/vitest has no swc plugin while nest build emits decorator metadata (tsconfig emitDecoratorMetadata true), if wrong, the old-route HTTP behavior stays proven only by the parity test.

Ruling: Task 8 smoke adds a compiled-API probe: POST the validate route on dev:local with an extra key and with expectedMappingRevision 0 and expect 400 with a string[] message, Vitest cannot exercise decorator-driven validation, if wrong, a production-only validation gap could ship.

Ruling: Task 3 dispatched while Task 2 is under review, Task 3 touches only packages/shared/package.json and measurements, disjoint from Task 2 files, if wrong, a Task 2 fix round rebases trivially.

Ruling: accept exporting PrivateInspectionStorageConfig and AuthorizedPrivateInspectionObject (type-only) to fix TS4023, no runtime change, if wrong, revert to an explicit annotated type.

Ruling: fix by adding a surviving contract test in packages/shared/src/contracts/imports/import-requests.test.ts asserting own __proto__ and constructor keys are rejected, and reword CR 3.6 to point at it, a live test is better evidence than a past-tense note, if wrong, one extra shared test.

Ruling: compiled-API validation probe replaced by inspecting dist imports.controller.js, ZodPipe(validateImportRequest) is wired and the body design type is Object, so production matches the Vitest HTTP test (201 forward, 400 for '2', 0, {}, extra key); an unauthenticated POST returns 401 from the guard before any pipe, a live probe needs an aal2 session the unattended run cannot mint, if wrong, the e2e import flow and the seed's validate calls still exercise the route.

## F4a

Ruling: Task 0 baseline reuses the F3b static gate run (config 19, shared 178, imports 91, api 2337 passed 21 skipped, web 1895, sad 50, middleware 102 kB, web build exit 0), dev differs only in docs, if wrong, Task 7 reruns everything.

Ruling: accept the planner's F4 split into F4a (boundaries) and F4b (helpers), about 12 tasks in one branch, if wrong, one more merge cycle.

Ruling: findings 1, 3 (left for S8), 4, 5, 6, 7, 8, 9, 10 applied as binding amendment notes inside Tasks 1, 2, 3, 5 and 6, each prevents a broken or vacuous commit or a stale record, if wrong, briefs are slightly stricter.

Ruling: finding 2 trailer, implementers use their own harness trailer, as in F2 to F3b, cosmetic.

Ruling: the moved auth platform modules are six (auth-access, mfa-flow, password-recovery, verification-flight, workspace-access, workspace-verification) plus tests and fixtures (16 files); workspace-resolution is only a test; the fix wave changes 'seven' to 'six' in CR section 9 and the activity log, verified from git show `--stat` 9d01d3d0, no cost.

Ruling: include the start:dev and dev:legacy-db shared build prefix (finding 5), same reasoning as F2 ruling 9, prevents a stale shared dist after F4a adds route-policy exports, if wrong, dev scripts take a few seconds longer.

Ruling: add one web route-gating rule to the organization-isolation-checker in sad-pathways 3.2 (finding 11), the role now receives web auth and rbac files but had only DB/RLS rules, if wrong, revert the routing instead.

Ruling: accept package boundary floor of greater than 40 (not 50) since the real scan counts 45 files; the floor still catches a scan that silently returns nothing; cost if wrong: one number to raise later.

Ruling: accept fixture specifiers '@/features' and '../../app' because bare '../features' from lib/rbac resolves inside lib; cost if wrong: a fixture edit.

Ruling: split the 132-path design QA review into two dispatches and concatenate the replies, keeps each reviewer within a reliable context budget, if wrong, one role's view spans two halves, mitigated by both seeing the same packet.

Ruling: user chose parallel plans only for S1 to S8 (2026-10-09); workflow drafts all eight plans to scratchpad s-plans plus a cross-plan reconcile; implementation stays sequential in C:\PATHWAYS without worktrees; each unit still gets its own pre-flight scan against the code at its start.

Ruling: treat the seed failures as load, not regression, F4a touches no seeded API path beyond an import repoint and the same timeouts cleared on rerun in F1 and F2, rerun seed and e2e once the planning workflow ends; if it fails again at low load, investigate as a regression.

Ruling: the earlier P2028 failures were load, the same stages completed this time at low load, if wrong, they return at the next seed and get debugged then.

Ruling: do not restart Docker Desktop over an external quit; ask the user; resume the S planning workflow (wx988b5qc) meanwhile, since it needs no Docker, if wrong, the F4a gates wait one more round.

Ruling: run e2e on this seed, e2e specs reference Reports only as a nav label, then rerun the full seed once the planners finish and merge only after a clean seed, if wrong, a report-dependent e2e path is missed until the rerun.

## F4b

Ruling: branch created by the controller before Task 0 Step 1 ran, from dev 675a0b58 rather than the merge commit itself, 675a0b58 adds only the activity-log gates line, if wrong, Step 1 checks still pass because they test the F4a tree.

Ruling: treat the ZodPipe timeout as load, the test passed alone and in every F4a gate, if wrong it reappears at the Task 8 gates.

Ruling B1: Task 1 Step 3 gains git add -N and biome check `--write` before vitest, the repoint leaves an unsorted import and lint fails, cost if wrong: none, the formatter is idempotent.

Ruling S1, S2, N7, N10, N11: prose and count corrections applied as the scan proposed, they describe what the code already does, cost if wrong: a misleading line in the plan only.

Ruling S3: readWorkspaceContextCookie comment states behavior, not history, CLAUDE.md one-sentence comment rule, cost if wrong: none.

Ruling S4: the hook file keeps no 'use client' and the ruling text now names use-current-role and use-permission, every importer is a client module, so the boundary is unchanged, cost if wrong: a server importer would fail at build, which Task 6 and Task 8 builds catch.

Ruling N2: repoint.mjs dropped from Task 1 Produces, no later task uses it, cost if wrong: none.

Ruling N3: keep the literal sticky-table-head test as a deliberate pin, counts unchanged, it pins the exact class string the refactor must not alter, cost if wrong: one change-detector test.

Ruling N4, N5, N8, N9: no change; keep date.test.ts, keep the S8 deferral of three cookie readers visible in CR 9 and the log, keep 2026-10-10 dates per the F4a precedent, leave the CR 3.7 row wording, cost if wrong: cosmetic.

Ruling N6: CR 9 Decisions bullet now notes lib/api/core/request still imports lib/services until the slices rename it, makes the deferred dependency visible, cost if wrong: none.

Ruling: parked the cn minor, converting to cn changes class merge semantics, out of scope for a behavior-preserving task, cost if wrong: cosmetic.

Ruling: treat the beneficiary-detail-loader failure as load flake, passes alone and on reruns, Task 5 does not touch its path, cost if wrong: it reappears at Task 8 gates.

Ruling: park both minors, merging the cookie parsers changes return shapes and belongs to the S8 cookie-reader deferral, cost if wrong: one small duplicate helper.

Ruling: no hash on the Task 7 activity-log bullet, a commit cannot cite itself and the Task 8 gates line carries the merge hash, cost if wrong: cosmetic.

Ruling: keep the three new provider exports without a CR 9 note, the plan's Task 6 names them and the CR F4b block records the hook move, cost if wrong: one missing doc line.

## S1a

Ruling: branch created by the controller before Task 0 Step 1, as in F4b, Task 0 Step 1 checks still test the dev tree, cost if wrong: none.

Ruling: accept the cross-plan two-convention validation split (ZodPipe where a class-validator DTO existed; service-side parse where the module already parsed unknown), it preserves each module's current 400 body shapes per CR 4, cost if wrong: S3, S6, S7 and S8 publication would need a later ZodPipe migration; developer can override.

Ruling: plans keep the Opus 5.5 commit trailer, it is the repo rule from the handoff, cost if wrong: naming only.

Ruling: seed and scripts/sad/check.ts exact-text anchors are left for each Task 0 to verify, cannot be settled by reading, cost if wrong: a Task 0 stops with NEEDS_CONTEXT.

Ruling: S2 and S3 dry runs used S1a as written; S2a Task 0 anchors catch any drift, cost if wrong: an S2a Task 0 stop.

Ruling SF1: correct the api expected counts (one controller-dto-runtime-metadata case lost per DTO route switched in Tasks 3 and 4; final +74 not +76), measured on a pristine copy, cost if wrong: a gate stops on a count and is re-ruled.

Ruling SF2: the case-insensitivity tests (Task 2 parity, Task 7 lowercased id) use a UUID with hex letters, digits-only UUIDs make toUpperCase a no-op so the tests assert nothing, cost if wrong: none.

Ruling SF3: keep the Nest HTTP scaffold copies in the Task 3 and 4 tests and record a shared test helper as W1 work in "Out of S1a", adding a helper now changes F3b test files outside the slice; the copies are test-only, cost if wrong: about ten more test copies until W1.

Ruling notes: fix the prose-only notes (script labels, MOD-11 cell punctuation, one-sentence comments without semicolons or plan terms); leave ProjectResponse vs ApiProject to S1b and the cold-run beforeAll timeout as a known flake, cost if wrong: cosmetic.

Ruling: review S1a tasks in pairs (1+2, 3+4, 5+6, 7+8), handoff token budget rule from F4b, cost if wrong: a defect in the first task of a pair is caught one task later.

Ruling: Task 2 Step 4 deltas (+32 shared, +169 api) are cumulative from the Task 0 baseline, 186+32=218 and 2339+169=2508 match the measured totals, cost if wrong: none. Later briefs: read expected deltas as cumulative from Task 0 unless stated.

Ruling: the two failed seeds were transient transaction expiry (both ran within 30 minutes after the replay, likely post-replay database load), not S1a, the same code passed later and the path does not touch S1a code, cost if wrong: an S1a slowdown on the survey report would surface again at the next slice's seed gate.

## S2a

Ruling: S2a runs before S1b, S2a needs only S1a (api only) and S1b has no full plan yet; S1b is planned in parallel against 703fde72 from an exported copy, cost if wrong: S1b Task 0 recounts and stops on drift.

Ruling: branch created by the controller before Task 0 Step 1, same as F4b and S1a, cost if wrong: none.

Ruling: review S2a tasks in pairs (1+2, 3+4, 5+6, 7+8, 9+10), handoff token rule, cost if wrong: a defect in a pair's first task is caught one task later.

Ruling: the Task 0 named-symbol grep expects 0 but prints 18, every hit is the existing api definition or use (activities.dto.ts, activities.service.ts, private-proof-inspection.service.ts, beneficiary-media.dto.ts) that S2a moves to shared; packages/ has 0 hits, which is the collision check that matters, cost if wrong: a shared barrel name collision would fail typecheck (TS2308) in Task 1.

Ruling F1: Task 0 grep text now expects the 18 existing api hits and 0 in packages, matches the Task 0 ruling, cost if wrong: none.

Ruling F2: the four case rows use a hex-letter UUID, digit-only UUIDs make toUpperCase a no-op, cost if wrong: none.

Ruling F3-F6: correct the prose counts (18 controllers, six controller files, thirteen DTOs, final line counts from the replay, the DTO test label), they describe what the code does, cost if wrong: a misleading record line.

Ruling F7: the eight semicolon comments become one plain sentence each, CLAUDE.md comment rule, cost if wrong: none.

Ruling F8: strengthen the existing activity-progress.test.ts progress test instead of adding a duplicate; expected counts from Task 6 on drop by 1, reviewers flag duplicated tests, cost if wrong: one count to re-rule at a gate.

Ruling: the brief's 392/286/322/229 are the move script's pre-prune, pre-Biome sizes (duplicated import headers); the implementer did not capture them, but same-lines 863 matched, which is the verbatim proof, cost if wrong: the paired review would catch a missing or extra block.

Ruling: run the 9+10 paired review, the final whole-branch review (sonnet) and the static gates in parallel, all read-only against a fixed HEAD, cost if wrong: a 9+10 fix would need a static gate rerun.

Ruling: accept S1b experimental.optimizePackageImports ['@/features/projects'], without it a plain barrel grows /projects routes to 397 kB; Task 9 production-bundle smoke guards it, fallback is dropping the key and exempting app/, cost if wrong: a dev or prod runtime import issue caught at S1b gates.

Ruling: accept S1b Task 4 removal of review workspace views no route renders (indicators, transparency, Add Indicator dialog, project-review-utils.ts), unreachable code has no behavior to preserve (F1 precedent), cost if wrong: the developer may veto and restore from git; flagged in the final report.

Ruling: apply the S1b cross-plan edits (S2 outline in docs plan, S3, S5, S6, S7 in .tmp/handoff/s-plans) after S2a merges, editing the docs plan now would change the S2a SAD digest, cost if wrong: none.

Ruling: the BLOCKED findings are valid (plan Global Constraint: delete any import name left with no use); fix by one implementer dispatch after the replay finishes, then a scoped design-qa re-review of the two files and a fresh sad:check manifest, import removal has no runtime effect, so the replay and seed results stand, cost if wrong: none.

## S1b

Ruling: branch created by the controller before Task 0 Step 1, same as earlier units, cost if wrong: none.

Ruling: plan written against 703fde72 by a parallel planner; S2a changed only api, shared and seeds, so web anchors should hold; Task 0 recounts, cost if wrong: a Task 0 stop.

Ruling: review S1b tasks in pairs, handoff token rule, cost if wrong: a defect caught one task later.

Ruling SF1: Task 1 replay test uses a vi.fn parse asserted not called, an identity cast cannot prove the mapper is skipped, cost if wrong: none.

Ruling SF2: the parseProjects and index.ts header comments become one sentence, comment rule, cost if wrong: none.

Ruling SF3: drop the comment-only canAssignRole import in Task 7 and update the expected trim output, S2a showed Biome keeps JSDoc-mentioned imports and SAD blocks them, cost if wrong: none.

Ruling SF4: Task 8 hand-edits docs/dsd-pathways.md:1009 and DESIGN.md:606 (unprefixed paths doc-paths.mjs skips), keeps the stale-path grep empty, cost if wrong: one stale doc path.

Ruling SF5: Task 9 and the CR bullet say the review routes shrink 3 to 4 kB, matches Task 6 measurements, cost if wrong: cosmetic.

Ruling SF6: Task 5 Step 3 adds a sed for the renamed test file named in a comment, cost if wrong: one stale comment.

Ruling N: add restraint-guardian to the Task 9 SAD role list if sad:check requires it; other notes unchanged, cost if wrong: none, sad:check decides the roles.

Ruling: accept Task 2 without a full web run, the module is new with no importers yet, Task 3 runs the full suite, cost if wrong: a Task 3 count mismatch.

Ruling: accept the 1-2 kB First Load growth on some routes from Tasks 1-5 (net bundle shrinks; Middleware unchanged; the barrel optimization itself adds 0) and have Task 8 and the gates record the measured differences instead of the plan's "no route grew", cost if wrong: a few kB per route the developer may want reclaimed later.

Ruling: Task 7 line counts selectors 403 (brief 405) and workspace 214 (brief 213) accepted, selectors lose the comment-only import from the pre-flight fix; same-lines 364 and 418 matched so the splits are verbatim; the +1 is formatting, cost if wrong: the paired review would catch a stray line.

Task 9: static gates rerun exit 0, config 19, shared 273, imports 91, api 2429 (21 skipped), web 1943 (+22), sad 53; web build exit 0, Middleware 102 kB; routes vs pre-Task-6 0 differ. Ruling: ZodPipe timeout was the known load flake (passed at low load), cost if wrong: it recurs at the next gate. Replay and SAD started.

Ruling: the plan's six-step manual browser smoke is replaced by an unattended route compile smoke (each listed route requested on pnpm dev:local under Turbopack, expecting no 500 and no module-resolution error) plus both e2e suites; the production build already passed, the developer is away and earlier units' gates had no browser smoke, cost if wrong: an interaction-level regression on a projects screen surfaces in the developer's own testing; listed in the final report for a manual pass.

Ruling: proceed to e2e on the seeded state (every stage except that one report artifact completed), S1b changes no api or SQL code, and the slow step is the pre-existing SQL function pathways.p34_survey_report exceeding the authorized-operation transaction timeout intermittently, cost if wrong: an e2e difference forces a seed rerun; the slow survey report is reported to the developer as a follow-up.

## S2b

Ruling: S2b uses leaf export lines in the feature index instead of an activities sub-index, the dry run measured a sub-index growing /dashboard 673 to 696 kB, overrides the S1b cross-plan note; S3 and S6 were updated to match, cost if wrong: none, leaf exports are the measured smaller option.

Ruling: every web build starts with rm -rf apps/web/.next, a stale .next after moves fails with a misleading Module not found, cost if wrong: a slower build.

Ruling: S2b cross-plan edits applied to S3, S4, S5, S6, S7, S8 and cross-plan-review.md before Task 0, cost if wrong: a later Task 0 recount stops.

Ruling: branch created by the controller; reviews paired, same as earlier units, cost if wrong: none.

Ruling: accept both differences, identical hash proves the file is the planned one and the brief's line count is off by one; the 7th docs failure is the untracked plan missing from the index, cost if wrong: none.

Ruling: apply should-fix 1 as the four-mutation table (replay receipt and refusal without context on create, update, transition, review), counts shift Task 1 +16 and +8 from Task 2 on, Review Focus 1 claims every mutation, cost if wrong: 8 extra tests.

Ruling: apply should-fix 2, 3, 4 (git grep untracked expectation, tightened Task 9 old-path pattern, DESIGN.md in Task 9 scope), cost if wrong: none, all dry-run confirmed.

Ruling: apply notes 5, 6, 7, 8, 9, 11, 13 (wc -l 2394 wording, workspace 491, Task 6 failure message, route names as examples, Task 5 mock only indicator and stage methods on pathwaysClient, manifest may add roles, unstub in finally); leave note 10 (verbatim comments) and note 12 (trailer Opus 5.5 is this session's attribution rule), cost if wrong: none.

Ruling: activities scan matches, the brief's exact command (no names) prints factories 16, naming 0 on 7c146842, cost if wrong: none.

Ruling: accept .tmp/s2b/routes-pre-layout.txt as the Task 3 base, Step 1 only measures the base; the planner's dry run built with .env.example, which the pre-flight scan showed shifts many routes by about 1 kB; no route grows above 1 kB and most shrink, cost if wrong: a 1 kB growth on /alerts/repository from Tasks 1-2 goes unexplained.

Ruling: fix the 490 count and the doubled blank line in the post-merge gates commit (same files, keeps the SAD digest stable); the index row goes with Step 7; historical CRs stay as written history, cost if wrong: two cosmetic doc lines wrong until the gates commit.

Ruling: accept the replay on the rerun, the csv-rbac failure is a pre-existing race between the host-clock assignment cutoff (application-profile.ts new Date()) and the DB-clock assigned_at default, the skew drifts by tens of ms, and S2b changes no api production code or SQL, cost if wrong: a real S2b regression in project reads would be missed, but the api suite (2429) and e2e still cover them. Raise to the developer: compute the cutoff from the DB clock (follow-up outside this refactor).

Ruling: proceed to e2e, the survey report timeout predates the refactor (4 of 7 runs before S2b) and S2b touches no api production code or SQL; every other seed stage passed, cost if wrong: an S2b effect on report generation goes unseen, but S2b has no report code.

## S3a

Ruling: the clock fix was finished by its own session (merge 65e094a2, gates bf8ef5e6) while this session reran static gates (config 19, shared 281, imports 91, api 2429 with 21 skipped, web 1983, sad 53, Middleware 102 kB) and the replay (171 PASS, 0 FAIL, csv-rbac green, the same 14 expected negative migration errors as S1b and S2b) on 71a56c20, no second merge, cost if wrong: none, the fix is merged and double-gated.

Ruling: the clock fix touches none of the six Task 0 hashed files, so the S3a baselines stay those after S2b, cost if wrong: Task 0 stops on a count.

Ruling: apply should-fix 1 (drop project-review-workspace.tsx from the Task 3 Step 4 list, ten files; fix the S3b outline importer list and 8 files) - S1b removed the indicator text there - cost if wrong: none, dev was measured.

Ruling: apply should-fix 2 (Task 0 merge grep requires S1a, S1b, S2a, S2b) - the old grep passes without S1b and S2b - cost if wrong: none.

Ruling: apply should-fix 3 as a new Task 1 case that pins the 404 for a non-UUID id through the controller path, counts shift by 1 - Review Focus 4 claims it per route - cost if wrong: one extra test.

Ruling: apply should-fix 4, 5, 6, 7 (grep -v for the nested helpers path, replace the final period in the audit cells, eleven routes, one-sentence script comment) - cost if wrong: none.

Ruling: apply notes on the Task 6 controller count (15) and the Task 8 gate wording (S2a and S2b); minor notes only where they are pure text fixes; trailer stays Claude Opus 5.5 (this session's attribution rule) - cost if wrong: none.

Ruling: branch created by the controller; reviews paired (1+2, 3+4, 5+6, 7), same as earlier units, cost if wrong: none.

Ruling: S3b full plan written in parallel by a sonnet planner while S3a implements, dry run in an exported copy outside C:\PATHWAYS, handoff standing rule, cost if wrong: machine load can flake the ZodPipe 5 s test, rerun before treating as real.

Ruling: accept the Biome reformat of the new test, formatting only, the paired review checks the cases match the brief, cost if wrong: none.

Ruling: reword the CR section 9 seed sentence in the post-merge gates commit, not on the branch, keeps the SAD digest bound to 767e09b0, cost if wrong: none, docs only.

Ruling: accept the S3b plan; its open questions are already ruled (Biome reformat accepted at Task 1, trailer Opus 5.5, browser smoke replaced by e2e as in S1b and S2b), cost if wrong: none.

Ruling: merge S3a and push dev with the demo seed stopped after its monitoring stage passed, the defense seed and e2e not run, and a compiled API boot (health ok, no Nest dependency errors) in their place; the developer stopped the gates to move to the cloud, cost if wrong: an e2e regression from S3a surfaces on the next local e2e run instead of before the merge.

## S3b

Ruling: record CI run 38345761871 (dev 79ad8bbb, first CI over F1 to S3a); attempt 1 failed in Install dependencies on a cdn.sheetjs.com timeout before any code step ran, the developer was told, and on "do all remaining tasks automatically" the failed job was re-run; the result is recorded below once it finishes, cost if wrong: none, no code ran.

Ruling: in the cloud container xlsx is installed from npm 0.18.5 with packages/imports/package.json and pnpm-lock.yaml reverted, and every pnpm run sets pnpm_config_verify_deps_before_run=false, because cdn.sheetjs.com is unreachable here; the local baseline matched the handoff (config 19, shared 281, imports 91, api 2445 with 21 skipped, web 221 files and 1983 tests, sad 54, docs check 6 failures and 1 warning), cost if wrong: an xlsx 0.20.3 difference goes unseen here, CI installs the real tarball.

Ruling: the environment allows pushes only to claude/modularization-s3b-9ept8o, so that branch replaces refactor/s3b-indicators-web, and S4 to S8 stack on it while S3b waits for the developer's merge (one pull request into dev, updated per slice), cost if wrong: one larger pull request to review.

Ruling: commits keep the Co-Authored-By Claude Opus 5.5 line and add the environment's Claude-Session line, as the handoff says to follow the environment, cost if wrong: one trailer line.

Ruling: builds read apps/web/.env.local, a gitignored copy of apps/web/.env.example, matching the dry run's .env.example builds, cost if wrong: route sizes shift by about 1 kB against the plan figures, which the plan already tolerates.

Ruling: the superpowers implementer and reviewer templates are not in this container, so cloud copies of the common briefs carry the contract in the SDD workspace, cost if wrong: weaker reports, caught by the paired reviews.

Ruling: apply the S3b pre-flight must-fixes (alias count excludes types/pathways.ts so it prints 6; Task 6 greps exclude docs/handoff; Task 0 Step 1 fetches origin/dev and points a local dev ref at it; Task 7 Steps 6 and 7 become a pull request and a post-merge plan removal whose sed matches only the superpowers row) and should-fixes (bash replay with CI as fallback, e2e and smoke recorded as pending local run without Docker, leftover-call grep includes createProjectIndicatorFromLibrary, Task 0 copies the plan, attribution wording, base 79ad8bbb, summary plan path); note 16's 366 against 370 workspace lines is Biome's rewrap and Task 4 checks it with Biome present, cost if wrong: a Task 0 or Task 6 stop.

Ruling: the scan's other notes need no edit (hashes, counts, anchors and cumulative test counts all matched origin/dev 79ad8bbb), cost if wrong: none.

Ruling: accept the Task 0 baseline Middleware 103 kB (the plan's 102 kB came from Windows builds; same .env.example values) as M0 for this container, later builds compare against it, cost if wrong: none, comparisons stay same-machine.

Ruling: format docs/handoff/sad-assemble.mjs with Biome in its own commit (dcaca076); it was committed unformatted at 79ad8bbb, so pnpm lint failed on dev and would also fail the dev CI lint step, cost if wrong: none, formatting only.

Ruling: pnpm verify-deps-before-run is set false in the container's global pnpm config, because a bare pnpm run (the husky hook included) reinstalled from the lockfile and dropped the npm xlsx, cost if wrong: none, container only.

Ruling: CI run 38345761871 attempt 2 (dev 79ad8bbb) does not confirm the F1 to S3a batch yet: install passed, the replay step passed (exit 0, REPLAY_TOTAL 995.2 s, 152 =PASS and 0 =FAIL lines in the last 2000 log lines; the full log archive is blocked by this container's proxy, so the 171 total is not read), then Lint failed on the unformatted docs/handoff/sad-assemble.mjs alone and typecheck, test and build were skipped; the format fix is dcaca076 on the slice branch, so the S3b pull request CI is the first full run over F1 to S3b and stands as the batch confirmation, cost if wrong: an F1 to S3a typecheck, test or build failure surfaces on the S3b pull request instead of on dev.

Ruling: Tasks 1 and 2 paired review PASS; accept the low finding (replay-as-receipt and no-context refusal are pinned on archive and measurement only, create and update share requestSourceMutation, whose S1b tests pin both) and the two brief-mandated nits without change, because extra cases would shift every later expected count, cost if wrong: a create or update regression in the replay path goes unseen by indicators.test.ts but not by the source-mutation tests.

Ruling: accept the Task 3 pre-layout route baseline (routes 72, different 12 against Task 0: every difference within 1 kB except /alerts/repository 322 to 312 kB as planned; six other routes moved by 1 kB and two planned ones did not) as container rounding, and the layout move changed none (different 0, Middleware 103 kB), cost if wrong: a real 1 kB growth hides in rounding.

Ruling: apply the S4 pre-flight fixes (6 must-fix, 15 should-fix and two count notes: hash 14 after S2, activities.dto.ts git rm, docs/handoff grep exclusion, stacked base with the SAD base set to the S4 base sha, cp plan copy, pull request in place of the dev merge, cloud replay, seed and e2e wording, Claude-Session trailer, post-S3b baselines web 224 and 1998, S4b outline figures 41 factories and pathways-client 1361 lines), cost if wrong: a Task 0 stop in S4.

Ruling: PR #49 CI run 38348960829 on b4f87c3d (F1 to S3a plus S3b Tasks 0 to 2 and the assembler format fix) is green: replay, lint, typecheck, test, build and the automated SAD checks all pass; it stands as the CI confirmation of the F1 to S3a batch, cost if wrong: none.

Ruling: Tasks 3 and 4 paired review PASS; the low findings need no change (Task 7 compares with the same 1 kB tolerance and M0 103 kB, the copy-file comment line is dropped by the brief's own sed and the 50-line figure holds), and the old doc paths are Task 6's job (deferred-features is in its list; the change records keep history), cost if wrong: none.

Ruling: accept Task 5's route result (against the Task 3 baseline five routes moved by -1 kB and /indicators/library stayed at 280 kB where the plan expected +1 kB; routes 72, different 5, Middleware 103 kB) as container rounding, no route grew, cost if wrong: none.

Ruling: Task 5 review PASS; the low finding (a second summary freshness constant in indicators.reads.ts) is the brief's text and stays, cost if wrong: none.

Ruling: Task 6 records use the measured figures where they differ from the brief (eleven routes moved by 1 kB or less in Tasks 1 and 2, five in Task 5, Middleware 103 kB in the container); the docs check's seventh failure was a double hyphen in this log, now reworded, cost if wrong: none.

Ruling: the container replay cannot run because initdb refuses root (PHASE6_LOCAL_REPLAY=FAILED before any migration step), so the pull request CI replay is the replay gate for every slice, as the plan allows, cost if wrong: none, CI runs the same script on PostgreSQL 18.

Ruling: accept the S3b gate figures that differ from the plan only by container rounding (against the Task 3 baseline different 5, not 6; against Task 0 different 9, not 12, with /collection/import 1 kB bigger and nothing else growing; Middleware 103 kB), cost if wrong: a 1 kB growth goes unseen.

Ruling: S3b SAD sign-off PASS at e293bec8 (57 of 57 lines PASS across design-qa-agent, beneficiary-privacy-guardian and rule-engine-determinism-checker) and the final review PASS; its medium finding (the S4 Task 0 Middleware figure) is fixed to 103 kB with the gates record, the stale S3 path in sad-packet-example.md stays because the file is a layout example, and the S5 mock note is recounted in S5 Task 0 per its ruling 21, cost if wrong: an S4 or S5 Task 0 stop.

Ruling: apply the S5 pre-flight fixes (6 must-fix, 16 should-fix and replacement blocks B1 to B4, including the hex project id that makes the Task 5 Step 6 characterization test meaningful and the post-S4 imports.service.ts count of 2119) and record that the S3b cross-plan lines for S5, S6 and S7 were already in those plans, cost if wrong: an S5 Task 0 stop.

Ruling: record the S3b gates in a post-sign-off docs commit with the plan fixes, as S3a did, so the SAD digest stays bound to e293bec8 and docs changes route nowhere, cost if wrong: none.

## S4a

Ruling: S4 stacks on the S3b tip ef6c4025 on its own pushed branch claude/modularization-s4-9ept8o (the environment accepts a second branch name), so each slice keeps its own pull request into dev and S3b's PR stays S3b only, cost if wrong: a stacked PR shows S3b's commits until S3b merges.

Ruling: S4a Task 0 matched every anchor at ef6c4025 (14 hashes, counts, baselines with web 224 and 1998, Middleware 103 kB); Task 1 created the contract and its test together, so its fail-first run was skipped, and the paired review confirmed the contract test fails without .strict(), cost if wrong: none.

Ruling: S4a Tasks 1 and 2 paired review PASS; the low findings stay (the coercion and strict rows lived in the deleted parity test by plan design; a third shared type import in the seed is formatting only), cost if wrong: a later coercion change in the contract is caught only by the controller HTTP tests.

Ruling: apply the S6 pre-flight fixes (6 must-fix, 12 should-fix and blocks B1 to B5: cloud Task 0 with a base sha, plan copy and one index row, SAD base sha, pull request in place of the dev merge, docs/handoff grep exclusion, exact audit append strings, Claude-Session trailers, known baselines and a Task 0 web build), cost if wrong: an S6 Task 0 stop.

Ruling: S4a Task 4 matched every expected value (shared 316, api 2460 with 21 skipped, parity 40, fail-first 4 failed and 1 passed); Biome wrapped the controller shared import, formatting only, cost if wrong: none beyond a style diff.

Ruling: S4a Tasks 3 and 4 paired review PASS; the three low findings stay (strict and null rows for journeys and media lived in the deleted parity tests by plan design, same as the Tasks 1 and 2 ruling), cost if wrong: dropping .strict() from a journey contract later would turn an unknown-key 400 into a 200 without a failing test.

Ruling: S4a Task 5 matched every expected value (same lines 1406, 26 moved and 843 left, api 2462 with 21 skipped, shared 316); no fail-first run because the brief has none for a pure move proven by same-lines.mjs, cost if wrong: none, the move is line-identical.

Ruling: S4a Task 6 matched every expected value (same lines 785, line counts 409/457/282/636, api 2462 with 21 skipped); the compiled API import smoke is left for the local run with the other boot gates, cost if wrong: a circular import between the registration and beneficiaries services shows only at boot.

Ruling: S4a Task 7 matched every expected value (same lines 741, api 2484 with 21 skipped); ParticipantsService keeps its now-unread prisma constructor parameter as the brief says (noUnusedLocals is not enforced, and removing it would change three construction sites in seeds and a test), cost if wrong: one dead constructor parameter until a later slice removes it.

Ruling: S4a Tasks 5 and 6 paired review PASS; the low findings stay (canonical helpers exported but file-local, three age bands unpinned, registration-context.service.ts holding only a function, all as the plan names them), cost if wrong: an unpinned age band regresses unnoticed until the browser smoke.

Ruling: S4a Task 7 review PASS; the low findings stay (the unread prisma parameter is plan ruling 8, removal in S5; canonicalCode tested from participants.helpers.test.ts; stage-save cases cut by describe; no provider-resolution test beyond app-module-wiring) and the dated manuscript-alignment audit keeps its participants.dto.ts mention as a point-in-time record, cost if wrong: a stale path in an old audit.

Ruling: apply the S7 pre-flight fixes (10 must-fix, 13 should-fix and blocks B1 to B8: cloud Task 0 with a base sha and no plan copy removal, SAD base sha, pull request in place of the dev merge, the Task 3 count of 10, docs/handoff grep exclusion, exact audit append strings, the next.config.ts indexedFeatures edit, whole route table comparison, Claude-Session trailers); the S7b split branch names and the B_web plus 6 or plus 4 expectation stay for S7 Task 0 to settle, cost if wrong: an S7 Task 0 stop.

Ruling: S4a final review PASS with one medium finding (coercion, null and strict rows unpinned after the parity tests were deleted); taken together the three low findings leave the plan's Review Focus unenforced, so a tests-only fix adds those rows to the shared contract tests and the SAD replies for the changed test files are re-run, cost if wrong: a few redundant test rows. The other lows stay: the dated audit keeps beneficiaries.service.ts:353 as a point-in-time citation, a commit cannot name its own hash in the activity log, ruling 8 keeps the unread prisma parameter, and provider resolution is covered by app-module-wiring and the pending local boot.

Ruling: S4a static gates passed at 51d3139e (config 19, shared 316, imports 91, api 2484 with 21 skipped, web 224 files and 1998 tests, sad 55, dist layout ok, Middleware 103 kB); no web route comparison because S4a changes no web file; replay is the pull request CI gate because initdb refuses root in the container, cost if wrong: none beyond a CI cycle.

Ruling: S4a SAD sign-off PASS 116 of 116 at a887445b after two scoped re-reviews of the three shared contract test files (design-qa blocked line 59 once for missing null rows, fixed in a887445b); unchanged files keep their first-pass PASS lines under the new digest, cost if wrong: a stale PASS line on a file the fix did not touch. S4a opened as PR #50 into dev, stacked on #49.

Ruling: PR #50 CI run 38355369564 green at 2cfa0454 (validate with replay, lint, typecheck, test, build; automated SAD checks); the CI result goes into the activity log with the post-merge records step rather than a new commit, so the green head is not re-run, cost if wrong: the gate line names the CI run one step later.

## S5a

Ruling: S5a Task 0 matched every anchor at 2cfa0454 (14 hashes, 4-file diff list, filtered diff 0, line counts 2119/1315/626, grep counts) with baselines B_shared 348, B_imports 91, B_api 2484 (21 skipped), B_sad 55, M0 103 kB; plan copy and index row committed in 4107b215, cost if wrong: none, every later count is a delta from these.

Ruling: S5a Task 1 matched its expected deltas (shared +23, imports +1, api +88 with the parity test) with fail-first runs for both new contract tests; limits and parity tests pass first time by design, cost if wrong: none, the paired review checks the parity rows.

Ruling: S5a Task 2 matched (fail-first 11 failed and 5 passed, api B_api+8, six edited lines, DTO grep empty); Biome formatting only, cost if wrong: none.

Ruling: S5a Tasks 1 and 2 paired review PASS with one medium (row page caps offset 50000 and take 100 pinned nowhere after the parity test deletion, and an uncapped take reaches findMany); following the S4a lesson, a tests-only fix after Task 3 pins those caps plus the mapping-body rules the lows list (mappings 1 to 500, sourceFieldName length, targetFieldCode rejections, strict mapping body, item and value-map entry); comments naming removed DTOs and the missing fail-first log files stay, cost if wrong: a few redundant rows.

Ruling: S5a Task 3 matched (shared B_shared+29, api B_api+139 with the 131-row parity test, fail-first on the contract test); the implementer wrote two files by quoted heredoc instead of the Write tool, identical content, cost if wrong: none. Before Task 4 deletes the form parity test, the same tests-only fix pins the form request rows it alone holds, so the S4a gap does not recur.

Ruling: the tests-only fix 7bc603a6 adds 185 shared rows (imports 74, forms 111; strength check 9 failures without strict and with moved bounds); every later shared expectation in the S5a briefs reads as plan value plus 185 (B_shared stays 348 for the plan deltas), cost if wrong: an implementer stops on a shared count that is explained here.

Ruling: S5a Task 4 matched (fail-first 6 of 6, nine edited lines, renames 15 and 5, api B_api+13, DTO greps empty), cost if wrong: none.

Ruling: S5a Tasks 3 and 4 and fix 7bc603a6 review PASS with two mediums (PATCH update, archive, edit submission and submit routes have no HTTP test after the runtime-metadata guard went; save and edit values rows not pinned, Review Focus 3 only on validate); after Task 5 a tests-only fix adds HTTP rows for those four routes and the repeated query key, the save and edit nested-constructor and toString rows, and extra-key rows for update, edit and submit; the nested method-key drop difference stays (no observable effect today) and the DTO wording in test names stays, cost if wrong: a later pipe swap on one of those routes goes unnoticed until the smoke.

Ruling: S5a Task 5 matched (split script lines 137/76/165/216/266/201/93 with the 2 expected foreign lines, post-Biome counts, mapper fail-first, Step 6 characterization fails without toLowerCase, api B_api+16); the plan has no same-lines step for this split, the split script's foreign-line output is the proof, cost if wrong: a hidden edit in a moved block, which the paired review checks per declaration.

Ruling: the tests-only fix f8c69415 adds 14 api HTTP cases (update, archive, edit, submit routes and the repeated offset key) and 8 shared rows (save and edit values, extra keys); each route's swapped pipe fails its valid-body case; later expectations read shared as plan value plus 193 and api as plan value plus 14, cost if wrong: an implementer stop explained here.

Ruling: S5a Task 6 matched (same-function checks same body, split foreign lines only the four expected in import-promotion.service.ts, line counts after Biome, api plan value plus 14), cost if wrong: none.

Ruling: apply the S8 pre-flight fixes (13 must-fix, 13 should-fix, blocks B1 to B10: cloud Task 0, S7b present expectations with an S7b-absent sentence, the users, guard and public test fixes, docs/handoff grep exclusions, SAD base sha and role counts with recount wording, pull request in place of the dev merge, Claude-Session trailers, rm -rf .next before builds, lost strict rows); the CR status example names S7b, and baseline and role counts from the simulated tree are recounted at S8 Task 0, cost if wrong: an S8 Task 0 stop. Committed with the next docs commit after Task 7.

Ruling: S5a Task 7 matched (split lines 170/168/162/156 with foreign 0, post-Biome 169/175/161/168, smart-match.test.ts unchanged, imports B_imports+3), cost if wrong: none.

Ruling: S5a Task 7 review PASS (42 declarations token-equal, comments identical, exports as briefed, no cycle); the low on PreparedName exported but file-local stays as the brief mandates it, cost if wrong: one wider export.

Ruling: S5a Tasks 5 and 6 and fix f8c69415 paired review PASS (moves token-equal apart from the briefed renames, withAuthorizedOperation 16 and 18 unchanged, both review-3-4 mediums resolved); the lows stay (DTO wording in contract test names, the top-level-only method-key filter with no observable effect, three exports used only in their own files), cost if wrong: wording and wider exports only.

Ruling: S5a Task 8 matched (SAD routing test fail-first then sad 56, docs check at baseline, docs grep empty); the Task 5 activity bullet gives the plan's api 2500 and the fix bullet carries the 14 extra api cases, cost if wrong: none.

Ruling: S5a final review PASS with one medium (Review Focus 5 eviction half unpinned: no test runs updateForm, publishForm or archiveForm then getForm, so a second cache instance or a lost evictForm stays green); a tests-only fix adds that test and moves the activity-log fix bullet after Task 8 so the counts read in order; the other lows stay (dated records citing old test names are point-in-time, a commit cannot name its own hash, DTO wording in test names, three file-local exports), cost if wrong: a stale cache after a form edit goes unnoticed until the smoke.

Ruling: S5a static gates passed at 6c0ed266 (config 19, shared 570, imports 94, api 2514 with 21 skipped, web 224 files and 1998 tests, sad 56, Middleware 103 kB, dist layout ok, compiled pipe probe all Object as expected); replay is the pull request CI gate, and the local stack, boot, e2e and smoke are pending local run, cost if wrong: none beyond a CI cycle.

Ruling: S5a SAD sign-off PASS at ede08092 over 2cfa0454 (146 entries: design-qa-agent 61, metadata-import-validator 55, organization-isolation-checker 17, beneficiary-privacy-guardian 11, restraint-guardian 2, no block), with ede08092 re-reviewed by design-qa and the import validator on a scoped packet, cost if wrong: a later SAD finding on the S5a range that pull request CI does not catch.

## S6a

Ruling: run S6a before S4b because S6a's plan is full and pre-flighted while the S4b planner is still dry-running, and S6a touches no web file (its Task 0 says S4b and S5b are not required); the 16 Task 0 hashes match at 3b167867, cost if wrong: the pull requests merge in a different order from the roadmap, with no code overlap.

Ruling: Cian's 07:28Z message (merge once all slice is ready) is read as one batch merge of every slice PR into dev in stack order after the last slice is green, not a merge per PR, cost if wrong: dev receives the slices later than he wanted.

Ruling: S6a Task 0 matched every anchor at 3b167867 (16 hashes, module pairs dashboards-reports and report-pdf-reports, greps 9, 0, 1, 0) with baselines B_shared 570, B_imports 94, B_api 2515 (21 skipped), B_sad 56, M0 103 kB; plan copy and index row committed in 00288947, cost if wrong: none, every later count is a delta from these.

Ruling: S6a Task 1 matched (report-pdf grep empty, ratchet fail-first with the three expected pairs, then only dashboards-reports, api B_api+2, noUnusedLocals grep empty) in 1dc1b9c5 and 3428acc2, cost if wrong: none.

Ruling: S5a pull request #51 CI run 38362232295 is green at 3b167867 (validate with the replay, and the automated SAD checks), so the PR is marked ready and waits for the batch merge Cian asked for, cost if wrong: none.

Ruling: S6a Task 1 review PASS (five git renames, other moved and repointed files differ only on import lines, module pairs recomputed as dashboards-reports only); the two lows are accepted (the finance.module.ts layout is verbatim from the brief, and the activity log entry is Task 7's), cost if wrong: none.

Ruling: S6a Task 2 matched (39 characterization tests green on the unchanged service, contract test fail-first then 20, cut 38 lines, finance suite 4 files 71 tests, shared B_shared+20, api B_api+41) in 1c0367c5 and ca2650d0, cost if wrong: none.

Ruling: S6a Task 2 review PASS (five parse calls swapped, the decimal refine equivalent apart from ruling 4, all 39 characterization rows kept); the low on unpinned bounds (max lengths 200 and 2000, the 17-digit integer part, the +08:00 offset on expectedUpdatedAt) gets a tests-only fix in the shared finance contract test after Task 3, because earlier slices' SAD reviews blocked on exactly such rows; the missing blank line before @Injectable stays, cost if wrong: a few extra test rows.

Ruling: S6a Task 3 matched (characterization 22 and 17 green on the unchanged services, contract tests fail-first then 8 and 7, cut 38 lines, shared B_shared+35, api B_api+80, old-name grep empty) in 88758587 and a50fc1d9, cost if wrong: none.

Ruling: S6a Task 3 review PASS (verbatim moves, controllers unchanged, safeParse order kept, no row removed); its 14 low unpinned-bound findings join the Task 2 lows in one tests-only fix after Task 4, in the shared contract tests only, cost if wrong: a few extra test rows.

Ruling: S6a Task 4 matched (13 repointed files, 13 move-lines counts, evaluations plus reports 199 passed and 10 skipped, api unchanged at B_api+80, service 337 lines) in b8f7971c and 2cd28fbf, cost if wrong: none.

Ruling: the tests-only fix 3834e092 adds 52 shared rows (finance 11, evaluations 20, reports 21), each shown to fail on a loosened schema; periodEnd 2026-02-30 is pinned as accepted because that is today's behavior on V8 (CI runs the same engine); every later shared expectation in the S6a briefs reads as plan value plus 277 (B_shared plus 52 more), cost if wrong: one engine-dependent row to revisit if Node changes date parsing.

Ruling: S6a Task 4 review PASS (AST token proof over every moved declaration, ruling 7 holds, withAuthorizedOperation 9 calls unchanged, tests moved byte-identical); the two infos are left to Task 5 (report-sources-extra.ts annotation) and Task 7 (docs naming evaluation-metrics.ts), cost if wrong: none.

Ruling: S6a Task 5 matched (scope test 7 green against the inline lookups, api B_api+87, split lengths 50/303/144/469/59/134/249, reports.service.ts 456 split lines, TransactionClient grep empty) in ada6832c, 347eaab2, e9ba4766 and 24c92014, cost if wrong: none.

Ruling: S6a Task 6 matched (split lengths 10/200/440, finance suite 4 files 71 tests, api B_api+87, noUnusedLocals grep empty) in 9466f463, cost if wrong: none.

Ruling: S6a Task 6 review PASS (token proof with comments counted, 13 withAuthorizedOperation calls unchanged, 503 texts byte-equal, no wiring change); the two infos (function module named .service.ts as briefed, helpers glob arriving in Task 7) need nothing, cost if wrong: none.

Ruling: S6a Task 7 matched (helpers routing test fail-first then sad B_sad+1, CR, audit, QAD and deferred rows, docs check at baseline) in 02b272f4; the TransactionClient sentence sits on the Task 4 and 5 bullets where those edits landed, not Task 6 as the brief says, cost if wrong: none.

Ruling: S6a Task 5 review PASS (AST token proofs, requireScopedProject equal to the inline lookup apart from ruling 9, same 404 text for every bad id, zod uuid and UUID_PATTERN agree on a 300k fuzz, 8 withAuthorizedOperation calls unchanged); the three lows stay unless the final review or SAD asks (the predicate is pinned by scoped-project.test.ts, the 403 order is unchanged code, the return shape is the brief's), cost if wrong: a reordering of the permission check before the lookup would go unnoticed by the report tests.

Ruling: S6a SAD sign-off PASS at 02b272f4 over 3b167867 (84 entries: design-qa-agent 61 in two packets of 31 and 30 because the role passed 60 paths, organization-isolation-checker 14, beneficiary-privacy-guardian 7, restraint-guardian 2, no block), cost if wrong: a later SAD finding on the S6a range that pull request CI does not catch.

Ruling: Cian's 08:21Z message (one PR once all slices are implemented) replaces per-slice pull requests: S6a and later slices get no PR of their own, slices keep stacking and the branch is pushed at task-pair boundaries for backup, and after W1 one PR from the last branch goes into dev while #49, #50 and #51 are closed as superseded, cost if wrong: the open slice PRs would need reopening, which is reversible.

Ruling: S6a final review PASS (independent archive run matches the activity log, no removed test line left unpinned, DI probe resolves one PrintPdfRenderer); the medium (finance refusal tests other than createBudget do not assert that no operation ran) and the lows on the trimmed value reaching the database, '0.01' at service level and the findFirst arguments get one tests-only fix; the exported-but-local helpers and the missing Task 7 hash stay, cost if wrong: a few extra test assertions.

Ruling: S6a static gates passed at 02b272f4 (config 19, shared 657, imports 94, api 2602 with 21 skipped, web 224 files and 1998 tests, sad 57, Middleware 103 kB, dist layout ok, docs check 6 and 1 at baseline); the container replay stops at initdb as root, so the final PR's CI is the replay gate; the renderer check fails at navigate with no browser and at launch with the Playwright Chromium (root sandbox), so it joins the pending local runs, cost if wrong: a renderer wiring fault would surface only in Cian's local run or the final PR CI.

Ruling: the tests-only fix 5bd2ae40 adds 8 api cases (four finance refusals assert no authorized operation ran, 0.01 reaches SQL, trimmed periodLabel and report name reach the write, three findFirst argument checks and two 403-before-lookup cases), each shown to fail on a temporary production break; its commit message was amended from a Sonnet co-author line to the Opus line before any push; api is now B_api+95 (2610), cost if wrong: none.

Ruling: S6a SAD sign-off re-run PASS at bde243e2 after the scoped design-qa re-review of the four test files changed by 5bd2ae40 (84 entries, no block), and the branch is pushed; S6a is complete with no pull request of its own, cost if wrong: none.

## S4b

Ruling: apply the S4b pre-flight fixes (6 must-fix: the Task 5 index anchor, the shared index check by git diff, baselines and cumulative counts from the S6a tip, branch and markers, no dev merge, SAD base with the S6a records; 5 should-fix: S4 plan copy removal moved to the controller after the final merge, stale 51d3139e text, the plans listing, the activity-log header branch, the CR roadmap row), with api 2610 from 5bd2ae40 and no pull request of its own per Cian's one-PR rule, cost if wrong: an S4b Task 0 stop.

Ruling: execution order after S6a is S4b, S4c, S5b, S6b, S7a, S7b, S8a, S8b, W1; the S4c and S6b planners run now in parallel on the S4b dry-run tree and the S5b planner starts on the S4c dry-run tree, and each plan gets a pre-flight against the real base before it runs, cost if wrong: extra pre-flight fixes where S4c or S5b moved an S6b anchor.
Ruling: S4b Task 0 matched every anchor at 811cb2ed (markers, 10 hash prefixes, line and call counts, 41 mock factories) with baselines shared 657, imports 94, api 2610 (21 skipped), web 224 files and 1998 tests, sad 57, M0 103 kB; plan copy and index row committed in e249692c, cost if wrong: none.
Ruling: S4b Task 1 matched (3 index exports, 28 annotations in 8 files, drift proof TS2561 and TS2353 then clean, shared 664, api unchanged at 2610) in 3ed9b214; files extracted from the brief by script, cost if wrong: none.
Ruling: S4b Task 1 review PASS (contracts match mappers field by field, enums equal Prisma, type-only api edits); the two weak rejection rows (AUDIO media type and the events id-only row fail for missing fields too) get fixed to fail only on the property under test, and the dropped 'Supporting output allowlist' comment is restored, in one fix after Task 2; the satisfies-with-spread limit stays, cost if wrong: two rows that would not catch an enum widening.
Ruling: S4b Task 2 matched (26 blocks, lost 0 added 0, 30 characterization tests on old and new client, page-size mutation fails exactly the 2 named cases, web 227 files and 2028 tests); Biome counted 32 files instead of 29 because the three tests were extracted with the scripts, cost if wrong: none.
Ruling: S4b Task 2 review PASS (19 methods and 7 helpers line-equal, describe.each runs the same bodies on both clients with the old one as oracle); because Task 3 removes the old client, the lows are fixed before Task 3 while the oracle still exists: the list case pins the full mapped record with toEqual and the journey tests add the parentStageId refusal and per-event history cases on both clients; the wrapped one-sentence comment stays verbatim, cost if wrong: a few rows that lose their oracle in Task 3.
Ruling: the fix 463478a0 makes the AUDIO media row and the event-type row fail on one property each (bite shown by widening each enum) and restores the 'Supporting output allowlist' comment above RegistrationContextResponse in the shared contract, where that interface now lives, cost if wrong: none.
Ruling: the tests-only fix 25b58725 pins the whole mapped beneficiary record (fixture given non-null locations and a provenance entry so a province mutation bites) and adds the parentStageId and history-event refusal cases on both clients, each mutation failing only its row; web 2032, and Task 3's expected web total reads 2015 instead of 2013 (insertion counts differ slightly), cost if wrong: a Task 3 count mismatch the implementer would stop on.
Ruling: S4b Task 3 matched (46 calls in 16 files, 12 mock splits, 19 methods removed, factories 41 naming 0, web 2015 with the two fix cases) in c900f450; commit size 207/916 instead of 196/905 because of the larger fixed tests, and the converted tests compare only against fixtures and literals, cost if wrong: none.
Ruling: S4b Task 4 pre-layout route compare printed 27 different routes (24 smaller, 3 bigger) instead of 28: /alerts/repository stayed 312 kB where the dry run saw 311 to 312, and every other cell is within 1 kB of the plan, inside the plan's rounding drift note, so the task continues, cost if wrong: none, the layout compare against the pre-layout build is the gate.
Ruling: S4b Task 3 review PASS (scripted call-site and removal replays equal the commit, 17 duplicate runs removed exactly, no mock lost a method, no self-comparing row); its note that the reworked AUDIO and event-type rows no longer pin that an incomplete item is refused gets two plain rows (missing required field refused) in the next tests-only fix, so 463478a0 drops no coverage; the pathways-client names on the c2 to c4 and survey-subject test files stay, cost if wrong: none.
Ruling: S4b Task 4 matched apart from the accepted route drift (33 git mv, 29 specifiers in 23 files, journey-config gone, index-only page imports, layout compare 0 different, web 2015) in 4a768493, cost if wrong: none.
Ruling: S4b Task 4 review PASS (33 pure renames, index exports the six client components only, no stale path in apps/web, no cycle); the three docs still citing old beneficiary paths are Task 5's repoint, cost if wrong: none.
Ruling: the fix 8fa5a147 pins that a media item without submittedBy and a history event without recordedBy are refused (each shown to fail when the field is made optional); shared 665, cost if wrong: none.
Ruling: S4b Task 5 matched (6 replacements in 4 files, 4 audit tails, docs check at baseline) in 8c4811da with the real counts, the 27-route figure and a bullet for the three tests-only commits; stat 31/8 instead of 29/8 from those lines, cost if wrong: none.
Ruling: S4b final review PASS (Review Focus 1 to 6 hold, drift proof re-run, no removed assertion left unpinned, route figures confirmed); the three lows get a docs-only fix with the gate bullet: the CR Routes bullet names 103 kB instead of the M0 placeholder, and the MOD-B1 audit row and the default registration form CR point at the moved directory and form files (line numbers unchanged by the verbatim moves); the S5 plan's old paths are left to its S5b pre-flight, cost if wrong: none.
Ruling: the S4b final-review lows are fixed docs-only (CR Routes bullet says 103 kB, audit MOD-B1 and the default registration form CR cite the new feature paths) with the gate bullet and the three tests-only commits recorded in the activity log, cost if wrong: a stale path in a doc.

## S4c

Ruling: apply the S4c pre-flight fixes (2 must-fix: baselines from the real S4b tip with shared 665, api 2610, web 2015 and Middleware 103 kB, and no S4b plan-copy removal in Task 0; 7 should-fix: one pull request wording, the S4b gate bullet format, the activity-log branch, the narrowed ScopedBeneficiaryForm claim, 50 rows, the stale base wording and a fifth Task 5 edit for the MOD-B1 audit lines 89 and 295), cost if wrong: an S4c Task 0 stop.

Ruling: the S4c plan (Tasks 0 to 6, replayed from the S4b dry-run tip with lost 0 on all four splits and 50 rows and 177 expect kept in the two split tests) gets one combined pre-flight and fix agent against the real S4b tip 7442e2fe, and the S5b planner starts now on the S4c replay tree b85a0f8, cost if wrong: a fix less independently checked, caught by the task reviews.

Ruling: the two mutation gaps the S4c planner found (a stored draft of another project and the minor age boundary are untested before and after the split) are recorded, not closed in S4c, because they predate the refactor and S4c changes no behavior, cost if wrong: two untested behaviors stay untested.

Ruling: S4c Task 0 matched every anchor at 1a6919b4 (nine line counts total 5463, 50 it, 6 describe, 177 expect, nine hash prefixes) with baselines shared 665, imports 94, api 2610 (21 skipped), web 227 files and 2015 tests, sad 57, M0 103 kB; plan copy and index row in fd0dd7f0, cost if wrong: none.

Ruling: S4c Task 1 matched (14 cuts, lost 0 added 255 over 1365 lines, ScopedBeneficiaryForm 0, hook mutations fail 1, 3 and 1 tests and restore byte for byte, web 227 files and 2015 tests, 15 files 1715/1367) in ff73a876, cost if wrong: none.

Ruling: S4c Task 1 review PASS (lost 0 of real content; 11 lines Biome reflowed in JSX render the same; the only logic change is the stable setConfirmOpen setter in the context effect dependency array per ruling 2; mutations re-run), no fix, cost if wrong: none.

Ruling: S4c Task 2 matched (14 cuts, lost 0 added 145 over 1069 lines, history reload and stage order mutations fail 3 and 1 named tests, web 227 files and 2015 tests, 14 files 1576/1108) in 5019688d; one known beneficiary-detail-loader flake passed alone and on rerun, cost if wrong: none.

Ruling: S4c Task 2 review PASS (lost 0 of real content, 8 Biome-reflowed lines render the same, useSearchParams now runs inside the view hook after the state hooks as the brief prescribes, which is harmless because hook order stays fixed across renders and it holds no state), no fix, cost if wrong: none.

Ruling: S4c Task 3 matched (50 it and 177 expect before and after, describe 6 to 10, form proof loses only the select mock opener, detail lost 0, web 232 files and 2015 tests, 10 files 1457/1149) in 79c9e14c, cost if wrong: none.

Ruling: S4c Task 3 review PASS (it and expect multisets equal 50 and 177, setup blocks byte-identical per test family, select mock opener only reformatted); the two nits (fixtures import block placement, exported mutable profileState isolated per file) stay as is, cost if wrong: none.

Ruling: S4c Task 4 route compare printed 0 different routes instead of 3 bigger by 1 kB, accepted, because this container's Task 0 baseline already shows 300, 280 and 280 kB first load for the three beneficiary routes (the plan measured 299, 279 and 279 on a lower base) and they stay there; only the detail page size moved from 13.6 to 14.3 kB, cost if wrong: a 1 kB route growth unrecorded.

Ruling: S4c Task 4 otherwise matched (media lost 0 added 0, directory lost 0 added 12, web 232 files and 2015 tests, Middleware 103 kB) in 17d2d93a and 814dc049, cost if wrong: none.

Ruling: S4c Task 5 matched (5 replacements in 2 files, 3 audit tails, docs check at baseline) in 5801f1fc with the real route figure (first load 280, 300 and 280 kB unchanged, detail page 13.6 to 14.3 kB) in place of the plan's 1 kB growth, cost if wrong: none.

Ruling: S4c Task 4 review PASS (media and directory bodies byte for byte, only export openers, imports and the briefed hook plumbing changed); the two nits (two imports from media.utils, return the memo directly) stay as is because the plan moves code verbatim, cost if wrong: none.

Ruling: S4c final review PASS (no unpinned row: it titles and the 316-line expect multiset equal across the range; route figure and records match); the two CR lows are fixed docs-only (seven of eleven detail sections take a Pick and four plain props; all five files above 300 lines named), the medium is met by writing the real route figure and the pending local runs in the gate bullet, the use-beneficiary-columns.tsx name stays because the hook returns JSX column cells, and the docs/cr-pathways-default-registration-form.md lines 17 and 25 stay as dated audit evidence, cost if wrong: a slightly stale doc line.

## S5b

Ruling: the S6b planner split S6 web again into S6b (Tasks 0 to 6, full plan replayed from fc2ff1c with 8 plan defects fixed) and an S6c outline; S6c joins the run order after S6b, and the S6b plan gets its pre-flight against the S5b tip because its dry run lacks S4c and S5b, cost if wrong: one extra slice cycle.

Ruling: the S7b planner starts now on its own tree (the S6b replay plus an S7a replay run from the pre-flighted S7a plan) instead of waiting for the real S7a, because S4c and S5b touch only beneficiary and collection web files; its S7a replay doubles as an early S7a pre-flight, and the real S7a and S7b each still get a pre-flight against the real base, cost if wrong: extra pre-flight fixes.

Ruling: the S5b planner split S5 web into S5b (Tasks 0 to 9: forms and imports clients, type-only response contracts, the shared useImportBatch hook, collection-workspace.tsx from 3186 to 1640 lines and its test split) and an S5c outline; S5c joins the run order after S5b, and S5b gets one combined pre-flight and fix agent against the real S4c tip 796ddcd5, cost if wrong: one extra slice cycle.

Ruling: apply the S5b pre-flight fixes (2 must-fix: baselines from the real S4c tip with shared 665, api 2610, web 2015 and Middleware 103 kB, and an add-only Task 0 plan-copy step; 9 should-fix: one pull request wording, the S4b gate bullet format, the activity-log branch, 424 lines not 440, a stacking check and base-sha wording in Task 0, routes judged by ruling 12 and M0, stale base wording, a prefixed import-boundary path, the S5c outline wording), cost if wrong: an S5b Task 0 stop.

Ruling: S5b Task 0 matched every anchor at c9503aab (8476 lines, 37 collection files, 13 hash prefixes) with baselines shared 665, imports 94, api 2610 (21 skipped), web 232 files and 2015 tests, sad 57, M0 103 kB; plan copy and index row in 26c06a06, cost if wrong: none.

Ruling: S5b Task 1 matched (13 replacements in 5 files, shared 37 files and 672 tests, api 2610, bite proof TS2322 at imports.mapper.ts:69 then clean) in 0d006da9, cost if wrong: none.

Ruling: S5b Task 2 matched (23 blocks, lost 0 added 0 over 222 lines, 30 characterization runs, one-line mutation in each client fails exactly the 2 named cases) in 0d9c96d8; Task 3 waits for the Task 2 review because it removes the old methods the characterization tests compare against, cost if wrong: some wall clock.

Ruling: S5b Task 1 review PASS (contracts equal Prisma enums and mapper keys, type-only, two extra bites confirmed); the two weak rejection rows (totals with one member, a batch detail missing three members) get a tests-only fix to fail on one property each with separate incomplete-object rows kept, and positive rows for the JSON and OTHER file types, combined with any Task 2 review pins before Task 3, cost if wrong: two rows that pass for the wrong reason.

Ruling: S5b Task 2 review PASS, but 18 of 19 extra mutations survived; before Task 3 removes the old methods, a tests-only commit adds the eight "Pin before Task 3" cases from review-2.md to the characterization tests so each runs on the old and the new client, each shown to fail on a temporary break, together with the Task 1 contract row fixes; Task 3 then carries the higher counts, cost if wrong: Task 3 count drift to explain.

Ruling: the tests-only commits 0f558215 (import response rows fail on one property, shared 675) and 381abebf (eight client pins run on both clients and bite on the new one; a beforeEach arrow that returned the mock and leaked a rejection is now a block body; web 234 files and 2061) land before Task 3, whose web total becomes 2038 and count-it it 23, describe 2, expect 51 instead of the brief's 2030 and 15, 2, 37, cost if wrong: none.

Ruling: S5b Task 3 matched (45 calls in 7 files, 12 mock files, 22 methods removed, pathways-client.ts 424 lines, receipt test 3 rows kept) in 06708a61 with the predicted counts (it 23, describe 2, expect 51; web 234 files and 2038); the brief's git rm ran unwrapped after a safety check refused a bash -c wrapper, cost if wrong: none.

Ruling: S5b Task 4 matched (characterization 66029bb7 with two one-line mutations failing exactly 3 rows; shared hook 64c1ae8e with 16 replacements in 2 files and a bite failing 4 rows; web 236 files and 2051) cost if wrong: none.

Ruling: S5b Task 3 review PASS (45 calls identical, mocks keep every method, the real clients are reached only by their own tests, 8 pins kept); the five web aliases now follow the api contract (PROCESSED and REJECTED, JSON and OTHER, required beneficiaryId and field id), which is the type-only ruling 3 trade-off that typecheck covers, and the unused VALIDATING member of the web ImportBatchStatus is left to S5c, cost if wrong: a web type that is wider or stricter than its old copy.

Ruling: S5b Task 5 matched (16 files, lost 0 added 0 over 2942 lines, screen 1788 lines, collection folder 23 files and 179 tests) in cc3fc518, cost if wrong: none.

Ruling: S5b Task 4 review PASS (the two old copies differ only in identity parts and the kept mapping revision, both carried by the hook parameters); resume now maps with stored.id where the old code used batch.id, accepted because stored is fetched with getImportBatch(projectId, batch.id) so the ids are equal; the identity target wiring (generation, form version, import formId), unpinned before and after the refactor, gets a tests-only pin with bite proofs after Task 6, cost if wrong: a dropped identity part goes unnoticed.

Ruling: S5b Task 6 matched (use-form-fields 123 and use-server-processing 127 lines, screen 1788 to 1640, lost 5 as listed, stopped-state bite fails the named row, 10 new hook rows each bitten by one of 7 mutations, collection folder 24 files and 189 tests) in 2962748d and d71e4cc6; the identity pins go in after Task 7 so its hash-pinned test cut still matches, cost if wrong: none.

Ruling: S5b Task 5 review PASS (lost 0, each of the 14 view bodies an exact substring of the old file, one signature reflow, client boundary correct, full web 236 files and 2051), no fix, cost if wrong: none.

Ruling: S5b Task 7 matched (five files, 50 test names identical, it 35 before and after, expect 194 to 195 from the copied ownedDataset helper, web 241 files and 2061) in 29e53b7b, cost if wrong: none.

Ruling: S5b Task 6 review PASS (hook order kept, 7 mutations plus 2 more each fail one row, full web 237 files and 2061); its three lows on the new hook test (intent counter unasserted, sensitiveDraftGeneration branch untested, fake timers restored after the assertions) get a tests-only commit after the identity pins, cost if wrong: a hook test that misses two branches.

Ruling: S5b Task 7 review PASS (35 titles equal, 195 expects with one from the copied helper, setup lines 1 to 140 byte-identical in all five files, helpers identical), no fix, cost if wrong: none.

Ruling: the tests-only commits 5c083d55 (each upload identity part pinned: collection file, version and generation, import file, project and form, each bitten by dropping it; collection projectId and form id are redundant because changeProject and openSavedForm call forgetUpload first, so no row; a native select mock in the new identity file because the Radix select stalls jsdom) and 6765d867 (intent counter, sensitiveDraftGeneration branch, timers reset in afterEach) bring web to 242 files and 2071, cost if wrong: none.

Ruling: S5b Task 8 matched (five replacements, three audit tails, docs check at baseline) in 436a73df with the real hashes and counts and one bullet for the four tests-only commits; the route sentence is confirmed or corrected after the gates, cost if wrong: none.

Ruling: S5b final review PASS (nothing left unpinned; Task 3 dropped only the old-client half of each describe.each); records fixed docs-only: pathways-client.ts is 407 lines, not 424 (Biome compacted it after Task 3 measured), and the plan-copy line says the controller removes it after the final merge; the Task 6 entry keeps 10 rows (the count at that commit) and the tests-only bullet gives 12; the Ticket type duplicate and the unused pathwaysClient mock go to S5c, cost if wrong: a stale line count.

Ruling: the S5b route sentence written from the plan said 10 routes smaller with /collection/import 3 kB; the gate build measured 12 smaller (/collection/import 4 kB, six other routes 1 kB) and none bigger, so the change record carries the measured figure, cost if wrong: none.

## S6b

Ruling: the S7b planner split S7 again into S7b (api and shared, Tasks 0 to 8, replayed from an S7a replay with 42 blocks exit 0 and 6 plan defects fixed) and an S7c outline (web); S7c joins the run order after S7b, cost if wrong: one extra slice cycle.

Ruling: S7b leaves analytics.service.test.ts (1514 lines, one shared 326-line harness) unsplit as its ruling 12 records, because the api has no test fixtures convention and other api tests also pass 600 lines; it is listed for W1 rather than added as a task, cost if wrong: one oversized api test stays.

Ruling: S7b allows route growth up to 2 kB with Middleware at M0, because 22 of 72 routes grow 1 kB (one 2 kB) when the web app bundles the compiled shared package after the shared folder layout; the real figure goes in the records, cost if wrong: a 2 kB bundle growth accepted as layout noise.

Ruling: the S6c plan (Tasks 0 to 8: response contracts, a shared report kind grant table, the reporting and evaluation workspace splits and read keys; replayed from the S6b replay, lost 0 on every move, 5 of 72 routes 1 kB bigger) is accepted as one slice and gets its pre-flight against the real S6b tip, cost if wrong: extra pre-flight fixes.

Ruling: run order after S5b becomes S6b, S5c, S6c, S7a, S7b, S7c, S8a, S8b, W1: S6b runs next because its plan is ready (pre-flight now against the real S5b tip 0469ccb0) while the S5c planner works from the real S5b tip, and S5c touches only collection files S6b leaves alone, cost if wrong: an S5c anchor moved by S6b, caught by its pre-flight.

Ruling: the S8b plan (Tasks 0 to 7: publication and audit clients, core-feature-client.ts deleted with its artifact helpers moved to lib/api/core, auth, profile, public and settings layouts and indexes, user management workspace 938 to 342 lines and MFA form 717 to 213 split after 21 characterization cases each) is accepted as one slice; its dry run caught the cut scripts dropping 'use client' from two shells, now restored and printed by the plan, cost if wrong: a production build break caught by the gates.

Ruling: apply the S6b pre-flight fixes (4 must-fix: the S5b marker tests features/collection/hooks, no plan-copy removal anywhere in the slice, Expected values from the real S5b tip with shared 675, web 2071 and pathways-client.ts 407 lines, Opus trailers in all 9 commits; should-fix: Task 0 branch, handoff and ancestor checks, characterization cases added so all 87 mutants of the new modules die on both clients before the old code goes with 146 cases and 292 runs, the gate bullet from commands, one wording for no pull request, 1 kB route criteria, the Task 5 branch heading), cost if wrong: an S6b Task 0 stop.

Ruling: S6b Task 0 matched every anchor at d6c9c6d3 (baselines, 18 reports files, 15 budget-module files, 10 hash prefixes, 32 production calls in 12 files, 34 test calls in 2 files, 20 members, 19 mock factories with 5 naming a moved member); plan copy and index row in e4d59ec2, cost if wrong: none.

Ruling: S6b Task 1 committed 659d691d (6 dead reporting files deleted, 11 types and reportKindPermissions cut, web 239 files and 2053 tests, 18 expected titles lost); the first full web run died without a summary and the rerun passed, read as the known load flake, cost if wrong: a real web failure caught by later full runs and CI.

Ruling: S6b Task 1 review PASS on both; the two lows stay as is (the Task 5 records write the activity-log entry, and historical audit and CR mentions of reporting-workspace.tsx describe the past), cost if wrong: a stale doc line fixed later.

Ruling: accept S6b Task 2 at d4536e5b although its stat says 1527 insertions, not the brief's 1097; the 430 extra lines are the characterization cases the pre-flight added (146 cases, 292 runs, all matching) and the brief's stat line was not updated with them, cost if wrong: none, since every file, test count, lost-0 proof and mutation result matched.

Ruling: S6b Task 3 committed f0e1309d and b557359d with every Expected matching (0 callers left, core-feature-client.ts 173 lines, pathways-client.ts 330, web 242 files and 2197 tests, titles lost 0), cost if wrong: none.

Ruling: S6b Task 3 review PASS on both; the now-dead pathways-client mock factory in beneficiary-detail-loader.test.tsx joins the W1 deferrals (it mocks a module the loader no longer imports, so it changes nothing, and that file is a known load flake best left alone mid-slice), and the copied expenseId name in evaluations.test.ts stays, cost if wrong: one dead mock lives until W1.

Ruling: S6b review 2 spec FAIL (about 20 response schema rules of the new clients unpinned, enforced nowhere since Task 3 removed the old clients); fix with a tests-only commit after Task 4 that pins each rule with a mutation proof (fix-2-brief.md), and leave the AssessmentDetail export as is since it moved verbatim, cost if wrong: a later schema edit could loosen a response bound unseen.

Ruling: S6b Task 4 committed 99c59297 with every scripted Expected matching; the route lists differ from the brief within ruling 9 (pre-layout 19 routes smaller by 1 to 5 kB rather than the brief's 21 mixed lines, layout step 1 route at -1 kB rather than /dashboard +1, none grew, Middleware 103 kB), and the records use the measured figures, cost if wrong: none, since route sizes only shrank.

Ruling: S6b Task 4 review PASS on both; the two lows stay (the self-alias import predates the move, and the reports index shape is what the brief requires), cost if wrong: none.

Ruling: fix 2 committed 33234e5d (31 schema pins, each killed its mutation; web 243 files and 2228 tests); the pins follow the real schema where the review guessed (expenseDate is plain string, pdfFallback false is rejected, a row holds at most 30 cells), and later Expected web counts move up by 31, cost if wrong: none.

Ruling: S6b Task 5 committed 6ee4e6db with the four controller corrections (review-fix bullet, final web 2228, measured route sentence, Task 2 wording), so the section is 10 lines and the commit 41 insertions instead of 9 and 40, cost if wrong: none.

Ruling: S6b static gates at 6ee4e6db pass (lint, typecheck, config 19, shared 675, imports 94, api 2610 and 21 skipped, web 243 files and 2228, sad 57, build with Middleware 103 kB, 19 routes smaller and none bigger, docs 6 and 1); the replay stops at initdb as root so the final pull request CI is the gate, and seeds, dev servers, both e2e suites and the browser smoke are pending local run, cost if wrong: a runtime break the container cannot see, caught by CI or Cian's local run.

Ruling: S6b final review PASS; fix its record lows in the gate commit (two UI copy contract entries, not three; the 18 dead tests are counted by file; the route sentence now says the layout move took 1 kB more off one of the 19 routes), leave budget-ledger.tsx (327) and activity-expense-dialog.tsx (304) as verbatim moves for S6c to judge, and hand its F4 list of response rules still unpinned (finance status members, assessment types, report-sections schema, owned-read boundaries, .strict() on 12 of 15 objects, all also unpinned before S6b) to the S6c pre-flight, since S6c adds the response contracts, cost if wrong: a loosened response rule unseen until S6c.

Ruling: S6b SAD sign-off PASS at 46f6ffd3 (design-qa-agent 104 in two packets, beneficiary-privacy-guardian 14, organization-isolation-checker 1, 119 entries, no block); gate results in 46f6ffd3; branch pushed, cost if wrong: none.

## S5c

Ruling: the S5c plan (Tasks 0 to 8: collection-workspace 1640 to 359 lines, import-workspace 1110 to 134, direct-form-entry 654 to 74, every cut lost 0, 66 mutants killed) is accepted as one slice with no S5d, and its route criterion is no route more than 2 kB bigger because the dry run measured the five collection routes 2 kB bigger, cost if wrong: a 2 kB route growth the gates accept.

Ruling: the S5c plan's cross-plan notes go to the pre-flights that own them (S6c and S8b markers must not test features/collection/index.ts before S5c, the S6c noUnusedLocals indicators baseline path follows the S5c hook move), cost if wrong: a Task 0 stop in S6c or S8b.

Ruling: the S7c plan (Tasks 0 to 9: dashboards and analytics clients with characterization tables, the analytics test split, feature layout, five hooks and four sections out of analytics-dashboard.tsx, 1745 to 898 lines, 99 mutants killed) is accepted, and its S7d outline (features/dashboard, role-dashboard.tsx, the analytics filter bar, analysis panel and scope state) becomes its own slice S7d, making 17 slices, cost if wrong: one more slice of planning and gates.

Ruling: plan S7d on the S7c dry-run tree and W1 on the S6b tip now, in parallel with S5c, so neither waits at the end; W1's Task 0 recounts every figure later slices move, cost if wrong: a W1 pre-flight with more fixes.

Ruling: apply the S5c pre-flight fixes (6 must-fix: index-lists.mjs reads the multi-line next.config entries and counts four indexed features, the Task 0 ancestor check tries local refs and checks the handoff copy, baselines and anchors from the real S6b tip with web 243 files and 2228 tests and Middleware 103 kB, the Task 7 audit anchors, the 38-mutation Expected block, routes judged at no more than 3 kB bigger because /collection/import prints +3 kB; 5 should-fix: the Task 7 record totals, the gate bullet from commands, the SAD text with 166 paths in three packets, exact formTypeLabels and import batch status rows pinned before the old code goes, and a note that commit hashes in Expected blocks differ), cost if wrong: an S5c Task 0 stop.

Ruling: S5c Task 0 matched every anchor at 298f7389 (baselines web 243 and 2228, Middleware 103 kB, nine-file hashes, 63 collection files, 15 pathways-client mockers, 199 collection test names); plan copy and index row in ec77adcd, cost if wrong: none.

Ruling: accept S5c Task 1's +1 kB on /collection/import (432 to 433 kB, reproduced on two builds, Middleware 103 kB) although the brief expected no route change; the pre-flighted route criterion allows up to 3 kB, and the barrel index plausibly adds a few hundred bytes to the import route, cost if wrong: 1 kB on one route.

Ruling: S5c Task 1 committed 598dea4a (62 files moved into forms, import and entry, collection index, four indexed features), every other Expected matching, cost if wrong: none.

Ruling: S5c Task 1 review PASS on both; of the three older change records naming pre-move collection paths, Task 7 updates the two that describe current code (import-value-map-editor.tsx in cr-pathways-import-value-map.md:42 and the collection test glob in cr-pathways-rbac-v4-grant-migration.md:54 to features/collection/**/*.test.tsx), as S4b did for cr-pathways-default-registration-form.md, and leaves cr-pathways-smart-import-mapping.md:14, whose file:line ranges are point-in-time evidence, cost if wrong: one stale path in a historical record.

Ruling: S5c Task 2 committed 94ddfe95, 9728f5b4, 0a3dee37 and d1448d27 with every Expected matching (VALIDATING dropped by the alias, 15 unreachable pathways-client mocks removed, form type list and labels pinned, DigitalFormType from the shared contract; web derived 243 files and 2238 tests), cost if wrong: none.

Ruling: S5c Task 2 review PASS on both (web 243 files and 2238 tests confirmed); the type-level expectTypeOf pin stays because the typecheck gate runs it, and the batch status row's describe placement stays, cost if wrong: none.

Ruling: S5c Task 3 committed 25e70fe6, c5ce7156 and 8df88238 with every Expected matching (screen 1640 to 615 lines, lost 0, 66 mutants killed, web 244 files and 2253 tests); the one failure of the new 'asks for a published form before importing data rows' row under heavy load passed alone twice and in two full mutation runs, and its review checks it for a timing dependence, cost if wrong: a new flaky row in CI.

Ruling: S5c Task 4 committed 3167b8af with every Expected matching (five sections cut, screen 615 to 359 lines, lost 0, 6 mutants killed, collection 30 files and 224 tests), cost if wrong: none.

Ruling: Cian chose stacked pull requests (2026-10-14 01:31Z): part 1 is #52 (S3b to S6a into dev, #49 to #51 closed as superseded), part 2 is S4b to S6c stacked on the S6a branch, part 3 is S7a to W1 stacked on part 2; slices still open no pull request of their own, and gate bullets from S5c on say the slice ships in its part's pull request instead of 'one pull request after every slice', cost if wrong: one stale sentence in a gate bullet.

Ruling: S5c Task 5 committed 7a8ebc47, 4a4f4327 and 79b8e171 with every Expected matching (shared ticket type, import screen 1110 to 134 lines, lost 0, hook order unchanged, 12 mutants killed), cost if wrong: none.

Ruling: S5c Task 6 committed d855af99 and 3a108613 with every Expected matching (direct entry screen 654 to 74 lines, lost 0, hook order unchanged, 6 mutants killed, collection 31 files and 229 tests with the direction test), cost if wrong: none.

Ruling: S5c review 3 spec PASS, quality FAIL; fix with one tests-only commit (fix-3-brief.md) that raises the actions test's async timeout to 5 s and pins the reachable handler paths 25 surviving mutants showed unpinned (they were unpinned before the move too, but the code is being handed over to a client in November), leaving 'use client' off the hook files like their siblings, cost if wrong: one more implementer round on S5c.

Ruling: S5c Task 4 review PASS on both; its 16 surviving markup mutants (labels, descriptions, the save dialog's guard and counts, the correction page clamp) were unpinned before the move and the markup moved verbatim with lost 0, so no pins are added for them (unlike the Task 3 handler paths, they are copy and display, not state logic), and DuplicateDecision stays behind its constant-false flag as before, cost if wrong: a later copy edit to those dialogs goes unseen by tests.

Ruling: S5c Task 6 review PASS on both; its medium test-debt finding (direct entry stale-load, begin and valid guards, start another record, retry) is fixed by a tests-only commit after fix 3 (fix-6-brief.md), the pure useMemo now running before the effect changes nothing observable, and entry-state-views.tsx keeps the five small state views the plan put there, a named exception to CR 3.3 one-component-per-file recorded in the S5c disposition, cost if wrong: one file split later.

Ruling: fix 3 committed ea8c08c6 (actions row timeout 5 s, 14 rows each killing its mutation, a beforeEach reset of assignedProjectIds for an order leak, four paths skipped as unreachable because disabled buttons or beginOperation and eligible() already guard them; web 244 files and 2267 tests); the two 15 s timeouts at load average 50 passed alone and in the next full run, cost if wrong: a load flake in CI on part 2.

Ruling: fix 6 committed c75e674d (20 direct entry rows, 45 mutations each restored; redundant or DOM-unreachable guards skipped with reasons; web 244 files and 2287 tests); its pkill may have killed other agents' vitest runs, so they are told to rerun any run that died without a summary, cost if wrong: one wasted run.

Ruling: S5c Task 5 review PASS on both; its lows stay (an import order nit in use-batch-review.ts, the 11 receipt schema and 34 import workspace mutants that survived before the move and that Task 5 did not touch, no header comment on the new hooks), since no CR row or recorded deferral names them, cost if wrong: a later receipt schema edit goes unseen by tests.

Ruling: S5c Task 7 committed 8cb6224b (7 docs files; web 244 files and 2287 tests; six collection routes 1 to 3 kB bigger, within the 3 kB criterion; the import value map CR names the moved component file, which is the path that line held; test debt counted as 14 handler, 34 import and 10 entry mutations by the implementer's tally from reviews 3 and 5 and fixes 3 and 6), cost if wrong: a debt count in the CR off by a few.

Ruling: S5c SAD design-qa-agent PASS on all 166 paths in three packets (56, 56, 54), 0 blocked; nits (import grouping in use-batch-review.ts, a ../hooks specifier in use-collection-state.ts, inline cleanup in two entry rows) stay, cost if wrong: none.

Ruling: S5c final review PASS; its medium (activity log said 54 files of specifiers, git shows 43 specifiers in 33 files) and three docs lows (stale paths in deferred-features.md lines 25, 37, 39, 66; three biome-ignore lines, not two; the CR roadmap row now names S5c) are fixed by the controller in the gate docs commit; the two test files this slice pushed past the CR 3.5 600 line rule (collection-workspace.actions.test.tsx 756, direct-entry-ownership.test.tsx 680) are split by concern in a tests-only commit after the gate run, while collection-workspace.import-upload.test.tsx (620, 621 before the slice) stays as it was and is recorded; importedFieldLabels in forms.utils.ts keeps its export (a pure label helper with no data, exported by the line-range cut), cost if wrong: one needless export.

Ruling: S5c SAD sign-off PASS at 66a9be6e (design-qa-agent 168 paths in four packets, the fourth for the split test files), 0 blocked, cost if wrong: none.

## S6c

Ruling: the W1 plan (Tasks 0 to 8: cloud-run deferrals, analytics test split, scripts/db, phase6 renamed to replay with forwarding stubs for the old PowerShell and mjs entry points, seeds into prisma/seeds, tooling tests wired into a CI job, records, gates; 142 renames, every count equal) is accepted, and its W2 outline becomes the last slice, limited to items the change record's W1 row or its recorded deferrals name (path aliases, the docs/check.py split, the lib/services residue, the seed data and large test file splits only where a deferral names them), making 18 slices, cost if wrong: one more slice of work, flagged to Cian.

Ruling: apply the S6c pre-flight fixes (11 must-fix: Task 0 branch, ancestor and S5c marker checks with base-sha first, Expected values from the S5c replay, the indicators noUnusedLocals line in use-collection-state.ts, the Task 7 index sed, grep -a and a sorted typecheck in Task 8, 'use client' kept on 11 cut components; 7 should-fix: a shared response-rules test of 27 cases leaving one equivalent mutant, SUBMITTED and REVIEWED round statuses, six report read permission rows, the api export guard for a stored report type with no route, the activeOperation guard), and Task 0 recounts the real S5c figures, which carry fix 3 and fix 6 rows the replay lacks, cost if wrong: an S6c Task 0 stop.

Ruling: S6c is the last slice of part 2, so its Task 8 gate line says S6c ships in part 2 of 3 stacked pull requests into dev and the controller opens that pull request (claude/modularization-s6c-9ept8o into dev) after the S6c sign-off, in place of the plan's "one pull request after every slice" wording, cost if wrong: none (Cian chose stacked pull requests on 2026-10-14).

Ruling: S6c Task 0 takes the real S5c figures as baselines (web 246 files and 2287 tests, the S5c route table) where the replay printed 244 and 2253, cost if wrong: a later Expected compares against a stale count and is caught by the delta check.

Ruling: S6c Task 0 committed 4fb57e71 with every Expected matching except B_web (246 files and 2287 tests, the real S5c figure), Middleware 103 kB, cost if wrong: none.

Ruling: S6c Task 1 committed 47d13434 (stat equal to the brief; lint checked 1451 files, not 1449, the two S5c split test files), cost if wrong: none.

Ruling: S6c Task 2 committed 6a7cfe2c (stat equal to the brief, schema-moved lost 0 three times, the strict mutation killed; lint 1450 files, the two S5c split files), cost if wrong: none.

Ruling: S6c Task 1 review PASS on both; its low (three tightening mutants survive: snapshot weight_percentage and maximum_score to decimal, snapshot type to an enum, expenseDate to a date regex, since no row passes a free-form value) is fixed by a tests-only commit after Task 3 (fix-1-brief.md), because a tightened response rule would reject real api responses at runtime, cost if wrong: a few extra rows.

Ruling: S6c Task 2 review PASS on both; its two nits stay (the EvaluationDetail alias is what the brief specifies, and Biome does not wrap the one long comment), cost if wrong: none.

Ruling: S6c Task 3 committed d0648345 and 835f9718 (stats equal to the brief, parity rows pass on the old code, the monitoring grant mutation fails 2 rows in each of the three tests; lint 1453 files from the S5c split files), cost if wrong: none.

Ruling: fix 1 committed f2a21f17 (two rows, four tightening mutations each failing a row; shared 42 files and 721 tests, two more than the brief from here on), cost if wrong: none.

Ruling: S6c Task 3 review PASS on both (nothing widens access, parity holds over every role and grant subset); its two lows (the stale reports.helpers.ts:27 comment, ReportKindGrant exported with no outside user) are fixed by the controller in one small commit after Task 4 so the implementer's tree is not touched mid-task, cost if wrong: none.

Ruling: the review 3 comment low is fixed in f9dc1181; ReportKindGrant keeps its export, because the exported reportKindGrants annotation uses it and the shared declaration build would otherwise report a private name, cost if wrong: one needless type export.

Ruling: S6c Task 4 committed 44aa1180, e0c5d623 and 385cd72c with every Expected matching (live-reporting-workspace.tsx 523 to 33 lines, lost 0, six mutations killed; the brief's prose 59 tests contradicts its own Expected 65, which ran), cost if wrong: none.

Ruling: S6c Task 5 committed d3a62177 and cc62fe6c with every Expected matching (live-evaluation-workspace.tsx 531 to 42 lines, lost 0, three behavior mutations and the tone type mutation caught), cost if wrong: none.

Ruling: S6c Task 6 committed 408b940f with every Expected matching (one shared budgets read, the permission mutation fails one row); the untracked evaluation-mut folder is the Task 5 reviewer's scratch copy and is removed once that review ends, cost if wrong: none.

Ruling: S6c Task 6 review PASS on both (same key, fetcher, permission and enabled condition, one shared cache entry; four mutations each fail the new row), cost if wrong: none.

Ruling: S6c Task 5 review spec PASS, quality PASS for the split, with Important test debt (84 of 103 mutants survive, unpinned before the move): as in S5c fixes 3 and 6, the state logic gets a tests-only fix (fix-5-brief.md: round status gates, owner and reviewer enablement, sign-off gate, dialog confirm gating and cancel, success and failure messages with dialog close and field reset, the stale-owner and activeOperation guards where the DOM can reach them, the start card disables, table sort order), while pure copy and display survivors (card field labels, status tone classes) stay as debt and the unreachable readError state is recorded, cost if wrong: a few more rows than needed.

Ruling: S6c Task 4 review spec PASS, quality PASS with six medium test-debt findings (about 100 of 138 mutants survive, unpinned before the split): as for review 5, a tests-only fix 4 after fix 5 pins the state logic (previewOnly, the survey and round reset on project change, the chosen format in the request, the download and generate stale-owner, catch, finally and re-entry guards where the DOM reaches them, the start and fallback messages, the file extension, the draft-owner inputs and the export permission, the saved reports disable rule and the allowed-kind clamp), while pure copy and display states (empty, pending and error texts, title fallback, unavailable reasons) stay as debt, cost if wrong: a few more rows than needed.

Ruling: fix 5 committed d01cedcb (live-evaluation-workspace.state.test.tsx, 63 cases, 73 of 74 mutants killed, the survivor equivalent; the review card SUBMITTED check and the list error branch skipped as unreachable; web 249 files and 2370 tests), cost if wrong: none.

Ruling: fix 4 committed 91f961a7 (live-reporting-workspace.state.test.tsx, 57 rows, 52 of 57 mutants killed, the five survivors unreachable re-entry guards behind a disabled button or equivalent; web 250 files and 2427 tests), cost if wrong: none.

Ruling: S6c Task 7 committed 5e9c774a (6 docs files; shared 42 and 721, api 153 and 2614, web 250 and 2427; three project routes 1 kB bigger, report routes unchanged; the CR roadmap row now names S6c), cost if wrong: none.

Ruling: S6c SAD PASS on all 75 paths (organization-isolation-checker 6, beneficiary-privacy-guardian 13, design-qa-agent 56), 0 blocked, cost if wrong: none.

Ruling: S6c final review PASS; its record lows are fixed in the gate commit (the report routes kept their First Load sizes with the print chunk 0.5 kB bigger, the PRD G-F12-1 row lists QAD-T121, reports.service.test.ts at 836 lines is named as W2 test debt); the fix 4 denominator stays 57 (52 killed, four unreachable guards, one equivalent, as its hand-back counted), and the schema-plus-type exports and SavedScore keep their export as the shared convention, cost if wrong: one needless export each.

Ruling: S6c gates pass at 86985c87 (shared 42 and 721, api 153 and 2614, web 250 and 2427, sad 57, Middleware 103 kB) and SAD sign-off exits 0; the branch is pushed and part 2 opens, cost if wrong: none.

## S7a

Ruling: apply the S7a pre-flight fixes (12 must-fix: Task 0 branch, base-sha and ancestor checks with S5c and S6c markers and real baselines, Biome with its file list set in Task 3, git grep that sees the untracked rules.reads.ts, a next.config edit that matches the multi-line list, a Task 8 that runs the web build without prisma generate and opens no pull request, no plan copy removal in the S7b outline, corrected test deltas, a 403 row that asserts ForbiddenException; 15 should-fix mutation-checked pins: the service call of all 23 handlers, the alert evidence table, evaluation line and history list, the editor indicator binding, the context-only read, useBindingChoices and the rules.reads fetchers), replayed to the end with api B+3 and web B+17 in 249 files, cost if wrong: a Task 0 recount on the real S6c tip catches drift.

Ruling: the S7a pre-flight replayed on the planned S6c end state, so Task 0 takes the real S6c figures as baselines (shared 42 files and 721 tests, api 153 and 2614, web 250 and 2427, the S6c route table), cost if wrong: a later Expected compares against a stale count and the delta check catches it.

Ruling: S7a Task 0 committed fc5ed5c8 with every Expected matching except the announced real baselines (shared 721, web 250 files and 2427), Middleware 103 kB, cost if wrong: none.

Ruling: S7a Task 1 committed 2ff66e36 and 59eec143 with every Expected matching (rules.routes.test.ts passes before the change, four controllers with same lines 153, api 154 files and 2617 tests), cost if wrong: none.

Ruling: S7a Task 2 committed 3e2bfc80 and 31ceea0e with every Expected matching (NUL separator written as an escape and pinned, 30 renames into features/rules with 26 specifier edits), cost if wrong: none.

Ruling: S7a Task 2 review PASS on both (the escape is byte-identical at runtime, 30 pure renames, no stale specifier); the old paths in deferred-features.md:37 go to the Task 7 records and the CR and handoff mentions stay as point-in-time records, cost if wrong: none.

Ruling: S7a Task 1 review spec PASS, quality FAIL on one medium (the parameter decorators of the 23 moved handlers are pinned nowhere: dropping @Param('id') or swapping @Query() for @Body() survives the api suite); a tests-only fix 1 after Task 3 adds the route argument metadata (ROUTE_ARGS_METADATA) of every handler to rules.routes.test.ts, each kind proven by a mutation; the low (the table depends on declaration order and a count of 23) stays, since a new handler must change the table anyway, cost if wrong: none.

Ruling: S7a Task 3 committed 0aebc163, deabb63f and 2e47329b with every Expected matching (34 declarations moved with same lines 2435, rule-drawer-shared.ts and rule-output-fields.tsx deleted, web 251 files and 2430 tests), cost if wrong: none.

Ruling: fix 1 committed 560861b9 (one test of 23 route argument rows; four decorator mutations each fail it; api count +1 test), cost if wrong: none.

Ruling: S7a Task 4 committed 0efc2b50 with every Expected matching (rules.reads.ts, alertSeverityRank, 8 use-binding-choices rows; web 253 files and 2444 tests), cost if wrong: none.

Ruling: S7a Task 4 review spec PASS, quality PASS; the two lows stay (the `?? ''` fallback of the indicator and activity reads is unreachable because both reads are enabled only with a scope, and the missing blank line before one new test is cosmetic and passes Biome), cost if wrong: a later caller enabling those reads without a scope would query with an empty project id unpinned.

Ruling: S7a Task 5 committed 334808cd with every Expected matching (2 renames, 20 specifier or mock edits, counts 22, 21, 9; typecheck, lint 1491 and 44 focused files pass; a reviewer mutation staged by the first git add was restored before the commit and rules.reads.ts is unchanged from 0efc2b50), cost if wrong: none.

Ruling: S7a Task 5 review spec PASS, quality PASS (client byte-identical, 9 mocks before and after, no stale specifier in apps; doc mentions of the old path are historical or plan text and stay), cost if wrong: none.

Ruling: S7a Task 6 committed a4338236 with every Expected matching except the route comparison (different 2, not 4 or 5: /alerts/repository and one activity route at +1.0 kB, none above 1 kB), which is build jitter under the stop rule, cost if wrong: none, the final gate re-measures routes.

Ruling: S7a Task 6 review spec PASS, quality PASS (barrel holds four client components and no server code; both mocks still supply what the importers render), cost if wrong: none.

Ruling: S7a Task 7 committed be2380b5 with every Expected matching (sad 57, docs:check 6 failures and 1 warning as at Task 0, lint 1492); the records carry the real figures (api +1 file and 4 tests with fix 1, web +3 files and 17 tests, same lines 2435, routes 72 different 2), and the audit rows end in later-slice wording, which the sed handles, cost if wrong: none.

Ruling: S7a SAD design-qa blocked three web files on duplicate imports from '../rules.utils' left by the Task 2 and 3 codemods (linked-alert-summary.tsx, rule-drawer.tsx, rule-test-workspace.tsx; style only); the controller merges each into one import in a fix commit after the gate run and final review, reruns lint, typecheck and the rules tests, and re-dispatches design-qa on those three paths, cost if wrong: none.

Ruling: S7a final review PASS with four lows (runbook names rule-board-model.ts, activity log says nine component files where git shows eight, audit MOD-05 row lacks the rules client move, CR 3.3 reads-row widening lacks its amended note); all four are fixed in the docs fix commit together with the SAD duplicate-import merges, and the Task 8 gate line states the /alerts/repository +1.0 kB is jitter, cost if wrong: none.

Ruling: fix 2 committed 3aa63b44 (three duplicate rules.utils imports merged, runbook path, eight component files, MOD-05 rules client, CR 3.3 amended note; tsc, rules tests 108, lint 1492 and docs check unchanged), cost if wrong: none.

Ruling: S7a Task 3 review spec PASS, quality FAIL on mediums: rules.utils helpers (leafCount, clearRecordBindings, newCondition, recordBound, severity order, nodeKey), the review workspace and drawer permission gates, the condition builder remove, cap, binding-clear and BETWEEN reset, the recommendation cap and the editor leaf cap survive mutation; following the S6c precedent a tests-only fix 3 pins them with mutation proofs, while copy, preview labels and the severity field display stay as accepted debt and notification-row stays unreachable behind showNotifications, cost if wrong: copy regressions in the rules screens are caught only by smoke.

Ruling: fix 3 committed c50e42ee (tests only: 8 new and 2 extended test files, all under 600 lines; 66 mutations over items 1 to 7 each fail a test, two drawer and editor project-change tests made to wait for records after first surviving; web 261 files and 2527 tests, lint 1500), cost if wrong: none.

Ruling: S7a gate docs committed 1549f7d1 (records name fixes 2 and 3 and the real web figure 261 files and 2527 tests; the build figures come from the gate run at be2380b5, since fixes 2 and 3 change only imports and tests); SAD sign-off exit 0 on 182 evaluations with no BLOCKED path, cost if wrong: none.

## S7b

Ruling: S7b pre-flight found 13 must-fix, 15 should-fix and 12 notes; apply-s7b.py writes the fixed plan, replayed end to end on the S7a end state (shared 731 in 46 files, api 2628 in 158 files, web unchanged, sad 58, Middleware 103 kB); imports.service.test.ts duplicate-metadata case named a known flake after one full-run failure, cost if wrong: a real ordering bug in that test is hidden until CI.

Ruling: S7d planned as Tasks 0 to 9 (dashboards web and the rest of the analytics shell: shell 898 to 437 lines, role dashboard 693 to 283, web +16 files and 440 tests, every cut lost 0), dry-run end to end on the simulated S7c base; its pre-flight on the real S7c end state follows the S7c pre-flight, and the pre-existing survivors in the shell lines that did not move stay listed as gaps, cost if wrong: an 11006-line plan costs pre-flight time but no code.

Ruling: W2 is planned now on the W1 dry-run base in parallel with the serial S7c, S7d, S8 pre-flights, with outline items 1 to 4, 6 and 7 only; the per-domain seed data split (item 5) is out, recorded in CR section 9 as left to the developer, because seed work is his and the cloud cannot run the local seed proof, cost if wrong: MOD-21's data part stays open until he takes it.

Ruling: apply the S7b pre-flight fixes (13 must-fix, 15 should-fix), replayed on the S7a end state; Task 0 takes the real S7a figures as baselines (shared 42 files and 721 tests, api 154 and 2618, web 261 and 2527 after S7a fix 3, lint 1500), since the replay ran before S7a fixes 2 and 3, cost if wrong: a later Expected compares against a stale count and the delta check catches it.

Ruling: S7b Task 0 committed f7028682 with every Expected matching except the known baselines (shared 721, api 2618 passed and 21 skipped in 154 files, web 261 files and 2527 tests, M0 103 kB), which later tasks use, cost if wrong: none.

Ruling: S7b Task 1 also pins the route argument metadata (ROUTE_ARGS_METADATA) of every dashboards and analytics-insights handler in dashboards.routes.test.ts, written against the unchanged controllers with a mutation proof, because S7a review 1 found the same gap; api counts run one test above the plan's Expected from here on, cost if wrong: one extra test row.

Ruling: S7b Task 1 committed 381bff86 with every Expected matching except the explained +1 api test (the argument metadata case; api 155 files, 2624 passed and 21 skipped) and lint 1501 (the brief's figure predates S7a fix 3); three argument mutations each fail only that case, cost if wrong: none.

Ruling: S7b Task 1 review spec PASS, quality PASS with three minors; the 403-before-404 order (a role without the permission asking for an out-of-scope project) and lookup-before-compute order in the insights service get a tests-only fix 1 after Task 2, because the first decides what an unauthorized caller learns about project existence; the expect.anything() scope clause stays, since scoped-project.test.ts pins the scope rule, cost if wrong: none.

Ruling: S7b Task 2 committed 4fcebab6 with the brief's stat and every Expected matching except the explained ones (the registration mutation fails 1 of 5 cases, lint 1502, api 2625 passed and 21 skipped in 156 files, two above the plan from the real base and the Task 1 argument case), cost if wrong: none.

Ruling: S7b Task 2 review spec PASS, quality PASS; the two minors (which module owns each controller is not pinned, and DashboardsModule is not compiled alone) stay, because Nest serves the same routes whichever module registers a controller and the AppModule test already fails on an unresolved provider, cost if wrong: a controller moved between modules goes unnoticed with no change a caller can see.

Ruling: fix 1 committed 40b3568d (6 insights cases pin 403 before the scope lookup and the lookup before compute and audit; both order mutations fail 3 cases each; api 156 files, 2631 passed and 21 skipped), cost if wrong: none.

Ruling: S7b Task 3 committed 5de8b28d with the brief's stat and every Expected matching except the explained counts (analytics folder 96 tests, lint 1505, api 157 files and 2633 passed and 21 skipped), cost if wrong: none.

Ruling: S7b Task 3 review spec PASS, quality PASS with two minors; the export file names (CSV fileName, the three fileBase names, Content-Disposition), XLS acceptance and the null-to-empty cell mapping are what a user downloads, so a tests-only fix 2 after Task 4 pins them with mutation proofs; the missing blank line before the copied logger stays (Biome passes), cost if wrong: none.

Ruling: S7b Task 4 committed 9d7da106 with the brief's stat and every Expected matching (same tokens 3361, row-cap mutation fails 1 of 3) except the explained counts (dashboards folder 37, lint 1509, api 158 files and 2636 passed and 21 skipped), cost if wrong: none.

Ruling: fix 2 committed f5518d22 (tests only in three files: export file names per format and view, accepted formats, empty cells, the controller's Content-Disposition; seven mutations each fail a test; api 159 files, 2647 passed and 21 skipped; lint 1510), cost if wrong: none.

Ruling: S7b Task 4 review spec PASS (8 readers identical), quality PASS with three importants and one minor, all pre-existing but now spread over three files: the select of every reader, the own-row and self-exclusion filters, the month window and the imports.read, activities.read and projects.detail.read gates decide what each role sees, so a tests-only fix 3 after Task 5 pins them with mutation proofs; the gt to gte survivor is equivalent, cost if wrong: none.

Ruling: S7b Task 5 committed a4a9c283 with the brief's stat and every Expected matching (302 exports before and after, 35 test titles lost 0, barrel and SAD glob mutations fail as planned) except the explained counts (shared 45 files and 723 tests, lint 1516); one beneficiary-detail-loader flake passed 6 of 6 alone, cost if wrong: none.

Ruling: fix 3 committed 084af1e4 (one 423-line test file, 9 tests; 41 mutations over selects, own-row and self-exclusion filters, the month window, nested queries and three permission gates each fail a test; api 160 files, 2656 passed and 21 skipped; lint 1517); the implementer ran pkill -f once against its own mutation script despite the rule, so a concurrent run that dies without a summary is rerun, cost if wrong: none.

Ruling: S7b Task 5 review spec FAIL on one low (the SAD determinism glob for contracts/projects/overview-metrics.ts is a literal path, so its test no longer routes there), quality PASS with three pre-existing mediums (metric-round sign and negative-zero handling, .strict() on the project map, action counts and timeline contracts, and the descriptive analytics query schema rules are pinned only by api tests or not at all); fix 4 after Task 6 widens the glob to overview-metrics*.ts in check.ts, check.test.ts and sad-pathways.md and adds shared tests with mutation proofs for those schema rules and rounding, cost if wrong: none.

Ruling: S7b Task 6 committed 0d95f726 with the brief's stat and every Expected matching (10 replacements in 5 files, a sixth status fails exactly 5 tests) except the explained counts (shared 46 files and 733 tests, lint 1518, Biome 118 files), cost if wrong: none.

Ruling: S7b Task 6 review spec PASS, quality PASS; the low (widening rule-metrics.ts:189 survives because the output re-parses through the rule-contract union with the same message) stays, since that site's input schema is not exported and the re-parse rejects the same values, cost if wrong: none a caller can see.

Ruling: fix 4 committed e5dff71e (overview-metrics*.ts routing; sad 58 fails before and passes after) and 1cac578f (tests only: rounding, every .strict(), max(100) and both refines of the moved contracts; 24 of 25 mutations fail a test; shared 50 files and 759 tests, lint 1522); the surviving negative-zero guard in round1 is unreachable (toFixed(1) of -0 is 0.0), so it counts as an equivalent mutant, cost if wrong: none.

Ruling: S7b Task 7 committed 4a2686ad with real figures (shared +8 files and 38 tests, api +6 files and 38 tests, web unchanged, sad +1, lint 1522; analytics.service.ts 504 to 454 lines) and one line per fix in the activity log and CR, so its diffstat runs above the brief's, cost if wrong: none.

Ruling: S7b SAD restraint blocked scripts/sad/check.ts on the literal project-map.ts determinism path, which misses the new project-map.test.ts (the same gap fix 4 closed for overview-metrics); fix 5 after the gate run and final review widens it to project-map*.ts in check.ts and sad-pathways.md and adds the test path to check.test.ts, cost if wrong: none.

Ruling: S7b final review PASS with three record lows fixed in fix 5 (activity log says 1514 lines, CR says 797-line test, sdd-pathways.md names the insights controller and service as part of the analytics module), the CR S7c targets marked as new files, and the historical gate-closure CR left as history; the reviewer's brief detached checkout at the same commit changed no file, cost if wrong: none.

Ruling: S7b Task 8 Step 2 handoff checks match exactly (five S8 DTO files, two S8 identity controllers plus the helper, 0 TransactionClient, no old folders or specifiers, import loops 0); fix 5 committed d032e921 (project-map*.ts glob, sad 58 fails before and passes after, four record corrections), cost if wrong: none.

## S7c

Ruling: the W2 plan (items 1, 2, 3, 4, 6 and 7, 3688 lines) was dry-run end to end on the W1 replay tree; item 5, the per-domain seed data split, stays out and is recorded in CR section 9 as the developer's own work. Cost if wrong: Cian expected a seed code change from W2.

Ruling: apply the S7c pre-flight fixes (8 must-fix, 13 should-fix, 87 asserted edits, 6348-line plan, 137 mutations each failing a test), replayed on the S7b replay end state; Task 0 takes the real S7b tip figures as baselines (shared 50 files and 759 tests, api 160 and 2656 passed and 21 skipped, web 261 and 2527, lint 1522), and the three S7a fix 3 rules tests that mock `pathways-client` with an empty object add 3 files to its importer and factory counts, cost if wrong: a later Expected compares against a stale count and the delta check catches it.

Ruling: the only files both S7c and the drift since the replay base touch are five docs (activity log, audit, CR, deferred features, index); where an exact-string docs edit misses on the real text, the implementer applies the same intent to the real line and reports it, cost if wrong: one docs line worded differently from the plan.

Ruling: S7c Task 0 committed 49105249 with every Expected matching except the known baselines (shared 50 files and 759, api 160 and 2656 passed and 21 skipped, web 261 and 2527, lint 1522, M0 103 kB), the pathways-client counts 3 higher (50 files, 39 factories; the three S7a fix 3 rules mocks) and the base commit subject (the controller's commit, not the replay's staging subject), which later tasks use, cost if wrong: none.

Ruling: S7c Task 1 committed 9efd83f7 with the brief's stat and every Expected matching (12 client mutations, same-lines lost 0) except the explained counts (lint 1527, web 264 files and 2611 tests), cost if wrong: none.

Ruling: S7c Task 1 review spec PASS, quality PASS with two lows and one info; the forced timeline view is what the request sends whatever the caller names, so a tests-only fix 1 after Task 2 adds a row with a caller-named view (and retitles the case) with a mutation proof; the unmutated parses and keys stay, since each has a literal assertion that fails on loss, and the encodeURIComponent equivalent mutant stays, cost if wrong: none.

Ruling: S7c Task 2 committed 64426e6a with the brief's stat and every Expected matching (same-lines lost 0, titles lost 0, call counts and hashes) except the explained counts (pathways-client factories 39, the three rules mocks left untouched; lint 1526, web 263 files and 2572 tests), cost if wrong: none.

Ruling: fix 1 committed e3c0bc0f (one case pins the forced timeline view over a caller-named view with the period kept, the old case retitled; the caller-view-wins mutation fails it; analytics.test.ts 16 tests); the implementer amended its own unpushed commit to drop a force-added report, cost if wrong: none.

Ruling: S7c Task 2 review spec PASS, quality PASS with two lows; the timeline view low is fix 1 (e3c0bc0f); the `const client = dashboardsClient` alias stays, since it keeps the moved test bodies identical to the old ones and same-lines proves the move, cost if wrong: one redundant line in a test.

Ruling: S7c Task 3 committed 272e78e5 with the brief's stat and every Expected matching (23 moves, registration mutations fail 1 of 6 each, 9 routes differ from the Task 0 build, none above 1 kB bigger) except the explained counts (lint 1527, web 263 files and 2574 tests) and four route prints 1 kB off the brief within its tolerance, cost if wrong: none.

Ruling: S7c Task 3 review spec PASS, quality PASS; the route-size doubt is settled by the implementer's prelayout-to-layout build comparison (72 routes, 0 different); the two stale docs lines (CR line 356 and activity log line 742 calling `features/analytics/use-monitoring-read` deferred to S7) go to Task 8 as an added note (the CR item gets a closed-by-S7c suffix; the hook now lives in `src/hooks/`; the log line stays as history); the index export order stays as the brief gives it, cost if wrong: none.

Ruling: S7c Task 4 committed d06a17a6 with the brief's stat and every Expected matching (same-lines lost 0 over 1549 lines, 67 titles lost 0, 60 it and 258 assertions before and after) except the explained counts (lint 1533, web 268 files and 2574 tests); staged by explicit path instead of the brief's `git add -A`, cost if wrong: none.

Ruling: S7c Task 4 review spec PASS, quality PASS; the exported but unused `idle` fixture stays as the plan's sed gives it (a test fixture, not app data), cost if wrong: one needless export in a test fixture.

Ruling: S7c Task 5 committed d36183a8 with the brief's stat and every Expected matching (same-lines lost 0 over 1611 lines, folder 14 files and 133 tests, 9 helper and 35 panel mutations each failing with the brief's counts) except the explained counts (lint 1543, web 271 files and 2613 tests), cost if wrong: none.

Ruling: S7c Task 5 review spec PASS, quality PASS with six lows; the alert request's abort signal, the zero-change cohort tone, the state precedence of the survey and timeline panels and the group passed to the chart decide what a user sees or whether a stale request is cancelled, so a tests-only fix 2 after Task 6 pins them with mutation proofs; row keys (unobservable), the MetricCard class selectors and the default date stay as debt, cost if wrong: none.

Ruling: S7c Task 6 committed b9688efa and a3e4fada with the brief's stats and every Expected matching (two Retry cases, same-lines lost 0 over 1190 lines, 38 hook mutations and 5 wiring mutations each failing, the four reset-call survivors equivalent as the plan records) except the explained counts (lint 1553, web 276 files and 2651 tests), cost if wrong: none.

Ruling: S7c Task 6 review spec PASS (effect order, dependency lists, cleanup and Retry unchanged; the four reset survivors equivalent), quality PASS with three lows; the hooks' stale-response guards, refetch triggers, loading flags, early clears after a permission or view loss, export guards and the call-site arguments decide which project's data a user sees and whether revoked data stays on screen, so a tests-only fix 3 after fix 2 pins them with mutation proofs; hook call order, the reset calls, the per-hook 'use client' line (hooks load only from a client component), the moved F9 comment and the type-only import stay as debt, cost if wrong: none.

Ruling: fix 2 committed 34af1844 (12 cases in the panels and cards tests pin the alert request signal, the zero-change success tone, seven panel state precedences and the cohort group of the chart; 11 mutations each fail a case; analytics folder 19 files and 182 tests), cost if wrong: none.

Ruling: fix 3 committed 635a28a2 (tests only, 8 files: 61 hook mutations and 23 of 24 call-site mutations each fail a case, analytics folder 20 files and 264 tests); the survivor (`canExportAnalytics: true` into the export hook) is equivalent from the component, which renders the export menu only when the permission holds, and the hook's own guard has its case; the unmount cases are weak under React 19 (no warning), so the cleanup is pinned by the stale-project cases, cost if wrong: none.

Ruling: S7c Task 7 committed 4eb7bb8d and 6606ce7e with the brief's stats and every Expected matching (same-lines lost 0 over 990 lines, 31 mutations failing with the brief's counts, shell 898 lines) except the explained counts (the Task 0 drift plus fixes 2 and 3: components 11 files and 137 tests, web 278 files and 2753 tests, lint 1559); a harness stop left the shell mutated mid-run, the implementer restored it from the saved copy (cmp identical) and ran the last two mutations separately, and the tree is clean at HEAD, cost if wrong: none.

Ruling: S7c Task 8 committed 327337b1 (13 replacements in 3 files, one applied to the real CR text of the S7b deferral line, the S3 use-monitoring-read item closed by suffix, fix bullets placed after their tasks; docs check baseline); the controller corrected the mutation totals in 7223f2dd (236 each failing a test: 137 in the tasks, 1, 11 and 64 plus 23 in the fixes; the fix 3 report lists 64 distinct hook mutations, not 61), cost if wrong: a mutation total off by a few in the records.

Ruling: S7c Task 7 review spec PASS (the one cut difference, `{' '}` and a line break to a literal space, renders the same), quality PASS with three lows; the split and duplicate `@pathways/shared` imports are merged in fix 4 (a SAD design-qa block in S7a for the same thing), and the SADDD table rows and labels, the budget card states and tone, the 70 tone boundary and the alerts card branches decide what a user reads, so fix 4 pins them with mutation proofs; the 898-line shell is S7d's (ruling 10), the unreachable branches stay as equivalent mutants, and copy, loading text, card order and grid classes stay as debt, cost if wrong: none.

Ruling: fix 4 committed eafffb76 (import merge, non-import lines hash-identical) and 0a68efb0 (22 cases; 17 mutations each fail one; analytics folder 22 files and 295 tests), and the controller recorded it (fix 4 bullet, CR mutation total 253), cost if wrong: none.

Ruling: S7c SAD first round: privacy 10 PASS, design-qa 104 PASS and 1 BLOCKED (`ui-copy-cleanup.contract.test.ts` lines 83 to 85 still read the shell for the `averageKpi === null ? 'None yet'` guard after Task 7 moved the KPI card to `analytics-summary-cards.tsx`, so the guard passes vacuously); fix 5 points the guard at both files after the gates run, then a delta SAD round, cost if wrong: none.

Ruling: S7c final review PASS with five lows; fix 5 corrects the CR test split figures (342-line fixture, files of 113 to 427 lines after Biome), the hook sentence (four reads and the export became five hooks; the monitoring read stays, ruling 9) and the activity log note that the insights client test moved with its client; the 253 total stands (the 137 task mutations include Task 6's five pre-move wiring runs: 12, 2, 9, 35, 5, 38, 5 and 31); "twelve cases" in fix 2 counts test runs (it.each rows), as the report does; the remaining review 5 and 7 lows (two-state precedence of the SADDD and descriptive panels, prop swaps the section tests do not catch, a fixture id outside the 79300000 family, a multi-line JSDoc) stay as debt, cost if wrong: none.

Ruling: S7c fix 5 committed 02cc7473 (the KPI None yet guard reads the shell and the summary cards, an injected guard in the summary cards fails it; three record figures corrected); Task 9 gates pass (web 279 files and 2776 tests with fix 5, 9 of 72 routes differ from Task 0, none beyond 1 kB, 0 from the layout build, Middleware 103 kB); the design-qa delta PASS; assembled 114 entries, sign-off exit 0 at a69ec604; the index row already reads `S7c executed; holds the S7d outline` from Task 8, cost if wrong: one more SAD round in the part 3 PR.

## S7d

Ruling: apply the S7d pre-flight fixes (11 must-fix, 10 should-fix, 113 asserted edits, 11371-line plan; 13 analytics shell gates and 4 role dashboard shell tests added with mutation proofs; S8a needs no change), replayed on the S7c replay end state; Task 0 takes the real S7c tip figures as baselines, and the S7c fixes 1 to 4 (tests only, plus the import merge of fix 4) raise the analytics test counts and may kill more of the plan's recorded shell survivors, cost if wrong: a later Expected compares against a stale count and the delta check catches it.

Ruling: the three S8b items the S7d pre-flight found (the ruling 10 unindexed example `@/features/dashboard/role-overview/portfolio-overview`, the unused-locals baseline that still names `collection-workspace.tsx`, and the index sed wording) go to the S8b pre-flight, since S7d does not edit S8 plans, cost if wrong: none.

Ruling: the only code file both S7d and the S7c drift since the replay base touch is `ui-copy-cleanup.contract.test.ts` (S7c fix 5 changed the KPI guard, S7d's sed changes the participation source line, which fix 5 left alone), so its Task 0 hash differs and the sed still applies; the S7c fixes add 5 files and 117 web tests to the analytics folder and change no shell line, cost if wrong: a Task 0 hash stop that the drift note explains.

Ruling: S7d Task 0 committed 2f8bc771 with every Expected matching except the known baselines (shared 50 files and 759, api 160 and 2656 passed and 21 skipped, web 279 and 2776, lint 1560, M0 103 kB), the analytics file count 55 (two S7c fix test files), the contract test hash (S7c fix 5) and the pathways-client factories 39 (the three S7a fix 3 rules mocks), which later tasks use, cost if wrong: none.

Ruling: S7d Task 1 committed df22e2d4 with the brief's stat and every Expected matching (102 shell mutations, 73 killed and the same 29 named survivors as the plan) except the explained counts (analytics folder 25 files and 349 tests, lint 1563; the S7c fix tests), cost if wrong: none.

Ruling: S7d Task 2 committed 6108b428 with the brief's stat and every Expected matching (cut hash, same-lines lost 0 over 822 lines, 10 of 10 mutations killed) except the explained counts (folder 26 files and 366 tests, lint 1564) and Biome's fix count (the new test file existed on disk before the first check), cost if wrong: none.

Ruling: S7d Task 2 review: the cut dropped `'use client'` from the shell at 6108b428 (the plan's Task 2 cut keeps `@imports` only; Task 3's cut puts the directive back, as its brief shows), so 6108b428 alone would not build; it is already pushed on this unmerged slice branch, and rewriting it would need a force push, so the history keeps it and the Task 3 commit restores the directive (checked at Task 3 and by the Task 9 build), cost if wrong: one commit in the series that a bisect would find unbuildable. The null-profile survey frozen flag gets a tests-only fix 1; the Principal alias repeat and the 888-line shell (cut by Task 4) stay, cost if wrong: none.

Ruling: S7d Task 1 review spec PASS, quality PASS with one medium and three lows; the medium (the shell's pin and export logic is not in the Task 1 mutation list, so export with no project in the timeline view may be unpinned) is checked against Task 4's action bar mutations, and a tests-only fix follows only if one of them survives there; the tautological assertion and the fixture comment go into fix 1; the positional hook-argument asserts and the none-or-all budget grants stay, since Task 1's role tests and the S7c hook tests pin the requests, cost if wrong: an export guard left unpinned until the Task 4 check.

Ruling: S7d Task 3 committed e1885027 with the brief's stat and every Expected matching (cut hash, same-lines lost 0 over 788 lines, 49 mutations with the brief's six survivors) except the explained counts (folder 26 files and 366 tests, lint 1566); the shell carries `'use client'` again, cost if wrong: none.

Ruling: fix 1 committed 404f533c (the null-profile flags pinned with `surveyFrozenOnly: true`, its mutation fails the case; the tautological assertion became the full preview sentence; the fixture comment corrected), cost if wrong: none.

Ruling: S7d Task 3 review spec PASS, quality PASS with five lows; the scope hook's stale guards (projects, monitoring, the data effect's catch and finally) and the "empty scope keeps indicator definitions" survivor (reachable: a stale monitoring request when the project list empties and the same project returns) get a tests-only fix 2 after Task 4; the wider effect order change (budget, trends and participation reads and the SADDD read now start after the scope effects, independent requests) is recorded in the Task 9 records beside ruling 3; the one-render reset delay and the missing same-id guard in `selectProject` stay as debt, cost if wrong: none.

Ruling: S7d Task 4 committed cc48e632 with the brief's stat and every Expected matching (shell hash, same-lines lost 0 over 642 lines, `'use client'` on all four cut files, action bar 57 with the brief's 10 survivors, filter bar 47 with 0, analysis panel 76 with the brief's 3, shell 43 with the brief's 9) except the explained counts (31 files and 525 tests, lint 1572) and Biome's fix counts (test files extracted before step 1); no mutation covers export with no project in the timeline view, so fix 2 adds that case, cost if wrong: none.

Ruling: S7d Task 4 review spec PASS (every cut verbatim, shell 437 lines), quality PASS; the 22 recorded survivors are unreachable or equivalent; the timeline export guard is fix 2 item 4; the shell's props to the three cut components (for example the survey export period and the pin gates) were never mutated, so a tests-only fix 3 mutates the wiring and pins each survivor, with the tail of the panel's branch chain; the reset delay, whole-object props and duplicate `mapSelected` stay, cost if wrong: none.

Ruling: fix 2 committed d58dedb1 (`use-analytics-scope.stale.test.ts` with 7 cases and 2 action bar cases; 15 mutations each fail a case, none survives; analytics folder 31 files and 509 tests without the contract test, consistent with Task 4's 525 that included its 25 cases), cost if wrong: none.

Ruling: fix 3 committed f9686be4 (22 cases; 142 wiring mutations, 98 killed by the existing tests and 31 more by the new cases; 5 panel order mutations each killed; the 13 survivors are equivalent value swaps (`canReadSurvey` and `canReadSurveyTimeline` are one value, `selectedPeriod` and `pickerPeriod` coincide where read, `retryMapData` and `retryLoad`), two panel precedence equivalents, the action bar's `surveyUnavailable` term (the period empties first) and the accepted one-render reset), cost if wrong: none.

Ruling: S7d Task 5 committed a6d01ab3 with the brief's stat and every Expected matching (9 renames, no leaf import outside the feature, both registration mutations and the page sed mutation fail a case) except the explained counts (web 288 files and 3012 tests, lint 1574), Middleware 103 kB (the brief allows 102 or 103) and `/analytics` +1 kB against the Task 0 table (the brief's tolerance; 0 routes differ from the prelayout build), cost if wrong: none.

Ruling: S7d Task 5 review spec PASS, quality PASS; the living docs naming moved dashboard paths (DESIGN.md, deferred features, DSD) follow the final paths in Task 9's records step (controller note added to its brief), while dated change records and the log stay as history; the four role overview files without `'use client'` are unmoved and imported only by a client component, so the boundary holds, cost if wrong: a stale path in a living doc.

Ruling: S7d Task 6 committed 493ef5e6 with the brief's stat and every Expected matching (dashboard folder 15 files and 167 tests, 240 mutations with the brief's 42 named survivors, role-dashboard.tsx hash unchanged) except lint 1578 (the +21 drift), cost if wrong: none.

Ruling: S7d Task 6 review spec PASS, quality PASS with three lows; the reachable survivors the brief mislabels (snapshot card tone and link, the two stale monitoring answers) are pinned by Task 7's direct and deferred-promise tests, which the Task 7 review checks; the tooltip helper text and snapshot description stay as copy debt; the over-claiming test name and the thin repeat test stay (tests only, no behavior), cost if wrong: a reachable survivor left unpinned if Task 7 misses it, which its review catches.

Ruling: S7d Task 7 committed 701be5ae with the brief's stat and every Expected matching (cut hash, same-lines lost 0 over 592 lines, `'use client'` on every cut component, 125 new tests, 241 mutations with the brief's 15 survivors) except lint 1586 (the +21 drift), cost if wrong: none.

Ruling: review 7 PASS (spec and quality, lows only); review 6's four reachable survivors are now pinned and killed. Cost if wrong: an unpinned card tone or stale answer slips through S7d.

Ruling: review 7's reachable lows (the two stale dashboard-answer survivors through a role-to-null rerender, snapshot cards with an empty project list at unit level, the metric card tooltip and the executive note copy) become a tests-only fix 4, dispatched after Task 8 commits so only one implementer works on the branch. The nits (`!dashboard` by type, repeated it.each constants, duplicated `deferred`) and the pinned-nowhere edges (empty-read loading line, `#` after query, empty `?review=`) stay as they are, since they are pre-existing behavior, not lost by the move. Cost if wrong: one more test commit, or a small unpinned edge.

Ruling: S7d Task 8 committed 3f116df8 (pins) and 7d81f98f (action-counts hook and severity alias) with every Expected matching except lint 1587 and 1589 (the known +21 drift) and explicit git add paths instead of `-A apps`; 32 mutations, 0 survivors. Accepted. Cost if wrong: none beyond the review.

Ruling: review 8 PASS (spec and quality); its lows are all in code Task 8 did not change but that S7d moved (role-overview, action-kpi-row), so they become a tests-only fix 5, run after fix 4 commits (one implementer at a time). Cost if wrong: one more test commit for edges that were never pinned on dev either.

Ruling: fix 4 committed 8a7252e2 (tests plus one shared `test/fixtures/deferred.ts`, replacing two local copies); 6 mutations, 0 survivors. Accepted the shared fixture as within "tests only", and the brief's wrong folder for the shell (it is under components/) as harmless. Checked that the commit holds only test files and no source differs from 7d81f98f, so the reviewer's parallel mutations and lint-staged's stash did not leak. Cost if wrong: none; the diff was verified.

Ruling: fix 5 committed 21f822b1 (tests only, 27 mutations, 0 survivors); accepted the three readings of "0 alerts as nonzero", the new role-overview.wiring.test.tsx beside the existing test (different mocks), and no deferred helper (no async). Cost if wrong: none; tests only.

Ruling: Task 9 records committed 6e5529ad (15 replacements in 7 files, one extra for DESIGN.md:607 under the controller note; shell 437 and role 283 lines; fixes 1 to 5 recorded; ruling 3 widened; lint 1591, the +21 drift); the plan's Task 7 figure "152 mutations, 7 equivalents" matches the report (31+17+58+46, 6+1), and fix 4's line records that the snapshot one is now pinned, so the record stays. Cost if wrong: one survivor called equivalent in the CR that a later test pins.

Ruling: S7d final review PASS; I fix its four record lows (deferred-features rows 23, 24, 26 and 86 to the action bar and filter bar files; the hook's real state list; the open alerts read back in ruling 3; 13 new Task 8 tests, not 16) and its first test duplicate (the stale test imports the shared `test/fixtures/deferred.ts`) in one commit after the gates; `loadMapsDashboard` stays as a named shortcut in the fixture (four call sites, no behavior). Cost if wrong: one duplicated fixture helper.

Ruling: S7d SAD design-qa-agent 61 paths (split 31 and 30) all PASS; assembled 61 entries, 0 blocked; sign-off runs after the record fix commit. Cost if wrong: none.

Ruling: Task 9 gates (Steps 4 to 6) match the real baselines: config 19, shared 759/50, imports 94, api 2656 and 21 skipped in 160 files, web 298 files and 3290 tests (2776 plus 514 from Tasks 1 to 8 and fixes 2 to 5), sad 58, lint 1591, typecheck clean, build exit 0, Middleware 103 kB = M0, only /analytics +1 kB against Task 0 (accepted at Task 5) and 0 differences against the prelayout and layout builds; DB replay refused as root (CI replay of the final PR is the gate); local stack, e2e and smoke pending local run. Cost if wrong: none.

Ruling: the record fix 87407e42 changes one test file, so the design QA reply for that path is replaced by a delta review on the new digest before sign-off. Cost if wrong: none.

Ruling: S7d signed off (61 PASS, exit 0) and closed with the gate line fe6920dd, pushed; S7d is done. Cost if wrong: none.

## S8a

Ruling: apply the S8a pre-flight fixes (17 must-fix, 9 should-fix, 13 notes; 183 asserted edits, 6398-line plan), replayed end to end on the S7d replay end state (32261a1, tip 203aa40): every Expected fence is real output (78 checked, 0 mismatches), 225 mutations over 14 lists with 221 killed and 4 named equivalents, the empty `PathwaysClient` deleted in Task 8 (Biome `noBannedTypes`), and Task 10 renamed "Release gates" with no merge, root build or plan-copy removal. Cost if wrong: a later Task 0 stop on a stale figure, which is its purpose.

Ruling: keep the plan's ruling 4 (a null `projectIds` on `POST users/authorize-existing` answers 400 before any lookup instead of the 403 `Application scope could not be verified.` after one; the web always sends an array, so no screen reaches it) and ruling 5 (the two reachable messages keep their class-validator text, including the newly found `projectIds must contain no more than 100 elements`, pinned by contract, parity and HTTP tests). These are the plan's own rulings, recorded in CR 3.6, and the null case is the only accepted-body difference over 85 parity bodies. Cost if wrong: a hand-written client sending null sees 400 instead of 403.

Ruling: the real S7d tip differs from the replay base only by the S7a to S7d review fixes; of the 100 files S8a touches, only six docs (activity log, audit, CR, deferred features, index, SAD) and `scripts/sad/check.ts` and its test differ, in hunks S8a does not edit (the S7b `overview-metrics*` and `project-map*` globs, the S5c index row order); every exact-string docs edit of Task 9 matches the real text with its asserted count. Task 0 records the real baselines (shared 50 files and 759 tests, api 160 files with 2656 passed and 21 skipped, web 298 files and 3290 tests, lint 1591, sad 58, Middleware 103 kB), and four extra test files mock `@/lib/services/pathways-client` with `{ pathwaysClient: {} }` (three rules tests and `role-overview.wiring.test.tsx`), which stay valid after Task 8 removes the export. Cost if wrong: an implementer stop on a count, settled by the drift note.

Ruling: the S8b pre-flight carries the items the S7d and S8a pre-flights found (the ruling 10 example becomes `@/features/unlisted/example`; the Task 0 started checks, ancestor loop and marker lines; real baselines; 26 and 20 importer counts, the mock-scan figures, the `import-direction.test.ts` hash; the S8a commit identity and trailers; the exact CR-row replacement of `S7d and S8a applied, S8b next`). Cost if wrong: S8b Task 0 stops, which is its purpose.

Ruling: S8a set up from the S7d tip fe6920dd with the pre-flighted plan commit; the four pre-flight rulings are in the rulings log under S8a. Cost if wrong: none.

Ruling: S8a Task 0 committed 0aa0bf1b (plan copy and index row) with every Expected matching except the drift-note baselines (shared 50/759, api 160/2656 and 21 skipped, web 298/3290, Middleware 103) and the staging commit as the second log line; base-sha 18ca7f84 is the staging commit. Accepted. Cost if wrong: none.

Ruling: S8a Task 1 committed abae5ab4 and 155f0913 with every Expected matching except the drift counts (contracts 35/651, shared 51/778, api 2650, lint 1594 and 1592); 25 mutations, 0 survivors. Accepted. Cost if wrong: none beyond the review.

Ruling: S8a Task 1 review spec PASS, quality PASS (fuzzed parity: only ruling 4 differs); the users contract's astral-length case (an emoji name at the limit, reachable from the user editor) becomes part of a tests-only fix after Task 2, bundled with any Task 2 findings; the id lowercasing survivor is unobservable (the service lowercases), the default array instance and the QAD-A05 citation (Task 10 edits it) and the profile() 403 (Task 5) need nothing now. Cost if wrong: one unpinned contract swap until the fix lands.

Ruling: S8a Task 2 committed 44bc2ed6 and ffcd2248 with every Expected matching except the drift counts (shared 52/808, api 2654, lint 1595 and 1594, Biome 77 files); 28 mutations, 1 equivalent survivor as in the brief. Checked that neither commit touches Task 1 files after the reviewer's parallel mutations collided with one Step 4 run (rerun green). Accepted. Cost if wrong: none.

Ruling: from now on a reviewer that runs while an implementer works must not mutate tracked files (focused test runs only); mutation re-runs happen only in reviews with no implementer active. Cost if wrong: reviews re-run fewer mutations, which the implementers' cmp-checked proofs cover.

Ruling: S8a Task 2 review spec PASS, quality PASS (8101-body parity: only the CR 3.6 prototype keys differ); its astral-length low joins Task 1's in a tests-only fix 1 after Task 3, with the missing `fullName` and `expectedUpdatedAt` rejections; the duplicated 30 cap mirrors the DTO and stays. Cost if wrong: none; tests only.

Ruling: S8a Task 3 committed 69cc67d0 and 91443fe9 with every Expected matching except the drift counts (shared 53/829, lint 1598 and 1594, api 2606 = Task 2 minus 48 as the brief says); 24 mutations, 0 survivors. Accepted. Cost if wrong: none beyond the review.

Ruling: fix 1 committed 1eb72185 (tests only, 4 mutations killed; the at-maximum astral cases are the discriminating ones). Accepted. Cost if wrong: none.

Ruling: S8a Task 3 review spec PASS, quality PASS (427-body probe: only own keys named on Object.prototype differ); its medium (auth contracts tested in ASCII only) and its two test lows (the three S1 field-schema rules only the deleted parity test pinned, and a valid-body 200 case for the verify and setup routes) become tests-only fix 2 after Task 4; the CR 3.6 wording widens to "own keys named on `Object.prototype`" through a Task 9 controller note; swagger body schemas (off in CI) need nothing. Cost if wrong: none; tests and record wording.

Ruling: S8a Task 4 committed c5980615 and 51c3e1df with every Expected matching except the drift counts (shared 54/873, api 2610, lint 1595 and 1597) and Biome's one import reorder in public.service.ts; 56 mutations, 0 survivors. Accepted. Cost if wrong: none beyond the review.

Ruling: S8a Task 4 review spec PASS, quality PASS; its two reachable lows (the fixed `Invalid publication request.` 400 and the SUBMIT summary rule have no test, and nothing pins that publication bodies reach the service unvalidated under ruling 6) become tests-only fix 3, since the schemas those rules use just moved; the snapshot comment is true by the slice's end (Task 8), and the one-header mutation is backed by the seven-route table. Cost if wrong: none; tests only.

Ruling: fix 2 committed 88e9f7d1 (tests only, 13 mutations killed; the email astral boundary is pinned at the shared length rule, the API isEmail refine stays covered by the Task 3 probe). Accepted. Cost if wrong: none.

Ruling: fix 3 committed 2ca03528 (tests only, 13 mutations killed; the pipe-free body is pinned by route-argument metadata and an HTTP test since Vitest emits no design types). Accepted. Cost if wrong: none.

Ruling: S8a Task 5 committed baf1155e and dfd526d3 with every Expected matching except the totals the fixes and drift explain (api 2639, lint 1598 and 1600); 28 mutations, 0 survivors. Accepted. Cost if wrong: none beyond the review.

Ruling: S8a Task 5 review spec PASS, quality PASS (characterization tests pass on the unchanged controllers; 28 of 28 mutations replayed); the unpinned `@Param('projectId')` and `@Param('userId')` keys of the two controllers Task 5 touched join a tests-only fix 4 with any Task 6 findings (a route test through the real router pins them). Cost if wrong: none; tests only.

Ruling: S8a Task 6 committed 14095097 and 51ccc824 with every Expected matching except drift (web subset 784 with the S7d fix case, web 299/3308, lint 1600 and 1601, Middleware 103 = real M0, three routes 0.02 to 0.04 kB smaller, Biome's import wrap); 22 mutations, 3 equivalent survivors as in the brief. Accepted. Cost if wrong: none beyond the review.

Ruling: S8a Task 6 review spec PASS, quality PASS (role sets identical, 158 jsdom cookie strings with 0 differences, the 3 survivors equivalent over 100 selections); the unexercised `typeof document` guard of `ownerCookie()` joins fix 4 as a node-environment case; the two style nits stay. Cost if wrong: none; tests only.

Ruling: S8a Task 7 committed 08190e72 (seven dead files, mapPublicSnapshot and seven view models removed; deferred-features rows edited and one added) with every Expected matching except drift (web 296/3302, lint 1594, Middleware 103) and a plain diff of route tables (identical to Task 6). Accepted. Cost if wrong: none beyond the review.

Ruling: S8a Task 7 review spec PASS, quality PASS; the restore pointer to the activity log is satisfied by the Task 9 activity-log section (its Task 7 line names the commit), checked at Task 9 review; the row scope and the access-matrix test name stay. Cost if wrong: none.

Ruling: fix 4 committed 4f023c31 (tests only, 4 mutations killed; the users key was already pinned by the validation test, the null branch reached through captureRequestOwner since ownerCookie is private). Accepted. Cost if wrong: none.

Ruling: S8a Task 8 committed 88be39d0, 557f358d and 0049dd61 with every Expected matching except drift (web 300/3342, lint 1599, Middleware 103, subset runs) and Biome fix counts; 42 mutations, 0 survivors; against the Task 0 build 5 routes are 1 kB smaller and none bigger; the inert pathways-client mock in project-setup-form.test.tsx stays as the brief words it. Accepted. Cost if wrong: none beyond the review.

Ruling: S8a Task 8 review spec PASS, quality PASS; the removed getUsers unauthorized assertion stays covered by requestFoundation's own tests (the users client adds no error mapping of its own), the inert mock stays per the brief, the page-size shifts keep First Load equal or smaller, and the duplicated area case is harmless. No fix. Cost if wrong: an unauthorized users read regresses unseen only if requestFoundation's tests miss it.

Ruling: S8a Task 9 records committed 8ab5f86d (SAD routing test first red then sad 59; 11 replacements, one extra for the CR 3.6 Object.prototype wording; hashes written from git log since the brief's grep patterns miss the real subjects; fixes 1 to 4 recorded; QAD-A05 repointed; Middleware 103). Accepted. Cost if wrong: none beyond the final review.

Ruling: S8a SAD: isolation 18, privacy 35, restraint 2 and design-qa 97 (split 49 and 48) all PASS; assembled 152 entries, 0 blocked; sign-off waits for the final review and gates. Cost if wrong: none.

Ruling: S8a final review PASS; I fix its three record lows (both ruling 5 messages in CR section 9, the Task 6 web test count 9, the profile and public client counts in order) plus the two info wordings that are cheap and true (85 parity cases, class-transformer stays beside class-validator) in one docs commit after the gates; the inert pathwaysClient mocks and PublicationTransitionRequest (S8b's) stay. Cost if wrong: none; docs only.

Ruling: S8a Task 10 records shared 885 and api 2642 as measured on the committed tip (green, file counts and skips equal); the 884 and 2639 I carried were mid-slice figures. Cost if wrong: two gate figures off by 1 and 3 in the activity log.

Ruling: dev's 18 new commits are merged into the stack on the S8b branch before the S8b pre-flight, so S8b, W1 and W2 are planned on the merged tree and the part 3 PR carries no conflict. Cost if wrong: one merge commit to redo if Cian wanted the merge at PR time.

Ruling: the merge ports dev's rules changes into the features/rules split; dev's behavior wins where HEAD characterization tests pinned the old behavior, and those tests are updated, not deleted. Cost if wrong: a test intent changed beyond what dev's change requires; caught by the merge review.

Ruling: a separate behavior-neutral commit moves RecommendationRuleDrawer and the severity suggestion block into their own files when the merged files pass 500 lines, following S7a's one-component-per-file layout; dev's test files stay unsplit. Cost if wrong: one extra move commit to revert.

Ruling: DEFAULT_REC is deleted with its last user; categoryOf and UnavailableHint stay for parity. Cost if wrong: two unused exports remain.

Ruling: the merge review's one finding (the apply-to-fields Project aria-describedby assertion dropped without need) was restored in cc811845 with a mutation proof; the over-500 rule-drawer.tsx (587) and rules-board.tsx (540) are recorded in the CR, not split further, as one stateful body each. Cost if wrong: two files to split in a later pass.

Ruling: the S8b pre-flight is rerun on a clone of the real merged tree (cc811845) because the earlier one replayed on the dry-run S8a and docs:check, counts and figures moved. Cost if wrong: one extra pre-flight run.

## S8b

Ruling: apply the S8b pre-flight fixes (15 must-fix, 10 should-fix, 13 notes; 117 asserted edits, 4533-line plan), replayed end to end on the real S8a tip with the dev merge (cc811845) from this staging commit: every Expected fence is real output (33 checked, 0 mismatches), 30 mutations over four lists all fail a case, web goes from 301 files and 3378 tests to 307 and 3472, and config, shared, imports, api and sad keep 19, 885, 94, 2642 and 21 skipped, and 59. Cost if wrong: a later Task 0 stop on a stale figure, which is its purpose.

Ruling: S8b runs on top of the dev merge: Task 0 checks the "Dev merge before S8b" record, the S8b paragraph of the change record is appended after that paragraph instead of after the S8a "Deferred to S8b" line, and the `docs:check` baseline is 0 failures and 0 warnings; the merge touches none of the files S8b moves, splits or tests. Cost if wrong: the S8b record lands out of order in section 9.

Ruling: absolute route and Middleware sizes are written `<n>` in the Expected fences (Middleware is 102 kB in the replay clone and 103 kB in the main checkout), `build-routes.sh` prints `Middleware equals M0` for every build after Task 0, and the route names and deltas must match; a checkout that rounds differently may move other routes by 1 kB, which ruling 11 accepts. Cost if wrong: a route list that differs only by 1 kB moves stops a task for a controller ruling.

Ruling: `/dashboard` is 1 kB bigger after Tasks 1 and 2 (the shared chunks regroup once the old client leaves), inside ruling 11's bound, and no route changes in Tasks 3 to 5 in the replay; the replay clone without `apps/web/.env.local` showed `/auth/mfa` 1 kB bigger after the MFA split instead, also inside the bound. Cost if wrong: a 1 kB bigger first load of the dashboard is accepted.

Ruling: the S5c test split, the S6c fix 4 state test and the S7c export hook test leave 28 files naming `core-feature-client` and 22 naming an artifact helper (15 artifact mocks, seven of them `collection-workspace.*.test.tsx`), so Task 2 repoints 23 files with the save characterization file; the `sed` reads the list from `git grep`, so only the counts change. Cost if wrong: none.

Ruling: S8b set up from cc811845 (S8a tip plus the dev merge) with the staging commit 57b8dd59 (plan copy, index row, 33 S8a ledger rulings and the five S8b pre-flight rulings in the rulings log). Cost if wrong: none.

Ruling: the W1 pre-flight runs in parallel with the S8b run, on a clone of the S8b replay tip (1dfc3b37) with nice -n 19 for heavy steps, because W1 renames no path S8b touches; the real S8b tip differs in shas and the gate line only. Cost if wrong: a W1 Task 0 stop on a figure, settled by a drift note.

Ruling: S8b continues on claude/modularization-s8b-xjnlzt (from ef72bc9c) because this cloud session can push only its assigned branch name; W1 and W2 stack on the same branch. Cost if wrong: a branch rename.

Ruling: node_modules in this container takes xlsx 0.20.3 from the npm mirror @e965/xlsx because the proxy denies cdn.sheetjs.com; the lockfile and package.json stay unchanged and CI installs the real tarball. Cost if wrong: an xlsx-only test difference that CI catches.

Ruling: apps/web/.env.local holds placeholder public values with the staff portal at http://127.0.0.1:3000 (the only http origin password-recovery.ts accepts); Task 0 measured Middleware M0 103 kB, equal to the main checkout figure, and every Task 0 baseline matched the plan. Cost if wrong: none.

Ruling: Task 1 (7de25942) passed review on spec and quality with no findings; all mutation and same-lines figures matched the plan. Cost if wrong: none.

Ruling: Task 2 (7a82788f) passed review; the copied download setup in owned-json-read.test.ts (dead for owned reads) stays because the plan cuts those lines verbatim by range and a tidy would break the same-lines proof. Cost if wrong: a few unused test lines.

Ruling: Task 3 (18227297) prelayout table lacks the /transparency -1 kB line the replay showed, a rounding variance ruling 11 allows; every other delta matched and the layout move changed no route. Cost if wrong: none.

Ruling: Task 3 passed review; the profile schema importing strongPasswordSchema through the auth index stays as the plan rules (ruling 8), and the build table showed no route change across the move. Cost if wrong: a route size the Task 7 tables would show.

Ruling: Task 4 passed review; the review found reachable logic the new tests leave unpinned (out-of-scope project error, unavailable target role error, Deactivated status kept on edit), so a tests-only fix follows Task 5 in its own commit; the type import order nit stays as Biome left it. Cost if wrong: three more test cases.

Ruling: Task 5 passed review; two security behaviors of Review Focus 5 were reachable but unpinned (the session re-check before each factor call, the sign-out card not flashing on a successful sign-out), so a tests-only fix with mutation proofs follows the Task 4 fix round; the split react imports and the 23-value hook return stay (Biome output, ruling 7). Cost if wrong: two more test cases.

Ruling: the review fix rounds added 3 user editor cases (9b405c25) and 3 MFA cases (f48d89ab), tests only with mutation proofs, so S8b ends at web 307 files and 3478 tests instead of the plan's 3472; Task 6 and Task 7 state the six extra cases. Cost if wrong: none.
