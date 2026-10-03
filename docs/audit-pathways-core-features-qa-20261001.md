# PATHWAYS Core Features QA (PRD-F1 to PRD-F8)

Date: 2026-10-01. Branch: dev (a75406d). Read-only QA against PRD section 4 gates, QAD rows, deferred register and the manuscript alignment audit.

## Test runs

| Scope | Result |
|---|---|
| apps/api beneficiaries, participants | 80/80 pass |
| apps/api indicators, analytics | 60/60 pass |
| apps/web features/projects | 291/291 pass |
| apps/web features/collection | 150/150 pass |
| apps/web project-indicators, analytics-dashboard | 67/67 pass |
| packages/imports | 73/73 pass |
| apps/api imports, metadata | Not run (needs database) |

## Gate summary

| Feature | Met | Not met / partial | Notes |
|---|---|---|---|
| F1 RBAC | 10/10 (closed 2026-10-03) | None; G-F1-10 met for app sign-in, hosted bypass deferred | Superseded: QAD-T36/T37/T38 and T39/T86/A25 exist |
| F2 Projects | 19/19 | none (G-F2-4 archive Met, MA-05 closed 2026-10-03) | QAD rows present for all 19 gates (checked 2026-10-03); budget tab rebuilt with utilization and remaining balance; target-goal CR dropped |
| F3 Beneficiaries | 5/6 | G-F3-6 partial: no role holds identities.review (MA-14) | Tests exist, PRD cell stale |
| F4 Journey | 5/6 | G-F4-6 journey note not built (MA-06) | G-F4-1/3/4 untested; SA holds journeys.read |
| F5 Collection | 4/5 | G-F5-1 partial: author cannot publish own form, single-officer projects blocked | G-F5-3 cell should cite QAD-T53 |
| F6 Integration | 6/7 | G-F6-7 type choice and value map not built (MA-07); superseded 2026-10-03: built by cr-pathways-import-value-map, 7/7 Met | automatic-mapping route undocumented |
| F7 Indicators | 5/5 | None; project template library stays deferred (MA-01, deferred-features) | Superseded 2026-10-03: the dead mock file is gone and every gate has happy, sad and abuse rows (QAD-T55, T106, A35; T07, T107, A36; T56, T108, A37, P05; T57, T109, A38; IL-01, T58, IL-02) |
| F8 Dashboard | 6/7 | G-F8-7 load not verified (MA-08) | G-F8-1/4/6 lack QAD rows; UC-F8-2 route name drift |

## UI alignment (all features)

- Tokens in apps/web/src/app/globals.css do not match the color foundations: primary, foreground, background (canvas), border, semantic sets; cyan family and 100-level tints missing.
- Radius is a single 6px variable; foundations require 4/8/12/16/999.
- Button sizes 40/44 instead of 36/44/52; several collection controls under 44px.
- Charts hardcode hex values and use danger red for neutral categories.
- collection-workspace.tsx is 3,138 lines.

## Decisions required (Change Record or descope)

G-F3-6, G-F4-5 (SA journeys.read), G-F4-6, G-F5-1 two-person rule, G-F6-7 (superseded 2026-10-03: Met), G-F7-5, G-F8-7.

> Note 2026-10-01: G-F8-7 was later measured locally at assumed scale and is Met (single user; staging re-measure pending); see QAD-T62 in [qad-pathways](qad-pathways.md). The finding above is kept as dated.
