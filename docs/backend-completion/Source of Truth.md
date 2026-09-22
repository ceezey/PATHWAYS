# PATHWAYS Backend Completion - Source of Truth

## 1. Workstream status

- Workstream: backend completion after the Frontend-UI/UX to Backend-DB integration.
- Current phase: Work Package A1, PostgreSQL 17 compatibility rehearsal and final migration 0021 managed readiness.
- Phase 1 result: PASS.
- Work Package A1 result: PASS.
- Repository branch: `Backend-DB`.
- Phase-start backend source baseline and `origin/Backend-DB` SHA: `23d0028d9814d691d6160b0b5e3d30aa0136ae3a`.
- Work Package A1 starting local SHA: `5c7d1ae8cac47815488238e46094cb63fc9e9c71`.
- Integrated Frontend-UI/UX SHA: `a0ea9cf98396dfd7cceddb8a1c4100aafd57abde`.
- Frontend/backend merge commit: `707315b232ce16405a8493b0cb454cdfdbe3b4d5`.
- Worktree before this control update: clean except for the developer-owned untracked manuscript PDF at `docs/UCD and UCR - [Group 14] Capstone Manuscript rev 2026.pdf`.
- Managed writes in this phase: zero.
- Next authorized work: none. Explicit developer authorization is required.

## 2. Authoritative evidence reviewed

- Current Git status, history, `origin/Backend-DB`, and merged Frontend-UI/UX ancestry.
- `docs/frontend-backend-integration/Source of Truth.md`, `TODO.md`, and `PHASE_REPORT_TEMPLATE.md`.
- Root package scripts and workspace package scripts.
- Current web routes, components, hooks, service clients, API modules, shared contracts, authorization policy, Prisma schema, migration SQL, test suites, Playwright configuration, and GitHub workflows.
- Repository migrations `0001` through `0021`.
- The developer-supplied 2026 manuscript and its UC001-UC026 behavior descriptions. Its SHA-256 is `cb72687e0a8dec3943d39bd1fe7410e02e388453e7c601329b62c57c5ce760a2`. The PDF remains untracked and must not be committed without explicit authorization.
- Protected PATHWAYS-dev migration, role, RLS, assignment, and backup metadata through read-only checks only.

No repository `AGENTS.md` was present. The historical root `docs/Source of Truth.md` and `docs/TODO.md` files referenced by earlier prompts are not present in this post-merge checkout; the existing integration controls record the same fact.

## 3. Locked boundaries

- The merged latest frontend is the UI/UX standard. Backend completion must not redesign its layout, styling, navigation, forms, buttons, dialogs, workflows, or responsive behavior.
- Preserve the current login flow, redirects, and retained older OTP/MFA UI.
- Beneficiary PIN remains `2468`. It is a user-interface gate and is not sufficient server authorization for sensitive data.
- Preserve current role ceilings, organization scope, project assignment scope, RLS, and the non-superuser/NOBYPASSRLS runtime model.
- Project Managers require indicator read and manage access only within the already approved identity, organization, assignment, and permission checks.
- Do not reintroduce fabricated runtime data or fake mutation success. Test-only fixtures remain permitted.
- P07-W10 remains open/deferred. Its provider, fixture, and source state is outside this workstream and was not changed.

## 4. Verified current implementation boundary

Current real backend paths cover authentication/login and recovery, user authorization updates for existing users, programs and projects, activities, milestones and proof, project indicators and measurements, dashboard/monitoring aggregates, metadata/forms/submissions, imports, beneficiary registration/list/update/archive/enrollment, participant/journey history, and related audit/scoping behavior.

The current UI truthfully disables, empties, or reports unavailable behavior when a required contract is absent. The principal missing API domains are finance, evaluation, rule/alert/recommendation lifecycle, generated reports/exports, public publication projections, audit browsing, backup orchestration, profile self-service, and shared labels. Some project and beneficiary flows have partial backend support but still lack an approved end-to-end contract.

## 5. Outstanding Backend Priority Matrix

