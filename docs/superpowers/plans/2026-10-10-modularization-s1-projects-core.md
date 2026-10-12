# S1 Projects Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the projects, programs, team and project-map API its shared zod contracts, a projects service split by responsibility and the authz kernel, with no change to any route, status code, response body, audit row, permission decision, transaction boundary or SQL statement.

**Architecture:** S1 is split (ruling 1). This plan gives S1a in full (ten tasks including baseline and gates) and S1b, the web client and feature folder, as an outline at the end. S1a first adds field schemas that accept exactly what class-validator accepted, so every later slice can turn a DTO into a contract without re-deriving its rules; then it replaces the projects and programs DTOs after parity tests, extracts the mapper, team and budget code out of `projects.service.ts` verbatim, and adopts `requireScopedProjectRow` and a new `requestIdentity` helper. Mechanical edits use one-off Node scripts under `.tmp/s1a/` (gitignored, never committed) whose content is given in full. Every step below was dry-run on an exported copy of `a101ad7c` (F4a complete): the copy typechecked, its api suite passed apart from one harness-only import fault, its shared suite passed (225), and the outputs quoted below come from those runs.

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, NestJS 10.4.22, class-validator 0.14.4 on validator 13.15.26, class-transformer 0.5.1, zod 3.25.76, Prisma 6.19, Vitest 3.2, Biome 1.9.4, Next 15.5.14, Playwright.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.1 to 3.7 with roadmap row S1, 4, 6, 7, and 9 including the F1, F2, F3a, F3b, F4a and F4b dispositions) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-04 and MOD-11 for S1a; MOD-05, MOD-06, MOD-15, MOD-16 and MOD-17 for S1b).

## Rulings

Controller rulings for S1 (2026-10-10). Each was checked against `refactor/f4a-web-boundaries` `a101ad7c`; F4b changes only `apps/web`, so every api and shared count below holds on local dev after F4b merges, and Task 0 recounts them.

1. **Split into S1a and S1b.** The S1 row covers contracts, the api split, the web client and the feature components. The web half alone moves the project methods out of `pathways-client.ts` (49 files reference them, 26 of the 56 `pathways-client` mock factories define one), restructures the 92-file `features/projects` folder and splits three oversized components; with the api half that is about eighteen tasks. S1a (this plan, branch `refactor/s1a-projects-core`) takes the contracts and the api; S1b (outline below, branch `refactor/s1b-projects-web`) takes the web. Both names replace `refactor/s1-projects-core`.
2. **Field schemas port class-validator exactly.** `packages/shared/src/contracts/common/field-schemas.ts` holds `lengthString`, `uuidString`, `isoDateString`, `strictIsoDateString`, `trimmedInput`, `hasUniqueItems` and `validatorLength`. Zod's own rules differ: `.uuid()` accepts any version digit while `IsUUID()` accepts versions 1 to 8 plus the nil and max UUIDs; `.datetime()` accepts one format while `IsDateString()` accepts ISO 8601 week, ordinal and basic forms; `.min()`/`.max()` count UTF-16 units while `Length` counts a surrogate pair or a selector-marked character once. The port copies the validator 13.15.26 regular expressions and checks; a probe over 45 strings found no difference, and `field-schemas-parity.test.ts` (56 strings) stays in the api until the last DTO is deleted. Every slice reuses them: the DTOs hold 25 `@IsDateString`, 38 `@IsUUID` and many `@Length` rules. The length count is written with numeric code points, not `\u` escapes, so a tool that decodes escapes cannot change it.
3. **Optional means nullish, with two recorded exceptions.** `@IsOptional()` skips every rule for `null`, so each optional field is `.nullish()` and `null` still reaches the service where it did. Two fields become `.optional()` because `null` already failed inside the service: `projectBudget: null` reached `new Prisma.Decimal(null)` (400 `Project budget must be a valid non-negative PHP amount.`, or 403 for an actor without budget authority) and `projectOfficerIds: null` crashed `replaceTeamAssignments` with a TypeError (500); both now answer 400 at the pipe. With the F3b prototype keys (`__proto__`, `constructor`), these four bodies are the only disagreements: 96 create and 11 update bodies agree on accept or reject and on the accepted value, and 20 program bodies agree. No client sends these bodies (the web sends `projectBudget: values.projectBudget || undefined` and an array of officer ids).
4. **Message wording.** Zod wording replaces class-validator wording (CR 3.6). The project screens show `error.message`, which `requestFoundationResponse` builds by joining the 400 `message` array, but `project-form-validation.ts` validates first, so only out-of-band input reaches these messages. The one custom DTO message keeps its text: the contract's message is `must be a non-negative PHP amount with at most 2 decimal places.`, and `ZodPipe` prefixes the path, giving the old `projectBudget must be ...` string (pinned in Task 3). Two api tests asserted `property targetGoal should not exist` and `property implementingPartners should not exist`; they now assert `Unrecognized key(s) in object: '...'`. No web or e2e test asserts the projects or programs wording (`git grep "should not exist"` finds only `users.validation.test.ts`, slice S8).
5. **Transforms become preprocess steps, and key order does not matter.** `@Transform` trims `title`, `name` and `projectBudget`, trims and upper-cases `code`, and turns `targetBeneficiaries` into `Number(value)` unless it is `''` or `null`; the contracts do the same before validating, so `"250"`, `true` and `[5]` still arrive as numbers. The zod output lists keys in schema order, not request order; the projects update replay is unaffected because `sourceMutationBody` sorts nothing at the top level but its canonical body reaches `f10_begin_source_operation` as `jsonb`, which normalizes key order. Task 2 pins that the DTO and contract routes produce equal `sourceMutationBody` values.
6. **Response contracts are types only.** `projectResponse`, `projectSummaryResponse` and `archiveProjectResponse` in `packages/shared/src/contracts/projects/project-responses.ts` type the projects routes; `mapProject` returns `ProjectResponse`, so a drift fails `pnpm typecheck`; nothing parses them at runtime (CR 3.6). The overview metrics and project map schemas stay in `packages/shared/src/monitoring`: they are parsed at runtime by design and that folder routes to the rule-engine determinism checker, which a move would drop; S7 decides the monitoring folder. No program response contract: no web code calls `/programs`.
7. **Split services are function modules named `.service.ts`.** CR 3.2 names further services by purpose and the CR 7 risk row requires that they take the caller's `tx`. `replaceTeamAssignments`, `readProjectBudgets` and `saveProjectBudget` become exported functions that take `tx`, in `project-team.service.ts` and `project-budget.service.ts`, so the existing `apps/api/src/**/*.service.ts` organization isolation route still covers their tenant-scoped writes; `projectData` becomes `projects.helpers.ts` and `projectSelection` with `mapProject` becomes `projects.mapper.ts`. `project-budget.ts` is renamed in its own commit first. The constant `projectBudgetCategory = 'PROJECT_PROFILE_TOTAL'` was declared in both `projects.service.ts` and `project-budget.ts`; it ends with one owner, the only non-verbatim line of the split. `requireProgram` and `requireProgramManager` stay private in `ProjectsService`, which lands at about 280 lines.
8. **Scoped project lookups.** `update` and `ProjectOverviewMetricsService.readInTransaction` adopt `requireScopedProjectRow` (same `where`, same `select`, same 404 text). `get` keeps its inline lookup because it loads with `relationLoadStrategy: 'join'`, which the kernel helper does not pass, and `archive` keeps its own because it scopes without the archived filter so a repeat call stays idempotent. The update's early UUID check stays where it is, before `beginRuleSourceOperation`.
9. **`requestIdentity` joins the kernel.** 24 controllers repeat `if (!request.user) throw new ForbiddenException('Application profile is required.')`. `apps/api/src/common/authz/request-identity.ts` exports it once; S1a adopts it in the four slice controllers (projects, programs, overview metrics, project map) and the other 20 adopt it in their slices. Finance and profile use other wording and keep it.
10. **SAD routing:** `apps/api/src/**/*.mapper.ts` routes to beneficiary-privacy-guardian, because a mapper decides which row fields leave the api. The split services keep organization isolation routing through their `.service.ts` names (ruling 7).
11. **Seeds and shared types.** `defense-demo-base.ts`, `hosted-realistic-seed.ts` and `local-demo-stages.ts` import `CreateProjectDto` as a type; they switch to `CreateProjectRequest` (type-only, erased at runtime), the only `apps/api/prisma` edits allowed. `projectCodeBase` in `packages/shared/src/validation/project-code.ts` widens `area` and `startDate` to accept `null` (type only; its body reads them through `?.` and `??`), because nullish contract fields now reach it.
12. **Spec facts corrected by the baseline:** there is no team module; team writes live in `projects.service.ts` (`replaceTeamAssignments`) and the team editor in `features/projects`. The web project map lives in `features/analytics` (S7 keeps the map UI; S1b moves only its fetcher). Api production code holds 48 direct `Prisma.TransactionClient` annotations at `a101ad7c` (F3a recorded 47); S1a removes the 7 in the projects module. The api tests run without decorator metadata (Vitest uses esbuild), so a DTO route cannot be characterized over HTTP: the parity tests pass the metatype explicitly, and each HTTP test is written first, fails against the DTO route (the global pipe sees no metatype and lets every body through), and passes once the route uses `ZodPipe`.
13. Cross-plan: validation convention. A route that had a class-validator DTO validates with `ZodPipe` on the controller (S1, S2, S4, S5 and the S8 users and auth routes). A module that already parsed `unknown` in its service keeps that (S3 ruling 6, S6 ruling 3, S7 ruling 13, S8 ruling 6) because its 400 body is a fixed string or an `issues` object that the `ZodPipe` string-array body would change (CR 4) and because seeds call its services directly; S3 Task 7 records the exception in CR 3.6. Cost if wrong: a slice either changes a 400 body shape or leaves a former DTO route unvalidated.
14. Cross-plan: `contracts/common/field-schemas.ts` is created only by S1a Task 1. Later slices only append: S2 adds `countInput` and `pesoAmountInput`, S5 adds `trimmedLowercaseInput` and `queryInteger`; no other slice edits or recreates it, and S3 and S6 deliberately do not use it. Cost if wrong: a second creation conflicts at merge, or a repeated name fails the barrel with TS2308.
15. Cross-plan: F4b facts for S1b, checked at `4a5806d0`: `readContextCookie` is private to `request.ts` (S8 removes it), `captureRequestOwner(signal?: AbortSignal | null)`, `pathways-client.ts` has 2596 lines, `features/projects` 78 files and 49 files mocking `pathways-client`; S1b Task 1 alone exports `requestSourceMutation` (signature in the outline). Cost if wrong: S1b Task 0 stops on a stale name, or a later slice moves the function a second time.
16. Pre-flight (2026-10-12): api counts corrected for the lost metadata cases, case tests use hex-letter UUIDs, HTTP scaffold copies deferred to W1, prose notes fixed.

## Interfaces assumed from earlier sub-projects

S1a is the first slice, so it assumes nothing from another slice. It reuses this kernel, unchanged:

- `type Tx` from `apps/api/src/common/prisma/transaction.ts` (F3a).
- `requireScopedProjectRow<const S extends Prisma.ProjectSelect>(tx: Tx, actor: ApplicationIdentity, projectId: string, select: S): Promise<Prisma.ProjectGetPayload<{ select: S }>>` from `apps/api/src/common/authz/scoped-project.ts` (F3a).
- `projectScope(profile: ApplicationIdentity): Prisma.ProjectWhereInput` from `apps/api/src/common/authz/project-scope.ts` (F3a).
- `writeAuditLog` from `apps/api/src/common/audit/write-audit-log.ts` (F3a); `withAuthorizedOperation` from `apps/api/src/common/authz/authorized-operation.ts` (F3b).
- `class ZodPipe<S extends z.ZodTypeAny>` from `apps/api/src/common/validation/zod-pipe.ts` (F3b).

S1b assumes these F4b exports (checked against local dev `4a5806d0` by the cross-plan review; S1b Task 0 confirms them):

- `PathwaysClientError`, `requestFoundation(path: string, init?: RequestInit, isCurrent?: () => boolean)`, and `requestFoundationResponse(...)` from `apps/web/src/lib/api/core/request.ts` (`readContextCookie` is module-private there, not an export).
- `captureRequestOwner(signal?: AbortSignal | null): () => boolean` from `apps/web/src/lib/api/core/request-owner.ts` (S1b needs it only if a project read leaves `useAuthorizedRead`).
- `useAuthorizedRead`, `authorizedReadPolicy` and `SUMMARY_READ_STALE_MS` from `apps/web/src/hooks/use-authorized-read.ts`.
- `apps/web/src/lib/format/{date,percent,plural,tone}.ts`, including the `StatusTone` union that `projectStatusTone` returns.

## Global Constraints

- Behavior-preserving: no route, status code, response body, audit row, permission decision, transaction boundary or SQL statement changes. The only accepted differences are 400 message wording on the projects and programs routes and the four bodies of ruling 3.
- Direction (CR 3.1): `apps/api/src/common/**` never imports `apps/api/src/modules/**` (non-test files); `common/import-boundary.test.ts` and `packages/shared/src/package-import-boundary.test.ts` must pass at every commit.
- Production api code uses relative imports only; `@app/` is a Vitest alias used by tests.
- File moves use `git mv` and are committed separately from logic edits. Splits are verbatim: `.tmp/s1a/same-lines.mjs` must print the expected result before Biome formats the new files.
- Split services take the caller's `tx`; none opens its own transaction.
- Every name exported through `packages/shared/src/index.ts` is unique (TS2308 otherwise).
- Kebab-case file names that describe purpose; comments are one sentence, no emojis; docs prose has no em dashes and no `--`.
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. New untracked files need `git add -N` before `git diff --name-only` lists them.
- `pnpm typecheck` rewrites `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` before every commit.
- After removing code, delete any import name left with no use (Biome 1.9 recommended rules do not flag unused imports).
- Do not type `\u` escapes for characters into source; build them with `String.fromCharCode` or `String.fromCodePoint` (ruling 2).
- `git ls-files` with `':!*.test.ts'` pathspecs returns nothing in this Git for Windows setup; `git grep` pathspecs work.
- One-off scripts live in `.tmp/s1a/` (gitignored) and are never committed; `.tmp/` also holds logs.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work in `C:\PATHWAYS` on branch `refactor/s1a-projects-core`; no new worktree. All paths are relative to `C:\PATHWAYS`. Do not push.
- Do not touch migrations, `.env` files, review evidence or `apps/web`; under `apps/api/prisma` only the three seed type imports of Task 3 change.

## Review Focus

1. A JSON `null` on an optional project or program field (`code`, `description`, `objectives`, `implementationArea`, `sector`, `implementingPartnerNames`, `targetBeneficiaries`, the three manager ids, `startDate`, `endDate`, `programId`) must still be accepted and reach the service as `null`, because `@IsOptional()` let it through. Task 2 pins it in `project-requests.test.ts` and the parity table; Task 4 in the program parity table.
2. A beneficiary count sent as `"250"`, a code sent as `" crl-ns-2026 "` and a padded title must reach the service as `250`, `CRL-NS-2026` and the trimmed title, exactly as the DTO transforms produced them. Task 3 pins all three over HTTP; Task 4 pins the program code and name.
3. A title made of emoji, combining marks or selector-marked characters must pass or fail the 3 to 160 length rule exactly as class-validator counted it, not by UTF-16 length. Task 1 pins it against class-validator itself.
4. A project update for a malformed, unscoped or uppercase project id must still answer the uniform 404 before any write, or look up the lowercased id, and a stale version must still answer 409. Task 7 Step 1 pins all four before the lookup changes.
5. A client that retries a project update with the same `clientMutationId` across the deploy must replay, not conflict, because the stored and the new canonical bodies must match. Task 2 pins equal `sourceMutationBody` output for the DTO and contract routes.

## Out of S1a (recorded for later sub-projects)

