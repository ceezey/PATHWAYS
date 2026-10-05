# Activity Log

## 2026-10-01

- Replay harness: documented the replay datamodel parity marker (gates baseline-revision drift only, not schema.prisma edits) and the developer-only hosted pg_dump schema comparison; `migrate diff --from-migrations` cannot apply this chain, so the template-based Test-SchemaDrift.ps1 is the local drift gate.
- Replay harness: removed -Phase4IndicatorPolicy, -RuleBasedAccessAlignment and -DashboardHomeProjectScope under cr-pathways-replay-harness-modernization; Phase 4 indicator assertions now run in every replay.
- RBAC v4 reconciliation: v4 adopted in docs under cr-pathways-rbac-v4-adoption; MA-18 added and closed in docs; RBAC v4 grant migration registered as deferred.
- Figma reference: DSD section 4 specimen map and authority row under cr-pathways-figma-reference-integration; budget and alert module guidance folded into DSD; inbox deferred.
- Index: registered activity-log, the core gap closure and replay harness plans, and the RBAC v4 and Figma spec and plan.
- Core features QA (F1 to F8): read-only run against PRD gates, QAD rows and the deferred register; record in [audit-pathways-core-features-qa-20261001](audit-pathways-core-features-qa-20261001.md).
- Result: one unmet or partial gate in each of F1, F2, F3, F4, F6, F7 and F8; F5 partial on G-F5-1; UI token drift and an oversized collection workspace noted.
- Doc drift fixed on chore/core-doc-drift: PRD F1 to F8 status honesty, automatic-mapping route, UC-F8-2 route; dead indicator-library-workspace removed.
- Integration on integrate/core-features (from dev a75406d): merged ui-foundation-tokens, core-ui-alignment, f2-project-archive, core-doc-drift, core-gate-coverage, f1-signin-lockout, f3-f4-rbac-identity-review, f4-journey-note, f6-import-value-map and f7-indicator-library.
- Migration chain re-linked 0045 to 0046 to 0047 to 0048 to 0049 to 0050 to 0051 (predecessor guards on each); 0051 now wraps p09_role_allows as left by 0048 so SA journeys.read stays revoked and M&E keeps identities.review.
- Inventories unified in hosted-plan, its test, legacy-retirement test, Verify-Forward (26 migrations, 317 grants), runbook and SDD counts; PRD and QAD rows merged with unique QAD IDs. Not pushed; no hosted migration applied.
- Replay fix on fix/indicator-policy-replay: historical modes (22 to 25 migrations) ran current-schema Prisma suites that read projects.implementing_partners, absent there.
- The feature-read, c8 and dashboard-home suites now run only in -MigrationBaseline (current schema, measured table count passed via PATHWAYS_EXPECTED_TABLE_COUNT); historical modes keep their SQL runtime checks.
- Replay modes run before the fix round: Phase4IndicatorPolicy, RuleBasedAccessAlignment, DashboardHomeProjectScope, ProjectActivityCreationRepair and MigrationBaseline exit 0; a wrong assertion failed the replay.
- Expense submit race: p34_submit_expense now replays a concurrent same-request submit (migration 0053, expense-submit preprovision and cleanup, two-session concurrency test); inventories updated to 27 migrations. Replay run pending. The pre-0053 failure of the concurrent same-request submit was shown by inspection, not by an executed run.
- Core-gap closure integrated (indicator replay, expense runtime 0053, contrast, dashboard perf, sign-in lockout 0052); 0053 now requires 0052, ledger 28 rows, 35-step hosted plan; hook suite wired into -MigrationBaseline; sign-in 503 resolved.

## 2026-10-02

