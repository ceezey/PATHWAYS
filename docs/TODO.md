# PATHWAYS — Core Features TODO

**Canonical location in this checkout:** `docs/TODO.md`  
**Rules/policies:** `Source of Truth.md`  
**Progress basis:** Preserve checked evidence across reruns. The completed conversion/developer Auth work is a handoff; core phase items are checked only after their own implementation and verification.

## Updating this file

At each phase end, change `[ ]` to `[x]` only for an implemented-and-tested result. Add a compact evidence suffix: `Evidence: <test/path/command>; environment: <target>; result: <exit/status>`. Do not put secrets or personal records here. Existing features may be checked after verification without rebuilding them.

Partial/blocked items remain `[ ]` with a reason. Reopen a checked item if a regression is found. Preserve IDs and earlier evidence. Update the phase tracker and Source of Truth in the same phase, then report in chat using the template. Never create a separate phase-report Markdown file.

## Phase tracker

| Phase | Work status | Acceptance | Ready for next | Key evidence / blocker |
|---|---|---|---|---|
| P00 | COMPLETE | PASS | YES | CF-P00-01–03 evidenced; runtime decision G7 subsequently resolved |
| P01 | COMPLETE | PASS | YES | CF-P01-01–08 revalidated locally; no managed-service write performed; stop before P02 |
| P02 | COMPLETE | PASS | YES | CF-P02-01–04 verified locally; 0001–0008 disposable replay and full regressions pass; no managed-service write performed |
| P03 | COMPLETE | PASS | YES | CF-P03-01–04 verified locally; 0001–0010 disposable replay and full regressions pass; no managed-service write performed |
| P04 | COMPLETE | PASS | YES | CF-P04-01–04 verified locally; 0001–0011 disposable replay and full regressions pass; no managed-service write performed |
| P05 | COMPLETE | PASS | NO | CF-P05-01–04 verified locally; 0001–0012 disposable replay and full regressions pass; P06 waits on G4 |
| P06 | NOT STARTED | NOT RUN | NO | G4 is partially resolved; exact age reference, ages 0–9 and invalid-date treatment still require developer confirmation |
| P07 | NOT STARTED | NOT RUN | N/A | |

A checked task is evidence of its stated scope, not of production readiness. Managed-dev verification and local tests must not be conflated.

## P00 — Context / orientation

- [x] CF-P00-01 — Current repository, completed conversion/Auth handoff and relevant source files mapped; conflicts recorded. Evidence: branch `Backend-DB` at `f5c0748788a6ccbf4352e888b2dffd98148b1be2`; 39-model schema; six immutable migrations; Master Context Pack v4.0 FINAL/Human Gates/manuscript and P01–P07 implementation map recorded in `docs/Source of Truth.md`; environment: repository plus read-only PATHWAYS-dev; result: PASS.
- [x] CF-P00-02 — Canonical task files installed/merged without overwriting unrelated work; evidence register initialized. Evidence: only the supplied untracked `docs/Source of Truth.md`, `docs/TODO.md`, and `docs/PHASE_REPORT_TEMPLATE(4).md` existed before P00; only the first two were updated; actual-location discrepancy and evidence/contract registers preserved in place; result: PASS.
- [x] CF-P00-03 — Safe local DB/provider-test strategy, installed command syntax and phase dependencies established; only real prerequisite blockers raised. Evidence: local server binary 18.6 and PATHWAYS-dev server 17.6 identified; fixed read-only PATHWAYS-dev probe confirmed one `public` ledger, six matching completed migrations, 39 domain tables, `runtimeSafe=true`, and valid liveness helper; isolated `pathways_phase4_phase6_replay`/55448 strategy, protected runtime launcher and exact commands recorded; focused API 369/369 and web 99/99 tests plus Prisma validate PASS; result: PASS.

P00 exact commands (run from `C:\PATHWAYS`; set workspace-local temp paths so pnpm does not traverse the restricted user temp directory):

```powershell
$env:TEMP='C:\PATHWAYS\.tmp'; $env:TMP='C:\PATHWAYS\.tmp'
pnpm --filter @pathways/api exec prisma validate
pnpm --dir apps/api exec vitest run src/modules/auth/authorization-policy.test.ts src/modules/auth/application-profile.service.test.ts src/modules/auth/route-access.service.test.ts src/modules/auth/token-auth.service.test.ts src/modules/auth/session-liveness.service.test.ts
pnpm --dir apps/web exec vitest run src/lib/rbac/access-matrix.test.ts src/lib/rbac/server-access.test.ts src/lib/services/pathways-client.test.ts src/lib/rbac/data-scope.test.ts
.\infra\supabase\session-liveness\Read-DevSessionLiveness.ps1
```

