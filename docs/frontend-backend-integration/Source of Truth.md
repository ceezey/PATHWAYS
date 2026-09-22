# PATHWAYS — Frontend-UI/UX → Backend-DB Integration Source of Truth

**Canonical task location:** `docs/frontend-backend-integration/Source of Truth.md`
**Task:** Integrate the latest GitHub `Frontend-UI/UX` branch into the current `Backend-DB` line while preserving frontend UI/UX and backend security/persistence.
**Status:** Phase 3 COMPLETE/PASS; local merge commit `4dd96289bc1ab78eb24b02fca563ccc2a8ed881a`; no push.
**Workflow:** Phase-gated Codex work with a GitHub Pull Request.

---

## 1. Purpose

This file governs only the Frontend-UI/UX → Backend-DB integration workstream.

It does not replace the core backend `docs/Source of Truth.md`.

The integration must combine:

- latest Frontend-UI/UX presentation and use-case-aligned experience;
- current Backend-DB persistence, authorization, security and data-integrity implementation.

The latest frontend is the **UI/UX standard**.

---

## 2. Authority hierarchy

For this workstream:

1. Latest explicit developer directions recorded below.
2. Latest pinned GitHub `Frontend-UI/UX` head for UI/UX, page structure, interactions and use-case presentation.
3. Current accepted Backend-DB security, authorization, persistence, database and provider contracts.
4. PATHWAYS use-case/manuscript requirements and maintained core controls.
5. Older source behavior.

A UI difference does not authorize weaker backend security.

A backend limitation does not authorize redesigning the latest frontend.

---

## 3. Locked developer directions

### Frontend standard

Preserve the latest Frontend-UI/UX:
- visual design;
- layout;
- spacing;
- components;
- route/page presentation;
- navigation;
- forms;
- buttons;
- modals/drawers;
- responsive UX;
- use-case flow.

Backend/client code must adapt around this presentation.

### Missing backend logic

When a latest-frontend action lacks backend support:

- implement the backend when the requirement is clear and authorized;
- preserve server validation, authorization, audit and scope;
- do not fabricate success/data;
- when policy is unclear, use truthful temporary unavailable/disabled behavior without redesigning the interface;
- report the missing feature, recommendation and temporary behavior in chat.

### OTP/MFA

The pinned frontend has a prototype OTP screen inside `features/auth/login-form.tsx`,
but no provider-backed MFA UI or `/auth/mfa` page. Its fixed-code prototype
routes must not be treated as authentication.

Use the older working provider-backed OTP/MFA UI from the current Backend-DB:
`apps/web/src/app/(auth)/auth/mfa/page.tsx` and
`apps/web/src/features/auth/mfa-form.tsx` at `3c4f0eb48cf1656bb44d9cb118b9ecc18a9f4090`
(history includes `faa7500`, `f5c0748`, `098b897`, and `86bf76d`).

Do not invent a new OTP design.

Preserve login/MFA semantics and redirects.

### Project Manager indicators

Project Manager must retain indicator:
- read access within authorized project scope;
- manage access within authorized project scope;

like M&E for indicator management.

This instruction does not authorize any unrelated role/permission change.

The first implementation step is to verify whether the current backend already satisfies it.

### Beneficiary PIN

Temporary Beneficiary PIN remains:

```text
2468
```

It must not replace backend authorization.

### Login/navigation

Do not change:
- login flow;
- MFA semantics;
- workspace selection semantics;
- page redirects;
- logout destination;
- access-denied behavior.

### Mocks/prototype

Production/runtime paths must not use fabricated domain data or fake successful actions.

Do not retain production-facing `mock`, `prototype`, `demo-only` or equivalent wording.

Test-only mocks/fixtures remain permitted.

---

## 4. Git/GitHub contract

Target branches:

```text
Backend-DB
Frontend-UI/UX
```

Use a dedicated integration branch:

```text
integration/frontend-ui-backend-db-20260922
```

Preferred workflow:

```text
fetch → inspect exact SHAs → audit merge → create integration branch
→ merge pinned Frontend-UI/UX locally → integrate backend → validate
→ push integration branch → GitHub PR into Backend-DB
→ developer approval → merge PR → post-merge validation
```

Never:
- force-push;
- reset hard;
- clean untracked work indiscriminately;
- rewrite Backend-DB published history;
- push to Frontend-UI/UX;
- merge Backend-DB into Frontend-UI/UX;
- auto-stash/discard developer work.

Exact branch SHAs are filled during Phase 1.

| Ref | SHA |
|---|---|
| local Backend-DB | `3c4f0eb48cf1656bb44d9cb118b9ecc18a9f4090` |
| origin/Backend-DB | `3c4f0eb48cf1656bb44d9cb118b9ecc18a9f4090` |
| origin/Frontend-UI/UX | `a0ea9cf98396dfd7cceddb8a1c4100aafd57abde` |
| merge-base (`Backend-DB`, `origin/Frontend-UI/UX`) | `769e524fbdfa318ef9190747c1907744b1ea7b95` |
| integration merge commit | PENDING |
| final PR merge commit | PENDING |

Phase 1 repository evidence (2026-09-22): root `C:/PATHWAYS`; current branch
`Backend-DB`; `origin` is `https://github.com/ceezey/PATHWAYS.git` (credential-free
form). `git fetch origin --prune` completed after developer confirmation that
`origin/Frontend-UI/UX` is authoritative. Local and remote `Backend-DB` are
identical, with no ahead/behind commits; the frontend and backend diverge from
the pinned merge base. The worktree is dirty only because the three task-control
files in this directory are untracked. They have not been stashed, reset,
cleaned, or overwritten. No branch, merge, commit, push, or provider write
occurred in Phase 1. The latest pinned `origin/Frontend-UI/UX` is the UI/UX
standard for the integration. Phase 2 was authorized for read-only audit and
task-control edits only.

The requested core `docs/Source of Truth.md`, `docs/TODO.md`, and root
`docs/PHASE_REPORT_TEMPLATE*.md` are absent in this checkout. No `AGENTS.md`
was found under the repository or at `C:/`.

Read-only repository inventory: pnpm 11.20.0 monorepo with Next.js web app
(`apps/web/src/app/layout.tsx` and App Router pages), NestJS API
(`apps/api/src/main.ts` and `app.module.ts`), and `config`, `imports`, `shared`,
`ui` packages. Root scripts expose `lint`, `typecheck`, `test`, and `build`;
app/package scripts use Biome, TypeScript, Vitest, and Next/Nest builds.
Playwright has the main configuration and an isolated auth/navigation
configuration. The single `.github/workflows/ci.yml` runs local PostgreSQL
replay checks, lint, typecheck, tests, and build. Prisma migrations are numbered
`0001` through `0020`; the latest source migration is
`0020_fixed_sensitive_release_policy`. Root, web, and API `.env.example`
files were inventoried by variable name only; no secret values were read or
printed. No tests or migrations were run in Phase 1.

---

## 5. Merge conflict policy

| Conflict category | Authority / treatment |
|---|---|
| Visual/UI components | Latest Frontend-UI/UX |
| Page layout/navigation | Latest Frontend-UI/UX, except locked auth flow |
| Auth/OTP UI | Preserve Backend-DB provider-backed MFA page; prototype frontend OTP is not an authentication substitute |
| Login/redirect semantics | Preserve accepted Backend-DB flow |
| API client/hooks | Adapt to real backend without changing rendered UX |
| Shared contracts | Manual reconciliation |
| Backend services/controllers | Preserve Backend-DB behavior; extend only as needed |
| Prisma/migrations | Preserve applied history; append only if genuinely necessary |
| RBAC | Preserve existing policy; only explicit PM indicator requirement may require reconciliation |
| Runtime mock data | Replace with real backend or truthful unavailable/empty state |
| Test mocks/fixtures | May remain |

No blanket `ours`/`theirs`.

---

## 6. Missing-feature decision rule

For each latest-frontend feature without backend support:

1. Identify the use case and intended state transition.
2. Check for reusable backend service/API.
3. Implement when business rule is clear and safe.
4. If a sensitive/undefined policy is missing, stop guessing.
5. Preserve UI design while using truthful temporary behavior.
6. Report:

```text
Missing feature:
Recommendation:
Temporary behavior implemented:
Future decision needed:
```

The merge must never hide a missing backend behind fake data or fake success.

---

## 7. Security and data integrity

Preserve:
- verified identity;
- MFA;
- organization isolation;
- project scope;
- canonical roles;
- backend permission checks;
- aggregate/detail privacy boundaries;
- RLS/NOBYPASSRLS;
- audit;
- validation;
- idempotency;
- concurrency safeguards;
- private Storage authorization;
- applied migration history.

No frontend control is itself authorization.

---

## 8. Database/provider boundary

Repository/local implementation may be performed only when its phase authorizes it.

Managed PATHWAYS-dev writes, migrations, Auth mutations or Storage writes need their own explicit authorization.

If a new migration is required:
- append after the actual latest migration;
- never edit applied migrations;
- verify in isolated PostgreSQL;
- stop before managed apply.

---

## 9. Deferred P07-W10 boundary

P07-W10 remains OPEN/DEFERRED from the previous workstream.

The frontend/backend merge must not:
- clean its accidental second batch;
- delete W10 Storage objects;
- resume W10 processing;
- recreate Organization B;
- change the recorded W10 verdict.

W10 is revisited separately.

Phase 1 read-only check: `apps/api/src/modules/imports/p07-w10-finalization-fault.ts`
retains the synthetic W10 client import ID
`0f4060ce-8432-4fd4-b9f2-91edd4503ec8` and source checksum
`bf783e5aaf7a25fefd5d2e5c29813a037494f479d953dc5ac08610e475b887b8`.
The related import service and unit test are present. Task controls still mark
W10 OPEN/DEFERRED. No W10 fixture, batch, Storage object, or provider state was
changed or cleaned; managed state was not queried in this phase.

---

## 10. Validation contract

The completed merge must demonstrate:

- latest Frontend-UI/UX fidelity;
- real backend wiring;
- no integration-caused RBAC regression;
- Project Manager indicator read/manage;
- retained OTP/MFA UI;
- unchanged login/redirect behavior;
- PIN `2468`;
- truthful loading/empty/error states;
- no runtime fabricated domain data;
- persistence/reload where applicable;
- unit/integration/browser tests;
- typecheck/build;
- Git diff review;
- GitHub PR review;
- post-merge smoke checks.

Skipped/not-run checks are not PASS.

Pre-existing unrelated failures must be documented separately from integration regressions.

---

## 11. Phase 2 pinned-head and three-way audit (2026-09-22)

After a fresh `git fetch origin --prune`, all four Phase 1 SHAs in section 4
remained unchanged. The audit used `git diff --name-status` for merge-base to
each head and backend to frontend, plus the non-mutating three-argument
`git merge-tree` preview. Backend changed 552 paths from the base, frontend
changed 277, and 717 paths differ directly between heads. There are 107
same-path overlaps by name; the merge preview reports 88 `changed in both`,
23 `removed in local`, and 2 `removed in remote` entries. The preview includes
text conflicts. These are audit counts, not a claim that a merge succeeded.

