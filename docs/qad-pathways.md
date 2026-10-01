# Quality Assurance Document (QAD)

**Status:** Locked
**Version:** 2.0
**Last reconciled:** 2026-10-01
**Owner:** PATHWAYS capstone team

Quality evidence for PATHWAYS, organized by the eight ISO/IEC 25010 product quality characteristics. Gates `G-F<n>-<m>`, use cases `UC-F<n>-<m>` and `NFR-<n>` are defined in the [PRD](prd-pathways.md).

## 1. Testing Strategy & Scope

The quality model is ISO/IEC 25010. Each characteristic has automated tests, manual checks and stated gaps in section 3.5.

Every implemented feature requires:

- a happy path;
- a sad or error path;
- an abuse or hostile path;
- authorization and isolation checks;
- data-integrity checks;
- accessibility checks where applicable.

- A successful build alone is not completion evidence.
- Feature tests run alongside the [SAD review gates](sad-pathways.md); automated check success does not imply semantic approval.
- Proposed changes need concurrent specialist reviews before implementation, and final content needs renewed review and external evidence validation.
- Scope: the 13 features PRD-F1 to PRD-F13. The Must-Have features PRD-F1 to PRD-F8 are traced in section 3.4.
- Out of scope: hosted-environment verification of public pages (gate G-F13-5 is Not met).

## 2. Test Environments & Data

| Environment | Use | Data |
|---|---|---|
| Local development (`pnpm dev`, `pnpm db:local:start`) | unit, API and browser runs | synthetic seed only (`pnpm db:local:seed`, `pnpm db:local:demo`) |
| CI, disposable PostgreSQL 18 | migration replay, SQL runtime tests, `pnpm test` | fixtures in `apps/api/prisma/tests/` |
| Hosted staging | release verification | synthetic or anonymized only |

- Use synthetic or anonymized organizations, projects, Beneficiaries, auth identities, uploads and evidence.
- No real Beneficiary data in any test environment.
- Hosted databases and confidential data are never part of CI.

## 3. Core Test Scenarios (Test Matrix)

168 rows: 117 carried forward with stable IDs and 51 added so that every PRD gate has a QAD row. Evidence is a repository test path, a command, or `Manual`. A row whose gate is Not met records the test as pending.

### 3.1 Happy Paths

