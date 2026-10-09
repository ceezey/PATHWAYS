# Change Record: codebase-modularization

**ID:** `cr-pathways-codebase-modularization`  
**Date:** 2026-10-09  
**Status:** Approved

## 1. Trigger

Developer request to modularize the whole repository for readability, after the read-only [codebase modularity audit](audit-pathways-codebase-modularity-20261009.md) (MOD-01 to MOD-21). The audience is teammates, reviewers and AI agents equally.

## 2. Current Contract

- Monorepo: `apps/api` (NestJS, Prisma), `apps/web` (Next.js App Router), `packages/{shared,imports,config,ui}`, `scripts/`, `infra/`.
- No written layout convention. Thirteen source files exceed 1000 lines; rules contracts, role maps and helpers are copied between and within apps; web imports API source by relative path; `common/` in the API and `lib/` in the web import feature code.
- API validation uses class-validator DTOs in 13 modules and zod in 19 files; web re-declares response shapes.
- The 2026-10-08 dead-code removal deliberately kept `@pathways/ui` and the NestJS `Roles` decorator; this Change Record supersedes that decision for both.

## 3. Proposed Change

Behavior-preserving restructure in 13 sub-projects. Scope: split large files, remove duplication, delete dead code, unify naming and patterns. Renamed files and folders are named for the purpose of their code.

### 3.1 Dependency direction

```
web:  app/ -> features/ -> components/, hooks/, lib/ -> @pathways/shared
api:  modules/ -> common/ -> @pathways/shared        (common never imports modules)
shared, imports, config: never import apps
```

Enforced by Biome import restrictions. The API `supabase-auth.guard` moves to `modules/auth/guards/`.

### 3.2 API module layout (`apps/api/src/modules/<domain>/`)

| File | Holds |
|---|---|
| `<domain>.module.ts` | Nest module |
| `<domain>.controller.ts`, `<purpose>.controller.ts` | One controller per file |
| `<domain>.service.ts`, `<purpose>.service.ts` | Core reads and writes; further services split by responsibility (for example `activity-proofs.service.ts`) |
| `<domain>.mapper.ts` | Database row to contract mapping, pure |
| `<domain>.helpers.ts` | Pure domain logic, no DI, no Prisma |

No `*.dto.ts`; inputs come from the contracts in `packages/shared/src/contracts/<domain>`, imported through `@pathways/shared`. `common/` holds `authz/` (identity, project scope, `withAuthorizedOperation`, `requireScopedProject`), `audit/` (`writeAuditLog`), `validation/` (zod pipe), `time/` (`businessDate`) and `prisma/` (`Tx`).

### 3.3 Web layout

Feature folder `apps/web/src/features/<domain>/`:

| Path | Holds |
|---|---|
| `components/` | One exported component per file |
| `hooks/` | `use-*.ts` state, reads and writes |
| `<domain>.reads.ts` | Authorized-read resource keys and fetchers |
| `<domain>.utils.ts` | Pure helpers |
| `<domain>.copy.ts` | Labels and constants |
| `index.ts` | Public surface; other features import only from here |

Features above about 30 files use subfolders (for example `projects/{activities,indicators,team,budget}`). `Owned*` and `Scoped*` prefixes are replaced by purpose names.

Outside features: `lib/api/{core,<domain>}`, `lib/auth`, `lib/rbac/{policy,routes,nav,transport}`, `lib/platform/{env,supabase,sentry}`, `lib/format/{date,percent,plural,tone}`, `components/{ui,common,layout}`, `test/fixtures` (replaces `mocks/` and test-only `demo-state/`).

### 3.4 Shared package layout (`packages/shared/src/`)

`contracts/<domain>/` (zod request and response schemas with inferred types), `rbac/` (role catalog, permissions, authorization policy), `rules/` (contract, metrics), `metrics/`, `validation/`, `time/`. Everything is exported through the `packages/shared/src/index.ts` barrel and imported as `@pathways/shared`, with no subpath `exports` map, so exported names stay unique across folders (amended 2026-10-09 for F2: the built API resolves `dist/index.js` and the Vitest aliases match the package root only).