The 107 same-path overlaps break down as: 19 web App Router files, 44 web
feature files, 7 web layout/components, 13 web `lib` files, 14 other web source
files, 4 web config/test files, and 6 root/config/tooling files. Frontend-only
new routes/components and backend-only API/migration files still need explicit
integration treatment despite having no same-path overlap. No backend API,
Prisma migration, or shared-package path is a same-path overlap; frontend's
direct tree omits much of backend's later work, so those backend files must be
preserved, not interpreted as approved deletions.

### Frontend UI/UX standard and use-case surface

The pinned frontend tree was inspected directly with `git ls-tree`, `git show`,
and `git grep`, without checkout. The developer confirms this frontend's
use-case alignment. Neither pinned tree contains a standalone use-case
manuscript/control document; `README.md` provides system purpose and
`design-qa.md` records a scoped I01 shell comparison. The flow descriptions
below therefore use the visible routes/controls and accepted backend contracts;
they do not invent use-case IDs or a new business policy.

| User flow / routes | Frontend presentation and interaction to preserve |
|---|---|
| Staff shell and navigation | `app-shell.tsx`, `sidebar.tsx`, `constants/navigation.ts`: navy desktop sidebar, compact toggle, sticky account/header context, mobile Sheet navigation with focus/close behavior, workspace and decision-support groups, session menu. |
| Projects | `/projects`, `/projects/new`, `/projects/[projectId]`, `/edit`: directory, setup form, detail tabs, team editor, project preview, archive control. |
| Activities and delivery | Project activity list/detail plus form, status, proof, review, expense, milestone, and progress dialogs; preserve button/dialog placement and state cues. |
| Collection | `/collection`, `/collection/forms`, `/collection/forms/new`, `/collection/import`, `/collection/entry`: form design, manual entry, validation, import/mapping/review/export affordances. |
| Beneficiaries and journeys | Beneficiary directory, new/detail/edit, duplicates and evaluation-center routes; PIN dialog; project journey stages and participation history. |
| Indicators and monitoring | `/indicators`, project indicator and monitor-evaluate tabs, analytics/KPI/SADDD charts, location map, alerts, rules and recommendations; preserve filters, chart selectors, drilldowns and review dialogs. |
| Budgets and reports | Project budget and expense ledger, `/reports` and summary/preview pages; preserve report selectors, tables and download controls. |
| Administration/public | User management, profile, labels/rules, audit, backups, publication queue, transparency preview, public landing and project pages. |
| Auth and denial | `/staff/login`, recovery/reset, `/unauthorized`, public routes, account menu; prototype OTP within login is an exception to the locked provider MFA flow. |
| Components and styling | `globals.css` and `tailwind.config.ts` HSL tokens, MomoTrust heading font, PATHWAYS mark, PageHeader, cards, tabs, tables, Dialog/Sheet/Form primitives, responsive grid and mobile breakpoints; preserve visual hierarchy, empty/loading/error states, labels and control locations. |

### Locked authentication, role, and PIN findings

- Current accepted auth path: Supabase password login at `/staff/login` goes
  to `/auth/mfa`; the retained `MfaForm` uses Supabase TOTP and API
  `/auth/mfa/status`, then `/auth/workspaces` and `/auth/me` verify a single
  active workspace before `/workspace` exposes project access. Middleware
  requires verified claims, `aal2`, context and route policy; logout returns
  to `/staff/login`; denied routes use `/unauthorized`, and provider failure
  uses `/auth/access-unavailable`. The frontend branch instead can create a
  prototype session, calls `/api/prototype-mfa/*`, displays fixed OTP `123456`,
  and jumps to `/dashboard`. Preserve the backend sequence and destinations.
- Project Manager has indicator read via backend `monitoring.read` and the
  project-scoped GET routes. **Manage is missing:**
  `authorization-policy.ts` omits `indicators.create/update` for
  `PROJECT_MANAGER`; migration `0013_project_indicators_saddd_dashboard`
  grants those permissions only to M&E; frontend `access-matrix.ts` gives
  `indicators.manage` only to M&E. This exactly conflicts with the developer's
  explicit Project Manager read/manage requirement. Do not edit applied 0013
  or widen unrelated roles. A later narrowly scoped authorization-policy,
  frontend-control and append-only migration correction needs isolated tests;
  no permission was changed in Phase 2.
- Frontend PIN `2468` is checked client-side in
  `components/layout/beneficiary-access-gate.tsx` and displayed in its
  prototype-facing help text; `app/api/beneficiary-step-up/verify/route.ts`
  also defaults to `2468` but trusts a submitted prototype role, and the
  dialog does not call that route. Backend-DB's current gate instead says
  server-enforced step-up is unavailable, while beneficiary API routes require
  verified identity, permissions, organization and project scope. Keep the
  value `2468` and PIN dialog presentation, but do not let client PIN or role
  act as authorization. Until an approved server step-up contract exists,
  sensitive details stay in a truthful unavailable state behind backend checks.

### Conflict and important-overlap merge map

Each row covers the named path family, including its same-path overlaps and
frontend-only additions/deletions. Resolve file-by-file in later phases; no
blanket side selection is authorized.

| Area | Frontend standard | Backend behavior to preserve | Planned resolution | Risk |
|---|---|---|---|---|
| Pure presentation/UI: `app/*`, `features/*`, `components/pathways`, `globals.css`, Tailwind, brand/font assets | Latest layouts, pages, typography, dialogs and responsive behavior | No security rule depends on old visual markup | Keep pinned presentation, move data adapters behind it | Medium: broad component overlap |
| Frontend routes/navigation: `constants/navigation.ts`, `app-shell`, `sidebar`, project transparency route move | Latest route grouping, tabs and mobile Sheet | Protected route and post-login destinations | Reconcile route table explicitly, retain auth destinations and access checks | High |
| Auth/MFA/login: `login-form`, callback, session provider, middleware, prototype auth files | Latest login look where compatible | Supabase password/TOTP, AAL2, single workspace, logout and deny paths | Keep Backend-DB auth flow and MFA page; remove prototype session/fixed OTP success path | Critical |
| Beneficiary PIN/access gate | Latest PIN dialog and placement, value `2468` | Server authorization and current unavailable step-up boundary | Preserve presentation/value; do not release detail on client-only check | Critical |
| RBAC and route access: `access-matrix`, `can`, `data-scope`, `route-access`, guards | Visible navigation and action affordances | Canonical server policy, project/tenant scopes, aggregate/privacy boundary | Map UI controls to server permissions; document narrow PM indicator correction only | Critical |
| Frontend API clients/hooks: `pathways-client`, `mock-pathways-client`, demo providers/loaders | Existing UI loading, error and action flow | Real API response, validation and token/context headers | Adapt client methods to real endpoints; remove runtime mock imports and fake success | High |
| Shared types/contracts: `types/pathways.ts`, `types/auth.ts`, `packages/shared`, `packages/imports` | Field labels/forms and component props | Server DTO/Prisma validation, metric contract and secure import limits | Reconcile types manually; preserve backend schema/security semantics | High |
| Projects and activities feature overlaps | Directory, edit, team, activity, proof and progress dialogs | Project/activity APIs, revision checks, proof authorization/audit | Wire supported actions; isolate archive/team/expense extensions by explicit contract | High |
| Collection, beneficiaries and journeys overlaps | Builder, manual entry, import, PIN, duplicate and journey controls | Forms/import/beneficiary/journey APIs and scope | Reuse real APIs; preserve draft UX, never treat browser draft as persisted record | High |
| Monitoring, indicators, analytics overlaps | Indicator library, charts, alert/recommendation/rule views | Indicator and dashboard APIs; sensitive SADDD release policy | Wire known indicator/aggregate paths; guard undefined decision workflows | High |
| Reports, public and administration overlaps | Report tables/downloads, public pages, user/audit/backup controls | Backend privacy, publication separation and user authorization | Keep UI; connect only defined APIs, use truthful unavailable states for unresolved operations | Critical |
| Prisma/migrations/backend controllers/services | No frontend authority over database code | All Backend-DB API, migration 0001-0020, RLS/grants, W10 boundary | Preserve backend files/history; append only after 0020 if a defined feature needs it | Critical |
| Tests/fixtures/mocks | Frontend interaction tests and test-only fixtures | Backend security tests and isolated replay | Keep meaningful tests; do not promote fixture data into runtime | Medium |
| Documentation/config/tooling: CI, `.gitignore`, README, package/lockfile, Playwright/Biome | Build support for latest frontend | Backend dependency and CI replay requirements | Reconcile each config and regenerate lock only after dependency review | Medium |

### Runtime fabricated-data inventory

The frontend's production route graph imports these modules; their values and
success states are therefore runtime data, not test fixtures. The treatment
column is a Phase 3/4 plan, not work already performed.

| Runtime source and current UI consumer | Real backend path / gap | Merge treatment |
|---|---|---|
| `mocks/pathways/*` seeded by `lib/demo-state/store.ts` (`createDemoBaseline`) into `localStorage` key `pathways.demo.v1`; used across dashboard, projects, analytics, beneficiaries, public and reports | Real scoped APIs exist for projects, activities, forms/imports, beneficiaries, indicators and dashboards; other domains below have no endpoint | Remove runtime seed fallback and browser-local domain persistence; keep isolated test fixtures only |
| `lib/services/mock-pathways-client.ts` and mocked project/public/dashboard loaders | `lib/services/pathways-client.ts` on Backend-DB already implements many real API calls; no public endpoint | Adapt latest UI consumers to real client; public data stays honestly empty/unavailable until authorized API exists |
| `lib/demo-state/accounts.ts`, prototype sessions/roles and fixed OTP (`login-form`, profile, user management) | Supabase Auth, `/auth/*`, `/users` support verified login and existing-user authorization; self-profile edit/new Auth user policy is incomplete | Retain real auth and role context; no prototype login, role switch or fake account success |
| `lib/demo-state/projects.ts` (project setup/archive/team, proof, expenses, indicator reuse, milestones) | `/projects`, `/activities`, `/milestones`, `/indicators` cover defined core actions; archive/team/expense/reuse details need contract work | Reuse covered endpoints; unavailable state for unsupported actions until policy/logic is settled |
| `lib/demo-state/collection.ts` and manual-entry workspace | `/metadata/projects/:projectId/forms` and `/imports/projects/:projectId/batches` support forms, submissions and imports | Wire form/import lifecycle; browser drafts may remain only as clearly unsaved drafts |
| `lib/demo-state/beneficiaries.ts` and beneficiary directory/detail/duplicates/evaluation center | Beneficiary and journey endpoints cover registration/update/enrollment/history; no reviewed duplicate-link/notes/evaluation-center endpoint | Wire core records; keep advanced actions disabled or unavailable without fake persistence |
| `lib/demo-state/monitoring.ts`, analytics, alerts, rules and recommendations | `/dashboards` covers monitoring/SADDD reads; no alert/rule/recommendation controller | Real aggregates where permitted; unavailable action states for review/configuration/outcomes |
| `lib/demo-state/dashboard-charts.ts`, analytics chart add/move/resize | Dashboard reads exist; no saved chart-layout endpoint | Keep visual chart controls; do not claim layout saved unless durable endpoint is approved |
| `lib/demo-state/reports.ts` and `exports.ts`, reporting workspace | No report controller or approved export authorization path | Do not fake generation/download success; decide data/format/privacy contract before wiring |
| `lib/demo-state/administration.ts`, publication queue, audit and backups | No public publication, audit-read or backup/restore API; database groundwork is not a user endpoint | Preserve controls with truthful unavailable state until sensitive policy and endpoint exist |
| `lib/demo-state/proof-file-previews.ts`, activity proof dialogs | Activity proof submit/download endpoints exist | Local preview can represent an unsaved file; persisted proof must come from backend/Storage |
| Hard-coded analytics period `Q2 2026`, mock dashboard metrics, seeded locations and public projects | Dashboard API requires scoped query and sensitive-release policy; no public project API | Use real query context and honest empty/error cells; never label seeded counts as live results |
| Production copy: beneficiary gate says “Frontend demo gate” and “demo PIN”; budget section says “Deterministic mock signals”; prototype role/review controls | No production domain justification | Preserve layout, remove misleading copy and runtime demo controls without redesigning screens |

