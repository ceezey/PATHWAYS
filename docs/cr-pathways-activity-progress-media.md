# Change Record: Activity Progress Media Uploads

**ID:** `cr-pathways-activity-progress-media`

**Date:** 2026-09-28

**Status:** Approved; implementation pending

## 1. Trigger

Audit finding H (2026-09-28, `dev` at `002d3ac`) for PRD-F2 activity progress.

- **Record progress takes no files.** "Record progress" sends JSON only (`recordProgress`, `activities.service.ts:1110`).
- **Proof goes through the API as multipart.** Limits are up to 5 files, 10 MiB each and 25 MiB in total (`activities.service.ts:246-254`; `activities.controller.ts:122-123`).
  - The development plan records that Vercel functions cap request bodies at about 4.5 MB. Hosted proof uploads above that size would then fail before reaching the handler. This is verified in section 7.
- **The client MIME type is trusted.** The file type is taken from `file.mimetype` (`activities.service.ts:265`). The SHA-256 is computed from the buffered upload (`:288`).
- **MP4 is the only video type.** This holds in the API (`:246-252`), the web dialog (`activity-proof-dialog.tsx:131-150`) and the database canonical request (below).
- **A new selection replaces the previous one** (`activity-proof-dialog.tsx:323-329`, `setFiles(Array.from(...))`).
- **PHOTO and VIDEO are never used.** `EvidenceType` defines them (`schema.prisma:1669-1675`), but activity-update evidence is written as `PROGRESS_PROOF` or `COMPLETION_PROOF` (`activities.service.ts:1353`).

The developer decided on 2026-09-28:

- direct signed upload;
- MP4, MOV or WebM;
- up to 10 files;
- `EVIDENCE_MAX_FILE_BYTES` with a 50 MB default, because the hosted Supabase project is on the Free plan (50 MB per-file cap), raisable to 100 MB after an upgrade;
- videos stay private.

## 2. Current Contract

- **[Private activity-proof inspection](cr-pathways-private-activity-proof-inspection.md) (Approved).**
  - Context returns at most five proof identifiers, with discovery bounded to six (section 2).
  - Proof size must be a recorded positive integer of at most 10 MiB with a recorded SHA-256 (section 3).
  - One ten-second storage deadline; a thirty-second request ceiling.
  - Only the bounded verified object is buffered, and no bytes are released before the final authorization and audit transaction.
  - The response is an `application/octet-stream` attachment. No signed or public URL. No inline preview.
  - The repository enforces the proof bounds at `private-proof-inspection.service.ts:140-142` (discovery `take: 6`, more than five rejected) and `:156` (more than 10485760 bytes rejected).
