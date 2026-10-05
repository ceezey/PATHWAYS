# Change Record: Project Coverage Map

**ID:** `cr-pathways-project-coverage-map`  
**Date:** 2026-10-05  
**Status:** Applied (2026-10-05; local QA only, not pushed)

## 1. Trigger

The product owner asked on 2026-10-05 for the Analytics coverage map to place programs and projects on the Philippine map, with a hover overview of SADDD, KPI and progress. The map showed "Loading map" indefinitely on mobile data and never plotted points.

## 2. Current Contract

PRD-F12 bounds listed "Maps and free-form chart building: not built". The map component waited for the MapLibre `load` event (every initial tile) before clearing its overlay, and the dashboard passed an empty point list because projects have no persisted coordinates (Contract B).

## 3. Proposed Change

- `GET /analytics/project-map` (`projects.read`) in an isolated `project-map` module lists the caller's scoped projects (up to 100) whose free-text `implementationArea` names a known Philippine city, municipality or province, placed at bundled approximate centroids (`ph-places.ts`). Unknown text resolves to nothing, never a guess.
- Each project carries the existing Project Overview metrics (KPI achievement, timeline progress, beneficiaries reached, budget utilization) read through `ProjectOverviewMetricsService`, and the suppressed SADDD sex buckets through `DashboardsService.saddd` once the closed-project release exists.
- The map clears its overlay on `style.load`; hovering, tapping or picking a project code below the map opens an overview card. Free-form chart building stays not built.

## 4. Impact

### Data / Migration
None. No table, column or migration; points are project-level centroids, never Beneficiary coordinates.

### Authorization / Privacy
Scope is `projectScope`; each overview section is null without its source permission, and SADDD uses the RFC small-cell rule (1-4 suppressed) already applied by the reused services.

### UI
`project-coverage-map-panel.tsx` (react-query via `useAuthorizedRead`), `project-map-card.tsx`; nothing depends on hover alone (tap and a keyboard-reachable project list).

### Tests
`apps/api/src/modules/project-map/ph-places.test.ts` covers place resolution; existing coverage map tests still pass.

## 5. Alternatives Considered

Shaded province polygons (heavier bundle, out of scope for the defense); an external geocoder (needs a key and sends project text out).

## 6. Migration / Rollback

Revert the commit; no data to restore.

## 7. Verification

Local build, typecheck, lint, tests, and a rendered map at desktop and 390 px width.

## 8. Approval

Product owner request, 2026-10-05.