| QAD ID | Scenario | Path | ISO/IEC 25010 | PRD | Gate | UC | Evidence |
|---|---|---|---|---|---|---|---|
| QAD-T01 | active user resolves trusted org/role/permission/project scope | Happy | Security | PRD-F1 | G-F1-1 | UC-F1-1 | `apps/api/src/modules/auth/workspace-resolution.service.test.ts` |
| QAD-T02 | authorized project/activity workflow persists | Happy | Functional Suitability | PRD-F2 | G-F2-5, G-F2-6 | UC-F2-2 | `apps/api/src/modules/activities/activities.service.test.ts`; `apps/api/src/modules/projects/projects.service.test.ts` |
| QAD-T03 | authorized Beneficiary create/search in scope | Happy | Functional Suitability | PRD-F3 | G-F3-1 | UC-F3-1 | `apps/api/src/modules/beneficiaries/beneficiaries.service.test.ts` |
| QAD-T04 | journey/participation history persists chronologically | Happy | Functional Suitability | PRD-F4 | G-F4-2 | UC-F4-2 | `apps/api/src/modules/participants/participants.service.test.ts` |
| QAD-T05 | valid form/direct entry persists validated data | Happy | Functional Suitability | PRD-F5 | G-F5-1, G-F5-2 | UC-F5-2 | `apps/api/src/modules/metadata/metadata.service.test.ts`; `apps/web/src/features/collection/direct-form-entry-workspace.test.tsx` |
| QAD-T06 | mapped import validates and normalizes | Happy | Functional Suitability | PRD-F6 | G-F6-1 | UC-F6-4 | `apps/api/src/modules/imports/imports.service.test.ts` |
| QAD-T07 | indicator shows correct trusted metric/target/source | Happy | Functional Suitability | PRD-F7 | G-F7-2 | UC-F7-2 | `apps/api/src/modules/indicators/indicators.service.test.ts` |
| QAD-T08 | dashboard/SADDD uses trusted data and suppression | Happy | Functional Suitability | PRD-F8 | G-F8-2 | UC-F8-1 | `apps/api/src/modules/dashboards/analytics.service.test.ts` |
| QAD-T12 | descriptive summary uses trusted persisted metrics; a readable but empty set shows "None yet"; missing, withheld or unauthorized data keeps the existing unavailable or restricted wording; no value is ever fabricated as 0 | Happy | Functional Suitability | PRD-F9 | G-F9-1 | UC-F9-1 | `packages/shared/src/monitoring/descriptive-analytics-views.test.ts`; `apps/api/src/modules/dashboards/analytics.service.test.ts` |
| QAD-T14 | survey view pairs the latest PRE_TEST/POST_TEST per enrollment and reports the correct mean pre/post/change and improved/same/declined split for a group of 5 or more pairs | Happy | Functional Suitability | PRD-F9 | G-F9-2 | UC-F9-1 | `packages/shared/src/monitoring/descriptive-analytics-views.test.ts`; `apps/api/src/modules/dashboards/analytics.service.test.ts` |
| QAD-T15 | timeline view's elapsed/remaining/overdue/activity metrics match the reused rule-metric population math, and milestone on-time percent matches completed milestones rated on time | Happy | Functional Suitability | PRD-F9 | G-F9-3 | UC-F9-1 | `packages/shared/src/monitoring/descriptive-analytics-views.test.ts`; `apps/api/src/modules/dashboards/analytics.service.test.ts` |
| QAD-T16 | each descriptive view request writes one `ANALYTICS_DESCRIPTIVE_VIEWED` audit row, and each export writes one `ANALYTICS_DESCRIPTIVE_EXPORTED` row with contract version, view and row count | Happy | Security | PRD-F9 | G-F9-4 | UC-F9-1 | `apps/api/src/modules/dashboards/analytics.service.test.ts` |
| QAD-T17 | survey pairing tie-break (assessment date, then row id) is deterministic across a same-date repeat and independent of the source array's order; `byActivity` is sorted by activity id; a non-finite score/maximum is excluded and counted, never treated as a valid measurement | Happy | Reliability | PRD-F9 | G-F9-5 | UC-F9-1 | `packages/shared/src/monitoring/descriptive-analytics-views.test.ts` |
| QAD-T18 | web survey table maps a `byActivity` group's activity id to its persisted activity title (never a raw UUID), with a neutral fallback when the activity cannot be found; percent-valued cells (survey mean pre/post, timeline elapsed/activity-completion/milestone-on-time) render with a `%` unit and survey mean change renders in percentage points (`pp`, never `%`) via the shared Overview label helper; timeline day and count cells carry no `%` | Happy | Usability | PRD-F9 | None | UC-F9-1 | `apps/web/src/features/reports/survey-report-utils.test.ts` |
| QAD-T09 | rule triggers once with versioned evidence | Happy | Functional Suitability | PRD-F10 | G-F10-1 | UC-F10-1 | `apps/api/src/modules/rules/rule-engine.test.ts` |
| QAD-T10 | authorized human reviews predefined recommendation | Happy | Functional Suitability | PRD-F11 | G-F11-1 | UC-F11-1 | `apps/web/src/features/analytics/recommendation-detail-workspace.test.tsx` |
| QAD-T13 | report/visualization output respects role scope and SADDD suppression | Happy | Security | PRD-F12 | G-F12-1 | UC-F12-2 | `apps/api/src/modules/reports/reports.service.test.ts` |
| QAD-T11 | public surface exposes only approved data/media | Happy | Security | PRD-F13 | G-F13-1 | UC-F13-2 | `apps/api/src/modules/public/public.service.test.ts` |
| QAD-IMP-01 | a claim promotes in chunks of at most 25 rows, reads its form context once and audits every row | Happy | Performance Efficiency | PRD-F6 | None | UC-F6-4 | `apps/api/src/modules/imports/imports.chunked-promotion.test.ts`; `apps/api/prisma/tests/import-pipeline-runtime.sql` |
| QAD-IMP-02 | a 5,000-row batch finishes through repeated process calls with visible progress and no clicks | Happy | Performance Efficiency | PRD-F6 | G-F6-5 | UC-F6-4 | `apps/api/src/modules/imports/imports.chunked-promotion.test.ts`; `apps/api/prisma/tests/import-pipeline-runtime.sql` |
| QAD-IMP-03 | a text-layer PDF table imports as `column_NNNN` rows identical in shape to a spreadsheet | Happy | Compatibility | PRD-F6 | None | UC-F6-1 | `packages/imports/src/parser/secure.pdf.test.ts`; `apps/api/prisma/tests/import-pdf-file-type-runtime.sql` |
| QAD-IMP-04 | each form-definition export format downloads and writes one audit row without field content | Happy | Compatibility | PRD-F5 | G-F5-4 | UC-F5-3 | `apps/api/src/modules/metadata/form-definition-export.service.test.ts` |
| QAD-SM-01 | exact, synonym, token-set, token-overlap and edit-distance names score their tiers; the same input always gives the same decisions, in any input order | Happy | Functional Suitability | PRD-F6 | None | UC-F6-2 | `apps/api/src/modules/imports/automatic-mapping.service.test.ts`; `packages/imports/src/mappers/smart-match.test.ts` |
| QAD-SM-02 | a high-confidence column with compatible sampled values is auto-mapped and shows "Auto-matched" with its reason | Happy | Functional Suitability | PRD-F6 | None | UC-F6-2 | `apps/api/src/modules/imports/automatic-mapping.service.test.ts`; `packages/imports/src/mappers/smart-match.test.ts` |
| QAD-SM-03 | an M&E Officer confirms one suggestion or all suggestions; the confirmation is a new manual revision attributed to the reviewer | Happy | Functional Suitability | PRD-F6 | None | UC-F6-2 | `apps/api/src/modules/imports/mapping-confirmation.service.test.ts` |
| QAD-SM-04 | the web preview and the API produce the same decisions from the shared matcher | Happy | Functional Suitability | PRD-F6 | None | UC-F6-2 | `apps/api/src/modules/imports/automatic-mapping.service.test.ts`; `packages/imports/src/mappers/smart-match.test.ts` |
| QAD-DRF-01 | a Project Officer, M&E Officer or Project Manager on a project with no published registration form provisions one system form with exactly the canonical field set; a second call returns the same form | Happy | Functional Suitability | PRD-F3 | G-F3-3 | UC-F3-1 | `apps/api/src/modules/beneficiaries/default-registration-form.test.ts`; `apps/api/prisma/tests/default-registration-form-runtime.sql` |
| QAD-DRF-02 | registration through the system form writes the same profile, enrollment, submission, response and consent rows as a project form | Happy | Functional Suitability | PRD-F3 | None | UC-F3-1 | `apps/api/src/modules/beneficiaries/default-registration-form.test.ts`; `apps/api/prisma/tests/default-registration-form-runtime.sql` |
| QAD-DRF-03 | a project with its own published registration form is offered that form, not the system form | Happy | Functional Suitability | PRD-F3 | None | UC-F3-1 | `apps/api/src/modules/beneficiaries/default-registration-form.test.ts`; `apps/api/prisma/tests/default-registration-form-runtime.sql` |
| QAD-DRF-04 | age 5 at the enrollment date is accepted; the web derives a read-only age from the birth date and caps the birth date at the business date | Happy | Functional Suitability | PRD-F3 | None | UC-F3-1 | `apps/api/src/modules/beneficiaries/default-registration-form.test.ts`; `apps/api/prisma/tests/default-registration-form-runtime.sql` |
| QAD-P01 | List and summary reads are reused for at most 30 seconds under the same organization, user, role, permissions, assignments and project; the Activities tab reuses the Overview project read | Happy | Performance Efficiency | PRD-F2 | None | UC-F2-2 | `apps/web/src/providers/authorized-query-cache.test.tsx`; `apps/web/src/features/projects/project-activities-workspace.test.tsx` |
| QAD-P02 | Activity list returns the lean projection; the detail route reads `GET /activities/:id`; indicators and journey stages load once per workspace and indicator search works without opening a panel | Happy | Performance Efficiency | PRD-F2 | None | UC-F2-2 | `apps/web/src/providers/authorized-query-cache.test.tsx`; `apps/web/src/features/projects/project-activities-workspace.test.tsx` |
| QAD-P03 | Overview metrics derive KPI achievement, budget utilization, suppressed reach and timeline deterministically with documented rounding | Happy | Functional Suitability | PRD-F2 | G-F2-19 | UC-F2-1 | `apps/api/src/modules/projects/project-overview-metrics.service.test.ts`; `packages/shared/src/monitoring/overview-metrics.test.ts` |
| QAD-RBP-01 | Each of the six roles sees only the activity/indicator/tab actions its own API permissions and project scope allow; a Project Officer sees Create Activity and Record progress/Submit proof only when personally assigned | Happy | Security | PRD-F2 | G-F2-11 | UC-F2-2 | `apps/web/src/features/projects/project-activities-rbac.test.tsx`; `apps/web/src/lib/rbac/ui-action-availability.test.ts` |
| QAD-RBP-02 | The activity dialog's officer list comes from the assignable-officer read and lists only active Project Officers with an active assignment to that project, ordered by display name then ID and bounded to 50 rows | Happy | Security | PRD-F2 | G-F2-12 | UC-F2-2 | `apps/api/src/modules/projects/projects.service.test.ts`; `apps/api/src/modules/activities/activities.access.test.ts` |
| QAD-RBP-03 | A locked activity budget, indicator link or project profile field shows its current value, stays disabled, and exposes the tooltip "You are not authorized to change this field" on hover and keyboard focus through `aria-describedby` | Happy | Usability | PRD-F2 | None | UC-F2-1 | `apps/web/src/components/pathways/locked-field.test.tsx` |
| QAD-RBP-04 | The project form shows a single "Implementing partners" structured field; the detail view shows only structured partners | Happy | Usability | PRD-F2 | None | UC-F2-1 | `apps/web/src/features/projects/project-setup-form.test.tsx` |
| QAD-T36 | an actor holding `audit.read` lists audit events in their scope with filters; other roles are denied | Happy | Security | PRD-F1 | G-F1-7 | UC-F1-5 | `apps/api/src/modules/audit/audit.service.test.ts`; `apps/web/src/features/settings/audit-log-workspace.test.tsx` |
| QAD-T37 | a user views and updates only their own profile | Happy | Functional Suitability | PRD-F1 | G-F1-8 | UC-F1-3 | `apps/api/src/modules/auth/application-profile.service.test.ts`; `apps/web/src/features/profile/own-profile-workspace.test.tsx` |
| QAD-T38 | a user requests a password reset from the sign-in page and sets a new password through the recovery link | Happy | Security | PRD-F1 | G-F1-9 | UC-F1-2 | `apps/web/src/features/auth/password-recovery.test.ts`; `apps/web/src/features/auth/password-recovery-routes.test.ts` |
| QAD-T41 | a reviewer other than the submitter approves or returns an update, and only approval moves activity progress | Happy | Functional Suitability | PRD-F2 | G-F2-7 | UC-F2-4 | `apps/api/src/modules/activities/activity-proof-review-flow.test.ts`; `apps/api/src/modules/activities/activity-review-completion.test.ts` |
| QAD-T42 | a reviewer records an overdue explanation for an activity | Happy | Functional Suitability | PRD-F2 | G-F2-9 | UC-F2-4 | `apps/api/src/modules/activities/activity-overdue-explanation.test.ts`; `apps/api/prisma/tests/activity-overdue-explanation-runtime.sql` |
| QAD-T43 | milestones are created and updated only with `milestones.manage` | Happy | Functional Suitability | PRD-F2 | G-F2-10 | UC-F2-5 | `apps/api/src/modules/activities/activity-milestones.test.ts` |
| QAD-T44 | a budget record is created or replaced with a stale-revision check | Happy | Functional Suitability | PRD-F2 | G-F2-14 | UC-F2-6 | `apps/api/src/modules/finance/finance.ledger.test.ts` |
| QAD-T45 | an expense is submitted against a budget reference and a retry with the same client request id does not duplicate it | Happy | Reliability | PRD-F2 | G-F2-15 | UC-F2-7 | `apps/api/src/modules/finance/finance.ledger.test.ts`, `apps/api/prisma/tests/finance-expense-runtime.sql` |
| QAD-T46 | a private receipt is attached to a pending expense and verification or approval needs it | Happy | Functional Suitability | PRD-F2 | G-F2-16 | UC-F2-7 | `apps/api/src/modules/finance/finance.service.test.ts`; `apps/api/prisma/tests/finance-evaluation-decisions.sql` |
| QAD-T47 | an expense is verified, then approved by a distinct reviewer, and rejection requires a reason | Happy | Functional Suitability | PRD-F2 | G-F2-17 | UC-F2-8 | `apps/api/src/modules/finance/finance.boundary.test.ts`; `apps/api/prisma/tests/finance-evaluation-decisions.sql` |
| QAD-T48 | final sign-off is recorded once per expense by a holder of `expenses.signoff` | Happy | Functional Suitability | PRD-F2 | G-F2-18 | UC-F2-9 | `apps/api/src/modules/finance/finance.ledger.test.ts`, `apps/api/prisma/tests/finance-expense-runtime.sql` |
| QAD-T49 | System Administrator, Monitoring and Evaluation Officer and Project Manager save journey stages; other roles are denied | Happy | Functional Suitability | PRD-F4 | G-F4-1 | UC-F4-1 | `apps/api/src/modules/participants/participants.service.test.ts` |
| QAD-T50 | a completion, dropout or transfer event closes the enrollment with its end date and reason | Happy | Functional Suitability | PRD-F4 | G-F4-3 | UC-F4-2 | `apps/api/src/modules/participants/participants.service.test.ts` |
| QAD-T51 | a correction adds a new event linked to the original with a required reason and the original is never overwritten | Happy | Reliability | PRD-F4 | G-F4-4 | UC-F4-3 | `apps/api/src/modules/participants/participants.service.test.ts` |
| QAD-T53 | a draft submission is saved and edited before submit | Happy | Functional Suitability | PRD-F5 | G-F5-3 | UC-F5-2 | `apps/web/src/features/collection/direct-form-entry-workspace.test.tsx`; `apps/web/src/features/collection/form-builder-session-draft.test.ts` |
| QAD-T55 | an authorized user creates and updates an indicator in an assigned project; unauthorized roles and other organizations are refused | Happy | Functional Suitability | PRD-F7 | G-F7-1 | UC-F7-1 | `apps/api/src/modules/indicators/indicators.service.test.ts` |
| QAD-T56 | a measurement save is idempotent: the same key and input is read-only on retry and conflicting reuse fails | Happy | Reliability | PRD-F7 | G-F7-3 | UC-F7-2 | `apps/api/src/modules/indicators/indicators.service.test.ts` |
| QAD-T57 | indicator progress is independent of the retired project target goal and shows unavailable states instead of zero | Happy | Functional Suitability | PRD-F7 | G-F7-4 | UC-F7-2 | `apps/api/src/modules/indicators/indicators.service.test.ts`; `apps/api/prisma/tests/project-target-goal-runtime.sql` |
| QAD-T59 | dashboards show only the projects the role and assignment allow, with no cross-organization data | Happy | Security | PRD-F8 | G-F8-1 | UC-F8-1 | `apps/api/src/modules/dashboards/dashboard-home-authorization-parity.test.ts`; `apps/api/prisma/tests/dashboard-home-project-scope-runtime.sql` |
| QAD-T60 | age bands follow the locked boundaries; a missing birth date is Unknown and an invalid one is excluded | Happy | Functional Suitability | PRD-F8 | G-F8-4 | UC-F8-2 | `apps/api/src/modules/dashboards/analytics.service.test.ts`; `apps/api/src/modules/dashboards/c8-runtime.local.test.ts` |
| QAD-T61 | SADDD is omitted for an open project period instead of failing the dashboard | Happy | Reliability | PRD-F8 | G-F8-6 | UC-F8-2 | `apps/api/src/modules/dashboards/analytics.service.test.ts` |
| QAD-T65 | alert status follows the lifecycle state machine and terminal alerts accept no further disposition | Happy | Reliability | PRD-F10 | G-F10-4 | UC-F10-2 | `apps/api/src/modules/rules/alert-lifecycle.test.ts` |
| QAD-T66 | only holders of the alert permissions read, review or record an outcome, scoped to their organization and project | Happy | Security | PRD-F10 | G-F10-5 | UC-F10-2 | `apps/api/src/modules/rules/rules-human-contract.test.ts` |
| QAD-T69 | a recommendation outcome requires a note and records actor, time and decision | Happy | Functional Suitability | PRD-F11 | G-F11-2 | UC-F11-2 | `apps/web/src/features/analytics/human-review-action.test.tsx` |
| QAD-T70 | a user without the outcome permission sees the recommendation read-only | Happy | Security | PRD-F11 | G-F11-3 | UC-F11-2 | `apps/web/src/features/analytics/recommendation-detail-workspace.test.tsx` |
| QAD-T72 | a report export writes an audit event without report content | Happy | Security | PRD-F12 | G-F12-3 | UC-F12-3 | `apps/api/src/modules/reports/reports.service.test.ts` |
| QAD-T74 | publication requires a distinct approver and follows the publication state machine | Happy | Security | PRD-F13 | G-F13-3 | UC-F13-1 | `apps/api/src/modules/public/public.service.test.ts`; `apps/web/src/features/public/publication-queue-workspace.test.tsx` |
| QAD-T75 | a withdrawn project disappears from public reads immediately | Happy | Security | PRD-F13 | G-F13-4 | UC-F13-2 | `apps/api/src/modules/public/public.service.test.ts` |
| QAD-T77 | lint and typecheck pass across all workspaces before merge | Happy | Maintainability | PRD-F1 to PRD-F13 (NFR-14) | None | None | Command: `pnpm lint`; `pnpm typecheck` |
| QAD-T78 | the SAD checker routes changed paths to specialist reviews deterministically | Happy | Maintainability | PRD-F1 to PRD-F13 (NFR-14) | None | None | `scripts/sad/check.test.ts` |
| QAD-T79 | the schema, migration chain and security catalog replay on disposable PostgreSQL 18 from archive and from the baseline | Happy | Portability | PRD-F1 to PRD-F13 (NFR-11) | None | None | `infra/supabase/phase6/Replay-Local.ps1`; `apps/api/prisma/tests/baseline-security-catalog.sql` |
| QAD-IR-01 | an M&E Officer lists unreviewed same-name, same-birth-date pairs, then records Keep distinct or Link; each writes one audit event and the pair leaves the queue | Happy | Functional Suitability | PRD-F3 | G-F3-6 | UC-F3-3 | `apps/api/src/modules/beneficiaries/identity-review.service.test.ts`; `apps/web/src/features/beneficiaries/duplicate-resolution-workspace.test.tsx` |
| QAD-IL-01 | a library entry is created, listed and archived, and a project indicator created from it is an independent copy with the project period, baseline and target | Happy | Functional Suitability | PRD-F7 | G-F7-5 | UC-F7-1 | `apps/api/src/modules/indicators/indicator-library.service.test.ts`; `apps/web/src/features/projects/indicator-library-manager.test.tsx`; `apps/web/src/features/projects/project-indicators-workspace.test.tsx` |
| QAD-T88 | muted-foreground text and success-subtle background meet WCAG AA contrast ratio of 4.5:1 | Happy | Usability | PRD-F1 to PRD-F13 (NFR-2) | None | None | `apps/web/src/app/contrast.test.ts` |

