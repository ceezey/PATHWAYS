# PATHWAYS — Frontend-UI/UX → Backend-DB Integration Source of Truth

**Canonical task location:** `docs/frontend-backend-integration/Source of Truth.md`
**Task:** Integrate the latest GitHub `Frontend-UI/UX` branch into the current `Backend-DB` line while preserving frontend UI/UX and backend security/persistence.
**Status:** Phase 3 source reconciliation verified; local merge commit pending; no push.
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
Phase 3. The open merge still has `MERGE_HEAD` at pinned Frontend-UI/UX
`a0ea9cf98396dfd7cceddb8a1c4100aafd57abde`. The integration branch is
`integration/frontend-ui-backend-db-20260922`, based on local and origin
Backend-DB `3c4f0eb48cf1656bb44d9cb118b9ecc18a9f4090`; merge base is
`769e524fbdfa318ef9190747c1907744b1ea7b95`. The local merge commit is
pending final Git review. Nothing has been pushed.

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

Checks before commit: web, API, shared and imports TypeScript checks PASS; web
unit suite PASS (73 files, 561 tests); production `next build` PASS; Biome PASS
on 259 changed code files; staged and working diff checks PASS; no unmerged
index entries or conflict markers. `git diff` against the frontend head shows
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
| Local merge | Source/checks PASS: pinned frontend in `MERGE_HEAD`; merge commit pending |
| Backend integration | PASS for existing endpoints; missing feature contracts deferred to Phase 4 |
| UI fidelity validation | Source-level PASS; visual browser regression remains Phase 5 |
| Role/use-case validation | PENDING |
| Full regression | PENDING |
| GitHub PR | PENDING |
| PR merge | PENDING |
| Post-merge validation | PENDING |

---

## 14. Completion rule

Do not claim completion from a clean merge alone.

The workstream is complete only after:
- merged source compiles/tests;
- UI fidelity is verified;
- backend actions work or are truthfully deferred;
- GitHub PR is merged into Backend-DB under explicit developer authorization;
- task TODO/Source of Truth are reconciled.

Current state:

```text
PHASE 3 SOURCE CHECKS PASS — LOCAL MERGE COMMIT PENDING
```
