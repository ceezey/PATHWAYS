# Deferred Features Register

**Status:** Working
**Last reconciled:** 2026-09-29

> Tracks every deferred or hidden feature so a disabled control or an unbuilt view has a
> recorded reason and owner document, instead of silently disappearing from the UI or
> the backlog. Add a row here whenever a feature is deferred; remove it only when the
> feature ships or is formally rejected.

## PRD-F9 descriptive analytics (on hold)

The [F9 survey/timeline descriptive views](sdd-pathways.md) implemented the survey improvement
and timeline adherence views. The following PRD-F9-adjacent items remain on hold, not built on
that branch:

| Item | Description | Why deferred |
|---|---|---|
| Participation breakdowns | A dedicated participation-pattern descriptive view (attendance/engagement cuts beyond the existing combined KPI/participation payload) | Not scoped for this branch; the combined `analytics.descriptive.v1` payload already carries the existing participation section |
| Server-side budget aggregate | A trusted server-computed budget aggregate view inside descriptive analytics (distinct from the existing `overview-metrics` budget utilization tile) | No approved methodology/RFC yet for a descriptive-analytics-scoped budget rollup |
| Indicator trends | Time-series/trend rendering of indicator progress inside descriptive analytics | Requires an approved trend methodology; not part of the F9 survey/timeline scope |
| `dashboards.customize` | A user-configurable dashboard layout/permission | No approved design or permission contract yet |

## Frontend usability (on hold)

The [approved frontend usability Change Record](cr-pathways-frontend-usability.md) disabled
certain chart controls in the analytics dashboard pending backend-authority verification.
Those disabled-chart controls remain in place; the F9 branch enables the previously-disabled
`survey` and `timeline` analysis view options, but does not change the frontend usability
Change Record's remaining disabled controls.