### 3.2 Sad Paths

| QAD ID | Scenario | Path | ISO/IEC 25010 | PRD | Gate | UC | Evidence |
|---|---|---|---|---|---|---|---|
| QAD-T20 | suspended/deactivated/archived account denied | Sad | Security | PRD-F1 | G-F1-2 | UC-F1-1 | `apps/api/src/modules/auth/session-liveness.service.test.ts` |
| QAD-T21 | invalid import remains staged/error | Sad | Reliability | PRD-F6 | None | UC-F6-3 | `apps/api/src/modules/imports/imports.service.test.ts` |
| QAD-T22 | missing required mapping blocks normalization | Sad | Reliability | PRD-F6 | G-F6-2 | UC-F6-3 | `apps/api/src/modules/imports/imports.service.test.ts` |
| QAD-T23 | invalid/missing metric denominator does not produce misleading percentage | Sad | Functional Suitability | PRD-F8 | None | UC-F8-1 | `packages/shared/src/monitoring/metric-contract.test.ts` |
| QAD-T24 | unavailable rule metric -> explicit unavailable/not-evaluated | Sad | Reliability | PRD-F10 | G-F10-2 | UC-F10-1 | `apps/api/src/modules/rules/rule-metrics.test.ts` |
| QAD-T25 | disallowed upload rejected | Sad | Security | PRD-F6 | None | UC-F6-1 | `packages/imports/src/parser/secure.test.ts` |
| QAD-T26 | export/report failure leaves source data intact | Sad | Reliability | PRD-F12 | G-F12-2 | UC-F12-3 | `apps/api/src/modules/reports/reports.service.test.ts`; `apps/api/src/modules/reports/report-artifact.test.ts` |
| QAD-T27 | survey view with 0 paired assessments in a group reports `MISSING` (`NO_PAIRED_ASSESSMENTS`), never 0 | Sad | Functional Suitability | PRD-F9 | None | UC-F9-1 | `packages/shared/src/monitoring/descriptive-analytics-views.test.ts` |
| QAD-T28 | survey view with 1, 4, or 5 paired assessments in a group: 1 and 4 are fully suppressed (`SMALL_CELL`), 5 is released; improved/same/declined never reveal a sub-count the pair total suppressed | Sad | Security | PRD-F9 | None | UC-F9-1 | `packages/shared/src/monitoring/descriptive-analytics-views.test.ts`; `apps/api/prisma/tests/f9-descriptive-aggregates-runtime.sql` |
| QAD-T29 | timeline view with no completed, rated milestones reports `MISSING` (`NO_COMPLETED_MILESTONES`), never 0 | Sad | Functional Suitability | PRD-F9 | None | UC-F9-1 | `packages/shared/src/monitoring/descriptive-analytics-views.test.ts` |
| QAD-T30 | descriptive analytics retrieval fault (provider/database) returns 503, never a 500 or a silently empty payload, for both the read and the export path (one shared fault-mapping helper) | Sad | Reliability | PRD-F9 | G-F9-6 | UC-F9-1 | `apps/api/src/modules/dashboards/analytics.service.test.ts` |
| QAD-T31 | roles holding `assessments.detail.read` (Project Manager, Monitoring and Evaluation Officer) receive real survey aggregates on read and export from `pathways.p10_f9_survey_aggregate`; Program Manager and Grant Manager (no `assessments.detail.read`) do not (see QAD-T34); Project Officer, cross-organization and out-of-scope projects are denied (`42501`/403); pairing, same-date tie-break, invalid scores and the no-activity group match the calculator; the output holds no enrollment or assessment identifier (`f9-descriptive-aggregates-runtime.sql`) | Sad | Security | PRD-F9 | None | UC-F9-1 | `apps/api/src/modules/dashboards/analytics.service.test.ts`; `apps/api/prisma/tests/f9-descriptive-aggregates-runtime.sql` |
| QAD-T32 | Program Manager and Grant Manager (no `activities.read`) receive real timeline activity and milestone counts on read and export from `pathways.p10_f9_timeline_aggregate`, never `NO_ACTIVITIES` caused by a permission restriction; cancelled and archived activities are excluded, the reporting-date boundary is not overdue, and milestone counts match the on-time calculation; a statement timeout is 503, never an empty view | Sad | Security | PRD-F9 | None | UC-F9-1 | `apps/api/src/modules/dashboards/analytics.service.test.ts`; `apps/api/prisma/tests/f9-descriptive-aggregates-runtime.sql` |
| QAD-T33 | survey results are released only for an exact, non-overlapping defined reporting period: a custom range, an adjacent-day range, a missing period and a defined period overlapping another defined period are refused (`22023` in `f9-descriptive-aggregates-runtime.sql` for a role holding `assessments.detail.read`, 400 with no audit row on read and export in the API tests for Project Manager and Monitoring and Evaluation Officer); an exact defined period, including two adjacent non-overlapping ones, is released | Sad | Security | PRD-F9 | G-F9-7 | UC-F9-1 | `apps/api/src/modules/dashboards/analytics.service.test.ts`; `apps/api/prisma/tests/f9-descriptive-aggregates-runtime.sql` |
| QAD-T34 | survey improvement is restricted for Program Manager and Grant Manager (no `assessments.detail.read`): the survey function raises `42501` for them (`f9-descriptive-aggregates-runtime.sql`), the API answers read and export with 403 before any query and writes no audit row, the web disables the survey option, shows "Survey improvement is restricted for your role." (never "None yet", no Retry) and issues no survey fetch; the timeline view stays real for both roles; Project Manager and Monitoring and Evaluation Officer still receive the survey | Sad | Security | PRD-F9 | None | UC-F9-1 | `apps/api/src/modules/dashboards/analytics.service.test.ts`; `apps/api/prisma/tests/f9-descriptive-aggregates-runtime.sql` |
| QAD-T35 | a 400 from the survey fetch (refused or overlapping period) shows "This reporting period cannot be used for survey results." with no Retry; a network or 5xx failure keeps Retry; the survey period picker hides periods that overlap another defined period | Sad | Usability | PRD-F9 | None | UC-F9-1 | `apps/web/src/features/analytics/analytics-reporting-periods.test.ts` |
| QAD-IMP-05 | a failed chunk rolls back and reruns row by row; only the failing row is released and retried to the attempt limit | Sad | Reliability | PRD-F6 | None | UC-F6-4 | `apps/api/src/modules/imports/imports.chunked-promotion.test.ts`; `apps/api/prisma/tests/import-pipeline-runtime.sql` |
| QAD-IMP-06 | a retry after a partial chunk reuses the existing submission instead of creating a second one | Sad | Reliability | PRD-F6 | None | UC-F6-4 | `apps/api/src/modules/imports/imports.chunked-promotion.test.ts`; `apps/api/prisma/tests/import-pipeline-runtime.sql` |
| QAD-IMP-07 | a scanned, encrypted, table-less, over-page or oversized PDF fails with its stable code and message | Sad | Compatibility | PRD-F6 | None | UC-F6-1 | `packages/imports/src/parser/secure.pdf.test.ts`; `apps/api/prisma/tests/import-pdf-file-type-runtime.sql` |
| QAD-IMP-08 | a failed or stopped processing run keeps server state and offers Resume processing | Sad | Reliability | PRD-F6 | None | UC-F6-4 | `apps/api/src/modules/imports/imports.chunked-promotion.test.ts`; `apps/api/prisma/tests/import-pipeline-runtime.sql` |
| QAD-IMP-09 | a form definition beyond the artifact bounds fails whole and is never truncated | Sad | Reliability | PRD-F5 | None | UC-F5-3 | `apps/api/src/modules/metadata/form-definition-export.service.test.ts` |
| QAD-SM-05 | "Gender" is never auto-mapped to `sex`; it stays PENDING with a suggestion | Sad | Functional Suitability | PRD-F6 | G-F6-3 | UC-F6-2 | `apps/api/src/modules/imports/automatic-mapping.service.test.ts`; `packages/imports/src/mappers/smart-match.test.ts` |
| QAD-SM-06 | a tie, a small margin, a failed value gate or no samples leaves the column PENDING with at most one suggestion; no field is mapped twice | Sad | Functional Suitability | PRD-F6 | None | UC-F6-2 | `apps/api/src/modules/imports/automatic-mapping.service.test.ts`; `packages/imports/src/mappers/smart-match.test.ts` |
| QAD-SM-07 | an identical retry returns the same receipt; a changed recomputation, a V1 revision or a stale or frozen batch conflicts | Sad | Reliability | PRD-F6 | None | UC-F6-2 | `apps/api/src/modules/imports/automatic-mapping-receipt.test.ts` |
| QAD-DRF-05 | age 4, a supplied age below 5 and a future birth date are rejected on create, import and changed-profile edit with "Beneficiary must be at least 5 years old." or "Date of birth cannot be in the future." | Sad | Functional Suitability | PRD-F3 | G-F3-2 | UC-F3-1 | `packages/shared/src/validation/beneficiary-registration.test.ts`; `apps/api/src/modules/beneficiaries/default-registration-form.test.ts`; `apps/api/prisma/tests/default-registration-form-runtime.sql` |
| QAD-DRF-06 | an edit of an existing under-5 record that keeps its birth date and age is accepted | Sad | Functional Suitability | PRD-F3 | None | UC-F3-1 | `packages/shared/src/validation/beneficiary-registration.test.ts`; `apps/api/src/modules/beneficiaries/default-registration-form.test.ts`; `apps/api/prisma/tests/default-registration-form-runtime.sql` |
| QAD-DRF-07 | an archived system form is not recreated and the web shows an unavailable state without retrying | Sad | Reliability | PRD-F3 | None | UC-F3-1 | `apps/api/src/modules/beneficiaries/default-registration-form.test.ts`; `apps/api/prisma/tests/default-registration-form-runtime.sql` |
| QAD-P04 | Readable but empty sources show "None yet" or their specific reason, never 0; an activity logged budget shows "None yet" only for an expense reader with no approved expenses and "Unavailable" when withheld; load failures and permission states keep error wording; an unknown activity id shows a not-found state without redirecting | Sad | Usability | PRD-F2 | None | UC-F2-1 | `apps/web/src/features/projects/project-detail-view.test.tsx` |
| QAD-P05 | A replayed indicator save or recovery displays its confirming authorized read without a second reload | Sad | Reliability | PRD-F7 | None | UC-F7-2 | `apps/web/src/features/projects/project-indicators-workspace.reload.test.tsx` |
| QAD-RBP-05 | A forged capability flag or a hidden UI action still returns 403 from the API when called directly | Sad | Security | PRD-F2 | G-F2-11 | UC-F2-2 | `apps/api/src/modules/activities/activity-capabilities.test.ts` |
| QAD-RBP-06 | A write carrying `implementingPartners` is rejected with 400 | Sad | Reliability | PRD-F2 | G-F2-3 | UC-F2-1 | `apps/api/src/modules/projects/projects.service.test.ts` |
| QAD-RBP-07 | `LockedField` never submits a value for the field it locks, even if the disabled control is force-submitted | Sad | Usability | PRD-F2 | G-F2-3 | UC-F2-1 | `apps/web/src/components/pathways/locked-field.test.tsx` |
| QAD-T39 | 5 failed sign-ins lock the identifier for 15 minutes with a uniform response for known and unknown accounts, a locked identifier is refused without checking the password, success resets the count, and a provider outage is not counted | Sad | Security | PRD-F1 | G-F1-10 | UC-F1-1 | `apps/api/src/modules/auth/signin-lockout.test.ts`; `apps/web/src/features/auth/signin-request.test.ts` |
| QAD-T40 | a role holding `projects.archive` archives a project; delivered, covered by QAD-P10 | Sad | Functional Suitability | PRD-F2 | G-F2-4 | UC-F2-1 | Automated via QAD-P10 route test |
| QAD-T52 | a user attaches a trimmed free-text note to a journey event and to its correction; the audit records only that a note exists | Happy | Functional Suitability | PRD-F4 | G-F4-6 | UC-F4-2 | `apps/api/src/modules/participants/journey-note.test.ts` |
| QAD-T54 | a reviewer declares a data type and translates values ("M" and "F" to canonical values); a coercion failure stays staged with a reason; an oversized map or formula-like values are rejected | Happy, Sad, Abuse | Functional Suitability | PRD-F6 | G-F6-7 | UC-F6-2 | `packages/imports/src/normalization.test.ts`; `apps/api/src/modules/imports/imports.dto.value-map.test.ts`; `apps/api/src/modules/imports/imports.service.test.ts`; `apps/web/src/features/collection/import-value-map-editor.test.tsx` |
| QAD-T58 | an invalid library definition, a request key reused for a different entry, a missing or archived entry, and a caller without the library permission are refused and nothing is created | Sad | Functional Suitability | PRD-F7 | G-F7-5 | UC-F7-1 | `apps/api/src/modules/indicators/indicator-library.service.test.ts` |
| QAD-T62 | dashboard responsiveness at production scale (assumed 20 projects, 10,000 beneficiaries, 50,000 journey events, 200 indicators with 12 readings, 500 activities, 200 milestones and 50,000 participations; no volumes are stated in the PRD or validation plan) stays under the NFR-3 p95 of 800 ms for home, monitoring and SADDD | Happy | Performance Efficiency | PRD-F8 | G-F8-7 | UC-F8-1 | Measured 2026-10-01, local Supabase stack and ts-node API on one Windows 11 machine, single user, 50 runs per endpoint; first-request sample (single, not after an API restart) / warm p95 ms: home 528 / 554, monitoring 505 / 495, SADDD 479 / 506. Dashboard functions p06_home_dashboard, p06_monitoring (p06_compute_monitoring) and p06_saddd read base tables only (project_activities, project_milestones, beneficiary_project_enrollments, beneficiary_activity_participations, beneficiaries, form_submissions, sensitive_aggregate_releases); no trigger-maintained aggregate or projection, so replica-mode seeding is representative; form_submissions are not seeded; `scripts/perf/dashboard-load.mjs`, `apps/api/prisma/local-load-seed.ts`; gate Met (local, assumed scale, single user; staging re-measure pending) |
| QAD-T63 | participation breakdowns, indicator trends and a server budget aggregate in descriptive analytics; not delivered, so the gate is Not met | Sad | Functional Suitability | PRD-F9 | G-F9-9 | UC-F9-1 | Manual; pending, gate Not met |
| QAD-T64 | survey totals for Program Manager and Grant Manager through a closed-period release table; not delivered, so the gate is Not met | Sad | Functional Suitability | PRD-F9 | G-F9-10 | UC-F9-1 | Manual; pending, gate Not met |
| QAD-T67 | budget, Beneficiary and survey rule metrics evaluate and raise alerts; not delivered, so the gate is Not met | Sad | Functional Suitability | PRD-F10 | G-F10-6 | UC-F10-1 | Manual; pending, gate Not met |
| QAD-T68 | background rule evaluation runs on a schedule in the hosted environment; not installed, so the gate is Not met | Sad | Reliability | PRD-F10 | G-F10-7 | UC-F10-1 | Manual; pending, gate Not met |
| QAD-T71 | a recommendation is marked Auto-resolved when its linked alert clears; not delivered, so the gate is Not met | Sad | Functional Suitability | PRD-F11 | G-F11-5 | UC-F11-1 | Manual; pending, gate Not met |
| QAD-T73 | every report type exports as CSV, XLS, XLSX and PDF; not delivered, so the gate is Not met | Sad | Compatibility | PRD-F12 | G-F12-4 | UC-F12-3 | Manual; pending, gate Not met |
| QAD-T76 | the public pages are verified in a hosted environment; not performed, so the gate is Not met | Sad | Portability | PRD-F13 | G-F13-5 | UC-F13-2 | Manual; pending, gate Not met |
| QAD-T80 | keyboard operation, focus order, labels and contrast meet the design baseline on every primary screen; not yet verified (NFR-11) | Sad | Usability | PRD-F1 to PRD-F13 (NFR-6) | None | None | Manual; pending |
| QAD-T81 | the application works on the supported browsers and Windows versions in the PRD; not yet verified (NFR-11) | Sad | Compatibility | PRD-F1 to PRD-F13 (NFR-11) | None | None | Manual; pending |
| QAD-T82 | a backup restore recovers organization data after an interruption without loss beyond the 24-hour recovery point and within the 5 to 8 hour recovery time (NFR-15; PRD 5.7, OPS 1); target not yet verified | Sad | Reliability | PRD-F1 to PRD-F13 (NFR-15) | None | None | Manual; pending, backup runbook exists |
| QAD-IR-02 | a role without the review grant, the same profile twice, a profile outside the project or an already decided pair is rejected with no audit write | Sad | Security | PRD-F3 | G-F3-6 | UC-F3-3 | `apps/api/src/modules/beneficiaries/identity-review.service.test.ts` |
| QAD-JR-01 | System Administrator requests beneficiary journey history -> 403, while listing and saving project journey stages succeeds | Sad | Security | PRD-F4 | G-F4-5 | UC-F4-4 | `apps/api/src/modules/participants/journeys-access.test.ts` |
| QAD-FP-01 | a form author publishes their own form -> 403 with no write or audit, in any role; a role without `forms.publish` is denied | Sad | Security | PRD-F5 | G-F5-1 | UC-F5-1 | `apps/api/src/modules/metadata/metadata.service.test.ts` |
| QAD-T83 | a journey note over 1000 characters or only whitespace is rejected with 400 and nothing is stored | Sad | Functional Suitability | PRD-F4 | G-F4-6 | UC-F4-2 | `apps/api/src/modules/participants/journey-note.test.ts` |
| QAD-T84 | an expense retry reusing a client request id with different content is rejected with 22023 and nothing is stored | Sad | Reliability | PRD-F2 | G-F2-15 | UC-F2-7 | `apps/api/prisma/tests/finance-expense-runtime.sql`, `apps/api/prisma/tests/finance-expense-concurrency.mjs` |
| QAD-T85 | a second final sign-off for the same expense is rejected by the once-per-expense key and by a holder without `expenses.signoff` | Abuse | Security | PRD-F2 | G-F2-18 | UC-F2-9 | `apps/api/prisma/tests/finance-expense-runtime.sql` |
| QAD-T87 | the first-request (single sample, not after an API restart) dashboard latency is recorded and stays under 800 ms at the same scale | Happy | Performance Efficiency | PRD-F8 | G-F8-7 | UC-F8-1 | Measured 2026-10-01: first request home 528 ms, monitoring 505 ms, SADDD 479 ms; `scripts/perf/dashboard-load.mjs` |