| Feature | Related UC(s) | Frontend route/control | Current temporary behavior | Existing backend support | Schema support | Security sensitivity | Dependency | Manuscript/use-case support | Policy clarity | Recommended priority | Recommended action | Migration needed | Managed provider action needed | Blocking integration completeness |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Managed Project Manager indicator access | UC008 | `/projects/:id/indicators`; create/edit indicator controls | Read works; managed PATHWAYS-dev currently denies PM create/update | Full in source; deployment pending | Full | High | None | PM manages assigned-project indicators; M&E behavior remains intact | Clear | P0 | Implement migration 0021 only | Yes, existing 0021 | Yes, Database | Yes |
| Budget allocation, expense ledger, verification, and approval | UC007 | Project budget and monitor/review expense controls | Real project context remains visible; mutations and ledger are unavailable | None at API; authorization policy exists | Full: budget, expense, evidence, state/audit models | High | Existing projects, activities, assignments, and evidence | Record allocation/expense evidence; Project Officer submits, M&E verifies, Project Manager approves | Clear | P0 | Implement API/services against existing normalized schema | No expected; verify RLS operations during implementation | No expected | Yes |
| Full project setup | UC006 | `/projects/new`, `/projects/:id/edit` | Form is preserved but does not fake a save | Partial project create/update; payload does not cover all UI fields | Partial | Medium | Decisions on code, partners, sector, targets, and budget ownership | Create and maintain complete project profiles | Ambiguous | Deferred | Clarify data ownership, then implement | Yes | Yes, Database | Yes |
| Team reassignment and project archive | UC006 | Project detail team editor and archive controls | Controls remain unavailable; no fake assignment/archive success | Partial; assignment history and archive columns exist | Full | High | Atomic assignment and archive consequence policy | Maintain project profile, personnel assignments, and lifecycle | Ambiguous | Deferred | Clarify workflow, then implement | No expected | No expected | Yes |
| Server-verified Beneficiary step-up | UC012-UC014 | Beneficiary detail/edit/history/duplicates/evaluation routes | PIN `2468` preserves UX, while protected details remain unavailable without server proof | Partial identity/scoping; no step-up grant | Partial | High | Step-up mechanism, expiry, and audit policy | Authorized users access sensitive profiles and history | Ambiguous | Deferred | Clarify and design before implementation | Likely yes | Likely Auth and Database | Yes |
| Beneficiary media and duplicate resolution | UC012, UC014 | Beneficiary media and duplicate controls | No fabricated upload, linkage, or merge | Partial beneficiary/evidence APIs; no merge contract | Partial; evidence exists, duplicate lineage does not | High | Server step-up and merge/link policy | Maintain Beneficiary records and reliable history | Ambiguous | Deferred | Clarify non-destructive duplicate handling, then implement | Likely yes | Database; Storage if files are approved | Yes |
| Participation, enrollment status, and journey note commands | UC013, UC014 | Beneficiary enrollment/status dialogs and journey timeline controls | Existing data is shown; unsupported mutations remain unavailable | Partial; enrollments, stages, and journey events exist | Full or near-full | High | Provenance, reason, idempotency, and allowed transition mapping | Track participation, milestones, changes, and history | Ambiguous | Deferred | Clarify command semantics, then implement adapters/endpoints | Unknown | No expected | Yes |
| Combined project evaluation workflow | UC016, UC018-UC020 | Project monitoring/evaluation workspace | Evaluation actions and recommendation outcomes are unavailable | None at API; authorization policy exists | Full: criteria, evaluations, scores, outcomes, immutable history | High | Finance evidence, indicators, and assignments | Evaluate progress, risks, outcomes, and approved decisions | Clear | P1 | Implement after finance | No expected | No expected | Yes |
| Reusable indicator library | UC008 | Project indicator selection/reuse controls | Project-owned indicators work; cross-project reuse is unavailable | None for reusable definitions | Partial | Medium | Ownership, versioning, and link-versus-copy decision | Define and use indicators consistently across projects | Ambiguous | Deferred | Clarify semantics, then normalize | Yes | Yes, Database | Yes |
| Saved analytics layouts, trends, and maps | UC015, UC016, UC021 | Dashboard/analytics layout, trend, and map controls | Current real aggregates render; unavailable extensions show no fabricated data | Partial dashboards/aggregates | Partial or none for layouts/geodata | High | Evaluation/reporting data and geospatial privacy policy | Monitor, analyze, and visualize disaggregated results | Ambiguous | Deferred | Clarify persistence and location privacy first | Likely yes | Database | Yes |
| Rules, in-app alerts, and recommendations | UC018, UC019, UC023 | `/alerts`, recommendations, and `/settings/rules` | Empty/unavailable state; no fake alerts, rule saves, or outcomes | None at API; authorization policy exists | Full for rule, alert, recommendation, and outcome records | High | Finance/evaluation signals and delivery semantics | Configure rules, surface exceptions, and record recommendations | Partially ambiguous | P1 | Clarify notification/escalation boundary, then implement in-app lifecycle | Unknown; core records need none, delivery outbox may need one | Unknown | Yes |
| Generated reports, survey aggregates, history, and exports | UC020, UC022 | `/reports`, report history/export, survey aggregate, and download controls | No fake saved report or file download | None at API | Partial/full: Report and source records exist; no generation job contract | High | Evaluation/analytics data, suppression rules, format and retention policy | Generate, retain, review, and export reports | Ambiguous | Deferred | Clarify outputs/privacy, then implement | Unknown | Database and Storage likely | Yes |
| Publication workflow and public tracker | UC025, UC026 | Transparency queue, preview/publish controls, and public project pages | No fabricated publication or public project data | None at API | Partial: project/evidence visibility fields exist; no immutable projection | High | Report/privacy rules and approval-role decision | Approve public information and expose a public tracker | Ambiguous | Deferred | Clarify roles, redaction, snapshot, withdrawal, then implement | Likely yes | Database; Storage if assets publish | Yes |
| Auth account provisioning | UC004 | Settings user create/invite controls | Existing-user authorization works; account creation is unavailable | None for provider account creation | Provider-owned identity plus existing app user | High | Invite/create credential and identity-link policy | System Administrator manages user accounts and roles | Ambiguous | Deferred | Clarify provider workflow, then implement | No expected | Yes, Auth | Yes |
| Profile self-service | UC003 | `/settings/profile` edit/password controls | Profile data can be viewed; unsupported updates remain unavailable; recovery still works | Partial auth/profile reads | Partial | High | Editable-field and provider-email/password policy | User views and updates profile/security information | Ambiguous | Deferred | Clarify ownership, then implement | Unknown | Auth likely | Yes |
| Audit log browsing | UC005 | `/settings/audit` | No fabricated audit rows | Audit writes exist; no browse API | Full for recorded events | High | Permission and self-versus-organization visibility policy | Authorized users review auditable actions | Ambiguous | Deferred | Define read policy, then implement filtered immutable reads | Maybe, if a distinct permission is added | Database if permission migration is needed | Yes |
| Backup/restore application workflow | UC024 | `/settings/backups` | UI remains disabled/unavailable | Provider scripts/evidence exist; no application orchestration | Provider-owned, not an application table | High | Operational authority, RPO/RTO, retention, and restore approval | Authorized operator creates and restores recoverable backups | Ambiguous | Deferred | Handle as a controlled operations workstream | No application schema migration | Yes, Database/Auth/Storage as separately approved | Yes |
| Shared labels/configuration | No explicit UC; merged settings control | `/settings/labels` | Unavailable with no fake local persistence | None | None | Low | Ownership and scope decision | Supporting configuration only | Ambiguous | P2 | Clarify organization/project scope or defer | Yes if retained | Yes, Database | No |
| Form export | UC009 | Collection form export/download control | Existing forms remain usable; no fake file is generated | Partial form definition API | Full for definitions | Low | Export format | Manage and distribute collection forms | Clear | P2 | Implement deterministic export | No expected | No expected | No |
| Saved direct-entry draft listing | UC010 | `/collection/entry` saved-draft/list control | Real submission works; draft listing is unavailable | Partial submission API | Full for stored submissions | Medium | Existing form/submission scope | Enter, save, and review collected data | Clear | P1 | Implement scoped draft query/list | No expected | No expected | Yes |

