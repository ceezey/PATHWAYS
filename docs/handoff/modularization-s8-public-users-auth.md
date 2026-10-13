# S8 Public, Users, Profile, Auth and MFA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the last class-validator DTOs of the auth, users and profile modules with shared zod contracts that accept exactly the same bodies, move the public contracts into `packages/shared`, give the users, own profile and public snapshot web clients their `lib/api` modules, close the duplicates earlier sub-projects left to S8 (aggregate-only role lists, the mutation ticket UUID regex, the three workspace cookie reads), and delete the production-dead public microsite detail, with no change to any route, status code, response body, permission decision, rendered text or SQL.

**Architecture:** S8 is split (ruling 1). This plan gives S8a in full (eleven tasks including baseline, records and gates) and S8b as an outline at the end. S8a writes each request contract test first, runs the old DTO and the new contract through the configured pipes over the same JSON bodies (explicit metatype, because Vitest emits no decorator metadata), commits that evidence, then switches the route to `ZodPipe` and deletes the DTO in a second commit with an HTTP test of the switched route. Exact acceptance comes from the S1 field schemas (`uuidString`, `lengthString`, `trimmedInput`, `strictIsoDateString` in `packages/shared/src/contracts/common/field-schemas.ts`), plus the class-validator `isEmail` function on the API side, because zod's email rule differs and S1 ports no email rule (ruling 3). S8a also adopts the S1 `requestIdentity` kernel helper in its two controllers that repeat the application profile check, and, as the slice that deletes the last class-validator DTO, removes the S1 field schema parity test and the controller metadata test. Mechanical rewrites use one-off Node scripts under `.tmp/s8a/` (gitignored, never committed) whose content is given in full; each was dry-run on an archive copy of `a101ad7c` and the expected outputs below come from those runs.

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, NestJS 10.4.22, class-validator 0.14.4 (validator 13.15.26), class-transformer 0.5.1, zod 3.25.76, Prisma 6.19, Next 15.5.14, React 19, Vitest 3, Biome 1.9.4, Playwright.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.1 to 3.7 row S8, 4, 6, 7, 9 including the F1 to F4a dispositions and the F4b and S1 to S7 dispositions present when S8a starts) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05, MOD-06, MOD-11, MOD-16, MOD-17 for this slice's modules, and the S8 deferrals recorded in CR section 9: `mapPublicSnapshot`, the avatar stack "And" label, the duplicated `['PROGRAM_MANAGER','GRANT_MANAGER']` literal and the `source-mutation.ts` UUID regex), plus the deferrals the F4b and S6 plans name for S8: the three workspace cookie reads (F4b ruling 11) and the aggregate-only roles inside `assessmentDetailDeniedRoles` (S6 "Out of S6a").

## Rulings

Controller rulings for S8 (2026-10-10). Each was checked against `refactor/f4a-web-boundaries` `a101ad7c` (F4a complete) and assumes the F4b and S1 to S7 outputs named in "Interfaces assumed from earlier slices". Task 0 recounts every number on the branch.

1. **Split into S8a and S8b.** The S8 row covers four API modules, their contracts, four web clients and four feature folders; with baseline, records and gates that is about seventeen tasks. S8a (this plan, branch `refactor/s8a-public-users-auth`) takes the contracts, the API switches, the deferred duplicates, the web clients and the dead code. S8b (outline below, branch `refactor/s8b-public-users-auth-web`) takes the publication and audit clients (which wait on the S6 shape of `core-feature-client.ts`), the component splits and the feature layout. Both names replace `refactor/s8-public-users-auth`; SAD evidence goes to `.tmp/sad/s8a` and `.tmp/sad/s8b`.
2. **The public microsite detail is deleted, not split.** MOD-06 lists `public-project-detail.tsx` (1172 lines), but nothing imports it except its own test; its closure `public-project-charts.tsx` and `public-dashboard-config.ts` are imported only by it, `mapPublicSnapshot` only by its test, and the seven `Public*` view models in `types/pathways.ts` only by those files. `features/profile/profile-validation.ts` is imported only by its test (the live form schemas are in `own-profile-contract.ts`). Seven files (1569 lines) and 77 lines of types go, with the two `docs/deferred-features.md` rows that name the detail file updated and a row added for the removed feature.
3. **Exact acceptance parity, on the S1 field schemas.** A probe of the configured pipes found zod `.uuid()` looser than `IsUUID()`, zod string lengths counted in UTF-16 units where class-validator counts an astral character or a variation sequence once, zod `.email()` differing from `IsEmail()` on 9 of 32 addresses in both directions, and zod `.datetime()` differing from `IsISO8601({ strict: true })`. S1 already ports the first, second and fourth (`uuidString`, `lengthString`, `trimmedInput`, `strictIsoDateString`, checked against class-validator by S1's `field-schemas-parity.test.ts`), so S8a adds no rule of its own to shared: `@Length`, `@MinLength` and `@MaxLength` become `lengthString(min, max)` (`MaxLength(n)` is `lengthString(0, n)`), `@IsUUID()` becomes `uuidString`, the trim `@Transform` becomes `trimmedInput(...)`, and `@IsISO8601({ strict: true })` becomes `strictIsoDateString`. Only the email rule stays on the API side: `auth.helpers.ts` refines the shared sign-in contract with the class-validator `isEmail` function (porting validator's email check into shared would copy about 150 lines for one route). `class-validator` stays an API dependency (the global `ValidationPipe` loads it at runtime); the shared package stays zod-only. A probe with the S1 definitions copied verbatim ran 83 JSON bodies through both pipes and 82 agreed exactly (accept or reject, and the accepted value); the 83rd is ruling 4. An earlier draft of this plan defined `boundedText` and `requestUuid` in a `request-rules.ts`; they duplicated S1 and are dropped.
4. **One accepted difference: a null `projectIds` on `POST users/authorize-existing`.** `@IsOptional()` let `null` through; `UsersService.requireProjects` then threw a TypeError inside the transaction, which `withAuthorizedOperation` answered 403 `Application scope could not be verified.` after an identity directory lookup. The contract answers 400 before any lookup. The web always sends an array. The parity test pins it as the only exception and CR 3.6 records it beside the prototype keys.
5. **Message wording: one reachable override.** The user editor shows the API message, and its own UUID check (`AUTH_USER_ID_PATTERN`) is looser than `IsUUID()`, so an admin can reach `authUserId must be a UUID`; the S1 `uuidString` carries the message `must be a UUID`, so `ZodPipe` answers that exact text. No other S8 text is reachable or shown: the editor caps names at 100 characters, own profile and sign-in map any 400 to fixed text, and the PIN client maps 400 to `STEP_UP_PIN_RULE_MESSAGE`. Everything else becomes zod wording (CR 3.6).
6. **Publication bodies stay validated in `PublicService`.** The four publication routes take `@Body() body: unknown` and the service parses with a fixed `Invalid publication request.` and an operation-dependent summary rule; only the schemas move (`public.dto.ts` to `packages/shared/src/contracts/public/public-projects.ts`, renamed per CR 3.6). The file held two controllers; they become `public-projects.controller.ts` and `publication.controller.ts` (CR 3.2, MOD-17).
7. **Two response schemas keep their runtime parse.** CR 3.6 says response schemas are types only, but the public snapshot is parsed today by the API (allowlist over a SQL function's JSON) and by the web (anonymous reads), and the own profile response by the web; removing those parses would change behavior. They move to shared and stay parsed; CR 3.6 records the exception. The web public read adopts the API bounds (`area` at most 500, `sector` at most 300 characters); the API parses its own output with those bounds, so no body the web receives changes outcome. `authorizedUserResponse` replaces the web's hand-written `ApiUser` as a type only.
8. **Auth response parsing and the sign-in request stay where they are.** `lib/auth` parses `/auth/me`, `/auth/workspaces` and the step-up status on the Edge path with bounded checks (CR 3.3 names `lib/auth` their home); `features/auth/signin-request.ts` has one importer. Neither moves.
9. **No S8 API service split.** `users.service.ts` (415 lines) is under the 500-line flag and has one responsibility; the other S8 services are under 300 lines. MOD-04 names S1 to S7 only.
10. **Deferred items.** `aggregateOnlyRoles` replaces the two `['PROGRAM_MANAGER', 'GRANT_MANAGER']` literals in `packages/shared/src/rbac/route-policy.ts` (the file already imports `authorization-policy`), the `code === 'PROGRAM_MANAGER' || code === 'GRANT_MANAGER'` test that sets `aggregate` in `apps/web/src/lib/rbac/access-matrix.ts` (the settings role matrix, same two roles, same name), and the two aggregate-only entries of `assessmentDetailDeniedRoles`, which S6 moved verbatim to `evaluation-assessments.service.ts` and handed to S8: the set becomes `new Set(['SYSTEM_ADMINISTRATOR', ...aggregateOnlyRoles])`, the same three roles, so individual assessment detail stays denied wherever beneficiary records are aggregate-only (activities, participants, beneficiary media and authorized data already read `aggregateOnlyRoles` for that rule). The single-role tests (`roles[0] === 'PROGRAM_MANAGER'` in collection, import and sensitive drafts; `['SYSTEM_ADMINISTRATOR', 'PROGRAM_MANAGER']` in the route policy) mean portfolio scope, not aggregate-only access, and stay. `routeUuidPattern` replaces the identical `uuid` regex in `apps/web/src/lib/services/source-mutation.ts`; `Tx` replaces the four `Prisma.TransactionClient` annotations in S8 production code (F3a left them to the slices). The avatar stack keeps its derived "Monitoring And Evaluation Officer" label: switching to `roleNames` changes the `aria-label` and `title` text, which CR section 4 rules out, so it is recorded as a display decision for the developer.
11. **The step-up and route-access project lookups stay inline.** F3a left them to the slices. `BeneficiaryStepUpService` turns its lookup into a boolean inside a `try` whose `catch` answers 503 `Project scope could not be verified.`, and `RouteAccessService` answers 404 `Route unavailable.` at its `PROJECT_READ` stage; `requireScopedProject` throws 404 `Project unavailable.`, which would become a 503 in the first and change the message in the second. Both keep `projectScope`, the shared scope rule.
12. **SAD routing:** `packages/shared/src/contracts/auth/**/*.ts` and `packages/shared/src/contracts/users/**/*.ts` route to organization-isolation-checker (they define the sign-in, PIN and authorization inputs), beside the existing beneficiary-privacy-guardian route for all contracts.
13. **`requestIdentity` in the two S8 controllers that repeat the check.** S1 ruling 9 left 20 controllers to their slices; S8's are `users.controller.ts` (local `profile()`) and `auth/authorized-data.controller.ts` (local `verifiedProfile()`), both throwing `ForbiddenException('Application profile is required.')` exactly as `requestIdentity` does. `profile.controller.ts` and `auth.controller.ts` (`Verified profile required.`) and the publication controller (`Application profile required.`) use other wording and keep it, since `requestIdentity` would change the 403 text (S1 ruling 9); `route-access.controller.ts` has no such check. A characterization test per controller is written first.
14. **S8a deletes the last class-validator DTO, so it removes the two tests that existed only for DTOs.** Every other DTO belongs to S1 to S7 (Task 0 confirms only the five S8 DTO files remain). After Task 3, `controller-dto-runtime-metadata.test.ts` has no case left and `field-schemas-parity.test.ts` guards a parity nothing depends on any more; S1 hands both to "the slice that deletes the last DTO (S8)". Both are deleted in Task 3, guarded by a check that no `class-validator` decorator DTO remains. The `class-validator` dependency stays, against S1's note, because Nest's `ValidationPipe` loads it at runtime and `auth.helpers.ts` uses `isEmail`; CR section 9 records this.
15. **Import style in `lib/api`.** F4b ruling 8: a sibling is imported as `./name`, anything else through `@/`. The new `lib/api/users.ts` and the moved `lib/api/profile.ts` import `@/lib/api/core/request`, and `users.test.ts` mocks that specifier.
16. **One workspace context cookie read.** F4b left three reads of the `pathways-context` cookie to S8: `readWorkspaceContextCookie()` in `lib/auth/workspace-access.ts` (the role provider's `split('; ')`, returns the value), the private `readContextCookie()` in `lib/api/core/request.ts` (`split(';')` then `trim`, returns the value) and `ownerCookie()` in `lib/api/core/request-owner.ts` (`split(';')` then `trim`, returns the whole `name=value` entry or `null`, with a `typeof document` guard). Browsers and jsdom both serialize `document.cookie` as `name=value` entries joined by `'; '` with no other surrounding whitespace (a jsdom probe printed `"a=1; pathways-context-old=x; pathways-context="`), so both splits yield the same entries; every test that sets the cookie does so through the `document.cookie` setter. `readWorkspaceContextCookie` takes the `split(';')` and `trim` form, `request.ts` calls it, and `ownerCookie` becomes `typeof document === 'undefined' ? null : (readWorkspaceContextCookie() ?? null)`: comparing values instead of whole entries gives the same answer because every entry starts with the same name, and an empty value (`''`) still counts as present, as the entry `pathways-context=` did. The guard stays only where it was, so `request.ts` still runs after its own `typeof window` check.
17. Cross-plan: S2b Task 8 edits `lib/services/source-mutation.ts` and its test (dead multipart option) and S1b/S2b/S3b/S5b add importers of that file, so Task 0's `uuid.test(` count and the `source-mutation.ts` first and last line anchors are rechecked after them; S7b adopts `requestIdentity` in the dashboards and analytics controllers, leaving only `users.controller.ts` and `auth/authorized-data.controller.ts` for S8 as ruling 13 expects; the publication service parse is the S3 criterion recorded in the S1 plan. Cost if wrong: Task 0 stops on an anchor, which is its purpose.
18. Cross-plan (S2b): after S2b Task 8 `lib/services/source-mutation.ts` is 315 lines (was 356) with an unchanged first line, last line and single `uuid.test(`, so Task 0's anchors still hold; the two activities tests are under `features/projects/activities/components/`. Cost if wrong: Task 0 stops on a path or anchor, which is its purpose.

## Global Constraints

- Behavior-preserving: no route, status code, response body, audit row, permission decision, transaction boundary, SQL, rendered text, class, redirect, cookie or header changes. Accepted differences: zod wording on the former DTO routes except `authUserId must be a UUID` (ruling 5), the null `projectIds` of ruling 4, and the own `__proto__` and `constructor` keys already recorded in CR 3.6.
- `apps/api/src/common/**` never imports `apps/api/src/modules/**`; `apps/web/src/import-direction.test.ts`, `packages/shared/src/package-import-boundary.test.ts` and `apps/api/src/common/import-boundary.test.ts` pass at every commit.
- Production api code uses relative imports only; `@app/` is a Vitest alias used by tests.
- File moves use `git mv` and are committed separately from logic edits; a split is verbatim and checked with `.tmp/s8a/same-lines.mjs`.
- Every name exported through `packages/shared/src/index.ts` is unique (TS2308 otherwise); `packages/shared` imports only `zod`.
- A `vi.mock` path moves with its module in the same commit.
- Kebab-case file names that describe purpose; comments are one sentence, no emojis; docs prose has no em dashes and no `--`.
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. New untracked files need `git add -N` before `git diff --name-only` lists them.
- `pnpm typecheck` and `next build` rewrite `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` before every commit.
- After removing code, delete any import name left with no use (Biome 1.9 recommended rules do not flag unused imports).
- Do not type `\u` escapes for characters into source; build them with `String.fromCharCode` or `String.fromCodePoint` (S1 ruling 2).
- `git ls-files` with `':!*.test.ts'` pathspecs returns nothing in this Git for Windows setup; filter with `grep -v` as written. `git grep` pathspecs work.
- Web build: `pnpm --filter @pathways/web build > .tmp/s8a/<name>.log 2>&1; echo "exit $?"`, then `grep -E "Middleware" .tmp/s8a/<name>.log`.
- One-off scripts live in `.tmp/s8a/` (gitignored) and are never committed; `.tmp/` also holds logs.
- No new dependencies. No customer personal data or credentials; test identities are synthetic (`example.org`, `example.invalid`, fixed UUIDs).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work in `C:\PATHWAYS` on branch `refactor/s8a-public-users-auth`; no new worktree. All paths are relative to `C:\PATHWAYS`. Do not push.
- Do not touch migrations, `.env` files, review evidence or `apps/api/prisma`.

## Review Focus

1. A switched route whose body parameter lost `new ZodPipe(...)` would accept any body, because the global `ValidationPipe` passes a zod-typed (design type `Object`) parameter through unchanged. Tasks 1 to 3 add an HTTP test per controller that sends an unknown key and expects 400 without a service call; Task 10 Step 3 probes the compiled sign-in route, where real decorator metadata exists.
2. An Auth user id that the user editor's loose pattern accepts but `IsUUID()` refused (version 0, `71000000-0000-0000-8000-000000000001`) must still answer exactly `["authUserId must be a UUID"]`, the text the editor shows. Task 1 pins it in the parity test and over HTTP.
3. A sign-in address that zod `.email()` accepts but `IsEmail()` refused (a 65-character local part) must still answer 400 before any password grant or lockout write, and the 400 body never contains the password. Task 3 pins it in the parity table and over HTTP; Task 10 Step 3 probes it on the compiled API.
4. After the three cookie reads become one, every staff API request must still carry the workspace headers from the `pathways-context` cookie, a request must still be refused once that cookie changes or is cleared, and a cookie whose name merely starts with `pathways-context` must not count. Task 6 Step 4 pins the reader over a cookie table and the owner check over the empty and prefixed cookies, and reruns the existing same-subject token refresh and workspace-change tests after the switch.
5. A test mock left defining `getUsers` on `pathwaysClient` silently stops applying once the component calls `usersClient`, and the real request runs. Task 8 counts five `@/lib/api/users` mocks and zero `pathwaysClient` user calls after the move.

The PIN change bodies (an absent `currentPin` must reach the service as `undefined`, a `null` one as `null`) are also pinned over HTTP in Task 3, although the PIN UI is hidden today.

## Interfaces assumed from earlier slices

- **F4b** (lands before S8): `apps/web/src/lib/api/core/request.ts` exports `class PathwaysClientError extends Error` (constructor `(message: string, code: 'not_configured' | 'network' | 'unauthorized' | 'forbidden' | 'not_found' | 'invalid', fieldErrors?: FormValidationError[], status?: number, stepUpRequired?: boolean)`), `requestFoundation(path: string, init?: RequestInit, isCurrent?: () => boolean): Promise<any>` and `requestFoundationResponse(...)`, with `readContextCookie()` (private in the F4b plan; S8 does not use it); `apps/web/src/lib/api/core/request-owner.ts` exports `captureRequestOwner(signal?: AbortSignal | null): () => boolean`; `apps/web/src/hooks/use-authorized-read.ts` exports `useAuthorizedRead`; `apps/web/src/lib/format/{date,percent,plural,tone}.ts` exist; `lib/services/source-mutation.ts` starts with `import { subscribeSensitiveDraftInvalidation } from '@/lib/auth/sensitive-drafts'` and ends with `ensureSourceInvalidationSubscription`; `lib/services/own-profile-client.ts` imports `requestFoundation` from `@/lib/api/core/request`; the `pathways-client` mock factories that held `PathwaysClientError` were split into a `vi.mock('@/lib/api/core/request', ...)`. For the cookie reads (ruling 16), F4b leaves these three declarations, each with the comment line shown (the first in `apps/web/src/lib/auth/workspace-access.ts` directly after `clearWorkspaceContext`, the second private in `request.ts` and called twice in `requestFoundationResponse`, the third private in `request-owner.ts`); `request.ts` imports `contextCookieName` and `decodeWorkspaceContext` from `@/lib/auth/workspace-access`, `request-owner.ts` imports `contextCookieName` from there, and `apps/web/src/lib/api/core/request-owner.test.ts` exists (jsdom, with an `afterEach` that expires `pathways-context`):

```ts
// The workspace context cookie value, read the way the role provider has always split document.cookie.
export const readWorkspaceContextCookie = () =>
  document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${contextCookieName}=`))
    ?.slice(contextCookieName.length + 1)