### 3.3 Abuse / Adversarial Paths

| QAD ID | Scenario | Path | ISO/IEC 25010 | PRD | Gate | UC | Evidence |
|---|---|---|---|---|---|---|---|
| QAD-A01 | Org A guesses Org B project -> denied | Abuse | Security | PRD-F1 | G-F1-4 | UC-F1-1 | `apps/api/src/modules/auth/route-access.service.test.ts` |
| QAD-A02 | unassigned project direct API -> denied | Abuse | Security | PRD-F1 | G-F1-4, G-F2-13 | UC-F1-1 | `apps/api/src/modules/auth/route-access.service.test.ts` |
| QAD-A03 | Program Manager requests Beneficiary detail -> denied | Abuse | Security | PRD-F3 | G-F3-5 | UC-F3-2 | `apps/api/src/modules/beneficiaries/beneficiaries.service.test.ts` |
| QAD-A04 | Grant Manager requests Beneficiary detail -> denied | Abuse | Security | PRD-F3 | None | UC-F3-2 | `apps/api/src/modules/beneficiaries/beneficiaries.service.test.ts` |
| QAD-A05 | forged org/role/actor fields -> ignored/rejected | Abuse | Security | PRD-F1 | G-F1-3 | UC-F1-1 | `apps/api/src/modules/auth/authorized-operation.test.ts` |
| QAD-A06 | role/assignment privilege escalation -> denied | Abuse | Security | PRD-F1 | G-F1-5 | UC-F1-4 | `apps/api/src/modules/auth/csv-rbac.test.ts` |
| QAD-A07 | spreadsheet formula/macro does not execute | Abuse | Security | PRD-F6 | G-F6-6 | UC-F6-1 | `packages/imports/src/parser/secure.test.ts` |
| QAD-A08 | rule attempts raw SQL/code -> rejected | Abuse | Security | PRD-F10 | G-F10-3, G-F11-4 | UC-F10-3 | `apps/api/src/modules/rules/rules-human-contract.test.ts` |
| QAD-A09 | public route requests private media -> denied | Abuse | Security | PRD-F13 | G-F13-2 | UC-F13-2 | `apps/api/src/modules/public/public.service.test.ts` |
| QAD-A10 | SADDD suppressed cells cannot be trivially reconstructed | Abuse | Security | PRD-F8 | G-F8-3 | UC-F8-2 | `apps/api/src/modules/dashboards/analytics.service.test.ts`; `apps/api/prisma/tests/revised-aggregate-runtime.sql` |
| QAD-A11 | Beneficiary detail request with stale, missing or future-dated TOTP `amr` and no live PIN grant for the same user, organization and verified session -> 403 `STEP_UP_REQUIRED`, handler not run, denial audited; a grant from another session, user or organization, an expired grant or an ended session is rejected | Abuse | Security | PRD-F3 | G-F3-4, G-F4-5 | UC-F4-4 | `apps/api/src/modules/auth/beneficiary-step-up.test.ts` |
| QAD-A12 | client-supplied step-up flag/header/storage, grant or session value, or a client-only MFA success does not open Beneficiary detail; the server status must report fresh | Abuse | Security | PRD-F3 | None | UC-F4-4 | `apps/api/src/modules/auth/beneficiary-step-up.test.ts` |
| QAD-A13 | PIN brute force: 5 failures lock the PIN, parallel wrong attempts cannot exceed the bound, a locked PIN is not compared, only a TOTP newer than the lock unlocks it, and PIN requests are throttled | Abuse | Security | PRD-F3 | None | UC-F1-3 | `apps/api/src/modules/auth/beneficiary-step-up-pin.test.ts`; `apps/api/prisma/tests/step-up-pin-runtime.sql`; `apps/api/prisma/tests/step-up-pin-concurrency.mjs` |
| QAD-A14 | PIN setup without a fresh signed TOTP or when a PIN exists, and change without the current PIN or a fresh TOTP -> denied; the PIN never appears in URLs, logs, audit rows or error bodies | Abuse | Security | PRD-F3 | None | UC-F1-3 | `apps/api/src/modules/auth/beneficiary-step-up-pin.test.ts`; `apps/api/prisma/tests/step-up-pin-runtime.sql`; `apps/api/prisma/tests/step-up-pin-concurrency.mjs` |
| QAD-A15 | Project Officer requests the survey or timeline descriptive view -> denied (`analytics.descriptive.read` not granted) | Abuse | Security | PRD-F9 | None | UC-F9-1 | `apps/api/src/modules/dashboards/analytics.service.test.ts`; `apps/api/prisma/tests/f9-descriptive-aggregates-runtime.sql` |
| QAD-A16 | Org A guesses Org B project id, or an unassigned/out-of-scope project id, on the survey or timeline descriptive view -> denied before any query runs | Abuse | Security | PRD-F9 | None | UC-F9-1 | `apps/api/src/modules/dashboards/analytics.service.test.ts`; `apps/api/prisma/tests/f9-descriptive-aggregates-runtime.sql` |
| QAD-A17 | survey and timeline responses, and their CSV exports, carry no Beneficiary identity field; enrollment ids are used internally for pairing and are never returned; activity ids appear only as `byActivity` group keys (project activity identifiers, not Beneficiary identifiers), which the web maps to activity titles | Abuse | Security | PRD-F9 | None | UC-F9-1 | `apps/api/src/modules/dashboards/analytics.service.test.ts`; `apps/api/prisma/tests/f9-descriptive-aggregates-runtime.sql` |
| QAD-A18 | a caller holding `analytics.descriptive.read`/`analytics.export` but not `monitoring.read` is denied (403) on the survey and timeline views, for both read and export, before any `findMany` or `auditLog.create` runs | Abuse | Security | PRD-F9 | G-F12-5 | UC-F9-1 | `apps/api/src/modules/dashboards/analytics.service.test.ts`; `apps/api/prisma/tests/f9-descriptive-aggregates-runtime.sql` |
| QAD-A19 | no suppressed pair count or improved/same/declined sub-count can be recovered by subtraction: the whole `byActivity` breakdown (JSON and CSV, from one computed result) is withheld as suppressed whenever any activity group's pairs or sub-counts are suppressed, the no-activity residual (overall minus the groups, at pair and sub-count level) has 1-4 in any cell, or the overall's own sub-counts are suppressed; the act-A/act-B example, residual with a 1-4 sub-count, and input-order permutation are tested | Abuse | Security | PRD-F9 | None | UC-F9-1 | `apps/api/src/modules/dashboards/analytics.service.test.ts`; `apps/api/prisma/tests/f9-descriptive-aggregates-runtime.sql` |
| QAD-A20 | adjacent-period differencing: a role that can read the survey (holds `assessments.detail.read`) requests two adjacent or nested custom survey ranges to subtract one person's scores -> each request is refused (400, `22023`); no survey aggregate is released for a range that is not exactly one non-overlapping defined reporting period | Abuse | Security | PRD-F9 | None | UC-F9-1 | `apps/api/src/modules/dashboards/analytics.service.test.ts`; `apps/api/prisma/tests/f9-descriptive-aggregates-runtime.sql` |
| QAD-A21 | open-period re-query differencing: an aggregate-only role (Program Manager, Grant Manager, or any role without `assessments.detail.read`) repeats survey reads or exports of an open period to subtract successive releases -> every attempt is refused (403 in the API before any query, `42501` from `pathways.p10_f9_survey_aggregate`) and no survey value, empty result or audit row is produced | Abuse | Security | PRD-F9 | G-F9-8 | UC-F9-1 | `apps/api/src/modules/dashboards/analytics.service.test.ts`; `apps/api/prisma/tests/f9-descriptive-aggregates-runtime.sql` |
| QAD-R01 | Exact API/frontend/SQL grants and role ceilings across all six roles; detailed rows override overview conflicts | Abuse | Security | PRD-F1 | None | UC-F1-4 | `apps/api/src/modules/auth/csv-rbac.test.ts`; `apps/api/prisma/tests/csv-rbac-runtime.sql` |
| QAD-R02 | All roles scoped project detail; restricted tabs excluded; Admin beneficiary/assessment/enrollment denied; activity context excludes detail | Abuse | Security | PRD-F1 | G-F2-2 | UC-F1-4 | `apps/api/src/modules/auth/csv-rbac.test.ts`; `apps/api/prisma/tests/csv-rbac-runtime.sql` |
| QAD-R03 | Admin all six roles, Program PM/M&E, PM PO/M&E; only Admin assigns Grant; cross-scope targets denied | Abuse | Security | PRD-F1 | G-F1-5 | UC-F1-4 | `apps/api/src/modules/auth/csv-rbac.test.ts`; `apps/api/prisma/tests/csv-rbac-runtime.sql` |
| QAD-R04 | Managed-program and explicit-assignment scope; forged actor/organization/project denied | Abuse | Security | PRD-F1 | None | UC-F1-4 | `apps/api/src/modules/auth/csv-rbac.test.ts`; `apps/api/prisma/tests/csv-rbac-runtime.sql` |
| QAD-R05 | Revoked grants, inactive permission/role, suspended/deactivated account, and ended assignments deny the next operation/request | Abuse | Security | PRD-F1 | G-F1-6 | UC-F1-4 | `apps/api/src/modules/auth/csv-rbac.test.ts`; `apps/api/prisma/tests/csv-rbac-runtime.sql` |
| QAD-R06 | Program/Grant raw beneficiary and assessment denial with populated synthetic rows; SADDD protections unchanged | Abuse | Security | PRD-F1 | G-F8-5 | UC-F1-4 | `apps/api/src/modules/auth/csv-rbac.test.ts`; `apps/api/prisma/tests/csv-rbac-runtime.sql` |
| QAD-R07 | Archived replay, fresh baseline, preserved-ledger registration/0027/0028 upgrade, subsequent Prisma migration creation/application, datamodel/security/privilege parity; actual SADDD entrypoints for all six roles, PO monitoring denial and cross-organization aggregate denial | Abuse | Portability | PRD-F1 | None | UC-F1-4 | `infra/supabase/phase6/Replay-Local.ps1`; `apps/api/prisma/tests/csv-rbac-catalog.sql` |
| QAD-R08 | Native PM creation preserves target beneficiaries, automatic self-assignment and audit recording; approved target-goal retirement requires goal-free create/update, legacy input rejection, historical-value preservation, output/draft omission and independent indicator progress checks (implementation/verification pending) | Abuse | Functional Suitability | PRD-F2 | G-F2-1 | UC-F2-1 | `apps/api/src/modules/projects/projects.service.test.ts`; `apps/api/prisma/tests/project-target-goal-runtime.sql` |
| QAD-R09 | Read-only remote ledger/checksum/security inspection and protected backup restore before application; stop unexpected drift | Abuse | Reliability | PRD-F1 | None | UC-F1-5 | Manual |
| QAD-IMP-10 | revoked permission or removed project assignment stops promotion at the next chunk | Abuse | Security | PRD-F6 | None | UC-F6-4 | `apps/api/src/modules/imports/imports.chunked-promotion.test.ts` |
| QAD-IMP-11 | cross-organization and cross-project process and export requests are denied before rows or forms are read | Abuse | Security | PRD-F5 | G-F5-5 | UC-F5-3 | `apps/api/src/modules/metadata/form-definition-export.service.test.ts`; `apps/api/src/modules/imports/imports.service.test.ts` |
| QAD-IMP-12 | a PDF carrying scripts, attachments, forms or links is read for text only; formula-like cells are rejected | Abuse | Security | PRD-F6 | None | UC-F6-1 | `packages/imports/src/parser/secure.pdf.test.ts`; `packages/imports/src/parser/secure.test.ts` |
| QAD-IMP-13 | Project Officer, Project Manager, Program Manager and Grant Manager cannot export form definitions | Abuse | Security | PRD-F5 | None | UC-F5-3 | `apps/api/src/modules/metadata/form-definition-export.service.test.ts` |
| QAD-SM-08 | the recorder rejects unknown algorithm IDs, extra keys, out-of-range or fractional scores, unknown reasons, duplicate targets, and foreign-form, cross-project or cross-organization fields | Abuse | Security | PRD-F6 | None | UC-F6-2 | `apps/api/src/modules/imports/automatic-mapping-receipt.test.ts`; `apps/api/prisma/tests/import-smart-mapping-runtime.sql` |
| QAD-SM-09 | sampled cell values never appear in mapping rows, audit rows, logs or the receipt | Abuse | Security | PRD-F6 | None | UC-F6-2 | `apps/api/src/modules/imports/automatic-mapping-receipt.test.ts`; `apps/api/prisma/tests/import-smart-mapping-runtime.sql` |
| QAD-SM-10 | cross-organization, cross-project, other-uploader, forged-subject and revoked-upload calls are denied before any write | Abuse | Security | PRD-F6 | None | UC-F6-2 | `apps/api/src/modules/imports/automatic-mapping-receipt.test.ts`; `apps/api/prisma/tests/import-smart-mapping-runtime.sql` |
| QAD-SM-11 | a Project Officer sees suggestions read-only and cannot confirm them; the mapping route denies without `imports.review` | Abuse | Security | PRD-F6 | G-F6-4 | UC-F6-2 | `apps/api/src/modules/imports/mapping-confirmation.service.test.ts` |
| QAD-DRF-08 | parallel first calls create exactly one system form, one field set and one audit row | Abuse | Reliability | PRD-F3 | None | UC-F3-1 | `apps/api/prisma/tests/default-registration-form-concurrency.mjs` |
| QAD-DRF-09 | System Administrator, Program Manager, Grant Manager, an unassigned registrar, a foreign-organization caller and a forged or mismatched context are denied before any write | Abuse | Security | PRD-F3 | None | UC-F3-1 | `apps/api/src/modules/beneficiaries/default-registration-form.test.ts`; `apps/api/prisma/tests/default-registration-form-runtime.sql` |
| QAD-DRF-10 | the runtime role and a superuser cannot tag a form; a normal form with the same author and publisher, or with no author, is still rejected even for the owner; the published system form, its tag and its fields are immutable | Abuse | Security | PRD-F3 | None | UC-F3-1 | `apps/api/src/modules/beneficiaries/default-registration-form.test.ts`; `apps/api/prisma/tests/default-registration-form-runtime.sql` |
| QAD-P06 | Beneficiary, step-up and import batch-status reads are never cached, even when a caller requests the summary window | Abuse | Security | PRD-F2 | None | UC-F2-1 | `apps/web/src/providers/authorized-query-cache.test.tsx`; `apps/web/src/providers/authorized-query-provider.test.tsx` |
| QAD-P07 | Sign-out, workspace change or any 401/403 clears or hides cached reads; each mounted reader re-verifies at most once per denial and ends in data, pending or an error with retry; a persistent 401/403 does not loop, including when its reader remounts under a re-verifying parent; an explicit retry requests exactly once; one denial raises the epoch once; pre-denial data never reaches `replaceData`; a committed write re-reads active reads and removes inactive ones so pre-write data never reappears | Abuse | Security | PRD-F2 | None | UC-F2-1 | `apps/web/src/providers/authorized-query-cache.test.tsx`; `apps/web/src/providers/authorized-query-provider.test.tsx` |
| QAD-P08 | Overview metrics deny cross-organization, unassigned and malformed project ids before any metric read; budget is `null` without budget read; reach counts 1-4 are suppressed and no Beneficiary rows are read | Abuse | Security | PRD-F2 | G-F2-19 | UC-F2-1 | `apps/api/src/modules/projects/project-overview-metrics.service.test.ts` |
| QAD-P09 | Activity update, transition and progress still deny an out-of-scope project or activity before any write after the duplicate reads are removed | Abuse | Security | PRD-F2 | G-F2-13 | UC-F2-2 | `apps/api/src/modules/activities/activities.access.test.ts` |
| QAD-P10 | A `projects.archive` holder archives a project through `POST /projects/:projectId/archive`: `archivedAt` is set, one `PROJECT_ARCHIVED` audit row is written, a repeat call is idempotent, the project leaves the default list, a role without the grant is denied (403) and a cross-organization or unscoped project returns the uniform 404 before any write; the web action is hidden without the grant and confirms before archiving | Abuse | Security | PRD-F2 | G-F2-4 | UC-F2-1 | `apps/api/src/modules/projects/projects.service.test.ts`; `apps/api/src/modules/projects/projects.controller.test.ts`; `apps/web/src/features/projects/project-detail-view.test.tsx` |
| QAD-RBP-08 | The assignable-officer read denies Admin, M&E Officer, Program Manager and Grant Manager (neither holds `activities.create` nor `activities.update`), denies an unassigned project, denies cross-organization access, and returns the uniform 404 for an inaccessible project | Abuse | Security | PRD-F2 | G-F2-12 | UC-F2-2 | `apps/api/src/modules/projects/projects.service.test.ts`; `apps/api/src/modules/activities/activities.access.test.ts` |
| QAD-RBP-09 | The assignable-officer read never returns email, contact number, auth identifiers, role list, account status, other-project data or assignment dates, and excludes archived or ended users | Abuse | Security | PRD-F2 | None | UC-F2-2 | `apps/api/src/modules/projects/projects.service.test.ts`; `apps/api/src/modules/activities/activities.access.test.ts` |
| QAD-RBP-10 | Migration 0039 splits legacy text on newline, `;` and `,`, de-duplicates by `lower(btrim(name))`, skips (never truncates) pieces outside 1-120 characters, skips a whole project that would exceed 20 linked partners, never removes an existing structured link, writes exactly one `PROJECT_PARTNERS_BACKFILLED` audit row per changed project, and is a no-op on a second run | Abuse | Reliability | PRD-F2 | None | UC-F2-1 | `apps/api/prisma/tests/project-partner-backfill-runtime.sql` |
| QAD-A22 | private proof inspection succeeds only for a pending update and returns a conflict when revisions changed | Abuse | Security | PRD-F2 | G-F2-8 | UC-F2-4 | `apps/api/src/modules/activities/private-proof-inspection.service.test.ts` |
| QAD-A23 | a registration sharing an identity with an existing profile is held as review-required and the matched profile stays hidden from registrars | Abuse | Security | PRD-F3 | G-F3-6 | UC-F3-3 | `apps/api/src/modules/beneficiaries/beneficiaries.service.test.ts` |
| QAD-IR-03 | a Project Officer or System Administrator with a forged review permission, or a request for an out-of-scope project, is denied before any profile is read | Abuse | Security | PRD-F3 | G-F3-6 | UC-F3-3 | `apps/api/src/modules/beneficiaries/identity-review.service.test.ts` |
| QAD-JR-02 | a System Administrator profile claiming `journeys.read` is still denied beneficiary journey history and, without `journeys.manage`, stage listing | Abuse | Security | PRD-F4 | G-F4-5 | UC-F4-4 | `apps/api/src/modules/participants/journeys-access.test.ts`; `apps/api/src/modules/auth/csv-rbac.test.ts` |
| QAD-A24 | a non-string note, or note content in the audit record, is refused; the note body is never logged | Abuse | Security | PRD-F4 | G-F4-6 | UC-F4-4 | `apps/api/src/modules/participants/journey-note.test.ts` |
| QAD-IL-02 | Org B lists, archives or uses an Org A library entry, or a request carries forged organization, creator or binding fields, or a role without the library permission calls it -> denied, nothing created | Abuse | Security | PRD-F7 | G-F7-5 | UC-F7-1 | `apps/api/src/modules/indicators/indicator-library.service.test.ts`; `apps/api/src/modules/auth/csv-rbac.test.ts` |

