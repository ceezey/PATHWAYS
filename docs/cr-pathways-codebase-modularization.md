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

Behavior-preserving restructure in 14 sub-projects. Scope: split large files, remove duplication, delete dead code, unify naming and patterns. Renamed files and folders are named for the purpose of their code.

### 3.1 Dependency direction

```
web:  app/ -> features/ -> components/, constants/, hooks/, lib/, providers/, types/ -> @pathways/shared
api:  modules/ -> common/ -> @pathways/shared        (common never imports modules)
shared, imports, config: never import apps
```

Enforced for the API by `apps/api/src/common/import-boundary.test.ts`, because Biome 1.9 `noRestrictedImports` matches exact specifiers only and cannot express a folder rule (amended 2026-10-09 for F3a). The web direction is enforced by `apps/web/src/import-direction.test.ts` (non-test files under `components/`, `constants/`, `hooks/`, `lib/`, `providers/`, `types/` and directly under `src/` import neither `features/` nor `app/`, `features/` does not import `app/`, and no non-test file leaves `apps/web/src`), the package direction by `packages/shared/src/package-import-boundary.test.ts`, and the api to web direction by a case in `apps/api/src/common/import-boundary.test.ts`; all three are Vitest tests for the same Biome limit (amended 2026-10-10 for F4a). The api test also fails when two api modules import each other outside a recorded list, which holds only `dashboards <-> reports` after S6a (amended for S6a). The API `supabase-auth.guard` lives in `modules/auth/guards/`.

### 3.2 API module layout (`apps/api/src/modules/<domain>/`)

| File | Holds |
|---|---|
| `<domain>.module.ts` | Nest module |
| `<domain>.controller.ts`, `<purpose>.controller.ts` | One controller per file |
| `<domain>.service.ts`, `<purpose>.service.ts` | Core reads and writes; further services split by responsibility (for example `activity-proofs.service.ts`) |
| `<domain>.mapper.ts` | Database row to contract mapping, pure |
| `<domain>.helpers.ts` | Pure domain logic, no DI, no Prisma |

No `*.dto.ts`; inputs come from the contracts in `packages/shared/src/contracts/<domain>`, imported through `@pathways/shared`. `common/` holds `authz/` (application identity, project scope, `requireScopedProject`, `withAuthorizedOperation`, `readApplicationProfile`), `audit/` (`writeAuditLog`), `validation/` (`ZodPipe`), `time/` (`currentBusinessDate`) and `prisma/` (`Tx`). Private helpers that need the caller's transaction become function modules named `<purpose>.service.ts` that take `tx` (S1a: `project-team.service.ts`; S2a: `activity-access.service.ts`, `activity-metrics.service.ts`, `activity-links.service.ts`, `activity-budget.service.ts`); injectable services are split by responsibility and keep the public method names of the service they came from (amended 2026-10-12 for S2a).

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

`lib/rbac/{policy,routes,nav,transport}` are files; the route table and the decisions the API also makes (`routePolicy`, `matchRoute`, `parseRouteSelection`, `routeAllowed`, `isAggregateOnly`) live in `packages/shared/src/rbac/route-policy.ts`. `lib/auth` holds the auth platform modules (`auth-access`, `workspace-access`, `workspace-verification`, `verification-flight`, `mfa-flow`, `password-recovery`, among others); `features/auth` keeps the sign-in, MFA and recovery screens. `usePermission` replaces the local permission wrappers (amended 2026-10-10 for F4a).

`lib/format` holds `date` (`formatCalendarDay`, `formatDateOrUnavailable`), `percent`, `plural` and `tone` (`StatusTone`, `SignalTone`). `lib/api/core` holds `request` (`PathwaysClientError`, `requestFoundationResponse`, `requestFoundation`) and `request-owner` (`captureRequestOwner`); the source ticket invalidation subscription lives in `lib/services/source-mutation.ts` beside the tickets. `useAuthorizedRead` lives in `hooks/use-authorized-read.ts`, beside the provider that owns its context. Scrolling data tables share `stickyTableHeadClass` from `components/pathways/sticky-table-head.ts` (amended 2026-10-10 for F4b).

