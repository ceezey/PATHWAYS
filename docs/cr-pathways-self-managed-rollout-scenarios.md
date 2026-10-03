# Change Record: Self-managed rollout and realistic scenarios

**ID:** `cr-pathways-self-managed-rollout-scenarios`

**Date:** 2026-09-27

**Status:** Approved; implementation and verification pending

**Approval:** Developer explicitly requested implementation of the reviewed feature completion, realistic data replacement and Supabase rollout plan on 2026-09-27. Prior decisions select trusted postgres administration, separate Singapore staging, retained staging, controlled outage, and retirement/replacement of old test accounts. Diagram alignment is deferred.

**Current phase:** The latest developer decision on 2026-09-27 defers synthetic population and authenticated system-user provisioning. The developer's team will populate the system and perform manual acceptance testing. Complete and verify Core and Alerts code, then push the reviewed source to dev. Staging/live schema application, data replacement, account retirement, Administrator sign-in and master release remain deferred. Existing local rehearsals do not establish hosted installation or feature availability.

## 1. Trigger and current contract

PRD-F1 through PRD-F13 require coherent persisted workflows. Integrated core repairs and F10/F11 code are on dev at eef965169d6bd5f5428cb9f61dca13ce98afff7c. Reporting and public APIs, finance/evaluation integrations and some supporting handlers remain incomplete. Populated records alone cannot establish feature acceptance.

The unapplied 0031 migration rejects all final memberships involving its sixteen feature roles. Hosted PostgreSQL 17 creates an automatic bootstrap-granted creator ADMIN membership that ordinary postgres cannot remove. The developer accepts postgres as a trusted control-plane administrator, separate from application identities. Its ADMIN authority can grant access later; INHERIT FALSE and SET FALSE are not isolation from a compromised administrator.

## 2. Approved changes

### Role provisioning

Permit only the exact hosted creator relationship for each named feature role: member postgres, grantor supabase_admin, ADMIN TRUE, INHERIT FALSE, SET FALSE. Verify role identities and grantor attributes, reject duplicates/unexpected memberships and indirect application access. Preserve the reviewed local superuser-created zero-membership profile for PostgreSQL portability. All feature role attribute restrictions remain effective.

Update installation prerequisites and runtime readiness together. Installation retains fourteen exact temporary prisma owner memberships with ADMIN FALSE, INHERIT TRUE, SET TRUE, issued by the verified provisioner. Cleanup removes temporary memberships and schema/database privileges after success or failure while preserving hosted automatic creator grants. Never add redundant ADMIN grants or attempt to revoke the bootstrap grant. Existing prisma flags and canonical human permissions remain unchanged.

### Feature purposes

Use current PRD, SDD, approved RFCs, Change Records and QAD as implementation authority. Complete approved F1-F13 gaps and existing permitted finance, evaluation, private evidence, own-profile and administration workflows. Implement server-scoped reads/writes and explicit safe DTOs; preserve current UI and the six-role ceiling. Denied/deferred discretionary capabilities remain excluded. Reporting and public outputs retain aggregate-only, suppression and explicit publication requirements. No new human permission seed is approved.

### Additive feature contracts

F12 reporting requires a separate permission-checked projection because reports.indicator.read is granted to roles that cannot read the monitoring module. Reuse the trusted indicator calculation and retain assignment scope, unavailable-data semantics and suppression. A dedicated NOLOGIN, NOBYPASSRLS projection owner receives only the reviewed columns and RLS policies needed for reporting. Do not broaden monitoring permissions or expose beneficiary detail to aggregate-only roles.

Training-survey direct entry may optionally link a new nullable beneficiary_id to a consented, live individual enrolled in the same organization and project. The existing submission table has no contributor column; the unapplied forward migration must add this relationship with tenant and project integrity checks while preserving existing anonymous records. Existing submission authority and fresh beneficiary-detail permission are both required for identified saves, retries, submission and owned record retrieval. Omission remains anonymous. A saved contributor cannot be retargeted; a separate response requires an explicit new-record action. Anonymous responses remain outside identified-person aggregates. The survey report joins beneficiary_id to the current active enrollment; training surveys retain their existing prohibition on enrollment_id. The report owner receives only the additional provenance and consent columns required for that check. Indicator calculations and human permission grants remain unchanged.

The postgres-owned runtime context helpers require direct EXECUTE grants to the report and finance NOLOGIN owners from verified postgres, without GRANT OPTION. Prisma receives no permanent helper grant. Provisioning verifies the unchanged helper definitions and exact ACL before and after granting access. Successful installation retains only the required direct grants; failed installation removes them and verifies the original ACL after temporary membership and installation privilege cleanup. Migration and runtime readiness checks use the same exact final predicate.

F13 uses a new revisioned publication snapshot rather than mutating a project through its protected update path. Preserve existing publication permissions and organization/project scope. Record submission, approval, publication and withdrawal actors/times; require a distinct approval actor. Publish only an explicitly approved frozen allowlist of project summary fields. Public reads require the current published revision, an active organization and an unarchived project; withdrawal is immediately effective and responses are not cached. Beneficiary counts, assessment details, budgets, indicators and private media are excluded unless separately authorized and approved for publication.