### 3.4 Traceability

| Must-Have | Feature | QAD IDs |
|---|---|---|
| PRD-F1 | RBAC and Workspace Management | QAD-T01, QAD-T20, QAD-A01, QAD-A02, QAD-A05, QAD-A06, QAD-R01, QAD-R02, QAD-R03, QAD-R04, QAD-R05, QAD-R06, QAD-R07, QAD-R09, QAD-T36, QAD-T37, QAD-T38, QAD-T39, QAD-T77, QAD-T78, QAD-T79, QAD-T80, QAD-T81, QAD-T82 |
| PRD-F2 | Project Profile and Activity Tracking | QAD-T02, QAD-R08, QAD-P01, QAD-P02, QAD-P03, QAD-P04, QAD-P06, QAD-P07, QAD-P08, QAD-P09, QAD-P10, QAD-RBP-01, QAD-RBP-02, QAD-RBP-03, QAD-RBP-04, QAD-RBP-05, QAD-RBP-06, QAD-RBP-07, QAD-RBP-08, QAD-RBP-09, QAD-RBP-10, QAD-T40, QAD-T41, QAD-A22, QAD-T42, QAD-T43, QAD-T44, QAD-T45, QAD-T46, QAD-T47, QAD-T48, QAD-T84, QAD-T85 |
| PRD-F3 | Centralized Beneficiary Profile | QAD-T03, QAD-A03, QAD-A04, QAD-A11, QAD-A12, QAD-A13, QAD-A14, QAD-DRF-01, QAD-DRF-02, QAD-DRF-03, QAD-DRF-04, QAD-DRF-05, QAD-DRF-06, QAD-DRF-07, QAD-DRF-08, QAD-DRF-09, QAD-DRF-10, QAD-A23, QAD-IR-01, QAD-IR-02, QAD-IR-03 |
| PRD-F4 | Beneficiary Journey Tracking | QAD-T04, QAD-T49, QAD-T50, QAD-T51, QAD-T52, QAD-T83, QAD-A24 |
| PRD-F5 | Digital Data Collection and Preparation | QAD-T05, QAD-IMP-04, QAD-IMP-09, QAD-IMP-11, QAD-IMP-13, QAD-T53, QAD-FP-01 |
| PRD-F6 | Metadata-Driven Data Integration | QAD-T06, QAD-T21, QAD-T22, QAD-T25, QAD-A07, QAD-IMP-01, QAD-IMP-02, QAD-IMP-03, QAD-IMP-05, QAD-IMP-06, QAD-IMP-07, QAD-IMP-08, QAD-IMP-10, QAD-IMP-12, QAD-SM-01, QAD-SM-02, QAD-SM-03, QAD-SM-04, QAD-SM-05, QAD-SM-06, QAD-SM-07, QAD-SM-08, QAD-SM-09, QAD-SM-10, QAD-SM-11, QAD-T54 |
| PRD-F7 | Project Indicator and Monitoring | QAD-T07, QAD-P05, QAD-T55, QAD-T56, QAD-T57, QAD-T58, QAD-IL-01, QAD-IL-02 |
| PRD-F8 | Aggregated Monitoring Dashboard with SADDD Analysis | QAD-T08, QAD-T23, QAD-A10, QAD-T59, QAD-T60, QAD-T61, QAD-T62, QAD-T87 |