The first three are credential-free validation/mocked tests. The fourth is the fixed checksum-guarded PATHWAYS-dev read-only probe and requires the existing protected administrator credential. It performs no Auth/Storage write. After P01 authorization, the full isolated replay command is `.\infra\supabase\phase6\Replay-Local.ps1`; it uses only its guarded `pathways_phase4_phase6_replay` database on loopback port 55448 and must never be pointed at PATHWAYS-dev, a shadow database, or a restore-rehearsal target.

## P01 — Secure workspace and project foundation

- [x] CF-P01-01 — Existing identity verification reused; active profile/organization/role/permission/assignment checks enforced server-side. Evidence: `token-auth.service.ts`, `workspace-resolution.service.ts`, `authorized-operation.ts`, `prisma.service.ts`, explicit suspended/deactivated/archived denial tests and bounded existing-Auth directory checks; full API suite 495 passed/6 credential-gated local tests skipped; environment: mocked provider plus isolated PostgreSQL 18.6 replay; result: PASS.
- [x] CF-P01-02 — Six-role account and assignment authority implemented with scoped management, safe provisioning and no privilege escalation. Evidence: shared role enum/constants, `authorization-policy.ts`, `users.service.ts`, 0007 role-ceiling/RLS helpers, `core-foundation.test.ts`; user rows and nested assignments are predicate-scoped in Prisma, self-escalation and mixed/out-of-scope target assignment mutations are denied, and core foundation tests pass 10/10; result: PASS.
- [x] CF-P01-03 — Minimum program/project profile and membership API plus current UI work persistently; no lead-column authorization shortcut. Evidence: programs/projects/users controllers/services/DTOs and project/user UI API workflows; scoped predicates use assignments/program authority, and nested program ownership is checked before project create/update; focused authorization foundation 94/94 and web suite 380/380 PASS; result: PASS.
- [x] CF-P01-04 — Runtime security, request validation, redacted audit and safe API boundaries verified; relevant cross-scope/stale-role tests pass. Evidence: global unknown-key rejection/CORS hardening, atomic audited operations, 0007 `NOBYPASSRLS` helpers/policies; the role-ceiling helper is `SECURITY INVOKER` with an empty search path; isolated 0001–0007 replay reports `PHASE6_LOCAL_REPLAY=PASS`, `CORE_FOUNDATION_RUNTIME=PASS`, `LEGACY_TABLE_PRESERVATION=PASS`, `DISPOSABLE_LOCAL_CLEANUP=PASS`; lint/typecheck/build/full tests PASS.
- [x] CF-P01-05 — Remove user-facing prototype/mock/presentation-only/demo markers. Evidence: repository UI/API source search excluding tests/fixtures returned no matches; labels and route contract use current database-verified wording; result: PASS.
- [x] CF-P01-06 — Remove security-critical runtime mock authorization fallbacks. Evidence: fixed-subject and developer-workspace allowlist/opt-in gates removed from guards, resolver, config and launcher; the frontend unknown-role fallback was also removed; every business route uses verified Auth plus current database authority; auth/route suites PASS.
- [x] CF-P01-07 — Ensure unfinished features do not present fabricated data as persisted data. Evidence: project directory/detail/header render only persisted fields; metric surfaces require `metricsAvailable` and otherwise show a neutral unavailable state; unfinished analytics/reporting do not present synthetic zero values as persisted metrics; web suite PASS.
- [x] CF-P01-08 — Re-run UI search and record remaining legitimate test/internal occurrences. Evidence: `rg -ni "\b(prototype|demo)\b|mock data|presentation[- ]only|sample data|development feature|scaffolded|production ready" apps/web/src --glob '!**/*.test.*' --glob '!**/*fixtures*'` returned no matches. Remaining generic `placeholder` occurrences are legitimate form-input hints, CSS selectors or internal table flags; test-only `vi.mock` and synthetic fixtures remain non-runtime test infrastructure; result: PASS.

P01 exact safe verification commands (run from `C:\PATHWAYS`; the replay owns only its fixed loopback scratch target):

```powershell
$env:TEMP='C:\PATHWAYS\.tmp'; $env:TMP='C:\PATHWAYS\.tmp'
pnpm --filter @pathways/api exec prisma validate
pnpm lint
pnpm typecheck
pnpm build
pnpm test
.\infra\supabase\phase6\Replay-Local.ps1
```

