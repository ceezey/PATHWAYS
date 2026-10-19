# S8 Public, Users, Profile, Auth and MFA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the last class-validator DTOs of the auth, users and profile modules with shared zod contracts that accept exactly the same bodies, move the public contracts into `packages/shared`, give the users, own profile and public snapshot web clients their `lib/api` modules, close the duplicates earlier sub-projects left to S8 (aggregate-only role lists, the mutation ticket UUID regex, the three workspace cookie reads), and delete the production-dead public microsite detail, with no change to any route, status code, response body, permission decision, rendered text or SQL.

**Architecture:** S8 is split (ruling 1). This plan gives S8a in full (eleven tasks including baseline, records and gates) and S8b as an outline at the end. S8a writes each request contract test first, runs the old DTO and the new contract through the configured pipes over the same JSON bodies (explicit metatype, because Vitest emits no decorator metadata), commits that evidence, then switches the route to `ZodPipe` and deletes the DTO in a second commit with an HTTP test of the switched route. Exact acceptance comes from the S1 field schemas (`uuidString`, `lengthString`, `trimmedInput`, `strictIsoDateString` in `packages/shared/src/contracts/common/field-schemas.ts`), plus the class-validator `isEmail` function on the API side, because zod's email rule differs and S1 ports no email rule (ruling 3). S8a also adopts the S1 `requestIdentity` kernel helper in its two controllers that repeat the application profile check, and, as the slice that deletes the last class-validator DTO, removes the S1 field schema parity test and the controller metadata test. Mechanical rewrites use one-off Node scripts under `.tmp/s8a/` (gitignored, never committed) whose content is given in full; each was replayed from the S7d tip (the stacked tree with S3b to S7d applied), and the expected outputs below come from that replay. Every rule that a deleted DTO or a moved test used to hold is pinned by a test before the code that held it goes (boundary tables for the contracts, route tables for the controllers, a mutation run for each), so nothing rests on an old-versus-new comparison alone.

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, NestJS 10.4.22, class-validator 0.14.4 (validator 13.15.26), class-transformer 0.5.1, zod 3.25.76, Prisma 6.19, Next 15.5.14, React 19, Vitest 3, Biome 1.9.4, Playwright.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.1 to 3.7 row S8, 4, 6, 7, 9 including the F1 to F4a dispositions and the F4b and S1 to S7 dispositions present when S8a starts) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05, MOD-06, MOD-11, MOD-16, MOD-17 for this slice's modules, and the S8 deferrals recorded in CR section 9: `mapPublicSnapshot`, the avatar stack "And" label, the duplicated `['PROGRAM_MANAGER','GRANT_MANAGER']` literal and the `source-mutation.ts` UUID regex), plus the deferrals the F4b and S6 plans name for S8: the three workspace cookie reads (F4b ruling 11) and the aggregate-only roles inside `assessmentDetailDeniedRoles` (S6 "Out of S6a").

## Rulings

Controller rulings for S8 (2026-10-10). Each was checked against `refactor/f4a-web-boundaries` `a101ad7c` (F4a complete), then against the S7d tip, and assumes the F4b and S1 to S7 outputs named in "Interfaces assumed from earlier slices". Task 0 recounts every number on the branch.