Unit-test `vi.mock`, synthetic Playwright fixtures, and isolated test data are
separate from this runtime inventory and may remain. A client `sessionStorage`
form draft is not itself a persisted record; the UI must not report it as one.

### Missing-backend and action matrix

Use-case/requirement names describe the developer-approved frontend flows.
“Temporary behavior” is the proposed safe Phase 4 state if implementation or
policy remains blocked; no such state was changed in Phase 2.

| Frontend feature/control | Existing backend? | Use case/requirement | Planned implementation | Temporary behavior if blocked |
|---|---|---|---|---|
| Staff login, MFA and workspace | Yes: Supabase Auth, `/auth/mfa/status`, `/auth/workspaces`, `/auth/me` | Verified staff access and single workspace | Keep Backend-DB flow and MFA UI under latest compatible login presentation | Access denied/unavailable, never prototype session |
| Project directory, create and edit | Yes: `/projects` GET/POST/PATCH | Scoped project setup and review | Adapt frontend fields to DTO and real response | Honest field error or unavailable state |
| Project archive and team reassign | Partial: project patch/users authorization; no explicit archive/team action controller | Project lifecycle and assignment | Trace exact transition/assignment policy before adding narrow endpoint | Controls disabled with reason; no local fake archive/assignment |
| Activity status, proof review and milestones | Yes: `/activities` and `/milestones` | Delivery tracking and proof decisions | Reuse existing revision/audit endpoints | Honest server error state |
| Activity extension, expense submit/verify/approve, budget allocation | No dedicated controller; database/history may provide groundwork | Project budget/expense workflow | Define DTO, separation, audit and project scope before backend extension | Ledger reads unavailable; actions disabled, no fake approval |
| Collection forms, manual submission, import | Yes: `/metadata/.../forms` and `/imports/.../batches` | Form design, direct entry, secure upload/mapping/process | Connect latest controls to existing state machine and limits | Unsaved draft or truthful error; no fake processed batch |
| Beneficiary register/update/archive/enroll and journey | Yes: beneficiary and journey controllers | Participant record and progression | Reuse scoped endpoints after verified auth | Detail remains unavailable when step-up unresolved |
| PIN `2468` and beneficiary sensitive detail | Partial: frontend client check; backend gate currently unavailable, API independently authorizes | Temporary PIN UX plus protected personal data | Keep PIN value/dialog; define server step-up contract before enabling sensitive detail | Dialog can show truthful unavailable state; no detail disclosure |
| Duplicate-link, notes and evaluation-center actions | No explicit controller | Beneficiary data quality/review | Require bounded dedup/review policy and audit design | View/control unavailable; no synthetic merge |
| Project indicators create/update/measure/archive | Yes for M&E; PM read only under current policy | Indicator read/manage for PM and M&E in project scope | Narrow PM correction in policy/frontend and append-only DB migration after 0020 | PM manage controls unavailable until corrected; read remains |
| Monitoring and SADDD reads | Yes: `/dashboards/home`, `/monitoring`, `/saddd`; sensitive release can return unavailable | Aggregate monitoring and privacy | Map chart fields to approved aggregate contract | Honest MISSING/unavailable, never synthetic sensitive value |
| Chart layout save/customize and indicator reuse library | No durable layout/library endpoint | Dashboard customization and indicator reuse | Clarify persistence and reuse semantics before endpoint | Preview only, no saved-success claim |
| Alerts, rules and recommendation decisions | No controller | Monitoring follow-up and configuration | Define server rules/lifecycle/actor permissions before implementation | Read/action unavailable; no fake outcome log |
| Reports, survey aggregates and downloads | No report controller; dashboard/metadata data only | Report-ready outputs | Define scoped aggregation, formats and export privacy before endpoint | Preview from approved real data only; download disabled otherwise |
| Publication queue, transparency publish and public project pages | No public/project publication controller; database supports some review state | Reviewed public disclosure | Define review/approval separation and public projection | Public empty/unavailable; no client-only publish success |
| Existing-user management | Yes: `/users` list, authorize-existing, update | Scoped user authorization | Adapt latest list/edit UI to backend policy | Denied/unavailable from server |
| New Auth user, own profile edit/password update | Partial: real Auth/password recovery, no general account-creation/profile-edit API | Staff account maintenance | Keep accepted recovery flow; define admin/self-edit policy separately | Controls unavailable, no demo account mutation |
| Audit log browse, backup/create/restore | No user controller for either | Administration and recovery | Require explicit sensitive authorization and operational design | Disabled/unavailable; never fake backup/restore |
| Custom labels and map locations | No durable label or location controller | Display configuration and geographic insights | Verify whether approved configuration/data source exists | Defaults/empty map clearly identified as unavailable data, no fabricated location |

---

## 12. Phase 3 local source integration (2026-09-22)

The developer authorized frontend real-API adaptation and runtime mock cleanup in
Phase 3. Local merge commit `4dd96289bc1ab78eb24b02fca563ccc2a8ed881a`
has parents Backend-DB `3c4f0eb48cf1656bb44d9cb118b9ecc18a9f4090` and
pinned Frontend-UI/UX `a0ea9cf98396dfd7cceddb8a1c4100aafd57abde`. The
integration branch is `integration/frontend-ui-backend-db-20260922`; merge
base is `769e524fbdfa318ef9190747c1907744b1ea7b95`. Nothing has been pushed.

Latest Frontend-UI/UX page structure, CSS, component library and brand assets
remain the presentation standard. The original Backend-DB Supabase login,
MFA/OTP UI, workspace selection and redirect flow remain. Beneficiary PIN is
`2468`; the gate refuses to release personal records while server-side PIN
verification is absent. No backend role allowlist, grant, RLS rule, migration,
managed database/Auth/Storage state or deferred P07-W10 artifact changed.

Production app, feature, component, provider and client paths no longer import
`lib/demo-state`, `mocks/pathways`, prototype providers or a mock API client.
The retained demo-state modules and synthetic mocks are isolated test fixtures;
frontend unit tests use a test-only legacy-type bridge. A previous automatic
review rejected recursively deleting the preserved test fixtures, so they
remain for tests. Browser storage in production is limited to explicitly
unsaved form/preview drafts and an API submission retry ID; no browser-local
domain record is presented as durable application data. User-facing mock,
prototype, sample and seeded copy was removed from runtime surfaces.

Existing API connections adapted in the latest UI: scoped project directory and
project detail; activities, status transitions supported by the API, proof file
submission/review and milestones; authorized users; project indicators and
measurements; journey stages; digital form create/update/publish, direct entry
and import upload/map/validate/process; project-scoped beneficiary lookup;
monitoring/SADDD aggregate reads; and existing password recovery. The browser
now passes real activity assignment user IDs, optimistic revisions and actual
proof `File` objects. UI-only route aliases undergo the existing server and
client route checks without changing backend permissions. The public pages
render an explicit unavailable view when the public publication API is absent.

| Missing backend feature | Temporary Phase 3 behavior | Required Phase 4 decision/work |
|---|---|---|
| Beneficiary PIN step-up, profile writes, media review, duplicate linkage and evaluation actions | PIN 2468 dialog denies personal record release; writes/review report unavailable; no fabricated success | Define server-verified step-up and scoped, audited beneficiary mutation/review contracts |
| Project team reassignment/archive, activity target/budget/journey/indicator links, expenses and budget allocation | Core project/activity reads and supported edits use API; unsupported form controls disabled or error; expense/ledger values unavailable | Define narrow DTOs, persistence, scope and review/audit behavior |
| Project Manager indicator create/update | Existing read remains; manage unavailable under current policy | Narrow PM permission/API/database correction only after separate authorization |
| Saved chart configuration, historical trends, geographic location data | Server aggregate charts only; layout save/trends/map show unavailable or empty state | Define durable layout/time-series/location contract with privacy review |
| Alerts, rules and recommendation outcomes | Read/review/configure/outcome actions show unavailable or disabled | Add bounded server lifecycle and role/audit rules |
| Reports, survey aggregates and export/history | Approved real project/indicator reads only; generated report claims and downloads disabled | Define scoped aggregation, suppression and export policy/endpoints |
| Publication queue, public project projection/preview | Review/publish controls unavailable; public pages show existing maintenance surface | Define reviewed public projection, approval separation and anonymous API |
| New Auth account, own profile/password edit, shared labels | Existing-user authorization and recovery use real paths; unsupported edit controls unavailable | Define account/self-service and label persistence contracts |
| Audit log browse and backup/restore | Unavailable with actions disabled; no fake events or backup success | Define sensitive operational endpoints and authorization |

Checks for the merge commit: web, API, shared and imports TypeScript checks
PASS; web unit suite PASS (73 files, 561 tests); production `next build` PASS;
Biome PASS on 259 changed code files; staged and working diff checks PASS; no
unmerged index entries or conflict markers. `git diff` against the frontend head shows
no change to latest global CSS, Tailwind theme, UI primitives or brand assets.
Visual browser regression remains Phase 5 work, and the missing backend
features remain Phase 4 work. No managed provider test or write was attempted.

## 13. Evidence register

Populate during execution.

