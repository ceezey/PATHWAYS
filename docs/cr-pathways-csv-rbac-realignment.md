# Change Record: CSV RBAC Realignment

**ID:** `cr-pathways-csv-rbac-realignment`
**Date:** 2026-09-26
**Status:** Approved; checksum exception accepted, development application pending

## 1. Trigger

The developer requested RBAC realignment before repairing unusable core features, then explicitly approved the implementation plan. Existing permissions, route checks, and database predicates carry grants that conflict with the supplied CSV, including Project Officer alert review introduced by 0023.

## 2. Current Contract

Six canonical roles, Supabase identity, database-linked account and organization, active permission grants, project assignments, runtime RLS, consent/provenance, and the Locked SADDD protections exist. Several broad permissions couple supporting reads to denied detail views. Finance, evaluation, reporting, alert, publishing, and administrative handlers are incomplete.

## 3. Approved Change

Adopt the source filename/hash, normalized row mapping, detailed-row precedence, retained unique overview grants, and complete effective atomic matrix in [the auth RFC](rfc-pathways-auth-rbac-isolation.md). Deny unlisted discretionary actions. Separate supporting reads from detail access. Preserve automatic authorization and audit recording. Restrict Program/Grant beneficiary and assessment access to aggregates. Preserve the approved user hierarchy and explicit assignment boundaries, including Admin assignment of Grant Managers. Financial approval means M&E verification, PM approval, then Program/Grant final sign-off with actor separation. “Program Directory & Sign” means final program sign-off.

## 4. Impact

### Product and API

Align existing handlers and guards with the atomic matrix. Permission definitions for absent handlers establish future boundaries without implementing core-feature repairs. Target beneficiaries and project target goal remain in project creation and the activity/indicator workflow. Project context reads select only id/code/title/status for roles denied project detail. Opaque enrollment support does not grant Admin a beneficiary profile.

### Data and Migration

Add forward migration `0026_csv_rbac_realignment`. Preserve 0001-0025 byte-for-byte in this change, the single public Prisma ledger, business data, Auth, Storage, and historical assignments. Normalize role and permission reference names explicitly in the forward correction, preserving existing IDs. Canonical codes, active states, and exact grants govern authorization. Replace superseded scope predicates and add restrictive RLS/trigger checks. Preserve original lifecycle, actor-separation, consent, and SADDD guards. Do not loosen or invoke the historical bootstrap runner.

### UI and Documentation

Preserve design and existing layouts. Align navigation and action visibility, consuming the same canonical ceiling as the API. Update PRD-F1, SDD security, QAD, RFC, registry, and operating position; do not lock unrelated contracts or claim missing handlers work.

## 5. Alternatives

Keeping legacy grants would violate detailed CSV decisions. Editing, squashing, or rebaselining applied migrations would discard history and is rejected. Building missing feature handlers would exceed this phase. A small explicit matrix, forward migration, and existing authorization patterns are sufficient.

## 6. Application and Recovery

Use the guarded local replay harness on disposable PostgreSQL. Before development application, verify the exact PATHWAYS-dev target, ledger/checksums, a restorable protected backup, and coordinated development runtime changes. Apply only the tested forward migration through Prisma. Recover an interrupted application using its transactional result and read-only ledger checks before retry; do not rewrite ledger rows. Any later reversal requires a separately reviewed forward migration. Backup restoration is separately authorized destructive remediation.

0015 matches the original SQL with CRLF line endings. The original applied 0020 SQL is unavailable. On 2026-09-26 the developer explicitly approved acknowledging its historical checksum mismatch and proceeding with tested 0026. Read-only catalog comparison verifies current definitions against unchanged historical replay; originally applied file bytes remain unverifiable. Preserve both the repository file and recorded ledger checksum. This exception applies only to the verified 0020 mismatch; additional drift stops application.

## 7. Verification

API/frontend regression suites, type checks, builds, documentation materialization/checks, historical SQL suites, fresh/upgrade replay, catalog parity including policies/functions/triggers/ACLs, runtime role ceilings and grants, assignments and role hierarchy, account-state and forged-scope denial, supporting-read restrictions, aggregate-only privacy, native project creation, revocation, and guarded backup restoration. Remote verification remains read-only. Verification results are reported in chat; disposable evidence stays outside durable documentation.

## 8. Approval

Developer explicitly approved the supplied implementation plan on 2026-09-26. The approved scope includes PATHWAYS-dev forward correction after safety checks and excludes production release and subsequent feature repairs. The developer confirmed target beneficiaries are part of project creation and the activity/indicator workflow; retain them. The developer subsequently approved the 0020 checksum exception and authorized committing/pushing the prepared changes to dev, verifying both Vercel development previews before applying 0026, and publishing the verified contract status updates.

## 9. Disposition

Approved. Local enforcement and required local checks are verified. The 0020 historical checksum exception is accepted. Do not mark Applied or the auth RFC Locked until required checks and existing enforcement, including PATHWAYS-dev and both Vercel development previews, match the matrix. Missing handlers remain deferred.
