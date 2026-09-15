# PATHWAYS — Core Features Source of Truth

**Workstream:** Core backend, database, and existing-interface integration.  
**Status:** Requirements and execution contract; P05 project/activity and Beneficiary-journey workflows verified locally 2026-09-13.  
**Canonical location in this checkout:** `docs/Source of Truth.md`  
**Progress:** `docs/TODO.md`

The previously stated `docs/core-features/` location is not present in this checkout. The developer-supplied files under `docs/` are the maintained controls; do not create competing copies merely to satisfy the older location label.

## 1. Scope and source authority

**[U — latest user direction]** The MySQL-to-PostgreSQL/Supabase work and developer Auth/access are reported complete. Reuse them. Confirm the current handoff once; do not restart the conversion, re-baseline Prisma, recreate developer accounts, or assume the historical missing-ledger incident is still active.

Implement the **eight core features in Master Context Pack §5.1**, with metadata first after the minimum authorization/project foundation. Deployment, SSO, AWS hosting, infrastructure provisioning, and production cutover are excluded.

Source labels used here:

| Label | Basis | Authority |
|---|---|---|
| U | Latest request and explicit developer approvals | Scope and approved changes |
| M | `PATHWAYS_Master_Context_Pack_v4.0_FINAL*.docx`, especially §§5.1, 7, 9, 15, 20.3–20.4 | Product requirements and six-role boundaries |
| H | `HUMAN GATES for Codex.txt` and later confirmed identity/permission decisions | Previously approved architecture and governance |
| R | Actual current repository, migrations, tests and authorized environment inspection | What is implemented, not permission to weaken U/M/H |
| I | Engineering requirements proposed in this package | Implementation safeguards, not invented manuscript claims |

Resolve scope/policy conflicts using **U → H → M → older manuscript**. Resolve implementation status using current R; old audit snapshots are historical. Record discrepancies explicitly. Read relevant manuscript use cases for detail, but do not reintroduce IT Staff, an Indicator Library, or outdated Auth ownership.

**Deferred, not removed from PATHWAYS:** rule-based alerts/recommendations, the full reporting/export suite, public tracker/publication, full finance/expense workflows, and formal project-evaluation/sign-off workflows. Core dashboard charts and private activity proof required for tracking remain in scope. Do not implement supporting modules merely because their tables or mock screens already exist.

## 2. Eight-feature contract

Feature IDs below are workstream labels, not replacements for manuscript requirement IDs.

| ID | Exact core feature | Acceptance phase(s) |
|---|---|---|
| C1 | Role-Based Access Control and Workspace Management | P01; regression through P07 |
| C2 | Project Profile and Activity Tracking | Minimum parent/project functions P01; complete P05 |
| C3 | Centralized Beneficiary Profile | P04 |
| C4 | Beneficiary Journey Tracking | P05 |
| C5 | Digital Data Collection and Preparation | P02; domain-entry integration P04–P05 |
| C6 | Metadata-Driven Data Integration | Pipeline P03; beneficiary/participation promotion P04–P05 |
| C7 | Project Indicator and Monitoring | P06 |
| C8 | Aggregated Monitoring Dashboard with SADDD Analysis | P06 |

**Dependency:** P00 → P01 → P02 → P03 → P04 → P05 → P06 → P07. Build functioning vertical slices: database + service + authorized API + necessary existing UI + tests. P03 is not all of C6 if domain-specific promotion is still pending.

## 3. Role and identity policy [M/H]

Supabase Auth owns credentials and verified identity. PATHWAYS owns organization, account state, canonical role, permissions and assignments. Keep the confirmed administrator and testing identities; do not embed their private IDs/emails in this workstream. Preserve the completed Auth integration and use its verified subject to load current application authorization.

| Role | Scope and Beneficiary access | Account/assignment authority |
|---|---|---|
| System Administrator | Authorized organization; organizational Beneficiary detail | Supported internal roles and relevant assignments within that organization |
| Program Manager | Approved program/portfolio scope; Beneficiary aggregates only | Project Manager and Monitoring and Evaluation Officer within authorized scope |
| Grant Manager | Approved grants/portfolio scope; Beneficiary aggregates only | None |
| Project Manager | Active assigned projects; Beneficiary detail within those projects | Project Officer and Monitoring and Evaluation Officer within authorized project scope |
| Monitoring and Evaluation Officer | One or multiple active assigned projects; scoped detail | None |
| Project Officer | Active assigned projects/activities; scoped detail | None |

One canonical role and one organization per internal application profile for v1; keep the unique Auth link. External stakeholders are not an internal role. Beneficiaries do not log in or self-register. Grant Manager is never an alias of Program Manager. A lead-manager column does not, by itself, grant project access.

**Approved operations:** Monitoring and Evaluation Officer publishes forms and validates imports. Preserve `SELF_APPROVAL_ALLOWED = NO` for human approval operations. Technical validation is not automatically an approval. Where the existing form-publish workflow doubles as approval, establish the author/reviewer separation before enabling it; do not invent an exception for a single developer account.

