# F3b API Validation and Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the API its zod request pipe and first shared request contract, move the authorized-operation kernel into `apps/api/src/common/authz`, inject the private storage factories through Nest, and make the module wiring test cover object providers, with no change to any route, status code, response body, audit row, permission decision or storage call.

**Architecture:** F3b is the second half of F3 (F3a ruling 1) and fits one branch: nine tasks including baseline and gates, no split. `ZodPipe` runs after the unchanged global `ValidationPipe`, which passes zod-typed bodies through; the first contract replaces `ValidateImportDto` only after a parity test ran both through the configured pipes. Moves are `git mv` commits carrying only import-path changes; new code is test first. Mechanical rewrites use one-off Node scripts under `.tmp/f3b/` (gitignored, never committed) whose content is given in full in the task that uses them.

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, NestJS 10.4.22, class-validator 0.14.4, class-transformer 0.5.1, zod 3.25.76, Prisma 6.19, Vitest 3, Biome 1.9.4, Next 15.5.14, Playwright.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.1, 3.2, 3.4, 3.6, 3.7 row F3b, 4 Tests, 6, 7, 9 including the F2 and F3a dispositions) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-11, MOD-13). The F3b outline at the end of `docs/superpowers/plans/2026-10-09-modularization-f3-api-core.md` is the starting point; rulings below amend it where they differ.

## Rulings

Controller rulings for F3b (2026-10-10). Each was checked against the code at `refactor/f3a-api-core` `42b52932`, the tree that becomes local dev once F3a merges.

1. **One branch, `refactor/f3b-validation-wiring`.** Seven work tasks plus baseline and gates (nine in all) stay under the split threshold. The outline's branch name `refactor/f3b-api-validation` is replaced.
2. **Pipe order and coercion.** `main.ts` registers `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, forbidUnknownValues: false })` with no `transformOptions.enableImplicitConversion`. Nest 10.4.22 `ValidationPipe.transform` returns early for a parameter whose metatype is `Object` (`toValidate`), and a type alias such as `z.infer<...>` emits `Object` as design type, so on a `@Body(new ZodPipe(schema))` parameter only the zod pipe validates (global pipes run before parameter pipes). Because there is no implicit conversion, the DTO route already rejected `{ "expectedMappingRevision": "2" }`; `z.number()` rejects it too. Verified with a probe of the configured pipe against `ValidateImportDto` under the versions above.
3. **Parity is exact except for two prototype keys.** Over 20 JSON bodies the DTO route and the zod route agree on accept or reject and on the accepted value (including 0, -0, 1.5, `"2"`, null, true, `[1]`, `{}`, an extra key, a `prototype` key, `[]`, an array of objects, 2147483648, 2^53 and 1e21). Two bodies differ: own `__proto__` and own `constructor` keys. The DTO route accepted them (Nest `stripProtoKeys` deletes `__proto__`; class-transformer drops `constructor`); zod `.strict()` rejects them with `Unrecognized key(s) in object`. Accepted as stricter input handling: no client sends these keys and nothing reaches the service. The parity test pins both as the only exceptions; CR 3.6 records them.
4. **Message wording changes on the validate route only, and no screen reaches it.** Zod messages replace class-validator text (CR 3.6 allows this). The web shows `error.message` on a failed validate, but `import-workspace.tsx:1018` disables Validate while `batch.mappingRevision < 1` and `collection-workspace.tsx:1373` sends the revision returned by `saveImportMapping`, so neither screen can send a body that fails this schema. No test or e2e spec asserts the old wording (`git grep "must not be less than 1"` is empty).
5. **Contract naming: document, do not rename.** Each of the seven generic names (`uuidSchema`, `decimalSchema`, `operators` in `rules/rule-contract.ts`; `reviewSchema`, `pageSchema`, `emptyBodySchema`, `confirmOutcomeSchema` in `rules/rules-human-contract.ts`) is exported once and no other declaration of those names exists under `apps` or `packages` except two test-local `const operators` variables. A duplicate `export *` name is TypeScript error TS2308 in `packages/shared/src/index.ts` (verified with tsc 5.9), so a collision fails `pnpm typecheck` instead of shadowing. Rule recorded in CR 3.4: new exports carry their domain through the CR 3.6 names; a rules export is renamed with a `rule` prefix only by the change that would collide with it.
6. **`"sideEffects": false` is safe to declare.** The 23 non-test files under `packages/shared/src` contain no top-level statement other than imports, exports and declarations, no bare `import '...'`, no `setErrorMap`, and their only external import is `zod` (11 files). The web resolves `@pathways/shared` to source through tsconfig paths and `transpilePackages`, and webpack reads `sideEffects` from the nearest `package.json`, so the flag reaches the Edge middleware bundle. The flag stays only if `next build` passes and the `Middleware` size does not grow (F2 recorded 112 kB).
7. **`readApplicationProfile` moves before `withAuthorizedOperation`.** `authorized-operation.ts` imports `readApplicationProfile` from `modules/auth/application-profile.service`; a `git mv` first would make `common` import `modules` and fail `common/import-boundary.test.ts` at that commit. So commit 1 moves the function (and its `ProfileRow` type) to `common/authz/application-profile.ts`; commit 2 moves `authorized-operation.ts`, `authorized-operation-timing.ts` and `authorized-operation.test.ts`. `ApplicationProfileService` stays in `modules/auth`.
8. **Mock paths move with their import.** 87 files reference `.../authorized-operation'`: 98 specifiers, 43 static imports and 55 `vi.mock(...)` calls (60 files use `'../auth/authorized-operation'`, 24 use `'@app/modules/auth/authorized-operation'`, 2 use `'./authorized-operation'`, 1 uses `'./auth/authorized-operation'`); 31 of the 87 are production files. Six test files mock `application-profile.service` only to stub `readApplicationProfile`; they move to the new path too. A mock left on an old path silently stops applying, so Task 4 counts mocks before and after.
9. **Storage factories are one injected value provider.** `modules/storage/private-storage-factories.ts` exports `PRIVATE_STORAGE_FACTORIES = Symbol('PRIVATE_STORAGE_FACTORIES')` (same pattern as `RULES_MACHINE_SQL`), `privateStorageFactories` (the three production factories) and its type; the global `StorageModule` provides and exports it. The five services (`ActivitiesService`, `PrivateProofInspectionService`, `BeneficiaryMediaService`, `FinanceService`, `ReportsService`) take it as a required last constructor parameter; the 8 factory calls change only their callee and stay inside their `try` blocks, so a factory configuration fault still answers 503. The 29 `new <Service>(` sites in 21 files (7 sites in 3 seeds) gain the argument. Three tests mock only part of `private-inspection-reader` (finance, reports, beneficiary media); `privateStorageFactories` reads all three exports at load, so those tests switch to an injected fake. The three tests that mock with `importOriginal` keep working unchanged and are left to S2.
10. **Wiring test keys providers by token.** Classes key by themselves and `{ provide, useClass | useValue | useFactory | useExisting }` by `provide`. Nest enhancer tokens (`APP_GUARD`, `APP_INTERCEPTOR`, `APP_PIPE`, `APP_FILTER`) are exempt because each module may legitimately add one. `ConfigModule.forRoot` returns a Promise in @nestjs/config 3 and is skipped by the walker, as today. A probe of the built `AppModule` found 5 object-form tokens (`APP_GUARD`, `APP_INTERCEPTOR`, `pino-params`, `RULES_MACHINE_SQL`, `RulesMachineBoundary`) and no duplicate.
11. **SAD routing:** `packages/shared/src/contracts/**/*.ts` and `apps/api/src/common/validation/**/*.ts` route to beneficiary-privacy-guardian (Compatibility, Security), beside `packages/shared/src/validation/**/*.ts` and controllers. `common/authz/**` already routes to organization-isolation-checker, so the moved kernel gains that reviewer.

## Global Constraints

- Behavior-preserving: no route, status code, response body, audit row, permission decision, transaction boundary or storage request changes. The only accepted differences are validate-route 400 message wording and the two prototype keys of ruling 3.
- `apps/api/src/common/**` never imports `apps/api/src/modules/**` (non-test files); `common/import-boundary.test.ts` must pass at every commit.
- Production api code uses relative imports only; `@app/` is a Vitest alias used by tests.
- File moves use `git mv` and are committed separately from logic edits. A move commit carries only import-path changes plus the edits its task lists for that commit.
- Every name exported through `packages/shared/src/index.ts` is unique (TS2308 otherwise).
- Kebab-case file names that describe purpose; comments are one sentence, no emojis; docs prose has no em dashes and no `--`.
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. New untracked files need `git add -N` before `git diff --name-only` lists them.
- `pnpm typecheck` rewrites `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` before every commit.
- After removing code, delete any import name left with no use (Biome 1.9 recommended rules do not flag unused imports).
- `git ls-files` with `':!*.test.ts'` pathspecs returns nothing in this Git for Windows setup; filter with `grep -v` as written. `git grep` pathspecs work.
- `apps/api/src/modules/activities/private-proof-inspection.service.test.ts` is reported as binary by `grep`; use `git grep` or `grep -a` on it (`sed` edits it normally).
- One-off scripts live in `.tmp/f3b/` (gitignored) and are never committed; `.tmp/` also holds gate logs.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work in `C:\PATHWAYS` on branch `refactor/f3b-validation-wiring`; no new worktree. All paths are relative to `C:\PATHWAYS`. Do not push.
- Do not touch migrations, `.env` files or review evidence; under `apps/api/prisma` only the three seed constructor edits of Task 6 are allowed.