| Evidence | Result |
|---|---|
| Phase 1 Git preflight | PASS: repository, refs, divergence, worktree, inventory verified |
| Frontend head pinned | PASS: `origin/Frontend-UI/UX` at `a0ea9cf98396dfd7cceddb8a1c4100aafd57abde` |
| Phase 2 pinned-head audit | PASS: all four SHAs unchanged after fetch |
| Frontend surface / use-case flow inventory | PASS: route, shell, feature and interaction map in section 11 |
| Merge map | PASS: three-way diff and non-mutating merge preview classified in section 11 |
| Runtime mock inventory | PASS: runtime sources separated from tests in section 11 |
| Auth/PM/PIN locked checks | PASS as an audit; PM manage discrepancy and PIN step-up gap documented |
| Local merge | PASS: `4dd96289bc1ab78eb24b02fca563ccc2a8ed881a`; parents exactly the approved Backend-DB and pinned Frontend-UI/UX heads; not pushed |
| Backend integration | PASS for existing endpoints; missing feature contracts deferred to Phase 4 |
| Phase 4 local PM indicator correction | PASS: implementation commit `8ec83415696f43d96ec3353cd3815bd5d389cc8a` adds only scoped PM create/update, append-only 0021, and focused tests; disposable 21-migration replay PASS; managed apply separately gated |
| UI fidelity validation | Source-level PASS; visual browser regression remains Phase 5 |
| Role/use-case validation | PASS at the documented local/browser/disposable scope; unsupported flows remain truthfully deferred |
| Full regression | PASS at Phase 5/6 scope; managed provider acceptance remains separately gated |
| GitHub PR | PASS: PR #5 reviewed with required `validate` workflow green |
| PR merge | PASS: normal merge commit `707315b232ce16405a8493b0cb454cdfdbe3b4d5` into `Backend-DB` |
| Post-merge validation | PASS: typecheck, focused auth/RBAC/indicator tests, build and production browser smoke |

---

## 14. Completion rule

Do not claim completion from a clean merge alone.

The workstream is complete only after:
- merged source compiles/tests;
- UI fidelity is verified;
- backend actions work or are truthfully deferred;
- GitHub PR is merged into Backend-DB under explicit developer authorization;
- task TODO/Source of Truth are reconciled.

Final state: the reviewed integration source is merged and locally verified.
The overall workstream is PARTIAL because the explicitly listed UI/backend
flows remain truthfully unavailable or partial pending future backend
contracts, and managed application of 0021 remains separately gated. No
managed provider action was authorized or performed here.

---

## 15. Phase 4 local backend and action audit (2026-09-22)

Phase 4 starts at local `8a340ff70aa11f5d280d818cc16908a3c57a7bbc` on
`integration/frontend-ui-backend-db-20260922`. This descends from Phase 3 merge
`4dd96289bc1ab78eb24b02fca563ccc2a8ed881a`; the approved Backend-DB and
Frontend-UI/UX parents remain `3c4f0eb48cf1656bb44d9cb118b9ecc18a9f4090`
and `a0ea9cf98396dfd7cceddb8a1c4100aafd57abde`. The remote tracking refs
were unchanged at the start of this local phase. Nothing was pushed.
The reviewed implementation commit is
`8ec83415696f43d96ec3353cd3815bd5d389cc8a`.

### Interactive action trace

The rows group controls that share one contract and state transition. Filters,
pagination, tabs, preview, refresh, and client-only draft controls in these
workspaces keep local UI state; server reads repeat through the listed client.
All real API calls use the verified staff/session transport and server-supplied
context; the UI role is not transmitted as authority.

| Latest UI action and classification | UI → client/hook → HTTP/controller → authorization/service/persistence → response/UI state |
|---|---|
| Login, MFA, workspace, logout, recovery: fully integrated | Retained auth components → Supabase Auth plus `/auth/mfa/status`, `/auth/workspaces`, `/auth/me` and recovery → auth guards/session verification → verified workspace or denial/redirect. No Phase 4 change. |
| Project list/detail, period edit: fully integrated; full setup/team/archive: intentionally unavailable | Project loaders/setup → `pathwaysClient.getProjects/getProject/updateProjectPeriod` → project controller → scoped project service/Prisma → refreshed state/error. Full setup cannot send the required project code/budget/team contract; team/archive has no atomic transition endpoint, so the existing form shows error and no save. |
| Activity create/edit/status, proof upload/download/review, milestones: fully integrated; target/expense additions: missing backend logic | Delivery components → activity/milestone client methods → project activity controllers → role, project assignment, revision/idempotency, audit, Prisma/private proof storage → refreshed record/error. Extra target, budget, journey and expense fields remain truthful unavailable. |
| Collection form create/edit/version/publish, direct entry and import upload/map/validate/process: fully integrated; form export: missing backend logic | Collection workspaces → digital form/direct submission/import clients → metadata/import controllers → scoped validation/state machine/Prisma/private Storage → persisted results or server error. Export control reports no file generated. |
| Beneficiary list/registration and journey stage configuration: fully integrated behind authorization; sensitive detail/write, participation/status: policy blocked/integration mismatch | Directory/beneficiary/journey clients → beneficiary and journey controllers → project scope, role, Prisma and audit where permitted. The PIN dialog cannot establish a server step-up; detail remains restricted. Participation/status dialogs lack required source form/submission or event detail and report no save. |
| Indicator list/create/update/measure/archive: narrow policy correction | Project indicator workspace → typed `pathwaysClient` methods → `/projects/:projectId/indicators` controller → `monitoring.read`, `indicators.create/update`, project assignment and service validation/audit/revision → Prisma `project_indicators` under runtime RLS → refresh/error. Phase 4 adds only Project Manager create/update in this project scope; M&E retains existing capability. |
| Monitoring and SADDD charts/filters/refresh: fully integrated; saved layout/trends/map: intentionally unavailable | Dashboard hooks/client → `/dashboards/home`, `/dashboards/monitoring`, `/dashboards/saddd` → scoped aggregate service and privacy release → approved aggregate/empty/error. Layout save, historical trends and locations have no authoritative persistence/source and make no saved-data claim. |
| Alerts, rules, recommendations and outcome controls: missing backend logic | UI → client methods throw `not_configured` or show unavailable before mutation; no controller, lifecycle, role/audit or durable outcome contract exists. No fabricated records or success. |
| Reports, survey aggregate, history and download: missing backend logic | Reporting UI uses approved project/indicator reads where possible. Report/survey/export client methods have no report aggregate/export controller or release policy; generate/save/download show unavailable with no output. |
| Publication queue, transparency and public projects: missing backend logic | UI/public loaders → publication client methods report unavailable; no approved review separation, anonymous projection or publish service. Public pages show the existing unavailable state. |
| Existing staff user list/authorization/update: fully integrated; Auth account creation/self-service: missing backend logic | User management → `getUsers/authorizeExistingUser/updateAuthorizedUser` → `/users` controller → scoped role policy and audit/Prisma. New Auth user, own profile/password edit controls report unavailable; password recovery remains the accepted auth path. |
| Audit browse, backups/restore and shared labels: missing backend logic | UI keeps existing disabled/unavailable controls; no user-facing operational controller, sensitive authorization, lifecycle or durable configuration contract. |

The project review workspace combines several unsupported expense/evaluation/
publication loaders in one view. Its `Promise.all` fails to an explicit
"Workspace unavailable" state rather than rendering zeros as real budget or
evaluation data. The dedicated indicator route is independently real-API
backed. This workspace remains a deferred integration decision; splitting its
data dependencies must preserve the frozen UI and truthful section states.

### Narrow Project Manager indicator correction

The pre-change backend/frontend policy and migration 0013 allowed M&E
`indicators.create/update` but denied Project Manager, despite the locked
requirement. The existing indicator controller/service, Prisma schema, and
project-indicator RLS policies already implement project scope, validation,
optimistic revision, audit and durable writes. Phase 4 adds exactly those two
permissions to the Project Manager server policy and frontend action matrix.
Migration `0021_project_manager_indicator_access` adds those two existing
role-permission relationships for a seeded existing PM role and updates only
the indicator branch of `pathways.p06_can`; its identity, organization, project
assignment and all other role checks remain. No other role gets a permission.
`pathways_runtime` remains NOBYPASSRLS; Data API roles cannot execute the
internal function. The migration is append-only after 0020 and has SHA-256
`b2cc161a80f2989784bf5fd304b3a5b5657b1f481ade6af41c002b56f7d035e6`.

No new persisted domain attribute or relation was needed. The existing
normalized `roles`, `permissions`, `role_permissions`, and project assignment
entities own the permission and scope; indicator rows keep their existing
constraints, indexes, RLS, grants and audit semantics. There is no Prisma
model change or historical-value backfill. The guarded disposable loopback
PostgreSQL replay tests the 0021 upgrade with an existing PM reference row,
then verifies role mapping, runtime function grants, project-scoped reads,
actual PM insert/update, M&E retention, denied roles, foreign project denial,
and revoked assignment denial. No managed PATHWAYS-dev database/Auth/Storage
operation was performed. Managed 0021 application requires separate developer
authorization and a reviewed deployment plan before PM manage works there.

### Deferred feature decisions

**Project setup/team/archive.** Missing feature: full create/edit, team
reassignment and archive from the latest form. Why backend implementation is
not yet authoritative: required code/budget fields are absent from the frozen
form, and multi-user assignment/archive policies are undefined. Recommendation:
approve field mapping and atomic scoped lifecycle/assignment contracts.
Temporary behavior implemented: form error or disabled action, with no save.
Future decision needed: project code generation, budget ownership, team
replacement and archive effects.

**Expense and activity extensions.** Missing feature: expense ledger,
verify/approve, budget allocation and activity target/budget/journey links.
Why backend implementation is not yet authoritative: approval separation,
transaction history and allocation rules are undefined. Recommendation:
design scoped event/ledger entities and review/audit policy. Temporary
behavior implemented: unavailable ledger/actions; supported activity and
milestone edits still persist. Future decision needed: financial lifecycle,
actor separation and normalized link ownership.

**Beneficiary step-up and edits.** Missing feature: PIN-authorized detail,
profile/media writes, notes, duplicate linkage and evaluation decisions. Why
backend implementation is not yet authoritative: PIN `2468` is client-visible
and cannot serve as authorization; step-up token, sensitive scope, dedup and
review policy are undefined. Recommendation: approve server-verified step-up
and scoped, audited mutation/review contracts. Temporary behavior implemented:
detail remains restricted and writes/review show no-save/unavailable. Future
decision needed: verification source, expiry, disclosure and merge semantics.

**Participation/status dialogs.** Missing feature: beneficiary participation
and enrollment transition from those dialogs. Why backend implementation is
not yet authoritative: existing backend commands require provenance/form or
event fields the frozen dialogs do not collect; inventing them would corrupt
history. Recommendation: approve a complete UI-to-command mapping or extend
the backend with a separately reviewed bounded command. Temporary behavior
implemented: explicit unavailable/no-save. Future decision needed: required
source submission, progress status, event date/reason and idempotency source.

**Project review/evaluation.** Missing feature: combined evidence, formal
evaluation and review workspace actions. Why backend implementation is not yet
authoritative: the combined view depends on absent evaluation, expense,
recommendation and publication services; the existing proof review route alone
cannot supply its full data model. Recommendation: specify section-level data
contracts and evaluation scoring/review policy. Temporary behavior implemented:
whole workspace reports unavailable; dedicated activity proof and indicator
routes remain functional. Future decision needed: independent loading and
formal evaluation state machine.