function readContextCookie() {
  const value = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${contextCookieName}=`))
    ?.slice(contextCookieName.length + 1)
  return value
}

// The whole workspace context cookie entry, or null outside the browser or when it is missing.
const ownerCookie = () =>
  typeof document === 'undefined'
    ? null
    : (document.cookie
        .split(';')
        .map((value) => value.trim())
        .find((value) => value.startsWith(`${contextCookieName}=`)) ?? null)
```

S8a uses `requestFoundation`, `PathwaysClientError` and those three cookie reads; S8b uses `captureRequestOwner` and `useAuthorizedRead`.

- **F4a and F3:** `routeUuidPattern` and `aggregateOnlyRoles` from `@pathways/shared`; `ZodPipe` in `apps/api/src/common/validation/zod-pipe.ts` (formats each issue as `<path> <message>`); `Tx` in `apps/api/src/common/prisma/transaction.ts`.
- **S1 (S1a):** from `@pathways/shared` (`packages/shared/src/contracts/common/field-schemas.ts`): `lengthString(min: number, max: number)` (a `z.string()` refinement counting as validator `isLength`, message `must be <min> to <max> characters long`), `uuidString` (`z.ZodString`, message `must be a UUID`), `strictIsoDateString` (refined ISO 8601 string, message `must be a valid ISO 8601 date string`), `trimmedInput<T extends z.ZodTypeAny>(schema: T)` (a `z.preprocess` that trims strings); `apps/api/src/common/validation/field-schemas-parity.test.ts` exists; `requestIdentity(request: AuthenticatedRequest): ApplicationIdentity` from `apps/api/src/common/authz/request-identity.ts`, throwing `ForbiddenException('Application profile is required.')`.
- **S1 (S1b):** `pathwaysClient` from `@/lib/services/pathways-client` still declares and implements `getUsers`, `authorizeExistingUser` and `updateAuthorizedUser` (S1 moves project, program and team methods only); callers may now live under `features/projects/team/` or similar, so S8a finds them by grep.
- **S1 to S7:** each removed its own DTOs, its case from `apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts`, and its controllers' local application profile checks (adopting `requestIdentity`); none added a second port of the class-validator UUID, length or email rules.
- **S6 (S6a):** `assessmentDetailDeniedRoles` moved verbatim (five lines, `new Set([` / `'SYSTEM_ADMINISTRATOR',` / `'PROGRAM_MANAGER',` / `'GRANT_MANAGER',` / `])`) from `evaluations.service.ts` to `apps/api/src/modules/evaluations/evaluation-assessments.service.ts`, whose `@pathways/shared` import is `import { enrollmentAssessmentsQuery, hasAtomicPermission } from '@pathways/shared'`; the two `denies %s before any query, even with a forged grant` tests (at `a101ad7c` in `evaluations.assessment-detail.test.ts` and `evaluations.beneficiary-assessments.test.ts`) still cover all three roles. Task 6 finds the file by grep, so another location works.
- **S6** (S8b only): `apps/web/src/lib/services/core-feature-client.ts` still holds `coreFeatureClient` (publication) and `coreDataClient.audit` with their schemas (the finance, evaluation and report members having moved to `lib/api` in S6), and its owned reads already use `captureRequestOwner`.

## Out of S8a (recorded for S8b and W1)

- Publication and audit clients out of `core-feature-client.ts`, the `user-management-workspace.tsx` (937) and `mfa-form.tsx` (717) splits, feature `components/`, `hooks/` and `index.ts` surfaces for auth, profile, public and settings: S8b, outlined at the end.
- The global `ValidationPipe` and the `class-validator` dependency stay: the pipe still converts primitive `@Param` and `@Query` types and loads `class-validator` at runtime, and `auth.helpers.ts` uses `isEmail` (ruling 14).
- `lib/services/*` files that no slice owns: W1.

---

### Task 0: Branch setup and baseline

**Files:**
- Create: `docs/superpowers/plans/<date>-modularization-s8-public-users-auth.md` (this plan, `<date>` from `date +%F`)
- Modify: `docs/index.md` (section 1.6 plan row)

- [ ] **Step 1: Confirm local dev contains F4b and S7 and create the branch**

```bash
cd /c/PATHWAYS
git status --short
git checkout dev
git log --oneline dev | grep -m1 "Merge refactor/s7"
test -f apps/web/src/lib/api/core/request.ts && test -f apps/web/src/lib/api/core/request-owner.ts && test -f apps/web/src/hooks/use-authorized-read.ts && test -f apps/web/src/lib/format/date.ts && echo "F4b tree present"
ls docs/superpowers/plans | grep -E "modularization-(f4|s[1-7])"
git checkout -b refactor/s8a-public-users-auth
pnpm install --frozen-lockfile
mkdir -p .tmp/s8a
```

Expected: clean status, the S7 merge commit and `F4b tree present` printed, the plan listing prints nothing, install succeeds. If the merge or the F4b tree is missing, or an earlier modularization plan is still listed, stop and report: S8a builds on the S7 tree and each earlier slice removes its own plan.

- [ ] **Step 2: Record the baseline**

```bash
pnpm --filter @pathways/shared build
pnpm typecheck && pnpm test 2>&1 | grep -E "Tests +[0-9]+"
pnpm sad:test 2>&1 | grep -E "Tests +[0-9]+"
pnpm docs:check 2>&1 | tail -3
pnpm --filter @pathways/web build > .tmp/s8a/web-build-baseline.log 2>&1; echo "exit $?"
grep -E "Middleware" .tmp/s8a/web-build-baseline.log
git ls-files 'apps/api/src/*.dto.ts'
git grep -c "Prisma.TransactionClient" -- apps/api/src/modules/auth apps/api/src/modules/users apps/api/src/modules/profile apps/api/src/modules/public ':!*.test.ts'
git grep -nE "\.(getUsers|authorizeExistingUser|updateAuthorizedUser)\(" -- apps/web/src ':!*.test.ts' ':!*.test.tsx' ':!apps/web/src/lib/services/pathways-client.ts' | wc -l
git grep -lE "\b(getUsers|authorizeExistingUser|updateAuthorizedUser)\b" -- 'apps/web/src/**/*.test.ts' 'apps/web/src/**/*.test.tsx'
git grep -nE "lib/services/(own-profile-client|public-projects)'" -- apps/web | wc -l
cat apps/web/src/features/public/public-project-detail.tsx apps/web/src/features/public/public-project-detail.test.tsx apps/web/src/features/public/public-project-charts.tsx apps/web/src/features/public/public-dashboard-config.ts apps/web/src/features/public/public-dashboard-config.test.ts apps/web/src/features/profile/profile-validation.ts apps/web/src/features/profile/profile-validation.test.ts | wc -l
git grep -c "\['PROGRAM_MANAGER', 'GRANT_MANAGER'\]" -- packages/shared/src/rbac/route-policy.ts
git grep -c "uuid.test(" -- apps/web/src/lib/services/source-mutation.ts
grep -o "file: 'src/modules/[a-z-]*/[a-z-]*\.controller\.ts'" apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts
git grep -nE "^export (const|function) (lengthString|uuidString|strictIsoDateString|trimmedInput)\b" -- packages/shared/src/contracts/common/field-schemas.ts | wc -l
git grep -nE "^export (class|async function|function|const) (PathwaysClientError|requestFoundation)\b" -- apps/web/src/lib/api/core/request.ts | wc -l
git grep -lE "Application profile is required\.'" -- 'apps/api/src/**/*.controller.ts'
test -f apps/api/src/common/authz/request-identity.ts && test -f apps/api/src/common/validation/field-schemas-parity.test.ts && echo "S1 kernel present"
pnpm --filter @pathways/api exec vitest run src/common/validation/field-schemas-parity.test.ts 2>&1 | grep -E "Tests +[0-9]+"
git grep -n "assessmentDetailDeniedRoles = new Set" -- apps/api/src
git grep -c "code === 'PROGRAM_MANAGER' || code === 'GRANT_MANAGER'" -- apps/web/src/lib/rbac/access-matrix.ts
git grep -nE "readWorkspaceContextCookie = |function readContextCookie\(|const ownerCookie = " -- apps/web/src/lib
git grep -c "document.cookie" -- apps/web/src/lib/auth/workspace-access.ts apps/web/src/lib/api/core/request.ts apps/web/src/lib/api/core/request-owner.ts
git checkout -- apps/web/next-env.d.ts
```

Expected: typecheck clean; write down each package's passing and skipped test counts (config, shared, imports, api, web), the sad count, the docs check failure count, the web build exit code (0) and the `Middleware` size; later tasks compare against these (`B_shared`, `B_api`, `B_web`, `B_sad`, `M0`). The greps print, in order:
- exactly the five S8 DTO files `apps/api/src/modules/auth/beneficiary-step-up-pin.dto.ts`, `apps/api/src/modules/auth/signin-lockout.dto.ts`, `apps/api/src/modules/profile/profile.dto.ts`, `apps/api/src/modules/public/public.dto.ts`, `apps/api/src/modules/users/users.dto.ts` (at `a101ad7c` seventeen DTO files are listed; S1 to S7 remove the other twelve, and any still listed stops the task, because ruling 14 needs S8a to remove the last one);
- `application-profile.service.ts:1`, `beneficiary-step-up-pin.service.ts:2`, `users.service.ts:1` (with their paths);
- `8`;
- five component tests (`project-activities-rbac` and `project-activities-workspace` under `features/projects/activities/components/` after S2b, `project-setup-form`, `project-team-editor-dialog`, `user-management-workspace`, under `features/projects` or the S1 subfolder, and `features/settings`) plus the test that holds `pathwaysClient.getUsers()` (at `a101ad7c` `lib/services/pathways-client.test.ts`);
- `11`; `1569`; `packages/shared/src/rbac/route-policy.ts:2`; `apps/web/src/lib/services/source-mutation.ts:1`;
- `file: 'src/modules/auth/auth.controller.ts'` and `file: 'src/modules/users/users.controller.ts'` only (at `a101ad7c` ten cases are listed; S1 to S7 remove theirs);
- `4`; `2`;
- `apps/api/src/modules/auth/authorized-data.controller.ts` and `apps/api/src/modules/users/users.controller.ts` only (at `a101ad7c` 24 files; S1 to S7 adopt `requestIdentity` in the other 22);
- `S1 kernel present`; the field schema parity test count (57 per the S1 plan); write it down as `P_fs`;
- one line in `apps/api/src/modules/evaluations/evaluation-assessments.service.ts` (at `a101ad7c` `evaluations.service.ts:24`); write the path down as `EVAL`;
- `1`;
- three lines: `lib/auth/workspace-access.ts` (`readWorkspaceContextCookie = `), `lib/api/core/request.ts` (`function readContextCookie(`) and `lib/api/core/request-owner.ts` (`const ownerCookie = `);
- `workspace-access.ts:3` (the reader, `clearWorkspaceContext` and F4b's `writeWorkspaceContext`), `request.ts:1`, `request-owner.ts:1`.

If any other number differs, stop and report: the edit lists below were counted at `a101ad7c` plus the stated assumptions.

- [ ] **Step 3: Add the plan and commit**

The controller has saved this plan as `docs/superpowers/plans/<date>-modularization-s8-public-users-auth.md`. In `docs/index.md` section 1.6, add as the last row of the table, with the same `<date>`:

```markdown
| [S8 public, users, profile and auth plan](superpowers/plans/<date>-modularization-s8-public-users-auth.md) | <date>-modularization-s8-public-users-auth.md | <date> | S8 of the codebase modularization: S8a auth, users, profile and public contracts, web clients and dead code; S8b outline | In progress |
```

```bash
git add docs/superpowers/plans docs/index.md
pnpm docs:check 2>&1 | tail -3
git commit -m "docs: add the S8 public, users, profile and auth plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Step 2 baseline.

---

### Task 1: Users contracts

**Files:**
- Create: `packages/shared/src/contracts/users/user-authorization.ts`
- Test: `packages/shared/src/contracts/users/user-authorization.test.ts`
- Modify: `packages/shared/src/index.ts` (one barrel line)
- Create then delete: `apps/api/src/modules/users/user-authorization-parity.test.ts`
- Test: `apps/api/src/modules/users/users.controller.validation.test.ts`
- Modify: `apps/api/src/modules/users/users.controller.ts`, `apps/api/src/modules/users/users.service.ts`, `apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts`
- Delete: `apps/api/src/modules/users/users.dto.ts`, `apps/api/src/modules/users/users.validation.test.ts`

**Interfaces:**
- Consumes: `ZodPipe` (F3b); `lengthString`, `uuidString`, `trimmedInput` (S1a, `@pathways/shared`); `roleNames`, `CanonicalRole`, `RoleName` from `packages/shared/src/rbac/role-catalog.ts`.
- Produces, from `@pathways/shared`: `authorizeExistingUserRequest` and `type AuthorizeExistingUserRequest = { authUserId: string; fullName: string; role: CanonicalRole; projectIds: string[] }`, `updateAuthorizedUserRequest` and `type UpdateAuthorizedUserRequest = { fullName?: string | null; role: CanonicalRole; accountStatus: 'ACTIVE' | 'DEACTIVATED'; projectIds: string[] }`, `authorizedUserResponse` and `type AuthorizedUserResponse` (types only, used by Task 7).

- [ ] **Step 1: Write the failing users contract test**

Create `packages/shared/src/contracts/users/user-authorization.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { authorizeExistingUserRequest, updateAuthorizedUserRequest } from './user-authorization'

const authUserId = '71000000-0000-4000-8000-000000000001'
const officer = { authUserId, fullName: 'A', role: 'PROJECT_OFFICER' }

describe('user authorization contracts', () => {
  it('defaults the project list to empty and trims the name', () => {
    expect(
      authorizeExistingUserRequest.parse({ ...officer, fullName: '  Synthetic User  ' }),
    ).toEqual({ ...officer, fullName: 'Synthetic User', projectIds: [] })
  })

  it.each([
    { ...officer, role: 'Project Officer' },
    { ...officer, projectIds: null },
    { ...officer, projectIds: Array(101).fill(authUserId) },
    { ...officer, fullName: '   ' },
    { ...officer, organizationId: authUserId },
  ])('rejects the authorization body %j', (body) => {
    expect(authorizeExistingUserRequest.safeParse(body).success).toBe(false)
  })

  it('keeps a null name on update, which the service treats as no change', () => {
    const body = { fullName: null, role: 'PROGRAM_MANAGER', accountStatus: 'ACTIVE', projectIds: [] }
    expect(updateAuthorizedUserRequest.parse(body)).toEqual(body)
  })

  it('requires the project list on update and allows only ACTIVE or DEACTIVATED', () => {
    const body = { role: 'PROGRAM_MANAGER', accountStatus: 'ACTIVE' }
    expect(updateAuthorizedUserRequest.safeParse(body).success).toBe(false)
    expect(
      updateAuthorizedUserRequest.safeParse({ ...body, accountStatus: 'SUSPENDED', projectIds: [] })
        .success,
    ).toBe(false)
  })
})
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/users/user-authorization.test.ts`
Expected: FAIL, cannot resolve `./user-authorization`.

- [ ] **Step 2: Create the users contracts and export them**

Create `packages/shared/src/contracts/users/user-authorization.ts` (each field mirrors one `users.dto.ts` rule: `@IsUUID()` is `uuidString`, the trim `@Transform` with `@Length(1, 120)` is `trimmedInput(lengthString(1, 120))`, `@IsOptional()` is `.nullish()` or the `[]` default):

```ts
import { z } from 'zod'

import { type CanonicalRole, type RoleName, roleNames } from '../../rbac/role-catalog'
import { lengthString, trimmedInput, uuidString } from '../common/field-schemas'

const roleCodes = Object.keys(roleNames) as [CanonicalRole, ...CanonicalRole[]]
const roleDisplayNames = Object.values(roleNames) as [RoleName, ...RoleName[]]
const fullName = trimmedInput(lengthString(1, 120))
const projectIds = z.array(uuidString).max(100)

// Body of POST users/authorize-existing.
export const authorizeExistingUserRequest = z
  .object({
    authUserId: uuidString,
    fullName,
    role: z.enum(roleCodes),
    projectIds: projectIds.default([]),
  })
  .strict()
export type AuthorizeExistingUserRequest = z.infer<typeof authorizeExistingUserRequest>

// Body of PATCH users/:userId; a null or absent name leaves the name unchanged.
export const updateAuthorizedUserRequest = z
  .object({
    fullName: fullName.nullish(),
    role: z.enum(roleCodes),
    accountStatus: z.enum(['ACTIVE', 'DEACTIVATED']),
    projectIds,
  })
  .strict()
export type UpdateAuthorizedUserRequest = z.infer<typeof updateAuthorizedUserRequest>

// One authorized user as the users routes return it; a type for the web, never parsed at runtime.
export const authorizedUserResponse = z.object({
  id: z.string(),
  authUserId: z.string().nullable(),
  name: z.string(),
  email: z.string(),
  role: z.enum(roleDisplayNames),
  roleCode: z.enum(roleCodes),
  accountStatus: z.enum(['ACTIVE', 'INVITED', 'SUSPENDED', 'DEACTIVATED', 'ARCHIVED']),
  projectIds: z.array(z.string()),
  projectAccess: z.array(z.string()),
  createdAt: z.string(),
  lastActiveAt: z.string().optional(),
})
export type AuthorizedUserResponse = z.infer<typeof authorizedUserResponse>
```

In `packages/shared/src/index.ts`, directly after the last line that starts with `export * from './contracts/` (S1 added `field-schemas` and its project contracts there), add:

```ts
export * from './contracts/users/user-authorization'
```

```bash
pnpm --filter @pathways/shared exec vitest run src/contracts
pnpm --filter @pathways/shared build
test -f packages/shared/dist/contracts/users/user-authorization.js && echo "shared dist ok"
```

Expected: the users contract (8) and the earlier contract tests pass; `shared dist ok`.

- [ ] **Step 3: Write the parity test**

Create `apps/api/src/modules/users/user-authorization-parity.test.ts`:

```ts
import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'

import { authorizeExistingUserRequest, updateAuthorizedUserRequest } from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { AuthorizeExistingUserDto, UpdateAuthorizedUserDto } from './users.dto'

// Same options as main.ts.
const globalPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: false,
})

type Outcome = { accepted: boolean; value: unknown }

// Records a pipe rejection, which must be a BadRequestException.
function rejected(error: unknown): Outcome {
  expect(error).toBeInstanceOf(BadRequestException)
  return { accepted: false, value: (error as BadRequestException).getResponse() }
}

// The old route: the global pipe with the DTO as design type, on a freshly parsed JSON body.
async function viaDto(metatype: new () => object, json: string): Promise<Outcome> {
  try {
    const dto = await globalPipe.transform(JSON.parse(json), { type: 'body', metatype })
    return { accepted: true, value: { ...dto } }
  } catch (error) {
    return rejected(error)
  }
}

// The new route: the global pipe with an Object design type, then the zod pipe.
async function viaZod(schema: z.ZodTypeAny, json: string): Promise<Outcome> {
  try {
    const body = await globalPipe.transform(JSON.parse(json), { type: 'body', metatype: Object })
    return { accepted: true, value: new ZodPipe(schema).transform(body) }
  } catch (error) {
    return rejected(error)
  }
}

const badRequest = {
  statusCode: 400,
  error: 'Bad Request',
  message: expect.arrayContaining([expect.any(String)]),
}

// Both routes accept with the same value, or both answer the 400 shape.
async function expectParity(metatype: new () => object, schema: z.ZodTypeAny, json: string) {
  const [dto, zod] = await Promise.all([viaDto(metatype, json), viaZod(schema, json)])
  expect(zod.accepted).toBe(dto.accepted)
  if (dto.accepted) expect(zod.value).toEqual(dto.value)
  else {
    expect(dto.value).toEqual(badRequest)
    expect(zod.value).toEqual(badRequest)
  }
}

const authUserId = '71000000-0000-4000-8000-000000000001'
const emoji = String.fromCodePoint(0x1f600)
const officer = { authUserId, fullName: 'A', role: 'PROJECT_OFFICER' }
const authorizeBodies = [
  { authUserId, fullName: 'Synthetic User', role: 'PROGRAM_MANAGER', projectIds: [] },
  { authUserId, fullName: '  Synthetic User  ', role: 'PROJECT_OFFICER', projectIds: [authUserId] },
  officer,
  {
    authUserId: authUserId.toUpperCase(),
    fullName: 'x'.repeat(120),
    role: 'PROJECT_OFFICER',
    projectIds: [authUserId.toUpperCase()],
  },
  { ...officer, fullName: emoji.repeat(120) },
  { ...officer, authUserId: '00000000-0000-0000-0000-000000000000' },
  { ...officer, authUserId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
  { ...officer, authUserId: '71000000-0000-0000-8000-000000000001' },
  { ...officer, authUserId: '71000000-0000-4000-0000-000000000001' },
  { ...officer, authUserId: '71000000-0000-9000-8000-000000000001' },
  { ...officer, fullName: '   ' },
  { ...officer, fullName: 'x'.repeat(121) },
  { ...officer, fullName: emoji.repeat(121) },
  { ...officer, fullName: 5 },
  { ...officer, role: 'Program Manager' },
  { ...officer, role: 'toString' },
  { ...officer, projectIds: ['x'] },
  { ...officer, projectIds: [5] },
  { ...officer, projectIds: 'x' },
  { ...officer, projectIds: Array(101).fill(authUserId) },
  { ...officer, projectIds: Array(100).fill(authUserId) },
  { ...officer, extra: 1 },
  { authUserId, fullName: 'A' },
  { fullName: 'A', role: 'PROJECT_OFFICER' },
  { ...officer, authUserId: 5 },
  [],
].map((body) => JSON.stringify(body))
const change = { role: 'PROJECT_OFFICER', accountStatus: 'ACTIVE', projectIds: [] }
const updateBodies = [
  { ...change, fullName: 'A', projectIds: [authUserId] },
  { ...change, accountStatus: 'DEACTIVATED' },
  { ...change, fullName: null },
  { ...change, fullName: '  B  ', role: 'SYSTEM_ADMINISTRATOR' },
  { ...change, fullName: '' },
  { ...change, fullName: '  ' },
  { ...change, accountStatus: 'SUSPENDED' },
  { role: 'PROJECT_OFFICER', accountStatus: 'ACTIVE' },
  { ...change, projectIds: null },
  { ...change, organizationId: authUserId },
  { ...change, authUserId },
  { accountStatus: 'ACTIVE', projectIds: [] },
].map((body) => JSON.stringify(body))

describe('users DTO and contract parity', () => {
  it.each(authorizeBodies)('authorize-existing agrees on %s', (json) =>
    expectParity(AuthorizeExistingUserDto, authorizeExistingUserRequest, json),
  )

  it.each(updateBodies)('update agrees on %s', (json) =>
    expectParity(UpdateAuthorizedUserDto, updateAuthorizedUserRequest, json),
  )

  it('keeps the class-validator message for an id the editor accepts but IsUUID() refused', async () => {
    const json = JSON.stringify({ ...officer, authUserId: '71000000-0000-0000-8000-000000000001' })
    const expected = {
      accepted: false,
      value: { statusCode: 400, error: 'Bad Request', message: ['authUserId must be a UUID'] },
    }
    expect(await viaDto(AuthorizeExistingUserDto, json)).toEqual(expected)
    expect(await viaZod(authorizeExistingUserRequest, json)).toEqual(expected)
  })

  // Ruling 4: the DTO let a null list through to a later 403; the contract answers 400.
  it('only the contract rejects a null project list on authorize-existing', async () => {
    const json = JSON.stringify({ ...officer, projectIds: null })
    expect((await viaDto(AuthorizeExistingUserDto, json)).accepted).toBe(true)
    expect(await viaZod(authorizeExistingUserRequest, json)).toEqual({
      accepted: false,
      value: {
        statusCode: 400,
        error: 'Bad Request',
        message: ['projectIds Expected array, received null'],
      },
    })
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/users/user-authorization-parity.test.ts`
Expected: PASS, 40 tests (26 authorize rows, 12 update rows, the message row, the null exception). Any failure means the contract differs from the DTO: stop and report the row, do not edit the table to match.

- [ ] **Step 4: Commit the contracts and the evidence**

```bash
git add -N packages/shared/src apps/api/src/modules/users
pnpm exec biome check --write packages/shared/src/contracts packages/shared/src/index.ts apps/api/src/modules/users/user-authorization-parity.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/shared test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add packages/shared/src/contracts packages/shared/src/index.ts apps/api/src/modules/users/user-authorization-parity.test.ts
git commit -m "feat(shared): add the users contracts with their DTO parity test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: shared = `B_shared + 8`.

- [ ] **Step 5: Write the HTTP test for the switched routes**

Create `apps/api/src/modules/users/users.controller.validation.test.ts`:

```ts
import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { UsersController } from './users.controller'
import { UsersService } from './users.service'

const authUserId = '71000000-0000-4000-8000-000000000001'
const userId = '71000000-0000-4000-8000-000000000002'
const actor = { id: '71000000-0000-4000-8000-000000000003', aal: 'aal2' }
const users = { list: vi.fn(), authorizeExisting: vi.fn(), update: vi.fn() }
let app: INestApplication
let base: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [UsersController],
    providers: [{ provide: UsersService, useValue: users }],
  }).compile()
  app = module.createNestApplication({ logger: false })
  // Stands in for the identity the auth guard attaches; the guard is not under test here.
  app.use((request: { user?: unknown }, _response: unknown, next: () => void) => {
    request.user = actor
    next()
  })
  // Same global validation as main.ts, so each route sees the production pipe chain.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  )
  await app.listen(0, '127.0.0.1')
  const { port } = app.getHttpServer().address() as AddressInfo
  base = `http://127.0.0.1:${port}/users`
})