PRD-F9 to PRD-F13 rows are in the matrix above and are cited by their gates in the PRD.

### 3.5 ISO/IEC 25010 Coverage

#### 3.5.1 Functional Suitability

- **Rows:** 53 in the matrix with this characteristic.
- **NFR IDs:** NFR-9.
- **Automated tests:** Workflow, validation and metric rows (API service tests, `packages/shared` metric contracts, SQL runtime tests in `apps/api/prisma/tests/`).
- **Manual checks:** Acceptance walk-through of each use case by role.
- **Gaps:** Gates Not met for PRD-F9 breakdowns, PRD-F10 budget and survey metrics, PRD-F11 auto-resolve and PRD-F12 export formats.

#### 3.5.2 Performance Efficiency

- **Rows:** 6 in the matrix with this characteristic.
- **NFR IDs:** NFR-3, NFR-8.
- **Automated tests:** Chunked promotion and read-cache rows (QAD-IMP-01, QAD-IMP-02, QAD-P01, QAD-P02); rule-engine determinism.
- **Manual checks:** Measured dashboard response timing at assumed production scale (QAD-T62, QAD-T87).
- **Thresholds:** NFR-3 API p95 under 800 ms for normal pages, imports excluded (PRD 5.7, developer target 2026-10-01); dashboards measured locally 2026-10-01 (QAD-T62); other endpoints not yet measured.
- **Gaps:** Performance scaling steps 3-5 are deferred; dashboard scale was measured locally only (QAD-T62, QAD-T87).

