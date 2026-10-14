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

## 2026-10-05 Demo seed slow-link transactions
- `stageTeam` and `asUser` interactive transactions use `slowLinkTx` (15 s wait, 60 s timeout) because Prisma's 5 s default timed out on a hosted devV2 seed over a slow link.
- Local rehearsal (runbook-defense-demo section 6) reseeded and passed all 23 verify checks.

## 2026-10-05 Dashboard Approve links reached Unauthorized
- The middleware kept its own display-only query key list, missing `budget ?expense`, `activity ?action`, `formEntry ?submissionId` and `indicatorLibrary ?project`, so the Project Manager Approve buttons redirected to `/unauthorized`.
- `displayQueryKeys` now lives in `route-access.ts` and both the middleware and `requireServerPage` use it; a frontend alias test covers all four keys.

## 2026-10-05 Dashboard project metrics use the cached summary read
- Manager dashboards fetched every project's overview metrics in a raw effect with no cache, so each remount refired up to 20 requests; they now use `useProjectOverviewMetricsRead` (30 s summary cache, identity scoped) through `useProjectMetrics`.
- Alert and recommendation 503s trace to per-row RLS scope checks (`human_rules_scope` via `eligibility_metadata_scope`, about 14,000 `p06_can` calls per alert list); a per-transaction memo cut a local alert list from 25.6 s to 0.63 s in a rolled-back trial, pending a migration decision.

## 2026-10-05 Clickable alert and recommendation cards
- Per product owner request, the Review plan and Review buttons are gone; each card in the Alerts and Recommendations queues is now one button that opens its record details.

## 2026-10-05 KPI overrun note removed
- Per product owner request, KPI and indicator progress above 100% now shows `100%` with no "over target" note; `formatCappedPercent` names an overrun only when a label is passed, so over budget and past schedule still alert.

## 2026-10-05 Budget alert labels and ledger filter line
- The project-level budget row has no activity code, so its alert and recommendation printed the placeholder (`Budget at 92% - -`, `Signal: - utilization`); they now name the row by its title.
- The budget recommendation card is clickable in place of its Review plan button, and a View expenses link now shows "Showing N of M expenses for <row>" above the ledger.

## 2026-10-05 SADDD closed-period notice
- SADDD withheld for an open or undated project now shows a neutral notice naming the end date and the reason (final counts of a closed period) instead of a red "SADDD analysis unavailable" error; real load failures keep the error state.

## 2026-10-05 Outcome picker uses the DSD select
- The alert and recommendation Outcome picker is the DSD `Select` (white trigger, Radix menu, "Choose an outcome" placeholder) in place of a native select; its test drives the repo's native Select mock.

## 2026-10-05 Linked recommendations named by title
- Alert details label each linked recommendation by its title ("Linked recommendation: Reschedule delayed activities") from one summary read filtered by alertId; the numbered label remains the fallback while loading or on failure.

## 2026-10-05 F12 designed PDF renderer
- F12 designed PDF: Puppeteer renderer module, print route and pdfkit fallback under cr-pathways-report-pdf-renderer; hosted Chromium verification pending.
- Ready fix: the print page now flags ready from the chart `onChartReady` trigger, and the empty state reports `data-report-ready="empty"` so the renderer falls back instead of storing a blank PDF.
- Final fix wave: 40 s render deadline, protocol timeout, shared browser discarded on failure, stage-tagged single fallback warning, one-group chart without Total rows.

## 2026-10-05 Alert metric units for display
- Alert cards and evidence tables show COUNT without a unit, PERCENT rounded to two decimals with `%`, and POINTS as `pts` through `formatMetricValue`; rule and indicator setup keep their unit selections.

## 2026-10-05 Outcome form actions
- Close now sits right aligned beside the primary action in both the outcome form and the confirm step; "Confirm and record outcome" is renamed "Record Outcome".

## 2026-10-05 Outcome recorded feedback
- A confirmed outcome registered (201, decision row, 6 notifications) but the form silently reopened, and the recorder is never a notification recipient; now a toast confirms "Outcome recorded: <outcome>. N recipients notified." (or the reviewed, resolved or dismissed action) and the form closes.

## 2026-10-05 Rules scope memo migration 0063
- `0063_rules_scope_memo` replaces `pathways_rules_internal.human_rules_scope` (still owned by `rules_eligibility_owner`, same EXECUTE ACL, asserted in the migration) with a plpgsql version that memoizes the per-project result in a transaction-local setting keyed by `app.user_id`; semantics are unchanged.
- It wires like 0062: hosted and forward preprovision/cleanup pairs for a temporary `rules_eligibility_owner` SET chain, plan, build, local-reset, Verify-Forward inventory and `rules-scope-memo-runtime.sql` (12 assertions: parity, actor change, forged slot, non-runtime session, transaction-local).

## 2026-10-06 Rule category and linked alert naming
- The rule drawer shows the derived Rule Category as text instead of a disabled select, since the rule contract stores no category.
- Recommendation details name the linked alert (title, severity, status, explanation and measured value) instead of a bare "View linked alert" link, and the raw `KPI` and `COMBINED` basis values read as indicator (KPI) results and project monitoring signals.

## 2026-10-06 Change password modal and profile action row
- My Profile Change password is now a button that opens a TOTP step-up modal, then a new-password step in the same dialog; the email or phone nonce step is hidden (tracked in deferred-features) and `reauthentication_needed` shows a sign-in-again message without the uncertain lock.
- Save profile and Reload profile share one row, Save left and Reload right.

## 2026-10-06 Proof file preview modal
- Budget receipt downloads (expense ledger and live finance workspace) now open `ProofPreviewDialog`, which fetches the blob through `fetchCoreArtifact`, previews it by its Content-Type (image, PDF, video, else an unavailable state), and downloads the same blob via `saveCoreArtifact` with no second request; the object URL is revoked on close.
- Private activity proof inspection (`private-proof-inspection.tsx`, `EvidenceDownloadControl`) is unchanged because its Change Record forbids inline preview; the receipt endpoint already returns `application/pdf`, `image/png` or `image/jpeg`.

## 2026-10-06 Proposed activity proof preview amendment
- `cr-pathways-private-activity-proof-inspection` section 6 proposes in-modal preview for the inspecting reviewer: the recorded content type is returned only for allow-listed, verified, signature-matching proof, and the client holds the bytes as a Blob only while the modal is open; awaiting developer approval.

## 2026-10-06 Activity proof in-modal preview implemented
- `cr-pathways-private-activity-proof-inspection` section 6 approved by the developer ("I approve"); implemented on feature/activity-proof-preview, verification pending.
- API: the inspection response carries the recorded type and matching extension only for an allow-listed, storage-ready type whose first streamed bytes pass `matchesEvidenceSignature`; otherwise `application/octet-stream` and `activity-proof.bin`. The service retains whole chunks of the released stream until at least 4112 bytes arrive (often one chunk) and re-emits them, and destroys the inner body if the returned stream is destroyed before its first read, so bounded counting, final digest withholding and destroy-on-error are unchanged.
- Web: both inspection call sites (`PrivateProofInspection`, `EvidenceDownloadControl`) now open `ProofPreviewDialog` on Preview and Download reuses the same Blob; the dialog renders only png, jpeg, webp, pdf, mp4, quicktime and webm.

## 2026-10-06 Defense seed snapshot
- `scripts/db/defense-snapshot.mjs` (mirror, dump, restore, storage) restores a locally seeded defense workspace onto devV2 in one transaction: wipe up to its revoke, migration and identity checks, `session_replication_role = replica`, staged load with the day shift, row-count check, commit, then a storage upsert (cr-pathways-defense-seed-snapshot).
- Restore runs as `postgres` (`HOSTED_ADMIN_URL`, session pooler) because `prisma` cannot set `session_replication_role`; RLS is bypassed by BYPASSRLS plus the wipe's temporary owner memberships, never disabled. The hosted password travels only as `PGPASSWORD`.
- Local rehearsal passed: 77 tables (8323 rows), exact +3-day shift, tampered identities rolled back, delta-0 restore and `--verify` clean; storage copy is hosted-only. Hosted restore pending (developer).

## 2026-10-06 Defense seed snapshot final fixes
- The restore now copies storage before any hosted database connection, prints a summary and refuses a date shift or warning without `--allow-shift`, adds `--dry-run` (ROLLBACK, no storage), explains psql exit codes 3 and 2, and `mirror` fails fast on a local versus devV2 migration mismatch.
- Pooler URLs must use port 5432, storage copy logs progress every 10 objects, and the runbook adds the `RULES_DISPATCH_ENABLED=true` step after `--verify`.
## 2026-10-05 Public landing redesign
- Public home (`/`) rebuilt as the PATHWAYS landing: hero with pathway card, challenge, operational pathway, privacy, capabilities, audiences, published projects, mission, share needs, partner, footer (`public-landing.tsx`).
- Site header restyled to the dark navy wordmark with Home, Projects, Organizations, About Us and a Share your needs link; survey, waitlist and contact CTAs point at in-page anchors (`landingLinks`) until real destinations exist.
- Revision: removed hero CTAs, the Help shape and Published projects sections, and the header Share your needs link; Our mission now follows The challenge.
- Header Organizations dropdown lists `publicOrganizations` (Plan International Pilipinas) linking to `/organizations/[slug]`, which lists all published snapshots because snapshots carry no organization field yet.
- Added `/about` (mission, who it is for, contact us); footer and partner CTAs point to `/about#contact`.
- Typography and copy pass: Momo Trust Display limited to headings and the wordmark, body text uses the UI font; gradients and glows added across sections; copy rewritten; about page gains Why PATHWAYS and principles; shared sections moved to `public-sections.tsx`, about page to `public-about.tsx`.
- Landing How it works is now a scroll-driven five-step journey (`public-journey.tsx`, content and illustrative mock screens in `public-journey-content.tsx`); hero pathway steps link into it; reduced motion respected; covered by `public-journey.test.tsx`.
- Journey moved into the hero as a compact card (`HeroJourney`): on wide screens the hero pins and scrolling advances the five steps, elsewhere steps are tapped; the separate How it works section was removed.
- Hero journey reworked from a card into a seamless vertical timeline: the active step expands with its description and mock screen, completed steps show a check, upcoming steps stay collapsed.
- Final UX pass: card layouts replaced with open layouts; dark and light surfaces melt through gradient blend bands, consecutive dark sections share one `DarkRun` surface; scroll reveals, clamped parallax glows, a word-by-word mission highlight, and a top progress bar (`public-motion.tsx`), all settling under reduced motion.
- Contact us gains a front-end-only form (`public-contact-form.tsx`, zod-validated, labelled as a preview that does not send or store messages); covered by `public-contact-form.test.tsx`.
- Dark-to-light transitions switched from gradient fades to hard-edged layered SVG waves (`Blend` in `public-sections.tsx`).
- Removed the Projects tab and footer link; the hero Published projects link now opens the organization page. The `/public/projects` route stays for detail breadcrumbs and the staff publication queue.
- Added `/organizations` (card list) and restyled `/organizations/[slug]` to the landing design (`public-organizations.tsx`); organization profiles live in `publicOrganizations`, with the Plan International Pilipinas summary paraphrased from its official site; header dropdown gains All organizations, footer gains Organizations.
- Organizations header item is now a link to `/organizations` that reveals the organization list on hover or keyboard focus (All organizations entry removed); the organizations page drops its section heading and the initials badge.
- Hero switched to a single column: intro copy stacks above the pathway timeline, which pins and advances on scroll on wide screens.
- Hero walkthrough restored to the original full layout under the intro: tall steps on a progress rail beside a sticky preview panel, with icons and key points.
- Home hero headline enlarged to match the About Us hero (text-7xl, roomier padding).
## 2026-10-05 Demo numbers reconciled with cohorts
- Defense seed cohorts now SSG 150, CRL 30, ALS 30, WSH 30, EHK 70 (ECD 0); people and household indicators, corrections, library readings and activity reach stay within each cohort, and targets sit just above it (SSG-GIRLS-ENR 108 of 120, EHK-FAMILIES 68 of 72, ALS-ENROLLED 30 of 30, CRL-HH-DIV 25 of 30).
- New guard tests in `local-demo-data.test.ts` keep every started project at 30 or more people and every people count within its cohort.
- CRL journey branches after COACHING into Wage employment and Enterprise start-up; the beneficiary journey track shows the sibling branch as "Not on path".
- Deferred: beneficiary-linked survey and pre/post imports, and an application write path for assessment results. devV2 wipe, reseed and --verify (DR-04) stay with the developer.

## 2026-10-06 Hosted defense reseed (DR-04)
- devV2 reseeded with the PR #43 reconciled numbers through the snapshot path: local seed and `--verify` 23 of 23, dump of 77 tables (12600 rows) and 75 storage objects at 0063, hosted `--dry-run` rolled back clean, storage copy completed on rerun after a transient Storage 504, database restore committed with delta 0.
- devV2 `--verify` passed 23 of 23, closing DR-04; `RULES_DISPATCH_ENABLED` is re-enabled by the developer after this run.
## 2026-10-06 Evaluation write path (feat/evaluation-write-path)
- Closes DR-08: [cr-pathways-evaluation-write-path](cr-pathways-evaluation-write-path.md) opens the evaluation write path the revised RBAC baseline left reserved. M&E Officer creates, edits and publishes criteria (sole hold of `evaluations.weights.configure`; System Administrator keeps `settings.configure` for the seed only) and scores and submits an evaluation; the Project Manager reviews and signs off in one action, or returns it for correction. Every role that already sees the Monitor & Evaluate tab keeps read-only access.
- Scoring: KPI, Timeline compliance, Budget efficiency and Beneficiary reach are computed from project data (new `EvaluationMetricsService`, reusing `kpiAchievement`/`budgetUtilization`/`efficiencyRatio`); Other (Relevance, Coherence, Sustainability) is always a manual score with a required note, same as a computed type the project's data cannot support.
- Migration `0064_evaluation_write_path`: RBAC grants/revoke above; `project_evaluation_criteria` INSERT also accepts `evaluations.weights.configure`; drops `p10_guard_evaluation_weight` (no longer needed once System Administrator loses the permission it gated); relaxes the `project_evaluations` CHECK so sign-off and review can be the same person (still distinct from the evaluator); adds a `SUBMITTED -> DRAFT` return transition; adds actor-binding RLS policies.
- API: new routes for criteria create/publish and evaluation create/score/submit/return/signoff; `GET` now returns every evaluation (capped 20) with its scores, not only the latest summary.
- Web: `live-evaluation-workspace.tsx` rebuilt with a publish action, an evaluations list, a start-evaluation form, a scoring table and submit/return/sign-off actions behind confirmation dialogs.
- Tests: API (2180 tests) and the touched web suites pass; `pnpm typecheck` and `biome check` clean on both apps. The migration itself has not been run against any database in this session (no database credentials available); a `.local.test.ts` runtime suite and a local apply plus `--verify` are the open item before this leaves the branch. Seed, devV2 and the 2026-10-06 reseed are untouched. (superseded by the later 2026-10-06 entry)

## 2026-10-06