Priority describes readiness and dependency order. `Deferred` means a developer policy decision is required before source implementation; it does not mean the use case is unimportant.

## 6. Schema normalization findings

### 6.1 Project profile extensions

- Frontend requirement: partners, sector, target Beneficiaries, budget, and staff assignment in the complete project form.
- Backend gap: the project API lacks an approved mapping for several fields and the form lacks the required project code.
- Owning entity/table: `Project` for atomic project attributes; dedicated partner/sector/target relations; existing `ProjectBudgetRecord` and `UserProjectAssignment` for budget and team.
- Normalization decision: keep an atomic generated/entered code on `Project`; model partners as child/junction records; use a governed sector lookup and project foreign key or constrained code; select one canonical target source rather than duplicating derived values; reuse budget and assignment tables.
- Column versus relation rationale: partners are repeatable entities, assignments require history, and budgets have their own lifecycle. Flattening them into project text would lose integrity and provenance.
- Constraints/indexes/foreign keys: organization-scoped uniqueness for project code and governed lookup keys; foreign keys to project, partner/sector, user, and role as applicable; indexes for organization/project active records.
- RLS/runtime grants/audit: organization and project assignment scope; minimal runtime CRUD by approved role; audit changes and assignment transitions.
- Migration needed: yes for approved partner/sector/target additions; none for existing budget/team/archive fields.
- Backfill/review: no fabricated partners, sector, or targets. Existing projects require explicit review or null/unknown states.

### 6.2 Beneficiary step-up and duplicate lineage