- RBAC v4 grant migration: 0055_rbac_v4_grants revokes 7 and grants 2 role_permissions (317 to 312, marker RBAC_V4_GRANTS_RUNTIME), API limits direct entry to four survey and monitoring form types, /collection/entry redirects to /collection; recorded in cr-pathways-rbac-v4-grant-migration (Approved), deferred row removed, hosted plan 37 steps. Not applied to hosted.
- RBAC v4 coverage: runtime SQL proves Program and Grant Manager read in-scope activity rows, metadata test covers all four direct-entry types, and apps/web/e2e/rbac-v4.spec.ts signs in with TOTP on the local stack; signed-in /collection/entry reaches /unauthorized because middleware has no route policy for it (marked test.fail).
- RBAC v4 grant migration: 0055 applied to role-staging under the auto-migrate rule after ledger precheck (29 rows, checksums equal); verified 30 rows, 312 role_permissions, PO activities.create denied, GM activities.read allowed, p09_role_allows ACL equal to 0035 as a grant set; CR set to Applied.
- Demo decisions 403 root cause: 0047 and 0051 renamed and recreated p09_role_allows without its EXECUTE grants, so the rules owners were denied; 0047, 0048 and 0051 amended before any hosted apply to copy the ACL and assert parity, with a P09_ROLE_ALLOWS_GRANTS_RUNTIME replay test.
- Staging applied the original 0047, 0048 and 0051 before the in-place p09_role_allows grant amendment (59dd769), leaving p09_role_allows and p09_role_allows_0048 without EXECUTE (42501 on outcome recording). The amendment is reverted to the exact applied bytes to keep ledger checksums equal, and forward migration 0054_p09_role_allows_grants restores both ACLs from p09_role_allows_0035; ledger 29 rows, 36-step hosted plan, grants runtime test also covers p09_role_allows_0048.
- Role-staging verified 2026-10-02 at ledger 0000-0054: CRs sign-in lockout, core RBAC identity review, journey note and indicator library set Applied; import value map (release gates) and performance scaling (G-F8-7 staging re-measure) stay Approved; facts recorded in runbook-role-staging-build.md section 8.
- Added Test-SchemaDrift.ps1 and schema-drift-expected.sql: a template-based check that schema.prisma matches the migration chain (introspects as postgres); the replay template no longer keeps the disposable baseline_compatibility_probe table, and schema.prisma now models the client_import_id default, import claim indexes and partner index name.
- E2E v4 sign-in: the Playwright suite now uses real RBAC v4 sign-in (rbac-v4, smoke, workflows, beneficiary-access via apps/web/e2e/fixtures/real-sign-in.ts); legacy demo-switcher specs were deleted and the route-stub specs kept, with per-spec outcomes in [e2e-legacy-spec-triage](e2e-legacy-spec-triage.md).
- E2E run requirements: the suite runs serially (workers 1) because specs share seed accounts and reset their credentials, and a non-CI run derives local Supabase URL and keys from `npx supabase status`, so a reused dev server on :3000 must have been started with those local values; TOTP steps are tracked per actor so a time step is never reused.
- E2E deferred gap: public-route and skip-link e2e coverage was dropped with the legacy specs and is recorded in the deferred-features register.
- E2E role-routes aligned to current RBAC policy (user-approved; sources apps/web/src/lib/rbac/route-access.ts, apps/api/src/modules/auth/authorization-policy.ts, rbac-contract.json:159): /beneficiaries and detail SJEO to JEO, identity link SJEO to JEO, /collection/forms SPJEO to SE, /collection/import SJEO to SEO, monitor-evaluate SPJE to SPGJE, /analytics SPGJE to SPGJEO (duplicate row removed), /alerts SPJEO to SPGJEO, /alerts/repository SPJEO to S, /recommendations SPJEO to SPGJEO; focus recheck now expects the allowed page to stay mounted (route-access-guard.tsx), denial still replaces it.
- Staff emails 2026-10-02: hosted dummy staff now use role subdomains (gm, meo, pgm, pm, po).pathways.co.ph; applied to auth.users, auth.identities and pathways.system_users on klbtoqdalmcsfjqophty in one transaction and to hosted-realistic-seed.ts; the System Administrator Gmail is unchanged.
- Password recovery UI 2026-10-02: /staff/forgot-password, /auth/update-password and /auth/recovery/error now use the DSD StaffAuthFrame (brand header, 44px show-password control, required labels, inline error block, no input wipe on error); recovery security logic unchanged, staff-auth-shell.tsx left unused.
- Sign-in lockout countdown 2026-10-02: the staff login form reads retryAfterSeconds from the 429 SIGN_IN_LOCKED response, shows a live m:ss countdown, and disables the password field and submit until it ends; editing to a different email clears the lock.
- Desktop canvas layout 2026-10-03: staff main area uses the canvas page ground instead of white, content is capped at 1200px with 32/64px desktop gutters per the DSD standard desktop layout, and inputs, selects, textareas, OTP boxes and outline buttons use paper so they stay white on canvas.
- Figma foundational components 2026-10-03: button secondary/outline are white with primary border and text, ghost uses primary text, tabs use primary active text without hover pill, inputs/textarea/select gain primary focus border and read-only styling, form labels and locked fields are semibold, status badges gain a tone dot; tokens per DSD, Figma used for anatomy only.
- Figma top bar 2026-10-03: staff header shows only the page name, an outlined Alerts bell (when the role can open /alerts) and an initials avatar that opens the account menu; email, role and scope moved into that menu; no scope chip.
- F1 gate verification 2026-10-03: requirements-qa-gate PASS on all ten G-F1 gates after adding users.service and profile.service tests, a last-active-System-Administrator guard (UC-F1-4), and SIGN_IN_LOCKED audit assertions (replay SIGNIN_PASSWORD_HOOK_RUNTIME=PASS, 12 assertions); PRD status row and audits updated, MA-04 closed, hosted direct-grant bypass still deferred.
- Budget module 2026-10-03: the Budget tab renders a new isolated `budget-module` (overview with stat cards, alerts, advisory recommendations and activity breakdown; expandable expense ledger with review drawer; local-only transparency preview) in place of the legacy finance workspace, which is untouched. Only approved expenses count as spending and pending is shown separately; the Efficiency ratio card is a user-approved deviation from the DSD no-divide rule. No API or schema change. G-F2-4 reconciled to Met (archive route exists, MA-05 closed); all 19 F2 gates already had QAD rows, so the audit note was stale. Deferred items are in the register.
- Budget overview polish 2026-10-03: stat cards match the Budget screenshot (Total budget, Total logged with bar, Remaining, Efficiency ratio); efficiency ratio now comes from `efficiencyRatio` in the overview-metrics contract (KPI % / budget %, two decimals, null when either is hidden); activity breakdown bars show no text.
- Figma component restyle 2026-10-03: metric cards use an uppercase label and no top border, empty states use a round icon tile, error states use a red-tinted border with an outline retry, confirmation dialogs show a tinted warning circle, the side sheet is 480px, toasts gain success/error tints and project cards drop the heavy health top border; sources Figma 1344:342, 1344:505, 1344:179, 1344:646, tokens per DSD, no API or schema change.
- F2 gate verification 2026-10-03: requirements-qa-gate PASS on G-F2-1 to 14 and 19 (api 1984, shared 82, web 1591 tests pass; both builds pass). G-F2-15 to 18 stay Met; SQL verification pending because the local runtime SQL cluster hung on a Windows shared-memory fault (error 487); see deferred-features.md.
- F2 SQL runtime 2026-10-03: after restart `finance-expense-runtime.sql` PASS on the replay template, so G-F2-15 and G-F2-18 are Met; `finance-evaluation-decisions.sql` is a stale Phase 3 suite (source-proof trigger blocks its fixtures), so G-F2-16 and G-F2-17 stay SQL verification pending. The earlier hang was the runner's piped output held open by the started server, not the database.
- F2 review SQL 2026-10-03: added `finance-expense-review-runtime.sql` (PASS, 7 checks, no migration); G-F2-16 and G-F2-17 now Met, so all 19 F2 gates are Met.
- Activity list table 2026-10-03: the project Activities list matches Figma 1344:505 (code, linked title, tint-only status pill, sortable due date, beneficiaries reached / target, indicator count, budget %, overflow menu, Columns toggle, client-side CSV Export, sticky header, no Delete) and the toolbar is slimmer with New Activity moved into it; the list response gains indicatorCount, beneficiariesReached, beneficiariesTarget and budgetUtilization from grouped scoped queries (budget % needs budgets.read and expenses.read, reached needs beneficiaries.aggregates.read, else null shown as an em dash); code is the stored activity code; no migration, new table or Delete action; QAD-T104.
- Evidence panels 2026-10-03: the Evidence & reports tab matches Figma 1344:505 with an Evidence & attachments card (icon tile by lock/image/document, file name, size, uploader, date, status pill, View keeping the private download behaviour and Review proof link) beside an Audit metadata timeline from evidence submit and review timestamps (reviewer name when present, else Unknown user); the evidence detail response gains contentType, byteSize, isIdentifying, reviewedDate and reviewer from the same scoped read; no migration, new table or permission change.
- F3/F4 polish 2026-10-03: journey adapter maps the real attendance statuses (PARTIAL removed) and the participation dialog offers them; duplicate review controls are gated by `beneficiaries.identities.review` with a confirmation dialog and toast; beneficiary cards use the DSD 6px radius; PRD F3/F4 summary rows now agree with the Met gate tables. No API, schema or migration change; the journey note already round-trips in the UI and API (G-F4-6).
- Dashboard KPI row and team avatars 2026-10-03: new GET /dashboards/action-counts (projects.read guard, no migration) returns pending approvals (expenses PENDING for expenses.verify, VERIFIED for expenses.approve), active alerts (NEW and REVIEWED via the scoped f10 alert list, capped at 1000), overdue activities (existing overdue rule, most overdue code and days) and for review (PENDING activity updates with complete proof upload under evidence.review), each null with no query when the grant is missing; the Dashboard opens with the Figma 1344:342 KPI row and project cards show an avatar stack from the existing scoped team assignments (max 8 returned, 4 shown); QAD-T105; evaluations excluded from Pending approvals (deferred register).
- F5/F6 gate verification 2026-10-03 on feature/f5-f6-verify-dsd: update, validate and submit of a direct-entry draft now require a PUBLISHED form (404 otherwise, as create already did); new service-level gate tests `metadata.f5-gates.test.ts`, `form-definition-export.f5-gates.test.ts`, `imports.f6-gates.test.ts` and `secure.macro.test.ts` cover G-F5-1 to 5 and G-F6-1, 2, 4, 6 and 7; QAD citations updated; G-F6-7 marked Implemented across PRD, CR, index and audits; UC-F5-3 cross-scope denial documented as 404. Collection, import and direct-entry screens aligned to DSD (error states with Retry instead of success banners, sample metadata connections removed, shared tables, cards, badges, empty and loading states, sentence-case labels). No migration, schema change or `@ts-nocheck`; runtime SQL not run.
- Import form loading 2026-10-03: on /collection/import the published form version list shows pulsing skeleton bars only when opened before the forms arrive (no page-level loader), "No forms available." when the project has none, and a "Forms" back link for roles that can open /collection/forms; no API change.
- Dashboard monitoring zeros 2026-10-03: Participation records, Distinct attending individuals and Enrolled individuals read 0 instead of Not available when no records exist; suppressed counts keep their label (cr-pathways-overview-zero-display).
- F7 indicators DSD 2026-10-03: project indicators, the indicator library and the live evaluation criteria and rubric use SectionCard tables with sticky headers, ui Select, tinted inline notices and AsyncState; the add indicator and add library entry forms moved from details disclosures into dialogs opened by a primary button (project-indicators-workspace, indicator-library-manager, live-evaluation-workspace, new option-select helper); behaviour, permission gates and accessible names unchanged; no API, schema or migration change; legacy indicators view and use-from-library left untouched.
- Indicator form defaults 2026-10-03: Add project indicator suggests the code from the name, prefills the unit from the numeric domain, defaults direction to Higher is better and derives chart decimal places (count 0, percentage 1, ratio 2) instead of asking; contract and API unchanged.
- Indicator form tweaks 2026-10-03: the optional Description field is removed and Source description takes its full-width place; chart-axis decimal places sit in an Advanced settings section shown only for non-count domains; unit label shows an "e.g. %, people" hint.
- Supabase rename 2026-10-03: hosted project klbtoqdalmcsfjqophty renamed from PATHWAYS-role-staging to PATHWAYS-devV2 in the dashboard; docs and script comments updated, connection strings, project ref and guards unchanged; earlier log entries and role-staging file names kept as history.
- Create duplicate guard 2026-10-03: new `lib/forms/pending-create.ts` and `hooks/use-pending-create.ts` write a per-user sessionStorage marker (kind, scope, startedAt, fingerprint) before a create, ignore a second submit while one is pending, keep the button in the loading state after a reload, poll an existing read every 2s for 60s to confirm the record (toast, then navigate or refresh) and otherwise show "We couldn't confirm the earlier submission. Check the list before submitting again."; markers expire after 3 minutes and never hold raw personal data (beneficiaries use a SHA-256 of name and birth date). Applied to project, activity, beneficiary registration, user authorization, project indicator (manual and from library), indicator library entry, budget allocation (budget module and legacy finance workspace), digital form create and milestone; client only, no API, schema or migration change; server idempotency for all creates stays deferred (deferred-features.md).
- Journey configuration 2026-10-03: `/projects/:id/journey-stages` renders a new isolated `journey-config` module (summary pills, live journey track with branch children, stage list with drag or arrow-key reorder, stage details with activity mappings, type guide, read-only Preview dialog) in place of the legacy workspace, which is untouched; it uses only the existing journey-stages read and bulk PUT, gated by `journeys.manage`; Branch nodes use the cyan token because the DSD defines no purple; no API, schema or migration change.