Previously approved public approver/publisher = Program Manager; expense verifier = Monitoring and Evaluation Officer; expense approver = Project Manager. Preserve these for later, but do not implement those supporting workflows now.

For other operations, use explicit current approved policy. Do not turn a broad UI capability into unrestricted writes. Unspecified sensitive permissions stay denied until a specific decision is obtained. Role/permission configuration shared across organizations must not become an ordinary tenant-admin write endpoint.

**Existing architecture direction [H]:** NestJS → Prisma → private PostgreSQL domain data; Supabase Auth and private Storage retain their current responsibilities. Data API remains disabled. Runtime and migration connections use the approved Session Pooler setup with distinct credentials. Preserve the established domain-schema and migration-ledger routing (previously `pathways` domain / `public._prisma_migrations` ledger); verify actual current configuration before a change. These are design locks, not a claim that this package has inspected the running services.

## 4. Shared security and reliability contract [I, implementing M/H]

### Authorization and API behavior

- Every protected request: verified Auth subject → active profile/organization → active canonical role/permissions → applicable active assignment. No development bypass, client role switch, email allowlist, or user-editable metadata may grant access.
- Put scope predicates into reads, mutations, relations, aggregates, pagination and downloads. Prevent guessed-ID access, nested relation leaks and mass assignment of organization, owner, approval, role or state fields.
- Keep aggregate and detail contracts separate. Never load raw Beneficiary data and redact it afterward for aggregate-only roles. Denials/errors must not reveal another tenant's existence, names or data.
- Validate server-side input, nested payloads and explicit conversions. Bound body size, pagination, filter complexity, request duration and expensive operations. Preserve secure session handling; apply CSRF protections when cookies authenticate state-changing requests, explicit CORS origins and appropriate headers. Do not store sensitive feature payloads/tokens in new browser-local persistence.
- Recheck relevant authorization/state during sensitive transactions and retries. Define/test revocation behavior for requests already in flight; after a completed revocation, the next protected request must fail. A foreign key alone does not prove an assignment is active.

### Persistence and migrations

- Reuse the completed PostgreSQL/Prisma model. Append only necessary migrations after the **actual latest migration**, never resurrect old `0002`–`0006` plans or overwrite applied files. Preserve one intended ledger and current verified routing; do not change the connection schema to repair a tool error.
- Preserve UUID/native types, calendar `date`, event `timestamptz`, scoped uniqueness and referential integrity. Core data belongs in the private domain schema already established. No destructive reset, silent backfill, cascade cleanup or migration-history repair is authorized here.
- Check raw constraints/indexes/RLS/grants separately from ORM diffs. Add explicit RLS/default-grant treatment with a new table; do not wait until a final security phase.
- Preserve the approved separated, non-owner runtime identity and migration identity. The authoritative runtime is `NOBYPASSRLS`, so RLS remains defense in depth; NestJS service queries must still apply organization/project predicates before returning data, and a policy must never excuse an omitted scope predicate. Runtime must not acquire schema CREATE, role/database administration, owner-role membership or blanket DELETE. Governed role mappings are read-only; audit rows are append-only to runtime.
- Keep multi-record writes and their mandatory audit event atomic. Use appropriate uniqueness, concurrency/version checks, short transactions and bounded retry. External Storage/Auth operations are not a PostgreSQL transaction: use recoverable state/compensation, not a promise of atomicity across providers.

### Metadata, imports and files

- Published form/field semantics are immutable; later changes make new versions. Pin mappings and validation to versions. Direct entry and import use the same server validation contract.
- Metadata is data, never executable SQL, JavaScript, spreadsheet formulas or arbitrary code. Allowlist target fields/operators. Guard unsafe property names and expensive validators. Preserve source text separately from normalized values.
- Treat uploads as hostile. Reuse supported CSV/XLSX/XLS parsing only with server-enforced format/resource limits, no formula/macro execution or network link fetching, and private object handling. Do not silently drop a supported format; report a concrete safe alternative if its parser cannot be secured.
- Upload keys are server-controlled and scoped; persist durable bucket/path metadata, never signed URLs. Reauthorize reads. Do not expose raw files/error rows to executive roles. No public bucket workaround. Do not send files to public scanning services; missing malware-scanning capability is a limitation, not a clean-file result.
- Separate raw staging from operational records. An invalid, unresolved or unsupported-domain row must not be marked processed. Pin validation revision, use scoped idempotency keys/uniqueness, and make retries/restarts/concurrent workers safe. Same key with different input is a conflict.

### Privacy, audit and testing