- Frontend requirement: disclose/edit sensitive records after a server-verifiable step-up and resolve duplicates without losing history.
- Backend gap: PIN `2468` is client-visible and no durable or short-lived server grant proves step-up; no approved duplicate merge/link history exists.
- Owning entity/table: Auth/provider assurance where available plus a short-lived, auditable application grant if needed; immutable Beneficiary relation/event records for duplicate decisions.
- Normalization decision: do not store the PIN as authorization. Store only provider proof references or expiring grants; represent suspected/confirmed duplicate and merge/link outcomes as relations/events.
- Constraints/indexes/foreign keys: expiry and one-time/use constraints; organization/user/purpose binding; canonical and duplicate Beneficiary foreign keys; prevent self-links and conflicting active canonical links.
- RLS/runtime grants/audit: sensitive rows require organization/project scope plus approved step-up; audit grant issuance/use and every linkage/merge decision.
- Migration needed: likely yes.
- Backfill/review: do not infer duplicate relationships or step-up proof from existing access logs.

### 6.3 Participation and journey mutations

- Frontend requirement: status transitions, enrollment changes, and journey notes.
- Backend gap: source tables exist, while UI command provenance and allowed transitions are not fully mapped.
- Owning entity/table: existing enrollment/participation and `BeneficiaryJourneyEvent` records; add a history/event record only if the current event model cannot represent required changes.
- Normalization decision: current state remains atomic; reasons, actors, timestamps, and prior/new state belong in immutable events.
- Constraints/indexes/foreign keys: valid state transition checks, idempotency keys, project/Beneficiary/actor foreign keys, and chronological query indexes.
- RLS/runtime grants/audit: project scope and sensitive Beneficiary rules; audit every state change.
- Migration needed: unknown until the command contract is approved.
- Backfill/review: do not synthesize reasons or historical transition times.

### 6.4 Reusable indicator definitions

- Frontend requirement: reuse governed indicators across projects without changing current project indicator behavior.
- Backend gap: indicators are project-owned; no reusable versioned definition exists.
- Owning entity/table: organization indicator definition/library plus project binding/version snapshot; retain project measurements under existing project indicators.
- Normalization decision: definition and project use are separate entities. A project binding must state whether it follows a definition version or snapshots it.
- Constraints/indexes/foreign keys: organization-scoped code/version uniqueness and foreign keys from bindings to project and definition/version.
- RLS/runtime grants/audit: organization reads, approved definition management, project assignment for binding and measurement; audit revisions and bindings.
- Migration needed: yes.
- Backfill/review: current project indicators remain project records until explicitly reviewed; do not silently deduplicate them.

### 6.5 Analytics layouts and geospatial inputs

- Frontend requirement: saved layouts, trend series, and map views.
- Backend gap: real aggregates exist; preferences and approved geospatial source/precision do not.
- Owning entity/table: per-user dashboard configuration metadata; canonical project/Beneficiary location source or governed geospatial child records; trends derived from immutable measurements/events.
- Normalization decision: persist user configuration, not calculated chart totals. Store location only at the approved precision; derive series at read time unless an immutable reporting snapshot is required.
- Constraints/indexes/foreign keys: user/organization dashboard uniqueness, validated layout schema/version, spatial or ordinary indexes only after query design, and source foreign keys.
- RLS/runtime grants/audit: owner-only layout writes; scoped aggregate reads; suppress sensitive small cohorts and precise Beneficiary locations.
- Migration needed: likely yes.
- Backfill/review: no inferred coordinates or fabricated historical points.

### 6.6 Alert delivery

- Frontend requirement: reliable alert/recommendation lifecycle and any approved notifications.
- Backend gap: normalized rules/alerts/recommendations exist, but external delivery, retry, and recipient policy do not.
- Owning entity/table: existing domain records; add an outbox/delivery-attempt child table only if external delivery is authorized.
- Normalization decision: delivery attempts are append-only children, separate from domain alert state.
- Constraints/indexes/foreign keys: unique event/idempotency key, alert/recipient/channel foreign keys, attempt/status checks, and pending-delivery index.
- RLS/runtime grants/audit: scoped reads and role-limited rule/outcome changes; provider credentials never stored in domain rows; audit changes and delivery results.
- Migration needed: only if delivery is in scope.
- Backfill/review: no retroactive notification claims.

### 6.7 Reports and public publication

- Frontend requirement: reproducible reports/exports and reviewed public tracker output.
- Backend gap: `Report` and public visibility fields exist, but generation jobs, approved artifacts, redacted immutable projections, and withdrawal/version semantics are incomplete.
- Owning entity/table: existing `Report` for report metadata/artifacts; Storage for files; a publication projection/snapshot and approval history if public output must remain reproducible.
- Normalization decision: generated files are provider-owned artifacts referenced by metadata; approved public content is an immutable versioned snapshot rather than a mutable join over private live tables.
- Constraints/indexes/foreign keys: report/project/requester/approver references, format/status checks, unique snapshot version, published/withdrawn timestamps, and current-public-version index.
- RLS/runtime grants/audit: private source scope, suppression before artifact creation, least-privilege Storage access, explicit publication approval, and immutable audit of downloads/publication/withdrawal.
- Migration needed: unknown for reports; likely yes for a publication projection.
- Backfill/review: existing private data is not public by default; no historical approvals are fabricated.

