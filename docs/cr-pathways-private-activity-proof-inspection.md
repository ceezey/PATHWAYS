# Change Record: Private Pending Activity-Proof Inspection

**ID:** `cr-pathways-private-activity-proof-inspection`

**Date:** 2026-09-27

**Status:** Approved; local implementation and verification pending

**Approval:** Developer reply on 2026-09-27: "Approve this local inspection and old-route withdrawal proposal"

## 1. Decision and Scope

The developer approved the exact reviewed proposal with SHA-256 `8ff8aad285ea7d6e3878221721511607f48c0f5fd144200279e9c7ce86076547` for local implementation and tests. It supports PRD-F1/F2 pending activity verification. It does not certify an installed endpoint, safe storage transfer or release readiness.

Permit a separate purpose-limited private inspection for assigned, distinct M&E reviewers with both current `evidence.read` and `evidence.review`. Withdraw the existing generic uploader/PO/PM/post-review raw-download capability after the reviewed inspection path and review UI are implemented together. No fallback old URL inherits the new purpose. Non-pending or historical inspection remains unavailable.

No consent/classification flag, publication guard, permission seed, role ceiling, schema or migration is changed by this decision. Hosted database/storage application, scheduler provisioning and production merge/deployment remain excluded.

## 2. Admission and Output

Use the complete verified human identity/account/organization/role/grant/project-assignment chain. Require the canonical M&E role and both atomic grants, rather than authorizing from a role string alone. Scope before retrieval to exact organization/project/activity/update/proof identities, FOR_REVIEW activity, PENDING update and proof, private complete storage, distinct submitter/reviewer and matching activity/update/evidence revisions. Proof submitter must equal update submitter and differ from reviewer. Require pure progress/completion activity-proof lineage; exclude Beneficiary, submission, enrollment and expense lineage. Every sibling upload must be complete.

Proposed routes under the existing API prefix:

- `GET /projects/:projectId/activities/:activityId/updates/:updateId/inspection-context`
- `GET /projects/:projectId/activities/:activityId/updates/:updateId/proof/:evidenceId/inspection`

Validate UUIDs and strict expected-revision query inputs. Context returns only activity/update identifiers and revisions plus at most five proof identifiers, generic `Activity proof` labels and evidence revisions. Bound discovery to six and reject overflow; order by proof identifier. No names, notes, identities, MIME, storage keys or URLs enter output. Context is advisory and transfer reauthorizes independently.

Malformed input returns 400, missing grants/role 403, inaccessible or unsupported lineage 404, authorized stale revisions 409 and sanitized operational failure 503. Denied admission performs no object-body read. Do not echo private/provider exceptions.

## 3. Bounded Transfer and Audit

Read one object outside database transactions from the configured server-only service origin. Permit configured HTTPS only; loopback HTTP belongs solely to separately injected synthetic tests. Use fixed encoded bucket/object paths derived from authorized context, require its authorized organization/project/evidence prefix, reject unsafe key segments and redirects, and verify the bucket is private before and after the body.

One ten-second storage deadline covers both bounded bucket metadata reads, connections and counted object chunks. Metadata bodies are at most 16 KiB. Proof size must be a recorded positive integer at most 10 MiB with a recorded 64-hex SHA-256 digest. Count streamed bytes independently of Content-Length, abort on overflow/disconnect/deadline and require exact final size/digest. An unbounded SDK Blob read followed by a length check is insufficient.

Buffer only the bounded verified object. Before response admission, run a fresh authorized transaction that rechecks live permissions, assignment, pending states, lineage, immutable object identity and all revisions, then commits a fixed human-attributed `EVIDENCE_PRIVATE_INSPECTION_AUTHORIZED` audit event. Release no bytes before that transaction succeeds. Audit contains the fixed verification purpose, scoped identifiers and checked revisions; omit content, notes, filenames, storage keys, digest, tokens and provider errors. It records admission, not completed client delivery or classification.

The complete request has a thirty-second ceiling including acquisition, authorization, storage and response admission. Actual cancellation and deadline behavior require executable verification; a JavaScript race alone does not certify it.

Respond as `application/octet-stream`, attachment `activity-proof.bin`, with nosniff and private/no-store. Reject range bypass; HEAD retains the same authorization. No inline preview, signed/public URL, blob/query/session cache or automatic download. Pending review controls retain keyboard access, labelled loading/error states and separate approve/return authority.

## 4. Consent and Legacy Disposition

Retain existing `consentConfirmed=false` and `isIdentifying=true` defaults and all publication restrictions. This approved private pending-verification purpose may inspect identifying/unclassified bytes; it does not classify them, establish consent or authorize wider release. Admin/Program/Grant remain metadata-only; PO/PM and uploaders gain no inspection capability. After the update leaves pending verification, this route denies further access. Previously transferred bytes cannot be retracted.

The old generic download route returns uniform capability denial under current authorization after coordinated withdrawal. Do not redirect around update/revision binding or use the old URL when inspection fails.

## 5. Verification and Acceptance

Before implementation require exact proposed-code isolation/privacy/design review. Final acceptance requires all-role and individual-grant denial, assignment/account/org revocation, self-review and cross-scope denial, pending/revision/lineage/sibling checks, private-bucket/redirect/size/digest/deadline/disconnect cases, revocation or review during storage I/O, audit-failure withholding, safe headers, old URL/HEAD/range denial and accessibility checks. Use synthetic fixtures. No authenticated browser/storage runtime or engineering approval is claimed by this Change Record. Mark Applied only after required implementation, current-content reviews and verification pass.