- Synthetic data only for development/testing. No real Beneficiary datasets in fixtures, screenshots, logs, public scanners or third-party AI prompts.
- Log trusted actor/scope/action/entity identifiers and safe change metadata, not raw forms, demographics, access tokens, passwords or full Storage URLs. Sanitize log input and test failure paths.
- Use the existing testing stack plus a real isolated PostgreSQL test target. Test under a runtime-equivalent role, not only a superuser. Include at least two organizations, multiple projects, six roles, unlinked/inactive users and a Beneficiary enrolled in two projects.
- Test successful and rejected requests, duplicate delivery, stale edits, concurrent actions, rollback and restart persistence. A mocked Auth/Storage adapter is useful for unit tests but is not proof of the real integration.
- Reuse installed/pinned packages. Review changed ingestion/auth dependencies for current advisories; do not run force-upgrades or add a queue/cloud service merely for architectural style.

## 5. Execution boundaries

Submitting a phase prompt authorizes **that phase's repository implementation and isolated test operations**, not the entire package. Before running package scripts, inspect whether they seed, migrate, generate or contact a shared database.

| Resource | Allowed by ordinary phase prompt | Needs a separate, scoped approval |
|---|---|---|
| Source/tests and these workstream records | Relevant edits, local builds/test generation | Unrelated refactors, conflicting existing changes |
| Dedicated local/test DB and local service fixtures | Migrations and synthetic writes; reset only an explicitly disposable test DB | Any valuable/local restore backup DB; an unidentified target |
| PATHWAYS-dev | Authorized read-only configuration/catalog checks; no raw personal data | Applying named migrations, role/grant changes, synthetic integration writes |
| Supabase Auth/Storage | Read current configuration where permitted; implement adapter code | Invitations, account mutation, uploads/removals or policy/bucket changes on managed project |
| Production, AWS, SSO, deployment | Nothing | Outside this workstream |

When managed-dev writes are necessary, stop before them and supply: verified project reference, precise operations/migration hashes, test identities/object prefix, data impact, relevant backup evidence, rollback/verification, and the exact approval reply. Prefer one bounded request per phase rather than repeated vague approvals. Successful local work can be reported separately; do not label managed integration verified without running it.

Keep secrets in existing private configuration; do not print them, put them in shell command text, or supply credential-bearing URLs as command arguments. Do not request credential uploads. Windows instructions must give the exact working directory, validated installed-tool syntax, secret prompt method, correct local/remote SSL treatment and expected exit code. Use SQL/filter files for mixed-case identifiers where needed. Never confuse the Supabase source, a disposable shadow database and a restore-rehearsal database.

Do not stage, commit, push, discard unrelated changes, recreate the environment, or edit deployment automation. Local test-script changes are in scope. A new business/privacy policy, destructive change, unavailable required capability, unexplained drift or unsafe dependency is a human gate, not a workaround invitation.

## 6. Phase protocol and definition of done

At start, read repository instructions, this file and TODO. Confirm predecessor readiness and the specific authorization. Give a short implementation plan, then implement; do not spend a whole execution phase rewriting the architecture.

At end, run the relevant tests and regressions, review the diff for security/scope mistakes, update TODO and the evidence/contract sections below. Mark `[x]` only for demonstrated acceptance criteria; leave partial/blocked work unchecked with a specific reason. Preserve previously completed evidence and reopen an item when a regression is demonstrated.

Read `PHASE_REPORT_TEMPLATE.md` **after completing the work** and use its headings for the final response **in chat only**. Never save a filled report, summary, status or phase-results Markdown file. Source/test fixtures and these two maintained workstream records are not phase reports.

A phase can be complete with no unnecessary new code when existing implementation passes its acceptance tests. “Ready for next phase” is not authorization to run it. Every response ends in a hard STOP. After a blocker is resolved, resume the same phase and revalidate its affected checks.

**All-eight-core completion requires:** real persisted UI/API workflows for C1–C8, shared validation, verified provider integration, passing security/reliability tests, no core mock fallback, and no unresolved core-blocking human gate. This is not production, privacy-law or security certification.

## 7. Current evidence register

