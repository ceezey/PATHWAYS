# S1b Projects Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the projects web code its own client module, source mutation request core, feature folder layout and public index, and cut the oversized project components, with no change to any screen, request, response, permission decision or route bundle size.

**Architecture:** S1b is the web half of S1 (S1a, the contracts and api, is merged). The project methods leave `pathways-client.ts` for `lib/api/projects.ts`, typed from the S1a response contracts; `requestSourceMutation` moves to `lib/api/core` so S2b, S3b and S5b can reuse it; the 78-file `features/projects` folder gets `components/` and `team/` subfolders for the project files and a public `index.ts` that every outside file imports through, with a surface rule in `import-direction.test.ts` and a Next `optimizePackageImports` entry that keeps route bundles the same size. The review workspace first loses two views that no route renders, then the setup form, the team selectors and the review workspace are cut by component. Mechanical edits use one-off Node scripts under `.tmp/s1b/` (gitignored, never committed) whose content is given in full. Every step below was dry-run on an exported copy of local dev `703fde72` (F1 to F4b and S1a merged): each task's resulting tree was reproduced from scratch with these scripts, `pnpm lint`, `pnpm typecheck` and the web suite pass at the end (216 files, 1943 tests), and the outputs quoted below come from those runs.

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, Next 15.5.14 (App Router, webpack production build), Vitest 3.2, Biome 1.9.4, zod 3.25.76, Playwright.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.3, 3.5, 3.7 and 9 including the F4a, F4b and S1a dispositions) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05, MOD-06, MOD-15, MOD-16 and MOD-17 for the projects web modules).

## Rulings

Controller rulings for S1b (2026-10-12). Each was checked on an exported copy of dev `703fde72`; S2a changes only api, shared and api seeds, so every web count below holds after it merges, and Task 0 recounts them.

1. **One plan, ten tasks (0 to 9), no S1b1/S1b2 split.** The client half (Tasks 1 to 3) and the feature half (Tasks 4 to 7) each end green, so a reviewer can stop at the Task 3 boundary. Cost if wrong: an executor tires on the 51-file Task 3; split there and run Tasks 4 to 9 as S1b2.
2. **`projectsClient` is an object in `lib/api/projects.ts` with the removed `PathwaysClient` method names and signatures.** `ApiProject` is replaced by the S1a `ProjectResponse` (the old cast `as ApiProject` becomes `as ProjectResponse`; summary rows are cast the same way and the mapper defaults the missing fields), the archive answer by `ArchiveProjectResponse`, and the local `StoredProjectStatus` in `types/pathways.ts` by the shared one. `ProjectSummaryResponse` has no web use: summary rows and detail rows go through one mapper. The web view models (`ProjectDetail`, `ProjectSummary`, `CreateProjectInput`, `UpdateProjectInput`) do not change because they carry UI status names. Cost if wrong: a mapper drift is caught by `projects.test.ts` (Task 2) and by typecheck.
3. **`getProjectsForRole(role)` stays.** It ignores its argument and calls `getProjects()`, but 15 files besides the client (8 screens and 7 tests) call or mock it with the role, and one test asserts the argument (`toHaveBeenCalledWith('Grant Manager')`); folding it would change callers and assertions, not just structure. Task 2 pins that it reads the same list for every role. Cost if wrong: one redundant method until a later cleanup.
4. **`requestSourceMutation` has one owner: `lib/api/core/source-mutation-request.ts` (Task 1).** Signature: `requestSourceMutation<T>(path: string, method: 'POST' | 'PATCH', body: Record<string, unknown>, context: SourceMutationContext | undefined, parse: (value: unknown) => T): Promise<SourceMutationResult<T>>`, exactly what S2 ruling 16 and S3 name. It cannot live in `lib/services/source-mutation.ts` because F4b made `request.ts` import that file. `recoverSourceMutation` and the `sourceTickets` alias stay in `pathways-client.ts` (S2b and S3b add their operation branches there, and `recordIndicatorMeasurement` still calls `sourceTickets.execute`). Cost if wrong: S2b Task 0 stops on a missing export.
5. **Mocks are repointed by script, with exact counts.** 26 test files define a project method in a `vi.mock('@/lib/services/pathways-client', ...)` factory. Factories that are an inline object literal are split (project keys move into a new `vi.mock('@/lib/api/projects', ...)`, an empty remainder is deleted); factories that name a shared object (`pathwaysClient: api`) get a second mock with the same object (`projectsClient: api`), because the object also serves other methods; one factory that spreads `importOriginal` is edited by hand. Cost if wrong: a component under test sees `undefined` for a project method; the Task 3 scan (`factories 42, naming 0`) and the full suite catch it.
6. **The project map fetcher is `projectsClient.getProjectMap(signal: AbortSignal): Promise<ProjectMap>`.** `useProjectMap` in `features/analytics` calls it; the map UI stays in analytics (S7) and the schema stays in `packages/shared/src/monitoring` (S1 ruling 6). S7 consumes the name.
7. **The `indicators` and `transparency` views of the review workspace are deleted (Task 4).** Only three pages render `ProjectPhaseFiveWorkspace` (`budget`, `evidence`, `monitor-evaluate`); `/projects/[id]/indicators` renders `ProjectIndicatorsWorkspace` and `/transparency` has its own pages. The two other views, their Add Indicator dialog (which only toasted "not configured"), and every export of `project-review-utils.ts` (four of five used nowhere, the fifth only by that dialog) are unreachable F1 leftovers. Narrowing the `view` type to the three live values compiles, which proves no page passes the others; the deletion removes about 300 lines and 3 kB from each of the three routes. Cost if wrong: restore from git history; no screen changes.
8. **Layout.** `features/projects/components/` holds the project components (19 files after Task 7), `team/` the team editor and selectors (5), and the root keeps `index.ts`, `projects.reads.ts` (was `use-project-reads.ts`; it also serves the activity and indicator tabs until S2b and S3b carve their hooks out), `projects.utils.ts` (was `project-utils.ts`), `project-form.utils.ts` (was `project-form-validation.ts`) and its test. Activity, evidence, proof, indicator, library, budget, evaluation and rules-panel files stay at the root until S2, S3, S6 and S7 move them; `source-mutation-recovery.tsx` and `option-select.tsx` go to `components/` because they are shared across those tabs. Cost if wrong: a later slice repoints by path, which its codemods already do.
9. **Every file outside the feature imports through `features/projects/index.ts`, route pages included, and Next is told to optimize that barrel.** The index also exports the names of not-yet-moved files that outside files import (`ActivityDetailPage`, `ActivityDetailPanel`, `ActivityProofDialog`, `ProjectActivitiesWorkspace`, `ProjectIndicatorsWorkspace`, `IndicatorLibraryManager`, `PrintReceiptPage`), so the surface rule holds for the whole feature now and S2b, S3b and S6b only repoint export lines. Measured on production builds: a plain barrel grows `/projects/*` routes from 269 to 343 kB up to 397 kB, `/print/receipts/[expenseId]` from 133 to 397 kB, `/analytics` from 664 to 752 kB and `/dashboard` from 673 to 752 kB; with `experimental.optimizePackageImports: ['@/features/projects']` in `apps/web/next.config.ts` no route grows (the three review routes shrink 3 kB). The rule names are `indexedFeatures` and `surfaceViolation(file, specifier)`, exactly the shape the S7 plan expects, and a test requires every indexed feature to be in `optimizePackageImports`. Cost if wrong: if the optimizer misbehaves in `next dev --turbopack`, drop the config key and exempt `app/` in `surfaceViolation`; routes then import deep as before.
10. **Component names.** `ProjectPhaseFiveWorkspace` becomes `ProjectReviewWorkspace` (3 pages, its test, MOD-17); the file keeps `project-review-workspace.tsx`. The file-private names `ScopedProjectSetupForm`, `ScopedReport` and `OwnedSourceMutationRecovery` become `ProjectSetupFormContent`, `ProjectReportRecord` and `SourceMutationRecoveryContent` (CR 3.3: purpose names replace `Owned*` and `Scoped*`); the activity files' prefixed names stay for S2b. Three splits, all verbatim moves except where noted: `evidence-view.tsx` (the evidence presentation components of the review workspace), `project-setup-fields.tsx` (the field grid of the setup form, one prop added for the locked budget text) and `team/team-selection.utils.ts` (the pure team rules of the selectors, with its test renamed). The setup form lands at 409 lines, the selectors at 405 and the review workspace at 213; none is above 500. Cost if wrong: none beyond review time.
11. **No SAD routing, api, shared, seed or migration change.** `apps/web/src/lib/api/**/*.ts` already routes to the beneficiary privacy guardian (F4b) and `lib/services` keeps its routing; Task 9 reads the manifest. Web Middleware stays at 102 kB.
12. **Write scripts with the Write tool, not a shell heredoc.** A shell heredoc in this environment can eat the backslashes of regular expressions; every `.tmp/s1b/` script below is created with the Write tool.
13. Cross-plan: names produced by S1b and consumed later. `requestSourceMutation` (ruling 4); `projectsClient` and `projectsClient.getProjectMap` (rulings 2 and 6); `features/projects/index.ts` with `indexedFeatures` and `surfaceViolation` (ruling 9); the layout of ruling 8. Later plan lines that must change: S2 outline Task 2 (route pages and `role-dashboard.tsx` already import through the index and the surface rule already covers `activities`; S2b only repoints the index export lines to `./activities` and adds no rule) and Task 4 (`use-project-reads.ts` is `projects.reads.ts`); S3 outline Task 2 and S6 outline (same repointing of index export lines; S6 Interfaces says `components/, hooks/, team/`, there is no `hooks/`); S5 outline Task 5 and S7 Task 6 and Task 10 (add the feature to `indexedFeatures` and `@/features/<name>` to `optimizePackageImports` in `apps/web/next.config.ts` instead of writing a second rule; the new test fails otherwise); S7 outline names (`projectsClient.getProjectMap`, `projects.utils`, `projects.reads`, the review workspace at `features/projects/components/project-review-workspace.tsx`, importing `../project-rules-panel`). Cost if wrong: a later slice writes a duplicate surface rule or a route grows 100 kB.
14. Pre-flight (2026-10-12): replay test asserts parse is not called, two comments made one sentence, comment-only canAssignRole import dropped, two unprefixed doc paths hand-edited, route shrink stated as 3 to 4 kB, renamed test comment updated.

## Interfaces assumed from earlier sub-projects

- S1a (from `@pathways/shared`): `ProjectResponse`, `ArchiveProjectResponse`, `StoredProjectStatus` (`packages/shared/src/contracts/projects`), and from `monitoring`: `ProjectMap`, `projectMapSchema`, `ProjectOverviewMetrics`, `projectOverviewMetricsSchema`.
- F4b: `PathwaysClientError` and `requestFoundation(path: string, init?: RequestInit, isCurrent?: () => boolean)` from `apps/web/src/lib/api/core/request.ts`; `SourceMutationContext`, `SourceMutationResult`, `SourceMutationRecoveryError` and `sourceMutationTickets` from `apps/web/src/lib/services/source-mutation.ts`.

## Global Constraints

- Behavior-preserving: no screen, workflow, permission, request or response shape changes. The only removals are the two unreachable review views of ruling 7. Production code stays free of new dependencies.
- Direction (CR 3.1): `apps/web/src/import-direction.test.ts` and `packages/shared/src/package-import-boundary.test.ts` pass at every commit.
- File moves use `git mv` (the move script does it) in a commit of their own (Task 5); the verbatim splits of Task 7 are checked with `.tmp/s1b/same-lines.mjs` before Biome formats them.
- Kebab-case file names that describe purpose; the allowed web suffixes are `.reads`, `.utils`, `.copy`, `.schema` (CR 3.5); comments are one sentence, no emojis; docs prose has no em dashes and no `--` (fenced code is exempt).
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. Biome 1.9 recommended rules do not flag unused imports, so run `node .tmp/s1b/trim-imports.mjs <file>` after removing code.
- `pnpm typecheck` rewrites `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` before every commit.
- Mock factories name modules by the specifier the code under test imports; after Task 3 a project method is mocked on `@/lib/api/projects`, never on `pathwaysClient`.
- One-off scripts live in `.tmp/s1b/` (gitignored) and are never committed; build logs go there too.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work in `C:\PATHWAYS` on branch `refactor/s1b-projects-web`; no new worktree. All paths are relative to `C:\PATHWAYS`. Do not push. Do not touch `apps/api`, `packages`, `apps/api/prisma`, migrations, `.env` files or review evidence.

## Review Focus

1. A project update answered by a replay acknowledgement (no record) must come back as the acknowledgement, not run through the mapper, and an unconfirmed save must become an `invalid` client error. Task 1 pins both on `requestSourceMutation`; Task 2 pins the mapped result and the missing-context refusal on `updateProject`.
2. A reader without `projects.detail.read` receives four-field summary rows; the list must still render with the display defaults ("Area not recorded", "Not assigned", "Dates not recorded"). Task 2 pins it, with an absent target staying `undefined`.
3. A test or a later slice that mocks a project method on `pathwaysClient` would hand its component `undefined` at run time, because factories are untyped. Task 3 scans every factory (`factories 42, naming 0`) and greps for call sites.
4. A route bundle must not grow when files import the feature index. Task 6 compares the production route table with Task 0's and a test fails when an indexed feature is not in `optimizePackageImports`.
5. A page that tries to render a removed review view (`indicators`, `transparency`) must fail to compile, not render an empty shell. Task 4 narrows the `view` type to the three live values and the typecheck proves no page passes another.
6. A malformed project map payload must still reject instead of rendering a partial map. Task 2 pins the strict parse in `getProjectMap`.

## File map

| Path | Role after S1b |
|---|---|
| `apps/web/src/lib/api/core/source-mutation-request.ts` | `requestSourceMutation` (new, Task 1) |
| `apps/web/src/lib/api/projects.ts` | `projectsClient`, the project mapper and wire types (new, Task 2) |
| `apps/web/src/lib/services/pathways-client.ts` | loses the project methods, `ApiProject`, `mapProject`, `parseProjects` (Tasks 1 and 3) |
| `apps/web/src/features/projects/index.ts` | public surface (new, Task 6) |
| `apps/web/src/features/projects/components/` | 19 files: project components, shared `option-select` and `source-mutation-recovery` (Tasks 5 and 7) |
| `apps/web/src/features/projects/team/` | team editor, selectors, `team-selection.utils.ts` (Tasks 5 and 7) |
| `apps/web/src/features/projects/projects.{reads,utils}.ts`, `project-form.utils.ts` | renamed helpers (Task 5) |
| `apps/web/src/import-direction.test.ts`, `apps/web/next.config.ts` | surface rule and barrel optimization (Task 6) |

---

### Task 0: Branch setup and baseline

**Files:**
- Create: `docs/superpowers/plans/2026-10-12-modularization-s1b-projects-web.md` (this plan)
- Delete: `docs/superpowers/plans/2026-10-10-modularization-s1-projects-core.md` (its S1b outline is replaced by this plan)
- Modify: `docs/index.md` (section 1.6 plan rows)