**Analytics extensions.** Missing feature: saved chart layout, historical
trends, location map and reusable indicator library. Why backend implementation
is not yet authoritative: storage owner, time series, location source and
privacy release are undefined. Recommendation: approve configuration/history
and aggregate geodata contracts. Temporary behavior implemented: real current
aggregates only, with empty/unavailable extension views. Future decision
needed: retention, projection and map precision.

**Monitoring decisions.** Missing feature: alert/rule/recommendation lifecycle
and outcome log. Why backend implementation is not yet authoritative: trigger,
review and actor policy have no server contract. Recommendation: define bounded
rule, alert and decision lifecycle with audit. Temporary behavior implemented:
unavailable read/action state, no fake outcome. Future decision needed: rule
ownership, thresholds, review and notification recipients.

**Reports and exports.** Missing feature: survey aggregate, generated report,
history and file export. Why backend implementation is not yet authoritative:
aggregation, suppression, scope and download formats are undefined.
Recommendation: define privacy-safe server aggregates and export service.
Temporary behavior implemented: approved project/indicator reads only;
generate/save/download say unavailable with no file. Future decision needed:
release rules, report snapshot semantics and formats.

**Public publication.** Missing feature: publication queue, transparency
approval and anonymous public project projection. Why backend implementation
is not yet authoritative: approval separation and public data minimization are
undefined. Recommendation: specify reviewed publication workflow and
anonymous projection. Temporary behavior implemented: queue/actions unavailable,
public pages show unavailable. Future decision needed: approver roles, redaction
and withdrawal semantics.

**Staff self-service and administration.** Missing feature: new Auth account,
own profile/password update, shared labels, audit browse and backup/restore.
Why backend implementation is not yet authoritative: each needs distinct
sensitive authority, lifecycle and operational safeguards beyond existing-user
authorization. Recommendation: define and review separate self-service,
configuration, audit and recovery contracts. Temporary behavior implemented:
existing-user authorization and recovery work; remaining controls show
unavailable/disabled without fake success. Future decision needed: identity
provisioning, self-edit bounds, label ownership and recovery operator policy.

### Verification and boundary

Source-level diff contains no layout, visual, navigation, wording, login,
redirect, MFA/OTP or beneficiary PIN change. Production frontend mock/demo
imports remain absent; `mocks/pathways` and `lib/demo-state` are isolated
test-only fixtures. Existing unsaved session drafts do not claim persistence.
The W10 checksum/import identifier above and provider state remain untouched.
Web, API and shared typechecks PASS. Focused API tests PASS (18/18) and web
role/indicator tests PASS (76/76). Scoped Biome PASS on six changed TypeScript
files. Guarded loopback replay PASS: all 21 migrations including 0021, the
feature-read and C8 API/Prisma runtime tests, existing SQL suites, real PM
indicator insert/update under RLS, denied and revoked scope checks, function
grant assertions, and disposable target cleanup. `git diff --check` and
conflict-marker inspection PASS. Full browser cross-role validation belongs to
Phase 5 and has not begun.

**HUMAN INTERVENTION REQUIRED — managed indicator policy rollout.** Before
testing PM indicator management on PATHWAYS-dev, the developer must separately
authorize applying the reviewed 0021 migration. The operator should confirm
that the managed target is on the expected 0020 line, apply the exact migration
hash above through the established migration identity, and return sanitized
migration status plus scoped PM/M&E/denied-role evidence. No credential or
provider mutation is part of this Phase 4 result. Local Phase 5 validation may
be authorized independently; managed PM validation waits for that rollout.

---

## 16. Phase 5 use-case source and regression matrix (2026-09-22)

The exact developer-specified source is the **untracked, developer-supplied**
`C:/PATHWAYS/docs/UCD and UCR - [Group 14] Capstone Manuscript rev 2026.pdf`.
SHA-256: `cb72687e0a8dec3943d39bd1fe7410e02e388453e7c601329b62c57c5ce760a2`.
The PDF has 30 pages. Reviewed PDF pages 1–6 (printed pages 68–73,
Figures 5–14) visually, and PDF pages 7–30 (printed pages 74–97,
UC001–UC026 reports) as extracted text. The diagrams and reports identify a
usable common use-case set, but UC014's cross-project description conflicts
with its own scoped exception, UC011 invokes UC014 for metadata correction,
and several claims omit newer security/provider decisions. They are sufficient
as regression input only with the authority hierarchy in section 2 and the
discrepancy register below. The PDF must not enter a repository commit.

Actor shorthand resolves to the manuscript's exact titles: `SA` =
Superuser/System Administrator, `PgM` = Program Manager, `GM` = Grant Manager,
`PM` = Project Manager, `ME` = Monitoring and Evaluation Officer, `PO` =
Project Officer, `ALL` = all six internal roles, `EXT` = external stakeholders
(donors, partners, communities, etc.). `S` means organization and, where
applicable, assigned-project scope plus verified identity. Every accepted API
path also requires the current session/MFA/workspace guard. `DB` means
PostgreSQL/Prisma with existing audit where that command implements it; `Auth`
means Supabase Auth; `Storage` means private Supabase Storage. `None` means no
persisted effect may be claimed. Results begin NOT RUN and will be reconciled
after isolated/browser testing; a screen render alone is not workflow PASS.