- Evaluation write path verified locally: full MigrationBaseline replay 0000-0064 green with the evaluations runtime suite (8 cases) wired in, f10-f11 and 0063 suites pass, API and web typecheck, lint and tests pass, defense rehearsal 23/23. `finance-evaluation-decisions.sql` remains a stale Phase 3 suite (fails at fixtures on the rules source-proof trigger). CR approved by the developer; not applied to devV2.

## 2026-10-06 Evaluation write path final review fixes
- Migration 0064 (still unapplied) gains `return_reason` (returns no longer overwrite the evaluator narrative; approve-only, reason required, cleared on resubmission) and a stronger postcondition. Evaluation reads return an allowlisted criterion snapshot, per-score source and note, newest 20 plus `hasMore`; saves claim the draft with a guarded update and upsert, keep rows not resupplied and return structured per-criterion errors. Beneficiary reach is an enrolled count with small-cell suppression, Budget efficiency is not computable for roles without budget access, and the efficiency ratio is now scaled to a percent (1.00 = full score). The workspace prefills manual scores, shows the return reason, blocks submit with unsaved edits.
- Deferred (docs/deferred-features.md): closed-evaluation view, display labels, workspace split, criteria versioning, workspace UI tests. Full MigrationBaseline replay green (161 PASS, evaluations suite 8 passed); API 2222 and web 1821 tests pass.

## 2026-10-06 Analytics export preview and 503 diagnosis (fix/analytics-page)
- Export aggregates now opens a preview dialog (first 50 rows of the exact suppressed table, project, period, view) before Download; the new `GET /analytics/descriptive/export/preview` is audited as a view (source EXPORT_PREVIEW), not as an export.
- Analytics 503s keep their specific message (timeout, contract, file render fault) and log a non-sensitive cause; the web client shows 503 reasons instead of the generic text. No migration.

## 2026-10-06 Project status report (feature/project-status-report)
- Project summary becomes a one-page status report: project information, overview (Schedule, Budget, Indicators with ON TRACK, AT RISK, OFF TRACK or NOT AVAILABLE), key figures, milestones, indicators and open alerts. Spec: docs/superpowers/specs/2026-10-06-project-status-report-design.md; CR: [cr-pathways-project-status-report](cr-pathways-project-status-report.md).
- API: new `sections` on the report snapshot (fingerprint, generate re-check and designed PDF include it); flat columns and rows stay for pdfkit, CSV and XLSX. `ProjectOverviewMetricsService.readInTransaction` and `RulesHumanService.listAlertsInTransaction` expose the existing reads inside the report transaction. No migration, no new permission.
- Web: shared print look for all kinds, Project summary section components, `?sample=project` fixture, in-app preview uses the same component.

## 2026-10-06 Realistic demo journeys and directory progress
- Every enrollment now carries a record that matches its status: attendance through the published attendance form of each stage-mapped activity (submission, participation, staged journey event), then completion or dropout transitions, then pre and post tests that reference the attendance submission.
- SSG and ALS journeys branch: WEBINAR, then ENTREP or TECH (about 55 to 45), then a post-assessment step; each has a mapped activity and a published form. EHK gets stages and a kit distribution form. New stages `local-demo-stage-journeys.ts`, pure planner `local-demo-journeys.ts`, guard tests `local-demo-journeys.test.ts`.
- Seeded proof photos are AI-generated, non-identifiable illustrative photos (no real people) (`prisma/assets/demo-photos`) and the attendance sheet PDFs list the date, venue, facilitator and attendees.
- Beneficiary list API returns per row the latest participation and current stage (one query per page, journeys.read only, otherwise restricted); the directory shows "Restricted" instead of "No participation yet" when the caller cannot read journeys.
- Assessment results still use the owner path (no service writes them), now tied to a validated attendance submission of the same enrollment and activity.

## 2026-10-06 Fix round 1
- Journey records survive a stage retry (first-run event snapshot, stored sessions skipped, all projects settle before failing); directory progress follows the person's own path (branch counted once, terminal stage 100) and the current stage follows the detail page rule; activity reach comes from the seeded attendance.

## 2026-10-06 Zone check memo migration 0065
- [cr-pathways-zone-check-memo](cr-pathways-zone-check-memo.md): `0065_zone_check_memo` adds `p06_zone_is_valid`, which remembers a validated timezone per transaction, and `p06_assert_scope` and `p06_home_dashboard` use it instead of reading `pg_timezone_names` on every call (0.43 s each on devV2, which timed out the 3 s analytics reads). Owner, SECURITY DEFINER and ACLs are unchanged; hosted plan, Verify-Forward and the runtime suite register 0065.

## 2026-10-06 Rules sweep isolation fix and machine fault logging
- The hourly sweep failed on hosted with 42501 because `sweep_rule_projects()` requires read committed while `RulesMachineSqlClient.phase()` ran every CAPTURE phase under RepeatableRead; only drain snapshot capture (`capture_rule_snapshot` via `install_capture_context`) needs RepeatableRead, so the sweep now runs ReadCommitted with the unchanged CAPTURE budget. All other machine routines already ran ReadCommitted as their migrations require.
- `RulesMachineWorker.drain` and `sweep` now log one `PATHWAYS_RULES_MACHINE_FAILED` warning (purpose, failure kind, allowlisted error name, Prisma code and SQLSTATE; never messages or SQL) before the unchanged 503; `faultCause` moved to `prisma/transaction-diagnostic.ts` for reuse. No migration.

## 2026-10-06 Beneficiary assessment view
- [cr-pathways-beneficiary-assessment-view](cr-pathways-beneficiary-assessment-view.md): new enrollment-scoped assessment list read (same guards as the detail read) feeds the beneficiary detail page; "View assessment" now shows pre and post scores and the change for the selected stage. No migration.
- Assessment view fix round 1: list read also requires `beneficiaries.records.read` and a live Beneficiary; the page pairs pre and post across stages, explains a failed read, and guard tests now fail if the denied-role or button gates are removed.

## 2026-10-06 Fast runtime Vitest runner
- `Invoke-RuntimeVitest.ps1` runs one DB-backed `*.local.test.ts` against a copy of the saved replay template; both fast runners share `replay-template.ps1` for the freshness check; Fast Checks documented in `docs/runbook-local-dev.md`; CI cache deferred row added.

## 2026-10-06 Replay step timing
- `Replay-Local.ps1` prints `REPLAY_STEP <label> <seconds>s` per migration, SQL and Vitest step and writes `.tmp/replay-timing.json` (helper in `replay-timing.ps1`).