### 6.8 Administration and provider-owned operations

- Frontend requirement: account provisioning, profile changes, labels, audit browsing, and backup/restore.
- Backend gap: these controls have no complete application contract.
- Owning entity/table: Supabase Auth for credentials/identity; existing user profile and audit tables for application state; a normalized scoped label/configuration table if labels are retained; provider backup facilities for recovery.
- Normalization decision: do not duplicate passwords, sessions, or backup archives in application tables. Store application profile/configuration only after ownership is defined.
- Constraints/indexes/foreign keys: provider identity uniqueness, organization-scoped label uniqueness, and immutable audit query indexes.
- RLS/runtime grants/audit: provider admin operations require separately approved service boundaries; profile writes are owner/authorized admin limited; audit is append-only; backup operations stay outside normal runtime grants.
- Migration needed: unknown for profile/permission changes; yes for labels if retained; none for provider backup mechanics.
- Backfill/review: no fabricated provider identity, labels, or backup history.

## 7. Migration 0021 readiness

### 7.1 Exact source identity and purpose

- Directory/name: `apps/api/prisma/migrations/0021_project_manager_indicator_access/migration.sql`.
- SHA-256: `b2cc161a80f2989784bf5fd304b3a5b5657b1f481ade6af41c002b56f7d035e6`.
- Inventory: `0001` through `0021`; 0021 is the only append after 0020.
- All repository migrations `0001` through `0020` are byte-for-byte identical to the approved Backend-DB base (`3c4f0eb...`) versions.

The guarded transaction:

1. requires the expected Prisma owner, NOBYPASSRLS/non-superuser runtime, and existing P06 functions/policies;
2. adds mappings for the existing `PROJECT_MANAGER` role to the existing `indicators.create` and `indicators.update` permissions using `ON CONFLICT DO NOTHING`;
3. replaces only `pathways.p06_can(text, uuid)` so Project Managers and M&E users may create/update indicators only after the existing verified identity, organization, active project assignment, and permission-mapping checks pass; and
4. revokes function execution from `PUBLIC`, `anon`, `authenticated`, and `service_role`, then grants it to `pathways_runtime` only.

It creates no table, column, index, or application-data backfill. It changes no unrelated role permission. It does not grant Project Managers a capability beyond indicator create/update under existing scope checks. It does not give `pathways_runtime` superuser or BYPASSRLS rights and does not disable RLS.

### 7.2 PostgreSQL 18 replay evidence

- Installed/running service: `postgresql-x64-18`, PostgreSQL 18.6, automatic and running. Its binaries and data directory were not modified by Work Package A1.
- Existing guarded disposable replay through all 21 migrations with feature, core, forms, imports, Beneficiary, journey, dashboard, Project Manager indicator, and legacy-preservation checks: PASS.
- The first historical sandbox replay could not create a Windows restricted token. Two PostgreSQL 18 attempts using its default JIT setting reached the unchanged 3-second statement timeout during a C8 protected query.
- PATHWAYS-dev PostgreSQL 17.6 reports JIT off. Replaying PostgreSQL 18 with session-only `PGOPTIONS=-c jit=off` reproduced the managed setting and passed; protected queries completed in about 0.53 and 1.06 seconds.
- No timeout, pool, source, migration, service, data-directory, or security setting was changed.

### 7.3 PostgreSQL 17.11 compatibility evidence

