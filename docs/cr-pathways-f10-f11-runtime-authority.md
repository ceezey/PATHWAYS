# Change Record: F10/F11 Local Runtime Authority

**ID:** `cr-pathways-f10-f11-runtime-authority`

**Date:** 2026-09-26

**Status:** Approved; implementation and verification pending

**Approval:** Developer reply on 2026-09-26: "Approve this reviewed local authority proposal"

## 1. Decision and Scope

The developer approved this material boundary for local PRD-F10/F11 implementation and testing. It permits separate least-privilege background evaluation without changing the human permission matrix. The reviewed authority proposal has SHA-256 `a469543c660a6e4fae6c8b7939b2fd27eb5cd9f7c09525ceca7037bfcfa26016`.

The approved contract covers machine capabilities, explicit SYSTEM attribution, initial calendar equality, conservative configuration admission, private notes and legacy compatibility. Existing approved behavior remains: latest captured state, timeline applicability only for PLANNED/ONGOING projects and at most 20 active rules per project. Drafts/templates do not occupy active slots; replacing an active version retains its slot. Latest-state evaluation does not promise alerts for intermediate states never captured.

Approval permits reviewed local implementation/testing. It does not establish installed roles, available APIs, completed scheduler operation or engineering sign-off. Exact executable proposals, applicable specialist/design reviews, runtime tests, migration ordering and separately activated disposable runs remain required.

Hosted database or role changes, hosted credentials, scheduler provisioning and production merge/deployment are excluded. Private M&E proof-inspection/download retirement remains a separate pending decision. Reporting, finance, public tracker and unrelated features remain outside this change.

## 2. Current Contract and Traceability

The [Locked auth RFC](rfc-pathways-auth-rbac-isolation.md) continues to govern verified human identity, account state, organization, role, current database permission and project scope. Human rule administration remains Admin-only; alert/recommendation grants retain their existing role ceilings and project boundaries. Runtime identities remain non-superuser and NOBYPASSRLS; migration ownership remains unchanged.

[PRD-F10/F11](prd-pathways.md) requires deterministic typed rules, trusted metrics, explainable evidence and predefined human-reviewed recommendations. The [SDD](sdd-pathways.md) establishes trusted metrics, structured rule, snapshot, alert, recommendation and human outcome. The [Working rules RFC](rfc-pathways-rule-alerts-decision-support.md) distinguishes existing schema facts from proposed runtime behavior. Existing tables/enums do not prove implementation or approve unsupported metrics.

This approved exception specifies the machine boundary that the existing human-only protected-request chain does not provide. Human guards and permissions remain intact. Existing server configuration defaults `BUSINESS_TIME_ZONE` to `Asia/Manila` in `packages/config/src/env.ts`.

## 3. Approved authority

### Dedicated database sessions

Use separate `pathways_rules_worker` and `pathways_rules_sweeper` sessions with NOINHERIT, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE and NOREPLICATION; no memberships or caller SET ROLE path. Give no table ownership, direct source mutation, broad source SELECT, schema CREATE or inherited unsafe TEMP/CREATE privilege. Do not blindly revoke shared PUBLIC database rights: Review exact existing ACL effects before any local installation.

Entrypoint ownership is split among narrowly privileged NOLOGIN owners that are not source-table owners, have no login members and cannot bypass RLS. Private tables use FORCE RLS, explicit organization/project predicates and transaction/purpose/session/lease context. No browser, `anon`, `authenticated`, `service_role` or ordinary human runtime access to private machine routines. Default PUBLIC EXECUTE and new table privileges are revoked explicitly; no wildcard future grants.

| Identity | Permitted fixed capabilities | Explicitly excluded authority |
|---|---|---|
| Worker | Claim bounded queued project work; capture one scoped immutable snapshot; evaluate from that snapshot; commit deterministic alert/recommendation evidence and acknowledgement; release/retry owned lease; read fixed calendar identity | Human role/MFA impersonation; source writes; rules configuration; eligibility approval; human review/outcome; broad private notes/Beneficiary/financial reads; sweeping/bootstrap |
| Sweeper | Read bounded active project/rule anchors; enqueue idempotent hourly recovery generations using existing initialized project state; read calendar identity | Metric/source detail; capture/commit/evaluate; human actions; initialize missing state or claim/drain jobs |

