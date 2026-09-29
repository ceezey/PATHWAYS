# QA & Test Plan (QAD)

## 1. Strategy

Every implemented feature requires:

- happy path;
- sad/error path;
- abuse/hostile path;
- authorization/isolation;
- data-integrity checks;
- accessibility where applicable.

A successful build alone is not completion evidence.

Use the [SAD review gates](sad-pathways.md) alongside feature tests. Proposed changes require concurrent matching specialist/design reviews before implementation; final content requires renewed review and external evidence validation. Automated check success does not imply semantic approval.

## 2. Test Data

Use synthetic/anonymized:
- organizations;
- projects;
- Beneficiaries;
- Auth identities;
- uploads;
- evidence/media.

Do not use confidential live Beneficiary data.

## 3. Core Matrix

### Happy

| ID | Feature | Scenario |
|---|---|---|
| QAD-T01 | PRD-F1 | active user resolves trusted org/role/permission/project scope |
| QAD-T02 | PRD-F2 | authorized project/activity workflow persists |
| QAD-T03 | PRD-F3 | authorized Beneficiary create/search in scope |
| QAD-T04 | PRD-F4 | journey/participation history persists chronologically |
| QAD-T05 | PRD-F5 | valid form/direct entry persists validated data |
| QAD-T06 | PRD-F6 | mapped import validates and normalizes |
| QAD-T07 | PRD-F7 | indicator shows correct trusted metric/target/source |
| QAD-T08 | PRD-F8 | dashboard/SADDD uses trusted data and suppression |
| QAD-T12 | PRD-F9 | descriptive summary uses trusted persisted metrics; a readable but empty set shows "None yet"; missing, withheld or unauthorized data keeps the existing unavailable or restricted wording; no value is ever fabricated as 0 |
| QAD-T14 | PRD-F9 | survey view pairs the latest PRE_TEST/POST_TEST per enrollment and reports the correct mean pre/post/change and improved/same/declined split for a group of 5 or more pairs |
| QAD-T15 | PRD-F9 | timeline view's elapsed/remaining/overdue/activity metrics match the reused rule-metric population math, and milestone on-time percent matches completed milestones rated on time |
| QAD-T16 | PRD-F9 | each descriptive view request writes one `ANALYTICS_DESCRIPTIVE_VIEWED` audit row, and each export writes one `ANALYTICS_DESCRIPTIVE_EXPORTED` row with contract version, view and row count |
| QAD-T17 | PRD-F9 | survey pairing tie-break (assessment date, then row id) is deterministic across a same-date repeat and independent of the source array's order; `byActivity` is sorted by activity id; a non-finite score/maximum is excluded and counted, never treated as a valid measurement |
| QAD-T18 | PRD-F9 | web survey table maps a `byActivity` group's activity id to its persisted activity title (never a raw UUID), with a neutral fallback when the activity cannot be found; percent-valued cells (survey mean pre/post/change, timeline elapsed/activity-completion/milestone-on-time) render with a `%` unit via the shared Overview label helper |
| QAD-T09 | PRD-F10 | rule triggers once with versioned evidence |
| QAD-T10 | PRD-F11 | authorized human reviews predefined recommendation |
| QAD-T13 | PRD-F12 | report/visualization output respects role scope and SADDD suppression |
| QAD-T11 | PRD-F13 | public surface exposes only approved data/media |

### Sad