Finance final sign-off uses an additive immutable record with one sign-off per expense and a verified authorized actor/time. Do not infer final sign-off from a legacy expense status alone. A separate NOLOGIN, NOBYPASSRLS finance operation owner supports fixed permission-checked submission, own acknowledgement, eligible budget references and purpose-bound receipt finalization. Existing expense guards require budget context; satisfying that dependency must not grant budget amounts to Project Officers or Monitoring and Evaluation Officers. Preserve financial lifecycle, provenance, current actor checks and audit atomicity. Evaluation work remains limited to existing granted operations; denied submission, approval, archival and sign-off actions remain excluded.

These compatible additions require a new canonical forward migration after 0033, reviewed independently before implementation. They do not rewrite the applied ledger, expand the six human roles or alter the sixteen-role F10/F11 runtime contract. Any additional projection owner has its own exact provisioning/readiness/cleanup checks under the same trusted administrator boundary.

### Scenario dataset and replacement

Create a reproducible connected fictional dataset for two organizations and all six staff roles, covering realistic projects, beneficiaries, journeys, collection/imports, measurements, finance, evidence, evaluations, reports and public/private states. Include happy, sad, abuse, retry, recovery and SADDD boundary cases. Generate audit and runtime evidence through supported workflows, including bounded dedicated-worker evaluation for scenario generation only. Ongoing worker dispatch and schedulers remain disabled.

Replace only verified old synthetic records from an exact ID/count/dependency/Storage manifest. Preserve administrator access, canonical reference data, applied migration ledger/checksums, audit history and historical references. Revoke/retire old test logins and archive their profiles; replacement Auth identities use supported administration without invitations. Delete old Auth identities only after dependency and Storage ownership checks. No schema truncation, trigger disabling, blind name/prefix deletion or audit rewriting is permitted. Unidentified or protected-history conflicts stop dependent cleanup.

On 2026-09-27, read-only inspection confirmed that eight of eleven existing project graphs contain nondeletable historical records. The developer explicitly approved archiving protected synthetic graphs and replacing active data, then confirmed that all eleven individually listed existing projects are synthetic test projects. Retain this attestation in the external target-pinned manifest with exact project IDs. Preserve their immutable history and required parents; physical deletion remains limited to individually verified records whose complete dependency and Storage closure permits removal. Future records are not certified as synthetic from their names alone.

The developer also confirmed that the five existing non-Administrator staff accounts in the primary organization and the isolation organization's Administrator are test accounts to retire. Preserve the primary organization's main Administrator identity. End active activity assignments before project assignments, then archive the six profiles under the existing lifecycle constraints. Preserve historical actor references and timestamps; Auth identity removal remains a separate operation after session revocation and verification of both Storage ownership columns and Auth dependencies.

Remove gibberish from active business records and interface copy. Historical audit evidence remains unchanged. Protected backup and rehearsed restoration precede live destructive work. Database, Auth and Storage partial completion must be recorded and safely resumable.

## 3. Target and release

The authorized retained staging project is PATHWAYS-devV2 in ceezey's Org, Singapore ap-southeast-1, PostgreSQL 17. Project ref klbtoqdalmcsfjqophty was created under the confirmed zero monthly project quote. No upgrade or change to the inactive existing project is authorized.

The existing production-used PATHWAYS-dev target remains pdqwsknbzkdtiwjjibqt. Its latest verified forward migration is 0028; 0029-0033 and feature roles are absent. Recheck before application. Rehearse pre-upgrade synthetic cleanup, fresh/upgrade migration, new dataset and failure cleanup in isolation first. Verify both exact-source dev previews before live application.

The previously authorized live replacement and canonical Prisma forward deployment are deferred by the latest phase decision. Their reviewed procedure remains a controlled outage after backup/restore and security gates pass: block new runtime sessions, drain only runtime sessions, preserve original login settings, pair reviewed code/schema and perform controlled smoke before reopening traffic. Master merge/push is outside the current phase. Force pushes and migration shortcuts remain prohibited. No hosted data or account changes occur during the current source release.

## 4. Verification and recovery

Require exact role graph/attribute/grantor/duplicate/indirect-escalation negatives; fresh and populated upgrade; preserved ledger; real role runtime behavior; cleanup after success and faults; compilation, recovery and idempotence. Verify all approved feature happy/sad/abuse paths, private/public boundaries, unavailable metric semantics, SADDD 0/1/4/5 and complementary suppression, valid Storage objects, UI integration/accessibility and absence of active gibberish.

Review proposed source with matching SAD specialists/design QA before implementation and renew final digest-bound evidence. No prior source sign-off certifies changed SQL. Any failure stops dependent work with bounded evidence. No automatic database reset, Prisma resolve, ledger editing, historical restore or destructive rollback is approved.

## 5. Alternatives and disposition

Provider/superuser intervention was rejected in favor of an explicitly accepted trusted administrator relationship. Weakening application isolation, using privileged shared runtime credentials or fabricating SYSTEM records is excluded. Diagram alignment remains deferred.

This decision is Approved, not Applied. Register verified final repository and hosted facts only after their corresponding gates pass.