- Explicit binaries: `C:\pgsql\bin\postgres.exe`, `initdb.exe`, `pg_ctl.exe`, `psql.exe`, `createdb.exe`, `dropdb.exe`, `pg_dump.exe`, and `pg_restore.exe` all exist. Server/client/dump/restore tools report PostgreSQL 17.11.
- Disposable data directory: `C:\PATHWAYS\.tmp\pathways-phase6-a11711b2c3d4e5f67890123456789abc\data`.
- Listener: loopback `127.0.0.1` only, port `55448`; no hosted URL or credential was used.
- Server fact probe from inside the disposable database: PostgreSQL `17.11`, server version number `170011`, JIT `off`.
- Fresh replay: migrations `0001` through `0021` applied successfully. Exactly one Prisma ledger existed with 21 completed/non-rolled-back entries, latest `0021_project_manager_indicator_access`, and 0021 checksum `b2cc161a80f2989784bf5fd304b3a5b5657b1f481ade6af41c002b56f7d035e6`.
- Expected `pgcrypto` extension, runtime role, schema objects, legacy data-preservation checks, and core/runtime SQL checks passed.
- Upgrade baseline at 0020: one ledger, 20 completed/non-rolled-back entries, latest `0020_fixed_sensitive_release_policy`, PM indicator mappings `0`, runtime non-superuser/NOBYPASSRLS, and expected execute/RLS state.
- Exact 0021 delta: PM indicator mappings `0 -> 2`; total synthetic role mappings `0 -> 2`; `pathways.p06_can(text,uuid)` definition hash changed from `e04cd61a7ff366051b85ffc658a2ed9dc188ed3e0711dda3e64dd57b2b7fa408` to `2456fc0f9c86553eeabc6976c1d232985a861b6f1847ee848803967004b6b091`.
- Unchanged fingerprints: non-PM role mappings `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; permission definitions `9adbb7ed2f9b8a28a0f64c1c172c06278fa39b159268e27a07b359d9015d9fd7`; table shape `d0fadeed542ee99f85097ca62904a171b2a93a8751be619aa4ce00d12b6dfc15`; RLS state `ac2b7108386164feecaa0ce3229d81db97b07bf42882e245d55ee9f8472e6604`.
- Post-0021 execution: `pathways_runtime` retained execute; `PUBLIC`, `anon`, `authenticated`, and `service_role` remained denied. The runtime remained non-superuser/NOBYPASSRLS.
- Indicator RLS remained enabled on project indicators and enabled/forced on bindings and measurements.
- Independent runtime policy checks under `pathways_runtime`: assigned-project PM read/create/update and actual insert/update under RLS passed; foreign-organization and revoked-assignment PM writes were denied; M&E read/manage remained allowed; System Administrator, Program Manager, Grant Manager, and Project Officer indicator writes remained denied even with deliberately overbroad synthetic mappings.
- Feature-read runtime test: PASS, 1 test. C8 API/Prisma runtime test: PASS, 1 test. Core foundation, forms, import, Beneficiary, journey, indicator/dashboard, Phase 4 PM indicator, and legacy-preservation SQL suites: PASS.
- Focused API authorization, route-access, and indicator service suites rerun after the PG17 rehearsal: PASS, 286 tests.
- Protected query execution evidence with JIT off was about 0.18 and 0.32 seconds, within the unchanged bounded statement budget.
- An initial A1 attempt applied only through 0020 and stopped because the ignored diagnostic delta query had a parenthesis error. Migration 0021 did not run in that attempt and disposable cleanup passed. The corrected complete rerun produced all evidence above.
- Cleanup: the PG17 server stopped, the named disposable directory was removed, and port 55448 was released. `C:\pgsql\bin`, the PostgreSQL 18 service/data, and all valuable databases were untouched.

### 7.4 PATHWAYS-dev PostgreSQL 17.6 read-only preflight

- Target: PATHWAYS-dev, project reference `pdqwsknbzkdtiwjjibqt`.
- PostgreSQL: 17.6; JIT off.
- Prisma ledger: exactly one intended `_prisma_migrations` relation.
- Completed migrations: exactly 20; zero failed/incomplete; latest is `0020_fixed_sensitive_release_policy`.
- Repository/managed 0020 checksum: `d9c301f26d42fa9b52a5591c43584a900f1b7d0293726616a4bed9a74745f10c` on both sides.
- 0021 ledger rows: zero. Repository pending migrations: 0021 only.
- `pathways_runtime`: login enabled, non-superuser, NOBYPASSRLS.
- `pathways.p06_can(text, uuid)`: SECURITY DEFINER owned by the Prisma owner; executable by `pathways_runtime`, not by `anon`, `authenticated`, or `service_role`.
- Indicator RLS: enabled on all relevant tables; forced on bindings and measurements. The runtime is a nonowner NOBYPASSRLS role, so RLS also applies on project indicators.
- Relevant indicator policies: three; no unexpected widening found.
- Current permission mappings: Project Manager has zero indicator write mappings; M&E has both create/update mappings.
- Runtime-equivalent current result on assigned project `C8-VISIBLE-001`: Project Manager has monitoring read but not indicator create/update; M&E has monitoring read and indicator create/update. This is the expected pre-0021 state.
- Synthetic PM and M&E identities have active assignments in `C8-VISIBLE-001` and `C8-SUPPRESS-001`, ready for bounded post-deployment verification.
- Synthetic Project Manager: application user `8730035d-c917-45ea-84a9-44ec6b7dc047`, Auth identity `970e4bc6-4a7b-483f-b00a-67b237664384`.
- Synthetic M&E user: application user `92269933-2636-47e1-9e6d-a279484860cd`, Auth identity `f948e364-6b90-458c-93bb-6b3e709f7d23`.
- Assigned verification projects: `C8-VISIBLE-001` (`8973d659-8239-4bda-a369-8538aaff60d7`) and `C8-SUPPRESS-001` (`69274df3-ee07-46f4-b7dd-0494bcf0c401`).
- Active assignment IDs: PM visible `bd371f69-40a6-487a-8dee-8040e2fa80d4`, PM suppress `9f326535-a450-4dc6-a12b-8e53309f4f26`, M&E visible `3184d4fa-448d-40e4-b0a9-ec66d112c66f`, and M&E suppress `4bcf182c-fb14-45a9-8058-67ad55792f80`.
- Hosted writes during preflight: zero.

Work Package A1 repeated this preflight after the PostgreSQL 17.11 rehearsal. It again returned PASS with `transaction_read_only=on`, the same 20-migration ledger, 0021 absent, the same role/RLS/grant/assignment state, and `hostedWrites=0`.

### 7.5 Backup and recovery readiness

The protected pre-P07-W10 backup at `C:\PATHWAYS-backups\PATHWAYS-dev-pre-P07-W10-20260922-102116` targets the same PATHWAYS-dev project and completed at `2026-09-22T10:23:18.2036524Z`. Its archive is 821,847 bytes and its recorded and recomputed SHA-256 both equal `4ed438997ec208914d2eea644e29b99d476afa5123bbfcfcbae0dab14ba8f0b6`. It records 20 migrations through 0020 and contains 61 application-table data entries. A local restore completed at `2026-09-22T10:32:33.1241189Z`, matching 61 tables and 20 migrations. Managed writes were zero and the disposable restore target was removed.

Provider Auth/Storage content was intentionally excluded and represented only by an ID scaffold. That does not block 0021 because 0021 changes only application-database permission mappings and one authorization function. No managed write occurred after the backup during the integration closeout or this phase. Backup/recovery evidence is adequate for the exact 0021 rollout.

### 7.6 Exact managed approval phrase (prepared, not executed)

`APPROVE PATHWAYS-dev 0021_project_manager_indicator_access SHA256 b2cc161a80f2989784bf5fd304b3a5b5657b1f481ade6af41c002b56f7d035e6 ONLY; ADD PROJECT_MANAGER MAPPINGS TO THE EXISTING indicators.create AND indicators.update PERMISSIONS, REPLACE pathways.p06_can(text,uuid) ONLY SO ACTIVE PROJECT_MANAGER USERS WITH THE EXISTING VERIFIED IDENTITY, ORGANIZATION, AND ACTIVE PROJECT ASSIGNMENT CHECKS MAY CREATE OR UPDATE INDICATORS IN ASSIGNED PROJECTS, AND REASSERT EXECUTE ON THAT FUNCTION FOR pathways_runtime ONLY; NO OTHER ROLE/PERMISSION/GRANT/RLS/AUTH/STORAGE/FIXTURE/TIMEOUT/POOL/BYPASSRLS OR APPLICATION-DATA CHANGES`

This phrase is not authorization from this Phase 1 prompt. Migration 0021 was not deployed.

## 8. Proposed Backend Work Packages

| Order | Package | Included features / UCs | Dependencies | Schema/migrations | Provider actions | Test scope | Classification |
|---|---|---|---|---|---|---|---|
| A | Managed 0021 indicator rollout | PM indicator manage, UC008 | None; readiness complete | Apply existing 0021 only | One separately approved PATHWAYS-dev Database migration | Pre/post ledger, exact PM/M&E/denial/assignment checks, RLS/grant regression | Core-required; execute first |
| B | Finance ledger and approvals | Budget, expense, evidence, verification, approval, UC007 | Existing projects/activities/assignments/evidence | Existing schema expected; no migration unless implementation proves a narrow gap | None expected | Unit/service/controller, role/state-machine, RLS runtime, audit, UI client integration | Core-required; P0 |
| C | Collection closeout | Direct-entry draft list and form export, UC009-UC010 | Existing forms/submissions | No migration expected | None expected | Scoped list, export determinism, privacy, web adapter tests | Core/supporting; P1 then P2 |
| D | Project lifecycle | Full setup, team reassignment, archive, UC006 | Developer decisions on code, partners, sector, targets, assignment/archive semantics | Normalized project extensions likely; existing assignment/archive/budget reused | Database migration likely | Validation, assignment history, archive effects, RLS, audit, UI contract | Core-required; policy gate first |
| E | Beneficiary privacy and journey commands | Step-up, media, duplicates, enrollment/status/journey, UC012-UC014 | Developer decisions; existing Beneficiary APIs | Step-up/duplicate lineage likely; journey change unknown | Auth/Database and possibly Storage | Sensitive release, expiry, cross-scope denial, transition/idempotency, immutable history | Core-required; policy gate first |
| F | Evaluation workflow | Criteria/evaluations/scores/outcomes, UC016, UC018-UC020 | B plus indicators/evidence | Existing schema expected | None expected | Submit/approve separation, immutable scores, role/project scope, audit, UI integration | Core-required; P1 |
| G | Rules, alerts, and recommendations | Rule CRUD/activation, alert/recommendation/outcome lifecycle, UC018, UC019, UC023 | B and F signal sources; delivery decision | Existing core schema; delivery outbox only if authorized | Database migration/provider delivery only if approved | Rule evaluation, deduplication, recipient scope, outcomes, retry if in scope | Core-required; P1/policy gate |
| H | Analytics, reports, and exports | Saved layouts, trends/maps, reports, surveys, history/export, UC015, UC016, UC020-UC022 | B, F, privacy/suppression decisions | Layout/geodata and possibly generation-job/snapshot migration | Database/Storage likely | Aggregate correctness, suppression, artifact integrity, download authorization, UI flows | Core-required with supporting portions; policy gate |
| I | Publication and public tracker | Review, preview, publish, withdraw, public projection, UC025-UC026 | H and Beneficiary/privacy decisions | Versioned public projection likely | Database/Storage likely | Role separation, redaction, immutable version, public-only fields, withdrawal/cache | Core-required; policy gate |
| J | Administration and operations | Provisioning, profile, audit browse, labels, backup/restore, UC003-UC005, UC024 | Separate policy decisions and provider controls | Labels/permission changes possible; backup remains provider-owned | Auth/Database/Storage as separately approved | Identity linking, least privilege, audit immutability, recovery drill evidence | Mixed supporting/deferred; split before execution |

Each package must receive separate authorization. Package A is the single recommended next phase because it is isolated, fully specified, locally replayed, read-only preflighted, recovery-backed, and directly closes the only approved permission delta already present as a migration.

## 9. Developer decisions required

Only these policy choices remain unresolved; implementation details supported by source do not require developer decisions.

1. Project lifecycle: who generates/edits project codes; canonical partners and sector vocabularies; ownership of target-Beneficiary values; whether initial budget creation is part of project creation; atomic team replacement rules; archive/reopen effects on assignments and active workflows.
2. Beneficiary privacy: acceptable server step-up mechanism and expiry; whether provider AAL is required; duplicate link-versus-merge semantics and reversibility; allowed media types/retention; exact participation transition reasons and provenance.
3. Indicator reuse: link to a governed definition/version versus project-local copy/snapshot, and who may publish definition revisions.
4. Analytics: permitted map precision and source; small-cohort suppression; ownership/sharing of saved layouts; whether any trend must be an immutable snapshot.
5. Alerts: in-app-only versus external delivery; recipients, escalation, channels, retries, and retention.
6. Reports: required formats, privacy/suppression thresholds, snapshot date semantics, artifact retention, and download audit requirements.
7. Publication: approving/publishing roles where current policy and manuscript actors differ; redaction requirements; immutable snapshot/versioning; withdrawal and public asset retention.
8. Accounts/profiles: invite versus direct account creation; credential delivery; editable identity/profile fields; provider email/password change rules.
9. Audit: distinct audit-read permission and organization-wide versus own-event visibility.
10. Operations: backup/restore authority, required approvals, RPO/RTO, retention, and provider coverage.
11. Labels: whether the feature remains required and whether labels are organization, project, form, or user scoped.

## 10. Phase 1 disposition

- All current frontend-visible missing contracts were reconciled against source and prioritized.
- Dependencies, schema implications, and policy gates are recorded.
- Migration 0021 source/hash, tests, replay, managed preflight, and recovery prerequisite pass.
- The exact managed approval phrase is prepared and was not executed.
- No application feature implementation, managed mutation, Auth/Storage operation, P07-W10 action, UI redesign, role broadening, timeout/pool change, or push occurred.
- Recommended next phase: Work Package A, separately authorized managed rollout of migration 0021.

## 11. Work Package A1 disposition

- PostgreSQL 17.11 fresh replay and explicit 0020-to-0021 upgrade rehearsal: PASS.
- Exact PM/M&E/denial runtime matrix and RLS write checks: PASS.
- PostgreSQL 17 disposable cleanup: PASS.
- Final PATHWAYS-dev PostgreSQL 17.6 read-only preflight: PASS, hosted writes `0`.
- Protected backup checksum and restore-readiness recheck: PASS.
- Migration 0021 remains absent from PATHWAYS-dev and unapplied.
- PostgreSQL 18 service/data, system PATH, tracked replay harness, migrations, managed settings, Auth, Storage, and P07-W10 were not changed.
- Final readiness: `WORK PACKAGE A1 PG17 COMPATIBILITY = PASS`.
- Next step requires the exact separately supplied managed 0021 approval phrase in section 7.6.