Only current authorized source/configuration operations initialize project state or enqueue their supported work in the same mutation transaction. Missing state fails closed for machine callers. Source receipt and proof identities are database validated; an audit UUID or caller-provided scope/revision does not confer authority.

### Request boundary

Only exact POST controller-relative handlers `internal/rules/drain` and `internal/rules/sweep` receive the machine boundary, under the existing normalized `API_PREFIX` (default `/api`). Exact route matching uses registered handler/class metadata and verified Nest prefix behavior; no hardcoded unprefixed URL is accepted as a substitute. Use exactly one `Authorization` header with the strict value `Bearer <64 lowercase hexadecimal characters>` and no alternate header/query/cookie credential path. Reject duplicate raw Authorization headers, comma-joined values, malformed schemes and mixed human/machine metadata before comparison. DRAIN and SWEEP credentials are distinct server-only values, compared using a fixed-length constant-time comparison. Configuration is disabled by default; no examples contain credentials. Exact handler/class/method/purpose matching rejects mixed human/machine metadata. Empty body/query inputs cannot select org, project, SQL identity or a timing budget.

All ordinary protected handlers continue through the unchanged SupabaseAuthGuard delegate and existing role/current-operation checks. No Admin bypass, global unauthenticated exemption, browser machine credential, CORS widening or reuse of human PrismaService for machine sessions. Local tests must prove these exclusions before dependent shared guard wiring.

Request-entry deadline is bounded across guard, acquire/claim/capture/compute/commit/release and response. Drain admits at most 20 projects and 25 seconds per request; sweep at most 100 anchors and 25 seconds. Exact SQL/transaction deadlines, cancellation, lease expiry/retry behavior and sanitized errors require executable review and runtime tests. Neither a feature-enabled flag nor verification timestamp proves those checks passed.

### Attribution and audit

New machine-created alert/recommendation rows use explicit SYSTEM attribution and null human evaluator/proposer IDs. HUMAN rows require their genuine actor references. Existing rows/actor foreign keys retain their values; no fabricated human identity or historical conversion. System lifecycle/audit records identify system origin, project/org, operation/evaluation and immutable provenance without pretending a verified MFA actor performed them. Human reviews/outcomes retain current verified actors, exact existing grants, revision guards and append-only audit history.

## 4. Calendar, exposure and human behavior

Initial DB calendar is version 1, zone `Asia/Manila`. Machine startup compares the fixed DB identity with the existing server `BUSINESS_TIME_ZONE`, checks runtime support and fails closed on mismatch. Capture pins zone/version/reporting date; commit rechecks current calendar identity under common state protection. Client timezone/GUC input never establishes calendar authority. Future calendar changes require separately reviewed maintenance and a forward version change; no online calendar editor is introduced.

No approval UUID is invented. Initial calendar provenance must reference the actual recorded approval of this CR using the final reviewed representation; until that exists, migration seed/provenance remains incomplete.

Project configuration admission examines current whole-rule exposure of all active contributors under state protection. If any is inaccessible, every project-bound create-copy/draft/activate/replace/archive operation returns the same 403, "Project rule configuration is unavailable under your current authority.", before candidate/capacity/receipt-dependent behavior or writes. No hidden contributor IDs/counts/reasons are returned. When all contributors are accessible, the unchanged approved cap applies; the 21st activation returns a conflict without mutations. Unbound organization template authoring retains its separate Admin-only scope. This conservative restriction prevents inferring hidden occupancy and is explicitly part of the requested product decision.