## 2026-10-03 Journey stage removal, project card and loading polish
- Journey config: Remove stage (branches become core), new codes follow the highest J-number, track branches hang from the connector midpoint.
- API saveStages parks archived stages past live order slots and suffixes their codes, so removed codes and orders can be reused.
- Project cards pin the timeline to the bottom; project edit form shows the skeleton card while loading and no longer shows the unconfirmed save banner.
- Remaining spinner loading cards (journey stages, workspace tab) use the AsyncState skeleton.
- 2026-10-03 Field code underscore: the builder kept stripping a typed trailing underscore on every keystroke; codes now clean fully on blur (fix/field-code-underscore).
- 2026-10-03 Form code: the builder sent free-typed form codes such as TEST-FORM, which the API rejects; the form code now cleans to lowercase snake case while typing and on save.

## 2026-10-03 Audit Log filter layout
- Removed the Audit Log eyebrow, page description and filter card description; moved From/To date inside Event filters below the three fields.
- 2026-10-03 Form builder layout: removed the placeholder Linked indicators checkboxes (indicator links are made on Target indicators); Form code and Description moved into the form information card under a Form configuration header.
- 2026-10-03 Collection notices: success notices (draft saved, published, generated) now show as a toast pop-up instead of an inline banner.

## 2026-10-04 Local dev against hosted devV2
- `pnpm dev` now runs the API in watch mode (`dev-watch.mjs`) against devV2 using the runtime role, with owner credentials blanked and output redacted; the legacy PATHWAYS-dev launcher moved to `dev:legacy-db`. How-to in docs/local-dev.md.
- Beneficiary media proof 2026-10-03: new isolated `beneficiary-media` API module with list, limits, reservations, finalize and content routes under `beneficiaries/projects/:projectId/:beneficiaryId/media`, all behind `@RequireBeneficiaryStepUp`; upload needs `beneficiaries.enrollments.manage`, list and preview need `beneficiaries.records.read`, aggregate-only roles get 403, rows are scoped by organization, project assignment and enrollment, and reservation and finalize write audit rows; files reuse the activity-proof limits, signed upload and verification, stay PENDING and show as Uploaded (no review, tags, capture date or duration); the Media proof tab is live for non-aggregate roles with blob previews. No schema, migration or permission change.