Do not substitute PATHWAYS-dev, `pathways_shadow`, or a restore-rehearsal database for the replay target. Migration 0007 has not been applied to PATHWAYS-dev; that managed write requires a separately scoped approval and is not required to begin local P02 work.

## P02 — Metadata, forms and direct entry

- [x] CF-P02-01 — Project-owned versioned forms/fields persist, with immutable published semantics and authorized publication. Evidence: metadata controller/service/DTOs, `0008_metadata_forms_direct_entry`, M&E-only/non-author publication, row-locked version creation, optimistic timestamps and database immutability triggers; isolated PostgreSQL 18.6 0001–0008 replay `METADATA_FORMS_RUNTIME=PASS`; result: PASS.
- [x] CF-P02-02 — Shared bounded metadata validator covers supported field types, required/options/ranges and unknown-key rejection. Evidence: `packages/shared/src/validation/form-data.ts` plus 6 focused tests cover all eight field types, false/zero/null, draft/final required semantics, exact decimal/calendar limits, allowed values, unsafe/unknown keys and invalid definitions; shared suite 7/7 and full typecheck PASS; result: PASS.
- [x] CF-P02-03 — Direct entry persists valid version-pinned submissions/responses and audit; incomplete drafts cannot feed operational monitoring. Evidence: retry-safe actor/client IDs, composite form-version FK, draft/update/validate/submit API, old-version preservation, server-owned actor/scope and atomic audit; service tests 9/9 and disposable runtime tests cover repeat IDs, finalized immutability, audit rollback and cross-tenant denial; result: PASS.
- [x] CF-P02-04 — Existing form-builder/entry UI uses API persistence; reload, invalid-input, concurrent-publication and cross-project tests pass. Evidence: collection builder lists/creates/updates/publishes/archives/versions persisted forms; direct-entry route restores DB drafts by non-sensitive client ID, renders bounded server field errors and supports all types; route matrix 263/263, web contract 2/2, web suite 383/383, full build and isolated replay PASS; result: PASS.

P02 exact safe verification commands (run from `C:\PATHWAYS`; the replay creates and removes only its guarded PostgreSQL 18 loopback scratch cluster/database):

```powershell
$env:TEMP='C:\PATHWAYS\.tmp'; $env:TMP='C:\PATHWAYS\.tmp'
pnpm --filter @pathways/api exec prisma validate --schema prisma/schema.prisma
pnpm --filter @pathways/api prisma:generate
pnpm lint
pnpm typecheck
pnpm test
$env:CI='true'; pnpm build
.\infra\supabase\phase6\Replay-Local.ps1
```

The replay target remains exactly `pathways_phase4_phase6_replay` on `127.0.0.1:55448`. It is not PATHWAYS-dev, `pathways_shadow`, or a restore-rehearsal database. Migration 0008 has not been applied to PATHWAYS-dev.

## P03 — Secure import pipeline

- [x] CF-P03-01 — Private upload/parse path enforces approved formats and finite resource limits without executing formulas/macros or fetching links. Evidence: `packages/imports/src/parser/secure.ts`, server-only worker entry point, private/no-overwrite `StorageService`, server-scoped object keys and 6 parser tests cover CSV/XLSX/XLS, signatures, formula/link/multi-sheet rejection, unsafe/duplicate headers and byte/row limits; imports suite 11/11; result: PASS.
- [x] CF-P03-02 — Raw rows, mappings, validation revisions and safe review errors persist; privileged target fields cannot be mapped. Evidence: migrations 0009–0010, pinned form-version/checksum/source headers, immutable raw rows and append-only mapping revisions; exact all-header review, target allowlist, duplicate target/key rejection, bulk revision-pinned validation and detail-only preview/error API; service and PostgreSQL runtime tests pass; result: PASS.
- [x] CF-P03-03 — Authorized promotion to generic submissions is transactional/idempotent; invalid/unresolved domain rows remain unprocessed. Evidence: M&E-only current-authority processing, one row/one transaction, unique import-row/client links, version-pinned `VALIDATED` submission/responses plus audit and row outcome; retry/rollback tests and `IMPORT_PIPELINE_RUNTIME=PASS` prove invalid rows create zero records and accepted generic rows exactly one. P04 now consumes validated registration rows through the shared domain handler; participation remains pending P05; result: PASS.
- [x] CF-P03-04 — Durable processing/retry/status UI survives restart; concurrent retry and partial-failure tests prove no duplicate committed effects. Evidence: persisted Storage/batch/row claims and revisions, 60-second claim expiry, 25-row checkpoints, 3-attempt limit, recovery/resume endpoint and honest total reconciliation; 13 import service tests cover idempotency conflict, concurrent/stale claims, changed mapping, revoked authority, transaction failure and Storage-success/DB-failure; Collection import UI reloads server batches/mappings/rows/statuses; API 533/533 and web 385/385 pass; result: PASS.