| Evidence | Current value |
|---|---|
| Developer handoff | Conversion and developer Auth/access reported complete [U] |
| Repository root, branch, commit/dirty state | `C:\PATHWAYS`; `Backend-DB`; `f5c0748788a6ccbf4352e888b2dffd98148b1be2`; pre-P00 status was only untracked `docs/` (the three developer-supplied controls), with no tracked modifications or staged changes. |
| Authority sources located | Master pack: `C:\Users\Cian Jake Francisco\Documents\PUP\3RD YR 2ND SEM\CAPSTONE\AI USE\PATHWAYS_Master_Context_Pack_v4.0_FINAL.docx` (2026-08-29); approved decisions: `C:\Users\Cian Jake Francisco\Downloads\HUMAN GATES for Codex.txt` (2026-09-04); latest located manuscript: `C:\Users\Cian Jake Francisco\Downloads\pathways-html\pathways-html\UPDATE [Group 14] Capstone Manuscript rev 2026 (POST REVISION 0627).pdf` (2026-07-04). Master pack §§5.1, 7, 9, 15 and 20.3–20.4 confirm the eight features, six roles, UC009–UC015/UC017, Beneficiary privacy and aggregate-only executive boundaries. |
| Installed versions | Node `22.23.2`; pnpm `11.20.0`; Prisma/Client `6.19.2`; TypeScript `5.9.3`; Vitest `3.2.4`; PostgreSQL client `18.6`; active local PostgreSQL service/server binary `18.6`; PATHWAYS-dev `server_version_num=170006` (PostgreSQL 17.6). |
| Current model/route/migration inventory | Prisma has 42 models and 53 enums across `public` and `pathways`. Repository/local-replay append-only lineage is `0001_init` → `0002_pathways_foundation` → `0003_pathways_projects_collection` → `0004_pathways_finance_evaluation_decisions` → `0005_supabase_security_adapter` → `0006_auth_session_liveness` → `0007_core_workspace_foundation` → `0008_metadata_forms_direct_entry` → `0009_import_state_enums` → `0010_secure_import_pipeline` → `0011_beneficiary_registration` → `0012_project_activity_journeys`. PATHWAYS-dev remains read-only verified through 0006; no managed migration was authorized. P05 extends the existing project/activity/milestone, enrollment, form/submission/import, evidence and journey stores rather than creating parallel stores. |
| Ledger/routing/native types/runtime security evidence | 2026-09-13 fixed read-only `Read-DevSessionLiveness.ps1`: PATHWAYS-dev database `postgres`, PostgreSQL 17.6, exactly one ledger in `public`, all six hosted rows finished with repository-matching SHA-256 checksums, no other ledger, 39 `pathways` tables, 15 deliberately preserved legacy `public` tables, `pgcryptoPresent=true`, `runtimeSafe=true`, and valid 0006 liveness helper. The isolated PostgreSQL 18.6 replay applied repository migrations 0001–0012 and passed ledger, legacy-upgrade/preservation, cleanup, form/version pinning, import/registration/participation idempotency and atomicity, activity proof/review, journey snapshot/freeze, organization/project privacy, executive denial, RLS and security-object checks. Prisma maps UUID/date/timestamptz types explicitly. No repair or retirement is authorized. The developer explicitly confirmed the completed `NOBYPASSRLS` runtime as authoritative on 2026-09-13. |
| Local test target and provider-test strategy | The installed 5432 service is not disposable and passwordless catalog access is unavailable; do not use it by assumption. Use repository-owned loopback scratch clusters only. Current complete replay is `pathways_phase4_phase6_replay` on `127.0.0.1:55448` via `infra/supabase/phase6/Replay-Local.ps1`; other harnesses have their own fixed ports/names and ownership guards. `SHADOW_DATABASE_URL` is currently unset and must point only to a separately created disposable local database when a Prisma shadow operation actually needs it. Unit tests mock Auth/Storage; real Auth uses verified Supabase identity/session plus database profile resolution. Real Storage verification is deferred to P07 and requires separately approved managed writes. |
| Runtime/test connection strategy | Ignored root/API `.env` files currently point both `DATABASE_URL` and `DIRECT_URL` at the remote Session Pooler database `postgres` using the migration identity; ordinary API startup is therefore refused by the startup guard and must not be used. Start live development only through `infra/supabase/phase5/Start-DeveloperWorkspace.ps1` / `security-adapter/Start-DevRuntime.ps1`, which supplies the protected non-owner `pathways_runtime` credential to the child. Workspace discovery derives zero or one active database-linked profile from the verified Supabase subject; retired developer allowlist/opt-in environment gates no longer participate in runtime authority. |
| Storage/import integration | Supabase Auth and private Storage remain provider boundaries. P03 constructs organization/project/batch/checksum-scoped object keys on the server, verifies that the configured bucket is private, uploads with overwrite disabled and verifies stored bytes during recovery. Storage success and database failure persist `RECOVERY_REQUIRED`; no object is blindly deleted. `@pathways/imports/server` pins Papa Parse `5.7.0` and SheetJS `0.20.3` for hostile-file checks and parsing, while the browser entry point excludes the Node worker. Unit tests use a mock provider; no managed Storage write/read was performed. |
| Exact safe commands | Commands and side effects are recorded in `docs/TODO.md`. P05 verification uses Prisma validation/generation, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, focused activity/participation/import/authorization tests, source searches, and `.\infra\supabase\phase6\Replay-Local.ps1`. Replay creates/removes only its guarded scratch cluster/database on loopback port 55448; it must never target PATHWAYS-dev, `pathways_shadow`, or a restore-rehearsal database. Hosted verification remains the read-only `.\infra\supabase\session-liveness\Read-DevSessionLiveness.ps1`. |
| Latest tested phase and environment | P05 compliance on 2026-09-13: Prisma validation/generation PASS; lint PASS (448 files); typecheck PASS; full build PASS; config 3, shared 7, imports 11, API 566 and web 386 tests passed (973 total), with 6 credential-gated local API tests skipped. Focused P05 activity lifecycle/access tests are 6/6 and participation promotion tests 5/5. Isolated PostgreSQL 18.6 replay of 0001–0012 PASS with `CORE_FOUNDATION_RUNTIME=PASS`, `METADATA_FORMS_RUNTIME=PASS`, `IMPORT_PIPELINE_RUNTIME=PASS`, `BENEFICIARY_REGISTRATION_RUNTIME=PASS`, `PROJECT_ACTIVITY_JOURNEY_RUNTIME=PASS`, ledger/security/legacy-upgrade/preservation assertions, transaction rollback and cleanup. |
| Managed-dev integration verification | PATHWAYS-dev ledger/routing/runtime/liveness remains read-only verified through 0006. Migrations 0007–0012 and P01–P05 write workflows were not applied to or exercised against PATHWAYS-dev because no managed-service write was authorized. Actual approved Auth/Storage end-to-end acceptance remains P07; this does not block completion of local P05 work. |