## Review Focus

1. A revision sent as a numeric string (`"2"`) must still answer 400, because the global pipe never coerced it. Task 2 pins it in the parity table and in `imports.controller.validation.test.ts`.
2. An unknown key, including own `__proto__` or `constructor`, must answer 400 and never reach `ImportsService.validate`. Task 2 pins the extra key over HTTP and the two prototype keys in the parity test.
3. A storage factory that throws on bad configuration must still answer 503 `Private receipt storage unavailable.`, never 500, and must not read bytes or write audit. Task 6 Step 6 pins it in `finance.service.test.ts` with the injected factory.
4. A test mock left on the old `authorized-operation` or `application-profile.service` path silently stops applying and the real kernel runs. Task 4 counts 55 and 6 mocks before and after and requires zero old-path references.
5. An object provider token registered in two modules (for example `PRIVATE_STORAGE_FACTORIES` provided again by a feature module) must fail the wiring test, while repeated Nest `APP_*` tokens must not. Task 5 Step 1 pins both on a fixture module tree.

## Out of F3b (recorded for later sub-projects)

- Every other class-validator DTO route: its slice (S1 to S8), each with its own parity test.
- The three `vi.mock('...private-inspection-reader', importOriginal)` tests in `apps/api/src/modules/activities` (`activity-proof-media.test.ts`, `activity-proof-review-flow.test.ts`, `private-proof-inspection.service.test.ts`): switch to injected fakes in S2.
- Web `pathways-client.ts` `validateImport` typing from `ValidateImportRequest`: S5.
- The seven generic rules export names: renamed only on collision (ruling 5).

---

### Task 0: Branch setup and baseline

**Files:**
- Delete: `docs/superpowers/plans/2026-10-09-modularization-f3-api-core.md` (F3a plan; its Task 7 Step 6 defers removal to this commit)
- Create: `docs/superpowers/plans/2026-10-10-modularization-f3b-validation-wiring.md` (this plan)
- Modify: `docs/index.md` (section 1.6 plan row)

- [ ] **Step 1: Confirm local dev contains F3a and create the branch**

```bash
cd /c/PATHWAYS
git status --short
git checkout dev
git log --oneline dev | grep -m1 "Merge refactor/f3a-api-core into dev"
test -f apps/api/src/common/authz/scoped-project.ts && test -f apps/api/src/common/import-boundary.test.ts && echo "F3a tree present"
git checkout -b refactor/f3b-validation-wiring
pnpm install --frozen-lockfile
mkdir -p .tmp/f3b
```

Expected: clean status, the F3a merge commit and `F3a tree present` printed, install succeeds. If either is missing, stop and report: F3b builds on the F3a tree.

- [ ] **Step 2: Record the baseline**

```bash
pnpm --filter @pathways/shared build
pnpm typecheck && pnpm test 2>&1 | grep -E "Tests +[0-9]+"
pnpm sad:test 2>&1 | grep -E "Tests +[0-9]+"
pnpm docs:check 2>&1 | tail -3
git grep -l "/authorized-operation'" -- apps | wc -l
git grep -n "vi.mock('[^']*/authorized-operation'" -- apps | wc -l
git grep -n "vi.mock('[^']*application-profile.service'" -- apps | wc -l
git grep -n "createPrivate\(InspectionReader\|UploadVerifier\|ObjectStreamer\)(" -- apps/api/src ':!*.test.ts' ':!apps/api/src/modules/storage' | wc -l
git grep -n "new \(ActivitiesService\|FinanceService\|ReportsService\|PrivateProofInspectionService\|BeneficiaryMediaService\)(" -- apps | wc -l
git checkout -- apps/web/next-env.d.ts
```

Expected: typecheck clean; write down each package's passing and skipped test counts (shared, imports, config, api, web), the sad test count and the docs check failure count; the five greps print `87`, `55`, `6`, `8` and `29`. Later tasks compare against these numbers (`B_api`, `B_shared`, `B_sad` below). If a grep differs, stop and report: the move and injection lists below were counted at `42b52932`.

- [ ] **Step 3: Swap the plan files and commit**

The controller has saved this plan as `docs/superpowers/plans/2026-10-10-modularization-f3b-validation-wiring.md`.

In `docs/index.md` section 1.6, replace the row starting `| [F3 api core plan](superpowers/plans/2026-10-09-modularization-f3-api-core.md)` with:

```markdown
| [F3b api validation and wiring plan](superpowers/plans/2026-10-10-modularization-f3b-validation-wiring.md) | 2026-10-10-modularization-f3b-validation-wiring.md | 2026-10-10 | F3b of the codebase modularization: zod pipe and first contract, authorized operation kernel, storage factory injection, object provider wiring test | In progress |
```

```bash
git rm docs/superpowers/plans/2026-10-09-modularization-f3-api-core.md
git add docs/superpowers/plans/2026-10-10-modularization-f3b-validation-wiring.md docs/index.md
pnpm docs:check 2>&1 | tail -3
git commit -m "docs: add the F3b plan and remove the executed F3 plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Step 2 baseline.

---

### Task 1: ZodPipe in common/validation

**Files:**
- Create: `apps/api/src/common/validation/zod-pipe.ts`
- Test: `apps/api/src/common/validation/zod-pipe.test.ts`

**Interfaces:**
- Produces: `class ZodPipe<S extends z.ZodTypeAny> implements PipeTransform<unknown, z.output<S>>` from `apps/api/src/common/validation/zod-pipe.ts`; `new ZodPipe(schema).transform(value: unknown): z.output<S>` returns `schema.safeParse(value).data` or throws `BadRequestException` whose response is `{ statusCode: 400, message: string[], error: 'Bad Request' }`, one message per zod issue, `<path joined by '.'> <zod message>`, or the zod message alone when the path is empty.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/common/validation/zod-pipe.test.ts`:

```ts
import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { ZodPipe } from './zod-pipe'

// The 400 response a pipe threw, or a failure when it did not throw a BadRequestException.
function badRequest(run: () => unknown) {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException)
    return (error as BadRequestException).getResponse()
  }
  throw new Error('Expected a BadRequestException.')
}

describe('ZodPipe', () => {
  it('returns the schema output', () => {
    const pipe = new ZodPipe(z.object({ take: z.coerce.number().int() }).strict())
    expect(pipe.transform({ take: '5' })).toEqual({ take: 5 })
  })

  it('answers the class-validator 400 shape with path-prefixed messages', () => {
    const pipe = new ZodPipe(
      z.object({ a: z.object({ b: z.number() }).strict(), c: z.string() }).strict(),
    )
    expect(badRequest(() => pipe.transform({ a: { b: 'x' } }))).toEqual({
      statusCode: 400,
      message: ['a.b Expected number, received string', 'c Required'],
      error: 'Bad Request',
    })
  })

  it.each([
    [{ a: 1, extra: true }, "Unrecognized key(s) in object: 'extra'"],
    [[], 'Expected object, received array'],
  ])('answers the bare message for the root issue of %j', (body, message) => {
    const pipe = new ZodPipe(z.object({ a: z.number() }).strict())
    expect(badRequest(() => pipe.transform(body))).toEqual({
      statusCode: 400,
      message: [message],
      error: 'Bad Request',
    })
  })

  it('is not preempted by the global ValidationPipe on a zod-typed body', async () => {
    // Same options as main.ts; a zod-inferred parameter type emits Object as its design type.
    const globalPipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: false,
    })
    const body = { anything: true }
    await expect(globalPipe.transform(body, { type: 'body', metatype: Object })).resolves.toBe(body)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @pathways/api exec vitest run src/common/validation/zod-pipe.test.ts`
Expected: FAIL, cannot resolve `./zod-pipe`.

- [ ] **Step 3: Write the pipe**

Create `apps/api/src/common/validation/zod-pipe.ts`:

```ts
import { BadRequestException, type PipeTransform } from '@nestjs/common'
import type { z } from 'zod'

// Parses one request part with a zod schema and answers the class-validator 400 shape on failure.
export class ZodPipe<S extends z.ZodTypeAny> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const parsed = this.schema.safeParse(value)
    if (parsed.success) return parsed.data
    throw new BadRequestException(
      parsed.error.issues.map((issue) =>
        issue.path.length > 0 ? `${issue.path.join('.')} ${issue.message}` : issue.message,
      ),
    )
  }
}
```

- [ ] **Step 4: Run the tests**

```bash
pnpm --filter @pathways/api exec vitest run src/common/validation/zod-pipe.test.ts src/common/import-boundary.test.ts
pnpm exec biome check --write apps/api/src/common/validation/zod-pipe.ts apps/api/src/common/validation/zod-pipe.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
```

Expected: 5 zod pipe tests and both boundary tests pass; typecheck and lint pass; api passing = `B_api + 5`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/validation/zod-pipe.ts apps/api/src/common/validation/zod-pipe.test.ts
git commit -m "feat(api): add ZodPipe with the class-validator 400 shape

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: First contract, parity test and the validate route switch

**Files:**
- Create: `packages/shared/src/contracts/imports/import-requests.ts`
- Test: `packages/shared/src/contracts/imports/import-requests.test.ts`
- Modify: `packages/shared/src/index.ts` (barrel line)
- Create then delete: `apps/api/src/modules/imports/validate-import-parity.test.ts`
- Test: `apps/api/src/modules/imports/imports.controller.validation.test.ts`
- Modify: `apps/api/src/modules/imports/imports.controller.ts:20-28,122-131`, `apps/api/src/modules/imports/imports.service.ts:32,46-53,830-835`, `apps/api/src/modules/imports/imports.dto.ts:98-102`, `apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts:50`

