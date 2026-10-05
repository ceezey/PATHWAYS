# Change Record: Private Pending Activity-Proof Inspection

**ID:** `cr-pathways-private-activity-proof-inspection`

**Date:** 2026-09-27

**Status:** Approved; local implementation and verification pending (amendment proposed 2026-10-06, see section 6)

**Reading note:** if section 6 is approved, it supersedes the `application/octet-stream` response type and the "no inline preview" and "blob cache" bans in section 3 for the inspection route only. Everything else in sections 1 to 5 stays in force.

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

Read one object outside database transactions from the configured server-only service origin. Permit configured HTTPS only. The sole exception is plain HTTP to a loopback host (127.0.0.1, localhost or [::1]) outside production, for the local Supabase stack approved in [admin read access](cr-pathways-admin-read-access.md) section 2.1; separately injected synthetic tests keep their own loopback transport. Use fixed encoded bucket/object paths derived from authorized context, require its authorized organization/project/evidence prefix, reject unsafe key segments and redirects, and verify the bucket is private before and after the body.

One ten-second storage deadline covers both bounded bucket metadata reads, connections and counted object chunks. Metadata bodies are at most 16 KiB. Proof size must be a recorded positive integer at most 10 MiB with a recorded 64-hex SHA-256 digest. Count streamed bytes independently of Content-Length, abort on overflow/disconnect/deadline and require exact final size/digest. An unbounded SDK Blob read followed by a length check is insufficient.

Buffer only the bounded verified object. Before response admission, run a fresh authorized transaction that rechecks live permissions, assignment, pending states, lineage, immutable object identity and all revisions, then commits a fixed human-attributed `EVIDENCE_PRIVATE_INSPECTION_AUTHORIZED` audit event. Release no bytes before that transaction succeeds. Audit contains the fixed verification purpose, scoped identifiers and checked revisions; omit content, notes, filenames, storage keys, digest, tokens and provider errors. It records admission, not completed client delivery or classification.

The complete request has a thirty-second ceiling including acquisition, authorization, storage and response admission. Actual cancellation and deadline behavior require executable verification; a JavaScript race alone does not certify it.

Respond as `application/octet-stream`, attachment `activity-proof.bin`, with nosniff and private/no-store. Reject range bypass; HEAD retains the same authorization. No inline preview, signed/public URL, blob/query/session cache or automatic download. Pending review controls retain keyboard access, labelled loading/error states and separate approve/return authority.

## 4. Consent and Legacy Disposition

Retain existing `consentConfirmed=false` and `isIdentifying=true` defaults and all publication restrictions. This approved private pending-verification purpose may inspect identifying/unclassified bytes; it does not classify them, establish consent or authorize wider release. Admin/Program/Grant remain metadata-only; PO/PM and uploaders gain no inspection capability. After the update leaves pending verification, this route denies further access. Previously transferred bytes cannot be retracted.

The old generic download route returns uniform capability denial under current authorization after coordinated withdrawal. Do not redirect around update/revision binding or use the old URL when inspection fails.

## 5. Verification and Acceptance

Before implementation require exact proposed-code isolation/privacy/design review. Final acceptance requires all-role and individual-grant denial, assignment/account/org revocation, self-review and cross-scope denial, pending/revision/lineage/sibling checks, private-bucket/redirect/size/digest/deadline/disconnect cases, revocation or review during storage I/O, audit-failure withholding, safe headers, old URL/HEAD/range denial and accessibility checks. Use synthetic fixtures. No authenticated browser/storage runtime or engineering approval is claimed by this Change Record. Mark Applied only after required implementation, current-content reviews and verification pass.

## 6. Proposed amendment 2026-10-06: in-modal preview for the inspecting reviewer

**Status: Proposed, awaiting developer approval.** The developer asked on 2026-10-06 for proof downloads to show what the file looks like before it is saved, as budget receipts now do through `ProofPreviewDialog`.

**Decision.** The assigned M&E reviewer admitted by sections 2 and 3 may view the inspected proof inside a modal before choosing to save it. Admission, the bounded transfer, the final authorization transaction and the `EVIDENCE_PRIVATE_INSPECTION_AUTHORIZED` audit event are unchanged, and so is the set of people who can inspect. No new route, permission, grant, role, schema or migration is introduced.

**Response type.** The inspection response carries the evidence row's recorded content type instead of `application/octet-stream` only when all of these hold; otherwise it keeps `application/octet-stream`:

- the recorded type is in the approved activity evidence list (`application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `video/quicktime`, `video/webm`);
- the upload was recorded as verified; and
- the first buffered bytes pass `matchesEvidenceSignature` for that type before any header is sent.

The response keeps `Content-Disposition: attachment` with a generic name and the matching extension (`activity-proof.pdf`, `.jpg`, `.png`, `.webp`, `.mp4`, `.mov` or `.webm`), `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, range rejection and the same HEAD authorization. The inspection context output is unchanged and still omits MIME.

**Client handling.** The web client fetches the body only after the reviewer opens Preview. It holds the bytes in memory as one Blob for the lifetime of the modal and creates the object URL only after the complete, integrity-checked body arrives. It revokes the URL on close, unmount or retry. Nothing is written to the query cache, session storage, local storage or a service worker. Saving happens only when the reviewer presses Download, reusing the same Blob with no second request, so the audit trail still records one admission per transfer.

**Rendering.** Images render in `<img>`, PDFs in an `<iframe>`, and video in `<video controls>`. Any other type, or a type the browser cannot play (often `video/quicktime`), shows "Preview not available" with Download still available. Only the content types listed above ever reach a renderer. HTML, SVG and script types are never rendered, which keeps the unsandboxed PDF iframe safe.

**Unchanged limits.** The 10 MiB size cap, the thirty-second request ceiling and the pending-only window still apply, and bytes already shown cannot be retracted, as section 4 already states for downloads. The upload list includes video, but proof files above 10 MiB stay unavailable for both preview and download.

**Verification on approval.**
- API tests: each allow-listed type returns its recorded type and extension; a signature mismatch, an unverified upload or an unlisted type returns `application/octet-stream`; nosniff and no-store headers are present; range and HEAD behaviour is unchanged; and a denied admission still reads no body.
- Web tests: the inspection control opens the modal, renders by type, revokes the URL on close, and downloads with a single fetch.
- Before merge: an isolation, privacy and design review of the exact code by organization-isolation-checker, beneficiary-privacy-guardian and design-qa-agent.