| UC / manuscript actor(s) | Effective actor(s) / preconditions | Frontend route / UI action | Client / hook | API endpoint | Authorization | Domain/service action | Persistence / provider effect | Expected user-visible result | Test environment | Result | Evidence | Discrepancy |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| UC001 Login — ALL | ALL; active account, AAL2, one workspace | `/staff/login` → `/auth/mfa` → `/workspace`; logout | login/MFA/session hooks | Auth sign-in; `/auth/mfa/status`, `/auth/workspaces`, `/auth/me` | active profile, verified MFA, workspace/route guard | resolve session/context | Auth session; profile read | redirect or fail-closed error | local/browser fixture | PARTIAL | PDF 7-8; web auth unit 339, API auth 502, Playwright MFA/login/route fixtures 39 PASS; live provider sign-in not exercised | D01 |
| UC002 Recover Account — ALL | ALL; registered email/provider link | `/staff/forgot-password`, update-password | recovery forms, Auth client | Auth recovery/reset | provider token/password policy | send link/set password | Auth, no fake reset | generic request; valid reset/error | local/browser fixture; no managed Auth write | PARTIAL | PDF 8; provider recovery route/build and auth unit PASS; no managed Auth reset exercised | D02 |
| UC003 Manage Profile — ALL | ALL active; self-edit unapproved | `/settings/profile` view/save/password | own-profile workspace | `/auth/me` read; no self-edit endpoint | verified self, no self-write grant | current profile view | None for edit | view; edit no-save unavailable | local/browser fixture | PARTIAL | PDF 8-9; /auth/me API tests and browser route fixture PASS; self-edit deferred | D03 |
| UC004 Users/Roles — SA,PgM,PM | SA/PgM/PM within target ceiling; existing Auth user; no self-admin | `/settings/users` list/authorize/update/deactivate | user-management client | `/users`, `/users/authorize-existing`, `/users/:id` | `users.authorize`, assignment ceiling, S | authorize existing user/scoped update | DB/audit; no new Auth account | persisted update/denial; create unavailable | local/isolated/browser fixture | PARTIAL | PDF 9-10; API users/authorization tests and six-role browser fixture PASS; no live Auth provisioning | D04 |
| UC005 Audit Logs — SA | SA; browse contract absent | `/settings/audit` filter/detail | audit unavailable state | None | no browse API | no read action | None | truthful unavailable, no synthetic events | local/browser fixture | DEFERRED | PDF 11; no audit browse API; truthful unavailable path, Phase 4 trace | D05 |
| UC006 Project Profiles — PM,SA | PM/SA `projects.create`; full form mapping unresolved | `/projects`, new/edit/archive | project loaders/setup/client | `GET/POST/PATCH /projects`; no archive/team API | `projects.read/create`, S | list/detail and supported period edit | DB for supported command; none for blocked form | real list/detail; submit/archive error | local/isolated/browser fixture | PARTIAL | PDF 11-12; API project policy/tests PASS; full latest form mapping/archive deferred | D06 |
| UC007 Activities/Milestones — ME,PO,PM,PgM,GM,SA | PM/SA create/update, PO proof submit, ME review; PgM/GM read | `/projects/:id/activities`, milestones/proof/status | activity/milestone client | `/projects/:id/activities`, `/milestones`, proof/review | activity/proof/evidence permissions, S | revision/status, proof, milestone | DB/audit/Storage as applicable | reload/denial/error; expenses unavailable | local/isolated/browser fixture | PARTIAL | PDF 12-14; API activities/access tests PASS; expense/budget workflow deferred | D07 |
| UC008 Indicator — PM,ME,SA | PM/ME manage assigned projects; SA read only | `/projects/:id/indicators` CRUD/measure/archive | indicator workspace/client | `/projects/:id/indicators` and child routes | `monitoring.read`, `indicators.create/update`, S/RLS | validate, audit, revise indicator | DB/audit; 0021 local only | saved/reloaded or denied/error | disposable DB/browser fixture; managed PM blocked | PARTIAL | PDF 14; PM/M&E local 0021 RLS replay PASS; web indicator tests PASS; managed rollout and full browser save pending | D08 |
| UC009 Digital Forms — PO,ME,SA | ME publish; SA/PM manage; PO read/entry | `/collection/forms` builder/preview/publish | collection digital-form client | `/metadata/projects/:id/forms` and version/publish | `forms.read/manage/publish`, S | versioned form metadata | DB/audit | saved/published or denied; export unavailable | local/isolated/browser fixture | PARTIAL | PDF 15; API metadata tests PASS; form export deferred | D09 |
| UC010 Encode Data — PO | PO direct entry; other scoped staff per backend policy | `/collection/entry` save/validate/submit | direct-entry workspace/client | `/metadata/projects/:id/forms/:formId/submissions` | `submissions.write`, S | validate/persist form submission/draft | DB/audit | saved/reloaded or error; generic data entry unavailable | local/isolated/browser fixture | PARTIAL | PDF 15-16; API metadata/entry tests PASS; generic multi-domain entry deferred | D10 |
| UC011 Import Metadata — PO,ME,SA | PO/SA/PM upload; ME review/process; valid project/file | `/collection/import` upload/map/validate/process | import workspace/client | `/imports/projects/:id/batches` child routes | `imports.read/upload/review/process`, S | bounded import state machine | DB/Storage/audit | persisted batch/invalid/error; no fake completion | disposable DB/browser fixture | PARTIAL | PDF 16-17; API imports suite and imports parser 15 PASS; managed batch not exercised; W10 untouched | D11 |
| UC012 Beneficiary Profiles — PO,ME,PM | scoped registration; SA/ME update; sensitive detail step-up absent | `/beneficiaries` new/detail/edit/duplicates | directory/form/detail client | `/beneficiaries/projects/:id` child routes | records read/register, profile update, S/privacy | scoped register/list; blocked edit/merge | DB/audit for registration; none for blocked edit | directory/register or restricted/no-save | local/isolated/browser fixture | PARTIAL | PDF 17-18; API beneficiary tests and PIN browser gate PASS; sensitive detail/edit/merge deferred | D12 |
| UC013 Beneficiary Journey — PO,ME,PM | PM/ME stage manage, PO read/participation; detail gated | journey-stage and beneficiary journey routes | journey stage/detail client | `/projects/:id/journey-stages`; beneficiary journey paths | `journeys.read/manage`, `participation.record`, S | stage config/history; incomplete dialog deferred | DB/audit for supported path; none for blocked dialog | real stages/history or no-save | local/isolated/browser fixture | PARTIAL | PDF 18-19; API participants tests PASS; PIN gate PASS; notes/assessment action deferred | D13 |
| UC014 Beneficiary History — PO,ME,PM | assigned project only; detail step-up absent | beneficiary detail participation/history tabs | journey history client | `/beneficiaries/projects/:id/:bid/journey` | `journeys.read`, `beneficiaries.records.read`, S | scoped chronological history | DB read only | restricted or authorized history; no cross-project leak | local/isolated/browser fixture | PARTIAL | PDF 19-20; scoped API/role tests PASS; detail stays gated without step-up | D14 |
| UC015 Monitoring Dashboard — ME,PM,PgM,GM,SA | same roles with `analytics.read`; scoped/aggregate release | `/dashboard`, `/analytics` filters/refresh | dashboard/monitoring hooks | `/dashboards/home`, `/dashboards/monitoring` | `analytics.read`, S/privacy release | aggregate indicators/participation | DB read | real aggregate/empty/error, no fake zero | local/isolated/browser fixture | PARTIAL | PDF 20-21; local C8 dashboard replay and web monitoring tests PASS; full visual filters deferred | D15 |
| UC016 Descriptive Analytics — ME,PM,PgM,GM,SA | same roles with `analytics.read` and release | `/analytics` KPI/chart/filter | analytics dashboard client | `/dashboards/monitoring` | `analytics.read`, S/privacy release | current aggregate computation | DB read | real supported charts; survey/map unavailable | local/isolated/browser fixture | PARTIAL | PDF 21; real aggregate/client tests PASS; unsupported analytics views deferred | D15 |
| UC017 SADDD Analysis — ME,PM,PgM,GM,SA | same roles under fixed G4/G8 release and project scope | `/analytics` SADDD selectors | SADDD client/hook | `/dashboards/saddd` | `analytics.read`, S/suppression | protected demographic aggregate | DB read, no raw cross-product | released bucket or withheld state | disposable DB/browser fixture | PARTIAL | PDF 21-22; disposable C8/G4/G8 replay PASS; no managed demographic release exercised | D16 |
| UC018 Rule-Based Alerts — ME,PM,PgM,GM,SA | no actor has working lifecycle endpoint | `/alerts` review/outcome | alert client unavailable | None | no accepted alert state machine | no server action | None | unavailable/no outcome/notification | local/browser fixture | DEFERRED | PDF 22-23; no alert lifecycle endpoint; no fabricated notification | D17 |
| UC019 Recommendations — ME,PM,PgM,GM,SA | no actor has working lifecycle endpoint | `/recommendations` review/outcome | recommendation client unavailable | None | no accepted linked decision contract | no server action | None | unavailable/no fake outcome | local/browser fixture | DEFERRED | PDF 24-25; no recommendation lifecycle endpoint; no fabricated outcome | D17 |
| UC020 Generate Reports — ME,PM,PgM,GM,SA | report generation contract absent | `/reports` preview/generate | reporting workspace/client | None for generation | `reports.read` is not generation authority | no server generation | None | unavailable/no saved report | local/browser fixture | DEFERRED | PDF 25; no report generation endpoint; no fake saved report | D18 |
| UC021 Visualizations — ME,PM,PgM,GM,SA | `analytics.read` and released scope; supported charts only | `/analytics`, `/reports` visualizations/filters | dashboard/reporting hooks | `/dashboards/monitoring`, `/dashboards/saddd` | `analytics.read`, S/privacy | render real aggregate | DB read | supported chart or unavailable series/map | local/isolated/browser fixture | PARTIAL | PDF 26; real dashboard/client tests PASS; unsupported map/series unavailable | D15 |
| UC022 Export Outputs — ME,PM,PgM,GM,SA | no authorized export service | `/reports` download/export | reporting unavailable action | None | no export path | no file generation | None | explicit no-file message | local/browser fixture | DEFERRED | PDF 26-27; no export endpoint; no generated file claimed | D18 |
| UC023 Configure Parameters — SA | no approved runtime configuration contract | `/settings/rules` create/edit/toggle | rule workspace/client unavailable | None | role policy alone is not endpoint | no threshold mutation | None | unavailable/no-save | local/browser fixture | DEFERRED | PDF 27-28; no approved runtime rules configuration contract | D19 |
| UC024 Backup/Recovery — SA | operational workflow/authority absent | `/settings/backups` create/restore | backup workspace unavailable | None | no app backup/restore path | no operation | None | unavailable; never fake backup | local/browser fixture; no managed restore | DEFERRED | PDF 28; no app backup/restore endpoint; managed restore not run | D19 |
| UC025 Manage Public Tracker — SA,PgM,PM,GM | no approved publication service | `/transparency` review/publish | transparency client unavailable | None | current policy must not widen | no public projection | None | unavailable/no publish success | local/browser fixture | DEFERRED | PDF 29; no publication/approval service; no fake publish | D20 |
| UC026 View Public Tracker — ALL,EXT | anonymous view requires approved publication, absent | `/public/projects`, detail | public client unavailable | None | no anonymous approved projection | no public read | None | explicit unavailable/maintenance | local/browser fixture | DEFERRED | PDF 29-30; production-browser desktop/mobile unavailable state PASS; no approved public projection | D20 |

### Use-Case Discrepancy Register

The source column cites printed manuscript pages (PDF page = printed page − 67).
These are documentation/system disagreements, not permission-change requests.

| ID / UC | Manuscript wording and page | Newer authoritative behavior | Why it wins | Recommended manuscript correction |
|---|---|---|---|---|
| D01 / UC001 | p74–75: credentials → role-specific dashboard; lock after 5 attempts; session audit | Password → provider MFA/TOTP → verified workspace → dashboard; no verified five-attempt app lock or claimed session audit | Locked auth/redirect and provider contract | Add MFA/workspace sequence; specify actual provider rate limit and audited events only when evidenced |
| D02 / UC002 | p75: active-account email verification, reset link and password-change audit | Provider-backed recovery uses generic response and callback; no separate app guarantee for those audit/active-account steps | No account enumeration or invented provider effect | Describe real generic response, provider token expiry and supported audit boundary |
| D03 / UC003 | p76: all users update contact/email/password and save audit | `/auth/me` view works; self-edit/password page reports unavailable, approved recovery remains | Self-administration contract absent | Mark update/password workflow pending; keep view and recovery separate |
| D04 / UC004 | p76–78: managers create Auth accounts and send credentials | Existing Auth users can be authorized/updated within strict target roles and project scope; new Auth account form cannot create an account | Accepted user security policy and no creation endpoint | Replace create-account claim with authorize-existing; specify separate provisioning decision |
| D05 / UC005 | p78: paginated audit log/filter/detail; view itself logged | Audit browse API absent; UI unavailable | No safe user-facing audit query contract | Mark audit browse pending; avoid claiming synthetic events or view audit |
| D06 / UC006 | p79: full project profile/budget create/update/archive | Scoped project API exists but frozen form lacks required mapping; archive/team contract absent | Backend validation and normalized ownership | Separate supported period edit from pending full setup, budget and archive |
| D07 / UC007 | p80–81: all listed actors record/update activities and expenses; PO alone records expense | Actual permissions split read, create/update, proof submit and review; expense service/ledger absent | Current role ceiling and financial integrity | Show actor-specific actions; mark expenses/approval pending |
| D08 / UC008 | p81: SA manages, indicators reused across projects and linked to framework | PM/ME manage project-owned indicators in assigned scope; SA read only; no organization-wide reuse library | Locked PM exception plus existing normalized indicator model | Specify PM/ME scoped manage, SA read; defer cross-project reuse |
| D09 / UC009 | p82: PO/ME/SA create, edit, publish and export CSV/XLSX/XLS/PDF | PO reads/enters; SA/PM manage; ME publishes; form export absent; published versions protected | Separation of duties and real API | State actual role split, version behavior and pending export |
| D10 / UC010 | p82–83: one module encodes generic project, activity and participant records/drafts | Direct entry persists approved digital-form submissions; project/activity/beneficiary use separate scoped commands | Current DTO/domain boundaries | Narrow this UC to digital direct entry and cross-reference separate commands |
| D11 / UC011 | p83–84: PO/ME/SA upload, map, validate and process; metadata error triggers UC014 | PO/SA/PM upload; ME reviews/processes; CSV/XLSX/XLS supported; UC014 is history, not import correction | Accepted import role/state machine; source's UC reference is internally inconsistent | Split upload from review/process and correct erroneous UC014 reference |
| D12 / UC012 | p84–85: profile create/update and authorized duplicate merge/link | Scoped registration/list exist; sensitive detail/edit gated; no server dedup merge contract | PIN cannot grant backend authorization; no safe merge semantics | Mark updates/merges pending and describe server step-up |
| D13 / UC013 | p85–86: participation-driven stage notes, assessment ripple and PIN access | Stage configuration/history API exists; latest dialogs lack complete command provenance; notes/assessment actions unavailable; PIN alone grants no detail | Historical integrity and backend privacy | Separate supported stage/history from pending notes, participation mapping and step-up |
| D14 / UC014 | p86: full history “across projects”; p87 exception denies beyond authorized project scope | Only authorized project-scoped history, and sensitive view waits for step-up | Privacy policy; manuscript internally contradicts itself | Remove unrestricted cross-project wording; retain the scoped exception |
| D15 / UC015,016,021 | pp87–88,93: project/date/activity/geography filters, survey/budget/map series | Only current approved aggregate query/filter set is real; absent series/map remain unavailable | No fabricated domain output or unapproved privacy release | Enumerate supported filters/charts and mark others pending |
| D16 / UC017 | pp88–89: sex/age/disability/“Other” dimensions and activity filters | Fixed G4/G8 single-project closed-period release, threshold/suppression, no arbitrary dimension or overlapping query | Locked sensitive-release policy | Describe approved dimensions/release and withheld responses |
| D17 / UC018,019 | pp89–92: automatic alert/recommendation generation, review/outcome and named notifications | No accepted runtime rule/alert/recommendation lifecycle; latest UI truthfully unavailable | No backend state, authority or audit contract | Mark lifecycle, role decisions and notification claims pending |
| D18 / UC020,022 | pp92–94: generated report and CSV/XLSX/XLS/PDF download | No report/export controller or release contract; UI generates no file | No fabricated report or sensitive export | Mark generation/export pending; retain real read-only visualizations separately |
| D19 / UC023,024 | pp94–95: SA saves thresholds and creates/restores backups | No user-facing configuration or backup/restore runtime endpoint | Sensitive operation needs reviewed authorization and recovery design | Mark both operational flows pending; do not equate operator backup with app UI |
| D20 / UC025,026 | pp96–97: SA/PgM/PM/GM approve/publish and public visitors see approved projects | No approved publication service or anonymous projection; public page is unavailable | Approval separation and data minimization undefined | Mark publication/public content pending; keep anonymous maintenance behavior |