## 2026-10-04 MFA code boxes centered
- Centered the six OTP boxes on the security check screen.
- MFA code auto-verifies once all six digits are entered.
- After an accepted MFA code the card shows "Code accepted. Opening your workspace..." instead of the code form; falls back with an error after 30s if aal2 is not confirmed.
- Staff sign-in: removed the "Supabase password and TOTP authentication" hint beside Forgot Password.
- MFA card narrowed (max-w-md); Recheck securely removed (reloading the page is the retry path); Sign out and clear this page renamed to a back-arrow "Login" button (accessible name "Sign out and return to login"); Verify authenticator code moved beside it, left-aligned. mfa-access e2e uses a page reload in place of recheck (16/16).

## 2026-10-04 Activity beneficiaries reached always 0
- Root cause: p08_activity_beneficiaries_reached runs as `prisma` (no BYPASSRLS) and activity_updates forces RLS, so it saw no rows. readReached now uses a grouped Prisma query under runtime RLS; authorized callers get 0 instead of null. Privacy review: PASS WITH NOTES (notes applied); function repair deferred.

## 2026-10-04 Readable project codes; API dev without watch
- New projects get codes like CRL-NS-2026 (title initials, area province initials, start year), generated by the API from the shared `projectCodeBase`, with -2, -3 suffixes when taken in the organization; the create form previews the code under the title. Existing codes are unchanged.
- `pnpm dev` runs the API without watch (`dev-local.mjs`); `dev:watch` keeps automatic reloads. Agent work happens in worktrees and is merged only when finished.