- Web client, feature folder and project map fetcher (MOD-05, MOD-06, MOD-15, MOD-16 and MOD-17 for projects): S1b, outlined at the end.
- The 20 other controllers that repeat the request identity guard, and the 41 `Prisma.TransactionClient` annotations left in api production code: their slices.
- The Nest HTTP test scaffold is copied in the Task 3 and Task 4 tests (a third copy after F3b): a shared test helper is W1 work.
- `apps/api/src/common/validation/field-schemas-parity.test.ts` and the class-validator dependency: removed by the slice that deletes the last DTO (S8).
- The overview metrics and project map schemas in `packages/shared/src/monitoring` (ruling 6) and the copies of the stored project status union in `role-overview.ts`, `rule-contract.ts`, `rule-metrics.ts` and `descriptive-analytics.ts`: S7 may switch them to `storedProjectStatuses`.

---

### Task 0: Branch setup and baseline

**Files:**
- Create: `docs/superpowers/plans/2026-10-10-modularization-s1-projects-core.md` (this plan)
- Modify: `docs/index.md` (section 1.6 plan row)

- [ ] **Step 1: Confirm local dev contains F4b and create the branch**

```bash
cd /c/PATHWAYS
git status --short
git checkout dev
git log --oneline dev | grep -m1 "Merge refactor/f4b-web-helpers into dev"
test -f apps/web/src/lib/api/core/request.ts && test -f apps/web/src/lib/api/core/request-owner.ts && test -f apps/web/src/hooks/use-authorized-read.ts && test -f apps/web/src/lib/format/date.ts && echo "F4b tree present"
ls docs/superpowers/plans/
git checkout -b refactor/s1a-projects-core
pnpm install --frozen-lockfile
mkdir -p .tmp/s1a
```

Expected: clean status, the F4b merge commit and `F4b tree present` printed, install succeeds. If either is missing, stop and report: S1 builds on the F4b tree. If `ls` lists an F4 or F4b plan, that plan's removal step did not run; Step 3 removes it and its `docs/index.md` row too.

- [ ] **Step 2: Record the baseline**

```bash
pnpm --filter @pathways/shared build
pnpm typecheck && pnpm test 2>&1 | grep -E "Tests +[0-9]+"
pnpm sad:test 2>&1 | grep -E "Tests +[0-9]+"
pnpm docs:check 2>&1 | tail -3
pnpm --filter @pathways/web build > .tmp/s1a/web-build-baseline.log 2>&1; echo "exit $?"
grep -E "Middleware" .tmp/s1a/web-build-baseline.log
git hash-object apps/api/src/modules/projects/projects.service.ts apps/api/src/modules/projects/projects.dto.ts apps/api/src/modules/programs/programs.dto.ts apps/api/src/modules/projects/project-budget.ts apps/api/src/modules/projects/projects.controller.test.ts apps/api/src/modules/projects/projects.service.test.ts apps/api/src/modules/projects/project-overview-metrics.service.ts
git grep -lE "projects\.dto'|programs\.dto'" -- apps | wc -l
git grep -n "Prisma.TransactionClient" -- apps/api/src/modules/projects ':!*.test.ts' | wc -l
git grep -n "AND: \[projectScope(actor), { id: projectId.toLowerCase() }\]" -- apps/api/src/modules/projects | wc -l
git grep -lE "Application profile is required\.'" -- 'apps/api/src/**/*.controller.ts' | wc -l
git grep -c "file: 'src/modules/" -- apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts
git grep -nwE "validatorLength|lengthString|uuidString|isoDateString|strictIsoDateString|trimmedInput|hasUniqueItems|recordCodeInput|storedProjectStatuses|StoredProjectStatus|createProjectRequest|CreateProjectRequest|updateProjectRequest|UpdateProjectRequest|projectResponse|ProjectResponse|projectSummaryResponse|ProjectSummaryResponse|archiveProjectResponse|ArchiveProjectResponse|createProgramRequest|CreateProgramRequest|requestIdentity" -- packages apps/api | wc -l
git checkout -- apps/web/next-env.d.ts
```

Expected: typecheck clean; write down each package's passing and skipped test counts (config, shared, imports, api, web), the sad count, the docs check failure count, the web build exit code (0) and the `Middleware` size (F4a recorded 102 kB). Later tasks compare against these (`B_shared`, `B_api`, `B_web`, `B_sad`, `M0`); at `a101ad7c` shared was 186 and sad 51. The hashes print, in order: `8912f68fee09d9123349456f6860618f22718a55`, `fdbc87ace085256f96bf9b151308fa9248901791`, `3f7ee47f447ff071cea6b2730c45f50925ca91bb`, `3a2576c734f27721110dfad93389d36d87374347`, `73c19ca3257f114856021d13930b5c74ad0521c6`, `66936fe860b8231914f9337caa76b0d06eee626b`, `ff6b0d2baadee4a4fba4639b01eabf32b9e19033`; the greps print `8`, `7`, `3`, `24`, `10` and `0`. If any differs, stop and report: the anchors and counts below were taken at `a101ad7c`.

- [ ] **Step 3: Add the plan and commit**

The controller has saved this plan as `docs/superpowers/plans/2026-10-10-modularization-s1-projects-core.md`.

In `docs/index.md` section 1.6, add as the last row of the table (and delete any F4 or F4b plan row found in Step 1, with `git rm` of that plan file):

```markdown
| [S1 projects core plan](superpowers/plans/2026-10-10-modularization-s1-projects-core.md) | 2026-10-10-modularization-s1-projects-core.md | 2026-10-10 | S1 of the codebase modularization: S1a class-validator parity field schemas, project and program contracts, projects service split and authz kernel adoption; S1b outline | In progress |
```

```bash
git add docs/superpowers/plans/2026-10-10-modularization-s1-projects-core.md docs/index.md
pnpm docs:check 2>&1 | tail -3
git commit -m "docs: add the S1 projects core plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Step 2 baseline.

---

### Task 1: Class-validator parity field schemas

**Files:**
- Create: `packages/shared/src/contracts/common/field-schemas.ts`
- Test: `packages/shared/src/contracts/common/field-schemas.test.ts`
- Modify: `packages/shared/src/index.ts` (barrel line)
- Test: `apps/api/src/common/validation/field-schemas-parity.test.ts`

**Interfaces:**
- Produces, from `@pathways/shared`: `validatorLength(value: string): number`; `lengthString(min: number, max: number)` (a `z.string()` refinement); `uuidString`, `isoDateString` (`z.ZodString`); `strictIsoDateString` (refined `isoDateString`); `trimmedInput<T extends z.ZodTypeAny>(schema: T)` (a `z.preprocess` wrapper); `hasUniqueItems(values: readonly unknown[]): boolean`.

- [ ] **Step 1: Write the failing shared test**

Create `packages/shared/src/contracts/common/field-schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  hasUniqueItems,
  isoDateString,
  lengthString,
  strictIsoDateString,
  trimmedInput,
  uuidString,
  validatorLength,
} from './field-schemas'

const grin = String.fromCodePoint(0x1f600)
const heart = String.fromCharCode(0x2764, 0xfe0f)
const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success

describe('class-validator field schemas', () => {
  it('counts a surrogate pair and a presentation selector pair as one character', () => {
    expect(validatorLength(grin.repeat(3))).toBe(3)
    expect(validatorLength(heart.repeat(2))).toBe(2)
    expect(accepts(lengthString(3, 160), grin.repeat(2))).toBe(false)
    expect(accepts(lengthString(3, 160), grin.repeat(3))).toBe(true)
  })

  it.each([
    ['10000000-0000-4000-8000-000000000001', true],
    ['FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF', true],
    ['00000000-0000-0000-0000-000000000000', true],
    ['10000000-0000-0000-8000-000000000001', false],
    ['10000000-0000-9000-8000-000000000001', false],
    ['10000000-0000-4000-c000-000000000001', false],
  ])('uuidString %s accepts %s', (value, accepted) => {
    expect(accepts(uuidString, value)).toBe(accepted)
  })

  it.each([
    ['2026-01-01', true, true],
    ['2026-02-30', true, false],
    ['2024-366', true, true],
    ['2026-366', true, false],
    ['2026-W01-1', true, true],
    ['2026-01-01T00:00:00.000Z', true, true],
    ['20260101', true, true],
    ['2026-1-1', false, false],
    ['01/02/2026', false, false],
    ['', false, false],
  ])('%s is ISO 8601 %s and a real day %s', (value, iso, strict) => {
    expect(accepts(isoDateString, value)).toBe(iso)
    expect(accepts(strictIsoDateString, value)).toBe(strict)
  })

  it('trims a string before validating and leaves other values alone', () => {
    expect(trimmedInput(lengthString(3, 10)).parse('  abc  ')).toBe('abc')
    expect(accepts(trimmedInput(lengthString(3, 10)), '  ab  ')).toBe(false)
    expect(accepts(trimmedInput(lengthString(3, 10)), 123)).toBe(false)
  })

  it('treats items as repeated by strict equality', () => {
    expect(hasUniqueItems(['a', 'b'])).toBe(true)
    expect(hasUniqueItems(['a', 'a'])).toBe(false)
    expect(hasUniqueItems(['a', 'A'])).toBe(true)
  })
})
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/common/field-schemas.test.ts`
Expected: FAIL, cannot resolve `./field-schemas`.

- [ ] **Step 2: Write the failing api parity test**

Create `apps/api/src/common/validation/field-schemas-parity.test.ts`:

```ts
import { isISO8601, isUUID, length } from 'class-validator'
import { describe, expect, it } from 'vitest'

import { isoDateString, lengthString, strictIsoDateString, uuidString } from '@pathways/shared'

const grin = String.fromCodePoint(0x1f600)
const heart = String.fromCharCode(0x2764, 0xfe0f)

// Inputs on both sides of every class-validator rule the shared field schemas port.
const inputs = [
  '2026-01-01',
  '2026-02-30',
  '2024-02-29',
  '2026-02-29',
  '2026-W53',
  '2026-W54',
  '2026-W01-7',
  '2026-000',
  '2026-365',
  '2026-366',
  '2000-366',
  '1900-366',
  '2026-01',
  '2026',
  '+2026-01-01',
  '-2026-01-01',
  '20260101',
  '2026-0101',
  '202601-01',
  '2026-04-31',
  '2026-12-32',
  '2026-13-01',
  '2026-1-1',
  '01/02/2026',
  '2026-01-01T24:00',
  '2026-01-01T23:59:60',
  '2026-01-01T10:00:00,5+08:00',
  '2026-01-01T10:00+0800',
  '2026-01-01T10:00:00.123456789Z',
  '2026-01-01t10:00Z',
  '2026-01-01 10:00',
  '2026-01-01T10',
  ' 2026-01-01',
  '2026-01-01 ',
  '',
  'x',
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF',
  '10000000-0000-0000-8000-000000000001',
  '10000000-0000-8000-8000-000000000001',
  '10000000-0000-9000-8000-000000000001',
  '10000000-0000-4000-7000-000000000001',
  '10000000000040008000000000000001',
  '{10000000-0000-4000-8000-000000000001}',
  'ab',
  'abc',
  'x'.repeat(160),
  'x'.repeat(161),
  grin.repeat(2),
  grin.repeat(3),
  `e${String.fromCharCode(0x301)}`,
  heart.repeat(3),
  String.fromCharCode(0xfe0f).repeat(3),
  String.fromCharCode(0xd800, 0xd800),
  `ab${String.fromCharCode(0xfe0e)}`,
]

