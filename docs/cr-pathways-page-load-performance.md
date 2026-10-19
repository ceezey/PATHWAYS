# Change Record: Page Load Performance

**ID:** `cr-pathways-page-load-performance`  
**Date:** 2026-10-19  
**Status:** Applied (web and API code on `feature/load-performance`; staging re-measure pending)

## 1. Trigger

The options note (removed after implementation; see git history) recorded that most project screens fetch several authorized reads on mount, render only when all resolve, and refetch on every tab switch. Developer request 2026-10-19: implement options 1, 2, 3, 4 and 6; option 5 (bundled endpoints) is not taken.

## 2. Current Contract

Authorized reads default to `live` freshness (`staleTime: 0`, `gcTime: 0`, refetch on mount). Many legacy components fetched through raw `pathwaysClient` calls in `useEffect`, outside react-query, so each tab fetched the project again, and each API call re-ran auth, permission resolution and `withAuthorizedOperation` (one transaction with RLS context). Tabs fetched the project separately, and several workspaces waited on one `Promise.all` before drawing anything. The API gave no per-route timing.

## 3. Proposed Change

- Option 6, server timing: every API response carries `Server-Timing: auth;dur=N, total;dur=N` (`apps/api/src/common/network/server-timing.ts`), exposed through CORS. `auth` is the whole `SupabaseAuthGuard` (token check, workspace and permission resolution); `total` runs from request start until the response headers are written, so it understates streamed responses such as PDF and CSV downloads. Durations only, no identities or values; public routes also carry the header.
- Option 1, summary freshness: assignable officers and both budget-reference reads join project detail, journey stages, overview metrics and the activity list on the 30 s `summary` window. A fail-closed allowlist (`SUMMARY_ELIGIBLE_RESOURCE` in `use-authorized-read.ts`) means a resource not listed reads live even when a caller asks for `summary`; `LIVE_ONLY_RESOURCE` also covers beneficiary, step-up, import-batch, analytics-insights and report-preview reads.
- Option 2, one project read: every tab uses `useProjectRead` (key `project`). Every successful write through the API client fires the write-committed event, which purges inactive private queries and refetches active ones, so a project edit or stage save refreshes the shared reads without a per-feature invalidation hook; a write from another browser tab or user can still be up to 30 s stale, the accepted summary contract.
- Option 3, progressive render: the Evidence tab shows each section (evidence, reports) when its own read resolves, with a per-section loading note; the Activities workspace draws its list when the list resolves instead of also waiting on the project; the budget-allocation list in the expense dialog shows its own loading note. The journey stages loader reads the project and activities through the shared reads, but the stage editor reads stages through a separate live key (`journey-stages-editor`, not on the allowlist) because the editor copies its stages once and a save rewrites every mapping, so it must never start from a 30 s cached copy. Once the editor has its first data it stays mounted with unsaved edits, and a later failed refresh shows an error beside it. The mapping panel has its own loading and error states.
- Option 4, prefetch on intent: hovering or focusing a project tab link warms the summary reads that tab mounts with: Overview warms overview metrics; Activities warms the activity list, project indicators and journey stages (its editor reads); Journey Stages warms the activity list (its mapping choices). Indicators, Evidence, Monitoring and Budget warm nothing (live or non-shared reads), and the live journey editor key is never prefetched. Hovering or focusing "Open Project" on a project card (not the whole card) warms the shared project read. Prefetch uses the same query keys as the hooks, skips unlisted and live-only resources, principals without the permission or project scope and keys with a recorded denial, records a 401/403 like a normal read so repeat hovers do not refire, and leaves no cache entry on failure.

## 4. Impact

### Product
Tab switches inside 30 s reuse cached summary reads, and sections appear as their reads finish.

### Data / Migration
None.

### Authorization / Privacy
Only non-sensitive reads qualify for the 30 s window, which is keyed by organization, user, role, permissions, assignments and project, so no read crosses an identity. Every request still authorizes at the API. Rationale per resource:
- Project detail: title, dates, status, description, `projectBudget`, `targetBeneficiaries` (plan target count) and staff names and ids; no beneficiary rows or personal data.
- Project journey stages: stage configuration (code, name, order, mapped activity ids); no per-person data.
- Project overview metrics: stays summary by ruling because it was summary before this work and `beneficiariesReached` is a single aggregate count with no sex or age breakdown (plus spend totals); it is on the allowlist deliberately.
- Activity list: activity-level fields and aggregates.
- Assignable officers: staff user id and display name only.
- Budget references: budget record id, category and activity id; no personal data.
- Left live: activity detail (proof files, update notes), beneficiary, step-up, import-batch, analytics-insights (participation breakdown is SADDD) and report-preview (can carry beneficiary summaries).

### API
Only the `Server-Timing` header and its CORS exposure. No new endpoint.

### UI
Section loading notes on the Evidence tab, the journey mapping panel (with a Retry on failure) and the expense dialog ("Loading budget allocations"); no layout change.

### Tests
Allowlist and live-only cases in `authorized-query-cache.test.tsx`, freshness and tab-prefetch mapping cases in `projects.reads.test.ts`, `use-authorized-prefetch.test.tsx` (including denial recording), `journey-stages-loader.test.tsx` (manage-only actor, live editor read, kept editor, activity failure), a progressive-render case in `project-review-workspace.test.tsx`, the tab hover case in `project-workspace-header.test.tsx` and `server-timing.test.ts`.

### Documentation
This record, the deferred-features register row and the index.

## 5. Alternatives Considered

- Option 5, bundled `GET /projects/:id/workspace`: not taken; it adds API surface and needs an org-isolation review, and options 1 to 4 and 6 cut most of the cost first.
- Do nothing: leaves every tab switch refetching.

## 6. Migration / Rollback

No migration. Roll back by reverting the web commits; remove a resource from `SUMMARY_ELIGIBLE_RESOURCE` to return it to live reads at once, and prefetch follows the same list.

## 7. Verification

- Reading `Server-Timing`: in the browser network panel open any API request and read the Timing tab or the response headers. `auth` is the guard time, `total` the time until response headers were written (streamed downloads are understated), and `total - auth` approximates handler and query time. A large `auth` points at token and permission resolution; a large remainder points at the query or transaction.
- Staging re-measure: pending. Record `auth` and `total` for the project detail, activities list and journey stages routes on the staging API, and compare tab-switch network counts within 30 s.
- Unit suites: web unit suite, web typecheck and lint, API `server-timing` tests.

## 8. Approval

Developer request 2026-10-19; option 5 excluded by the same decision.

## 9. Disposition

Options 1 to 4 and 6 implemented; option 5 not taken. Follow-ups: staging re-measure; the indicators binding-choices read still joins forms and activities in one request.
