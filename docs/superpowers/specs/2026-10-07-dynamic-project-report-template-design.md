# Dynamic project report template design

Date: 2026-10-07. Status: draft for developer review. Extends [project status report design](2026-10-06-project-status-report-design.md) and PRD section 5.3.9.

## Goal

Make every generated report a presentable document, not a data dump. A single template adapts to the selected scope, period, filters, preset and sections. It renders the same structure as a designed PDF, an editable DOCX, an analysis-ready XLSX or a tidy CSV. The audience is NGO management, donors and M&E reviewers who need a midterm-style progress report or an evidence pack. It is not written for system operators.

## Today vs target

| Capability | Today (F12) | Target |
|---|---|---|
| Scope | One project | One project, or a program (its projects rolled up) |
| Period | Project start to end, capped at 366 days | User-chosen period, defaults to the preset's period |
| Filters | None | Location, activity, journey stage, indicator type, beneficiary segment (aggregate only) |
| Content | Six fixed kinds; only Project summary has sections | One template, five presets, per-section toggles |
| Narrative | None | Editable narrative blocks with data-drafted starter text |
| Formats | PDF, CSV, XLSX, XLS | Same plus DOCX |

The `Report` row already has unused `programId`, `activityId`, `journeyStageId`, `location`, `periodStart`, `periodEnd`, `reportDate` and `aggregateOnly` columns, so the target needs no new scope columns. The six existing kinds stay for compatibility. Each one maps to a preset with a narrower section set (see Presets).

## Flow

This follows the PRD 5.3.9 activity diagram and adds four steps (marked new) between "Choose report kind and project" and "Generate and export".

1. Open Reports.
2. Choose a preset and a scope (project or program). The system checks that the role may view this preset; if not, it shows Unauthorized.
3. (new) Choose the period and filters. The preset's default period is prefilled.
4. (new) Choose sections. The preset's defaults are pre-ticked, required sections are locked on, and sections the role cannot read are not offered.
5. Build the preview from verified records.
6. (new) Review the preview and write the narrative blocks inline. Starter text is already drafted from the data.
7. (new) Set the cover details: prepared for, version, confidentiality.
8. Generate and export. The system creates the report artifact and an audit event. The audit event carries no narrative content, per G-F12-3.

The narrative text and the cover details are saved with the report. Saving the snapshot fingerprint covers data only, so editing a narrative does not make the report stale.

## Content block types

Every block in the template is one of four types. The type controls what the user can change in the app and what stays traceable to the data.

| Type | Source | Editable in app | Editable in DOCX | Example |
|---|---|---|---|---|
| Fixed | System | No | Yes, flagged in the footer as "system figures as of <timestamp>" | Report parameters, data cut-off, footer |
| Auto | Computed from verified records | No (choose sections and filters instead) | Yes | Indicator table, budget-vs-actual chart |
| Narrative | User-written, with a data-drafted starter | Yes | Yes | Executive summary, variance explanations, lessons learned |
| Conditional | Auto, shown only when data exists and the role holds the grant | No | Yes | Evaluation scores, open alerts |

Starter text is deterministic sentence templates filled from the snapshot, with no AI. For example: "As of 30 Sep 2026 the project is 52% through its timeline, has used 47% of its approved budget and has reached 61% of its KPI target."

## Document hierarchy

Numbered sections appear only when they are included. Numbering is computed after the section toggles are applied, so there are never gaps.