1. **Split into S8a and S8b.** The S8 row covers four API modules, their contracts, four web clients and four feature folders; with baseline, records and gates that is about seventeen tasks. S8a (this plan, on the slice branch the environment assigns) takes the contracts, the API switches, the deferred duplicates, the web clients and the dead code. S8b (outline below, its own slice branch) takes the publication and audit clients (which wait on the S6 shape of `core-feature-client.ts`), the component splits and the feature layout. SAD evidence goes to `.tmp/sad/s8a` and `.tmp/sad/s8b`.
2. **The public microsite detail is deleted, not split.** MOD-06 lists `public-project-detail.tsx` (1172 lines), but nothing imports it except its own test; its closure `public-project-charts.tsx` and `public-dashboard-config.ts` are imported only by it, `mapPublicSnapshot` only by its test, and the seven `Public*` view models in `types/pathways.ts` only by those files. `features/profile/profile-validation.ts` is imported only by its test (the live form schemas are in `own-profile-contract.ts`). Seven files (1569 lines) and 77 lines of types go, with the two `docs/deferred-features.md` rows that name the detail file updated and a row added for the removed feature.
3. **Exact acceptance parity, on the S1 field schemas.** A probe of the configured pipes found zod `.uuid()` looser than `IsUUID()`, zod string lengths counted in UTF-16 units where class-validator counts an astral character or a variation sequence once, zod `.email()` differing from `IsEmail()` on 9 of 32 addresses in both directions, and zod `.datetime()` differing from `IsISO8601({ strict: true })`. S1 already ports the first, second and fourth (`uuidString`, `lengthString`, `trimmedInput`, `strictIsoDateString`, checked against class-validator by S1's `field-schemas-parity.test.ts`), so S8a adds no rule of its own to shared: `@Length`, `@MinLength` and `@MaxLength` become `lengthString(min, max)` (`MaxLength(n)` is `lengthString(0, n)`), `@IsUUID()` becomes `uuidString`, the trim `@Transform` becomes `trimmedInput(...)`, and `@IsISO8601({ strict: true })` becomes `strictIsoDateString`. Only the email rule stays on the API side: `auth.helpers.ts` refines the shared sign-in contract with the class-validator `isEmail` function (porting validator's email check into shared would copy about 150 lines for one route). `class-validator` stays an API dependency (the global `ValidationPipe` loads it at runtime); the shared package stays zod-only. A probe with the S1 definitions copied verbatim ran 83 JSON bodies through both pipes and 82 agreed exactly (accept or reject, and the accepted value); the 83rd is ruling 4. An earlier draft of this plan defined `boundedText` and `requestUuid` in a `request-rules.ts`; they duplicated S1 and are dropped.
4. **One accepted difference: a null `projectIds` on `POST users/authorize-existing`.** `@IsOptional()` let `null` through; `UsersService.requireProjects` then threw a TypeError inside the transaction, which `withAuthorizedOperation` answered 403 `Application scope could not be verified.` after an identity directory lookup. The contract answers 400 before any lookup. The web always sends an array. The parity test pins it as the only exception and CR 3.6 records it beside the prototype keys.
5. **Message wording: two reachable overrides.** The user editor shows the API message, and its own UUID check (`AUTH_USER_ID_PATTERN`) is looser than `IsUUID()`, so an admin can reach `authUserId must be a UUID`; the S1 `uuidString` carries the message `must be a UUID`, so `ZodPipe` answers that exact text. The editor also lets an admin tick every project of an organization, so a list over 100 reaches the cap, and the DTO answered `projectIds must contain no more than 100 elements`; the contract carries that text on `.max(100, ...)`, so `ZodPipe` answers the same message (the contract, parity and HTTP tests pin it). No other S8 text is reachable or shown: the editor caps names at 100 characters, own profile and sign-in map any 400 to fixed text, and the PIN client maps 400 to `STEP_UP_PIN_RULE_MESSAGE`. Everything else becomes zod wording (CR 3.6).
6. **Publication bodies stay validated in `PublicService`.** The four publication routes take `@Body() body: unknown` and the service parses with a fixed `Invalid publication request.` and an operation-dependent summary rule; only the schemas move (`public.dto.ts` to `packages/shared/src/contracts/public/public-projects.ts`, renamed per CR 3.6). The file held two controllers; they become `public-projects.controller.ts` and `publication.controller.ts` (CR 3.2, MOD-17).
7. **Two response schemas keep their runtime parse.** CR 3.6 says response schemas are types only, but the public snapshot is parsed today by the API (allowlist over a SQL function's JSON) and by the web (anonymous reads), and the own profile response by the web; removing those parses would change behavior. They move to shared and stay parsed; CR 3.6 records the exception. The web public read adopts the API bounds (`area` at most 500, `sector` at most 300 characters); the API parses its own output with those bounds, so no body the web receives changes outcome. `authorizedUserResponse` replaces the web's hand-written `ApiUser` as a type only.
8. **Auth response parsing and the sign-in request stay where they are.** `lib/auth` parses `/auth/me`, `/auth/workspaces` and the step-up status on the Edge path with bounded checks (CR 3.3 names `lib/auth` their home); `features/auth/signin-request.ts` has one importer. Neither moves.
9. **No S8 API service split.** `users.service.ts` (415 lines) is under the 500-line flag and has one responsibility; the other S8 services are under 300 lines. MOD-04 names S1 to S7 only.
10. **Deferred items.** `aggregateOnlyRoles` replaces the two `['PROGRAM_MANAGER', 'GRANT_MANAGER']` literals in `packages/shared/src/rbac/route-policy.ts` (the file already imports `authorization-policy`), the `code === 'PROGRAM_MANAGER' || code === 'GRANT_MANAGER'` test that sets `aggregate` in `apps/web/src/lib/rbac/access-matrix.ts` (the settings role matrix, same two roles, same name), and the two aggregate-only entries of `assessmentDetailDeniedRoles`, which S6 moved verbatim to `evaluation-assessments.service.ts` and handed to S8: the set becomes `new Set(['SYSTEM_ADMINISTRATOR', ...aggregateOnlyRoles])`, the same three roles, so individual assessment detail stays denied wherever beneficiary records are aggregate-only (activities, participants, beneficiary media and authorized data already read `aggregateOnlyRoles` for that rule). The single-role tests (`roles[0] === 'PROGRAM_MANAGER'` in collection, import and sensitive drafts; `['SYSTEM_ADMINISTRATOR', 'PROGRAM_MANAGER']` in the route policy) mean portfolio scope, not aggregate-only access, and stay. `routeUuidPattern` replaces the identical `uuid` regex in `apps/web/src/lib/services/source-mutation.ts`; `Tx` replaces the four `Prisma.TransactionClient` annotations in S8 production code (F3a left them to the slices). The avatar stack keeps its derived "Monitoring And Evaluation Officer" label: switching to `roleNames` changes the `aria-label` and `title` text, which CR section 4 rules out, so it is recorded as a display decision for the developer.
11. **The step-up and route-access project lookups stay inline.** F3a left them to the slices. `BeneficiaryStepUpService` turns its lookup into a boolean inside a `try` whose `catch` answers 503 `Project scope could not be verified.`, and `RouteAccessService` answers 404 `Route unavailable.` at its `PROJECT_READ` stage; `requireScopedProject` throws 404 `Project unavailable.`, which would become a 503 in the first and change the message in the second. Both keep `projectScope`, the shared scope rule.
12. **SAD routing:** `packages/shared/src/contracts/auth/**/*.ts` and `packages/shared/src/contracts/users/**/*.ts` route to organization-isolation-checker (they define the sign-in, PIN and authorization inputs), beside the existing beneficiary-privacy-guardian route for all contracts.
13. **`requestIdentity` in the two S8 controllers that repeat the check.** S1 ruling 9 left 20 controllers to their slices; S8's are `users.controller.ts` (local `profile()`) and `auth/authorized-data.controller.ts` (local `verifiedProfile()`), both throwing `ForbiddenException('Application profile is required.')` exactly as `requestIdentity` does. `profile.controller.ts` and `auth.controller.ts` (`Verified profile required.`) and the publication controller (`Application profile required.`) use other wording and keep it, since `requestIdentity` would change the 403 text (S1 ruling 9); `route-access.controller.ts` has no such check. A characterization test per controller is written first.
14. **S8a deletes the last class-validator DTO, so it removes the two tests that existed only for DTOs.** Every other DTO belongs to S1 to S7 (Task 0 confirms that only the five S8 DTO files remain, plus its zod helper `dashboards.dto.ts` when S7b is absent). After Task 3, `controller-dto-runtime-metadata.test.ts` has no case left and `field-schemas-parity.test.ts` guards a parity nothing depends on any more; S1 hands both to "the slice that deletes the last DTO (S8)". Both are deleted in Task 3, guarded by a check that no `class-validator` decorator DTO remains. The `class-validator` dependency stays, against S1's note, because Nest's `ValidationPipe` loads it at runtime and `auth.helpers.ts` uses `isEmail`; CR section 9 records this.
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
- After removing code, delete any import name left with no use. Biome 1.9 recommended rules do not flag unused imports, so run `(cd apps/web && npx tsc --noEmit --noUnusedLocals -p . 2>&1 | grep "error TS" | cut -c1-110)` and the same in `apps/api` after each task that removes code: they must list only the lines that exist at the baseline (Task 0 Step 3: two in the web app, `forms/hooks/use-collection-state.ts` `indicators` and `types/pathways.ts` `SadddDashboard`, and two in the api, `prisma/hosted-realistic-seed.ts` `storage` and `participants.service.ts` `prisma`).
- Do not type `\u` escapes for characters into source; build them with `String.fromCharCode` or `String.fromCodePoint` (S1 ruling 2).
- Web build: `.tmp/s8a/build-routes.sh <name>` (Task 0 Step 2; it removes `apps/web/.next`, runs the web build, saves the route table as `.tmp/s8a/routes-<name>.txt` and the log as `.tmp/s8a/web-build-<name>.log`). A build takes two to five minutes, so give the command a ten minute timeout. Never run `pnpm build` at the repository root (it builds the api through `prisma generate`) and never run `prisma generate`; the api build is `exec nest build` and the web build goes through `build-routes.sh`. No task touches a hosted database, a seed or a migration.
- One-off scripts live in `.tmp/s8a/` (gitignored) and are never committed; `.tmp/` also holds logs.
- No new dependencies. No customer personal data or credentials; test identities are synthetic (`example.org`, `example.invalid`, fixed UUIDs).
- Every commit runs as `git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "..."`, stages files by explicit path (or `git add -A <folder>` where the task says so) and ends its message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and, on the next line, `Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx`.
- Work in the repository root on the slice branch the environment assigns (`claude/modularization-s8a-9ept8o`, stacked on `claude/modularization-s7d-9ept8o`); no new worktree and no new branch. All paths are relative to the repository root. Only the controller pushes the slice branch, at task-pair boundaries; nobody pushes `dev` or `master`.
- This slice opens no pull request, merges nothing into `dev` or `master` and removes no plan copy: S8a ships in part 3 of 3 stacked pull requests into `dev`, which the controller opens after the last slice, and its CI replay is the replay gate. Task 10 records the local gates and stops. Seeds, dev servers, e2e and the browser smoke are recorded as a pending local run.
- Each bash block runs alone in a fresh shell, so a variable set in one block does not exist in the next; a block that needs `EVAL` sets it first.
- Known flakes: the ZodPipe 5 s timeout, web `beneficiary-detail-loader.test.tsx`, web `collection-workspace` timeouts under load, api `imports.service.test.ts` (duplicate metadata keys) and one `pnpm sad:test` case under load. Rerun such a file alone before treating it as real.
- Do not run `pnpm install` and do not run `git checkout dev`; the dependencies are installed in the cloud container.
- In `Expected:` blocks `<ms>` stands for a duration, `<sha>`, `<branch>`, `<date>` and `<n>` for values that differ per run; every other figure is the replay and must match. Prefixes such as `apps/api test:` appear only in recursive `pnpm` runs.
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
// The workspace context cookie value, found by splitting document.cookie on '; '.
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

- Publication and audit clients out of `core-feature-client.ts`, the `user-management-workspace.tsx` (938 lines) and `mfa-form.tsx` (717) splits, feature `components/`, `hooks/` and `index.ts` surfaces for auth, profile, public and settings: S8b, outlined at the end.
- The global `ValidationPipe` and the `class-validator` dependency stay: the pipe still converts primitive `@Param` and `@Query` types and loads `class-validator` at runtime, and `auth.helpers.ts` uses `isEmail` (ruling 14).
- `lib/services/*` files that no slice owns: W1.

---

### Task 0: Branch setup and baseline

**Files:**
- Create: `docs/superpowers/plans/<date>-modularization-s8-public-users-auth.md` (this plan, `<date>` from `date +%F`)
- Modify: `docs/index.md` (section 1.6 plan row)
- Create (gitignored): `.tmp/s8a/base-sha`, `m0`, `build-routes.sh`, `compare-routes.mjs`, `mutate.mjs`, `same-lines.mjs`, `users-calls.mjs`, `repoint.mjs`, `clients-map.json`, `drop-public-view-models.mjs` and the mutation lists `mut-*.json`

- [ ] **Step 1: Confirm the stacked branch holds S7d and the slices below it, and record the base**

The markers are files and text that S7d itself creates or that only a slice below it creates (a slice that runs later never creates them), so a missing one means that slice is not applied. `.tmp/s8a/base-sha` holds the S8a base (the SAD base of Task 10 Step 4):

```bash
cd "$(git rev-parse --show-toplevel)"
git status --short
git branch --show-current
mkdir -p .tmp/s8a/files .tmp/s8a/out
git rev-parse HEAD > .tmp/s8a/base-sha
for b in s7d s7c s7b s7a s6c s5c s6b s5b; do
  ref=claude/modularization-$b-9ept8o
  git rev-parse -q --verify "$ref" > /dev/null || ref=origin/$ref
  if git rev-parse -q --verify "$ref" > /dev/null; then
    git merge-base --is-ancestor "$ref" HEAD && echo "$b branch is an ancestor of HEAD" || echo "$b BRANCH IS NOT AN ANCESTOR OF HEAD"
  else
    echo "$b BRANCH REF NOT FOUND"
  fi
done
CR=docs/cr-pathways-codebase-modularization.md
echo "S7d record: $(grep -c '^S7d applied' $CR)"
echo "S7c record: $(grep -c '^S7c applied' $CR)"
F=apps/web/src
test -f $F/features/dashboard/index.ts && test -f $F/features/dashboard/dashboard.reads.ts && test -f $F/features/analytics/hooks/use-analytics-scope.ts && echo "S7d present"
test -f $F/lib/api/dashboards.ts && test -f $F/lib/api/analytics.ts && test -f $F/features/analytics/index.ts && echo "S7c present"
test -f $F/lib/api/rules.ts && test -f $F/features/rules/index.ts && test -f $F/lib/api/core/owned-json-read.ts && echo "S7a and S6b present"
test -f $F/lib/api/indicators.ts && test -f $F/lib/api/core/request.ts && test -f $F/lib/api/core/request-owner.ts && test -f $F/hooks/use-authorized-read.ts && test -f $F/lib/format/date.ts && test -f apps/api/src/common/authz/request-identity.ts && echo "F4b and S1 kernel present"
test -f apps/api/src/modules/beneficiaries/beneficiary-registration.service.ts && test -f apps/api/src/modules/metadata/form-definitions.service.ts && test -d apps/api/src/modules/print-pdf && echo "S4a, S5a and S6a present"
test ! -e packages/shared/src/contracts/users/user-authorization.ts && test ! -e $F/lib/api/users.ts && test ! -e apps/api/src/modules/public/publication.controller.ts && echo "S8a not started"
test -f docs/handoff/modularization-s8-public-users-auth.md && echo "handoff copy present"
ls docs/superpowers/plans/
```


Expected:

```text
claude/modularization-s8a-9ept8o
s7d branch is an ancestor of HEAD
s7c branch is an ancestor of HEAD
s7b branch is an ancestor of HEAD
s7a branch is an ancestor of HEAD
s6c branch is an ancestor of HEAD
s5c branch is an ancestor of HEAD
s6b branch is an ancestor of HEAD
s5b branch is an ancestor of HEAD
S7d record: 1
S7c record: 1
S7d present
S7c present
S7a and S6b present
F4b and S1 kernel present
S4a, S5a and S6a present
S8a not started
handoff copy present
2026-10-13-modularization-s3b-indicators-web.md
2026-10-13-modularization-s4-beneficiaries.md
2026-10-13-modularization-s4b-beneficiaries-web.md
2026-10-13-modularization-s4c-beneficiaries-components.md
2026-10-13-modularization-s5-collection.md
2026-10-13-modularization-s5b-collection-web.md
2026-10-13-modularization-s5c-collection-components.md
2026-10-13-modularization-s6-finance-reports.md
2026-10-13-modularization-s6b-finance-reports-web.md
2026-10-14-modularization-s6c-finance-reports-components.md
2026-10-14-modularization-s7-analytics-rules.md
2026-10-14-modularization-s7b-analytics-dashboards.md
2026-10-14-modularization-s7c-analytics-dashboards-web.md
2026-10-14-modularization-s7d-dashboards-web.md
```


The branch is `claude/modularization-s8a-9ept8o` (the environment assigns it) and `git status --short` prints nothing. Then one ancestor line for each stacked branch, the two record counts, the marker lines (the last two say that S8a has not started and that the controller staged this plan) and the plan listing. A different branch, a line that says `IS NOT AN ANCESTOR` or `REF NOT FOUND`, a record count of `0`, a missing marker line, a missing `S8a not started` or a missing `handoff copy present` means the branch lacks a stacked slice or the controller's staging commit: stop and report NEEDS_CONTEXT. The branch refs are looked up locally first and then as `origin/`, because a checkout that fetched only the remote has the remote refs alone. The stack below S8a is applied in the order S5b, S6b, S5c, S6c, S7a, S7b, S7c, S7d, so S4b, S5b, S6b and S7b (the web slices and the S7b api controllers) are present. Dependencies are already installed in the cloud container; do not run pnpm install (the rulings log records the S3b install workaround). Write down the listed modularization plans; an executed plan that is still listed is reported, not removed here (the S4, S5 and S6 plans hold the S4b, S5b and S6b outlines).

- [ ] **Step 2: Create the helper scripts**

Create each file with the Write tool exactly as printed. They live in `.tmp/s8a/`, which is gitignored, and are never committed. `build-routes.sh` builds the web app from a clean `.next` and saves the route table:

Create `.tmp/s8a/build-routes.sh`:

```bash
#!/bin/bash
# Usage: build-routes.sh <name>; builds the web app from a clean .next and saves the route table as .tmp/s8a/routes-<name>.txt.
rm -rf apps/web/.next
pnpm --filter @pathways/web build > .tmp/s8a/web-build-$1.log 2>&1
echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' .tmp/s8a/web-build-$1.log | sed 's/^apps\/web build: //' | sed -n '/Route (app)/,$p' > .tmp/s8a/routes-$1.txt
grep Middleware .tmp/s8a/routes-$1.txt
```

`compare-routes.mjs` compares two route tables (route, size and First Load JS):

Create `.tmp/s8a/compare-routes.mjs`:

```js
// Prints the routes whose First Load JS differs between two saved next build route tables.
import { readFileSync } from 'node:fs'

const [before, after] = process.argv.slice(2)
const row = /^[┌├└] [ƒ○] (\S+)\s+\S+ \S+\s+([\d.]+) kB$/
const table = (file) =>
  new Map(
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line) => {
        const match = row.exec(line.trim())
        return match ? [[match[1], Number(match[2])]] : []
      }),
  )
const was = table(before)
const now = table(after)
let different = 0
for (const [route, kb] of now) {
  const old = was.get(route)
  if (old === undefined) console.log(`${route}: new at ${kb} kB`)
  else if (old !== kb) {
    different++
    console.log(`${route}: ${old} kB -> ${kb} kB (${kb > old ? '+' : ''}${(kb - old).toFixed(1)})`)
  }
}
for (const route of was.keys()) if (!now.has(route)) console.log(`${route}: removed`)
console.log(`routes ${now.size}, different ${different}`)
```

`mutate.mjs` applies each mutation of a JSON list `[label, file, from, to]` (or with a fifth item, the expected match count) one at a time, runs the test command given after the list, prints `killed` or `SURVIVED` per mutation and restores the file; a mutation whose text does not occur the stated number of times prints `NOT APPLIED` and counts as a survivor:

Create `.tmp/s8a/mutate.mjs`:

```js
// Applies each mutation of a JSON list in turn, runs one test command and reports killed or SURVIVED; files are restored after every run.
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const [listFile, ...command] = process.argv.slice(2)
const mutations = JSON.parse(readFileSync(listFile, 'utf8'))
const saved = new Map()
const restore = () => {
  for (const [file, text] of saved) writeFileSync(file, text)
}
process.on('SIGINT', () => {
  restore()
  process.exit(130)
})
let survived = 0
try {
  execSync(command.join(' '), { stdio: 'ignore', timeout: 600000 })
  console.log('unmutated: pass')
  for (const [label, file, from, to, count = 1] of mutations) {
    if (!saved.has(file)) saved.set(file, readFileSync(file, 'utf8'))
    const original = saved.get(file)
    const found = original.split(from).length - 1
    if (found !== count) {
      console.log(`${label}: NOT APPLIED (found ${found}, expected ${count})`)
      survived++
      continue
    }
    writeFileSync(file, original.replaceAll(from, to))
    let passed = true
    try {
      execSync(command.join(' '), { stdio: 'ignore', timeout: 600000 })
    } catch {
      passed = false
    }
    writeFileSync(file, original)
    if (passed) survived++
    console.log(`${label}: ${passed ? 'SURVIVED' : 'killed'}`)
  }
  console.log(`mutations ${mutations.length}, survived ${survived}`)
} catch (error) {
  console.log(`unmutated run failed: ${error.message.split('\n')[0]}`)
  process.exitCode = 1
} finally {
  restore()
}
```

`build-routes.sh` runs from the repository root and needs the execute bit:

```bash
chmod +x .tmp/s8a/build-routes.sh
ls -l .tmp/s8a/build-routes.sh | cut -c1-10
```


Expected:

```text
-rwxr-xr-x
```


- [ ] **Step 3: Record the baseline**

The recursive test run uses the no-bail option so that one failing package does not hide the figures of the others. The build is the route table of a clean `.next`:

```bash
pnpm --filter @pathways/shared build > /dev/null 2>&1 && echo "shared built"
pnpm typecheck > .tmp/s8a/out/typecheck.txt 2>&1 && echo "typecheck clean"
git checkout -- apps/web/next-env.d.ts
pnpm -r --no-bail --if-present run test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Test Files|Tests +[0-9]+| FAIL "
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Tests +[0-9]+| FAIL "
pnpm docs:check 2>&1 | tail -3
git checkout -- apps/web/next-env.d.ts
.tmp/s8a/build-routes.sh baseline
git checkout -- apps/web/next-env.d.ts
grep Middleware .tmp/s8a/routes-baseline.txt | grep -oE "[0-9]+ kB" | cut -d' ' -f1 > .tmp/s8a/m0
cat .tmp/s8a/m0
(cd apps/web && npx tsc --noEmit --noUnusedLocals -p . 2>&1 | grep "error TS" | cut -c1-110)
(cd apps/api && npx tsc --noEmit --noUnusedLocals -p . 2>&1 | grep "error TS" | cut -c1-110)
```


Expected:

```text
shared built
typecheck clean
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  19 passed (19)
packages/shared test:  Test Files  46 passed (46)
packages/shared test:       Tests  731 passed (731)
packages/imports test:  Test Files  11 passed (11)
packages/imports test:       Tests  94 passed (94)
apps/api test:  Test Files  158 passed | 10 skipped (168)
apps/api test:       Tests  2628 passed | 21 skipped (2649)
apps/web test:  Test Files  282 passed (282)
apps/web test:       Tests  2879 passed (2879)
      Tests  58 passed (58)

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
exit 0
ƒ Middleware                                                      <n> kB
<n>
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but
src/types/pathways.ts(14,3): error TS6196: 'SadddDashboard' is declared but never used.
prisma/hosted-realistic-seed.ts(504,9): error TS6133: 'storage' is declared but its value is never read.
src/modules/participants/participants.service.ts(30,55): error TS6138: Property 'prisma' is declared but its v
```


Typecheck is clean, the tests print the baselines, the docs check keeps its 6 failures and 1 warning, the build exits 0 with `Middleware` at `M0`, and `--noUnusedLocals` lists the lines that exist before S8a: two in the web app (`forms/hooks/use-collection-state.ts` `indicators`, where S5b moved it, and `types/pathways.ts` `SadddDashboard`) and two in the api (`prisma/hosted-realistic-seed.ts` `storage` and `participants.service.ts` `prisma`). Write down `B_config`, `B_shared`, `B_imports`, `B_api`, `B_web`, `B_sad`, the docs check failure count and `M0`; later tasks compare against these. The figures are the S7d tip: config 19, shared 731 (46 files), imports 94, api 2628 passed and 21 skipped (158 files, 10 skipped), web 2879 (282 files), sad 58; the latest gate line in `docs/activity-log.md` wins if it differs. Then the second block records the facts that the edit lists below were counted against:

```bash
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
pnpm --filter @pathways/api exec vitest run src/common/validation/field-schemas-parity.test.ts 2>&1 | grep -aE "Tests +[0-9]+"
git grep -n "assessmentDetailDeniedRoles = new Set" -- apps/api/src
git grep -c "code === 'PROGRAM_MANAGER' || code === 'GRANT_MANAGER'" -- apps/web/src/lib/rbac/access-matrix.ts
git grep -nE "readWorkspaceContextCookie = |function readContextCookie\(|const ownerCookie = " -- apps/web/src/lib
git grep -c "document.cookie" -- apps/web/src/lib/auth/workspace-access.ts apps/web/src/lib/api/core/request.ts apps/web/src/lib/api/core/request-owner.ts
git checkout -- apps/web/next-env.d.ts
```


Expected:

```text
apps/api/src/modules/auth/beneficiary-step-up-pin.dto.ts
apps/api/src/modules/auth/signin-lockout.dto.ts
apps/api/src/modules/profile/profile.dto.ts
apps/api/src/modules/public/public.dto.ts
apps/api/src/modules/users/users.dto.ts
apps/api/src/modules/auth/application-profile.service.ts:1
apps/api/src/modules/auth/beneficiary-step-up-pin.service.ts:2
apps/api/src/modules/users/users.service.ts:1
8
apps/web/src/features/projects/activities/components/project-activities-rbac.test.tsx
apps/web/src/features/projects/activities/components/project-activities-workspace.test.tsx
apps/web/src/features/projects/components/project-setup-form.test.tsx
apps/web/src/features/projects/team/project-team-editor-dialog.test.tsx
apps/web/src/features/settings/user-management-workspace.test.tsx
apps/web/src/lib/services/pathways-client.test.ts
11
1569
packages/shared/src/rbac/route-policy.ts:2
apps/web/src/lib/services/source-mutation.ts:1
file: 'src/modules/auth/auth.controller.ts'
file: 'src/modules/users/users.controller.ts'
4
2
apps/api/src/modules/auth/authorized-data.controller.ts
apps/api/src/modules/users/users.controller.ts
S1 kernel present
      Tests  57 passed (57)
apps/api/src/modules/evaluations/evaluation-assessments.service.ts:11:const assessmentDetailDeniedRoles = new Set([
apps/web/src/lib/rbac/access-matrix.ts:1
apps/web/src/lib/api/core/request-owner.ts:5:const ownerCookie = () =>
apps/web/src/lib/api/core/request.ts:35:function readContextCookie() {
apps/web/src/lib/api/core/request.ts:59:  const ownerCookie = readContextCookie()
apps/web/src/lib/auth/workspace-access.ts:79:export const readWorkspaceContextCookie = () =>
apps/web/src/lib/api/core/request-owner.ts:1
apps/web/src/lib/api/core/request.ts:1
apps/web/src/lib/auth/workspace-access.ts:4
```


The greps print, in order:
- exactly the five S8 DTO files `apps/api/src/modules/auth/beneficiary-step-up-pin.dto.ts`, `apps/api/src/modules/auth/signin-lockout.dto.ts`, `apps/api/src/modules/profile/profile.dto.ts`, `apps/api/src/modules/public/public.dto.ts`, `apps/api/src/modules/users/users.dto.ts` (any other file stops the task, because ruling 14 needs S8a to remove the last class-validator DTO; Task 3 Step 6 proves by the `class-validator` grep that no decorator DTO survives);
- `application-profile.service.ts:1`, `beneficiary-step-up-pin.service.ts:2`, `users.service.ts:1` (with their paths);
- `8`;
- six test files: `project-activities-rbac` and `project-activities-workspace` under `features/projects/activities/components/`, `project-setup-form` under `features/projects/components/`, `project-team-editor-dialog` under `features/projects/team/`, `user-management-workspace` under `features/settings`, and `lib/services/pathways-client.test.ts`, the test that holds `pathwaysClient.getUsers()`;
- `11`; `1569`; `packages/shared/src/rbac/route-policy.ts:2`; `apps/web/src/lib/services/source-mutation.ts:1`;
- `file: 'src/modules/auth/auth.controller.ts'` and `file: 'src/modules/users/users.controller.ts'` only;
- `4`; `2`;
- `apps/api/src/modules/auth/authorized-data.controller.ts` and `apps/api/src/modules/users/users.controller.ts` only (any other file stops the task);
- `S1 kernel present`; the field schema parity test count; write it down as `P_fs`;
- one line in `apps/api/src/modules/evaluations/evaluation-assessments.service.ts`; write the path down as `EVAL`;
- `1`;
- four lines, in path order: `lib/api/core/request-owner.ts:5` (`const ownerCookie = `), `lib/api/core/request.ts:35` (`function readContextCookie(`), `lib/api/core/request.ts:59` (a second match, the call `const ownerCookie = readContextCookie()`) and `lib/auth/workspace-access.ts:79` (`readWorkspaceContextCookie = `);
- `request-owner.ts:1`, `request.ts:1`, `workspace-access.ts:4` (the reader comment, the reader, `clearWorkspaceContext` and F4b's `writeWorkspaceContext`).

If any other number differs, stop and report: the edit lists below were counted at the S7d tip.

- [ ] **Step 4: Add the plan and commit**

Copy this plan: `cp docs/handoff/modularization-s8-public-users-auth.md docs/superpowers/plans/$(date +%F)-modularization-s8-public-users-auth.md`. The handoff copy and its index row stay, and so do the `docs/superpowers/plans` copies of the earlier plans and their index rows: they are removed only after the developer has merged the series. In `docs/index.md` section 1.6, add one row after the S7d plan row; the block finds the last line that names the S7d plan copy, so a second matching line does not get the row twice:

```bash
D=$(date +%F)
cp docs/handoff/modularization-s8-public-users-auth.md docs/superpowers/plans/$D-modularization-s8-public-users-auth.md
ROW="| [S8 public, users, profile and auth plan](superpowers/plans/$D-modularization-s8-public-users-auth.md) | $D-modularization-s8-public-users-auth.md | $D | S8 of the codebase modularization: S8a auth, users, profile and public contracts, web clients and dead code; S8b outline | In progress |"
LAST=$(grep -n "(superpowers/plans/[^)]*modularization-s7d-dashboards-web" docs/index.md | tail -1 | cut -d: -f1)
sed -i "${LAST}a $ROW" docs/index.md
git diff docs/index.md | grep "^[+-]|" | cut -c1-140
pnpm docs:check 2>&1 | tail -3
git add docs/superpowers/plans docs/index.md
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "docs: add the S8 public, users, profile and auth plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -2
```


Expected:

```text
+| [S8 public, users, profile and auth plan](superpowers/plans/YYYY-MM-DD-modularization-s8-public-users-auth.md) | YYYY-MM-DD-modularizatio

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
<sha> docs: add the S8 public, users, profile and auth plan
<sha> docs: record modularization S7d release gate results
```


`docs:check` keeps the 6 baseline failures and 1 warning.

---

### Task 1: Users contracts

**Files:**
- Create: `packages/shared/src/contracts/users/user-authorization.ts`
- Test: `packages/shared/src/contracts/users/user-authorization.test.ts`
- Modify: `packages/shared/src/index.ts` (one barrel line)
- Create then delete: `apps/api/src/modules/users/user-authorization-parity.test.ts`
- Test: `apps/api/src/modules/users/users.controller.validation.test.ts`
- Modify: `apps/api/src/modules/users/users.controller.ts`, `apps/api/src/modules/users/users.service.ts`, `apps/api/src/modules/users/users.service.test.ts`, `apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts`
- Delete: `apps/api/src/modules/users/users.dto.ts`, `apps/api/src/modules/users/users.validation.test.ts`

**Interfaces:**
- Consumes: `ZodPipe` (F3b); `lengthString`, `uuidString`, `trimmedInput` (S1a, `@pathways/shared`); `roleNames`, `CanonicalRole`, `RoleName` from `packages/shared/src/rbac/role-catalog.ts`.
- Produces, from `@pathways/shared`: `authorizeExistingUserRequest` and `type AuthorizeExistingUserRequest = { authUserId: string; fullName: string; role: CanonicalRole; projectIds: string[] }`, `updateAuthorizedUserRequest` and `type UpdateAuthorizedUserRequest = { fullName?: string | null; role: CanonicalRole; accountStatus: 'ACTIVE' | 'DEACTIVATED'; projectIds: string[] }`, `authorizedUserResponse` and `type AuthorizedUserResponse` (types only, used by Task 7).

- [ ] **Step 1: Write the failing users contract test**

Create `packages/shared/src/contracts/users/user-authorization.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { roleNames } from '../../rbac/role-catalog'
import { authorizeExistingUserRequest, updateAuthorizedUserRequest } from './user-authorization'

const authUserId = '71000000-0000-4000-8000-000000000001'
const officer = { authUserId, fullName: 'A', role: 'PROJECT_OFFICER' }
const change = { role: 'PROJECT_OFFICER', accountStatus: 'ACTIVE', projectIds: [] }

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
    const body = {
      fullName: null,
      role: 'PROGRAM_MANAGER',
      accountStatus: 'ACTIVE',
      projectIds: [],
    }
    expect(updateAuthorizedUserRequest.parse(body)).toEqual(body)
  })

  it('requires the project list on update and allows only ACTIVE or DEACTIVATED', () => {
    const body = { role: 'PROGRAM_MANAGER', accountStatus: 'ACTIVE' }
    expect(updateAuthorizedUserRequest.safeParse(body).success).toBe(false)
    expect(
      updateAuthorizedUserRequest.safeParse({ ...body, accountStatus: 'SUSPENDED', projectIds: [] })
        .success,
    ).toBe(false)
    for (const extra of [{ organizationId: authUserId }, { authUserId }]) {
      expect(
        updateAuthorizedUserRequest.safeParse({ ...body, projectIds: [], ...extra }).success,
      ).toBe(false)
    }
  })

  it.each([
    ['1 character', 'A', true],
    ['120 characters', 'x'.repeat(120), true],
    ['121 characters', 'x'.repeat(121), false],
    ['blank after the trim', '   ', false],
  ])('checks the name length on both bodies: %s', (_label, fullName, accepted) => {
    expect(authorizeExistingUserRequest.safeParse({ ...officer, fullName }).success).toBe(accepted)
    expect(updateAuthorizedUserRequest.safeParse({ ...change, fullName }).success).toBe(accepted)
  })

  it('accepts every role code and refuses a display name on both bodies', () => {
    for (const role of Object.keys(roleNames)) {
      expect(authorizeExistingUserRequest.safeParse({ ...officer, role }).success).toBe(true)
      expect(updateAuthorizedUserRequest.safeParse({ ...change, role }).success).toBe(true)
    }
    for (const role of ['Project Officer', 'toString']) {
      expect(authorizeExistingUserRequest.safeParse({ ...officer, role }).success).toBe(false)
      expect(updateAuthorizedUserRequest.safeParse({ ...change, role }).success).toBe(false)
    }
  })

  it('accepts either account status on update and an absent name', () => {
    for (const accountStatus of ['ACTIVE', 'DEACTIVATED']) {
      expect(updateAuthorizedUserRequest.safeParse({ ...change, accountStatus }).success).toBe(true)
    }
  })

  it.each([
    ['a text', 'not-a-uuid'],
    ['a version 0 id', '71000000-0000-0000-8000-000000000001'],
  ])('refuses %s as the identity and as a project id', (_label, id) => {
    expect(authorizeExistingUserRequest.safeParse({ ...officer, authUserId: id }).success).toBe(
      false,
    )
    for (const body of [
      authorizeExistingUserRequest.safeParse({ ...officer, projectIds: [id] }),
      updateAuthorizedUserRequest.safeParse({ ...change, projectIds: [id] }),
    ]) {
      expect(body.success).toBe(false)
    }
  })

  it.each([
    [100, true],
    [101, false],
  ])('accepts a list of %i projects: %s', (count, accepted) => {
    const projectIds = Array(count).fill(authUserId)
    expect(authorizeExistingUserRequest.safeParse({ ...officer, projectIds }).success).toBe(
      accepted,
    )
    expect(updateAuthorizedUserRequest.safeParse({ ...change, projectIds }).success).toBe(accepted)
  })

  it('words the limit of 100 projects as the class-validator rule did', () => {
    const projectIds = Array(101).fill(authUserId)
    for (const result of [
      authorizeExistingUserRequest.safeParse({ ...officer, projectIds }),
      updateAuthorizedUserRequest.safeParse({ ...change, projectIds }),
    ]) {
      expect(result.success ? [] : result.error.issues.map((issue) => issue.message)).toEqual([
        'must contain no more than 100 elements',
      ])
    }
  })
})
```

The first 8 tests are the contract the DTOs expressed; the rest are boundary tables that pin every rule the parity test of Step 3 compares (name length 1 and 120 counted in characters, the role list, the account status list, an absent or null name, the uuid shape for the identity and each project id, the project list at 100 and 101), because the parity test is deleted with the DTO in Step 6 and its rows would otherwise be the only proof of those rules.

```bash
pnpm --filter @pathways/shared exec vitest run src/contracts/users/user-authorization.test.ts 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:" | sed "s#$PWD/##g"
```


Expected:

```text
 FAIL  src/contracts/users/user-authorization.test.ts [ src/contracts/users/user-authorization.test.ts ]
Error: Cannot find module './user-authorization' imported from 'packages/shared/src/contracts/users/user-authorization.test.ts'
Caused by: Error: Failed to load url ./user-authorization (resolved id: ./user-authorization) in packages/shared/src/contracts/users/user-authorization.test.ts. Does the file exist?
 Test Files  1 failed (1)
```

The run fails because `./user-authorization` does not exist yet.

- [ ] **Step 2: Create the users contracts and export them**

Each field mirrors one `users.dto.ts` rule: `@IsUUID()` is `uuidString`, the trim `@Transform` with `@Length(1, 120)` is `trimmedInput(lengthString(1, 120))`, `@IsOptional()` is `.nullish()` or the `[]` default.

Create `packages/shared/src/contracts/users/user-authorization.ts`:

```ts
import { z } from 'zod'

import { type CanonicalRole, type RoleName, roleNames } from '../../rbac/role-catalog'
import { lengthString, trimmedInput, uuidString } from '../common/field-schemas'

const roleCodes = Object.keys(roleNames) as [CanonicalRole, ...CanonicalRole[]]
const roleDisplayNames = Object.values(roleNames) as [RoleName, ...RoleName[]]
const fullName = trimmedInput(lengthString(1, 120))
const projectIds = z.array(uuidString).max(100, 'must contain no more than 100 elements')

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

The index ends with its `export * from './contracts/...'` lines (S1 added `field-schemas` and its project contracts there); append the export of the new contract:

```bash
printf '%s\n' "export * from './contracts/users/user-authorization'" >> packages/shared/src/index.ts
tail -2 packages/shared/src/index.ts
```


Expected:

```text
export * from './contracts/reports/report-responses'
export * from './contracts/users/user-authorization'
```

```bash
pnpm --filter @pathways/shared exec vitest run src/contracts 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:"
pnpm --filter @pathways/shared build > /dev/null 2>&1 && echo "shared built"
test -f packages/shared/dist/contracts/users/user-authorization.js && echo "shared dist ok"
```


Expected:

```text
 Test Files  32 passed (32)
      Tests  626 passed (626)
shared built
shared dist ok
```

The users contract file (19 tests) and the earlier contract files pass, the build succeeds and `shared dist ok` prints.

- [ ] **Step 2b: Prove the contract tests by mutation**

Each mutation changes one rule of the contract; every one must make a test fail. The list is fixed text:

Create `.tmp/s8a/mut-users.json`:

```json
[
 ["authUserId not checked", "packages/shared/src/contracts/users/user-authorization.ts", "authUserId: uuidString,", "authUserId: z.string(),"],
 ["name minimum 0", "packages/shared/src/contracts/users/user-authorization.ts", "const fullName = trimmedInput(lengthString(1, 120))", "const fullName = trimmedInput(lengthString(0, 120))"],
 ["name maximum 121", "packages/shared/src/contracts/users/user-authorization.ts", "const fullName = trimmedInput(lengthString(1, 120))", "const fullName = trimmedInput(lengthString(1, 121))"],
 ["name maximum 119", "packages/shared/src/contracts/users/user-authorization.ts", "const fullName = trimmedInput(lengthString(1, 120))", "const fullName = trimmedInput(lengthString(1, 119))"],
 ["name not trimmed", "packages/shared/src/contracts/users/user-authorization.ts", "const fullName = trimmedInput(lengthString(1, 120))", "const fullName = lengthString(1, 120)"],
 ["role not checked on authorize", "packages/shared/src/contracts/users/user-authorization.ts", "    role: z.enum(roleCodes),\n    projectIds: projectIds.default([]),", "    role: z.string(),\n    projectIds: projectIds.default([]),"],
 ["role not checked on update", "packages/shared/src/contracts/users/user-authorization.ts", "    role: z.enum(roleCodes),\n    accountStatus", "    role: z.string(),\n    accountStatus"],
 ["project list default dropped", "packages/shared/src/contracts/users/user-authorization.ts", "projectIds: projectIds.default([]),", "projectIds,"],
 ["project list maximum 101", "packages/shared/src/contracts/users/user-authorization.ts", "z.array(uuidString).max(100,", "z.array(uuidString).max(101,"],
 ["project list maximum 99", "packages/shared/src/contracts/users/user-authorization.ts", "z.array(uuidString).max(100,", "z.array(uuidString).max(99,"],
 ["project id not checked", "packages/shared/src/contracts/users/user-authorization.ts", "z.array(uuidString).max(100,", "z.array(z.string()).max(100,"],
 ["authorize accepts unknown keys", "packages/shared/src/contracts/users/user-authorization.ts", "    projectIds: projectIds.default([]),\n  })\n  .strict()", "    projectIds: projectIds.default([]),\n  })"],
 ["update accepts unknown keys", "packages/shared/src/contracts/users/user-authorization.ts", "    projectIds,\n  })\n  .strict()", "    projectIds,\n  })"],
 ["update name required", "packages/shared/src/contracts/users/user-authorization.ts", "fullName: fullName.nullish(),", "fullName,"],
 ["update name null refused", "packages/shared/src/contracts/users/user-authorization.ts", "fullName: fullName.nullish(),", "fullName: fullName.optional(),"],
 ["update name absent refused", "packages/shared/src/contracts/users/user-authorization.ts", "fullName: fullName.nullish(),", "fullName: fullName.nullable(),"],
 ["update status any", "packages/shared/src/contracts/users/user-authorization.ts", "accountStatus: z.enum(['ACTIVE', 'DEACTIVATED']),", "accountStatus: z.string(),"],
 ["update status adds SUSPENDED", "packages/shared/src/contracts/users/user-authorization.ts", "accountStatus: z.enum(['ACTIVE', 'DEACTIVATED']),", "accountStatus: z.enum(['ACTIVE', 'DEACTIVATED', 'SUSPENDED']),"],
 ["update status drops DEACTIVATED", "packages/shared/src/contracts/users/user-authorization.ts", "accountStatus: z.enum(['ACTIVE', 'DEACTIVATED']),", "accountStatus: z.enum(['ACTIVE']),"],
 ["update status drops ACTIVE", "packages/shared/src/contracts/users/user-authorization.ts", "accountStatus: z.enum(['ACTIVE', 'DEACTIVATED']),", "accountStatus: z.enum(['DEACTIVATED']),"],
 ["project list message changed", "packages/shared/src/contracts/users/user-authorization.ts", "'must contain no more than 100 elements'", "'must be short'"]
]
```

```bash
node .tmp/s8a/mutate.mjs .tmp/s8a/mut-users.json pnpm --filter @pathways/shared exec vitest run src/contracts/users/user-authorization.test.ts
```


Expected:

```text
unmutated: pass
authUserId not checked: killed
name minimum 0: killed
name maximum 121: killed
name maximum 119: killed
name not trimmed: killed
role not checked on authorize: killed
role not checked on update: killed
project list default dropped: killed
project list maximum 101: killed
project list maximum 99: killed
project id not checked: killed
authorize accepts unknown keys: killed
update accepts unknown keys: killed
update name required: killed
update name null refused: killed
update name absent refused: killed
update status any: killed
update status adds SUSPENDED: killed
update status drops DEACTIVATED: killed
update status drops ACTIVE: killed
project list message changed: killed
mutations 21, survived 0
```

All 21 mutations are applied and killed, and the contract file is restored after each run.

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

  it('keeps the class-validator message for a project list over 100, which the editor can send', async () => {
    const json = JSON.stringify({ ...officer, projectIds: Array(101).fill(authUserId) })
    const expected = {
      accepted: false,
      value: {
        statusCode: 400,
        error: 'Bad Request',
        message: ['projectIds must contain no more than 100 elements'],
      },
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

```bash
pnpm --filter @pathways/api exec vitest run src/modules/users/user-authorization-parity.test.ts 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:"
```


Expected:

```text
 Test Files  1 passed (1)
      Tests  41 passed (41)
```

41 tests pass (26 authorize rows, 12 update rows, the two message rows, the null exception). Any failure means the contract differs from the DTO: stop and report the row, do not edit the table to match.

- [ ] **Step 4: Commit the contracts and the evidence**

```bash
git add -N packages/shared/src apps/api/src/modules/users
pnpm exec biome check --write packages/shared/src/contracts packages/shared/src/index.ts apps/api/src/modules/users/user-authorization-parity.test.ts
pnpm lint 2>&1 | tail -2
pnpm typecheck > .tmp/s8a/out/typecheck.txt 2>&1 && echo "typecheck clean"
pnpm --filter @pathways/shared test 2>&1 | grep -aE "Test Files|Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add packages/shared/src/contracts packages/shared/src/index.ts apps/api/src/modules/users/user-authorization-parity.test.ts
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "feat(shared): add the users contracts with their DTO parity test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -1
```


Expected:

```text
Checked 72 files in <ms>. No fixes applied.
$ pnpm exec biome check .
Checked 1571 files in <ms>. No fixes applied.
typecheck clean
 Test Files  47 passed (47)
      Tests  750 passed (750)
<sha> feat(shared): add the users contracts with their DTO parity test
```

Shared = `B_shared + 19` (the users contract file).

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

  it('answers the class-validator wording for a project list over 100', async () => {
    const result = await send(
      'POST',
      '/authorize-existing',
      JSON.stringify({
        authUserId,
        fullName: 'Synthetic User',
        role: 'PROJECT_OFFICER',
        projectIds: Array(101).fill(authUserId),
      }),
    )
    expect(result).toEqual({
      status: 400,
      body: {
        statusCode: 400,
        error: 'Bad Request',
        message: ['projectIds must contain no more than 100 elements'],
      },
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

`apps/api/src/modules/users/users.service.test.ts`: add `import type { CanonicalRole } from '@pathways/shared'` below the `vitest` import (Biome sorts it) and replace the two helpers `update` and `authorize` (they pass a plain `string` role, which no longer matches the contract type) with:

```ts
const update = (userId: string, role: string) =>
  service.update(identity, userId, {
    role: role as CanonicalRole,
    accountStatus: 'ACTIVE',
    projectIds: [projectId],
  })
const authorize = (role: string) =>
  service.authorizeExisting(identity, {
    authUserId: id(7),
    fullName: 'Synthetic User',
    role: role as CanonicalRole,
    projectIds: [projectId],
  })
```

`apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts`: delete the case object whose `file` is `'src/modules/users/users.controller.ts'` (four lines including its braces).

```bash
git rm apps/api/src/modules/users/users.dto.ts apps/api/src/modules/users/users.validation.test.ts apps/api/src/modules/users/user-authorization-parity.test.ts
git grep -nE "AuthorizeExistingUserDto|UpdateAuthorizedUserDto|users\.dto" -- apps packages || echo "none left"
```


Expected:

```text
rm 'apps/api/src/modules/users/user-authorization-parity.test.ts'
rm 'apps/api/src/modules/users/users.dto.ts'
rm 'apps/api/src/modules/users/users.validation.test.ts'
none left
```

The `git rm` prints three `rm` lines and the grep finds nothing (`none left`). `users.validation.test.ts` (11 tests, a describe titled with the phase code `P07`) compiled the controller with TypeScript to prove the DTO metadata survived; the zod route needs no metadata, and the HTTP test of Step 5 replaces it.

- [ ] **Step 6b: Prove the HTTP test by mutation**

A route that lost its pipe, or that parses the other route's contract, must fail the HTTP test:

Create `.tmp/s8a/mut-users-http.json`:

```json
[
 ["authorize route without the zod pipe", "apps/api/src/modules/users/users.controller.ts", "@Body(new ZodPipe(authorizeExistingUserRequest)) body", "@Body() body"],
 ["update route without the zod pipe", "apps/api/src/modules/users/users.controller.ts", "@Body(new ZodPipe(updateAuthorizedUserRequest)) body", "@Body() body"],
 ["authorize route parses the update contract", "apps/api/src/modules/users/users.controller.ts", "new ZodPipe(authorizeExistingUserRequest)", "new ZodPipe(updateAuthorizedUserRequest)"],
 ["update route parses the authorize contract", "apps/api/src/modules/users/users.controller.ts", "new ZodPipe(updateAuthorizedUserRequest)", "new ZodPipe(authorizeExistingUserRequest)"]
]
```

```bash
node .tmp/s8a/mutate.mjs .tmp/s8a/mut-users-http.json pnpm --filter @pathways/api exec vitest run src/modules/users/users.controller.validation.test.ts
```


Expected:

```text
unmutated: pass
authorize route without the zod pipe: killed
update route without the zod pipe: killed
authorize route parses the update contract: killed
update route parses the authorize contract: killed
mutations 4, survived 0
```

All 4 mutations are killed.

- [ ] **Step 7: Run the tests and commit**

```bash
git add -N apps/api/src/modules/users
pnpm --filter @pathways/api exec vitest run src/modules/users src/common 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL "
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/api/*.ts')
pnpm lint 2>&1 | tail -2
pnpm typecheck > .tmp/s8a/out/typecheck.txt 2>&1 && echo "typecheck clean"
(cd apps/api && npx tsc --noEmit --noUnusedLocals -p . 2>&1 | grep "error TS" | cut -c1-110)
pnpm --filter @pathways/api test 2>&1 | grep -aE "Test Files|Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api/src/modules/users apps/api/src/common/validation
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(api): validate the users bodies with the shared zod contracts

The users DTOs, their parity test and the compiled-metadata test are removed; an HTTP test covers both routes.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -1
```


Expected:

```text
 Test Files  16 passed (16)
      Tests  170 passed (170)
Checked 5 files in <ms>. Fixed 2 files.
$ pnpm exec biome check .
Checked 1569 files in <ms>. No fixes applied.
typecheck clean
prisma/hosted-realistic-seed.ts(504,9): error TS6133: 'storage' is declared but its value is never read.
src/modules/participants/participants.service.ts(30,55): error TS6138: Property 'prisma' is declared but its v
 Test Files  158 passed | 10 skipped (168)
      Tests  2622 passed | 21 skipped (2643)
<sha> refactor(api): validate the users bodies with the shared zod contracts
```

All pass, and `--noUnusedLocals` lists only the two baseline lines of the api; api = `B_api - 6` (users validation 11 and one metadata case removed, HTTP 6 added).

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
      updateOwnProfileRequest.parse({
        ...body,
        fullName: '  Synthetic User  ',
        contactNumber: ' ',
      }),
    ).toEqual({ ...body, contactNumber: '' })
  })

  it.each([
    { ...body, fullName: 'x' },
    { ...body, fullName: 'x'.repeat(81) },
    { ...body, contactNumber: 'not a phone' },
    { ...body, expectedUpdatedAt: '2026-02-30' },
    { fullName: 'Synthetic User', expectedUpdatedAt: body.expectedUpdatedAt },
    { ...body, email: 'a@example.invalid' },
  ])('rejects %j', (input) => {
    expect(updateOwnProfileRequest.safeParse(input).success).toBe(false)
  })

  it('reads only the three own profile fields', () => {
    const profile = {
      fullName: 'Synthetic User',
      contactNumber: null,
      updatedAt: body.expectedUpdatedAt,
    }
    expect(ownProfileResponse.parse(profile)).toEqual(profile)
    expect(ownProfileResponse.safeParse({ ...profile, email: 'a@example.invalid' }).success).toBe(
      false,
    )
  })

  it.each([
    ['2 characters', 'Al', true],
    ['80 characters', 'x'.repeat(80), true],
    ['81 characters', 'x'.repeat(81), false],
    ['1 character after the trim', ' A ', false],
  ])('checks the name length: %s', (_label, fullName, accepted) => {
    expect(updateOwnProfileRequest.safeParse({ ...body, fullName }).success).toBe(accepted)
  })

  it.each([
    ['7 characters', '1234567', true],
    ['30 characters', '1'.repeat(30), true],
    ['6 characters', '123456', false],
    ['31 characters', '1'.repeat(31), false],
    ['every allowed symbol', '+63 (912) 345-6789', true],
    ['a letter inside', '12345a7', false],
    ['a letter before', 'abc1234567', false],
    ['a letter after', '1234567abc', false],
    ['null', null, false],
  ])('checks the contact number: %s', (_label, contactNumber, accepted) => {
    expect(updateOwnProfileRequest.safeParse({ ...body, contactNumber }).success).toBe(accepted)
  })

  it.each([
    ['a date', '2026-10-09', true],
    ['an offset time', '2026-10-09T01:02:03+08:00', true],
    ['a text', 'yesterday', false],
    ['a number', 5, false],
  ])('checks the expected update time: %s', (_label, expectedUpdatedAt, accepted) => {
    expect(updateOwnProfileRequest.safeParse({ ...body, expectedUpdatedAt }).success).toBe(accepted)
  })

  it.each([
    ['a text contact number', { contactNumber: '+63 900 000 0000' }, true],
    ['an offset time', { updatedAt: '2026-10-01T00:00:00+08:00' }, false],
    ['a date', { updatedAt: '2026-10-01' }, false],
    ['a missing contact number', { contactNumber: undefined }, false],
    ['a number as the name', { fullName: 5 }, false],
  ])('checks the own profile response: %s', (_label, change, accepted) => {
    const profile = {
      fullName: 'Synthetic User',
      contactNumber: null,
      updatedAt: body.expectedUpdatedAt,
    }
    expect(ownProfileResponse.safeParse({ ...profile, ...change }).success).toBe(accepted)
  })
})
```

The first 8 tests are the contract the DTO expressed; the rest are boundary tables that pin every rule the parity test of Step 3 compares (the name length 2 and 80 counted in characters, the contact number pattern and its length 0 and 30, the surrounding whitespace trimmed before the length is counted, the strict date, the unknown key), because the parity test is deleted with the DTO in Step 6.

```bash
pnpm --filter @pathways/shared exec vitest run src/contracts/profile/own-profile.test.ts 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:" | sed "s#$PWD/##g"
```


Expected:

```text
 FAIL  src/contracts/profile/own-profile.test.ts [ src/contracts/profile/own-profile.test.ts ]
Error: Cannot find module './own-profile' imported from 'packages/shared/src/contracts/profile/own-profile.test.ts'
Caused by: Error: Failed to load url ./own-profile (resolved id: ./own-profile) in packages/shared/src/contracts/profile/own-profile.test.ts. Does the file exist?
 Test Files  1 failed (1)
```

The run fails because `./own-profile` does not exist yet.

- [ ] **Step 2: Create the contract and export it**

Create `packages/shared/src/contracts/profile/own-profile.ts`:

```ts
import { z } from 'zod'

import { lengthString, strictIsoDateString, trimmedInput } from '../common/field-schemas'

const contactNumberPattern = /^(?:[+()\-\s0-9]{7,30})?$/

// Body of PATCH profile.
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

Append the export of the contract to `packages/shared/src/index.ts`:

```bash
printf '%s\n' "export * from './contracts/profile/own-profile'" >> packages/shared/src/index.ts
tail -2 packages/shared/src/index.ts
```


Expected:

```text
export * from './contracts/users/user-authorization'
export * from './contracts/profile/own-profile'
```

```bash
pnpm --filter @pathways/shared exec vitest run src/contracts/profile/own-profile.test.ts 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:"
pnpm --filter @pathways/shared build > /dev/null 2>&1 && echo "shared built"
```


Expected:

```text
 Test Files  1 passed (1)
      Tests  30 passed (30)
shared built
```

The 30 tests pass and the build succeeds.

- [ ] **Step 2b: Prove the contract tests by mutation**

Each mutation changes one rule of the contract; every one must make a test fail:

Create `.tmp/s8a/mut-profile.json`:

```json
[
 [
  "name minimum 1",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "trimmedInput(lengthString(2, 80))",
  "trimmedInput(lengthString(1, 80))"
 ],
 [
  "name minimum 3",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "trimmedInput(lengthString(2, 80))",
  "trimmedInput(lengthString(3, 80))"
 ],
 [
  "name maximum 81",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "trimmedInput(lengthString(2, 80))",
  "trimmedInput(lengthString(2, 81))"
 ],
 [
  "name maximum 79",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "trimmedInput(lengthString(2, 80))",
  "trimmedInput(lengthString(2, 79))"
 ],
 [
  "name not trimmed",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "fullName: trimmedInput(lengthString(2, 80)),",
  "fullName: lengthString(2, 80),"
 ],
 [
  "contact maximum 31",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "lengthString(0, 30)",
  "lengthString(0, 31)"
 ],
 [
  "contact maximum 29",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "lengthString(0, 30)",
  "lengthString(0, 29)"
 ],
 [
  "contact not trimmed",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "contactNumber: trimmedInput(\n      lengthString(0, 30).refine(\n        (value) => contactNumberPattern.test(value),\n        'must be a contact number',\n      ),\n    ),",
  "contactNumber: lengthString(0, 30).refine(\n      (value) => contactNumberPattern.test(value),\n      'must be a contact number',\n    ),"
 ],
 [
  "contact pattern minimum 6",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "{7,30}",
  "{6,30}"
 ],
 [
  "contact pattern minimum 8",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "{7,30}",
  "{8,30}"
 ],
 [
  "contact pattern drops plus",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "[+()\\-\\s0-9]",
  "[()\\-\\s0-9]"
 ],
 [
  "contact pattern drops brackets",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "[+()\\-\\s0-9]",
  "[+\\-\\s0-9]"
 ],
 [
  "contact pattern drops hyphen",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "[+()\\-\\s0-9]",
  "[+()\\s0-9]"
 ],
 [
  "contact pattern drops space",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "[+()\\-\\s0-9]",
  "[+()\\-0-9]"
 ],
 [
  "contact pattern drops digits",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "[+()\\-\\s0-9]",
  "[+()\\-\\s0-8]"
 ],
 [
  "contact pattern unanchored start",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "/^(?:[+()",
  "/(?:[+()"
 ],
 [
  "contact pattern unanchored end",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "{7,30})?$/",
  "{7,30})?/"
 ],
 [
  "contact empty refused",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "(?:[+()\\-\\s0-9]{7,30})?$",
  "(?:[+()\\-\\s0-9]{7,30})$"
 ],
 [
  "date not checked",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "expectedUpdatedAt: strictIsoDateString,",
  "expectedUpdatedAt: z.string(),"
 ],
 [
  "date not strict",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "expectedUpdatedAt: strictIsoDateString,",
  "expectedUpdatedAt: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}/),"
 ],
 [
  "request accepts unknown keys",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "  })\n  .strict()\nexport type UpdateOwnProfileRequest",
  "  })\nexport type UpdateOwnProfileRequest"
 ],
 [
  "response accepts unknown keys",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "  })\n  .strict()\nexport type OwnProfileResponse",
  "  })\nexport type OwnProfileResponse"
 ],
 [
  "response contact required text",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "contactNumber: z.string().nullable(),",
  "contactNumber: z.string(),"
 ],
 [
  "response contact optional",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "contactNumber: z.string().nullable(),",
  "contactNumber: z.string().nullish(),"
 ],
 [
  "response date not checked",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "updatedAt: z.string().datetime(),",
  "updatedAt: z.string(),"
 ],
 [
  "response date accepts offsets",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "updatedAt: z.string().datetime(),",
  "updatedAt: z.string().datetime({ offset: true }),"
 ],
 [
  "response name not checked",
  "packages/shared/src/contracts/profile/own-profile.ts",
  "fullName: z.string(),",
  "fullName: z.any(),"
 ]
]
```

```bash
node .tmp/s8a/mutate.mjs .tmp/s8a/mut-profile.json pnpm --filter @pathways/shared exec vitest run src/contracts/profile/own-profile.test.ts
```


Expected:

```text
unmutated: pass
name minimum 1: killed
name minimum 3: killed
name maximum 81: killed
name maximum 79: killed
name not trimmed: killed
contact maximum 31: SURVIVED
contact maximum 29: killed
contact not trimmed: killed
contact pattern minimum 6: killed
contact pattern minimum 8: killed
contact pattern drops plus: killed
contact pattern drops brackets: killed
contact pattern drops hyphen: killed
contact pattern drops space: killed
contact pattern drops digits: killed
contact pattern unanchored start: killed
contact pattern unanchored end: killed
contact empty refused: killed
date not checked: killed
date not strict: killed
request accepts unknown keys: killed
response accepts unknown keys: killed
response contact required text: killed
response contact optional: killed
response date not checked: killed
response date accepts offsets: killed
response name not checked: killed
mutations 27, survived 1
```

All 27 mutations are applied and 26 are killed. `contact maximum 31` survives and is equivalent: the pattern `{7,30}` already caps the length at 30, the same rule twice, which the DTO also held; `contact maximum 29` and the pattern mutations pin the limit.

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

```bash
pnpm --filter @pathways/api exec vitest run src/modules/profile/own-profile-parity.test.ts 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:"
```


Expected:

```text
 Test Files  1 passed (1)
      Tests  17 passed (17)
```

17 tests pass (6 accepted, 11 rejected). Any failure: stop and report the row.

- [ ] **Step 4: Commit the contract and the evidence**

```bash
git add -N packages/shared/src apps/api/src/modules/profile
pnpm exec biome check --write packages/shared/src/contracts packages/shared/src/index.ts apps/api/src/modules/profile/own-profile-parity.test.ts
pnpm lint 2>&1 | tail -2
pnpm typecheck > .tmp/s8a/out/typecheck.txt 2>&1 && echo "typecheck clean"
pnpm --filter @pathways/shared test 2>&1 | grep -aE "Test Files|Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add packages/shared/src/contracts packages/shared/src/index.ts apps/api/src/modules/profile/own-profile-parity.test.ts
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "feat(shared): add the own profile contracts with their DTO parity test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -1
```


Expected:

```text
Checked 74 files in <ms>. No fixes applied.
$ pnpm exec biome check .
Checked 1572 files in <ms>. No fixes applied.
typecheck clean
 Test Files  48 passed (48)
      Tests  780 passed (780)
<sha> feat(shared): add the own profile contracts with their DTO parity test
```

Shared = `B_shared + 19 + 30` (the users and own profile contract files).

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
      await patch({
        fullName: '  Synthetic User  ',
        contactNumber: ' ',
        expectedUpdatedAt: updatedAt,
      }),
    ).toBe(200)
    expect(profiles.update).toHaveBeenCalledWith(actor, {
      fullName: 'Synthetic User',
      contactNumber: '',
      expectedUpdatedAt: updatedAt,
    })
  })

  it('forwards a date-only expectedUpdatedAt, which the strict ISO 8601 rule accepts', async () => {
    expect(
      await patch({
        fullName: 'Synthetic User',
        contactNumber: '',
        expectedUpdatedAt: '2026-10-01',
      }),
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
git grep -nE "UpdateOwnProfileDto|profile\.dto" -- apps packages || echo "none left"
```


Expected:

```text
rm 'apps/api/src/modules/profile/own-profile-parity.test.ts'
rm 'apps/api/src/modules/profile/profile.dto.ts'
none left
```

The `git rm` prints two `rm` lines and the grep finds nothing (`none left`).

- [ ] **Step 6b: Prove the HTTP test by mutation**

A route that lost its pipe must fail the HTTP test:

Create `.tmp/s8a/mut-profile-http.json`:

```json
[
 ["profile route without the zod pipe", "apps/api/src/modules/profile/profile.controller.ts", "@Body(new ZodPipe(updateOwnProfileRequest)) body", "@Body() body"]
]
```

```bash
node .tmp/s8a/mutate.mjs .tmp/s8a/mut-profile-http.json pnpm --filter @pathways/api exec vitest run src/modules/profile/profile.controller.validation.test.ts
```


Expected:

```text
unmutated: pass
profile route without the zod pipe: killed
mutations 1, survived 0
```

The mutation is killed.

- [ ] **Step 7: Run the tests and commit**

```bash
git add -N apps/api/src/modules/profile
pnpm --filter @pathways/api exec vitest run src/modules/profile 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL "
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/api/*.ts')
pnpm lint 2>&1 | tail -2
pnpm typecheck > .tmp/s8a/out/typecheck.txt 2>&1 && echo "typecheck clean"
(cd apps/api && npx tsc --noEmit --noUnusedLocals -p . 2>&1 | grep "error TS" | cut -c1-110)
pnpm --filter @pathways/api test 2>&1 | grep -aE "Test Files|Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api/src/modules/profile packages/shared/src/contracts/profile
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(api): validate the own profile body with the shared zod contract

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -1
```


Expected:

```text
 Test Files  2 passed (2)
      Tests  17 passed (17)
Checked 4 files in <ms>. Fixed 2 files.
$ pnpm exec biome check .
Checked 1571 files in <ms>. No fixes applied.
typecheck clean
prisma/hosted-realistic-seed.ts(504,9): error TS6133: 'storage' is declared but its value is never read.
src/modules/participants/participants.service.ts(30,55): error TS6138: Property 'prisma' is declared but its v
 Test Files  159 passed | 10 skipped (169)
      Tests  2626 passed | 21 skipped (2647)
<sha> refactor(api): validate the own profile body with the shared zod contract
```

The existing `profile.service.test.ts` cases pass unchanged through the zod path, `--noUnusedLocals` lists only the two baseline lines of the api, and api = Task 1 count + 4.

---

### Task 3: Sign-in and step-up PIN contracts

**Files:**
- Create: `packages/shared/src/contracts/auth/auth-requests.ts`, `apps/api/src/modules/auth/auth.helpers.ts`
- Test: `packages/shared/src/contracts/auth/auth-requests.test.ts`, `apps/api/src/modules/auth/auth.controller.validation.test.ts`
- Create then delete: `apps/api/src/modules/auth/auth-requests-parity.test.ts`
- Modify: `packages/shared/src/index.ts`, `apps/api/src/modules/auth/auth.controller.ts`, `apps/api/src/modules/auth/signin-lockout.test.ts`, `apps/api/src/modules/auth/beneficiary-step-up-pin.test.ts`, `apps/api/src/modules/auth/guards/supabase-auth.guard.test.ts`
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

  it.each([
    ['an empty address', { email: '' }, true],
    ['254 characters', { email: 'e'.repeat(254) }, true],
    ['255 characters', { email: 'e'.repeat(255) }, false],
    ['a number', { email: 5 }, false],
    ['a 1024 character password', { password: 'p'.repeat(1024) }, true],
    ['a number as the password', { password: 5 }, false],
  ])('checks the sign-in field: %s', (_label, change, accepted) => {
    const body = { email: 'user@example.org', password: 'x', ...change }
    expect(signInRequest.safeParse(body).success).toBe(accepted)
  })

  it.each([
    ['an empty PIN', '', true],
    ['32 characters', '4'.repeat(32), true],
    ['33 characters', '4'.repeat(33), false],
  ])('checks the PIN length on all three bodies: %s', (_label, pin, accepted) => {
    expect(verifyStepUpPinRequest.safeParse({ pin }).success).toBe(accepted)
    expect(changeStepUpPinRequest.safeParse({ newPin: pin }).success).toBe(accepted)
    expect(changeStepUpPinRequest.safeParse({ newPin: '529317', currentPin: pin }).success).toBe(
      accepted,
    )
  })

  it.each([
    [verifyStepUpPinRequest, { pin: '482915', sessionId: 'x' }],
    [verifyStepUpPinRequest, { pin: null }],
    [changeStepUpPinRequest, { newPin: '529317', method: 'TOTP' }],
    [changeStepUpPinRequest, { newPin: '529317', currentPin: 482915 }],
    [changeStepUpPinRequest, { currentPin: '482915' }],
  ])('rejects the PIN body %#', (schema, body) => {
    expect(schema.safeParse(body).success).toBe(false)
  })
})
```

The first tests are the contract the DTOs expressed; the rest are boundary tables that pin every rule the parity test of Step 3 compares (the sign-in email at length 0 and 254, the password at 1 and 1024 counted in characters, the PIN at 0 and 32, the current PIN absent, null or text, each unknown key), because the parity test is deleted with the DTOs in Step 6.

```bash
pnpm --filter @pathways/shared exec vitest run src/contracts/auth/auth-requests.test.ts 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:" | sed "s#$PWD/##g"
```


Expected:

```text
 FAIL  src/contracts/auth/auth-requests.test.ts [ src/contracts/auth/auth-requests.test.ts ]
Error: Cannot find module './auth-requests' imported from 'packages/shared/src/contracts/auth/auth-requests.test.ts'
Caused by: Error: Failed to load url ./auth-requests (resolved id: ./auth-requests) in packages/shared/src/contracts/auth/auth-requests.test.ts. Does the file exist?
 Test Files  1 failed (1)
```

The run fails because `./auth-requests` does not exist yet.

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

Append the export of the contracts to `packages/shared/src/index.ts`:

```bash
printf '%s\n' "export * from './contracts/auth/auth-requests'" >> packages/shared/src/index.ts
tail -2 packages/shared/src/index.ts
```


Expected:

```text
export * from './contracts/profile/own-profile'
export * from './contracts/auth/auth-requests'
```

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
pnpm --filter @pathways/shared exec vitest run src/contracts/auth/auth-requests.test.ts 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:"
pnpm --filter @pathways/shared build > /dev/null 2>&1 && echo "shared built"
```


Expected:

```text
 Test Files  1 passed (1)
      Tests  21 passed (21)
shared built
```

The 21 tests pass and the build succeeds.

- [ ] **Step 2b: Prove the contract tests by mutation**

Each mutation changes one rule of the contracts; every one must make a test fail:

Create `.tmp/s8a/mut-auth.json`:

```json
[
 [
  "email maximum 255",
  "packages/shared/src/contracts/auth/auth-requests.ts",
  "lengthString(0, 254)",
  "lengthString(0, 255)"
 ],
 [
  "email maximum 253",
  "packages/shared/src/contracts/auth/auth-requests.ts",
  "lengthString(0, 254)",
  "lengthString(0, 253)"
 ],
 [
  "email minimum 1",
  "packages/shared/src/contracts/auth/auth-requests.ts",
  "lengthString(0, 254)",
  "lengthString(1, 254)"
 ],
 [
  "password minimum 0",
  "packages/shared/src/contracts/auth/auth-requests.ts",
  "lengthString(1, 1024)",
  "lengthString(0, 1024)"
 ],
 [
  "password minimum 2",
  "packages/shared/src/contracts/auth/auth-requests.ts",
  "lengthString(1, 1024)",
  "lengthString(2, 1024)"
 ],
 [
  "password maximum 1025",
  "packages/shared/src/contracts/auth/auth-requests.ts",
  "lengthString(1, 1024)",
  "lengthString(1, 1025)"
 ],
 [
  "password maximum 1023",
  "packages/shared/src/contracts/auth/auth-requests.ts",
  "lengthString(1, 1024)",
  "lengthString(1, 1023)"
 ],
 [
  "sign-in accepts unknown keys",
  "packages/shared/src/contracts/auth/auth-requests.ts",
  "  .object({ email: lengthString(0, 254), password: lengthString(1, 1024) })\n  .strict()",
  "  .object({ email: lengthString(0, 254), password: lengthString(1, 1024) })"
 ],
 [
  "pin maximum 33",
  "packages/shared/src/contracts/auth/auth-requests.ts",
  "lengthString(0, 32)",
  "lengthString(0, 33)"
 ],
 [
  "pin maximum 31",
  "packages/shared/src/contracts/auth/auth-requests.ts",
  "lengthString(0, 32)",
  "lengthString(0, 31)"
 ],
 [
  "pin minimum 1",
  "packages/shared/src/contracts/auth/auth-requests.ts",
  "lengthString(0, 32)",
  "lengthString(1, 32)"
 ],
 [
  "verify accepts unknown keys",
  "packages/shared/src/contracts/auth/auth-requests.ts",
  "z.object({ pin: pinText }).strict()",
  "z.object({ pin: pinText })"
 ],
 [
  "change accepts unknown keys",
  "packages/shared/src/contracts/auth/auth-requests.ts",
  "  .object({ newPin: pinText, currentPin: pinText.nullish() })\n  .strict()",
  "  .object({ newPin: pinText, currentPin: pinText.nullish() })"
 ],
 [
  "current pin required",
  "packages/shared/src/contracts/auth/auth-requests.ts",
  "currentPin: pinText.nullish()",
  "currentPin: pinText"
 ],
 [
  "current pin null refused",
  "packages/shared/src/contracts/auth/auth-requests.ts",
  "currentPin: pinText.nullish()",
  "currentPin: pinText.optional()"
 ],
 [
  "current pin absent refused",
  "packages/shared/src/contracts/auth/auth-requests.ts",
  "currentPin: pinText.nullish()",
  "currentPin: pinText.nullable()"
 ],
 [
  "current pin unchecked",
  "packages/shared/src/contracts/auth/auth-requests.ts",
  "currentPin: pinText.nullish()",
  "currentPin: z.any()"
 ],
 [
  "new pin unchecked",
  "packages/shared/src/contracts/auth/auth-requests.ts",
  "newPin: pinText,",
  "newPin: z.string(),"
 ]
]
```

```bash
node .tmp/s8a/mutate.mjs .tmp/s8a/mut-auth.json pnpm --filter @pathways/shared exec vitest run src/contracts/auth/auth-requests.test.ts
```


Expected:

```text
unmutated: pass
email maximum 255: killed
email maximum 253: killed
email minimum 1: killed
password minimum 0: killed
password minimum 2: killed
password maximum 1025: killed
password maximum 1023: killed
sign-in accepts unknown keys: killed
pin maximum 33: killed
pin maximum 31: killed
pin minimum 1: killed
verify accepts unknown keys: killed
change accepts unknown keys: killed
current pin required: killed
current pin null refused: killed
current pin absent refused: killed
current pin unchecked: killed
new pin unchecked: killed
mutations 18, survived 0
```

All 18 mutations are applied and killed.

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

```bash
pnpm --filter @pathways/api exec vitest run src/modules/auth/auth-requests-parity.test.ts 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:"
```


Expected:

```text
 Test Files  1 passed (1)
      Tests  27 passed (27)
```

27 tests pass (sign-in 12 with 4 accepted, verify 8 with 3 accepted, change 7 with 3 accepted). Any failure: stop and report the row.

- [ ] **Step 4: Commit the contracts and the evidence**

```bash
git add -N packages/shared/src apps/api/src/modules/auth
pnpm exec biome check --write packages/shared/src/contracts packages/shared/src/index.ts apps/api/src/modules/auth/auth.helpers.ts apps/api/src/modules/auth/auth-requests-parity.test.ts
pnpm lint 2>&1 | tail -2
pnpm typecheck > .tmp/s8a/out/typecheck.txt 2>&1 && echo "typecheck clean"
pnpm --filter @pathways/shared test 2>&1 | grep -aE "Test Files|Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add packages/shared/src/contracts packages/shared/src/index.ts apps/api/src/modules/auth/auth.helpers.ts apps/api/src/modules/auth/auth-requests-parity.test.ts
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "feat(shared): add the sign-in and step-up PIN contracts with their DTO parity test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -1
```


Expected:

```text
Checked 77 files in <ms>. No fixes applied.
$ pnpm exec biome check .
Checked 1575 files in <ms>. No fixes applied.
typecheck clean
 Test Files  49 passed (49)
      Tests  801 passed (801)
<sha> feat(shared): add the sign-in and step-up PIN contracts with their DTO parity test
```

Shared = `B_shared + 19 + 30 + 21`.

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

  it.each([
    '{"newPin":"529317","method":"TOTP"}',
    '{"newPin":"529317","currentPin":482915}',
    `{"newPin":"${'4'.repeat(33)}"}`,
  ])('the PIN change route answers 400 for %s without calling the service', async (body) => {
    const result = await post('/step-up/pin/change', body)
    expect(result.status).toBe(400)
    expect(result.text).not.toContain('482915')
    expect(pins.change).not.toHaveBeenCalled()
  })

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

`apps/api/src/modules/auth/guards/supabase-auth.guard.test.ts`, in the test `accepts the PIN only in the JSON body and rejects extra or malformed fields`, replace the last block

```ts
      // A body session value never replaces the verified session claim.
      queryRaw.mockResolvedValue([{ outcome: 'INCORRECT', expiresAt: null }])
      const forged = '99000000-0000-4000-8000-000000000099'
      await post('/auth/step-up/pin', { pin: '736150', sessionId: forged })
      expect(pinCalls('step_up_pin_verify')[0]?.slice(1)).toEqual(['736150', sessionId])
```

with

```ts
      // A body session value is refused before the service, so only the verified session claim is used.
      const forged = '99000000-0000-4000-8000-000000000099'
      expect((await post('/auth/step-up/pin', { pin: '736150', sessionId: forged })).status).toBe(400)
      expect(queryRaw).not.toHaveBeenCalled()
      queryRaw.mockResolvedValue([{ outcome: 'INCORRECT', expiresAt: null }])
      await post('/auth/step-up/pin', { pin: '736150' })
      expect(pinCalls('step_up_pin_verify')[0]?.slice(1)).toEqual(['736150', sessionId])
```

The old DTO already refused the extra key in production (`forbidNonWhitelisted`); Vitest emits no decorator metadata, so only the zod pipe makes the test harness refuse it.

`apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts` now holds only the auth controller case (Task 1 removed the users case), which compiles the controller to prove the DTO metadata survived; it goes below with the DTOs. Remove the auth DTOs and confirm no class-validator DTO is left (ruling 14):

```bash
git rm apps/api/src/modules/auth/signin-lockout.dto.ts apps/api/src/modules/auth/beneficiary-step-up-pin.dto.ts apps/api/src/modules/auth/auth-requests-parity.test.ts
git grep -nE "SignInDto|VerifyStepUpPinDto|ChangeStepUpPinDto|signin-lockout\.dto|beneficiary-step-up-pin\.dto" -- apps packages ':!apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts'
git ls-files 'apps/api/src/*.dto.ts'
git grep -l "from 'class-validator'" -- apps/api/src
grep -o "file: 'src/modules/[a-z-]*/[a-z-]*\.controller\.ts'" apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts
```


Expected:

```text
rm 'apps/api/src/modules/auth/auth-requests-parity.test.ts'
rm 'apps/api/src/modules/auth/beneficiary-step-up-pin.dto.ts'
rm 'apps/api/src/modules/auth/signin-lockout.dto.ts'
apps/api/src/modules/public/public.dto.ts
apps/api/src/common/validation/field-schemas-parity.test.ts
apps/api/src/modules/auth/auth.helpers.ts
file: 'src/modules/auth/auth.controller.ts'
```

The `git rm` prints three `rm` lines; the first grep finds nothing; `git ls-files` lists only `modules/public/public.dto.ts` (Task 4 moves it); the `class-validator` importers are the field schema parity test (deleted below) and `auth.helpers.ts` (`isEmail`); the last grep lists only `auth.controller.ts`, so the metadata test now holds nothing but the case that goes with the auth DTOs.

```bash
git rm apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts apps/api/src/common/validation/field-schemas-parity.test.ts
git grep -nE "controller-dto-runtime-metadata|field-schemas-parity" -- apps packages scripts docs ':!docs/activity-log.md' ':!docs/superpowers/*' ':!docs/cr-*' ':!docs/handoff' || echo "none left"
```


Expected:

```text
rm 'apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts'
rm 'apps/api/src/common/validation/field-schemas-parity.test.ts'
none left
```

The `git rm` prints two `rm` lines and the grep finds nothing (`none left`; change records are history; Task 9 records the removal in the modularization CR).

- [ ] **Step 6b: Prove the HTTP test by mutation**

A route that lost its pipe, parses the wrong contract or drops the email rule must fail the HTTP test; Biome wraps the three long signatures first, because the mutation strings name the wrapped lines:

Create `.tmp/s8a/mut-auth-http.json`:

```json
[
 [
  "sign-in route without the zod pipe",
  "apps/api/src/modules/auth/auth.controller.ts",
  "@Body(new ZodPipe(signInBody)) body",
  "@Body() body"
 ],
 [
  "sign-in route without the email rule",
  "apps/api/src/modules/auth/auth.controller.ts",
  "new ZodPipe(signInBody)",
  "new ZodPipe(signInRequest)"
 ],
 [
  "PIN verify route without the zod pipe",
  "apps/api/src/modules/auth/auth.controller.ts",
  "    @Body(new ZodPipe(verifyStepUpPinRequest)) body: VerifyStepUpPinRequest,\n  ) {\n    return this.pins.verify",
  "    @Body() body: VerifyStepUpPinRequest,\n  ) {\n    return this.pins.verify"
 ],
 [
  "PIN setup route without the zod pipe",
  "apps/api/src/modules/auth/auth.controller.ts",
  "    @Body(new ZodPipe(verifyStepUpPinRequest)) body: VerifyStepUpPinRequest,\n  ) {\n    return this.pins.setup",
  "    @Body() body: VerifyStepUpPinRequest,\n  ) {\n    return this.pins.setup"
 ],
 [
  "PIN change route without the zod pipe",
  "apps/api/src/modules/auth/auth.controller.ts",
  "@Body(new ZodPipe(changeStepUpPinRequest)) body",
  "@Body() body"
 ],
 [
  "PIN change route parses the verify contract",
  "apps/api/src/modules/auth/auth.controller.ts",
  "new ZodPipe(changeStepUpPinRequest)",
  "new ZodPipe(verifyStepUpPinRequest)"
 ]
]
```

```bash
pnpm exec biome check --write apps/api/src/modules/auth/auth.controller.ts
node .tmp/s8a/mutate.mjs .tmp/s8a/mut-auth-http.json pnpm --filter @pathways/api exec vitest run src/modules/auth/auth.controller.validation.test.ts
```


Expected:

```text
Checked 1 file in <ms>. Fixed 1 file.
unmutated: pass
sign-in route without the zod pipe: killed
sign-in route without the email rule: killed
PIN verify route without the zod pipe: killed
PIN setup route without the zod pipe: killed
PIN change route without the zod pipe: killed
PIN change route parses the verify contract: killed
mutations 6, survived 0
```

All 6 mutations are killed.

- [ ] **Step 7: Run the tests and commit**

```bash
git add -N apps/api/src
pnpm --filter @pathways/api exec vitest run src/modules/auth src/common 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL "
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/api/*.ts')
pnpm lint 2>&1 | tail -2
pnpm typecheck > .tmp/s8a/out/typecheck.txt 2>&1 && echo "typecheck clean"
(cd apps/api && npx tsc --noEmit --noUnusedLocals -p . 2>&1 | grep "error TS" | cut -c1-110)
pnpm --filter @pathways/api test 2>&1 | grep -aE "Test Files|Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api/src
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(api): validate the sign-in and step-up PIN bodies with the shared zod contracts

The last class-validator DTOs are gone, so the controller metadata test and the field schema parity test go with them.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -1
```


Expected:

```text
 Test Files  24 passed | 3 skipped (27)
      Tests  692 passed | 6 skipped (698)
Checked 5 files in <ms>. Fixed 3 files.
$ pnpm exec biome check .
Checked 1571 files in <ms>. No fixes applied.
typecheck clean
prisma/hosted-realistic-seed.ts(504,9): error TS6133: 'storage' is declared but its value is never read.
src/modules/participants/participants.service.ts(30,55): error TS6138: Property 'prisma' is declared but its v
 Test Files  158 passed | 10 skipped (168)
      Tests  2578 passed | 21 skipped (2599)
<sha> refactor(api): validate the sign-in and step-up PIN bodies with the shared zod contracts
```

The existing no-echo cases in `signin-lockout.test.ts` and `beneficiary-step-up-pin.test.ts` pass through the zod path, `--noUnusedLocals` lists only the two baseline lines of the api, and the api suite reads `Task 2 count - 48` (2578 passed): the 27 parity rows go with the DTOs, and so do the metadata test and the field schema parity test, while the HTTP file is new.

---

### Task 4: Public contracts and one controller per file

**Files:**
- Create: `packages/shared/src/contracts/public/public-projects.ts`
- Test: `packages/shared/src/contracts/public/public-projects.test.ts`
- Modify: `packages/shared/src/index.ts`, `apps/api/src/modules/public/public.service.ts`, `apps/api/src/modules/public/public.module.ts`, `apps/api/src/modules/public/public.service.test.ts`
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
    expect(publicationTransitionRequest.parse(body)).toEqual({
      ...body,
      summary: 'Approved summary',
    })
  })

  it.each([
    { clientRequestId: 'not-a-uuid', expectedRevision: 0 },
    { clientRequestId: '20000000-0000-4000-8000-000000000002', expectedRevision: -1 },
    { clientRequestId: '20000000-0000-4000-8000-000000000002', expectedRevision: 2147483647 },
  ])('rejects the publication body %j', (body) => {
    expect(publicationTransitionRequest.safeParse(body).success).toBe(false)
  })

  it.each([
    ['a text id', { id: 'not-a-uuid' }, false],
    ['an empty title', { title: '' }, false],
    ['a 300 character title', { title: 't'.repeat(300) }, true],
    ['a 301 character title', { title: 't'.repeat(301) }, false],
    ['a 100 character code', { code: 'c'.repeat(100) }, true],
    ['a 101 character code', { code: 'c'.repeat(101) }, false],
    ['an empty summary', { approvedSummary: '' }, false],
    ['a 4000 character summary', { approvedSummary: 's'.repeat(4000) }, true],
    ['a 4001 character summary', { approvedSummary: 's'.repeat(4001) }, false],
    ['a 500 character area', { area: 'a'.repeat(500) }, true],
    ['a null area', { area: null }, true],
    ['a missing area', { area: undefined }, false],
    ['a 300 character sector', { sector: 's'.repeat(300) }, true],
    ['a 301 character sector', { sector: 's'.repeat(301) }, false],
    ['a null start date', { startDate: null }, true],
    ['a number as the start date', { startDate: 5 }, false],
    ['an end date', { endDate: '2026-12-31' }, true],
    ['a time with an offset', { publishedAt: '2026-09-27T08:00:00+08:00' }, true],
    ['a time without a zone', { publishedAt: '2026-09-27T00:00:00' }, false],
  ])('checks the snapshot field: %s', (_label, change, accepted) => {
    expect(publicProjectResponse.safeParse({ ...snapshot, ...change }).success).toBe(accepted)
  })

  it.each([
    ['revision 0', { expectedRevision: 0 }, true],
    ['the last revision', { expectedRevision: 2147483646 }, true],
    ['a revision past it', { expectedRevision: 2147483647 }, false],
    ['a fractional revision', { expectedRevision: 1.5 }, false],
    ['an absent summary', {}, true],
    ['a 4000 character summary', { summary: 's'.repeat(4000) }, true],
    ['a 4001 character summary', { summary: 's'.repeat(4001) }, false],
    ['an empty summary', { summary: '' }, false],
    ['a blank summary', { summary: '   ' }, false],
    ['a null summary', { summary: null }, false],
    ['an unknown key', { reviewer: 'x' }, false],
  ])('checks the publication body: %s', (_label, change, accepted) => {
    const body = { clientRequestId: '20000000-0000-4000-8000-000000000002', expectedRevision: 0 }
    expect(publicationTransitionRequest.safeParse({ ...body, ...change }).success).toBe(accepted)
  })
})
```

The first 8 tests are the schemas as `public.dto.ts` held them; the rest are boundary tables for each field of the public project (the id shape, the title, status, area and sector lengths, the nullable fields, the revision and each unknown key) and of the publication body, because the schemas now sit in the shared package and the public API output goes through `publicProjectResponse`.

```bash
pnpm --filter @pathways/shared exec vitest run src/contracts/public/public-projects.test.ts 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:" | sed "s#$PWD/##g"
```


Expected:

```text
 FAIL  src/contracts/public/public-projects.test.ts [ src/contracts/public/public-projects.test.ts ]
Error: Cannot find module './public-projects' imported from 'packages/shared/src/contracts/public/public-projects.test.ts'
Caused by: Error: Failed to load url ./public-projects (resolved id: ./public-projects) in packages/shared/src/contracts/public/public-projects.test.ts. Does the file exist?
 Test Files  1 failed (1)
```

The run fails because `./public-projects` does not exist yet.

- [ ] **Step 2: Move the schemas to the contract**

The two schemas are `public.dto.ts` verbatim under CR 3.6 names.

Create `packages/shared/src/contracts/public/public-projects.ts`:

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

Append the export of the contract to `packages/shared/src/index.ts`:

```bash
printf '%s\n' "export * from './contracts/public/public-projects'" >> packages/shared/src/index.ts
tail -2 packages/shared/src/index.ts
```


Expected:

```text
export * from './contracts/auth/auth-requests'
export * from './contracts/public/public-projects'
```

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
pnpm --filter @pathways/shared exec vitest run src/contracts/public/public-projects.test.ts 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:"
pnpm --filter @pathways/shared build > /dev/null 2>&1 && echo "shared built"
pnpm --filter @pathways/api exec vitest run src/modules/public 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:"
```


Expected:

```text
rm 'apps/api/src/modules/public/public.dto.ts'
 Test Files  1 passed (1)
      Tests  38 passed (38)
shared built
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

The `git rm` prints one `rm` line, the grep prints nothing, the 38 contract tests pass and the public service tests pass unchanged.

- [ ] **Step 2b: Prove the contract tests by mutation**

Each mutation changes one rule of the two schemas; every one must make a test fail:

Create `.tmp/s8a/mut-public.json`:

```json
[
 [
  "id not checked",
  "packages/shared/src/contracts/public/public-projects.ts",
  "id: z.string().uuid(),\n    title",
  "id: z.string(),\n    title"
 ],
 [
  "title minimum 0",
  "packages/shared/src/contracts/public/public-projects.ts",
  "title: z.string().min(1).max(300)",
  "title: z.string().max(300)"
 ],
 [
  "title maximum 301",
  "packages/shared/src/contracts/public/public-projects.ts",
  "title: z.string().min(1).max(300)",
  "title: z.string().min(1).max(301)"
 ],
 [
  "title maximum 299",
  "packages/shared/src/contracts/public/public-projects.ts",
  "title: z.string().min(1).max(300)",
  "title: z.string().min(1).max(299)"
 ],
 [
  "code maximum 101",
  "packages/shared/src/contracts/public/public-projects.ts",
  "code: z.string().max(100)",
  "code: z.string().max(101)"
 ],
 [
  "code maximum 99",
  "packages/shared/src/contracts/public/public-projects.ts",
  "code: z.string().max(100)",
  "code: z.string().max(99)"
 ],
 [
  "summary minimum 0 on the snapshot",
  "packages/shared/src/contracts/public/public-projects.ts",
  "approvedSummary: z.string().min(1).max(4000)",
  "approvedSummary: z.string().max(4000)"
 ],
 [
  "summary maximum 4001",
  "packages/shared/src/contracts/public/public-projects.ts",
  "approvedSummary: z.string().min(1).max(4000)",
  "approvedSummary: z.string().min(1).max(4001)"
 ],
 [
  "summary maximum 3999",
  "packages/shared/src/contracts/public/public-projects.ts",
  "approvedSummary: z.string().min(1).max(4000)",
  "approvedSummary: z.string().min(1).max(3999)"
 ],
 [
  "area maximum 501",
  "packages/shared/src/contracts/public/public-projects.ts",
  "area: z.string().max(500).nullable()",
  "area: z.string().max(501).nullable()"
 ],
 [
  "area maximum 499",
  "packages/shared/src/contracts/public/public-projects.ts",
  "area: z.string().max(500).nullable()",
  "area: z.string().max(499).nullable()"
 ],
 [
  "area not nullable",
  "packages/shared/src/contracts/public/public-projects.ts",
  "area: z.string().max(500).nullable()",
  "area: z.string().max(500)"
 ],
 [
  "sector maximum 301",
  "packages/shared/src/contracts/public/public-projects.ts",
  "sector: z.string().max(300).nullable()",
  "sector: z.string().max(301).nullable()"
 ],
 [
  "sector maximum 299",
  "packages/shared/src/contracts/public/public-projects.ts",
  "sector: z.string().max(300).nullable()",
  "sector: z.string().max(299).nullable()"
 ],
 [
  "sector not nullable",
  "packages/shared/src/contracts/public/public-projects.ts",
  "sector: z.string().max(300).nullable()",
  "sector: z.string().max(300)"
 ],
 [
  "start date not nullable",
  "packages/shared/src/contracts/public/public-projects.ts",
  "startDate: z.string().nullable()",
  "startDate: z.string()"
 ],
 [
  "end date not nullable",
  "packages/shared/src/contracts/public/public-projects.ts",
  "endDate: z.string().nullable()",
  "endDate: z.string()"
 ],
 [
  "start date not text",
  "packages/shared/src/contracts/public/public-projects.ts",
  "startDate: z.string().nullable()",
  "startDate: z.any()"
 ],
 [
  "published time not checked",
  "packages/shared/src/contracts/public/public-projects.ts",
  "publishedAt: z.string().datetime({ offset: true })",
  "publishedAt: z.string()"
 ],
 [
  "published time without offsets",
  "packages/shared/src/contracts/public/public-projects.ts",
  "publishedAt: z.string().datetime({ offset: true })",
  "publishedAt: z.string().datetime()"
 ],
 [
  "snapshot accepts unknown keys",
  "packages/shared/src/contracts/public/public-projects.ts",
  "  })\n  .strict()\nexport type PublicProjectResponse",
  "  })\nexport type PublicProjectResponse"
 ],
 [
  "request id not checked",
  "packages/shared/src/contracts/public/public-projects.ts",
  "clientRequestId: z.string().uuid(),",
  "clientRequestId: z.string(),"
 ],
 [
  "revision minimum -1",
  "packages/shared/src/contracts/public/public-projects.ts",
  "z.number().int().min(0).max(2147483646)",
  "z.number().int().min(-1).max(2147483646)"
 ],
 [
  "revision minimum 1",
  "packages/shared/src/contracts/public/public-projects.ts",
  "z.number().int().min(0).max(2147483646)",
  "z.number().int().min(1).max(2147483646)"
 ],
 [
  "revision maximum 2147483647",
  "packages/shared/src/contracts/public/public-projects.ts",
  "z.number().int().min(0).max(2147483646)",
  "z.number().int().min(0).max(2147483647)"
 ],
 [
  "revision maximum 2147483645",
  "packages/shared/src/contracts/public/public-projects.ts",
  "z.number().int().min(0).max(2147483646)",
  "z.number().int().min(0).max(2147483645)"
 ],
 [
  "revision not an integer",
  "packages/shared/src/contracts/public/public-projects.ts",
  "z.number().int().min(0)",
  "z.number().min(0)"
 ],
 [
  "summary not trimmed",
  "packages/shared/src/contracts/public/public-projects.ts",
  "summary: z.string().trim().min(1).max(4000).optional(),",
  "summary: z.string().min(1).max(4000).optional(),"
 ],
 [
  "summary minimum 0 on the request",
  "packages/shared/src/contracts/public/public-projects.ts",
  "summary: z.string().trim().min(1).max(4000).optional(),",
  "summary: z.string().trim().max(4000).optional(),"
 ],
 [
  "summary request maximum 4001",
  "packages/shared/src/contracts/public/public-projects.ts",
  "summary: z.string().trim().min(1).max(4000).optional(),",
  "summary: z.string().trim().min(1).max(4001).optional(),"
 ],
 [
  "summary request maximum 3999",
  "packages/shared/src/contracts/public/public-projects.ts",
  "summary: z.string().trim().min(1).max(4000).optional(),",
  "summary: z.string().trim().min(1).max(3999).optional(),"
 ],
 [
  "summary required",
  "packages/shared/src/contracts/public/public-projects.ts",
  "summary: z.string().trim().min(1).max(4000).optional(),",
  "summary: z.string().trim().min(1).max(4000),"
 ],
 [
  "summary null accepted",
  "packages/shared/src/contracts/public/public-projects.ts",
  "summary: z.string().trim().min(1).max(4000).optional(),",
  "summary: z.string().trim().min(1).max(4000).nullish(),"
 ],
 [
  "request accepts unknown keys",
  "packages/shared/src/contracts/public/public-projects.ts",
  "  })\n  .strict()\nexport type PublicationTransitionRequest",
  "  })\nexport type PublicationTransitionRequest"
 ]
]
```

```bash
node .tmp/s8a/mutate.mjs .tmp/s8a/mut-public.json pnpm --filter @pathways/shared exec vitest run src/contracts/public/public-projects.test.ts
```


Expected:

```text
unmutated: pass
id not checked: killed
title minimum 0: killed
title maximum 301: killed
title maximum 299: killed
code maximum 101: killed
code maximum 99: killed
summary minimum 0 on the snapshot: killed
summary maximum 4001: killed
summary maximum 3999: killed
area maximum 501: killed
area maximum 499: killed
area not nullable: killed
sector maximum 301: killed
sector maximum 299: killed
sector not nullable: killed
start date not nullable: killed
end date not nullable: killed
start date not text: killed
published time not checked: killed
published time without offsets: killed
snapshot accepts unknown keys: killed
request id not checked: killed
revision minimum -1: killed
revision minimum 1: killed
revision maximum 2147483647: killed
revision maximum 2147483645: killed
revision not an integer: killed
summary not trimmed: killed
summary minimum 0 on the request: killed
summary request maximum 4001: killed
summary request maximum 3999: killed
summary required: killed
summary null accepted: killed
request accepts unknown keys: killed
mutations 34, survived 0
```

All 34 mutations are applied and killed.

- [ ] **Step 3: Commit**

```bash
git add -N packages/shared/src
pnpm exec biome check --write packages/shared/src/contracts packages/shared/src/index.ts apps/api/src/modules/public/public.service.ts
pnpm lint 2>&1 | tail -2
pnpm typecheck > .tmp/s8a/out/typecheck.txt 2>&1 && echo "typecheck clean"
git checkout -- apps/web/next-env.d.ts
git add -A packages/shared/src apps/api/src/modules/public
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(shared): move the public project and publication schemas into packages/shared

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -1
```


Expected:

```text
Checked 78 files in <ms>. No fixes applied.
$ pnpm exec biome check .
Checked 1572 files in <ms>. No fixes applied.
typecheck clean
<sha> refactor(shared): move the public project and publication schemas into packages/shared
```

- [ ] **Step 4: Create the line check script**

The script is the F4a script with `@` added to the declaration start, so decorator lines are compared.

Create `.tmp/s8a/same-lines.mjs`:

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

In `apps/api/src/modules/public/public.service.test.ts`, replace `import { PublicProjectsController } from './public.controller'` with `import { PublicProjectsController } from './public-projects.controller'`.

```bash
node .tmp/s8a/same-lines.mjs .tmp/s8a/public.controller.orig.ts apps/api/src/modules/public/public-projects.controller.ts apps/api/src/modules/public/publication.controller.ts
git grep -n "public\.controller'" -- apps || echo "none left"
```


Expected:

```text
same lines: 70
none left
```

The script prints `same lines: 70` and the grep finds nothing (`none left`).

- [ ] **Step 5b: Pin the routes of both controllers**

The line check proves the move only once. A route test keeps the method, path, access rule and Cache-Control header of every route, the 403 of every publication route without a profile, the argument order of the service calls and the default page of the public list.

Create `apps/api/src/modules/public/public.routes.test.ts`:

```ts
import 'reflect-metadata'

import { ForbiddenException, RequestMethod } from '@nestjs/common'
import { HEADERS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { describe, expect, it, vi } from 'vitest'

import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator'
import { PublicModule } from './public.module'

type Handler = (...args: unknown[]) => unknown
type ControllerClass = { new (service: unknown): Record<string, Handler>; prototype: object }

const controllers = (): ControllerClass[] => Reflect.getMetadata('controllers', PublicModule)
const metadata = (controller: ControllerClass, name: string, key: string) =>
  Reflect.getMetadata(key, (controller.prototype as Record<string, Handler>)[name])
// The route handlers: methods with an HTTP method, which leaves out the private profile check.
const handlers = (controller: ControllerClass) =>
  Object.getOwnPropertyNames(controller.prototype).filter(
    (name) => name !== 'constructor' && metadata(controller, name, METHOD_METADATA) !== undefined,
  )

// One sorted line per route: method, full path, access rule and Cache-Control header.
function routeTable(): string[] {
  return controllers()
    .flatMap((controller) =>
      handlers(controller).map((name) => {
        const base = Reflect.getMetadata(PATH_METADATA, controller)
        const route = metadata(controller, name, PATH_METADATA)
        const method = RequestMethod[metadata(controller, name, METHOD_METADATA)]
        const headers: Array<{ name: string; value: string }> =
          metadata(controller, name, HEADERS_METADATA) ?? []
        const cache = headers.find((header) => header.name === 'Cache-Control')?.value
        const access = metadata(controller, name, IS_PUBLIC_KEY)
          ? 'public'
          : metadata(controller, name, PERMISSION_KEY)
        return `${method} /${route === '/' ? base : `${base}/${route}`} ${access} ${cache}`
      }),
    )
    .sort()
}

describe('public and publication routes', () => {
  it('registers every route with its method, path, access rule and cache header', () => {
    expect(routeTable()).toEqual([
      'GET /projects/:projectId/publication public.preview private, no-store',
      'GET /public/projects public no-store',
      'GET /public/projects/:projectId public no-store',
      'POST /projects/:projectId/publication/approve public.approve private, no-store',
      'POST /projects/:projectId/publication/publish public.publish private, no-store',
      'POST /projects/:projectId/publication/submit public.preview private, no-store',
      'POST /projects/:projectId/publication/withdraw public.publish private, no-store',
    ])
  })

  it('answers 403 on every publication route when the request carries no profile', () => {
    const publication = controllers().find(
      (controller) => controller.name === 'PublicationController',
    )
    const instance = new (publication as ControllerClass)({})
    for (const name of handlers(publication as ControllerClass)) {
      expect(() => instance[name]({ headers: {} }, 'p1', {})).toThrow(ForbiddenException)
      expect(() => instance[name]({ headers: {} }, 'p1', {})).toThrow(
        'Application profile required.',
      )
    }
  })

  it('passes the profile, the project, the operation and the body to the service', () => {
    const publication = controllers().find(
      (controller) => controller.name === 'PublicationController',
    )
    const service = { get: vi.fn(), transition: vi.fn() }
    const instance = new (publication as ControllerClass)(service)
    const user = { id: 'profile' }
    const body = { expectedRevision: 0 }
    const operations = {
      submit: 'SUBMIT',
      approve: 'APPROVE',
      publish: 'PUBLISH',
      withdraw: 'WITHDRAW',
    }
    instance.get({ headers: {}, user }, 'p1')
    expect(service.get).toHaveBeenCalledWith(user, 'p1')
    for (const [name, operation] of Object.entries(operations)) {
      instance[name]({ headers: {}, user }, 'p1', body)
      expect(service.transition).toHaveBeenLastCalledWith(user, 'p1', operation, body)
    }
  })

  it('reads the public list with its default page and one project by id', () => {
    const projects = controllers().find(
      (controller) => controller.name === 'PublicProjectsController',
    )
    const service = { published: vi.fn() }
    const instance = new (projects as ControllerClass)(service)
    instance.list(undefined, undefined)
    expect(service.published).toHaveBeenLastCalledWith(undefined, 0, 50)
    instance.list('20', '10')
    expect(service.published).toHaveBeenLastCalledWith(undefined, 20, 10)
    instance.get('p1')
    expect(service.published).toHaveBeenLastCalledWith('p1')
  })
})
```

```bash
pnpm --filter @pathways/api exec vitest run src/modules/public/public.routes.test.ts 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:"
```


Expected:

```text
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

The 4 tests pass. A route that lost its `@Public()`, its cache header or its permission must fail them:

Create `.tmp/s8a/mut-public-routes.json`:

```json
[
 [
  "list route not public",
  "apps/api/src/modules/public/public-projects.controller.ts",
  "  @Get()\n  @Public()",
  "  @Get()"
 ],
 [
  "project route not public",
  "apps/api/src/modules/public/public-projects.controller.ts",
  "  @Get(':projectId')\n  @Public()",
  "  @Get(':projectId')"
 ],
 [
  "list cache header dropped",
  "apps/api/src/modules/public/public-projects.controller.ts",
  "  @Get()\n  @Public()\n  @Header('Cache-Control', 'no-store')",
  "  @Get()\n  @Public()"
 ],
 [
  "project cache header changed",
  "apps/api/src/modules/public/public-projects.controller.ts",
  "  @Get(':projectId')\n  @Public()\n  @Header('Cache-Control', 'no-store')",
  "  @Get(':projectId')\n  @Public()\n  @Header('Cache-Control', 'public')"
 ],
 [
  "default offset changed",
  "apps/api/src/modules/public/public-projects.controller.ts",
  "offset = '0'",
  "offset = '1'"
 ],
 [
  "default limit changed",
  "apps/api/src/modules/public/public-projects.controller.ts",
  "limit = '50'",
  "limit = '51'"
 ],
 [
  "list passes the project id",
  "apps/api/src/modules/public/public-projects.controller.ts",
  "this.service.published(undefined, Number(offset), Number(limit))",
  "this.service.published('x', Number(offset), Number(limit))"
 ],
 [
  "controller path changed",
  "apps/api/src/modules/public/public-projects.controller.ts",
  "@Controller('public/projects')",
  "@Controller('public/project')"
 ],
 [
  "read permission changed",
  "apps/api/src/modules/public/publication.controller.ts",
  "@Get()\n  @RequirePermission('public.preview')",
  "@Get()\n  @RequirePermission('public.publish')"
 ],
 [
  "submit permission changed",
  "apps/api/src/modules/public/publication.controller.ts",
  "@Post('submit')\n  @RequirePermission('public.preview')",
  "@Post('submit')\n  @RequirePermission('public.approve')"
 ],
 [
  "approve permission changed",
  "apps/api/src/modules/public/publication.controller.ts",
  "@Post('approve')\n  @RequirePermission('public.approve')",
  "@Post('approve')\n  @RequirePermission('public.preview')"
 ],
 [
  "publish permission changed",
  "apps/api/src/modules/public/publication.controller.ts",
  "@Post('publish')\n  @RequirePermission('public.publish')",
  "@Post('publish')\n  @RequirePermission('public.approve')"
 ],
 [
  "withdraw permission changed",
  "apps/api/src/modules/public/publication.controller.ts",
  "@Post('withdraw')\n  @RequirePermission('public.publish')",
  "@Post('withdraw')\n  @RequirePermission('public.approve')"
 ],
 [
  "submit operation changed",
  "apps/api/src/modules/public/publication.controller.ts",
  "'SUBMIT'",
  "'APPROVE'"
 ],
 [
  "approve operation changed",
  "apps/api/src/modules/public/publication.controller.ts",
  "'APPROVE'",
  "'PUBLISH'"
 ],
 [
  "publish operation changed",
  "apps/api/src/modules/public/publication.controller.ts",
  "'PUBLISH'",
  "'WITHDRAW'"
 ],
 [
  "withdraw operation changed",
  "apps/api/src/modules/public/publication.controller.ts",
  "'WITHDRAW'",
  "'SUBMIT'"
 ],
 [
  "approve route renamed",
  "apps/api/src/modules/public/publication.controller.ts",
  "@Post('approve')",
  "@Post('approved')"
 ],
 [
  "transition cache header dropped",
  "apps/api/src/modules/public/publication.controller.ts",
  "@Post('withdraw')\n  @RequirePermission('public.publish')\n  @Header('Cache-Control', 'private, no-store')",
  "@Post('withdraw')\n  @RequirePermission('public.publish')"
 ],
 [
  "profile message changed",
  "apps/api/src/modules/public/publication.controller.ts",
  "'Application profile required.'",
  "'Verified profile required.'"
 ],
 [
  "profile check dropped",
  "apps/api/src/modules/public/publication.controller.ts",
  "if (!request.user) throw new ForbiddenException('Application profile required.')",
  "if (!request.user) return request.user"
 ],
 [
  "controller path changed",
  "apps/api/src/modules/public/publication.controller.ts",
  "@Controller('projects/:projectId/publication')",
  "@Controller('projects/:projectId/publications')"
 ]
]
```

```bash
node .tmp/s8a/mutate.mjs .tmp/s8a/mut-public-routes.json pnpm --filter @pathways/api exec vitest run src/modules/public/public.routes.test.ts
```


Expected:

```text
unmutated: pass
list route not public: killed
project route not public: killed
list cache header dropped: killed
project cache header changed: killed
default offset changed: killed
default limit changed: killed
list passes the project id: killed
controller path changed: killed
read permission changed: killed
submit permission changed: killed
approve permission changed: killed
publish permission changed: killed
withdraw permission changed: killed
submit operation changed: killed
approve operation changed: killed
publish operation changed: killed
withdraw operation changed: killed
approve route renamed: killed
transition cache header dropped: killed
profile message changed: killed
profile check dropped: killed
controller path changed: killed
mutations 22, survived 0
```

All 22 mutations are killed: each permission string, operation, cache header, default page and path is pinned.

- [ ] **Step 6: Run the tests and commit**

```bash
git add -N apps/api/src/modules/public
pnpm exec biome check --write apps/api/src/modules/public
pnpm --filter @pathways/api exec vitest run src/modules/public src/app-module-wiring.test.ts 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL "
pnpm lint 2>&1 | tail -2
pnpm typecheck > .tmp/s8a/out/typecheck.txt 2>&1 && echo "typecheck clean"
pnpm --filter @pathways/api test 2>&1 | grep -aE "Test Files|Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api/src/modules/public
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(api): give the public projects and publication controllers their own files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -1
```


Expected:

```text
Checked 6 files in <ms>. Fixed 1 file.
 Test Files  3 passed (3)
      Tests  18 passed (18)
$ pnpm exec biome check .
Checked 1574 files in <ms>. No fixes applied.
typecheck clean
 Test Files  159 passed | 10 skipped (169)
      Tests  2582 passed | 21 skipped (2603)
<sha> refactor(api): give the public projects and publication controllers their own files
```

All pass; api = Task 3 count + 4 (the route test); shared = `B_shared + 19 + 30 + 21 + 38`.

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
pnpm --filter @pathways/api exec vitest run src/modules/auth src/modules/users 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL "
pnpm lint 2>&1 | tail -2
pnpm typecheck > .tmp/s8a/out/typecheck.txt 2>&1 && echo "typecheck clean"
(cd apps/api && npx tsc --noEmit --noUnusedLocals -p . 2>&1 | grep "error TS" | cut -c1-110)
git checkout -- apps/web/next-env.d.ts
git add apps/api/src/modules/auth apps/api/src/modules/users
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(api): annotate the auth and users transaction helpers with Tx

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -1
```


Expected:

```text
Checked 3 files in <ms>. No fixes applied.
 Test Files  16 passed | 3 skipped (19)
      Tests  660 passed | 6 skipped (666)
$ pnpm exec biome check .
Checked 1574 files in <ms>. No fixes applied.
typecheck clean
prisma/hosted-realistic-seed.ts(504,9): error TS6133: 'storage' is declared but its value is never read.
src/modules/participants/participants.service.ts(30,55): error TS6138: Property 'prisma' is declared but its v
<sha> refactor(api): annotate the auth and users transaction helpers with Tx
```

The grep prints nothing and the tests pass.

- [ ] **Step 2: Write the request identity characterization tests (ruling 13)**

Create `apps/api/src/modules/users/users.controller.test.ts`:

```ts
import 'reflect-metadata'

import { ForbiddenException, RequestMethod } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ApplicationIdentity,
  AuthenticatedRequest,
} from '../../common/authz/application-identity'
import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
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
const change = {
  role: 'PROJECT_OFFICER' as const,
  accountStatus: 'ACTIVE' as const,
  projectIds: [],
}

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

describe('users controller routes', () => {
  it('registers three routes, each behind the users.authorize permission', () => {
    const prototype = UsersController.prototype as unknown as Record<string, () => void>
    const names = Object.getOwnPropertyNames(prototype).filter((name) => name !== 'constructor')
    expect(names.sort()).toEqual(['authorizeExisting', 'list', 'update'])
    expect(Reflect.getMetadata(PATH_METADATA, UsersController)).toBe('users')
    expect(
      names.map((name) => [
        name,
        RequestMethod[Reflect.getMetadata(METHOD_METADATA, prototype[name])],
        Reflect.getMetadata(PATH_METADATA, prototype[name]),
        Reflect.getMetadata(PERMISSION_KEY, prototype[name]),
      ]),
    ).toEqual([
      ['authorizeExisting', 'POST', 'authorize-existing', 'users.authorize'],
      ['list', 'GET', '/', 'users.authorize'],
      ['update', 'PATCH', ':userId', 'users.authorize'],
    ])
  })
})
```

Create `apps/api/src/modules/auth/authorized-data.controller.test.ts`:

```ts
import 'reflect-metadata'

import { ForbiddenException, RequestMethod } from '@nestjs/common'
import { HEADERS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  ApplicationIdentity,
  AuthenticatedRequest,
} from '../../common/authz/application-identity'
import { BENEFICIARY_STEP_UP_KEY } from '../../common/decorators/beneficiary-step-up.decorator'
import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
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

describe('authorized data controller routes', () => {
  it('registers three read routes with their permission, step-up rule and no-store header', () => {
    const prototype = AuthorizedDataController.prototype as unknown as Record<string, () => void>
    const names = Object.getOwnPropertyNames(prototype).filter((name) => name !== 'constructor')
    expect(Reflect.getMetadata(PATH_METADATA, AuthorizedDataController)).toBe('access')
    expect(
      names.map((name) => [
        name,
        RequestMethod[Reflect.getMetadata(METHOD_METADATA, prototype[name])],
        Reflect.getMetadata(PATH_METADATA, prototype[name]),
        Reflect.getMetadata(PERMISSION_KEY, prototype[name]),
        Reflect.getMetadata(BENEFICIARY_STEP_UP_KEY, prototype[name]) ?? false,
        Reflect.getMetadata(HEADERS_METADATA, prototype[name]),
      ]),
    ).toEqual([
      [
        'projects',
        'GET',
        'projects',
        'projects.read',
        false,
        [{ name: 'Cache-Control', value: 'no-store' }],
      ],
      [
        'beneficiaries',
        'GET',
        'projects/:projectId/beneficiaries',
        'beneficiaries.records.read',
        true,
        [{ name: 'Cache-Control', value: 'no-store' }],
      ],
      [
        'aggregate',
        'GET',
        'projects/:projectId/beneficiary-aggregate',
        'beneficiaries.aggregates.read',
        false,
        [{ name: 'Cache-Control', value: 'no-store' }],
      ],
    ])
  })
})
```

The two files above pin the users and authorized data controllers: the route table (method, path, permission, step-up and cache header), the 403 `Application profile is required.` and the arguments of every service call. The auth and profile controllers keep their own local profile checks (their message is `Verified profile required.`), so two more blocks are added to the HTTP tests of Tasks 2 and 3, which pass against the unchanged controllers too.

In `apps/api/src/modules/auth/auth.controller.validation.test.ts` replace `import { type INestApplication, ValidationPipe } from '@nestjs/common'` with `import { ForbiddenException, type INestApplication, ValidationPipe } from '@nestjs/common'`, add `import type { AuthenticatedRequest } from '../../common/authz/application-identity'` directly above `import { AuthController } from './auth.controller'`, and append at the end of the file (the cast keeps the table rows, which omit some keys, assignable to the request type):

```ts
describe('auth controller verified values', () => {
  it.each([
    ['no auth', { user: profile, authSessionId: sessionId }],
    ['no profile', { auth, authSessionId: sessionId }],
    ['no session', { auth, user: profile }],
  ])('answers 403 Verified profile required. for a step-up route with %s', (_label, values) => {
    const controller = new AuthController(
      {} as AuthService,
      {} as WorkspaceResolutionService,
      pins as unknown as BeneficiaryStepUpPinService,
      signIns as unknown as SignInLockoutService,
    )
    const request = { headers: {}, ...values } as unknown as AuthenticatedRequest
    for (const call of [
      () => controller.getStepUpStatus(request),
      () => controller.verifyStepUpPin(request, { pin: '482915' }),
      () => controller.setupStepUpPin(request, { pin: '482915' }),
      () => controller.changeStepUpPin(request, { newPin: '529317' }),
      () => controller.unlockStepUpPin(request),
    ]) {
      expect(call).toThrow(ForbiddenException)
      expect(call).toThrow('Verified profile required.')
    }
    for (const fn of Object.values(pins)) expect(fn).not.toHaveBeenCalled()
  })
})
```

In `apps/api/src/modules/profile/profile.controller.validation.test.ts` replace `import { type INestApplication, ValidationPipe } from '@nestjs/common'` with:

```ts
import {
  ForbiddenException,
  type INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
```

add `import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'` directly above `import { ProfileController } from './profile.controller'`, and append at the end of the file:

```ts
describe('profile routes', () => {
  it('registers a read and an update route, each behind the profile.manage permission', () => {
    const prototype = ProfileController.prototype as unknown as Record<string, () => void>
    const names = Object.getOwnPropertyNames(prototype).filter((name) => name !== 'constructor')
    expect(Reflect.getMetadata(PATH_METADATA, ProfileController)).toBe('profile')
    expect(
      names.map((name) => [
        name,
        RequestMethod[Reflect.getMetadata(METHOD_METADATA, prototype[name])],
        Reflect.getMetadata(PERMISSION_KEY, prototype[name]),
      ]),
    ).toEqual([
      ['read', 'GET', 'profile.manage'],
      ['update', 'PATCH', 'profile.manage'],
    ])
  })

  it('answers 403 Verified profile required. before any service call without a profile', () => {
    const controller = new ProfileController(profiles as unknown as ProfileService)
    for (const call of [
      () => controller.read({ headers: {} }),
      () =>
        controller.update(
          { headers: {} },
          { fullName: 'Ana', contactNumber: '', expectedUpdatedAt: updatedAt },
        ),
    ]) {
      expect(call).toThrow(ForbiddenException)
      expect(call).toThrow('Verified profile required.')
    }
    expect(profiles.read).not.toHaveBeenCalled()
    expect(profiles.update).not.toHaveBeenCalled()
  })
})
```

```bash
pnpm --filter @pathways/api exec vitest run src/modules/users/users.controller.test.ts src/modules/auth/authorized-data.controller.test.ts src/modules/auth/auth.controller.validation.test.ts src/modules/profile/profile.controller.validation.test.ts 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:"
```


Expected:

```text
 Test Files  4 passed (4)
      Tests  25 passed (25)
```

All pass against the unchanged controllers.

- [ ] **Step 3: Use requestIdentity and commit**

`apps/api/src/modules/users/users.controller.ts`: delete the local `function profile(request: AuthenticatedRequest) { ... }` (four lines and the blank line after it); remove `ForbiddenException,` from the `@nestjs/common` import; add `import { requestIdentity } from '../../common/authz/request-identity'` directly below the `application-identity` import; replace the three `profile(request)` calls with `requestIdentity(request)`.

`apps/api/src/modules/auth/authorized-data.controller.ts`: delete the local `function verifiedProfile(request: AuthenticatedRequest) { ... }` (four lines and the blank line after it); the `@nestjs/common` import becomes `import { Controller, Get, Header, Inject, Param, Req } from '@nestjs/common'`; add `import { requestIdentity } from '../../common/authz/request-identity'` directly below the `application-identity` import; replace the three `verifiedProfile(request)` calls with `requestIdentity(request)`; replace the phase-coded doc comment `/** Small read-only Phase 5 contracts. No generic query/write or onboarding API. */` with `// Small read-only access reads; no generic query, write or onboarding route.` (CR 3.5 forbids phase codes).

```bash
git grep -nE "Application profile is required\.'|function (profile|verifiedProfile)\(|Phase 5" -- apps/api/src/modules/users apps/api/src/modules/auth ':!*.test.ts'
git add -N apps/api/src/modules
pnpm exec biome check --write apps/api/src/modules/users apps/api/src/modules/auth/authorized-data.controller.ts apps/api/src/modules/auth/authorized-data.controller.test.ts apps/api/src/modules/auth/auth.controller.validation.test.ts apps/api/src/modules/profile
pnpm --filter @pathways/api exec vitest run src/modules/users src/modules/auth src/modules/profile src/common 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL "
pnpm lint 2>&1 | tail -2
pnpm typecheck > .tmp/s8a/out/typecheck.txt 2>&1 && echo "typecheck clean"
(cd apps/api && npx tsc --noEmit --noUnusedLocals -p . 2>&1 | grep "error TS" | cut -c1-110)
pnpm --filter @pathways/api test 2>&1 | grep -aE "Test Files|Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add apps/api/src/modules/users apps/api/src/modules/auth/authorized-data.controller.ts apps/api/src/modules/auth/authorized-data.controller.test.ts apps/api/src/modules/auth/auth.controller.validation.test.ts apps/api/src/modules/profile
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(api): use requestIdentity in the users and authorized data controllers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -1
```


Expected:

```text
Checked 16 files in <ms>. Fixed 1 file.
 Test Files  31 passed | 3 skipped (34)
      Tests  760 passed | 6 skipped (766)
$ pnpm exec biome check .
Checked 1576 files in <ms>. No fixes applied.
typecheck clean
prisma/hosted-realistic-seed.ts(504,9): error TS6133: 'storage' is declared but its value is never read.
src/modules/participants/participants.service.ts(30,55): error TS6138: Property 'prisma' is declared but its v
 Test Files  161 passed | 10 skipped (171)
      Tests  2593 passed | 21 skipped (2614)
<sha> refactor(api): use requestIdentity in the users and authorized data controllers
```

The grep prints nothing; the new tests pass unchanged; api = Task 4 count + 11 (the new tests: users controller 3, authorized data controller 3, verified values 3, profile routes 2).

- [ ] **Step 4: Prove the controller tests by mutation**

A route that skips the identity check, changes its permission, path, step-up rule or cache header, or a local check that loses its message or one of its three values, must fail these tests. The first list covers the three controllers that moved to `requestIdentity` and the profile route table:

Create `.tmp/s8a/mut-identity.json`:

```json
[
 ["users list skips the identity check", "apps/api/src/modules/users/users.controller.ts", "this.users.list(requestIdentity(request))", "this.users.list(request.user as never)"],
 ["users authorize skips the identity check", "apps/api/src/modules/users/users.controller.ts", "this.users.authorizeExisting(requestIdentity(request), body)", "this.users.authorizeExisting(request.user as never, body)"],
 ["users update skips the identity check", "apps/api/src/modules/users/users.controller.ts", "this.users.update(requestIdentity(request), userId, body)", "this.users.update(request.user as never, userId, body)"],
 ["users list permission changed", "apps/api/src/modules/users/users.controller.ts", "  @Get()\n  @RequirePermission('users.authorize')", "  @Get()\n  @RequirePermission('projects.read')"],
 ["users authorize permission changed", "apps/api/src/modules/users/users.controller.ts", "@Post('authorize-existing')\n  @RequirePermission('users.authorize')", "@Post('authorize-existing')\n  @RequirePermission('projects.read')"],
 ["users update permission changed", "apps/api/src/modules/users/users.controller.ts", "@Patch(':userId')\n  @RequirePermission('users.authorize')", "@Patch(':userId')\n  @RequirePermission('projects.read')"],
 ["users update path changed", "apps/api/src/modules/users/users.controller.ts", "@Patch(':userId')", "@Patch(':id')"],
 ["users authorize path changed", "apps/api/src/modules/users/users.controller.ts", "@Post('authorize-existing')", "@Post('authorize')"],
 ["users path changed", "apps/api/src/modules/users/users.controller.ts", "@Controller('users')", "@Controller('user')"],
 ["data projects skips the identity check", "apps/api/src/modules/auth/authorized-data.controller.ts", "this.data.projects(requestIdentity(request))", "this.data.projects(request.user as never)"],
 ["data beneficiaries skips the identity check", "apps/api/src/modules/auth/authorized-data.controller.ts", "this.data.beneficiaries(requestIdentity(request), projectId)", "this.data.beneficiaries(request.user as never, projectId)"],
 ["data aggregate skips the identity check", "apps/api/src/modules/auth/authorized-data.controller.ts", "this.data.beneficiaryAggregate(requestIdentity(request), projectId)", "this.data.beneficiaryAggregate(request.user as never, projectId)"],
 ["data projects permission changed", "apps/api/src/modules/auth/authorized-data.controller.ts", "@RequirePermission('projects.read')", "@RequirePermission('projects.detail.read')"],
 ["data beneficiaries permission changed", "apps/api/src/modules/auth/authorized-data.controller.ts", "@RequirePermission('beneficiaries.records.read')", "@RequirePermission('beneficiaries.aggregates.read')"],
 ["data aggregate permission changed", "apps/api/src/modules/auth/authorized-data.controller.ts", "@RequirePermission('beneficiaries.aggregates.read')", "@RequirePermission('beneficiaries.records.read')"],
 ["data beneficiaries step-up dropped", "apps/api/src/modules/auth/authorized-data.controller.ts", "  @RequireBeneficiaryStepUp()\n", ""],
 ["data aggregate step-up added", "apps/api/src/modules/auth/authorized-data.controller.ts", "@RequirePermission('beneficiaries.aggregates.read')\n", "@RequirePermission('beneficiaries.aggregates.read')\n  @RequireBeneficiaryStepUp()\n"],
 ["data cache header dropped on projects", "apps/api/src/modules/auth/authorized-data.controller.ts", "@RequirePermission('projects.read')\n  @Header('Cache-Control', 'no-store')\n", "@RequirePermission('projects.read')\n"],
 ["data path changed", "apps/api/src/modules/auth/authorized-data.controller.ts", "@Controller('access')", "@Controller('accessible')"],
 ["profile read permission changed", "apps/api/src/modules/profile/profile.controller.ts", "  @Get()\n  @RequirePermission('profile.manage')", "  @Get()\n  @RequirePermission('projects.read')"],
 ["profile update permission changed", "apps/api/src/modules/profile/profile.controller.ts", "  @Patch()\n  @RequirePermission('profile.manage')", "  @Patch()\n  @RequirePermission('projects.read')"],
 ["profile path changed", "apps/api/src/modules/profile/profile.controller.ts", "@Controller('profile')", "@Controller('profiles')"]
]
```

```bash
node .tmp/s8a/mutate.mjs .tmp/s8a/mut-identity.json pnpm --filter @pathways/api exec vitest run src/modules/users/users.controller.test.ts src/modules/auth/authorized-data.controller.test.ts src/modules/profile/profile.controller.validation.test.ts
```


Expected:

```text
unmutated: pass
users list skips the identity check: killed
users authorize skips the identity check: killed
users update skips the identity check: killed
users list permission changed: killed
users authorize permission changed: killed
users update permission changed: killed
users update path changed: killed
users authorize path changed: killed
users path changed: killed
data projects skips the identity check: killed
data beneficiaries skips the identity check: killed
data aggregate skips the identity check: killed
data projects permission changed: killed
data beneficiaries permission changed: killed
data aggregate permission changed: killed
data beneficiaries step-up dropped: killed
data aggregate step-up added: killed
data cache header dropped on projects: killed
data path changed: killed
profile read permission changed: killed
profile update permission changed: killed
profile path changed: killed
mutations 22, survived 0
```

All 22 mutations are applied and killed. The second list covers the two controllers that keep their own check:

Create `.tmp/s8a/mut-verified.json`:

```json
[
 ["profile message changed", "apps/api/src/modules/profile/profile.controller.ts", "'Verified profile required.'", "'Application profile is required.'"],
 ["profile check dropped", "apps/api/src/modules/profile/profile.controller.ts", "if (!request.user) throw new ForbiddenException('Verified profile required.')", "if (!request.user) return request.user as never"],
 ["auth message changed", "apps/api/src/modules/auth/auth.controller.ts", "'Verified profile required.'", "'Application profile is required.'"],
 ["auth check drops the auth", "apps/api/src/modules/auth/auth.controller.ts", "!request.auth || !request.user || !request.authSessionId", "!request.user || !request.authSessionId"],
 ["auth check drops the profile", "apps/api/src/modules/auth/auth.controller.ts", "!request.auth || !request.user || !request.authSessionId", "!request.auth || !request.authSessionId"],
 ["auth check drops the session", "apps/api/src/modules/auth/auth.controller.ts", "!request.auth || !request.user || !request.authSessionId", "!request.auth || !request.user"]
]
```

```bash
node .tmp/s8a/mutate.mjs .tmp/s8a/mut-verified.json pnpm --filter @pathways/api exec vitest run src/modules/auth/auth.controller.validation.test.ts src/modules/profile/profile.controller.validation.test.ts
git status --short
```


Expected:

```text
unmutated: pass
profile message changed: killed
profile check dropped: killed
auth message changed: killed
auth check drops the auth: killed
auth check drops the profile: killed
auth check drops the session: killed
mutations 6, survived 0
```

All 6 mutations are killed and the tree is clean after the runs (the `git status` prints nothing).

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

In `packages/shared/src/rbac/route-policy.test.ts`, the test `treats only program and grant managers as aggregate-only` pins the role list of `isAggregateOnly` but not its single-role rule; add as its last assertion:

```ts
    expect(
      isAggregateOnly({
        ...principal('PROGRAM_MANAGER'),
        roles: ['PROGRAM_MANAGER', 'PROJECT_MANAGER'],
      }),
    ).toBe(false)
```

Directly after that test add the test below. The `routeAllowed` literal sits behind the permission check, so this test pins the outcome the literal defends:

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

The assessment set already has characterization: the two `denies %s before any query, even with a forged grant` tests pin all three assessment denials. The access matrix does not: `access-matrix.test.ts` pins `beneficiaryDataAccess`, but the `aggregate` line sits behind the `modules.beneficiaries` level of each role profile, which no test reads. In `apps/web/src/lib/rbac/access-matrix.test.ts`, directly before the test `limits account creation and authorization to the locked hierarchy`, add:

```ts
  it.each([
    ['System Administrator', 'none'],
    ['Program Manager', 'aggregate'],
    ['Grant Manager', 'aggregate'],
    ['Project Manager', 'scoped'],
    ['Project Officer', 'scoped'],
    ['Monitoring and Evaluation Officer', 'scoped'],
  ] as const)('gives %s the %s Beneficiary module', (role, expected) => {
    expect(roleAccessProfiles[role].modules.beneficiaries).toBe(expected)
  })
```

```bash
pnpm --filter @pathways/shared exec vitest run src/rbac/route-policy.test.ts 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:"
pnpm --filter @pathways/web exec vitest run src/lib/services/source-mutation.test.ts src/lib/rbac/access-matrix.test.ts 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:"
git grep -l "denies %s before any query, even with a forged grant" -- apps/api/src/modules/evaluations
```


Expected:

```text
 Test Files  1 passed (1)
      Tests  7 passed (7)
 Test Files  2 passed (2)
      Tests  107 passed (107)
apps/api/src/modules/evaluations/evaluations.assessment-detail.test.ts
apps/api/src/modules/evaluations/evaluations.beneficiary-assessments.test.ts
```

All pass against the unchanged code (1 new assertion and 1 new test in shared, 9 new web tests); the grep prints the two evaluations test files.

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
const assessmentDetailDeniedRoles = new Set(['SYSTEM_ADMINISTRATOR', ...aggregateOnlyRoles])
```

The existing two-line comment above the declaration stays.

`apps/web/src/lib/services/source-mutation.ts`: add `import { routeUuidPattern } from '@pathways/shared'` directly below the `sensitive-drafts` import that F4b placed on the first line (if that import is absent, add it as the first line followed by a blank line); delete the line `const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`; replace `if (!uuid.test(ticket.id))` with `if (!routeUuidPattern.test(ticket.id))`.

The block sets `EVAL` to the Task 0 path itself (a fresh shell holds no earlier variable); use the path Task 0 wrote down if it differs:

```bash
EVAL=apps/api/src/modules/evaluations/evaluation-assessments.service.ts
git grep -nE "'PROGRAM_MANAGER',\s*'GRANT_MANAGER'|code === 'GRANT_MANAGER'" -- packages/shared/src apps/web/src ':!*.test.ts' ':!*.test.tsx'
git grep -n "assessmentDetailDeniedRoles = " -- apps/api/src
git grep -n "\[1-8\]\[0-9a-f\]{3}" -- apps/web/src
pnpm exec biome check --write packages/shared/src/rbac/route-policy.ts packages/shared/src/rbac/route-policy.test.ts apps/web/src/lib/rbac/access-matrix.ts apps/web/src/lib/rbac/access-matrix.test.ts apps/web/src/lib/services/source-mutation.ts apps/web/src/lib/services/source-mutation.test.ts "$EVAL" 2>&1 | tail -3
pnpm --filter @pathways/shared build > /dev/null 2>&1 && echo "shared built"
pnpm --filter @pathways/shared exec vitest run src/rbac 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:"
pnpm --filter @pathways/web exec vitest run src/lib/services src/lib/rbac src/lib/middleware.test.ts src/features/settings 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:"
pnpm --filter @pathways/api exec vitest run src/modules/evaluations src/modules/auth/route-access.service.test.ts 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:"
pnpm lint 2>&1 | tail -2
pnpm typecheck > .tmp/s8a/out/typecheck.txt 2>&1 && echo "typecheck clean"
(cd apps/web && npx tsc --noEmit --noUnusedLocals -p . 2>&1 | grep "error TS" | cut -c1-110)
(cd apps/api && npx tsc --noEmit --noUnusedLocals -p . 2>&1 | grep "error TS" | cut -c1-110)
git checkout -- apps/web/next-env.d.ts
git add packages/shared/src/rbac apps/web/src/lib/rbac/access-matrix.ts apps/web/src/lib/rbac/access-matrix.test.ts apps/web/src/lib/services/source-mutation.ts apps/web/src/lib/services/source-mutation.test.ts "$EVAL"
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor: use aggregateOnlyRoles for the aggregate-only role lists and routeUuidPattern for mutation tickets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -1
```


Expected:

```text
packages/shared/src/rbac/authorization-policy.ts:451:export const aggregateOnlyRoles: readonly string[] = ['PROGRAM_MANAGER', 'GRANT_MANAGER']
apps/api/src/modules/evaluations/evaluation-assessments.service.ts:11:const assessmentDetailDeniedRoles = new Set(['SYSTEM_ADMINISTRATOR', ...aggregateOnlyRoles])
Checked 7 files in <ms>. Fixed 2 files.
shared built
 Test Files  5 passed (5)
      Tests  31 passed (31)
 Test Files  22 passed (22)
      Tests  414 passed (414)
 Test Files  9 passed | 1 skipped (10)
      Tests  405 passed | 9 skipped (414)
$ pnpm exec biome check .
Checked 1576 files in <ms>. No fixes applied.
typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but
src/types/pathways.ts(14,3): error TS6196: 'SadddDashboard' is declared but never used.
prisma/hosted-realistic-seed.ts(504,9): error TS6133: 'storage' is declared but its value is never read.
src/modules/participants/participants.service.ts(30,55): error TS6138: Property 'prisma' is declared but its v
<sha> refactor: use aggregateOnlyRoles for the aggregate-only role lists and routeUuidPattern for mutation tickets
```

The first grep prints only `packages/shared/src/rbac/authorization-policy.ts` (the `aggregateOnlyRoles` declaration); the second prints the one-line set; the third prints nothing; all tests pass and `--noUnusedLocals` lists only the baseline lines.

- [ ] **Step 2b: Prove the constant tests by mutation**

Each mutation breaks the shared constant or one of its three users; every one must make a test fail. The lists are fixed text:

Create `.tmp/s8a/mut-t6-shared.json`:

```json
[
 ["route policy beneficiary rule never applies", "packages/shared/src/rbac/route-policy.ts", "    aggregateOnlyRoles.includes(role)\n  )\n    return false", "    false\n  )\n    return false"],
 ["route policy rule drops grant managers", "packages/shared/src/rbac/route-policy.ts", "    aggregateOnlyRoles.includes(role)\n  )\n    return false", "    role === 'PROGRAM_MANAGER'\n  )\n    return false"],
 ["route policy rule drops program managers", "packages/shared/src/rbac/route-policy.ts", "    aggregateOnlyRoles.includes(role)\n  )\n    return false", "    role === 'GRANT_MANAGER'\n  )\n    return false"],
 ["aggregate-only test never true", "packages/shared/src/rbac/route-policy.ts", "principal.roles.length === 1 && aggregateOnlyRoles.includes(principal.roles[0])", "false"],
 ["aggregate-only test drops the single role rule", "packages/shared/src/rbac/route-policy.ts", "principal.roles.length === 1 && aggregateOnlyRoles.includes(principal.roles[0])", "aggregateOnlyRoles.includes(principal.roles[0])"]
]
```

Create `.tmp/s8a/mut-t6-web.json`:

```json
[
 ["matrix never aggregate", "apps/web/src/lib/rbac/access-matrix.ts", "const aggregate = aggregateOnlyRoles.includes(code)", "const aggregate = false"],
 ["matrix drops grant managers", "apps/web/src/lib/rbac/access-matrix.ts", "const aggregate = aggregateOnlyRoles.includes(code)", "const aggregate = code === 'PROGRAM_MANAGER'"],
 ["matrix drops program managers", "apps/web/src/lib/rbac/access-matrix.ts", "const aggregate = aggregateOnlyRoles.includes(code)", "const aggregate = code === 'GRANT_MANAGER'"],
 ["ticket id never checked", "apps/web/src/lib/services/source-mutation.ts", "if (!routeUuidPattern.test(ticket.id))", "if (false)"],
 ["ticket id any text", "apps/web/src/lib/services/source-mutation.ts", "if (!routeUuidPattern.test(ticket.id))", "if (!/./.test(ticket.id))"]
]
```

Create `.tmp/s8a/mut-t6-api.json`:

```json
[
 ["assessment denial drops the administrator", "apps/api/src/modules/evaluations/evaluation-assessments.service.ts", "new Set(['SYSTEM_ADMINISTRATOR', ...aggregateOnlyRoles])", "new Set([...aggregateOnlyRoles])"],
 ["assessment denial drops the aggregate roles", "apps/api/src/modules/evaluations/evaluation-assessments.service.ts", "new Set(['SYSTEM_ADMINISTRATOR', ...aggregateOnlyRoles])", "new Set(['SYSTEM_ADMINISTRATOR'])"],
 ["assessment denial drops grant managers", "apps/api/src/modules/evaluations/evaluation-assessments.service.ts", "new Set(['SYSTEM_ADMINISTRATOR', ...aggregateOnlyRoles])", "new Set(['SYSTEM_ADMINISTRATOR', 'PROGRAM_MANAGER'])"],
 ["assessment denial drops program managers", "apps/api/src/modules/evaluations/evaluation-assessments.service.ts", "new Set(['SYSTEM_ADMINISTRATOR', ...aggregateOnlyRoles])", "new Set(['SYSTEM_ADMINISTRATOR', 'GRANT_MANAGER'])"]
]
```

```bash
node .tmp/s8a/mutate.mjs .tmp/s8a/mut-t6-shared.json pnpm --filter @pathways/shared exec vitest run src/rbac/route-policy.test.ts
node .tmp/s8a/mutate.mjs .tmp/s8a/mut-t6-web.json pnpm --filter @pathways/web exec vitest run src/lib/rbac/access-matrix.test.ts src/lib/services/source-mutation.test.ts
node .tmp/s8a/mutate.mjs .tmp/s8a/mut-t6-api.json pnpm --filter @pathways/api exec vitest run src/modules/evaluations
```


Expected:

```text
unmutated: pass
route policy beneficiary rule never applies: SURVIVED
route policy rule drops grant managers: SURVIVED
route policy rule drops program managers: SURVIVED
aggregate-only test never true: killed
aggregate-only test drops the single role rule: killed
mutations 5, survived 3
unmutated: pass
matrix never aggregate: killed
matrix drops grant managers: killed
matrix drops program managers: killed
ticket id never checked: killed
ticket id any text: killed
mutations 5, survived 0
unmutated: pass
assessment denial drops the administrator: killed
assessment denial drops the aggregate roles: killed
assessment denial drops grant managers: killed
assessment denial drops program managers: killed
mutations 4, survived 0
```

All 14 mutations are applied and 11 are killed. The first three of the shared list survive and are equivalent: `rolePermissions` gives neither aggregate-only role `reports.beneficiary.read` or `beneficiaries.read`, so the permission check above the ceiling already denies them and the ceiling only guards a later catalog change (the test `denies program and grant managers the beneficiary summary in either route` pins the decision).

- [ ] **Step 3: Write the cookie read characterization tests (ruling 16)**

In `apps/web/src/lib/auth/workspace-access.test.ts`, add `readWorkspaceContextCookie` to the `./workspace-access` import list and append this block at the end of the file (the file runs in the node environment, so `document` is stubbed with browser-formatted cookie strings):

```ts
describe('workspace context cookie', () => {
  it.each([
    ['theme=dark; pathways-context=%7B%7D; sidebar=compact', '%7B%7D'],
    ['pathways-context-old=x; pathways-context=v', 'v'],
    ['pathways-context=', ''],
    ['theme=dark;pathways-context=v', 'v'],
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

The request foundation rechecks the workspace cookie after the session loads, and no test reached that line (the mutation of Step 5 would survive). A third file pins it.

Create `apps/web/src/lib/api/core/request-ownership.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

const supabase = vi.hoisted(() => ({ getSession: vi.fn() }))

vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({
  getBrowserSupabaseClient: () => ({ auth: { getSession: supabase.getSession } }),
}))

import { requestFoundationResponse } from './request'

describe('requestFoundationResponse ownership', () => {
  afterEach(() => {
    document.cookie = 'pathways-context=; Path=/; Max-Age=0'
  })

  it('refuses the request when the workspace cookie changes while the session loads', async () => {
    document.cookie = 'pathways-context=owner-a; Path=/'
    supabase.getSession.mockImplementation(async () => {
      document.cookie = 'pathways-context=owner-b; Path=/'
      return { data: { session: null }, error: null }
    })
    await expect(requestFoundationResponse('/synthetic')).rejects.toThrow(
      'Request ownership changed.',
    )
  })

  it('goes on to the session check when the workspace cookie is unchanged', async () => {
    document.cookie = 'pathways-context=owner-a; Path=/'
    supabase.getSession.mockResolvedValue({ data: { session: null }, error: null })
    await expect(requestFoundationResponse('/synthetic')).rejects.toThrow(
      'Current session unavailable.',
    )
  })
})
```

```bash
pnpm --filter @pathways/web exec vitest run src/lib/auth/workspace-access.test.ts src/lib/api/core/request-owner.test.ts src/lib/api/core/request-ownership.test.ts 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:"
```


Expected:

```text
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/lib/auth/workspace-access.test.ts > workspace context cookie > reads "theme=dark;pathways-context=v" as "v"
AssertionError: expected undefined to be 'v' // Object.is equality
 Test Files  1 failed | 2 passed (3)
      Tests  1 failed | 20 passed (21)
```

One case fails against the unchanged code, the bare semicolon row (the existing reader splits on `; ` only, and Step 4 makes it read `;` with trimming, which browsers and jsdom never tell apart); the other 20 pass (6 reader rows, 1 owner case and 2 ownership cases are new). A jsdom probe confirmed that `document.cookie = 'pathways-context='` keeps an empty-valued entry (`document.cookie` then reads `pathways-context=`), which the owner check counts today.

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
pnpm exec biome check --write apps/web/src/lib/auth/workspace-access.ts apps/web/src/lib/auth/workspace-access.test.ts apps/web/src/lib/api/core/request.ts apps/web/src/lib/api/core/request-owner.ts apps/web/src/lib/api/core/request-owner.test.ts apps/web/src/lib/api/core/request-ownership.test.ts 2>&1 | tail -3
git grep -l "keeps the exact workspace across a same-subject token refresh" -- apps/web/src
pnpm --filter @pathways/web exec vitest run src/lib/auth src/lib/api src/lib/services src/providers 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:"
pnpm lint 2>&1 | tail -2
pnpm typecheck > .tmp/s8a/out/typecheck.txt 2>&1 && echo "typecheck clean"
(cd apps/web && npx tsc --noEmit --noUnusedLocals -p . 2>&1 | grep "error TS" | cut -c1-110)
pnpm --filter @pathways/web test 2>&1 | grep -aE "Test Files|Tests +[0-9]+"
.tmp/s8a/build-routes.sh task6
git checkout -- apps/web/next-env.d.ts
git add apps/web/src/lib/auth apps/web/src/lib/api/core
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(web): read the workspace context cookie in one place

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -1
```


Expected:

```text
apps/web/src/lib/auth/workspace-access.ts:75:  document.cookie = `${contextCookieName}=; Path=/; SameSite=Strict; Max-Age=0`
apps/web/src/lib/auth/workspace-access.ts:80:  document.cookie
apps/web/src/lib/auth/workspace-access.ts:88:  document.cookie = `${contextCookieName}=${encodeWorkspaceContext(profile)}; Path=/; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}`
apps/web/src/lib/auth/workspace-access.ts:12:export const contextCookieName = 'pathways-context'
apps/web/src/lib/auth/workspace-access.ts:75:  document.cookie = `${contextCookieName}=; Path=/; SameSite=Strict; Max-Age=0`
apps/web/src/lib/auth/workspace-access.ts:83:    .find((part) => part.startsWith(`${contextCookieName}=`))
apps/web/src/lib/auth/workspace-access.ts:84:    ?.slice(contextCookieName.length + 1)
apps/web/src/lib/auth/workspace-access.ts:88:  document.cookie = `${contextCookieName}=${encodeWorkspaceContext(profile)}; Path=/; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}`
apps/web/src/lib/middleware.ts:4:import { contextCookieName, decodeWorkspaceContext } from '@/lib/auth/workspace-access'
apps/web/src/lib/middleware.ts:33:      response.cookies.set(contextCookieName, '', { path: '/', maxAge: 0, sameSite: 'strict' })
apps/web/src/lib/middleware.ts:85:        request.cookies.get(contextCookieName)?.value,
apps/web/src/lib/rbac/server-access.ts:5:import { contextCookieName, decodeWorkspaceContext } from '../auth/workspace-access'
apps/web/src/lib/rbac/server-access.ts:70:    const context = decodeWorkspaceContext(store.get(contextCookieName)?.value, identity.sub)
Checked 6 files in <ms>. No fixes applied.
apps/web/src/lib/services/pathways-client.test.ts
 Test Files  52 passed (52)
      Tests  783 passed (783)
$ pnpm exec biome check .
Checked 1577 files in <ms>. No fixes applied.
typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but
src/types/pathways.ts(14,3): error TS6196: 'SadddDashboard' is declared but never used.
 Test Files  283 passed (283)
      Tests  2897 passed (2897)
exit 0
ƒ Middleware                                                      <n> kB
<sha> refactor(web): read the workspace context cookie in one place
```

The first grep prints only three lines, all in `lib/auth/workspace-access.ts` (`clearWorkspaceContext`, the reader, `writeWorkspaceContext`). The second prints only `lib/auth/workspace-access.ts`, `lib/middleware.ts` and `lib/rbac/server-access.ts` lines (the last two read the cookie server-side through Next cookie stores, which parse the header themselves, and stay), none in `request.ts`, `request-owner.ts`, `pathways-client.ts`, `core-feature-client.ts`, `rules-human-client.ts` or the providers; if another file prints, it holds a fourth browser read: stop and report. The token refresh grep names `lib/services/pathways-client.test.ts`, which the vitest line runs with the `does not dispatch an entered beneficiary payload after %s change` cases. The web build exits 0 and `build-routes.sh` prints Middleware at 102 kB (growth stops the task and is reported). Counts: shared = Task 4 count + 1 assertion and 1 test; api = Task 5 count (no api test is added here); web = `B_web + 18` (mutation ids 3, access matrix 6, cookie reader 6, owner 1, request ownership 2).

- [ ] **Step 5: Prove the cookie tests by mutation**

A reader that splits on the spaced separator only, skips trimming, matches a name prefix or keeps the name in the value, an owner check that counts an empty value as missing, and a request that skips the ownership recheck after the session loads, must fail the tests:

Create `.tmp/s8a/mut-cookie.json`:

```json
[
 ["reader splits on the spaced separator", "apps/web/src/lib/auth/workspace-access.ts", "    .split(';')\n    .map((part) => part.trim())\n", "    .split('; ')\n"],
 ["reader skips trimming", "apps/web/src/lib/auth/workspace-access.ts", "    .map((part) => part.trim())\n", ""],
 ["reader matches a name prefix", "apps/web/src/lib/auth/workspace-access.ts", "part.startsWith(`${contextCookieName}=`))\n    ?.slice", "part.startsWith(contextCookieName))\n    ?.slice"],
 ["reader keeps the name in the value", "apps/web/src/lib/auth/workspace-access.ts", "?.slice(contextCookieName.length + 1)", "?.slice(contextCookieName.length)"],
 ["reader returns the first entry", "apps/web/src/lib/auth/workspace-access.ts", "    .find((part) => part.startsWith(`${contextCookieName}=`))", "    .at(0)"],
 ["owner counts an empty value as missing", "apps/web/src/lib/api/core/request-owner.ts", "(readWorkspaceContextCookie() ?? null)", "(readWorkspaceContextCookie() || null)"],
 ["owner ignores a missing cookie", "apps/web/src/lib/api/core/request-owner.ts", "(readWorkspaceContextCookie() ?? null)", "(readWorkspaceContextCookie() ?? '')"],
 ["request rechecks nothing after the token", "apps/web/src/lib/api/core/request.ts", "ownerCookie !== readWorkspaceContextCookie() ||", "false ||"]
]
```

```bash
node .tmp/s8a/mutate.mjs .tmp/s8a/mut-cookie.json pnpm --filter @pathways/web exec vitest run src/lib/auth/workspace-access.test.ts src/lib/api
git status --short
```


Expected:

```text
unmutated: pass
reader splits on the spaced separator: killed
reader skips trimming: killed
reader matches a name prefix: killed
reader keeps the name in the value: killed
reader returns the first entry: killed
owner counts an empty value as missing: killed
owner ignores a missing cookie: killed
request rechecks nothing after the token: killed
mutations 8, survived 0
```

All 8 mutations are applied and killed and the tree is clean after the runs.


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


Expected:

```text
apps/web/src/features/public/public-dashboard-config.test.ts
apps/web/src/features/public/public-dashboard-config.ts
apps/web/src/features/public/public-project-charts.tsx
apps/web/src/features/public/public-project-detail.tsx
apps/web/src/lib/services/public-projects.ts
apps/web/src/types/pathways.ts
```

The first prints nothing; the second prints exactly six files: `types/pathways.ts`, `lib/services/public-projects.ts` and four closure files under `features/public` (`public-dashboard-config.test.ts`, `public-dashboard-config.ts`, `public-project-charts.tsx`, `public-project-detail.tsx`). Anything else: stop and report.

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


Expected:

```text
rm 'apps/web/src/features/profile/profile-validation.test.ts'
rm 'apps/web/src/features/profile/profile-validation.ts'
rm 'apps/web/src/features/public/public-dashboard-config.test.ts'
rm 'apps/web/src/features/public/public-dashboard-config.ts'
rm 'apps/web/src/features/public/public-project-charts.tsx'
rm 'apps/web/src/features/public/public-project-detail.test.tsx'
rm 'apps/web/src/features/public/public-project-detail.tsx'
removed 77 lines: PublicIndicator, PublicMilestone, PublicDashboardSectionId, PublicDashboardLayoutPreset, PublicDashboardPresentation, PublicBeneficiaryMediaRecord, PublicProjectRecord
```

The script prints `removed 77 lines: PublicIndicator, PublicMilestone, PublicDashboardSectionId, PublicDashboardLayoutPreset, PublicDashboardPresentation, PublicBeneficiaryMediaRecord, PublicProjectRecord`.

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
pnpm exec biome check --write apps/web/src/lib/services/public-projects.ts apps/web/src/types/pathways.ts 2>&1 | tail -2
pnpm --filter @pathways/web exec vitest run src/features/public src/features/profile 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:"
pnpm lint 2>&1 | tail -2
pnpm typecheck > .tmp/s8a/out/typecheck.txt 2>&1 && echo "typecheck clean"
(cd apps/web && npx tsc --noEmit --noUnusedLocals -p . 2>&1 | grep "error TS" | cut -c1-110)
pnpm --filter @pathways/web test 2>&1 | grep -aE "Test Files|Tests +[0-9]+"
.tmp/s8a/build-routes.sh task7
pnpm docs:check 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | tail -3
git checkout -- apps/web/next-env.d.ts
git add -A apps/web/src docs/deferred-features.md
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(web): delete the dead public microsite detail and profile validation

Seven files (1569 lines), mapPublicSnapshot and seven public view models had no production importer.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -1
```


Expected:

```text
Checked 2 files in <ms>. No fixes applied.
 Test Files  10 passed (10)
      Tests  46 passed (46)
$ pnpm exec biome check .
Checked 1570 files in <ms>. No fixes applied.
typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but
src/types/pathways.ts(14,3): error TS6196: 'SadddDashboard' is declared but never used.
 Test Files  280 passed (280)
      Tests  2891 passed (2891)
exit 0
ƒ Middleware                                                      <n> kB

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
<sha> refactor(web): delete the dead public microsite detail and profile validation
```

All pass; web = Task 6 web count - 6 (detail 1, dashboard config 3, profile validation 2); the build exits 0 and Middleware stays at 102 kB; the docs check failure count equals the Task 0 baseline.

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

  it.each([
    ['ACTIVE', 'Active'],
    ['INVITED', 'Invited'],
    ['SUSPENDED', 'Suspended'],
    ['DEACTIVATED', 'Deactivated'],
    ['ARCHIVED', 'Archived'],
  ])('labels the %s account status as %s', async (code, label) => {
    request.requestFoundation.mockResolvedValue([{ ...row, accountStatus: code }])
    await expect(usersClient.getUsers()).resolves.toMatchObject([{ accountStatus: label }])
  })

  it('accepts a list of exactly 200 users', async () => {
    request.requestFoundation.mockResolvedValue(Array(200).fill(row))
    await expect(usersClient.getUsers()).resolves.toHaveLength(200)
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
      body: JSON.stringify({
        role: 'PROGRAM_MANAGER',
        accountStatus: 'DEACTIVATED',
        projectIds: [],
      }),
    })
  })

  it('sends the full name and the active status code on update', async () => {
    request.requestFoundation.mockResolvedValue(row)
    await usersClient.updateAuthorizedUser(row.id, {
      fullName: 'Synthetic Renamed',
      role: 'Project Officer',
      accountStatus: 'Active',
      projectIds: ['74000000-0000-4000-8000-000000000003'],
    })
    expect(request.requestFoundation).toHaveBeenCalledWith(`/users/${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fullName: 'Synthetic Renamed',
        role: 'PROJECT_OFFICER',
        accountStatus: 'ACTIVE',
        projectIds: ['74000000-0000-4000-8000-000000000003'],
      }),
    })
  })
})
```

The file also pins what the client maps and refuses, because the old comparison was by eye: all five account status labels, the sign-in method, the list limit at 200 and 201, the error code, the abort signal, the request bodies and the encoded id.

```bash
pnpm --filter @pathways/web exec vitest run src/lib/api/users.test.ts 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:" | sed "s#$PWD/##g"
```


Expected:

```text
 FAIL  src/lib/api/users.test.ts [ src/lib/api/users.test.ts ]
Error: Cannot find module './users' imported from 'apps/web/src/lib/api/users.test.ts'
Caused by: Error: Failed to load url ./users (resolved id: ./users) in apps/web/src/lib/api/users.test.ts. Does the file exist?
 Test Files  1 failed (1)
```

The run fails because `./users` does not exist yet.

- [ ] **Step 2: Create the users client from the pathways client code**

The three methods, `mapUser` and `parseUsers` move verbatim; `ApiUser` becomes the shared response type.

Create `apps/web/src/lib/api/users.ts`:

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

```bash
pnpm --filter @pathways/web exec vitest run src/lib/api/users.test.ts 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:"
```


Expected:

```text
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

All tests pass.

Prove them by mutation: each of the 20 changes below breaks one rule of the client and must fail a test.

Create `.tmp/s8a/mut-users-client.json`:

```json
[
 ["active label", "apps/web/src/lib/api/users.ts", "ACTIVE: 'Active',", "ACTIVE: 'Activated',"],
 ["invited label", "apps/web/src/lib/api/users.ts", "INVITED: 'Invited',", "INVITED: 'Pending',"],
 ["suspended label", "apps/web/src/lib/api/users.ts", "SUSPENDED: 'Suspended',", "SUSPENDED: 'Blocked',"],
 ["deactivated label", "apps/web/src/lib/api/users.ts", "DEACTIVATED: 'Deactivated',", "DEACTIVATED: 'Inactive',"],
 ["archived label", "apps/web/src/lib/api/users.ts", "ARCHIVED: 'Archived',", "ARCHIVED: 'Removed',"],
 ["sign-in method", "apps/web/src/lib/api/users.ts", "signInMethod: 'Supabase account'", "signInMethod: 'Password'"],
 ["list limit 199", "apps/web/src/lib/api/users.ts", "value.length > 200", "value.length > 199"],
 ["list limit 201", "apps/web/src/lib/api/users.ts", "value.length > 200", "value.length > 201"],
 ["list shape unchecked", "apps/web/src/lib/api/users.ts", "!Array.isArray(value) ||", "false ||"],
 ["list error code", "apps/web/src/lib/api/users.ts", "'Invalid user response.', 'network'", "'Invalid user response.', 'invalid'"],
 ["signal dropped", "apps/web/src/lib/api/users.ts", "requestFoundation('/users', { signal })", "requestFoundation('/users', {})"],
 ["authorize id dropped", "apps/web/src/lib/api/users.ts", "authUserId: input.authUserId,", ""],
 ["authorize name dropped", "apps/web/src/lib/api/users.ts", "fullName: input.fullName,\n          role: roleCodeByName[input.role],\n          projectIds: input.projectIds,\n        }),\n      })) as AuthorizedUserResponse,\n    )\n  },\n\n  async updateAuthorizedUser", "role: roleCodeByName[input.role],\n          projectIds: input.projectIds,\n        }),\n      })) as AuthorizedUserResponse,\n    )\n  },\n\n  async updateAuthorizedUser"],
 ["authorize role label", "apps/web/src/lib/api/users.ts", "role: roleCodeByName[input.role],\n          projectIds: input.projectIds,\n        }),\n      })) as AuthorizedUserResponse,\n    )\n  },\n\n  async update", "role: input.role,\n          projectIds: input.projectIds,\n        }),\n      })) as AuthorizedUserResponse,\n    )\n  },\n\n  async update"],
 ["authorize method", "apps/web/src/lib/api/users.ts", "method: 'POST',", "method: 'PUT',"],
 ["update id unencoded", "apps/web/src/lib/api/users.ts", "`/users/${encodeURIComponent(id)}`", "`/users/${id}`"],
 ["update method", "apps/web/src/lib/api/users.ts", "method: 'PATCH',", "method: 'PUT',"],
 ["update name dropped", "apps/web/src/lib/api/users.ts", "          fullName: input.fullName,\n          role: roleCodeByName[input.role],\n          accountStatus", "          role: roleCodeByName[input.role],\n          accountStatus"],
 ["update status inverted", "apps/web/src/lib/api/users.ts", "input.accountStatus === 'Active' ? 'ACTIVE' : 'DEACTIVATED'", "input.accountStatus === 'Active' ? 'DEACTIVATED' : 'ACTIVE'"],
 ["update projects dropped", "apps/web/src/lib/api/users.ts", "accountStatus: input.accountStatus === 'Active' ? 'ACTIVE' : 'DEACTIVATED',\n          projectIds: input.projectIds,", "accountStatus: input.accountStatus === 'Active' ? 'ACTIVE' : 'DEACTIVATED',"]
]
```

```bash
node .tmp/s8a/mutate.mjs .tmp/s8a/mut-users-client.json pnpm --filter @pathways/web exec vitest run src/lib/api/users.test.ts
```


Expected:

```text
unmutated: pass
active label: killed
invited label: killed
suspended label: killed
deactivated label: killed
archived label: killed
sign-in method: killed
list limit 199: killed
list limit 201: killed
list shape unchecked: killed
list error code: killed
signal dropped: killed
authorize id dropped: killed
authorize name dropped: killed
authorize role label: killed
authorize method: killed
update id unencoded: killed
update method: killed
update name dropped: killed
update status inverted: killed
update projects dropped: killed
mutations 20, survived 0
```

All 20 mutations are applied and killed.

In `apps/web/src/lib/services/pathways-client.ts` delete: the three `PathwaysClient` interface members `getUsers(signal?: AbortSignal): Promise<UserRecord[]>`, `authorizeExistingUser(input: AuthorizeExistingUserInput): Promise<UserRecord>` and `updateAuthorizedUser(id: string, input: UpdateAuthorizedUserInput): Promise<UserRecord>`; the three class methods of the same names (from `async getUsers(` to the closing `}` of `updateAuthorizedUser` and the blank line after it); `interface ApiUser { ... }`; `function mapUser(user: ApiUser): UserRecord { ... }`; `function parseUsers(value: unknown) { ... }`. The interface and the class are then empty, and Biome rejects an empty type (`noBannedTypes`), so delete `interface PathwaysClient { }`, `class BackendReadyPathwaysClient implements PathwaysClient { }` and `export const pathwaysClient: PathwaysClient = new BackendReadyPathwaysClient()` too: no code imports `pathwaysClient` as a value any more, and the file keeps only `recoverSourceMutation`. The `@/types/pathways`, `@/types/pathways-role` and `@pathways/shared` import statements go too, because only the deleted members used their names. Then:

```bash
for name in AuthorizeExistingUserInput UpdateAuthorizedUserInput UserRecord PathwaysRole roleCodeByName ApiUser mapUser parseUsers PathwaysClient BackendReadyPathwaysClient; do echo "$name $(grep -cw "$name" apps/web/src/lib/services/pathways-client.ts)"; done
```


Expected:

```text
AuthorizeExistingUserInput 0
UpdateAuthorizedUserInput 0
UserRecord 0
PathwaysRole 0
roleCodeByName 0
ApiUser 0
mapUser 0
parseUsers 0
PathwaysClient 0
BackendReadyPathwaysClient 0
```

Every line prints `0`: nothing of the users client is left in the file.

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
git grep -nE "\bpathwaysClient\b" -- apps/web/src ':!*.test.ts' ':!*.test.tsx' | grep -E "\.(getUsers|authorizeExistingUser|updateAuthorizedUser)\b" || echo "none left"
```


Expected:

```text
apps/web/src/features/projects/components/project-setup-form.tsx: 1, pathwaysClient import removed
apps/web/src/features/projects/team/project-team-editor-dialog.tsx: 1, pathwaysClient import removed
apps/web/src/features/settings/user-management-workspace.tsx: 6, pathwaysClient import removed
total: 8
none left
```

Each of the three files lost every other `pathwaysClient` call in S1b, so each line ends `, pathwaysClient import removed`; the total is 8 and the grep finds nothing (`none left`).

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

Delete the line `await expect(pathwaysClient.getUsers()).rejects.toMatchObject({ code: 'unauthorized' })` from the test that holds it (Task 0 Step 2 named the file, `lib/services/pathways-client.test.ts`) and change its import to `import { recoverSourceMutation } from './pathways-client'`; `usersClient` calls the same `requestFoundation`, whose unauthorized path stays covered there.

```bash
git grep -l "vi.mock('@/lib/api/users'" -- apps/web/src | wc -l
git grep -nE "\b(getUsers|authorizeExistingUser|updateAuthorizedUser)\b" -- apps/web/src/lib/services || echo "none left"
```


Expected:

```text
5
none left
```

The first prints `5`; the second finds nothing (`none left`).

- [ ] **Step 5: Run the tests and commit**

```bash
git add -N apps/web/src/lib/api
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/web/*.ts' 'apps/web/*.tsx') 2>&1 | tail -3
pnpm --filter @pathways/web exec vitest run src/lib src/features/settings src/features/projects 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:"
pnpm lint 2>&1 | tail -2
pnpm typecheck > .tmp/s8a/out/typecheck.txt 2>&1 && echo "typecheck clean"
(cd apps/web && npx tsc --noEmit --noUnusedLocals -p . 2>&1 | grep "error TS" | cut -c1-110)
pnpm --filter @pathways/web test 2>&1 | grep -aE "Test Files|Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/web/src
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(web): move the users client to lib/api/users with the shared response type

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -1
```


Expected:

```text
Checked 12 files in <ms>. Fixed 4 files.
 Test Files  111 passed (111)
      Tests  1429 passed (1429)
$ pnpm exec biome check .
Checked 1572 files in <ms>. No fixes applied.
typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but
src/types/pathways.ts(14,3): error TS6196: 'SadddDashboard' is declared but never used.
 Test Files  281 passed (281)
      Tests  2903 passed (2903)
<sha> refactor(web): move the users client to lib/api/users with the shared response type
```

All pass; web = Task 7 web count + 12 (the users client file).

- [ ] **Step 6: Move the own profile and public snapshot clients**

The script is the F4a script, unchanged.

Create `.tmp/s8a/repoint.mjs`:

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


Expected:

```text
apps/web/src/app/(public)/organizations/[slug]/page.tsx: 1
apps/web/src/app/(public)/public/projects/[projectId]/page.tsx: 1
apps/web/src/app/(public)/public/projects/page.tsx: 1
apps/web/src/features/profile/own-password-form.test.tsx: 1
apps/web/src/features/profile/own-password-form.tsx: 1
apps/web/src/features/profile/own-profile-workspace.test.tsx: 1
apps/web/src/features/profile/own-profile-workspace.tsx: 1
apps/web/src/features/public/public-organizations.tsx: 1
apps/web/src/features/public/public-tracker-view.test.tsx: 1
apps/web/src/features/public/public-tracker-view.tsx: 1
total: 10
```

The script rewrites 10 specifiers in 10 files. The moved `lib/api/profile.ts` keeps `import { requestFoundation } from '@/lib/api/core/request'` as F4b wrote it (ruling 15); the script does not touch it, because that module did not move. Then:

```bash
git grep -nE "lib/services/(own-profile-client|public-projects)" -- apps
git add -N apps/web/src/lib/api
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- 'apps/web/*.ts' 'apps/web/*.tsx') 2>&1 | tail -3
pnpm --filter @pathways/web exec vitest run src/features/profile src/features/public 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:"
pnpm lint 2>&1 | tail -2
pnpm typecheck > .tmp/s8a/out/typecheck.txt 2>&1 && echo "typecheck clean"
git checkout -- apps/web/next-env.d.ts
git add -A apps/web/src
git status --short apps/web/src | grep -c "^R"
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(web): move the own profile and public snapshot clients to lib/api

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -1
```


Expected:

```text
Checked 12 files in <ms>. Fixed 1 file.
 Test Files  10 passed (10)
      Tests  46 passed (46)
$ pnpm exec biome check .
Checked 1572 files in <ms>. No fixes applied.
typecheck clean
2
<sha> refactor(web): move the own profile and public snapshot clients to lib/api
```

The grep prints nothing, the tests pass and the rename count is `2`.

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

Neither moved client has a test of its own, so their behavior (the request options, the one million character cap, the error mapping, the revision patch) rests on the move alone. Pin it before the contracts change.

Create `apps/web/src/lib/api/public.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api/' },
}))

import { readPublicSnapshots } from './public'

const snapshot = {
  id: '10000000-0000-4000-8000-000000000001',
  title: 'Synthetic published project',
  code: 'SYN-01',
  approvedSummary: 'Approved synthetic summary.',
  area: 'Synthetic area',
  sector: 'Synthetic sector',
  startDate: null,
  endDate: null,
  publishedAt: '2026-09-27T00:00:00.000Z',
}
const reply = (body: unknown, status = 200) => {
  const fetcher = vi.fn(
    async (..._args: unknown[]) => new Response(JSON.stringify(body), { status }),
  )
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}

afterEach(() => vi.unstubAllGlobals())

describe('public snapshot client', () => {
  it('reads the list anonymously with a limit of 100 and no cookies, referrer or redirects', async () => {
    const fetcher = reply([snapshot])
    await expect(readPublicSnapshots()).resolves.toEqual([snapshot])
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:4000/api/public/projects?limit=100', {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: expect.any(AbortSignal),
    })
  })

  it('reads one project by id and returns it as a one item list', async () => {
    const fetcher = reply(snapshot)
    await expect(readPublicSnapshots(snapshot.id)).resolves.toEqual([snapshot])
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `http://127.0.0.1:4000/api/public/projects/${snapshot.id}`,
    )
  })

  it('answers not found for a malformed id without calling the API', async () => {
    const fetcher = reply(snapshot)
    await expect(readPublicSnapshots('not-a-uuid')).rejects.toThrow('PUBLIC_NOT_FOUND')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('refuses a single project that carries a field outside the allowlist', async () => {
    reply({ ...snapshot, budget: 1 })
    await expect(readPublicSnapshots(snapshot.id)).rejects.toThrow()
  })

  it.each([
    [404, 'PUBLIC_NOT_FOUND'],
    [500, 'PUBLIC_UNAVAILABLE'],
    [403, 'PUBLIC_UNAVAILABLE'],
  ])('maps status %s to %s', async (status, message) => {
    reply({}, status)
    await expect(readPublicSnapshots()).rejects.toThrow(message)
  })

  it('accepts a body of exactly one million characters and refuses one more', async () => {
    const json = JSON.stringify([snapshot])
    const padded = (extra: number) =>
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(json + ' '.repeat(1_000_000 - json.length + extra))),
      )
    padded(0)
    await expect(readPublicSnapshots()).resolves.toHaveLength(1)
    padded(1)
    await expect(readPublicSnapshots()).rejects.toThrow('PUBLIC_UNAVAILABLE')
  })

  it('refuses a body over one million characters and more than 100 projects', async () => {
    reply([{ ...snapshot, approvedSummary: 'a'.repeat(1_000_000) }])
    await expect(readPublicSnapshots()).rejects.toThrow('PUBLIC_UNAVAILABLE')
    reply(Array(101).fill(snapshot))
    await expect(readPublicSnapshots()).rejects.toThrow()
    reply(Array(100).fill(snapshot))
    await expect(readPublicSnapshots()).resolves.toHaveLength(100)
  })

  it('accepts the longest allowed area and sector and null for both', async () => {
    const longest = { ...snapshot, area: 'a'.repeat(500), sector: 'a'.repeat(300) }
    reply([longest, { ...snapshot, area: null, sector: null }])
    await expect(readPublicSnapshots()).resolves.toHaveLength(2)
  })

  it.each([
    ['an id that is not a UUID', { id: 'p1' }],
    ['an empty title', { title: '' }],
    ['a title over 300 characters', { title: 'a'.repeat(301) }],
    ['a code over 100 characters', { code: 'a'.repeat(101) }],
    ['an empty summary', { approvedSummary: '' }],
    ['a summary over 4000 characters', { approvedSummary: 'a'.repeat(4001) }],
    ['an area over 500 characters', { area: 'a'.repeat(501) }],
    ['a sector over 300 characters', { sector: 'a'.repeat(301) }],
    ['a publication date without a zone', { publishedAt: '2026-09-27T00:00:00' }],
    ['an unknown field', { budget: 1 }],
  ])('rejects %s', async (_label, change) => {
    reply([{ ...snapshot, ...change }])
    await expect(readPublicSnapshots()).rejects.toThrow()
  })
})
```

Create `apps/web/src/lib/api/profile.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.hoisted(() => ({ requestFoundation: vi.fn() }))
vi.mock('@/lib/api/core/request', () => ({ requestFoundation: request.requestFoundation }))

import { ownProfileClient } from './profile'

const profile = {
  fullName: 'Synthetic User',
  contactNumber: null,
  updatedAt: '2026-10-01T00:00:00.000Z',
}

beforeEach(() => request.requestFoundation.mockReset())

describe('own profile client', () => {
  it('reads the profile and parses the response', async () => {
    request.requestFoundation.mockResolvedValue(profile)
    await expect(ownProfileClient.read()).resolves.toEqual(profile)
    expect(request.requestFoundation).toHaveBeenCalledWith('/profile')
  })

  it('patches the profile with the expected revision and returns the saved one', async () => {
    request.requestFoundation.mockResolvedValue({ ...profile, contactNumber: '+63 900 000 0000' })
    const input = {
      fullName: 'Synthetic User',
      contactNumber: '+63 900 000 0000',
      expectedUpdatedAt: profile.updatedAt,
    }
    await expect(ownProfileClient.update(input)).resolves.toMatchObject({
      contactNumber: '+63 900 000 0000',
    })
    expect(request.requestFoundation).toHaveBeenCalledWith('/profile', {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
  })

  it.each([
    ['an unknown field', { ...profile, role: 'x' }],
    ['a missing name', { contactNumber: null, updatedAt: profile.updatedAt }],
    ['a revision that is not a timestamp', { ...profile, updatedAt: 'yesterday' }],
    ['a numeric contact', { ...profile, contactNumber: 5 }],
  ])('rejects a response with %s', async (_label, value) => {
    request.requestFoundation.mockResolvedValue(value)
    await expect(ownProfileClient.read()).rejects.toThrow()
    await expect(
      ownProfileClient.update({ fullName: 'a', contactNumber: '', expectedUpdatedAt: 'x' }),
    ).rejects.toThrow()
  })
})
```

```bash
pnpm --filter @pathways/web exec vitest run src/lib/api/public.test.ts src/lib/api/profile.test.ts src/features/public/public-tracker-view.test.tsx 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:"
```


Expected:

```text
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/features/public/public-tracker-view.test.tsx > public tracker view > rejects a public response whose area exceeds the API bound
AssertionError: promise resolved "[ { …(9) } ]" instead of rejecting
 FAIL  src/lib/api/public.test.ts > public snapshot client > rejects an area over 500 characters
 FAIL  src/lib/api/public.test.ts > public snapshot client > rejects a sector over 300 characters
AssertionError: promise resolved "[ { …(9) } ]" instead of rejecting
 Test Files  2 failed | 1 passed (3)
      Tests  3 failed | 28 passed (31)
```

The new tests of the area and sector bounds fail (the web copy of the schema has no `area` or `sector` bound); every other test passes against the moved code.

`apps/web/src/lib/api/public.ts`:
- Delete the local `const snapshot = z.object({ ... }).strict()` block and `export type PublicProjectSnapshot = z.infer<typeof snapshot>`.
- Add `import { type PublicProjectResponse, publicProjectResponse } from '@pathways/shared'` above `import { z } from 'zod'`.
- In `readPublicSnapshots` replace the return type `Promise<PublicProjectSnapshot[]>` with `Promise<PublicProjectResponse[]>` and the last line's `snapshot.parse(value)` and `z.array(snapshot)` with `publicProjectResponse.parse(value)` and `z.array(publicProjectResponse)`.

`apps/web/src/features/public/public-tracker-view.tsx` and `apps/web/src/features/public/public-organizations.tsx`: replace `import type { PublicProjectSnapshot } from '@/lib/api/public'` with `import type { PublicProjectResponse } from '@pathways/shared'` and every `PublicProjectSnapshot` with `PublicProjectResponse` (one use in each file).

`apps/web/src/lib/api/profile.ts`: delete the local `ownProfileResponseSchema` block and `export type OwnProfileRecord = ...`; replace `import { z } from 'zod'` with `import { type UpdateOwnProfileRequest, ownProfileResponse } from '@pathways/shared'`; replace both `ownProfileResponseSchema.parse(` with `ownProfileResponse.parse(`; replace the `update` parameter type `{ fullName: string; contactNumber: string; expectedUpdatedAt: string }` with `UpdateOwnProfileRequest`.

`apps/web/src/features/profile/own-profile-workspace.tsx`: replace `import { type OwnProfileRecord, ownProfileClient } from '@/lib/api/profile'` with `import { ownProfileClient } from '@/lib/api/profile'`, add `import type { OwnProfileResponse } from '@pathways/shared'`, and replace `record: OwnProfileRecord` with `record: OwnProfileResponse`.

```bash
git grep -nE "PublicProjectSnapshot|OwnProfileRecord|ownProfileResponseSchema" -- apps/web
pnpm exec biome check --write apps/web/src/lib/api apps/web/src/features/public apps/web/src/features/profile 2>&1 | tail -3
pnpm --filter @pathways/web exec vitest run src/lib/api src/features/public src/features/profile 2>&1 | grep -aE "Test Files|Tests +[0-9]+| FAIL |Error:"
pnpm lint 2>&1 | tail -2
pnpm typecheck > .tmp/s8a/out/typecheck.txt 2>&1 && echo "typecheck clean"
(cd apps/web && npx tsc --noEmit --noUnusedLocals -p . 2>&1 | grep "error TS" | cut -c1-110)
pnpm --filter @pathways/web test 2>&1 | grep -aE "Test Files|Tests +[0-9]+"
.tmp/s8a/build-routes.sh task8
git checkout -- apps/web/next-env.d.ts
git add -A apps/web/src
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "refactor(web): parse public snapshots and the own profile with the shared contracts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -1
```


Expected:

```text
Checked 89 files in <ms>. Fixed 2 files.
 Test Files  42 passed (42)
      Tests  529 passed (529)
$ pnpm exec biome check .
Checked 1574 files in <ms>. No fixes applied.
typecheck clean
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but
src/types/pathways.ts(14,3): error TS6196: 'SadddDashboard' is declared but never used.
 Test Files  283 passed (283)
      Tests  2930 passed (2930)
exit 0
ƒ Middleware                                                      <n> kB
<sha> refactor(web): parse public snapshots and the own profile with the shared contracts
```

The grep prints nothing; all pass; web = Step 5 count + 27 (the public client file 20, the profile client file 6 and the tracker view case 1); the build exits 0 and Middleware stays at 102 kB.

- [ ] **Step 8: Prove the two client tests by mutation**

Each mutation changes one request option, size cap, path, parse or body of the two clients; every one must make a test fail:

Create `.tmp/s8a/mut-clients.json`:

```json
[
 ["profile read path", "apps/web/src/lib/api/profile.ts", "requestFoundation('/profile'))", "requestFoundation('/profiles'))"],
 ["profile read unparsed", "apps/web/src/lib/api/profile.ts", "return ownProfileResponse.parse(await requestFoundation('/profile'))", "return (await requestFoundation('/profile')) as never"],
 ["profile update method", "apps/web/src/lib/api/profile.ts", "method: 'PATCH',", "method: 'PUT',"],
 ["profile update body", "apps/web/src/lib/api/profile.ts", "body: JSON.stringify(input),", "body: JSON.stringify({ fullName: input.fullName }),"],
 ["profile update unparsed", "apps/web/src/lib/api/profile.ts", "return ownProfileResponse.parse(\n      await requestFoundation('/profile', {\n        method: 'PATCH',\n        body: JSON.stringify(input),\n      }),\n    )", "return (await requestFoundation('/profile', {\n        method: 'PATCH',\n        body: JSON.stringify(input),\n      })) as never"],
 ["public cache", "apps/web/src/lib/api/public.ts", "cache: 'no-store',", "cache: 'default',"],
 ["public credentials", "apps/web/src/lib/api/public.ts", "credentials: 'omit',", "credentials: 'include',"],
 ["public redirect", "apps/web/src/lib/api/public.ts", "redirect: 'error',", "redirect: 'follow',"],
 ["public referrer", "apps/web/src/lib/api/public.ts", "referrerPolicy: 'no-referrer',", "referrerPolicy: 'origin',"],
 ["public signal", "apps/web/src/lib/api/public.ts", "signal: AbortSignal.timeout(10000),", ""],
 ["public limit", "apps/web/src/lib/api/public.ts", "'?limit=100'", "'?limit=50'"],
 ["public path", "apps/web/src/lib/api/public.ts", "/public/projects${", "/projects${"],
 ["public id check", "apps/web/src/lib/api/public.ts", "if (projectId && !z.string().uuid().safeParse(projectId).success)", "if (false)"],
 ["public 404", "apps/web/src/lib/api/public.ts", "response.status === 404", "response.status === 403"],
 ["public not ok", "apps/web/src/lib/api/public.ts", "if (!response.ok) throw new Error('PUBLIC_UNAVAILABLE')", ""],
 ["public size cap", "apps/web/src/lib/api/public.ts", "text.length > 1_000_000", "text.length > 2_000_000"],
 ["public size cap loosened to 999999", "apps/web/src/lib/api/public.ts", "text.length > 1_000_000", "text.length > 1_000_001"],
 ["public list cap", "apps/web/src/lib/api/public.ts", ".max(100)", ".max(101)"],
 ["public list cap tight", "apps/web/src/lib/api/public.ts", ".max(100)", ".max(99)"],
 ["public single unparsed", "apps/web/src/lib/api/public.ts", "[publicProjectResponse.parse(value)]", "[value as never]"],
 ["public list unparsed", "apps/web/src/lib/api/public.ts", "z.array(publicProjectResponse).max(100).parse(value)", "(value as never)"],
 ["public base trailing slash", "apps/web/src/lib/api/public.ts", ".replace(/\\/$/, '')", ""]
]
```

```bash
node .tmp/s8a/mutate.mjs .tmp/s8a/mut-clients.json pnpm --filter @pathways/web exec vitest run src/lib/api/public.test.ts src/lib/api/profile.test.ts
git status --short
```


Expected:

```text
unmutated: pass
profile read path: killed
profile read unparsed: killed
profile update method: killed
profile update body: killed
profile update unparsed: killed
public cache: killed
public credentials: killed
public redirect: killed
public referrer: killed
public signal: killed
public limit: killed
public path: killed
public id check: killed
public 404: killed
public not ok: killed
public size cap: killed
public size cap loosened to 999999: killed
public list cap: killed
public list cap tight: killed
public single unparsed: killed
public list unparsed: killed
public base trailing slash: killed
mutations 22, survived 0
```

All 22 mutations are applied and killed and the tree is clean after the runs.

---

### Task 9: Records and SAD routing

**Files:**
- Modify: `scripts/sad/check.ts` (organization isolation globs), `scripts/sad/check.test.ts`, `docs/sad-pathways.md:36`
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.6, 3.7, 9)
- Modify: `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05, MOD-06, MOD-11, MOD-16, MOD-17 rows)
- Modify: `docs/qad-pathways.md` (QAD-A05 row), `docs/index.md`, `docs/activity-log.md`

- [ ] **Step 1: Route the auth and users contracts to the organization isolation checker (ruling 12)**

`replace-exact.mjs` applies a JSON list of `[file, from, to, count]` replacements and writes nothing unless every count matches:

Create `.tmp/s8a/replace-exact.mjs`:

```js
// Applies exact text replacements, failing unless each one matches the expected number of times.
// Usage: node .tmp/s8a/replace-exact.mjs <replacements.json>, a list of [file, from, to, count].
import { readFileSync, writeFileSync } from 'node:fs'

const edits = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const texts = new Map()
for (const [file, from, to, count] of edits) {
  const text = texts.get(file) ?? readFileSync(file, 'utf8')
  const found = text.split(from).length - 1
  if (found !== count) throw new Error(`${file}: expected ${count} of ${JSON.stringify(from)}, found ${found}`)
  texts.set(file, text.replaceAll(from, to))
}
for (const [file, text] of texts) writeFileSync(file, text)
console.log(`${edits.length} replacements in ${texts.size} files`)
```

The first list adds the routing test after the test `routes shared rbac policy changes to the organization isolation checker`:

Create `.tmp/s8a/task9-sad-test.json`:

```json
[
 [
  "scripts/sad/check.test.ts",
  "    expect(routing([change(file, 'new', 'old')])['organization-isolation-checker']).toEqual([file])\n  })\n",
  "    expect(routing([change(file, 'new', 'old')])['organization-isolation-checker']).toEqual([file])\n  })\n\n  it('routes auth and user authorization contracts to the organization isolation checker', () => {\n    const files = [\n      'packages/shared/src/contracts/auth/auth-requests.ts',\n      'packages/shared/src/contracts/users/user-authorization.ts',\n    ]\n    const routed = routing(files.map((file) => change(file, 'new', 'old')))\n    expect(routed['organization-isolation-checker']).toEqual(files)\n  })\n",
  1
 ]
]
```

```bash
node .tmp/s8a/replace-exact.mjs .tmp/s8a/task9-sad-test.json
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Tests +[0-9]+| FAIL "
```


Expected:

```text
1 replacements in 1 files
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  scripts/sad/check.test.ts > routing and digest > routes auth and user authorization contracts to the organization isolation checker
      Tests  1 failed | 58 passed (59)
```

The new test fails (`organization-isolation-checker` holds no auth or users contract file yet).

The second list adds the two globs after `'packages/shared/src/rbac/**/*.ts',` in the `organization-isolation-checker` entry of `scripts/sad/check.ts` and the same two paths in `docs/sad-pathways.md` line 36 (inside the same cell):

Create `.tmp/s8a/task9-sad-edits.json`:

```json
[
 [
  "scripts/sad/check.ts",
  "      'packages/shared/src/rbac/**/*.ts',\n",
  "      'packages/shared/src/rbac/**/*.ts',\n      'packages/shared/src/contracts/auth/**/*.ts',\n      'packages/shared/src/contracts/users/**/*.ts',\n",
  1
 ],
 [
  "docs/sad-pathways.md",
  "`packages/shared/src/rbac/**/*.ts`, `apps/api/src/common/authz/**/*.ts`",
  "`packages/shared/src/rbac/**/*.ts`, `packages/shared/src/contracts/auth/**/*.ts`, `packages/shared/src/contracts/users/**/*.ts`, `apps/api/src/common/authz/**/*.ts`",
  1
 ]
]
```

```bash
node .tmp/s8a/replace-exact.mjs .tmp/s8a/task9-sad-edits.json
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Tests +[0-9]+| FAIL "
pnpm sad:typecheck 2>&1 | tail -2
```


Expected:

```text
2 replacements in 2 files
      Tests  59 passed (59)
$ tsc -p scripts/sad/tsconfig.json
```

sad = `B_sad + 1`.

- [ ] **Step 2: Amend the change record, the living docs and the index**

`task9-edits.json` holds the exact replacements: the response schema bullets of section 3.6 (the public snapshot and own profile parses, and the rule for a class-validator rule with no port), the S8 row of the roadmap (section 3.7), the S8a applied paragraph at the end of section 9, five audit rows, the QAD-A05 test path and the index status of the change record row. `@DATE@` is replaced by the day Task 9 runs:

Create `.tmp/s8a/task9-edits.json`:

```json
[
 [
  "docs/cr-pathways-codebase-modularization.md",
  "the indicator response and list schemas are parsed by the api mapper and the web client (amended for S3a).\n",
  "the indicator response and list schemas are parsed by the api mapper and the web client (amended for S3a), the public project snapshot is parsed by the API as the anonymous allowlist and by the web, and the own profile response is parsed by the web (amended for S8a).\n- Where a class-validator rule has no port in `contracts/common/field-schemas.ts` (only `IsEmail`), the API refines the shared contract with the class-validator function in `<domain>.helpers.ts` (`auth.helpers.ts` for sign-in). A `null` `projectIds` on `POST users/authorize-existing` is now rejected with 400; the DTO let it through to a 403 `Application scope could not be verified.` after an identity directory lookup (amended for S8a).\n",
  1
 ],
 [
  "docs/cr-pathways-codebase-modularization.md",
  "| S8 | Public, users, profile, auth and MFA | Least coupled |",
  "| S8a, S8b | Public, users, profile, auth and MFA (S8a contracts, clients and dead code; S8b components and feature layout) | Least coupled; S8a applied |",
  1
 ],
 [
  "docs/cr-pathways-codebase-modularization.md",
  "for W1 to close what remains.\n",
  "for W1 to close what remains.\n\nS8a applied @DATE@ on the S8a slice branch:\n- Contracts: the users (`contracts/users/user-authorization.ts`), own profile (`contracts/profile/own-profile.ts`), sign-in and step-up PIN (`contracts/auth/auth-requests.ts`) and public project and publication (`contracts/public/public-projects.ts`) contracts, built on the S1 field schemas; the API refines sign-in with `isEmail` (`auth.helpers.ts`). Each contract has a boundary table test, so every rule the deleted DTO held (length limits counted in characters, the role and status lists, the uuid shape, the project list at 100 and 101, each unknown key) is pinned by a test that survives the parity tests, and every rule is mutated once.\n- Validation: the users, own profile, sign-in and three PIN routes use `ZodPipe`; parity tests ran each DTO and its contract through the configured pipes over 85 JSON bodies before the six DTO classes were deleted, and 84 agreed exactly (the 85th is the null `projectIds` of ruling 4); an HTTP test covers each switched controller and every route that lost its pipe or parses the wrong contract fails a mutation. No class-validator DTO remains in the API, so `controller-dto-runtime-metadata.test.ts` and `field-schemas-parity.test.ts` were deleted; the `class-validator` dependency stays because the global `ValidationPipe` loads it and `auth.helpers.ts` uses `isEmail`.\n- Public: `public.dto.ts` moved to shared; `public-projects.controller.ts` and `publication.controller.ts` hold one controller each (`same lines: 70`); a route test pins the method, path, access rule and cache header of every route and the 403 of the publication routes without a profile; publication bodies are still parsed in `PublicService`.\n- Web: `usersClient` (`lib/api/users.ts`), `ownProfileClient` (`lib/api/profile.ts`) and `readPublicSnapshots` (`lib/api/public.ts`) with a test file each; 8 user calls and 5 test mocks repointed; the web `ApiUser`, public snapshot and own profile schemas replaced by the shared contracts, which also gave the public snapshot its `area` and `sector` bounds (500 and 300), the bounds the API already enforced.\n- Dead code: `public-project-detail.tsx`, `public-project-charts.tsx`, `public-dashboard-config.ts`, their tests, `profile-validation.ts` and its test (1569 lines), `mapPublicSnapshot` and seven `Public*` view models deleted; `docs/deferred-features.md` records the removed microsite detail.\n- Kernel and deferred items closed: `requestIdentity` replaces the local application profile checks in the users and authorized data controllers (route tables and the 403 pinned first), `aggregateOnlyRoles` replaces the two route policy literals, the access matrix role test and the two aggregate-only entries of `assessmentDetailDeniedRoles`, `routeUuidPattern` replaces the mutation ticket regex, `Tx` replaces four transaction client annotations, and `readWorkspaceContextCookie` is the one browser read of the workspace context cookie (`request.ts` and `request-owner.ts` call it); the empty `PathwaysClient` interface and class were deleted with the last user methods.\n- SAD: organization isolation routing covers `packages/shared/src/contracts/auth/**/*.ts` and `packages/shared/src/contracts/users/**/*.ts`.\n- Middleware: web Middleware stayed at 102 kB (Task 0, 6, 7 and 8 builds).\n- Decisions: S8 split into S8a and S8b (ruling 1); the microsite detail was deleted, not split, because nothing imported it (ruling 2); exact acceptance came from the S1 field schemas plus the class-validator `isEmail` function, because zod differs on emails and S1 ports no email rule (ruling 3); the DTO-only metadata and field schema parity tests went with the last DTO while `class-validator` stays (ruling 14); a null `projectIds` is the one accepted difference (ruling 4); `authUserId must be a UUID` is the one reachable message kept (ruling 5); the avatar stack keeps its derived \"And\" label as a display decision for the developer (ruling 10); the step-up and route-access project lookups stay inline because `requireScopedProject` would change their 503 and 404 answers (ruling 11); the three workspace cookie reads became one with the `split(';')` and `trim` form, which reads browser and jsdom cookie strings exactly as the `'; '` split did (ruling 16); the assessment detail denial reads `aggregateOnlyRoles` plus the system administrator, the same three roles (ruling 10).\n\nDeferred to S8b: the publication and audit clients, the user management and MFA component splits, and the feature layout for auth, profile, public and settings.\n",
  1
 ],
 [
  "docs/qad-pathways.md",
  "`apps/api/src/modules/users/users.validation.test.ts`",
  "`apps/api/src/modules/users/users.controller.validation.test.ts`",
  1
 ],
 [
  "docs/index.md",
  "S7c and S7d applied, S8a next",
  "S7c, S7d and S8a applied, S8b next",
  1
 ],
 [
  "docs/audit-pathways-codebase-modularity-20261009.md",
  "the dashboards and analytics clients by S7c. |",
  "the dashboards and analytics clients by S7c; users, own profile and public snapshot clients moved to lib/api by S8a. |",
  1
 ],
 [
  "docs/audit-pathways-codebase-modularity-20261009.md",
  "into helpers and three components by S7d. |",
  "into helpers and three components by S7d; the dead `public-project-detail.tsx` deleted by S8a. |",
  1
 ],
 [
  "docs/audit-pathways-codebase-modularity-20261009.md",
  "the stored project status copies shared by S7b. |",
  "the stored project status copies shared by S7b; the auth, users, own profile and public DTOs replaced by S8a. |",
  1
 ],
 [
  "docs/audit-pathways-codebase-modularity-20261009.md",
  "and `DashboardSeverity` by S7d. |",
  "and `DashboardSeverity` by S7d; the aggregate-only role lists, the mutation ticket pattern and the workspace cookie read by S8a. |",
  1
 ],
 [
  "docs/audit-pathways-codebase-modularity-20261009.md",
  "dashboard laid out by S7d. |",
  "dashboard laid out by S7d; the public controllers split one per file by S8a. |",
  1
 ]
]
```

```bash
D=$(date +%F)
sed -i "s/@DATE@/$D/g" .tmp/s8a/task9-edits.json
grep -c "@[A-Z0-9_]*@" .tmp/s8a/task9-edits.json
node .tmp/s8a/replace-exact.mjs .tmp/s8a/task9-edits.json
sed -i '/(superpowers\/plans\/.*modularization-s8-public-users-auth/s/| In progress |$/| S8a executed; holds the S8b outline |/' docs/index.md
git diff --stat docs | cat
git diff docs/audit-pathways-codebase-modularity-20261009.md | grep "^+" | grep -oE ".{70} \|$"
grep "^| \[cr-pathways-codebase-modularization\]" docs/index.md | grep -oE "\| [^|]*\|$"
grep -c "S8a executed" docs/index.md
git grep -nE "users\.validation\.test|lib/services/(own-profile-client|public-projects)|public\.dto|users\.dto|profile\.dto|signin-lockout\.dto|beneficiary-step-up-pin\.dto|modules/public/public\.controller" -- docs scripts AGENTS.md README.md ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/cr-*' ':!docs/superpowers/*' ':!docs/handoff' ':!docs/deferred-features.md' | cut -c1-150 || echo "none left"
```


Expected:

```text
0
10 replacements in 4 files
 docs/audit-pathways-codebase-modularity-20261009.md | 10 +++++-----
 docs/cr-pathways-codebase-modularization.md         | 18 ++++++++++++++++--
 docs/index.md                                       |  4 ++--
 docs/qad-pathways.md                                |  2 +-
 docs/sad-pathways.md                                |  2 +-
 5 files changed, 25 insertions(+), 11 deletions(-)
sers, own profile and public snapshot clients moved to lib/api by S8a. |
omponents by S7d; the dead `public-project-detail.tsx` deleted by S8a. |
 by S7b; the auth, users, own profile and public DTOs replaced by S8a. |
sts, the mutation ticket pattern and the workspace cookie read by S8a. |
ard laid out by S7d; the public controllers split one per file by S8a. |
| Approved; F1 to F4b, S1a, S1b, S2a, S2b, S3a, S3b, S4a, S4b, S4c, S5a, S5b, S5c, S6a, S6b, S6c, S7a, S7b, S7c, S7d and S8a applied, S8b next |
1
```

The placeholder count is `0`, the script reports `10 replacements in 4 files` (CR 3.6 and 3.7, section 9, the five audit rows, QAD and SAD), the stat lists those four files (the index through the status edit) and `docs/sad-pathways.md` from Step 1, the five audit lines are the rows that now name S8a, the CR row of the index ends `S7d and S8a applied, S8b next`, the plan row count is `1`, and the stale reference grep prints `none left` (the deferred features register names the removed files on purpose and is excluded).

- [ ] **Step 3: Activity log**

`.tmp/s8a/activity-s8a.md` is the S8a section of the activity log, with the commit hashes of Tasks 1 to 8 as `@H1A@` (the contract commit) and `@H1@` (the switch) and so on; Task 8 has three commits, `@H8A@`, `@H8B@` and `@H8@`; the Task 7 hash is the deletion commit that the deferred features register points to:

Create `.tmp/s8a/activity-s8a.md`:

```md

## @DATE@ Modularization S8a public, users, profile and auth (S8a slice branch)
- Task 1 (@H1A@, @H1@): the users contract with 19 tests (boundary tables for every rule the DTOs held), a 41 test parity file of both DTOs and the contract through the configured pipes, then the two routes switched to `ZodPipe` and `users.dto.ts`, its metadata test and the parity test deleted; a 6 test HTTP file pins both routes; 21 mutations of the contract and 4 of the routes each fail a test.
- Task 2 (@H2A@, @H2@): the own profile contract with 30 tests, a 17 row parity test, the route switched and `profile.dto.ts` deleted; 4 HTTP tests; 27 mutations (one equivalent survivor, the contact maximum that the pattern also holds) and 1 HTTP mutation killed.
- Task 3 (@H3A@, @H3@): the sign-in and step-up PIN contracts with 21 tests, a 27 row parity test, `signInBody` with the class-validator email rule, the four routes switched, both auth DTOs and the two DTO-only tests (`controller-dto-runtime-metadata.test.ts`, `field-schemas-parity.test.ts`) deleted; 10 HTTP tests; 18 and 6 mutations killed.
- Task 4 (@H4A@, @H4@): `public.dto.ts` moved to `contracts/public/public-projects.ts` with 38 tests and 34 mutations killed; the public and publication controllers split verbatim (`same lines: 70`) with a 4 test route table (22 mutations killed).
- Task 5 (@H5A@, @H5@): four `Tx` annotations and `requestIdentity` in the users and authorized data controllers after 11 tests pinned their routes, permissions and 403 messages against the old code (22 and 6 mutations killed).
- Task 6 (@H6A@, @H6@): `aggregateOnlyRoles` and `routeUuidPattern` replace the duplicated literals after 2 shared and 18 web tests pinned them (14 mutations, three equivalent survivors in the route ceiling), and `readWorkspaceContextCookie` became the one browser read of the workspace cookie (9 tests, 8 mutations).
- Task 7 (@H7@): the dead public microsite detail, its charts and config, `profile-validation.ts`, `mapPublicSnapshot` and seven view models deleted (1569 lines of files); the deferred features register records the removal and points to this commit.
- Task 8 (@H8A@, @H8B@, @H8@): `usersClient` (12 tests, 20 mutations), the own profile and public snapshot clients moved to `lib/api` (20 and 6 tests, 22 mutations) and the shared response contracts adopted; the empty `PathwaysClient` class was deleted.
- Task 9: the auth and users contracts route to the organization isolation checker, and the change record, audit, QAD and index record the slice.
- Decisions: the S8a decisions are in the change record section 9; this plan stays because it holds the S8b outline, and the plan copies are retired by the controller after the series is merged.
- Deferred: the publication and audit clients, the user management and MFA splits and the feature layout of auth, profile, public and settings (S8b).
```

```bash
D=$(date +%F)
h() { git log -1 --format=%h --grep="$1"; }
sed -i -e "s/@DATE@/$D/" \
  -e "s/@H1A@/$(h '^feat(shared): add the users contracts')/" -e "s/@H1@/$(h '^refactor(api): validate the users bodies')/" \
  -e "s/@H2A@/$(h '^feat(shared): add the own profile contracts')/" -e "s/@H2@/$(h '^refactor(api): validate the own profile body')/" \
  -e "s/@H3A@/$(h '^feat(shared): add the sign-in and step-up PIN')/" -e "s/@H3@/$(h '^refactor(api): validate the sign-in and step-up PIN')/" \
  -e "s/@H4A@/$(h '^refactor(shared): move the public project and publication')/" -e "s/@H4@/$(h '^refactor(api): give the public projects')/" \
  -e "s/@H5A@/$(h '^refactor(api): annotate the auth and users')/" -e "s/@H5@/$(h '^refactor(api): use requestIdentity')/" \
  -e "s/@H6A@/$(h '^refactor: use aggregateOnlyRoles')/" -e "s/@H6@/$(h '^refactor(web): read the workspace context cookie')/" \
  -e "s/@H7@/$(h '^refactor(web): delete the dead public microsite')/" \
  -e "s/@H8A@/$(h '^refactor(web): move the users client')/" -e "s/@H8B@/$(h '^refactor(web): move the own profile and public snapshot')/" -e "s/@H8@/$(h '^refactor(web): parse public snapshots')/" .tmp/s8a/activity-s8a.md
grep -c "@[A-Z0-9_]*@" .tmp/s8a/activity-s8a.md
cat .tmp/s8a/activity-s8a.md >> docs/activity-log.md
tail -13 docs/activity-log.md | cut -c1-90
```


Expected:

```text
0

## YYYY-MM-DD Modularization S8a public, users, profile and auth (S8a slice branch)
- Task 1 (8d9f089, ae06e2e): the users contract with 19 tests (boundary tables for every r
- Task 2 (da17bc3, c1fd5d4): the own profile contract with 30 tests, a 17 row parity test,
- Task 3 (4fdf1d8, 1617afb): the sign-in and step-up PIN contracts with 21 tests, a 27 row
- Task 4 (4ccac1a, 6dc3085): `public.dto.ts` moved to `contracts/public/public-projects.ts
- Task 5 (c48aec1, d300c14): four `Tx` annotations and `requestIdentity` in the users and 
- Task 6 (3c7ed12, ff0ea7d): `aggregateOnlyRoles` and `routeUuidPattern` replace the dupli
- Task 7 (<sha>): the dead public microsite detail, its charts and config, `profile-vali
- Task 8 (5078c1d, 4c1976e, eccbf16): `usersClient` (12 tests, 20 mutations), the own prof
- Task 9: the auth and users contracts route to the organization isolation checker, and th
- Decisions: the S8a decisions are in the change record section 9; this plan stays because
- Deferred: the publication and audit clients, the user management and MFA splits and the 
```

The placeholder count is `0` and the tail shows the blank line, the heading and the eleven bullets (Tasks 1 to 9, decisions, deferred) with their hashes.

- [ ] **Step 4: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint 2>&1 | tail -1
git add docs scripts/sad/check.ts scripts/sad/check.test.ts
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "docs: record modularization S8a and route auth and users contracts to the isolation checker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -1
```


Expected:

```text

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
Checked 1574 files in <ms>. No fixes applied.
<sha> docs: record modularization S8a and route auth and users contracts to the isolation checker
```

`docs:check` keeps the 6 baseline failures and 1 warning.


---

### Task 10: Release gates

**Files:**
- Modify: `docs/activity-log.md` (the gate line)

This slice opens no pull request and merges nothing: it is stacked below the end of the series, and the one pull request into `dev` that follows the last slice carries the DB replay and the other CI gates (its replay is the replay gate of this slice). The gates below run on the slice branch and are recorded in the activity log.

- [ ] **Step 1: Static gates**

The recursive test run uses the no-bail option as in Task 0, so a flake in one package does not hide the figures of the others:

```bash
pnpm lint 2>&1 | tail -2
pnpm typecheck > .tmp/s8a/out/typecheck.txt 2>&1 && echo "typecheck clean"
git checkout -- apps/web/next-env.d.ts
pnpm -r --no-bail --if-present run test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Test Files|Tests +[0-9]+| FAIL "
pnpm sad:test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -aE "Tests +[0-9]+| FAIL "
(cd apps/web && npx tsc --noEmit --noUnusedLocals -p . 2>&1 | grep "error TS" | cut -c1-110)
(cd apps/api && npx tsc --noEmit --noUnusedLocals -p . 2>&1 | grep "error TS" | cut -c1-110)
pnpm docs:check 2>&1 | tail -3
```


Expected:

```text
$ pnpm exec biome check .
Checked 1574 files in <ms>. No fixes applied.
typecheck clean
packages/config test:  Test Files  2 passed (2)
packages/config test:       Tests  19 passed (19)
packages/shared test:  Test Files  50 passed (50)
packages/shared test:       Tests  840 passed (840)
packages/imports test:  Test Files  11 passed (11)
packages/imports test:       Tests  94 passed (94)
apps/api test:  Test Files  161 passed | 10 skipped (171)
apps/api test:       Tests  2593 passed | 21 skipped (2614)
apps/web test:  Test Files  283 passed (283)
apps/web test:       Tests  2930 passed (2930)
      Tests  59 passed (59)
src/features/collection/forms/hooks/use-collection-state.ts(39,10): error TS6133: 'indicators' is declared but
src/types/pathways.ts(14,3): error TS6196: 'SadddDashboard' is declared but never used.
prisma/hosted-realistic-seed.ts(504,9): error TS6133: 'storage' is declared but its value is never read.
src/modules/participants/participants.service.ts(30,55): error TS6138: Property 'prisma' is declared but its v

6 failure(s), 1 warning(s) over checks: agents, voice, scrutiny, inception, trace, coverage, currency, filing, project-specific
[ELIFECYCLE] Command failed with exit code 1.
```

Lint and typecheck are clean. The recursive test run prints the Task 0 baselines for config (19), imports (94) and the skipped api files, and the end figures: shared 50 files and 840 tests, api 161 files with 2593 passed and 21 skipped, web 283 files and 2930 tests, sad 59. `--noUnusedLocals` lists only the four baseline lines (two in the web app, two in the api). `docs:check` keeps the 6 baseline failures and 1 warning.

- [ ] **Step 2: Production builds and the dist layout**

The web build is the route table of a clean `.next`; the api build is `exec nest build` (never `pnpm build` at the root, which runs `prisma generate`). The new files must exist in the compiled output and the deleted ones must not:

```bash
.tmp/s8a/build-routes.sh gates
git checkout -- apps/web/next-env.d.ts
for t in baseline task6 task7 task8; do node .tmp/s8a/compare-routes.mjs .tmp/s8a/routes-$t.txt .tmp/s8a/routes-gates.txt | grep -E "\(\+|^routes"; done
grep Middleware .tmp/s8a/routes-gates.txt | grep -oE "[0-9]+ kB" | cut -d' ' -f1
cat .tmp/s8a/m0
pnpm --filter @pathways/shared build > /dev/null 2>&1 && echo "shared built"
rm -rf apps/api/dist && pnpm --filter @pathways/api exec nest build 2>&1 | tail -3; echo "nest exit $?"
test -f packages/shared/dist/contracts/users/user-authorization.js && test -f packages/shared/dist/contracts/auth/auth-requests.js && test -f apps/api/dist/apps/api/src/modules/public/publication.controller.js && test -f apps/api/dist/apps/api/src/modules/public/public-projects.controller.js && test -f apps/api/dist/apps/api/src/modules/auth/auth.helpers.js && test ! -e apps/api/dist/apps/api/src/modules/users/users.dto.js && test ! -e apps/api/dist/apps/api/src/modules/auth/signin-lockout.dto.js && test ! -e apps/api/dist/apps/api/src/modules/public/public.controller.js && echo "dist layout ok"
```


Expected:

```text
exit 0
ƒ Middleware                                                      <n> kB
/settings/profile: 223 kB -> 224 kB (+1.0)
routes 72, different 6
/projects/[projectId]/budget: 315 kB -> 316 kB (+1.0)
/projects/[projectId]/evidence: 315 kB -> 316 kB (+1.0)
/projects/[projectId]/monitor-evaluate: 315 kB -> 316 kB (+1.0)
/settings/profile: 223 kB -> 224 kB (+1.0)
routes 72, different 8
/projects/[projectId]/budget: 315 kB -> 316 kB (+1.0)
/projects/[projectId]/evidence: 315 kB -> 316 kB (+1.0)
/projects/[projectId]/monitor-evaluate: 315 kB -> 316 kB (+1.0)
/settings/profile: 223 kB -> 224 kB (+1.0)
routes 72, different 8
routes 72, different 0
<n>
<n>
shared built
nest exit 0
dist layout ok
```

The build exits 0 with Middleware at `M0` (102 kB). Against the Task 0 table (the first compare) `/settings/profile` is 1.0 kB bigger (the page now bundles the shared own profile contract, whose length rule the web copy implemented separately) and five routes (`/dashboard`, `/projects/[projectId]`, its indicators page, `/settings/users` and `/transparency`) are 1.0 kB smaller (only the bigger lines print); against the `task6` and `task7` tables the three project routes (budget, evidence, monitor-evaluate) are 1.0 kB bigger again after the clients moved to `lib/api`; the `task8` table differs by 0. Growth of more than 1.0 kB on any route stops the task and is reported. `nest exit 0` and `dist layout ok` print (the files the slice adds exist and the ones it deletes do not).

- [ ] **Step 3: Local DB replay**

```bash
id -u
command -v pwsh || echo "pwsh missing"
ls /usr/lib/postgresql/18/bin 2>&1 | head -1
command -v supabase || echo "supabase missing"
command -v docker || echo "docker missing"
pwsh ./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline 2>&1 | head -4
```


Expected:

```text
0
/usr/bin/pwsh
clusterdb
supabase missing
/usr/bin/docker
HISTORICAL_MIGRATION_INTEGRITY=PASS
initdb: error: cannot be run as root
initdb: hint: Please log in (using, e.g., "su") as the (unprivileged) user that will own the server process.
PHASE6_LOCAL_REPLAY=FAILED; Disposable cluster creation failed.
```

The replay printed `0` for the user id (root), `pwsh` present, PostgreSQL 18 present (`clusterdb` is the first file of the folder), `supabase` missing and the Docker command present, and the replay command itself stopped at the disposable cluster: `HISTORICAL_MIGRATION_INTEGRITY=PASS`, then `initdb: error: cannot be run as root` and `PHASE6_LOCAL_REPLAY=FAILED; Disposable cluster creation failed.` The replay needs `pwsh`, PostgreSQL 18 in `/usr/lib/postgresql/18/bin` and a non-root user; where it runs, expect exit 0. S8a changes no migration, so when the replay cannot run here the CI replay of the final pull request of the series is the gate; record in the gate line of Step 6 which one ran.

- [ ] **Step 4: Local stack, compiled API probes, e2e and smoke**

If supabase or Docker is missing, record this step (seeds, the `pnpm dev:local` boot and the curl probes, both Playwright configs and the browser smoke) as pending local run in the gate line and list it for the developer; do not skip Steps 1, 2, 3 or 5. Stop anything on ports 3000 and 4000 first, then:

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

Expected: `"status":"ok"`; the first sign-in probe answers `{"statusCode":400,"message":["email must be an email"],"error":"Bad Request"}` (key order may differ) and `400`, the second answers 400 with `Unrecognized key(s) in object: 'remember'`, neither body contains `pppp` (Review Focus 1 and 3); the public list answers `200`; a module-resolution or Nest dependency error in the `pnpm dev:local` output fails the gate; auth-navigation passes in full; the main suite shows the pass, fail and not run counts of the latest gate line in `docs/activity-log.md` (the S7a line read 39 pass, 9 fail, 22 not run; a later gate line wins). Browser smoke, each step as a demo user whose role allows it: sign in with password and TOTP (sign-in route) and land on `/workspace`; as System Administrator open `/settings/users`, create a Program Manager (no project needed) with the Auth user ID `71000000-0000-0000-8000-000000000001` and confirm the editor shows `authUserId must be a UUID` (Review Focus 2), then edit a user's role and project access and deactivate and reactivate a test account (users routes, `usersClient`); open a project's team editor and the project setup form and confirm the user lists load (`usersClient.getUsers`); open My Profile, change the contact number and save, and save again with the same values (own profile route, `ownProfileClient`); open `/public/projects`, a public project page and an organization page signed out (`readPublicSnapshots`); open the transparency queue and a staff preview and submit a summary for review (publication controller, shared publication schema); reload a project page with the browser network panel open and confirm its API requests carry `X-Pathways-Organization-Id`, then sign out and back in and confirm the workspace loads (the single cookie read). Every step must behave as on dev. The step-up PIN UI is hidden (`STEP_UP_PIN_UI_ENABLED = false`), so its routes rest on the Task 3 HTTP test and parity table.

- [ ] **Step 5: SAD review**

```bash
mkdir -p .tmp/sad/s8a
pnpm sad:check --base "$(cat .tmp/s8a/base-sha)" --head HEAD --output .tmp/sad/s8a/manifest.json > .tmp/sad/s8a/check.out 2>&1; echo "exit $?"
node -e "const m = JSON.parse(require('fs').readFileSync('.tmp/sad/s8a/manifest.json', 'utf8')); for (const [role, files] of Object.entries(m.required_subagents)) console.log(role, files.length)"
```


Expected:

```text
exit 0
organization-isolation-checker 18
beneficiary-privacy-guardian 33
restraint-guardian 2
design-qa-agent 94
```

The check exits 0 and routes the changed paths to four roles: `organization-isolation-checker` 18, `beneficiary-privacy-guardian` 33, `restraint-guardian` 2 and `design-qa-agent` 94 (above the 60 path split).

Dispatch every role the manifest requires with the section 4.2 handoff packet from `docs/sad-pathways.md` (layout in `docs/handoff/sad-packet-example.md`; split a role above 60 paths, which `design-qa-agent` needs), transcribe each reply into `.tmp/sad/s8a/reply-<role>.txt`, copy `docs/handoff/sad-assemble.mjs` to `.tmp/sad/s8a/assemble.mjs`, run `node .tmp/sad/s8a/assemble.mjs` (it writes `reviews.json`), then:

```bash
pnpm sad:signoff -- --base "$(cat .tmp/s8a/base-sha)" --head HEAD --reviews .tmp/sad/s8a/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun. The replay of this plan could not dispatch the roles (it ran as a script, without subagents), so the sign-off is pending for the cloud run.

- [ ] **Step 6: Record the gate results**

Append a final bullet to the Task 9 activity-log section with the gate results (per-package counts, Middleware size, the DB replay exit code or "CI of the final pull request", seed results, compiled API probe results, e2e pass counts and smoke result or pending local run, SAD sign-off, and that no pull request is opened for this slice). The bullet of the replay, to adapt with your own numbers (every figure must equal the Task 0 baseline plus the deltas of Tasks 1 to 8):

```bash
cat >> docs/activity-log.md <<'LOG'
- Gates (cloud container): lint, typecheck and tests pass with config 19, shared 840, imports 94, api 2593 passed and 21 skipped, web 283 files and 2930 tests, sad 59; docs check 6 failures and 1 warning (baseline); production build exit 0 with Middleware at M0 (102 kB in this container) and 72 routes, none different from the Task 8 build (`/settings/profile` is 1 kB bigger and five routes 1 kB smaller than the Task 0 build); api `nest build` and the dist layout ok; local DB replay (CI of the final pull request), seeds, compiled API probes, e2e and browser smoke pending local run; SAD sign-off pending; no pull request for this slice, the final pull request of the series carries the CI replay.
LOG
git add docs/activity-log.md
git -c user.name=ceezey -c user.email=149393386+ceezey@users.noreply.github.com commit -q -m "docs: record modularization S8a release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015GXgWsghnfykNXQ8sJ5BRx"
git log --oneline | head -1
```

Expected:

```text
<sha> docs: record modularization S8a release gate results
```

---

## S8b outline (web components and feature layout, its own slice branch)

The S8b plan is its own file and replaces this outline; its Task 0 recounts every number below on the S8a tree. No task of either slice opens a pull request, merges or removes a plan copy: the controller opens the stacked pull requests after the last slice and retires the plan copies after the series is merged.

- **Task 0, baseline:** recount after S4b to S7b (line counts, `useState` counts, importers); confirm the S6 assumption (the `core-feature-client.ts` exports left after S6); record web Middleware.
- **Task 1, publication and audit clients:** `coreFeatureClient.publication` and `transitionPublication` move to `lib/api/publication.ts` as `publicationClient`, keeping their `captureRequestOwner` (F4b) ownership check and their own response handling (F4b ruling 10); the publication snapshot schema becomes `publicProjectResponse.omit({ publishedAt: true })` (identical fields and bounds today) and the transition body type `PublicationTransitionRequest`; `coreDataClient.audit` moves to `lib/api/audit.ts` as `auditClient`; `lib/services/core-feature-client.ts` is deleted once empty. Callers: `public-tracker-preview.tsx`, `publication-queue-workspace.tsx`, `audit-log-workspace.tsx`; mocks: their three tests (counted before and after) and `core-feature-client.test.ts` cases for the moved members. The publication client reads through `lib/api/core/owned-json-read.ts`, where S6b moved the owned read.
- **Task 2, user management split:** `user-management-workspace.tsx` (938 lines) splits verbatim into `features/settings/components/{account-metric,user-account-row,user-editor-dialog,user-detail-dialog}.tsx` and a `hooks/use-user-directory.ts` for the load, refresh and pending-create state; `formatAccountDate` and `emptyEditor` go to `settings.utils.ts` (CR 3.5); `AUTH_USER_ID_PATTERN` stays (a client hint, the API decides). The existing workspace test runs unchanged.
- **Task 3, MFA form split:** `mfa-form.tsx` (717 lines, one exported component) splits into `features/auth/components/` and `hooks/` (the S8b plan fixes the cut); `mfa-form.test.tsx` (280 lines) runs unchanged; `lib/auth/mfa-flow.ts` keeps the transport.
- **Task 4, feature surfaces:** `components/`, `hooks/` and `index.ts` for `features/auth`, `features/profile`, `features/public` and `features/settings`; app routes and other features import only from `index.ts` (on the S8a tree only app route files and the own profile schema, for `strongPasswordSchema`, import these four features); `strongPasswordSchema` is exported from the auth surface; `own-profile-contract.ts` is renamed `own-profile.schema.ts` (CR 3.5 suffix). Add `'auth'`, `'profile'`, `'public'` and `'settings'` to `indexedFeatures` in `apps/web/src/import-direction.test.ts` and `'@/features/<name>'` for each to `optimizePackageImports` in `apps/web/next.config.ts`, as S5b to S7b do.
- **Task 5, records:** CR section 9 S8b disposition and the end of the slice roadmap, audit MOD-06 (`user-management-workspace.tsx`, `mfa-form.tsx`), MOD-15 (S8 feature surfaces), index, activity log.
- **Task 6, release gates:** as S8a Task 10 (gates only, no merge and no plan copy removal), with a smoke over MFA enrollment and challenge, recovery, user management, the audit log, the public site and the transparency queue, left to the local run.