### 3.5 Naming and size rules

- Kebab-case file names that describe purpose; no phase or ticket codes (`p07-w10`, `f6-gates`, `phase6`).
- Allowed suffixes: `.module`, `.controller`, `.service`, `.mapper`, `.helpers` (api); `.reads`, `.utils`, `.copy`, `.schema` (web).
- Source files target 300 lines or fewer and are flagged in review above 500; pure data tables (seed data, synonym lists) are exempt.
- Tests sit beside their source; above about 600 lines they split by concern as `<file>.<concern>.test.ts`.

### 3.6 Contracts and validation

```ts
export const createActivityRequest = z.object({ ... }).strict()
export type CreateActivityRequest = z.infer<typeof createActivityRequest>
export const activityResponse = z.object({ ... })
export type ActivityResponse = z.infer<typeof activityResponse>
```

- API validates with `@Body(new ZodPipe(schema))`; `.strict()` keeps `forbidNonWhitelisted`; queries use `z.coerce` in place of `transform: true`.
- Response schemas are types only, never parsed at runtime.
- The pipe keeps `400 { statusCode, message: string[], error: 'Bad Request' }`. Message wording on former class-validator routes may become zod wording; a slice adds a message override wherever the web displays or branches on the text. Existing zod routes keep their custom messages through the same override.
- Web `lib/api/<domain>.ts` uses the inferred types; hand-written `Api*` types and `types/pathways.ts` shrink to view models the contracts do not cover.

### 3.7 Roadmap

Foundations:

| ID | Sub-project | Contents | Findings |
|---|---|---|---|
| F1 | Dead code and hygiene | Delete `packages/ui` and its wiring, root `Dockerfile`, root `tsconfig.json`, `live-finance-workspace`, the 14 stub client methods and uncalled ones, `RolesGuard`, `@Roles`, `ROLES_KEY`, `AppRole`, duplicate Nest providers, dead shared types, and the historical infra folders; move test-only `demo-state` and `mocks` into `test/fixtures`; ignore `.worktrees` and `.superpowers` in `.gitignore` and Biome | MOD-12, 13, 14, 18, 19 |
| F2 | Shared core | `rbac/` (one role catalog, policy), `rules/` (contract, metrics), shared enums and constants, barrel exports verified by production build | MOD-01, 02, 03 |
| F3 | API core | contract pattern with one example (moved from F2), `common/{authz,audit,validation,time,prisma}`, zod pipe, guard moved to `auth/guards`, shared `requireScopedProject`, `writeAuditLog`, `businessDate`, `Tx`, lint rule for `common` | MOD-08, 09, 10, 11 |
| F4 | Web platform | `lib/api/core` with one owned-read helper, `lib/auth` absorbing `features/auth/workspace-access`, `lib/rbac` split, `lib/format`, `usePermission`, shared table head and dialog, thinner providers, lint rule for import direction | MOD-05, 10, 16 |

Domain slices, each covering contracts, API split, web client and feature components:

| ID | Slice | Reason for position |
|---|---|---|
| S1 | Projects, programs, team, project-map | Project scope and mapper used by all others |
| S2 | Activities, extensions, proofs, milestones | Largest service; depends on S1 |
| S3 | Indicators, indicator library | Used by activities, rules and dashboards |
| S4 | Beneficiaries, participants, journey, media | Provides `promoteRegistration` and `promoteParticipation` to imports |
| S5 | Collection: metadata, imports, `packages/imports` | Merges the two import flows; splits `smart-match` |
| S6 | Finance, evaluations, reports, report-pdf | Removes the reports and report-pdf cycle |
| S7 | Analytics, dashboards, rules | Merges rules-board and analytics rule files into `features/rules` |
| S8 | Public, users, profile, auth and MFA | Least coupled |

Wrap-up:

| ID | Sub-project | Contents |
|---|---|---|
| W1 | Tooling and docs | `scripts/db/{local,hosted,defense}`, `infra/supabase/phase6` renamed to `replay`, unrun tests wired into CI or retired, path aliases in one place, `docs/check.py` split, seed scripts into `prisma/seeds/`, SDD, runbook, AGENTS.md and README paths updated |