```
Cover page                                        [Fixed + Narrative]
About this report                                 [Fixed]            always
Contents                                          [Auto]             PDF/DOCX, 4+ sections
1  Executive summary                              [Narrative + Auto] always
   1.1 Overall status headline
   1.2 Key figures strip (timeline, budget, KPI, reach)
2  Project background                             [Auto + Narrative]
   2.1 Project information
   2.2 Objectives and target beneficiaries
3  Status overview                                [Auto + Narrative]
   Table 3.1 Schedule / Budget / Indicators / Reach with status and comment
4  Results and indicator performance              [Auto + Narrative]
   4.1 Outcome indicators     4.2 Output indicators     4.3 Other indicator types
   Figure 4.1 Progress to target by indicator
   4.4 Variance explanations (one per AT RISK or OFF TRACK indicator)
5  Activities and milestones                      [Auto + Narrative]
   5.1 Activity completion   5.2 Milestones   5.3 Delays and extension requests
6  Beneficiary reach                              [Auto, aggregate only]
   6.1 Reach against target   6.2 Disaggregation (sex, age, disability, location)
   6.3 Journey stage progression
7  Survey and assessment results                  [Conditional]
   7.1 Pre-test and post-test gain   7.2 Survey summaries
8  Financial summary                              [Auto + Narrative]
   8.1 Budget vs actual by category   Figure 8.1 Spend vs timeline   8.2 Pending expenses
9  Evaluation                                     [Conditional: signed-off evaluation]
   9.1 Criteria scores and weighted total
10 Risks, issues and decisions                    [Conditional + Narrative]
   10.1 Open alerts   10.2 Decision recommendations and outcomes
11 Lessons learned and next steps                 [Narrative]
   11.1 Challenges   11.2 Lessons learned   11.3 Recommendations   11.4 Next-period priorities
Annex A Means of verification (evidence register) [Auto]
Annex B Data tables                               [Auto]
Annex C Definitions and method                    [Fixed]            always
Sign-off                                          [Narrative]
```

### Always present

These blocks cannot be toggled off, because a reader needs them to trust or reuse the numbers.

- Cover page: report title, preset label, scope, period, organization, generated date, version and status (Draft or Final).
- About this report: scope, period, filters applied, data cut-off timestamp, data sources, sections omitted for missing data (from `unavailableReasons`), and the suppression notice.
- Executive summary: the status headline and the key figures strip. The narrative may be left as starter text.
- Annex C Definitions and method: status rules, metric states, the suppression threshold and indicator calculation modes.
- Running header with the project code and report title; footer with "Page X of Y", the confidentiality marking and the generated timestamp.

### Section rules

- A section the role has no grant for is left out silently. This matches the 2026-10-06 behaviour of the project summary report.
- A section that is selected but has no records in the period stays in, with one line: "No <records> in this period." Evidence reports must show absence, not hide it.
- Suppressed cells show "Fewer than 5" and missing cells show "Not available". A missing value is never shown as zero.
- Each table and figure gets a caption number and a source line, for example "Source: verified activity updates, 1 Apr to 30 Sep 2026."
- When a filter is active, every affected table caption repeats it, for example "(Filtered: Borongan, Guiuan)".
- A program scope adds a "By project" breakdown under sections 3, 4, 6 and 8, and shows the project column in Annex B.

## Presets

Legend: R = required (locked on), D = on by default, O = optional (off by default), - = not offered.

| Section | Midterm | Evidence (M&E) | Progress (quarterly) | Final | Donor brief |
|---|---|---|---|---|---|
| 1 Executive summary | R | R | R | R | R |
| 2 Project background | D | O | O | D | D |
| 3 Status overview | D | D | D | D | D |
| 4 Results and indicators | D | R | D | D | D |
| 5 Activities and milestones | D | D | D | D | O |
| 6 Beneficiary reach | D | D | D | D | D |
| 7 Survey and assessment | O | D | O | D | O |
| 8 Financial summary | D | O | D | D | D |
| 9 Evaluation | D | O | - | R | O |
| 10 Risks, issues and decisions | D | O | D | O | - |
| 11 Lessons and next steps | D | O | D | D | O |
| Annex A Means of verification | O | R | O | D | - |
| Annex B Data tables | O | D | O | D | - |
| Default period | Start to midpoint | Last quarter | Last quarter | Whole project | Start to report date |

Existing kinds map onto presets as follows. Project summary is the Donor brief. Monitoring report is Progress. Evaluation report is Final with only sections 1 and 9. Indicator, Beneficiary and Survey summaries are Evidence with only section 4, 6 or 7 respectively.

## Section data sources

| Section | Source (existing unless noted) | Grant |
|---|---|---|
| 1, 3 | `report-project-status-source` overview rows and key figures | as today |
| 2 | `Project`, `ProjectImplementingPartner` | reports.project.read |
| 4 | `p34_indicator_report`, `ProjectIndicator.indicatorType`, measurements | monitoring.read |
| 5 | `ProjectActivity`, `ProjectMilestone`, `ActivityOverdueExplanation`, `ActivityExtensionRequest` | activities.read |
| 6 | `p06_saddd`, `SensitiveAggregateRelease`, `JourneyStage` counts | analytics.saddd.read, beneficiaries.aggregates.read |
| 7 | `p34_survey_report`, `AssessmentResult` aggregates | assessments.read |
| 8 | `ProjectBudgetRecord`, `BudgetExpenseEntry` (APPROVED and VERIFIED only in totals) | budgets.read |
| 9 | `evaluationReportTable` (latest SIGNED_OFF) | monitoring.read |
| 10 | `RuleBasedAlert`, `DecisionRecommendation` | alerts.read |
| Annex A | `EvidenceMedia` with an approved review status. Identifying items are listed by type and date only, never shown as thumbnails | evidence read grant |