- **Migration 0031, `pathways_rules_internal.canonical_source_request(operation, body)`** (defined at line 1548, owner `rules_enqueue_owner`).
  - For `ACTIVITY_PROOF_FINALIZE`, the allowed and required keys are `updateId`, `progressPercent`, `note` and `files` (`:1568-1569`).
  - The `files` branch (`:1613-1632`) requires:
    - an array of 1-5 items (`:1614`);
    - objects with exactly `fileName`, `sha256`, `contentType` and `byteSize`;
    - a `fileName` of 1-128 characters without slash or backslash;
    - a 64-character lowercase hex `sha256`;
    - a `contentType` in (`image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `application/pdf`) (`:1623`);
    - a `byteSize` matching `^[1-9][0-9]{0,7}$` and at most 10485760 (`:1624-1625`);
    - a total of at most 26214400 (`:1628`).

  No later migration replaces this function.
- **Database constraints on `evidence_media`** (`0000_pathways_baseline_through_0026/migration.sql`):
  - `evidence_media_activity_update_check` (`:4613`) requires type `PROGRESS_PROOF` or `COMPLETION_PROOF` whenever `activity_update_id` is set;
  - `p3_evidence_file` (`:4614`) requires a private scoped key, a hex digest, a positive size and a MIME-shaped content type;
  - public-visibility rules keep new evidence `PRIVATE` with `consent_confirmed = false` and `is_identifying = true`.
- **Auth RFC section 4.** Pending-proof inspection is limited to assigned, distinct M&E reviewers. No broader media release.
- **Local storage.** `supabase/config.toml:117` sets `file_size_limit = "50MiB"`. The local seed creates `pathways-private` with `public: false` only (`apps/api/prisma/local-synthetic-seed.ts:100-101`).

## 3. Proposed Change

### 3.1 Direct signed upload with server verification

1. **Reserve (JSON).** The client sends `clientUpdateId`, `progressPercent`, `note` and 1-10 file declarations (`fileName`, `contentType`, `byteSize`, `sha256`).
   - Authority is unchanged: `activities.proof.submit`, an active personal activity assignment, and no other pending update.
   - One transaction creates the activity update and all evidence rows with `storage_ready = false`. Evidence rows are inserted in one batch statement.
   - For each row the server returns a signed upload token from `createSignedUploadUrl`, scoped to the exact server-derived object key `organizations/<org>/projects/<project>/evidence/<evidenceId>/proof<ext>`, with upsert disabled. Tokens go only to the reserving user and are never logged or stored.
2. **Upload.** The browser uploads each file directly to `pathways-private` with its token, so the API request-body limit no longer applies.
3. **Finalize each file.** Outside any database transaction, under a bounded storage deadline, the server verifies:
   - the object exists at the exact key;
   - the stored size equals the declared `byteSize` and is at most `EVIDENCE_MAX_FILE_BYTES`;
   - the leading bytes match the declared type:
     - JPEG `FF D8 FF`;
     - PNG `89 50 4E 47`;
     - WebP `RIFF....WEBP`;
     - PDF `%PDF-`;
     - MP4 and MOV: an `ftyp` box at offset 4 with an allow-listed brand;
     - WebM: EBML `1A 45 DF A3` with DocType `webm`;
   - a SHA-256 streamed over counted bytes equals the declared digest.

   On any mismatch the server returns 422, deletes that unverified object (best effort), and leaves the row `storage_ready = false` so the same `clientUpdateId` can retry.
4. **Commit.** When every file is verified, the existing `ACTIVITY_PROOF_FINALIZE` path marks storage ready and moves the update to pending review, exactly as today.
5. **Retry.** A retry with the same `clientUpdateId` and identical declarations returns the existing reservation, plus fresh tokens for files not yet verified. Changed declarations conflict.
6. Abandoned reservations keep the current retry behaviour. This record adds no automatic deletion.

### 3.2 Limits and configuration

- **Per update:** 1-10 files.
- **Types:** `application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `video/quicktime`, `video/webm`.
- **Per-file maximum:** `EVIDENCE_MAX_FILE_BYTES` in `packages/config/src/env.ts`:
  - an integer from 1048576 to 104857600;
  - default 52428800 (50 MiB, matching the local `50MiB` storage limit).

  The default must not exceed the hosted global and bucket limits. If the hosted Free plan limit is measured as 50,000,000 bytes, the default is lowered to match.
- **Per-update total:** proposed at five times the per-file maximum.
- The Free plan's small total storage quota is an operational risk and is recorded in OPS.
- The web client reads the effective limits from the API, so they are not duplicated in web configuration.
- The `pathways-private` bucket gets a `file_size_limit` and an `allowed_mime_types` list, as defense in depth:
  - local: through the seed;
  - hosted: as a documented developer step.

### 3.3 Evidence type (developer decision: change the constraint)

Two things currently limit activity-update evidence to `PROGRESS_PROOF` or `COMPLETION_PROOF`:

- `evidence_media_activity_update_check` (`0000_pathways_baseline_through_0026/migration.sql:4613`);
- the approved inspection lineage check (`private-proof-inspection.service.ts:151`).

The developer chose to change both.

- New activity-update evidence is typed from the finalize-verified content type:
  - `PHOTO` for JPEG, PNG and WebP;
  - `VIDEO` for MP4, MOV and WebM;
  - `DOCUMENT` for PDF.
- The type is set at reservation from the declared type and confirmed at finalize. A declared/sniffed mismatch fails finalize, as in section 3.1.
- Progress versus completion comes from the owning `activity_updates.progress_percent` (100 means completion). This is the value `activities.service.ts:1353` already uses to choose between the two proof types.
- `PROGRESS_PROOF` and `COMPLETION_PROOF` stay valid, so existing rows remain legal history. New writes no longer use them.
- The inspection lineage check accepts all five types for evidence linked to an activity update. The other admission and lineage rules are unchanged.

### 3.4 Migration `0041_activity_media_evidence`

- `CREATE OR REPLACE FUNCTION pathways_rules_internal.canonical_source_request` changes only the `files` branch:
  - 1-10 items;
  - the content-type list adds `video/quicktime` and `video/webm`;
  - `byteSize` matches `^[1-9][0-9]{0,8}$` and is at most 104857600, the highest configurable value, while the API enforces the configured lower limit;
  - the total bound matches section 3.2 at the 104857600 ceiling.
- The rest of the body is byte-identical to 0031. A SQL test compares the installed definition with the 0031 text outside the `files` branch.
- The replacement runs as the owner `rules_enqueue_owner`, and postconditions assert the unchanged owner, ACL, `SECURITY` mode and `search_path`.
- Drop and re-add `evidence_media_activity_update_check` with the allowed set `PROGRESS_PROOF`, `COMPLETION_PROOF`, `PHOTO`, `VIDEO`, `DOCUMENT`. The `activity_id IS NOT NULL` requirement is unchanged. It is added `NOT VALID` and then validated in the same migration; every existing row already satisfies the wider set.
- There are no other table changes. The `byte_size` column is already `bigint`, and `p3_evidence_file` already accepts `video/quicktime` and `video/webm` as content types.

### 3.5 Inspection bounds (amends the private-proof inspection record)

- Context returns at most 10 proof identifiers, and discovery is bounded to 11.
- The per-proof size bound becomes `EVIDENCE_MAX_FILE_BYTES`, replacing 10 MiB.
- The storage deadline and request ceiling scale to the size bound, proposed at 60 and 90 seconds, within the hosted `maxDuration`.
- Every other rule in that record stays unchanged:
  - admission and lineage;
  - distinct assigned M&E reviewer;
  - counted streamed read with digest check;
  - final authorization and audit before release;
  - attachment-only `application/octet-stream`;
  - no signed or public URL (developer decision: signed download links are rejected, including for large videos);
  - no inline preview.
- **Large objects without signed links.** The hosted API may not be able to return a whole large video in one response.
  - **Primary:** a streamed response. The server streams the object through the counted digest check, and releases the attachment only after the final authorization and audit.
  - **Fallback:** if the development preview shows that streamed responses are also capped, use bounded range retrieval through the API.
    - At finalize, the server records a manifest of 4 MiB chunk SHA-256 digests.
    - The inspection context returns the chunk count.
    - Each chunk request re-runs the full authorization chain, reads only that byte range from storage, and verifies it against the manifest before returning it.
    - The browser assembles the chunks into one attachment.
    - The audit is written once per inspection, on the first chunk; later chunks are authorized but not re-audited.
    - The fallback adds a nullable `chunk_digests` column to `evidence_media` in 0041.

### 3.6 UI

- One "Update progress" dialog with progress, a note and optional files.
  - Without files it uses the existing progress operation (`activities.progress.update` plus assignment).
  - With files it uses the proof flow above (`activities.proof.submit` plus assignment).
- The file control appears only when the server capability `canSubmitProof` is true (see [project RBAC UI](cr-pathways-project-rbac-ui-and-partners.md)).
- New selections are added to the list, not swapped in. Duplicates are skipped. Each file shows its progress and a remove control.
- Client checks are advisory only.
- Keyboard access, labels and live-region status follow the DSD.

### 3.7 Privacy

- Videos and all other evidence stay private:
  - `PRIVATE`, `consent_confirmed = false` and `is_identifying = true` defaults stay;
  - publication rules are unchanged;
  - no transcoding, thumbnails, public URLs or inline playback.
- Signed upload tokens authorize writing one object path only. They never grant reading.

## 4. Impact

### Product
Progress updates can carry up to 10 photos, videos or documents, including large videos, and file selection is additive.

### Data / Migration
0041 replaces one function body and widens `evidence_media_activity_update_check`. If the range fallback is needed, it also adds the nullable `chunk_digests` column. Existing rows are unchanged.

### Authorization / Privacy
- No permission change.
- The upload path moves from API-proxied to token-authorized direct upload. The server still derives the object key, verifies size, type and digest before any evidence becomes ready, and owns the final state change.
- A leaked upload token could only write to its own unverified object path until expiry. The finalize verification rejects anything that does not match the declared digest.

### API
- New reservation and per-file finalize endpoints. The multipart proof route is retired in the same release.
- New error codes for size, type and digest mismatch.

### UI
The dialogs are merged, with additive multi-file selection and per-file progress.

### Tests
- **Happy path:** reserve, upload and finalize for each type.
- **Rejections:**
  - a spoofed MIME type (declared MP4, actually HTML);
  - a size mismatch;
  - a digest mismatch;
  - an 11th file;
  - a file over the configured limit;
  - a token reused for another key.
- **Retry:** an identical retry succeeds; changed declarations conflict.
- **Denials:** a non-assigned PM or M&E is denied; cross-project and cross-organization reservation and finalize are denied.
- **Inspection:** with 10 proofs and a 40 MB MP4.
- **SQL (0041):** new bounds accepted, old rejections kept, the rest of the definition identical.
- **Accessibility:** the dialog passes accessibility checks.

### Documentation
- Private-proof inspection record: amend its bounds.
- Auth RFC section 4 reference.
- SDD evidence section.
- OPS: storage quota and bucket limits.
- QAD rows and index.

## 5. Alternatives Considered

- **Restraint: keep multipart and only raise limits.** This does not work on the hosted API, because the plan records a request-body cap of about 4.5 MB on Vercel functions. Rejected.
- **Keep `PROGRESS_PROOF` and `COMPLETION_PROOF` and derive the media kind only for display.** No constraint change. Rejected by the developer in favor of real `PHOTO`, `VIDEO` and `DOCUMENT` types.
- **Signed download URLs for inspection.** Would avoid API response-size limits for large videos, but it reverses the approved "no signed or public URL" rule. Rejected by the developer; section 3.5 uses a streamed response or bounded range retrieval instead.
- **Client-side video compression.** Adds a heavy dependency and changes evidence bytes. Rejected.

## 6. Migration / Rollback

- 0041 is forward-only with the 0030-style migration identity and ledger precondition. Numbers follow merge order.
- Rollback: a later forward migration restores the 0031 `files` branch, and the code reverts to the multipart route. Evidence already uploaded under the new bounds stays valid private history, and inspection must keep accepting it until reviewed.
- Hosted application needs separate developer authorization, the hosted bucket limits, and confirmation of `maxDuration` for the finalize and inspection endpoints.
- After a Supabase Pro upgrade, the developer raises the bucket and global limits and then sets `EVIDENCE_MAX_FILE_BYTES` to 104857600.

## 7. Verification

- Section 4 tests, SQL runtime suites against a reset local database, `pnpm -r typecheck`, `pnpm test`, `pnpm docs:check` and `pnpm sad:check`.
- Digest-bound `pnpm sad:signoff` with reviews from organization-isolation-checker, beneficiary-privacy-guardian, migration-integrity-guardian and design-qa-agent.
- In the local app, a multi-file update with a 40 MB MP4 succeeds.
- On the development preview:
  - confirm the request-body limit that motivated this change;
  - confirm that a streamed inspection response can return a verified object of the configured maximum size within the response and duration limits. If it cannot, implement the section 3.5 range fallback and verify it with a 40 MB MP4.
- **Dependencies.**
  - Follows [project RBAC UI and partners](cr-pathways-project-rbac-ui-and-partners.md), which provides `canSubmitProof` and owns `activity-form-dialog.tsx`.
  - Follows the approved `cr-pathways-performance-scaling` (branch `feature/perf-optimizations`, merged in Wave A), which covers the activity list projection.

## 8. Approval

Developer reply on 2026-09-28: "Approve all CRs, Evidence: change constraint, Signed links: no".

## 9. Disposition

Implemented on feature branch; hosted pending.

### 9.1 Developer-authorized scope reduction (2026-09-29)

The developer reduced the implementation scope on the `feature/activity-progress-media` branch. This subsection records the reduction; sections 1-8 above remain the approved contract and are not otherwise edited.

- Only the existing Submit proof flow changes. It carries multiple file attachments, up to 10 files, images, PDF and MP4/MOV/WebM video, each going directly to private storage through the reserve/upload/finalize API in section 3.1, at `EVIDENCE_MAX_FILE_BYTES` (default 50 MB).
- Selecting more files adds to the list. Each file has its own remove control and a status text of Waiting, Uploading, Uploaded, or Failed with a Retry control. There are no progress bars.
- **Deferred, not built on this branch:** files on Record progress, the combined "Update progress" dialog described in section 3.6, and per-file upload progress bars. Record progress is unchanged.
- The backend reservation, per-file finalize, evidence typing (3.3) and migration 0041 (3.4) are implemented as approved. The inspection amendment (3.5) is implemented at its streamed-response primary path; the section 3.5 fallback (chunked range retrieval and `chunk_digests`) is not needed locally and was not built, and is not required for this reduced scope. No combined-dialog or record-progress-file backend path exists, so nothing was left inert or removed.