#### 3.5.3 Compatibility

- **Rows:** 5 in the matrix with this characteristic.
- **NFR IDs:** NFR-13.
- **Automated tests:** Import and export format rows for CSV, XLS, XLSX and PDF (QAD-IMP-03, QAD-IMP-04, QAD-IMP-07); parser tests in `packages/imports`.
- **Manual checks:** Browser and device checks (QAD-T81).
- **Gaps:** Every report type exporting in all four formats is Not met (G-F12-4). Browser coverage is not verified.

#### 3.5.4 Usability

- **Rows:** 7 in the matrix with this characteristic.
- **NFR IDs:** NFR-6, NFR-11.
- **Automated tests:** Web component tests for locked fields, empty and error wording, period pickers (QAD-RBP-03, QAD-P04, QAD-T18, QAD-T35).
- **Manual checks:** Accessibility review, chart and report legibility, import error clarity (QAD-T80).
- **Gaps:** No accessibility audit has been run; unfinished controls are hidden, not tested.

#### 3.5.5 Reliability

- **Rows:** 24 in the matrix with this characteristic.
- **NFR IDs:** NFR-4, NFR-7, NFR-10, NFR-15.
- **Automated tests:** Rollback, idempotency, fault-mapping, validation and deterministic-ordering rows (QAD-IMP-05 to QAD-IMP-09, QAD-T21, QAD-T22, QAD-T30, QAD-T45, QAD-T56, QAD-T65).
- **Manual checks:** Backup restore rehearsal (QAD-T82).
- **Thresholds:** NFR-7 availability 99.5% monthly (PRD 5.7, OPS 1); NFR-15 RPO 24 hours and RTO 5 to 8 hours (PRD 5.7, OPS 1). These are targets, not yet measured.
- **Gaps:** Operational reliability (NFR-7) and recovery (NFR-15) are not verified; hosted scheduled rule evaluation is Not met (G-F10-7).

#### 3.5.6 Security

- **Rows:** 69 in the matrix with this characteristic.
- **NFR IDs:** NFR-1, NFR-2, NFR-12.
- **Automated tests:** RBAC, organization isolation, step-up, suppression and public-exposure rows (abuse table), API guard tests, and SQL privilege runtime tests.
- **Manual checks:** Public privacy review; security review by the SAD specialists.
- **Gaps:** No penetration test.

#### 3.5.7 Maintainability

- **Rows:** 2 in the matrix with this characteristic.
- **NFR IDs:** NFR-5, NFR-14.
- **Automated tests:** Static checks and the SAD checker (QAD-T77, QAD-T78); metadata-driven form and mapping tests.
- **Manual checks:** Documentation reconciliation and code review.
- **Gaps:** No coverage threshold is established; maintainability is reported through lint, typecheck and SAD results only.

#### 3.5.8 Portability

- **Rows:** 3 in the matrix with this characteristic.
- **NFR IDs:** NFR-11.
- **Automated tests:** Disposable PostgreSQL 18 replay of archive, baseline and forward corrections (QAD-R07, QAD-T79).
- **Manual checks:** Hosted deployment verification.
- **Gaps:** Hosted verification is Not met for public pages (G-F13-5) and pending for the target hosting migration; browser and OS support is not verified.

### 3.6 Rule-Engine Matrix

PRD-F10/PRD-F11 have a local human rules API and a disabled-by-default machine drain/sweep runtime (migration 0031). Hosted installation remains pending. Indicator metrics additionally require a current non-sensitive eligibility approval, which has no administration path yet.

| Case | ISO/IEC 25010 | Evidence |
|---|---|---|
| Operators `< <= = >= >` (Prisma `RuleOperator`: LT, LTE, EQ, GTE, GT) | Functional Suitability | `apps/api/src/modules/rules/rule-engine.test.ts`; `apps/api/src/modules/rules/alert-lifecycle.test.ts` |
| BETWEEN | Functional Suitability | `apps/api/src/modules/rules/rule-engine.test.ts`; `apps/api/src/modules/rules/alert-lifecycle.test.ts` |
| ALL and ANY grouping | Functional Suitability | `apps/api/src/modules/rules/rule-engine.test.ts`; `apps/api/src/modules/rules/alert-lifecycle.test.ts` |
| Equality boundaries | Functional Suitability | `apps/api/src/modules/rules/rule-engine.test.ts`; `apps/api/src/modules/rules/alert-lifecycle.test.ts` |
| Missing metrics | Reliability | `apps/api/src/modules/rules/rule-engine.test.ts`; `apps/api/src/modules/rules/alert-lifecycle.test.ts` |
| Duplicate and idempotent evaluation | Reliability | `apps/api/src/modules/rules/rule-engine.test.ts`; `apps/api/src/modules/rules/alert-lifecycle.test.ts` |
| Cooldown | Reliability | `apps/api/src/modules/rules/rule-engine.test.ts`; `apps/api/src/modules/rules/alert-lifecycle.test.ts` |
| Re-trigger | Reliability | `apps/api/src/modules/rules/rule-engine.test.ts`; `apps/api/src/modules/rules/alert-lifecycle.test.ts` |
| Auto-resolution | Reliability | `apps/api/src/modules/rules/rule-engine.test.ts`; `apps/api/src/modules/rules/alert-lifecycle.test.ts` |
| Project isolation | Security | `apps/api/src/modules/rules/rule-engine.test.ts`; `apps/api/src/modules/rules/alert-lifecycle.test.ts` |
| Rule-version snapshots | Reliability | `apps/api/src/modules/rules/rule-engine.test.ts`; `apps/api/src/modules/rules/alert-lifecycle.test.ts` |
| Human outcome permission | Security | `apps/api/src/modules/rules/rule-engine.test.ts`; `apps/api/src/modules/rules/alert-lifecycle.test.ts` |

### 3.7 Change Record Verification Notes

Carried-forward expectations that extend the rows above.

PRD-F6 mapping suggestions additionally cover stable source keys, ASCII whitespace/hyphen folding, fullwidth NFKC, preserved accented-case distinctions, non-ASCII whitespace, punctuation and blank names. Competing code/label candidates and an ambiguous source sharing another source's sole target must remain unresolved. Suggested mappings retain existing reviewer confirmation and server validation; no new authority is inferred.

PRD-F1/F2 private pending-proof inspection follows [its approved Change Record](cr-pathways-private-activity-proof-inspection.md): test all roles and individual grants, self/cross-scope/revoked access, pending states and revisions, mixed lineage/incomplete uploads, private bucket and redirect, counted size/digest/deadline/disconnect, revocation or review during storage, failing audit with zero body release, safe headers/no cache, old URL/HEAD/range denial and keyboard-accessible review controls. Synthetic identifying proofs with unchanged false-consent defaults are eligible only for this approved pending-verification purpose, never publication. These are required scenarios, not executed evidence.