## 2026-10-04 Proof history grouping and library navigation
- Activity proof history shows one card per submitted update (the API returns one proof row per file), so a multi-file submission is one version listing every file; the review dialog lists all files too.
- Indicator library has Back to Indicators (returns to the opening project via ?project=) and the top bar reads Projects / Target Indicators / Indicator Library.

## 2026-10-04 Turbopack for local web dev
- `pnpm dev` runs the web with `next dev --turbopack` for faster page compiles; `turbopack.root` is pinned to the monorepo root. Builds and Vercel still use the standard bundler. Data fetching is unaffected.

## 2026-10-04 Indicator form: recipe settings
- Add project indicator: Recipe (was System-owned calculation) and Link Activity (was Activity binding (optional)) moved into Advanced settings, which opens for derived calculations; "(inclusive)" dropped from Period end. Baseline and Target lock by recipe: completion % fixes 0 and 100, count recipes fix baseline 0, sums and averages stay editable.

## 2026-10-04 Add project indicator makeover
- The form shows Code, Name, Baseline, Target, Recipe, a recipe card (system background) and Source description. Authority (always derived), direction (higher is better), numeric domain and unit (from the recipe), decimals (2, or 0 for counts) and period (project dates, capped at 365 days) are hidden defaults. Only Activity completion % is offered because the other recipes are not computed yet (deferred). Existing manual indicators keep Save measurement.
- Indicators list: Latest value and Progress columns replaced by Actual; a progress bar sits under each indicator name; "Manage this indicator" rows replaced by a far-right "…" button that opens the manage panel in a dialog.
- Fix: the library route now accepts the display-only `?project=` back-link key, which the strict page guard had rejected as Unauthorized.

## 2026-10-04 Indicators list alignment
- Baseline column removed; Target, Actual and Status centered; rows middle-aligned; Code column narrowed and Indicator widened. Product decision (indicators list only): no progress reads 0% and no measurement reads 0; suppressed values keep their label.
- 2026-10-04 Import preparation (header limit, value map suggestions, date format, fixed values) put on hold until after the defense; plan and workaround recorded in docs/deferred-features.md.
- 2026-10-04 Form builder: Form code and Description inputs removed (existing values kept on save); new drafts get a generated code such as test_form_k3f9; Form information label renamed Form title.
- 2026-10-04 Import steps 1-2: over-long source headers are shortened with an ellipsis instead of rejecting the file (no migration; SQL checks keep 100), web header comparison trims like the server, and the value map editor gains Suggest translations from the loaded rows. Verified on the dummy participant export: 100 rows, 36 columns, sex and disability fully suggested. Steps 3-4 stay on hold.