## 4. Impact

### Product

None. No screen, workflow or permission changes.

### Data / Migration

None. No schema change and no migration. Seed scripts move but produce the same rows.

### Authorization / Privacy

Authorization code moves (`common/authz`, `auth/guards`, `packages/shared/src/rbac`) without changing decisions. The dead `RolesGuard` path is removed; it never denied a request because `@Roles` had no uses.

### API

Routes, status codes and response bodies are unchanged. Validation message wording may change on former class-validator routes (section 3.6).

### UI

None visible.

### Tests

Existing tests pass unchanged apart from import paths and asserted class-validator message wording. Each slice adds a parity test that runs the old DTO and the new zod contract against the same valid and invalid inputs before the DTO is deleted.

### Documentation

SDD component and deployment paths, runbooks naming `infra/supabase/phase6`, AGENTS.md and README paths are updated in W1; each sub-project updates docs it invalidates immediately.

## 5. Alternatives Considered

- **Restraint (do nothing):** rejected; the duplicated rules contract (MOD-01) and the web-to-api source import (MOD-02) can drift silently.
- **Layer by layer** (all API, then all contracts, then web client, then features): rejected; the contracts and web-client layers become single very large branches and one failed gate blocks everything.
- **Slices only** (no foundations): rejected; early slices would invent shared pieces that later slices rework.
- **Shared TS types only** or **responses only** for contracts: rejected in favour of zod schemas, so runtime validation and types have one source.
- **Exact class-validator message emulation:** rejected as unneeded code; wording may change where nothing depends on it.
- **Archive historical infra under `infra/supabase/archive/`:** rejected; git history keeps it.

## 6. Migration / Rollback

- One branch per sub-project (`refactor/<id>-<purpose>`) in its own worktree, merged into local `dev` only after the section 7 gates pass; `origin dev` is pushed only on developer instruction.
- File moves and renames are committed separately from logic edits so `git log --follow` and review stay readable.
- Rollback: revert the sub-project merge commit; no data or schema state is involved.
- Each sub-project gets its own implementation plan, committed when it starts and removed once executed; decisions stay in this record and `docs/activity-log.md`.

## 7. Verification

Full release gates for every sub-project:

1. `pnpm typecheck`, `pnpm lint` and `pnpm test` across all packages.
2. Playwright e2e suites.
3. Local DB replay (`infra/supabase/phase6/Replay-Local.ps1`, `replay/` after W1).
4. SAD reviewers by trigger path: restraint-guardian and design-qa-agent always; organization-isolation-checker and beneficiary-privacy-guardian when auth, rbac or beneficiary code moves.
5. `pnpm --filter @pathways/api build` and `pnpm --filter @pathways/web build`, with the built API started locally.
6. Running-app smoke through `pnpm dev:local` covering the sub-project's screens.

Risk checks:

| Risk | Check |
|---|---|
| Shared barrel exports missing from the built API | F2 production build and run of `dist` |
| Zod contract accepts or rejects differently from the DTO | Parity test per contract before DTO deletion |
| Module wiring breaks after moves | Nest boot in gates 5 and 6 |
| Service splits change transaction boundaries | Split services take the caller's `tx`; none opens its own transaction |
| `Verify-Forward.ps1` records its own SHA256 | W1 renames the folder only and does not split the file |

## 8. Approval

Developer decisions, 2026-10-08 and 2026-10-09:

- Audience: teammates, reviewers and AI agents equally.
- No parallel work in apps; files may move freely.
- Scope: split files, remove duplication, delete dead code, unify naming; renames follow code purpose.
- Gates: full release gates per sub-project.
- Sharing: policy, roles and full API contracts through `packages/shared`, as zod schemas.
- Approach: foundations, then domain slices, then wrap-up.
- Conventions (section 3.1 to 3.5) approved; roadmap approved with historical infra deleted; validation wording may change.
- Written record: approved by the developer 2026-10-09.

## 9. Disposition