PRD-F2 activity proof direct upload follows [its approved Change Record](cr-pathways-activity-progress-media.md) at its reduced scope (section 9): reserve/upload/finalize happy path for each accepted type (PDF, JPEG, PNG, WebP, MP4, MOV, WebM); a spoofed type, a size mismatch, a digest mismatch, an eleventh file, an over-limit file, and a reused upload token, all rejected; an identical retry with the same client update id succeeds and a changed one conflicts; a non-assigned Project Officer or M&E reviewer denied, and cross-project/cross-organization reservation and finalize denied; additive multi-file client selection, per-file remove, one file failing then recovering through its own retry, and a server rejection surfaced as error text; the widened inspection bounds (ten proofs, `EVIDENCE_MAX_FILE_BYTES`) with a large verified video; the 0041 SQL suite for the new bounds, the unchanged prior rejections and the rest of the function definition unchanged; and the Submit-proof dialog's accessibility (persistent live region, predictable focus after add/remove/submit, Escape and Close, no half-filled-form Enter submit, 44px targets). These are required scenarios, not executed evidence.

PRD-F2 proof session beneficiary count follows [its approved Change Record](cr-pathways-proof-session-beneficiary-count.md), including its final 2026-09-29 developer decision (CR section 3.1): an omitted value reserves with a null stored count; a valid whole number 0-100000 persists and is returned unchanged on the activity's update history; negative, fractional and over-100000 values are rejected at the DTO boundary before any read; a retry with the same `clientUpdateId` but a changed count conflicts the same way a changed note or progress percent does; a cross-project reservation attempt carrying a count is still denied before any read. The activity's computed `beneficiariesReached` sums only APPROVED updates' `beneficiaries_reached_this_session` (NULL as 0); PENDING, VERIFIED and REJECTED updates never contribute; an approved proof later rejected lowers the total; an activity with no updates reports zero, never null; cross-project and cross-organization isolation hold for the aggregate function; and the project overview's SADDD-sourced "beneficiaries reached" tile and the rules engine's typed metric catalog are both confirmed unaffected (neither reads `p08_activity_beneficiaries_reached`). SADDD sex/age breakdowns are unaffected, since they stay sourced from participation records and this typed count carries no breakdown. These are required scenarios, not executed evidence.

PRD-F2 activity overdue explanation follows [its approved Change Record](cr-pathways-activity-overdue-explanation.md): happy path (a project-assigned M&E officer with no personal activity assignment records a valid category/explanation on a currently overdue activity, gets an audit row and appears on the activity detail's `overdueExplanations`, newest first, with actor name and recorded time); `409` when the activity is not currently overdue; an unrecognized category and an explanation shorter than 10 or longer than 2000 characters rejected at the DTO boundary; a retry with the same `clientMutationId` and identical input returns the same row without a second write, and a changed retry conflicts; denied without `monitoring.review`; an unassigned M&E officer (no project assignment) denied via the uniform project-scope 404, matching every other project-scoped read/write, not a personal-assignment 403; `SYSTEM_ADMINISTRATOR`/`PROGRAM_MANAGER`/`GRANT_MANAGER` scope matches the RBAC policy (org-wide, managed-program, and project-assignment respectively); cross-project and cross-organization requests denied before any read, following the existing convention; and `overdueExplanationNeeded` true while overdue with no qualifying explanation, then false immediately after one is recorded, in both the activity detail and the activity list. Web: the "Overdue: explanation needed" badge shows/hides with the server flag in both the list and the detail; the "Explain delay" button is gated by `capabilities.canExplainOverdue` and the activity's overdue status; the dialog rejects a missing category, an explanation under 10 or over 2000 characters, and does not submit on Enter inside the textarea; a retry after an indeterminate failure reuses the same `clientMutationId`, a definitive rejection (400/403/409) draws a fresh one; 403/409 messages are shown as text; the "Overdue explanations" history renders newest first and shows "None yet" only once the activity has been overdue with no entries; the web client's parser rejects a malformed `overdueExplanations` entry (bad category, out-of-bounds length, missing field, unknown key). These are required scenarios, not executed evidence.

The approved [auth contract](rfc-pathways-auth-rbac-isolation.md) supplies the matrix. Verify with `pnpm --filter @pathways/api exec vitest run`, the web regression suite, and `infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline` on disposable PostgreSQL.

Permission grants for missing handlers are contract checks, not feature acceptance. Synthetic behavior stays local. No destructive or live-data behavioral tests are part of this phase.

Additional PRD-F1 checks cover blank definitions versus responses, collected-data versus template imports, journey freeze/privacy, PO alert/SADDD versus monitoring denials, escalation boundaries, archive integrity, and Prisma 6.19.2 compatibility without resets.

For [core P1 supporting operations](cr-pathways-core-p1-supporting-operations.md), verify all-role and individual-grant denial, cross-organization/project scope, revocation on retry, bounded latest published-definition reads, strict allowlists, empty-versus-failed context, sparse individual definitions, age-only error focus, minor/guardian consistency and custom required fields. Verify all candidate collisions, stable source keys, incomplete mappings, immutable revision/audit parity, changed/stale retries and unchanged reviewer/processor authority. Corrected supporting SQL also requires all submission kinds, raw-policy compatibility, definition/archive lock waits, concurrency, fresh/upgrade/recovery and preserved ledger/catalog checks. A mapping-only run or static/unit PASS does not establish complete migration or feature acceptance. Authenticated UI, physical cancellation and preview checks remain separate executable requirements.

## 4. Automation vs. Manual Testing

| Command | Scope |
|---|---|
| `pnpm lint` | Biome check |
| `pnpm typecheck` | TypeScript across workspaces |
| `pnpm test` | Vitest in every workspace |
| `pnpm --filter @pathways/api exec vitest run` | API suite only |
| `pnpm --filter @pathways/web e2e` | Playwright end-to-end |
| `pnpm build` | production build |
| `./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline` | migration and SQL runtime replay on disposable PostgreSQL |
| `pnpm sad:test`, `pnpm sad:typecheck`, `pnpm sad:check` | SAD checker |
| `pnpm docs:check` | documentation checks |

CI (`.github/workflows/ci.yml`) runs Prisma validate and generate, the replay on PostgreSQL 18, the secret-assignment scan, lint, typecheck, test and build, plus the automated SAD checks as a separate job. CI publishes diagnostics without claiming full SAD approval; an unexecuted CI job is not verified evidence.

Automate:

- unit;
- integration and API;
- database constraints and replay;
- frontend components;
- end-to-end critical workflows;
- type, lint and static checks.

Manual:

- UX clarity;
- accessibility;
- charts and reports;
- import error usability;
- public privacy review;
- defense and UAT flow.

SAD regressions verified by `scripts/sad/check.test.ts`:

| Required regression | Expected result |
|---|---|
| Trigger routing, renames, deletions, Windows paths | All applicable roles match either renamed path; deterministic normalized ordering |
| Executable code versus comments/strings | AST flags executable `eval`/dynamic `Function`; descriptive text alone is not a violation |
| Unsafe raw queries and destructive SQL | Review flags require semantic evidence, including parameterization/preservation where applicable |
| Dependency additions and preserved migration edits | Dependency warnings require justification; immutable-history changes block |
| Missing/stale/malformed/BLOCKED evidence | Final sign-off fails; complete digest-matching PASS evidence succeeds |
| Disposable PostgreSQL 18 replay | Archived history, fresh baseline provisioning, preserved-ledger registration/upgrade, and forward corrections preserve expected data/security/catalog behavior |

CI publishes automated diagnostics without claiming full SAD approval. The Linux replay uses verified archive extraction, existing SQL fixtures and catalog validators, and documented checksum exceptions. Local execution limitations must be reported; an unexecuted CI job is not verified evidence. Hosted databases and confidential data are excluded.

## 5. Bug Triage Protocol

| Priority | Definition |
|---|---|
| P0 | data loss or corruption; cross-organization leak; private Beneficiary or public exposure; authentication bypass; destructive migration error |
| P1 | incorrect monitoring or SADDD output; silent import corruption; rule mis-evaluation; privileged workflow error |

P0 and P1 block release until fixed or covered by an approved change request.

## 6. Release Criteria (Definition of Done)

- Acceptance criteria implemented.
- Relevant tests executed, with results reported.
- No unresolved in-scope P0 or P1.
- Docs reflect durable behavior and durable documentation changes are reconciled.
- Phase report in chat.
- Next phase explicitly authorized.

### 6.1 Manuscript Alignment Gate

- Production deployment is blocked while any Must-Have alignment item is Not met or Partly met without an approved change request.
- The alignment audit is re-run before each production release.
- The audit compares the Must-Have features PRD-F1 to PRD-F8 against the PRD gates and the matrix in section 3.

## 7. AI Evaluation

Not applicable. PATHWAYS uses deterministic rules only; recommendations are retrieved from configuration and never generated (G-F11-4). A future approved AI or OCR feature would add its own evaluation here.

## 8. User Acceptance Testing (ISO/IEC 25010)

### 8.1 Instrument

The adapted PATHWAYS Survey Questionnaire has 30 evaluation statements rated on a 5-point Likert scale (5 Strongly Agree to 1 Strongly Disagree).

| ISO/IEC 25010 characteristic | Statements |
|---|---|
| Functional Suitability | 3 |
| Performance Efficiency | 3 |
| Compatibility | 2 |
| Usability | 6 |
| Reliability | 4 |
| Security | 5 |
| Maintainability | 5 |
| Portability | 2 |
| Total | 30 |

### 8.2 Respondents and Method

- Respondents are selected intended users: Project Officers, Monitoring and Evaluation Officer, Grant Manager, Project Managers, Program Managers and selected external stakeholders for the public project tracker.
- Respondents perform tasks for their own role, then answer the questionnaire.
- Incomplete, unclear or inconsistent entries are excluded from the analysis.
- Comments are reviewed for recurring concerns.
- Respondent count: Not established (the manuscript gives no sample size).
- Status: UAT has not been run.

### 8.3 Statistical Treatment

- Weighted mean per statement, composite mean per characteristic, overall mean across the 30 statements.
- Average weighted mean: AWM = (sum of f x) / N, where f is the frequency of each rating, x the rating value and N the number of respondents.
- Percentage: P = (f / N) x 100.
- Scale ranges use an equal interval of 0.80.

| Point | Scale range | Verbal interpretation |
|---|---|---|
| 5 | 4.21-5.00 | Strongly Agree |
| 4 | 3.41-4.20 | Agree |
| 3 | 2.61-3.40 | Neutral |
| 2 | 1.81-2.60 | Disagree |
| 1 | 1.00-1.80 | Strongly Disagree |

## Self-Check

- [x] Every gate G-F<n>-<m> in the PRD has at least one QAD row.
- [x] Every Must-Have (PRD-F1 to PRD-F8) is traced in section 3.4.
- [x] Happy, sad and abuse paths present; isolation and suppression covered.
- [x] All eight ISO/IEC 25010 characteristics have a coverage section.
- [x] No performance numbers or respondent counts invented.