describe('shared field schemas and class-validator', () => {
  it.each(inputs)('agree on %j', (value) => {
    expect({
      uuid: uuidString.safeParse(value).success,
      iso: isoDateString.safeParse(value).success,
      strictIso: strictIsoDateString.safeParse(value).success,
      length: lengthString(3, 160).safeParse(value).success,
    }).toEqual({
      uuid: isUUID(value),
      iso: isISO8601(value),
      strictIso: isISO8601(value, { strict: true }),
      length: length(value, 3, 160),
    })
  })

  it('rejects non-strings on both sides', () => {
    for (const value of [null, 1, true, [], {}]) {
      expect(uuidString.safeParse(value).success).toBe(isUUID(value))
      expect(isoDateString.safeParse(value).success).toBe(isISO8601(value))
      expect(lengthString(0, 10).safeParse(value).success).toBe(length(value, 0, 10))
    }
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/common/validation/field-schemas-parity.test.ts`
Expected: FAIL, the four schemas are not exported by `@pathways/shared`.

- [ ] **Step 3: Write the field schemas and export them**

Create `packages/shared/src/contracts/common/field-schemas.ts` (the two long regular expressions are copied from validator 13.15.26 `isUUID` `all` and `isISO8601`; keep every group, because the ISO pattern refers back to groups 3 and 17):

```ts
import { z } from 'zod'

// Field schemas that accept exactly what class-validator 0.14.4 on validator 13.15.26 accepted.

const uuidPattern =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i
const iso8601 =
  /^([+-]?\d{4}(?!\d{2}\b))((-?)((0[1-9]|1[0-2])(\3([12]\d|0[1-9]|3[01]))?|W([0-4]\d|5[0-3])(-?[1-7])?|(00[1-9]|0[1-9]\d|[12]\d{2}|3([0-5]\d|6[1-6])))([T\s]((([01]\d|2[0-3])((:?)[0-5]\d)?|24:?00)([.,]\d+(?!:))?)?(\17[0-5]\d([.,]\d+)?)?([zZ]|([+-])([01]\d|2[0-3]):?([0-5]\d)?)?)?)?$/

const isPresentationSelector = (code: number) => code === 0xfe0e || code === 0xfe0f
const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff

// Length as validator isLength counts it: a surrogate pair or a selector-marked character counts once.
export function validatorLength(value: string): number {
  let length = value.length
  for (let index = 1; index < value.length; index++) {
    const previous = value.charCodeAt(index - 1)
    const code = value.charCodeAt(index)
    if (isPresentationSelector(code) && !isPresentationSelector(previous)) length--
    else if (isLowSurrogate(code) && isHighSurrogate(previous)) length--
  }
  return length
}

// The validator isISO8601 strict check: an ordinal day within its year, or a month and day that exist.
function realCalendarDay(value: string): boolean {
  const ordinal = value.match(/^(\d{4})-?(\d{3})([ T]{1}\.*|$)/)
  if (ordinal) {
    const year = Number(ordinal[1])
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    return Number(ordinal[2]) <= (leap ? 366 : 365)
  }
  const [, year, month, day] = (value.match(/(\d{4})-?(\d{0,2})-?(\d*)/) ?? []).map(Number)
  if (!month || !day) return true
  const date = new Date(`${year}-${`0${month}`.slice(-2)}-${`0${day}`.slice(-2)}`)
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
  )
}

// IsString with Length(min, max).
export const lengthString = (min: number, max: number) =>
  z.string().refine((value) => {
    const length = validatorLength(value)
    return length >= min && length <= max
  }, `must be ${min} to ${max} characters long`)

// IsUUID(): a version 1 to 8 UUID, the nil UUID or the max UUID, in either case.
export const uuidString = z.string().regex(uuidPattern, 'must be a UUID')

// IsDateString(): any ISO 8601 date, week, ordinal or date-time form.
export const isoDateString = z.string().regex(iso8601, 'must be a valid ISO 8601 date string')

// IsDateString({ strict: true }): an ISO 8601 string that also names a real calendar day.
export const strictIsoDateString = isoDateString.refine(
  realCalendarDay,
  'must be a valid ISO 8601 date string',
)

// A string Transform that trimmed the value before the DTO validators ran.
export const trimmedInput = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), schema)

// ArrayUnique: no item appears twice.
export const hasUniqueItems = (values: readonly unknown[]) =>
  values.every((value, index) => values.indexOf(value) === index)
```

Append to `packages/shared/src/index.ts`, directly after `export * from './contracts/imports/import-requests'`:

```ts
export * from './contracts/common/field-schemas'
```

- [ ] **Step 4: Run the tests**

```bash
pnpm --filter @pathways/shared exec vitest run src/contracts/common/field-schemas.test.ts
pnpm --filter @pathways/api exec vitest run src/common/validation/field-schemas-parity.test.ts src/common/import-boundary.test.ts
```

Expected: 19 shared tests and 57 parity tests pass. A parity failure names the input and the rule: stop and report it, do not edit the input list or the schema to make it pass.

- [ ] **Step 5: Check and commit**

```bash
git add -N packages/shared apps/api
pnpm exec biome check --write packages/shared/src/contracts/common packages/shared/src/index.ts apps/api/src/common/validation/field-schemas-parity.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/shared test 2>&1 | grep -E "Tests +[0-9]+"
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add packages/shared/src/contracts/common packages/shared/src/index.ts apps/api/src/common/validation/field-schemas-parity.test.ts
git commit -m "feat(shared): add field schemas that accept what class-validator accepted

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: shared = `B_shared + 19`, api = `B_api + 57`.

---

### Task 2: Project request contracts and DTO parity evidence

**Files:**
- Create: `packages/shared/src/contracts/projects/project-requests.ts`
- Test: `packages/shared/src/contracts/projects/project-requests.test.ts`
- Modify: `packages/shared/src/index.ts` (barrel line)
- Create (deleted again in Task 3): `apps/api/src/modules/projects/project-request-parity.test.ts`

**Interfaces:**
- Consumes: the Task 1 field schemas.
- Produces, from `@pathways/shared`: `storedProjectStatuses` (`readonly ['PLANNED', 'ONGOING', 'COMPLETED', 'ON_HOLD', 'CANCELLED']`), `type StoredProjectStatus`, `recordCodeInput` (preprocessed code schema), `createProjectRequest` with `type CreateProjectRequest`, `updateProjectRequest` with `type UpdateProjectRequest` (create fields plus `clientMutationId: string` and `expectedUpdatedAt: string`). Optional fields are `T | null | undefined` except `projectBudget?: string` and `projectOfficerIds?: string[]` (ruling 3).

- [ ] **Step 1: Write the failing contract test**

Create `packages/shared/src/contracts/projects/project-requests.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { createProjectRequest, updateProjectRequest } from './project-requests'

const base = { title: 'Synthetic project', status: 'PLANNED' }
const mutation = {
  clientMutationId: '10000000-0000-4000-8000-000000000001',
  expectedUpdatedAt: '2026-09-24T00:00:00.000Z',
}

describe('project request contracts', () => {
  it('normalizes the code and title and coerces the beneficiary count as the DTO did', () => {
    expect(
      createProjectRequest.parse({
        ...base,
        title: '  Synthetic project  ',
        code: ' crl-ns-2026 ',
        targetBeneficiaries: '250',
        projectBudget: ' 125000.50 ',
      }),
    ).toEqual({
      ...base,
      code: 'CRL-NS-2026',
      targetBeneficiaries: 250,
      projectBudget: '125000.50',
    })
  })

  it('keeps null on the optional fields the DTO let through', () => {
    const nulls = {
      code: null,
      description: null,
      implementingPartnerNames: null,
      targetBeneficiaries: null,
      projectManagerId: null,
      startDate: null,
      programId: null,
    }
    expect(createProjectRequest.parse({ ...base, ...nulls })).toEqual({ ...base, ...nulls })
  })

  it.each([
    { targetGoal: 1 },
    { implementingPartners: 'Partner A' },
    { projectBudget: null },
    { projectOfficerIds: null },
    { projectOfficerIds: [mutation.clientMutationId, mutation.clientMutationId] },
    { startDate: '2026-02-30' },
    { status: 'ACTIVE' },
    { code: '-AB' },
    JSON.parse('{"__proto__":{"a":1}}'),
    { constructor: { a: 1 } },
  ])('rejects %j on create', (extra) => {
    expect(createProjectRequest.safeParse({ ...base, ...extra }).success).toBe(false)
  })

  it('requires the mutation keys on update only', () => {
    expect(updateProjectRequest.safeParse({ ...base, ...mutation }).success).toBe(true)
    expect(updateProjectRequest.safeParse(base).success).toBe(false)
    expect(createProjectRequest.safeParse({ ...base, ...mutation }).success).toBe(false)
  })
})
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/projects/project-requests.test.ts`
Expected: FAIL, cannot resolve `./project-requests`.

- [ ] **Step 2: Create the contracts and export them**

Create `packages/shared/src/contracts/projects/project-requests.ts`:

```ts
import { z } from 'zod'

import {
  hasUniqueItems,
  isoDateString,
  lengthString,
  strictIsoDateString,
  trimmedInput,
  uuidString,
  validatorLength,
} from '../common/field-schemas'

// Status codes stored on projects and programs.
export const storedProjectStatuses = [
  'PLANNED',
  'ONGOING',
  'COMPLETED',
  'ON_HOLD',
  'CANCELLED',
] as const
export type StoredProjectStatus = (typeof storedProjectStatuses)[number]

const recordCodePattern = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const pesoAmountPattern = /^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/

// A project or program code: trimmed and upper-cased, then 2 to 40 letters, digits, hyphens or underscores.
export const recordCodeInput = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
  z.string().refine((value) => {
    const length = validatorLength(value)
    return length >= 2 && length <= 40 && recordCodePattern.test(value)
  }, 'must be 2 to 40 letters, digits, hyphens or underscores, starting with a letter or digit'),
)

const projectFields = {
  code: recordCodeInput.nullish(),
  title: trimmedInput(lengthString(3, 160)),
  description: lengthString(0, 2000).nullish(),
  objectives: lengthString(0, 4000).nullish(),
  implementationArea: lengthString(0, 240).nullish(),
  implementingPartnerNames: z
    .array(lengthString(1, 120))
    .max(20)
    .refine(hasUniqueItems, 'must not repeat a partner')
    .nullish(),
  sector: lengthString(0, 160).nullish(),
  targetBeneficiaries: z
    .preprocess(
      (value) => (value === '' || value === null ? value : Number(value)),
      z.number().int().min(0).max(2_147_483_647),
    )
    .nullish(),
  projectBudget: trimmedInput(
    z
      .string()
      .regex(pesoAmountPattern, 'must be a non-negative PHP amount with at most 2 decimal places.'),
  ).optional(),
  programManagerId: uuidString.nullish(),
  projectManagerId: uuidString.nullish(),
  monitoringOfficerId: uuidString.nullish(),
  projectOfficerIds: z
    .array(uuidString)
    .max(50)
    .refine(hasUniqueItems, 'must not repeat an officer')
    .optional(),
  startDate: strictIsoDateString.nullish(),
  endDate: strictIsoDateString.nullish(),
  status: z.enum(storedProjectStatuses),
  programId: uuidString.nullish(),
}

// Body of POST /projects.
export const createProjectRequest = z.object(projectFields).strict()
export type CreateProjectRequest = z.infer<typeof createProjectRequest>

// Body of PATCH /projects/:projectId.
export const updateProjectRequest = z
  .object({ ...projectFields, clientMutationId: uuidString, expectedUpdatedAt: isoDateString })
  .strict()
export type UpdateProjectRequest = z.infer<typeof updateProjectRequest>
```

Append to `packages/shared/src/index.ts`, after the Task 1 line:

```ts
export * from './contracts/projects/project-requests'
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/projects/project-requests.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 3: Write the parity test**

Create `apps/api/src/modules/projects/project-request-parity.test.ts`:

```ts
import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { createProjectRequest, updateProjectRequest } from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { sourceMutationBody } from '../rules/rules-source-operation'
import { CreateProjectDto, UpdateProjectDto } from './projects.dto'

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
async function viaDto(json: string, metatype: new () => object): Promise<Outcome> {
  try {
    const dto = await globalPipe.transform(JSON.parse(json), { type: 'body', metatype })
    return { accepted: true, value: { ...dto } }
  } catch (error) {
    return rejected(error)
  }
}

// The new route: the global pipe with an Object design type, then the zod pipe.
async function viaZod(
  json: string,
  pipe: { transform(value: unknown): unknown },
): Promise<Outcome> {
  try {
    const body = await globalPipe.transform(JSON.parse(json), { type: 'body', metatype: Object })
    return { accepted: true, value: pipe.transform(body) }
  } catch (error) {
    return rejected(error)
  }
}

const badRequestShape = {
  accepted: false,
  value: {
    statusCode: 400,
    error: 'Bad Request',
    message: expect.arrayContaining([expect.any(String)]),
  },
}
const createPipe = new ZodPipe(createProjectRequest)
const updatePipe = new ZodPipe(updateProjectRequest)
const uuid = 'ab000000-0000-4000-8000-00000000000a'
const grin = String.fromCodePoint(0x1f600)
const base = { title: 'Synthetic project', status: 'PLANNED' }
const create = (extra: Record<string, unknown>) => JSON.stringify({ ...base, ...extra })
const mutation = { clientMutationId: uuid, expectedUpdatedAt: '2026-09-24T00:00:00.000Z' }
const update = (extra: Record<string, unknown>) =>
  JSON.stringify({ ...base, ...mutation, ...extra })
const officers = (count: number) =>
  Array.from({ length: count }, (_, i) => `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`)

const acceptedCreates = [
  create({}),
  create({ title: '  Padded title  ' }),
  create({ title: '   abc   ' }),
  create({ title: grin.repeat(3) }),
  create({ title: 'x'.repeat(160) }),
  create({ code: ' crl-ns-2026 ' }),
  create({ code: null }),
  create({ description: null, objectives: null, implementationArea: null, sector: null }),
  create({ objectives: 'x'.repeat(4000) }),
  create({ implementingPartnerNames: ['A', 'B'] }),
  create({ implementingPartnerNames: null }),
  create({ targetBeneficiaries: 250 }),
  create({ targetBeneficiaries: '250' }),
  create({ targetBeneficiaries: null }),
  create({ targetBeneficiaries: true }),
  create({ targetBeneficiaries: [5] }),
  create({ targetBeneficiaries: [] }),
  create({ targetBeneficiaries: ' 7 ' }),
  create({ targetBeneficiaries: '0x10' }),
  create({ targetBeneficiaries: '1e3' }),
  create({ targetBeneficiaries: 2_147_483_647 }),
  create({ projectBudget: '125000.50' }),
  create({ projectBudget: ' 10 ' }),
  create({ projectBudget: '0' }),
  create({ programManagerId: uuid, projectManagerId: uuid, monitoringOfficerId: uuid }),
  create({ programManagerId: null, projectManagerId: null, monitoringOfficerId: null }),
  create({ projectManagerId: uuid.toUpperCase() }),
  create({ projectManagerId: '00000000-0000-0000-0000-000000000000' }),
  create({ projectManagerId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' }),
  create({ projectOfficerIds: [uuid] }),
  create({ projectOfficerIds: [] }),
  create({ projectOfficerIds: officers(50) }),
  create({ startDate: '2026-01-01', endDate: '2026-12-31' }),
  create({ startDate: null, endDate: null }),
  create({ startDate: '2024-02-29' }),
  create({ startDate: '2026-01-01T00:00:00Z' }),
  create({ startDate: '2026-01-01 10:00' }),
  create({ startDate: '20260101' }),
  create({ startDate: '2026-W01-1' }),
  create({ startDate: '2024-366' }),
  create({ startDate: '2026-01' }),
  create({ startDate: '+2026-01-01' }),
  create({ programId: uuid }),
  create({ programId: null }),
]

const rejectedCreates = [
  create({ code: 'A' }),
  create({ code: '-AB' }),
  create({ code: 'AB CD' }),
  create({ title: 'ab' }),
  create({ title: grin.repeat(2) }),
  create({ title: 'x'.repeat(161) }),
  create({ title: null }),
  JSON.stringify({ status: 'PLANNED' }),
  create({ description: 'x'.repeat(2001) }),
  create({ implementationArea: 'x'.repeat(241) }),
  create({ implementingPartnerNames: ['A', 'A'] }),
  create({ implementingPartnerNames: [''] }),
  create({ implementingPartnerNames: Array.from({ length: 21 }, (_, i) => `P${i}`) }),
  create({ implementingPartnerNames: 'A' }),
  create({ implementingPartnerNames: [1] }),
  create({ targetBeneficiaries: '' }),
  create({ targetBeneficiaries: -1 }),
  create({ targetBeneficiaries: 1.5 }),
  create({ targetBeneficiaries: 2_147_483_648 }),
  create({ targetBeneficiaries: 'abc' }),
  create({ targetBeneficiaries: {} }),
  create({ projectBudget: '-1' }),
  create({ projectBudget: '1.001' }),
  create({ projectBudget: '1e3' }),
  create({ projectBudget: '01' }),
  create({ projectBudget: 10 }),
  create({ projectBudget: '' }),
  create({ projectManagerId: '10000000-0000-0000-8000-000000000001' }),
  create({ projectManagerId: '10000000-0000-4000-c000-000000000001' }),
  create({ projectManagerId: 'not-a-uuid' }),
  create({ projectOfficerIds: [uuid, uuid] }),
  create({ projectOfficerIds: officers(51) }),
  create({ startDate: '2026-02-30' }),
  create({ startDate: '2026-02-29' }),
  create({ startDate: '2026-366' }),
  create({ startDate: '2026-13-01' }),
  create({ startDate: '2026-1-1' }),
  create({ startDate: '01/02/2026' }),
  create({ startDate: '' }),
  create({ startDate: 20260101 }),
  create({ status: 'ACTIVE' }),
  create({ status: 'planned' }),
  create({ status: null }),
  create({ programId: 'x' }),
  create({ targetGoal: 1 }),
  create({ implementingPartners: 'Partner A' }),
  create({ extra: true }),
  create({ prototype: 1 }),
  create({ clientMutationId: uuid }),
  '[]',
  `[${create({})}]`,
  '{}',
]

const acceptedUpdates = [
  update({}),
  update({ expectedUpdatedAt: '2026-09-24' }),
  update({ expectedUpdatedAt: '2026-02-30' }),
  update({ code: ' ab ', projectOfficerIds: [uuid], targetBeneficiaries: '5' }),
]

const rejectedUpdates = [
  update({ expectedUpdatedAt: 'yesterday' }),
  update({ expectedUpdatedAt: null }),
  update({ clientMutationId: 'x' }),
  update({ clientMutationId: null }),
  update({ targetGoal: 1 }),
  JSON.stringify({ ...base, expectedUpdatedAt: mutation.expectedUpdatedAt }),
  JSON.stringify({ ...base, clientMutationId: uuid }),
]

describe('CreateProjectDto and createProjectRequest parity', () => {
  it.each(acceptedCreates)('both accept %s with the same value', async (json) => {
    const [dto, zod] = await Promise.all([viaDto(json, CreateProjectDto), viaZod(json, createPipe)])
    expect(dto.accepted).toBe(true)
    expect(zod).toEqual(dto)
  })

  it.each(rejectedCreates)('both answer the 400 shape for %s', async (json) => {
    expect(await viaDto(json, CreateProjectDto)).toEqual(badRequestShape)
    expect(await viaZod(json, createPipe)).toEqual(badRequestShape)
  })

  // The DTO route let these bodies through and the contract rejects them.
  it.each([
    create({ projectBudget: null }),
    create({ projectOfficerIds: null }),
    '{"title":"Synthetic project","status":"PLANNED","__proto__":{"a":1}}',
    '{"title":"Synthetic project","status":"PLANNED","constructor":{"a":1}}',
  ])('only the contract rejects %s', async (json) => {
    expect((await viaDto(json, CreateProjectDto)).accepted).toBe(true)
    expect(await viaZod(json, createPipe)).toEqual(badRequestShape)
  })
})

describe('UpdateProjectDto and updateProjectRequest parity', () => {
  it.each(acceptedUpdates)('both accept %s with the same value', async (json) => {
    const [dto, zod] = await Promise.all([viaDto(json, UpdateProjectDto), viaZod(json, updatePipe)])
    expect(dto.accepted).toBe(true)
    expect(zod).toEqual(dto)
  })

  it.each(rejectedUpdates)('both answer the 400 shape for %s', async (json) => {
    expect(await viaDto(json, UpdateProjectDto)).toEqual(badRequestShape)
    expect(await viaZod(json, updatePipe)).toEqual(badRequestShape)
  })

  // A retry across the deploy replays against the same stored body.
  it('produces the same source mutation body as the DTO route', async () => {
    const json = update({
      code: ' ab ',
      projectOfficerIds: [uuid.toUpperCase()],
      targetBeneficiaries: '5',
      startDate: '2026-01-01',
      description: null,
    })
    const [dto, zod] = await Promise.all([viaDto(json, UpdateProjectDto), viaZod(json, updatePipe)])
    expect(sourceMutationBody(zod.value as object)).toEqual(sourceMutationBody(dto.value as object))
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/projects/project-request-parity.test.ts`
Expected: PASS, 112 tests (44 accepted and 52 rejected creates, 4 exceptions, 4 accepted and 7 rejected updates, 1 replay body). Any failure means the contract differs from the DTO: stop and report the row, do not edit the table to match.

- [ ] **Step 4: Commit the contracts and the evidence**

```bash
git add -N packages/shared apps/api
pnpm exec biome check --write packages/shared/src/contracts/projects packages/shared/src/index.ts apps/api/src/modules/projects/project-request-parity.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/shared test 2>&1 | grep -E "Tests +[0-9]+"
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add packages/shared/src/contracts/projects packages/shared/src/index.ts apps/api/src/modules/projects/project-request-parity.test.ts
git commit -m "feat(shared): add the project request contracts with their DTO parity test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: shared = `B_shared + 32`, api = `B_api + 169`.

---

### Task 3: Switch the projects routes to the contracts

**Files:**
- Test: `apps/api/src/modules/projects/projects.controller.validation.test.ts`
- Modify: `apps/api/src/modules/projects/projects.controller.ts`, `apps/api/src/modules/projects/projects.service.ts`
- Replace: `apps/api/src/modules/projects/projects.controller.test.ts`
- Modify: `apps/api/prisma/defense-demo-base.ts`, `apps/api/prisma/hosted-realistic-seed.ts`, `apps/api/prisma/local-demo-stages.ts` (type import only)
- Modify: `apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts` (projects case)
- Modify: `packages/shared/src/validation/project-code.ts:31` (type only)
- Delete: `apps/api/src/modules/projects/projects.dto.ts`, `apps/api/src/modules/projects/project-request-parity.test.ts`

**Interfaces:**
- Consumes: `createProjectRequest`, `updateProjectRequest` and their types (Task 2); `ZodPipe`.
- Produces: `ProjectsService.create(identity: ApplicationIdentity, input: CreateProjectRequest)`, `ProjectsService.update(identity: ApplicationIdentity, projectId: string, input: UpdateProjectRequest)`; `projectCodeBase(input: { title: string; area?: string | null; startDate?: string | null })`.

- [ ] **Step 1: Write the HTTP test**

Create `apps/api/src/modules/projects/projects.controller.validation.test.ts`:

```ts
import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProjectsController } from './projects.controller'
import { ProjectsService } from './projects.service'

const projectId = '10000000-0000-4000-8000-000000000001'
const actor = { id: '30000000-0000-4000-8000-000000000003', aal: 'aal2' }
const projects = { create: vi.fn(), update: vi.fn() }
const update = {
  clientMutationId: '20000000-0000-4000-8000-000000000002',
  expectedUpdatedAt: '2026-09-24T00:00:00.000Z',
}
let app: INestApplication
let base: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [ProjectsController],
    providers: [{ provide: ProjectsService, useValue: projects }],
  }).compile()
  app = module.createNestApplication({ logger: false })
  // Attaches the identity the auth guard would attach.
  app.use((request: { user?: unknown }, _response: unknown, next: () => void) => {
    request.user = actor
    next()
  })
  // Same global validation as main.ts, so the routes see the production pipe chain.
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
  base = `http://127.0.0.1:${port}/projects`
})

beforeEach(() => {
  projects.create.mockReset().mockResolvedValue({ id: projectId })
  projects.update.mockReset().mockResolvedValue({ id: projectId })
})
afterAll(async () => app?.close())

// Sends a raw JSON body and returns the status with the parsed response body.
async function send(method: 'POST' | 'PATCH', url: string, body: string) {
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  })
  return { status: response.status, body: await response.json() }
}

describe('projects body validation', () => {
  it('forwards a trimmed, upper-cased code and a coerced count on create', async () => {
    const result = await send(
      'POST',
      base,
      '{"title":"  Synthetic project  ","code":" crl-ns-2026 ","targetBeneficiaries":"250","status":"PLANNED"}',
    )
    expect(result.status).toBe(201)
    expect(projects.create).toHaveBeenCalledWith(actor, {
      title: 'Synthetic project',
      code: 'CRL-NS-2026',
      targetBeneficiaries: 250,
      status: 'PLANNED',
    })
  })

  it('forwards an optimistic update with its mutation keys', async () => {
    const body = { title: 'Synthetic project', status: 'ONGOING', ...update }
    const result = await send('PATCH', `${base}/${projectId}`, JSON.stringify(body))
    expect(result.status).toBe(200)
    expect(projects.update).toHaveBeenCalledWith(actor, projectId, body)
  })

  it.each([
    [
      'an impossible start date',
      '{"title":"Synthetic project","status":"PLANNED","startDate":"2026-02-30"}',
    ],
    ['a lower-case status', '{"title":"Synthetic project","status":"planned"}'],
    [
      'a null officer list',
      '{"title":"Synthetic project","status":"PLANNED","projectOfficerIds":null}',
    ],
    ['an empty body', '{}'],
  ])('answers 400 for %s without calling the service', async (_label, body) => {
    expect(await send('POST', base, body)).toEqual({
      status: 400,
      body: {
        statusCode: 400,
        error: 'Bad Request',
        message: expect.arrayContaining([expect.any(String)]),
      },
    })
    expect(projects.create).not.toHaveBeenCalled()
  })

  it('answers 400 naming a retired key on update without calling the service', async () => {
    const body = { title: 'Synthetic project', status: 'PLANNED', targetGoal: 75, ...update }
    const result = await send('PATCH', `${base}/${projectId}`, JSON.stringify(body))
    expect(result.status).toBe(400)
    expect(result.body.message).toContain("Unrecognized key(s) in object: 'targetGoal'")
    expect(projects.update).not.toHaveBeenCalled()
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/projects/projects.controller.validation.test.ts`
Expected: FAIL, 6 of 7 tests (only the unchanged update body passes): Vitest emits no decorator metadata, so the global pipe sees no DTO metatype and forwards every body raw (ruling 12).

- [ ] **Step 2: Switch the controller and service**

`apps/api/src/modules/projects/projects.controller.ts`:
- Delete the two lines `// biome-ignore lint/style/useImportType: Nest validation needs the DTO constructors at runtime.` and `import { CreateProjectDto, UpdateProjectDto } from './projects.dto'`.
- Add directly below the `} from '@nestjs/common'` line:

```ts
import {
  type CreateProjectRequest,
  type UpdateProjectRequest,
  createProjectRequest,
  updateProjectRequest,
} from '@pathways/shared'
```

- Add below `import { RequirePermission } from '../../common/decorators/permission.decorator'`:

```ts
import { ZodPipe } from '../../common/validation/zod-pipe'
```

- Replace `@Body() body: CreateProjectDto` with `@Body(new ZodPipe(createProjectRequest)) body: CreateProjectRequest`, and `@Body() body: UpdateProjectDto` with `@Body(new ZodPipe(updateProjectRequest)) body: UpdateProjectRequest`.

`apps/api/src/modules/projects/projects.service.ts`:
- In the `@pathways/shared` import block, add the two lines `  type CreateProjectRequest,` and `  type UpdateProjectRequest,` directly below `  type CanonicalRole,`.
- Delete the line `import type { CreateProjectDto, UpdateProjectDto } from './projects.dto'`, then:

```bash
S=apps/api/src/modules/projects/projects.service.ts
sed -i -e 's/CreateProjectDto/CreateProjectRequest/g' -e 's/UpdateProjectDto/UpdateProjectRequest/g' $S
grep -c "CreateProjectRequest\|UpdateProjectRequest" $S
```

Expected: `7` lines (the two import lines, then `projectData`, `replaceTeamAssignments`, `generateProjectCode`, `create` and `update`).

`packages/shared/src/validation/project-code.ts`: replace

```ts
export function projectCodeBase(input: { title: string; area?: string; startDate?: string }) {
```

with

```ts
export function projectCodeBase(input: {
  title: string
  area?: string | null
  startDate?: string | null
}) {
```

- [ ] **Step 3: Repoint the seeds, the metadata test and the controller test, and delete the DTO**

```bash
for f in apps/api/prisma/defense-demo-base.ts apps/api/prisma/hosted-realistic-seed.ts apps/api/prisma/local-demo-stages.ts; do
  sed -i -e "s#^import type { CreateProjectDto } from '../src/modules/projects/projects.dto'\$#import type { CreateProjectRequest } from '@pathways/shared'#" -e 's/CreateProjectDto/CreateProjectRequest/g' $f
done
git grep -n "CreateProjectRequest" -- apps/api/prisma | wc -l
```

Expected: `7` (three imports, `defense-demo-base.ts` cast, `hosted-realistic-seed.ts` annotation, and the `local-demo-stages.ts` return type and cast).

In `apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts` delete the four lines

```ts
  {
    file: 'src/modules/projects/projects.controller.ts',
    dtoNames: ['CreateProjectDto', 'UpdateProjectDto'],
  },
```

Replace the whole of `apps/api/src/modules/projects/projects.controller.test.ts` with (the class-validator tests become contract tests with the same inputs; ruling 4 covers the two message changes):

```ts
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'

import {
  type CreateProjectRequest,
  type UpdateProjectRequest,
  createProjectRequest,
  hasAtomicPermission,
  updateProjectRequest,
} from '@pathways/shared'
import type {
  ApplicationIdentity,
  AuthenticatedRequest,
} from '../../common/authz/application-identity'
import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { ProjectsController } from './projects.controller'
import type { ProjectsService } from './projects.service'

const assignedProjectId = '51000000-0000-4000-8000-000000000004'
const identity: ApplicationIdentity = {
  id: '51000000-0000-4000-8000-000000000001',
  aal: 'aal2',
  userId: '51000000-0000-4000-8000-000000000002',
  organizationId: '51000000-0000-4000-8000-000000000003',
  fullName: 'Synthetic manager',
  roles: ['PROJECT_MANAGER'],
  permissions: ['projects.read', 'projects.create'],
  assignedProjectIds: [assignedProjectId],
}
const createPipe = new ZodPipe(createProjectRequest)
const updatePipe = new ZodPipe(updateProjectRequest)
const updateKeys = {
  expectedUpdatedAt: '2026-09-24T00:00:00.000Z',
  clientMutationId: '10000000-0000-4000-8000-000000000001',
}

// The 400 messages a pipe answered, or a failure when it accepted the body.
function rejection(run: () => unknown): string[] {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException)
    return ((error as BadRequestException).getResponse() as { message: string[] }).message
  }
  throw new Error('Expected a BadRequestException.')
}

describe('ProjectsController active project contract', () => {
  it('passes authenticated create and update payloads to the scoped project service', async () => {
    const service = {
      create: vi.fn().mockResolvedValue({ id: 'created' }),
      update: vi.fn().mockResolvedValue({ id: 'updated' }),
    }
    const controller = new ProjectsController(service as unknown as ProjectsService)
    const request = { user: identity } as AuthenticatedRequest
    const create: CreateProjectRequest = { title: 'Synthetic project', status: 'PLANNED' }
    const update: UpdateProjectRequest = {
      title: 'Synthetic project',
      status: 'ONGOING',
      ...updateKeys,
    }

    await expect(controller.create(request, create)).resolves.toEqual({ id: 'created' })
    await expect(controller.update(request, assignedProjectId, update)).resolves.toEqual({
      id: 'updated',
    })
    expect(service.create).toHaveBeenCalledWith(identity, create)
    expect(service.update).toHaveBeenCalledWith(identity, assignedProjectId, update)
  })

  it('rejects requests without an authenticated application profile', () => {
    const controller = new ProjectsController({} as ProjectsService)
    expect(() => controller.list({} as AuthenticatedRequest)).toThrow(ForbiddenException)
  })

  it.each(['62.5', '0', '', null, 75])(
    'rejects retired targetGoal %s through the project contracts',
    (targetGoal) => {
      const body = { title: 'Synthetic project', status: 'PLANNED', targetGoal }
      for (const [pipe, extra] of [
        [createPipe, {}],
        [updatePipe, updateKeys],
      ] as const) {
        expect(rejection(() => pipe.transform({ ...body, ...extra }))).toContain(
          "Unrecognized key(s) in object: 'targetGoal'",
        )
      }
    },
  )

  it.each(['Partner A, Partner B', '', null])(
    'rejects deprecated free-text implementingPartners %j through the project contracts',
    (implementingPartners) => {
      const body = {
        title: 'Synthetic project',
        status: 'PLANNED',
        implementingPartnerNames: ['Partner A'],
        implementingPartners,
      }
      for (const [pipe, extra] of [
        [createPipe, {}],
        [updatePipe, updateKeys],
      ] as const) {
        expect(rejection(() => pipe.transform({ ...body, ...extra }))).toContain(
          "Unrecognized key(s) in object: 'implementingPartners'",
        )
      }
    },
  )

  it('accepts goal-free creation and optimistic updates through the project contracts', () => {
    const create = createPipe.transform({
      title: 'Synthetic project',
      status: 'PLANNED',
      targetBeneficiaries: 250,
    })
    const update = updatePipe.transform({
      title: 'Synthetic project',
      status: 'ONGOING',
      ...updateKeys,
    })
    expect(create.targetBeneficiaries).toBe(250)
    expect(create).not.toHaveProperty('targetGoal')
    expect(update).not.toHaveProperty('targetGoal')
  })

  it.each([
    { targetBeneficiaries: -1 },
    { targetBeneficiaries: 2_147_483_648 },
    { targetBeneficiaries: 1.5 },
    { projectBudget: '-1' },
    { projectBudget: '1.001' },
    { projectBudget: '1e3' },
  ])('rejects invalid Project count or PHP budget input %j', (invalid) => {
    expect(
      createProjectRequest.safeParse({ title: 'Synthetic project', status: 'PLANNED', ...invalid })
        .success,
    ).toBe(false)
  })

  it('keeps the PHP budget message the web shows', () => {
    expect(
      rejection(() =>
        createPipe.transform({
          title: 'Synthetic project',
          status: 'PLANNED',
          projectBudget: '-1',
        }),
      ),
    ).toEqual(['projectBudget must be a non-negative PHP amount with at most 2 decimal places.'])
  })

  it('accepts the complete repaired Project transport contract', () => {
    const parsed = createProjectRequest.parse({
      title: 'Synthetic project',
      description: 'Description',
      objectives: 'Objectives',
      implementationArea: 'Area',
      implementingPartnerNames: ['Partner'],
      sector: 'Livelihood',
      targetBeneficiaries: '250',
      projectBudget: '125000.50',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'PLANNED',
    })
    expect(parsed.targetBeneficiaries).toBe(250)
  })

  it('guards archive with projects.archive, which a Project Officer does not hold', async () => {
    expect(Reflect.getMetadata(PERMISSION_KEY, ProjectsController.prototype.archive)).toBe(
      'projects.archive',
    )
    expect(hasAtomicPermission('PROJECT_OFFICER', ['projects.archive'], 'projects.archive')).toBe(
      false,
    )
    expect(hasAtomicPermission('PROJECT_MANAGER', ['projects.archive'], 'projects.archive')).toBe(
      true,
    )
    const service = { archive: vi.fn().mockResolvedValue({ id: assignedProjectId }) }
    const controller = new ProjectsController(service as unknown as ProjectsService)
    await controller.archive({ user: identity } as AuthenticatedRequest, assignedProjectId)
    expect(service.archive).toHaveBeenCalledWith(identity, assignedProjectId)
  })
})
```

```bash
git rm -q apps/api/src/modules/projects/projects.dto.ts apps/api/src/modules/projects/project-request-parity.test.ts
git grep -n "projects\.dto\|CreateProjectDto\|UpdateProjectDto" -- apps packages
```

Expected: the grep prints nothing.

- [ ] **Step 4: Run the tests and commit**

```bash
git add -N apps/api packages/shared
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts')
pnpm --filter @pathways/api exec vitest run src/modules/projects src/common/validation src/modules/rules/rules-source-domains.test.ts src/modules/core-foundation.test.ts
pnpm --filter @pathways/shared exec vitest run src/validation/project-code.test.ts src/contracts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api packages/shared
git commit -m "refactor(api): validate the projects create and update bodies with the shared contracts

CreateProjectDto, UpdateProjectDto and their parity test are removed; the routes keep the 400 shape.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the 7 HTTP tests and the 20 controller tests pass; typecheck (which also checks the three seeds) and lint pass; api = `B_api + 64` (the 112 parity tests and 1 controller-dto-runtime-metadata case leave, 7 HTTP tests and 1 controller test arrive).

---

### Task 4: Program request contract and route switch

**Files:**
- Create: `packages/shared/src/contracts/programs/program-requests.ts`
- Test: `packages/shared/src/contracts/programs/program-requests.test.ts`
- Modify: `packages/shared/src/index.ts` (barrel line)
- Create then delete: `apps/api/src/modules/programs/program-request-parity.test.ts`
- Test: `apps/api/src/modules/programs/programs.controller.validation.test.ts`
- Modify: `apps/api/src/modules/programs/programs.controller.ts`, `apps/api/src/modules/programs/programs.service.ts`, `apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts` (programs case)
- Delete: `apps/api/src/modules/programs/programs.dto.ts`

**Interfaces:**
- Consumes: `recordCodeInput`, `storedProjectStatuses` (Task 2); `lengthString`, `strictIsoDateString`, `trimmedInput` (Task 1).
- Produces: `createProgramRequest` and `type CreateProgramRequest` (`code: string`, `name: string`, `description?: string | null`, `startDate?: string | null`, `endDate?: string | null`, `status: StoredProjectStatus`) from `@pathways/shared`; `ProgramsService.create(identity: ApplicationIdentity, input: CreateProgramRequest)`.

- [ ] **Step 1: Write the failing contract test**

Create `packages/shared/src/contracts/programs/program-requests.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { createProgramRequest } from './program-requests'

const base = { code: 'PRG-1', name: 'Synthetic program', status: 'ONGOING' }

describe('createProgramRequest', () => {
  it('trims and upper-cases the code and trims the name as the DTO did', () => {
    expect(
      createProgramRequest.parse({ ...base, code: ' prg-2026 ', name: '  Synthetic program  ' }),
    ).toEqual({ ...base, code: 'PRG-2026' })
  })

  it.each([
    { code: null },
    { code: 'A' },
    { name: '  ab  ' },
    { endDate: '2026-02-30' },
    { status: 'ACTIVE' },
    { extra: 1 },
  ])('rejects %j', (extra) => {
    expect(createProgramRequest.safeParse({ ...base, ...extra }).success).toBe(false)
  })
})
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/programs/program-requests.test.ts`
Expected: FAIL, cannot resolve `./program-requests`.

- [ ] **Step 2: Create the contract and export it**

Create `packages/shared/src/contracts/programs/program-requests.ts`:

```ts
import { z } from 'zod'

import { lengthString, strictIsoDateString, trimmedInput } from '../common/field-schemas'
import { recordCodeInput, storedProjectStatuses } from '../projects/project-requests'

// Body of POST /programs.
export const createProgramRequest = z
  .object({
    code: recordCodeInput,
    name: trimmedInput(lengthString(3, 160)),
    description: lengthString(0, 2000).nullish(),
    startDate: strictIsoDateString.nullish(),
    endDate: strictIsoDateString.nullish(),
    status: z.enum(storedProjectStatuses),
  })
  .strict()
export type CreateProgramRequest = z.infer<typeof createProgramRequest>
```

Append to `packages/shared/src/index.ts`, after the Task 2 line:

```ts
export * from './contracts/programs/program-requests'
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/programs/program-requests.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 3: Write the parity test**

Create `apps/api/src/modules/programs/program-request-parity.test.ts`:

```ts
import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { createProgramRequest } from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { CreateProgramDto } from './programs.dto'

// Same options as main.ts.
const globalPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: false,
})
const zodPipe = new ZodPipe(createProgramRequest)

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
      metatype: CreateProgramDto,
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

const badRequestShape = {
  accepted: false,
  value: {
    statusCode: 400,
    error: 'Bad Request',
    message: expect.arrayContaining([expect.any(String)]),
  },
}
const base = { code: 'prg-1', name: 'Synthetic program', status: 'ONGOING' }
const body = (extra: Record<string, unknown>) => JSON.stringify({ ...base, ...extra })

describe('CreateProgramDto and createProgramRequest parity', () => {
  it.each([
    body({}),
    body({ code: ' prg-2026 ' }),
    body({ name: '  abc  ' }),
    body({ description: null }),
    body({ startDate: '2026-01-01', endDate: '2026-12-31' }),
    body({ startDate: null }),
    body({ startDate: '2026-01-01T00:00:00Z' }),
  ])('both accept %s with the same value', async (json) => {
    const [dto, zod] = await Promise.all([viaDto(json), viaZod(json)])
    expect(dto.accepted).toBe(true)
    expect(zod).toEqual(dto)
  })

  it.each([
    body({ code: null }),
    JSON.stringify({ name: 'Synthetic program', status: 'ONGOING' }),
    body({ code: 'A' }),
    body({ code: '_A' }),
    body({ name: '  ab  ' }),
    body({ name: 'x'.repeat(161) }),
    body({ description: 'x'.repeat(2001) }),
    body({ startDate: '2026-02-30' }),
    body({ status: 'ACTIVE' }),
    body({ status: null }),
    body({ extra: 1 }),
    '[]',
    '{}',
  ])('both answer the 400 shape for %s', async (json) => {
    expect(await viaDto(json)).toEqual(badRequestShape)
    expect(await viaZod(json)).toEqual(badRequestShape)
  })

  // The DTO route dropped these keys and the contract rejects them.
  it.each([
    '{"code":"PRG","name":"Synthetic program","status":"ONGOING","__proto__":{"a":1}}',
    '{"code":"PRG","name":"Synthetic program","status":"ONGOING","constructor":{"a":1}}',
  ])('only the contract rejects %s', async (json) => {
    expect((await viaDto(json)).accepted).toBe(true)
    expect(await viaZod(json)).toEqual(badRequestShape)
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/programs/program-request-parity.test.ts`
Expected: PASS, 22 tests (7 accepted, 13 rejected, 2 exceptions). Any failure: stop and report the row.

- [ ] **Step 4: Commit the contract and the evidence**

```bash
git add -N packages/shared apps/api
pnpm exec biome check --write packages/shared/src/contracts/programs packages/shared/src/index.ts apps/api/src/modules/programs/program-request-parity.test.ts
pnpm typecheck && pnpm lint
git checkout -- apps/web/next-env.d.ts
git add packages/shared/src/contracts/programs packages/shared/src/index.ts apps/api/src/modules/programs/program-request-parity.test.ts
git commit -m "feat(shared): add the program request contract with its DTO parity test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: shared = `B_shared + 39`, api = `B_api + 86` (one controller-dto-runtime-metadata case is lost for the programs route).

- [ ] **Step 5: Write the HTTP test**

Create `apps/api/src/modules/programs/programs.controller.validation.test.ts`:

```ts
import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ProgramsController } from './programs.controller'
import { ProgramsService } from './programs.service'

const actor = { id: '30000000-0000-4000-8000-000000000003', aal: 'aal2' }
const programs = { create: vi.fn() }
let app: INestApplication
let url: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [ProgramsController],
    providers: [{ provide: ProgramsService, useValue: programs }],
  }).compile()
  app = module.createNestApplication({ logger: false })
  // Attaches the identity the auth guard would attach.
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
  url = `http://127.0.0.1:${port}/programs`
})

beforeEach(() => programs.create.mockReset().mockResolvedValue({ id: 'program' }))
afterAll(async () => app?.close())

// Posts a raw JSON body and returns the status with the parsed response body.
async function post(body: string) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
  return { status: response.status, body: await response.json() }
}

describe('POST programs body validation', () => {
  it('forwards a trimmed, upper-cased code and a trimmed name', async () => {
    const result = await post(
      '{"code":" prg-2026 ","name":"  Synthetic program  ","status":"ONGOING"}',
    )
    expect(result.status).toBe(201)
    expect(programs.create).toHaveBeenCalledWith(actor, {
      code: 'PRG-2026',
      name: 'Synthetic program',
      status: 'ONGOING',
    })
  })

  it.each([
    ['a missing code', '{"name":"Synthetic program","status":"ONGOING"}'],
    [
      'an impossible end date',
      '{"code":"PRG","name":"Synthetic program","status":"ONGOING","endDate":"2026-02-30"}',
    ],
    ['an unknown status', '{"code":"PRG","name":"Synthetic program","status":"ACTIVE"}'],
    ['an unknown key', '{"code":"PRG","name":"Synthetic program","status":"ONGOING","extra":1}'],
  ])('answers 400 for %s without calling the service', async (_label, body) => {
    expect(await post(body)).toEqual({
      status: 400,
      body: {
        statusCode: 400,
        error: 'Bad Request',
        message: expect.arrayContaining([expect.any(String)]),
      },
    })
    expect(programs.create).not.toHaveBeenCalled()
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/programs/programs.controller.validation.test.ts`
Expected: FAIL, all 5 tests (no metatype under Vitest, so the DTO route forwards raw bodies; ruling 12).

- [ ] **Step 6: Switch the route and delete the DTO**

`apps/api/src/modules/programs/programs.controller.ts`:
- Add below `import { Body, Controller, ForbiddenException, Get, Inject, Post, Req } from '@nestjs/common'`:

```ts
import { type CreateProgramRequest, createProgramRequest } from '@pathways/shared'
```

- Replace the two lines `// biome-ignore lint/style/useImportType: Nest validation needs the DTO constructor at runtime.` and `import { CreateProgramDto } from './programs.dto'` with:

```ts
import { ZodPipe } from '../../common/validation/zod-pipe'
```

- Replace `@Body() body: CreateProgramDto` with `@Body(new ZodPipe(createProgramRequest)) body: CreateProgramRequest`.

`apps/api/src/modules/programs/programs.service.ts`:
- Add below `import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common'`:

```ts
import type { CreateProgramRequest } from '@pathways/shared'
```

- Delete `import type { CreateProgramDto } from './programs.dto'`; replace `input: CreateProgramDto` with `input: CreateProgramRequest`.

`apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts`: delete the line `  { file: 'src/modules/programs/programs.controller.ts', dtoNames: ['CreateProgramDto'] },`.

```bash
git rm -q apps/api/src/modules/programs/programs.dto.ts apps/api/src/modules/programs/program-request-parity.test.ts
git grep -n "programs\.dto\|CreateProgramDto" -- apps packages
git grep -c "file: 'src/modules/" -- apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts
```

Expected: the first grep prints nothing; the count prints `8`.

- [ ] **Step 7: Run the tests and commit**

```bash
git add -N apps/api
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts')
pnpm --filter @pathways/api exec vitest run src/modules/programs src/common/validation src/modules/core-foundation.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api
git commit -m "refactor(api): validate the programs create body with the shared contract

CreateProgramDto and its parity test are removed; the route keeps the 400 shape.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the 5 HTTP tests pass; api = `B_api + 68` (the programs parity tests leave; Tasks 3 and 4 each lose one metadata case).

---

### Task 5: Project response contracts and the projects mapper

**Files:**
- Create: `packages/shared/src/contracts/projects/project-responses.ts`
- Modify: `packages/shared/src/index.ts` (barrel line)
- Create: `apps/api/src/modules/projects/projects.mapper.ts`
- Modify: `apps/api/src/modules/projects/projects.service.ts` (mapper lines removed)

**Interfaces:**
- Consumes: `storedProjectStatuses` (Task 2).
- Produces: from `@pathways/shared`, `projectResponse` with `type ProjectResponse`, `projectSummaryResponse` with `type ProjectSummaryResponse` (`id`, `code`, `title`, `status`), `archiveProjectResponse` with `type ArchiveProjectResponse` (`{ id: string; archivedAt: string }`); from `apps/api/src/modules/projects/projects.mapper.ts`, `projectSelection` (a `Prisma.ProjectSelect` literal) and `mapProject(project: Prisma.ProjectGetPayload<{ select: typeof projectSelection }>, projectBudget: string | null): ProjectResponse`.

- [ ] **Step 1: Create the cut and line check scripts**

Create `.tmp/s1a/cut-blocks.mjs`:

```js
// Deletes line blocks from one file by their exact first and last lines, then applies exact text replacements.
import { readFileSync, writeFileSync } from 'node:fs'

const [file, planFile] = process.argv.slice(2)
const { blocks, replacements } = JSON.parse(readFileSync(planFile, 'utf8'))
let lines = readFileSync(file, 'utf8').split('\n')
for (const { first, last } of blocks) {
  const start = lines.indexOf(first)
  if (start < 0) throw new Error(`First line not found: ${first}`)
  const end = lines.indexOf(last, start)
  if (end < 0) throw new Error(`Last line not found after ${first}: ${last}`)
  // A blank line left behind by the cut goes with the block.
  const extra = lines[end + 1] === '' ? 1 : 0
  console.log(`cut ${end - start + 1} lines from ${first.trim()}`)
  lines = [...lines.slice(0, start), ...lines.slice(end + 1 + extra)]
}
let text = lines.join('\n')
for (const [from, to, count] of replacements) {
  const found = text.split(from).length - 1
  if (found !== count) throw new Error(`Expected ${count} of ${from}, found ${found}`)
  text = text.replaceAll(from, to)
}
writeFileSync(file, text)
console.log(`${file}: ${text.split('\n').length} lines`)
```

Create `.tmp/s1a/same-lines.mjs`:

```js
// Fails unless the new files hold the original files' non-import lines, ignoring order, indentation, blanks and export keywords.
// Usage: node same-lines.mjs <original...> -- <new...> [new-text=original-text ...]
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const split = args.indexOf('--')
const originals = args.slice(0, split)
const rest = args.slice(split + 1)
const renames = rest.filter((arg) => arg.includes('=')).map((arg) => arg.split('='))
const files = rest.filter((arg) => !arg.includes('='))
const start = /^(?:\/\/|\/\*\*|export\s|const\s|let\s|function\s|async\s|class\s|type\s|interface\s|@)/

// Trimmed declaration lines after the import block, with renames undone and export keywords dropped.
const body = (file) => {
  const lines = readFileSync(file, 'utf8').split('\n')
  return lines
    .slice(lines.findIndex((line) => start.test(line)))
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => renames.reduce((text, [from, to]) => text.replaceAll(from, to), line))
    .map((line) => line.replace(/^export /, ''))
}
const count = (lines) => lines.reduce((map, line) => map.set(line, (map.get(line) ?? 0) + 1), new Map())
const before = count(originals.flatMap(body))
const after = count(files.flatMap(body))
const problems = []
for (const [line, n] of before)
  if ((after.get(line) ?? 0) !== n) problems.push(`original ${n}x, new ${after.get(line) ?? 0}x: ${line}`)
for (const [line, n] of after) if (!before.has(line)) problems.push(`new only ${n}x: ${line}`)
console.log(problems.length ? problems.join('\n') : `same lines: ${[...before.values()].reduce((a, b) => a + b, 0)}`)
process.exitCode = problems.length ? 1 : 0
```

Create `.tmp/s1a/mapper-cut.json`:

```json
{
  "blocks": [
    { "first": "const projectSelection = {", "last": "} satisfies Prisma.ProjectSelect" },
    { "first": "const teamPreviewLimit = 8", "last": "const teamPreviewLimit = 8" },
    { "first": "function mapProject(", "last": "}" }
  ],
  "replacements": [
    [
      "import { PrismaService } from '../../prisma/prisma.service'\n",
      "import { PrismaService } from '../../prisma/prisma.service'\nimport { mapProject, projectSelection } from './projects.mapper'\n",
      1
    ]
  ]
}
```

- [ ] **Step 2: Write the mapper against the missing response type**

Create `apps/api/src/modules/projects/projects.mapper.ts`. Its body is `projectSelection`, `teamPreviewLimit` and `mapProject` exactly as they stand in `projects.service.ts`, with three edits: `export` on `projectSelection` and `mapProject`, and the return type `: ProjectResponse`:

```ts
import type { ProjectResponse } from '@pathways/shared'
import type { Prisma } from '@prisma/client'

export const projectSelection = {
  id: true,
  code: true,
  title: true,
  description: true,
  objectives: true,
  implementationArea: true,
  implementingPartners: true,
  implementingPartnerLinks: {
    select: { partner: { select: { id: true, name: true } } },
    orderBy: { partnerId: 'asc' as const },
    take: 20,
  },
  sector: true,
  targetBeneficiaries: true,

  programManagerId: true,
  startDate: true,
  endDate: true,
  status: true,
  programId: true,
  updatedAt: true,
  programManager: { select: { id: true, fullName: true, email: true } },
  userProjectAssignment_project: {
    where: { status: 'ACTIVE' as const, endedAt: null },
    select: {
      user: { select: { id: true, fullName: true, email: true, role: { select: { code: true } } } },
    },
    orderBy: { id: 'asc' as const },
    take: 50,
  },
} satisfies Prisma.ProjectSelect

const teamPreviewLimit = 8

export function mapProject(
  project: Prisma.ProjectGetPayload<{ select: typeof projectSelection }>,
  projectBudget: string | null,
): ProjectResponse {
  const team = project.userProjectAssignment_project
  const projectManagers = team.filter(
    (assignment) => assignment.user.role.code === 'PROJECT_MANAGER',
  )
  const monitoringOfficers = team.filter(
    (assignment) => assignment.user.role.code === 'MONITORING_AND_EVALUATION_OFFICER',
  )
  const projectOfficers = team.filter(
    (assignment) => assignment.user.role.code === 'PROJECT_OFFICER',
  )
  return {
    id: project.id,
    code: project.code,
    title: project.title,
    description: project.description,
    objectives: project.objectives,
    implementationArea: project.implementationArea,
    implementingPartners: project.implementingPartners,
    implementingPartnerRecords: project.implementingPartnerLinks.map((link) => link.partner),
    sector: project.sector,
    targetBeneficiaries: project.targetBeneficiaries,
    projectBudget,

    startDate: project.startDate?.toISOString().slice(0, 10),
    endDate: project.endDate?.toISOString().slice(0, 10),
    status: project.status,
    programId: project.programId,
    programManagerId: project.programManagerId,
    programManager: project.programManager?.fullName ?? null,
    projectManagerId: projectManagers[0]?.user.id ?? null,
    projectManager: projectManagers[0]?.user.fullName ?? null,
    monitoringOfficerId: monitoringOfficers[0]?.user.id ?? null,
    monitoringOfficer: monitoringOfficers[0]?.user.fullName ?? null,
    projectOfficerIds: projectOfficers.map((assignment) => assignment.user.id),
    projectOfficers: projectOfficers.map((assignment) => assignment.user.fullName),
    team: team.slice(0, teamPreviewLimit).map(({ user }) => ({
      userId: user.id,
      fullName: user.fullName,
      role: user.role.code,
    })),
    updatedAt: project.updatedAt.toISOString(),
  }
}
```

Run: `pnpm --filter @pathways/api typecheck`
Expected: FAIL, `@pathways/shared` has no exported member `ProjectResponse`.

- [ ] **Step 3: Add the response contracts**

Create `packages/shared/src/contracts/projects/project-responses.ts`:

```ts
import { z } from 'zod'

import { storedProjectStatuses } from './project-requests'

// Response shapes of the projects routes, used as types and never parsed at runtime.

const projectTeamMemberResponse = z.object({
  userId: z.string(),
  fullName: z.string(),
  role: z.string(),
})

// One project as the detail, create, update and detail-list routes return it.
export const projectResponse = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  objectives: z.string().nullable(),
  implementationArea: z.string().nullable(),
  implementingPartners: z.string().nullable(),
  implementingPartnerRecords: z.array(z.object({ id: z.string(), name: z.string() })),
  sector: z.string().nullable(),
  targetBeneficiaries: z.number().int().nullable(),
  projectBudget: z.string().nullable(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(storedProjectStatuses),
  programId: z.string().nullable(),
  programManagerId: z.string().nullable(),
  programManager: z.string().nullable(),
  projectManagerId: z.string().nullable(),
  projectManager: z.string().nullable(),
  monitoringOfficerId: z.string().nullable(),
  monitoringOfficer: z.string().nullable(),
  projectOfficerIds: z.array(z.string()),
  projectOfficers: z.array(z.string()),
  team: z.array(projectTeamMemberResponse),
  updatedAt: z.string(),
})
export type ProjectResponse = z.infer<typeof projectResponse>

// A GET /projects row for a reader without projects.detail.read.
export const projectSummaryResponse = projectResponse.pick({
  id: true,
  code: true,
  title: true,
  status: true,
})
export type ProjectSummaryResponse = z.infer<typeof projectSummaryResponse>

// Body of the POST /projects/:projectId/archive answer.
export const archiveProjectResponse = z.object({ id: z.string(), archivedAt: z.string() })
export type ArchiveProjectResponse = z.infer<typeof archiveProjectResponse>
```

Append to `packages/shared/src/index.ts`, directly after `export * from './contracts/projects/project-requests'`:

```ts
export * from './contracts/projects/project-responses'
```

- [ ] **Step 4: Cut the mapper out of the service and check the lines**

```bash
S=apps/api/src/modules/projects/projects.service.ts
git show HEAD:$S > .tmp/s1a/projects.service.task5.ts
node .tmp/s1a/cut-blocks.mjs $S .tmp/s1a/mapper-cut.json
node .tmp/s1a/same-lines.mjs .tmp/s1a/projects.service.task5.ts -- $S apps/api/src/modules/projects/projects.mapper.ts "): ProjectResponse {=) {"
```

Expected (dry run on `a101ad7c` after Tasks 3 and 4):

```text
cut 32 lines from const projectSelection = {
cut 1 lines from const teamPreviewLimit = 8
cut 47 lines from function mapProject(
apps/api/src/modules/projects/projects.service.ts: 517 lines
same lines: 542
```

Any other output: stop, the move is not verbatim.

- [ ] **Step 5: Run the tests and commit**

```bash
git add -N apps/api packages/shared
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts')
pnpm --filter @pathways/api exec vitest run src/modules/projects src/modules/project-map
pnpm typecheck && pnpm lint
pnpm test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api packages/shared
git commit -m "refactor(api): move the project row mapper into projects.mapper with a shared response type

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: typecheck passes (so `mapProject` returns exactly `ProjectResponse`); counts unchanged from Task 4.

---

### Task 6: Split team and budget writes out of ProjectsService

**Files:**
- Move: `apps/api/src/modules/projects/project-budget.ts` -> `apps/api/src/modules/projects/project-budget.service.ts` (commit 1, with the import in `project-overview-metrics.service.ts:24`)
- Modify: `apps/api/src/modules/projects/project-budget.service.ts` (commit 2: full content below)
- Create: `apps/api/src/modules/projects/project-team.service.ts`, `apps/api/src/modules/projects/projects.helpers.ts`
- Modify: `apps/api/src/modules/projects/projects.service.ts`

**Interfaces:**
- Produces: from `project-budget.service.ts`, `readProjectBudget(tx: Tx, orgId: string, id: string)` (unchanged signature apart from `Tx`), `readProjectBudgets(tx: Tx, actor: ApplicationIdentity, projectIds: string[]): Promise<Map<string, string>>`, `saveProjectBudget(tx: Tx, actor: ApplicationIdentity, projectId: string, value: string | undefined, operation: 'create' | 'update'): Promise<void>`; from `project-team.service.ts`, `replaceTeamAssignments(tx: Tx, actor: ApplicationIdentity, projectId: string, input: CreateProjectRequest | UpdateProjectRequest, creating: boolean): Promise<void>`; from `projects.helpers.ts`, `projectData(input: CreateProjectRequest | UpdateProjectRequest, code: string)`.

- [ ] **Step 1: Rename the budget module and commit**

```bash
git mv apps/api/src/modules/projects/project-budget.ts apps/api/src/modules/projects/project-budget.service.ts
sed -i "s#from './project-budget'#from './project-budget.service'#" apps/api/src/modules/projects/project-overview-metrics.service.ts
git grep -n "project-budget'" -- apps
pnpm --filter @pathways/api exec vitest run src/modules/projects
pnpm typecheck
git checkout -- apps/web/next-env.d.ts
git add -A apps/api/src/modules/projects
git status --short apps/api/src/modules/projects | grep "^R"
git commit -m "refactor(api): rename project-budget to project-budget.service

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the grep prints nothing; tests and typecheck pass; one `R` rename.

- [ ] **Step 2: Write the three modules**

Each body below is cut verbatim from `projects.service.ts` (methods de-indented by two spaces, `private async name(` written as `export async function name(`, and `tx: Prisma.TransactionClient,` written as `tx: Tx,`) or kept from `project-budget.service.ts`; Step 4 proves it before Biome formats.

Replace the whole of `apps/api/src/modules/projects/project-budget.service.ts` with:

```ts
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { budgetUtilization, hasAtomicPermission, missingMetric } from '@pathways/shared'
import { Prisma } from '@prisma/client'

import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'

const projectBudgetCategory = 'PROJECT_PROFILE_TOTAL'

/** Planned project budget, approved spending and the utilization metric derived from them. */
export async function readProjectBudget(tx: Tx, orgId: string, id: string) {
  const planned = await tx.projectBudgetRecord.findFirst({
    where: {
      organizationId: orgId,
      projectId: id,
      activityId: null,
      category: projectBudgetCategory,
      archivedAt: null,
    },
    select: { plannedBudget: true },
  })
  const spent = await tx.budgetExpenseEntry.aggregate({
    where: { organizationId: orgId, projectId: id, status: 'APPROVED' },
    _sum: { amount: true },
  })
  const approvedBudget = planned ? planned.plannedBudget.toFixed(2) : null
  const countableSpending = (spent._sum.amount ?? 0).toFixed(2)
  try {
    return {
      metric: budgetUtilization(approvedBudget, countableSpending),
      approvedBudget,
      countableSpending,
    }
  } catch {
    return { metric: missingMetric('OUT_OF_RANGE'), approvedBudget, countableSpending }
  }
}

function projectBudgetValue(value: string) {
  try {
    return new Prisma.Decimal(value)
  } catch {
    throw new BadRequestException('Project budget must be a valid non-negative PHP amount.')
  }
}

export async function readProjectBudgets(
  tx: Tx,
  actor: ApplicationIdentity,
  projectIds: string[],
) {
  const values = new Map<string, string>()
  if (
    projectIds.length === 0 ||
    !hasAtomicPermission(actor.roles[0], actor.permissions, 'budgets.read')
  ) {
    return values
  }
  const rows = await tx.projectBudgetRecord.findMany({
    where: {
      organizationId: actor.organizationId,
      projectId: { in: projectIds },
      activityId: null,
      category: projectBudgetCategory,
      archivedAt: null,
    },
    select: { projectId: true, plannedBudget: true },
    take: 100,
  })
  for (const row of rows) values.set(row.projectId, row.plannedBudget.toFixed(2))
  return values
}

export async function saveProjectBudget(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  value: string | undefined,
  operation: 'create' | 'update',
) {
  if (value === undefined) return
  const canCreate = hasAtomicPermission(actor.roles[0], actor.permissions, 'budgets.create')
  const canUpdate = hasAtomicPermission(actor.roles[0], actor.permissions, 'budgets.update')
  if (!canCreate || (operation === 'update' && !canUpdate)) {
    throw new ForbiddenException('Project budget authority is missing.')
  }
  const plannedBudget = projectBudgetValue(value)
  const current = await tx.projectBudgetRecord.findFirst({
    where: {
      organizationId: actor.organizationId,
      projectId,
      activityId: null,
      category: projectBudgetCategory,
      archivedAt: null,
    },
    select: { id: true, plannedBudget: true },
  })
  if (current?.plannedBudget.equals(plannedBudget)) return
  if (current) {
    await tx.projectBudgetRecord.update({
      where: { id: current.id },
      data: { archivedAt: new Date() },
    })
  }
  await tx.projectBudgetRecord.create({
    data: {
      organizationId: actor.organizationId,
      projectId,
      category: projectBudgetCategory,
      currency: 'PHP',
      plannedBudget,
      remarks: 'Project profile planned budget.',
      recordedById: actor.userId,
    },
  })
}
```

Create `apps/api/src/modules/projects/project-team.service.ts`:

```ts
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import {
  type CanonicalRole,
  type CreateProjectRequest,
  type UpdateProjectRequest,
  canAssignRole,
  isCanonicalRole,
} from '@pathways/shared'

import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'

const projectTeamRoles = [
  'PROJECT_MANAGER',
  'MONITORING_AND_EVALUATION_OFFICER',
  'PROJECT_OFFICER',
] as const
type ProjectTeamRole = (typeof projectTeamRoles)[number]

export async function replaceTeamAssignments(
  tx: Tx,
  actor: ApplicationIdentity,
  projectId: string,
  input: CreateProjectRequest | UpdateProjectRequest,
  creating: boolean,
) {
  const actorRole = actor.roles[0]
  if (!isCanonicalRole(actorRole))
    throw new ForbiddenException('Assignment authority is missing.')

  const requested = new Map<ProjectTeamRole, string[]>()
  if (input.projectManagerId !== undefined) {
    requested.set('PROJECT_MANAGER', input.projectManagerId ? [input.projectManagerId] : [])
  } else if (creating && actorRole === 'PROJECT_MANAGER') {
    requested.set('PROJECT_MANAGER', [actor.userId])
  }
  if (input.monitoringOfficerId !== undefined) {
    requested.set(
      'MONITORING_AND_EVALUATION_OFFICER',
      input.monitoringOfficerId ? [input.monitoringOfficerId] : [],
    )
  }
  if (input.projectOfficerIds !== undefined) {
    requested.set('PROJECT_OFFICER', input.projectOfficerIds)
  }
  if (requested.size === 0) return

  for (const [role, ids] of requested) {
    const normalized = [...new Set(ids.map((id) => id.toLowerCase()))]
    requested.set(role, normalized)
    const selfManagerSelection =
      actorRole === 'PROJECT_MANAGER' &&
      role === 'PROJECT_MANAGER' &&
      normalized.length === 1 &&
      normalized[0] === actor.userId.toLowerCase()
    if (!selfManagerSelection && !canAssignRole(actorRole, role as CanonicalRole)) {
      throw new ForbiddenException('Assignment authority is missing.')
    }
    if (actorRole === 'PROJECT_MANAGER' && role === 'PROJECT_MANAGER' && !selfManagerSelection) {
      throw new ForbiddenException(
        'A Project Manager cannot transfer their own project authority.',
      )
    }
  }

  const desiredIds = [...new Set([...requested.values()].flat())]
  const users = desiredIds.length
    ? await tx.systemUser.findMany({
        where: {
          id: { in: desiredIds },
          organizationId: actor.organizationId,
          accountStatus: 'ACTIVE',
          archivedAt: null,
          role: { code: { in: [...requested.keys()] }, isActive: true },
        },
        select: { id: true, role: { select: { code: true } } },
        take: 51,
      })
    : []
  const valid = new Set(
    users
      .filter((user) => requested.get(user.role.code as ProjectTeamRole)?.includes(user.id))
      .map((user) => user.id),
  )
  if (valid.size !== desiredIds.length) {
    throw new BadRequestException('One or more selected project team members are unavailable.')
  }

  const current = await tx.userProjectAssignment.findMany({
    where: {
      organizationId: actor.organizationId,
      projectId,
      status: 'ACTIVE',
      endedAt: null,
      user: { role: { code: { in: [...requested.keys()] } } },
    },
    select: { id: true, userId: true, user: { select: { role: { select: { code: true } } } } },
    take: 100,
  })
  const ending = current.filter(
    (assignment) =>
      !requested.get(assignment.user.role.code as ProjectTeamRole)?.includes(assignment.userId),
  )
  if (actorRole === 'PROJECT_MANAGER' && ending.some((row) => row.userId === actor.userId)) {
    throw new ForbiddenException('A Project Manager cannot remove their own project authority.')
  }
  if (ending.length) {
    const endingIds = ending.map((assignment) => assignment.id)
    const now = new Date()
    await tx.projectActivityAssignment.updateMany({
      where: {
        organizationId: actor.organizationId,
        projectId,
        projectAssignmentId: { in: endingIds },
        status: 'ACTIVE',
      },
      data: { status: 'REMOVED', endedAt: now, endReason: 'Project team updated.' },
    })
    await tx.userProjectAssignment.updateMany({
      where: { id: { in: endingIds }, organizationId: actor.organizationId, status: 'ACTIVE' },
      data: { status: 'ENDED', endedAt: now, endReason: 'Project team updated.' },
    })
  }
  const existing = new Set(
    current.filter((assignment) => !ending.includes(assignment)).map((row) => row.userId),
  )
  const additions = desiredIds.filter((userId) => !existing.has(userId))
  if (additions.length) {
    await tx.userProjectAssignment.createMany({
      data: additions.map((userId) => ({
        organizationId: actor.organizationId,
        projectId,
        userId,
        assignedById: actor.userId,
      })),
    })
  }
}
```

Create `apps/api/src/modules/projects/projects.helpers.ts`:

```ts
import { BadRequestException } from '@nestjs/common'
import type { CreateProjectRequest, UpdateProjectRequest } from '@pathways/shared'

export function projectData(input: CreateProjectRequest | UpdateProjectRequest, code: string) {
  if (input.startDate && input.endDate && input.endDate < input.startDate) {
    throw new BadRequestException('End date must not precede start date.')
  }

  return {
    code,
    title: input.title,
    description: input.description?.trim() || null,
    objectives: input.objectives?.trim() || null,
    implementationArea: input.implementationArea?.trim() || null,
    // projects.implementing_partners is deprecated read-only legacy text (migration 0039).
    ...(input.sector === undefined ? {} : { sector: input.sector?.trim() || null }),
    ...(input.targetBeneficiaries === undefined
      ? {}
      : { targetBeneficiaries: input.targetBeneficiaries }),
    startDate: input.startDate ? new Date(`${input.startDate}T00:00:00.000Z`) : null,
    endDate: input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null,
    status: input.status,
    programId: input.programId?.toLowerCase() || null,
  }
}
```

- [ ] **Step 3: Cut the moved code out of the service**

Create `.tmp/s1a/split-cut.json`:

```json
{
  "blocks": [
    { "first": "const projectBudgetCategory = 'PROJECT_PROFILE_TOTAL'", "last": "const projectBudgetCategory = 'PROJECT_PROFILE_TOTAL'" },
    { "first": "const projectTeamRoles = [", "last": "type ProjectTeamRole = (typeof projectTeamRoles)[number]" },
    { "first": "function projectBudgetValue(value: string) {", "last": "}" },
    { "first": "function projectData(input: CreateProjectRequest | UpdateProjectRequest, code: string) {", "last": "}" },
    { "first": "  private async readProjectBudgets(", "last": "  }" },
    { "first": "  private async saveProjectBudget(", "last": "  }" },
    { "first": "  private async replaceTeamAssignments(", "last": "  }" }
  ],
  "replacements": [
    ["this.readProjectBudgets(", "readProjectBudgets(", 4],
    ["this.saveProjectBudget(", "saveProjectBudget(", 2],
    ["this.replaceTeamAssignments(", "replaceTeamAssignments(", 2],
    ["tx: Prisma.TransactionClient,", "tx: Tx,", 3],
    ["import { Prisma } from '@prisma/client'\n", "", 1],
    ["  type CanonicalRole,\n", "", 1],
    ["  canAssignRole,\n", "", 1],
    ["  isCanonicalRole,\n", "", 1],
    [
      "import { projectScope } from '../../common/authz/project-scope'\n",
      "import { projectScope } from '../../common/authz/project-scope'\nimport type { Tx } from '../../common/prisma/transaction'\n",
      1
    ],
    [
      "import { mapProject, projectSelection } from './projects.mapper'\n",
      "import { readProjectBudgets, saveProjectBudget } from './project-budget.service'\nimport { replaceTeamAssignments } from './project-team.service'\nimport { projectData } from './projects.helpers'\nimport { mapProject, projectSelection } from './projects.mapper'\n",
      1
    ]
  ]
}
```

```bash
P=apps/api/src/modules/projects
git show HEAD:$P/projects.service.ts > .tmp/s1a/projects.service.task6.ts
git show HEAD:$P/project-budget.service.ts > .tmp/s1a/project-budget.task6.ts
node .tmp/s1a/cut-blocks.mjs $P/projects.service.ts .tmp/s1a/split-cut.json
```

Expected:

```text
cut 1 lines from const projectBudgetCategory = 'PROJECT_PROFILE_TOTAL'
cut 6 lines from const projectTeamRoles = [
cut 7 lines from function projectBudgetValue(value: string) {
cut 22 lines from function projectData(input: CreateProjectRequest | UpdateProjectRequest, code: string) {
cut 26 lines from private async readProjectBudgets(
cut 43 lines from private async saveProjectBudget(
cut 119 lines from private async replaceTeamAssignments(
apps/api/src/modules/projects/projects.service.ts: 288 lines
```

- [ ] **Step 4: Check the lines before formatting**

```bash
P=apps/api/src/modules/projects
node .tmp/s1a/same-lines.mjs .tmp/s1a/projects.service.task6.ts .tmp/s1a/project-budget.task6.ts -- $P/projects.service.ts $P/project-budget.service.ts $P/project-team.service.ts $P/projects.helpers.ts "export async function =private async " "tx: Tx,=tx: Prisma.TransactionClient," "await readProjectBudgets(=await this.readProjectBudgets(" "await saveProjectBudget(=await this.saveProjectBudget(" "await replaceTeamAssignments(=await this.replaceTeamAssignments("; echo "exit $?"
git grep -n "Prisma.TransactionClient" -- $P ':!*.test.ts'
```

Expected: exactly the line `original 2x, new 1x: const projectBudgetCategory = 'PROJECT_PROFILE_TOTAL'` and `exit 1` (the merged duplicate of ruling 7, the only permitted difference); the grep prints nothing. Any other line: stop, the split is not verbatim.

- [ ] **Step 5: Run the tests and commit**

```bash
git add -N apps/api
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts')
pnpm --filter @pathways/api exec vitest run src/modules/projects src/modules/project-map src/modules/rules/rules-source-domains.test.ts src/modules/core-foundation.test.ts src/app-module-wiring.test.ts src/common/import-boundary.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
wc -l apps/api/src/modules/projects/*.ts | grep -v test
git checkout -- apps/web/next-env.d.ts
git add -A apps/api
git commit -m "refactor(api): split project team and budget writes out of ProjectsService

The moved functions take the caller's transaction; the duplicated budget category constant has one owner.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass; api count equals Task 4 (`B_api + 68`); after formatting `projects.service.ts` is about 280 lines and no new file exceeds 300.

---

### Task 7: Adopt the authz kernel in the projects modules

**Files:**
- Test: `apps/api/src/modules/projects/projects.service.test.ts` (new describe block, `ConflictException` import)
- Create: `apps/api/src/common/authz/request-identity.ts`
- Test: `apps/api/src/common/authz/request-identity.test.ts`
- Modify: `apps/api/src/modules/projects/projects.service.ts`, `apps/api/src/modules/projects/project-overview-metrics.service.ts`
- Modify: `apps/api/src/modules/projects/projects.controller.ts`, `apps/api/src/modules/programs/programs.controller.ts`, `apps/api/src/modules/projects/project-overview-metrics.controller.ts`, `apps/api/src/modules/project-map/project-map.controller.ts`

**Interfaces:**
- Consumes: `requireScopedProjectRow` (F3a).
- Produces: `requestIdentity(request: AuthenticatedRequest): ApplicationIdentity` from `apps/api/src/common/authz/request-identity.ts`; it throws `ForbiddenException('Application profile is required.')` when `request.user` is missing.

- [ ] **Step 1: Characterize the update lookup**

In `apps/api/src/modules/projects/projects.service.test.ts` replace `import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'` with:

```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common'
```

and append at the end of the file:

```ts

describe('Project update scope', () => {
  const service = new ProjectsService({} as PrismaService)
  const input = {
    title: 'Updated scope',
    status: 'ONGOING' as const,
    clientMutationId: 'e0000000-0000-4000-8000-000000000002',
    expectedUpdatedAt: now.toISOString(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    state.actor = manager
    state.tx = tx as unknown as Prisma.TransactionClient
    tx.project.findFirst.mockResolvedValue({ id: projectId, code: project.code, updatedAt: now })
    tx.project.updateMany.mockResolvedValue({ count: 1 })
    tx.project.findUniqueOrThrow.mockResolvedValue(project)
    tx.projectBudgetRecord.findMany.mockResolvedValue([])
  })

  it('answers the uniform 404 for a malformed id before any project query', async () => {
    await expect(service.update(manager, 'not-a-uuid', input)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(tx.project.findFirst).not.toHaveBeenCalled()
  })

  it('reads the current row inside the actor scope by its lowercased id', async () => {
    const lowerId = 'ab000000-0000-4000-8000-00000000000a'
    await service.update(manager, lowerId.toUpperCase(), input)
    expect(tx.project.findFirst).toHaveBeenCalledWith({
      where: {
        AND: [expect.objectContaining({ organizationId, archivedAt: null }), { id: lowerId }],
      },
      select: { id: true, code: true, updatedAt: true },
    })
  })

  it('answers the uniform 404 for an unscoped project without writing', async () => {
    tx.project.findFirst.mockResolvedValue(null)
    await expect(service.update(manager, foreignProjectId, input)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(tx.project.updateMany).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('answers 409 when the stored version moved', async () => {
    tx.project.findFirst.mockResolvedValue({
      id: projectId,
      code: project.code,
      updatedAt: new Date('2026-09-26T00:00:00.000Z'),
    })
    await expect(service.update(manager, projectId, input)).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(tx.project.updateMany).not.toHaveBeenCalled()
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/projects/projects.service.test.ts`
Expected: PASS, 15 tests, against the unchanged inline lookup (characterization before the duplicate goes; Review Focus 4).

- [ ] **Step 2: Write the failing identity helper test**

Create `apps/api/src/common/authz/request-identity.test.ts`:

```ts
import { ForbiddenException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import type { ApplicationIdentity, AuthenticatedRequest } from './application-identity'
import { requestIdentity } from './request-identity'

describe('requestIdentity', () => {
  it('returns the identity the auth guard attached', () => {
    const user = { userId: 'u' } as ApplicationIdentity
    expect(requestIdentity({ headers: {}, user })).toBe(user)
  })

  it('answers 403 with the shared message when no identity is attached', () => {
    const request: AuthenticatedRequest = { headers: {} }
    expect(() => requestIdentity(request)).toThrow(ForbiddenException)
    expect(() => requestIdentity(request)).toThrow('Application profile is required.')
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/common/authz/request-identity.test.ts`
Expected: FAIL, cannot resolve `./request-identity`.

Create `apps/api/src/common/authz/request-identity.ts`:

```ts
import { ForbiddenException } from '@nestjs/common'

import type { ApplicationIdentity, AuthenticatedRequest } from './application-identity'

// The identity the auth guard attached, or 403 when a route is reached without one.
export function requestIdentity(request: AuthenticatedRequest): ApplicationIdentity {
  if (!request.user) throw new ForbiddenException('Application profile is required.')
  return request.user
}
```

Run it again. Expected: PASS, 2 tests.

- [ ] **Step 3: Use requireScopedProjectRow in update and the overview read**

`apps/api/src/modules/projects/projects.service.ts`:
- In `update`, replace

```ts
      const current = await tx.project.findFirst({
        where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
        select: { id: true, code: true, updatedAt: true },
      })
      if (!current) throw new NotFoundException('Project unavailable.')
```

with

```ts
      const current = await requireScopedProjectRow(tx, actor, projectId, {
        id: true,
        code: true,
        updatedAt: true,
      })
```

  Keep the earlier `if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')` line of `update` (ruling 8).
- Add below `import { projectScope } from '../../common/authz/project-scope'`:

```ts
import { requireScopedProjectRow } from '../../common/authz/scoped-project'
```

`apps/api/src/modules/projects/project-overview-metrics.service.ts`:
- In `readInTransaction`, replace

```ts
    if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
    const row = await tx.project.findFirst({
      where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
      select: { id: true, startDate: true, endDate: true, targetBeneficiaries: true },
    })
    if (!row) throw new NotFoundException('Project unavailable.')
```

with

```ts
    const row = await requireScopedProjectRow(tx, actor, projectId, {
      id: true,
      startDate: true,
      endDate: true,
      targetBeneficiaries: true,
    })
```

- Replace `import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'` with `import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common'`.
- Replace the three lines

```ts
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { projectScope } from '../../common/authz/project-scope'
```

with

```ts
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { requireScopedProjectRow } from '../../common/authz/scoped-project'
```

- [ ] **Step 4: Use requestIdentity in the four controllers**

`apps/api/src/modules/projects/projects.controller.ts` and `apps/api/src/modules/programs/programs.controller.ts`:
- Delete the local helper (four lines and the blank line after it):

```ts
function profile(request: AuthenticatedRequest) {
  if (!request.user) throw new ForbiddenException('Application profile is required.')
  return request.user
}
```

- Replace every `profile(request)` with `requestIdentity(request)` (5 in projects, 2 in programs).
- Add above `import { RequirePermission } from '../../common/decorators/permission.decorator'`:

```ts
import { requestIdentity } from '../../common/authz/request-identity'
```

- Remove `ForbiddenException` from the `@nestjs/common` import (projects: delete the line `  ForbiddenException,`; programs: the import becomes `import { Body, Controller, Get, Inject, Post, Req } from '@nestjs/common'`).

`apps/api/src/modules/projects/project-overview-metrics.controller.ts`:
- Replace the two lines `    if (!request.user) throw new ForbiddenException('Application profile is required.')` and `    return this.metrics.read(request.user, projectId)` with `    return this.metrics.read(requestIdentity(request), projectId)`.
- The `@nestjs/common` import becomes `import { Controller, Get, Inject, Param, Req } from '@nestjs/common'`; add `import { requestIdentity } from '../../common/authz/request-identity'` below the `application-identity` import.

`apps/api/src/modules/project-map/project-map.controller.ts`:
- Replace the two lines `    if (!request.user) throw new ForbiddenException('Application profile is required.')` and `    return this.service.read(request.user)` with `    return this.service.read(requestIdentity(request))`.
- The `@nestjs/common` import becomes `import { Controller, Get, Header, Inject, Req } from '@nestjs/common'`; add `import { requestIdentity } from '../../common/authz/request-identity'` below the `application-identity` import.

```bash
git grep -n "AND: \[projectScope(actor), { id: projectId.toLowerCase() }\]" -- apps/api/src/modules/projects
git grep -n "Application profile is required" -- apps/api/src/modules/projects apps/api/src/modules/programs apps/api/src/modules/project-map
git grep -lE "Application profile is required\.'" -- 'apps/api/src/**/*.controller.ts' | wc -l
```

Expected: one line, `projects.service.ts` in `get` (ruling 8); nothing; `20`.

- [ ] **Step 5: Run the tests and commit**

```bash
git add -N apps/api
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts')
pnpm --filter @pathways/api exec vitest run src/common src/modules/projects src/modules/programs src/modules/project-map
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api
git commit -m "refactor(api): use requireScopedProjectRow and requestIdentity in the projects modules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass, including the 21 overview metrics tests (its malformed-id and cross-organization cases now run through the kernel helper) and both boundary tests; api = `B_api + 74` (minus the 2 lost metadata cases).

---

### Task 8: Records and SAD routing

**Files:**
- Modify: `scripts/sad/check.ts` (beneficiary-privacy-guardian globs), `scripts/sad/check.test.ts`, `docs/sad-pathways.md:38`
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.4, 3.6, 3.7, 9)
- Modify: `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-04, MOD-11 rows)
- Modify: `docs/index.md` (CR row status)
- Modify: `docs/activity-log.md`

- [ ] **Step 1: Route api mappers to the beneficiary privacy guardian (ruling 10)**

In `scripts/sad/check.test.ts`, directly before the test `routes the rules dispatch workflow to design-qa-agent`, add:

```ts
  it('routes api mappers to the privacy guardian and split services to the isolation checker', () => {
    const mapper = 'apps/api/src/modules/projects/projects.mapper.ts'
    const service = 'apps/api/src/modules/projects/project-team.service.ts'
    const routed = routing([change(mapper, 'new', 'old'), change(service, 'new', 'old')])
    expect(routed['beneficiary-privacy-guardian']).toEqual([mapper])
    expect(routed['organization-isolation-checker']).toEqual([service])
  })
```

Run: `pnpm sad:test`
Expected: FAIL on the new test (`expected undefined to deeply equal [ ... ]`).

In `scripts/sad/check.ts`, `beneficiary-privacy-guardian` globs, add directly after `'apps/api/src/**/*.controller.ts',`:

```ts
      'apps/api/src/**/*.mapper.ts',
```

In `docs/sad-pathways.md` line 38, after `` `apps/api/src/**/*.controller.ts` `` insert `` , `apps/api/src/**/*.mapper.ts` `` (inside the same cell).

```bash
pnpm sad:test && pnpm sad:typecheck
```

Expected: PASS; sad = `B_sad + 1`.

- [ ] **Step 2: Amend the Change Record**

`docs/cr-pathways-codebase-modularization.md`:

Section 3.4, append to the paragraph:

```text
`contracts/common/field-schemas.ts` holds the field schemas a slice uses when a DTO becomes a contract (`lengthString`, `uuidString`, `isoDateString`, `strictIsoDateString`, `trimmedInput`, `hasUniqueItems`, `validatorLength`); they accept exactly what class-validator 0.14.4 on validator 13.15.26 accepted (amended 2026-10-10 for S1a).
```

Section 3.6, in the bullet starting `` - `.strict()` also rejects own `__proto__` ``, replace `the only accepted difference from the old pipe` with `an accepted difference from the old pipe`, and add after that bullet:

```markdown
- A DTO field marked `@IsOptional()` becomes `.nullish()`, because class-validator skipped every rule for `null`; a slice narrows a field to `.optional()` only where `null` already failed inside the service, and its parity test pins that body as an accepted difference (S1a: `projectBudget` and `projectOfficerIds`). `@Transform` steps become `z.preprocess` (amended 2026-10-10 for S1a).
```

Section 3.7, replace the row

```markdown
| S1 | Projects, programs, team, project-map | Project scope and mapper used by all others |
```

with

```markdown
| S1a, S1b | Projects, programs, team, project-map. S1a: class-validator parity field schemas, project and program contracts, api split; S1b: web client and feature components | Project scope and mapper used by all others |
```

Section 9, append:

```markdown
S1a applied <date> on refactor/s1a-projects-core:
- Field schemas: `packages/shared/src/contracts/common/field-schemas.ts` accepts exactly what class-validator 0.14.4 on validator 13.15.26 accepted for `Length`, `IsUUID`, `IsDateString` with and without `strict`, `ArrayUnique` and trimming transforms; `apps/api/src/common/validation/field-schemas-parity.test.ts` checks it against class-validator over 56 strings and stays until the last DTO is deleted.
- Contracts: `createProjectRequest`, `updateProjectRequest` and `createProgramRequest` (with `storedProjectStatuses` and `recordCodeInput`) replaced `CreateProjectDto`, `UpdateProjectDto` and `CreateProgramDto`; parity tests ran each DTO and contract through the configured pipes over 107 project and 20 program bodies before the DTOs were deleted; `projectResponse`, `projectSummaryResponse` and `archiveProjectResponse` type the projects routes, and `mapProject` returns `ProjectResponse`.
- Service: `projects.service.ts` (597 lines) split into `projects.mapper.ts`, `projects.helpers.ts`, `project-team.service.ts` and `project-budget.service.ts` (renamed from `project-budget.ts`); the split services take the caller's `tx`; the duplicated `PROJECT_PROFILE_TOTAL` constant has one owner; the projects module holds no direct `Prisma.TransactionClient` annotation.
- Kernel: the projects update and the project overview read use `requireScopedProjectRow`; `requestIdentity` (`common/authz/request-identity.ts`) replaces the request identity check in the projects, programs, overview metrics and project map controllers.
- SAD: beneficiary privacy routing covers `apps/api/src/**/*.mapper.ts`.
- Decisions: S1 split into S1a and S1b (ruling 1); optional DTO fields became `.nullish()`, and `null` for `projectBudget` (400 or 403 inside the service) and `projectOfficerIds` (a 500) now answers 400 at the pipe, beside the F3b prototype keys (ruling 3); the zod output key order does not affect replay because the canonical body reaches the database as jsonb (ruling 5); the overview metrics and project map schemas stay in `monitoring/` (ruling 6); split services are function modules named `.service.ts` (ruling 7); `get` and `archive` keep their own scoped lookups (ruling 8).

Deferred to S1b: `lib/api/projects` and the project methods of `pathways-client.ts`, `requestSourceMutation` in `lib/api/core`, the `features/projects` folder layout and public `index.ts`, the oversized project components, the project map fetcher and the web project types. Left to later slices: 20 controllers that still repeat the request identity check, 41 direct `Prisma.TransactionClient` annotations in api production code, and the stored project status copies in `monitoring/role-overview.ts`, `rules/rule-contract.ts`, `rules/rule-metrics.ts` and `dashboards/descriptive-analytics.ts` (S7).
```

Replace `<date>` with the merge date.

- [ ] **Step 3: Update the audit and the index**

- Audit: append to the disposition cell of MOD-04 `; projects service split by S1a.` and, for MOD-11, replace the final period of the cell with `; projects and programs DTOs replaced by S1a.`
- `docs/index.md`: the CR row status becomes `Approved; F1 to F4b and S1a applied, S1b next`.

```bash
git grep -nE "projects\.dto|programs\.dto|modules/projects/project-budget\.ts" -- docs ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/cr-*' ':!docs/superpowers/*'
```

Expected: prints nothing (no living doc names a removed path).

- [ ] **Step 4: Activity log**

Add to `docs/activity-log.md`:

```markdown
## <date> Modularization S1a projects core (refactor/s1a-projects-core)
```

with one bullet per Task 1 to Task 7 stating what was added, switched, split or adopted, with its commit hash and the shared and api test counts at the end of that task; a bullet with the parity results (107 project and 20 program bodies agree, four project and two program bodies are accepted differences); a bullet saying the S1a decisions are recorded in the change record section 9 (the plan stays until S1b is planned, because it holds the S1b outline); and a bullet listing the S1b deferrals. Task 9 Step 5 appends the gate results.

- [ ] **Step 5: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint
git add docs scripts/sad
git commit -m "docs: record modularization S1a and route api mappers to the privacy guardian

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline.

---

### Task 9: Full release gates and merge

- [ ] **Step 1: Static gates and dist layout**

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm sad:test
git checkout -- apps/web/next-env.d.ts
test -f packages/shared/dist/contracts/common/field-schemas.js && test -f packages/shared/dist/contracts/projects/project-requests.js && test -f apps/api/dist/packages/shared/src/contracts/projects/project-requests.js && test -f apps/api/dist/apps/api/src/modules/projects/projects.mapper.js && test -f apps/api/dist/apps/api/src/common/authz/request-identity.js && test ! -e apps/api/dist/apps/api/src/modules/projects/projects.dto.js && test ! -e apps/api/dist/apps/api/src/modules/programs/programs.dto.js && echo "dist layout ok"
pnpm --filter @pathways/web build > .tmp/s1a/web-build-gates.log 2>&1; echo "exit $?"
grep -E "Middleware" .tmp/s1a/web-build-gates.log
git checkout -- apps/web/next-env.d.ts
```

Expected: all pass and `dist layout ok` (nest `deleteOutDir` removes the old DTO output); web build exit 0 with Middleware at most `M0` (the barrel grows, and `"sideEffects": false` must keep the new contracts out of the Edge bundle). Versus Task 0: shared = `B_shared + 39` (field schemas 19, project requests 13, program requests 7), api = `B_api + 74` (field parity 57, projects HTTP 7, projects controller 1, programs HTTP 5, update scope 4, request identity 2, minus 2 controller-dto-runtime-metadata cases), sad = `B_sad + 1`, config, imports and web unchanged.

- [ ] **Step 2: Local DB replay**

```powershell
./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline
```

Expected: exit 0 (it runs `feature-read.local.test.ts` and `csv-rbac.local.test.ts`, which construct `ProjectsService` against the database).

- [ ] **Step 3: Local stack, compiled API boot, e2e and smoke**

Stop anything on ports 3000 and 4000 first.

```bash
pnpm db:local:start && pnpm db:local:reset && pnpm db:local:demo
pnpm dev:local
```

`pnpm db:local:demo` runs the seeds that now type their project input as `CreateProjectRequest`; `pnpm dev:local` builds the API and runs `dist`. In a second terminal:

```bash
curl -s http://127.0.0.1:4000/api/health
npx playwright test --config playwright.config.ts
npx playwright test --config playwright.auth-navigation.config.ts
```

Expected: `"status":"ok"`; a module-resolution error or `createProjectRequest` undefined in the `pnpm dev:local` output fails the gate; auth-navigation 27/27; main suite 39 pass, 9 fail, 22 not run, with the same 9 failing as the F1 to F4b gate runs (MFA Verify helper, password-login harness, workflows seed end date). Browser smoke against the compiled API, each step as a demo user whose role allows it: as Project Manager create a project with a lower-case code padded with spaces, a target count and a budget, and confirm the detail page shows the code upper-cased, the count and the budget (zod route, Review Focus 2); edit its dates and title and save (update with `clientMutationId`); open the team editor and change the officers (`replaceTeamAssignments`); open the overview tiles (`requireScopedProjectRow` in the overview read); paste the URL of a project outside the role's scope and expect the same denial as on dev; as a role holding `projects.archive` archive a project and archive it again (idempotent); open the project directory as a Program Manager and as a Project Officer; open the analytics project map (`ProjectMapController` with `requestIdentity`). `POST /programs` has no screen; its HTTP test covers it. Every step must behave as on dev.

- [ ] **Step 4: SAD review**

```bash
pnpm sad:check --base dev --head HEAD --output .tmp/sad/s1a/manifest.json
```

Dispatch every role the manifest requires (expect `design-qa-agent`, `restraint-guardian`, `organization-isolation-checker` and `beneficiary-privacy-guardian`) with the section 4.2 handoff packet from `docs/sad-pathways.md`, save their section 4.4 envelopes to `.tmp/sad/s1a/reviews.json`, then:

```bash
pnpm sad:signoff -- --base dev --head HEAD --reviews .tmp/sad/s1a/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun.

- [ ] **Step 5: Record the gate results**

Append a final bullet to the Task 8 activity-log section with the gate results (per-package counts, Middleware size, replay exit code, e2e pass counts, smoke result, SAD sign-off), then:

```bash
git add docs/activity-log.md
git commit -m "docs: record modularization S1a release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Merge into local dev**

```bash
git checkout dev
git merge --no-ff refactor/s1a-projects-core -m "Merge refactor/s1a-projects-core into dev

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Keep the plan for S1b**

The plan holds the S1b outline, so it stays on dev. In `docs/index.md` section 1.6 change the S1 plan row status to `S1a executed; holds the S1b outline`, then:

```bash
pnpm docs:check 2>&1 | tail -3
git add docs/index.md
git commit -m "docs: mark S1a executed in the plan index

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline. Do not push `origin dev` until the developer says so.

---

## S1b outline (projects web, branch `refactor/s1b-projects-web`)

To be written as its own plan from dev after S1a merges; that plan's Task 0 removes this file and its index row. Counts below were taken at `a101ad7c` (before F4b) and must be recounted in S1b Task 0, because F4b rewrites `pathways-client.ts` imports and moves `useAuthorizedRead`.

- **Task 0, baseline:** recount every number below; confirm the F4b exports listed under "Interfaces assumed"; record web Middleware.
- **Task 1, `lib/api/core/source-mutation-request.ts`:** move `requestSourceMutation<T>(path: string, method: 'POST' | 'PATCH', body: Record<string, unknown>, context: SourceMutationContext | undefined, parse: (value: unknown) => T): Promise<SourceMutationResult<T>>` (private at `pathways-client.ts` line 1882, 9 call sites; it wraps `sourceTickets.execute` over `requestFoundation` and maps `SourceMutationRecoveryError` to `PathwaysClientError`) out of the client as an export, beside F4b's `request.ts`; S1b Task 1 is the only owner of this move, S2b, S3b and S5b consume it; it imports `requestFoundation` and `PathwaysClientError` from `./request` and `sourceMutationTickets` from `lib/services/source-mutation.ts`. It cannot live in `source-mutation.ts`, because F4b makes `request.ts` import that file. S2 (activities) and S3 (indicators) consume it.
- **Task 2, `lib/api/projects.ts`:** move `getProjects`, `getProjectsForRole`, `getProject`, `createProject`, `updateProject`, `archiveProject`, `getProjectOverviewMetrics`, `mapProject`, `parseProjects` and `apiProjectStatus` out of `pathways-client.ts` (2596 lines at `4a5806d0`) as a `projectsClient` object with the same method signatures, and `readProjectMap` out of `features/analytics/use-project-map.ts`. `ApiProject` is replaced by `ProjectResponse | ProjectSummaryResponse` from `@pathways/shared`, and the archive answer by `ArchiveProjectResponse`; the web mapper output (`ProjectDetail`, `ProjectSummary`) does not change. 49 files reference the methods (25 production call sites); some of the 49 `vi.mock('@/lib/services/pathways-client', ...)` files at `4a5806d0` (26 of 56 before F4b) define a project method and must split into a second `vi.mock('@/lib/api/projects', ...)` in the same commit, counted before and after. `getProjectsForRole(role)` only calls `getProjects()`; fold it into `getProjects` only if the plan's ruling counts its 15 files and shows no caller depends on the role argument. SAD: `apps/web/src/lib/api/**/*.ts` already routes to beneficiary-privacy-guardian from F4b.
- **Task 3, `features/projects` layout:** CR 3.3 wants subfolders above about 30 files; the folder has 78 files at `4a5806d0` (92 before F4b). Move the S1 files (project directory, setup form, form validation, detail view, review workspace and utils, archive and preview dialogs, overview metrics, workspace frame and header, `project-utils.ts`, `use-project-reads.ts`, `option-select.tsx`) into `features/projects/components/`, `hooks/`, `projects.reads.ts` and `projects.utils.ts`, and the team editor and selectors into `features/projects/team/`, with `git mv` and their tests. Activities (S2), indicators and the library (S3), budget and evaluation (S6) and the rules panel (S7) stay where they are until their slices. Rename `ProjectPhaseFiveWorkspace` to `ProjectReviewWorkspace` (3 route pages and its test). Add `features/projects/index.ts` and repoint the external importers through it: 13 route pages, `analytics-dashboard.tsx`, `project-map-card.tsx`, `monitoring-reach-metrics.ts`, `pinned-charts.tsx`, `role-overview/project-metrics-reads.tsx` and `ui-copy-cleanup.contract.test.ts`; `role-dashboard.tsx` imports `activity-detail-panel` and `activity-proof-dialog`, which S2 moves. Extend `apps/web/src/import-direction.test.ts` with a rule that a file outside `features/projects` imports it only through `index.ts` (MOD-15 for projects).
- **Task 4, oversized components:** split `project-review-workspace.tsx` (716 lines), `project-setup-form.tsx` (587) and `project-team-selectors.tsx` (474) by component and hook, verbatim, with characterization tests first where the existing tests do not render the moved part.
- **Task 5, web types and reads:** `types/pathways.ts` `StoredProjectStatus` (identical union) is replaced by the shared one; `CreateProjectInput` and `UpdateProjectInput` stay view models where they differ from the request contracts (UI status names). The project list is read under different resource keys (`review-projects`, `rules-editor-projects`, the directory read); share a key only where the fetcher, permission and freshness are identical, because one key changes when a read is reused.
- **Task 6, records:** CR 3.3 and section 9 S1b disposition, audit MOD-05, MOD-06, MOD-15, MOD-16 and MOD-17 (projects parts), index, activity log.
- **Task 7, gates and merge:** as S1a Task 9, with Middleware measured and a smoke over every project screen, the team editor, the dashboards and analytics views that list projects, and the project map. After merge, remove this plan and its index row.