Human outputs omit freeform review/disposition/outcome note bodies for every role, including Admin and legacy rows. Notes remain required where applicable and are preserved privately; authorized operation-bound helpers may use the actor's own stored preview note internally for confirmation. Read/history/preview/notification/export/retry DTOs provide safe fixed summaries without note content or `notesRecorded`/note-presence metadata. They never infer note existence from inaccessible review/outcome rows, private tables or hidden counts. Any future note-presence projection requires its own explicit authorized existence contract. No generic note reader, note audience or inspection purpose is granted. Rule metrics and project access do not declassify note content.

In-app notification supporting reads/writes derive recipient from the current linked user and require current relevant alert/recommendation permission, project scope and whole-resource eligibility before query/count/read acknowledgement. Preview, confirmation and delivery independently recheck recipients. This adds no notification permission seed and no broad profile-route data authority.

## 5. Legacy and migration compatibility

Preserve all applied SQL/archive bytes and checksum exceptions, the single Prisma ledger, old rows, legacy actor/status/outcome values and legacy triggers' original behavior. Forward migration may add explicit runtime discriminator and nullable SYSTEM attribution with compatible defaults/checks. Existing legacy ACTIVE rows remain outside new runtime evaluation/API predicates; they are not silently promoted or reinterpreted as new metric contracts.

New runtime guards are additive reviewed branches, with exact relation/intent/provenance checks. Original legacy CHECK/index/identity/actor/no-delete semantics remain effective for legacy rows. No destructive backfill, column/history removal, down migration or broad direct table grant is authorized. Populated legacy upgrade and exact ACL/RLS/trigger behavior must be verified before acceptance.

Core supporting migrations precede dependent F10/F11 migrations; verify the combined result after integration. This CR does not approve unfinished migration bodies or activate a disposable database run. Hosted application requires separate target/ledger/catalog/backup/restoration and preview evidence plus explicit application approval.

## 6. Alternatives and Restraint

Human-session impersonation, privileged shared Prisma fallback and browser polling of private trusted metrics are excluded. Keep machine operation disabled until the approved boundary and exact implementation pass required review/testing. No new dependencies, broad service-role authority or unrelated runtime subsystem are required.

## 7. Verification and Recovery

Before dependent implementation, complete exact source begin/finish/proof/retry bodies, feature-intent guards, private note storage, admission and owner/column ACL/RLS proposals. Apply matching SAD specialists and design QA concurrently. Approval cannot turn missing or BLOCKED technical evidence into PASS.

Required local evidence covers unchanged six-role ceilings; current account/assignment/permission revocation; organization/project isolation; forged/mixed purpose; native role/ACL negatives; SQL/TypeScript metric and lifecycle parity; unavailable values and invalid denominators; dedup/latest-state coverage; lease expiry/lost committed acknowledgement; receipt body mismatch; private-note and note-presence omission; concealed-capacity denial; notification rechecks; rollback, real lock ordering/concurrency and populated legacy preservation. Browser/accessibility and integration verification remain part of feature acceptance. Validate final digest-bound SAD evidence and documentation checks.

Recovery disables machine dispatch while preserving append-only evidence and source history. Claimed work follows reviewed bounded completion/expiry rules. No automatic reset, ledger deletion, historical restoration or credential provisioning is authorized. Any destructive reversal requires separate preservation/recovery authorization.

## 8. Approval and Disposition

The developer explicitly approved the reviewed local authority proposal on 2026-09-26 with the reply "Approve this reviewed local authority proposal". Approval is limited to sections 3-5 and the stated local implementation/testing scope. It does not waive exact-content SAD/runtime gates, activate replay or authorize hosted/scheduler/release work. No approval UUID is fabricated; implementation must use a reviewed provenance representation referring to this actual decision.

This record is Approved, not Applied. Human authorization remains effective; the proposed machine capability remains disabled and unavailable until implementation and required verification establish otherwise. Private proof inspection/download retirement is unapproved by this record.

Registered follow-on work reconciles the auth exception and supporting notifications, Working rules lifecycle/metrics/snapshot/retry contract, SDD security/schema/runtime sequence, QAD cases and OPS disabled/provisioning/recovery limits as exact behavior becomes implemented and verified. Update the index in the same change. Do not claim feature availability or mark this record Applied from documentation-only approval.