- [ ] **Step 1: Confirm local dev contains F4b, S1a and S2a, and create the branch**

```bash
cd /c/PATHWAYS
git status --short
git checkout dev
git log --oneline dev | grep -m1 "Merge refactor/f4b-web-helpers into dev"
git log --oneline dev | grep -m1 "Merge refactor/s1a-projects-core into dev"
git log --oneline dev | grep -m1 "Merge refactor/s2a-activities into dev"
test -f apps/web/src/lib/api/core/request.ts && test -f apps/web/src/lib/api/core/request-owner.ts && test -f apps/web/src/hooks/use-authorized-read.ts && test -f packages/shared/src/contracts/projects/project-responses.ts && echo "F4b and S1a outputs present"
grep -c "export type ArchiveProjectResponse\|export type ProjectResponse" packages/shared/src/contracts/projects/project-responses.ts
ls docs/superpowers/plans/
git checkout -b refactor/s1b-projects-web
pnpm install --frozen-lockfile
mkdir -p .tmp/s1b
```

Expected: clean status, the three merge commits, `F4b and S1a outputs present`, `2`, install succeeds. If a merge commit or an output is missing, stop and report: S1b builds on F4b, S1a and (for the api freeze) S2a. If `ls` lists an S2 plan, leave it. If it lists an F-plan, that plan's removal did not run: Step 3 removes it and its index row too.

- [ ] **Step 2: Record the baseline**

```bash
pnpm --filter @pathways/shared build
pnpm typecheck && pnpm test 2>&1 | grep -E "Test Files|Tests +[0-9]+"
pnpm sad:test 2>&1 | grep -E "Tests +[0-9]+"
pnpm docs:check 2>&1 | tail -3
pnpm --filter @pathways/web build > .tmp/s1b/web-build-baseline.log 2>&1; echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' .tmp/s1b/web-build-baseline.log | sed -n '/Route (app)/,$p' > .tmp/s1b/routes-baseline.txt
grep -E "Middleware" .tmp/s1b/routes-baseline.txt
git hash-object apps/web/src/lib/services/pathways-client.ts apps/web/src/features/projects/project-review-workspace.tsx apps/web/src/features/projects/project-setup-form.tsx apps/web/src/features/projects/project-team-selectors.tsx apps/web/src/features/projects/use-project-reads.ts apps/web/src/features/analytics/use-project-map.ts apps/web/src/types/pathways.ts apps/web/src/import-direction.test.ts apps/web/src/features/ui-copy-cleanup.contract.test.ts
wc -l < apps/web/src/lib/services/pathways-client.ts
git grep -lE "\b(getProjects|getProjectsForRole|getProject|createProject|updateProject|archiveProject|getProjectOverviewMetrics)\b" -- apps/web/src | wc -l
git grep -lE "vi\.mock\('@/lib/services/pathways-client'" -- apps/web/src | wc -l
git grep -n "requestSourceMutation" -- apps/web/src | wc -l
ls apps/web/src/features/projects | wc -l
git grep -lE "features/projects|\.\./projects/" -- apps/web/src | grep -v "^apps/web/src/features/projects/" | wc -l
git checkout -- apps/web/next-env.d.ts
```

Expected: typecheck clean; write down each package's passing counts and the web `Test Files` and `Tests` (`B_web`; at `703fde72` web was 215 files and 1921 tests, and the other packages are whatever dev holds after S2a), the sad count (`B_sad`), the docs check failure count, the web build exit code (0) and `Middleware` (`M0`, 102 kB at `703fde72`). `.tmp/s1b/routes-baseline.txt` is the route table Tasks 6 and 9 compare against. The hashes print, in order: `b852b49688d8227aa833d42c8f8c1d95b92d06f2`, `98901bb25fbf66044a3090c4fb1147759362a19c`, `0891d9ba377b27b4e3ef69fae786cdf1d0e0f9f8`, `f8c22bf4b1f9c73615f3f2b338622d974b789a9b`, `a0f7b09221bc43ff5a690163748d6aebba4f8cc5`, `5c8533aab9161b62a467842531c1a59db1fde71e`, `d9dbfa6b970e4e659d51a5fc6f5d6293802717e9`, `e9efe6a8e7f991a7a032a3fe6d704a6ebc213fa2`, `6032e3b9a364703d41eebbe8e2469ad8f4be2d75`; the counts print `2596`, `51`, `49`, `10`, `78`, `21`. If any differs, stop and report: the anchors, scripts and counts below were taken at `703fde72`.

- [ ] **Step 3: Replace the S1 plan with this one and commit**

The controller has saved this plan as `docs/superpowers/plans/2026-10-12-modularization-s1b-projects-web.md`.

In `docs/index.md` section 1.6, delete the S1 plan row (and any F-plan row found in Step 1, with `git rm` of that file) and add as the last row of the table:

```markdown
| [S1b projects web plan](superpowers/plans/2026-10-12-modularization-s1b-projects-web.md) | 2026-10-12-modularization-s1b-projects-web.md | 2026-10-12 | S1b of the codebase modularization: source mutation request core, projects client, feature folder layout and public index, unreachable review views removed, oversized components split | In progress |
```

```bash
git rm docs/superpowers/plans/2026-10-10-modularization-s1-projects-core.md
git add docs/superpowers/plans/2026-10-12-modularization-s1b-projects-web.md docs/index.md
pnpm docs:check 2>&1 | tail -3
git commit -m "docs: add the S1b projects web plan and retire the S1 plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Step 2 baseline.

---

### Task 1: The source mutation request core

**Files:**
- Create: `apps/web/src/lib/api/core/source-mutation-request.ts`
- Test: `apps/web/src/lib/api/core/source-mutation-request.test.ts`
- Modify: `apps/web/src/lib/services/pathways-client.ts` (the private function and two imports)

**Interfaces:**
- Consumes: `sourceMutationTickets`, `SourceMutationContext`, `SourceMutationResult`, `SourceMutationRecoveryError` from `@/lib/services/source-mutation`; `PathwaysClientError`, `requestFoundation(path: string, init?: RequestInit, isCurrent?: () => boolean)` from `./request`.
- Produces: `requestSourceMutation<T>(path: string, method: 'POST' | 'PATCH', body: Record<string, unknown>, context: SourceMutationContext | undefined, parse: (value: unknown) => T): Promise<SourceMutationResult<T>>` from `@/lib/api/core/source-mutation-request`. It throws `PathwaysClientError` with code `unauthorized` when `context` is undefined, maps a `SourceMutationRecoveryError` to `PathwaysClientError` with code `invalid`, and rethrows anything else. S2b, S3b and S5b import it; they must not redefine it.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/api/core/source-mutation-request.test.ts` (it mocks only `requestFoundation`, so the real tickets run):

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestFoundation = vi.hoisted(() => vi.fn())

vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => null }))
vi.mock('./request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./request')>()),
  requestFoundation,
}))

import { sourceMutationTickets } from '@/lib/services/source-mutation'
import { PathwaysClientError } from './request'
import { requestSourceMutation } from './source-mutation-request'

const context = { principalKey: 'synthetic-owner-a', isCurrent: () => true }
const parse = vi.fn((value: unknown) => value as { id: string })

// Answers like the API: the acknowledgement echoes the request id the client sent.
const acknowledge = (replayed: boolean) => async (_path: string, init: RequestInit) => {
  const sent = JSON.parse(String(init.body)) as { clientMutationId: string }
  return replayed
    ? { requestId: sent.clientMutationId, committed: true, replayed: true }
    : {
        id: 'record-1',
        sourceAcknowledgement: {
          requestId: sent.clientMutationId,
          committed: true,
          replayed: false,
        },
      }
}

describe('requestSourceMutation', () => {
  beforeEach(() => {
    sourceMutationTickets.clear()
    requestFoundation.mockReset()
    parse.mockClear()
  })

  it('refuses to send without a mutation context', async () => {
    const result = requestSourceMutation('/projects/p-1', 'PATCH', { title: 'A' }, undefined, parse)
    await expect(result).rejects.toBeInstanceOf(PathwaysClientError)
    await expect(result).rejects.toMatchObject({
      code: 'unauthorized',
      message: 'Current mutation ownership is required.',
    })
    expect(requestFoundation).not.toHaveBeenCalled()
  })

  it('sends the body with its request id and ownership check, and returns the parsed record', async () => {
    requestFoundation.mockImplementation(acknowledge(false))
    const result = await requestSourceMutation(
      '/projects/p-2',
      'PATCH',
      { title: 'A' },
      context,
      parse,
    )
    expect(result).toEqual({ id: 'record-1' })
    expect(parse).toHaveBeenCalledTimes(1)
    const [path, init, isCurrent] = requestFoundation.mock.calls[0]
    expect(path).toBe('/projects/p-2')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toMatchObject({ title: 'A' })
    expect(JSON.parse(init.body).clientMutationId).toMatch(/^[0-9a-f-]{36}$/)
    expect(isCurrent).toBe(context.isCurrent)
  })

  it('returns the replay acknowledgement when the server reports a replay', async () => {
    requestFoundation.mockImplementation(acknowledge(true))
    const result = await requestSourceMutation('/projects/p-3', 'POST', { a: 1 }, context, parse)
    expect(result).toMatchObject({ committed: true, replayed: true })
    expect(parse).not.toHaveBeenCalled()
  })

  it('maps an unconfirmed outcome to an invalid client error', async () => {
    requestFoundation.mockResolvedValue({ id: 'record-1' })
    const result = requestSourceMutation('/projects/p-4', 'POST', { a: 1 }, context, parse)
    await expect(result).rejects.toBeInstanceOf(PathwaysClientError)
    await expect(result).rejects.toMatchObject({
      code: 'invalid',
      message: 'The save outcome could not be confirmed. Retry the unchanged input.',
    })
  })

  it('rethrows a transport failure unchanged', async () => {
    const failure = new Error('lost response')
    requestFoundation.mockRejectedValue(failure)
    await expect(
      requestSourceMutation('/projects/p-5', 'PATCH', { a: 1 }, context, parse),
    ).rejects.toBe(failure)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @pathways/web exec vitest run src/lib/api/core/source-mutation-request.test.ts`
Expected: FAIL with `Failed to resolve import "./source-mutation-request"`.

- [ ] **Step 3: Create the module**

Create `apps/web/src/lib/api/core/source-mutation-request.ts`. The body is the function now private in `pathways-client.ts`, with `sourceTickets` spelled as the `sourceMutationTickets` it aliases:

```ts
import {
  type SourceMutationContext,
  SourceMutationRecoveryError,
  type SourceMutationResult,
  sourceMutationTickets,
} from '@/lib/services/source-mutation'
import { PathwaysClientError, requestFoundation } from './request'

/** Sends an owned source mutation through the recovery tickets and maps a recovery fault to a client error. */
export async function requestSourceMutation<T>(
  path: string,
  method: 'POST' | 'PATCH',
  body: Record<string, unknown>,
  context: SourceMutationContext | undefined,
  parse: (value: unknown) => T,
): Promise<SourceMutationResult<T>> {
  if (!context)
    throw new PathwaysClientError('Current mutation ownership is required.', 'unauthorized')
  try {
    return await sourceMutationTickets.execute(
      context,
      `${method}:${path}`,
      body,
      (captured) =>
        requestFoundation(path, { method, body: JSON.stringify(captured) }, context.isCurrent),
      parse,
    )
  } catch (error) {
    if (error instanceof SourceMutationRecoveryError)
      throw new PathwaysClientError(error.message, 'invalid')
    throw error
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @pathways/web exec vitest run src/lib/api/core/source-mutation-request.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Point `pathways-client.ts` at the new module**

In `apps/web/src/lib/services/pathways-client.ts`:

1. In the `./source-mutation` import block, delete the line `  SourceMutationRecoveryError,` (the block keeps `type SourceMutationContext`, `type SourceMutationResult`, `ensureSourceInvalidationSubscription`, `sourceMutationTickets`).
2. Directly after the `@/lib/api/core/request` import block, add:

```ts
import { requestSourceMutation } from '@/lib/api/core/source-mutation-request'
```

3. Delete the private function that sits between `recoverSourceMutation` and `export type DuplicateProfile` (nine call sites keep using it by name):

```ts
async function requestSourceMutation<T>(
  path: string,
  method: 'POST' | 'PATCH',
  body: Record<string, unknown>,
  context: SourceMutationContext | undefined,
  parse: (value: unknown) => T,
): Promise<SourceMutationResult<T>> {
  if (!context)
    throw new PathwaysClientError('Current mutation ownership is required.', 'unauthorized')
  try {
    return await sourceTickets.execute(
      context,
      `${method}:${path}`,
      body,
      (captured) =>
        requestFoundation(path, { method, body: JSON.stringify(captured) }, context.isCurrent),
      parse,
    )
  } catch (error) {
    if (error instanceof SourceMutationRecoveryError)
      throw new PathwaysClientError(error.message, 'invalid')
    throw error
  }
}
```

Leave a blank line before `export type DuplicateProfile`. `PathwaysClientError`, `requestFoundation`, `SourceMutationContext`, `SourceMutationResult` and `sourceTickets` stay in use elsewhere in the file.

- [ ] **Step 6: Format, typecheck, test and commit**

```bash
pnpm exec biome check --write apps/web/src/lib/api/core apps/web/src/lib/services/pathways-client.ts
pnpm --filter @pathways/web exec tsc --noEmit
pnpm --filter @pathways/web exec vitest run src/lib
git checkout -- apps/web/next-env.d.ts
git add apps/web/src/lib/api/core apps/web/src/lib/services/pathways-client.ts
git commit -m "refactor(web): move requestSourceMutation to lib/api/core

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: typecheck clean, all `src/lib` tests pass; web = `B_web` files + 1 and tests + 5.

---

### Task 2: The projects client

**Files:**
- Create: `apps/web/src/lib/api/projects.ts`
- Test: `apps/web/src/lib/api/projects.test.ts`

**Interfaces:**
- Consumes: Task 1's `requestSourceMutation`; `requestFoundation`, `PathwaysClientError`; `ProjectResponse`, `ArchiveProjectResponse`, `StoredProjectStatus`, `ProjectMap`, `projectMapSchema`, `ProjectOverviewMetrics`, `projectOverviewMetricsSchema` from `@pathways/shared`; the web view types `CreateProjectInput`, `UpdateProjectInput`, `ProjectDetail`, `ProjectSummary`, `ProjectStatus` from `@/types/pathways`.
- Produces: `projectsClient` from `@/lib/api/projects`, with these methods (same names, parameters and results as the `PathwaysClient` methods Task 3 removes):
  - `getProjects(signal?: AbortSignal): Promise<ProjectSummary[]>`
  - `getProjectsForRole(_role: PathwaysRole): Promise<ProjectSummary[]>`
  - `getProject(id: string, signal?: AbortSignal): Promise<ProjectDetail>`
  - `createProject(input: CreateProjectInput): Promise<ProjectDetail>`
  - `updateProject(id: string, input: UpdateProjectInput, context?: SourceMutationContext): Promise<SourceMutationResult<ProjectDetail>>`
  - `archiveProject(id: string): Promise<ArchiveProjectResponse>`
  - `getProjectOverviewMetrics(projectId: string, signal?: AbortSignal): Promise<ProjectOverviewMetrics>`
  - `getProjectMap(signal: AbortSignal): Promise<ProjectMap>`

`pathwaysClient` keeps its own copies of the first seven until Task 3, so this task changes no caller.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/api/projects.test.ts`. It pins the mapper (status, health, period, defaults), the 100-row and non-list refusals, the stored-status mapping on create and update, the replay path, archive, the overview refusal and the strict map parse:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestFoundation = vi.hoisted(() => vi.fn())

vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => null }))
vi.mock('@/lib/api/core/request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/core/request')>()),
  requestFoundation,
}))

