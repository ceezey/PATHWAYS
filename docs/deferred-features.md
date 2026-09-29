# Deferred and Hidden Features Register

This is the single register of PATHWAYS features that are hidden behind a flag, deferred
from an approved Change Record's scope, or gapped in the current implementation. It does
not replace the Change Log in `docs/index.md` section 7; it collects the current state of
each item in one place so it does not have to be reconstructed from individual CRs.

| Feature | State | Decided | Why | Where | To re-enable |
|---|---|---|---|---|---|
| Beneficiary step-up PIN fallback | Hidden | 2026-09-29 | The PIN fallback UI is buggy; hidden now and fixed later. The API endpoints and migration 0037 stay in place and continue to enforce everything server-side. | `apps/web/src/constants/feature-flags.ts` (`STEP_UP_PIN_UI_ENABLED`); `apps/web/src/components/layout/beneficiary-access-gate.tsx`; `apps/web/src/features/profile/own-profile-workspace.tsx`; `apps/web/src/features/profile/own-step-up-pin-form.tsx`; `apps/api/src/modules/auth/beneficiary-step-up-pin.*`; migration 0037. See [cr-pathways-beneficiary-step-up-pin](cr-pathways-beneficiary-step-up-pin.md). | Fix the PIN fallback bug, then flip `STEP_UP_PIN_UI_ENABLED` to `true`. |
| Files on Record progress | Deferred | 2026-09-29 | Developer-authorized scope reduction: only the existing Submit proof flow changed on the activity-progress-media branch. | See [cr-pathways-activity-progress-media](cr-pathways-activity-progress-media.md) section 9.1. | Extend the CR scope and implement a Record-progress-file backend path. |
| Combined "Update progress" dialog | Deferred | 2026-09-29 | Same developer-authorized scope reduction as above; the section 3.6 combined dialog was not built. | See [cr-pathways-activity-progress-media](cr-pathways-activity-progress-media.md) section 9.1. | Build the combined dialog described in section 3.6 and re-run SAD review. |
| Per-file upload progress bars | Deferred | 2026-09-29 | Same scope reduction; replaced by simple status text for the reduced Submit proof flow. | See [cr-pathways-activity-progress-media](cr-pathways-activity-progress-media.md) section 9.1. | Add per-file progress bars back to the Submit proof upload UI. |
| Chunked range fallback for proof inspection | Gap (not built) | 2026-09-29 | The section 3.5 fallback (chunked range retrieval and `chunk_digests`) was not needed for the reduced local scope and was not built; the streamed-response primary path is implemented. | See [cr-pathways-activity-progress-media](cr-pathways-activity-progress-media.md) section 9.1. | Implement the section 3.5 fallback if the streamed primary path proves insufficient. |
| PDF upload in the import-then-extend mode | Deferred | 2026-09-28 | Developer decision: import accepts CSV, XLS and XLSX only; PDF import is scoped to `/collection/import` (text-layer PDF only, migration 0036). | See [cr-pathways-import-throughput-and-pdf](cr-pathways-import-throughput-and-pdf.md); `packages/imports/src/limits.ts` (`SupportedImportFileType`). | Extend the import-then-extend flow to accept PDF if the developer authorizes it. |
| Program creation in the app | Gap | Found 2026-09-29 | No role in the RBAC contract holds `programs.create` (`apps/api/src/modules/auth/rbac-contract.json`), so `POST /programs` is unreachable from any client. Programs come from the seed. | `apps/api/src/modules/programs/programs.controller.ts`; `apps/api/src/modules/auth/rbac-contract.json`; `docs/rfc-pathways-auth-rbac-isolation.md`. | Grant `programs.create` to an appropriate role via an approved Change Record, or keep programs seed-only by developer decision. |
| Performance scaling CR steps 3-5 | Deferred | Steps 3-4 not started; step 5 deferred 2026-09-28 | The developer deferred same-origin proxy work (step 5); steps 3-4 (further backend caching) were not started. | See [cr-pathways-performance-scaling](cr-pathways-performance-scaling.md) section 9. | Resume steps 3-4 and revisit step 5 with developer authorization. |
| Activities reaching COMPLETED in seeded data | Informational (not a deferral) | 2026-09-29 | The seed cannot complete activities without a real proof flow; this is a seed-data limitation, not a withheld feature. | Seed data / `apps/api/prisma`. | No action needed; complete an activity through the real Submit proof and inspection flow. |

## Maintenance

Update this register in the same change that hides, defers, or discovers a gap in a
feature. Register updates here in `docs/index.md` section 2 when the register itself
changes status, and keep entries reconciled with the Change Record or repository fact
that established them.