### 7.1 Existing implementation mapped to P01–P07

| Phase | Reusable implementation | Genuine remaining gap |
|---|---|---|
| P01 | Complete locally: verified Supabase token → database-discovered active profile; canonical six-role policy/shared enum; runtime/RLS plus backend predicates; scoped existing-Auth account/assignment management; persistent minimum program/project APIs and current UI; atomic audit; route guards; 0007 local replay/security tests. | Managed-dev migration/write-path integration is intentionally deferred pending explicit operation approval; all-eight provider acceptance remains P07. |
| P02 | Complete locally: the existing form/field/submission/response schema now has scoped metadata APIs, immutable publication/version safeguards, a shared validator, retry-safe direct entry, atomic audit and persisted builder/entry UI. | P04 supplies Beneficiary registration and P05 supplies participation entry. Managed-dev migration/write-path and integrated provider/adversarial evidence remain P07. |
| P03 | Complete locally: private server-owned upload/recovery; bounded CSV/XLSX/XLS worker parser; immutable raw rows and reviewed mapping/validation revisions; M&E-only validation/processing; retry-safe generic promotion; honest partial/domain-pending states; persisted Collection import UI; 0009–0010 replay/security tests. | Registration and participation promotion are now supplied by P04–P05. Managed Storage and integrated-provider acceptance remain P07. |
| P04 | Complete locally: project-scoped Beneficiary CRUD/search/archive and enrollment; individual/group/community validation; immutable consent provenance; exact organization-scoped identifiers and authorized review; shared manual/import registration promotion; persistent current UI; 0011 replay/security tests. | P05 supplies participation and journey history. Integrated managed-provider/adversarial acceptance remains P07. |
| P05 | Complete locally: scoped project/activity/milestone APIs, explicit activity workflow and independent private-proof review; immutable project journey configuration after first use; chronological participation/enrollment events and corrections; one shared direct/import participation handler; persistent activity/journey/history UI; migration 0012 and runtime tests. | Managed private-Storage/Auth acceptance and the integrated adversarial matrix remain P07. |
| P06 | Project indicator schema and existing chart/dashboard components. | Indicator APIs/calculation contracts and database-scoped dashboard/SADDD aggregates are absent; frontend client returns empty/not-configured and privacy policy remains a P06 decision. |
| P07 | Guarded local replay/security/Auth harnesses and fixed managed-dev read probes exist. | No all-eight persisted end-to-end acceptance or approved real Storage write/read proof exists. |

### 7.2 Resolved P01 prerequisite — runtime RLS mode

On 2026-09-13 the developer supplied `CONFIRM PATHWAYS_RUNTIME_NOBYPASSRLS; AUTHORIZE CORE P01`. The completed `pathways_runtime NOBYPASSRLS` design is authoritative: RLS remains mandatory and backend services also apply organization/project scope predicates. This supersedes the older Human Gates `APPROVE_PATHWAYS_RUNTIME_BYPASSRLS` entry. The confirmation did not authorize a database role/grant or managed-service write; none occurred.

### 7.3 P02 form, version and validation contract