## 2026-10-04 F8 F9 F12 gate closure
- New isolated analytics-insights API module: participation breakdowns (suppressed), indicator trends (capped) and an approved-only budget aggregate; web panels, trend chart and budget card replace the browser budget computation. Closes G-F9-9.
- Migration 0057_f9_survey_period_release (renumbered from 0056): aggregate-only roles read closed-period survey totals from a frozen release; open periods return 400. Developer-approved migration; not applied to hosted. Closes G-F9-10 locally.
- Report kinds MONITORING_REPORT and EVALUATION_REPORT added, CSV stored as bare text/csv. Closes G-F12-4.
- Analytics export button and Participation option turned on; Add to Dashboard stores browser pins rendered live on the role dashboard.
- G-F12-1 evidence: reports-runtime.local.test.ts checks report scope, permissions and suppression on disposable PostgreSQL; wired into the replay current-schema suites.
- Docs: cr-pathways-f8-f9-f12-gate-closure, F9 trusted aggregates section 11, PRD, QAD (T110, T111, A39, A40), deferred register, SDD, DSD, index.
- 2026-10-04 Migration 0057 confirmed on PATHWAYS-devV2 (applied with 0056 by the indicator-type session); hosted catalog check matches the migration. G-F9-10 now Met; cr-pathways-f8-f9-f12-gate-closure set to Applied; PRD, index and deferred register updated.

## 2026-10-04 F10 F11 rules completion

- Branch feature/f10-f11-rules-completion under three change records: rules metric catalog and auto-resolve, hosted scheduler, rules board UI.
- Contracts widened first (AUTO_RESOLVED, three aggregate metrics, pooler usernames) so no API rejects rows the database later emits.
- Migrations 0058-0060: recommendation AUTO_RESOLVED status, auto-resolve on alert clear, budget utilization, Beneficiary follow-up and survey improvement metrics with suppression and source-read audience; rules catalog preprovision and cleanup pair; F10/F11 PostgreSQL suite wired into Verify-Forward.
- UI: rules board with drawer builder replaces the Alerts Repository page, sidebar entry removed, Figma review cards on /alerts; old workspace left unused.
- Scheduler: inert GitHub Actions drain and sweep workflow, prompt-only machine login script, activation runbook in ops; G-F10-7 Partly met until a person sets credentials.
- Hosted apply held: Preview and Production share devV2, so 0058-0060 wait until production runs the widened contract and 0056 lands without a gap.
- 0059 header comment omits outcome_confirm_operation; recorded in the metric catalog CR section 5 instead, since the SAD checker blocks any byte change to a committed migration.

## 2026-10-04 Dev CI lint and typecheck repair

- CI validate failed at Lint on dev, so Typecheck, Test and Build never ran.
- Biome safe fixes for formatting and import order in six test and config files.
- Removed a useless Fragment in the activity list Export action; the proof dialog progress bar takes tabIndex 0 like the shared ProgressBar.
- Typecheck then surfaced a mock transaction type error in action-counts.service.test.ts; cast to Prisma.TransactionClient as other tests do.
- Local lint, typecheck, test (api 105 files passed, 8 skipped for PostgreSQL; web 187) and build pass.
- 0058-0060 applied on devV2 after master 6d4ee10f reached production; ledger 35 rows 0000-0060, pinned md5s match. First resume failed safely at 0059 because hosted-build --resume reuses a stale .tmp/hosted-build/migrations stage; clear it before resuming.

## 2026-10-04 Testing-session UI fixes (feature/session-sprint-20261004, not pushed)

- MFA card: Figma loading card for session checks, Verify button renamed and right-aligned, Login keeps the card in place until sign-out completes.
- Site header: HDO Public Portal eyebrow removed (DSD public context updated).
- Staff login: moved onto StaffAuthFrame (PATHWAYS mark, bordered 44px inputs); frame card radius set to the DSD 12px for all staff auth pages.
- Dashboard: task cards centered, Open monitoring beside the project scope select, aggregate option relabeled Select Project.
- Sidebar: collapsed state persisted in the pathways-sidebar cookie and read by the dashboard layout on first paint.
- Collection: Data workspace eyebrow removed from collection, import and direct-entry headers.
- Analytics export: format menu (CSV, XLS, XLSX, PDF) above Add to Dashboard; API export takes an optional format, renders non-CSV through createReportArtifact and audits the chosen format. CSV bytes unchanged.
- Dashboard: aggregate scope option relabeled All projects.
- Data Analysis: views, overview cards, chart panels and Add to Dashboard are hidden when the role lacks the permission (previously Unavailable or disabled). PRD/QAD rows that describe restricted wording on this page are now doc drift to reconcile after the defense.
- Alerts: eyebrow and description removed, Manage rules moved right-aligned into the filter row, project default relabeled Select Project.
- Alert repository: Alerts / Alert Repository breadcrumb, description removed, scope and status use the shared Select.
- Rule test: conditions numbered and described in words instead of IDs; results use Triggered / Not triggered / Unavailable badges with observed value and unit.
- Indicator form: Type and Recipe get helper text; choosing a recipe preselects a matching type (Activity completion % -> Activity), still editable.
- Activity proof: target-based activities could never complete (read-only bar capped at 99 since 13baeab1); added an explicit 'This proof completes the activity (100%)' checkbox. Activity completion % semantics unchanged (completed activities only).
- Role dashboards: read-only `GET /dashboards/role-overview` (`projects.read`, sections null without their permission) with a shared contract; layouts for Project Officer, M&E Officer, Project Manager and a portfolio view for Program Manager and Grant Manager (Grant Manager read-only). System Administrator keeps the previous dashboard.
- Project health labels derive only from open rule-based alerts; evaluation scores show the stored number with no quality label. Request extension, escalated-alerts queue and evaluation approval rows are deferred to Plan 2 (register and PRD updated; DSD patterns added).