F1 applied 2026-10-09 on refactor/f1-dead-code:
- Hygiene: `.worktrees`, `.superpowers` and Supabase scratch folders ignored; root `Dockerfile` and `tsconfig.json` deleted.
- Dead package: `packages/ui` deleted with its seven wiring lines and lockfile entry.
- RBAC: `RolesGuard`, `@Roles` and `ROLES_KEY` removed, plus the unused shared `AppRole`, health schema and placeholder types; `SupabaseAuthGuard` is the named enforcer of `@RequirePermission`.
- Providers: a test now fails when a provider class is registered in two modules; `RulesHumanService` and `ProjectOverviewMetricsService` each have one owner.
- Web client: 28 dead pathways client methods and 16 dead types removed; the `not_configured` error code was kept because `requestFoundation` still throws it.
- Web finance: four unreferenced finance files removed with their tests.
- Web fixtures: `lib/demo-state` and `mocks` deleted, 7 live fixtures moved to `apps/web/src/test/fixtures`, 34 unused types removed.
- Infra: 99 historical files and one session-liveness script deleted (about 20.4k lines).

Deferred to later sub-projects: source-mutation proof `files` option and `proofSnapshot` (S2), `mapPublicSnapshot` in `public-projects.ts`, which is production-dead and used as a test fixture builder (S8), `ImportSummary` move (F2), infra phase6 Pester tests and security-adapter runtime-output test wiring (W1).

Out of scope and left open: MOD-B1 (age filter drift) and MOD-B2 (middleware matcher) from the audit.

F2 applied 2026-10-09 on refactor/f2-shared-core:
- RBAC: `authorization-policy.ts` and its test moved to `packages/shared/src/rbac`; every api and web importer, the Edge middleware chain and the role-routes e2e spec import `@pathways/shared`, and web source no longer imports api source.
- Roles: one catalog in `rbac/role-catalog.ts` (`roleNames`, `roleCodeByName`, `roleCodeFor`, `isCanonicalRole`); the web `canonicalRoles`, `roleCodeByName`, `roleCodesByName`, two identity label maps and the fixture role list were removed; `pathwaysRoles` keeps the UI order, typed against the catalog.
- Rules: `rule-contract`, `rule-metrics` and `rules-human-contract` live in `packages/shared/src/rules` as the union of the api and web copies; a parity test ran both against the same inputs before the web copies were deleted; the strict cell schema is `ruleMetricCellSchema`; the web rule tester adopts the api timeline schema without its two defaults; the timeline contract test moved beside the rule engine.
- Constants: the step-up denial code, PIN rule, PIN message and PIN check, direct-entry form types, overdue explanation categories and report kind codes are shared; report status sorting uses `alertSeverities`.
- Package: exports stay on the barrel (section 3.4 amended); `metric-math` is exported directly; `ImportSummary` moved to `packages/imports`; the api `dev` and `dev:watch` scripts build workspace packages first; SAD rule-engine routing covers `packages/shared/src/rules/**` and organization-isolation routing covers `packages/shared/src/rbac/**/*.ts`.

- Decisions: the browser rule tester's timeline input no longer defaults `projectStatus` and `projectArchived` (its only caller passes both, pinned by a shared test); `parseAutomaticMappingReceipt`, `proofExtensions`, `exportFormats` order, UI `projectStatuses` and the reverse-order severity enums stay per app because the copies differ.
Deferred: contract pattern and example (F3), calendar-date regex unification (slices), `descriptive-analytics` split (S7), avatar-stack "And" label (S8). Left open: `apps/api/src/modules/auth/route-access.service.ts` and `dashboard-home-authorization-parity.test.ts` import `apps/web/src/lib/rbac/route-access.ts` (api to web), proposed for F4; a literal NUL key separator in `apps/web/src/features/rules-board/rule-output-fields.tsx` (S7); remaining near-duplicate code lists in api `descriptive-analytics.ts`, `form-templates.ts` and `metadata.dto.ts`, the seed literal unions `apps/api/prisma/local-demo-data.ts:219` (overdue categories) and `apps/api/prisma/local-demo-stage-reports.ts:8` (report kinds) deferred to W1, and in web `human-review-workspace` (`SEVERITY_RANK`) and `form-builder-session-draft.ts`, each left to its slice.