Filters apply at the source query. A location filter uses beneficiary and activity location, and a segment filter applies only to aggregate sections (6, 7). Indicator-type and activity filters narrow sections 4 and 5. A segment filter never exposes row-level identities, and the existing aggregate-only rule (G-F12-1) still applies.

## Format behaviour

The same snapshot feeds every format, so the numbers match across files.

| Format | Shape | Narrative | Charts | Notes |
|---|---|---|---|---|
| PDF | Full designed document, A4 portrait | Yes | SVG (ECharts) | Chromium renderer; pdfkit fallback stays plain |
| DOCX | Same hierarchy using real Word styles (Title, Heading 1 to 3, Caption, Table Grid) so the Word table of contents and numbering work | Yes, unhighlighted. Empty narrative blocks show grey "[Write ...]" prompts | PNG images | Needs a DOCX writer; see Decisions |
| XLSX / XLS | "Report" sheet (cover and About this report as key-value rows), then one sheet per included data section, each a named table with a caption row and a source row | Executive summary only, on the "Report" sheet | None; data is chart-ready | Frozen header row, number formats, percent cells stored as numbers |
| CSV | One tidy long table: `section, table, item, dimension, category, value, unit, metric_state, reason, period_start, period_end, scope, filters` | No | None | Extends the current Section/Item/Value/Detail flatten; keeps the BOM and formula-injection guard |

## Visual hierarchy (PDF and DOCX)

- Cover: organization mark, preset overline (for example "MIDTERM REPORT"), report title in the heading font, scope and period, a "Prepared for / Prepared by (role) / Version / Status" grid, and the confidentiality marking.
- H1: a numbered section title with a 4px navy rule (DSD printed report). H2: numbered, navy text. H3: a caption style for tables and figures.
- Key figures: four cards, each with a value, a label and a thin progress bar, with timeline elapsed as the reference marker.
- Status: a pill with a text label (On track, At risk, Off track, Not available) in DSD success, warning, danger and neutral tokens. Colour is never the only signal.
- Tables: bordered, with a subtle header fill, zebra rows and a repeating header across pages. Numbers are right-aligned.
- Narrative blocks: body text at a 65 to 75 character measure. In the in-app preview a dashed outline with an "Editable" tag marks them; the outline does not print.
- Page rules: sections start on a new page only in Midterm and Final, cards and table rows avoid page breaks, and there are no dark page fills.

## Naming

- Title: `<Project or program title> - <Preset label>, <period>`. Example: "Coastal Livelihoods Project - Midterm Report, Jan to Sep 2026".
- File: the saved report name with reserved characters replaced, as today.

## Decisions for the developer

1. DOCX writer: there is no library today. The options are the `docx` npm package (pure JS, one dependency) or hand-writing OOXML (large and fragile). Recommend `docx`, under the "absolutely necessary" clause, because DOCX is the only editable format requested.
2. Narrative storage: a new `report_narratives` JSON column on `Report`, or a child table. Recommend a JSON column bounded by a zod schema with a per-block character cap. This needs a migration and a CR.
3. Program scope: roll up in the first release, or ship project scope first. Recommend project scope first, because program roll-up needs aggregation rules for indicators that use different units.
4. Charts in DOCX: render the ECharts SVG to PNG during the Chromium pass, or omit charts in DOCX. Recommend rendering in the same Chromium pass.

## Testing

- Snapshot: each preset produces its required sections; toggles and grants drop sections without numbering gaps; an empty selected section shows its empty-state line.
- Parity: the totals in the PDF, DOCX, XLSX and CSV of the same report match.
- Privacy: segment and location filters never return cells under the suppression threshold and never return identities; identifying evidence never renders as an image.
- Narrative: edits persist, do not change the fingerprint, and never appear in audit events.
