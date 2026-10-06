# Project status report design

Date: 2026-10-06. Status: draft for developer review.

## Goal

Turn the Project summary report from a one-row table into a one-page project status report, and give every report kind the same branded document look. Developer choices: Project summary gets the full status layout; the other five kinds keep their data and get the shared look; light document style (white page, navy section bands, bordered tables, colored status cells) in DSD tokens and fonts.

## Scope

In: the PROJECT_SUMMARY source, the report snapshot contract, the designed PDF print page, the in-app report preview.
Out: new migrations, new permissions, the pdfkit fallback layout (stays plain text), CSV/XLSX layout, the other kinds' data.

## Snapshot contract

- `Preview` gains an optional `sections` object, produced only for PROJECT_SUMMARY.
- `columns` and `rows` stay populated with a flattened copy of the same content, so the pdfkit fallback, CSV and XLSX keep working.
- `sections` joins `sourceFingerprint` and the generate-time re-check, so a changed status fails export the same way changed rows do.
- The web `printReportSchema` and `reportPreviewSchema` stay `.strict()` and add `sections` as an optional, bounded schema (string caps as today, at most 100 milestones, 50 indicators, 10 alerts).
- The renderer passes `sections` through to `window.__PATHWAYS_REPORT__`; nothing else in the PDF path changes.

## Sections (Project summary)

Each section is read inside the existing report transaction with the same service function the app already uses, and only when the actor holds that function's permission. A missing permission omits the section and adds one line to `unavailableReasons`.

| Section | Content | Source | Permission |
|---|---|---|---|
| Project information | code, title, status, sector, area, start and end dates, program manager name, implementing partners | `Project` with `programManager` | reports.project.read (as today) |
| Overview | rows for Schedule, Budget, Indicators, each with a status and a one-line comment | derived, see below | per input |
| Key figures | timeline elapsed percent, budget used percent with approved and spent amounts, KPI achievement percent, beneficiaries reached | `ProjectOverviewMetricsService` logic | as that service gates each field |
| Milestones | title, status, target date, completion date, overdue flag | `listMilestones` (cap 100) | activities.read |
| Indicators | code, name, baseline, target, current, progress percent | monitoring dashboard indicators | monitoring.read |
| Open alerts | title, severity, explanation, last evaluated (max 10, highest severity first) | rules ALERT_LIST, open statuses | alerts.read |

Suppressed or unavailable metric cells keep their state and reason and render as "Not available" or "Fewer than 5", never as zero.

## Overview status rules

Statuses are ON TRACK (green), AT RISK (amber), OFF TRACK (red) and NOT AVAILABLE (grey). The report footer states these rules.

- Schedule: OFF TRACK when a milestone is more than 30 days overdue; AT RISK when any milestone is overdue; otherwise ON TRACK. Overdue means target date before the report date and status not COMPLETED or CANCELLED.
- Budget: OFF TRACK when budget used is above 100 percent; AT RISK when budget used exceeds timeline elapsed by more than 15 points; otherwise ON TRACK.
- Indicators: OFF TRACK when KPI achievement is below timeline elapsed by more than 25 points; AT RISK when below by more than 10 points; otherwise ON TRACK.
- Any input not available makes that row NOT AVAILABLE.

## Layout (all kinds)

- Header: brand mark, "PATHWAYS", report kind and title, generated time in Asia/Manila, and an information grid (Project summary) or the existing period line (other kinds).
- Section headings as full-width navy bands; tables with bordered cells, subtle header fill and zebra rows.
- Status cells and pills use DSD success, warning, danger and neutral tokens with a text label, so color is never the only signal.
- Key figures as four cards with a value and a thin progress bar.
- Other kinds: the existing chart, then the table, with a "Metric state" column rendered as pills.
- Print rules: `print-avoid` on cards, rows and section heads; A4 portrait; no dark page fills.
- The in-app preview renders the same component, so preview and PDF match.

## Testing

- API: PROJECT_SUMMARY returns sections for a full-permission actor; each missing permission omits its section with a reason; overview rules at each boundary; fingerprint changes when a section changes; flattened rows match sections.
- Web: schema accepts and bounds `sections`; the print view renders each section, pills carry text labels, suppressed cells show "Fewer than 5"; the sample fixture (`?sample=1`) gains a Project summary sample with fictional data.
- Manual: generate a Project summary PDF locally with Chromium and once with the pdfkit kill switch.