**Interfaces:**
- Consumes: `ZodPipe` from Task 1.
- Produces: `validateImportRequest` (zod schema `{ expectedMappingRevision: int >= 1 }`, strict) and `type ValidateImportRequest = { expectedMappingRevision: number }`, both exported from `@pathways/shared`. `ImportsService.validate(identity, projectId, batchId, input: ValidateImportRequest)`.

- [ ] **Step 1: Write the failing contract test**

Create `packages/shared/src/contracts/imports/import-requests.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { type ValidateImportRequest, validateImportRequest } from './import-requests'

describe('validateImportRequest', () => {
  it('accepts a positive integer mapping revision', () => {
    const body: ValidateImportRequest = validateImportRequest.parse({ expectedMappingRevision: 3 })
    expect(body).toEqual({ expectedMappingRevision: 3 })
  })

  it.each([
    { expectedMappingRevision: 0 },
    { expectedMappingRevision: 1.5 },
    { expectedMappingRevision: '2' },
    {},
    { expectedMappingRevision: 1, extra: true },
  ])('rejects %j', (body) => {
    expect(validateImportRequest.safeParse(body).success).toBe(false)
  })
})
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/imports/import-requests.test.ts`
Expected: FAIL, cannot resolve `./import-requests`.

- [ ] **Step 2: Create the contract and export it**

Create `packages/shared/src/contracts/imports/import-requests.ts`:

```ts
import { z } from 'zod'

// Body of POST imports/projects/:projectId/batches/:batchId/validate.
export const validateImportRequest = z
  .object({ expectedMappingRevision: z.number().int().min(1) })
  .strict()
export type ValidateImportRequest = z.infer<typeof validateImportRequest>
```

Append to `packages/shared/src/index.ts`, after the `rules/` block and a blank line:

```ts
export * from './contracts/imports/import-requests'
```

```bash
pnpm --filter @pathways/shared exec vitest run src/contracts/imports/import-requests.test.ts
pnpm --filter @pathways/shared build
```

Expected: 6 tests pass; the build succeeds and `packages/shared/dist/contracts/imports/import-requests.js` exists.

- [ ] **Step 3: Write the parity test**

Create `apps/api/src/modules/imports/validate-import-parity.test.ts`:

```ts
import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { validateImportRequest } from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { ValidateImportDto } from './imports.dto'

// Same options as main.ts.
const globalPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: false,
})
const zodPipe = new ZodPipe(validateImportRequest)

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
      metatype: ValidateImportDto,
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

describe('ValidateImportDto and validateImportRequest parity', () => {
  it.each([
    '{"expectedMappingRevision":1}',
    '{"expectedMappingRevision":2}',
    '{"expectedMappingRevision":1.0}',
    '{"expectedMappingRevision":2147483648}',
    '{"expectedMappingRevision":9007199254740993}',
    '{"expectedMappingRevision":1e21}',
  ])('both accept %s with the same value', async (json) => {
    const [dto, zod] = await Promise.all([viaDto(json), viaZod(json)])
    expect(dto.accepted).toBe(true)
    expect(zod).toEqual(dto)
  })

  it.each([
    '{"expectedMappingRevision":0}',
    '{"expectedMappingRevision":-1}',
    '{"expectedMappingRevision":-0}',
    '{"expectedMappingRevision":1.5}',
    '{"expectedMappingRevision":"2"}',
    '{"expectedMappingRevision":"1"}',
    '{"expectedMappingRevision":null}',
    '{"expectedMappingRevision":true}',
    '{"expectedMappingRevision":[1]}',
    '{}',
    '{"expectedMappingRevision":1,"extra":true}',
    '{"expectedMappingRevision":1,"prototype":1}',
    '[]',
    '[{"expectedMappingRevision":1}]',
  ])('both answer the 400 shape for %s', async (json) => {
    expect(await viaDto(json)).toEqual(badRequestShape)
    expect(await viaZod(json)).toEqual(badRequestShape)
  })

  // Ruling 3: the DTO route silently dropped these keys; strict zod rejects them.
  it.each([
    '{"expectedMappingRevision":1,"__proto__":{"a":1}}',
    '{"expectedMappingRevision":1,"constructor":{"a":1}}',
  ])('only the zod contract rejects the prototype key in %s', async (json) => {
    expect((await viaDto(json)).accepted).toBe(true)
    expect(await viaZod(json)).toEqual({
      accepted: false,
      value: {
        statusCode: 400,
        error: 'Bad Request',
        message: [expect.stringContaining('Unrecognized key(s) in object')],
      },
    })
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/imports/validate-import-parity.test.ts`
Expected: PASS, 22 tests (6 accepted, 14 rejected, 2 exceptions). Any failure means the contract differs from the DTO: stop and report the row, do not edit the table to match.

- [ ] **Step 4: Write the HTTP characterization test**

Create `apps/api/src/modules/imports/imports.controller.validation.test.ts`:

```ts
import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ImportsController } from './imports.controller'
import { ImportsService } from './imports.service'

const projectId = '10000000-0000-4000-8000-000000000001'
const batchId = '20000000-0000-4000-8000-000000000002'
const actor = { id: '30000000-0000-4000-8000-000000000003', aal: 'aal2' }
const imports = { validate: vi.fn() }
let app: INestApplication
let url: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [ImportsController],
    providers: [{ provide: ImportsService, useValue: imports }],
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
  url = `http://127.0.0.1:${port}/imports/projects/${projectId}/batches/${batchId}/validate`
})

beforeEach(() => imports.validate.mockReset().mockResolvedValue({ id: batchId }))
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