| ID | Scenario |
|---|---|
| QAD-T20 | suspended/deactivated/archived account denied |
| QAD-T21 | invalid import remains staged/error |
| QAD-T22 | missing required mapping blocks normalization |
| QAD-T23 | invalid/missing metric denominator does not produce misleading percentage |
| QAD-T24 | unavailable rule metric -> explicit unavailable/not-evaluated |
| QAD-T25 | disallowed upload rejected |
| QAD-T26 | export/report failure leaves source data intact |
| QAD-T27 | survey view with 0 paired assessments in a group reports `MISSING` (`NO_PAIRED_ASSESSMENTS`), never 0 |
| QAD-T28 | survey view with 1, 4, or 5 paired assessments in a group: 1 and 4 are fully suppressed (`SMALL_CELL`), 5 is released; improved/same/declined never reveal a sub-count the pair total suppressed |
| QAD-T29 | timeline view with no completed, rated milestones reports `MISSING` (`NO_COMPLETED_MILESTONES`), never 0 |
| QAD-T30 | descriptive analytics retrieval fault (provider/database) returns 503, never a 500 or a silently empty payload, for both the read and the export path (one shared fault-mapping helper) |
| QAD-T31 | roles holding `assessments.detail.read` (Project Manager, Monitoring and Evaluation Officer) receive real survey aggregates on read and export from `pathways.p10_f9_survey_aggregate`; Program Manager and Grant Manager (no `assessments.detail.read`) do not (see QAD-T34); Project Officer, cross-organization and out-of-scope projects are denied (`42501`/403); pairing, same-date tie-break, invalid scores and the no-activity group match the calculator; the output holds no enrollment or assessment identifier (`f9-descriptive-aggregates-runtime.sql`) |
| QAD-T32 | Program Manager and Grant Manager (no `activities.read`) receive real timeline activity and milestone counts on read and export from `pathways.p10_f9_timeline_aggregate`, never `NO_ACTIVITIES` caused by a permission restriction; cancelled and archived activities are excluded, the reporting-date boundary is not overdue, and milestone counts match the on-time calculation; a statement timeout is 503, never an empty view |
| QAD-T33 | survey results are released only for an exact, non-overlapping defined reporting period: a custom range, an adjacent-day range, a missing period and a defined period overlapping another defined period are refused (`22023` in `f9-descriptive-aggregates-runtime.sql` for a role holding `assessments.detail.read`, 400 with no audit row on read and export in the API tests for Project Manager and Monitoring and Evaluation Officer); an exact defined period, including two adjacent non-overlapping ones, is released |
| QAD-T34 | survey improvement is restricted for Program Manager and Grant Manager (no `assessments.detail.read`): the survey function raises `42501` for them (`f9-descriptive-aggregates-runtime.sql`), the API answers read and export with 403 before any query and writes no audit row, the web disables the survey option, shows "Survey improvement is restricted for your role." (never "None yet", no Retry) and issues no survey fetch; the timeline view stays real for both roles; Project Manager and Monitoring and Evaluation Officer still receive the survey |
| QAD-T35 | a 400 from the survey fetch (refused or overlapping period) shows "This reporting period cannot be used for survey results." with no Retry; a network or 5xx failure keeps Retry; the survey period picker hides periods that overlap another defined period |

PRD-F6 mapping suggestions additionally cover stable source keys, ASCII whitespace/hyphen folding, fullwidth NFKC, preserved accented-case distinctions, non-ASCII whitespace, punctuation and blank names. Competing code/label candidates and an ambiguous source sharing another source's sole target must remain unresolved. Suggested mappings retain existing reviewer confirmation and server validation; no new authority is inferred.

### Abuse

| ID | Scenario |
|---|---|
| QAD-A01 | Org A guesses Org B project -> denied |
| QAD-A02 | unassigned project direct API -> denied |
| QAD-A03 | Program Manager requests Beneficiary detail -> denied |
| QAD-A04 | Grant Manager requests Beneficiary detail -> denied |
| QAD-A05 | forged org/role/actor fields -> ignored/rejected |
| QAD-A06 | role/assignment privilege escalation -> denied |
| QAD-A07 | spreadsheet formula/macro does not execute |
| QAD-A08 | rule attempts raw SQL/code -> rejected |
| QAD-A09 | public route requests private media -> denied |
| QAD-A10 | SADDD suppressed cells cannot be trivially reconstructed |
| QAD-A11 | Beneficiary detail request with stale, missing or future-dated TOTP `amr` and no live PIN grant for the same user, organization and verified session -> 403 `STEP_UP_REQUIRED`, handler not run, denial audited; a grant from another session, user or organization, an expired grant or an ended session is rejected |
| QAD-A12 | client-supplied step-up flag/header/storage, grant or session value, or a client-only MFA success does not open Beneficiary detail; the server status must report fresh |
| QAD-A13 | PIN brute force: 5 failures lock the PIN, parallel wrong attempts cannot exceed the bound, a locked PIN is not compared, only a TOTP newer than the lock unlocks it, and PIN requests are throttled |
| QAD-A14 | PIN setup without a fresh signed TOTP or when a PIN exists, and change without the current PIN or a fresh TOTP -> denied; the PIN never appears in URLs, logs, audit rows or error bodies |
| QAD-A15 | Project Officer requests the survey or timeline descriptive view -> denied (`analytics.descriptive.read` not granted) |
| QAD-A16 | Org A guesses Org B project id, or an unassigned/out-of-scope project id, on the survey or timeline descriptive view -> denied before any query runs |
| QAD-A17 | survey and timeline responses, and their CSV exports, carry no Beneficiary identity field; only enrollment and activity ids are used internally for pairing and are never returned |
| QAD-A18 | a caller holding `analytics.descriptive.read`/`analytics.export` but not `monitoring.read` is denied (403) on the survey and timeline views, for both read and export, before any `findMany` or `auditLog.create` runs |
| QAD-A19 | no suppressed pair count or improved/same/declined sub-count can be recovered by subtraction: the whole `byActivity` breakdown (JSON and CSV, from one computed result) is withheld as suppressed whenever any activity group's pairs or sub-counts are suppressed, the no-activity residual (overall minus the groups, at pair and sub-count level) has 1-4 in any cell, or the overall's own sub-counts are suppressed; the act-A/act-B example, residual with a 1-4 sub-count, and input-order permutation are tested |
| QAD-A20 | adjacent-period differencing: a role that can read the survey (holds `assessments.detail.read`) requests two adjacent or nested custom survey ranges to subtract one person's scores -> each request is refused (400, `22023`); no survey aggregate is released for a range that is not exactly one non-overlapping defined reporting period |
| QAD-A21 | open-period re-query differencing: an aggregate-only role (Program Manager, Grant Manager, or any role without `assessments.detail.read`) repeats survey reads or exports of an open period to subtract successive releases -> every attempt is refused (403 in the API before any query, `42501` from `pathways.p10_f9_survey_aggregate`) and no survey value, empty result or audit row is produced |