- A form definition belongs to one organization/project. Its lower-case code plus monotonically increasing version identifies its lineage; each version has a distinct immutable form ID. Drafts can be edited. Publishing is an approval restricted to a Monitoring and Evaluation Officer who is not that version's author. Published definitions and fields are immutable; later edits create the next draft version under a row lock and database uniqueness constraint. Archive is the only permitted published-state transition. Optimistic `updatedAt` checks reject stale edit/publish/archive requests.
- Atomic permissions are `forms.read`, `forms.manage`, `forms.publish` and `submissions.write`. System Administrator, Project Manager and M&E may manage drafts; only M&E may publish; System Administrator, Project Manager, M&E and Project Officer may enter direct submissions; Program Manager has definition read only; Grant Manager has neither raw form-definition nor direct-entry access. Assignment and organization predicates still apply to every project-scoped operation.
- Supported field types are exactly `TEXT`, `LONG_TEXT`, `INTEGER`, `DECIMAL`, `DATE`, `BOOLEAN`, `SELECT` and `MULTIPLE_SELECT`. A definition has 1–100 fields; safe unique codes match `^[a-z][a-z0-9_]{0,63}$`; labels are 1–160 characters; select values are explicit unique strings, at most 100 values and 120 characters each. User-configured code, SQL, formulas and regex are never executed.
- The shared normalization contract treats missing, null, trimmed-empty strings and empty arrays as empty, while preserving numeric zero and Boolean false. Draft mode permits empty required fields but rejects invalid supplied values and all unknown/unsafe keys. Final mode requires every required value. Text is trimmed and bounded to 2,000 characters (`LONG_TEXT` 10,000); integer is signed 32-bit; decimal is persisted as a canonical exact string with at most 14 integer digits and 4 fractional digits, matching `decimal(18,4)` bounds; calendar dates are strict `YYYY-MM-DD`, must be real dates from 1900-01-01 through 2100-12-31, and honor optional date bounds. Multi-select has unique allowed values and a maximum of 50 selections plus optional item-count bounds.
- Direct entry accepts only a published form version. Draft/save/validate/submit all use the same server validator. The server owns actor, organization and project scope; a client-generated UUID is unique per actor and makes identical retries idempotent, while reuse with different values conflicts. Submissions pin `(organization, project, form ID, form version)` by foreign key. Only successfully validated records reach `VALIDATED`; they and their response values are immutable. Form/submission and redacted audit writes share one transaction. P02 itself creates no Beneficiary, enrollment, participation or other domain record; P04 routes registration and P05 routes participation through their atomic domain handlers.

### 7.4 P03 upload, mapping, validation and processing contract

- Supported source formats remain exactly CSV, XLSX and XLS. Parsing runs in a terminated server worker and never evaluates formulas/macros or follows workbook links. CSV must be UTF-8 without NUL bytes; workbook containers and declared ZIP expansion are checked before parsing. Formula cells, formula-like CSV values, external links, embedded/OLE content, duplicate case-insensitive headers, unsafe property names and multi-sheet workbooks fail explicitly rather than being guessed or silently omitted.
- P03 resource limits are engineering defaults, not a new business policy: 5 MiB/file, 5,000 data rows, 100 columns, 250,000 cells, 10,000 characters/cell, 100 characters/header, 2,000 ZIP entries, 25 MiB declared uncompressed workbook content, 100:1 expansion ratio and 5 seconds parser time. A workbook may contain at most 10 worksheets structurally but must contain exactly one populated processing worksheet. Parser limits may be tightened after measurement without changing data semantics; widening them requires security/performance evidence.
- The server generates the private object key `organizations/{organizationId}/projects/{projectId}/imports/{batchId}/{sha256}.{extension}`. A reservation and audit event commit before Storage upload; checked finalization commits immutable parsed rows afterward. Storage status is `RESERVED`, `STORED`, `RECOVERY_REQUIRED` or `FAILED`. A Storage-success/database-failure can be resumed from the persisted object/checksum; uploads use no overwrite, and recovery compares bytes rather than deleting an uncertain object.
- Each batch pins organization, project, published form ID/version, original file metadata, SHA-256, source headers and actor-scoped client import UUID. Raw row number, original values and row checksum are immutable. Identical retry keys return the same batch; reuse against different source/scope/form metadata conflicts. Mapping revisions are append-only, must account for every original header as mapped or ignored, target only allowlisted pinned-form fields, prohibit duplicate targets and never permit organization/project/actor/role/approval/account-state assignment.
- Only an assigned Monitoring and Evaluation Officer with current `imports.review` may save mappings or validate, and current `imports.process` is rechecked before claims and promotion. Normalization delegates to the P02 validator after explicit non-ambiguous import coercion; blank is null while zero and false remain values. Validation results are revision-pinned. A changed mapping invalidates old results; processing rejects stale revisions. Raw previews and safe row errors require detail-level `imports.read`; Program Manager and Grant Manager have no import-detail permission.
- Batch flow is `UPLOADING` → `UPLOADED` → `MAPPED` → `VALIDATED` → `PROCESSING` → `PARTIALLY_PROCESSED`/`PROCESSED`, with explicit `RECOVERY_REQUIRED`/`FAILED` outcomes. Row flow is `PENDING` → `VALID`/`INVALID`, then claimed `PROCESSING` → `PROCESSED`, `UNPROCESSED` or bounded-retry `FAILED`. Claims expire after 60 seconds, process at most 25 rows per checkpoint and stop after 3 row attempts. Current revision and authority are checked again when work resumes.
- Each valid generic row creates exactly one version-pinned `VALIDATED` submission/responses plus redacted audit and row outcome in one short database transaction; database uniqueness prevents duplicate effects. Invalid rows create no operational record. P04 registration rows use the shared Beneficiary handler; review-required registrations remain honestly `UNPROCESSED`. P05 participation rows use the shared participation handler. Partial totals still do not claim whole-file atomicity or success when a domain row remains unresolved.