P03 exact safe verification commands (run from `C:\PATHWAYS`; set `CI` for deterministic noninteractive package checks; the replay owns only its fixed loopback scratch target):

```powershell
$env:TEMP='C:\PATHWAYS\.tmp'; $env:TMP='C:\PATHWAYS\.tmp'; $env:CI='true'
pnpm --filter @pathways/api exec prisma validate
pnpm --filter @pathways/api prisma:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
.\infra\supabase\phase6\Replay-Local.ps1
rg -ni "\b(prototype|demo)\b|mock data|presentation[- ]only|sample data|development feature|scaffolded|production ready" apps/web/src --glob '!**/*.test.*' --glob '!**/*fixtures*'
```

The replay target remains exactly `pathways_phase4_phase6_replay` on `127.0.0.1:55448` (PostgreSQL 18.6) and creates/removes only that guarded scratch environment. It is not PATHWAYS-dev, `pathways_shadow`, or a restore-rehearsal database. Migrations 0007–0010 have not been applied to PATHWAYS-dev. Managed private-Storage write/read acceptance remains separately gated for P07.

## P04 — Beneficiaries and registration promotion

- [x] CF-P04-01 — Centralized Beneficiary CRUD/search and project enrollment enforce scoped detail, consent provenance and safe shared-profile updates. Evidence: project-scoped Beneficiary controller/service and migration `0011_beneficiary_registration`; explicit individual/group/community validation, bounded search, optimistic update/archive, append-only project consent provenance, separate profile/enrollment permissions and all-active-enrollment update checks; 16 Beneficiary service tests and `BENEFICIARY_REGISTRATION_RUNTIME=PASS`; result: PASS.
- [x] CF-P04-02 — Stable-identifier matching is deterministic; ambiguous identities enter review without fuzzy auto-merge or cross-scope disclosure. Evidence: organization-unique canonical PATHWAYS codes and exact namespace/value identifiers; no email/name/date matching; identity-review permission is required before LINK/UPDATE lookup and in addition to enrollment authority for cross-project linking; hidden duplicate and executive/detail denials are covered in service/runtime tests; result: PASS.
- [x] CF-P04-03 — Registration import promotion and manual entry use the same domain service; profile/enrollment/submission/audit commit coherently. Evidence: `BeneficiariesService.promoteRegistration` is called by direct registration and the P03 processing claim; one transaction creates/resolves the profile, enrollment, pinned `VALIDATED` submission/responses, consent records, import outcome and redacted audit; retry/conflict, domain-failure rollback and shared direct/import tests pass; result: PASS.
- [x] CF-P04-04 — Existing Beneficiary UI survives reload; multi-project privacy, duplicate/concurrent registration and rollback tests pass. Evidence: directory/detail/register screens load project-scoped API state, hide disallowed mutation affordances, preserve current-project-only enrollment/consent output and route registration definitions away from generic entry; lint 433 files, full config/shared/imports/API/web suites 960/960, PostgreSQL 18.6 replay and build pass; 6 credential-gated local API tests skipped; result: PASS.

P04 exact safe verification commands (run from `C:\PATHWAYS`; the replay creates and removes only its guarded loopback scratch cluster/database):

```powershell
$env:TEMP='C:\PATHWAYS\.tmp'; $env:TMP='C:\PATHWAYS\.tmp'; $env:CI='true'
pnpm --filter @pathways/api exec prisma validate --schema prisma/schema.prisma
pnpm --filter @pathways/api prisma:generate
pnpm --filter @pathways/api exec vitest run src/modules/beneficiaries/beneficiaries.service.test.ts src/modules/imports/imports.service.test.ts src/modules/auth/authorization-policy.test.ts src/modules/auth/authorized-operation.test.ts src/modules/auth/route-access.service.test.ts
pnpm lint
pnpm typecheck
pnpm test
pnpm build
.\infra\supabase\phase6\Replay-Local.ps1
```

The replay target is exactly `pathways_phase4_phase6_replay` on `127.0.0.1:55448` (PostgreSQL 18.6), never PATHWAYS-dev, `pathways_shadow`, or a restore-rehearsal database. PATHWAYS-dev remains read-only verified only through migration 0006; migrations 0007–0012 and all feature writes remain gated under G5/P07.