## 4. Rule-Engine Matrix

PRD-F10/PRD-F11 have a local human rules API and a disabled-by-default machine drain/sweep runtime (migration 0031). Hosted installation remains pending. Indicator metrics additionally require a current non-sensitive eligibility approval, which has no administration path yet.

- `< <= = >= >` (Prisma `RuleOperator`: LT, LTE, EQ, GTE, GT);
- BETWEEN;
- ALL/ANY;
- equality boundaries;
- missing metrics;
- duplicate/idempotent evaluation;
- cooldown;
- re-trigger;
- auto-resolution;
- project isolation;
- rule-version snapshots;
- human outcome permission.

## 5. Automated vs Manual

PRD-F1/F2 private pending-proof inspection follows [its approved Change Record](cr-pathways-private-activity-proof-inspection.md): test all roles and individual grants, self/cross-scope/revoked access, pending states and revisions, mixed lineage/incomplete uploads, private bucket and redirect, counted size/digest/deadline/disconnect, revocation or review during storage, failing audit with zero body release, safe headers/no cache, old URL/HEAD/range denial and keyboard-accessible review controls. Synthetic identifying proofs with unchanged false-consent defaults are eligible only for this approved pending-verification purpose, never publication. These are required scenarios, not executed evidence.

PRD-F2 activity proof direct upload follows [its approved Change Record](cr-pathways-activity-progress-media.md) at its reduced scope (section 9): reserve/upload/finalize happy path for each accepted type (PDF, JPEG, PNG, WebP, MP4, MOV, WebM); a spoofed type, a size mismatch, a digest mismatch, an eleventh file, an over-limit file, and a reused upload token, all rejected; an identical retry with the same client update id succeeds and a changed one conflicts; a non-assigned Project Officer or M&E reviewer denied, and cross-project/cross-organization reservation and finalize denied; additive multi-file client selection, per-file remove, one file failing then recovering through its own retry, and a server rejection surfaced as error text; the widened inspection bounds (ten proofs, `EVIDENCE_MAX_FILE_BYTES`) with a large verified video; the 0041 SQL suite for the new bounds, the unchanged prior rejections and the rest of the function definition unchanged; and the Submit-proof dialog's accessibility (persistent live region, predictable focus after add/remove/submit, Escape and Close, no half-filled-form Enter submit, 44px targets). These are required scenarios, not executed evidence.

