# Cross-plan review of S1 to S8 plans

Base: local dev 4a5806d0 (F1 to F4b merged). Plans edited in place; every edit is a new ruling line starting "Cross-plan:" except the in-text fixes listed under Fixes.

## Checks

| # | Check | Result |
|---|---|---|
| 1 | S3 renames reach S2, S6, S7 | S2 uses no S3 name (grep for IndicatorResponse, metric-cell, metric-fields, MonitoringIndicator: none). S6 imports `metricCellSchema` from the barrel, which S3 keeps. S7 consumes S3's `metric-cell.ts`, `metric-fields.ts` (outside the barrel) and `monitoringSqlError` in `indicators.helpers.ts` by their post-rename paths. S4 imports `sadddAgeBands` from `metric-contract.ts`, which S3 keeps (S3 runs first). OK, one stale-path gap fixed (Fix 10). |
| 2 | Validation convention | Both are allowed, by one criterion. ZodPipe on the controller for routes that replaced a class-validator DTO (S1, S2, S4, S5, S8 users and auth). Service-side parsing stays where the module already parsed `unknown` in the service, its 400 body is a fixed string or `issues` object that ZodPipe's `message: string[]` would change (CR 4), and seeds call the services directly (S3 ruling 6, S6 ruling 3, S7 ruling 13, S8 ruling 6 publication). CR 3.6 and F3b disposition match the ZodPipe half; S3 Task 7 writes the exception bullet that S6 expects. Recorded in S1, S3, S6, S8. |
| 3 | S3 Task 0 needs S1 `requestIdentity` | Confirmed. S1a Task 7 creates `apps/api/src/common/authz/request-identity.ts` exporting `requestIdentity(request: AuthenticatedRequest): ApplicationIdentity` throwing `ForbiddenException('Application profile is required.')`. `AuthenticatedRequest` and `ApplicationIdentity` exist in `common/authz/application-identity.ts`. The 24 controllers with that exact text are all assigned to a slice (S1 4, S2 5, S3 3, S4 4, S5 2, S7 4 dashboards + analytics-insights + 2 rules, S8 2); the "Application profile required." ones (audit, evaluations, finance, public, reports) keep their text (S6 ruling 10, S8 ruling 13). |
| 4 | `field-schemas.ts` ownership | Only S1a Task 1 creates it. S2 appends `countInput`, `pesoAmountInput`; S5 appends `trimmedLowercaseInput`, `queryInteger`; S3 and S6 deliberately do not use it; S4, S8 only import. No duplicate `export` names across the eight plans (script over code-block exports). |
| 5 | F4b names against real code | Verified in `apps/web`. `request.ts` exports `PathwaysClientError`, `requestFoundationResponse`, `requestFoundation`; `readContextCookie` is module-private (line 35). `request-owner.ts` exports `captureRequestOwner = (signal?: AbortSignal \| null)`. `hooks/use-authorized-read.ts` exports `SUMMARY_READ_STALE_MS`, `authorizedReadPolicy`, `useAuthorizedRead`. `lib/format/` has date, percent, plural, tone (`StatusTone`, `SignalTone`). `lib/auth/workspace-access.ts` exports `readWorkspaceContextCookie`, `contextCookieName`. `components/pathways/sticky-table-head.ts` exists. `DashboardSeverity` still in `types/pathways.ts`. S2 and S4 and S7 and S8 were already correct; S1, S3, S5, S6 had the stale `readContextCookie` export (Fixes 1, 6, 8, 9). |
| 6a | S4 evidence path and journey DTOs | Match: S2 produces `contracts/activities/activity-evidence.ts` with the three names S4 consumes and leaves `JourneyStageInputDto`, `SaveJourneyConfigurationDto` in `activities.dto.ts`; S4 ruling 2 converts them. |
| 6b | S6 keeps expense dialogs | Match: S2b Task 2 excludes the four expense files; S6b claims them. |
| 6c | S2b needs S1b `requestSourceMutation` | S1b Task 1 owns the move (private at `pathways-client.ts:1882` today); signature now stated in S1 and S2. S3 text "S1 or S2, whichever first" repointed to S1b (Fix 6). |
| 7 | Interfaces consumed vs produced | S2 to S8 interface sections checked against S1 to S7 Produces/Interfaces by name, path, signature: no mismatch beyond fixes. No slice relies on a later one. S4 produces `BeneficiaryRegistrationService` consumed by S5 with matching constructor positions. |
| 8 | File overlap | Seeds (`hosted-realistic-seed.ts`, `local-demo-seed.ts`, `defense-demo-seed.ts`), `scripts/sad/check.ts`, `docs/cr-...` are edited by several slices, each by anchors; later plans' Task 0 stop on anchor mismatch (see Unresolved 1). `source-mutation.ts`: S2b Task 8 and S8 both edit; S8 rechecks (Fix 11). `reporting-workspace.tsx`: S3b repoints it, S6b deletes it (Fix 9; resolved, see S3b cross-plan edits). S4 `limit` preprocess vs S5 `queryInteger`: not duplicates (DTO transform vs `@Type`), recorded (Fix 7). |
| 9 | Duplicate work | None found: `requestIdentity`, `Tx`, field schemas, `sourceMutationAcknowledgement`, evidence constants each have one creating slice. |
| 10 | Global constraints | Trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` is the only trailer in all eight plans (130 uses). No em dashes in any plan. Behavior-preserving, no new dependencies, one-sentence comments hold in the sections read. |

## Fixes

| # | Plan | Fix |
|---|---|---|
| 1 | S1 | Interfaces: removed `readContextCookie` from the `request.ts` exports, added the `captureRequestOwner` return type, "checked against 4a5806d0". |
| 2 | S1 | S1b Task 1: full `requestSourceMutation` signature, current location, single ownership. |
| 3 | S1 | S1b counts updated to post-F4b (pathways-client 2596 lines, `features/projects` 78 files, 49 mock files). |
| 4 | S1 | Rulings 13 to 15: validation convention, field-schemas ownership, F4b facts. |
| 5 | S2 | Rulings 15, 16: no dependence on S3 names; S1b signature; append-only field-schemas. |
| 6 | S3 | Interfaces: `readContextCookie` removed; `requestSourceMutation` owner is S1b Task 1; rulings 17, 18 (convention, S7b relative-import repoint). |
| 7 | S4 | Ruling 16: consumed names, why the inline `limit` preprocess is not S5's `queryInteger`. |
| 8 | S5 | `readContextCookie` fixed; "S3 ruling 11" corrected to ruling 14; ruling 19 (field-schemas append, start from S4 and S1b results). |
| 9 | S6 | `readContextCookie` fixed in two places; ruling 13 (S3b, S2b, S1b ordering, barrel import of `metricCellSchema`). |
| 10 | S7 | Task 5 text: repoint S3/S4 relative imports after moving `monitoring/`; `activityExtensionResponse` already moved by S2b; ruling 18. |
| 11 | S8 | Ruling 17: `source-mutation.ts` anchors after S2b Task 8, `requestIdentity` handoff from S7b. |

Counts: S1 4 edits (3 text + 3 rulings), S2 2 rulings, S3 2 text + 2 rulings, S4 1 ruling, S5 2 text + 1 ruling, S6 2 text + 1 ruling, S7 1 text + 1 ruling, S8 1 ruling.

## Unresolved

1. Seed and script anchors: S1 (3 seed type imports), S2, S3, S4, S5 each edit `local-demo-seed.ts`, `defense-demo-seed.ts`, `hosted-realistic-seed.ts` by exact text anchors. Not decidable by reading; each Task 0 stops on a mismatch, so expect adapting a script or two.
2. S2 and S3 dry-runs used S1a text extracted from the S1 plan, not S1a's executed output; S2 Task 1 edits S1a's `project-requests.ts`.
3. Web counts in the S3 to S8 outlines predate F4b (S1 showed 2786 to 2596 lines, 92 to 78 files); their Task 0 recounts cover it.
4. Developer decision worth confirming: two validation conventions coexist (criterion above). CR 3.6 needs the S3 Task 7 bullet before S6 runs.
5. S5 leaves `imports.service.ts` at 519 lines (over the 500 flag) by its own ruling 8; S4 says S5 "may" drop the unused `ParticipantsService` constructor parameter and S5 ruling 18 defers it to W1.
6. The commit trailer in the plans is Claude Opus 5.5 per the project rule, while this session's attribution reminder says Sonnet 5.5; the executors follow the plan.

## S1b cross-plan edits (2026-10-12)

- 2026-10-12-modularization-s2-activities.md: 3 text + ruling 18
- modularization-s2-activities.md: 3 text + ruling 17
- modularization-s3-indicators.md: 2 text + ruling 19
- modularization-s5-collection.md: 1 text + ruling 20
- modularization-s6-finance-reports.md: 2 text + ruling 14
- modularization-s7-analytics-rules.md: 5 text + ruling 19
- Each plan got one "Cross-plan (S1b):" ruling; S2 edits apply to both the committed docs plan and the .tmp copy (the two already differed on other rulings).

## S2b cross-plan edits (2026-10-12)

- modularization-s3-indicators.md: Task 0 expected counts (eleven files, activity paths under `activities/components/`); Task 1 mock list paths and `projects.reads.ts`; Task 2 leaf export lines instead of an `indicators/index.ts` sub-index; Task 4 seven `ProjectIndicator` importers; ruling 20
- modularization-s4-beneficiaries.md: Task 2 outline (`activitiesClient.uploadActivityProofFile`, `isFiniteNonNegative` from `lib/api/core/guards`, loaders call `activitiesClient`); ruling 17
- modularization-s5-collection.md: Task 1 note that `collection-workspace.test.tsx` already mocks `activitiesClient`; ruling 21 (40 pathways-client factories)
- modularization-s6-finance-reports.md: Interfaces and Task 5 importers of the expense dialogs; Task 6 `finance-budgets` read in `use-activity-expenses.ts`; no `budget/` sub-index; ruling 15
- modularization-s7-analytics-rules.md: Task 5 "S2b Task 7"; binding-reads fetchers name `activitiesClient`; ruling 20
- modularization-s8-public-users-auth.md: ruling 17 "S2b Task 8"; activities test paths in the test list and the mock step; ruling 18 (`source-mutation.ts` 315 lines)
- cross-plan-review.md: check 8 and Fix 11 now say S2b Task 8 (was Task 5)
- Each of S3 to S8 got one "Cross-plan (S2b):" ruling. Ruling 19 of S3 (S1b) is superseded by the new S3 ruling on the sub-index.

## S3b cross-plan edits (2026-10-13)

- modularization-s5-collection.md: Task 1 note adds the `@/lib/api/indicators` mock split in `collection-workspace.test.tsx`, `indicatorsClient: api` in the extend-projects test and `indicatorsClient.getIndicators`; ruling 21 adds the 41 factory count (unchanged by S3b)
- modularization-s6-finance-reports.md: ruling 13 and Interfaces S3b line (alias already deleted, `IndicatorResponse`, `indicatorsClient.getProjectIndicators`, two test mocks); Task 1 note (no indicator client method becomes dead)
- modularization-s7-analytics-rules.md: Task 4 expected fetcher (`indicatorsClient.getProjectIndicators`, `rule-editor.test.tsx` mock); Task 10 workspace path under `features/projects/indicators/components/`
- Check 8 (`reporting-workspace.tsx`: S3b may edit, S6b deletes) is resolved: S3b repoints it, S6b deletes it.
- Anchors re-checked in the S5, S6 and S7 copies (line numbers are those of the copies): modularization-s5-collection.md line 4800 (Task 1 `@/lib/api/indicators` mock split, `indicatorsClient: api`, `indicatorsClient.getIndicators`) and line 37 (ruling 21, 41 factories); modularization-s6-finance-reports.md line 29 (ruling 13), line 3170 (Interfaces S3b line) and line 3176 (Task 1, no indicator client method becomes dead); modularization-s7-analytics-rules.md line 1391 (Task 4 expected fetcher and `rule-editor.test.tsx` mock) and line 1862 (Task 10 workspace path). All were already present, so nothing was added twice.
- Check 8 in the Checks table now reads "S3b repoints it, S6b deletes it (resolved)".
- S4 cross-plan edits: none; the S4 plan lists no line for S5 to S8 (its rulings 16 to 18 only record what S4 consumes from S2 and S3).
- S3a plan, not edited (committed on a branch under review): S3a Task 1 Step 3: Biome rewraps the vi.hoisted line, expected 'Fixed 1 file'

## S5 pre-flight edits (2026-10-13)

- modularization-s5-collection.md: cloud workflow (environment-assigned stacked branch, `.tmp/s5a/base-sha` for the SAD base, pull request flow instead of a local dev merge, `pwsh` replay or CI, pending local run for the seed, e2e and smoke); line count 2119 after S4; known baselines; plan copy by `cp` with `date +%F`; docs grep excludes `docs/handoff`; exact audit replacements; the export characterization test pins a lettered project id; S5b outline figures (22 methods, 13 and 9, 41 factories, workspace path).
