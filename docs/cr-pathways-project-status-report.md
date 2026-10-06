# CR: Project status report

Status: implemented on feature/project-status-report, not pushed. Spec: docs/superpowers/specs/2026-10-06-project-status-report-design.md.

## Scope

- Project summary report gains a structured `sections` object; the other five kinds keep their data and get the shared document look.
- Out of scope: migrations, new permissions, pdfkit layout, CSV and XLSX layout.

## Permissions per section

| Section | Permission |
|---|---|
| Project information | reports.project.read (kind grant, as before) |
| Overview, key figures | per input, as `ProjectOverviewMetricsService` gates each field |
| Milestones | activities.read |
| Indicators | monitoring.read |
| Open alerts | alerts.read |

A missing permission omits the section and adds one line to `unavailableReasons`. Suppressed cells render as "Fewer than 5", unavailable ones as "Not available", never zero.

## Status rules

- Schedule: OFF TRACK when a milestone is more than 30 days overdue, AT RISK when any is overdue, else ON TRACK; no milestone data is NOT AVAILABLE.
- Budget: OFF TRACK above 100 percent used, AT RISK when used exceeds timeline elapsed by more than 15 points, else ON TRACK.
- Indicators: OFF TRACK when KPI achievement is more than 25 points below timeline elapsed, AT RISK when more than 10 below, else ON TRACK.
- Any missing input is NOT AVAILABLE. The report footer states these rules.

## Rollback

Revert the branch; no data or schema changes exist.

## Test evidence

- API: `pnpm vitest run src/modules/reports src/modules/projects src/modules/rules src/modules/report-pdf src/modules/dashboards` pass; tsc and biome clean.
- Web: `pnpm vitest run src/features/reports src/lib/services` pass; tsc and biome clean.
- Not run: the DB-backed `reports-runtime.local.test.ts` and a Chromium PDF render.