## 2026-10-04 Budget envelope total

- Budget page: total allocated is now the project envelope (PROJECT_PROFILE_TOTAL) when one exists, and the Project-level row shows the envelope minus activity allocations (negative if over-allocated), so utilization matches the overview tile. Without an envelope the sum of activity rows is used. Rules metric and analytics aggregate still sum all rows (deferred-features.md).

## 2026-10-04 Program Manager project assignment

- System Administrator can assign a Program Manager to projects in User Management; zero assignments are allowed because managed programs still apply. Changes in canAssignRole, users service, access matrix and the user management workspace; no migration (RLS p09_assignment_insert already allows it). Recorded in cr-pathways-program-manager-project-assignment; program creation and manager_user_id setting stay deferred.

## 2026-10-04 Sign-in page polish

- Auth frame uses the DSD canvas beige (`bg-background`) instead of the blue gradient, on every auth page; DSD auth background note updated.
- Sign-in title is now "Sign in", the "Project Information Management" subtitle is removed (frame description is optional), and "Forgot password?" is left aligned.
- Sign-in card narrowed to max-w-md to match the MFA card.
- MFA page: verified, code-accepted and finding-workspace states now show a compact loading card; the session-check skeletons are replaced by the disabled OTP boxes so the page opens straight on the code entry.
- MFA pending state: pulsing skeleton bar above the disabled OTP boxes; the footer always shows "Login", disabled while the session and factor check runs (e2e logout-during-discovery test now asserts the disabled state).

## 2026-10-04 F13 public tracker UI

- Public home, list and project pages now render only the eight allowlisted snapshot fields plus publish date; dropped the always-empty progress, beneficiary, budget, assessment, donate and indicator blocks of the legacy detail view (kept on disk, unused by public routes).
- Staff preview reads the current revision's frozen snapshot through the authorized publication API (react-query via useAuthorizedRead), so reviewers see unpublished revisions; the queue links to it.
- No API, schema or migration change. Local web typecheck, lint, tests (189 files) and build pass; G-F13-5 hosted verification stays Not met until checked on a hosted preview.
- Gate review found QAD-T74, QAD-T75 and QAD-A09 cited public.service.test.ts without matching tests; added service tests for distinct-approver approval, self-approval refusal, out-of-stage transitions, withdraw then public not found, and the anonymous route list (no media route), plus a queue test that the submitter cannot approve.
- PublicService now refuses self-approval with a 409 before the database trigger does. The trigger and the PUBLISHED-only projection are still not exercised by a database-backed test.
- Rebased onto dev per Cian; on dev the web auth-navigation contract test already fails (AppShell layout now reads the sidebar cookie), unrelated to F13.
## 2026-10-04 Defense demo verify fixes

- Verifier: activity updates, library entries, indicator bindings and publications force RLS, so the owner read 0; those checks now run as the M&E Officer or Project Manager on the runtime role. Escalation is read from the `decision.recorded` audit trail (F10 decisions never set `decision_recommendations.outcome`).
- Seed: the Lavezares import faults (under minimum age, guardian consent) only failed at promotion as retryable errors, leaving the batch unfinished; they are now a day-first birth date and a blank required consent, rejected at validation.
- Clean local wipe, full seed and `--verify`: exit 0, 23 of 23 checks. CRL follow-up and WSH survey improvement alerts fire (issue 2 confirmed, no fix needed).
- Reported, not fixed (API): registration rule failures during import promotion are retried as transient instead of being flagged at validation or marked for review.

## 2026-10-04 Plan 2: extension requests and escalated alerts (feature/session-sprint-20261004)

