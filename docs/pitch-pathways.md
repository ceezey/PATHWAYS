# Pitch & Demo Script

**Status:** Working
**Version:** 2.1
**Last reconciled:** 2026-10-05
**Owner:** PATHWAYS capstone team
**IDEA:** idea-pathways.md

Defense: October 6, 2026. Timing: 5 minutes setup, 10 minutes presentation, 20 minutes tool presentation, 25 minutes Q&A. Source: developer answers 2026-10-01.

## 1. Narrative Spine

One project cycle, told through one session (`docs/brd-pathways.md` section 2 for the problem):

1. **Plan:** indicators define success and metadata forms define what is collected.
2. **Collect:** field data enter through the forms, by import or encoding, into one beneficiary record.
3. **Verify:** nothing counts until a separate reviewer checks it.
4. **Decide:** verified data drive descriptive analytics and rule-based alerts that staff act on.
5. **Report:** one report, then an approved public summary.
6. **Completion:** a closed project shows the cycle finished: disaggregated results, OECD-DAC evaluation, public page.

## 2. Slide / Scene Outline

| Block | Minutes | Content |
|---|---|---|
| Setup | 5 | devV2 demo workspace reseeded, three role profiles signed in (section 3.3) |
| Presentation | 10 | Narrative spine, scope and limits (`IDEA.md`) |
| Tool presentation | 20 | Live demo (section 3) |
| Q&A | 25 | Section 6 |

## 3. Live Demo Script

**Goal:** trace one Safe Schools for Girls (SSG-ES-2026) life-skills session from plan to report, where each step uses what the previous step produced, then show Emergency Hygiene and Learning Kits (EHK-ES-2026) as the completed cycle. Roles: Monitoring and Evaluation Officer (M&E), Project Officer (PO), Project Manager (PM), plus an anonymous browser. The demo runs on the reseeded PATHWAYS-devV2 workspace ([defense demo reseed](runbook-defense-demo.md)); the local workspace is the fallback for every step ([local development](runbook-local-dev.md)). The task sheet's "Futuremakers" project is SSG-ES-2026.

L = live action, S = show seeded state. "Rehearsal" values are recorded at the local rehearsal; nothing else is assumed.

### 3.1 The Chain