import { PathwaysClientError } from '@/lib/api/core/request'
import { sourceMutationTickets } from '@/lib/services/source-mutation'
import { projectsClient } from './projects'

const projectId = '73500000-0000-4000-8000-000000000001'
const context = { principalKey: 'synthetic-owner-a', isCurrent: () => true }
const row = {
  id: projectId,
  code: 'CRL-NS-2026',
  title: 'Community Resilience',
  description: 'Purpose',
  objectives: null,
  implementationArea: 'Metro Manila',
  implementingPartners: null,
  implementingPartnerRecords: [{ id: 'partner-1', name: 'Partner One', extra: 'dropped' }],
  sector: 'Health',
  targetBeneficiaries: 250,
  projectBudget: '1000.00',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  status: 'ONGOING',
  programId: null,
  programManagerId: null,
  programManager: null,
  projectManagerId: 'pm-1',
  projectManager: 'Ana Cruz',
  monitoringOfficerId: null,
  monitoringOfficer: null,
  projectOfficerIds: ['po-1'],
  projectOfficers: ['Ben Reyes'],
  team: [{ userId: 'pm-1', fullName: 'Ana Cruz', role: 'PROJECT_MANAGER' }],
  updatedAt: '2026-10-01T00:00:00.000Z',
}

describe('projectsClient', () => {
  beforeEach(() => {
    sourceMutationTickets.clear()
    requestFoundation.mockReset()
  })

  it.each([
    ['ONGOING', 'Active', 'On Track'],
    ['COMPLETED', 'Completed', 'On Track'],
    ['PLANNED', 'Planned', 'On Track'],
    ['ON_HOLD', 'Needs Attention', 'At Risk'],
    ['CANCELLED', 'Needs Attention', 'At Risk'],
  ])('maps the stored status %s to %s with health %s', async (stored, status, health) => {
    requestFoundation.mockResolvedValue({ ...row, status: stored })
    const project = await projectsClient.getProject(projectId)
    expect(project).toMatchObject({ status, health, storedStatus: stored })
  })

  it('maps a full project row to the detail view model', async () => {
    requestFoundation.mockResolvedValue(row)
    const project = await projectsClient.getProject(projectId)
    expect(project).toEqual({
      id: projectId,
      code: 'CRL-NS-2026',
      title: 'Community Resilience',
      description: 'Purpose',
      objectives: '',
      implementingPartners: null,
      implementingPartnerRecords: [{ id: 'partner-1', name: 'Partner One' }],
      projectBudget: '1000.00',
      area: 'Metro Manila',
      sector: 'Health',
      status: 'Active',
      storedStatus: 'ONGOING',
      health: 'On Track',
      period: '2026-01-01 to 2026-12-31',
      projectManager: 'Ana Cruz',
      programManager: 'Not assigned',
      programManagerId: null,
      projectManagerId: 'pm-1',
      team: [{ userId: 'pm-1', fullName: 'Ana Cruz', role: 'PROJECT_MANAGER' }],
      monitoringOfficer: 'Not assigned',
      monitoringOfficerId: null,
      projectOfficers: ['Ben Reyes'],
      projectOfficerIds: ['po-1'],
      targetBeneficiaries: 250,
      budgetCode: 'Not recorded',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      updatedAt: '2026-10-01T00:00:00.000Z',
      programId: null,
    })
  })

  it('fills the display defaults for a summary row and keeps an absent target undefined', async () => {
    requestFoundation.mockResolvedValue([
      { id: projectId, code: 'A-1', title: 'Summary only', status: 'PLANNED' },
    ])
    const [project] = await projectsClient.getProjects()
    expect(project).toMatchObject({
      description: '',
      area: 'Area not recorded',
      sector: 'Sector not recorded',
      period: 'Dates not recorded',
      projectManager: 'Not assigned',
      projectOfficers: [],
      targetBeneficiaries: undefined,
    })
  })

  it('reads the list with the abort signal and rejects a list over 100 rows or a non-list', async () => {
    const signal = new AbortController().signal
    requestFoundation.mockResolvedValue([])
    await projectsClient.getProjects(signal)
    expect(requestFoundation).toHaveBeenCalledWith('/projects', { signal })
    requestFoundation.mockResolvedValue(Array.from({ length: 101 }, () => row))
    await expect(projectsClient.getProjects()).rejects.toMatchObject({
      code: 'network',
      message: 'Invalid project response.',
    })
    requestFoundation.mockResolvedValue({ projects: [] })
    await expect(projectsClient.getProjects()).rejects.toBeInstanceOf(PathwaysClientError)
  })

  it('reads the same list for every role', async () => {
    requestFoundation.mockResolvedValue([row])
    await projectsClient.getProjectsForRole('Grant Manager')
    expect(requestFoundation).toHaveBeenCalledTimes(1)
    expect(requestFoundation).toHaveBeenCalledWith('/projects', { signal: undefined })
  })

  it('encodes the project id in the detail path', async () => {
    requestFoundation.mockResolvedValue(row)
    const signal = new AbortController().signal
    await projectsClient.getProject('a/b c', signal)
    expect(requestFoundation).toHaveBeenCalledWith('/projects/a%2Fb%20c', { signal })
  })

  it('creates with the stored status and the other fields unchanged', async () => {
    requestFoundation.mockResolvedValue(row)
    await projectsClient.createProject({
      title: 'New',
      status: 'Needs Attention',
      sector: 'Health',
    })
    expect(requestFoundation).toHaveBeenCalledWith('/projects', {
      method: 'POST',
      body: JSON.stringify({ title: 'New', status: 'ON_HOLD', sector: 'Health' }),
    })
  })

  it.each([
    ['Active', 'ONGOING'],
    ['Planned', 'PLANNED'],
    ['Completed', 'COMPLETED'],
    ['CANCELLED', 'CANCELLED'],
  ] as const)(
    'updates with status %s sent as %s through the source mutation',
    async (status, sent) => {
      requestFoundation.mockImplementation(async (_path: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { clientMutationId: string }
        return {
          ...row,
          sourceAcknowledgement: {
            requestId: body.clientMutationId,
            committed: true,
            replayed: false,
          },
        }
      })
      const result = await projectsClient.updateProject(
        projectId,
        { title: 'Edited', status, expectedUpdatedAt: row.updatedAt },
        context,
      )
      expect(result).toMatchObject({ id: projectId, status: 'Active' })
      const [path, init, isCurrent] = requestFoundation.mock.calls[0]
      expect(path).toBe(`/projects/${projectId}`)
      expect(init.method).toBe('PATCH')
      expect(JSON.parse(init.body)).toMatchObject({ title: 'Edited', status: sent })
      expect(isCurrent).toBe(context.isCurrent)
    },
  )

  it('refuses an update without a mutation context', async () => {
    await expect(
      projectsClient.updateProject(projectId, {
        title: 'Edited',
        status: 'Active',
        expectedUpdatedAt: row.updatedAt,
      }),
    ).rejects.toMatchObject({ code: 'unauthorized' })
    expect(requestFoundation).not.toHaveBeenCalled()
  })

  it('archives with a bodyless POST and returns the answer', async () => {
    requestFoundation.mockResolvedValue({ id: projectId, archivedAt: '2026-10-01T00:00:00.000Z' })
    await expect(projectsClient.archiveProject(projectId)).resolves.toEqual({
      id: projectId,
      archivedAt: '2026-10-01T00:00:00.000Z',
    })
    expect(requestFoundation).toHaveBeenCalledWith(`/projects/${projectId}/archive`, {
      method: 'POST',
    })
  })

  it('rejects an overview metrics answer that does not match the contract', async () => {
    requestFoundation.mockResolvedValue({ unexpected: true })
    await expect(projectsClient.getProjectOverviewMetrics(projectId)).rejects.toMatchObject({
      code: 'network',
      message: 'Invalid project overview response.',
    })
    expect(requestFoundation).toHaveBeenCalledWith(`/projects/${projectId}/overview-metrics`, {
      signal: undefined,
    })
  })

  it('parses the project map and rejects a payload that breaks the contract', async () => {
    const signal = new AbortController().signal
    const map = {
      contractVersion: 'analytics.project-map.v1',
      generatedAt: '2026-10-01T00:00:00.000Z',
      projects: [],
      unmappedCount: 0,
    }
    requestFoundation.mockResolvedValue(map)
    await expect(projectsClient.getProjectMap(signal)).resolves.toEqual(map)
    expect(requestFoundation).toHaveBeenCalledWith('/analytics/project-map', { signal })
    requestFoundation.mockResolvedValue({ ...map, extra: true })
    await expect(projectsClient.getProjectMap(signal)).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @pathways/web exec vitest run src/lib/api/projects.test.ts`
Expected: FAIL with `Failed to resolve import "./projects"`.

- [ ] **Step 3: Create the module**

Create `apps/web/src/lib/api/projects.ts`. The mapper, the status switch, the list parser and the method bodies are the ones in `pathways-client.ts` (`mapProject`, `apiProjectStatus`, `parseProjects`, the seven methods), with `ApiProject` replaced by `ProjectResponse` and the map fetcher moved in from `features/analytics/use-project-map.ts`:

```ts
import {
  type ArchiveProjectResponse,
  type ProjectMap,
  type ProjectOverviewMetrics,
  type ProjectResponse,
  type StoredProjectStatus,
  projectMapSchema,
  projectOverviewMetricsSchema,
} from '@pathways/shared'

import { PathwaysClientError, requestFoundation } from '@/lib/api/core/request'
import { requestSourceMutation } from '@/lib/api/core/source-mutation-request'
import type { SourceMutationContext, SourceMutationResult } from '@/lib/services/source-mutation'
import type {
  CreateProjectInput,
  ProjectDetail,
  ProjectStatus,
  ProjectSummary,
  UpdateProjectInput,
} from '@/types/pathways'
import type { PathwaysRole } from '@/types/pathways-role'

function apiProjectStatus(status: ProjectStatus | StoredProjectStatus): StoredProjectStatus {
  switch (status) {
    case 'Active':
      return 'ONGOING'
    case 'Needs Attention':
      return 'ON_HOLD'
    case 'Planned':
      return 'PLANNED'
    case 'Completed':
      return 'COMPLETED'
    default:
      return status
  }
}

function mapProject(project: ProjectResponse): ProjectDetail {
  const status: ProjectStatus =
    project.status === 'ONGOING'
      ? 'Active'
      : project.status === 'COMPLETED'
        ? 'Completed'
        : project.status === 'PLANNED'
          ? 'Planned'
          : 'Needs Attention'
  const period =
    [project.startDate, project.endDate].filter(Boolean).join(' to ') || 'Dates not recorded'
  return {
    id: project.id,
    code: project.code,
    title: project.title,
    description: project.description ?? '',
    objectives: project.objectives ?? '',
    implementingPartners: project.implementingPartners,
    implementingPartnerRecords: (project.implementingPartnerRecords ?? []).map(({ id, name }) => ({
      id,
      name,
    })),
    projectBudget: project.projectBudget,

    area: project.implementationArea ?? 'Area not recorded',
    sector: project.sector ?? 'Sector not recorded',
    status,
    storedStatus: project.status,
    health: status === 'Needs Attention' ? 'At Risk' : 'On Track',
    period,
    projectManager: project.projectManager ?? 'Not assigned',
    programManager: project.programManager ?? 'Not assigned',
    programManagerId: project.programManagerId,
    projectManagerId: project.projectManagerId,
    team: project.team,
    monitoringOfficer: project.monitoringOfficer ?? 'Not assigned',
    monitoringOfficerId: project.monitoringOfficerId,
    projectOfficers: project.projectOfficers ?? [],
    projectOfficerIds: project.projectOfficerIds ?? [],
    targetBeneficiaries: project.targetBeneficiaries ?? undefined,
    budgetCode: 'Not recorded',
    startDate: project.startDate,
    endDate: project.endDate,
    updatedAt: project.updatedAt,
    programId: project.programId,
  }
}

// Summary rows from a reader without projects.detail.read go through the same mapper.
function parseProjects(value: unknown) {
  if (!Array.isArray(value) || value.length > 100)
    throw new PathwaysClientError('Invalid project response.', 'network')
  return value.map((row) => mapProject(row as ProjectResponse))
}

export const projectsClient = {
  async getProjects(signal?: AbortSignal): Promise<ProjectSummary[]> {
    return requestFoundation('/projects', { signal }).then(parseProjects)
  },

  async getProjectsForRole(_role: PathwaysRole): Promise<ProjectSummary[]> {
    return projectsClient.getProjects()
  },

  async getProject(id: string, signal?: AbortSignal): Promise<ProjectDetail> {
    return mapProject(
      (await requestFoundation(`/projects/${encodeURIComponent(id)}`, {
        signal,
      })) as ProjectResponse,
    )
  },

  async createProject(input: CreateProjectInput): Promise<ProjectDetail> {
    const status = apiProjectStatus(input.status)
    return mapProject(
      (await requestFoundation('/projects', {
        method: 'POST',
        body: JSON.stringify({ ...input, status }),
      })) as ProjectResponse,
    )
  },

  async updateProject(
    id: string,
    input: UpdateProjectInput,
    context?: SourceMutationContext,
  ): Promise<SourceMutationResult<ProjectDetail>> {
    return requestSourceMutation(
      `/projects/${encodeURIComponent(id)}`,
      'PATCH',
      { ...input, status: apiProjectStatus(input.status) },
      context,
      (value) => mapProject(value as ProjectResponse),
    )
  },

  async archiveProject(id: string): Promise<ArchiveProjectResponse> {
    return (await requestFoundation(`/projects/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
    })) as ArchiveProjectResponse
  },

  async getProjectOverviewMetrics(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<ProjectOverviewMetrics> {
    const parsed = projectOverviewMetricsSchema.safeParse(
      await requestFoundation(`/projects/${encodeURIComponent(projectId)}/overview-metrics`, {
        signal,
      }),
    )
    if (!parsed.success)
      throw new PathwaysClientError('Invalid project overview response.', 'network')
    return parsed.data
  },

  async getProjectMap(signal: AbortSignal): Promise<ProjectMap> {
    return projectMapSchema.parse(await requestFoundation('/analytics/project-map', { signal }))
  },
}
```

- [ ] **Step 4: Run the test and typecheck**

```bash
pnpm exec biome check --write apps/web/src/lib/api
pnpm --filter @pathways/web exec vitest run src/lib/api/projects.test.ts
pnpm --filter @pathways/web exec tsc --noEmit
```

Expected: PASS, 19 tests; typecheck clean (`ProjectResponse` is assignable to what `mapProject` reads, including the optional `startDate`).

- [ ] **Step 5: Commit**

```bash
git checkout -- apps/web/next-env.d.ts
git add apps/web/src/lib/api/projects.ts apps/web/src/lib/api/projects.test.ts
git commit -m "feat(web): add the projects client typed from the project response contracts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: web = `B_web` files + 2 and tests + 24 (1945 tests at `703fde72`).

---

### Task 3: Move the callers, mocks, map fetcher and status type to the projects client

**Files:**
- Create (gitignored): `.tmp/s1b/trim-imports.mjs`, `move-client-calls.mjs`, `remove-project-methods.mjs`, `split-client-mocks.mjs`, `mock-scan.mjs`
- Modify: `apps/web/src/lib/services/pathways-client.ts`; the 22 screens and hooks and 2 client tests that call a project method (`move-client-calls.mjs` prints them); `apps/web/src/features/analytics/use-project-map.ts`; `apps/web/src/types/pathways.ts`; 26 test files with a pathways-client mock factory; `apps/web/src/features/projects/project-detail-view.test.tsx` by hand

**Interfaces:**
- Consumes: Task 2's `projectsClient`.
- Produces: no project method on `pathwaysClient`; every caller and mock uses `projectsClient`; `useProjectMap` reads through `projectsClient.getProjectMap`; `StoredProjectStatus` is the shared type.

- [ ] **Step 1: Create the scripts**

Create each file with the Write tool.

`.tmp/s1b/trim-imports.mjs` (drops named imports that no longer appear in the file body and prints them; also used by Tasks 4 and 7):

```js
// Drops named imports that no longer appear in the file body and prints their names.
import { readFileSync, writeFileSync } from 'node:fs'

const importBlock = /import (type )?\{([^}]*)\} from ('[^']+')\n/g
for (const file of process.argv.slice(2)) {
  let text = readFileSync(file, 'utf8')
  const body = text.replace(importBlock, '')
  const removed = []
  text = text.replace(importBlock, (whole, typeOnly, names, from) => {
    const kept = names
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
      .filter((name) => {
        const local = name.replace(/^type /, '').split(' as ').at(-1)
        const used = new RegExp(`\\b${local}\\b`).test(body)
        if (!used) removed.push(local)
        return used
      })
    if (kept.length === names.split(',').filter((name) => name.trim()).length) return whole
    return kept.length ? `import ${typeOnly ?? ''}{ ${kept.join(', ')} } from ${from}\n` : ''
  })
  writeFileSync(file, text)
  console.log(`${file}: removed ${removed.join(', ') || 'nothing'}`)
}
```

`.tmp/s1b/move-client-calls.mjs` (rewrites `pathwaysClient.<project method>` to `projectsClient`, adds the new import before the pathways-client import and drops `pathwaysClient` from that import when nothing else uses it):

```js
// Rewrites pathwaysClient.<project method> calls to projectsClient and adds or trims the imports.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const methods = [
  'getProjects',
  'getProjectsForRole',
  'getProject',
  'createProject',
  'updateProject',
  'archiveProject',
  'getProjectOverviewMetrics',
]
const skip = new Set(['lib/services/pathways-client.ts', 'lib/api/projects.ts'])
const web = path.resolve('apps/web/src')
const call = new RegExp(`\\bpathwaysClient(\\s*)\\.(${methods.join('|')})\\b`, 'g')
const decl =
  /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'(?:@\/lib\/services\/pathways-client|\.\/pathways-client)'\n/
const newImport = "import { projectsClient } from '@/lib/api/projects'\n"

// TypeScript files under a folder.
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })

let files = 0
let calls = 0
for (const file of walk(web)) {
  const rel = path.relative(web, file).split(path.sep).join('/')
  if (skip.has(rel)) continue
  let text = readFileSync(file, 'utf8')
  let count = 0
  text = text.replace(call, (_whole, space, method) => {
    count++
    return `projectsClient${space}.${method}`
  })
  if (!count) continue
  const match = decl.exec(text)
  if (!match || !/\bpathwaysClient\b/.test(match[1])) {
    console.log(`${rel}: manual (no pathwaysClient import), ${count} calls`)
    continue
  }
  const rest = text.replace(match[0], '')
  const stillUsed = /\bpathwaysClient\b(?!\s*:)/.test(rest)
  let replacement = match[0]
  if (!stillUsed) {
    const names = match[1]
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name && name !== 'pathwaysClient')
    replacement = names.length ? match[0].replace(/\{[^}]*\}/, `{ ${names.join(', ')} }`) : ''
  }
  text = text.replace(match[0], newImport + replacement)
  writeFileSync(file, text)
  files++
  calls += count
  console.log(`${rel}: ${count}`)
}
console.log(`files ${files}, calls ${calls}`)
```

`.tmp/s1b/remove-project-methods.mjs` (deletes the interface entries, class methods, `ApiProject` with `apiProjectStatus`, `mapProject` and `parseProjects` by anchors; each anchor throws if missing):

```js
// Deletes the project methods, mapper and wire types from pathways-client.ts.
import { readFileSync, writeFileSync } from 'node:fs'

const file = 'apps/web/src/lib/services/pathways-client.ts'
let text = readFileSync(file, 'utf8')

// Removes the text from the start anchor up to, not including, the end anchor.
function cut(start, end) {
  const from = text.indexOf(start)
  if (from < 0) throw new Error(`missing start: ${start}`)
  const to = text.indexOf(end, from + start.length)
  if (to < 0) throw new Error(`missing end: ${end}`)
  text = text.slice(0, from) + text.slice(to)
}

cut(
  '  getProjects(signal?: AbortSignal): Promise<ProjectSummary[]>\n',
  '  getActivityContext(\n    projectId: string,\n    signal?: AbortSignal,\n  ): Promise<Pick<',
)
cut(
  '  getProjectOverviewMetrics(\n    projectId: string,\n    signal?: AbortSignal,\n  ): Promise<ProjectOverviewMetrics>\n',
  '  createActivity(\n    input: CreateActivityInput,',
)
cut(
  '  async getProjects(signal?: AbortSignal): Promise<ProjectSummary[]> {',
  '  async getActivityContext(',
)
cut(
  '\n  // Project Overview metrics (feature/project-data-loading).\n  async getProjectOverviewMetrics(',
  '\n  async createActivity(',
)
cut('interface ApiProject {', 'interface ApiUser {')
cut('function mapProject(project: ApiProject): ProjectDetail {', '// Whole years from a YYYY-MM-DD birth date')
cut('function parseProjects(value: unknown) {', 'const activityResponseKeys = [')
writeFileSync(file, text)
```

`.tmp/s1b/split-client-mocks.mjs` (gives every test file that mocks pathways-client the matching `vi.mock('@/lib/api/projects', ...)`):

```js
// Gives every test that mocks pathways-client a matching vi.mock of lib/api/projects for the project methods.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const names = [
  'getProjects',
  'getProjectsForRole',
  'getProject',
  'createProject',
  'updateProject',
  'archiveProject',
  'getProjectOverviewMetrics',
]
const web = path.resolve('apps/web/src')
const call = /vi\.mock\(\s*(['"])@\/lib\/services\/pathways-client\1\s*,\s*/g
const mentions = new RegExp(`\\b(${names.join('|')})\\b`)

// TypeScript files under a folder.
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })

// Index just past the bracket that closes the one at start, skipping strings and comments.
function close(text, start) {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    const char = text[i]
    if (char === '/' && text[i + 1] === '/') i = text.indexOf('\n', i)
    else if (char === '/' && text[i + 1] === '*') i = text.indexOf('*/', i) + 1
    else if (char === "'" || char === '"' || char === '`') {
      for (i++; text[i] !== char; i++) if (text[i] === '\\') i++
    } else if ('({['.includes(char)) depth++
    else if (')}]'.includes(char) && --depth === 0) return i + 1
  }
  throw new Error('Unbalanced brackets.')
}

// Top-level comma-separated parts of an object literal body, raw.
function parts(body) {
  const result = []
  let depth = 0
  let start = 0
  for (let i = 0; i < body.length; i++) {
    const char = body[i]
    if (char === '/' && body[i + 1] === '/') i = body.indexOf('\n', i)
    else if (char === '/' && body[i + 1] === '*') i = body.indexOf('*/', i) + 1
    else if (char === "'" || char === '"' || char === '`') {
      for (i++; body[i] !== char; i++) if (body[i] === '\\') i++
    } else if ('({['.includes(char)) depth++
    else if (')}]'.includes(char)) depth--
    else if (char === ',' && depth === 0) {
      result.push(body.slice(start, i))
      start = i + 1
    }
  }
  result.push(body.slice(start))
  return result.filter((part) => part.trim() !== '')
}

const key = (part) =>
  /^\s*(?:\/\/[^\n]*\n\s*)*([A-Za-z_$][\w$]*)\s*(?::|$)/.exec(part)?.[1] ?? null

const mock = (value) => `vi.mock('@/lib/api/projects', () => ({ projectsClient: ${value} }))`
let changed = 0
for (const file of walk(web)) {
  let text = readFileSync(file, 'utf8')
  const rel = path.relative(process.cwd(), file).split(path.sep).join('/')
  const edits = []
  for (const match of text.matchAll(call)) {
    const open = text.indexOf('(', match.index)
    const end = close(text, open)
    const factory = text.slice(match.index + match[0].length, end - 1)
    if (!mentions.test(text)) continue
    const line = text.slice(0, match.index).split('\n').length
    const arrow = /^\(\)\s*=>\s*\(\{/.exec(factory)
    if (!arrow) {
      console.log(`${rel}:${line}: manual`)
      continue
    }
    const objectOpen = factory.indexOf('{', arrow.index)
    const outer = parts(factory.slice(objectOpen + 1, close(factory, objectOpen) - 1))
    const index = outer.findIndex((part) => key(part) === 'pathwaysClient')
    if (index < 0) {
      console.log(`${rel}:${line}: manual`)
      continue
    }
    const value = outer[index].slice(outer[index].indexOf(':') + 1).trim()
    if (/^[A-Za-z_$][\w$]*$/.test(value)) {
      edits.push({ start: end, end, replacement: `\n${mock(value)}` })
      console.log(`${rel}:${line}: added (object ${value})`)
    } else if (value.startsWith('{')) {
      const inner = parts(value.slice(1, close(value, 0) - 1))
      const take = inner.filter((part) => names.includes(key(part)))
      const keep = inner.filter((part) => !names.includes(key(part)))
      if (!take.length) continue
      const rest = outer.filter((_part, i) => i !== index)
      const kept = keep.length ? [`pathwaysClient: { ${keep.map((p) => p.trim()).join(', ')} }`, ...rest] : rest
      const original = kept.length
        ? `vi.mock(${match[1]}@/lib/services/pathways-client${match[1]}, () => ({ ${kept.map((p) => p.trim()).join(', ')} }))\n`
        : ''
      edits.push({
        start: match.index,
        end,
        replacement: `${original}${mock(`{ ${take.map((p) => p.trim()).join(', ')} }`)}`,
      })
      console.log(`${rel}:${line}: ${keep.length ? 'split' : 'renamed'} (${take.map(key).join(', ')})`)
    } else console.log(`${rel}:${line}: manual`)
  }
  if (!edits.length) continue
  for (const edit of edits.reverse())
    text = text.slice(0, edit.start) + edit.replacement + text.slice(edit.end)
  writeFileSync(file, text)
  changed++
}
console.log(`files ${changed}`)
```

`.tmp/s1b/mock-scan.mjs` (counts `vi.mock` factories for one web module and lists those whose text names a given export):

```js
// Counts vi.mock factories for one web module and lists those whose factory text names any given export.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const [from, ...names] = process.argv.slice(2)
const web = path.resolve('apps/web/src')
const call = /vi\.(?:mock|doMock)\(\s*(['"])([^'"]+)\1/g

// TypeScript files under a folder.
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })

// The web-relative module a specifier names, or null when it points outside apps/web/src.
const target = (file, spec) => {
  if (spec.startsWith('@/')) return spec.slice(2)
  if (!spec.startsWith('.')) return null
  const relative = path.relative(web, path.resolve(path.dirname(file), spec))
  return relative.startsWith('..') ? null : relative.split(path.sep).join('/')
}

// The factory text from the opening parenthesis of the call to its matching close.
const factory = (text, start) => {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '(') depth++
    else if (text[i] === ')' && --depth === 0) return text.slice(start, i + 1)
  }
  return text.slice(start)
}

let total = 0
let naming = 0
for (const file of walk(web)) {
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(call)) {
    if (target(file, match[2]) !== from) continue
    total++
    const body = factory(text, text.indexOf('(', match.index))
    const hits = names.filter((name) => new RegExp(`\\b${name}\\b`).test(body))
    if (!hits.length) continue
    naming++
    const line = text.slice(0, match.index).split('\n').length
    console.log(`${path.relative(process.cwd(), file).split(path.sep).join('/')}:${line} ${hits.join(', ')}`)
  }
}
console.log(`factories ${total}, naming ${naming}`)
```

- [ ] **Step 2: Scan the mocks before the change**

```bash
node .tmp/s1b/mock-scan.mjs lib/services/pathways-client getProjects getProjectsForRole getProject createProject updateProject archiveProject getProjectOverviewMetrics | tail -1
```

Expected: `factories 49, naming 11` (eleven inline factories name a project method; the others pass a shared object).

- [ ] **Step 3: Repoint the call sites**

```bash
node .tmp/s1b/move-client-calls.mjs
```

Expected: 24 lines, one per file (22 screens and hooks plus `pathways-client.project-data.test.ts` with 2 calls and `pathways-client.test.ts` with 12), no `manual` line, and `files 24, calls 43`. `project-setup-form.tsx` shows 5, `project-team-editor-dialog.tsx` 3 and `use-project-reads.ts` 2.

- [ ] **Step 4: Move the map fetcher and the status type**

In `apps/web/src/features/analytics/use-project-map.ts`, replace the first import and the fetcher:

```ts
import { type ProjectMap, projectMapSchema } from '@pathways/shared'
```
with
```ts
import type { ProjectMap } from '@pathways/shared'
```

```ts
import { requestFoundation } from '@/lib/api/core/request'
```
with
```ts
import { projectsClient } from '@/lib/api/projects'
```

```ts
const readProjectMap = async (signal: AbortSignal): Promise<ProjectMap> =>
  projectMapSchema.parse(await requestFoundation('/analytics/project-map', { signal }))
```
with
```ts
const readProjectMap = (signal: AbortSignal): Promise<ProjectMap> =>
  projectsClient.getProjectMap(signal)
```

In `apps/web/src/types/pathways.ts`, add `StoredProjectStatus,` to the `import type { ... } from '@pathways/shared'` list at the top (after `SadddDashboard,`) and delete the line:

```ts
export type StoredProjectStatus = 'PLANNED' | 'ONGOING' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED'
```

- [ ] **Step 5: Remove the project code from the client**

```bash
node .tmp/s1b/remove-project-methods.mjs
node .tmp/s1b/trim-imports.mjs apps/web/src/lib/services/pathways-client.ts
```

Expected: the second command prints `removed CreateProjectInput, ProjectDetail, ProjectStatus, ProjectSummary, ProjectTeamMember, UpdateProjectInput, ProjectOverviewMetrics, projectOverviewMetricsSchema`. `wc -l` of the file drops from 2596 to about 2390.

- [ ] **Step 6: Repoint the mocks**

```bash
node .tmp/s1b/split-client-mocks.mjs
```

Expected: 26 lines and `files 25`: 14 `added (object ...)`, 6 `renamed (...)`, 5 `split (...)`, and one `apps/web/src/features/projects/project-detail-view.test.tsx:34: manual`. In that file replace

```ts
vi.mock('@/lib/services/pathways-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/pathways-client')>()),
  pathwaysClient: api,
}))
```

with

```ts
vi.mock('@/lib/api/projects', () => ({ projectsClient: api }))
```

- [ ] **Step 7: Verify**

```bash
pnpm exec biome check --write apps/web/src
pnpm --filter @pathways/web exec tsc --noEmit
node .tmp/s1b/mock-scan.mjs lib/services/pathways-client getProjects getProjectsForRole getProject createProject updateProject archiveProject getProjectOverviewMetrics | tail -1
git grep -nE "pathwaysClient\s*\.(getProjects|getProjectsForRole|getProject|createProject|updateProject|archiveProject|getProjectOverviewMetrics)\b" -- apps/web/src
git grep -c "vi.mock('@/lib/api/projects'" -- apps/web/src | wc -l
pnpm --filter @pathways/web test 2>&1 | grep -E "Test Files|Tests "
```

Expected: typecheck clean; `factories 42, naming 0`; the grep prints nothing; `26`; web = `B_web` files + 2 and tests + 24 (217 files, 1945 tests at `703fde72`).

- [ ] **Step 8: Commit**

```bash
git checkout -- apps/web/next-env.d.ts
git add apps/web/src
git commit -m "refactor(web): call the projects client and drop the project methods from pathways-client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Remove the review views no route renders

