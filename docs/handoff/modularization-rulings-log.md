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

Ruling: apply the S4 pre-flight fixes (6 must-fix, 15 should-fix and two count notes: hash 14 after S2, activities.dto.ts git rm, docs/handoff grep exclusion, stacked base with SAD --base at the S4 base sha, cp plan copy, pull request in place of the dev merge, cloud replay, seed and e2e wording, Claude-Session trailer, post-S3b baselines web 224 and 1998, S4b outline figures 41 factories and pathways-client 1361 lines), cost if wrong: a Task 0 stop in S4.