describe('POST imports validate body validation', () => {
  it('forwards a valid mapping revision to the service', async () => {
    const result = await post('{"expectedMappingRevision":2}')
    expect(result.status).toBe(201)
    expect(imports.validate).toHaveBeenCalledWith(actor, projectId, batchId, {
      expectedMappingRevision: 2,
    })
  })

  it.each([
    ['a numeric string', '{"expectedMappingRevision":"2"}'],
    ['a zero revision', '{"expectedMappingRevision":0}'],
    ['an empty body', '{}'],
  ])('answers 400 for %s without calling the service', async (_label, body) => {
    expect(await post(body)).toEqual({
      status: 400,
      body: {
        statusCode: 400,
        error: 'Bad Request',
        message: expect.arrayContaining([expect.any(String)]),
      },
    })
    expect(imports.validate).not.toHaveBeenCalled()
  })

  it('answers 400 naming an unknown key without calling the service', async () => {
    const result = await post('{"expectedMappingRevision":1,"extra":true}')
    expect(result.status).toBe(400)
    expect(result.body.message.join(' ')).toContain('extra')
    expect(imports.validate).not.toHaveBeenCalled()
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/imports/imports.controller.validation.test.ts`
Expected: PASS, 5 tests, against the unchanged DTO route.

- [ ] **Step 5: Commit the contract and the evidence**

```bash
pnpm exec biome check --write packages/shared/src/contracts packages/shared/src/index.ts apps/api/src/modules/imports/validate-import-parity.test.ts apps/api/src/modules/imports/imports.controller.validation.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/shared test 2>&1 | grep -E "Tests +[0-9]+"
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add packages/shared/src/contracts packages/shared/src/index.ts apps/api/src/modules/imports/validate-import-parity.test.ts apps/api/src/modules/imports/imports.controller.validation.test.ts
git commit -m "feat(shared): add the validate import request contract with its DTO parity test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: shared = `B_shared + 6`; api = Task 1 count + 27 (22 parity, 5 HTTP).

- [ ] **Step 6: Switch the route and delete the DTO**

`apps/api/src/modules/imports/imports.controller.ts`:
- In the DTO import block (under the `biome-ignore` comment) delete the line `  ValidateImportDto,`; keep the comment, the other DTOs still need runtime constructors.
- Add below the `RequirePermission` import:

```ts
import { ZodPipe } from '../../common/validation/zod-pipe'
```

- Add below `import { IMPORT_ENGINEERING_LIMITS } from '@pathways/imports'`:

```ts
import { type ValidateImportRequest, validateImportRequest } from '@pathways/shared'
```

- In `validate(...)` replace `    @Body() body: ValidateImportDto,` with:

```ts
    @Body(new ZodPipe(validateImportRequest)) body: ValidateImportRequest,
```

`apps/api/src/modules/imports/imports.service.ts`:
- Replace `import type { FormFieldValidationContract } from '@pathways/shared'` with `import type { FormFieldValidationContract, ValidateImportRequest } from '@pathways/shared'`.
- In the `import type { ... } from './imports.dto'` block delete the line `  ValidateImportDto,`.
- In `validate(` replace `    input: ValidateImportDto,` with `    input: ValidateImportRequest,`.

`apps/api/src/modules/imports/imports.dto.ts`: delete the whole `export class ValidateImportDto { ... }` block (5 lines) and the blank line after it. `IsInt` and `Min` stay imported (other DTOs use them).

`apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts`: in the imports controller case delete the line `      'ValidateImportDto',`.

```bash
git rm apps/api/src/modules/imports/validate-import-parity.test.ts
git grep -n "ValidateImportDto" -- apps packages
```

Expected: the grep prints nothing.

- [ ] **Step 7: Run the tests and commit**

```bash
pnpm --filter @pathways/api exec vitest run src/modules/imports/imports.controller.validation.test.ts src/common/validation src/modules/imports
pnpm exec biome check --write apps/api/src/modules/imports/imports.controller.ts apps/api/src/modules/imports/imports.service.ts apps/api/src/modules/imports/imports.dto.ts apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api/src/modules/imports apps/api/src/common/validation
git commit -m "refactor(api): validate the import validate body with the shared zod contract

ValidateImportDto and its parity test are removed; the route keeps the 400 shape.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the 5 HTTP tests still pass after the switch (now through `ZodPipe`); typecheck and lint pass; api = Task 1 count + 5 (`B_api + 10`).

---

### Task 3: Declare the shared package free of import side effects

**Files:**
- Modify: `packages/shared/package.json`

- [ ] **Step 1: Confirm no shared module has a top-level side effect**

```bash
git ls-files packages/shared/src | grep -v '\.test\.ts$' | wc -l
git ls-files packages/shared/src | grep -v '\.test\.ts$' | xargs grep -nE "^[A-Za-z_\$][A-Za-z0-9_\$.]*\s*\(|^(void|if|for|while|try|await) |^import ['\"]|setErrorMap"
git ls-files packages/shared/src | grep -v '\.test\.ts$' | xargs grep -hoE "from '[^.][^']*'" | sort | uniq -c
git grep -nE "import ['\"]@pathways/shared" -- apps packages scripts
```

Expected: `24` files (23 plus Task 2's contract); the second command prints nothing (xargs exits 123 because grep matched nothing); the third prints only `12 from 'zod'`; the last prints nothing. Any other output: stop and report it, the flag would drop that module's effect.

- [ ] **Step 2: Record the web middleware size before**

```bash
pnpm --filter @pathways/web build 2>&1 | tee .tmp/f3b/web-build-before.log | grep -E "Middleware|Failed to compile"
```

Expected: the build succeeds and prints one line `ƒ Middleware  <size> kB`; write the size down (F2 recorded 112 kB).

- [ ] **Step 3: Add the flag**

In `packages/shared/package.json` add directly after `"files": ["dist"],`:

```json
  "sideEffects": false,
```

- [ ] **Step 4: Rebuild and compare**

```bash
pnpm exec biome check --write packages/shared/package.json
pnpm --filter @pathways/shared build
pnpm --filter @pathways/web build 2>&1 | tee .tmp/f3b/web-build-after.log | grep -E "Middleware|Failed to compile"
pnpm typecheck && pnpm lint
pnpm --filter @pathways/web test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
```

Expected: build passes; Middleware size is equal to or smaller than Step 2; web count unchanged. If the build fails or the size grows, run `git checkout -- packages/shared/package.json`, skip Step 5 and record in the Task 7 activity log that the flag was not kept, with both sizes.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/package.json
git commit -m "build(shared): declare the shared package free of import side effects

Web Middleware <before> kB before, <after> kB after (next build).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Replace `<before>` and `<after>` with the two measured sizes.

---

### Task 4: Move the authorized operation kernel into common/authz

**Files:**
- Create: `apps/api/src/common/authz/application-profile.ts`
- Modify: `apps/api/src/modules/auth/application-profile.service.ts` (remove `ProfileRow` and `readApplicationProfile`)
- Modify (`readApplicationProfile` import or mock path, 9 files): `apps/api/src/modules/activities/activities.service.ts`, `apps/api/src/modules/activities/private-proof-inspection.service.ts`, `apps/api/src/modules/auth/authorized-operation.ts`, `apps/api/src/modules/auth/authorized-operation.test.ts`, `apps/api/src/modules/activities/activities.access.test.ts`, `apps/api/src/modules/activities/activity-proof-review-flow.test.ts`, `apps/api/src/modules/activities/activity-review-completion.test.ts`, `apps/api/src/modules/activities/private-proof-inspection.service.test.ts`, `apps/api/src/modules/beneficiaries/default-registration-form.test.ts`
- Move: `apps/api/src/modules/auth/authorized-operation.ts` -> `apps/api/src/common/authz/authorized-operation.ts`
- Move: `apps/api/src/modules/auth/authorized-operation-timing.ts` -> `apps/api/src/common/authz/authorized-operation-timing.ts`
- Move: `apps/api/src/modules/auth/authorized-operation.test.ts` -> `apps/api/src/common/authz/authorized-operation.test.ts`
- Modify (import path only), 86 files: 60 with `'../auth/authorized-operation'`, 24 with `'@app/modules/auth/authorized-operation'`, `apps/api/src/modules/auth/authorized-data.service.ts` (`'./authorized-operation'`), `apps/api/src/modules/core-foundation.test.ts` (`'./auth/authorized-operation'`); plus `apps/api/src/modules/auth/guards/supabase-auth.guard.ts` and `supabase-auth.guard.test.ts` (`'../authorized-operation-timing'`)

**Interfaces:**
- Produces (definitions unchanged): `readApplicationProfile(transaction: Prisma.TransactionClient, authSubject: string, organizationId: string, userId: string): Promise<ApplicationIdentity>` from `apps/api/src/common/authz/application-profile.ts`; `withAuthorizedOperation` from `apps/api/src/common/authz/authorized-operation.ts`; `boundedOperationDuration`, `registerAuthorizedOperationTiming`, `reportAuthorizedOperationTiming`, `AuthorizedOperationTiming` from `apps/api/src/common/authz/authorized-operation-timing.ts`.

- [ ] **Step 1: Confirm the counts**

```bash
git grep -l "'\.\./auth/authorized-operation'" -- apps | wc -l
git grep -l "'@app/modules/auth/authorized-operation'" -- apps | wc -l
git grep -l "'\./authorized-operation'\|'\./auth/authorized-operation'" -- apps
git grep -h -o "vi.mock('[^']*/authorized-operation'" -- apps | sort | uniq -c
git grep -n "vi.mock('[^']*application-profile.service'" -- apps
git grep -n "readApplicationProfile } from" -- apps
```

Expected: `60`; `24`; the three files `apps/api/src/modules/auth/authorized-data.service.ts`, `apps/api/src/modules/auth/authorized-operation.test.ts`, `apps/api/src/modules/core-foundation.test.ts`; mock counts `30 ../auth/`, `1 ./auth/`, `24 @app/modules/auth/`; six mock lines (the six test files listed under Files); three import lines (`activities.service.ts`, `private-proof-inspection.service.ts`, `authorized-operation.ts`).

- [ ] **Step 2: Move readApplicationProfile to common/authz**

Create `apps/api/src/common/authz/application-profile.ts`. Its body is the `ProfileRow` type and the `readApplicationProfile` function with its doc comment, cut verbatim from `apps/api/src/modules/auth/application-profile.service.ts` (from `type ProfileRow = {` through the function's closing `}` before `@Injectable()`), under these imports:

```ts
import { ForbiddenException } from '@nestjs/common'
import type { Prisma } from '@prisma/client'

import { hasAtomicPermission, isCanonicalRole } from '@pathways/shared'
import { type ApplicationIdentity, UUID_PATTERN } from './application-identity'
```

Before saving, diff the cut text against the original; it must be identical. In `application-profile.service.ts` delete that block, delete the line `import { hasAtomicPermission, isCanonicalRole } from '@pathways/shared'` (no other use), and add below the `application-identity` import:

```ts
import { readApplicationProfile } from '../../common/authz/application-profile'
```

Repoint the nine users:

```bash
sed -i "s#'\.\./auth/application-profile.service'#'../../common/authz/application-profile'#" \
  apps/api/src/modules/activities/activities.service.ts \
  apps/api/src/modules/activities/private-proof-inspection.service.ts \
  apps/api/src/modules/activities/activity-review-completion.test.ts \
  apps/api/src/modules/activities/private-proof-inspection.service.test.ts \
  apps/api/src/modules/beneficiaries/default-registration-form.test.ts
sed -i "s#'@app/modules/auth/application-profile.service'#'@app/common/authz/application-profile'#" \
  apps/api/src/modules/activities/activities.access.test.ts \
  apps/api/src/modules/activities/activity-proof-review-flow.test.ts
sed -i "s#'\./application-profile.service'#'../../common/authz/application-profile'#" \
  apps/api/src/modules/auth/authorized-operation.ts \
  apps/api/src/modules/auth/authorized-operation.test.ts
git grep -n "readApplicationProfile" -- apps | grep "application-profile.service'"
git grep -n "vi.mock('[^']*application-profile'" -- apps | wc -l
git grep -n "application-profile.service'" -- apps | wc -l
```

Expected: the first grep prints nothing; `6` mocks on the new path; `7` remaining `application-profile.service'` specifiers, all importing `ApplicationProfileService` (`auth.module.ts`, `workspace-resolution.service.ts`, `workspace-resolution.service.test.ts`, `application-profile.service.test.ts`, `application-profile.local.test.ts`, `guards/supabase-auth.guard.test.ts`, `apps/api/prisma/authorization-bootstrap.local.test.ts`).

- [ ] **Step 3: Verify and commit the function move**

```bash
git add -N apps/api
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts')
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api exec vitest run src/common src/modules/auth src/modules/activities src/modules/beneficiaries/default-registration-form.test.ts
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api
git commit -m "refactor(api): move readApplicationProfile to common/authz

ApplicationProfileService stays in modules/auth; six test mocks follow the function.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass, including `common/import-boundary.test.ts`; api count equals Task 2.

- [ ] **Step 4: Move the kernel and repoint every importer and mock**

```bash
git mv apps/api/src/modules/auth/authorized-operation.ts apps/api/src/common/authz/authorized-operation.ts
git mv apps/api/src/modules/auth/authorized-operation-timing.ts apps/api/src/common/authz/authorized-operation-timing.ts
git mv apps/api/src/modules/auth/authorized-operation.test.ts apps/api/src/common/authz/authorized-operation.test.ts
sed -i -e "s#'\.\./\.\./common/authz/#'./#g" -e "s#'\.\./\.\./common/network/#'../network/#g" \
  apps/api/src/common/authz/authorized-operation.ts \
  apps/api/src/common/authz/authorized-operation-timing.ts \
  apps/api/src/common/authz/authorized-operation.test.ts
git grep -l "'\.\./auth/authorized-operation'" -- apps | xargs sed -i "s#'\.\./auth/authorized-operation'#'../../common/authz/authorized-operation'#"
git grep -l "'@app/modules/auth/authorized-operation'" -- apps | xargs sed -i "s#'@app/modules/auth/authorized-operation'#'@app/common/authz/authorized-operation'#"
sed -i "s#'\./authorized-operation'#'../../common/authz/authorized-operation'#" apps/api/src/modules/auth/authorized-data.service.ts
sed -i "s#'\./auth/authorized-operation'#'../common/authz/authorized-operation'#" apps/api/src/modules/core-foundation.test.ts
sed -i "s#'\.\./authorized-operation-timing'#'../../../common/authz/authorized-operation-timing'#" \
  apps/api/src/modules/auth/guards/supabase-auth.guard.ts apps/api/src/modules/auth/guards/supabase-auth.guard.test.ts
grep -n "from '\.\|mock('\." apps/api/src/common/authz/authorized-operation.ts apps/api/src/common/authz/authorized-operation-timing.ts apps/api/src/common/authz/authorized-operation.test.ts
```

Expected: the last command lists only `./application-identity`, `./application-profile`, `./authorized-operation`, `./authorized-operation-timing`, `../network/inspection-request-budget`, `../../prisma/prisma.service` and `../../prisma/transaction-diagnostic`.

- [ ] **Step 5: Count the paths after the move**

```bash
git grep -n "auth/authorized-operation\|modules/auth/authorized-operation\|'\.\./authorized-operation-timing'" -- apps
git grep -l "/authorized-operation'" -- apps | wc -l
git grep -h -o "vi.mock('[^']*/authorized-operation'" -- apps | sort | uniq -c
git grep -h -o "from '[^']*/authorized-operation'" -- apps | sort | uniq -c
```

Expected: the first command prints nothing; `87`; mocks `30 ../../common/authz/`, `1 ../common/authz/`, `24 @app/common/authz/` (55); imports `33 ../../common/authz/`, `1 ./authorized-operation`, `9 @app/common/authz/` (43).

- [ ] **Step 6: Verify and commit the move**

```bash
git add -N apps/api
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts')
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api exec vitest run src/common src/modules/auth
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api
git status --short apps/api/src | grep "^R"
git commit -m "refactor(api): move withAuthorizedOperation and its timing to common/authz

The kernel, its timing module and its test change import paths only; 86 importers and 55 mocks follow.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass, including both boundary tests; api count equals Task 2; `git status` shows the three `R` renames.

---

### Task 5: Wiring test for object providers

**Files:**
- Modify: `apps/api/src/app-module-wiring.test.ts`

**Interfaces:**
- Produces: a test that fails when one provider token (class or `provide` of an object provider) is registered by two modules, Nest `APP_*` enhancer tokens exempt.

- [ ] **Step 1: Write the failing tests**

Replace the whole of `apps/api/src/app-module-wiring.test.ts` with:

```ts
import 'reflect-metadata'

import { Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { describe, expect, it } from 'vitest'

import { AppModule } from './app.module'
import { RULES_MACHINE_SQL } from './modules/rules/rules-machine-worker'

type ModuleRef = { name: string }
type DynamicModule = { module: ModuleRef; providers?: unknown[]; imports?: unknown[] }

// Walks static and dynamic module imports, recording each module's provider classes.
function collectProviders(
  root: ModuleRef,
  owners = new Map<unknown, Set<string>>(),
  seen = new Set<ModuleRef>(),
) {
  if (seen.has(root)) return owners
  seen.add(root)
  const add = (providers: unknown[], name: string) => {
    for (const provider of providers)
      if (typeof provider === 'function')
        owners.set(provider, (owners.get(provider) ?? new Set<string>()).add(name))
  }
  add(Reflect.getMetadata('providers', root) ?? [], root.name)
  for (const entry of (Reflect.getMetadata('imports', root) ?? []) as unknown[]) {
    if (typeof entry === 'function') collectProviders(entry as ModuleRef, owners, seen)
    else if (entry && typeof entry === 'object' && 'module' in entry) {
      const dynamic = entry as DynamicModule
      collectProviders(dynamic.module, owners, seen)
      add(dynamic.providers ?? [], dynamic.module.name)
      for (const nested of dynamic.imports ?? [])
        collectProviders(nested as ModuleRef, owners, seen)
    }
  }
  return owners
}

// Provider tokens registered by more than one module, as "token: FirstModule, SecondModule".
function duplicateProviders(root: ModuleRef): string[] {
  return [...collectProviders(root)]
    .filter(([, modules]) => modules.size > 1)
    .map(
      ([token, modules]) =>
        `${typeof token === 'function' ? token.name : String(token)}: ${[...modules].join(', ')}`,
    )
}

describe('application module wiring', () => {
  it('registers each provider token in at most one module', () => {
    expect(collectProviders(AppModule).has(RULES_MACHINE_SQL)).toBe(true)
    expect(duplicateProviders(AppModule)).toEqual([])
  })

  it('flags an object provider token registered in two modules but not repeated enhancers', () => {
    const TOKEN = Symbol('TOKEN')
    class FirstModule {}
    class SecondModule {}
    class RootModule {}
    Module({ providers: [{ provide: TOKEN, useValue: 1 }, { provide: APP_GUARD, useValue: {} }] })(
      FirstModule,
    )
    Module({
      providers: [{ provide: TOKEN, useFactory: () => 2 }, { provide: APP_GUARD, useValue: {} }],
    })(SecondModule)
    Module({ imports: [FirstModule, SecondModule] })(RootModule)
    expect(duplicateProviders(RootModule)).toEqual(['Symbol(TOKEN): FirstModule, SecondModule'])
  })
})
```

The `APP_FILTER`, `APP_INTERCEPTOR` and `APP_PIPE` imports are used in Step 2.

Run: `pnpm --filter @pathways/api exec vitest run src/app-module-wiring.test.ts`
Expected: both tests FAIL: the first because `RULES_MACHINE_SQL` is not collected, the second with `[]` instead of the Symbol line.

- [ ] **Step 2: Key providers by token**

In the same file, add above `collectProviders`:

```ts
// Nest enhancer tokens may be registered by several modules, each adding one global enhancer.
const enhancerTokens = new Set<unknown>([APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE])

// The registration key of a provider: the class itself or the token of an object provider.
function providerToken(provider: unknown): unknown {
  if (typeof provider === 'function') return provider
  if (provider && typeof provider === 'object' && 'provide' in provider)
    return (provider as { provide: unknown }).provide
  return undefined
}
```

Replace the `add` arrow inside `collectProviders` with:

```ts
  const add = (providers: unknown[], name: string) => {
    for (const provider of providers) {
      const token = providerToken(provider)
      if (token !== undefined && !enhancerTokens.has(token))
        owners.set(token, (owners.get(token) ?? new Set<string>()).add(name))
    }
  }
```

and its comment line above the function with `// Walks static and dynamic module imports, recording each module's provider tokens.`

- [ ] **Step 3: Run and commit**

```bash
pnpm --filter @pathways/api exec vitest run src/app-module-wiring.test.ts
pnpm exec biome check --write apps/api/src/app-module-wiring.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add apps/api/src/app-module-wiring.test.ts
git commit -m "test(api): fail when an object provider token is registered in two modules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: 2 tests pass; api = Task 2 count + 1 (`B_api + 11`).

---

### Task 6: Inject the private storage factories

**Files:**
- Create: `apps/api/src/modules/storage/private-storage-factories.ts`
- Test: `apps/api/src/modules/storage/storage.module.test.ts`
- Modify: `apps/api/src/modules/storage/storage.module.ts`
- Modify (inject, 8 calls): `apps/api/src/modules/activities/activities.service.ts:32-36,528-531,2003`, `apps/api/src/modules/activities/private-proof-inspection.service.ts:21-24,146,297,311`, `apps/api/src/modules/beneficiary-media/beneficiary-media.service.ts:29-32,54-57,279,281,368`, `apps/api/src/modules/finance/finance.service.ts:23,72-76,342,569`, `apps/api/src/modules/reports/reports.service.ts:27,92-100,689,811`
- Modify (append `privateStorageFactories`, 18 files): `apps/api/prisma/defense-demo-seed.ts`, `apps/api/prisma/hosted-realistic-seed.ts`, `apps/api/prisma/local-demo-seed.ts`, and under `apps/api/src/modules/`: `activities/activities.access.test.ts`, `activities/activity-capabilities.test.ts`, `activities/activity-milestones.test.ts`, `activities/activity-overdue-explanation.test.ts`, `activities/activity-progress.test.ts`, `activities/activity-proof-media.test.ts`, `activities/activity-proof-review-flow.test.ts`, `activities/activity-review-completion.test.ts`, `activities/evidence-list.access.test.ts`, `activities/feature-read.local.test.ts`, `activities/private-proof-inspection.service.test.ts`, `finance/finance.boundary.test.ts`, `finance/finance.ledger.test.ts`, `reports/reports-runtime.local.test.ts`, `rules/rules-source-domains.test.ts`
- Modify (replace a partial module mock with an injected fake, 3 files): `apps/api/src/modules/finance/finance.service.test.ts`, `apps/api/src/modules/reports/reports.service.test.ts`, `apps/api/src/modules/beneficiary-media/beneficiary-media.service.test.ts`

**Interfaces:**
- Produces: from `apps/api/src/modules/storage/private-storage-factories.ts`: `PRIVATE_STORAGE_FACTORIES: unique symbol`, `privateStorageFactories: { createPrivateInspectionReader, createPrivateUploadVerifier, createPrivateObjectStreamer }`, `type PrivateStorageFactories = typeof privateStorageFactories`. `StorageModule` (global) provides `{ provide: PRIVATE_STORAGE_FACTORIES, useValue: privateStorageFactories }` and exports the token. Each of the five services takes `storageFactories: PrivateStorageFactories` as its last constructor parameter.

- [ ] **Step 1: Write the failing module test**

Create `apps/api/src/modules/storage/storage.module.test.ts`:

```ts
import 'reflect-metadata'

import { describe, expect, it } from 'vitest'

import {
  createPrivateInspectionReader,
  createPrivateObjectStreamer,
  createPrivateUploadVerifier,
} from './private-inspection-reader'
import { PRIVATE_STORAGE_FACTORIES } from './private-storage-factories'
import { StorageModule } from './storage.module'

describe('StorageModule', () => {
  it('provides and exports the production private storage factories', () => {
    expect(Reflect.getMetadata('providers', StorageModule)).toContainEqual({
      provide: PRIVATE_STORAGE_FACTORIES,
      useValue: {
        createPrivateInspectionReader,
        createPrivateUploadVerifier,
        createPrivateObjectStreamer,
      },
    })
    expect(Reflect.getMetadata('exports', StorageModule)).toContain(PRIVATE_STORAGE_FACTORIES)
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/storage/storage.module.test.ts`
Expected: FAIL, cannot resolve `./private-storage-factories`.

- [ ] **Step 2: Create the provider**

Create `apps/api/src/modules/storage/private-storage-factories.ts`:

```ts
import {
  createPrivateInspectionReader,
  createPrivateObjectStreamer,
  createPrivateUploadVerifier,
} from './private-inspection-reader'

// Nest token under which the storage module provides the private storage factories.
export const PRIVATE_STORAGE_FACTORIES = Symbol('PRIVATE_STORAGE_FACTORIES')

// The production private object reader, upload verifier and object streamer factories.
export const privateStorageFactories = {
  createPrivateInspectionReader,
  createPrivateUploadVerifier,
  createPrivateObjectStreamer,
}

export type PrivateStorageFactories = typeof privateStorageFactories
```

Replace `apps/api/src/modules/storage/storage.module.ts` with:

```ts
import { Global, Module } from '@nestjs/common'

import { PRIVATE_STORAGE_FACTORIES, privateStorageFactories } from './private-storage-factories'
import { StorageService } from './storage.service'

@Global()
@Module({
  providers: [
    StorageService,
    { provide: PRIVATE_STORAGE_FACTORIES, useValue: privateStorageFactories },
  ],
  exports: [StorageService, PRIVATE_STORAGE_FACTORIES],
})
export class StorageModule {}
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/storage/storage.module.test.ts src/app-module-wiring.test.ts`
Expected: PASS (the wiring test now also sees `Symbol(PRIVATE_STORAGE_FACTORIES)` with one owner).

- [ ] **Step 3: Inject into the five services**

In each service, the factories import below replaces the factory names from `../storage/private-inspection-reader`:

```ts
import {
  PRIVATE_STORAGE_FACTORIES,
  type PrivateStorageFactories,
} from '../storage/private-storage-factories'
```

and the constructor gains, as its last parameter:

```ts
    @Inject(PRIVATE_STORAGE_FACTORIES) private readonly storageFactories: PrivateStorageFactories,
```

`apps/api/src/modules/activities/activities.service.ts`:
- Replace the block `import {\n  type UploadVerification,\n  createPrivateUploadVerifier,\n} from '../storage/private-inspection-reader'` with `import type { UploadVerification } from '../storage/private-inspection-reader'` followed by the factories import.
- Constructor: add the parameter after `@Inject(StorageService) private readonly storage: StorageService,`.
- Replace `const verify = createPrivateUploadVerifier({` with `const verify = this.storageFactories.createPrivateUploadVerifier({`.

`apps/api/src/modules/activities/private-proof-inspection.service.ts`:
- Replace the block `import {\n  createPrivateObjectStreamer,\n  matchesEvidenceSignature,\n} from '../storage/private-inspection-reader'` with `import { matchesEvidenceSignature } from '../storage/private-inspection-reader'` followed by the factories import.
- Replace `  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}` with:

```ts
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PRIVATE_STORAGE_FACTORIES) private readonly storageFactories: PrivateStorageFactories,
  ) {}
```

- Replace `let storage: ReturnType<typeof createPrivateObjectStreamer>` with `let storage: ReturnType<PrivateStorageFactories['createPrivateObjectStreamer']>`.
- Replace `storage = createPrivateObjectStreamer({` with `storage = this.storageFactories.createPrivateObjectStreamer({`.

`apps/api/src/modules/beneficiary-media/beneficiary-media.service.ts`:
- Replace the block `import {\n  createPrivateObjectStreamer,\n  createPrivateUploadVerifier,\n} from '../storage/private-inspection-reader'` with the factories import.
- Constructor: add the parameter after `@Inject(StorageService) private readonly storage: StorageService,`.
- Replace `Awaited<ReturnType<ReturnType<typeof createPrivateUploadVerifier>>>` with `Awaited<ReturnType<ReturnType<PrivateStorageFactories['createPrivateUploadVerifier']>>>`.
- Replace `const verify = createPrivateUploadVerifier({` with `const verify = this.storageFactories.createPrivateUploadVerifier({` and `const streamer = createPrivateObjectStreamer({` with `const streamer = this.storageFactories.createPrivateObjectStreamer({`.

`apps/api/src/modules/finance/finance.service.ts`:
- Replace `import { createPrivateInspectionReader } from '../storage/private-inspection-reader'` with the factories import.
- Constructor: add the parameter after `@Inject(ReceiptPdfRenderer) private readonly receipts: ReceiptPdfRenderer,`.
- Replace both `const read = createPrivateInspectionReader({` with `const read = this.storageFactories.createPrivateInspectionReader({`.

`apps/api/src/modules/reports/reports.service.ts`:
- Replace `import { createPrivateInspectionReader } from '../storage/private-inspection-reader'` with the factories import.
- Constructor: add the parameter after `@Inject(RulesHumanService) private readonly rules: RulesHumanService,`.
- Replace both `const read = createPrivateInspectionReader({` with `const read = this.storageFactories.createPrivateInspectionReader({`.

```bash
git grep -n "createPrivate\(InspectionReader\|UploadVerifier\|ObjectStreamer\)(" -- apps/api/src ':!*.test.ts' ':!apps/api/src/modules/storage'
git grep -n "storageFactories.createPrivate" -- apps/api/src | wc -l
```

Expected: the first command prints nothing; the second prints `8`. Each changed call is still the first statement inside its existing `try` block (check each by eye), so a factory throw still maps to the same 503.

- [ ] **Step 4: Create the two edit scripts**

Create `.tmp/f3b/add-import.mjs` (same as the F3a helper):

```js
// Inserts one import after each file's import block, with the specifier relative to that file.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [names, target, ...files] = process.argv.slice(2)
for (const file of files) {
  let specifier = path
    .relative(path.dirname(path.resolve(file)), path.resolve(target))
    .split(path.sep)
    .join('/')
  if (!specifier.startsWith('.')) specifier = `./${specifier}`
  const lines = readFileSync(file, 'utf8').split('\n')
  const code = lines.findIndex((line) =>
    /^(@|export |const |let |function |async function |class |type |interface |describe[(])/.test(line),
  )
  let last = -1
  for (let i = 0; i < (code < 0 ? lines.length : code); i++)
    if (/^(import .*['"]$|\} from ['"])/.test(lines[i])) last = i
  if (last < 0) throw new Error(`${file}: import block not found`)
  lines.splice(last + 1, 0, `import ${names} from '${specifier}'`)
  writeFileSync(file, lines.join('\n'))
  console.log(`${file}: import ${names} from '${specifier}'`)
}
```

Create `.tmp/f3b/append-arg.mjs`:

```js
// Appends one argument to every `new <Class>(...)` call in the given files and prints the counts.
import { readFileSync, writeFileSync } from 'node:fs'

const [className, argument, ...files] = process.argv.slice(2)
const opener = `new ${className}(`
let total = 0
for (const file of files) {
  let text = readFileSync(file, 'utf8')
  let from = 0
  let count = 0
  for (let start = text.indexOf(opener, from); start >= 0; start = text.indexOf(opener, from)) {
    let depth = 0
    let end = start + opener.length - 1
    for (; end < text.length; end++) {
      if (text[end] === '(') depth++
      else if (text[end] === ')' && --depth === 0) break
    }
    if (end >= text.length) throw new Error(`${file}: unbalanced ${opener}`)
    const inner = text.slice(start + opener.length, end).replace(/,?\s*$/, '')
    const replacement = `${opener}${inner}, ${argument})`
    text = text.slice(0, start) + replacement + text.slice(end + 1)
    from = start + replacement.length
    count++
  }
  writeFileSync(file, text)
  total += count
  console.log(`${file}: ${count}`)
}
console.log(`total: ${total}`)
```

- [ ] **Step 5: Pass the production factories at the 25 plain construction sites**

```bash
M=apps/api/src/modules
node .tmp/f3b/append-arg.mjs ActivitiesService privateStorageFactories \
  apps/api/prisma/defense-demo-seed.ts apps/api/prisma/hosted-realistic-seed.ts apps/api/prisma/local-demo-seed.ts \
  $M/activities/activities.access.test.ts $M/activities/activity-capabilities.test.ts $M/activities/activity-milestones.test.ts \
  $M/activities/activity-overdue-explanation.test.ts $M/activities/activity-progress.test.ts $M/activities/activity-proof-media.test.ts \
  $M/activities/activity-proof-review-flow.test.ts $M/activities/activity-review-completion.test.ts $M/activities/evidence-list.access.test.ts \
  $M/activities/feature-read.local.test.ts $M/rules/rules-source-domains.test.ts
node .tmp/f3b/append-arg.mjs FinanceService privateStorageFactories \
  apps/api/prisma/defense-demo-seed.ts apps/api/prisma/local-demo-seed.ts $M/finance/finance.boundary.test.ts $M/finance/finance.ledger.test.ts
node .tmp/f3b/append-arg.mjs ReportsService privateStorageFactories \
  apps/api/prisma/defense-demo-seed.ts apps/api/prisma/local-demo-seed.ts $M/reports/reports-runtime.local.test.ts
node .tmp/f3b/append-arg.mjs PrivateProofInspectionService privateStorageFactories $M/activities/private-proof-inspection.service.test.ts
node .tmp/f3b/add-import.mjs "{ privateStorageFactories }" $M/storage/private-storage-factories \
  apps/api/prisma/defense-demo-seed.ts apps/api/prisma/hosted-realistic-seed.ts apps/api/prisma/local-demo-seed.ts \
  $M/activities/activities.access.test.ts $M/activities/activity-capabilities.test.ts $M/activities/activity-milestones.test.ts \
  $M/activities/activity-overdue-explanation.test.ts $M/activities/activity-progress.test.ts $M/activities/activity-proof-media.test.ts \
  $M/activities/activity-proof-review-flow.test.ts $M/activities/activity-review-completion.test.ts $M/activities/evidence-list.access.test.ts \
  $M/activities/feature-read.local.test.ts $M/activities/private-proof-inspection.service.test.ts $M/finance/finance.boundary.test.ts \
  $M/finance/finance.ledger.test.ts $M/reports/reports-runtime.local.test.ts $M/rules/rules-source-domains.test.ts
```

Expected totals printed by `append-arg.mjs`: `18`, `4`, `3`, `1`; `add-import.mjs` prints 18 lines.

- [ ] **Step 6: Replace the three partial module mocks with injected fakes**

These three files mock `private-inspection-reader` without `importOriginal`, so loading `privateStorageFactories` would read an export the mock does not define. Run:

```bash
M=apps/api/src/modules
node .tmp/f3b/add-import.mjs "type { PrivateStorageFactories }" $M/storage/private-storage-factories \
  $M/finance/finance.service.test.ts $M/reports/reports.service.test.ts $M/beneficiary-media/beneficiary-media.service.test.ts
node .tmp/f3b/append-arg.mjs FinanceService storageFactories $M/finance/finance.service.test.ts
node .tmp/f3b/append-arg.mjs ReportsService storageFactories $M/reports/reports.service.test.ts
node .tmp/f3b/append-arg.mjs BeneficiaryMediaService storageFactories $M/beneficiary-media/beneficiary-media.service.test.ts
```

Expected: each `append-arg.mjs` run prints `total: 1`.

`apps/api/src/modules/finance/finance.service.test.ts`: delete the block

```ts
vi.mock('../storage/private-inspection-reader', () => ({
  createPrivateInspectionReader: () => state.reader,
}))
```

and add directly above `const service = new FinanceService(`:

```ts
const createReader = vi.fn(() => state.reader)
const storageFactories = {
  createPrivateInspectionReader: createReader,
} as unknown as PrivateStorageFactories
```

Then add, directly after the test `reports a private read outage as unavailable without audit or bytes` (Review Focus 3):

```ts
  it('reports a reader factory configuration fault as unavailable without audit or bytes', async () => {
    const scopedActor: ApplicationIdentity = {
      ...actor,
      roles: ['PROJECT_MANAGER'],
      permissions: ['expenses.read', 'evidence.read'],
      assignedProjectIds: [projectId],
    }
    state.actor = scopedActor
    createReader.mockImplementationOnce(() => {
      throw new Error('Invalid private storage configuration.')
    })
    const failure = service.receipt(scopedActor, projectId, id)
    await expect(failure).rejects.toBeInstanceOf(ServiceUnavailableException)
    await expect(failure).rejects.toThrow('Private receipt storage unavailable')
    expect(state.reader).not.toHaveBeenCalled()
    expect(tx.auditLog.create).not.toHaveBeenCalled()
  })
```

`apps/api/src/modules/reports/reports.service.test.ts`: delete the block

```ts
vi.mock('../storage/private-inspection-reader', () => ({
  createPrivateInspectionReader: () => state.read,
}))
```

and add directly above `const service = new ReportsService(`:

```ts
const storageFactories = {
  createPrivateInspectionReader: () => state.read,
} as unknown as PrivateStorageFactories
```

`apps/api/src/modules/beneficiary-media/beneficiary-media.service.test.ts`: delete the block

```ts
vi.mock('@app/modules/storage/private-inspection-reader', () => ({
  createPrivateUploadVerifier: () => reader.verify,
  createPrivateObjectStreamer: () => ({ release: reader.release }),
}))
```

and add directly above `const service = new BeneficiaryMediaService(`:

```ts
const storageFactories = {
  createPrivateUploadVerifier: () => reader.verify,
  createPrivateObjectStreamer: () => ({ release: reader.release }),
} as unknown as PrivateStorageFactories
```

```bash
git grep -n "vi.mock('[^']*private-inspection-reader'" -- apps | wc -l
git grep -n "new \(ActivitiesService\|FinanceService\|ReportsService\|PrivateProofInspectionService\|BeneficiaryMediaService\)(" -- apps | wc -l
```

Expected: `3` (the `importOriginal` mocks in `activity-proof-media.test.ts`, `activity-proof-review-flow.test.ts`, `private-proof-inspection.service.test.ts`); `29`.

- [ ] **Step 7: Verify and commit**

```bash
git add -N apps/api
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts')
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api exec vitest run src/modules/storage src/modules/activities src/modules/beneficiary-media src/modules/finance src/modules/reports src/modules/rules/rules-source-domains.test.ts src/app-module-wiring.test.ts src/common/import-boundary.test.ts
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api
git commit -m "refactor(api): inject the private storage factories through StorageModule

Activities, private proof inspection, beneficiary media, finance and reports take PRIVATE_STORAGE_FACTORIES; every factory call stays in its try block.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: typecheck passes (it also checks the three seeds and the two local tests); all listed tests pass; api = Task 5 count + 2 (`B_api + 13`: module test and the finance factory fault test).

---

### Task 7: Records and SAD routing

**Files:**
- Modify: `scripts/sad/check.ts:47-53`, `scripts/sad/check.test.ts` (after the test at line 84), `docs/sad-pathways.md:38`
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.2, 3.4, 3.6, 9)
- Modify: `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-11, MOD-13 rows)
- Modify: `docs/index.md` (CR row status; section 1.6 plan row)
- Modify: `docs/activity-log.md`

- [ ] **Step 1: Route contracts and the zod pipe to the beneficiary privacy guardian (ruling 11)**

In `scripts/sad/check.test.ts`, directly after the test `routes api authz, audit and guard changes to the organization isolation checker`, add:

```ts
  it('routes request contracts and the zod pipe to the beneficiary privacy guardian', () => {
    const files = [
      'apps/api/src/common/validation/zod-pipe.ts',
      'packages/shared/src/contracts/imports/import-requests.ts',
    ]
    const routed = routing(files.map((file) => change(file, 'new', 'old')))
    expect(routed['beneficiary-privacy-guardian']).toEqual(files)
  })
```

Run: `pnpm sad:test`
Expected: FAIL on the new test.

In `scripts/sad/check.ts`, `beneficiary-privacy-guardian` globs, add directly after `'packages/shared/src/validation/**/*.ts',`:

```ts
      'packages/shared/src/contracts/**/*.ts',
      'apps/api/src/common/validation/**/*.ts',
```

In `docs/sad-pathways.md` line 38, after `` `packages/shared/src/validation/**/*.ts` `` insert `` , `packages/shared/src/contracts/**/*.ts`, `apps/api/src/common/validation/**/*.ts` `` (inside the same cell).

```bash
pnpm sad:test && pnpm sad:typecheck
```

Expected: PASS; sad = `B_sad + 1`.

- [ ] **Step 2: Amend the Change Record**

`docs/cr-pathways-codebase-modularization.md`:

Section 3.2, replace

```text
`common/` holds `authz/` (application identity, project scope, `requireScopedProject`, and from F3b `withAuthorizedOperation`), `audit/` (`writeAuditLog`), `validation/` (zod pipe, F3b), `time/` (`currentBusinessDate`) and `prisma/` (`Tx`).
```

with

```text
`common/` holds `authz/` (application identity, project scope, `requireScopedProject`, `withAuthorizedOperation`, `readApplicationProfile`), `audit/` (`writeAuditLog`), `validation/` (`ZodPipe`), `time/` (`currentBusinessDate`) and `prisma/` (`Tx`).
```

Section 3.4, append to the paragraph:

```text
A duplicate `export *` name is TypeScript error TS2308 in the barrel, so a collision fails `pnpm typecheck`. Contract exports carry their domain through the section 3.6 names. The generic names exported by `rules/` (`uuidSchema`, `decimalSchema`, `operators`, `reviewSchema`, `pageSchema`, `emptyBodySchema`, `confirmOutcomeSchema`) stay until a new export would collide with one; that change renames the rules export with a `rule` prefix (amended 2026-10-10 for F3b).
```

Section 3.6, after the bullet starting `- API validates with`, add:

```markdown
- `ZodPipe` lives in `apps/api/src/common/validation/zod-pipe.ts` and runs after the global `ValidationPipe`, which passes a parameter whose design type is `Object` (any zod-inferred type) through unchanged. The global pipe has `transform: true` without implicit conversion, so numeric strings were already rejected on DTO routes and stay rejected.
- `.strict()` also rejects own `__proto__` and `constructor` body keys, which the class-validator pipe silently dropped; parity tests record these two inputs as the only accepted difference (amended 2026-10-10 for F3b).
```

Section 9: append

```markdown
F3b applied 2026-10-10 on refactor/f3b-validation-wiring:
- Validation: `ZodPipe` in `common/validation/zod-pipe.ts` answers 400 `{ statusCode, message: string[], error: 'Bad Request' }` with one `<path> <zod message>` entry per issue.
- First contract: `validateImportRequest` and `ValidateImportRequest` in `packages/shared/src/contracts/imports/import-requests.ts` replaced `ValidateImportDto` on `POST imports/projects/:projectId/batches/:batchId/validate`; a parity test ran both through the configured pipes over 22 JSON bodies before the DTO was deleted.
- Package: <Task 3 outcome sentence>.
- Authz: `readApplicationProfile` moved to `common/authz/application-profile.ts` (six test mocks followed it), then `withAuthorizedOperation`, its timing module and its test moved to `common/authz` (86 importers repointed, 55 test mocks moved with their import); `ApplicationProfileService` stays in `modules/auth`.
- Storage: `StorageModule` provides `PRIVATE_STORAGE_FACTORIES` (`modules/storage/private-storage-factories.ts`); the activities, private proof inspection, beneficiary media, finance and reports services inject it, and every factory call stays in its `try` block, so a configuration fault still answers 503.
- Wiring: `app-module-wiring.test.ts` keys providers by token, including `{ provide, useClass | useValue | useFactory }`, and exempts the Nest `APP_*` enhancer tokens.
- SAD: beneficiary privacy routing covers `packages/shared/src/contracts/**/*.ts` and `apps/api/src/common/validation/**/*.ts`.
- Decisions: exact parity held for 20 bodies, and own `__proto__` and `constructor` keys are now rejected (ruling 3); the seven generic rules names stay because a barrel collision is a compile error (ruling 5); `readApplicationProfile` moved before the kernel so `common` never imported `modules` at any commit (ruling 7); the factories are a required constructor parameter, and the three tests that mocked only part of the reader module now inject fakes (ruling 9).

Deferred: the remaining class-validator DTO routes (their slices); the three `importOriginal` reader mocks in activities tests (S2); web `validateImport` typing from the contract (S5).
```

Replace `<Task 3 outcome sentence>` with either `` `packages/shared/package.json` declares `"sideEffects": false`; no shared module has a top-level side effect; web Middleware went from X kB to Y kB `` or `` `"sideEffects": false` was not kept because <the build failed or Middleware grew from X kB to Y kB> ``, using the Task 3 measurements.

- [ ] **Step 3: Close the audit findings and update the index**

- Audit: append to the disposition cell of MOD-11 `; contract pattern, zod pipe and first contract applied by F3b, remaining DTOs in the slices.` and of MOD-13 `; closed by F3b.`
- `docs/index.md`: CR row status becomes `Approved; F1, F2, F3a and F3b applied, F4 next`; the F3b plan row status becomes `Executed; remove after merge`.

```bash
git grep -n "modules/auth/authorized-operation" -- docs ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/cr-*' ':!docs/superpowers/*'
```

Expected: prints nothing (no living doc names the old kernel path).

- [ ] **Step 4: Activity log**

Add to `docs/activity-log.md`:

```markdown
## 2026-10-10 Modularization F3b api validation and wiring (refactor/f3b-validation-wiring)
```

with one bullet per Task 1 to Task 6 stating what was added, moved or injected and the api (and for Task 2 the shared) test count recorded at the end of that task, a bullet with the Task 3 middleware sizes, a bullet saying the F3b decisions are recorded in the change record section 9 (the plan file is removed after merge), and a bullet listing the deferrals. Task 8 Step 5 appends the gate results.

- [ ] **Step 5: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint
git add docs scripts/sad
git commit -m "docs: record modularization F3b and route contracts to the privacy guardian

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline.

---

### Task 8: Full release gates and merge

- [ ] **Step 1: Static gates**

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm sad:test
git checkout -- apps/web/next-env.d.ts
test -f apps/api/dist/apps/api/src/common/validation/zod-pipe.js && test -f apps/api/dist/apps/api/src/common/authz/authorized-operation.js && test -f apps/api/dist/apps/api/src/common/authz/application-profile.js && test -f apps/api/dist/apps/api/src/modules/storage/private-storage-factories.js && test ! -e apps/api/dist/apps/api/src/modules/auth/authorized-operation.js && test -f packages/shared/dist/contracts/imports/import-requests.js && echo "dist layout ok"
```

Expected: all pass and `dist layout ok`. Versus Task 0: api = `B_api + 13` (zod pipe 5, validate HTTP 5, wiring 1, storage module 1, finance factory fault 1), shared = `B_shared + 6`, sad = `B_sad + 1`, imports, config and web unchanged.

- [ ] **Step 2: Local DB replay**

```powershell
./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline
```

Expected: exit 0 (it runs `feature-read.local.test.ts`, `reports-runtime.local.test.ts` and `csv-rbac.local.test.ts`, which now pass the injected factories or import the moved kernel).

- [ ] **Step 3: Local stack, compiled API boot, e2e and smoke**

Stop anything on ports 3000 and 4000 first.

```bash
pnpm db:local:start && pnpm db:local:reset && pnpm db:local:demo
pnpm dev:local
```

`pnpm db:local:demo` runs the edited `local-demo-seed.ts`; `pnpm dev:local` builds the API and runs `dist`. In a second terminal:

```bash
curl -s http://127.0.0.1:4000/api/health
npx playwright test --config playwright.config.ts
npx playwright test --config playwright.auth-navigation.config.ts
```

Expected: `"status":"ok"`; a module-resolution error or a Nest `can't resolve dependencies` error naming `PRIVATE_STORAGE_FACTORIES` in the `pnpm dev:local` output fails the gate; auth-navigation 27/27; main suite 39 pass, 9 fail, 22 not run, with the same 9 failing as the F1, F2 and F3a gate runs (MFA Verify helper, password-login harness, workflows seed end date). Browser smoke, covering the switched route and all 8 factory calls, each step signed in as a demo user whose role holds the step's permission (for example `expenses.evidence.submit` belongs to Project Officer and Monitoring and Evaluation Officer, not Project Manager): open an import batch, save its mapping and press Validate (the zod route; the validation revision completes); record activity progress with a photo proof (upload verifier); open that proof in the private inspection preview (object streamer); open a beneficiary, upload a media photo and view it (upload verifier and streamer); attach a receipt to an expense and open the receipt (inspection reader, both finance calls); generate a report and download it (inspection reader, both reports calls). Every step must behave as on dev; a 503 on any storage step fails the gate.

- [ ] **Step 4: SAD review**

```bash
pnpm sad:check --base dev --head HEAD --output .tmp/sad/f3b/manifest.json
```

Dispatch every role the manifest requires (expect `restraint-guardian`, `design-qa-agent`, `organization-isolation-checker`, `beneficiary-privacy-guardian`, `metadata-import-validator` and `rule-engine-determinism-checker`) with the section 4.2 handoff packet from `docs/sad-pathways.md`, save their section 4.4 envelopes to `.tmp/sad/f3b/reviews.json`, then:

```bash
pnpm sad:signoff -- --base dev --head HEAD --reviews .tmp/sad/f3b/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun.

- [ ] **Step 5: Record the gate results**

Append a final bullet to the Task 7 activity-log section with the gate results (per-package counts, replay exit code, e2e pass counts, smoke result, SAD sign-off), then:

```bash
git add docs/activity-log.md
git commit -m "docs: record modularization F3b release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Merge into local dev**

```bash
git checkout dev
git merge --no-ff refactor/f3b-validation-wiring -m "Merge refactor/f3b-validation-wiring into dev

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Remove the executed plan**

On dev, as CR section 6 requires:

```bash
git rm docs/superpowers/plans/2026-10-10-modularization-f3b-validation-wiring.md
```

Delete the F3b plan row from `docs/index.md` section 1.6, then:

```bash
pnpm docs:check 2>&1 | tail -3
git add docs/index.md
git commit -m "docs: remove the executed F3b plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline. Do not push `origin dev` until the developer says so.
