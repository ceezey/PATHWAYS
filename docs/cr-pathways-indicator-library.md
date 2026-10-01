# Change Record: indicator-library

**ID:** `cr-pathways-indicator-library`
**Date:** 2026-10-01
**Status:** Approved

## 1. Trigger

Audit finding MA-01 ([manuscript alignment audit](audit-pathways-manuscript-alignment-20261001.md)): requirement R4 (consistent project setup through reusable structures) is not met, and gate G-F7-5 (indicators can be linked and reused across projects) is Not met. The deferred-features register held the Project Template Library and Indicator Library as deferred. On 2026-10-01 the developer approved building G-F7-5 as an organization-scoped Indicator Library.

## 2. Current Contract

[PRD-F7](prd-pathways.md) lists reusable indicator definitions across projects as out of bounds, and UC-F7-1 states reuse in another project is not supported. Each indicator belongs to one project (`pathways.project_indicators`), is created through `POST /projects/:projectId/indicators` under `indicators.create`, and every definition is typed in by hand. `indicators.archive` is granted to no role and stays that way.

## 3. Proposed Change

A minimal organization library of indicator definition templates, plus a copy path into a project.

- **Library entry:** code, name, description, unit label, data source, mode (`MANUAL` or `DERIVED`), numeric kind, direction, display precision and, for derived entries, a recipe. Only recipes that need no project data are allowed (no form-field recipes). An entry never holds a project, activity, form, period, baseline, target or measurement.
- **Operations:** create, list (active entries) and archive. No edit and no delete: replace an entry by archiving it and creating a new one. At most 200 active entries and one active entry per code per organization.
- **Use from library:** `POST /projects/:projectId/indicators/from-library` takes the entry ID plus the project-specific period, baseline, target and a request key. The server reads the entry and calls the existing project indicator create path, so validation, source-operation recording, idempotency and audit are unchanged. The entry definition is copied; there is no live link, and later archiving an entry does not change projects that used it.
- **Permissions** (new, same naming as `indicators.*`): `indicators.library.read`, `indicators.library.create`, `indicators.library.archive`, granted to System Administrator, Monitoring and Evaluation Officer and Project Manager, the roles that hold `indicators.create`. Using an entry needs `indicators.create` and `indicators.library.read`.
- **Web:** an Indicator Library page (list, add, archive) and a "Use from library" action in the project indicators workspace.

Out of scope: a Project Template Library (activity arrangements and monitoring configurations), entry editing, sharing between organizations, live links, bulk import and any seeded entries. R4 stays partially met: the indicator-definition part is delivered, project structure templates remain deferred.

## 4. Impact

### Product
G-F7-5 becomes Met for indicator definitions. The deferred-features entry for the libraries is replaced by one entry for the Project Template Library only.

### Data / Migration
`0051_indicator_library` (not applied by this change). Predecessor is 0050. It inserts three permissions and nine role grants, wraps `pathways.p09_role_allows` as left by 0048 (renamed to `p09_role_allows_0048`, so the 0047 and 0048 changes stay) with the nine pairs, and creates `pathways.indicator_library_entries` (check constraints for code, text bounds, kind and recipe; unique request key per organization; partial unique active code). No existing row, table or policy changes. Hosted ledger plan and tests carry the new migration.

### Authorization / Privacy
Row level security is enabled and forced: select, insert and archive policies match `app.organization_id` and check `p09_can` for the matching library permission; insert also requires `created_by_id` to be the actor. The runtime role holds SELECT, INSERT and `UPDATE (archived_at)` only, with no DELETE. The service filters by the actor organization as well. The table holds no personal or project data. Audit events: `INDICATOR_LIBRARY_ENTRY_CREATED` and `INDICATOR_LIBRARY_ENTRY_ARCHIVED`.

### API
`GET /indicator-library`, `POST /indicator-library`, `POST /indicator-library/:entryId/archive`, `POST /projects/:projectId/indicators/from-library`. Strict request schemas reject unknown fields (organization, creator, project and binding identifiers).

### UI
Library page with rounded-xl containers and controls of at least 44px, no mock data; "Use from library" in the project indicators workspace. The dead mock `indicator-library-workspace.tsx` is not revived.

### Tests
Service tests for happy, sad and abuse paths including cross-organization denial; contract tests for the nine grants and the ceiling; hosted plan tests for the new migration; web tests for the library page and the use action. Database runtime and RLS evidence needs a staging apply and is pending.

### Documentation
PRD-F7 bounds, UC-F7-1, G-F7-5, FR-9, QAD rows, deferred-features, index, auth RFC contract note.

## 5. Alternatives Considered

- **Descope R4 with manuscript impact:** rejected by the developer decision above.
- **Prefill the project form client-side with no new API:** smallest, but the library would still need storage and permissions, and the copy would bypass a server-side single path; the server copy reuses the existing create path.
- **Live-linked definitions across projects:** rejected, it would let a library edit change measured history.
- **Full template library (activities, milestones, monitoring configuration):** deferred, larger scope and no approved design.

## 6. Migration / Rollback

Apply `0051` after 0050 on the verified ledger with the normal staged deploy; it needs no preprovision. It is forward only. Recovery before use: restore the protected backup. After use, archive entries instead of deleting; the table and grants can be dropped only by a reviewed follow-up migration because project indicators never reference it.

## 7. Verification

API tests for the library service and the CSV RBAC contract, hosted plan tests, web tests, typecheck and Biome. After a staging apply: the runtime SQL checks that another organization and roles without the permission cannot select, insert or archive, and that `UPDATE` of any column other than `archived_at` is denied.

## 8. Approval

Developer decision 2026-10-01: build G-F7-5 Indicator and Template Library (R4) with minimal scope as above.

## 9. Disposition

Mark Applied after the staging apply and runtime SQL checks. Follow-up: Project Template Library remains deferred.