**Files:**
- Create (gitignored): `.tmp/s1b/prune-review-views.mjs`, `.tmp/s1b/prune-review-test.mjs`
- Modify: `apps/web/src/features/projects/project-review-workspace.tsx`, `apps/web/src/features/projects/project-review-workspace.test.tsx`
- Delete: `apps/web/src/features/projects/project-review-utils.ts`, `apps/web/src/features/projects/project-review-utils.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ProjectPhaseFiveWorkspace` (renamed in Task 5) takes `view: 'evidence' | 'monitor-evaluate' | 'budget'`; the evidence loader is the file-private `EvidenceWorkspace({ projectId })`. The `indicators` and `transparency` views, the Add Indicator dialog and `project-review-utils.ts` no longer exist.

- [ ] **Step 1: Prove the views are unreachable**

```bash
git grep -n "ProjectPhaseFiveWorkspace" -- apps/web/src/app
for n in recommendationOutcomeSchema logExpenseSchema calculateExpenseTotal calculateRemainingBudget addIndicatorSchema; do echo "$n: $(git grep -lw $n -- apps/web/src | tr '\n' ' ')"; done
```

Expected: three pages render the workspace, with `view="budget"`, `view="evidence"` and `view="monitor-evaluate"`; the first four names appear only in `project-review-utils.ts` and its test, and `addIndicatorSchema` also in `project-review-workspace.tsx` (the Add Indicator handler).