## 2026-10-06 Change records for the devV2 applies
- Applied: 0064 evaluation write path and 0065 zone check memo (about 11:30, ledger 40 rows), 0066 beneficiary reach and SADDD for ongoing projects (14:39, ledger 41 rows); `defense-demo --verify` 23 of 23 after each.
- CRs updated: evaluation write path, zone check memo, defense seed snapshot (second, realistic restore), beneficiary assessment view, project status report; new `cr-pathways-beneficiary-reach-kpi-values`.
- Rules dispatch: the drain is green after the developer set the `pathways_rules_worker` password; the sweep waits for production to run the isolation fix (PR #45).

## 2026-10-06 Demo indicators linked to activities
- Root cause: the demo seed created indicators and activities but never `activity_indicator_links`, so the Activities INDICATORS column (`indicatorCount` = link count) read 0 beside indicators with readings.
- Seed: each demo indicator now lists its producing `activityKeys`; the indicators stage writes the links on the runtime role (the table forces RLS); `--verify` checks that no seeded indicator with readings is unlinked.
- EHK numbers aligned: distribution reached 70 families, EHK-FAMILIES target 75 (project reach target) with readings 34 then 70; new EHK-KITS output indicator linked to procurement.
- Web: indicator progress percent rounds to one decimal (`formatCappedPercent`, `ProgressBar`).

## 2026-10-06 Demo data realism audit
- EHK budget rescaled to PHP 280,000 (96 percent spent, same ratio) so 70 kits and families cost realistic unit amounts; ALS budget rescaled to PHP 620,000 (80 percent).
- Expense dates now fall in the window of their activity (procurement, distribution, training), not the last two months; `--verify` checks expense dates against project and activity dates.
- Indicator readings aligned with notes and milestones (WSH schools 8, clubs 8, handover 50 percent; ALS module completion 72 percent); CRL reach target 45 matches enrollments.
- SSG cohort ages and sex mix suit a girls program; webinar targets cover their participants.
- Limitation: audit, alert, evidence and approval timestamps are stamped by the database at seed time and cannot be backdated through supported inputs.
## 2026-10-06 Beneficiary progress read (0067)
- Bug: the beneficiary list returned 503 after 12-24 s on hosted for M&E and Project Officers; the progress query ran per-enrollment laterals under RLS with per-row permission functions (local checks had run as postgres).
- Added `pathways.p05_beneficiary_progress` (migration 0067, change record `cr-pathways-beneficiary-progress-read`, Proposed): one scope check, then a set-based read; `loadProgress` now calls it. Local timing as the runtime role, 150 enrollments: old query 2.4-10.4 s, new 20-24 ms.
- Not applied to devV2; the controller owns the SAD review and the apply.
## 2026-10-06 Timeline final position (0068)
- Bug: Analytics timeline Elapsed, Remaining days and Overdue days read Not applicable for COMPLETED and ON_HOLD projects.
- `buildTimelineAnalytics` now reports a completed project's final position (100% elapsed, 0 remaining, overdue = days the last completed activity ended after the planned end; MISSING `NO_COMPLETION_DATE` or `NO_PROJECT_DATES`, never a fake 0) and computes ON_HOLD like ONGOING; CANCELLED and archived stay Not applicable. Rule-engine `timelineObservation` is unchanged.
- Migration 0068 is additive: new `p10_f9_timeline_last_completion(uuid,uuid)` returns the last completed activity date and the aggregate is untouched, because devV2 serves preview and production and the deployed strict aggregate schema would reject a new key (503) until both redeploy; computeTimeline calls it only for COMPLETED projects. Not applied to any shared database.
- Fixed SAD migration-integrity blockers for 0068: hosted-plan/hosted-build ledger now 0000-0068 (43 rows) with a 0068 deploy step and resume tests, legacy-retirement directory list, and f9 runtime SQL gained last-completion rejections, an archived completed fixture and a 54-assertion terminal check.

## 2026-10-06 Evaluation auto scoring (0069)
- Developer decision: the M&E Officer no longer sets up criteria, weights or scores. A fixed OECD-DAC template (Relevance 15 reach, Coherence 10 indicator linkage, Effectiveness 25 KPI, Efficiency 20 timeline, Impact 15 assessment gain, Sustainability 15 KPI) is provisioned and published on the first round, and every score is computed server-side on start, recompute and submit.
- A criterion without data scores 0 with a stored "No data: reason" (commentary column); rows carry source, evidence and reason in the API and a Source column in the UI and the evaluation report. Budget efficiency is dropped; old OTHER and budget rows in open rounds score 0 as "no longer scored automatically".
- Migration 0069 only adds INDICATOR_LINKAGE and ASSESSMENT_GAIN to criterion_type (dry run rolled back on local Postgres as prisma; not applied). Change record `cr-pathways-evaluation-auto-scoring` supersedes section 5 of `cr-pathways-evaluation-write-path`.
- Removed the criteria initialize, create, publish and weights routes, the manual score fields and the rubric UI; seeds start rounds through the service.
- 2026-10-06 Fixed SAD review blockers on evaluation auto-scoring (gain complement small-cell, reason wording, report Source cell, e2e spec, seed narrative, enum order).
- 2026-10-06 Fixed design-review blockers on evaluation auto-scoring (blank commentary is a manual score in workspace and report, e2e spec tolerates the seeded open round).
## 2026-10-06 Project frame, report parity, budget receipts, activity panel, M&E hints (feat/project-workspace-frame-ui)
- Project tabs share one frame: the tab routes move into a `(workspace)` route group (URLs unchanged, `edit` stays outside) whose `layout.tsx` renders `ProjectWorkspaceFrame` once. The frame reads the project through the existing `useProjectRead` key and draws the title with Back, Edit and Archive, then the tab strip; `ProjectWorkspaceHeader` keeps the description and tabs only. Indicators, Monitoring & Evaluation, Budget and Journey Stages had no tab strip at all, so their `BackButton` is gone. Overview returns, re-routing the orphaned `ProjectDetailView`.
- Report preview renders `PrintReportView`, the component the print page feeds to Chromium, so preview and export match for all six kinds instead of only Project summary. `generate` returns `pdfFallback` when Chromium failed and the stored PDF is the pdfkit layout; the workspace says so rather than reporting plain success. The flag describes that render, so a recovered report omits it.
- Expense ledger names Submitted, Verified, Approved and Signed off by (joined server side, display name only) and splits budget alignment into activity code and title, a readable budget line and its allocation. The Log expense dialog names the activity each budget line funds. No migration.
- New generated disbursement receipt: the Chromium pipeline moves into a shared `PrintPdfRenderer` (page path, injected global, size cap); `ReportPdfRenderer` becomes a wrapper and `ReceiptPdfRenderer` joins it. `GET finance/expenses/:id/official-receipt` (expenses.read, audited `EXPENSE_RECEIPT_GENERATED`) renders `/print/receipts/:id`. The document is titled a disbursement receipt and states it is an internal record, not a BIR official receipt. "Preview private receipt" still serves the uploaded proof. Expense line items do not exist in the schema, so the particulars table has one row; true itemisation needs a new table.
- Activity panel reorganized into sections (`activity-detail-sections.tsx`): action-needed banner, facts, progress with its system-calculated note, project team with each person's role, connected indicators as actual against target, activity budget with utilization. `evidence_media.rejectionReason` is now returned, so each proof file states Verified or Insufficient with the reviewer's reason, and a principal holding `evidence.read` opens the document through `downloadActivityProof` (already written, never wired). `useProjectIndicatorsRead` returns full rows; `getIndicators` was the same request projected, so no extra call.
- `constants/metric-glossary.ts` holds the plain-language wording once; `MetricTooltip` is attached to the Indicators and Monitoring & Evaluation labels, and criterion types no longer render as stored enum names.
- Web 1921 tests and API 2296 pass; typecheck and biome clean on both apps. The public tracker nav was reported but works as built, so it was left alone.

## 2026-10-06 Rule builder presented as a guided sequence (feat/project-workspace-frame-ui)
- `RuleDrawer` reflows into four numbered steps via a new `RuleStepCard`: name and scope (Basic Rule Information merged with Applies To), what are you watching (Condition Builder), how should this read (severity), and what should the system recommend. `ApplyToFields` and `ConditionBuilder` drop their own headings since the step cards carry them.
- `RuleOutputFields` splits into `SeverityField` and `RecommendationFields`. Severity is a radio tile group instead of a select, each tile stating the reading it carries, with Low describing progress or milestone insight so the builder is not framed as risk-only. No contract or schema change: severity stays `LOW..CRITICAL`.
- `RulePreview` keeps the exact `previewSentence` text and adds a rendered output preview below it: severity-tinted title, the condition summary, and the first recommendation. Presentation only, built from drawer state.
- Web typecheck and biome clean; 50 rules-board and rule-editor tests and the 33 UI copy contract tests pass.

## 2026-10-06 Rule creation moves in-page beside the repository (feat/project-workspace-frame-ui)
- `RulesBoard` wraps its body in two tabs: Rule repository (filters and both configuration cards, unchanged) and Create rule, which only renders for `rules.create`. Create Rule anywhere on the page switches tabs instead of opening the side panel; clicking an existing rule still opens the panel, so edit, test and lifecycle intents keep their current flow.
- `RuleDrawer` takes an `inline` prop. Inline it skips the Sheet and lays the steps beside a sticky `RulePreview` column; the footer switches to a horizontal row with Cancel. The panel presentation is untouched.
- Severity tiles map per level to the StatusBadge token vocabulary (Critical danger, High warning, Medium info, Low neutral) rather than reusing `severityTone`, which lumps High with Critical and would flatten the picker.
- Two board tests cover the tab: Create Rule activates the Create rule tab with the builder in page and no dialog, and the tab is absent without `rules.create`. Web typecheck and biome clean; 85 tests across rules-board, rule-editor and the UI copy contract pass.

## 2026-10-06 One budget reading across activity, budget and evidence (feat/project-workspace-frame-ui)
- The API had two definitions of an activity's allocation: the detail read counted only the `ACTIVITY_PROFILE_TOTAL` line, while the list read counted every budget record, and the finance ledger counted every record except the project envelope. An activity funded through a named category line therefore read as allocated P0.00 on the expense entry while the ledger showed it funded. `readMetrics` now sums every live (non-archived) line for the activity, which matches `readListMetrics` and `buildActivityRows`.
- Money still in review is summed on the web from the expenses the activities workspace already reads, not from a new API field: a second source for data the client already holds is the same duplication that caused the allocation drift.
- New `activityBudgetFigures` in `budget-math.ts` is the single reading of allocated, spent (approved only), in review, remaining and utilization. The activity panel shows all five; the ledger's budget alignment adds the activity totals beside the single line it previously showed alone; the Evidence tab's activity summary gains a Budget used column from the same list metric the activity table uses.
- Withheld and empty stay distinct: no budget access reads Unavailable, no approved entry reads None yet, and an allocation of zero leaves utilization not available rather than 0 percent.
- Tests: the shared helper is asserted to agree with `buildActivityRows` for the same activity; the API asserts allocation sums several lines and that the query carries no category filter; the ledger fixture now builds its rows through the real aggregation so it cannot drift. Web 216 files and API 122 files pass; typecheck and biome clean on both.

## 2026-10-06 Recommendation reuse and a readable save failure (feat/project-workspace-frame-ui)
- `RecommendationFields` collapses a completed recommendation to its title with Edit and Remove, and expands on Edit or while incomplete. A new rule opens on its first recommendation so the builder is never a wall of titles; a saved rule's recommendations start collapsed.
- The builder offers the recommendations already written on rules in the current scope under Reuse a saved recommendation. `RulesBoard` passes them from the list it already holds, so no extra read. A reused entry is copied under a fresh identity, keeping recommendation ids distinct per rule and leaving the source rule untouched.
- `RuleDrawer` now prefixes the save failure with the message the API returned. The generic fallback hid which check refused the write: authority (42501), typed request (22023) or version (40001) all read the same before.
- Two drawer tests added: a saved rule's recommendation collapses to its title until edited, and a reused recommendation is sent with a new id. Web typecheck and biome clean; 30 rules-board tests pass.

## 2026-10-06 One entry point for rule creation (feat/project-workspace-frame-ui)
- The four Create Rule buttons on the repository tab are gone; the Create rule tab is the single entry point. Each card keeps View All, and the empty state names the tab instead of repeating a button. Without `rules.create` the guidance line is omitted, matching the hidden tab.
- `open` no longer carries a create branch, since every remaining caller passes an existing rule.
- Board tests updated for the removal, plus a test that the empty state omits the guidance without `rules.create`. The tab test now drives Radix with mouse down, which is what activates a trigger.

## 2026-10-06 Logged expenses stay visible on the activity (feat/project-workspace-frame-ui)
- The activity panel listed expenses only while they were `PENDING` and only to a validator, so an officer never saw the expense they had just logged, and the entry disappeared from every panel the moment it was verified. Only approved money then reappeared, as budget used.
- New `ActivityExpenses` section lists every non-rejected expense on the activity with its review step (For review, Verified awaiting approval, Approved), its amount and who has acted so far. It is shown to any principal holding `expenses.read`, which is the same grant the budget ledger already requires, so no access widens.
- The validator's own "Submitted expenses for validation" action list is unchanged; the new list is read-only.

## 2026-10-06 Alert queue reads horizontally, details open on click (feat/project-workspace-frame-ui)
- The review workspace no longer splits into a narrow queue column and an always-open detail column. The queue is a single full-width stack of cards; a grid was tried first but reflowed badly when a card expanded.
- Selection no longer falls back to the first queue item, so the page opens on the queue alone. Clicking a card expands it in place: the card spans the grid and the record details render directly below its summary on the neutral card surface, not on the red alert surface. Clicking the open card closes it again.
- A deep link `?alert=<id>` to a record outside the current queue page still renders the details in a standalone card below the queue, since there is no card to expand.
- Card hierarchy reordered: severity and status badges first, then the title, then the project, then the measured value against its threshold. The long explanation moved out of the card and stays in the details.
- Presentation only; no query, permission or data change.

## 2026-10-06 Save outcome toast, and the organization-template create defect (feat/project-workspace-frame-ui)
- `RuleDrawer.onSaved` carries the outcome (created, drafted, activated, deactivated) so the board raises an accurate toast rather than one message for every write; `run` takes the outcome alongside its failure copy.
- Diagnosed the save refusal reported from the Create rule tab. `pathways_rules_internal.configuration_operation` assigns the `admitted` record only when a project scope is present, then references `admitted.admitted_generation` and `admitted.admitted_watermark` inside a CASE on the `configuration_context` INSERT. PL/pgSQL binds those record fields before the CASE chooses a branch, so an organization-template write raises 55000 `record "admitted" is not assigned yet`. The handler maps 55000 to 42501, which the API returns as 403 with the authority message, hiding the real cause.
- Verified on the local database as `pathways_runtime` with a system administrator context: RULE_CREATE with `projectId` succeeds, the same call without it fails. Both probes ran inside a rolled-back transaction; no rows were written.
- Not fixed here: the repair is a migration over 0031 and belongs in its own change, so organization templates stay unavailable until then. Project-scoped rules are unaffected.
- Alert cards take their surface, border, icon and title colour from the severity tone the badge already uses: danger for High and Critical, warning for Medium, neutral for Low. Recommendation cards stay on the warning tone. The tone classes are a lookup map, since Tailwind needs whole class names.
- A sort icon-button beside the project filter orders the loaded alerts most severe first and toggles back to queue order. It reorders the page already fetched; the queue query is unchanged.
- The in-page Notifications toggle is removed from the alerts toolbar; delivery is not wired up yet, so the button only opened an empty panel. The panel, its query and `NotificationRow` stay in place behind `showNotifications`, which nothing sets, so restoring the control is one button. The two tests that drove the panel through that button collapse into one asserting the queue loads no notifications and the button is absent.

## 2026-10-06 Expense visibility reaches the approver (feat/project-workspace-frame-ui)
- `canReadExpenses` on the activities workspace was `(Project Officer || M&E Officer) && expenses.read`, so a Project Manager holding the grant, and holding `expenses.approve`, saw no expenses on the activity panel at all. It is now any in-scope principal holding `expenses.read`.
- The expense-to-activity linkage came only from `p34_expense_budget_references`, which needs `expenses.submit`. An approver reaches the same linkage through the `budgets.read` records instead; the workspace merges whichever reads the principal is allowed.
- `refreshExpenses` now also refetches the activity read. Approved spend and allocation come from there, so without it an approved expense left "In review" before it reached "Spent".
- Gates stay permission-based, not person-based: every Project Officer, M&E Officer and Project Manager with the same grants and project scope sees the same thing.
- 2026-10-06 Merged Mika PR #46 into dev with evaluation auto scoring: the evaluation workspace keeps the automatic-evaluation UI with the PR note and score-table tooltips, and the glossary gains Indicator linkage and Assessment gain.

## 2026-10-06 Report kind gating and download names (fix/beneficiary-report-kind-gating)
- The reports workspace offered Beneficiary summary on `reports.beneficiary.read` alone, while the API preview also needs `analytics.saddd.read` and `beneficiaries.aggregates.read`; Project Officers lack the first under RBAC v4, so they always hit a 403. `kinds[].requires` is now a list and the beneficiary kind requires both aggregate grants.
- Report downloads are named after the saved report name instead of `report-<id>`, with reserved file-system characters replaced and the id name kept as the fallback.
- The "plain layout" PDF warning locally is configuration, not code: `apps/api/.env` sets neither `PDF_CHROME_PATH` nor `WEB_ORIGIN`, so the designed renderer refuses to launch on Windows and every PDF falls back to pdfkit.
- Project summary reports now leave out what the actor has no grant for: no "not included: access is required" reasons, no Budget, Indicators or Schedule overview row outside scope, and the status rules footer lists only the areas shown. Data-driven reasons (missing project dates, row caps) and "Fewer than 5" suppression stay. Summaries saved earlier by partially scoped users now read as stale on download and need regenerating.
- Percent overrun labels ("(5% over budget)", "(3% past schedule)") render as a small muted note beside the capped value through `CappedPercent`; `formatCappedPercent` keeps the plain string for CSV and accessible text.

## 2026-10-06 Expense dialog uses the DSD select (fix/expense-dialog-dsd-select)
- The Log expense budget allocation picker moves from a native select to `ui/select`, matching the DSD rule that selects use `ui/select`, and shows the activity envelope as "Activity budget" through `categoryLabel` instead of `ACTIVITY_PROFILE_TOTAL`.

## 2026-10-06 Designed PDF finds a local browser (fix/pdf-browser-autodetect)
- Local Windows and macOS runs fell back to the plain pdfkit layout unless each developer set `PDF_CHROME_PATH`. With it blank, the renderer now launches the first standard Chrome or Edge install (Program Files, Program Files (x86), LocalAppData on Windows; /Applications on macOS). An explicit `PDF_CHROME_PATH` still wins, so the kill switch is unchanged, and Linux keeps the bundled Chromium.
- Verified with `scripts/check-pdf-renderer.ts` and `PDF_CHROME_PATH` blank: report and receipt both render through Chrome. `WEB_ORIGIN` stays blank locally; the renderer already navigates to the loopback web app outside production.

## 2026-10-06 Report downloads accept readable names (fix/report-download-name)
- Saved report downloads failed with "Current artifact access is required." because `fetchCoreArtifact` still only accepted `[a-z0-9-]` file names, while the reports workspace now names downloads after the report (spaces, capitals, en dashes). The guard now allows readable names up to 200 characters and still rejects control, path and reserved characters, a leading dot, and unlisted extensions before any request.

## 2026-10-07 Hide Add to Dashboard and the page-heading pencil (fix/hide-add-to-dashboard)
- Analytics "Add to Dashboard" and the role dashboard "Monitoring charts" section are hidden for all users behind `DASHBOARD_PINS_UI_ENABLED = false`; pins already in browser storage stay untouched.
- The disabled page-heading pencil is hidden for every role behind `PAGE_HEADING_EDITOR_UI_ENABLED = false`; other pencil edit buttons (project team, budget, activity) are unaffected. Both are registered in docs/deferred-features.md.

## 2026-10-07 Dynamic project report template (docs only)
- Drafted [dynamic project report template design](superpowers/specs/2026-10-07-dynamic-project-report-template-design.md): one template with five presets (Midterm, Evidence, Quarterly, Final, Donor brief), per-section toggles, period and filters, four block types (Fixed, Auto, Narrative, Conditional) and per-format behaviour for PDF, DOCX, XLSX and CSV.
- Today's builder offers only project, kind and format; filters, section toggles, narratives and DOCX are target state and need a CR, a narrative migration and a DOCX writer decision before build.
- Added docs/project-report-template.xlsx: the report template as a workbook (Cover, About, Contents with preset-driven Include and Check columns, one sheet per section and annex, Sign-off, Guide). Yellow cells are editable, blue cells are system data (fictional sample), and the rest are formulas; 189 formulas recalculated in Excel with zero errors.

## 2026-10-07 Evaluation report rounds (feature/evaluation-report-rounds)
- The Evaluation report always used the latest signed-off round, and once a newer round was signed off every older saved evaluation report failed its download re-check as stale. Reports now take an optional `evaluationId` (Evaluation report only), served from the new `GET /projects/:projectId/reports/evaluation-rounds` (signed-off and archived rounds, newest first, allowlisted fields), and downloads re-check a saved report against its stored `reports.evaluation_id`. No migration.
- The Reports page shows a Round select for Evaluation report (default newest), names the report after the round, and labels each saved evaluation report with its round.

## 2026-10-07 Enrollment date uses the business date (fix/enrollment-business-date)
- Registering a beneficiary between midnight and 08:00 Manila failed with "enrollment_date cannot be future." because the check compared the business-date enrollment against the UTC clock. Registration and project enrollment now compare against the business date (`BUSINESS_TIME_ZONE`), as the birth-date checks already did.

## 2026-10-07 Project preview tiles (fix/overview-metrics-layout)
- Project preview and Quick Preview leave out Budget utilization when the role cannot read the budget (instead of "Unavailable"), place Beneficiaries reached / target beside KPI achievement, and show Timeline as a full-width progress bar. The Overview hides "Planned project budget" when none is recorded.

## 2026-10-07 Activity proof download restored (fix/activity-proof-download)
- Previewing a proof from the activity panel reloaded the page: the panel called the generic proof download that eef96516 had withdrawn (always 403), and every 403 re-verifies all authorized reads. The download is restored for `evidence.read` holders with project/org scope, a SHA-256 integrity check and no-store/nosniff headers; recorded as an amendment in cr-pathways-private-activity-proof-inspection.

## 2026-10-07 Activity budget lines name their activity (fix/activity-budget-line-name)
- The activity panel listed pending expenses by the raw `ACTIVITY_PROFILE_TOTAL` code and logged expenses as "Activity budget". `categoryLabel` now takes the activity title, so the panel and the budget ledger read "Activity budget: <activity title>", matching the finance workspace.

## 2026-10-07 Unreadable KPI and reach tiles hidden (fix/hide-unreadable-metric-tiles)
- Project preview and Quick Preview leave out KPI achievement and Beneficiaries reached when the role cannot read them (Project Officers lack `monitoring.read` and `analytics.saddd.read`), like Budget utilization; Timeline always shows.

## 2026-10-07 Activity budget hidden without budget access (fix/hide-activity-budget-without-access)
- The activity panel's Activity budget section (Allocated, Spent, Remaining) showed "Unavailable" to roles without `budgets.read`, such as Project Officers. It is now left out for them.
## 2026-10-07 Maps and Backup & Recovery hidden (fix/hide-backup-and-maps)
- The Analytics "Map" visualization is hidden for every role behind `MAPS_UI_ENABLED = false`, and Backup & Recovery is hidden behind `BACKUP_RECOVERY_UI_ENABLED = false` (sidebar entry removed, `/settings/backups` returns not found). Both are registered in docs/deferred-features.md.

## 2026-10-07 Target Indicators tab layout (fix/indicators-tab-layout)
- The project Target Indicators tab drops its intro note, hides "Use from library" and the Indicator library link behind `INDICATOR_LIBRARY_UI_ENABLED = false`, and moves Refresh indicators and Add project indicator into the Indicators card heading, right aligned. The card now also holds the loading, error and empty states, so Add stays reachable with no indicators.

## 2026-10-07 System Administrator dashboard cards hidden (fix/admin-dashboard-cards)
- The System Administrator dashboard no longer shows the Active budget alerts and Overdue activities cards or the Project monitoring card, behind `ADMIN_DASHBOARD_MONITORING_UI_ENABLED = false`; their requests are skipped too.

## 2026-10-07 Analytics filter layout and SADDD for Project Officers (fix/analytics-filter-layout)
- The Analysis and visualization card moves Export aggregates (and Add to Dashboard, while hidden) into its heading, right aligned, so the fields form one even grid for every role: Project filter, Reporting period and Analysis view, then Indicator and Visualization type.
- Roles without `analytics.saddd.read` (Project Officers) get no SADDD Analysis card and no SADDD request instead of "Required application permission is missing."

## 2026-10-07 Hosted PDF report diagnostics (fix/report-artifact-diagnostics)
- PDF reports failed on the Vercel preview with 503 while CSV worked; no designed-PDF warning was logged, so the pdfkit fallback is the suspect (its font is read from disk next to the compiled module, and the Vercel NestJS preset builds without `nest build`, which copies `modules/reports/assets`). pdfkit now also looks for the font under the working directory, and a generation failure logs only the error name and system code.

## 2026-10-07 Step-up Reset button hidden (fix/hide-step-up-reset)
- The beneficiary access verification dialog hides its Reset button behind `STEP_UP_RESET_UI_ENABLED = false`; registered in docs/deferred-features.md.

## 2026-10-07 PDF reports on Vercel (fix/pdfkit-default-font)
- Root cause of the preview 503: `new PDFDocument()` loads pdfkit's default Helvetica through `createRequire(...)('#standard-fonts/Helvetica')`, which Vercel's file tracing does not bundle, so every pdfkit PDF threw MODULE_NOT_FOUND. Documents now start on the bundled NotoSans font, so the standard fonts are never loaded. Reproduced against the compiled CommonJS build with the standard fonts blocked: before the fix MODULE_NOT_FOUND, after it a valid PDF.

## 2026-10-07 Budget section in the Project summary report (feat/report-budget-section)
- The Project summary report gains a Budget section for actors holding both `budgets.read` and `expenses.read` (Project Managers among them): each active budget line, activity lines named by their activity, with planned amount, approved spending, spending in review (pending or verified) and remaining (planned minus approved). Rejected expenses are left out, at most 50 lines are shown, and the section appears in the designed PDF, the pdfkit PDF, CSV and XLSX. No migration; no new report type.

## 2026-10-08 Readable analytics chart labels (dev)
- Analytics charts wrap long indicator names on the descriptive bar chart and Indicator progress chart, center the "% of target" axis name, round bar labels to one decimal, and grow the progress chart height with row count.

## 2026-10-08 Dead-code removal (chore/dead-code-removal)
- Removed unreachable code across the repo: 202 files changed, about 7100 lines deleted, covering 28 deleted files (19 in apps/web, 7 in infra/supabase, 1 in apps/api, 1 root Playwright config) plus unused exports, types and test cases in apps/api, apps/web and packages.
- Removed the unused `cmdk` and `@sentry/nextjs` dependencies from apps/web and refreshed `pnpm-lock.yaml`; no source, config or convention file loaded either.
- Dropped the duplicate `projectIndicatorSchema` alias in favor of `monitoringIndicatorSchema` and the test that asserted they were identical.
- Removed the "Old rule configuration workspace" row and two deleted paths from `docs/deferred-features.md`.
- Kept `pino-pretty` (loaded by name as a pino transport in `apps/api/src/app.module.ts`), root `husky` (run through `scripts/setup-husky.mjs`) and `@pathways/ui` (listed in `transpilePackages`, tsconfig paths and the Vitest alias).
- Kept hidden and deferred features, sha256-pinned infra files, scripts named by docs, the DSD primitives in `components/ui` (button, select, table), seed data in `apps/api/prisma/local-demo-data.ts`, the NestJS `Roles` decorator, `FeatureDirectory` (string-built e2e import), the declaration-emit types `AutomaticMappingReceipt` and `GroupEvidence`, and `apps/api/scripts/check-pdf-renderer.ts` (manual diagnostic).
- Verification: `pnpm typecheck` clean, `pnpm test` passed (shared 108, imports 91, config 19, api 2358, web 1969), `pnpm --filter @pathways/web build` succeeded, and `pnpm lint` flags only untracked scratch JSON under `.superpowers/`.
- Removed the historical root `design-qa.md` (2026-09-08 staff-shell QA for a since-removed prototype mode) and its references in `DESIGN.md`, `docs/dsd-pathways.md` and the `docs/index.md` registry.
- Removed 19 executed or abandoned design specs and plans under `docs/superpowers/`, their `docs/index.md` rows, and their citations in six Change Records and the extension-requests handoff; the decisions they recorded stay in the Change Records and this log.
- Removed three Change Records (`cr-pathways-sad-orchestration`, `cr-pathways-doc-reconciliation-2026-10-01`, `cr-pathways-figma-reference-integration`) with their `docs/index.md` rows and live citations, moved the old-to-new SAD section map into `docs/sad-pathways.md` section 6, and corrected 14 stale Change Record status lines (and matching index rows) whose implementation is present in the repository.
- Rewrote `README-setup.md` for the current workflow (local stack through `pnpm dev:local`, hosted development through `pnpm dev`, real ports and Swagger gating), refreshed the `README.md` stack table and quick start, and re-materialized `BRAND.md` and `DESIGN.md`, which had drifted behind `docs/dsd-pathways.md`.
- Removed the finished defense-sprint `CRISIS_PLAN.md` and the demo workbook `docs/project-report-template.xlsx`.
- Removed `docs/ui-ux-pathways-reference/` (the brand, color and UI foundation sources and images the DSD transcribed); `docs/dsd-pathways.md` is the sole design authority, and `BRAND.md` and `DESIGN.md` were re-materialized.

## 2026-10-09 Codebase modularization design (docs/codebase-modularization)
- Read-only audit of the repository recorded in audit-pathways-codebase-modularity-20261009 (MOD-01 to MOD-21 plus two out-of-scope behavior findings, MOD-B1 age filter drift and MOD-B2 middleware matcher).
- Design recorded in cr-pathways-codebase-modularization (Approved 2026-10-09): layout conventions, dependency direction, zod contracts in packages/shared, and a 13 sub-project roadmap under full release gates. No code changed.

## 2026-10-09 Modularization F1 dead code and hygiene (refactor/f1-dead-code)
- Ignored `.worktrees`, `.superpowers` and Supabase scratch folders in git and biome; deleted the root `Dockerfile` and `tsconfig.json`; the RFC hosting reference now points at `apps/api/Dockerfile`.
- Deleted `packages/ui` and its 7 wiring lines (web `package.json`, `next.config`, vitest alias, two tsconfig path pairs) and the lockfile entry.
- Removed `RolesGuard`, `@Roles` and `ROLES_KEY` (no uses, global guard always passed) and the shared `AppRole`, `APP_ROLES`, health schema, `PlaceholderModuleState` and `AppUserProfile`; SDD 2.3 now names `SupabaseAuthGuard` as the `@RequirePermission` enforcer. Tests: api 2356, shared 107.
- Added `app-module-wiring.test.ts` (fails on a provider class registered in two modules); `RulesHumanService` and `ProjectOverviewMetricsService` now have one owning module each and a redundant `StorageModule` import was dropped. Tests: api 2357.
- Removed 28 dead pathways client methods (14 throw-only stubs, 8 uncalled, 6 test-only) and 16 dead types; kept the `not_configured` error code because `requestFoundation` still throws it. Tests: web 1962.
- Removed `live-finance-workspace`, `budget-editor-dialog`, `finance-budget-summary` and `budget-form-validation` with their tests. Tests: web 1940.
- Deleted `lib/demo-state` and `mocks`, moved 7 live fixtures to `apps/web/src/test/fixtures`, and removed 25 unused fixture types and 9 dead types in `types/pathways.ts`. Tests: web 1901.
- Deleted 99 historical infra files (phase5, phase7, pre-supporting, rule-based-access-alignment, session-liveness, migration-reconciliation except `baseline-data-inventory.sql`, 23 security-adapter deployment and recovery files, 4 phase6 rehearsal files) and `session-liveness-local.mjs`, about 20.4k lines; updated the phase6 and security-adapter READMEs.
- `rules:dispatch` now passes `--tsconfig apps/api/tsconfig.json` so tsx resolves workspace packages from source after the root tsconfig.json removal.
- Deferred: source-mutation proof options (S2), `mapPublicSnapshot` (S8), `ImportSummary` move (F2), infra Pester and runtime-output tests (W1).
- Gates: lint, typecheck, tests and builds pass; `Replay-Local.ps1 -MigrationBaseline` 0 FAIL; demo seed and `dev:local` boot clean; e2e auth-navigation 27/27; e2e main 39 pass, 9 fail, 22 not run, the same 9 failing on dev `8e9f1274` (MFA Verify helper, password-login harness, workflows seed end date before start); SAD sign-off 154/154 PASS at `13c6f174`. Merged to local dev as `5de68b0a`; plan removed.

## 2026-10-09 Modularization F2 shared core (refactor/f2-shared-core)
- Hygiene: moved `ImportSummary` to `packages/imports`; shared 107, imports 91 (unchanged baseline).
- Policy move: `authorization-policy.ts` and its test moved to `packages/shared/src/rbac`; 77 importers repointed to `@pathways/shared`, 18 imports merged, Edge middleware chain and role-routes e2e spec included; shared 117, api 2347 passed 21 skipped, web 1901.
- Role catalog: one catalog in `rbac/role-catalog.ts`; removed the web `canonicalRoles`, `roleCodeByName`, `roleCodesByName`, two identity label maps and the fixture role list; shared 119.
- Rules move: `rule-contract`, `rule-metrics` and `rules-human-contract` moved to `packages/shared/src/rules`; shared 165, api 2305, web 1897.
- Web rules merge: the shared rules are the union of the api and web copies, a parity test (42 cases) ran before the web copies were deleted, the timeline contract test moved beside the rule engine, and web source no longer imports api source; shared 165, api 2307, web 1895.
- Shared constants: step-up denial code, PIN rule, message and check, direct-entry form types, overdue explanation categories and report kind codes are shared; shared 168, api 2307, web 1895, web Middleware 108 kB (was 102 kB).
- SAD routing: `packages/shared/src/rules/**` routes to the determinism checker and `packages/shared/src/rbac/**/*.ts` to the organization isolation checker, with tests; living doc paths and the local-dev API bullet updated.
- Deferred: the api to web `route-access` import (`route-access.service.ts`, `dashboard-home-authorization-parity.test.ts`) to F4; the literal NUL key separator in `rule-output-fields.tsx` to S7; remaining near-duplicate code lists (seed literal unions in `local-demo-data.ts` and `local-demo-stage-reports.ts` to W1; api `descriptive-analytics.ts`, `form-templates.ts`, `metadata.dto.ts`; web `human-review-workspace` `SEVERITY_RANK`, `form-builder-session-draft.ts`) to their slices.
- F2 decisions are recorded in the change record section 9.
- Gates: lint, typecheck and builds pass; tests config 19, shared 170, imports 91, api 2307 (21 skipped), web 1895, the Task 0 baseline plus 7 intended tests; `Replay-Local.ps1 -MigrationBaseline` 0 FAIL; demo seed (second run; the first hit post-replay timeouts) and compiled API boot clean; e2e auth-navigation 27/27; e2e main 39 pass with the same 9 failures as dev; web middleware 112 kB (was 102 kB); SAD sign-off 223/223 PASS at `607ececa`. Merged to local dev as `b6945ad1`; plan removed.

## 2026-10-09 Modularization F3a api kernel (refactor/f3a-api-core)
- Task 1 (888b88c3): `Tx` in `common/prisma/transaction.ts` replaced 15 local aliases; `currentBusinessDate` in `common/time` replaced four 503 copies, with a characterization test for the 503; api 2310.
- Task 2 (9c4217fe, 87885f41): identity types moved to `common/authz/application-identity.ts`, `projectScope` to `common/authz/project-scope.ts`, bootstrap constants to `modules/auth/developer-bootstrap-identity.ts`; api 2310.
- Task 3 (25b36939): `requireScopedProject` and `requireScopedProjectRow` replaced 12 copies, `projectDateFields` in `scoped-project.ts`; api 2319.
- Task 4 (cf71f46f): `writeAuditLog` replaced 66 writes in 22 files, 3 private `audit()` helpers removed, 9 call sites inlined; api 2322.
- Task 5 (637b5193, 87fb4a7e): `SupabaseAuthGuard` moved to `modules/auth/guards`, `common/import-boundary.test.ts` added; api 2324.
- Other packages unchanged: config 19, shared 170, imports 91, web 1895.
- F3a decisions (rulings 2, 4, 5 and 6) are recorded in the change record section 9, because the plan file is removed after merge.
- Deferred to F3b: zod pipe and first contract, contract naming convention, `"sideEffects": false` for `packages/shared`, `withAuthorizedOperation` in `common/authz`, storage factory injection, wiring test for object providers.
- Gates: lint, typecheck and builds pass; tests config 19, shared 170, imports 91, api 2324 (21 skipped; the baseline plus 17 intended tests), web 1895, sad 49; `Replay-Local.ps1 -MigrationBaseline` 0 FAIL; demo seed first run and compiled API boot clean; e2e auth-navigation 27/27; e2e main 39 pass with the same 9 failures as dev; web middleware 112 kB; SAD sign-off 273/273 PASS at `42b52932`. Merged to local dev as `2391ca44`.

## 2026-10-10 Modularization F3b api validation and wiring (refactor/f3b-validation-wiring)
- Task 1 (101a7caa): `ZodPipe` added in `common/validation/zod-pipe.ts` with 400 bodies shaped like the global pipe; api 2329.
- Task 2 (f0ff6330, a5076bd0): `validateImportRequest` contract added in `packages/shared/src/contracts/imports`, the validate route switched to `ZodPipe` after a parity test, `ValidateImportDto` deleted; api 2334, shared 176.
- Task 3 (e69881bf): `packages/shared/package.json` declares `"sideEffects": false`; web Middleware went from 112 kB to 102 kB.
- Task 4 (eb2bedf5, 0f4ec789): `readApplicationProfile`, then `withAuthorizedOperation` with its timing module and test, moved to `common/authz`; 87 files repointed and 55 test mocks moved with their import; api 2334.
- Task 5 (5dc1d74d): `app-module-wiring.test.ts` keys providers by token and exempts the `APP_*` enhancer tokens; api 2335.
- Task 6 (e9fd63a0): `PRIVATE_STORAGE_FACTORIES` provided by `StorageModule` and injected into five services at 29 construction sites, with a finance factory-fault test; api 2337.
- Other packages unchanged: config 19, imports 91, web 1895.
- F3b decisions are recorded in the change record section 9, because the plan file is removed after merge.
- Deferred: the three `importOriginal` private-inspection-reader mocks to S2; other routes' class-validator DTOs to their slices.
- Gates: lint, typecheck and builds pass; tests config 19, shared 178, imports 91, api 2337 (21 skipped), web 1895, sad 50; `Replay-Local.ps1 -MigrationBaseline` 0 FAIL; demo seed first run and compiled API boot clean, with `ZodPipe` wired on the validate route and an `Object` body design type; e2e auth-navigation 27/27; e2e main 39 pass with the same 9 failures as dev; web middleware 102 kB; SAD sign-off 182/182 PASS at `c07ab1c0`. Merged to local dev as `40d47963`; plan removed.

## 2026-10-10 Modularization F4a web boundaries (refactor/f4a-web-boundaries)
- Task 1 (b5f48b2a): route policy moved from `apps/web/src/lib/rbac/route-access.ts` into `packages/shared/src/rbac/route-policy.ts`; api imports `@pathways/shared` instead of web, with an api to web case in `common/import-boundary.test.ts`; shared 183, api 2339.
- Task 2 (5db064b9): `lib/rbac` split into `policy`, `routes`, `nav` and `transport` (54 importers repointed); web 1895.
- Task 3 (9d01d3d0): six auth platform modules (`auth-access`, `mfa-flow`, `password-recovery`, `verification-flight`, `workspace-access`, `workspace-verification`) plus their tests and fixtures (16 files) moved from `features/auth` to `lib/auth` (42 specifiers in 31 files); web 1895.
- Task 4 (d1520d4f): web import-direction and shared package boundary tests added; the own profile response schema moved into its client; web 1897, shared 185.
- Task 5 (0a74066d): `usePermission` and `permissionChecker` replace six local permission wrappers; web 1899.
- Task 6: SAD organization isolation routing covers web `lib/auth`, `lib/rbac` and both middleware files; change record, audit, living docs and index updated.
- Middleware stayed at 102 kB at Tasks 1 to 3. Other packages unchanged: config 19, imports 91.
- F4a decisions are recorded in the change record section 9, because the plan file stays until F4b is planned (it holds the F4b outline).
- Deferred to F4b: `lib/api/core` with the owned-read helper, `lib/format`, the shared table head and dialog check, thinner providers.
- Gates: lint, typecheck and builds pass; tests config 19, shared 186, imports 91, api 2339 (21 skipped), web 1899, sad 51; `Replay-Local.ps1 -MigrationBaseline` 171 PASS, 0 FAIL; demo seed exit 0 on the fifth run (earlier runs hit P2028 timeouts under machine load or lost Docker mid-run); e2e auth-navigation 27/27; e2e main 39 pass with the same 9 failures as dev; web middleware 102 kB; SAD sign-off 181/181 PASS at `a101ad7c`. Merged to local dev as `7d866db2`; plan kept for F4b.

## 2026-10-10 Modularization F4b web helpers (refactor/f4b-web-helpers)
- Task 1 (10dbb82c, fe5c6d74): `lib/percent.ts` moved to `lib/format/percent.ts` with its importers; `lib/format/plural.ts` and `lib/format/tone.ts` added and the local copies replaced; web 1900.
- Task 2 (b8d41836): `lib/format/date.ts` added (`formatCalendarDay`, `formatDateOrUnavailable`) and five local `formatDate` copies replaced; web 1908.
- Task 3 (dec7c6f4): `stickyTableHeadClass` added in `components/pathways/sticky-table-head.ts` and four identical header constants replaced; web 1911.
- Task 4 (ddfe80f9): `PathwaysClientError`, `requestFoundationResponse` and `requestFoundation` moved to `lib/api/core/request.ts` (37 importers, 24 test mocks) and the source ticket subscription moved to `source-mutation.ts`; web 1913.
- Task 5 (4a5a79d1): `captureRequestOwner` added in `lib/api/core/request-owner.ts` and used at three owner capture sites; web 1919.
- Task 6 (d99d2410, 0ec26164): `useAuthorizedRead` moved to `hooks/use-authorized-read.ts` (27 importers, 12 test mocks) and the role provider's workspace cookie read and write moved to `lib/auth/workspace-access.ts`; web 1921.
- Middleware: web Middleware stayed at 102 kB.
- Dialog check: no raw `DialogContent` renders the same markup as `DialogShell` or `ConfirmationDialog`, so nothing was consolidated.
- Task 7: SAD beneficiary privacy routing covers `apps/web/src/lib/api/**/*.ts`; sad 52.
- F4b decisions are recorded in the change record section 9, because the plan file is removed after merge.
- Deferred: `lib/services/*` rename to `lib/api/<domain>` and duplicated read resource keys (slices); other date and tone helpers and `DashboardSeverity` (S7); the two non-sticky header classes (S5); raw dialogs onto shared dialogs (slices); the three workspace cookie reads (S8).
- Gates: lint, typecheck and builds pass; tests config 19, shared 186, imports 91, api 2339 (21 skipped), web 1921, sad 52; `Replay-Local.ps1 -MigrationBaseline` 171 PASS, 0 FAIL; demo seed exit 0 on the first run; compiled API boot and health ok; e2e auth-navigation 27/27; e2e main 39 pass with the same 9 failures as dev; web middleware 102 kB; SAD sign-off 162/162 PASS at `e0d8ab4e`. Merged to local dev as `418ebc08`; plan removed.

## 2026-10-12 Modularization S1a projects core (refactor/s1a-projects-core)
- Task 1 (0034b8b0): `contracts/common/field-schemas.ts` added with a class-validator parity test over 56 strings; shared 205, api 2396.
- Task 2 (adcdf437): `createProjectRequest` and `updateProjectRequest` contracts added with a DTO parity test; shared 218, api 2508.
- Task 3 (2f608dc1): the projects create and update routes switched to the shared contracts and the project DTOs were deleted; shared 218, api 2403.
- Task 4 (7580b508, c5ac13a6): `createProgramRequest` contract added with its parity test, then the programs create route switched and its DTO deleted; shared 225, api 2407.
- Task 5 (4c407ba1): the project row mapper moved into `projects.mapper.ts` with a shared `ProjectResponse` type; shared 225, api 2407.
- Task 6 (d2d729ad, 790157df): `project-budget` renamed to `project-budget.service`, then team and budget writes split out of `ProjectsService`; shared 225, api 2407.
- Task 7 (57a79e17): `requireScopedProjectRow` and `requestIdentity` adopted in the projects, programs, overview metrics and project map modules; shared 225, api 2413.
- Parity: 107 project and 20 program bodies agree between the DTO and contract routes; four project and two program bodies are accepted differences.
- Task 8: SAD beneficiary privacy routing covers `apps/api/src/**/*.mapper.ts`; sad 53.
- Middleware stayed at 102 kB. S1a touched no web code.
- S1a decisions are recorded in the change record section 9; the plan stays until S1b is planned, because it holds the S1b outline.
- Deferred to S1b: `lib/api/projects` and the project methods of `pathways-client.ts`, `requestSourceMutation` in `lib/api/core`, the `features/projects` layout and public `index.ts`, the oversized project components, the project map fetcher and the web project types.
- Gates: lint, typecheck and builds pass; tests config 19, shared 225, imports 91, api 2413 (21 skipped), web 1921, sad 53; `Replay-Local.ps1 -MigrationBaseline` 171 PASS, 0 FAIL; demo seed exit 0 on the third run (the first two hit P2028 on the survey report shortly after the replay; dev passed at the same time and the unchanged branch passed later); compiled API boot and health ok; e2e auth-navigation 27/27; e2e main 39 pass with the same 9 failures as dev; web middleware 102 kB; SAD sign-off 57/57 PASS at `1ae10dcd`. Merged to local dev as `ffcb023d`; plan kept for S1b.

## 2026-10-12 Modularization S2a activities api (refactor/s2a-activities)
- Task 1 (935a9e46): the activity, milestone, proof and reservation request contracts added in `contracts/activities/` with a DTO parity test; `countInput` and `pesoAmountInput` added to the field schemas; shared 269, api 2698.
- Task 2 (17752ba0): the activity and milestone routes switched to the shared contracts and their DTO classes and parity test deleted; an HTTP test pins the 400 shape; shared 269, api 2410.
- Task 3 (37ac7356): the extension routes switched to the shared contracts and the extension DTOs deleted; the extension service moved its row mapper and pure helpers into their own files; shared 273, api 2416.
- Task 4 (d21ce4a0): `activities.controller.ts` split into five controllers by purpose, with a route table test and an HTTP routing test over the 20 routes; shared 273, api 2424.
- Task 5 (d1cf1645): the activity row mapper and pure helpers moved into `activities.mapper.ts`, `activities.helpers.ts` and `activity-proof.helpers.ts` with shared response types; shared 273, api 2428.
- Task 6 (83f9aee0): scope, metrics, link and budget helpers moved into four function modules that take `tx`; `requireScopedProjectRow` and `requireActiveAssignment` adopted; shared 273, api 2428.
- Task 7 (d56a8637): milestones, evidence, review and progress split out of `ActivitiesService` into four injectable services; shared 273, api 2428.
- Task 8 (6584c9e2): lifecycle and proofs split out into `ActivityLifecycleService`, `ActivityProofsService` and `ActivityProofFinalizeService`, with an ordering test for `finalizeProofFile`; shared 273, api 2429.
- Task 9 (10be17ae): the three `importOriginal` mocks of `private-inspection-reader` became injected storage factories and the inspection service takes `Tx`; shared 273, api 2429 (21 skipped).
- Final sizes: `activities.service.ts` 182 lines, `activity-lifecycle.service.ts` 356, `activity-proofs.service.ts` 240, `activity-proof-finalize.service.ts` 282, `activity-extensions.service.ts` about 370.
- Parity: 285 activity and milestone checks and 47 extension checks agree between the DTO and contract routes; the accepted differences are the prototype keys and the two null bodies of ruling 4.
- Middleware stayed at 102 kB. S2a touched no web code.
- S2a decisions are recorded in the change record section 9; the plan stays until S2b is planned, because it holds the S2b outline.
- Deferred to S2b: `lib/api/activities` and the activity, extension, evidence and proof methods of `pathways-client.ts`, `private-proof-client.ts`, the `features/projects` activity folder layout, the four oversized components, the hand-written web activity types, the place of `activityExtensionSchema`, and the dead `files` option and `proofSnapshot` of `source-mutation.ts`.
- Gates: lint, typecheck and builds pass; tests config 19, shared 273, imports 91, api 2429 (21 skipped), web 1921, sad 53; `Replay-Local.ps1 -MigrationBaseline` 171 PASS, 0 FAIL; demo seed exit 0 on the first run after a five minute settle following the replay; compiled API boot and health ok; e2e auth-navigation 27/27; e2e main 39 pass with the same 9 failures as dev; web middleware 102 kB; SAD sign-off 97/97 PASS at `7d6077fe` after removing three imports that only comments referenced. Merged to local dev as `0d8624a4`; plan kept for S2b.

## 2026-10-12 Modularization S1b projects web (refactor/s1b-projects-web)

- Task 1 (1b6faeb8): `requestSourceMutation` moved to `lib/api/core/source-mutation-request.ts` with replay and unconfirmed-save tests; web 1926.
- Task 2 (84892615): `lib/api/projects.ts` added with `projectsClient`, the project mapper and wire types, typed from the shared responses; web 1945.
- Task 3 (604a066f): the seven project methods and `getProjectMap` left `pathways-client.ts`; 24 files, 43 calls and the test mocks follow `@/lib/api/projects`; web 1945.
- Task 4 (e9b1a3c1): the unreachable review views (`indicators`, `transparency`), the Add Indicator dialog and `project-review-utils.ts` removed, `view` narrowed to three values; web 1940.
- Task 5 (89c190cd): 25 files moved with `git mv` into `components/`, `team/` and renamed helpers, 59 specifiers and 14 contract paths updated, `ProjectPhaseFiveWorkspace` renamed `ProjectReviewWorkspace`; web 1940.
- Task 6 (f43fc1ba): `features/projects/index.ts`, `indexedFeatures` and `surfaceViolation` in `import-direction.test.ts`, and `optimizePackageImports` in `next.config.ts`; web 1943.
- Task 7 (87884179): setup fields, evidence view and team selection rules split out verbatim, `Owned` and `Scoped` prefixes dropped; web 1943.
- Unreachable views: deleted because a route scan showed only the budget, evidence and monitor-evaluate pages render the workspace, the narrowed `view` type proves no page passes the removed values, and the Add Indicator dialog and the five exports of `project-review-utils.ts` had no other user.
- Route bundles: a plain barrel grew every `/projects` route to 397 kB, `/print/receipts/[expenseId]` from 133 kB and `/analytics` and `/dashboard` by about 80 kB; with `optimizePackageImports` Task 6 changed 0 routes and Middleware stayed at 102 kB. Against the Task 0 baseline, Tasks 1 to 5 shrank the three review routes 3 kB, `/alerts`, `/recommendations/[id]` and `/reports*` 13 kB, `/transparency` 12 kB and `entries/new` 1 kB, and grew `/projects*`, `/beneficiaries*`, `/collection*`, `/analytics`, `/dashboard` and `/settings/users` by 1 to 2 kB.
- Decisions: the S1b decisions are recorded in the change record section 9 because the plan file is removed after merge.
- Deferred: the six project list read keys stay with S6, S7 and S8; the `ExpenseRecord` type in `types/pathways.ts` is now unused (S6); `lib/services/*` renames.
- Gates: lint, typecheck and builds pass; tests config 19, shared 273, imports 91, api 2429 (21 skipped), web 1943, sad 53 (the first gate run hit the known ZodPipe timeout under reviewer load and passed on rerun); route sizes before and after Task 6 differ on 0 routes; `Replay-Local.ps1 -MigrationBaseline` 171 PASS, 0 FAIL; demo seed completed every stage except the survey feedback report, whose SQL report function exceeded the transaction timeout on both runs (pre-existing and intermittent; S1b changes no api code); compiled API boot and health ok; e2e auth-navigation 27/27; e2e main 39 pass with the same 9 failures as dev; web middleware 102 kB; SAD sign-off 141/141 PASS at `3a9922da`. Merged to local dev as `e91f3ad1`; plan removed.

## 2026-10-12 Modularization S2b activities web (refactor/s2b-activities-web)

- Task 1 (3b7e9876): `lib/api/activities.ts`, `activity-extensions.ts`, the two parser files, `guards.ts` and `proof-inspection.ts` added beside the pathways client with characterization tests on the replay receipt and the refusal without a mutation context; web 218 files and 2003 tests.
- Task 2 (7c146842): 29 files and 87 calls switched to the new clients and the activity methods left `pathways-client.ts` (2394 to 1521 lines); mock factories now name the new modules; web 218 and 1973.
- Task 3 (f740ad84): 35 activity files moved with `git mv` into `features/projects/activities/{components,hooks}` with 41 specifiers and 3 contract paths updated; web 218 and 1973.
- Task 4 (dfc9b4fb): the form dialog and the proof dialog split by component and hook, after a draft test pinned the form effects on the unsplit dialog; web 219 and 1977.
- Task 5 (bdd3da8e): the detail panel and the workspace split, after an expenses test pinned the expense rows on the unsplit workspace; web 220 and 1980.
- Task 6 (9e3d0174): `activities.reads.ts` and `activities.copy.ts` added and two types aliased to the contracts; web 221 and 1983.
- Task 7 (1b8438e6): `activityExtensionSchema` moved to `contracts/activities/activity-extension-response.ts` as `activityExtensionResponse` with a strict-shape test; shared 24 files and 281 tests; web 221 and 1983.
- Task 8 (9ded889a): the unused multipart `files` option and `proofSnapshot` removed from `source-mutation.ts` (356 to 315 lines); web 221 and 1983.
- Type probe: of twelve pairs two equal a S2a response type (`ActivityCapabilities`, `AssignableProjectOfficer`) and became aliases; ten differ in shape or strictness and stay view models.
- Route measurements: Tasks 1 and 2 shrank 18 routes (up to 4 kB) and grew `/alerts/repository` by 1 kB; the layout move grew three routes by 1 kB; a sub-index grew `/dashboard` from 673 to 696 kB so the feature index lists leaf paths; a stale `apps/web/.next` after the moves failed the build with a misleading Module not found.
- Decisions: the S2b decisions are recorded in the change record section 9 because the plan file is removed after merge.
- Deferred: the activity read keys of analytics, rules board, collection, beneficiary loaders and the review workspace; the `finance-*` read keys and the activity expense files (S6); `definitiveRejection` and `nextDay`; one component per file in `activity-detail-sections.tsx` and `evidence-panels.tsx`.
- Gates: lint, typecheck and builds pass; tests config 19, shared 281, imports 91, api 2429 (21 skipped), web 1983, sad 53; web middleware 102 kB; routes against the post-Task 2 base 72 measured, 19 different, none above 2 kB; `Replay-Local.ps1 -MigrationBaseline` 171 PASS, 0 FAIL on the rerun (the first run failed once in `csv-rbac.local.test.ts`, a race between the host-clock assignment cutoff and the database-clock `assigned_at`, unrelated to S2b); demo seed failed twice only on the known survey report timeout; API health ok; e2e auth-navigation 27/27; e2e main 39 pass with the same 9 failures as dev; SAD sign-off 175/175 PASS at `1b6e67cb`. Merged to local dev as `3b28fb69`.

## 2026-10-13 Assignment cutoff uses the database clock
- Problem: `readApplicationProfile` in `apps/api/src/common/authz/application-profile.ts` bound the host clock (`new Date()`) as the cutoff for `user_project_assignments.assigned_at`, which the database stamps with its own clock; with the Docker database clock up to 18 ms ahead of the host, a project manager could not read a project they had just been assigned to, and `csv-rbac.local.test.ts` failed once in the S2b replay.
- Fix (40f23e2d): the query compares `a.assigned_at <= clock_timestamp()`, so both sides use the database clock; future-dated assignments stay excluded.
- Tests: `application-profile.service.test.ts` now asserts the `clock_timestamp()` cutoff and that no host `Date` is bound; api 2429 (21 skipped).
- Gates: lint, typecheck and api build pass; api 2429 (21 skipped), sad 53; `Replay-Local.ps1 -MigrationBaseline` 171 PASS, 0 FAIL with `csv-rbac.local.test.ts` green; `application-profile.local.test.ts` not run (it needs the retired phase 4 replay database on port 55439); seed and e2e skipped because the replay runs the changed query against Postgres; SAD sign-off 3/3 PASS at `71a56c20`. Merged to local dev as `65e094a2`.

## 2026-10-13 Modularization S3a indicators api (refactor/s3a-indicators-api)
- Task 1 (e0e39bd4): `indicators.validation.test.ts` pinned the indicator 400 body, the 403 on the controller routes and the archive parse order on unchanged code, including the non-UUID 404; api 2437 (21 skipped), shared 281.
- Task 2 (7e077014): the indicator schemas moved verbatim into `contracts/indicators/`, with the metric cell and shared field schemas in their own `monitoring` modules; shared 281, api 2437.
- Task 3 (7ec88401): the indicator contracts renamed to request and response names, with `MonitoringIndicator` and `ProjectIndicator` merged into `IndicatorResponse` and callers in api and web updated; shared 281, api 2437.
- Task 4 (5f43b9b7): `indicators.helpers.ts` and `indicators.mapper.ts` split out of the services and `indicators.dto.ts` deleted, after a helpers test; `indicators.service.ts` 522 lines; shared 281, api 2443 (21 skipped).
- Task 5 (dea3989a): `measure` moved into `IndicatorMeasurementsService` with five seeds and three tests repointed; `indicators.service.ts` 390 lines, the new service 166 lines; shared 281, api 2445.
- Task 6 (2714ca3e): the three indicator controllers use `requestIdentity`; shared 281, api 2445 (21 skipped).
- Decisions: the S3a decisions are recorded in the change record section 9; the plan stays until S3b is planned because it holds the S3b outline.
- Deferred to S3b: `lib/api/indicators.ts`, `features/projects/indicators/`, the workspace split, `indicators.reads.ts` and the web aliases `ProjectIndicator`, `CreateIndicatorInput` and `UpdateIndicatorInput`.
- Gates: lint, typecheck and builds pass; tests config 19, shared 281, imports 91, api 2445 (21 skipped), web 1983, sad 54; dist layout ok; web middleware 102 kB; routes against the dev build 73 measured, 17 different, none above 1 kB; `Replay-Local.ps1 -MigrationBaseline` 171 PASS, 0 FAIL; demo seed stopped by the developer after its monitoring stage passed (library copies and measurement corrections through `IndicatorMeasurementsService`), defense seed not run; compiled API boot health ok with no Nest dependency errors; e2e not run because the developer stopped the gates to move the work to a cloud session, so it is pending a local run; SAD sign-off 75/75 PASS at `767e09b0`. Merged to local dev as `87935091`.

## 2026-10-13 Modularization S3b indicators web (claude/modularization-s3b-9ept8o)
- Task 1 (5cf4cd96): `lib/api/indicators.ts` added with `indicatorsClient` (8 methods) and `indicatorLibraryClient` (3), and `indicators.test.ts` pinned the replay receipt, the refusal without a mutation context and the measurement ticket call against the old and the new client; web 222 files and 2009 tests.
- Task 2 (7f6ea485): 8 production files (17 calls), 10 mock factories and the library manager test switched to `@/lib/api/indicators`, the indicator methods left `pathways-client.ts` (1521 to 1361 lines), `lib/services/indicator-library-client.ts` was deleted and the two indicator read cases moved to `indicators.read.test.ts`; web 223 and 1996.
- Task 3 (8a5fce83): the seven indicator files moved with `git mv` into `features/projects/indicators/components` with 10 specifiers updated and two leaf exports in the feature index; web 223 and 1996.
- Task 4 (cb1f57e8): the workspace split into form, editor, utils and copy (952 to 414 lines) and the library manager into an entry form (401 to 208), both proven line by line (`lost 0`); web 223 and 1996.
- Task 5 (308b4401): `indicators.reads.ts` added with the library and project indicator reads and a test that pins keys, permissions and freshness, and the web alias `ProjectIndicator` replaced by `IndicatorResponse` in six files; the workspace is 408 lines and the manager 206; web 224 and 1998.
- Route measurements: Tasks 1 and 2 shrank `/alerts/repository` from 322 to 312 kB and moved eleven routes by 1 kB or less; the layout move and the component split moved none; the first draft of the reads file grew `/indicators/library` from 280 to 296 kB because it imported `pathways-client`, and the final reads change moved five routes by 1 kB or less and none grew. Middleware is 103 kB in the cloud container (102 kB on Windows builds).
- Decisions: the S3b decisions are recorded in the change record section 9 because the plan file is removed after merge.
- Deferred: `features/analytics/use-monitoring-read` import of the workspace until S7; the read keys of analytics, rules board, collection and dashboard that call the indicator client (their slices); `recoverSourceMutation` keeps its indicator branch.
- Gates (2026-10-13, cloud container, head e293bec8): lint, typecheck and tests pass with config 19, shared 281, imports 91, api 2445 passed and 21 skipped, web 224 files and 1998 tests, sad 54; docs check 6 failures and 1 warning (baseline); production build exit 0 with Middleware 103 kB (the container figure, 102 kB on Windows builds); against the Task 3 baseline routes 72, different 5 (five routes 1 kB smaller), against the Task 0 baseline routes 72, different 9 (`/alerts/repository` 322 to 312 kB, seven routes 1 kB smaller, `/collection/import` 1 kB bigger); `tsc --noUnusedLocals` lists only the two dev lines; SAD sign-off PASS (design-qa-agent 49, beneficiary-privacy-guardian 6, rule-engine-determinism-checker 2, no block); replay: the container cannot run initdb as root, so the pull request CI replay is the gate (PR #49); pending local run: the demo and defense seeds, the dev servers, both e2e suites and the browser smoke (with S3a's pending seed and e2e runs).

## 2026-10-13 Modularization S4a beneficiaries api (claude/modularization-s4-9ept8o)
- Task 1 (a8d05532): the beneficiary request contracts (`beneficiaryListQuery`, register, update, archive, enroll and resolve duplicate) added in `contracts/beneficiaries/beneficiary-requests.ts` with a contract test and a DTO parity test over 109 bodies; shared 296, api 2558 (21 skipped).
- Task 2 (5608115f): the beneficiaries and identity review controllers validate with the shared contracts, `beneficiaries.dto.ts` slimmed to 43 lines, the profile update audit lists all 12 fields from the contract shape, and `beneficiaries.controller.validation.test.ts` pins the HTTP cases; shared 296, api 2458 (21 skipped).
- Task 3 (15d54ce1, e69ada9d): the journey stage and event contracts added in `contracts/journeys/journey-requests.ts` with a parity test over 82 bodies, then the participants controller switched to them and `activities.dto.ts` and `journey-stage-code.test.ts` were deleted; shared 310, api 2456 (21 skipped).
- Task 4 (37a1900f, 2b74595b): `reserveBeneficiaryMediaRequest` added with a parity test over 38 bodies, the media controller switched to it and `beneficiary-media.dto.ts` was deleted; shared 316, api 2460 (21 skipped).
- Task 5 (69ace735): `beneficiary-registration.helpers.ts`, `beneficiaries.helpers.ts`, `beneficiaries.mapper.ts` and `registration-context.service.ts` split out of `BeneficiariesService`, `beneficiaries.dto.ts` deleted and `beneficiary-progress.ts` takes `Tx`; `beneficiaries.service.ts` 843 lines; shared 316, api 2462 (21 skipped).
- Task 6 (c111102b): registration promotion moved into the injectable `BeneficiaryRegistrationService`, which `ImportsService` injects, with seeds and tests repointed; `beneficiaries.service.ts` 409 lines and the new service 457 lines; shared 316, api 2462 (21 skipped).
- Task 7 (4bbe5883, dcd6f8d1): `participants.helpers.ts` pinned by a test, then the participants module split into `journey-stages.service.ts`, `beneficiary-journey.service.ts`, `journey-stages.mapper.ts` and one controller per file, with `participants.service.ts` left at 166 lines for participation promotion and the participation `normalizedCode` replaced by `canonicalCode`; shared 316, api 2484 (21 skipped).
- Task 8: records and SAD routing added the beneficiary, media and participants module globs to the beneficiary privacy guardian; sad 55.
- Decisions: the S4a decisions are recorded in the change record section 9; the plan stays until S4b is planned because it holds the S4b outline.
- Deferred to S4b: the 19 beneficiary, journey and media client methods of `pathways-client.ts` in `lib/api`, the beneficiary and journey response contracts, the `features/beneficiaries` layout and public `index.ts`, the four oversized components and the `ScopedBeneficiaryForm` name. Left to S5: the unused `PrismaService` parameter of `ParticipantsService` and the `beneficiaries` field name in `ImportsService`.
- Final review fix (2154962e, a887445b): the coercion, null and strict rows of the deleted parity tests pinned in the three shared contract tests, after the final review and the design-qa role found them unenforced; shared 348.
- Gates (2026-10-13, cloud container, head 51d3139e, shared rerun at a887445b): lint, typecheck and tests pass with config 19, shared 316 (348 after the fix), imports 91, api 2484 passed and 21 skipped, web 224 files and 1998 tests, sad 55; docs check 6 failures and 1 warning (baseline); production build exit 0 with Middleware 103 kB (the container figure, 102 kB on Windows builds) and the dist layout check passes; no web file changed, so no route comparison; SAD sign-off PASS (design-qa-agent 56, beneficiary-privacy-guardian 45, organization-isolation-checker 9, metadata-import-validator 4, restraint-guardian 2, no block); replay: the container cannot run initdb as root, so the pull request CI replay is the gate; pending local run: the demo and defense seeds, the compiled API boot, the dev servers, both e2e suites and the browser smoke.

## 2026-10-13 Modularization S5a collection api (claude/modularization-s5-9ept8o)
- Task 1 (820727cd): the import request contracts (`uploadImportRequest`, `importMappingItemRequest`, `saveImportMappingRequest`, `automaticImportMappingRequest`, `processImportRequest`, `importRowsQuery`) added beside `validateImportRequest`, with `trimmedLowercaseInput` and `queryInteger` in the field schemas, a limits test pinning `importRequestLimits` to `@pathways/imports` and a DTO parity test over 87 bodies; shared 371, imports 92, api 2572 (21 skipped).
- Task 2 (0672b853): the imports controller validates with the shared contracts, `imports.dto.ts`, its value map test and the parity test deleted, the eight service type names renamed to the contract types, and `imports.controller.validation.test.ts` pins the HTTP cases; shared 371, imports 92, api 2492 (21 skipped).
- Task 3 (d7a52094): the form metadata contracts added in `contracts/metadata/form-requests.ts` with a contract test and a DTO parity test over 131 bodies; shared 377, imports 92, api 2623 (21 skipped).
- Task 4 (6efef0a9): the metadata controller validates with the shared contracts, `metadata.dto.ts` and the parity test deleted, nine route and type edits, and `metadata.controller.validation.test.ts` pins the HTTP cases; shared 562, imports 92, api 2497 (21 skipped).
- Task 5 (28674aeb, 3c62b3f8, 836aef7f): the two metadata gate tests renamed after what they check, `metadata.service.ts` (1315 lines) split into the facade (221) and `metadata.mapper.ts`, `metadata.helpers.ts` and the lookup, definitions, versions, submissions and submission reads services, and the form definition export reads its project through `requireScopedProject` with one characterization case; shared 562, imports 92, api 2500 (21 skipped).
- Task 6 (2deab105, 8173834a): `p07-w10-finalization-fault` renamed `upload-finalization-fault` and the F6 gate test `imports.review-flow.test.ts`, then `imports.service.ts` (2119 lines) split into the facade (519) and `imports.helpers.ts`, `imports.mapper.ts` and the batches, automatic mapping, mapping, validation, upload, promotion context, row promotion, promotion and claims services, with the duplicated field contract mapping owned by `formFieldContract`; shared 570, imports 92, api 2514 (21 skipped).
- Task 7 (cc9fb0d6): `smart-match.ts` split into `smart-match-rules.ts`, `smart-match-names.ts` and `smart-match-values.ts` (the matcher keeps the public exports) with a package export test; `smart-match.test.ts` unchanged; shared 570, imports 94, api 2514 (21 skipped).
- Task 8: records and SAD routing added the metadata module and the imports and metadata contract folders to the metadata import validator; sad 56.
- Tests-only fix (7bc603a6, f8c69415): rows that lived only in the deleted parity tests were pinned after the paired reviews found them unenforced; 7bc603a6 added 185 shared rows (imports 74, forms 111: row page caps, mapping body rules, form definition and field bounds, query coercion and the strict and prototype key rows), and f8c69415 added 14 api HTTP cases for the update, archive, edit and submit routes and the repeated offset key plus 8 shared rows for the save and edit values; each swapped pipe fails its valid-body case; shared 570, api 2514 (21 skipped); a later test pins that edit, publish and archive evict the warmed form definition, api 2515 (21 skipped).
- Decisions: the S5a decisions are recorded in the change record section 9; the plan stays until S5b is planned because it holds the S5b outline.
- Deferred to S5b: the 22 metadata and import client methods of `pathways-client.ts` in `lib/api` (with `validateImport` typed from `ValidateImportRequest`), one `use-import-batch` hook for the two web import flows, the split of the three collection workspaces, the `features/collection` layout and public `index.ts`, and the web form type copies. Left to W1: the unused `PrismaService` parameter of `ParticipantsService` and the eight test-only `Prisma.TransactionClient` annotations in the imports and metadata test harnesses.
- Gates (2026-10-13, cloud container, head 6c0ed266, tests rerun at ede08092): lint, typecheck and tests pass with config 19, shared 570, imports 94, api 2515 passed and 21 skipped, web 224 files and 1998 tests, sad 56; docs check 6 failures and 1 warning (baseline); production build exit 0 with Middleware 103 kB; dist layout ok; compiled pipe probe all Object; SAD sign-off PASS (design-qa-agent 61, metadata-import-validator 55, organization-isolation-checker 17, beneficiary-privacy-guardian 11, restraint-guardian 2, no block); replay: pull request CI is the gate; pending local run: seeds, compiled API boot, dev servers, both e2e suites and the browser smoke.

## 2026-10-13 Modularization S6a finance and reports api (claude/modularization-s6-9ept8o)
- Task 1 (1dc1b9c5, 3428acc2): `ReportPdfRenderer` and its test moved to `modules/reports`, `ReceiptPdfRenderer` to `modules/finance`, `modules/report-pdf` became `modules/print-pdf` whose `PrintPdfModule` provides only `PrintPdfRenderer`, and the api import boundary test now fails on any module pair outside the recorded `dashboards <-> reports`; shared 570, api 2517 (21 skipped).
- Task 2 (1c0367c5, ca2650d0): a characterization test pinned the finance request 400 bodies (39 cases), then `finance-requests.ts` added in `contracts/finance` with a contract test and the finance service parsed the shared schemas in place of its local ones, 38 lines cut; shared 590, api 2556 (21 skipped).
- Task 3 (88758587, a50fc1d9): characterization tests pinned the evaluation and report request 400 bodies (22 and 17 cases), then `evaluation-requests.ts` and `report-requests.ts` added with contract tests, the evaluations and reports services parsed the shared schemas and `reports.dto.ts` was deleted; shared 605, api 2595 (21 skipped).
- Tests-only fix (3834e092): 52 shared rows pinning finance, evaluation and report request bounds (max lengths, trims, 17-digit money, revision offsets, strict objects, enums and refinements), each shown to fail on a loosened schema, after the paired reviews found them unenforced; production code unchanged; shared 605 to 657.
- Task 4 (b8f7971c, 2cd28fbf): `evaluation-metrics.ts` renamed `evaluation-metrics.service.ts`, then `evaluations.service.ts` (809 lines) split into 337 lines plus `evaluations.mapper.ts`, `evaluations.helpers.ts` and four function modules, every range moved verbatim with `Tx` in place of `Prisma.TransactionClient`; shared 657, api 2595 (21 skipped).
- Task 5 (ada6832c, 347eaab2, e9ba4766, 24c92014): a test pinned the project scope of the report read routes, `report-sources-extra.ts` renamed `report-monitoring-evaluation-source.ts`, then `reports.service.ts` (873 lines) split into 455 lines plus `report-source.service.ts`, `report-generation.service.ts` and `reports.helpers.ts`, three read routes use `requireScopedProject`, and the 9 `Prisma.TransactionClient` annotations in the S6 modules are now `Tx`; shared 657, api 2602 (21 skipped).
- Task 6 (9466f463): the finance receipt admission and record reads moved into `expense-receipts.service.ts` and `finance.helpers.ts`, `finance.service.ts` from 631 to 439 lines; shared 657, api 2602 (21 skipped).
- Task 7 (02b272f4): records and SAD routing added `apps/api/src/**/*.helpers.ts` to the organization isolation checker, because the report kind policy left `reports.service.ts`; sad 57.
- Tests-only fix (5bd2ae40): 8 api cases pin that the four other finance refusals run no authorized operation, that `0.01` reaches the expense SQL, that the trimmed evaluation period label and report name reach the write, the `findFirst` arguments of the three report read routes and a 403 before any project lookup, each shown to fail on a temporary production break, after the final review; api 2610 (21 skipped).
- Accepted difference (ruling 4): the expense amount check no longer throws, so `'abc'`, `''` and `' 1'` answer 400 instead of 500; every other route, status code, response body, audit row and transaction boundary is unchanged.
- Decisions: the S6a decisions are recorded in the change record section 9; the plan stays until S6b is planned because it holds the S6b outline.
- Deferred to S6b: the web client members, reports feature, budget module, evaluation workspace, the dead `reporting-workspace.tsx` chain, read keys and response contracts. Left to S7: the `dashboards <-> reports` pair and the longer cycles through `dashboards`.
- Gates (2026-10-13, cloud container, head 02b272f4, api rerun at 5bd2ae40): lint, typecheck and tests pass with config 19, shared 657, imports 94, api 2610 passed and 21 skipped, web 224 files and 1998 tests, sad 57; docs check 6 failures and 1 warning (baseline); production build exit 0 with Middleware 103 kB; dist layout ok; SAD sign-off PASS (design-qa-agent 61 in two packets, organization-isolation-checker 14, beneficiary-privacy-guardian 7, restraint-guardian 2, no block); replay: initdb refuses root in the container, so the final pull request CI is the gate; renderer check: no Chrome or Edge in the container (Playwright Chromium fails at launch as root), pending local run; pending local run: seeds, compiled API boot, dev servers, both e2e suites and the browser smoke. No separate pull request: Cian asked for one pull request after every slice is implemented.

## 2026-10-13 Modularization S4b beneficiaries web (claude/modularization-s4b-9ept8o)
- Task 1 (3ed9b214): response contracts for the beneficiary, journey and media routes added in `packages/shared` as types only, with tests over each shape, and `mapBeneficiary`, `mapStage`, the journey history and the media, identity review and registration context services annotated so a drift fails typecheck; shared 657 to 664, api unchanged at 2610 (21 skipped).
- Task 2 (f206a75d): `lib/api/beneficiaries.ts`, `journeys.ts` and `beneficiary-media.ts` with their two schema files added, generated from the methods still in `pathways-client.ts`, and `beneficiaries.test.ts`, `journeys.test.ts` and `beneficiary-media.test.ts` pinned 15 cases against the old and the new client (30 runs); web 227 files and 2028 tests.
- Task 3 (c900f450): 13 production files (28 calls), 3 client tests (18 calls) and 12 test files with 13 mock factories switched to the new clients, the 19 methods, the registration context parser and the beneficiary mappers left `pathways-client.ts` (1361 to 716 lines), and the old rows of the characterization tests were dropped; web 227 files and 2015 tests.
- Task 4 (4a768493): the 33 files of `features/beneficiaries` and `features/journey-config` moved with `git mv` into `features/beneficiaries/{directory,registration,profile,media,identity-review,journey}` (29 specifiers updated), `index.ts` added with six leaf exports, the seven route pages switched to it and `beneficiaries` added to `indexedFeatures` and `optimizePackageImports`; web 227 and 2015, the layout build matched the pre-layout routes (the pre-layout compare against Task 0 printed 27 differing routes, 24 smaller and 3 bigger).
- Task 5 (8c4811da): the change record, audit, QAD and deferred features rows follow the new paths and the S4b disposition is recorded; no SAD routing change, because `apps/web/src/lib/api/**/*.ts` and the shared contracts already route to the beneficiary privacy guardian.
- Final counts: shared 35 files and 665 tests, api 2610 passed and 21 skipped, web 227 files and 2015 tests.
- Decisions: the S4b decisions are recorded in the change record section 9; the plan stays until S4c is planned because it holds the S4c outline.
- Tests-only fixes (463478a0, 25b58725, 8fa5a147): two contract rejection rows fail on one property each, the full mapped beneficiary record plus the parentStageId and history refusal cases are pinned, and a media item without submittedBy and a history event without recordedBy are refused, each shown to fail on a temporary break; shared 665.
- Deferred to S4c: the `ScopedBeneficiaryForm` split and rename, the `beneficiary-detail.tsx`, `beneficiary-media-proof.tsx` and `beneficiary-directory.tsx` splits and the two oversized tests.
- Gates (2026-10-13, cloud container, head 8c4811da): lint, typecheck and tests pass with config 19, shared 665, imports 94, api 2610 passed and 21 skipped, web 227 files and 2015 tests, sad 57; docs check 6 failures and 1 warning (baseline); production build exit 0 with Middleware 103 kB, 27 routes differ from Task 0 (24 smaller, 3 bigger by 1 kB) and none from the pre-layout build; SAD sign-off PASS (design-qa-agent 115 in two packets, beneficiary-privacy-guardian 30, organization-isolation-checker 5, no block); replay: initdb refuses root in the container, so the final pull request CI is the gate; pending local run: seeds, dev servers, both e2e suites and the browser smoke. No separate pull request: Cian asked for one pull request after every slice is implemented.

## 2026-10-13 Modularization S4c beneficiaries components (claude/modularization-s4c-9ept8o)
- Task 1 (ff73a876): `beneficiary-form.tsx` (1391 lines) cut into the 36 line `BeneficiaryForm`, `BeneficiaryRegistrationForm` (renamed from `ScopedBeneficiaryForm`, 420 lines), three registration hooks, eight section components and ten more exports of `registration.utils.ts`; every line of the old form and utils file is in a new file (`lost 0`, 255 lines added), one moved line mutated per hook failed the tests.
- Task 2 (5019688d): `beneficiary-detail.tsx` (1173 lines) cut into a 93 line screen, `useBeneficiaryDetail`, `useBeneficiaryDetailView` and eleven section components (`lost 0`, 145 lines added); two mutations of the detail hooks failed tests.
- Task 3 (79c9e14c): `beneficiary-form.test.tsx` (870 lines) and `beneficiary-detail.test.tsx` (636) split into seven test files with two fixture modules in `test/fixtures`, three pure rows moved to `registration.utils.test.ts`; 50 rows and 177 assertions before and after.
- Task 4 (17d2d93a, 814dc049): `AddMediaDialog`, `MediaViewer` and `MediaKpi` cut out of the media proof (668 to 210 lines, `LoadState` to `media.utils.ts`), then the column definitions and `FilterSelect` out of the directory (565 to 435 lines); the three beneficiary routes kept their first load of 300, 280 and 280 kB and only the detail page's own size moved from 13.6 to 14.3 kB.
- Task 5 (5801f1fc): the change record (section 3.3 hooks and tests rule, section 9 S4c disposition), the audit rows MOD-06, MOD-17 and MOD-B1 and the index row follow the split; no SAD routing change, because `features/beneficiaries/**` and the test fixtures already route to the design QA agent.
- Decisions: the S4c decisions are recorded in the change record section 9; the plan copy in `docs/superpowers/plans` is removed with the other executed copies after the final merge. Not pinned by any test before or after the split: the restore of a stored draft of another project and the minor boundary at 18.
- Deferred: nothing from S4. The `'5-9'` age band of the directory stays as MOD-B1.
- Gates (2026-10-13, cloud container, head 5801f1fc): lint, typecheck and tests pass with config 19, shared 665, imports 94, api 2610 passed and 21 skipped, web 232 files and 2015 tests, sad 57; docs check 6 failures and 1 warning (baseline); production build exit 0 with Middleware 103 kB and 0 of 72 routes different from the Task 0 build (first load of the three beneficiary routes stayed at 280, 300 and 280 kB); SAD sign-off PASS (design-qa-agent 46, no block); replay: initdb refuses root in the container, so the final pull request CI is the gate; pending local run: seeds, dev servers, both e2e suites and the browser smoke. No separate pull request: Cian asked for one pull request after every slice is implemented.

## 2026-10-13 Modularization S5b collection web (claude/modularization-s5b-9ept8o)
- Task 1 (0d006da9): `import-responses.ts` and `form-responses.ts` added to `packages/shared` as type-only response contracts with their tests, and return types on six api mapper functions; `pnpm typecheck` passes across the api and the web.
- Task 2 (0d9c96d8): `formsClient` (13 methods), `importsClient` (9) and `imports.schema.ts` generated from the 22 methods of `pathways-client.ts` and the receipt parser (`lost 0`, request type checks stripped); the characterization tests run 30 results against the old and the new client, and one mutation per file failed them.
- Task 3 (06708a61): 45 calls in 7 files and 12 mock factories moved to the new clients, the 22 methods removed (`pathways-client.ts` 716 to 407 lines), five web types aliased to the response types, and the two characterization tests turned into 23 plain rows.
- Task 4 (66029bb7, 64c1ae8e): stored upload recovery and the stop and resume of the processing run got four tests and a mutation each, then `useImportBatch` replaced the upload identity, the automatic mapping call and the stop flag of the two import screens; four tests failed on a mutation of the identity check.
- Task 5 (cc3fc518): 14 views cut out of `collection-workspace.tsx` into `components/` and 14 shared declarations into `collection.utils.ts` (1788 lines left, `lost 0`).
- Task 6 (2962748d, d71e4cc6): `useFormFields` and `useServerProcessing` cut out by line range (1788 to 1640 lines, five edited lines named), then `use-form-fields.test.tsx` (10 rows, seven mutations failed it).
- Task 7 (29e53b7b): `collection-workspace.test.tsx` (1672 lines) split into five files; the 50 full test names are identical, 35 rows before and after.
- Tests-only commits after review: 0f558215 (import response rows fail on one property, shared 37 files and 675), 381abebf (eight forms and imports client pins run on both clients before the old methods went), 5c083d55 (every upload identity part of the two import screens, each bitten by dropping it) and 6765d867 (intent counter, sensitive draft generation guard and timer reset of the form field hook test, 12 rows); web ends at 242 files and 2071 tests.
- Task 8: the change record (section 3.3 hook rule, section 9 S5b disposition), the audit rows MOD-05, MOD-06 and MOD-07 and the index row follow the slice; no SAD routing change, because `lib/api` already routes to the privacy guardian, the two response contracts to the import validator and `features/collection` to the design QA agent.
- Decisions: the S5b decisions are recorded in the change record section 9; the plan copy in `docs/superpowers/plans` is removed with the other executed copies after the final merge. Not pinned by a new test: the form list, parse, save and publish handlers of the collection screen, which keep the rows they had.
- Deferred: S5c takes `import-workspace.tsx`, `direct-form-entry-workspace.tsx`, the rest of `collection-workspace.tsx` (1640 lines), the `features/collection` layout and the form type copies.
- Gates (2026-10-13, cloud container, head 436a73df): lint, typecheck and tests pass with config 19, shared 37 files and 675, imports 94, api 2610 passed and 21 skipped, web 242 files and 2071 tests, sad 57; docs check 6 failures and 1 warning (baseline); production build exit 0 with Middleware 103 kB and 12 of 72 routes smaller than the Task 0 build, none bigger; SAD sign-off PASS (design-qa-agent 67 in two packets, beneficiary-privacy-guardian 16, metadata-import-validator 9, organization-isolation-checker 3, no block); replay: migration integrity PASS, then initdb refuses root in the container, so the final pull request CI is the gate; pending local run: seeds, dev servers, both e2e suites and the browser smoke. No separate pull request: Cian asked for one pull request after every slice is implemented.

## 2026-10-13 Modularization S6b finance and reports web (claude/modularization-s6b-9ept8o)
- Task 1 (659d691d): the production-dead reporting workspace chain deleted (`reporting-workspace.tsx` 1123 lines, `survey-report-overview.tsx`, `survey-report-utils.ts` with their three tests, `reportKindPermissions`, 11 report and survey types of `types/pathways.ts`, two entries of the UI copy contract test); the 18 tests lost with it are 4 of `reporting-workspace.test.tsx`, 1 of `survey-report-overview.test.tsx`, 11 of `survey-report-utils.test.ts` and 2 rows of the UI copy contract; QAD-T18 now cites `analytics-dashboard.test.tsx`; web 242 files and 2071 tests became 239 and 2053.
- Task 2 (d4536e5b): `lib/api/finance.ts`, `evaluations.ts` with `evaluations.schema.ts`, `reports.ts` and `core/owned-json-read.ts` generated from the members still in `core-feature-client.ts` and `pathways-client.ts` (`same-lines` lost 0), and `finance.test.ts`, `evaluations.test.ts` and `reports.test.ts` pinned 146 cases against the old and the new client (292 runs, covering the record ids, the identity checks and the request shapes; a request mutation fails 2); web 242 files and 2345 tests.
- Task 3 (f0e1309d, b557359d): 12 production files (32 calls) and 8 mock factories in 8 test files switched to the new clients, the 20 members, their schemas and the assessment parsers left the old clients (`core-feature-client.ts` 529 to 173 lines, `pathways-client.ts` 407 to 330), the old rows of the characterization tests were dropped and the core client tests were split by client with every case kept (three titles changed: two survey preview context titles carry the fixture project id, and `requests the enrollment-scoped list and parses the rows` became `requests the enrollment-scoped list with the signal and parses the rows`); `report-sections.ts` moved to `lib/api`; web 242 files and 2197 tests.
- Task 4 (99c59297): the 15 files of `features/projects/budget-module` and the four activity expense dialog files moved into `features/projects/budget/{components,hooks,print}` with `budget.utils.ts`, the evaluation workspace and its test into `features/projects/evaluation/components`, the four report files into `features/reports/components`, `reportFileName` into `reports.utils.ts` with its test, `features/reports/index.ts` added, the six report pages and the print report page switched to it and `reports` added to `indexedFeatures` and `optimizePackageImports`; web 243 files and 2197 tests, routes within 1 kB.
- Review fix (33234e5d): 31 tests pin the response schema rules of the three clients that no test held once the old clients went (the three other approver name limits, decimal amounts and scores, every criterion type, report format and status members, date-only round dates, timestamp generatedAt, integer version, the 30-cell row maximum, non-null sections, pdfFallback only true, and the network and unauthorized error codes), each shown failing on a mutation of its rule; web 243 files and 2228 tests.
- Task 5: the change record, audit, QAD and deferred features rows follow the new paths and the S6b disposition is recorded; no SAD routing change, because `apps/web/src/lib/api/**/*.ts` and `lib/services/**/*.ts` already route to the beneficiary privacy guardian.
- Decisions: the S6b decisions are recorded in the change record section 9; the plan stays until S6c is planned because it holds the S6c outline.
- Deferred to S6c: the response contracts for the finance, evaluation and report routes, the report kind grant table, the splits of `live-reporting-workspace.tsx` and `live-evaluation-workspace.tsx` and the `finance-budgets` read key.
- Gates (2026-10-13, cloud container, head 6ee4e6db): lint, typecheck and tests pass with config 19, shared 37 files and 675, imports 94, api 2610 passed and 21 skipped, web 243 files and 2228 tests, sad 57; docs check 6 failures and 1 warning (baseline); production build exit 0 with Middleware 103 kB and 19 of 72 routes 1 to 5 kB smaller than the Task 0 build, none bigger; SAD sign-off PASS (design-qa-agent 104 in two packets, beneficiary-privacy-guardian 14, organization-isolation-checker 1, no block); replay: migration integrity PASS, then initdb refuses root in the container, so the final pull request CI is the gate; pending local run: seeds, dev servers, both e2e suites and the browser smoke. No separate pull request: Cian asked for one pull request after every slice is implemented.

## 2026-10-14 Modularization S5c collection components (claude/modularization-s5c-9ept8o)
- Task 1 (598dea4a): `features/collection` laid out as `forms/`, `import/` and `entry/` by 62 `git mv`s with 43 specifiers rewritten by script in 33 files, `collection.copy.ts` (`enumLabel`, `formTypeLabels`) and a four export `index.ts`; the route pages and the beneficiary registration section import through it, `collection` joined the two feature lists, two mutations showed the surface rule and the list agreement bite, and the route table moved one route (`/collection/import`, 432 to 433 kB).
- Task 2 (94ddfe95, 9728f5b4, 0a3dee37, d1448d27): `ImportBatchStatus` aliased to the response type (the unused `'VALIDATING'` is gone), the 15 unreachable `pathwaysClient` mock factories of 15 test files removed after a throwing factory failed none, ten rows pinned the form type list (four mutations failed them) and the draft store and the web type took `digitalFormTypes` (two mutations failed them).
- Task 3 (25e70fe6, c5ce7156, 8df88238): `forms.utils.ts` (nine declarations), 15 rows for the save, publish, export, open, create version, generate copy and proceed handlers (28 mutations killed on the old screen) and six hooks cut by line range (`collection-workspace.tsx` 1640 to 615 lines, `lost 0`, 13 lines allowed and 53 added, 38 mutations killed on the new files).
- Task 4 (3167b8af): five sections cut out of the screen (615 to 359 lines, `lost 0`, 2 allowed and 37 added), six mutations killed.
- Task 5 (7a8ebc47, 4a4f4327, 79b8e171): one shared `OperationTicket` type, `import.utils.ts` and the import screen cut into four hooks and five cards (1110 to 134 lines, `lost 0`, 59 added), twelve mutations killed.
- Task 6 (d855af99, 3a108613): `entry.utils.ts`, `state-shell.tsx` and the direct entry screen cut into three hooks and two component files (654 to 74 lines, `lost 0`, 40 added), six mutations killed.
- Review fix 3 (ea8c08c6): the collection actions row waits up to 5 s for async results and 14 rows pin hook paths (the save revision, the export ticket, the create version and generate copy resets, the copy listing, the extend fields, the proceed reset, the title, the initial project, the kept preview and the ignored column), each killing its mutation; six guards proved unreachable and are not pinned; tests only.
- Review fix 6 (c75e674d): 20 direct entry rows pin the stale load guards, the begin and valid guards, the retry and the start another record paths, 45 mutations killed; redundant or DOM-unreachable guards are not pinned; tests only.
- Task 7: the change record (section 3.3 hook and layout rule, section 9 S5c disposition closing S5), the audit rows MOD-06, MOD-15 and MOD-16, the QAD test paths, the index row and the two older records that named the old test paths (import value map, RBAC v4 grant migration) follow the slice; no SAD routing change, because `apps/web/src/**` already routes to the design QA agent.
- Decisions: the S5c decisions are recorded in the change record section 9; the plan copy in `docs/superpowers/plans` is removed with the other executed copies after the final merge. Not pinned by a test after the review fixes: 14 mutations of the collection handlers (the guards behind disabled buttons and the existing ticket checks, and the extend role guard of the confirm step), 34 of the import screen and 10 guards of the entry screen, and the copy and display mutations of the entry screen and of the Task 4 sections, which stay as test debt. `form-builder-session-draft.ts` has no production importer and stays.
- Deferred: nothing from S5; the unused `ParticipantsService` parameter stays with W1.
- Review fixes: the final review found the specifier count, four stale paths in deferred-features.md, the biome-ignore count and the roadmap row out of date (3f73b1e7), and the two test files the new rows pushed past 600 lines were split by concern with no name lost or added (db708716).
- Gates (2026-10-14, cloud container, head db708716): lint, typecheck and tests pass with config 19, shared 675, imports 94, api 2610 passed and 21 skipped, web 246 files and 2287 tests, sad 57; noUnusedLocals shows only the two baseline lines; docs check 6 failures and 1 warning (baseline); production build exit 0 with Middleware 103 kB and, against the Task 0 build, 4 collection routes 2 kB bigger, /collection/import 3 kB and the direct entry route 1 kB bigger, none more, within the 3 kB criterion; SAD design QA agent PASS on all changed paths (three packets plus the split test files); replay: initdb refuses root in the container, so the part 2 pull request CI is the gate; pending local run: seeds, dev servers, both e2e suites and the browser smoke. S5c ships in part 2 of 3 stacked pull requests into dev.

## 2026-10-14 Modularization S6c finance and reports components (S6c slice branch)
- Task 1 (47d13434): `packages/shared/src/contracts/{finance,evaluations,reports}/*-responses.ts` added with three test files and `contracts/common/response-rules.test.ts` (every rule of the 15 response objects), and the finance, evaluation and report mappers and services annotated with the inferred types (type only; `Figure.state` and the alert `severity` of `report-project-status.ts` narrowed to the shared types); three field renames fail the api typecheck.
- Task 2 (6a7cfe2c): the three web clients parse the shared schemas, narrowing the budget currency, the report type and the round status with `.extend`; `schema-moved.mjs` lost 0 for the three files; three rows added to the reports client test (a report of type `OTHER`, a submitted round and a reviewed round are refused); `lib/api/report-sections.ts` deleted and its six callers repointed.
- Task 3 (d0648345, 835f9718): `reportKindGrants` and `grantedReportKinds` in `packages/shared/src/rbac/report-kind-grants.ts` with parity tests over every role and every subset of the relevant grants (shared 128, api 256, web 128) that passed against the old code first; the api list route, the api refusal and the web menu then read the table, and a one-grant mutation fails all three suites; a row of the api service test refuses to export a report of a stored type that no route lists.
- Fix 1 (f2a21f17): two shared rows pin the free-form response fields the first review found unpinned (the criterion snapshot `type`, `weight_percentage` and `maximum_score`, and the expense date); each of four tightening mutations fails one of them.
- Task 4 (44aa1180, e0c5d623, 385cd72c): the kind labels and the menu rule left `live-reporting-workspace.tsx` with their 8 test rows (`count-it` equal, titles lost 0), four characterization rows and six rows pinning the permission of each report read were added, and the workspace (542 lines at the Task 0 count, 510 after the grant swap and the move of the labels) became a 33 line screen with `hooks/use-report-context.ts`, `hooks/use-report-generation.ts` and five components (`same-lines` lost 0, 156 added lines).
- Controller fix (f9dc1181): the comment on `readableReportKinds` no longer says that only the beneficiary summary needs extra grants.
- Task 5 (d3a62177, cc62fe6c): four characterization rows were added to the evaluation workspace test and the 531 line workspace became a 42 line screen with `hooks/use-evaluation-workspace.ts`, six components and `evaluation.utils.ts` (`same-lines` lost 0, 149 added lines; `statusTone` typed to `StatusTone`).
- Task 6 (408b940f): `features/projects/budget/budget.reads.ts` holds `useBudgetsRead` for the two identical `finance-budgets` reads, with a test.
- Fix 5 (d01cedcb): `live-evaluation-workspace.state.test.tsx` (63 cases) pins the round status gates, owner and sign-off enablement, dialog confirm gating and cancel, success and failure messages with dialog close and field reset, the stale owner and overlapping operation guards, the start card disables and the table order; 73 of 74 mutants die and the survivor is equivalent. Not pinned: the card field labels and status tone classes (display), the `SUBMITTED` check of the review card (redundant with the hook), the list loading and error branch (`readError` is never set) and the wrapper re-key.
- Fix 4 (91f961a7): `live-reporting-workspace.state.test.tsx` (57 rows) pins `previewOnly`, the chosen format and project, the initial kind and its clamp, the survey and round reset on a project change, the draft owner inputs and export permission, the saved report disable rule, and the download and generate messages and stale owner, catch and finally guards; 52 of 57 mutants die and the five survivors are four generate re-entry guards behind a disabled button and one equivalent mutant. Not pinned: the preview and saved report pending, error and empty texts, the title fallback, the unavailable reasons, the status badge and the format not set text, and the `enabled` flags of the forms, rounds and reports reads.
- Task 7: the change record (sections 3.3, 3.4, 3.6, the roadmap row and section 9), the audit rows, QAD-T121, the deferred feature row and the index follow the S6c changes; no SAD routing change, because `packages/shared/src/rbac/**`, the api services, mappers and helpers, and `packages/shared/src/contracts/**` already route to the isolation checker and the beneficiary privacy guardian.
- Counts: shared 37 files and 675 tests to 42 and 721, api 152 files and 2610 tests to 153 and 2614 (21 skipped), web 246 files and 2287 tests to 250 and 2427; Middleware 103 kB, three project routes (`budget`, `evidence`, `monitor-evaluate`) 1 kB bigger, none smaller.
- Decisions: the S6c decisions are recorded in the change record section 9; no plan copy is removed in the slice, the controller removes the executed copies after the final merge of the series.
- Gate: S6c is the last slice of part 2 of 3 stacked pull requests into `dev`; the controller opens the pull request (`claude/modularization-s6c-9ept8o` into `dev`) after the S6c sign-off.