### 7.5 P04 Beneficiary identity, consent and registration contract

- A Beneficiary is an organization-owned domain record and never a Supabase Auth user. New records declare exactly one supported subject type: `INDIVIDUAL`, `GROUP` or `COMMUNITY`. Legacy rows remain `UNSPECIFIED_LEGACY` until explicitly reviewed; no migration guesses their subject type or consent. Person-only names, birth/age, sex, minor and guardian fields are prohibited on group/community records.
- The canonical PATHWAYS code is stable and unique within an organization. Optional external identifiers are immutable, organization-scoped exact `(namespace, normalized value)` keys. Email, name and birth date cannot be identifier namespaces, and fuzzy combinations of names, dates or email never merge profiles. `CREATE`, `LINK` and `UPDATE` are explicit operations. Ambiguous, duplicate, unknown, code-conflicting, subject-conflicting or inaccessible shared updates enter bounded authorized review rather than being guessed or overwritten.
- Detail APIs always require an authorized organization/project and return only that project's enrollment and consent history. Program Manager and Grant Manager have no Beneficiary-row/search/import/nested-detail permission. System Administrator has organization authority; Project Manager, M&E and Project Officer read only assigned-project detail. Profile update is M&E/System Administrator; archive is Project Manager/System Administrator; creation is Project Officer, Project Manager, M&E or System Administrator. New cross-project enrollment/linking requires both enrollment-management and identity-review authority; enrollment permission alone cannot discover a hidden profile. A non-System Administrator profile update/archive requires scope over every active enrollment.
- Participation and data-processing consent must both be explicitly true for registration. Minor status must agree with recorded birth/age at enrollment, and guardian consent is required exactly for a minor. Profile consent facts are immutable; project-specific `PARTICIPATION`, `DATA_PROCESSING` and applicable `GUARDIAN` provenance rows are append-only and identify project, enrollment, pinned submission, source, recorder and time. P04 does not invent SADDD age bands or privacy thresholds; those remain P06 decisions.
- A published `BENEFICIARY_REGISTRATION` form must contain `registration_operation`, `beneficiary_code`, `subject_type`, `consent_recorded`, `data_processing_consent_recorded` and `enrollment_date`; optional profile/identifier fields still use the P02 validator. The same `BeneficiariesService.promoteRegistration` contract serves manual entry and a validated P03 import row. One short transaction resolves/creates the profile, ensures enrollment, writes the form-version-pinned `VALIDATED` submission/responses, appends consent provenance and redacted audit, and finalizes an import row only after those effects succeed.
- A client registration UUID is retry-safe within actor/scope; imported registration idempotency is pinned to the immutable import row. An identical retry returns the same profile/enrollment/submission, while conflicting reuse fails. Organization-scoped uniqueness, row claims and database guards handle concurrent requests; transaction failure leaves no partial operational profile. Review outcomes remain unprocessed with safe codes and do not expose inaccessible identity data.

### 7.6 P05 activity, proof, journey and participation contract

- The persisted activity lifecycle is exactly `NOT_STARTED` → `IN_PROGRESS` → `FOR_REVIEW` → `COMPLETED`, with `CANCELLED` allowed only from `NOT_STARTED` or `IN_PROGRESS`. A returned review moves `FOR_REVIEW` back to `IN_PROGRESS`. Terminal activities cannot be edited or restarted. “Overdue” is a derived presentation state when the configured `BUSINESS_TIME_ZONE` calendar date is later than the planned end date and the activity is non-terminal; it is never stored as a competing status.
- Activity creation/update is scoped to `activities.create`/`activities.update`; every assignee must have a current active project assignment and active profile. Assigned Project Officers submit retry-safe private proof under server-owned keys through `activities.proof.submit`. Monitoring and Evaluation Officers alone receive `evidence.review`; submitter, reviewer, timestamps and bounded reason remain independent, and self-review is rejected. A database reservation plus `storage_ready` checkpoint makes an interrupted provider upload retryable with the same client update UUID and byte checksums. Proof download always reauthorizes organization, project, activity and evidence scope; no signed URL is persisted.
- Journey stages and activity-stage mappings are project-owned, ordered and parent-linked. Parent order prevents cycles; project-row locking plus optimistic stage timestamps serializes competing configuration saves. The complete configuration freezes after the first journey event. Database triggers reject subsequent stage/mapping inserts, relabels and deletions, while each event snapshots stage/activity codes and names so later history is never reinterpreted.
- Participation requires `participation.record`, an active exact-code enrollment, a non-cancelled same-project activity, and the pinned form’s same-project activity-stage mapping. The canonical `ACTIVITY_MONITORING` field codes are `beneficiary_code`, `participation_date`, `attendance_status`, `progress_status`, with optional `progress_notes`; P02’s shared validator supplies the normalized values. Both direct entry and P03 import promotion call `ParticipantsService.promoteParticipation` inside their existing transaction. `source_submission_id` is unique, so retries return the committed effect and cannot duplicate participation or journey history; submission finalization, responses, event, audit and imported-row state roll back together.
- Journey events are chronological and attributable. Completion, follow-up, dropout and transfer append an event; completion/dropout/transfer also close the source enrollment. Transfer requires separate access to a different destination project and an already authorized active destination enrollment, so it cannot manufacture consent or bypass destination scope. Corrections append a single-level correcting event with a reason and retain the original. History reads are limited to the requested authorized project even when the Beneficiary is enrolled elsewhere; Program Manager and Grant Manager remain aggregate-only and cannot retrieve these rows.
- Project profile/objectives/implementation area/dates/status and project assignment authority continue to use the P01 project service. P05 adds only the remaining activity, activity-assignment, milestone, proof/review, journey and participation paths. Indicator bindings, activity finance values and reporting are intentionally not synthesized and remain P06 or excluded supporting work.