- [ ] **Step 2: Create the scripts**

`.tmp/s1b/prune-review-views.mjs` (narrows the view type, unwraps the evidence loader, and deletes the indicators branch, the dialog, `LabeledInput` and `IndicatorsView`; every anchor throws if missing):

```js
// Removes the indicators and transparency views of the review workspace, which no route renders.
import { readFileSync, writeFileSync } from 'node:fs'

const file = 'apps/web/src/features/projects/project-review-workspace.tsx'
let text = readFileSync(file, 'utf8')

// Removes the text from the start anchor up to, not including, the end anchor.
function cut(start, end) {
  const from = text.indexOf(start)
  if (from < 0) throw new Error(`missing start: ${start}`)
  const to = text.indexOf(end, from + start.length)
  if (to < 0) throw new Error(`missing end: ${end}`)
  text = text.slice(0, from) + text.slice(to)
}
function replace(from, to) {
  if (!text.includes(from)) throw new Error(`missing: ${from}`)
  text = text.replace(from, to)
}

cut('type PhaseFiveWorkspaceView =', 'type ScopedReport =')
replace('type ScopedReport =', "type ProjectReviewView = 'evidence' | 'monitor-evaluate' | 'budget'\n\ntype ScopedReport =")
replace('}: { projectId: string; view: PhaseFiveWorkspaceView }) => {', '}: { projectId: string; view: ProjectReviewView }) => {')
replace("  if (view === 'transparency') return <PublicationQueueWorkspace initialProjectId={projectId} />\n", '')
replace('return <LegacyProjectWorkspace projectId={projectId} view={view} />', 'return <EvidenceWorkspace projectId={projectId} />')
replace(
  'const LegacyProjectWorkspace = ({\n  projectId,\n  view,\n}: {\n  projectId: string\n  view: LegacyWorkspaceView\n}) => {',
  'const EvidenceWorkspace = ({ projectId }: { projectId: string }) => {',
)
replace('  const [indicators, setIndicators] = useState<ProjectIndicator[]>([])\n', '')
replace(
  '  const [addIndicatorOpen, setAddIndicatorOpen] = useState(false)\n  const [formState, setFormState] = useState<Record<string, string>>({})\n',
  '',
)
replace('    setIndicators([])\n', '')
replace("        if (view === 'evidence') {\n", '')
cut("        if (view === 'indicators') {\n", '        await Promise.all(requests)')
// The evidence block lost its opening line, so its closing brace goes too.
replace('            requests.push(optional(\'Report records\', coreDataClient.reports(projectId), setReports))\n          }\n        }\n', "            requests.push(optional('Report records', coreDataClient.reports(projectId), setReports))\n          }\n")
replace('[profile, projectId, role, view]', '[profile, projectId, role]')
cut('  const canAddIndicator =', '  if (loading) {')
replace("      {view === 'evidence' ? (\n        <EvidenceView", '      <EvidenceView')
replace('          reports={reports}\n        />\n      ) : null}\n', '          reports={reports}\n        />\n')
cut("      {view === 'indicators' ? (", '    </>\n  )\n}\n\nconst LabeledInput')
cut('const LabeledInput = (', 'function applyEvidence(')
text = text.slice(0, text.indexOf('const IndicatorsView = ('))
writeFileSync(file, text)
```

`.tmp/s1b/prune-review-test.mjs` (drops the two test cases and the mocks that only covered the removed views):

```js
// Drops the review workspace test cases and mocks that only covered the removed indicators and transparency views.
import { readFileSync, writeFileSync } from 'node:fs'

const file = 'apps/web/src/features/projects/project-review-workspace.test.tsx'
let text = readFileSync(file, 'utf8')

// Removes the text from the start anchor up to, not including, the end anchor.
function cut(start, end) {
  const from = text.indexOf(start)
  if (from < 0) throw new Error(`missing start: ${start}`)
  const to = text.indexOf(end, from + start.length)
  if (to < 0) throw new Error(`missing end: ${end}`)
  text = text.slice(0, from) + text.slice(to)
}
function remove(piece) {
  if (!text.includes(piece)) throw new Error(`missing: ${piece}`)
  text = text.replace(piece, '')
}

remove('  getProjectIndicators: vi.fn(),\n')
remove('    api.getProjectIndicators.mockResolvedValue([])\n')
cut("vi.mock('@/features/public/publication-queue-workspace'", "vi.mock('@/hooks/use-current-role'")
remove(
  '    render(<ProjectPhaseFiveWorkspace projectId={projectId} view="transparency" />)\n    expect(screen.getByText(`Publication for ${projectId}`)).toBeTruthy()\n',
)
cut("  it.each(['indicators'] as const)(", '  const proofId =')
writeFileSync(file, text)
```

- [ ] **Step 3: Prune the component and let the compiler find the test fallout**

```bash
node .tmp/s1b/prune-review-views.mjs
node .tmp/s1b/trim-imports.mjs apps/web/src/features/projects/project-review-workspace.tsx
git rm apps/web/src/features/projects/project-review-utils.ts apps/web/src/features/projects/project-review-utils.test.ts
pnpm exec biome check --write apps/web/src/features/projects/project-review-workspace.tsx
pnpm --filter @pathways/web exec tsc --noEmit
```

Expected: the trim prints `removed PublicationQueueWorkspace, formatMetricCell, Plus, Save, ReactNode, toast, DialogShell, StatusBadge, Dialog, DialogFooter, Input, Label, formatCappedPercent, ProjectIndicator, addIndicatorSchema`; typecheck fails with exactly two errors, both in `project-review-workspace.test.tsx`: `Type '"transparency"' is not assignable to type 'ProjectReviewView'` and the same for `"indicators"`. That is the proof for Review Focus 5: no page can pass either value.

- [ ] **Step 4: Prune the test and verify**

```bash
node .tmp/s1b/prune-review-test.mjs
pnpm exec biome check --write apps/web/src/features/projects
pnpm --filter @pathways/web exec tsc --noEmit
pnpm --filter @pathways/web exec vitest run src/features/projects
wc -l apps/web/src/features/projects/project-review-workspace.tsx
```

Expected: typecheck clean; the projects feature tests pass (34 files, 350 tests at `703fde72`); the workspace is 412 lines (was 716).

- [ ] **Step 5: Commit**

```bash
git checkout -- apps/web/next-env.d.ts
git add -A apps/web/src/features/projects
git commit -m "refactor(web): remove the review workspace views no route renders

The indicators and transparency views, the Add Indicator dialog and project-review-utils were unreachable.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: web = `B_web` files + 1 and tests + 19 (216 files, 1940 tests at `703fde72`).

---

### Task 5: Move the project files into the feature layout

**Files:**
- Create (gitignored): `.tmp/s1b/layout-map.json`, `.tmp/s1b/move-modules.mjs`
- Move: 25 files of `apps/web/src/features/projects/` (the map below)
- Modify: every importer and `vi.mock` of a moved file (59 specifiers), `apps/web/src/features/ui-copy-cleanup.contract.test.ts` (14 quoted paths), 3 route pages and the workspace test for the component rename

**Interfaces:**
- Consumes: nothing new.
- Produces: the layout of ruling 8 with these exact new paths: `features/projects/components/{option-select,project-archive-dialog,project-detail-view,project-directory,project-overview-metrics,project-preview-dialog,project-review-workspace,project-setup-form,project-workspace-frame,project-workspace-header,source-mutation-recovery}.tsx` (each with its test where it has one), `features/projects/team/{project-team-editor-dialog,project-team-selectors}.tsx` with tests, `features/projects/projects.utils.ts`, `projects.reads.ts`, `project-form.utils.ts` and `project-form.utils.test.ts`. `ProjectReviewWorkspace` replaces `ProjectPhaseFiveWorkspace`. Exports and behavior are unchanged.

- [ ] **Step 1: Create the map and the script**

`.tmp/s1b/layout-map.json`:

```json
{
  "features/projects/option-select.tsx": "features/projects/components/option-select.tsx",
  "features/projects/project-archive-dialog.tsx": "features/projects/components/project-archive-dialog.tsx",
  "features/projects/project-detail-view.tsx": "features/projects/components/project-detail-view.tsx",
  "features/projects/project-detail-view.test.tsx": "features/projects/components/project-detail-view.test.tsx",
  "features/projects/project-directory.tsx": "features/projects/components/project-directory.tsx",
  "features/projects/project-directory.test.tsx": "features/projects/components/project-directory.test.tsx",
  "features/projects/project-overview-metrics.tsx": "features/projects/components/project-overview-metrics.tsx",
  "features/projects/project-preview-dialog.tsx": "features/projects/components/project-preview-dialog.tsx",
  "features/projects/project-review-workspace.tsx": "features/projects/components/project-review-workspace.tsx",
  "features/projects/project-review-workspace.test.tsx": "features/projects/components/project-review-workspace.test.tsx",
  "features/projects/project-setup-form.tsx": "features/projects/components/project-setup-form.tsx",
  "features/projects/project-setup-form.test.tsx": "features/projects/components/project-setup-form.test.tsx",
  "features/projects/project-workspace-frame.tsx": "features/projects/components/project-workspace-frame.tsx",
  "features/projects/project-workspace-header.tsx": "features/projects/components/project-workspace-header.tsx",
  "features/projects/project-workspace-header.test.tsx": "features/projects/components/project-workspace-header.test.tsx",
  "features/projects/source-mutation-recovery.tsx": "features/projects/components/source-mutation-recovery.tsx",
  "features/projects/source-mutation-recovery.test.tsx": "features/projects/components/source-mutation-recovery.test.tsx",
  "features/projects/project-team-editor-dialog.tsx": "features/projects/team/project-team-editor-dialog.tsx",
  "features/projects/project-team-editor-dialog.test.tsx": "features/projects/team/project-team-editor-dialog.test.tsx",
  "features/projects/project-team-selectors.tsx": "features/projects/team/project-team-selectors.tsx",
  "features/projects/project-team-selectors.test.ts": "features/projects/team/project-team-selectors.test.ts",
  "features/projects/project-utils.ts": "features/projects/projects.utils.ts",
  "features/projects/use-project-reads.ts": "features/projects/projects.reads.ts",
  "features/projects/project-form-validation.ts": "features/projects/project-form.utils.ts",
  "features/projects/project-form-validation.test.ts": "features/projects/project-form.utils.test.ts"
}
```

`.tmp/s1b/move-modules.mjs` (runs `git mv` for each entry, then rewrites every import, re-export, dynamic import and `vi.mock` specifier that names a moved module, resolving specifiers against the old location of the file that holds them and keeping the alias or relative form; it also rewrites the quoted paths the contract test reads):

```js
// Runs git mv for every entry of a web move map, then rewrites the specifiers that named a moved module or sit in a moved file.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [mapFile] = process.argv.slice(2)
const web = path.resolve('apps/web/src')
const strip = (file) => file.replace(/\.tsx?$/, '')
const forward = new Map(
  Object.entries(JSON.parse(readFileSync(mapFile, 'utf8'))).map(([from, to]) => [strip(from), strip(to)]),
)
const reverse = new Map([...forward].map(([from, to]) => [to, from]))
const pattern =
  /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|vi\.(?:mock|doMock|importActual)(?:<[^>]*>)?\(\s*)(['"])([^'"]+)\2/g

// TypeScript files under a folder.
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })

for (const [from, to] of Object.entries(JSON.parse(readFileSync(mapFile, 'utf8')))) {
  mkdirSync(path.dirname(path.join(web, to)), { recursive: true })
  execFileSync('git', ['mv', path.join('apps/web/src', from), path.join('apps/web/src', to)])
}

// The web-relative module a specifier names from the old location of its file, or null for a package.
const target = (oldFile, spec) => {
  if (spec.startsWith('@/')) return spec.slice(2)
  if (!spec.startsWith('.')) return null
  const relative = path.relative(web, path.resolve(path.dirname(path.join(web, oldFile)), spec))
  return relative.startsWith('..') ? null : relative.split(path.sep).join('/')
}

// The specifier for a module from a file, keeping the form (alias or relative) the original used.
const specifier = (newFile, spec, module) => {
  if (spec.startsWith('@/')) return `@/${module}`
  const relative = path.relative(path.dirname(path.join(web, newFile)), path.join(web, module))
  const posix = relative.split(path.sep).join('/')
  return posix.startsWith('.') ? posix : `./${posix}`
}

let total = 0
for (const file of walk(web)) {
  const newFile = strip(path.relative(web, file).split(path.sep).join('/'))
  const oldFile = reverse.get(newFile) ?? newFile
  let count = 0
  const text = readFileSync(file, 'utf8').replace(pattern, (whole, lead, quote, spec) => {
    const module = target(oldFile, spec)
    if (module === null) return whole
    const moved = forward.get(module) ?? module
    if (moved === module && oldFile === newFile) return whole
    const next = specifier(newFile, spec, moved)
    if (next === spec) return whole
    count++
    return `${lead}${quote}${next}${quote}`
  })
  if (!count) continue
  writeFileSync(file, text)
  total += count
  console.log(`${newFile}: ${count}`)
}
// Source-reading contract tests name files by quoted path, so those strings follow the move too.
const contract = path.join(web, 'features/ui-copy-cleanup.contract.test.ts')
let named = 0
let contractText = readFileSync(contract, 'utf8')
for (const [from, to] of Object.entries(JSON.parse(readFileSync(mapFile, 'utf8')))) {
  const quoted = `'${from}'`
  named += contractText.split(quoted).length - 1
  contractText = contractText.replaceAll(quoted, `'${to}'`)
}
writeFileSync(contract, contractText)
console.log(`moved ${forward.size} files, rewrote ${total} specifiers and ${named} contract paths`)
```

- [ ] **Step 2: Run the move**

```bash
git status --short
node .tmp/s1b/move-modules.mjs .tmp/s1b/layout-map.json
```

Expected: a clean status first; then one line per rewritten file and `moved 25 files, rewrote 59 specifiers and 14 contract paths`. The importers outside the feature that change are the 8 route pages and layout of the project routes, `analytics-dashboard.tsx`, `project-map-card.tsx`, `monitoring-reach-metrics.ts`, `pinned-charts.tsx` and `project-metrics-reads.tsx` with its test; files inside the feature that change include the activity and indicator tabs that import `use-project-reads`, `source-mutation-recovery` and `option-select`.

- [ ] **Step 3: Rename the review workspace component**

```bash
for f in $(git grep -l "ProjectPhaseFiveWorkspace" -- apps); do sed -i 's/ProjectPhaseFiveWorkspace/ProjectReviewWorkspace/g' "$f"; done
git grep -c "ProjectPhaseFive" -- apps | wc -l
```

```bash
sed -i 's/project-form-validation\.test\.ts/project-form.utils.test.ts/' apps/web/src/features/projects/team/project-team-editor-dialog.test.tsx
```

Expected: the loop touches `budget/page.tsx`, `evidence/page.tsx`, `monitor-evaluate/page.tsx`, `components/project-review-workspace.tsx` and its test; the count prints `0`.

- [ ] **Step 4: Format and verify**

```bash
pnpm exec biome check --write apps/web/src
pnpm --filter @pathways/web exec tsc --noEmit
pnpm --filter @pathways/web test 2>&1 | grep -E "Test Files|Tests "
```

Expected: Biome fixes about 8 files (import order after the rewrite); typecheck clean; web unchanged from Task 4 (216 files, 1940 tests at `703fde72`).

- [ ] **Step 5: Commit**

```bash
git checkout -- apps/web/next-env.d.ts
git add -A apps/web/src
git commit -m "refactor(web): lay out the projects feature in components and team folders

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The feature index, the surface rule and the barrel optimization

**Files:**
- Create: `apps/web/src/features/projects/index.ts`; `.tmp/s1b/to-index.mjs`, `.tmp/s1b/compare-routes.mjs` (gitignored)
- Modify: `apps/web/src/import-direction.test.ts`, `apps/web/next.config.ts`; the 21 files outside the feature that import it (13 route pages, `analytics-dashboard.tsx`, `project-map-card.tsx`, `monitoring-reach-metrics.ts`, `pinned-charts.tsx`, `role-dashboard.tsx`, `project-metrics-reads.tsx` and its test, `ui-copy-cleanup.contract.test.ts`)

**Interfaces:**
- Consumes: Task 5's layout.
- Produces: `@/features/projects` exports `ProjectDetailView`, `ProjectDirectory`, `ProjectReviewWorkspace`, `ProjectSetupForm`, `ProjectWorkspaceFrame`, `useProjectOverviewMetricsRead`, `metricUnavailableLabel`, `overviewMetricLabel`, and, until their slices move them, `PrintReceiptPage`, `ActivityDetailPage`, `ActivityDetailPanel`, `ActivityProofDialog`, `IndicatorLibraryManager`, `ProjectActivitiesWorkspace`, `ProjectIndicatorsWorkspace`. `import-direction.test.ts` gains `indexedFeatures: readonly string[]` (now `['projects']`) and `surfaceViolation(file: string, specifier: string): string | null`; `next.config.ts` gains `experimental.optimizePackageImports: ['@/features/projects']`.

- [ ] **Step 1: Create the index**

Create `apps/web/src/features/projects/index.ts`:

```ts
// Public surface of the projects feature for files outside it.
export { ProjectDetailView } from './components/project-detail-view'
export { ProjectDirectory } from './components/project-directory'
export { ProjectReviewWorkspace } from './components/project-review-workspace'
export { ProjectSetupForm } from './components/project-setup-form'
export { ProjectWorkspaceFrame } from './components/project-workspace-frame'
export { useProjectOverviewMetricsRead } from './projects.reads'
export { metricUnavailableLabel, overviewMetricLabel } from './projects.utils'

// Exported for files outside the feature until the slices that own them move them.
export { PrintReceiptPage } from './budget-module/print/print-receipt-page'
export { ActivityDetailPage } from './activity-detail-page'
export { ActivityDetailPanel } from './activity-detail-panel'
export { ActivityProofDialog } from './activity-proof-dialog'
export { IndicatorLibraryManager } from './indicator-library-manager'
export { ProjectActivitiesWorkspace } from './project-activities-workspace'
export { ProjectIndicatorsWorkspace } from './project-indicators-workspace'
```

- [ ] **Step 2: Write the failing surface rule**

In `apps/web/src/import-direction.test.ts`, replace the first three import lines (`node:fs`, `node:path`, `vitest`) with:

```ts
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PHASE_PRODUCTION_BUILD } from 'next/constants'
import { describe, expect, it } from 'vitest'

import createNextConfig from '../next.config'
```

Directly above the comment `// Non-test TypeScript files under a folder; tests may import fixtures across layers.` add:

```ts
// Features whose index.ts is their only surface for files outside them (CR section 3.3).
const indexedFeatures: readonly string[] = ['projects']

// The rule an import of an indexed feature breaks, or null when it names the feature index.
function surfaceViolation(file: string, specifier: string): string | null {
  const to = target(file, specifier)
  if (to === null || !to.startsWith('features/')) return null
  const [, feature, ...rest] = to.split('/')
  if (!indexedFeatures.includes(feature) || relativeToSrc(file).startsWith(`features/${feature}/`))
    return null
  return rest.length === 0 || rest.join('/') === 'index'
    ? null
    : `import features/${feature} only through its index`
}
```

Append at the end of the file:

```ts
describe('feature public surfaces', () => {
  it('detects an import that bypasses an indexed feature', () => {
    const file = path.join(src, 'features', 'analytics', 'example.tsx')
    const source = [
      "import { a } from '@/features/projects/components/project-directory'",
      "import { b } from '../projects/projects.utils'",
      "const c = await import('@/features/projects/team/project-team-selectors')",
      "import { d } from '@/features/projects'",
      "import { e } from '@/features/projects/index'",
      "import { f } from '@/features/reports/reporting-workspace'",
      "import { g } from './analytics-utils'",
    ].join('\n')
    expect(specifiers(source).map((specifier) => surfaceViolation(file, specifier))).toEqual([
      'import features/projects only through its index',
      'import features/projects only through its index',
      'import features/projects only through its index',
      null,
      null,
      null,
      null,
    ])
    const page = path.join(src, 'app', '(dashboard)', 'projects', 'page.tsx')
    expect(surfaceViolation(page, '@/features/projects/components/project-directory')).toBe(
      'import features/projects only through its index',
    )
    expect(surfaceViolation(page, '@/features/projects')).toBeNull()
    const inside = path.join(src, 'features', 'projects', 'components', 'example.tsx')
    expect(surfaceViolation(inside, '../projects.utils')).toBeNull()
  })

  it('keeps every other file on the index of each indexed feature', () => {
    const violations = sourceFiles(src).flatMap((file) =>
      specifiers(readFileSync(file, 'utf8')).flatMap((specifier) => {
        const rule = surfaceViolation(file, specifier)
        return rule ? [`${relativeToSrc(file)} -> ${specifier} (${rule})`] : []
      }),
    )
    expect(violations).toEqual([])
  })

  it('has Next optimize the barrel of each indexed feature so route bundles keep their size', () => {
    const optimized = createNextConfig(PHASE_PRODUCTION_BUILD).experimental?.optimizePackageImports
    expect(optimized).toEqual(
      expect.arrayContaining(indexedFeatures.map((feature) => `@/features/${feature}`)),
    )
  })
})
```

Run: `pnpm --filter @pathways/web exec vitest run src/import-direction.test.ts`
Expected: the detection test passes; the scan FAILS with 20 entries, each `<file> -> <specifier> (import features/projects only through its index)`: the 13 pages under `app/` (twelve project pages and `app/print/receipts/[expenseId]/page.tsx`), `analytics-dashboard.tsx`, `project-map-card.tsx`, `monitoring-reach-metrics.ts`, `pinned-charts.tsx`, `role-dashboard.tsx` (twice, `../projects/activity-detail-panel` and `../projects/activity-proof-dialog`) and `project-metrics-reads.tsx`; and the Next test FAILS with `expected undefined to deeply equal ArrayContaining ["@/features/projects"]`.

- [ ] **Step 3: Repoint the outside importers**

Create `.tmp/s1b/to-index.mjs` (rewrites every specifier that names a module under `features/projects/` from a file outside the feature to `@/features/projects`, and merges the duplicate index imports that result; it skips `import-direction.test.ts`, which names these paths as fixtures):

```js
// Points every import of the projects feature from outside it at the feature index and merges the duplicates.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const web = path.resolve('apps/web/src')
const pattern =
  /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|vi\.(?:mock|doMock|importActual)(?:<[^>]*>)?\(\s*)(['"])([^'"]+)\2/g

// TypeScript files under a folder.
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })

// The web-relative module a specifier names, or null for a package.
const target = (file, spec) => {
  if (spec.startsWith('@/')) return spec.slice(2)
  if (!spec.startsWith('.')) return null
  const relative = path.relative(web, path.resolve(path.dirname(file), spec))
  return relative.startsWith('..') ? null : relative.split(path.sep).join('/')
}

const index = /^import \{ ([^}]*) \} from '@\/features\/projects'\n/gm
let files = 0
let specifiers = 0
for (const file of walk(web)) {
  const relative = path.relative(web, file).split(path.sep).join('/')
  // The direction test names these paths as fixtures and must keep them.
  if (relative.startsWith('features/projects/') || relative === 'import-direction.test.ts') continue
  let count = 0
  let text = readFileSync(file, 'utf8').replace(pattern, (whole, lead, quote, spec) => {
    const module = target(file, spec)
    if (module === null || !module.startsWith('features/projects/')) return whole
    count++
    return `${lead}${quote}@/features/projects${quote}`
  })
  if (!count) continue
  // Merge the import lines the rewrite made identical in source into one.
  const names = [...text.matchAll(index)].flatMap((match) => match[1].split(',').map((n) => n.trim()))
  if (names.length > 1 && text.match(index).length > 1) {
    let first = true
    text = text.replace(index, () => {
      if (!first) return ''
      first = false
      return `import { ${[...new Set(names)].sort().join(', ')} } from '@/features/projects'\n`
    })
  }
  writeFileSync(file, text)
  files++
  specifiers += count
  console.log(`${relative}: ${count}`)
}
console.log(`files ${files}, specifiers ${specifiers}`)
```

```bash
node .tmp/s1b/to-index.mjs
```

Expected: 21 lines and `files 21, specifiers 22` (`role-dashboard.tsx` shows 2 and ends as one `import { ActivityDetailPanel, ActivityProofDialog } from '@/features/projects'`; `ui-copy-cleanup.contract.test.ts` shows 1, its asserted import string for `analytics-dashboard.tsx` now reads `from '@/features/projects'`, which matches the file it reads).

- [ ] **Step 4: Tell Next to optimize the barrel**

In `apps/web/next.config.ts`, directly above `transpilePackages: ['@pathways/config', '@pathways/imports', '@pathways/shared'],` add:

```ts
    // Barrel imports of an indexed feature otherwise pull every client component of it into the route bundle.
    experimental: { optimizePackageImports: ['@/features/projects'] },
```

- [ ] **Step 5: Format, typecheck and test**

```bash
pnpm exec biome check --write apps/web/src apps/web/next.config.ts
pnpm --filter @pathways/web exec tsc --noEmit
pnpm --filter @pathways/web test 2>&1 | grep -E "Test Files|Tests "
```

Expected: typecheck clean; web = Task 5 plus 3 tests (216 files, 1943 tests at `703fde72`); the surface scan and the Next test pass.

- [ ] **Step 6: Compare the production route bundles**