| # | Role | Action | Input | Output | Expected on screen | FR |
|---|---|---|---|---|---|---|
| **Plan** | | *What the session must achieve and how it is recorded (2 min)* | | | | |
| 1 | M&E | S: SSG indicators: type, baseline, target, derived activity completion (`/projects/:ssg/indicators`) | Project | Targets the session must move | SSG-GIRLS-ENR 108 of 120 (150 registered, 111 girls); SSG-ATT-RATE 79.4 (baseline 68, target 90); SSG-KNOW-SCORE 67 of 75; LIB-ACT-COMPLETE derived | FR-9 |
| 2 | M&E | S: published SSG forms and their fields (`/collection/forms`) | Targets | Instruments for the session | Beneficiary registration, Life Skills Session Attendance, Household Profile Update, two feedback surveys | FR-6 |
| **Collect** | | *The PO brings the session's field data in (5 min)* | | | | |
| 3 | PO | S: dashboard with the assigned session activity; aside: no Budget or Public Tracker menu, and `/transparency` is refused | Instruments | Session to run | Flagged proof "Peer educator training for senior high school girls", overdue items | FR-1 |
| 4 | PO | L: upload the field registration sheet `beneficiary-registration-borongan.csv` against the SSG registration form; mapping runs automatically from the form metadata; validate; process (`/collection/import`) | Field sheet + form | 25 learner profiles enrolled in SSG | Every column auto-mapped; 25 valid and processed (rehearsal) | FR-6, FR-7, FR-8 |
| 5 | PO | S: one imported learner and her journey timeline; open "Update enrollment status" with the journey note field and the attendance entry form to show manual encoding, **without saving** (`/beneficiaries/:id`) | Profiles | Import and encoding land in one record | Profile fields match the form; fallback learner BEN-SSG-ES-2026-001 with attendance history | FR-3, FR-4, FR-5 |
| 6 | PO | L: record session progress with proof on the activity (`/projects/:ssg/activities/:id`) | Session held | Proof in the M&E queue | Update pending review | FR-2 |
| 7 | PO | L: log the session expense with a private receipt (Log expense on the activity) | Session cost | Expense in the M&E verify queue | Expense pending | FR-13 |
| **Verify** | | *Nothing counts until M&E checks it (4 min)* | | | | |
| 8 | M&E | L: proof queue shows step 6; approve it (`/projects/:ssg/evidence`) | Proof | Session progress counts | Update approved | FR-2 |
| 9 | M&E | L: verify the step 7 expense (activity expense review) | Expense | Expense in PM "Pending your approval" | Expense VERIFIED | FR-13 |
| 10 | M&E | S: the step 4 batch and its mapping (only M&E may revise it), beside the seeded Lavezares batch (`/collection/import`) | Step 4 batch | Only valid rows reach profiles and analytics | LAV-2026-007 day-first birth date and LAV-2026-008 blank consent rejected at validation | FR-7 |
| **Decide** | | *The PM acts on verified data (4 min)* | | | | |
| 11 | PM | L: approve the step 9 expense as the distinct reviewer (`/projects/:ssg/budget`) | Verified expense | Current budget position | Expense APPROVED; utilization rises (rehearsal) | FR-13 |
| 12 | PM | S: SSG descriptive analytics against the step 1 targets (`/analytics`) | Verified records | Project behind schedule | Participation, indicator trends, budget aggregate (rehearsal) | FR-11 |
| 13 | PM | L: open the alert the system raised for that delay, read its rule and recommendation, record the decision (`/alerts`) | Delay | Recorded decision | "Multiple activities behind schedule", MEDIUM, overdue activities at least 2; "Reschedule delayed activities", "Reassign field support" | FR-12, FR-14 |
| **Report** | | *One document, then the public summary (3 min)* | | | | |
| 14 | PM | L: preview and generate the SSG Project summary, export PDF (`/reports`) | Steps 4 to 13 | Project report | PDF downloads | FR-15 |
| 15 | PM | S: SSG public summary and frozen staff preview (`/transparency`) | Report-ready project | Waits for a second approver | "For review"; Approve disabled for the submitter | FR-16 |
| **Completion: EHK** | | *The same cycle, finished (3 min)* | | | | |
| 16 | M&E | S: EHK SADDD (`/analytics`, project EHK) | Closed project | Disaggregated results | Released after project end; no count from 1 to 4 shown | FR-10 |
| 17 | M&E | S: EHK evaluation (`/projects/:ehk/monitor-evaluate`); L: generate the Evaluation report as PDF (`/reports`) | Results | Evaluated project | SIGNED_OFF, overall 87.55; Relevance, Coherence, Effectiveness, Efficiency, Impact, Sustainability | FR-15 |
| 18 | Anonymous | S: public tracker and the EHK page (`/`, `/public/projects/:ehk`) | Approved, evaluated project | Public accountability | EHK, CRL and ALS listed; approved summary only | FR-17 |

About 21 minutes and 5 window switches. Controls are shown through seeded states (Lavezares rejects, disabled self-approval, PO refusal), not staged failures.

### 3.2 Requirements Coverage

| FR | Step | FR | Step | FR | Step |
|---|---|---|---|---|---|
| FR-1 | 3 | FR-7 | 4, 10 | FR-13 | 7, 9, 11 |
| FR-2 | 6, 8 | FR-8 | 4 | FR-14 | 13 |
| FR-3 | 5 | FR-9 | 1 | FR-15 | 14, 17 |
| FR-4 | 5 | FR-10 | 16 | FR-16 | 15 |
| FR-5 | 5 | FR-11 | 12 | FR-17 | 18 |
| FR-6 | 2, 4 | FR-12 | 13 | | |

### 3.3 Pre-Demo Checklist

- [ ] devV2 wiped, reseeded and `--verify` clean before any SADDD read ([defense demo reseed](runbook-defense-demo.md))
- [ ] three browser profiles signed in with TOTP: M&E, PO, PM; beneficiary step-up PIN set
- [ ] one private window on the public tracker
- [ ] tabs pre-opened with the SSG and EHK project IDs; the SSG session activity chosen at rehearsal
- [ ] `beneficiary-registration-borongan.csv` on the presenting machine
- [ ] demo makes no hosted or production readiness claim