- Resumed from the cloud handoff. A clean local baseline replay with 0061 passed (exit 0, ACTIVITY_EXTENSION_REQUESTS_RUNTIME 12 assertions, all four current-schema API suites), so the earlier current-schema suite failure did not reproduce; the TMPDIAG diagnostics were removed and SCHEMA_DRIFT stayed CLEAN with no accept needed.
- 0062 adds `pathways.f10_escalated_alert_list` owned by `rules_human_owner` behind a new rules-escalation preprovision/cleanup pair; the schema owner lends CREATE inside the migration (0053 pattern). Ledger 37 rows. The runtime suite reuses the rules suite alerts and runs after it on the recovered 0060 clone (11 assertions).
- API: `activity-extensions` module (request, verify, decide; approval runs ACTIVITY_UPDATE so rules re-evaluate) and `GET /alerts/escalated`. The shared extension contract carries `updatedAt` because verify and decide need it as the expected version.
- Role overview: `myExtensions`, `extensionQueue`, `alerts.escalated` and `alerts.escalatedOpen`. Web: Request an extension dialog and extension panel replace the disabled placeholder; dashboards show returned notes, an Extension pending badge, the M&E verify queue, EXT rows in Pending your approval, and Escalated alerts on the portfolio.
- Local environment notes: cdn.sheetjs.com is blocked here, so xlsx 0.18.5 was linked locally only (not committed); pnpm 11 needs `verify_deps_before_run=false` to stop reinstalling before each exec. `apps/web/src/lib/rbac/auth-navigation.contract.test.ts` already fails on the dashboard layout from a0d34a5 (sidebar cookie); not touched here.
- Hosted apply: the developer ran `hosted-build.mjs --resume` against PATHWAYS-devV2 (a first run from a checkout without 0061/0062 only re-ran the 0060 postconditions). A read-only check then showed 37 finished ledger rows ending at 0062, none broken, the 0061 table and transition trigger present, the 0062 function owned by `rules_human_owner`, and no residual owner membership or lent CREATE.

## 2026-10-04 Dashboard and project navigation fixes
- Role overview buttons (View, Resolve, Submit update, Resubmit proof, Review, Approve, list rows) now navigate to their own page instead of opening the in-place dashboard sheet, which kept reloading; activity buttons open the activity list with that activity's details open.
- Project Manager budget alert rows, Log outcome and the Active budget alerts View go to the alert's project Budget page; Approve opens the Budget ledger with that expense expanded via a `#expense-<id>` hash.
- Project Overview tab removed; `/projects/:id` redirects to Project Activities, which now carries the Edit and Archive buttons.
- Target Indicators, Evidence, Monitor & Evaluate, Budget and Journey stages get a Back button that steps back one page in history (falls back to Project Activities on a fresh tab); Evidence's Back to Projects link removed.

## 2026-10-05 EHK demo cohort sized for SADDD
- SADDD releases only for a closed project (EHK) and suppresses the whole table when any sex, age band (at project end) or disability count is 1 to 4; the old 16-person EHK cohort was always fully suppressed.
- EHK cohort now 45 people (ages kept clear of band edges, 5 with disability), so every marginal is 5 or more; a test in `local-demo-data.test.ts` guards this. Reseed needed (wipe, then seed) for local and devV2.

## 2026-10-05 Defense readiness audit (priority)
- Reconciled the Sheet3 defense-readiness task sheet (35 tasks) and the pitch against code and PRD gates in [audit-pathways-defense-readiness-20261005](audit-pathways-defense-readiness-20261005.md); marked priority in index and state.
- Code: 12 of 13 PRD features implemented; F10 hosted scheduler inert, F13 hosted verification Not met, reports project-scoped only.
- Pitch is stale: export (G-F12-4), G-F3-6, G-F4-6 and G-F9-9 are Met but listed Not met; the sheet's Futuremakers project is not in the seed.

## 2026-10-05 Project coverage map (feature/gis-coverage-map-n0hyrs)
- `GET /analytics/project-map` places scoped projects at bundled PH city/province centroids parsed from `implementationArea`, each with its Project Overview metrics and suppressed SADDD sex buckets (cr-pathways-project-coverage-map).
- The map overlay now clears on `style.load` instead of waiting for every tile; hover, tap or the project list opens an overview card.

## 2026-10-05 Connected three-role defense script
- Pitch v2.1: one SSG session traced through Plan, Collect, Verify, Decide, Report, ending on EHK as the completed cycle; M&E, PO and PM only; FR-1 to FR-17 each mapped to a step; metadata-driven import is live and manual encoding is shown without saving; rule setup moved to Q&A.
- Seed: the EHK signed-off evaluation now uses the six OECD-DAC criteria (weights 15/10/25/20/15/15, overall 87.55) in `defense-demo-stage-evaluation.ts` only; takes effect after a wipe and full reseed.
- Audit: Futuremakers relabelled to SSG-ES-2026 (DR-03); DR-01, DR-02, DR-05, DR-07 closed; DR-08 (no in-app evaluation scoring) and DR-09 (second reviewer outside the three roles) added; in-app evaluation scoring registered in deferred-features.

## 2026-10-05 Coverage map popups
- Per product owner feedback, the overview now opens in a popup on the hovered dot (tap pins it and pans the dot into view on phones); the card and project-code list under the map are gone.