## P05 — Projects, activities and Beneficiary journeys

- [x] CF-P05-01 — Remaining project/activity/milestone functions and assignments persist with valid lifecycle, review provenance and derived overdue. Evidence: scoped Activities/Milestones API and current project UI; explicit five-state workflow, active assignees, optimistic edits, business-date overdue, M&E-only independent review and audit; activity tests 3/3 and PostgreSQL `PROJECT_ACTIVITY_JOURNEY_RUNTIME=PASS`; result: PASS.
- [x] CF-P05-02 — Journey stages/branches/activity mapping, enrollment transitions and participation/history are implemented with historical integrity. Evidence: project-row lock/optimistic config saves, parent-before-child cycle prevention, database freeze and immutable snapshots after first event, chronological completion/follow-up/dropout/transfer and append-only corrections; 0012 constraints/RLS/triggers and runtime freeze/correction tests pass; result: PASS.
- [x] CF-P05-03 — Participation/journey direct entry and imports share authorized idempotent domain handlers; all required C6 destinations now work. Evidence: metadata direct-submit and P03 processing both call `ParticipantsService.promoteParticipation`; exact active enrollment/activity/stage mapping, unique submission effect, atomic response/submission/participation/journey/audit/row finalization; focused tests 5/5 plus 14/14 import tests and replay pass; result: PASS.
- [x] CF-P05-04 — Existing activity/journey UI, private proof where required, scoped chronology, cycle/retry/state-transition tests pass. Evidence: activities/detail/proof/review and journey-stage/history clients now reload persisted API state; server-owned private object keys, storage recovery checkpoint, scoped proof download and aggregate-role detail denial; lint 448 files, typecheck, build, 973 tests and full PostgreSQL replay pass; result: PASS.

P05 exact safe verification commands (run from `C:\PATHWAYS`; no managed service is mutated):

```powershell
$env:TEMP='C:\PATHWAYS\.tmp'; $env:TMP='C:\PATHWAYS\.tmp'; $env:CI='true'
pnpm --filter @pathways/api exec prisma validate
pnpm --filter @pathways/api prisma:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
.\infra\supabase\phase6\Replay-Local.ps1
rg -ni "\b(prototype|demo)\b|mock data|presentation[- ]only|sample data|development feature|scaffolded|production ready" apps/web/src --glob '!**/*.test.*' --glob '!**/*fixtures*'
```

## P06 — Project indicators and SADDD dashboard

- [ ] CF-P06-01 — Project-owned indicators persist with clear manual/derived authority, typed data bindings, numeric semantics and audit.
- [ ] CF-P06-02 — Dashboard metric contracts define distinct populations, periods, denominators, refresh rules and missing-data behavior.
- [ ] CF-P06-03 — Database-scoped dashboard/SADDD aggregates apply approved demographic/privacy rules without leaking detail or cross-scope cache data.
- [ ] CF-P06-04 — Actual-data charts and filters work after reload; deterministic fixtures prove calculations, privacy, deduplication and bounded query behavior.

## P07 — Core acceptance and security regression

- [ ] CF-P07-01 — C1–C8 vertical workflows run end-to-end against persisted data, including actual approved Auth/Storage integration.
- [ ] CF-P07-02 — Six-role/two-organization adversarial matrix, revocation, concurrency, failure recovery and no-core-mock tests pass.
- [ ] CF-P07-03 — Full migration replay/upgrades and security-object checks pass on an appropriate isolated PostgreSQL target; regressions resolved.
- [ ] CF-P07-04 — Developer acceptance walkthrough completed; known limitations and exact evidence recorded; all core-blocking human gates resolved.


## Feature completion tracker

Set COMPLETE only when its phase acceptance and integrated regression checks are evidenced. P05 completes C2/C4/C5/C6 at local feature level; they remain PARTIAL here until integrated provider/adversarial acceptance in P07.