Create `.tmp/s1b/compare-routes.mjs`:

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

```bash
pnpm --filter @pathways/web build > .tmp/s1b/web-build-index.log 2>&1; echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' .tmp/s1b/web-build-index.log | sed -n '/Route (app)/,$p' > .tmp/s1b/routes-index.txt
node .tmp/s1b/compare-routes.mjs .tmp/s1b/routes-baseline.txt .tmp/s1b/routes-index.txt
grep -E "Middleware" .tmp/s1b/routes-index.txt
git checkout -- apps/web/next-env.d.ts
```

Expected: exit 0; only the three review routes differ, smaller by 3 to 4 kB (`/projects/[projectId]/budget`, `/evidence`, `/monitor-evaluate`, `329 kB -> 326 kB` at `703fde72`); `routes 72, different 3`; `Middleware` equals `M0`. If any other route grows, stop without committing and report the figures: ruling 9 gives the fallback (drop the config key, exempt `app/` in `surfaceViolation`), and the trade is the controller's. For reference, without the config key the same build grew every `/projects` route to 397 kB, `/print/receipts/[expenseId]` from 133 to 397 kB, `/analytics` from 664 to 752 kB and `/dashboard` from 673 to 752 kB.

- [ ] **Step 7: Commit**

```bash
git add -A apps/web/src apps/web/next.config.ts
git commit -m "refactor(web): add the projects feature index with a surface rule and barrel optimization

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Split the oversized project components

**Files:**
- Create (gitignored): `.tmp/s1b/same-lines.mjs`, `split-setup-fields.mjs`, `split-team-utils.mjs`, `split-evidence-view.mjs`
- Create: `apps/web/src/features/projects/components/project-setup-fields.tsx`, `apps/web/src/features/projects/components/evidence-view.tsx`, `apps/web/src/features/projects/team/team-selection.utils.ts`
- Modify: `components/project-setup-form.tsx`, `components/project-review-workspace.tsx`, `team/project-team-selectors.tsx`, `team/project-team-editor-dialog.tsx`, `project-form.utils.ts`
- Move: `team/project-team-selectors.test.ts` to `team/team-selection.utils.test.ts`

**Interfaces:**
- Consumes: Task 5's layout (all paths below are the new ones).
- Produces: `ProjectSetupFields({ canEditBudget, canReadBudget, existingBudget, form, projectId })` from `components/project-setup-fields.tsx`; `projectStatuses: ProjectStatus[]` exported from `project-form.utils.ts`; `EvidenceView` and `type ScopedReport` from `components/evidence-view.tsx`; `TeamFieldName`, `teamRoles`, `hiddenTeamFields`, `getEligibleTeamUsers`, `parseProjectOfficerNames`, `validateProjectTeamSelections` from `team/team-selection.utils.ts`. Behavior is unchanged: the existing tests of the form, the editor dialog, the selectors rules and the review workspace render the moved parts.

- [ ] **Step 1: Keep the originals and create the scripts**

```bash
cp apps/web/src/features/projects/components/project-review-workspace.tsx .tmp/s1b/review-workspace.before.tsx
cp apps/web/src/features/projects/team/project-team-selectors.tsx .tmp/s1b/team-selectors.before.tsx
```

`.tmp/s1b/same-lines.mjs` (fails unless the new files hold exactly the non-import declaration lines of the original, ignoring order, blanks and `export`):

```js
// Fails unless the new files hold exactly the non-import lines of the original, ignoring order, blanks and export keywords.
import { readFileSync } from 'node:fs'

const [original, ...rest] = process.argv.slice(2)
const renames = rest.filter((arg) => arg.includes('=')).map((arg) => arg.split('='))
const files = rest.filter((arg) => !arg.includes('='))
const start = /^(?:\/\/|\/\*\*|export\s|const\s|let\s|function\s|async\s|class\s|type\s|interface\s)/

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

`.tmp/s1b/split-setup-fields.mjs` (moves the two-column field grid and `ProjectCodePreview` into `ProjectSetupFields`, and the status list into `project-form.utils.ts` because the draft restore in the form also uses it):

```js
// Moves the project information fields of the setup form into their own component, verbatim.
import { readFileSync, writeFileSync } from 'node:fs'

const dir = 'apps/web/src/features/projects'
const formFile = `${dir}/components/project-setup-form.tsx`
const utilsFile = `${dir}/project-form.utils.ts`
let form = readFileSync(formFile, 'utf8')
let utils = readFileSync(utilsFile, 'utf8')

function indexOf(text, anchor) {
  const at = text.indexOf(anchor)
  if (at < 0) throw new Error(`missing: ${anchor}`)
  return at
}

// The status list is shared by the draft restore in the form and the select in the fields.
const statusesLine = "const projectStatuses: ProjectStatus[] = ['Active', 'Needs Attention', 'Planned', 'Completed']\n"
form = form.replace(statusesLine, () => '')
const schemaAnchor = 'export const projectSetupSchema = projectSetupBaseSchema.refine('
utils = utils.replace(schemaAnchor, `export ${statusesLine}\n${schemaAnchor}`)
utils = utils.replace('  ProjectDetail,\n  UpdateProjectInput,', '  ProjectDetail,\n  ProjectStatus,\n  UpdateProjectInput,')
form = form.replace('  projectSetupSchema,\n', '  projectSetupSchema,\n  projectStatuses,\n')

// The two-column field grid, from its opening tag to the closing tag before the team section.
const gridStart = indexOf(form, '            <div className="grid gap-5 lg:grid-cols-2">\n')
const teamStart = indexOf(form, '            <div className="space-y-4 rounded-xl border border-border bg-surface-subtle p-4">')
const grid = form.slice(gridStart, teamStart)
form =
  form.slice(0, gridStart) +
  `            <ProjectSetupFields
              canEditBudget={canEditBudget}
              canReadBudget={canReadBudget}
              existingBudget={existingProject?.projectBudget ?? ''}
              form={form}
              projectId={projectId}
            />
` +
  form.slice(teamStart)

const previewStart = indexOf(form, '// Shows the code the API will generate;')
const preview = form.slice(previewStart)
form = form.slice(0, previewStart).trimEnd() + '\n'
form = form.replace(
  "import { ProjectTeamSelectors, hiddenTeamFields } from '../team/project-team-selectors'\n",
  "import { ProjectTeamSelectors, hiddenTeamFields } from '../team/project-team-selectors'\nimport { ProjectSetupFields } from './project-setup-fields'\n",
)

const header = `'use client'

import { projectCodeBase } from '@pathways/shared'
import { type UseFormReturn, useWatch } from 'react-hook-form'

import { LockedField } from '@/components/pathways'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { type ProjectSetupSchema, projectStatuses } from '../project-form.utils'

export const ProjectSetupFields = ({
  canEditBudget,
  canReadBudget,
  existingBudget,
  form,
  projectId,
}: {
  canEditBudget: boolean
  canReadBudget: boolean
  existingBudget: string
  form: UseFormReturn<ProjectSetupSchema>
  projectId?: string
}) => (
`
const fields = `${header}${grid.trimEnd().replace("existingProject?.projectBudget ?? ''", 'existingBudget')}\n)\n\n${preview}`
writeFileSync(`${dir}/components/project-setup-fields.tsx`, fields)
writeFileSync(formFile, form)
writeFileSync(utilsFile, utils)
```

`.tmp/s1b/split-team-utils.mjs` (moves the pure team rules into `team-selection.utils.ts`, exports `teamRoles`, renames the rules test and repoints the two importers):

```js
// Moves the pure team selection rules out of the team selector component file, verbatim, and repoints their importers.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const dir = 'apps/web/src/features/projects'
const selectorsFile = `${dir}/team/project-team-selectors.tsx`
let selectors = readFileSync(selectorsFile, 'utf8')

const start = selectors.indexOf('export type TeamFieldName =')
const end = selectors.indexOf('const optionPlaceholder = (')
if (start < 0 || end < 0) throw new Error('missing the rule block anchors')
const rules = selectors.slice(start, end).replace('const teamRoles:', 'export const teamRoles:')
selectors = selectors.slice(0, start) + selectors.slice(end)
selectors = selectors.replace("import { type CanonicalRole, canAssignRole } from '@pathways/shared'\n", '')
selectors = selectors.replace(
  "import type { ProjectSetupSchema } from '../project-form.utils'\n",
  "import type { ProjectSetupSchema } from '../project-form.utils'\nimport {\n  type TeamFieldName,\n  getEligibleTeamUsers,\n  parseProjectOfficerNames,\n  teamRoles,\n} from './team-selection.utils'\n",
)
const header = `import { type CanonicalRole, canAssignRole } from '@pathways/shared'

import type { UserRecord } from '@/types/pathways'
import type { PathwaysRole } from '@/types/pathways-role'
import type { ProjectSetupSchema } from '../project-form.utils'

`
writeFileSync(`${dir}/team/team-selection.utils.ts`, header + rules.trimEnd() + '\n')
writeFileSync(selectorsFile, selectors)

execFileSync('git', [
  'mv',
  `${dir}/team/project-team-selectors.test.ts`,
  `${dir}/team/team-selection.utils.test.ts`,
])
const testFile = `${dir}/team/team-selection.utils.test.ts`
writeFileSync(
  testFile,
  readFileSync(testFile, 'utf8').replace("from './project-team-selectors'", "from './team-selection.utils'"),
)

function edit(file, from, to) {
  const text = readFileSync(file, 'utf8')
  if (!text.includes(from)) throw new Error(`${file}: missing ${from}`)
  writeFileSync(file, text.replace(from, to))
}
edit(
  `${dir}/team/project-team-editor-dialog.tsx`,
  "import {\n  ProjectTeamSelectors,\n  type TeamFieldName,\n  hiddenTeamFields,\n  validateProjectTeamSelections,\n} from './project-team-selectors'\n",
  "import { ProjectTeamSelectors } from './project-team-selectors'\nimport {\n  type TeamFieldName,\n  hiddenTeamFields,\n  validateProjectTeamSelections,\n} from './team-selection.utils'\n",
)
edit(
  `${dir}/components/project-setup-form.tsx`,
  "import { ProjectTeamSelectors, hiddenTeamFields } from '../team/project-team-selectors'\n",
  "import { ProjectTeamSelectors } from '../team/project-team-selectors'\nimport { hiddenTeamFields } from '../team/team-selection.utils'\n",
)
```

`.tmp/s1b/split-evidence-view.mjs` (moves `budgetUsedText`, `EvidenceSummaryCard`, `EvidenceDownloadControl` and `EvidenceView` into `evidence-view.tsx`; `applyEvidence` stays with the loader that calls it):

```js
// Moves the evidence presentation components out of the review workspace into their own file, verbatim.
import { readFileSync, writeFileSync } from 'node:fs'

const dir = 'apps/web/src/features/projects/components'
const source = `${dir}/project-review-workspace.tsx`
let text = readFileSync(source, 'utf8')

const startAnchor = '/** Dash when there is no allocation to measure against, or no budget access. */'
const start = text.indexOf(startAnchor)
if (start < 0) throw new Error('missing the budgetUsedText comment')
const moved = text.slice(start)
text = text.slice(0, start).trimEnd() + '\n'

const typeLine = 'type ScopedReport = Awaited<ReturnType<typeof coreDataClient.reports>>[number]\n'
if (!text.includes(typeLine)) throw new Error('missing the ScopedReport type')
text = text.replace(typeLine, '')
text = text.replace(
  "import { PrivateProofPreview } from '../private-proof-preview'\n",
  "import { EvidenceView, type ScopedReport } from './evidence-view'\n",
)

const header = `'use client'

import Link from 'next/link'

import { CappedPercent, SectionCard } from '@/components/pathways'
import { Button } from '@/components/ui/button'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'
import { principalHasAtomicPermission } from '@/lib/rbac/policy'
import type { coreDataClient } from '@/lib/services/core-feature-client'
import { privateProofClient } from '@/lib/services/private-proof-client'
import type { ActivitySummary, EvidenceActivitySummary, EvidenceRecord } from '@/types/pathways'
import { AuditMetadataCard, EvidenceAttachmentsCard } from '../evidence-panels'
import { PrivateProofPreview } from '../private-proof-preview'

export ${typeLine}
`
const body = moved.replace('const EvidenceView = (', 'export const EvidenceView = (')
writeFileSync(`${dir}/evidence-view.tsx`, `${header}${body}`)
writeFileSync(source, text)
```

- [ ] **Step 2: Run the splits and trim the imports**

Run them in this order (the second script edits an import line the first one touched):

```bash
node .tmp/s1b/split-setup-fields.mjs
node .tmp/s1b/split-team-utils.mjs
node .tmp/s1b/split-evidence-view.mjs
node .tmp/s1b/trim-imports.mjs apps/web/src/features/projects/components/project-setup-form.tsx apps/web/src/features/projects/team/project-team-selectors.tsx apps/web/src/features/projects/components/project-review-workspace.tsx
```

Expected: the trim prints `removed projectCodeBase, UseFormReturn, useWatch, LockedField, FormControl, FormField, FormItem, FormLabel, FormMessage, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, ProjectStatus` for the form, `removed nothing` for the selectors (the split script already dropped their `@pathways/shared` import), and `removed AuditMetadataCard, EvidenceAttachmentsCard, CappedPercent, useSensitiveDraftOwner, privateProofClient` for the workspace.

- [ ] **Step 3: Format, check the verbatim moves and test**

```bash
pnpm exec biome check --write apps/web/src
pnpm --filter @pathways/web exec tsc --noEmit
node .tmp/s1b/same-lines.mjs .tmp/s1b/review-workspace.before.tsx apps/web/src/features/projects/components/project-review-workspace.tsx apps/web/src/features/projects/components/evidence-view.tsx
node .tmp/s1b/same-lines.mjs .tmp/s1b/team-selectors.before.tsx apps/web/src/features/projects/team/project-team-selectors.tsx apps/web/src/features/projects/team/team-selection.utils.ts
pnpm --filter @pathways/web test 2>&1 | grep -E "Test Files|Tests "
wc -l apps/web/src/features/projects/components/{project-setup-form,project-setup-fields,project-review-workspace,evidence-view}.tsx apps/web/src/features/projects/team/{project-team-selectors.tsx,team-selection.utils.ts}
```

Expected: typecheck clean; `same lines: 364` and `same lines: 418`; web unchanged from Task 6 (216 files, 1943 tests at `703fde72`); line counts 409, 198, 213, 210, 405 and 80. The setup fields are not checked with `same-lines.mjs` because the grid moved into a component body, so its JSX is re-indented and re-wrapped; the setup form, locked budget and draft tests cover it.

- [ ] **Step 4: Replace the Owned and Scoped prefixes of the files this slice owns (MOD-17)**

The three names are file-private, so only their own files change:

```bash
sed -i 's/\bScopedProjectSetupForm\b/ProjectSetupFormContent/g' apps/web/src/features/projects/components/project-setup-form.tsx
sed -i 's/\bScopedReport\b/ProjectReportRecord/g' apps/web/src/features/projects/components/evidence-view.tsx apps/web/src/features/projects/components/project-review-workspace.tsx
sed -i 's/\bOwnedSourceMutationRecovery\b/SourceMutationRecoveryContent/g' apps/web/src/features/projects/components/source-mutation-recovery.tsx
git grep -nE "\b(Owned|Scoped)[A-Z]" -- apps/web/src/features/projects/components apps/web/src/features/projects/team
pnpm exec biome check --write apps/web/src/features/projects
pnpm --filter @pathways/web exec tsc --noEmit
pnpm --filter @pathways/web exec vitest run src/features/projects
```

Expected: the grep prints nothing; typecheck clean; the projects feature tests pass (34 files, 350 tests). `ScopedActivityFormDialog`, `ScopedActivityProofDialog`, `OwnedInspection` and `OwnedReview` stay in the activity files for S2b.

- [ ] **Step 5: Commit**

```bash
git checkout -- apps/web/next-env.d.ts
git add -A apps/web/src
git commit -m "refactor(web): split the setup fields, evidence view and team selection rules out and drop the Owned and Scoped prefixes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Records

**Files:**
- Create (gitignored): `.tmp/s1b/doc-paths.mjs`
- Modify: living docs that name moved files (`docs/deferred-features.md`, `docs/qad-pathways.md`; `docs/dsd-pathways.md` and `DESIGN.md` by hand), `docs/cr-pathways-codebase-modularization.md` (sections 3.3 and 9), `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05, MOD-06, MOD-15, MOD-16, MOD-17 rows), `docs/index.md` (CR row status), `docs/activity-log.md`

No SAD routing change is needed (ruling 11): the manifest of Task 9 shows the roles the changed paths already route to.

- [ ] **Step 1: Repoint the living docs that name moved files**

Create `.tmp/s1b/doc-paths.mjs` (rewrites `apps/web/src/features/projects/<old>` to the new path unless the doc names a past location: after a commit hash and a colon, or in a clause that says the file was deleted):

```js
// Rewrites the current-path mentions of moved project files in the living docs, leaving "<sha>:path" history references alone.
import { readFileSync, writeFileSync } from 'node:fs'

const [mapFile, ...docs] = process.argv.slice(2)
const map = JSON.parse(readFileSync(mapFile, 'utf8'))
let total = 0
for (const doc of docs) {
  let text = readFileSync(doc, 'utf8')
  let count = 0
  for (const [from, to] of Object.entries(map)) {
    const old = `apps/web/src/${from}`
    // A path after "<sha>:" or "deleted `" names a past location and keeps its old path.
    const pattern = new RegExp(
      `(?<![0-9a-f]{7,40}:)(?<!deleted \`)${old.replaceAll('.', '\\.')}(?![A-Za-z0-9_-])`,
      'g',
    )
    text = text.replace(pattern, () => {
      count++
      return `apps/web/src/${to}`
    })
  }
  if (!count) continue
  writeFileSync(doc, text)
  total += count
  console.log(`${doc}: ${count}`)
}
console.log(`total: ${total}`)
```

```bash
git grep -lE "apps/web/src/features/projects/" -- docs ':!docs/activity-log.md' ':!docs/superpowers' ':!docs/audit-*' ':!docs/cr-*'
node .tmp/s1b/doc-paths.mjs .tmp/s1b/layout-map.json docs/deferred-features.md docs/qad-pathways.md docs/dsd-pathways.md docs/sad-pathways.md
git diff --stat docs
```

Expected: the grep lists the docs that mention feature paths (the activity, indicator and budget paths in them belong to later slices and stay); the script prints `docs/deferred-features.md: 2`, `docs/qad-pathways.md: 6` and `total: 8` at `703fde72`. In the "Project card quick preview" row of `docs/deferred-features.md` the `deleted ...project-preview-dialog.tsx` path and the `git show 98a9004:...` path keep their old location. If the grep lists another doc that names a moved file, add it to the command.

Two mentions have no `apps/web/src/` prefix, so the script leaves them: edit `features/projects/project-directory.tsx` to `features/projects/components/project-directory.tsx` by hand in `docs/dsd-pathways.md` (line 1009) and in `DESIGN.md` (line 606).

- [ ] **Step 2: Amend the Change Record**

`docs/cr-pathways-codebase-modularization.md`, section 3.3, directly after the paragraph that ends `(amended 2026-10-10 for F4b)`, add:

```text
`lib/api/core` also holds `source-mutation-request` (`requestSourceMutation`, the one owner of owned source mutations that every slice's web client imports), and `lib/api/<domain>.ts` holds the domain client object (`projectsClient` in `lib/api/projects.ts`, typed from the shared response contracts). A feature with an `index.ts` is listed in `indexedFeatures` in `apps/web/src/import-direction.test.ts`: every file outside it, route pages included, imports it only through the index, and `experimental.optimizePackageImports` in `apps/web/next.config.ts` names its barrel (`@/features/<name>`) so the barrel does not enlarge route bundles; a test requires the two lists to agree. A feature with several pure-helper files names them `<concern>.utils.ts` (`project-form.utils.ts` beside `projects.utils.ts`) (amended 2026-10-12 for S1b).
```

Section 9, append (replace `<date>` with the merge date):

```markdown
S1b applied <date> on refactor/s1b-projects-web:
- Client: `lib/api/projects.ts` holds `projectsClient` (the seven project methods moved out of `pathways-client.ts` plus `getProjectMap`), typed from `ProjectResponse` and `ArchiveProjectResponse`; 22 screens and hooks, 2 client tests and 26 test mocks follow; `requestSourceMutation` moved to `lib/api/core/source-mutation-request.ts` for S2b, S3b and S5b; the web `StoredProjectStatus` is the shared type.
- Layout: `features/projects/components/`, `team/`, `projects.reads.ts`, `projects.utils.ts`, `project-form.utils.ts` and an `index.ts`; the activity, indicator, budget, evaluation and rules-panel files stay at the feature root until S2, S3, S6 and S7 move them; `ProjectPhaseFiveWorkspace` is `ProjectReviewWorkspace`.
- Surface: every file outside the feature, route pages included, imports it through the index; `indexedFeatures` and `surfaceViolation` in `import-direction.test.ts` enforce it and `experimental.optimizePackageImports` keeps route bundles the same size (a plain barrel grew every `/projects` route to 397 kB, `/print/receipts/[expenseId]` from 133 kB and `/analytics` and `/dashboard` by about 80 kB).
- Components: the review workspace lost its `indicators` and `transparency` views, the Add Indicator dialog and `project-review-utils.ts`, which no route rendered, and went from 716 to 213 lines with `evidence-view.tsx` at 210; the setup form went from 588 to 409 lines with `project-setup-fields.tsx` at 198; the selectors went from 474 to 405 lines with `team-selection.utils.ts` at 80; the file-private `ScopedProjectSetupForm`, `ScopedReport` and `OwnedSourceMutationRecovery` became `ProjectSetupFormContent`, `ProjectReportRecord` and `SourceMutationRecoveryContent`.
- Middleware stayed at 102 kB; the three review routes shrank 3 to 4 kB.
- Decisions: one plan of ten tasks (ruling 1); `getProjectsForRole` kept (ruling 3); mocks split or doubled, not rewritten (ruling 5); unreachable views deleted (ruling 7); index plus `optimizePackageImports` (ruling 9).

Deferred: the six project list read keys (`projects`, `review-projects`, `rules-editor-projects`, `rules-project-choices`, `publication-projects`, `report-projects`; the three `projects.read` readers with default freshness could share one key) stay with S6, S7 and S8, whose files own them; the `ExpenseRecord` type in `types/pathways.ts` is now unused (S6); `lib/services/*` renames. Later plans add their feature to `indexedFeatures` and `optimizePackageImports` instead of writing another rule.
```

- [ ] **Step 3: Update the audit and the index**

- Audit rows, append to the disposition cell of each: MOD-05 `; projects client by S1b.`; MOD-06 `; project components by S1b.`; MOD-15 `; projects index and surface rule by S1b.`; MOD-16 `; project list read keys left to S6, S7 and S8 by S1b.`; MOD-17 `; ProjectPhaseFiveWorkspace renamed and features/projects laid out by S1b.` (replace the final period of the cell where there is one).
- `docs/index.md`: in the CR row status add `S1b` to the applied list and name as next the first sub-project in roadmap order that is not applied (for example `Approved; F1 to F4b, S1a, S1b and S2a applied, S2b next`).

```bash
git grep -nE "project-(archive-dialog|detail-view|directory|overview-metrics|preview-dialog|review-utils|review-workspace|setup-form|workspace-frame|workspace-header|team-editor-dialog|team-selectors|form-validation|utils)\.tsx?|use-project-reads|ProjectPhaseFive" -- docs ':!docs/activity-log.md' ':!docs/superpowers' ':!docs/audit-*' ':!docs/cr-*' | grep -v "git show"
```

Expected: prints nothing (no living doc names a removed or moved path other than the preserved `git show` history line).

- [ ] **Step 4: Activity log**

Add to `docs/activity-log.md`:

```markdown
## <date> Modularization S1b projects web (refactor/s1b-projects-web)
```

with one bullet per Task 1 to Task 7: what moved or changed, its commit hash, and the web test count at the end of that task (1926, 1945, 1945, 1940, 1940, 1943, 1943 at `703fde72`); a bullet saying the unreachable review views were deleted and why (route scan, narrowed type, four dead exports); a bullet with the route bundle measurement (plain barrel versus `optimizePackageImports`); a bullet saying the S1b decisions are recorded in the change record section 9 because the plan file is removed after merge; and a bullet listing the deferrals above. Task 9 Step 5 appends the gate results.

- [ ] **Step 5: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint
git add docs
git commit -m "docs: record modularization S1b and repoint the moved project paths

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline.

---

### Task 9: Full release gates and merge

- [ ] **Step 1: Static gates, route bundles and middleware**

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm sad:test
git checkout -- apps/web/next-env.d.ts
pnpm --filter @pathways/web build > .tmp/s1b/web-build-gates.log 2>&1; echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' .tmp/s1b/web-build-gates.log | sed -n '/Route (app)/,$p' > .tmp/s1b/routes-gates.txt
node .tmp/s1b/compare-routes.mjs .tmp/s1b/routes-baseline.txt .tmp/s1b/routes-gates.txt
grep -E "Middleware" .tmp/s1b/routes-gates.txt
git checkout -- apps/web/next-env.d.ts
```

Expected: all pass; web = `B_web` files + 1 and tests + 22 (216 files, 1943 tests at `703fde72`); config, shared, imports, api and sad equal Task 0; the build exits 0; the route comparison lists only the three review routes, each 3 to 4 kB smaller, `routes 72, different 3`; `Middleware` equals `M0`.

- [ ] **Step 2: Local DB replay**

```powershell
./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline
```

Expected: exit 0 (171 PASS, 0 FAIL at the F4b and S1a gates). S1b changes no SQL; the replay is kept as the standing release gate.

- [ ] **Step 3: Local stack, compiled API boot, e2e and smoke**

Stop anything on ports 3000 and 4000 first.

```bash
pnpm db:local:start && pnpm db:local:reset && pnpm db:local:demo
pnpm dev:local
```

In a second terminal:

```bash
curl -s http://127.0.0.1:4000/api/health
npx playwright test --config playwright.config.ts
npx playwright test --config playwright.auth-navigation.config.ts
```

Expected: `"status":"ok"`; auth-navigation 27/27; main suite 39 pass, 9 fail, 22 not run, with the same 9 failing as the F1 to S1a gate runs (MFA Verify helper, password-login harness, workflows seed end date). Browser smoke against `pnpm dev:local` (Turbopack serves the index there), each step as a demo user whose role allows it, and every step must behave as on dev. The barrel optimization exists only in the production build, so repeat items 1 and 4 against it: stop the web dev server, run `pnpm dev:local -- --api-only`, export the `NEXT_PUBLIC_*` values that the `shared` block of `scripts/db/local-dev.mjs` builds (they are inlined at build time), then `pnpm --filter @pathways/web build` and `pnpm --filter @pathways/web start`.

1. As Project Manager open `/projects`, open a project, edit its dates and title and save (the update replays with its `clientMutationId`), open the team editor and change the officers, and create a project with a padded lower-case title and a budget on `/projects/new`; the detail page shows the saved values.
2. Open the Evidence tab as the Monitoring and Evaluation Officer (records, report records, the proof preview), the Budget tab (budget module and rules panel) and the Monitor and Evaluate tab; as a Program Manager and as a Project Officer open the project directory.
3. Open the Activities tab, an activity detail page and the Indicators tab (they now import through the index), and `/indicators/library`.
4. Open `/analytics` (overview labels and the project map), `/dashboard` (overview tiles, an activity detail panel and the proof dialog) and a printed receipt page from the budget module.
5. Open the project pickers of the reporting workspace, the rules board and rule editor, the publication queue, the beneficiary directory, form and detail loaders, the duplicate resolution workspace, the collection workspace and import workspace, and the user management workspace.
6. Archive a project and archive it again as a role holding `projects.archive`; paste the URL of a project outside the role's scope and expect the denial dev shows.

- [ ] **Step 4: SAD review**

```bash
pnpm sad:check --base dev --head HEAD --output .tmp/sad/s1b/manifest.json
```

Expected roles at `703fde72`: `design-qa-agent` (132 files), `beneficiary-privacy-guardian` (7 files under `lib/api` and `lib/services`) and `rule-engine-determinism-checker` (2 files, `rule-editor.tsx` and its test, whose import and mock changed), plus `restraint-guardian` if `sad:check` requires it. Dispatch every role the manifest requires with the section 4.2 handoff packet from `docs/sad-pathways.md`, save their section 4.4 envelopes to `.tmp/sad/s1b/reviews.json`, then:

```bash
pnpm sad:signoff -- --base dev --head HEAD --reviews .tmp/sad/s1b/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun.

- [ ] **Step 5: Record the gate results**

Append a final bullet to the Task 8 activity-log section with the gate results (per-package counts, Middleware size, the route comparison, replay result, e2e pass counts, smoke result, SAD sign-off), then:

```bash
git add docs/activity-log.md
git commit -m "docs: record modularization S1b release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Merge into local dev**

```bash
git checkout dev
git merge --no-ff refactor/s1b-projects-web -m "Merge refactor/s1b-projects-web into dev

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Remove the executed plan**

The decisions live in the change record section 9, so the plan goes with the merge. Delete `docs/superpowers/plans/2026-10-12-modularization-s1b-projects-web.md` and its row in `docs/index.md` section 1.6, then:

```bash
git rm docs/superpowers/plans/2026-10-12-modularization-s1b-projects-web.md
pnpm docs:check 2>&1 | tail -3
git add docs/index.md
git commit -m "docs: remove the executed S1b plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline. Do not push `origin dev` until the developer says so.