PRD-F2 proof session beneficiary count follows [its approved Change Record](cr-pathways-proof-session-beneficiary-count.md), including its final 2026-09-29 developer decision (CR section 3.1): an omitted value reserves with a null stored count; a valid whole number 0-100000 persists and is returned unchanged on the activity's update history; negative, fractional and over-100000 values are rejected at the DTO boundary before any read; a retry with the same `clientUpdateId` but a changed count conflicts the same way a changed note or progress percent does; a cross-project reservation attempt carrying a count is still denied before any read. The activity's computed `beneficiariesReached` sums only APPROVED updates' `beneficiaries_reached_this_session` (NULL as 0); PENDING, VERIFIED and REJECTED updates never contribute; an approved proof later rejected lowers the total; an activity with no updates reports zero, never null; cross-project and cross-organization isolation hold for the aggregate function; and the project overview's SADDD-sourced "beneficiaries reached" tile and the rules engine's typed metric catalog are both confirmed unaffected (neither reads `p08_activity_beneficiaries_reached`). SADDD sex/age breakdowns are unaffected, since they stay sourced from participation records and this typed count carries no breakdown. These are required scenarios, not executed evidence.

PRD-F2 activity overdue explanation follows [its approved Change Record](cr-pathways-activity-overdue-explanation.md): happy path (a project-assigned M&E officer with no personal activity assignment records a valid category/explanation on a currently overdue activity, gets an audit row and appears on the activity detail's `overdueExplanations`, newest first, with actor name and recorded time); `409` when the activity is not currently overdue; an unrecognized category and an explanation shorter than 10 or longer than 2000 characters rejected at the DTO boundary; a retry with the same `clientMutationId` and identical input returns the same row without a second write, and a changed retry conflicts; denied without `monitoring.review`; an unassigned M&E officer (no project assignment) denied via the uniform project-scope 404, matching every other project-scoped read/write, not a personal-assignment 403; `SYSTEM_ADMINISTRATOR`/`PROGRAM_MANAGER`/`GRANT_MANAGER` scope matches the RBAC policy (org-wide, managed-program, and project-assignment respectively); cross-project and cross-organization requests denied before any read, following the existing convention; and `overdueExplanationNeeded` true while overdue with no qualifying explanation, then false immediately after one is recorded, in both the activity detail and the activity list. Web: the "Overdue: explanation needed" badge shows/hides with the server flag in both the list and the detail; the "Explain delay" button is gated by `capabilities.canExplainOverdue` and the activity's overdue status; the dialog rejects a missing category, an explanation under 10 or over 2000 characters, and does not submit on Enter inside the textarea; a retry after an indeterminate failure reuses the same `clientMutationId`, a definitive rejection (400/403/409) draws a fresh one; 403/409 messages are shown as text; the "Overdue explanations" history renders newest first and shows "None yet" only once the activity has been overdue with no entries; the web client's parser rejects a malformed `overdueExplanations` entry (bad category, out-of-bounds length, missing field, unknown key). These are required scenarios, not executed evidence.

Use current repo commands after reconciliation.

Automate:
- unit;
- integration/API;
- DB constraints/replay;
- frontend components;
- E2E critical workflows;
- type/lint/static checks.

Manual:
- UX clarity;
- accessibility;
- charts/reports;
- import error usability;
- public privacy review;
- defense/UAT flow.

## 6. Bug Priority

P0:
- data loss/corruption;
- cross-org leak;
- private Beneficiary/public exposure;
- auth bypass;
- destructive migration error.

P1:
- monitoring/SADDD incorrect;
- silent import corruption;
- rule mis-evaluation;
- privileged workflow error.

## 7. Definition of Done

- acceptance criteria implemented;
- relevant tests executed;
- no unresolved in-scope P0/P1;
- docs reflect durable behavior;
- any durable documentation changes are reconciled;
- phase report in chat;
- next phase explicitly authorized.

## 8. AI / OCR

No runtime AI/OCR test program is currently required unless a future approved feature introduces it.

## Self-Check

- [x] core features traced
- [x] abuse/isolation present
- [x] rule/import/SADDD privacy covered
- [x] no unverified performance numbers invented

## 8. CSV RBAC Realignment (PRD-F1)

The approved [auth contract](rfc-pathways-auth-rbac-isolation.md) supplies the matrix. Verify with `pnpm --filter @pathways/api exec vitest run`, the web regression suite, and `infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline` on disposable PostgreSQL.

| ID | Required check |
|---|---|
| QAD-R01 | Exact API/frontend/SQL grants and role ceilings across all six roles; detailed rows override overview conflicts |
| QAD-R02 | All roles scoped project detail; restricted tabs excluded; Admin beneficiary/assessment/enrollment denied; activity context excludes detail |
| QAD-R03 | Admin all six roles, Program PM/M&E, PM PO/M&E; only Admin assigns Grant; cross-scope targets denied |
| QAD-R04 | Managed-program and explicit-assignment scope; forged actor/organization/project denied |
| QAD-R05 | Revoked grants, inactive permission/role, suspended/deactivated account, and ended assignments deny the next operation/request |
| QAD-R06 | Program/Grant raw beneficiary and assessment denial with populated synthetic rows; SADDD protections unchanged |
| QAD-R07 | Archived replay, fresh baseline, preserved-ledger registration/0027/0028 upgrade, subsequent Prisma migration creation/application, datamodel/security/privilege parity; actual SADDD entrypoints for all six roles, PO monitoring denial and cross-organization aggregate denial |
| QAD-R08 | Native PM creation preserves target beneficiaries, automatic self-assignment and audit recording; approved target-goal retirement requires goal-free create/update, legacy input rejection, historical-value preservation, output/draft omission and independent indicator progress checks (implementation/verification pending) |
| QAD-R09 | Read-only remote ledger/checksum/security inspection and protected backup restore before application; stop unexpected drift |

Permission grants for missing handlers are contract checks, not feature acceptance. Synthetic behavior stays local. No destructive or live-data behavioral tests are part of this phase.

Additional PRD-F1 checks cover blank definitions versus responses, collected-data versus template imports, journey freeze/privacy, PO alert/SADDD versus monitoring denials, escalation boundaries, archive integrity, and Prisma 6.19.2 compatibility without resets.

## 9. SAD Tooling and Disposable CI Replay

Run `pnpm sad:test`, `pnpm sad:typecheck`, and `pnpm sad:check`; use `--base REV --head REV` for a committed range. Store `--output` manifests and review evidence outside tracked repository files. Final engineering sign-off requires `pnpm sad:signoff -- --reviews <external-json-path>` against the current digest, covering each required role/path pair and its ISO pillars.

| Required regression | Expected result |
|---|---|
| Trigger routing, renames, deletions, Windows paths | All applicable roles match either renamed path; deterministic normalized ordering |
| Executable code versus comments/strings | AST flags executable `eval`/dynamic `Function`; descriptive text alone is not a violation |
| Unsafe raw queries and destructive SQL | Review flags require semantic evidence, including parameterization/preservation where applicable |
| Dependency additions and preserved migration edits | Dependency warnings require justification; immutable-history changes block |
| Missing/stale/malformed/BLOCKED evidence | Final sign-off fails; complete digest-matching PASS evidence succeeds |
| Disposable PostgreSQL 18 replay | Archived history, fresh baseline provisioning, preserved-ledger registration/upgrade, and forward corrections preserve expected data/security/catalog behavior |

CI publishes automated diagnostics without claiming full SAD approval. The Linux replay uses verified archive extraction, existing SQL fixtures and catalog validators, and documented checksum exceptions. Local execution limitations must be reported; an unexecuted CI job is not verified evidence. Hosted databases and confidential data are excluded.

## Core P1 acceptance coverage

For [core P1 supporting operations](cr-pathways-core-p1-supporting-operations.md), verify all-role and individual-grant denial, cross-organization/project scope, revocation on retry, bounded latest published-definition reads, strict allowlists, empty-versus-failed context, sparse individual definitions, age-only error focus, minor/guardian consistency and custom required fields. Verify all candidate collisions, stable source keys, incomplete mappings, immutable revision/audit parity, changed/stale retries and unchanged reviewer/processor authority. Corrected supporting SQL also requires all submission kinds, raw-policy compatibility, definition/archive lock waits, concurrency, fresh/upgrade/recovery and preserved ledger/catalog checks. A mapping-only run or static/unit PASS does not establish complete migration or feature acceptance. Authenticated UI, physical cancellation and preview checks remain separate executable requirements.

## Import throughput, PDF and form export (PRD-F5/F6)

Coverage for the [import throughput and PDF](cr-pathways-import-throughput-and-pdf.md) contract.

| ID | Kind | Scenario |
|---|---|---|
| QAD-IMP-01 | Happy | a claim promotes in chunks of at most 25 rows, reads its form context once and audits every row |
| QAD-IMP-02 | Happy | a 5,000-row batch finishes through repeated process calls with visible progress and no clicks |
| QAD-IMP-03 | Happy | a text-layer PDF table imports as `column_NNNN` rows identical in shape to a spreadsheet |
| QAD-IMP-04 | Happy | each form-definition export format downloads and writes one audit row without field content |
| QAD-IMP-05 | Sad | a failed chunk rolls back and reruns row by row; only the failing row is released and retried to the attempt limit |
| QAD-IMP-06 | Sad | a retry after a partial chunk reuses the existing submission instead of creating a second one |
| QAD-IMP-07 | Sad | a scanned, encrypted, table-less, over-page or oversized PDF fails with its stable code and message |
| QAD-IMP-08 | Sad | a failed or stopped processing run keeps server state and offers Resume processing |
| QAD-IMP-09 | Sad | a form definition beyond the artifact bounds fails whole and is never truncated |
| QAD-IMP-10 | Abuse | revoked permission or removed project assignment stops promotion at the next chunk |
| QAD-IMP-11 | Abuse | cross-organization and cross-project process and export requests are denied before rows or forms are read |
| QAD-IMP-12 | Abuse | a PDF carrying scripts, attachments, forms or links is read for text only; formula-like cells are rejected |
| QAD-IMP-13 | Abuse | Project Officer, Project Manager, Program Manager and Grant Manager cannot export form definitions |

### Smart import mapping (PRD-F6)

Coverage for the [smart import mapping](cr-pathways-smart-import-mapping.md) contract.

| ID | Kind | Scenario |
|---|---|---|
| QAD-SM-01 | Happy | exact, synonym, token-set, token-overlap and edit-distance names score their tiers; the same input always gives the same decisions, in any input order |
| QAD-SM-02 | Happy | a high-confidence column with compatible sampled values is auto-mapped and shows "Auto-matched" with its reason |
| QAD-SM-03 | Happy | an M&E Officer confirms one suggestion or all suggestions; the confirmation is a new manual revision attributed to the reviewer |
| QAD-SM-04 | Happy | the web preview and the API produce the same decisions from the shared matcher |
| QAD-SM-05 | Sad | "Gender" is never auto-mapped to `sex`; it stays PENDING with a suggestion |
| QAD-SM-06 | Sad | a tie, a small margin, a failed value gate or no samples leaves the column PENDING with at most one suggestion; no field is mapped twice |
| QAD-SM-07 | Sad | an identical retry returns the same receipt; a changed recomputation, a V1 revision or a stale or frozen batch conflicts |
| QAD-SM-08 | Abuse | the recorder rejects unknown algorithm IDs, extra keys, out-of-range or fractional scores, unknown reasons, duplicate targets, and foreign-form, cross-project or cross-organization fields |
| QAD-SM-09 | Abuse | sampled cell values never appear in mapping rows, audit rows, logs or the receipt |
| QAD-SM-10 | Abuse | cross-organization, cross-project, other-uploader, forged-subject and revoked-upload calls are denied before any write |
| QAD-SM-11 | Abuse | a Project Officer sees suggestions read-only and cannot confirm them; the mapping route denies without `imports.review` |

## Default registration form and minimum age (PRD-F3)

Covers the [default registration form Change Record](cr-pathways-default-registration-form.md). SQL checks run in `default-registration-form-runtime.sql` with the prisma owner-role memberships revoked, and `default-registration-form-concurrency.mjs`.

| ID | Kind | Scenario |
|---|---|---|
| QAD-DRF-01 | Happy | a Project Officer, M&E Officer or Project Manager on a project with no published registration form provisions one system form with exactly the canonical field set; a second call returns the same form |
| QAD-DRF-02 | Happy | registration through the system form writes the same profile, enrollment, submission, response and consent rows as a project form |
| QAD-DRF-03 | Happy | a project with its own published registration form is offered that form, not the system form |
| QAD-DRF-04 | Happy | age 5 at the enrollment date is accepted; the web derives a read-only age from the birth date and caps the birth date at the business date |
| QAD-DRF-05 | Sad | age 4, a supplied age below 5 and a future birth date are rejected on create, import and changed-profile edit with "Beneficiary must be at least 5 years old." or "Date of birth cannot be in the future." |
| QAD-DRF-06 | Sad | an edit of an existing under-5 record that keeps its birth date and age is accepted |
| QAD-DRF-07 | Sad | an archived system form is not recreated and the web shows an unavailable state without retrying |
| QAD-DRF-08 | Abuse | parallel first calls create exactly one system form, one field set and one audit row |
| QAD-DRF-09 | Abuse | System Administrator, Program Manager, Grant Manager, an unassigned registrar, a foreign-organization caller and a forged or mismatched context are denied before any write |
| QAD-DRF-10 | Abuse | the runtime role and a superuser cannot tag a form; a normal form with the same author and publisher, or with no author, is still rejected even for the owner; the published system form, its tag and its fields are immutable |

## 10. Project data loading and read cache

Covers step 2 of the [performance and scaling Change Record](cr-pathways-performance-scaling.md) and the project workspace reads in the SDD.

| ID | Type | Required check |
|---|---|---|
| QAD-P01 | Happy | List and summary reads are reused for at most 30 seconds under the same organization, user, role, permissions, assignments and project; the Activities tab reuses the Overview project read |
| QAD-P02 | Happy | Activity list returns the lean projection; the detail route reads `GET /activities/:id`; indicators and journey stages load once per workspace and indicator search works without opening a panel |
| QAD-P03 | Happy | Overview metrics derive KPI achievement, budget utilization, suppressed reach and timeline deterministically with documented rounding |
| QAD-P04 | Sad | Readable but empty sources show "None yet" or their specific reason, never 0; an activity logged budget shows "None yet" only for an expense reader with no approved expenses and "Unavailable" when withheld; load failures and permission states keep error wording; an unknown activity id shows a not-found state without redirecting |
| QAD-P05 | Sad | A replayed indicator save or recovery displays its confirming authorized read without a second reload |
| QAD-P06 | Abuse | Beneficiary, step-up and import batch-status reads are never cached, even when a caller requests the summary window |
| QAD-P07 | Abuse | Sign-out, workspace change or any 401/403 clears or hides cached reads; each mounted reader re-verifies at most once per denial and ends in data, pending or an error with retry; a persistent 401/403 does not loop, including when its reader remounts under a re-verifying parent; an explicit retry requests exactly once; one denial raises the epoch once; pre-denial data never reaches `replaceData`; a committed write re-reads active reads and removes inactive ones so pre-write data never reappears |
| QAD-P08 | Abuse | Overview metrics deny cross-organization, unassigned and malformed project ids before any metric read; budget is `null` without budget read; reach counts 1-4 are suppressed and no Beneficiary rows are read |
| QAD-P09 | Abuse | Activity update, transition and progress still deny an out-of-scope project or activity before any write after the duplicate reads are removed |

## 11. Project RBAC UI alignment and structured partners

Covers the [project RBAC UI alignment and structured partners Change Record](cr-pathways-project-rbac-ui-and-partners.md).

| ID | Type | Required check |
|---|---|---|
| QAD-RBP-01 | Happy | Each of the six roles sees only the activity/indicator/tab actions its own API permissions and project scope allow; a Project Officer sees Create Activity and Record progress/Submit proof only when personally assigned |
| QAD-RBP-02 | Happy | The activity dialog's officer list comes from the assignable-officer read and lists only active Project Officers with an active assignment to that project, ordered by display name then ID and bounded to 50 rows |
| QAD-RBP-03 | Happy | A locked activity budget, indicator link or project profile field shows its current value, stays disabled, and exposes the tooltip "You are not authorized to change this field" on hover and keyboard focus through `aria-describedby` |
| QAD-RBP-04 | Happy | The project form shows a single "Implementing partners" structured field; the detail view shows only structured partners |
| QAD-RBP-05 | Sad | A forged capability flag or a hidden UI action still returns 403 from the API when called directly |
| QAD-RBP-06 | Sad | A write carrying `implementingPartners` is rejected with 400 |
| QAD-RBP-07 | Sad | `LockedField` never submits a value for the field it locks, even if the disabled control is force-submitted |
| QAD-RBP-08 | Abuse | The assignable-officer read denies Admin, M&E Officer, Program Manager and Grant Manager (neither holds `activities.create` nor `activities.update`), denies an unassigned project, denies cross-organization access, and returns the uniform 404 for an inaccessible project |
| QAD-RBP-09 | Abuse | The assignable-officer read never returns email, contact number, auth identifiers, role list, account status, other-project data or assignment dates, and excludes archived or ended users |
| QAD-RBP-10 | Abuse | Migration 0039 splits legacy text on newline, `;` and `,`, de-duplicates by `lower(btrim(name))`, skips (never truncates) pieces outside 1-120 characters, skips a whole project that would exceed 20 linked partners, never removes an existing structured link, writes exactly one `PROJECT_PARTNERS_BACKFILLED` audit row per changed project, and is a no-op on a second run |