### 3.4 Do Not Click

- Withdraw on any published project: it cannot be re-approved with these three roles.
- Save in the step 5 encode dialogs.
- SADDD before `--verify`: the first read freezes the release.
- CSV reports on hosted: use PDF.
- The Borongan import outside the defense: it runs once per reseed, so rehearse it locally only.

### 3.5 Not Met, Stated Honestly

- Reports are scoped by project only; no location or period choice.
- Hosted CSV generation is unverified; the demo exports PDF. All six report kinds export as CSV, XLS, XLSX and PDF locally (G-F12-4 Met).
- Prescriptive analytics is not offered; recommendations are rule-based (alignment audit PD-5, MA-02).
- Evaluation scores are entered outside the app; the app shows, reports and controls them but has no scoring screen yet.

## 4. Judging Criteria Map

The panel gave no scored rubric. Criteria are the four Revision Matrix comments from the proposal defense, names withheld.

| Comment | PATHWAYS answer | Status |
|---|---|---|
| Panelist 1, comment 1: drop the organization name from the title and make the system reusable for humanitarian and development organizations | Title and focus revised to the current PATHWAYS title (`IDEA.md`) | Met for title and scope; cross-project template reuse Not met (audit R4, MA-01) |
| Panelist 1, comment 2: add a client-side or applicant-facing viewing module | Public Project Tracker for approved summaries, status, impact highlights and contact (step 18); direct Beneficiary application excluded by safeguarding | Partly met: G-F13-1 to G-F13-4 Met, hosted verification G-F13-5 Not met (audit PD-7) |
| Panelist 2, comment 1: feel like a project-management platform, not output monitoring only | Project profiles, activities, budget and expenses, Beneficiary journey tracking (steps 3 to 11) | Met, including identity review (G-F3-6) and journey notes (G-F4-6) |
| Panelist 2, comment 2: descriptive and prescriptive analytics with recommendations | Descriptive analytics and rule-based recommendations under staff review (steps 12, 13) | Descriptive Met (G-F9-9); prescriptive Not met, rule-based only (audit PD-5, MA-02) |

## 5. Production Readiness Gate (pre-demo)

Production stays blocked until the release criteria hold: see `docs/qad-pathways.md` section 6.1 and `docs/audit-pathways-manuscript-alignment-20261001.md`. The demo does not need production: it runs on the reseeded devV2 workspace. The pre-demo checklist is section 3.3.

## 6. Anticipated Q&A

| Question | Answer |
|---|---|
| Is it prescriptive analytics? | No. Descriptive analytics plus predefined rule-based recommendations, reviewed by staff (PD-5) |
| Who sets up the alert rules? | The System Administrator on the rules board: each rule is a metric, a condition and threshold, a severity and predefined recommendations; staff see the condition and recommendation on every alert (step 13) |
| Why was the new form not published live? | The author of a form cannot publish it; a second reviewer must, the same control as step 15 |
| Where is the Grant Manager? | Sign-off is a later control on an approved expense; budget utilization already counts approved expenses |
| How are OECD-DAC scores produced? | The evaluator scores each criterion from PATHWAYS evidence (indicators, budget, participation, SADDD); scores are recorded outside the app today and in-app scoring is deferred ([deferred features](deferred-features.md)) |
| Can reports be filtered by location? | No; reports are scoped by project |
| Do alerts run on their own when hosted? | The hosted scheduler needs a one-time activation (G-F10-7 Partly met); locally the rules dispatcher runs it |
| Can beneficiaries apply? | No; the tracker is read-only and anonymous (public tracker bounds) |
| Is it in production? | No; production is gated on the alignment audit |
| Is the forty-hour saving measured? | No; it is an estimate to be measured in UAT (PD-8) |
| Who runs it after the capstone? | See `docs/wrap-pathways.md` section 4 |

## Self-Check

- [x] demo steps use only Met capabilities and the three demo roles
- [x] each step consumes the previous step's output
- [x] Not met capabilities stated
- [x] no panelist or proponent names