## 8. Maintained implementation contracts

Update these in place as phases settle them; keep entries concise with file/test references.

| Contract | Owner phase | Initial status |
|---|---|---|
| Actual six-role permission map; portfolio scope; denial behavior | P01 | Settled and locally verified. Shared/backend policy contains Sysadmin, Program Manager, Project Manager, Project Officer, M&E Officer and Grant Manager. Grant Manager remains aggregate-only and explicit-assignment scoped because no grant-portfolio model exists; Program Manager receives portfolio aggregate scope without beneficiary detail. Role ceilings and cross-scope denials are enforced in service logic and database helpers/policies. User queries select only authorized roles/active assignments; a non-System Administrator cannot mutate an account whose active assignments extend beyond the actor's scope. Nested program/project IDs are checked in the actor organization before mutation. Runtime is `NOBYPASSRLS`; service query predicates remain mandatory. |
| Form versions, supported types, publication/review semantics | P02 | Settled and locally verified; see §7.3, shared validator tests, metadata service tests and the 0001–0008 disposable replay. |
| File limits/formats, mappings, import idempotency and batch states | P03 | Settled and locally verified; see §§7.4–7.6, secure parser/normalization tests, import service/client tests and the 0001–0012 disposable replay. Registration and participation promotion are supplied by P04–P05; managed Storage acceptance remains P07. |
| Beneficiary key/linking policy; consent provenance; shared-profile writes | P04 | Settled and locally verified; see §7.5, Beneficiary/import service tests and the 0001–0011 disposable replay. Managed-provider acceptance remains P07. |
| Activities, enrollment/journey transitions, correction and historical-config behavior | P05 | Settled and locally verified; see §7.6. Managed private-Storage acceptance remains P07. |
| Indicator calculations, denominators, source periods and refresh behavior | P06 | Pending implementation |
| SADDD age reference/bands, missing-data treatment, privacy/small-cohort filtering | P06 | Partially settled 2026-09-13: suppress counts 1–4 (`SMALL_CELL_THRESHOLD=5`) and apply complementary suppression. Final age policy is pending because project/location are scope dimensions rather than an age reference date, the proposed bands omit ages 0–9, and invalid birth dates must remain validation/data-quality errors rather than being silently normalized as unknown. |
| Real provider integration and all-eight acceptance evidence | P07 | Pending execution |

For a policy not specified by U/H/M/R, propose one focused decision and keep the affected unsafe operation unavailable. Missing later-phase policy need not block unrelated safe work. In particular, a guessed privacy threshold must not be presented as sufficient anonymization; sensitive SADDD breakdown acceptance waits for an approved policy and tests.

## 9. Product maturity / UI rule

PATHWAYS is now in active system development rather than prototype/presentation
mode.

User-facing UI must not describe the system as:
- a prototype;
- mock;
- demo-only;
- presentation-only.

Test mocks and internal test fixtures remain permitted.

Incomplete functionality must not display fabricated production-looking data.
Use truthful empty, hidden, disabled, or unavailable states until backed by
implemented functionality and persisted data.

## 11. Source references

**Project basis:** Master Context Pack §§5.1–5.3, 7, 9, 15 and 20; manuscript UC009–UC014 and UC015/UC017 where consistent; approved Human Gates; attached `PHASE_REPORT_TEMPLATE(2).md`; latest user request. Locate actual filenames in P00. Historical first/second-pass reports explain prior decisions, not current implementation status.

**Engineering references (not additional product scope):**
- [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [OWASP Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [NestJS validation](https://docs.nestjs.com/techniques/validation)
- [Prisma transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions) — use the installed version's API
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

These references guide safeguards; current repository versions and executable tests decide compatible syntax.