beforeEach(() => {
  users.authorizeExisting.mockReset().mockResolvedValue({ id: userId })
  users.update.mockReset().mockResolvedValue({ id: userId })
})
afterAll(async () => app?.close())

// Sends a raw JSON body and returns the status with the parsed response body.
async function send(method: 'POST' | 'PATCH', path: string, body: string) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  })
  return { status: response.status, body: await response.json() }
}

describe('users routes body validation', () => {
  it('forwards a trimmed authorization body with the default project list', async () => {
    const result = await send(
      'POST',
      '/authorize-existing',
      JSON.stringify({ authUserId, fullName: '  Synthetic User  ', role: 'PROJECT_OFFICER' }),
    )
    expect(result.status).toBe(201)
    expect(users.authorizeExisting).toHaveBeenCalledWith(actor, {
      authUserId,
      fullName: 'Synthetic User',
      role: 'PROJECT_OFFICER',
      projectIds: [],
    })
  })

  it('answers the class-validator UUID message for an id the editor accepts', async () => {
    const result = await send(
      'POST',
      '/authorize-existing',
      JSON.stringify({
        authUserId: '71000000-0000-0000-8000-000000000001',
        fullName: 'Synthetic User',
        role: 'PROJECT_OFFICER',
      }),
    )
    expect(result).toEqual({
      status: 400,
      body: { statusCode: 400, error: 'Bad Request', message: ['authUserId must be a UUID'] },
    })
    expect(users.authorizeExisting).not.toHaveBeenCalled()
  })

  it('forwards an update with a null name', async () => {
    const body = { fullName: null, role: 'PROGRAM_MANAGER', accountStatus: 'ACTIVE', projectIds: [] }
    const result = await send('PATCH', `/${userId}`, JSON.stringify(body))
    expect(result.status).toBe(200)
    expect(users.update).toHaveBeenCalledWith(actor, userId, body)
  })

  it.each([
    [
      'POST',
      '/authorize-existing',
      { authUserId, fullName: 'A', role: 'PROJECT_OFFICER', organizationId: authUserId },
    ],
    [
      'PATCH',
      `/${userId}`,
      { role: 'PROGRAM_MANAGER', accountStatus: 'ACTIVE', projectIds: [], permissions: [] },
    ],
  ] as const)('%s %s answers 400 for an unknown key without calling the service', async (method, path, body) => {
    expect((await send(method, path, JSON.stringify(body))).status).toBe(400)
    expect(users.authorizeExisting).not.toHaveBeenCalled()
    expect(users.update).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Switch the routes and delete the DTO**

`apps/api/src/modules/users/users.controller.ts`:
- Delete the two lines `// biome-ignore lint/style/useImportType: Nest validation needs the DTO constructors at runtime.` and `import { AuthorizeExistingUserDto, UpdateAuthorizedUserDto } from './users.dto'`.
- Add, below the `@nestjs/common` import block and a blank line:

```ts
import {
  type AuthorizeExistingUserRequest,
  type UpdateAuthorizedUserRequest,
  authorizeExistingUserRequest,
  updateAuthorizedUserRequest,
} from '@pathways/shared'
```

- Add `import { ZodPipe } from '../../common/validation/zod-pipe'` below the `RequirePermission` import.
- In `authorizeExisting(...)` replace `@Body() body: AuthorizeExistingUserDto` with `@Body(new ZodPipe(authorizeExistingUserRequest)) body: AuthorizeExistingUserRequest`.
- In `update(...)` replace `@Body() body: UpdateAuthorizedUserDto,` with `@Body(new ZodPipe(updateAuthorizedUserRequest)) body: UpdateAuthorizedUserRequest,`.

`apps/api/src/modules/users/users.service.ts`:
- Delete `import type { AuthorizeExistingUserDto, UpdateAuthorizedUserDto } from './users.dto'`.
- In the `@pathways/shared` import add `type AuthorizeExistingUserRequest,` and `type UpdateAuthorizedUserRequest,`.
- Replace `input: AuthorizeExistingUserDto` with `input: AuthorizeExistingUserRequest` and `input: UpdateAuthorizedUserDto` with `input: UpdateAuthorizedUserRequest`.

`apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts`: delete the case object whose `file` is `'src/modules/users/users.controller.ts'` (four lines including its braces).

```bash
git rm apps/api/src/modules/users/users.dto.ts apps/api/src/modules/users/users.validation.test.ts apps/api/src/modules/users/user-authorization-parity.test.ts
git grep -nE "AuthorizeExistingUserDto|UpdateAuthorizedUserDto|users\.dto" -- apps packages
```

Expected: the grep prints nothing. `users.validation.test.ts` (11 tests, a describe titled with the phase code `P07`) compiled the controller with TypeScript to prove the DTO metadata survived; the zod route needs no metadata, and the HTTP test of Step 5 replaces it.

- [ ] **Step 7: Run the tests and commit**

```bash
git add -N apps/api/src/modules/users
pnpm --filter @pathways/api exec vitest run src/modules/users src/common
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/api/*.ts')
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api/src/modules/users apps/api/src/common/validation
git commit -m "refactor(api): validate the users bodies with the shared zod contracts

The users DTOs, their parity test and the compiled-metadata test are removed; an HTTP test covers both routes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass; api = `B_api - 7` (users validation 11 and one metadata case removed, HTTP 5 added).

---

### Task 2: Own profile contract

**Files:**
- Create: `packages/shared/src/contracts/profile/own-profile.ts`
- Test: `packages/shared/src/contracts/profile/own-profile.test.ts`, `apps/api/src/modules/profile/profile.controller.validation.test.ts`
- Create then delete: `apps/api/src/modules/profile/own-profile-parity.test.ts`
- Modify: `packages/shared/src/index.ts`, `apps/api/src/modules/profile/profile.controller.ts`, `apps/api/src/modules/profile/profile.service.ts`, `apps/api/src/modules/profile/profile.service.test.ts`
- Delete: `apps/api/src/modules/profile/profile.dto.ts`

**Interfaces:**
- Consumes: `lengthString`, `trimmedInput`, `strictIsoDateString` (S1a), `ZodPipe`.
- Produces: `updateOwnProfileRequest` and `type UpdateOwnProfileRequest = { fullName: string; contactNumber: string; expectedUpdatedAt: string }`, `ownProfileResponse` and `type OwnProfileResponse = { fullName: string; contactNumber: string | null; updatedAt: string }` from `@pathways/shared`.

- [ ] **Step 1: Write the failing contract test**

Create `packages/shared/src/contracts/profile/own-profile.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { ownProfileResponse, updateOwnProfileRequest } from './own-profile'

const body = {
  fullName: 'Synthetic User',
  contactNumber: '+63 900 000 0000',
  expectedUpdatedAt: '2026-10-01T00:00:00.000Z',
}

describe('own profile contracts', () => {
  it('trims the name and accepts an empty contact number', () => {
    expect(
      updateOwnProfileRequest.parse({ ...body, fullName: '  Synthetic User  ', contactNumber: ' ' }),
    ).toEqual({ ...body, contactNumber: '' })
  })

  it.each([
    { ...body, fullName: 'x' },
    { ...body, fullName: 'x'.repeat(81) },
    { ...body, contactNumber: 'not a phone' },
    { ...body, expectedUpdatedAt: '2026-02-30' },
    { fullName: 'Synthetic User', expectedUpdatedAt: body.expectedUpdatedAt },
  ])('rejects %j', (input) => {
    expect(updateOwnProfileRequest.safeParse(input).success).toBe(false)
  })

  it('reads only the three own profile fields', () => {
    const profile = { fullName: 'Synthetic User', contactNumber: null, updatedAt: body.expectedUpdatedAt }
    expect(ownProfileResponse.parse(profile)).toEqual(profile)
    expect(ownProfileResponse.safeParse({ ...profile, email: 'a@example.invalid' }).success).toBe(false)
  })
})
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/profile/own-profile.test.ts`
Expected: FAIL, cannot resolve `./own-profile`.

- [ ] **Step 2: Create the contract and export it**

Create `packages/shared/src/contracts/profile/own-profile.ts`:

```ts
import { z } from 'zod'

import { lengthString, strictIsoDateString, trimmedInput } from '../common/field-schemas'

const contactNumberPattern = /^(?:[+()\-\s0-9]{7,30})?$/

// Body of PATCH profile, rule for rule the former UpdateOwnProfileDto.
export const updateOwnProfileRequest = z
  .object({
    fullName: trimmedInput(lengthString(2, 80)),
    contactNumber: trimmedInput(
      lengthString(0, 30).refine(
        (value) => contactNumberPattern.test(value),
        'must be a contact number',
      ),
    ),
    expectedUpdatedAt: strictIsoDateString,
  })
  .strict()
export type UpdateOwnProfileRequest = z.infer<typeof updateOwnProfileRequest>

// The caller's own profile as GET and PATCH profile return it; the web parses it on every read.
export const ownProfileResponse = z
  .object({
    fullName: z.string(),
    contactNumber: z.string().nullable(),
    updatedAt: z.string().datetime(),
  })
  .strict()
export type OwnProfileResponse = z.infer<typeof ownProfileResponse>
```

In `packages/shared/src/index.ts`, after `export * from './contracts/users/user-authorization'`, add `export * from './contracts/profile/own-profile'`.

```bash
pnpm --filter @pathways/shared exec vitest run src/contracts/profile/own-profile.test.ts
pnpm --filter @pathways/shared build
```

Expected: 7 tests pass; the build succeeds.

- [ ] **Step 3: Write the parity test**

Create `apps/api/src/modules/profile/own-profile-parity.test.ts`:

```ts
import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { updateOwnProfileRequest } from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { UpdateOwnProfileDto } from './profile.dto'

// Same options as main.ts.
const globalPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: false,
})
const zodPipe = new ZodPipe(updateOwnProfileRequest)

type Outcome = { accepted: boolean; value: unknown }

// Records a pipe rejection, which must be a BadRequestException.
function rejected(error: unknown): Outcome {
  expect(error).toBeInstanceOf(BadRequestException)
  return { accepted: false, value: (error as BadRequestException).getResponse() }
}

// The old route: the global pipe with the DTO as design type, on a freshly parsed JSON body.
async function viaDto(json: string): Promise<Outcome> {
  try {
    const dto = await globalPipe.transform(JSON.parse(json), {
      type: 'body',
      metatype: UpdateOwnProfileDto,
    })
    return { accepted: true, value: { ...dto } }
  } catch (error) {
    return rejected(error)
  }
}

// The new route: the global pipe with an Object design type, then the zod pipe.
async function viaZod(json: string): Promise<Outcome> {
  try {
    const body = await globalPipe.transform(JSON.parse(json), { type: 'body', metatype: Object })
    return { accepted: true, value: zodPipe.transform(body) }
  } catch (error) {
    return rejected(error)
  }
}

const badRequest = {
  statusCode: 400,
  error: 'Bad Request',
  message: expect.arrayContaining([expect.any(String)]),
}
const at = '2026-10-09T01:02:03Z'
const base = {
  fullName: 'Ana Cruz',
  contactNumber: '+63 912 345 6789',
  expectedUpdatedAt: '2026-10-09T01:02:03.456Z',
}
const bodies = [
  base,
  { fullName: ' Ana ', contactNumber: '', expectedUpdatedAt: at },
  { fullName: 'Ana', contactNumber: '   ', expectedUpdatedAt: '2026-10-09T01:02:03+08:00' },
  { ...base, expectedUpdatedAt: '2026-10-09' },
  { ...base, expectedUpdatedAt: '2026-02-30' },
  { ...base, expectedUpdatedAt: '2026-10-09 01:02:03Z' },
  { ...base, expectedUpdatedAt: '20261009T010203Z' },
  { ...base, expectedUpdatedAt: 'yesterday' },
  { ...base, expectedUpdatedAt: 5 },
  { ...base, fullName: 'A' },
  { ...base, fullName: 'x'.repeat(81) },
  { ...base, contactNumber: '123456' },
  { ...base, contactNumber: '12345a7' },
  { ...base, contactNumber: '1'.repeat(31) },
  { ...base, contactNumber: null },
  { fullName: 'Ana', expectedUpdatedAt: at },
  { ...base, email: 'a@example.invalid' },
].map((body) => JSON.stringify(body))

describe('UpdateOwnProfileDto and the own profile contract parity', () => {
  it.each(bodies)('both agree on %s', async (json) => {
    const [dto, zod] = await Promise.all([viaDto(json), viaZod(json)])
    expect(zod.accepted).toBe(dto.accepted)
    if (dto.accepted) expect(zod.value).toEqual(dto.value)
    else {
      expect(dto.value).toEqual(badRequest)
      expect(zod.value).toEqual(badRequest)
    }
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/profile/own-profile-parity.test.ts`
Expected: PASS, 17 tests (6 accepted, 11 rejected). Any failure: stop and report the row.

- [ ] **Step 4: Commit the contract and the evidence**

```bash
git add -N packages/shared/src apps/api/src/modules/profile
pnpm exec biome check --write packages/shared/src/contracts packages/shared/src/index.ts apps/api/src/modules/profile/own-profile-parity.test.ts
pnpm typecheck && pnpm lint
git checkout -- apps/web/next-env.d.ts
git add packages/shared/src/contracts packages/shared/src/index.ts apps/api/src/modules/profile/own-profile-parity.test.ts
git commit -m "feat(shared): add the own profile contracts with their DTO parity test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Write the HTTP test**

Create `apps/api/src/modules/profile/profile.controller.validation.test.ts`:

```ts
import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProfileController } from './profile.controller'
import { ProfileService } from './profile.service'

const actor = { id: '76000000-0000-4000-8000-000000000001', aal: 'aal2' }
const updatedAt = '2026-10-01T00:00:00.000Z'
const profiles = { read: vi.fn(), update: vi.fn() }
let app: INestApplication
let url: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [ProfileController],
    providers: [{ provide: ProfileService, useValue: profiles }],
  }).compile()
  app = module.createNestApplication({ logger: false })
  // Stands in for the identity the auth guard attaches; the guard is not under test here.
  app.use((request: { user?: unknown }, _response: unknown, next: () => void) => {
    request.user = actor
    next()
  })
  // Same global validation as main.ts, so the route sees the production pipe chain.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  )
  await app.listen(0, '127.0.0.1')
  const { port } = app.getHttpServer().address() as AddressInfo
  url = `http://127.0.0.1:${port}/profile`
})

beforeEach(() =>
  profiles.update
    .mockReset()
    .mockResolvedValue({ fullName: 'Synthetic User', contactNumber: null, updatedAt }),
)
afterAll(async () => app?.close())

// Sends a raw JSON body and returns the status.
async function patch(body: unknown) {
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return response.status
}

describe('PATCH profile body validation', () => {
  it('forwards the trimmed body', async () => {
    expect(
      await patch({ fullName: '  Synthetic User  ', contactNumber: ' ', expectedUpdatedAt: updatedAt }),
    ).toBe(200)
    expect(profiles.update).toHaveBeenCalledWith(actor, {
      fullName: 'Synthetic User',
      contactNumber: '',
      expectedUpdatedAt: updatedAt,
    })
  })

  it('forwards a date-only expectedUpdatedAt, which the strict ISO 8601 rule accepts', async () => {
    expect(
      await patch({ fullName: 'Synthetic User', contactNumber: '', expectedUpdatedAt: '2026-10-01' }),
    ).toBe(200)
    expect(profiles.update).toHaveBeenCalledTimes(1)
  })

  it.each([
    { fullName: 'Synthetic User', contactNumber: '', expectedUpdatedAt: 'yesterday' },
    {
      fullName: 'Synthetic User',
      contactNumber: '',
      expectedUpdatedAt: updatedAt,
      email: 'a@example.invalid',
    },
  ])('answers 400 for %j without calling the service', async (body) => {
    expect(await patch(body)).toBe(400)
    expect(profiles.update).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Switch the route and delete the DTO**

`apps/api/src/modules/profile/profile.controller.ts`:
- Delete `// biome-ignore lint/style/useImportType: Nest needs the DTO constructor for validation.` and `import { UpdateOwnProfileDto } from './profile.dto'`.
- Add `import { type UpdateOwnProfileRequest, updateOwnProfileRequest } from '@pathways/shared'` below the `@nestjs/common` import and `import { ZodPipe } from '../../common/validation/zod-pipe'` below the `RequirePermission` import.
- In `update(...)` replace `@Body() body: UpdateOwnProfileDto` with `@Body(new ZodPipe(updateOwnProfileRequest)) body: UpdateOwnProfileRequest`.

`apps/api/src/modules/profile/profile.service.ts`: replace `import type { UpdateOwnProfileDto } from './profile.dto'` with `import type { UpdateOwnProfileRequest } from '@pathways/shared'` (placed above the relative imports) and `input: UpdateOwnProfileDto` with `input: UpdateOwnProfileRequest`.

`apps/api/src/modules/profile/profile.service.test.ts`:
- Replace `import { UpdateOwnProfileDto } from './profile.dto'` with:

```ts
import { type UpdateOwnProfileRequest, updateOwnProfileRequest } from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
```

- Replace the two lines of `const validate = (value: unknown) =>` / `pipe.transform(value, { type: 'body', metatype: UpdateOwnProfileDto })` with:

```ts
// The route path: the global pipe passes the zod-typed body through, then the zod pipe parses it.
const validate = async (value: unknown) =>
  new ZodPipe(updateOwnProfileRequest).transform(
    await pipe.transform(value, { type: 'body', metatype: Object }),
  )
```

- Replace `input as UpdateOwnProfileDto` with `input as UpdateOwnProfileRequest`.

```bash
git rm apps/api/src/modules/profile/profile.dto.ts apps/api/src/modules/profile/own-profile-parity.test.ts
git grep -nE "UpdateOwnProfileDto|profile\.dto" -- apps packages
```

Expected: the grep prints nothing.

- [ ] **Step 7: Run the tests and commit**

```bash
git add -N apps/api/src/modules/profile
pnpm --filter @pathways/api exec vitest run src/modules/profile
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/api/*.ts')
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api/src/modules/profile
git commit -m "refactor(api): validate the own profile body with the shared zod contract

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the existing `profile.service.test.ts` cases pass unchanged through the zod path; api = Task 1 count + 4.

---

### Task 3: Sign-in and step-up PIN contracts

**Files:**
- Create: `packages/shared/src/contracts/auth/auth-requests.ts`, `apps/api/src/modules/auth/auth.helpers.ts`
- Test: `packages/shared/src/contracts/auth/auth-requests.test.ts`, `apps/api/src/modules/auth/auth.controller.validation.test.ts`
- Create then delete: `apps/api/src/modules/auth/auth-requests-parity.test.ts`
- Modify: `packages/shared/src/index.ts`, `apps/api/src/modules/auth/auth.controller.ts`, `apps/api/src/modules/auth/signin-lockout.test.ts`, `apps/api/src/modules/auth/beneficiary-step-up-pin.test.ts`
- Delete: `apps/api/src/modules/auth/signin-lockout.dto.ts`, `apps/api/src/modules/auth/beneficiary-step-up-pin.dto.ts`, `apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts`, `apps/api/src/common/validation/field-schemas-parity.test.ts` (ruling 14)

**Interfaces:**
- Consumes: `lengthString` (S1a), `ZodPipe`.
- Produces: `signInRequest` / `type SignInRequest = { email: string; password: string }`, `verifyStepUpPinRequest` / `type VerifyStepUpPinRequest = { pin: string }`, `changeStepUpPinRequest` / `type ChangeStepUpPinRequest = { newPin: string; currentPin?: string | null }` from `@pathways/shared`; `signInBody` from `apps/api/src/modules/auth/auth.helpers.ts`.

- [ ] **Step 1: Write the failing contract test**

Create `packages/shared/src/contracts/auth/auth-requests.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { changeStepUpPinRequest, signInRequest, verifyStepUpPinRequest } from './auth-requests'

describe('auth request contracts', () => {
  it('accepts a sign-in shape; the address format rule is added by the API', () => {
    const body = { email: 'user@example.org', password: 'x' }
    expect(signInRequest.parse(body)).toEqual(body)
  })

  it.each([
    { email: 'user@example.org', password: '' },
    { email: 'user@example.org', password: 'p'.repeat(1025) },
    { email: 'user@example.org', password: 'x', remember: true },
  ])('rejects the sign-in body %j', (body) => {
    expect(signInRequest.safeParse(body).success).toBe(false)
  })

  it('keeps an absent current PIN absent and a null one null', () => {
    expect(changeStepUpPinRequest.parse({ newPin: '529317' })).toEqual({ newPin: '529317' })
    expect(changeStepUpPinRequest.parse({ newPin: '529317', currentPin: null })).toEqual({
      newPin: '529317',
      currentPin: null,
    })
  })

  it.each([{ pin: '4'.repeat(33) }, { pin: 482915 }])('rejects the PIN body %j', (body) => {
    expect(verifyStepUpPinRequest.safeParse(body).success).toBe(false)
  })
})
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/auth/auth-requests.test.ts`
Expected: FAIL, cannot resolve `./auth-requests`.

- [ ] **Step 2: Create the contracts, export them and add the API refinement**

Create `packages/shared/src/contracts/auth/auth-requests.ts`:

```ts
import { z } from 'zod'

import { lengthString } from '../common/field-schemas'

const pinText = lengthString(0, 32)

// Body of POST auth/sign-in; the API adds the class-validator email rule, and the password is never logged or echoed.
export const signInRequest = z
  .object({ email: lengthString(0, 254), password: lengthString(1, 1024) })
  .strict()
export type SignInRequest = z.infer<typeof signInRequest>

// Body of POST auth/step-up/pin and pin/setup; digit and pattern rules stay in the service and the database.
export const verifyStepUpPinRequest = z.object({ pin: pinText }).strict()
export type VerifyStepUpPinRequest = z.infer<typeof verifyStepUpPinRequest>

// Body of POST auth/step-up/pin/change; an absent currentPin selects the authenticator path.
export const changeStepUpPinRequest = z
  .object({ newPin: pinText, currentPin: pinText.nullish() })
  .strict()
export type ChangeStepUpPinRequest = z.infer<typeof changeStepUpPinRequest>
```

In `packages/shared/src/index.ts`, after `export * from './contracts/profile/own-profile'`, add `export * from './contracts/auth/auth-requests'`.

Create `apps/api/src/modules/auth/auth.helpers.ts`:

```ts
import { signInRequest } from '@pathways/shared'
import { isEmail } from 'class-validator'

// The sign-in body: the shared contract plus the class-validator email rule, which accepts a different address set than zod.
export const signInBody = signInRequest.refine((body) => isEmail(body.email), {
  path: ['email'],
  message: 'must be an email',
})
```

```bash
pnpm --filter @pathways/shared exec vitest run src/contracts/auth/auth-requests.test.ts
pnpm --filter @pathways/shared build
```

Expected: 7 tests pass; the build succeeds.

- [ ] **Step 3: Write the parity test**

Create `apps/api/src/modules/auth/auth-requests-parity.test.ts`:

```ts
import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'

import { changeStepUpPinRequest, verifyStepUpPinRequest } from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { signInBody } from './auth.helpers'
import { ChangeStepUpPinDto, VerifyStepUpPinDto } from './beneficiary-step-up-pin.dto'
import { SignInDto } from './signin-lockout.dto'

// Same options as main.ts.
const globalPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: false,
})

type Outcome = { accepted: boolean; value: unknown }

// Records a pipe rejection, which must be a BadRequestException.
function rejected(error: unknown): Outcome {
  expect(error).toBeInstanceOf(BadRequestException)
  return { accepted: false, value: (error as BadRequestException).getResponse() }
}

// The old route: the global pipe with the DTO as design type, on a freshly parsed JSON body.
async function viaDto(metatype: new () => object, json: string): Promise<Outcome> {
  try {
    const dto = await globalPipe.transform(JSON.parse(json), { type: 'body', metatype })
    return { accepted: true, value: { ...dto } }
  } catch (error) {
    return rejected(error)
  }
}

// The new route: the global pipe with an Object design type, then the zod pipe.
async function viaZod(schema: z.ZodTypeAny, json: string): Promise<Outcome> {
  try {
    const body = await globalPipe.transform(JSON.parse(json), { type: 'body', metatype: Object })
    return { accepted: true, value: new ZodPipe(schema).transform(body) }
  } catch (error) {
    return rejected(error)
  }
}

const badRequest = {
  statusCode: 400,
  error: 'Bad Request',
  message: expect.arrayContaining([expect.any(String)]),
}

// Both routes accept with the same value, or both answer the 400 shape without echoing a secret.
async function expectParity(metatype: new () => object, schema: z.ZodTypeAny, json: string) {
  const [dto, zod] = await Promise.all([viaDto(metatype, json), viaZod(schema, json)])
  expect(zod.accepted).toBe(dto.accepted)
  if (dto.accepted) expect(zod.value).toEqual(dto.value)
  else {
    expect(dto.value).toEqual(badRequest)
    expect(zod.value).toEqual(badRequest)
    expect(JSON.stringify(zod.value)).not.toMatch(/pppp|482915|529317/)
  }
}

const emoji = String.fromCodePoint(0x1f600)
const user = { email: 'user@example.org', password: 'pppp-secret' }
const signInBodies = [
  user,
  { ...user, email: 'a!b@example.org' },
  { ...user, email: `${'a'.repeat(65)}@example.org` },
  { ...user, email: `jos${String.fromCharCode(0xe9)}@example.org` },
  { ...user, email: 'a@x-.org' },
  { ...user, email: ' user@example.org' },
  { ...user, password: '' },
  { ...user, password: 'p'.repeat(1025) },
  { ...user, password: emoji.repeat(1024) },
  { ...user, password: 5 },
  { email: 'user@example.org' },
  { ...user, remember: true },
].map((body) => JSON.stringify(body))
const verifyBodies = [
  { pin: '482915' },
  { pin: '' },
  { pin: '4'.repeat(32) },
  { pin: '4'.repeat(33) },
  { pin: 482915 },
  {},
  { pin: null },
  { pin: '482915', sessionId: '99000000-0000-4000-8000-000000000099' },
].map((body) => JSON.stringify(body))
const changeBodies = [
  { newPin: '529317' },
  { newPin: '529317', currentPin: '482915' },
  { newPin: '529317', currentPin: null },
  { newPin: '529317', currentPin: 482915 },
  { newPin: '4'.repeat(33) },
  { currentPin: '482915' },
  { newPin: '529317', method: 'TOTP' },
].map((body) => JSON.stringify(body))

describe('auth DTOs and contract parity', () => {
  it.each(signInBodies)('sign-in agrees on %s', (json) => expectParity(SignInDto, signInBody, json))

  it.each(verifyBodies)('PIN verify agrees on %s', (json) =>
    expectParity(VerifyStepUpPinDto, verifyStepUpPinRequest, json),
  )

  it.each(changeBodies)('PIN change agrees on %s', (json) =>
    expectParity(ChangeStepUpPinDto, changeStepUpPinRequest, json),
  )
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/auth/auth-requests-parity.test.ts`
Expected: PASS, 27 tests (sign-in 12 with 4 accepted, verify 8 with 3 accepted, change 7 with 3 accepted). Any failure: stop and report the row.

- [ ] **Step 4: Commit the contracts and the evidence**

```bash
git add -N packages/shared/src apps/api/src/modules/auth
pnpm exec biome check --write packages/shared/src/contracts packages/shared/src/index.ts apps/api/src/modules/auth/auth.helpers.ts apps/api/src/modules/auth/auth-requests-parity.test.ts
pnpm typecheck && pnpm lint
git checkout -- apps/web/next-env.d.ts
git add packages/shared/src/contracts packages/shared/src/index.ts apps/api/src/modules/auth/auth.helpers.ts apps/api/src/modules/auth/auth-requests-parity.test.ts
git commit -m "feat(shared): add the sign-in and step-up PIN contracts with their DTO parity test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Write the HTTP test (Review Focus 1, 3 and 4)**

Create `apps/api/src/modules/auth/auth.controller.validation.test.ts`:

```ts
import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { BeneficiaryStepUpPinService } from './beneficiary-step-up-pin.service'
import { SignInLockoutService } from './signin-lockout.service'
import { WorkspaceResolutionService } from './workspace-resolution.service'

const auth = { id: '72000000-0000-4000-8000-000000000001', aal: 'aal2' }
const profile = { id: auth.id, userId: '72000000-0000-4000-8000-000000000002' }
const sessionId = '72000000-0000-4000-8000-000000000003'
const pinActor = { auth, profile, sessionId }
const signIns = { signIn: vi.fn() }
const pins = { verify: vi.fn(), setup: vi.fn(), change: vi.fn() }
let app: INestApplication
let base: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [
      { provide: AuthService, useValue: {} },
      { provide: WorkspaceResolutionService, useValue: {} },
      { provide: BeneficiaryStepUpPinService, useValue: pins },
      { provide: SignInLockoutService, useValue: signIns },
    ],
  }).compile()
  app = module.createNestApplication({ logger: false })
  // Stands in for the verified values the auth guard attaches; the guard is not under test here.
  app.use((request: Record<string, unknown>, _response: unknown, next: () => void) => {
    Object.assign(request, { auth, user: profile, authSessionId: sessionId })
    next()
  })
  // Same global validation as main.ts, so each route sees the production pipe chain.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  )
  await app.listen(0, '127.0.0.1')
  const { port } = app.getHttpServer().address() as AddressInfo
  base = `http://127.0.0.1:${port}/auth`
})

beforeEach(() => {
  signIns.signIn.mockReset().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' })
  for (const fn of Object.values(pins)) fn.mockReset().mockResolvedValue({ pinState: 'SET' })
})
afterAll(async () => app?.close())

// Posts a raw JSON body and returns the status with the raw response text.
async function post(path: string, body: string) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
  return { status: response.status, text: await response.text() }
}

describe('auth routes body validation', () => {
  it('forwards an address class-validator accepted although zod email would not', async () => {
    const result = await post(
      '/sign-in',
      JSON.stringify({ email: 'a!b@example.org', password: 'pppp-secret' }),
    )
    expect(result.status).toBe(200)
    expect(signIns.signIn).toHaveBeenCalledWith('a!b@example.org', 'pppp-secret')
  })

  it('answers 400 for an address class-validator refused, before any password grant', async () => {
    const result = await post(
      '/sign-in',
      JSON.stringify({ email: `${'a'.repeat(65)}@example.org`, password: 'pppp-secret' }),
    )
    expect(result.status).toBe(400)
    expect(JSON.parse(result.text).message).toEqual(['email must be an email'])
    expect(result.text).not.toContain('pppp')
    expect(signIns.signIn).not.toHaveBeenCalled()
  })

  it('answers 400 for an unknown sign-in key', async () => {
    const result = await post(
      '/sign-in',
      JSON.stringify({ email: 'user@example.org', password: 'pppp-secret', remember: true }),
    )
    expect(result.status).toBe(400)
    expect(signIns.signIn).not.toHaveBeenCalled()
  })

  it.each(['/step-up/pin', '/step-up/pin/setup'])(
    '%s answers 400 for a numeric PIN without echoing it',
    async (path) => {
      const result = await post(path, '{"pin":482915}')
      expect(result.status).toBe(400)
      expect(result.text).not.toContain('482915')
      expect(pins.verify).not.toHaveBeenCalled()
      expect(pins.setup).not.toHaveBeenCalled()
    },
  )

  it('keeps an absent current PIN absent, so the service takes the authenticator path', async () => {
    expect((await post('/step-up/pin/change', '{"newPin":"529317"}')).status).toBe(200)
    expect(pins.change).toHaveBeenCalledWith(pinActor, '529317', undefined)
  })

  it('passes a null current PIN to the service, as the former DTO did', async () => {
    const result = await post('/step-up/pin/change', '{"newPin":"529317","currentPin":null}')
    expect(result.status).toBe(200)
    expect(pins.change).toHaveBeenCalledWith(pinActor, '529317', null)
  })
})
```

- [ ] **Step 6: Switch the routes and delete the DTOs**

`apps/api/src/modules/auth/auth.controller.ts`:
- Delete the four lines `// biome-ignore lint/style/useImportType: Nest needs the DTO constructors for validation.`, `import { ChangeStepUpPinDto, VerifyStepUpPinDto } from './beneficiary-step-up-pin.dto'`, `// biome-ignore lint/style/useImportType: Nest needs the DTO constructor for validation.` and `import { SignInDto } from './signin-lockout.dto'`.
- Add below the `@nestjs/swagger` import and a blank line:

```ts
import {
  type ChangeStepUpPinRequest,
  type SignInRequest,
  type VerifyStepUpPinRequest,
  changeStepUpPinRequest,
  verifyStepUpPinRequest,
} from '@pathways/shared'
```

- Add `import { ZodPipe } from '../../common/validation/zod-pipe'` below the `Public` decorator import, and `import { signInBody } from './auth.helpers'` directly above `import { AuthService } from './auth.service'`.
- Replace `signIn(@Body() body: SignInDto)` with `signIn(@Body(new ZodPipe(signInBody)) body: SignInRequest)`.
- In `verifyStepUpPin` and `setupStepUpPin` replace `@Body() body: VerifyStepUpPinDto` with `@Body(new ZodPipe(verifyStepUpPinRequest)) body: VerifyStepUpPinRequest`.
- In `changeStepUpPin` replace `@Body() body: ChangeStepUpPinDto` with `@Body(new ZodPipe(changeStepUpPinRequest)) body: ChangeStepUpPinRequest`.

`apps/api/src/modules/auth/signin-lockout.test.ts`:
- Replace `import { SignInDto } from './signin-lockout.dto'` with `import { ZodPipe } from '../../common/validation/zod-pipe'` (above the relative service import) and add `import { signInBody } from './auth.helpers'` directly below it.
- Replace `const validate = (value: unknown) => pipe.transform(value, { type: 'body', metatype: SignInDto })` with:

```ts
// The route path: the global pipe passes the zod-typed body through, then the zod pipe parses it.
const validate = async (value: unknown) =>
  new ZodPipe(signInBody).transform(await pipe.transform(value, { type: 'body', metatype: Object }))
```

`apps/api/src/modules/auth/beneficiary-step-up-pin.test.ts`:
- Replace `import { isAcceptableStepUpPin } from '@pathways/shared'` with `import { changeStepUpPinRequest, isAcceptableStepUpPin, verifyStepUpPinRequest } from '@pathways/shared'`, add `import type { z } from 'zod'` below the `vitest` import, replace `import { ChangeStepUpPinDto, VerifyStepUpPinDto } from './beneficiary-step-up-pin.dto'` with `import { ZodPipe } from '../../common/validation/zod-pipe'` (keep it below the `sentry` import).
- Replace the comment `// Same options as main.ts. Vitest does not emit decorator metadata, so the DTO is explicit.` with `// Same options as main.ts; zod-typed bodies reach the zod pipe unchanged.`
- Replace the two lines `const validate = (metatype: new () => object, value: unknown) =>` / `pipe.transform(value, { type: 'body', metatype })` with:

```ts
const validate = async (schema: z.ZodTypeAny, value: unknown) =>
  new ZodPipe(schema).transform(await pipe.transform(value, { type: 'body', metatype: Object }))
```

- In the test bodies replace every `VerifyStepUpPinDto` with `verifyStepUpPinRequest` and every `ChangeStepUpPinDto` with `changeStepUpPinRequest` (two calls and six table rows); rename the table callback parameter `metatype` to `schema`.

`apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts` now holds only the auth controller case (Task 1 removed the users case), which compiles the controller to prove the DTO metadata survived; it goes below with the DTOs. Remove the auth DTOs and confirm no class-validator DTO is left (ruling 14):

```bash
git rm apps/api/src/modules/auth/signin-lockout.dto.ts apps/api/src/modules/auth/beneficiary-step-up-pin.dto.ts apps/api/src/modules/auth/auth-requests-parity.test.ts
git grep -nE "SignInDto|VerifyStepUpPinDto|ChangeStepUpPinDto|signin-lockout\.dto|beneficiary-step-up-pin\.dto" -- apps packages
git ls-files 'apps/api/src/*.dto.ts'
git grep -l "from 'class-validator'" -- apps/api/src
grep -o "file: 'src/modules/[a-z-]*/[a-z-]*\.controller\.ts'" apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts
```

Expected: the first grep prints nothing; `ls-files` prints only `apps/api/src/modules/public/public.dto.ts` (zod schemas, moved in Task 4); the `class-validator` grep prints only `apps/api/src/common/validation/field-schemas-parity.test.ts` and `apps/api/src/modules/auth/auth.helpers.ts`; the metadata grep prints only `file: 'src/modules/auth/auth.controller.ts'`. Anything else means a class-validator DTO survives: stop and report. Otherwise delete the two tests that existed only for DTOs:

```bash
git rm apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts apps/api/src/common/validation/field-schemas-parity.test.ts
git grep -nE "controller-dto-runtime-metadata|field-schemas-parity" -- apps packages scripts docs ':!docs/activity-log.md' ':!docs/superpowers/*' ':!docs/cr-*'
```

Expected: the grep prints nothing (change records are history; Task 9 records the removal in the modularization CR).

- [ ] **Step 7: Run the tests and commit**

```bash
git add -N apps/api/src
pnpm --filter @pathways/api exec vitest run src/modules/auth src/common
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/api/*.ts')
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api/src
git commit -m "refactor(api): validate the sign-in and step-up PIN bodies with the shared zod contracts

The last class-validator DTOs are gone, so the controller metadata test and the field schema parity test go with them.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the existing no-echo cases in `signin-lockout.test.ts` and `beneficiary-step-up-pin.test.ts` pass through the zod path; api = Task 2 count + 6 - `P_fs` (HTTP 7 added, the last metadata case and the field schema parity test removed).

---

### Task 4: Public contracts and one controller per file

**Files:**
- Create: `packages/shared/src/contracts/public/public-projects.ts`
- Test: `packages/shared/src/contracts/public/public-projects.test.ts`
- Modify: `packages/shared/src/index.ts`, `apps/api/src/modules/public/public.service.ts`, `apps/api/src/modules/public/public.module.ts`
- Delete: `apps/api/src/modules/public/public.dto.ts`
- Move: `apps/api/src/modules/public/public.controller.ts` to `apps/api/src/modules/public/publication.controller.ts`
- Create: `apps/api/src/modules/public/public-projects.controller.ts`

**Interfaces:**
- Produces: `publicProjectResponse` / `type PublicProjectResponse`, `publicationTransitionRequest` / `type PublicationTransitionRequest`, `type PublicationOperation = 'SUBMIT' | 'APPROVE' | 'PUBLISH' | 'WITHDRAW'` from `@pathways/shared` (Task 7 and S8b use the first two); `PublicProjectsController` and `PublicationController` in their own files.

- [ ] **Step 1: Write the failing contract test**

Create `packages/shared/src/contracts/public/public-projects.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { publicProjectResponse, publicationTransitionRequest } from './public-projects'

const snapshot = {
  id: '10000000-0000-4000-8000-000000000001',
  title: 'Synthetic published project',
  code: 'SYN-01',
  approvedSummary: 'Approved synthetic summary.',
  area: 'Synthetic area',
  sector: null,
  startDate: '2026-01-01',
  endDate: null,
  publishedAt: '2026-09-27T00:00:00.000Z',
}

describe('public project contracts', () => {
  it('accepts an approved snapshot', () => {
    expect(publicProjectResponse.parse(snapshot)).toEqual(snapshot)
  })

  it.each([
    { ...snapshot, budget: 1 },
    { ...snapshot, area: 'a'.repeat(501) },
    { ...snapshot, publishedAt: '2026-09-27' },
  ])('rejects the snapshot %j', (value) => {
    expect(publicProjectResponse.safeParse(value).success).toBe(false)
  })

  it('trims a submitted summary', () => {
    const body = {
      clientRequestId: '20000000-0000-4000-8000-000000000002',
      expectedRevision: 0,
      summary: '  Approved summary  ',
    }
    expect(publicationTransitionRequest.parse(body)).toEqual({ ...body, summary: 'Approved summary' })
  })

  it.each([
    { clientRequestId: 'not-a-uuid', expectedRevision: 0 },
    { clientRequestId: '20000000-0000-4000-8000-000000000002', expectedRevision: -1 },
    { clientRequestId: '20000000-0000-4000-8000-000000000002', expectedRevision: 2147483647 },
  ])('rejects the publication body %j', (body) => {
    expect(publicationTransitionRequest.safeParse(body).success).toBe(false)
  })
})
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/public/public-projects.test.ts`
Expected: FAIL, cannot resolve `./public-projects`.

- [ ] **Step 2: Move the schemas to the contract**

Create `packages/shared/src/contracts/public/public-projects.ts` (the two schemas are `public.dto.ts` verbatim under CR 3.6 names):

```ts
import { z } from 'zod'

// One approved public project snapshot; the API and the web both parse it as the anonymous allowlist.
export const publicProjectResponse = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(300),
    code: z.string().max(100),
    approvedSummary: z.string().min(1).max(4000),
    area: z.string().max(500).nullable(),
    sector: z.string().max(300).nullable(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
    publishedAt: z.string().datetime({ offset: true }),
  })
  .strict()
export type PublicProjectResponse = z.infer<typeof publicProjectResponse>

// Body of the four publication transitions; PublicService requires the summary on submit only.
export const publicationTransitionRequest = z
  .object({
    clientRequestId: z.string().uuid(),
    expectedRevision: z.number().int().min(0).max(2147483646),
    summary: z.string().trim().min(1).max(4000).optional(),
  })
  .strict()
export type PublicationTransitionRequest = z.infer<typeof publicationTransitionRequest>
export type PublicationOperation = 'SUBMIT' | 'APPROVE' | 'PUBLISH' | 'WITHDRAW'
```

In `packages/shared/src/index.ts`, after `export * from './contracts/auth/auth-requests'`, add `export * from './contracts/public/public-projects'`.

`apps/api/src/modules/public/public.service.ts`:
- Replace the import block `import { type PublicationOperation, publicProjectSchema, publicationInputSchema } from './public.dto'` (five lines) with nothing, and add above the relative imports:

```ts
import {
  type PublicProjectResponse,
  type PublicationOperation,
  publicProjectResponse,
  publicationTransitionRequest,
} from '@pathways/shared'
```

- Replace `let projects: z.infer<typeof publicProjectSchema>[]` with `let projects: PublicProjectResponse[]`, `z.array(publicProjectSchema)` with `z.array(publicProjectResponse)` and `publicationInputSchema.safeParse(input)` with `publicationTransitionRequest.safeParse(input)`. `z` stays imported (the page and UUID checks use it).

```bash
git rm apps/api/src/modules/public/public.dto.ts
git grep -nE "publicProjectSchema|publicationInputSchema|public\.dto" -- apps packages
pnpm --filter @pathways/shared exec vitest run src/contracts/public/public-projects.test.ts
pnpm --filter @pathways/shared build
pnpm --filter @pathways/api exec vitest run src/modules/public
```

Expected: the grep prints nothing; 8 contract tests pass; the public service tests pass unchanged.

- [ ] **Step 3: Commit**

```bash
git add -N packages/shared/src
pnpm exec biome check --write packages/shared/src/contracts packages/shared/src/index.ts apps/api/src/modules/public/public.service.ts
pnpm typecheck && pnpm lint
git checkout -- apps/web/next-env.d.ts
git add -A packages/shared/src apps/api/src/modules/public
git commit -m "refactor(shared): move the public project and publication schemas into packages/shared

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Create the line check script**

Create `.tmp/s8a/same-lines.mjs` (the F4a script with `@` added to the declaration start, so decorator lines are compared):

```js
// Fails unless the new files hold exactly the non-import lines of the original, ignoring order, blanks and export keywords.
import { readFileSync } from 'node:fs'

const [original, ...rest] = process.argv.slice(2)
const renames = rest.filter((arg) => arg.includes('=')).map((arg) => arg.split('='))
const files = rest.filter((arg) => !arg.includes('='))
const start = /^(?:\/\/|\/\*\*|@|export\s|const\s|let\s|function\s|async\s|class\s|type\s|interface\s)/

// Declaration lines after the import block, with renames undone and export keywords dropped.
const body = (file) => {
  const lines = readFileSync(file, 'utf8').split('\n')
  return lines
    .slice(lines.findIndex((line) => start.test(line)))
    .filter((line) => line.trim() !== '')
    .map((line) => renames.reduce((text, [from, to]) => text.replaceAll(from, to), line))
    .map((line) => line.replace(/^export /, ''))
}
const count = (lines) => lines.reduce((map, line) => map.set(line, (map.get(line) ?? 0) + 1), new Map())
const before = count(body(original))
const after = count(files.flatMap(body))
const problems = []
for (const [line, n] of before)
  if ((after.get(line) ?? 0) !== n) problems.push(`original ${n}x, new ${after.get(line) ?? 0}x: ${line}`)
for (const [line, n] of after) if (!before.has(line)) problems.push(`new only ${n}x: ${line}`)
console.log(problems.length ? problems.join('\n') : `same lines: ${[...before.values()].reduce((a, b) => a + b, 0)}`)
process.exitCode = problems.length ? 1 : 0
```

- [ ] **Step 5: Split the two controllers verbatim**

```bash
git show HEAD:apps/api/src/modules/public/public.controller.ts > .tmp/s8a/public.controller.orig.ts
git mv apps/api/src/modules/public/public.controller.ts apps/api/src/modules/public/publication.controller.ts
```

Create `apps/api/src/modules/public/public-projects.controller.ts`:

```ts
import { Controller, Get, Header, Inject, Param, Query } from '@nestjs/common'
import { Public } from '../../common/decorators/public.decorator'
import { PublicService } from './public.service'

@Controller('public/projects')
export class PublicProjectsController {
  constructor(@Inject(PublicService) private readonly service: PublicService) {}
  @Get()
  @Public()
  @Header('Cache-Control', 'no-store')
  list(@Query('offset') offset = '0', @Query('limit') limit = '50') {
    return this.service.published(undefined, Number(offset), Number(limit))
  }
  @Get(':projectId')
  @Public()
  @Header('Cache-Control', 'no-store')
  get(@Param('projectId') projectId: string) {
    return this.service.published(projectId)
  }
}
```

In `apps/api/src/modules/public/publication.controller.ts`, delete the `@Controller('public/projects')` class (its 16 lines from `@Controller('public/projects')` to its closing `}` and the blank line after it) and replace the import block with:

```ts
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { PublicService } from './public.service'
```

In `apps/api/src/modules/public/public.module.ts`, replace `import { PublicProjectsController, PublicationController } from './public.controller'` with:

```ts
import { PublicProjectsController } from './public-projects.controller'
import { PublicationController } from './publication.controller'
```

```bash
node .tmp/s8a/same-lines.mjs .tmp/s8a/public.controller.orig.ts apps/api/src/modules/public/public-projects.controller.ts apps/api/src/modules/public/publication.controller.ts
git grep -n "public\.controller'" -- apps
```

Expected: `same lines: 70` (the dry run printed exactly this); the grep prints nothing.

- [ ] **Step 6: Run the tests and commit**

```bash
git add -N apps/api/src/modules/public
pnpm exec biome check --write apps/api/src/modules/public
pnpm --filter @pathways/api exec vitest run src/modules/public src/app-module-wiring.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api/src/modules/public
git commit -m "refactor(api): give the public projects and publication controllers their own files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass; api = Task 3 count; shared = `B_shared + 30` (users 8, profile 7, auth 7, public 8).

---

### Task 5: API kernel adoption

**Files:**
- Modify: `apps/api/src/modules/auth/application-profile.service.ts:9,83`, `apps/api/src/modules/auth/beneficiary-step-up-pin.service.ts:15,85,250`, `apps/api/src/modules/users/users.service.ts:388` (line numbers at `a101ad7c`)
- Modify: `apps/api/src/modules/users/users.controller.ts`, `apps/api/src/modules/auth/authorized-data.controller.ts`
- Test: `apps/api/src/modules/users/users.controller.test.ts`, `apps/api/src/modules/auth/authorized-data.controller.test.ts`

**Interfaces:**
- Consumes: `Tx` (F3a); `requestIdentity(request: AuthenticatedRequest): ApplicationIdentity` (S1a).

- [ ] **Step 1: Replace the four transaction client annotations**

`apps/api/src/modules/auth/application-profile.service.ts`: replace `import type { Prisma } from '@prisma/client'` with `import type { Tx } from '../../common/prisma/transaction'` (placed with the other `../../common` imports) and `(transaction: Prisma.TransactionClient)` with `(transaction: Tx)`.

`apps/api/src/modules/auth/beneficiary-step-up-pin.service.ts`: the same import swap; replace `tx: Prisma.TransactionClient,` with `tx: Tx,` and `work: (tx: Prisma.TransactionClient) => Promise<T>,` with `work: (tx: Tx) => Promise<T>,`.

`apps/api/src/modules/users/users.service.ts`: keep `import type { Prisma } from '@prisma/client'` (`Prisma.SystemUserSelect` still uses it); add `import type { Tx } from '../../common/prisma/transaction'` below the `project-scope` import; replace `tx: Prisma.TransactionClient,` with `tx: Tx,`.

```bash
git grep -n "Prisma.TransactionClient" -- apps/api/src/modules/auth apps/api/src/modules/users apps/api/src/modules/profile apps/api/src/modules/public ':!*.test.ts'
pnpm exec biome check --write apps/api/src/modules/auth/application-profile.service.ts apps/api/src/modules/auth/beneficiary-step-up-pin.service.ts apps/api/src/modules/users/users.service.ts
pnpm --filter @pathways/api exec vitest run src/modules/auth src/modules/users
pnpm typecheck && pnpm lint
git checkout -- apps/web/next-env.d.ts
git add apps/api/src/modules/auth apps/api/src/modules/users
git commit -m "refactor(api): annotate the auth and users transaction helpers with Tx

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the grep prints nothing; tests pass.

- [ ] **Step 2: Write the request identity characterization tests (ruling 13)**

Create `apps/api/src/modules/users/users.controller.test.ts`:

```ts
import { ForbiddenException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ApplicationIdentity,
  AuthenticatedRequest,
} from '../../common/authz/application-identity'
import { UsersController } from './users.controller'
import type { UsersService } from './users.service'

const actor = { id: '75000000-0000-4000-8000-000000000001' } as ApplicationIdentity
const users = { list: vi.fn(), authorizeExisting: vi.fn(), update: vi.fn() }
const controller = new UsersController(users as unknown as UsersService)
const anonymous: AuthenticatedRequest = { headers: {} }
const signedIn: AuthenticatedRequest = { headers: {}, user: actor }
const authorize = {
  authUserId: '75000000-0000-4000-8000-000000000002',
  fullName: 'Synthetic User',
  role: 'PROJECT_OFFICER' as const,
  projectIds: [],
}
const change = { role: 'PROJECT_OFFICER' as const, accountStatus: 'ACTIVE' as const, projectIds: [] }

beforeEach(() => {
  for (const fn of Object.values(users)) fn.mockReset().mockResolvedValue([])
})

describe('users controller application profile', () => {
  it('answers 403 before any service call when the request carries no application profile', () => {
    for (const call of [
      () => controller.list(anonymous),
      () => controller.authorizeExisting(anonymous, authorize),
      () => controller.update(anonymous, 'user-1', change),
    ]) {
      expect(call).toThrow(ForbiddenException)
      expect(call).toThrow('Application profile is required.')
    }
    for (const fn of Object.values(users)) expect(fn).not.toHaveBeenCalled()
  })

  it('passes the verified profile to the service', async () => {
    await controller.list(signedIn)
    await controller.authorizeExisting(signedIn, authorize)
    await controller.update(signedIn, 'user-1', change)
    expect(users.list).toHaveBeenCalledWith(actor)
    expect(users.authorizeExisting).toHaveBeenCalledWith(actor, authorize)
    expect(users.update).toHaveBeenCalledWith(actor, 'user-1', change)
  })
})
```

Create `apps/api/src/modules/auth/authorized-data.controller.test.ts`:

```ts
import { ForbiddenException } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ApplicationIdentity,
  AuthenticatedRequest,
} from '../../common/authz/application-identity'
import { AuthorizedDataController } from './authorized-data.controller'
import type { AuthorizedDataService } from './authorized-data.service'

const actor = { id: '75000000-0000-4000-8000-000000000003' } as ApplicationIdentity
const projectId = '75000000-0000-4000-8000-000000000004'
const data = { projects: vi.fn(), beneficiaries: vi.fn(), beneficiaryAggregate: vi.fn() }
const controller = new AuthorizedDataController(data as unknown as AuthorizedDataService)
const anonymous: AuthenticatedRequest = { headers: {} }
const signedIn: AuthenticatedRequest = { headers: {}, user: actor }

beforeEach(() => {
  for (const fn of Object.values(data)) fn.mockReset().mockResolvedValue([])
})

describe('authorized data controller application profile', () => {
  it('answers 403 before any service call when the request carries no application profile', () => {
    for (const call of [
      () => controller.projects(anonymous),
      () => controller.beneficiaries(anonymous, projectId),
      () => controller.aggregate(anonymous, projectId),
    ]) {
      expect(call).toThrow(ForbiddenException)
      expect(call).toThrow('Application profile is required.')
    }
    for (const fn of Object.values(data)) expect(fn).not.toHaveBeenCalled()
  })

  it('passes the verified profile to the service', async () => {
    await controller.projects(signedIn)
    await controller.beneficiaries(signedIn, projectId)
    await controller.aggregate(signedIn, projectId)
    expect(data.projects).toHaveBeenCalledWith(actor)
    expect(data.beneficiaries).toHaveBeenCalledWith(actor, projectId)
    expect(data.beneficiaryAggregate).toHaveBeenCalledWith(actor, projectId)
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/users/users.controller.test.ts src/modules/auth/authorized-data.controller.test.ts`
Expected: PASS, 4 tests, against the unchanged controllers.

- [ ] **Step 3: Use requestIdentity and commit**

`apps/api/src/modules/users/users.controller.ts`: delete the local `function profile(request: AuthenticatedRequest) { ... }` (four lines and the blank line after it); remove `ForbiddenException,` from the `@nestjs/common` import; add `import { requestIdentity } from '../../common/authz/request-identity'` directly below the `application-identity` import; replace the three `profile(request)` calls with `requestIdentity(request)`.

`apps/api/src/modules/auth/authorized-data.controller.ts`: delete the local `function verifiedProfile(request: AuthenticatedRequest) { ... }` (four lines and the blank line after it); the `@nestjs/common` import becomes `import { Controller, Get, Header, Inject, Param, Req } from '@nestjs/common'`; add `import { requestIdentity } from '../../common/authz/request-identity'` directly below the `application-identity` import; replace the three `verifiedProfile(request)` calls with `requestIdentity(request)`; replace the phase-coded doc comment `/** Small read-only Phase 5 contracts. No generic query/write or onboarding API. */` with `// Small read-only access reads; no generic query, write or onboarding route.` (CR 3.5 forbids phase codes).

```bash
git grep -nE "Application profile is required\.'|function (profile|verifiedProfile)\(|Phase 5" -- apps/api/src/modules/users apps/api/src/modules/auth ':!*.test.ts'
git add -N apps/api/src/modules
pnpm exec biome check --write apps/api/src/modules/users apps/api/src/modules/auth/authorized-data.controller.ts apps/api/src/modules/auth/authorized-data.controller.test.ts
pnpm --filter @pathways/api exec vitest run src/modules/users src/modules/auth src/common
pnpm typecheck && pnpm lint
git checkout -- apps/web/next-env.d.ts
git add apps/api/src/modules/users apps/api/src/modules/auth/authorized-data.controller.ts apps/api/src/modules/auth/authorized-data.controller.test.ts
git commit -m "refactor(api): use requestIdentity in the users and authorized data controllers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the grep prints nothing; the 4 new tests pass unchanged; api = Task 4 count + 4.

---

### Task 6: Shared aggregate-only roles, request id pattern and workspace cookie read

**Files:**
- Modify: `packages/shared/src/rbac/route-policy.ts:1,254,268`, `apps/web/src/lib/rbac/access-matrix.ts` (the `@pathways/shared` import and the `const aggregate` line), `EVAL` from Task 0 (the `assessmentDetailDeniedRoles` set and its `@pathways/shared` import), `apps/web/src/lib/services/source-mutation.ts` (the `const uuid` line and its one use)
- Test: `packages/shared/src/rbac/route-policy.test.ts`, `apps/web/src/lib/services/source-mutation.test.ts`
- Modify: `apps/web/src/lib/auth/workspace-access.ts` (`readWorkspaceContextCookie`), `apps/web/src/lib/api/core/request.ts` (`readContextCookie` removed), `apps/web/src/lib/api/core/request-owner.ts` (`ownerCookie`)
- Test: `apps/web/src/lib/auth/workspace-access.test.ts`, `apps/web/src/lib/api/core/request-owner.test.ts`

**Interfaces:**
- Consumes: `aggregateOnlyRoles: readonly string[]` and `routeUuidPattern: RegExp` from `@pathways/shared`; `readWorkspaceContextCookie(): string | undefined` from `@/lib/auth/workspace-access` (F4b); `captureRequestOwner(signal?: AbortSignal | null): () => boolean` from `@/lib/api/core/request-owner` (F4b).
- Produces: `readWorkspaceContextCookie(): string | undefined` as the only reader of the `pathways-context` cookie value in `apps/web/src`.

- [ ] **Step 1: Write the constant characterization tests**

In `packages/shared/src/rbac/route-policy.test.ts`, directly after the test `treats only program and grant managers as aggregate-only` (which already pins the `isAggregateOnly` literal), add the test below. The `routeAllowed` literal sits behind the permission check, so this test pins the outcome the literal defends:

```ts
  it('denies program and grant managers the beneficiary summary in either route', () => {
    for (const role of ['PROGRAM_MANAGER', 'GRANT_MANAGER'] as const) {
      expect(routeAllowed(principal(role), { route: 'beneficiaryReport' })).toBe(false)
      expect(
        routeAllowed(principal(role), { route: 'reportPreview', kind: 'beneficiary-summary' }),
      ).toBe(false)
    }
  })
```

In `apps/web/src/lib/services/source-mutation.test.ts`, inside `describe('owned source mutation recovery', ...)` as its last test, add:

```ts
  it.each([
    ['a version 0 id', '20000000-0000-0000-8000-000000000001'],
    ['a non-RFC variant id', '20000000-0000-4000-0000-000000000001'],
    ['a malformed id', 'not-a-request-id'],
  ])('refuses %s before sending', async (_label, requestId) => {
    const send = vi.fn()
    await expect(
      new SourceMutationTickets(() => requestId).execute(
        context,
        'POST:project/activity',
        { title: 'Synthetic' },
        send,
        parse,
      ),
    ).rejects.toThrow('A valid request identifier is unavailable.')
    expect(send).not.toHaveBeenCalled()
  })
```

The access matrix and the assessment set already have characterization: `apps/web/src/lib/rbac/access-matrix.test.ts` pins `beneficiaryDataAccess` for all six roles, and the two `denies %s before any query, even with a forged grant` tests pin all three assessment denials.

```bash
pnpm --filter @pathways/shared exec vitest run src/rbac/route-policy.test.ts
pnpm --filter @pathways/web exec vitest run src/lib/services/source-mutation.test.ts src/lib/rbac/access-matrix.test.ts
git grep -l "denies %s before any query, even with a forged grant" -- apps/api/src/modules/evaluations
```

Expected: PASS against the unchanged code (1 and 3 new tests); the grep prints the two evaluations test files.

- [ ] **Step 2: Use the shared constants and commit**

`packages/shared/src/rbac/route-policy.ts`: replace `import { type AtomicPermission, hasAtomicPermission } from './authorization-policy'` with `import { type AtomicPermission, aggregateOnlyRoles, hasAtomicPermission } from './authorization-policy'`; replace `['PROGRAM_MANAGER', 'GRANT_MANAGER'].includes(role)` with `aggregateOnlyRoles.includes(role)` and `['PROGRAM_MANAGER', 'GRANT_MANAGER'].includes(principal.roles[0])` with `aggregateOnlyRoles.includes(principal.roles[0])`.

`apps/web/src/lib/rbac/access-matrix.ts`: add `aggregateOnlyRoles,` to the multi-line `@pathways/shared` import (Biome sorts it); replace `const aggregate = code === 'PROGRAM_MANAGER' || code === 'GRANT_MANAGER'` with `const aggregate = aggregateOnlyRoles.includes(code)`.

`EVAL` (ruling 10): change its `@pathways/shared` import to `import { aggregateOnlyRoles, enrollmentAssessmentsQuery, hasAtomicPermission } from '@pathways/shared'` (if S6 left other names in that import, keep them and add `aggregateOnlyRoles`), and replace the five lines

```ts
const assessmentDetailDeniedRoles = new Set([
  'SYSTEM_ADMINISTRATOR',
  'PROGRAM_MANAGER',
  'GRANT_MANAGER',
])
```

with

```ts
// System administrators and the aggregate-only roles never read individual assessment detail.
const assessmentDetailDeniedRoles = new Set(['SYSTEM_ADMINISTRATOR', ...aggregateOnlyRoles])
```

`apps/web/src/lib/services/source-mutation.ts`: add `import { routeUuidPattern } from '@pathways/shared'` directly below the `sensitive-drafts` import that F4b placed on the first line (if that import is absent, add it as the first line followed by a blank line); delete the line `const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`; replace `if (!uuid.test(ticket.id))` with `if (!routeUuidPattern.test(ticket.id))`.

Set `EVAL` in the shell to the Task 0 path first, for example `EVAL=apps/api/src/modules/evaluations/evaluation-assessments.service.ts`, then:

```bash
git grep -nE "'PROGRAM_MANAGER',\s*'GRANT_MANAGER'|code === 'GRANT_MANAGER'" -- packages/shared/src apps/web/src ':!*.test.ts' ':!*.test.tsx'
git grep -n "assessmentDetailDeniedRoles = " -- apps/api/src
git grep -n "\[1-8\]\[0-9a-f\]{3}" -- apps/web/src
pnpm exec biome check --write packages/shared/src/rbac/route-policy.ts packages/shared/src/rbac/route-policy.test.ts apps/web/src/lib/rbac/access-matrix.ts apps/web/src/lib/services/source-mutation.ts apps/web/src/lib/services/source-mutation.test.ts "$EVAL"
pnpm --filter @pathways/shared build
pnpm --filter @pathways/shared exec vitest run src/rbac
pnpm --filter @pathways/web exec vitest run src/lib/services src/lib/rbac src/lib/middleware.test.ts src/features/settings
pnpm --filter @pathways/api exec vitest run src/modules/evaluations src/modules/auth/route-access.service.test.ts
pnpm typecheck && pnpm lint
git checkout -- apps/web/next-env.d.ts
git add packages/shared/src/rbac apps/web/src/lib/rbac/access-matrix.ts apps/web/src/lib/services/source-mutation.ts apps/web/src/lib/services/source-mutation.test.ts "$EVAL"
git commit -m "refactor: use aggregateOnlyRoles for the aggregate-only role lists and routeUuidPattern for mutation tickets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the first grep prints only `packages/shared/src/rbac/authorization-policy.ts` (the `aggregateOnlyRoles` declaration); the second prints the one-line set; the third prints nothing; all tests pass.

- [ ] **Step 3: Write the cookie read characterization tests (ruling 16)**

In `apps/web/src/lib/auth/workspace-access.test.ts`, add `readWorkspaceContextCookie` to the `./workspace-access` import list and append this block at the end of the file (the file runs in the node environment, so `document` is stubbed with browser-formatted cookie strings):

```ts
describe('workspace context cookie', () => {
  it.each([
    ['theme=dark; pathways-context=%7B%7D; sidebar=compact', '%7B%7D'],
    ['pathways-context-old=x; pathways-context=v', 'v'],
    ['pathways-context=', ''],
    ['theme=dark; pathways-context-old=x', undefined],
    ['', undefined],
  ])('reads %j as %j', (cookie, expected) => {
    vi.stubGlobal('document', { cookie })
    try {
      expect(readWorkspaceContextCookie()).toBe(expected)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
```

In `apps/web/src/lib/api/core/request-owner.test.ts`, inside `describe('captureRequestOwner', ...)` as its last test, add:

```ts
  it('counts an empty workspace cookie as an owner and ignores a cookie that only shares the prefix', () => {
    document.cookie = 'pathways-context-old=x; Path=/'
    expect(captureRequestOwner()()).toBe(false)
    document.cookie = 'pathways-context=; Path=/'
    expect(captureRequestOwner()()).toBe(true)
    document.cookie = 'pathways-context-old=; Path=/; Max-Age=0'
  })
```

```bash
pnpm --filter @pathways/web exec vitest run src/lib/auth/workspace-access.test.ts src/lib/api/core/request-owner.test.ts
```

Expected: PASS against the unchanged code (5 and 1 new tests). A jsdom probe confirmed that `document.cookie = 'pathways-context='` keeps an empty-valued entry (`document.cookie` then reads `pathways-context=`), which the owner check counts today.

- [ ] **Step 4: Make the three reads one and commit (Review Focus 4)**

`apps/web/src/lib/auth/workspace-access.ts`: replace the F4b reader and its comment with:

```ts
// The workspace context cookie value; browsers join entries with '; ', and trimming also accepts a bare ';'.
export const readWorkspaceContextCookie = () =>
  document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${contextCookieName}=`))
    ?.slice(contextCookieName.length + 1)
```

`apps/web/src/lib/api/core/request.ts`: delete `function readContextCookie() { ... }` (eight lines and the blank line after it); in the `@/lib/auth/workspace-access` import replace `contextCookieName` with `readWorkspaceContextCookie`; replace both `readContextCookie()` calls with `readWorkspaceContextCookie()`.

`apps/web/src/lib/api/core/request-owner.ts`: in the `@/lib/auth/workspace-access` import replace `contextCookieName` with `readWorkspaceContextCookie`; replace the `ownerCookie` comment and declaration with:

```ts
// The workspace context cookie value, or null outside the browser or when it is missing.
const ownerCookie = () =>
  typeof document === 'undefined' ? null : (readWorkspaceContextCookie() ?? null)
```

```bash
git grep -n "document.cookie" -- apps/web/src/lib/api apps/web/src/lib/auth ':!*.test.ts'
git grep -n "contextCookieName" -- apps/web/src ':!*.test.ts' ':!*.test.tsx'
pnpm exec biome check --write apps/web/src/lib/auth/workspace-access.ts apps/web/src/lib/auth/workspace-access.test.ts apps/web/src/lib/api/core/request.ts apps/web/src/lib/api/core/request-owner.ts apps/web/src/lib/api/core/request-owner.test.ts
git grep -l "keeps the exact workspace across a same-subject token refresh" -- apps/web/src
pnpm --filter @pathways/web exec vitest run src/lib/auth src/lib/api src/lib/services src/providers
pnpm typecheck && pnpm lint
pnpm --filter @pathways/web test 2>&1 | grep -E "Tests +[0-9]+"
pnpm --filter @pathways/web build > .tmp/s8a/web-build-task6.log 2>&1; echo "exit $?"
grep -E "Middleware" .tmp/s8a/web-build-task6.log
git checkout -- apps/web/next-env.d.ts
git add apps/web/src/lib/auth apps/web/src/lib/api/core
git commit -m "refactor(web): read the workspace context cookie in one place

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the first grep prints only three lines, all in `lib/auth/workspace-access.ts` (the reader, `clearWorkspaceContext`, `writeWorkspaceContext`); the second prints only `lib/auth/workspace-access.ts`, `lib/middleware.ts` and `lib/rbac/server-access.ts` lines (the last two read the cookie server-side through Next cookie stores, which parse the header themselves, and stay), none in `request.ts`, `request-owner.ts`, `pathways-client.ts`, `core-feature-client.ts`, `rules-human-client.ts` or the providers (if another file prints, it holds a fourth browser read: stop and report); the token refresh grep names a file under the folders the vitest line runs, and that test and the `does not dispatch an entered beneficiary payload after %s change` cases pass; web build exit 0 with Middleware at most `M0` (growth stops the task and is reported). Counts: shared = Task 4 count + 1; api = Task 5 count (no api test added in this task); web = `B_web + 9` (mutation ids 3, cookie reader 5, owner 1).

---

### Task 7: Delete the dead public microsite detail and profile validation

**Files:**
- Delete: `apps/web/src/features/public/public-project-detail.tsx`, `public-project-detail.test.tsx`, `public-project-charts.tsx`, `public-dashboard-config.ts`, `public-dashboard-config.test.ts` (all under `apps/web/src/features/public/`), `apps/web/src/features/profile/profile-validation.ts`, `apps/web/src/features/profile/profile-validation.test.ts`
- Modify: `apps/web/src/lib/services/public-projects.ts` (`mapPublicSnapshot` and its type import), `apps/web/src/types/pathways.ts` (seven view models)
- Modify: `docs/deferred-features.md` (rows naming `public-project-detail.tsx`, one new row)

- [ ] **Step 1: Prove the closure is dead**

```bash
git grep -nE "public-project-detail|public-project-charts|public-dashboard-config|profile-validation|mapPublicSnapshot" -- apps/web/src apps/web/e2e | grep -vE "features/public/public-(project-detail|project-charts|dashboard-config)|features/profile/profile-validation|lib/services/public-projects.ts"
git grep -lwE "PublicIndicator|PublicMilestone|PublicDashboardSectionId|PublicDashboardLayoutPreset|PublicDashboardPresentation|PublicBeneficiaryMediaRecord|PublicProjectRecord" -- apps/web/src
```

Expected: the first prints nothing; the second prints exactly six files: `types/pathways.ts`, `lib/services/public-projects.ts` and four closure files under `features/public` (`public-dashboard-config.test.ts`, `public-dashboard-config.ts`, `public-project-charts.tsx`, `public-project-detail.tsx`). Anything else: stop and report.

- [ ] **Step 2: Create the view-model removal script**

Create `.tmp/s8a/drop-public-view-models.mjs`:

```js
// Deletes the contiguous public microsite view-model block from types/pathways.ts.
import { readFileSync, writeFileSync } from 'node:fs'

const file = 'apps/web/src/types/pathways.ts'
const lines = readFileSync(file, 'utf8').split('\n')
const first = lines.indexOf('export interface PublicIndicator {')
const record = lines.indexOf('export interface PublicProjectRecord {')
const last = lines.indexOf('}', record)
if (first < 0 || record < first || last < record) throw new Error('public view-model block not found')
const names = lines
  .slice(first, last + 1)
  .filter((line) => line.startsWith('export '))
  .map((line) => line.split(/\s+/)[2])
const count = last + 1 - first + (lines[last + 1] === '' ? 1 : 0)
lines.splice(first, count)
writeFileSync(file, lines.join('\n'))
console.log(`removed ${count} lines: ${names.join(', ')}`)
```

- [ ] **Step 3: Delete the files, the mapper and the view models**

```bash
git rm apps/web/src/features/public/public-project-detail.tsx apps/web/src/features/public/public-project-detail.test.tsx apps/web/src/features/public/public-project-charts.tsx apps/web/src/features/public/public-dashboard-config.ts apps/web/src/features/public/public-dashboard-config.test.ts apps/web/src/features/profile/profile-validation.ts apps/web/src/features/profile/profile-validation.test.ts
node .tmp/s8a/drop-public-view-models.mjs
```

Expected: `removed 77 lines: PublicIndicator, PublicMilestone, PublicDashboardSectionId, PublicDashboardLayoutPreset, PublicDashboardPresentation, PublicBeneficiaryMediaRecord, PublicProjectRecord`.

In `apps/web/src/lib/services/public-projects.ts`, delete `import type { PublicProjectRecord } from '@/types/pathways'` and the whole `export function mapPublicSnapshot(input: unknown): PublicProjectRecord { ... }` block (from that line to its closing `}` and the blank line after it). `snapshot`, `PublicProjectSnapshot` and `readPublicSnapshots` stay.

- [ ] **Step 4: Update the deferred features register**

`docs/deferred-features.md`:
- In the row starting `| Prototype info notices |`, replace `` `apps/web/src/features/public/public-project-detail.tsx` (editor CTA note) `` with `` `apps/web/src/features/public/public-project-detail.tsx` (editor CTA note; the file was later deleted as dead code, see the Public project microsite detail row) ``.
- In the row starting `| Unfinished-control UI hidden for demo |`, replace `` Edit staff preview in `apps/web/src/features/public/public-project-detail.tsx`; `` with `` Edit staff preview in the deleted `apps/web/src/features/public/public-project-detail.tsx` (see the Public project microsite detail row); ``.
- Append a row at the end of the table, with `<date>` from `date +%F`:

```markdown
| Public project microsite detail | Removed | <date> | Dead code: the staff-customizable public project dashboard was imported only by its own test (its editor has not been rendered since 10c5c4c8, per the defense readiness audit of 2026-10-05); the public tracker serves every public project page. Deleted by the codebase modularization S8a. | Formerly `apps/web/src/features/public/public-project-detail.tsx`, `public-project-charts.tsx`, `public-dashboard-config.ts`, the seven `Public*` view models in `apps/web/src/types/pathways.ts` and `mapPublicSnapshot` in `apps/web/src/lib/services/public-projects.ts` | Restore the files with `git show <commit>^:<path>`, where `<commit>` is the S8a deletion commit recorded in `docs/activity-log.md`, then route a page to the component. |
```

- [ ] **Step 5: Run the tests and commit**

```bash
pnpm exec biome check --write apps/web/src/lib/services/public-projects.ts apps/web/src/types/pathways.ts
pnpm --filter @pathways/web exec vitest run src/features/public src/features/profile
pnpm typecheck && pnpm lint
pnpm --filter @pathways/web test 2>&1 | grep -E "Tests +[0-9]+"
pnpm --filter @pathways/web build > .tmp/s8a/web-build-task6.log 2>&1; echo "exit $?"
pnpm docs:check 2>&1 | tail -3
git checkout -- apps/web/next-env.d.ts
git add -A apps/web/src docs/deferred-features.md
git commit -m "refactor(web): delete the dead public microsite detail and profile validation

Seven files (1569 lines), mapPublicSnapshot and seven public view models had no production importer.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass; web = Task 6 web count - 6 (detail 1, dashboard config 3, profile validation 2); build exit 0; docs check failure count equals the Task 0 baseline.

---

### Task 8: Users, own profile and public web clients in lib/api

**Files:**
- Create: `apps/web/src/lib/api/users.ts`
- Test: `apps/web/src/lib/api/users.test.ts`
- Modify: `apps/web/src/lib/services/pathways-client.ts` (user members removed), the three production callers and five test mocks listed by the scripts, the test holding `pathwaysClient.getUsers()`
- Move: `apps/web/src/lib/services/own-profile-client.ts` to `apps/web/src/lib/api/profile.ts`; `apps/web/src/lib/services/public-projects.ts` to `apps/web/src/lib/api/public.ts`
- Modify (specifier only, 10 files): listed by `repoint.mjs` in Step 6
- Modify: `apps/web/src/features/profile/own-profile-workspace.tsx`, `apps/web/src/features/public/public-tracker-view.tsx`, `apps/web/src/features/public/public-organizations.tsx`, `apps/web/src/features/public/public-tracker-view.test.tsx`

**Interfaces:**
- Consumes: `requestFoundation`, `PathwaysClientError` from `@/lib/api/core/request` (F4b); `AuthorizedUserResponse` (Task 1), `UpdateOwnProfileRequest`, `ownProfileResponse`, `OwnProfileResponse` (Task 2), `publicProjectResponse`, `PublicProjectResponse` (Task 4); `roleCodeByName` from `@pathways/shared`.
- Produces: `usersClient = { getUsers(signal?: AbortSignal): Promise<UserRecord[]>; authorizeExistingUser(input: AuthorizeExistingUserInput): Promise<UserRecord>; updateAuthorizedUser(id: string, input: UpdateAuthorizedUserInput): Promise<UserRecord> }` from `@/lib/api/users`; `ownProfileClient = { read(): Promise<OwnProfileResponse>; update(input: UpdateOwnProfileRequest): Promise<OwnProfileResponse> }` from `@/lib/api/profile`; `readPublicSnapshots(projectId?: string): Promise<PublicProjectResponse[]>` from `@/lib/api/public`.

- [ ] **Step 1: Write the failing users client test**

Create `apps/web/src/lib/api/users.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => ({ requestFoundation: vi.fn() }))
vi.mock('@/lib/api/core/request', () => ({
  requestFoundation: request.requestFoundation,
  PathwaysClientError: class PathwaysClientError extends Error {
    constructor(
      message: string,
      readonly code: string,
    ) {
      super(message)
    }
  },
}))

import { usersClient } from './users'

const row = {
  id: '74000000-0000-4000-8000-000000000001',
  authUserId: '74000000-0000-4000-8000-000000000002',
  name: 'Synthetic User',
  email: 'synthetic@example.invalid',
  role: 'Project Officer',
  roleCode: 'PROJECT_OFFICER',
  accountStatus: 'DEACTIVATED',
  projectIds: [],
  projectAccess: [],
  createdAt: '2026-10-01T00:00:00.000Z',
}

beforeEach(() => request.requestFoundation.mockReset())

describe('users client', () => {
  it('reads users with the caller signal and maps account status labels', async () => {
    request.requestFoundation.mockResolvedValue([row])
    const signal = new AbortController().signal
    await expect(usersClient.getUsers(signal)).resolves.toEqual([
      { ...row, accountStatus: 'Deactivated', signInMethod: 'Supabase account' },
    ])
    expect(request.requestFoundation).toHaveBeenCalledWith('/users', { signal })
  })

  it.each([[Array(201).fill(row)], [{ users: [] }]])(
    'refuses an oversized or non-list user response',
    async (value) => {
      request.requestFoundation.mockResolvedValue(value)
      await expect(usersClient.getUsers()).rejects.toMatchObject({
        message: 'Invalid user response.',
        code: 'network',
      })
    },
  )

  it('authorizes an existing identity with the role code', async () => {
    request.requestFoundation.mockResolvedValue({ ...row, accountStatus: 'ACTIVE' })
    const input = {
      authUserId: row.authUserId,
      fullName: 'Synthetic User',
      role: 'Project Officer' as const,
      projectIds: ['74000000-0000-4000-8000-000000000003'],
    }
    await expect(usersClient.authorizeExistingUser(input)).resolves.toMatchObject({
      accountStatus: 'Active',
    })
    expect(request.requestFoundation).toHaveBeenCalledWith('/users/authorize-existing', {
      method: 'POST',
      body: JSON.stringify({ ...input, role: 'PROJECT_OFFICER' }),
    })
  })

  it('updates a user by encoded id with the status code', async () => {
    request.requestFoundation.mockResolvedValue(row)
    await usersClient.updateAuthorizedUser('a/b', {
      role: 'Program Manager',
      accountStatus: 'Deactivated',
      projectIds: [],
    })
    expect(request.requestFoundation).toHaveBeenCalledWith('/users/a%2Fb', {
      method: 'PATCH',
      body: JSON.stringify({ role: 'PROGRAM_MANAGER', accountStatus: 'DEACTIVATED', projectIds: [] }),
    })
  })
})
```

Run: `pnpm --filter @pathways/web exec vitest run src/lib/api/users.test.ts`
Expected: FAIL, cannot resolve `./users`.

- [ ] **Step 2: Create the users client from the pathways client code**

Create `apps/web/src/lib/api/users.ts` (the three methods, `mapUser` and `parseUsers` move verbatim; `ApiUser` becomes the shared response type):

```ts
import { type AuthorizedUserResponse, roleCodeByName } from '@pathways/shared'

import type {
  AuthorizeExistingUserInput,
  UpdateAuthorizedUserInput,
  UserRecord,
} from '@/types/pathways'
import { PathwaysClientError, requestFoundation } from '@/lib/api/core/request'

function mapUser(user: AuthorizedUserResponse): UserRecord {
  const accountStatus = {
    ACTIVE: 'Active',
    INVITED: 'Invited',
    SUSPENDED: 'Suspended',
    DEACTIVATED: 'Deactivated',
    ARCHIVED: 'Archived',
  } as const
  return {
    ...user,
    accountStatus: accountStatus[user.accountStatus],
    signInMethod: 'Supabase account',
  }
}

function parseUsers(value: unknown) {
  if (!Array.isArray(value) || value.length > 200)
    throw new PathwaysClientError('Invalid user response.', 'network')
  return value.map((row) => mapUser(row as AuthorizedUserResponse))
}

// Authorized user reads and writes; the API decides every role and project scope.
export const usersClient = {
  async getUsers(signal?: AbortSignal): Promise<UserRecord[]> {
    return requestFoundation('/users', { signal }).then(parseUsers)
  },

  async authorizeExistingUser(input: AuthorizeExistingUserInput): Promise<UserRecord> {
    return mapUser(
      (await requestFoundation('/users/authorize-existing', {
        method: 'POST',
        body: JSON.stringify({
          authUserId: input.authUserId,
          fullName: input.fullName,
          role: roleCodeByName[input.role],
          projectIds: input.projectIds,
        }),
      })) as AuthorizedUserResponse,
    )
  },

  async updateAuthorizedUser(id: string, input: UpdateAuthorizedUserInput): Promise<UserRecord> {
    return mapUser(
      (await requestFoundation(`/users/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: input.fullName,
          role: roleCodeByName[input.role],
          accountStatus: input.accountStatus === 'Active' ? 'ACTIVE' : 'DEACTIVATED',
          projectIds: input.projectIds,
        }),
      })) as AuthorizedUserResponse,
    )
  },
}
```

Run: `pnpm --filter @pathways/web exec vitest run src/lib/api/users.test.ts`
Expected: PASS, 5 tests.

In `apps/web/src/lib/services/pathways-client.ts` delete: the three `PathwaysClient` interface members `getUsers(signal?: AbortSignal): Promise<UserRecord[]>`, `authorizeExistingUser(input: AuthorizeExistingUserInput): Promise<UserRecord>` and `updateAuthorizedUser(id: string, input: UpdateAuthorizedUserInput): Promise<UserRecord>`; the three class methods of the same names (from `async getUsers(` to the closing `}` of `updateAuthorizedUser` and the blank line after it); `interface ApiUser { ... }`; `function mapUser(user: ApiUser): UserRecord { ... }`; `function parseUsers(value: unknown) { ... }`. Then:

```bash
for name in AuthorizeExistingUserInput UpdateAuthorizedUserInput UserRecord roleCodeByName ApiUser mapUser parseUsers; do echo "$name $(grep -cw "$name" apps/web/src/lib/services/pathways-client.ts)"; done
```

Each of the first four that prints `1` is now only an import name: delete it from its import list. Expected after the deletes: every line prints `0`.

- [ ] **Step 3: Create the call-site script and repoint the user calls**

Create `.tmp/s8a/users-calls.mjs`:

```js
// Moves pathwaysClient user calls in non-test web files to usersClient and fixes their imports.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const call = /\bpathwaysClient(\s*)\.(getUsers|authorizeExistingUser|updateAuthorizedUser)\b/g
const clientImport = /import\s*\{([^}]*)\}\s*from\s*'@\/lib\/services\/pathways-client'\n/

// Non-test TypeScript files under a folder.
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : []
  })

let total = 0
for (const file of walk(path.resolve('apps/web/src'))) {
  const original = readFileSync(file, 'utf8')
  const calls = original.match(call)?.length ?? 0
  if (!calls) continue
  let text = original.replace(call, 'usersClient$1.$2')
  const match = text.match(clientImport)
  if (!match) throw new Error(`${file}: no pathways-client import`)
  // Drops pathwaysClient from the import when no other call uses it.
  const stillUsed = /\bpathwaysClient\b/.test(text.replace(clientImport, ''))
  const names = match[1]
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name && (stillUsed || name !== 'pathwaysClient'))
  const replacement = `${names.length ? `import { ${names.join(', ')} } from '@/lib/services/pathways-client'\n` : ''}import { usersClient } from '@/lib/api/users'\n`
  text = text.replace(clientImport, replacement)
  writeFileSync(file, text)
  total += calls
  console.log(`${path.relative(process.cwd(), file).split(path.sep).join('/')}: ${calls}${stillUsed ? '' : ', pathwaysClient import removed'}`)
}
console.log(`total: ${total}`)
```

```bash
node .tmp/s8a/users-calls.mjs
git grep -nE "\bpathwaysClient\b" -- apps/web/src ':!*.test.ts' ':!*.test.tsx' | grep -E "\.(getUsers|authorizeExistingUser|updateAuthorizedUser)\b"
```

Expected output (the dry run on `a101ad7c` printed exactly this; S1 may have moved the two project files into a subfolder and removed their other `pathwaysClient` calls, which adds `, pathwaysClient import removed` to their lines):

```text
apps/web/src/features/projects/project-setup-form.tsx: 1
apps/web/src/features/projects/project-team-editor-dialog.tsx: 1
apps/web/src/features/settings/user-management-workspace.tsx: 6
total: 8
```

The grep prints nothing.

- [ ] **Step 4: Move the five test mocks with their calls (Review Focus 5)**

`apps/web/src/features/settings/user-management-workspace.test.tsx`: in the `vi.mock('@/lib/services/pathways-client', ...)` factory delete the three lines `getUsers: (...args: unknown[]) => getUsers(...args),`, `authorizeExistingUser: (...args: unknown[]) => authorizeExistingUser(...args),` and `updateAuthorizedUser: (...args: unknown[]) => updateAuthorizedUser(...args),`, and add directly above that `vi.mock`:

```ts
vi.mock('@/lib/api/users', () => ({
  usersClient: {
    getUsers: (...args: unknown[]) => getUsers(...args),
    authorizeExistingUser: (...args: unknown[]) => authorizeExistingUser(...args),
    updateAuthorizedUser: (...args: unknown[]) => updateAuthorizedUser(...args),
  },
}))
```

If the pathways-client factory's `pathwaysClient` object is then empty and the component no longer imports `pathwaysClient`, delete the object (keep the factory if it still provides `PathwaysClientError` and the component imports it from there).

`project-activities-rbac.test.tsx`, `project-activities-workspace.test.tsx` (both under `features/projects/activities/components/` after S2b), `project-team-editor-dialog.test.tsx` (each mocks `pathwaysClient: api` with `getUsers` in the hoisted `api`): add directly below the pathways-client `vi.mock`:

```ts
vi.mock('@/lib/api/users', () => ({ usersClient: api }))
```

The two activities tests assert `api.getUsers` is or is not called; the shared object keeps both assertions meaningful.

`project-setup-form.test.tsx`: delete `getUsers: testState.getUsers,` from the pathways-client factory and add below it:

```ts
vi.mock('@/lib/api/users', () => ({ usersClient: { getUsers: testState.getUsers } }))
```

If S1 rewrote these mocks, apply the same rule: the `@/lib/api/users` mock exposes the same function objects the test configures and asserts on.

Delete the line `await expect(pathwaysClient.getUsers()).rejects.toMatchObject({ code: 'unauthorized' })` from the test that holds it (Task 0 Step 2 named the file); `usersClient` calls the same `requestFoundation`, whose unauthorized path stays covered there.

```bash
git grep -l "vi.mock('@/lib/api/users'" -- apps/web/src | wc -l
git grep -nE "\b(getUsers|authorizeExistingUser|updateAuthorizedUser)\b" -- apps/web/src/lib/services
```

Expected: `5`; the second prints nothing.

- [ ] **Step 5: Run the tests and commit**

```bash
git add -N apps/web/src/lib/api
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/web/*.ts' 'apps/web/*.tsx')
pnpm --filter @pathways/web exec vitest run src/lib src/features/settings src/features/projects
pnpm typecheck && pnpm lint
pnpm --filter @pathways/web test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/web/src
git commit -m "refactor(web): move the users client to lib/api/users with the shared response type

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass; web = Task 7 web count + 5.

- [ ] **Step 6: Move the own profile and public snapshot clients**

Create `.tmp/s8a/repoint.mjs` (the F4a script, unchanged):

```js
// Rewrites import, re-export, dynamic import and vi.mock specifiers that resolve to a moved web module.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [mapFile, ...roots] = process.argv.slice(2)
const web = path.resolve('apps/web/src')
const moves = new Map(Object.entries(JSON.parse(readFileSync(mapFile, 'utf8'))))
const pattern =
  /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|vi\.(?:mock|doMock|importActual)(?:<[^>]*>)?\(\s*)(['"])([^'"]+)\2/g

// TypeScript files under a folder.
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })

const top = (file) => path.relative(web, file).split(path.sep)[0]
const inWeb = (file) => !path.relative(web, file).startsWith('..')

// The web-relative module a specifier names, or null when it points outside apps/web/src.
const target = (file, spec) => {
  if (spec.startsWith('@/')) return spec.slice(2)
  if (!spec.startsWith('.')) return null
  const resolved = path.resolve(path.dirname(file), spec)
  return inWeb(resolved) ? path.relative(web, resolved).split(path.sep).join('/') : null
}

// A sibling is ./name; otherwise an alias stays an alias and a relative path stays relative within one top folder.
const specifier = (file, spec, moved) => {
  const absolute = path.join(web, moved)
  if (path.dirname(absolute) === path.dirname(file)) return `./${path.basename(absolute)}`
  if (spec.startsWith('@/') || (inWeb(file) && top(file) !== top(absolute))) return `@/${moved}`
  const relative = path.relative(path.dirname(file), absolute).split(path.sep).join('/')
  return relative.startsWith('.') ? relative : `./${relative}`
}

let total = 0
for (const file of roots.flatMap((root) => walk(path.resolve(root)))) {
  let count = 0
  const text = readFileSync(file, 'utf8').replace(pattern, (whole, lead, quote, spec) => {
    const moved = moves.get(target(file, spec))
    if (!moved) return whole
    count++
    return `${lead}${quote}${specifier(file, spec, moved)}${quote}`
  })
  if (!count) continue
  writeFileSync(file, text)
  total += count
  console.log(`${path.relative(process.cwd(), file).split(path.sep).join('/')}: ${count}`)
}
console.log(`total: ${total}`)
```

Create `.tmp/s8a/clients-map.json`:

```json
{
  "lib/services/own-profile-client": "lib/api/profile",
  "lib/services/public-projects": "lib/api/public"
}
```

```bash
git mv apps/web/src/lib/services/own-profile-client.ts apps/web/src/lib/api/profile.ts
git mv apps/web/src/lib/services/public-projects.ts apps/web/src/lib/api/public.ts
node .tmp/s8a/repoint.mjs .tmp/s8a/clients-map.json apps/web/src apps/web/e2e
```

Expected output (the dry run on `a101ad7c` after Task 7 printed exactly this):

```text
apps/web/src/app/(public)/organizations/[slug]/page.tsx: 1
apps/web/src/app/(public)/public/projects/page.tsx: 1
apps/web/src/app/(public)/public/projects/[projectId]/page.tsx: 1
apps/web/src/features/profile/own-password-form.test.tsx: 1
apps/web/src/features/profile/own-password-form.tsx: 1
apps/web/src/features/profile/own-profile-workspace.test.tsx: 1
apps/web/src/features/profile/own-profile-workspace.tsx: 1
apps/web/src/features/public/public-organizations.tsx: 1
apps/web/src/features/public/public-tracker-view.test.tsx: 1
apps/web/src/features/public/public-tracker-view.tsx: 1
total: 10
```

The moved `lib/api/profile.ts` keeps `import { requestFoundation } from '@/lib/api/core/request'` as F4b wrote it (ruling 15); the script does not touch it, because that module did not move. Then:

```bash
git grep -nE "lib/services/(own-profile-client|public-projects)" -- apps
git add -N apps/web/src/lib/api
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/web/*.ts' 'apps/web/*.tsx')
pnpm --filter @pathways/web exec vitest run src/features/profile src/features/public
pnpm typecheck && pnpm lint
git checkout -- apps/web/next-env.d.ts
git add -A apps/web/src
git status --short apps/web/src | grep -c "^R"
git commit -m "refactor(web): move the own profile and public snapshot clients to lib/api

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the grep prints nothing; tests pass; `2` renames.

- [ ] **Step 7: Adopt the shared response contracts**

Add to `apps/web/src/features/public/public-tracker-view.test.tsx`, after the test `rejects a public response carrying a field outside the allowlist`:

```ts
  it('rejects a public response whose area exceeds the API bound', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify([{ ...snapshot, area: 'a'.repeat(501) }]))),
    )
    await expect(readPublicSnapshots()).rejects.toThrow()
  })
```

Run: `pnpm --filter @pathways/web exec vitest run src/features/public/public-tracker-view.test.tsx`
Expected: FAIL on the new test (the web copy of the schema has no `area` bound).

`apps/web/src/lib/api/public.ts`:
- Delete the local `const snapshot = z.object({ ... }).strict()` block and `export type PublicProjectSnapshot = z.infer<typeof snapshot>`.
- Add `import { type PublicProjectResponse, publicProjectResponse } from '@pathways/shared'` above `import { z } from 'zod'`.
- In `readPublicSnapshots` replace the return type `Promise<PublicProjectSnapshot[]>` with `Promise<PublicProjectResponse[]>` and the last line's `snapshot.parse(value)` and `z.array(snapshot)` with `publicProjectResponse.parse(value)` and `z.array(publicProjectResponse)`.

`apps/web/src/features/public/public-tracker-view.tsx` and `apps/web/src/features/public/public-organizations.tsx`: replace `import type { PublicProjectSnapshot } from '@/lib/api/public'` with `import type { PublicProjectResponse } from '@pathways/shared'` and every `PublicProjectSnapshot` with `PublicProjectResponse` (one use in each file).

`apps/web/src/lib/api/profile.ts`: delete the local `ownProfileResponseSchema` block and `export type OwnProfileRecord = ...`; replace `import { z } from 'zod'` with `import { type UpdateOwnProfileRequest, ownProfileResponse } from '@pathways/shared'`; replace both `ownProfileResponseSchema.parse(` with `ownProfileResponse.parse(`; replace the `update` parameter type `{ fullName: string; contactNumber: string; expectedUpdatedAt: string }` with `UpdateOwnProfileRequest`.

`apps/web/src/features/profile/own-profile-workspace.tsx`: replace `import { type OwnProfileRecord, ownProfileClient } from '@/lib/api/profile'` with `import { ownProfileClient } from '@/lib/api/profile'`, add `import type { OwnProfileResponse } from '@pathways/shared'`, and replace `record: OwnProfileRecord` with `record: OwnProfileResponse`.

```bash
git grep -nE "PublicProjectSnapshot|OwnProfileRecord|ownProfileResponseSchema" -- apps/web
pnpm exec biome check --write apps/web/src/lib/api apps/web/src/features/public apps/web/src/features/profile
pnpm --filter @pathways/web exec vitest run src/lib/api src/features/public src/features/profile
pnpm typecheck && pnpm lint
pnpm --filter @pathways/web test 2>&1 | grep -E "Tests +[0-9]+"
pnpm --filter @pathways/web build > .tmp/s8a/web-build-task7.log 2>&1; echo "exit $?"
git checkout -- apps/web/next-env.d.ts
git add -A apps/web/src
git commit -m "refactor(web): parse public snapshots and the own profile with the shared contracts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the grep prints nothing; all pass; web = Step 5 count + 1; build exit 0.

---

### Task 9: Records and SAD routing

**Files:**
- Modify: `scripts/sad/check.ts` (organization isolation globs), `scripts/sad/check.test.ts`, `docs/sad-pathways.md:36`
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.6, 3.7, 9)
- Modify: `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05, MOD-06, MOD-11, MOD-16, MOD-17 rows)
- Modify: `docs/qad-pathways.md` (QAD-A05 row), `docs/index.md`, `docs/activity-log.md`

- [ ] **Step 1: Route the auth and users contracts to the organization isolation checker (ruling 12)**

In `scripts/sad/check.test.ts`, directly after the test `routes shared rbac policy changes to the organization isolation checker`, add:

```ts
  it('routes auth and user authorization contracts to the organization isolation checker', () => {
    const files = [
      'packages/shared/src/contracts/auth/auth-requests.ts',
      'packages/shared/src/contracts/users/user-authorization.ts',
    ]
    const routed = routing(files.map((file) => change(file, 'new', 'old')))
    expect(routed['organization-isolation-checker']).toEqual(files)
  })
```

Run: `pnpm sad:test`
Expected: FAIL on the new test.

In `scripts/sad/check.ts`, `organization-isolation-checker` globs, add directly after `'packages/shared/src/rbac/**/*.ts',`:

```ts
      'packages/shared/src/contracts/auth/**/*.ts',
      'packages/shared/src/contracts/users/**/*.ts',
```

In `docs/sad-pathways.md` line 36, after `` `packages/shared/src/rbac/**/*.ts` `` insert `` , `packages/shared/src/contracts/auth/**/*.ts`, `packages/shared/src/contracts/users/**/*.ts` `` (inside the same cell).

```bash
pnpm sad:test && pnpm sad:typecheck
```

Expected: PASS; sad = `B_sad + 1`.

- [ ] **Step 2: Amend the Change Record**

`docs/cr-pathways-codebase-modularization.md`:

Section 3.6, replace the bullet `- Response schemas are types only, never parsed at runtime.` with:

```markdown
- Response schemas are types only, never parsed at runtime, except the public project snapshot (parsed by the API and the web as the anonymous allowlist) and the own profile response (parsed by the web), which were parsed before this change (amended for S8a).
- Where a class-validator rule has no port in `contracts/common/field-schemas.ts` (only `IsEmail`), the API refines the shared contract with the class-validator function in `<domain>.helpers.ts` (`auth.helpers.ts` for sign-in). A `null` `projectIds` on `POST users/authorize-existing` is now rejected with 400; the DTO let it through to a 403 after an identity directory lookup (amended for S8a).
```

Section 3.7, in the S8 row replace `| S8 | Public, users, profile, auth and MFA |` with `| S8a, S8b | Public, users, profile, auth and MFA (S8a contracts, clients and dead code; S8b components and feature layout) |`.

Section 9, append (with `<date>` from `date +%F`):

```markdown
S8a applied <date> on refactor/s8a-public-users-auth:
- Contracts: the users (`contracts/users/user-authorization.ts`), own profile (`contracts/profile/own-profile.ts`), sign-in and step-up PIN (`contracts/auth/auth-requests.ts`) and public project and publication (`contracts/public/public-projects.ts`) contracts, built on the S1 field schemas; the API refines sign-in with `isEmail` (`auth.helpers.ts`).
- Validation: the users, own profile, sign-in and three PIN routes use `ZodPipe`; parity tests ran each DTO and its contract through the configured pipes over 83 JSON bodies before the five DTO classes were deleted, and 82 agreed exactly; an HTTP test covers each switched controller. No class-validator DTO remains in the API, so `controller-dto-runtime-metadata.test.ts` and `field-schemas-parity.test.ts` were deleted; the `class-validator` dependency stays because the global `ValidationPipe` loads it and `auth.helpers.ts` uses `isEmail`.
- Public: `public.dto.ts` moved to shared; `public-projects.controller.ts` and `publication.controller.ts` hold one controller each; publication bodies are still parsed in `PublicService`.
- Web: `usersClient` (`lib/api/users.ts`), `ownProfileClient` (`lib/api/profile.ts`) and `readPublicSnapshots` (`lib/api/public.ts`); 8 user calls and 5 test mocks repointed; the web `ApiUser`, public snapshot and own profile schemas replaced by the shared contracts.
- Dead code: `public-project-detail.tsx`, `public-project-charts.tsx`, `public-dashboard-config.ts`, their tests, `profile-validation.ts` and its test (1569 lines), `mapPublicSnapshot` and seven `Public*` view models deleted; `docs/deferred-features.md` records the removed microsite detail.
- Kernel and deferred items closed: `requestIdentity` replaces the local application profile checks in the users and authorized data controllers (the last two), `aggregateOnlyRoles` replaces the two route policy literals, the access matrix role test and the two aggregate-only entries of `assessmentDetailDeniedRoles`, `routeUuidPattern` replaces the mutation ticket regex, `Tx` replaces four transaction client annotations, and `readWorkspaceContextCookie` is the one browser read of the workspace context cookie (`request.ts` and `request-owner.ts` call it).
- SAD: organization isolation routing covers `packages/shared/src/contracts/auth/**/*.ts` and `packages/shared/src/contracts/users/**/*.ts`.
- Middleware: <Task 6 sizes sentence>.
- Decisions: S8 split into S8a and S8b (ruling 1); the microsite detail was deleted, not split, because nothing imported it (ruling 2); exact acceptance came from the S1 field schemas plus the class-validator `isEmail` function, because zod differs on emails and S1 ports no email rule (ruling 3); the DTO-only metadata and field schema parity tests went with the last DTO while `class-validator` stays (ruling 14); a null `projectIds` is the one accepted difference (ruling 4); `authUserId must be a UUID` is the one reachable message kept (ruling 5); the avatar stack keeps its derived "And" label as a display decision for the developer (ruling 10); the step-up and route-access project lookups stay inline because `requireScopedProject` would change their 503 and 404 answers (ruling 11); the three workspace cookie reads became one with the `split(';')` and `trim` form, which reads browser and jsdom cookie strings exactly as the `'; '` split did (ruling 16); the assessment detail denial reads `aggregateOnlyRoles` plus the system administrator, the same three roles (ruling 10).

Deferred to S8b: the publication and audit clients, the user management and MFA component splits, and the feature layout for auth, profile, public and settings.
```

Replace `<Task 6 sizes sentence>` with `web Middleware went from <M0> kB to <M1> kB` using the Task 0 and Task 6 measurements.

- [ ] **Step 3: Update the audit, living docs and index**

- Audit: append to the disposition cell of MOD-05 `; users, own profile and public snapshot clients moved to lib/api by S8a.`, of MOD-06 `; public-project-detail.tsx deleted as dead code by S8a.`, of MOD-11 `; auth, users, profile and public DTOs closed by S8a.`, of MOD-16 `; the three workspace cookie reads made one by S8a.` and of MOD-17 `; public controllers split one per file by S8a.`
- `docs/qad-pathways.md` QAD-A05 row: replace `` `apps/api/src/modules/users/users.validation.test.ts` `` with `` `apps/api/src/modules/users/users.controller.validation.test.ts` ``.
- `docs/index.md`: in the CR row status keep the applied list and end it with `S8a applied, S8b next`.

```bash
git grep -nE "users\.validation\.test|lib/services/(own-profile-client|public-projects)|public\.dto|users\.dto|profile\.dto|signin-lockout\.dto|beneficiary-step-up-pin\.dto|modules/public/public\.controller" -- docs scripts AGENTS.md README.md ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/cr-*' ':!docs/superpowers/*'
```

Expected: prints nothing (no living doc names an old path).

- [ ] **Step 4: Activity log**

Add to `docs/activity-log.md`:

```markdown
## <date> Modularization S8a public, users, profile and auth (refactor/s8a-public-users-auth)
```

with one bullet per Task 1 to Task 8 stating what was added, switched, moved or deleted, with its commit hashes (name the Task 7 deletion commit explicitly, the deferred features register points to it) and the shared, api and web test counts at the end of that task; a bullet with the Middleware sizes; a bullet saying the S8a decisions are recorded in the change record section 9 (the plan stays until S8b is planned, because it holds the S8b outline); and a bullet listing the S8b deferrals. Task 10 Step 5 appends the gate results.

- [ ] **Step 5: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint
git add docs scripts/sad
git commit -m "docs: record modularization S8a and route auth and users contracts to the isolation checker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline.

---

### Task 10: Full release gates and merge

- [ ] **Step 1: Static gates and dist layout**

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm sad:test
git checkout -- apps/web/next-env.d.ts
test -f packages/shared/dist/contracts/users/user-authorization.js && test -f packages/shared/dist/contracts/auth/auth-requests.js && test -f apps/api/dist/apps/api/src/modules/public/publication.controller.js && test -f apps/api/dist/apps/api/src/modules/public/public-projects.controller.js && test -f apps/api/dist/apps/api/src/modules/auth/auth.helpers.js && test ! -e apps/api/dist/apps/api/src/modules/users/users.dto.js && test ! -e apps/api/dist/apps/api/src/modules/auth/signin-lockout.dto.js && test ! -e apps/api/dist/apps/api/src/modules/public/public.controller.js && echo "dist layout ok"
pnpm --filter @pathways/web build > .tmp/s8a/web-build-gates.log 2>&1; echo "exit $?"
grep -E "Middleware" .tmp/s8a/web-build-gates.log
git checkout -- apps/web/next-env.d.ts
```

Expected: all pass, `dist layout ok`, web build exit 0 with Middleware at most `M0`. Versus Task 0: shared = `B_shared + 31` (contracts 30, route policy 1), api = `B_api + 7 - P_fs` (users -7, profile +4, auth +6 - `P_fs`, request identity +4), web = `B_web + 9` (mutation ids 3, cookie reads 6, dead tests -6, users client 5, public area 1), sad = `B_sad + 1`, config and imports unchanged.

- [ ] **Step 2: Local DB replay**

```powershell
./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline
```

Expected: exit 0.

- [ ] **Step 3: Local stack, compiled API probes, e2e and smoke**

Stop anything on ports 3000 and 4000 first.

```bash
pnpm db:local:start && pnpm db:local:reset && pnpm db:local:demo
pnpm dev:local
```

`pnpm dev:local` builds the API and runs `dist`, where decorator metadata is real. In a second terminal:

```bash
curl -s http://127.0.0.1:4000/api/health
curl -s -w "\n%{http_code}\n" -X POST http://127.0.0.1:4000/api/auth/sign-in -H 'content-type: application/json' -d "{\"email\":\"$(printf 'a%.0s' $(seq 65))@example.org\",\"password\":\"pppp-secret\"}"
curl -s -w "\n%{http_code}\n" -X POST http://127.0.0.1:4000/api/auth/sign-in -H 'content-type: application/json' -d '{"email":"synthetic@example.org","password":"pppp-secret","remember":true}'
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4000/api/public/projects
npx playwright test --config playwright.config.ts
npx playwright test --config playwright.auth-navigation.config.ts
```

Expected: `"status":"ok"`; the first sign-in probe answers `{"statusCode":400,"message":["email must be an email"],"error":"Bad Request"}` (key order may differ) and `400`, the second answers 400 with `Unrecognized key(s) in object: 'remember'`, neither body contains `pppp` (Review Focus 1 and 3); the public list answers `200`; a module-resolution or Nest dependency error in the `pnpm dev:local` output fails the gate; auth-navigation passes in full; the main suite shows the same pass and fail set as the S7 gate run recorded in `docs/activity-log.md`. Browser smoke, each step as a demo user whose role allows it: sign in with password and TOTP (sign-in route) and land on `/workspace`; as System Administrator open `/settings/users`, create a Program Manager (no project needed) with the Auth user ID `71000000-0000-0000-8000-000000000001` and confirm the editor shows `authUserId must be a UUID` (Review Focus 2), then edit a user's role and project access and deactivate and reactivate a test account (users routes, `usersClient`); open a project's team editor and the project setup form and confirm the user lists load (`usersClient.getUsers`); open My Profile, change the contact number and save, and save again with the same values (own profile route, `ownProfileClient`); open `/public/projects`, a public project page and an organization page signed out (`readPublicSnapshots`); open the transparency queue and a staff preview and submit a summary for review (publication controller, shared publication schema); reload a project page with the browser network panel open and confirm its API requests carry `X-Pathways-Organization-Id`, then sign out and back in and confirm the workspace loads (the single cookie read). Every step must behave as on dev. The step-up PIN UI is hidden (`STEP_UP_PIN_UI_ENABLED = false`), so its routes rest on the Task 3 HTTP test and parity table.

- [ ] **Step 4: SAD review**

```bash
pnpm sad:check --base dev --head HEAD --output .tmp/sad/s8a/manifest.json
```

Dispatch every role the manifest requires (expect `design-qa-agent`, `restraint-guardian`, `organization-isolation-checker` and `beneficiary-privacy-guardian`) with the section 4.2 handoff packet from `docs/sad-pathways.md`, save their section 4.4 envelopes to `.tmp/sad/s8a/reviews.json`, then:

```bash
pnpm sad:signoff -- --base dev --head HEAD --reviews .tmp/sad/s8a/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun.

- [ ] **Step 5: Record the gate results**

Append a final bullet to the Task 9 activity-log section with the gate results (per-package counts, Middleware size, replay exit code, compiled API probe results, e2e pass counts, smoke result, SAD sign-off), then:

```bash
git add docs/activity-log.md
git commit -m "docs: record modularization S8a release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Merge into local dev**

```bash
git checkout dev
git merge --no-ff refactor/s8a-public-users-auth -m "Merge refactor/s8a-public-users-auth into dev

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Keep the plan for S8b**

The plan holds the S8b outline, so it stays on dev (as the F4 plan did for F4b). In `docs/index.md` section 1.6 change the S8 plan row status to `S8a executed; holds the S8b outline`, then:

```bash
pnpm docs:check 2>&1 | tail -3
git add docs/index.md
git commit -m "docs: mark S8a executed in the plan index

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline. Do not push `origin dev` until the developer says so.

---

## S8b outline (web components and feature layout, branch `refactor/s8b-public-users-auth-web`)

To be written as its own plan from dev after S8a merges; that plan's Task 0 removes this file and its index row. Counts were taken at `a101ad7c` and must be recounted in S8b Task 0.

- **Task 0, baseline:** recount; confirm the S6 assumption (the `core-feature-client.ts` exports left after S6); record web Middleware.
- **Task 1, publication and audit clients:** `coreFeatureClient.publication` and `transitionPublication` move to `lib/api/publication.ts` as `publicationClient`, keeping their `captureRequestOwner` (F4b) ownership check and their own response handling (F4b ruling 10); the publication snapshot schema becomes `publicProjectResponse.omit({ publishedAt: true })` (identical fields and bounds today) and the transition body type `PublicationTransitionRequest`; `coreDataClient.audit` moves to `lib/api/audit.ts` as `auditClient`; `lib/services/core-feature-client.ts` is deleted once empty. Callers: `public-tracker-preview.tsx`, `publication-queue-workspace.tsx`, `audit-log-workspace.tsx`; mocks: their three tests (counted before and after) and `core-feature-client.test.ts` cases for the moved members.
- **Task 2, user management split:** `user-management-workspace.tsx` (937 lines, 11 `useState`) splits verbatim into `features/settings/components/{account-metric,user-account-row,user-editor-dialog,user-detail-dialog}.tsx` and a `hooks/use-user-directory.ts` for the load, refresh and pending-create state; `formatAccountDate` and `emptyEditor` go to `user-management-utils.ts`; `AUTH_USER_ID_PATTERN` stays (a client hint, the API decides). The existing workspace test runs unchanged.
- **Task 3, MFA form split:** `mfa-form.tsx` (717 lines, 12 `useState`, one exported component) splits by step (enrollment, challenge, recovery) into `features/auth/components/` with the flow state in `hooks/use-mfa-flow-state.ts`; `mfa-form.test.tsx` (280 lines) runs unchanged; `lib/auth/mfa-flow.ts` keeps the transport.
- **Task 4, feature surfaces:** `components/`, `hooks/` and `index.ts` for `features/auth`, `features/profile`, `features/public` and `features/settings`; app routes and other features import only from `index.ts` (today `projects/project-review-workspace.tsx` imports `features/public/publication-queue-workspace` and two profile files import `features/auth/account-access-validation`); `strongPasswordSchema` is exported from the auth surface; `own-profile-contract.ts` is renamed `own-profile.schema.ts` (CR 3.5 suffix).
- **Task 5, records:** CR section 9 S8b disposition and the end of the slice roadmap, audit MOD-06 (`user-management-workspace.tsx`, `mfa-form.tsx`), MOD-15 (S8 feature surfaces), index, activity log.
- **Task 6, gates and merge:** as S8a Task 10, with a smoke over MFA enrollment and challenge, recovery, user management, the audit log, the public site and the transparency queue. After merge, remove this plan and its index row.