`lib/api/core` also holds `source-mutation-request` (`requestSourceMutation`, the one owner of owned source mutations that every slice's web client imports), and `lib/api/<domain>.ts` holds the domain client object (`projectsClient` in `lib/api/projects.ts`, typed from the shared response contracts). A feature with an `index.ts` is listed in `indexedFeatures` in `apps/web/src/import-direction.test.ts`: every file outside it, route pages included, imports it only through the index, and `experimental.optimizePackageImports` in `apps/web/next.config.ts` names its barrel (`@/features/<name>`) so the barrel does not enlarge route bundles; a test requires the two lists to agree. A feature with several pure-helper files names them `<concern>.utils.ts` (`project-form.utils.ts` beside `projects.utils.ts`) (amended 2026-10-12 for S1b).

`lib/api/<domain>.ts` is accompanied by `<domain>.schema.ts` files that hold the hand-written parsers of untrusted responses (`activities.schema.ts`, `activity-proofs.schema.ts`), and `lib/api/core/guards.ts` holds the response guards that more than one client shares. A feature subfolder (`features/projects/activities/`) keeps `components/`, `hooks/` and the `<domain>.{reads,utils,copy}.ts` files, and the feature index lists its exports by their leaf paths: an index file inside the subfolder that the feature index re-exports from grows the dashboard route by 23 kB under `optimizePackageImports`. A production build after a file move needs `apps/web/.next` removed first, because the barrel optimizer caches the old leaf paths (amended 2026-10-12 for S2b).

A feature's `<domain>.reads.ts` imports only the clients that every screen of its routes already loads, because the optimizer counts the import: the indicator library page grew 16 kB when its reads file also imported `pathways-client` (amended 2026-10-13 for S3b).

A feature whose screens fall into several concerns keeps one subfolder per concern, each with `components/` and its own `<concern>.utils.ts`, and a `<domain>.utils.ts` beside the subfolders for helpers that more than one concern uses (`features/beneficiaries/{directory,registration,profile,media,identity-review,journey}` with `beneficiaries.utils.ts`); a feature that only one other feature used is merged into it (`journey-config` into `beneficiaries/journey`) (amended 2026-10-13 for S4b). A screen whose state, effects and sections outgrow one file keeps its state and effects in `<concern>/hooks/use-<name>.ts`, which take only the values they read, and its sections in `<concern>/components/`, one exported component per file, with the screen reduced to calling the hook and composing the sections; tests of such a screen split as `<file>.<concern>.test.tsx` and share their fixtures through `test/fixtures/<name>-fixtures.ts` (amended 2026-10-13 for S4c). A hook that several screens share holds only what they do identically, as `useImportBatch` holds the upload identity, the automatic mapping call and the stop flag of the two import screens; a hook cut out of a screen receives the refs and callbacks it reads as parameters, not through a context (amended 2026-10-13 for S5b). A feature above about 30 files with several screens keeps one subfolder per concern (`features/collection/{forms,import,entry}`), each with `components/`, `hooks/` and its own `<concern>.utils.ts`, beside `<domain>.utils.ts`, `<domain>.copy.ts` and an `index.ts` that lists only what files outside the feature import, by leaf path. A screen with many pieces of state keeps them in one state hook that returns a flat object and exports `type State = ReturnType<typeof useState>`, the hooks after it take `(state, guard)` and destructure what they read, and a section of markup takes `Pick<State, ...>` of the hook results it renders, so a hook or a section that reads a name its parameter does not carry fails the typecheck; a screen is cut by line range with the lines it adds listed, never retyped (amended 2026-10-14 for S5c).

A feature index may also export the print primitives another feature's print view reuses (`Band`, `Table` and `td` from `@/features/reports` for the budget print receipt). `features/projects/budget` holds the budget screens, the two activity expense dialogs and the print receipt as `components/`, `hooks/` and `print/` with `budget.utils.ts`, `features/projects/evaluation/components` holds the evaluation workspace, and `features/reports` keeps `components/`, `print/`, `reports.utils.ts` and an `index.ts` that lists its leaf exports (amended 2026-10-13 for S6b).

### 3.4 Shared package layout (`packages/shared/src/`)

`contracts/<domain>/` (zod request and response schemas with inferred types), `rbac/` (role catalog, permissions, authorization policy), `rules/` (contract, metrics), `metrics/`, `validation/`, `time/`. Everything is exported through the `packages/shared/src/index.ts` barrel and imported as `@pathways/shared`, with no subpath `exports` map, so exported names stay unique across folders (amended 2026-10-09 for F2: the built API resolves `dist/index.js` and the Vitest aliases match the package root only). A duplicate `export *` name is TypeScript error TS2308 in the barrel, so a collision fails `pnpm typecheck`. Contract exports carry their domain through the section 3.6 names. The generic names exported by `rules/` (`uuidSchema`, `decimalSchema`, `operators`, `reviewSchema`, `pageSchema`, `emptyBodySchema`, `confirmOutcomeSchema`) stay until a new export would collide with one; that change renames the rules export with a `rule` prefix (amended 2026-10-10 for F3b). `contracts/common/field-schemas.ts` holds the field schemas a slice uses when a DTO becomes a contract (`lengthString`, `uuidString`, `isoDateString`, `strictIsoDateString`, `trimmedInput`, `hasUniqueItems`, `validatorLength`); they accept exactly what class-validator 0.14.4 on validator 13.15.26 accepted (amended 2026-10-10 for S1a). The same file holds `trimmedLowercaseInput` and `queryInteger`, which port a trim and lower-case `@Transform` and an `@Type(() => Number)` query bound (amended 2026-10-13 for S5a). `contracts/common/source-mutation-acknowledgement.ts` holds the receipt shape of the source mutation routes; `contracts/activities/` holds the activity, milestone, proof and extension contracts and the evidence content type constants (amended 2026-10-12 for S2a). `monitoring/metric-fields.ts` holds the field schemas the metric and indicator contracts share and is the one module kept out of the barrel, because its names are generic (amended for S3a).

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

- API validates with `@Body(new ZodPipe(schema))`; `.strict()` keeps `forbidNonWhitelisted`; queries use `queryInteger` in place of `transform: true`; it reads a scalar with `Number()` and leaves an array to fail, as `@Type(() => Number)` did, where `z.coerce.number()` would read `['5']` as 5 (amended 2026-10-13 for S5a).
- `ZodPipe` lives in `apps/api/src/common/validation/zod-pipe.ts` and runs after the global `ValidationPipe`, which passes a parameter whose design type is `Object` (any zod-inferred type) through unchanged. The global pipe has `transform: true` without implicit conversion, so numeric strings were already rejected on DTO routes and stay rejected.
- `.strict()` also rejects own `__proto__` and `constructor` body keys, which the class-validator pipe silently dropped; the contract test in `packages/shared/src/contracts/imports/import-requests.test.ts` pins both as rejected, an accepted difference from the old pipe (amended 2026-10-10 for F3b).
- A DTO field marked `@IsOptional()` becomes `.nullish()`, because class-validator skipped every rule for `null`; a slice narrows a field to `.optional()` only where `null` already failed inside the service, and its parity test pins that body as an accepted difference (S1a: `projectBudget` and `projectOfficerIds`). `@Transform` steps become `z.preprocess` (amended 2026-10-10 for S1a).
- Response schemas are types only, never parsed at runtime.
- A domain whose services are also called by seeds or by other services keeps parsing its request in the service with the shared contract and its existing 400 body, and its controller passes the body through; indicators, finance, evaluations and reports do this (amended for S3a and S6a).
- A response schema that was already parsed at runtime before the modularization stays parsed, because dropping the parse changes a status code or what the web accepts; the indicator response and list schemas are parsed by the api mapper and the web client (amended for S3a).
- The pipe keeps `400 { statusCode, message: string[], error: 'Bad Request' }`. Message wording on former class-validator routes may become zod wording; a slice adds a message override wherever the web displays or branches on the text. Existing zod routes keep their custom messages through the same override.
- A compiled DTO instance owns every declared field, `undefined` when absent, because the api compiles with `useDefineForClassFields`; a zod output owns only the keys that were sent. A service that reads which keys its input holds derives the list from the contract shape instead, and the slice's parity test pins the DTO instance keys (amended 2026-10-13 for S4a: the beneficiary profile update audit).
- A free-form `IsObject()` record keeps the class-transformer copy rules: own keys named after an `Object.prototype` method are dropped, and a `constructor` key, which crashed the old pipe with a 500, answers 400 (`formResponseValues`; amended 2026-10-13 for S5a).
- Web `lib/api/<domain>.ts` uses the inferred types; hand-written `Api*` types and `types/pathways.ts` shrink to view models the contracts do not cover.

### 3.7 Roadmap

Foundations:

| ID | Sub-project | Contents | Findings |
|---|---|---|---|
| F1 | Dead code and hygiene | Delete `packages/ui` and its wiring, root `Dockerfile`, root `tsconfig.json`, `live-finance-workspace`, the 14 stub client methods and uncalled ones, `RolesGuard`, `@Roles`, `ROLES_KEY`, `AppRole`, duplicate Nest providers, dead shared types, and the historical infra folders; move test-only `demo-state` and `mocks` into `test/fixtures`; ignore `.worktrees` and `.superpowers` in `.gitignore` and Biome | MOD-12, 13, 14, 18, 19 |
| F2 | Shared core | `rbac/` (one role catalog, policy), `rules/` (contract, metrics), shared enums and constants, barrel exports verified by production build | MOD-01, 02, 03 |
| F3a | API kernel | `common/{prisma,time,authz,audit}`, `Tx`, `currentBusinessDate`, application identity and project scope in `common/authz`, shared `requireScopedProject`, `writeAuditLog`, guard moved to `auth/guards`, import boundary test for `common` | MOD-08, 09, 10 |
| F3b | API validation and wiring | contract pattern with one example (moved from F2), zod pipe, contract naming convention, `withAuthorizedOperation` in `common/authz`, storage factory injection, wiring test for object providers | MOD-11, 13 |
| F4a, F4b | Web platform | F4a: shared route policy, `lib/rbac` split, `lib/auth`, import direction tests, `usePermission`. F4b: `lib/api/core` with one owned-read helper, `lib/format`, shared table head and dialog, thinner providers | MOD-05, 10, 16 |

Domain slices, each covering contracts, API split, web client and feature components:

| ID | Slice | Reason for position |
|---|---|---|
| S1a, S1b | Projects, programs, team, project-map. S1a: class-validator parity field schemas, project and program contracts, api split; S1b: web client and feature components | Project scope and mapper used by all others |
| S2a, S2b | Activities, extensions, proofs, milestones. S2a: contracts, controller split, mapper, helpers and the service split; S2b: web client and feature components | Largest service; depends on S1 |
| S3a, S3b | Indicators, indicator library (S3a: shared contracts and API; S3b: web client and screens) | Used by activities, rules and dashboards |
| S4a, S4b | Beneficiaries, participants, journey, media. S4a: request contracts and api split; S4b: web client, response contracts and feature layout; S4c: beneficiary component splits | Provides `promoteRegistration` and `promoteParticipation` to imports |
| S5a, S5b, S5c | Collection: metadata, imports, `packages/imports`. S5a: imports and metadata contracts, api service splits, smart-match split; S5b: web client, one import flow, collection components | Merges the two import flows; splits `smart-match` |
| S6a, S6b | Finance, evaluations, reports, report-pdf (S6a: shared contracts and API; S6b: web client and screens) | Removes the reports and report-pdf cycle |
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
Deferred: contract pattern and example (F3), calendar-date regex unification (slices), `descriptive-analytics` split (S7), avatar-stack "And" label (S8). Left open (closed by F4a): the api to web route-access import in `route-access.service.ts` and `dashboard-home-authorization-parity.test.ts`; a literal NUL key separator in `apps/web/src/features/rules-board/rule-output-fields.tsx` (S7); remaining near-duplicate code lists in api `descriptive-analytics.ts`, `form-templates.ts` and `metadata.dto.ts`, the seed literal unions `apps/api/prisma/local-demo-data.ts:219` (overdue categories) and `apps/api/prisma/local-demo-stage-reports.ts:8` (report kinds) deferred to W1, and in web `human-review-workspace` (`SEVERITY_RANK`) and `form-builder-session-draft.ts`, each left to its slice.

F3a applied 2026-10-09 on refactor/f3a-api-core:
- Kernel: `common/prisma/transaction.ts` (`Tx`, replacing 15 local aliases) and `common/time/business-date.ts` (`currentBusinessDate`, replacing the four copies that answer 503; activities uses the shared calendar date).
- Authz: `developer-access.ts` became `common/authz/application-identity.ts` (159 importers repointed); the developer bootstrap constants moved to `modules/auth/developer-bootstrap-identity.ts`; `projectScope` moved to `common/authz/project-scope.ts`.
- Scope: `requireScopedProject` and `requireScopedProjectRow` in `common/authz/scoped-project.ts` replace eleven private `requireProject` methods and the finance project check; every copy kept its select and its 404.
- Audit: `writeAuditLog` in `common/audit/write-audit-log.ts` replaces 63 inline `auditLog.create` calls and three private `audit()` helpers, with the caller's transaction and the same columns.
- Boundary: `SupabaseAuthGuard` and its tests moved to `modules/auth/guards`; `common/import-boundary.test.ts` fails when a non-test file under `common` imports `modules`; SAD organization isolation routing covers `common/authz`, `common/audit` and `modules/auth/guards`.
- Decisions: the boundary is a Vitest test because Biome 1.9.4 cannot express folder globs (ruling 2); twelve copies, not eleven, were replaced, with four behavior-neutral differences: analytics skips the UUID check its zod query already enforces, evaluations, public and finance use zod `.uuid()` with the same acceptance, metadata returned the lowercased input equal to the stored id, and three services return a row instead of the id (ruling 4); the 66 audit writes are 63 inline plus the 3 helper bodies, not 66 plus three (ruling 5); the helper is `currentBusinessDate`, not `businessDate`, which is a local variable in six files, and the activities `Intl` copy became shared `businessCalendarDate` with the same output and error path (ruling 6).

Deferred to F3b: zod pipe and the first contract, contract naming convention, `"sideEffects": false` for `packages/shared`, `withAuthorizedOperation` in `common/authz`, storage factory injection, wiring test for object providers. Left for the slices: the inline project-scope lookups (reports, activities, projects, project overview, beneficiary media, form export, analytics export, analytics insights, private proof inspection, step-up, route access) and the 47 direct `Prisma.TransactionClient` annotations in api production code (128 across apps/api including tests); the seed audit write in `apps/api/prisma/local-demo-stage-evidence.ts` to W1. The boundary scanner does not cover `require()` or `vi.mock` forms; none is used under `common`.

F3b applied 2026-10-10 on refactor/f3b-validation-wiring:
- Validation: `ZodPipe` in `common/validation/zod-pipe.ts` answers 400 `{ statusCode, message: string[], error: 'Bad Request' }` with one `<path> <zod message>` entry per issue.
- First contract: `validateImportRequest` and `ValidateImportRequest` in `packages/shared/src/contracts/imports/import-requests.ts` replaced `ValidateImportDto` on `POST imports/projects/:projectId/batches/:batchId/validate`; a parity test ran both through the configured pipes over 22 JSON bodies before the DTO was deleted; exact parity held for 20 of the 22 bodies, and the other two, own `__proto__` and `constructor` keys, are now rejected.
- Package: `packages/shared/package.json` declares `"sideEffects": false`; no shared module has a top-level side effect; web Middleware went from 112 kB to 102 kB.
- Authz: `readApplicationProfile` moved to `common/authz/application-profile.ts` (six test mocks followed it), then `withAuthorizedOperation`, its timing module and its test moved to `common/authz` (87 files repointed, 55 test mocks moved with their import); `ApplicationProfileService` stays in `modules/auth`.
- Storage: `StorageModule` provides `PRIVATE_STORAGE_FACTORIES` (`modules/storage/private-storage-factories.ts`); the activities, private proof inspection, beneficiary media, finance and reports services inject it, and every factory call stays in its `try` block, so a configuration fault still answers 503.
- Wiring: `app-module-wiring.test.ts` keys providers by token, including `{ provide, useClass | useValue | useFactory }`, and exempts the Nest `APP_*` enhancer tokens.
- SAD: beneficiary privacy routing covers `packages/shared/src/contracts/**/*.ts` and `apps/api/src/common/validation/**/*.ts`.
- Decisions: exact parity held for 20 bodies, and own `__proto__` and `constructor` keys are now rejected (ruling 3); Vitest emits no decorator metadata, so the old DTO route could only be characterized by a parity test that passes the metatype explicitly, and the compiled API is probed in the gates; the seven generic rules names stay because a barrel collision is a compile error (ruling 5); `readApplicationProfile` moved before the kernel so `common` never imported `modules` at any commit (ruling 7); the factories are a required constructor parameter, and the three tests that mocked only part of the reader module now inject fakes (ruling 9); two storage types were exported (type-only) to satisfy TS4023.

Deferred: the remaining class-validator DTO routes (their slices); the three `importOriginal` private-inspection-reader mocks in activities tests (S2); web `validateImport` typing from the contract (S5).

F4a applied 2026-10-10 on refactor/f4a-web-boundaries:
- Route policy: the route table, `matchRoute`, `parseRouteSelection`, `routeAllowed`, `isAggregateOnly`, `hasRoutePermission`, `routeUuidPattern` and the route types moved verbatim from `apps/web/src/lib/rbac/route-access.ts` to `packages/shared/src/rbac/route-policy.ts`; `route-access.service.ts` and its two tests import `@pathways/shared`, so no api file imports web source.
- RBAC: the rest of `route-access.ts` split verbatim into `lib/rbac/policy.ts`, `routes.ts`, `nav.ts` and `transport.ts` (54 importers and 2 test mocks repointed).
- Auth: `auth-access`, `workspace-access`, `workspace-verification`, `verification-flight`, `mfa-flow` and `password-recovery` moved with their tests and fixtures from `features/auth` to `lib/auth` (42 specifiers in 31 files, 2 test mocks).
- Profile: the own profile response schema moved into `lib/services/own-profile-client.ts`.
- Direction: `apps/web/src/import-direction.test.ts`, `packages/shared/src/package-import-boundary.test.ts` and an api to web case in `apps/api/src/common/import-boundary.test.ts`.
- Permissions: `usePermission` (`hooks/use-permission.ts`) and `permissionChecker` (`lib/rbac/policy.ts`) replace six local wrappers.
- SAD: organization isolation routing covers `apps/web/src/lib/auth/**/*.ts`, `apps/web/src/lib/rbac/**/*.ts` and both middleware files.
- Middleware: web Middleware stayed at 102 kB.
- Decisions: F4 split into F4a and F4b (ruling 1); three api files, not two, imported the web route table (ruling 2); `lib/auth` absorbed six modules (`auth-access`, `mfa-flow`, `password-recovery`, `verification-flight`, `workspace-access`, `workspace-verification`) because `lib`, `hooks` and `providers` imported all of them (ruling 4); `usePermission` reads `@/hooks/use-current-role` so the 60 existing mocks of that module keep applying (ruling 7); test files stay exempt from the direction tests (ruling 6); `rules-human-client.ts` no longer imported `features/analytics` at F4 start, and the 17 lower-layer imports were 16 into `features/auth` and 1 into `features/profile` (ruling 11).

Deferred to F4b: `lib/api/core` with the owned-read helper (MOD-05 core part), `lib/format/{date,percent,plural,tone}`, the shared table head and dialog check, thinner providers. Left to later sub-projects: the duplicated `['PROGRAM_MANAGER','GRANT_MANAGER']` literal versus shared `aggregateOnlyRoles`, and the `source-mutation.ts` UUID regex (S8).

F4b applied 2026-10-10 on refactor/f4b-web-helpers:
- Format: `lib/percent.ts` moved to `lib/format/percent.ts` (11 importers); `lib/format/plural.ts` replaced 3 copies (7 calls); `lib/format/date.ts` replaced 5 `formatDate` copies with `formatCalendarDay` (analytics, survey report, reporting) and `formatDateOrUnavailable` (beneficiaries, activities, which keep one-line `formatDate` wrappers); `lib/format/tone.ts` holds `StatusTone` and `SignalTone`, replacing 5 literal unions.
- Table head: `stickyTableHeadClass` replaced 4 identical header constants (23 uses); the two different ones stay.
- Dialogs: no raw `DialogContent` renders the same markup as `DialogShell` or `ConfirmationDialog`, so none was consolidated.
- Request core: `PathwaysClientError`, `requestFoundationResponse` and `requestFoundation` moved verbatim from `pathways-client.ts` to `lib/api/core/request.ts` (37 importers, 24 test mocks); the source ticket invalidation subscription moved to `source-mutation.ts`, with its start-up call left in `pathways-client.ts`.
- Owned read: `captureRequestOwner` in `lib/api/core/request-owner.ts` replaced the owner capture in the core and rules reads and the artifact download; response handling stays per client.
- Providers: `useAuthorizedRead`, `authorizedReadPolicy` and `SUMMARY_READ_STALE_MS` moved to `hooks/use-authorized-read.ts` (27 importers, 12 test mocks); the role provider's workspace cookie read and write moved to `lib/auth/workspace-access.ts`.
- SAD: beneficiary privacy routing covers `apps/web/src/lib/api/**/*.ts`.
- Middleware: web Middleware stayed at 102 kB.
- Decisions: tone types are shared but no `statusTone` is annotated, because the executive dashboard passes its tone to a signal without neutral (ruling 3); `formatCalendarDay` keeps Intl's rollover and `RangeError` (ruling 4); the shared header is a class string, not a component, because call sites merge it with `cn` and template strings (ruling 5); `pathways-client.ts` re-exports nothing, so every importer and mock moved (rulings 7 and 9); the owned-read helper covers three sites, not two (ruling 10); the three workspace cookie reads stay separate because they split the cookie differently (ruling 11); `lib/api/core/request` still imports `lib/services` until the slices rename it (ruling 7); `DialogShell` and `ConfirmationDialog` are rendered by 17 and 8 files, not 19 and 10 (ruling 2).

Deferred: `lib/services/*` renamed to `lib/api/<domain>` and duplicated read resource keys (slices); the other date and tone helpers and `DashboardSeverity` (S7); the two non-sticky header classes (S5); raw dialogs restyled onto shared dialogs (slices, with a design review); the three workspace cookie reads (S8).

S1a applied 2026-10-12 on refactor/s1a-projects-core:
- Field schemas: `packages/shared/src/contracts/common/field-schemas.ts` accepts exactly what class-validator 0.14.4 on validator 13.15.26 accepted for `Length`, `IsUUID`, `IsDateString` with and without `strict`, `ArrayUnique` and trimming transforms; `apps/api/src/common/validation/field-schemas-parity.test.ts` checks it against class-validator over 56 strings and stays until the last DTO is deleted.
- Contracts: `createProjectRequest`, `updateProjectRequest` and `createProgramRequest` (with `storedProjectStatuses` and `recordCodeInput`) replaced `CreateProjectDto`, `UpdateProjectDto` and `CreateProgramDto`; parity tests ran each DTO and contract through the configured pipes over 107 project and 20 program bodies before the DTOs were deleted; `projectResponse`, `projectSummaryResponse` and `archiveProjectResponse` type the projects routes, and `mapProject` returns `ProjectResponse`.
- Service: `projects.service.ts` (597 lines) split into `projects.mapper.ts`, `projects.helpers.ts`, `project-team.service.ts` and `project-budget.service.ts` (renamed from `project-budget.ts`); the split services take the caller's `tx`; the duplicated `PROJECT_PROFILE_TOTAL` constant has one owner; the projects module holds no direct `Prisma.TransactionClient` annotation.
- Kernel: the projects update and the project overview read use `requireScopedProjectRow`; `requestIdentity` (`common/authz/request-identity.ts`) replaces the request identity check in the projects, programs, overview metrics and project map controllers.
- SAD: beneficiary privacy routing covers `apps/api/src/**/*.mapper.ts`.
- Decisions: S1 split into S1a and S1b (ruling 1); optional DTO fields became `.nullish()`, and `null` for `projectBudget` (400 or 403 inside the service) and `projectOfficerIds` (a 500) now answers 400 at the pipe, beside the F3b prototype keys (ruling 3); the zod output key order does not affect replay because the canonical body reaches the database as jsonb (ruling 5); the overview metrics and project map schemas stay in `monitoring/` (ruling 6); split services are function modules named `.service.ts` (ruling 7); `get` and `archive` keep their own scoped lookups (ruling 8).

Deferred to S1b: `lib/api/projects` and the project methods of `pathways-client.ts`, `requestSourceMutation` in `lib/api/core`, the `features/projects` folder layout and public `index.ts`, the oversized project components, the project map fetcher and the web project types. Left to later slices: 20 controllers that still repeat the request identity check, 41 direct `Prisma.TransactionClient` annotations in api production code, and the stored project status copies in `monitoring/role-overview.ts`, `rules/rule-contract.ts`, `rules/rule-metrics.ts` and `dashboards/descriptive-analytics.ts` (S7).

S2a applied 2026-10-12 on refactor/s2a-activities:
- Contracts: `createActivityRequest`, `updateActivityRequest`, `transitionActivityRequest`, `recordActivityProgressRequest`, `reserveActivityProofRequest`, `recordOverdueExplanationRequest`, `reviewActivityUpdateRequest`, `saveMilestoneRequest`, `updateMilestoneRequest` (`contracts/activities/activity-requests.ts`) and `createActivityExtensionRequest`, `verifyActivityExtensionRequest`, `decideActivityExtensionRequest` replaced thirteen class-validator DTO classes; parity tests ran each DTO and contract through the configured pipes (285 checks for the activity and milestone DTOs, 47 for the extension DTOs) before the classes were deleted; `activities.dto.ts` keeps `JourneyStageInputDto` and `SaveJourneyConfigurationDto` for S4. `countInput` and `pesoAmountInput` joined `field-schemas.ts` and `project-requests.ts` uses them; the evidence constants live in `contracts/activities/activity-evidence.ts`; `activity-responses.ts` and `sourceMutationAcknowledgement` type the mapper and every public service method that returns a mapped shape.
- Controllers: `activities.controller.ts` (three controllers) became five files by purpose (`activities`, `activity-updates`, `activity-proofs`, `activity-milestones`, `activity-evidence`); a module route table test and an HTTP routing test pin the 20 routes, their permissions and the order of the fixed GET segments.
- Services: the 2479-line `activities.service.ts` became eight injectable services (`ActivitiesService` about 180 lines for the reads, `ActivityLifecycleService`, `ActivityProgressService`, `ActivityEvidenceService`, `ActivityProofsService`, `ActivityProofFinalizeService`, `ActivityReviewService`, `ActivityMilestonesService`, each under 360 lines), four function modules that take the caller's `tx`, `activities.mapper.ts`, `activities.helpers.ts` and `activity-proof.helpers.ts`; the extension service moved its row mapper and three pure helpers out (454 to about 370 lines). Public method names and bodies are unchanged and the moves were proven verbatim line by line.
- Kernel: `requestIdentity` replaced the guard copy in six controllers; `requireScopedProjectRow` replaced three inline project lookups; the two inline copies of the active assignment check call `requireActiveAssignment`; the inspection service takes `Tx` and derives its file extensions from `evidenceExtension`.
- Tests: the DTO validation cases became contract tests; the three `importOriginal` mocks of `private-inspection-reader` that F3b left became injected fake factories; eleven test files and four seed files build the split services (`retarget-service.mjs` and `seed-services.mjs`).
- Decisions: S2 split into S2a and S2b (ruling 1); eight injectable services and four function modules (ruling 2); controllers split with the fixed GET segments first (ruling 3); optional DTO fields became `.nullish()`, and `null` for `budgetAllocation` (400 or 403 inside the service) and `indicatorIds` (a 500) now answers 400 at the pipe, beside the F3b prototype keys (ruling 4); `title` and `description` stay untrimmed before the length rule, as the DTOs had them (ruling 5); no milestone response contract (ruling 8); `list`, `get` and the inspection lookup keep their inline project lookups (ruling 10); `if ('acknowledgement' in reservation)` became `if (reservation.acknowledgement)` (ruling 12).

Deferred to S2b: `lib/api/activities` and the activity, extension, evidence and proof methods of `pathways-client.ts`, `private-proof-client.ts`, the `features/projects` activity folder layout, the four oversized components, the hand-written web activity types, the place of `activityExtensionSchema`, and the dead `files` option and `proofSnapshot` of `source-mutation.ts` (F1 deferral). Left to later slices: 18 controllers that still repeat the request identity check and 40 direct `Prisma.TransactionClient` annotations in api production code.

S1b applied 2026-10-12 on refactor/s1b-projects-web:
- Client: `lib/api/projects.ts` holds `projectsClient` (the seven project methods moved out of `pathways-client.ts` plus `getProjectMap`), typed from `ProjectResponse` and `ArchiveProjectResponse`; 22 screens and hooks, 2 client tests and 26 test mocks follow; `requestSourceMutation` moved to `lib/api/core/source-mutation-request.ts` for S2b, S3b and S5b; the web `StoredProjectStatus` is the shared type.
- Layout: `features/projects/components/`, `team/`, `projects.reads.ts`, `projects.utils.ts`, `project-form.utils.ts` and an `index.ts`; the activity, indicator, budget, evaluation and rules-panel files stay at the feature root until S2, S3, S6 and S7 move them; `ProjectPhaseFiveWorkspace` is `ProjectReviewWorkspace`.
- Surface: every file outside the feature, route pages included, imports it through the index; `indexedFeatures` and `surfaceViolation` in `import-direction.test.ts` enforce it and `experimental.optimizePackageImports` keeps route bundles the same size (a plain barrel grew every `/projects` route to 397 kB, `/print/receipts/[expenseId]` from 133 kB and `/analytics` and `/dashboard` by about 80 kB).
- Components: the review workspace lost its `indicators` and `transparency` views, the Add Indicator dialog and `project-review-utils.ts`, which no route rendered, and went from 716 to 214 lines with `evidence-view.tsx` at 210; the setup form went from 588 to 409 lines with `project-setup-fields.tsx` at 198; the selectors went from 474 to 403 lines with `team-selection.utils.ts` at 80; the file-private `ScopedProjectSetupForm`, `ScopedReport` and `OwnedSourceMutationRecovery` became `ProjectSetupFormContent`, `ProjectReportRecord` and `SourceMutationRecoveryContent`.
- Routes: Middleware stayed at 102 kB; the layout and surface change (Task 6) changed 0 routes. Against the Task 0 baseline, Tasks 1 to 5 shrank the three review routes (budget, evidence, monitor-evaluate) 3 kB, `/alerts`, `/recommendations/[id]` and `/reports*` 13 kB, `/transparency` 12 kB and `entries/new` 1 kB, and grew `/projects*`, `/beneficiaries*`, `/collection*`, `/analytics`, `/dashboard` and `/settings/users` by 1 to 2 kB; the net bundle shrinks and the growth is accepted.
- Decisions: one plan of ten tasks (ruling 1); `getProjectsForRole` kept (ruling 3); mocks split or doubled, not rewritten (ruling 5); unreachable views deleted, the `view` type narrowed to the three live values so a page that asks for a removed view fails to compile (ruling 7); index plus `optimizePackageImports` (ruling 9); the 1 to 2 kB growth on some routes accepted against the Task 0 baseline, which predated the Task 1 to 5 web changes.

Deferred: the six project list read keys (`projects`, `review-projects`, `rules-editor-projects`, `rules-project-choices`, `publication-projects`, `report-projects`; the three `projects.read` readers with default freshness could share one key) stay with S6, S7 and S8, whose files own them; the `ExpenseRecord` type in `types/pathways.ts` is now unused (S6); `lib/services/*` renames. Later plans add their feature to `indexedFeatures` and `optimizePackageImports` instead of writing another rule.

S2b applied 2026-10-12 on refactor/s2b-activities-web:
- Client: `lib/api/activities.ts` holds `activitiesClient` (16 methods) and `lib/api/activity-extensions.ts` `activityExtensionsClient` (4), with the hand-written parsers in `activities.schema.ts` and `activity-proofs.schema.ts`, `isFiniteNonNegative` in `lib/api/core/guards.ts` and `privateProofClient` in `lib/api/proof-inspection.ts`; 23 production files, 6 client tests and 18 mock files follow, four client tests moved beside their code, and `pathways-client.ts` went from 2394 to 1521 lines. The wire bodies are checked against the S2a request contracts with `satisfies`, and the extension methods take the three extension request types.
- Types: of twelve probed pairs only `ActivityCapabilities` and `AssignableProjectOfficer` equal a S2a response type and became aliases; the web `Activity` (numeric budgets), the proof limits, declaration, reservation and finalize types (string content types, receipt typed `unknown`), `EvidenceList` (two more review states), `ActivityOverdueExplanation`, `ActivitySummary` and the context row differ from the response schemas and stay view models.
- Layout: the 35 activity files moved to `features/projects/activities/{components,hooks}` with `activities.{reads,utils,copy}.ts`; the feature index lists the four activity exports by leaf path (a sub-index grew `/dashboard` from 673 to 696 kB); `ScopedActivityFormDialog`, `ScopedActivityProofDialog`, `OwnedReview` and `OwnedInspection` became `*Content` names; the four activity expense files stay for S6.
- Components: the form dialog went from 846 to 419 lines (fields and draft hook), the proof dialog from 773 to 336 (upload hook and utils), the detail panel from 800 to 155 (content, history, actions, proof utils) and the workspace from 750 to 490 (card, status summary, expenses and filters hooks); every split was proven line by line, and new tests pin the form draft effects and the expense rows before they moved.
- Contracts: `activityExtensionSchema` became `activityExtensionResponse` in `contracts/activities/activity-extension-response.ts` with a strict-shape test; the web `categoryLabels` moved to `activities.copy.ts`; `activities.reads.ts` holds the activity list, detail and officers reads with a test that pins their keys, permissions and freshness.
- Cleanup: the multipart `files` option, its bound checks and `proofSnapshot` left `source-mutation.ts` (356 to 315 lines; F1 deferral).
- Routes: Middleware stayed at 102 kB; Tasks 1 and 2 shrank 18 routes by 1 to 4 kB and grew `/alerts/repository` by 1 kB, and the layout move (Task 3) grew `/projects/[projectId]/budget`, `evidence` and `monitor-evaluate` by 1 kB each against the post-Task 2 base and changed no other route; at the end state 19 routes differ from the post-Task 2 base, none by more than 2 kB (`budget`, `evidence` and `monitor-evaluate` +2 kB).
- Decisions: one plan of eleven tasks (ruling 1); parsers kept and two types aliased (ruling 3); `satisfies` on wire bodies (ruling 4); both clients run the same characterization cases (ruling 5); no activities sub-index (ruling 9); every production build after a move starts from a clean `.next` (ruling 10).

Deferred: the activity read keys of analytics, rules board, collection, beneficiary loaders and the review workspace (their slices); the `finance-*` read keys in `use-activity-expenses.ts` and the budget module (S6); `definitiveRejection` and `nextDay`; one component per file in `activity-detail-sections.tsx` and `evidence-panels.tsx`. Later plans list their feature exports by leaf path in the feature index instead of adding a sub-index.

S3a applied 2026-10-13 on refactor/s3a-indicators-api:
- Contracts: the indicator request and response schemas moved verbatim from `packages/shared/src/monitoring/metric-contract.ts` to `packages/shared/src/contracts/indicators/indicator-requests.ts` and `indicator-responses.ts`; the metric cell, contract version and recipes moved to `monitoring/metric-cell.ts` and the shared field schemas to `monitoring/metric-fields.ts`, so the dashboard contract and the indicator contracts do not import each other; `metric-contract.ts` keeps the dashboard and SADDD contracts.
- Names: `createIndicatorRequest`, `createIndicatorDraftRequest`, `updateIndicatorRequest`, `archiveIndicatorRequest`, `recordIndicatorMeasurementRequest`, `createIndicatorLibraryEntryRequest`, `createIndicatorFromLibraryRequest`, `indicatorLibraryEntryResponse`, `indicatorResponse` and `indicatorListResponse`, each with its inferred type; the identical `MonitoringIndicator` and `ProjectIndicator` became `IndicatorResponse` and the two identical list schemas `indicatorListResponse`; audit entity strings did not change.
- API: `indicators.dto.ts` deleted; `indicators.helpers.ts` (`parseIndicatorRequest`, `monitoringSqlError`, `sameLibraryDefinition`, `indicatorIdOrNotFound`) and `indicators.mapper.ts` (`releasedNulls`, `toIndicatorResponse`, `toLibraryEntryResponse`); `IndicatorMeasurementsService` holds `measure`; `IndicatorsService` went from 574 to 390 lines; five seed files and three tests changed their measurement call target and build the new service beside `IndicatorsService`; the three indicator controllers use `requestIdentity`.
- Tests: a characterization test pinned the indicator 400 body for every write route and the library copy path, the 403 on all eleven indicator controller routes and the archive parse-before-identity order before anything moved.
- SAD: rule-engine determinism routing covers `packages/shared/src/contracts/indicators/**/*.ts`.
- Decisions: S3 split into S3a and S3b (ruling 1); the metric cell and field schemas got their own modules to avoid an import cycle (ruling 2); indicator requests stay validated in the service, not by `ZodPipe`, because seeds and the library copy path call the services and the indicator 400 body differs from the pipe's (ruling 6); the indicator contracts keep their own zod field rules rather than the S1 class-validator ports (ruling 7); the indicator response schemas stay parsed at runtime (ruling 8); measurements split from reads and definition writes, with `measure` keeping its own authorized operation as before (ruling 11).

Deferred to S3b: `lib/api/indicators.ts`, `features/projects/indicators/`, the workspace split, `indicators.reads.ts` and the web aliases `ProjectIndicator`, `CreateIndicatorInput` and `UpdateIndicatorInput`. Left to later sub-projects: the dashboard and SADDD contracts in `metric-contract.ts` (S7).

S3b applied 2026-10-13 on claude/modularization-s3b-9ept8o (the environment-assigned slice branch, in place of refactor/s3b-indicators-web):
- Client: `lib/api/indicators.ts` holds `indicatorsClient` (8 methods) and `indicatorLibraryClient` (3, merged from `lib/services/indicator-library-client.ts`); 8 production files (17 calls), 10 mock factories and the library manager test follow, and `pathways-client.ts` went from 1521 to 1361 lines. Inputs take the S3a request types, the measurement keeps its own ticket call and unwrapped recovery error, and the characterization tests ran against the old and the new client before the old methods went.
- Layout: the seven indicator files moved to `features/projects/indicators/{components}` with `indicators.{copy,utils,reads}.ts`; the feature index lists `IndicatorLibraryManager` and `ProjectIndicatorsWorkspace` by leaf path (no sub-index, as in S2b); the two app pages already imported through the index.
- Components: the workspace went from 952 to 408 lines (form 255, editor 187, utils 100, copy 50) and the library manager from 401 to 206 (entry form 202); every split was proven line by line (`lost 0`).
- Reads and types: `indicators.reads.ts` holds the library read (one key, enabled flag and freshness left to the call site) and the project indicator read, with a test that pins keys, permissions and freshness; the binding choices read stays in the workspace because moving it made `/indicators/library` load `pathways-client` (280 to 296 kB); the web alias `ProjectIndicator` was replaced by `IndicatorResponse` in six files.
- Tests: the two indicator read cases of `pathways-client.monitoring.test.ts` moved to `lib/api/indicators.read.test.ts`; web 221 files and 1983 tests became 224 and 1998.
- Routes: Middleware stayed at 103 kB in the cloud container (102 kB on Windows builds); against the Task 3 baseline five routes are 1 kB smaller and none grew, against the Task 0 baseline `/alerts/repository` went from 322 to 312 kB and eight routes moved by 1 kB.
- Decisions: one plan of eight tasks (ruling 1); one client file with two objects and no parser file (ruling 2); both clients run the same cases (ruling 4); 17 calls and two read cases, not 18 and three (ruling 6); no hooks folder and no sub-index (ruling 7); the binding read stays inline (ruling 9); six alias importers (ruling 10); every production build starts from a clean `.next` (ruling 12).

Deferred: `features/analytics/use-monitoring-read` import of the workspace until S7 gives analytics an index; the read keys of analytics, rules board, collection and dashboard that call the indicator client (their slices); `recoverSourceMutation` keeps its indicator branch.

S4a applied 2026-10-13 on the S4a slice branch:
- Contracts: `beneficiaryListQuery`, `registerBeneficiaryRequest`, `updateBeneficiaryRequest`, `archiveBeneficiaryRequest`, `enrollBeneficiaryRequest` and `resolveDuplicateRequest` (`contracts/beneficiaries/beneficiary-requests.ts`), `journeyStageInput`, `saveJourneyStagesRequest`, `recordJourneyEventRequest` and `correctJourneyEventRequest` (`contracts/journeys/journey-requests.ts`) and `reserveBeneficiaryMediaRequest` (`contracts/beneficiaries/beneficiary-media-requests.ts`) replaced the DTO classes of the beneficiaries, participants and beneficiary media modules and the two journey stage classes of `activities.dto.ts`, which is deleted; parity tests ran each DTO and contract through the configured pipes over 109 beneficiary, 82 journey and 38 media bodies before the DTOs were deleted.
- Services: `beneficiaries.service.ts` (1461 lines) split into `beneficiaries.service.ts`, `beneficiary-registration.service.ts` (`BeneficiaryRegistrationService`, which `ImportsService` now injects), `beneficiary-registration.helpers.ts`, `beneficiaries.helpers.ts`, `beneficiaries.mapper.ts` and `registration-context.service.ts`; `participants.service.ts` (703 lines) split into `participants.service.ts` (participation promotion), `journey-stages.service.ts`, `beneficiary-journey.service.ts` and `journey-stages.mapper.ts`, with one controller per file; every move was checked line for line.
- Duplicates: the participation `normalizedCode` was removed for the identical `canonicalCode` after a characterization test.
- Kernel: `requestIdentity` in the beneficiaries, identity review, journey and media controllers; `beneficiary-progress.ts` takes `Tx`.
- SAD: beneficiary privacy routing covers `apps/api/src/modules/beneficiaries/**/*.ts`, `apps/api/src/modules/beneficiary-media/**/*.ts` and `apps/api/src/modules/participants/**/*.ts`.
- Decisions: S4 split into S4a and S4b (ruling 1); the journey stage DTOs in `activities.dto.ts` belonged to S4 (ruling 2); prototype keys are the only accepted input differences, including a `constructor` key inside registration values, which crashed the DTO route with a 500 and now answers 400 (ruling 3); the profile update audit still lists every field (ruling 4); `BeneficiaryRegistrationService` is injectable so imports keep constructor injection (ruling 7); `ParticipantsService` keeps promotion and its unused `PrismaService` parameter (ruling 8); the media enrollment lookup and `businessToday` stay local because the kernel helpers answer different errors (ruling 10).

Deferred to S4b: the 19 beneficiary, journey and media client methods of `pathways-client.ts` in `lib/api`, the beneficiary and journey response contracts, the `features/beneficiaries` layout and public `index.ts`, the four oversized components and the `ScopedBeneficiaryForm` name. Left to S5: the unused `PrismaService` parameter of `ParticipantsService` and the `beneficiaries` field name in `ImportsService`.

S4b applied 2026-10-13 on the S4b slice branch:
- Contracts: `beneficiaryResponse` (with `beneficiaryProgressResponse`), `archiveBeneficiaryResponse`, `enrollBeneficiaryResponse` and `duplicateCandidatePairResponse` (`contracts/beneficiaries/beneficiary-responses.ts`), `beneficiaryMediaItemResponse`, `beneficiaryMediaLimitsResponse` and `beneficiaryMediaReservedFileResponse` (`beneficiary-media-responses.ts`) and `journeyStageResponse`, `beneficiaryJourneyResponse`, `recordJourneyEventResponse` and `correctJourneyEventResponse` (`contracts/journeys/journey-responses.ts`) are types only and never parsed; `mapBeneficiary`, `mapStage`, the journey history and the media and identity review services return them, so a drift fails `pnpm typecheck`; `RegistrationContextResponse` is a plain type because its fields reuse `FormFieldValidationContract`.
- Client: `lib/api/beneficiaries.ts` holds `beneficiariesClient` (9 methods), `lib/api/journeys.ts` holds `journeysClient` (5) and `lib/api/beneficiary-media.ts` holds `beneficiaryMediaClient` (5), with `beneficiaries.schema.ts` (the registration context parser from `lib/services/registration-context.ts`, `mapBeneficiary` and the age helper) and `journeys.schema.ts` (the stage and history parsers); 13 production files (28 calls), 3 client tests (18 calls) and 12 test files with 13 mock factories follow, and `pathways-client.ts` went from 1361 to 716 lines. The characterization tests ran against the old and the new clients before the old methods went.
- Layout: the 25 files of `features/beneficiaries` and the 8 of `features/journey-config` became `features/beneficiaries/{directory,registration,profile,media,identity-review,journey}` with `beneficiaries.utils.ts` and an `index.ts` that lists `BeneficiaryDirectoryLoader`, `EvaluationCenterLookup`, `BeneficiaryFormLoader`, `BeneficiaryDetailLoader`, `DuplicateResolutionWorkspace` and `JourneyStagesLoader` by leaf path; the seven route pages import the index, `import-direction.test.ts` lists `beneficiaries` among the indexed features and `optimizePackageImports` names its barrel.
- Tests: web 224 files and 1998 tests became 227 and 2015, shared 32 files and 657 tests became 35 and 665, api unchanged at 2610 (21 skipped).
- Tests-only commits: `463478a0` made two contract rejection rows fail on one property and restored a comment, `25b58725` pinned the full mapped beneficiary record and the journey refusal cases while the old client still served as the oracle, and `8fa5a147` pinned that incomplete media items and history events are refused.
- Routes: Middleware stayed at its Task 0 size (103 kB); Tasks 2 and 3 moved 24 routes down by 4 to 12 kB and 3 up by 1 kB because the beneficiary code left the shared client chunk, and the layout move changed none.
- Decisions: S4b split into S4b and S4c (ruling 1); response contracts are types only and the registration context is a plain type (rulings 2 and 3); the media upload keeps `activitiesClient.uploadActivityProofFile` (ruling 6); the loaders keep calling the clients in effects and do not move onto `useAuthorizedRead` (ruling 8); the `'5-9'` age band stays (MOD-B1).

S4c applied 2026-10-13 on the S4c slice branch:
- Registration: `beneficiary-form.tsx` (1391 lines) became the 36 line `BeneficiaryForm`, `BeneficiaryRegistrationForm` (the former `ScopedBeneficiaryForm`, 420 lines), three hooks in `registration/hooks` (context, draft, validation), eight section components and ten more exports in `registration.utils.ts`.
- Detail: `beneficiary-detail.tsx` (1173 lines) became a 93 line screen, `useBeneficiaryDetail` and `useBeneficiaryDetailView` in `profile/hooks` and eleven section components, seven of which take a `Pick` of the hook state and four plain props.
- Media and directory: `AddMediaDialog`, `MediaViewer` and `MediaKpi` left `beneficiary-media-proof.tsx` (668 to 210 lines, `LoadState` to `media.utils.ts`); the column definitions (`useBeneficiaryColumns`) and `FilterSelect` left `beneficiary-directory.tsx` (565 to 435 lines).
- Proof: each split was cut from hash-pinned line ranges of the old file and checked with a line multiset comparison (`lost 0`; 255, 145, 0 and 12 lines added for signatures, props and calls); one moved line of each registration hook and two lines of the detail hooks were mutated, and each mutation failed tests.
- Tests: `beneficiary-form.test.tsx` (870 lines) and `beneficiary-detail.test.tsx` (636) split into seven files and two fixture modules in `test/fixtures`; the 50 rows (28, 5 and 17) and the 177 assertions were counted before and after; web went from 227 files to 232 and stayed at 2015 tests.
- Routes: Middleware stayed at 103 kB in the cloud container; the first load of `/beneficiaries/new`, `/beneficiaries/[beneficiaryId]` and its `edit` page stayed at 280, 300 and 280 kB, only the detail page's own size moved from 13.6 to 14.3 kB, and no other route changed.
- Decisions: hooks take narrow parameters and sections take `Pick` views of the hook state, with no context (ruling 3); `setConfirmOpen` is the only dependency added to a moved effect (ruling 2); `beneficiary-directory.tsx` (435 lines), `beneficiary-registration-form.tsx` (420), `add-media-dialog.tsx` (344), `use-beneficiary-detail.ts` (334) and `profile-fields.tsx` (321) stay above the 300 line target and below 500 (ruling 6 names the detail hook and the profile fields, and the other three are verbatim moves that S4c does not split further); two guards no test pins (a stored draft of another project, the minor boundary at 18) stay unpinned (ruling 9); there is no pull request for the slice (ruling 12).

S4 is complete: the beneficiary, journey and media API, client, layout and components are modularized. Left to later slices: nothing from S4; the `'5-9'` age band stays as MOD-B1.

S5a applied 2026-10-13 on the S5a slice branch:
- Contracts: `uploadImportRequest`, `importMappingItemRequest`, `saveImportMappingRequest`, `automaticImportMappingRequest`, `processImportRequest` and `importRowsQuery` (beside F3b `validateImportRequest`) and the form metadata contracts in `packages/shared/src/contracts/metadata/form-requests.ts` replaced the 15 remaining class-validator bodies and queries of the imports and metadata routes; parity tests ran each DTO and contract through the configured pipes over 87 import and 131 metadata bodies before the DTOs were deleted; `trimmedLowercaseInput` and `queryInteger` joined the field schemas; `importRequestLimits` is pinned to the `@pathways/imports` limits by a test.
- Services: `imports.service.ts` (2119 lines) and `metadata.service.ts` (1315) became facades that keep their constructors, methods and one authorized transaction per method; the work inside each transaction moved verbatim into function modules that take the caller's `tx` (imports: `imports.helpers.ts`, `imports.mapper.ts` and the batches, automatic mapping, mapping, validation, upload, promotion context, row promotion, promotion and claims services; metadata: `metadata.mapper.ts`, `metadata.helpers.ts` and the form lookup, definitions, versions, submissions and submission reads services); the duplicated field contract mapping has one owner, `formFieldContract` in `metadata.mapper.ts`; the import promotion modules call S4's `BeneficiaryRegistrationService` through `PromotionHandlers`, and the facade field that holds it is named `registration` (the S4 deferral).
- Scope: the form definition export reads its project through `requireScopedProject`, closing the last F3a inline project lookup in the slice.
- Package: `smart-match.ts` split into rules, name scoring and value gates with the same exports and the same `AUTO_SMART_V2` decisions.
- Names: `p07-w10-finalization-fault.ts` became `upload-finalization-fault.ts`; the F5 and F6 gate tests are named after what they check.
- SAD: metadata-import-validator routing covers `apps/api/src/modules/metadata/**/*.ts` and the imports and metadata contract folders.
- Decisions: S5 split into S5a and S5b (ruling 1); `beneficiaryId` is `.optional()`, and an array in place of a mapping, value map or field object now answers 400 at the pipe, beside the F3b prototype keys (ruling 3); query bounds use `queryInteger`, not `z.coerce` (ruling 4); response values drop the ten `Object.prototype` method keys and refuse `constructor`, which answered 500 (ruling 5); import bounds are literals pinned by a test because shared cannot import `@pathways/imports` (ruling 6); the services are facades because seeds and tests construct them positionally and tests spy on seven private wrappers, so `imports.service.ts` stays at 519 lines (ruling 8); the unused `ParticipantsService` constructor parameter that S4 left to S5 stays, because removing it edits seeds S5 does not touch (ruling 18).

S5b applied 2026-10-13 on the S5b slice branch:
- Contracts: `import-responses.ts` and `form-responses.ts` in `packages/shared` hold the batch, batch detail, mapping, source column, row and row page responses and the form field, form, submission, submission summary and submission page responses as zod schemas used only as types (nothing parses a response); six api mapper functions got return types, so `pnpm typecheck` catches drift between the api and the web, and the JSON columns Prisma types as `JsonValue` got type-only casts.
- Clients: the 22 form, direct entry and import methods left `pathways-client.ts` (716 to 407 lines) for `formsClient` (13 methods) and `importsClient` (9) in `lib/api`, written by a generator from the old method bodies, with `validateImport` typed from `ValidateImportRequest` (the F3b deferral) and `satisfies` checks on the other request bodies; the automatic mapping receipt parser moved to `imports.schema.ts`; 45 calls in 7 files and 12 test mock factories moved with them, and five web types became aliases of the response types.
- Proof: every line of the 22 methods and of the receipt parser sits in the new files (`lost 0`); two tests ran each case against the old and the new client (30 results, exact path, method and body, then eight more pins) before the old methods were removed and became 23 plain rows (12 and 11); one mutation per file failed them.
- Hook: `useImportBatch` holds the three things the two import screens do the same way, the upload identity, the automatic mapping call for a freshly stored batch and the stop flag; the two process loops stay per screen, because they keep different state. The import screen's `resume` and the collection dialog's stop and resume had no test, so four rows were added and mutated before the hook replaced three copies of the condition and two identity refs.
- Collection screen: 14 views moved verbatim to `features/collection/components` and 14 shared declarations to `collection.utils.ts`, then `useFormFields` and `useServerProcessing`, and the screen went from 3186 lines to 1640; `use-form-fields.test.tsx` (12 rows) pins the field edits and seven mutations failed it; the 1672 line `collection-workspace.test.tsx` split into five files with the 50 full test names identical.
- Tests-only commits: `0f558215` (the import response rejection rows fail on one property each, with positive rows for the JSON and OTHER file types), `381abebf` (eight forms and imports client pins that run on the old and the new client before the old methods went), `5c083d55` (every upload identity part of the two import screens, each bitten by dropping it) and `6765d867` (the intent counter, the sensitive draft generation guard and the timer reset of the form field hook test).
- Counts: web went from 232 files and 2015 tests to 242 and 2071; shared went from 35 files and 665 tests to 37 and 675; config, imports, api and sad counts did not change.
- Routes: Middleware stayed at 103 kB in the cloud container and 12 of 72 routes got smaller (the direct entry route by 8 kB, `/collection/import` and four other collection routes by 4 kB and six other routes by 1 kB); none grew.
- Decisions: S5 split again into S5b and S5c (ruling 1); the response contracts are types only (ruling 2); `useImportBatch` shares less than the outline expected because neither screen uses `captureRequestOwner` (ruling 7); the hooks take their guard as parameters and the form list, parse, save and publish handlers stay in the screen until a guard hook exists (ruling 9); `collection-workspace.tsx` (1640 lines) stays above the 500 line flag and is named in S5c; there is no pull request for the slice (ruling 14).

S5c applied 2026-10-14 on the S5c slice branch:
- Layout: the 63 files of `features/collection` became `forms/`, `import/` and `entry/` (each with `components/`, `hooks/` and its own `<concern>.utils.ts`) beside `collection.utils.ts`, `collection.copy.ts` and an `index.ts` of four exports by leaf path, by 62 `git mv`s with the specifiers rewritten by script; `enumLabel` (from `import-status-labels.ts`) and `formTypeLabels` (from `digital-form-contract.ts`) live in `collection.copy.ts`; the six route pages and the beneficiary registration section import through the index, `collection` joined `indexedFeatures` and `optimizePackageImports`, a deep import and a missing barrel each fail the direction test, and the layout commit alone moved one route (`/collection/import`, 432 to 433 kB).
- Collection screen: `collection-workspace.tsx` went from 1640 to 359 lines: nine pure declarations to `forms.utils.ts`, six hooks (`useCollectionState` returns a flat object, the other five take `(state, guard)`) and five sections that take `Pick` props, all cut by line range (`lost 0`, the 53 and 37 added lines listed); 15 new rows pin the save, publish, export, open, create version, generate copy and proceed handlers that no test reached, 28 mutations of them were killed on the unsplit screen and 38 are killed on the hook files; review fix 3 (ea8c08c6) set the asynchronous wait of that row to 5 s and added 14 rows that each kill a mutation of a hook path (the save revision, the export ticket, the create version and generate copy resets, the copy listing, the extend fields, the proceed reset, the title, the initial project, the kept preview and the ignored column).
- Import and entry screens: `import-workspace.tsx` went from 1110 to 134 lines (`import.utils.ts`, four hooks, five cards) and `direct-form-entry-workspace.tsx` from 654 to 74 (`entry.utils.ts`, three hooks, `state-shell.tsx` and two component files), both by line range with `lost 0`; the effect-bearing hook calls of all three screens run in the old order (`hook-order.mjs`); 12 import and 6 entry mutations that the old rows killed are killed after the cut; review fix 6 (c75e674d) added 20 direct entry rows that kill 45 mutations of the stale load guards, the begin and valid guards, the retry and the start another record paths.
- Types and carry-overs: `DigitalFormType` is the shared type and the draft store takes `digitalFormTypes`, pinned first by rows that pass on the old code (four mutations fail them, then two); `ImportBatchStatus` is `ImportBatchResponse['status']` and the unused `'VALIDATING'` is gone; `use-server-processing.ts` uses the shared `OperationTicket` instead of its own `Ticket`; the 15 unreachable `pathwaysClient` mock factories of 15 collection tests were unreachable (a factory that throws failed none) and are removed.
- Tests: web went from 243 files and 2228 tests to 246 files and 2287 tests; config, shared, imports, api and sad counts did not change; the collection tests keep all their names (199 before, none lost) and gain 59 rows: 10 form type rows (Task 2), 15 handler rows (Task 3), 14 hook path rows (fix 3) and 20 direct entry rows (fix 6); the two test files the rows pushed past 600 lines were split by concern (`collection-workspace.form-drafts` and `.import-proceed`, `direct-entry-ownership` and `.in-flight`), while `collection-workspace.import-upload.test.tsx` stays at 620 lines as before the slice.
- Routes: Middleware stayed at 103 kB and, against the Task 0 build, six routes are bigger at the printed precision: `/collection`, `/collection/forms`, `/collection/forms/new` and `/collection/projects/[projectId]/forms/[formId]` by 2 kB (424 to 426 kB), `/collection/import`, which loads both screens, by 3 kB (432 to 435 kB) and `.../entries/new` by 1 kB (263 to 264 kB), from the module boundaries of the cuts; none is more than 3 kB, and the other 66 routes did not change.
- Decisions: S5c is nine tasks and S5 closes with it (ruling 1); the index lists four leaf exports and no sub-index (ruling 4); the screens are a flat state object plus hooks that take it, with three `biome-ignore` lines for refs and setters of the state hook (ruling 6); only mutations the old rows killed are claimed (ruling 7); the unused `Ticket` type was the only duplicate removed and no logic was merged (ruling 10); `form-builder-session-draft.ts` has no production importer and stays (ruling 12); `entry/components/entry-state-views.tsx` keeps the five small state views the plan put there, a named exception to the one-component-per-file rule of section 3.3; S5c opens no pull request of its own and ships in part 2 of 3 stacked pull requests into `dev`.

S5 is closed: S5a, S5b and S5c are applied. Left as test debt: 14 mutations of the collection handlers that no row kills (the guards behind disabled buttons and the existing ticket checks, and the extend role guard of the confirm step), 34 of the import screen that survived before the move, 10 guards of the entry screen that are redundant or unreachable from the DOM, and the copy and display mutations of the entry screen and of the Task 4 sections. Deferred to W1: the unused `ParticipantsService` `PrismaService` parameter with its two seed constructions, and the eight test-only `Prisma.TransactionClient` annotations in the imports and metadata test harnesses.

S6a applied on the S6a slice branch:
- Cycle: `ReportPdfRenderer` and its test moved to `modules/reports`, `ReceiptPdfRenderer` to `modules/finance`, and `modules/report-pdf` became `modules/print-pdf`, whose `PrintPdfModule` provides only `PrintPdfRenderer`; `apps/api/src/common/import-boundary.test.ts` fails when two api modules import each other outside the recorded `dashboards <-> reports` pair.
- Contracts: `packages/shared/src/contracts/finance/finance-requests.ts`, `contracts/evaluations/evaluation-requests.ts` and `contracts/reports/report-requests.ts` hold the request schemas moved verbatim from the services and `reports.dto.ts` (deleted); the services keep parsing them with their fixed 400 messages, pinned by `finance.validation.test.ts`, `evaluations.validation.test.ts` and `reports.validation.test.ts`.
- Evaluations: `evaluations.service.ts` went from 809 to 337 lines; mapper, helpers, detail reads, scoring, assessments and review transitions moved verbatim into `evaluations.mapper.ts`, `evaluations.helpers.ts` and four function modules; `evaluation-metrics.ts` became `evaluation-metrics.service.ts`.
- Reports: `reports.service.ts` went from 873 to 455 lines; the report source, the reservation and finalization steps and the kind policy moved into `report-source.service.ts`, `report-generation.service.ts` and `reports.helpers.ts`; `report-sources-extra.ts` became `report-monitoring-evaluation-source.ts`; three read routes use `requireScopedProject`.
- Finance: `finance.service.ts` went from 631 to 439 lines; the receipt admission and record reads moved into `expense-receipts.service.ts`.
- Kernel: the 9 `Prisma.TransactionClient` annotations in the S6 modules became `Tx`.
- SAD: organization isolation routing covers `apps/api/src/**/*.helpers.ts`, because the report kind policy left `reports.service.ts`.
- Decisions: S6 split into S6a and S6b (ruling 1); the `dashboards <-> reports` pair stays because the shared artifact writer's bundled fonts are found by source path (ruling 2); requests stay validated in the service (ruling 3); the expense amount check no longer throws, so `'abc'`, `''` and `' 1'` answer 400 instead of 500, the only accepted difference (ruling 4); the S1 class-validator field schemas are not used (ruling 6); api helpers route to the isolation checker (ruling 11); the 10 `Application profile required.` controller checks keep their text (ruling 10); `reporting-workspace.tsx` is production-dead and goes in S6b (ruling 12).

Deferred to S6b: the web client members, reports feature, budget module, evaluation workspace, the dead `reporting-workspace.tsx` chain, read keys and response contracts. Left to S7: the `dashboards <-> reports` pair and the longer cycles through `dashboards`.

S6b applied 2026-10-13 on the S6b slice branch:
- Dead code: `features/reports/reporting-workspace.tsx` (1123 lines), `survey-report-overview.tsx`, `survey-report-utils.ts`, their three tests, `reportKindPermissions` in `lib/rbac/policy.ts` and 11 report and survey types of `types/pathways.ts` were deleted, because no production file imported them (S6 ruling 12); the 18 tests of the deleted code are counted by file in the activity log, and QAD-T18 now cites `features/analytics/analytics-dashboard.test.tsx`, which renders the survey table with activity titles and the `%` and `pp` units.
- Clients: `lib/api/finance.ts` holds `financeClient` (9 methods), `lib/api/evaluations.ts` holds `evaluationsClient` (6 methods and `getBeneficiaryAssessments`, with its parsers in `evaluations.schema.ts`) and `lib/api/reports.ts` holds `reportsClient` (5), with the owned JSON read and post in `lib/api/core/owned-json-read.ts`; request bodies are typed from the S6a contracts, the response schemas moved verbatim, and `lib/services/report-sections.ts` became `lib/api/report-sections.ts`. `core-feature-client.ts` keeps `coreFeatureClient` (publication), `coreDataClient.audit` and the artifact helpers (529 to 173 lines), and `pathways-client.ts` went from 407 to 330 lines.
- Callers: 12 production files (32 calls) and 8 mock factories in 8 test files follow the new clients; the characterization tests ran against the old and the new clients before the old members went, and the core client tests were split by client with every case kept (the three titles that changed are named in the activity log).
- Layout: the 15 files of `features/projects/budget-module` and the four activity expense dialog files became `features/projects/budget/{components,hooks,print}` with `budget.utils.ts` (was `budget-math.ts`), the evaluation workspace and its test became `features/projects/evaluation/components`, and `features/reports` got `components/`, `reports.utils.ts` (`reportFileName`) and an `index.ts` that the six report pages and the print report page import; `import-direction.test.ts` lists `reports` among the indexed features and `optimizePackageImports` names its barrel.
- Tests: web 242 files and 2071 tests became 243 and 2228, shared and api unchanged.
- Routes: Middleware stayed at 103 kB in the cloud container; the dead code, the old client members leaving the shared chunk and the layout move made 19 routes 1 to 5 kB smaller (the layout move took 1 kB more off one of them); none grew.
- Decisions: S6b split into S6b and S6c (ruling 1); the dead workspace chain is deleted and QAD-T18 follows the analytics test (ruling 2); `getBeneficiaryAssessments` moves to `evaluationsClient` (ruling 5); the evaluation workspace sits in `evaluation/components`, and `reports` exports the print primitives the budget receipt uses (ruling 8).

Deferred to S6c: the response contracts for the finance, evaluation and report routes in `packages/shared`, the report kind grant table shared by the web and the api, the splits of `live-reporting-workspace.tsx` and `live-evaluation-workspace.tsx`, and the `finance-budgets` read key; the deferred web items named for S6b above are otherwise done.
