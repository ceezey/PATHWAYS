# Pitch & Demo Script

**Status:** Working
**Version:** 2.0
**Last reconciled:** 2026-10-01
**Owner:** PATHWAYS capstone team
**IDEA:** idea-pathways.md

Defense: October 6, 2026. Timing: 5 minutes setup, 10 minutes presentation, 20 minutes tool presentation, 25 minutes Q&A. Source: developer answers 2026-10-01.

## 1. Narrative Spine

1. Field data fragment across tools and need repeated preparation (`docs/brd-pathways.md` section 2).
2. PATHWAYS centralizes project and Beneficiary records in one system.
3. Metadata structures import and validation.
4. Descriptive analytics and rule-based recommendations turn records into usable summaries.
5. Staff review and approve every recommendation and publication.
6. Approved public visibility supports transparency without sensitive leakage.

## 2. Slide / Scene Outline

| Block | Minutes | Content |
|---|---|---|
| Setup | 5 | Local seeded workspace running, accounts ready |
| Presentation | 10 | Narrative spine, scope and limits (`IDEA.md`) |
| Tool presentation | 20 | Live demo (section 3) |
| Q&A | 25 | Section 6 |

## 3. Live Demo Script

**Goal:** generate a report covering budget, KPI and descriptive analysis for a project. The demo runs on the local seeded workspace ([local development](runbook-local-dev.md)). Every step below is Met in `docs/prd-pathways.md`.

| Step | Role | Action | Route | Permission |
|---|---|---|---|---|
| 1 | Project Officer | Records activity progress and proof | `/projects/:projectId/activities/:activityId` | `activities.progress.update` |
| 2 | Project Officer | Submits an expense with a private receipt | `/projects/:projectId/budget` | `expenses.submit` |
| 3 | Monitoring and Evaluation Officer | Reviews the proof and approves or returns the update | `/projects/:projectId/evidence` | `evidence.review` |
| 4 | Monitoring and Evaluation Officer | Verifies the expense | `/projects/:projectId/budget` | `expenses.verify` |
| 5 | Project Manager | Approves the expense as a distinct reviewer | `/projects/:projectId/budget` | `expenses.approve` |
| 6 | Grant Manager | Signs off the expense and reads the budget | `/projects/:projectId/budget` | `expenses.signoff` |
| 7 | Project Manager | Reviews indicators and progress | `/projects/:projectId/monitor-evaluate` | Per route access in PRD section 5.1 |
| 8 | Program Manager | Views descriptive analytics (aggregates only) | `/analytics` | `analytics.descriptive.read` |
| 9 | Program Manager | Previews and generates the report | `/reports`, `/reports/preview` | `reports.generate` |

Not met, stated honestly:

- A location-specific report is not supported: the reporting feature scopes reports by project and period only, so the demo reports on a project.
- Export of every report type to CSV, XLS, XLSX and PDF is Not met (G-F12-4), so the demo shows preview and generation only.
- Prescriptive analytics is not offered; recommendations are rule-based (alignment audit PD-5, MA-02).

## 4. Judging Criteria Map

The panel gave no scored rubric. Criteria are the four Revision Matrix comments from the proposal defense, names withheld.

| Comment | PATHWAYS answer | Status |
|---|---|---|
| Panelist 1, comment 1: drop the organization name from the title and make the system reusable for humanitarian and development organizations | Title and focus revised to the current PATHWAYS title (`IDEA.md`) | Met for title and scope; cross-project template reuse Not met (audit R4, MA-01) |
| Panelist 1, comment 2: add a client-side or applicant-facing viewing module | Public Project Tracker for approved summaries, status, impact highlights and contact (public tracker feature); direct Beneficiary application excluded by safeguarding | Partly met: G-F13-1 to G-F13-4 Met, hosted verification G-F13-5 Not met (audit PD-7) |
| Panelist 2, comment 1: feel like a project-management platform, not output monitoring only | Project profiles, activities, milestones, budget and expenses, Beneficiary journey tracking (project, beneficiary and journey features) | Met for project management; journey gaps G-F3-6 and G-F4-6 Not met (audit PD-3) |
| Panelist 2, comment 2: descriptive and prescriptive analytics with recommendations | Descriptive analytics and rule-based recommendations under staff review | Descriptive Partly met (G-F9-9 Not met); prescriptive Not met, rule-based only (audit PD-5, MA-02) |

## 5. Production Readiness Gate (pre-demo)

Production stays blocked until the release criteria hold: see `docs/qad-pathways.md` section 6.1 and `docs/audit-pathways-manuscript-alignment-20261001.md`. The demo does not need production: it runs on the local seeded workspace ([local development](runbook-local-dev.md)).

- [ ] local stack reset and demo workspace loaded
- [ ] one account per role signed in with TOTP
- [ ] demo makes no hosted or production readiness claim

## 6. Anticipated Q&A

| Question | Answer |
|---|---|
| Is it prescriptive analytics? | No. Descriptive analytics plus predefined rule-based recommendations, reviewed by staff (PD-5) |
| Can beneficiaries apply? | No; the tracker is read-only and anonymous (public tracker bounds) |
| Is it in production? | No; production is gated on the alignment audit |
| Is the forty-hour saving measured? | No; it is an estimate to be measured in UAT (PD-8) |
| Who runs it after the capstone? | See `docs/wrap-pathways.md` section 4 |

## Self-Check

- [x] demo steps use only Met capabilities
- [x] Not met capabilities stated
- [x] no panelist or proponent names