### Phase 5 validation evidence and limits

All 26 UCs have an explicit result above: **17 PARTIAL, 9 DEFERRED, 0 full
end-to-end PASS**. PARTIAL means the supported client/API/policy portions passed
local unit, browser-fixture, or disposable-database checks, while at least one
manuscript action or a live provider transaction remains unverified. DEFERRED
means no accepted backend workflow exists and the integrated UI must give a
truthful unavailable/empty/no-save result. Neither status claims a completed
manuscript workflow. The 20 discrepancies D01–D20 remain documentation
corrections, not permissions to change accepted behavior.

The pinned `origin/Frontend-UI/UX` head is
`a0ea9cf98396dfd7cceddb8a1c4100aafd57abde`. Its `globals.css`,
Tailwind configuration, and UI primitives have no diff against the integrated
HEAD. Browser screenshots from the built application show the accepted desktop
and 390px mobile login structure and public navigation/unavailable state.
Phase 3's documented presentation exceptions remain the Backend-DB MFA/TOTP
form and truthful unavailable/empty/disabled states where the latest UI used
prototype data; the beneficiary PIN dialog preserves its placement and
`2468`. No new presentation change was made in Phase 5. Component fixtures
verify six independent role-route outcomes, beneficiary gate privacy,
navigation, and the MFA handoff. Screenshots are local `test-results` artifacts
and are not committed.

Phase 5 found two integration-caused test regressions and repaired them:
the Frontend-UI merge had dropped Backend-DB's header-only XLSX parser behavior,
and the migration inventory test had not counted authorized append-only
`0021_project_manager_indicator_access`. The actual parser logic was restored
from the approved Backend-DB parent; no import permission or provider behavior
changed. The MFA browser fixture bundled `next/image` outside Next and never
mounted; it now uses an isolated image test double. Four role-route expectations
now recognize the existing server-authorized but PIN-gated beneficiary route
without exposing protected content. No production UI behavior or role mapping
was changed for those fixture repairs.

Validation on 2026-09-23:

| Check | Result | Scope / limit |
|---|---|---|
| Focused web and API | PASS: 339 web, 502 API; 5 local DB opt-in skipped | Auth, roles, clients, PM indicators, beneficiaries, monitoring |
| Full web/shared/API/imports | PASS: 565 web, 35 shared, 661 API, 15 imports; 8 API opt-in local DB tests skipped | Unit/service regression; no live managed Auth or DB mutation |
| Browser fixtures | PASS: 39/39 focused login, MFA, six-role route, monitoring and navigation cases after repair | Mocked provider/API transport; independent role expectations |
| Built-page production smoke | PASS: 2/2; desktop/mobile login and anonymous public outage | Built Next app on loopback 3001; no authenticated provider session |
| `pnpm typecheck`; `pnpm build` | PASS | All workspace packages/apps; production build |
| Scoped Biome on eight changed source/config files | PASS | No changed-file lint finding |
| `pnpm lint` | FAIL: three existing format findings in `infra/supabase/phase7/Run-C8Postflight.mjs`, `Run-C8Preflight.mjs`, `Run-C8FixturePreflight.mjs` | Files predate this integration diff and are untouched; no security or runtime implication established |
| Guarded `Replay-Local.ps1 -Phase4IndicatorPolicy` | PASS: 21 migrations, C8/dashboard, PM/M&E indicator RLS, foreign/revoked denial, cleanup | Disposable PostgreSQL on loopback only; 0021 not applied to PATHWAYS-dev |

The default Next development-server smoke loaded stale/incompatible assets
after `next build`; its initial direct-page assertions did not validate the
current application. The dedicated production smoke config uses the completed
build and loopback port 3001; its rerun passed. Default Playwright excludes
this production-only spec so the two server modes cannot share `.next` output.
The older demo-control Playwright suites depend on removed runtime prototype
routes/local storage and are historical fixture checks, not acceptance
evidence for this integration.

Production imports from `apps/web/src/mocks` and `apps/web/src/lib/demo-state`
remain absent; both directories are retained as isolated test fixtures. The
remaining browser storage in active code is limited to unsaved draft previews
and a direct-entry idempotency key, not authoritative domain data. Public
publication, sensitive beneficiary detail, reports/export, audit browse,
alerts/recommendations, rules, and app backup/restore still have no server
success path. Their temporary states and recommendations remain in sections
12 and 15 and map to DEFERRED or PARTIAL UCs above.

The local Phase 5 validation criteria pass within the expressly authorized
repository and isolated environment. No manuscript UC is marked full PASS;
managed Auth/provider transactions and managed 0021 rollout remain outside
this authorization. Managed PM indicator behavior must be rechecked after a
separately approved migration rollout. No migration, RLS, grant, role,
managed provider, W10, push, or PR change occurred in Phase 5.

---

## 17. Phase 6 final pre-push review (2026-09-23)

`git fetch origin --prune` reconfirmed `origin/Backend-DB` at
`3c4f0eb48cf1656bb44d9cb118b9ecc18a9f4090` and the authoritative
`origin/Frontend-UI/UX` at `a0ea9cf98396dfd7cceddb8a1c4100aafd57abde`;
neither moved after Phase 5. The integration branch is
`integration/frontend-ui-backend-db-20260922`, currently based on the exact
Backend-DB head above. Its ancestry-preserving merge commit
`4dd96289bc1ab78eb24b02fca563ccc2a8ed881a` has those two exact heads
as parents. Phase 4 implementation is
`8ec83415696f43d96ec3353cd3815bd5d389cc8a`; Phase 5 validation is
`14a75ee598c4284d694f94a9519ebe3f12f6a06b`. No remote integration
branch existed before the authorized push.

Final PR gates rerun on the unchanged heads:

| Gate | Result |
|---|---|
| `pnpm typecheck`; `pnpm build`; Prisma `validate` | PASS |
| `pnpm test` | PASS: shared 35, config 3, imports 15, API 661 (8 skipped opt-in DB), web 565; UI package has no tests |
| Focused Playwright auth/navigation/RBAC/monitoring | PASS: 39/39 browser fixture cases |
| Built-page production Playwright | PASS: 2/2 desktop/mobile login and public unavailable-state cases |
| Guarded disposable `Replay-Local.ps1 -Phase4IndicatorPolicy` | PASS: all 21 migrations, C8/API runtime, PM/M&E indicator RLS, denied/revoked scope, cleanup |
| `pnpm lint` | FAIL: only three pre-existing format findings in `infra/supabase/phase7/Run-C8FixturePreflight.mjs`, `Run-C8Preflight.mjs`, `Run-C8Postflight.mjs`; no Phase 7 file is in the PR diff |
| Biome on every changed code/config file | PASS: 271 files in Windows-safe batches, no fixes |
| `git diff origin/Backend-DB...HEAD --check`; conflict-marker check | PASS; no markers |

The reviewed PR diff contains the pinned frontend source and test-only legacy
prototype fixtures, the approved Backend-DB preservation/adapters, and one
append-only migration, `0021_project_manager_indicator_access` (SHA-256
`b2cc161a80f2989784bf5fd304b3a5b5657b1f481ade6af41c002b56f7d035e6`).
No applied migration was edited. The only role-policy delta is PM
`indicators.create/update` within existing assigned-project checks; M&E is
retained. The latest frontend CSS/theme/UI primitives match the pinned
frontend head. The intentional differences are the older working provider
MFA/TOTP UI and real-API or truthful unavailable/empty states replacing
prototype data. Existing login/workspace/logout redirects remain; the
beneficiary PIN remains `2468` and cannot itself release records. Production
imports of prototype mocks/demo-state are absent. The PR diff has no `.env`,
credential/key file, private-key/JWT/token/database-URL pattern hit, W10
cleanup, or unrelated applied-migration edit. The developer-supplied manuscript
PDF remains untracked and excluded.

Remaining feature limits and recommendations are the Phase 4 matrix (sections
12 and 15) and Phase 5 UC matrix (section 16): sensitive beneficiary step-up,
full project/expense/journey additions, audit, alerts/recommendations,
reports/export, rules, backups, and public publication remain truthful
unavailable or partial pending defined backend contracts. Managed application
of 0021 still needs separate authorization before PATHWAYS-dev PM indicator
verification. The branch is ready for a normal push and a PR into `Backend-DB`;
Phase 7 PR merge is not authorized.

### Phase 6 GitHub PR creation and first inspection