| ID | Feature | Status | Evidence |
|---|---|---|---|
| C1 | Role-Based Access Control and Workspace Management | PARTIAL | P01 account/assignment/workspace workflows and six-role security are complete locally; integrated real-provider/adversarial regression remains P07. |
| C2 | Project Profile and Activity Tracking | PARTIAL | P01 project profile plus P05 activity/milestone/assignment/proof-review workflows are complete locally; integrated provider/adversarial acceptance remains P07. |
| C3 | Centralized Beneficiary Profile | PARTIAL | P04 project-scoped profile/search/update/archive/enrollment, consent provenance, exact identity linking and registration promotion are complete locally; integrated provider/adversarial acceptance remains P07. |
| C4 | Beneficiary Journey Tracking | PARTIAL | P05 project journey configuration, participation, enrollment transitions, immutable snapshots/corrections and scoped history are complete locally; integrated provider/adversarial acceptance remains P07. |
| C5 | Digital Data Collection and Preparation | PARTIAL | P02 generic form metadata/entry plus P04 registration and P05 participation handlers are complete locally; integrated provider/adversarial acceptance remains P07. |
| C6 | Metadata-Driven Data Integration | PARTIAL | P03 ingestion/generic promotion plus P04 registration and P05 participation promotion cover all current destinations locally; managed-provider/adversarial acceptance remains P07. |
| C7 | Project Indicator and Monitoring | PARTIAL | Indicator schema/UI surface exists; P06 service/calculations/persistence absent. |
| C8 | Aggregated Monitoring Dashboard with SADDD Analysis | PARTIAL | Chart/UI components exist; P06 database aggregates/privacy contract absent. |

## Human decisions and prerequisites

No unresolved item below asserts a technical failure. Fill only from actual evidence; decide at the first phase that needs it.

| ID | Item | Needed by | Status / required evidence |
|---|---|---|---|
| G1 | Completed DB/Auth handoff, single ledger/routing and isolated test target | P00/P01 | SATISFIED for P01 start on 2026-09-13: fixed read-only PATHWAYS-dev probe found one `public` ledger, completed matching 0001–0006, 39 `pathways` tables, PostgreSQL 17.6, safe runtime/liveness; isolated PostgreSQL 18.6 replay target is documented. Do not repeat old recovery. |
| G2 | Any unspecified form-approval separation, linking or portfolio-access rule | Affected phase | P02 form publication resolved from approved policy: M&E-only publication is an approval and author/publisher must differ. Other future ambiguities remain phase-local; no blanket permissions. |
| G3 | Safe parser/format/resource policy and private Storage test capability | P03 | SATISFIED locally 2026-09-13: CSV/XLSX/XLS retained with the §7.4 bounded engineering defaults, hostile-file rejection and mocked private-provider recovery tests. Managed Storage write/read evidence remains G6/P07 rather than being inferred from mocks. |
| G4 | SADDD age reference/bands and privacy/small-cohort policy | P06 | PARTIAL 2026-09-13: developer confirmed `SMALL_CELL_THRESHOLD=5` (counts 1–4 suppressed) and `COMPLEMENTARY_SUPPRESSION=YES`. Proposed bands `10–14`, `15–17`, `18–24`, `25+` omit ages 0–9. `AGE_REFERENCE=by project and location` is not a calculable reference date; project/location remain scope/filter dimensions. Missing birth dates may map to `Unknown`, but invalid dates remain rejected/data-quality errors under the existing validation contract. Confirm the corrected age-reference, exhaustive bands and missing-versus-invalid treatment before P06. A threshold is a disclosure-control rule, not an anonymity guarantee. |
| G5 | Any managed-dev mutation required for feature integration | Before operation | Exact target/operations, approval and verification needed |
| G6 | Genuine Auth/Storage integration evidence and developer acceptance | P07 | Required for all-eight-core completion; mocks alone insufficient |
| G7 | Runtime RLS mode source conflict | Before P01 | SATISFIED 2026-09-13: developer supplied `CONFIRM PATHWAYS_RUNTIME_NOBYPASSRLS; AUTHORIZE CORE P01`. `pathways_runtime NOBYPASSRLS`, RLS and mandatory backend scope predicates are authoritative. No managed database role/grant write occurred. |

## Excluded from this TODO

Deployment, SSO, AWS/infrastructure, production migration, repeated MySQL conversion, and the supporting rule/recommendation/reporting/publication/full-finance/formal-evaluation workstreams. Do not silently add these as prerequisites.

## Current next action

P05 is complete locally. P06 has not started. G4 now fixes threshold 5 and complementary suppression, but remains blocked on a deterministic age reference, coverage of ages 0–9 and missing-versus-invalid birth-date handling; this does not reopen P05. Hard stop: do not begin indicator/dashboard work or perform managed-service writes. After G4 is fully recorded, the next phase still requires the developer’s explicit `AUTHORIZE CORE P06`. Managed deployment of migrations 0007–0012 remains separately gated under G5 and is not implied by phase authorization.