The branch was pushed normally with upstream tracking; no force push and no
direct update to `Backend-DB` or `Frontend-UI/UX` occurred. GitHub PR
[#5](https://github.com/ceezey/PATHWAYS/pull/5) is open, not draft and not
merged, with base `Backend-DB` at
`3c4f0eb48cf1656bb44d9cb118b9ecc18a9f4090` and integration head
`0f6415a734ae61ab08a61d1cd2097d7707916cbd` at creation. GitHub
reported 284 changed files; all three file-list pages were inspected. The
only migration in the PR file list is new 0021, and the developer manuscript
PDF, credential files and Phase 7 scripts are absent. The final PR head after
the first task-control update was
`2a210c6588fbad15dcf536eead4f7a0ed612b4a9`. GitHub's first `validate`
run failed at the disposable migration replay step. The CI workflow inherited
from `Backend-DB` named its database `pathways_phase4_phase6_ci`, while the
existing 0006 migration guard permits the exact disposable name
`pathways_phase4_phase6_replay`. The first six migrations failed with the CI
name and passed with the permitted name in an isolated local reproduction;
the corresponding postflight also returned true. The first correction changed
only the ten CI workflow references to the disposable database name, without
editing migration 0006 or weakening its target guard; it was committed as
`8fcd750b274f9f10a1e6dc0a34e01aca6e51ba10` and normally pushed.
GitHub reran `validate` on that exact head and still failed at the same step.
The remaining cause was the workflow's escaped quote pair around its SQL
`psql -c` argument: Bash treated it as broken command syntax. A Bash probe
using the exact workflow line reproduces the failure; the corrected line
passes with the entire query as one argument. That fix was committed as
`27506bf4d78d90bd5daaab933c97787a4b90a0f1` and normally pushed.
GitHub still failed during migration 0006; temporary check annotations
confirmed 0001-0005 had completed. Byte-level review found the deeper cause:
0006 pins 0001's applied SHA-256
`8b4e25d97b493e6042287373bda015db8e1f1e6a1daf0e49b142484762e248ab`,
which matches the original CRLF working copy; the repository's committed LF
blob hashes to `1dd84e97065ea2f502647adce09bc6d3e56b72d50888037f4f3e14c81b34e48f`.
The CI fix restores the original CRLF bytes only in the disposable staged
0001 migration and verifies the pinned checksum before replay. Its exact
staging snippet passes a local hash probe, and the temporary annotations are
removed. No committed migration, guard, or managed database is changed. The
new GitHub run is recorded below. Phase 7 remains explicitly awaiting
authorization; this PR must not be merged during Phase 6.

### Phase 6 final GitHub check and handoff

The disposable-staging correction was committed as
`6ba72e95e7f07698b046e93c830256b3666d2197` and normally pushed. On
that exact PR head, GitHub `validate` passed checkout, PostgreSQL startup,
dependency installation, Prisma validation, all six staged migration replays,
the legacy-boundary postflight, and the committed-secret check. It failed at
`pnpm lint`; CI then skipped typecheck, test and build. Local all-package
typecheck, full tests and build passed before push, and all 271 changed
code/config files passed scoped Biome. Local full lint has exactly three
formatter findings in untouched `infra/supabase/phase7/Run-C8FixturePreflight.mjs`,
`Run-C8Preflight.mjs`, and `Run-C8Postflight.mjs`; `git diff
origin/Backend-DB...HEAD` contains none of those files. No other changed-file
lint failure is known. This is a pre-existing repository-wide CI gate failure,
not an integration diff regression; it must be resolved or explicitly
accepted before any separately authorized PR merge. The workflow correction
and task-control edits contain no new secret-pattern hit, applied migration
edit, W10 deviation, login/redirect change, PIN change, or RBAC change.

PR #5 remains open and unmerged into `Backend-DB`. Phase 6 source/push/PR
handoff is complete within its authorized scope. Phase 7 is awaiting explicit
developer authorization and an up-to-date check decision; no PR merge is
authorized by this phase.

---

## 18. Pre-Phase-7 CI lint closure (2026-09-23)

Preflight confirmed the integration branch and its remote were both at
`e543fb1843c9de68030875e86e32dc0bd9bc15dc`, `origin/Backend-DB`
remained `3c4f0eb48cf1656bb44d9cb118b9ecc18a9f4090`, and PR #5 remained
open and unmerged into `Backend-DB`. The developer manuscript PDF remained
untracked and excluded.

Root `pnpm lint` reproduced exactly three formatter-only findings. Biome was
run only on:

- `infra/supabase/phase7/Run-C8FixturePreflight.mjs`;
- `infra/supabase/phase7/Run-C8Postflight.mjs`;
- `infra/supabase/phase7/Run-C8Preflight.mjs`.

The resulting diff contains only standard line wrapping, a formatter-added
trailing comma, and a final newline. Argument values, ordering, control flow,
environment handling, target checks, SQL paths, and runtime configuration are
unchanged. Scoped Biome and root `pnpm lint` pass. Local `pnpm typecheck`,
`pnpm test`, `pnpm build`, and API Prisma `validate` also pass. Test totals are
config 3, shared 35, imports 15, API 661 with 8 opt-in database tests skipped,
and web 565; the UI package has no tests. No managed test or provider action
was run.

The three formatter-only files were committed separately as
`c119c125f4962bf67f48113297402ca2161b1f19` (`chore: fix pre-existing
Phase 7 lint formatting`) and normally pushed. PR #5 updated to that exact
head. GitHub then passed PostgreSQL startup, Prisma validation, the guarded
disposable replay and legacy-boundary assertion, committed-secret scanning,
root lint, and typecheck. GitHub failed in `pnpm test` before build. The run
log identifies `packages/imports/src/normalization.test.ts`: Vite cannot
resolve `@pathways/shared` because that package exports `dist/index.js`, which
does not exist in a fresh checkout before the test step. Both involved package
manifests are unchanged from `origin/Backend-DB`; local tests pass because the
required workspace build output exists after local validation. This failure
is unrelated to the three formatter changes and predates the integration
diff. The task authorization permits only those formatter fixes, so the CI
test/build-order issue was not changed.

The lint closure is therefore locally complete, but the task's required-green
GitHub condition is blocked by the fresh-checkout workspace package resolution
failure. Phase 7 remains unauthorized and not ready while the required check
is red. P07-W10, migration 0021, managed data/provider state, frontend code,
backend logic, and access policy remain untouched by this task.

### Fresh-checkout workspace test resolution closure

The developer authorized a narrow investigation and correction of the
`@pathways/imports` fresh-checkout failure. TypeScript already mapped the exact
`@pathways/shared` import to source, but Vitest attempted the package runtime
entry `dist/index.js`. A package-local `packages/imports/vitest.config.ts` now
aliases only the exact `@pathways/shared` package import to
`../shared/src/index.ts` for Vitest. Package exports, build output, production
resolution, runtime source, CI step order, and dependencies are unchanged.

The imports suite passed 15/15 with `packages/shared/dist` temporarily absent,
then the generated directory was restored. Scoped Biome, root lint (645 files),
workspace typecheck, Prisma validation, and the full build passed. The first
local full-suite run was executed concurrently with other heavy validation and
hit web UI timeouts; a standalone root rerun still had several five-second UI
timeouts while config 3, shared 35, imports 15, and API 661 with 8 opt-in
database tests skipped passed. An isolated web rerun then passed all 565 tests,
confirming local resource contention rather than a regression. No test
assertion related to the new Vitest alias failed. The clean GitHub runner is
the fresh-checkout acceptance environment and passed every workflow step,
including install, Prisma validation, guarded replay, secret scan, lint,
typecheck, all tests, and build.

The fix commit is `a29c5fe898d89b5154716506082a2c30e6cd5f7b`
(`test: resolve shared sources in imports suite`). PR #5 remained open and
unmerged with base `Backend-DB`. The previously blocked required check is
green on that head. Phase 7 is technically ready but remains explicitly
unauthorized; no merge occurred. P07-W10, migration 0021, managed providers,
database state, authentication, permissions, PIN, redirects, and frontend
presentation remain untouched.

---

## 19. Phase 7 merge and workstream closeout (2026-09-23)

Immediately before merge, `git fetch origin --prune` and GitHub inspection
confirmed PR [#5](https://github.com/ceezey/PATHWAYS/pull/5) was open,
non-draft, mergeable and clean, with base `Backend-DB` at
`3c4f0eb48cf1656bb44d9cb118b9ecc18a9f4090`, approved head
`b8136c7038eb3a97e18b4159f73a0f38b045f009`, and the required
`validate` workflow successful. The authoritative Frontend-UI/UX ref remained
`a0ea9cf98396dfd7cceddb8a1c4100aafd57abde`. No reviewed head moved.

Under explicit developer authorization, GitHub merged PR #5 using a normal
merge commit. Merge identity:
`707315b232ce16405a8493b0cb454cdfdbe3b4d5`, with parents
`3c4f0eb48cf1656bb44d9cb118b9ecc18a9f4090` and
`b8136c7038eb3a97e18b4159f73a0f38b045f009`. The integration branch was
not deleted. Local `Backend-DB` switched from its old head and fast-forwarded
only to the GitHub merge commit. This merge commit is the final integrated
code identity; the subsequent closeout documentation commit does not change
application, migration, workflow or test code.

Post-merge validation on local `Backend-DB`:

| Check | Result |
|---|---|
| Worktree and merge ancestry | PASS; only the developer manuscript PDF remains untracked; merge has the expected two parents |
| `pnpm typecheck` | PASS across all workspace packages/apps |
| Focused API authorization/route/indicator tests | PASS: 286/286 |
| Focused web login/MFA/workspace/redirect/indicator tests | PASS: 79/79 |
| `pnpm build` | PASS across all workspace packages/apps; Next production build completed |
| Production startup/browser smoke | PASS: 2/2 desktop/mobile login and anonymous truthful-unavailable public page |
| GitHub required workflow on the merged PR head | PASS: Prisma, guarded replay, secret scan, lint, typecheck, tests and build |

The latest pinned UI hierarchy, styling, navigation, interactions and
responsive behavior remain the visual standard. Intentional differences are
unchanged: the older working provider MFA/TOTP UI is retained, and actions
without an accepted backend contract show truthful unavailable, disabled,
empty or error behavior. Login, workspace, logout and denied-access redirects
remain unchanged. Beneficiary PIN remains `2468` and cannot independently
release protected records. No unrelated access grant was added; the only
integration policy exception remains scoped Project Manager indicator
create/update under existing organization/project assignment controls.
Migration 0021 still requires separately authorized managed rollout before
claiming PM indicator management on PATHWAYS-dev.

Outstanding backend recommendations and temporary implementations:

| Missing or partial feature | Recommendation | Current temporary behavior |
|---|---|---|
| Full project setup, team reassignment and archive | Approve complete field mapping and atomic scoped lifecycle/assignment commands | Supported project reads/period edits work; unsupported submits error or remain disabled with no save |
| Expense ledger, approval, allocation and activity links | Define normalized ledger/link ownership, actor separation and audit rules | Supported activity/milestone actions persist; financial extensions remain unavailable |
| Sensitive beneficiary detail, writes, media, duplicate linkage and evaluation | Add server-verified step-up and scoped audited mutation/review contracts | PIN dialog cannot grant disclosure; protected detail remains restricted and writes show no-save/unavailable |
| Participation and enrollment/status dialogs | Approve provenance, event, status, reason and idempotency command mapping | Dialog actions remain explicitly unavailable with no fabricated history |
| Combined project evaluation/review | Define section data contracts and a formal evaluation state machine | Combined workspace reports unavailable; dedicated proof and indicator paths continue to work |
| Saved analytics layout, trends, location map and reusable indicator library | Define durable configuration/history/geodata contracts with privacy review | Approved current aggregates render; extensions remain empty or unavailable |
| Alerts, rules, recommendations and outcome log | Define bounded lifecycle, role, audit and notification policy | Read/configure/review/outcome controls remain unavailable; no fake result |
| Survey reports, generated reports, history and export | Define privacy-safe aggregation, snapshot, suppression and export services | Approved reads remain; generate/save/download produce no file and report unavailable |
| Publication queue and anonymous public tracker | Define approval separation, redaction, projection and withdrawal semantics | Publication actions remain unavailable; public pages show truthful maintenance/unavailable state |
| Auth account creation, profile/password self-service and shared labels | Define separate provisioning, self-edit and configuration contracts | Existing-user authorization and password recovery work; unsupported controls remain unavailable |
| Audit browse and backup/restore | Define sensitive operational APIs, authority and recovery safeguards | Actions remain disabled/unavailable with no fabricated event or backup |

P07-W10 identifiers, fixture/provider state and deferred boundary remain
untouched. No managed database, Auth or Storage mutation occurred in Phase 7.
The source integration and PR merge are complete, but the overall workstream
status is PARTIAL because the table above contains required UI/backend flows
that remain intentionally blocked pending separate product/backend decisions.
