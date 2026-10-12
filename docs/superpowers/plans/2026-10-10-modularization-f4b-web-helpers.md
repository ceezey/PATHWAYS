# F4b Web Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the web app one home for its formatting helpers (`lib/format`), one shared sticky table head class, one request core with an owned-read capture (`lib/api/core`), and thinner providers, with no change to any rendered text, class string, request, header, cookie, redirect or authorization decision.

**Architecture:** F4b is the second half of F4 (F4a ruling 1) and fits one branch: nine tasks including baseline, records and gates. Every duplicate is pinned by a characterization test that passes on the old code before the duplicate is removed. Moves are verbatim and checked by `same-lines.mjs`; mechanical rewrites (import splits, mock moves, declaration edits) use one-off Node scripts under `.tmp/f4b/` (gitignored, never committed) whose content is given in full. Every script and test below was dry-run on an exported copy of `a101ad7c`; the expected outputs come from those runs, and the full web suite passed at 1921 tests (baseline 1899 plus the 22 added here).

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, Next 15.5.14 (App Router, Edge middleware), React 19, TanStack Query, Vitest 3 (jsdom per file), Playwright, Biome 1.9.4, zod 3.25.76.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.3, 3.5, 3.7 row F4a and F4b, 6, 7, 9 including the F4a disposition) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05, MOD-16). The F4b outline at the end of `docs/superpowers/plans/2026-10-10-modularization-f4-web-platform.md` is the starting point; the rulings below amend it where they differ.

## Rulings

Controller rulings for F4b (2026-10-10). Each was checked against `refactor/f4a-web-boundaries` `a101ad7c`, the tree that becomes local dev once F4a merges (F4a Task 7 adds only docs after it). The outline's counts were taken at `c07ab1c0`; all were recounted.

1. **One branch, `refactor/f4b-web-helpers`.** Six work tasks plus baseline, records and gates (nine in all) stay under the split threshold.
2. **Recounted at `a101ad7c`.** Unchanged from the outline: 11 `@/lib/percent` importers; 3 `plural` copies with 7 calls; 9 `statusTone` definitions over 9 vocabularies (none duplicates another); 4 identical header class constants with 23 uses plus 2 different ones; 13 files that render only a raw `DialogContent` and 3 that mix raw and shared dialogs; named imports from `pathways-client` of `PathwaysClientError` 33, `requestFoundation` 7, `requestFoundationResponse` 5 (37 files); 57 test files mock `pathways-client`; 12 `vi.mock('@/providers/authorized-query-provider', ...)` factories. Corrected: `DialogShell` is rendered by 17 files and `ConfirmationDialog` by 8 (the outline's 19 and 10 counted the definitions and the `components/pathways/index.ts` barrel); the 24 `pathways-client` factories that name a moved export are 23 plain `() => ({ ... })` factories plus the `importActual` factory in `lib/auth/beneficiary-step-up.test.ts`; 7 more factories spread `importOriginal` and need no change because the real class then serves both sides; 3 tests destructure `PathwaysClientError` from `await import('@/lib/services/pathways-client')`; `useAuthorizedRead` has 27 named imports plus 1 each of `authorizedReadPolicy` and `SUMMARY_READ_STALE_MS` (27 files; the outline said 25).
3. **`lib/format/tone.ts` holds two union types and no statusTone is annotated.** The outline typed each `statusTone` to return `StatusTone`. That fails typecheck: `executive-dashboard.tsx` passes its `statusTone` result to `ExecutiveSignal`, whose `tone` has no `neutral`. So the 9 definitions keep their inferred literal types, still checked at each `StatusBadge` call. `tone.ts` exports `StatusTone` (the `StatusBadge` union) and `SignalTone = Exclude<StatusTone, 'neutral'>`, which replaces the 4 literal copies of `'info' | 'success' | 'warning' | 'danger'` (`metric-card.tsx`, `progress-bar.tsx`, `ExecutiveSignal`, `budget-math.ts`). `DashboardSeverity` in `types/pathways.ts` names an API view-model value and stays (S7).
4. **Dates: two functions, two wrappers kept.** `formatCalendarDay(value)` is the exact medium UTC formatting of `${value}T00:00:00.000Z` used by `analytics-utils.ts`, `survey-report-overview.tsx` and `reporting-workspace.tsx`; it keeps Intl's rollover (`2026-02-31` gives `Mar 3, 2026`) and its `RangeError` on a malformed day, both pinned. `formatDateOrUnavailable(value, formatter = medium UTC)` is the validated body of `beneficiary-utils.ts` and `activity-utils.ts`, byte for byte except the formatter parameter. The beneficiary and activity `formatDate` exports stay as one-line wrappers, so their 13 importers and their tests do not change; beneficiaries drop their own formatter (identical to the default); activities keep their two-digit-day formatter, so `Jan 05, 2026` stays. Reporting keeps its empty guard as a one-line wrapper. `analytics-utils.ts` held only `formatDate` and is deleted. `formatProofDate`, `formatAccountDate`, the portfolio `shortDate` and the greeting formatter format differently and stay (slices).
5. **The shared header is a class string named for its purpose.** `stickyTableHeadClass` in `components/pathways/sticky-table-head.ts` replaces the 4 identical `headClass` constants; call sites rename `headClass` to `stickyTableHeadClass`. A component would change rendered class strings: call sites combine the class with `cn(...)` (tailwind-merge drops `text-left` when `text-center` or `text-right` is added, pinned) and with template strings. `collection-workspace.tsx` and `import-workspace.tsx` keep their different classes (S5).
6. **The dialog check is settled: no exact duplicate.** No raw `DialogContent` has `DialogShell`'s `className="rounded-lg"` (only `activity-editor-loading-dialog.tsx` has `max-w-md rounded-lg`, with no header), and none has `ConfirmationDialog`'s cancel-focusing `onOpenAutoFocus` (it also adds a warning icon for destructive actions). Consolidating any of them would change rendered markup, so no dialog code changes; Task 3 reruns the two greps and the records state it.
7. **`lib/api/core/request.ts` takes the request core verbatim.** `PathwaysClientError`, the private `readContextCookie`, `requestFoundationResponse` and `requestFoundation` move as lines 174 to 193, 1938 to 1946 and 1962 to 2110 of `pathways-client.ts` (git hash `c58dd57e6e818f93ca96a4a9ea58b2ea9ad52906`, 2786 lines). `ensureSourceInvalidationSubscription` and its flag (lines 1850 to 1855) move to `source-mutation.ts`, beside the tickets they clear, with one edit (`sourceTickets.clear()` becomes `sourceMutationTickets.clear()`) and an `export`. The top-level `ensureSourceInvalidationSubscription()` call stays in `pathways-client.ts`, so the subscription still starts when the client loads, and `requestFoundationResponse` still calls it first. `pathways-client.ts` does not re-export the moved names: all 37 importers move.
8. **Specifiers: sibling or alias.** A moved name is imported as `./name` from a sibling and through `@/` otherwise, so the `lib/services` clients that used `'./pathways-client'` import `'@/lib/api/core/request'` (the cross-folder style already used in `lib`).
9. **Mocks follow the export.** The 23 plain factories move their `PathwaysClientError` and `requestFoundation*` entries into a `vi.mock('@/lib/api/core/request', ...)` placed directly after them: 16 split, and 7 whose every entry moved are renamed. `beneficiary-step-up.test.ts` swaps all three `pathways-client` references in its `importActual` factory. The 3 `await import(...)` destructurings point at the request module. Without this, a component's `instanceof PathwaysClientError` would test the real class against a mocked error and silently take another branch.
10. **The owned-read helper captures ownership; it covers three sites.** `ownerCookie()` is identical in `core-feature-client.ts` and `rules-human-client.ts`. `captureRequestOwner(signal?)` in `lib/api/core/request-owner.ts` returns the check `owner !== null && owner === ownerCookie() && generation === sensitiveDraftGeneration() && !signal?.aborted`. It replaces the capture in both `read()` functions and in `fetchCoreArtifact` (the outline named only the two reads). The rules read's `!cookie || !current()` becomes `!current()`: the cookie is never an empty string and a null cookie already fails the check. Response handling stays per client (2 MB stream versus `response.json()`, different error text).
11. **Providers lose their hook and their cookie code.** `useAuthorizedRead`, `authorizedReadPolicy`, `SUMMARY_READ_STALE_MS` and their private types move verbatim to `hooks/use-authorized-read.ts` (no `'use client'`, like `use-current-role` and `use-permission`; all importers are client modules). The provider exports `AuthorizedQueryContext`, `privateKey` and `isAuthorizationFailure`, which both files use. `current-role-provider.tsx` moves its context cookie read and write into `lib/auth/workspace-access.ts` as `readWorkspaceContextCookie()` and `writeWorkspaceContext(profile)`, keeping its `'; '` split; `pathways-client`'s `readContextCookie` and `request-owner`'s `ownerCookie` split on `';'` and trim, so the three reads stay separate (S8).
12. **SAD routing:** `apps/web/src/lib/api/**/*.ts` routes to beneficiary-privacy-guardian beside `apps/web/src/lib/services/**/*.ts`. A dry run of `sad:check` over the whole F4b diff required all five roles: organization-isolation-checker (`lib/auth`), beneficiary-privacy-guardian, rule-engine-determinism-checker (`rule-editor.tsx`), restraint-guardian (`scripts/sad`) and design-qa-agent.
13. **Middleware must not grow.** `lib/middleware.ts` imports `lib/auth/workspace-access.ts`, which Task 6 extends. Tasks 0, 6 and 8 run `next build` and compare the `Middleware` line (F4a recorded 102 kB); growth stops the task and is reported.

## Global Constraints

- Behavior-preserving: no rendered text, class string, route, redirect, cookie, header, request, query key, cache policy or authorization decision changes. Only file locations, import specifiers and test mocks change, plus shared helpers that run the same expressions.
- Characterization tests come first: each task's new tests pass on the old code (or fail only because the new module is missing) before any duplicate is removed.
- Direction (CR 3.1): `app -> features -> components, constants, hooks, lib, providers, types -> @pathways/shared`; `apps/web/src/import-direction.test.ts` must pass at every commit.
- Moves are verbatim: `.tmp/f4b/same-lines.mjs` must exit 0 before Biome formats the new files. Move commits carry only import-path and mock-path changes plus the edits their task lists.
- A `vi.mock` path moves with the export it stubs in the same commit, counted before and after.
- Kebab-case file names that describe purpose; comments are one sentence, no emojis; docs prose has no em dashes and no `--`.
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. New untracked files need `git add -N` before `git diff --name-only` lists them.
- `pnpm typecheck` and `next build` rewrite `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` before every commit.
- After removing code, delete any import name left with no use (Biome 1.9 recommended rules do not flag unused imports).
- `git ls-files` with `':!*.test.ts'` pathspecs returns nothing in this Git for Windows setup; filter with `grep -v` as written. `git grep` pathspecs work.
- Web build: `pnpm --filter @pathways/web build > .tmp/f4b/<name>.log 2>&1; echo "exit $?"`, then `grep -E "Middleware" .tmp/f4b/<name>.log`. A pipe through `tee` would hide the exit code.
- One-off scripts live in `.tmp/f4b/` (gitignored) and are never committed; `.tmp/` also holds logs. Run them from `C:\PATHWAYS`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work in `C:\PATHWAYS` on branch `refactor/f4b-web-helpers`; no new worktree. All paths are relative to `C:\PATHWAYS`. Do not push.
- Do not touch migrations, `.env` files, review evidence, `apps/api` or `packages`.

## Review Focus

1. A test mock that still defines `PathwaysClientError` on `@/lib/services/pathways-client` while the component imports it from `@/lib/api/core/request` makes `instanceof` compare a mocked error with the real class, so a 403 branch silently stops running. Task 4 Step 4 requires `factories 49, naming 0` for `pathways-client` and `factories 24, naming 24` for the request module, from `factories 57, naming 24` before.
2. Signing out or switching workspace (a sensitive draft invalidation) must still clear pending source mutation tickets once the subscription lives in `source-mutation.ts`, and the first request must still start it. Task 4 Step 1 pins both in `request.test.ts`.
3. A read with no workspace cookie, a changed cookie, a new draft generation or an aborted signal must still be refused before dispatch, in the core client, the rules client and an artifact download. Task 5 Step 1 adds the missing-cookie case to both client tests and the aborted case to the rules test, and pins each condition in `request-owner.test.ts`.
4. A timestamp late in the evening west of UTC must show its UTC day; `2026-02-31` must still show `Date unavailable` on beneficiary and activity screens and still roll to `Mar 3, 2026` where a calendar day is formatted; a blank value must show `Date unavailable`. Task 2 Step 1 pins all of them.
5. A component test that mocks `useAuthorizedRead` must keep receiving the mock after the hook moves; a mock left on the provider path stops applying and the real hook throws `AuthorizedQueryProvider is required.`. Task 6 Step 2 requires `factories 0` on the provider path and `factories 12, naming 12` on the hook path.

## Out of F4b (recorded for later sub-projects)

- `lib/services/*` renamed to `lib/api/<domain>`, with `authorized-read-events` and `source-mutation` (slices and W1); duplicated read resource keys into `<domain>.reads.ts` (MOD-16 rest, slices).
- The other date helpers and the other `*Tone` helpers (rulings 3 and 4), `DashboardSeverity` versus `StatusTone` (S7), the two non-sticky header classes (S5).
- Raw dialogs restyled onto shared dialogs: a visible change outside a behavior-preserving refactor (slices, with a design review).
- The three workspace cookie reads (ruling 11) and the `source-mutation.ts` UUID regex (S8).

---

### Task 0: Branch setup and baseline

**Files:**
- Delete: `docs/superpowers/plans/2026-10-10-modularization-f4-web-platform.md` (F4 plan; it held the F4b outline, which this plan replaces)
- Create: `docs/superpowers/plans/2026-10-10-modularization-f4b-web-helpers.md` (this plan)
- Modify: `docs/index.md` (section 1.6 plan row)

- [ ] **Step 1: Confirm local dev contains F4a and create the branch**

```bash
cd /c/PATHWAYS
git status --short
git checkout dev
git log --oneline dev | grep -m1 "Merge refactor/f4a-web-boundaries into dev"
test -f apps/web/src/hooks/use-permission.ts && test -f packages/shared/src/rbac/route-policy.ts && echo "F4a tree present"
test -f docs/superpowers/plans/2026-10-10-modularization-f4-web-platform.md && echo "F4 plan present"
git checkout -b refactor/f4b-web-helpers
pnpm install --frozen-lockfile
mkdir -p .tmp/f4b
```

Expected: clean status, the F4a merge commit, `F4a tree present` and `F4 plan present`; install succeeds. If the merge commit or the tree is missing, stop and report: F4b builds on the F4a tree.

- [ ] **Step 2: Create the two counting scripts**

Create `.tmp/f4b/count-imports.mjs`:

```js
// Counts named imports of the given names from one web module across web source and e2e files.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const [from, ...names] = process.argv.slice(2)
const web = path.resolve('apps/web/src')
const pattern = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*(['"])([^'"]+)\3/g

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

const counts = new Map(names.map((name) => [name, 0]))
const files = new Set()
for (const file of [...walk(web), ...walk(path.resolve('apps/web/e2e'))])
  for (const match of readFileSync(file, 'utf8').matchAll(pattern)) {
    if (target(file, match[4]) !== from) continue
    for (const item of match[2].split(',').map((part) => part.trim()).filter(Boolean)) {
      const name = item.replace(/^type\s+/, '').split(/\s+as\s+/)[0]
      if (!counts.has(name)) continue
      counts.set(name, counts.get(name) + 1)
      files.add(file)
    }
  }
console.log(`${[...counts].map(([name, n]) => `${name} ${n}`).join(', ')}; files ${files.size}`)
```

Create `.tmp/f4b/mock-scan.mjs`:

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

- [ ] **Step 3: Record the baseline**

```bash
pnpm --filter @pathways/shared build
pnpm typecheck && pnpm test 2>&1 | grep -E "Tests +[0-9]+"
pnpm sad:test 2>&1 | grep -E "Tests +[0-9]+"
pnpm docs:check 2>&1 | tail -3
pnpm --filter @pathways/web build > .tmp/f4b/web-build-baseline.log 2>&1; echo "exit $?"
grep -E "Middleware" .tmp/f4b/web-build-baseline.log
git hash-object apps/web/src/lib/services/pathways-client.ts apps/web/src/providers/authorized-query-provider.tsx
node .tmp/f4b/count-imports.mjs lib/percent roundPercent cappedPercentParts formatCappedPercent
git grep -nE "^const plural = " -- apps/web/src | wc -l
git grep -nE "^(export )?const statusTone = " -- apps/web/src | wc -l
git grep -l "'sticky top-0 z-10 h-10 bg-surface-subtle px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground'" -- apps/web/src | wc -l
git grep -l "<DialogShell" -- apps/web/src | grep -v "\.test\." | wc -l
git grep -l "<ConfirmationDialog" -- apps/web/src | grep -v "\.test\." | wc -l
node .tmp/f4b/count-imports.mjs lib/services/pathways-client PathwaysClientError requestFoundation requestFoundationResponse
node .tmp/f4b/mock-scan.mjs lib/services/pathways-client PathwaysClientError requestFoundation requestFoundationResponse | tail -1
git grep -n "await import('@/lib/services/pathways-client')" -- apps/web/src | wc -l
node .tmp/f4b/count-imports.mjs providers/authorized-query-provider useAuthorizedRead authorizedReadPolicy SUMMARY_READ_STALE_MS
node .tmp/f4b/mock-scan.mjs providers/authorized-query-provider useAuthorizedRead authorizedReadPolicy SUMMARY_READ_STALE_MS | tail -1
git checkout -- apps/web/next-env.d.ts
```

Expected: typecheck clean; write down each package's passing and skipped test counts (config, shared, imports, api, web), the sad count, the docs check failure count, the web build exit code (0) and the `Middleware` size. Later tasks compare against these (`B_web`, `B_sad`, `M0`; the dry run found web 1899, sad 51 and F4a recorded 102 kB). The remaining lines print, in order:

```text
c58dd57e6e818f93ca96a4a9ea58b2ea9ad52906
6aa25396148c54812c92d6d7a4a617b92526ad20
roundPercent 2, cappedPercentParts 1, formatCappedPercent 11; files 12
3
9
4
17
8
PathwaysClientError 33, requestFoundation 7, requestFoundationResponse 5; files 37
factories 57, naming 24
3
useAuthorizedRead 27, authorizedReadPolicy 1, SUMMARY_READ_STALE_MS 1; files 27
factories 12, naming 12
```

The percent line counts 11 importers plus `percent.test.ts`. If any line differs, stop and report: the line ranges and lists below were counted at `a101ad7c`.

- [ ] **Step 4: Swap the plan files and commit**

The controller has saved this plan as `docs/superpowers/plans/2026-10-10-modularization-f4b-web-helpers.md`.

In `docs/index.md` section 1.6, replace the row starting `| [F4 web platform plan](superpowers/plans/2026-10-10-modularization-f4-web-platform.md)` with:

```markdown
| [F4b web helpers plan](superpowers/plans/2026-10-10-modularization-f4b-web-helpers.md) | 2026-10-10-modularization-f4b-web-helpers.md | 2026-10-10 | F4b of the codebase modularization: lib/format, shared sticky table head and dialog check, lib/api/core request and owner capture, thinner providers | In progress |
```

```bash
git rm docs/superpowers/plans/2026-10-10-modularization-f4-web-platform.md
git add docs/superpowers/plans/2026-10-10-modularization-f4b-web-helpers.md docs/index.md
pnpm docs:check 2>&1 | tail -3
git commit -m "docs: add the F4b plan and remove the executed F4 plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Step 3 baseline.

---

### Task 1: lib/format percent, plural and tone

**Files:**
- Move: `apps/web/src/lib/percent.ts` -> `apps/web/src/lib/format/percent.ts`, `apps/web/src/lib/percent.test.ts` -> `apps/web/src/lib/format/percent.test.ts`
- Modify (specifier only, 11 files): listed by the script in Step 2
- Create: `apps/web/src/lib/format/plural.ts`, `apps/web/src/lib/format/tone.ts`
- Test: `apps/web/src/lib/format/plural.test.ts`
- Modify: `apps/web/src/features/collection/import-workspace.tsx`, `apps/web/src/features/dashboard/role-overview/manager-overview.tsx`, `apps/web/src/features/dashboard/role-overview/portfolio-overview.tsx` (plural copies), `apps/web/src/components/pathways/status-badge.tsx`, `apps/web/src/components/pathways/metric-card.tsx`, `apps/web/src/components/pathways/progress-bar.tsx`, `apps/web/src/features/dashboard/executive-dashboard.tsx`, `apps/web/src/features/projects/budget-module/budget-math.ts` (tone unions)

**Interfaces:**
- Produces: `@/lib/format/percent` (`roundPercent`, `cappedPercentParts`, `formatCappedPercent`, definitions unchanged); `plural(count: number, word: string): string` from `@/lib/format/plural`; `type StatusTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral'` and `type SignalTone = Exclude<StatusTone, 'neutral'>` from `@/lib/format/tone`.
- Produces for later tasks: `.tmp/f4b/edit-declarations.mjs`.

- [ ] **Step 1: Create the repoint script**

Create `.tmp/f4b/repoint.mjs`:

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

// The web-relative module a specifier names, or null when it points outside apps/web/src.
const target = (file, spec) => {
  if (spec.startsWith('@/')) return spec.slice(2)
  if (!spec.startsWith('.')) return null
  const relative = path.relative(web, path.resolve(path.dirname(file), spec))
  return relative.startsWith('..') ? null : relative.split(path.sep).join('/')
}

// A sibling module is ./name; every other web module is imported through the @/ alias.
const specifier = (file, moved) => {
  const absolute = path.join(web, moved)
  return path.dirname(absolute) === path.dirname(file)
    ? `./${path.basename(absolute)}`
    : `@/${moved}`
}

let total = 0
for (const file of roots.flatMap((root) => walk(path.resolve(root)))) {
  let count = 0
  const text = readFileSync(file, 'utf8').replace(pattern, (whole, lead, quote, spec) => {
    const moved = moves.get(target(file, spec))
    if (!moved) return whole
    count++
    return `${lead}${quote}${specifier(file, moved)}${quote}`
  })
  if (!count) continue
  writeFileSync(file, text)
  total += count
  console.log(`${path.relative(process.cwd(), file).split(path.sep).join('/')}: ${count}`)
}
console.log(`total: ${total}`)
```

- [ ] **Step 2: Move percent and repoint its importers**

```bash
mkdir -p apps/web/src/lib/format
git mv apps/web/src/lib/percent.ts apps/web/src/lib/format/percent.ts
git mv apps/web/src/lib/percent.test.ts apps/web/src/lib/format/percent.test.ts
echo '{ "lib/percent": "lib/format/percent" }' > .tmp/f4b/percent-map.json
node .tmp/f4b/repoint.mjs .tmp/f4b/percent-map.json apps/web/src apps/web/e2e
git grep -n "lib/percent'" -- apps docs ':!docs/superpowers/*' ':!docs/activity-log.md'
```

Expected output, then nothing from the grep (`percent.test.ts` keeps its sibling `'./percent'`):

```text
apps/web/src/components/pathways/capped-percent.tsx: 1
apps/web/src/components/pathways/progress-bar.tsx: 1
apps/web/src/features/analytics/analytics-charts.tsx: 1
apps/web/src/features/analytics/analytics-dashboard.tsx: 1
apps/web/src/features/dashboard/executive-dashboard.tsx: 1
apps/web/src/features/dashboard/role-overview/manager-overview.tsx: 1
apps/web/src/features/dashboard/role-overview/project-metrics-reads.tsx: 1
apps/web/src/features/projects/activity-list-table.tsx: 1
apps/web/src/features/projects/budget-module/budget-overview.tsx: 1
apps/web/src/features/projects/project-indicators-workspace.tsx: 1
apps/web/src/features/projects/project-review-workspace.tsx: 1
total: 11
```

- [ ] **Step 3: Test and commit the move**

```bash
git add -N apps/web
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts' '*.tsx')
pnpm --filter @pathways/web exec vitest run src/lib/format src/components/pathways src/features/dashboard
pnpm typecheck && pnpm lint
git checkout -- apps/web/next-env.d.ts
git add -A apps/web
git status --short apps/web | grep "^R"
git commit -m "refactor(web): move percent formatting into lib/format

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass; the two `R` renames are listed.

- [ ] **Step 4: Write the failing plural test**

Create `apps/web/src/lib/format/plural.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { plural } from './plural'

describe('plural', () => {
  it('adds an s to every count except exactly one', () => {
    expect(plural(1, 'day')).toBe('1 day')
    expect(plural(0, 'project')).toBe('0 projects')
    expect(plural(2, 'suggestion')).toBe('2 suggestions')
    expect(plural(-1, 'column')).toBe('-1 columns')
    expect(plural(1.5, 'program')).toBe('1.5 programs')
  })
})
```

Run: `pnpm --filter @pathways/web exec vitest run src/lib/format/plural.test.ts`
Expected: FAIL, cannot resolve `./plural`. The three copies are already pinned by `manager-overview.test.tsx` (`pluralizes overdue days`), `portfolio-overview.test.tsx` (`pluralizes a single project and program`) and the import workspace suggestion tests.

- [ ] **Step 5: Create plural and tone**

Create `apps/web/src/lib/format/plural.ts`:

```ts
// Counts a word and adds an s unless the count is exactly one.
export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`
```

Create `apps/web/src/lib/format/tone.ts`:

```ts
// Every tone StatusBadge renders.
export type StatusTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral'

// The tones of signal surfaces such as MetricCard and ProgressBar, which have no neutral style.
export type SignalTone = Exclude<StatusTone, 'neutral'>
```

- [ ] **Step 6: Create the declaration edit script and apply the plural and tone edits**

Create `.tmp/f4b/edit-declarations.mjs`:

```js
// Applies per-file edits: replaces or deletes top-level declarations, swaps exact strings and adds one import line.
import { readFileSync, writeFileSync } from 'node:fs'

const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const starts = /^(?:export\s|const\s|let\s|function\s|async\s|class\s|type\s|interface\s|\/\/|\/\*\*)/

for (const [file, edit] of Object.entries(spec)) {
  let lines = readFileSync(file, 'utf8').split('\n')
  for (const [name, text] of Object.entries(edit.declarations ?? {})) {
    const head = new RegExp(`^(?:export\\s+)?(?:const|let|function)\\s+${name}\\b`)
    const first = lines.findIndex((line) => head.test(line))
    if (first < 0 || lines.findIndex((line, i) => i > first && head.test(line)) >= 0)
      throw new Error(`${file}: expected one declaration of ${name}`)
    let next = first + 1
    while (next < lines.length && !starts.test(lines[next])) next++
    let last = next - 1
    while (lines[last].trim() === '') last--
    // A deleted declaration that stood alone between blank lines also takes the blank line after it.
    const alone = first === 0 || lines[first - 1].trim() === ''
    const end = text === '' && alone && lines[last + 1] === '' ? last + 2 : last + 1
    lines = [...lines.slice(0, first), ...(text === '' ? [] : text.split('\n')), ...lines.slice(end)]
    console.log(`${file}: ${text === '' ? 'deleted' : 'replaced'} ${name} (${last - first + 1} lines)`)
  }
  let text = lines.join('\n')
  for (const [from, to, expected] of edit.substitute ?? []) {
    const found = text.split(from).length - 1
    if (found !== expected) throw new Error(`${file}: ${found} of ${from}, expected ${expected}`)
    text = text.replaceAll(from, to)
    console.log(`${file}: ${found}x ${from.split('\n')[0]}`)
  }
  if (edit.import) {
    const anchor = `${edit.importAfter}\n`
    if (!text.includes(anchor)) throw new Error(`${file}: anchor not found`)
    text = text.replace(anchor, `${anchor}${edit.import}\n`)
    console.log(`${file}: import added`)
  }
  writeFileSync(file, text)
}
```

Create `.tmp/f4b/plural-tone-edits.json`:

```json
{
  "apps/web/src/features/collection/import-workspace.tsx": {
    "declarations": { "plural": "" },
    "importAfter": "import { type SensitiveDraftOwner, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'",
    "import": "import { plural } from '@/lib/format/plural'"
  },
  "apps/web/src/features/dashboard/role-overview/manager-overview.tsx": {
    "declarations": { "plural": "" },
    "importAfter": "import { formatCappedPercent } from '@/lib/format/percent'",
    "import": "import { plural } from '@/lib/format/plural'"
  },
  "apps/web/src/features/dashboard/role-overview/portfolio-overview.tsx": {
    "declarations": { "plural": "" },
    "importAfter": "import { Button } from '@/components/ui/button'",
    "import": "import { plural } from '@/lib/format/plural'"
  },
  "apps/web/src/components/pathways/status-badge.tsx": {
    "substitute": [["  tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral'\n", "  tone?: StatusTone\n", 1]],
    "importAfter": "import { cn } from '@/lib/utils'",
    "import": "import type { StatusTone } from '@/lib/format/tone'"
  },
  "apps/web/src/components/pathways/metric-card.tsx": {
    "substitute": [["  tone?: 'info' | 'success' | 'warning' | 'danger'\n", "  tone?: SignalTone\n", 1]],
    "importAfter": "import { cn } from '@/lib/utils'",
    "import": "import type { SignalTone } from '@/lib/format/tone'"
  },
  "apps/web/src/components/pathways/progress-bar.tsx": {
    "substitute": [["  tone?: 'info' | 'success' | 'warning' | 'danger'\n", "  tone?: SignalTone\n", 1]],
    "importAfter": "import { cn } from '@/lib/utils'",
    "import": "import type { SignalTone } from '@/lib/format/tone'"
  },
  "apps/web/src/features/dashboard/executive-dashboard.tsx": {
    "substitute": [["  tone: 'info' | 'success' | 'warning' | 'danger'\n", "  tone: SignalTone\n", 1]],
    "importAfter": "import { formatCappedPercent } from '@/lib/format/percent'",
    "import": "import type { SignalTone } from '@/lib/format/tone'"
  },
  "apps/web/src/features/projects/budget-module/budget-math.ts": {
    "substitute": [
      ["type Tone = 'info' | 'success' | 'warning' | 'danger'\n", "", 1],
      ["export const toneFor = (pct: number | null): Tone =>", "export const toneFor = (pct: number | null): SignalTone =>", 1],
      ["type BudgetRow = {\n", "import type { SignalTone } from '@/lib/format/tone'\n\ntype BudgetRow = {\n", 1]
    ]
  }
}
```

```bash
node .tmp/f4b/edit-declarations.mjs .tmp/f4b/plural-tone-edits.json
git grep -nE "^const plural = " -- apps/web/src | wc -l
git grep -nE "'info' \| 'success' \| 'warning' \| 'danger'" -- apps/web/src/components apps/web/src/features/dashboard/executive-dashboard.tsx apps/web/src/features/projects/budget-module
```

Expected: each plural file prints `deleted plural (1 lines)` and `import added`; every other file prints its substitutions and, where it has one, `import added`; the first grep prints `0`; the second prints nothing. The 9 `statusTone` definitions are not edited (ruling 3).

- [ ] **Step 7: Run the tests and commit**

```bash
git add -N apps/web
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts' '*.tsx')
pnpm --filter @pathways/web exec vitest run src/lib/format src/components src/features/dashboard src/features/collection/import-workspace.suggestions.test.tsx src/features/projects/budget-module
pnpm typecheck && pnpm lint
pnpm --filter @pathways/web test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/web
git commit -m "refactor(web): share plural and the status and signal tone types from lib/format

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass (the dry run: 36 files, 174 tests in the targeted run); web = `B_web + 1`.

---

### Task 2: lib/format date

**Files:**
- Test (characterization, added first): `apps/web/src/features/beneficiaries/beneficiary-utils.test.ts`, `apps/web/src/features/projects/activity-utils.test.ts`, `apps/web/src/features/reports/reporting-workspace.test.tsx`, `apps/web/src/features/reports/survey-report-overview.test.tsx` (new)
- Create: `apps/web/src/lib/format/date.ts`
- Test: `apps/web/src/lib/format/date.test.ts`
- Modify: `apps/web/src/features/beneficiaries/beneficiary-utils.ts`, `apps/web/src/features/projects/activity-utils.ts`, `apps/web/src/features/reports/survey-report-overview.tsx`, `apps/web/src/features/reports/reporting-workspace.tsx`, `apps/web/src/features/analytics/analytics-dashboard.tsx`
- Delete: `apps/web/src/features/analytics/analytics-utils.ts`

**Interfaces:**
- Consumes: `.tmp/f4b/edit-declarations.mjs` (Task 1).
- Produces: `formatCalendarDay(value: string): string` and `formatDateOrUnavailable(value: string | null | undefined, formatter?: Intl.DateTimeFormat): string` from `@/lib/format/date`. `formatDate` stays exported from `features/beneficiaries/beneficiary-utils.ts` and `features/projects/activity-utils.ts` with the same signature `(value: string | null | undefined) => string`.

- [ ] **Step 1: Pin every copy's output on the current code**

In `apps/web/src/features/beneficiaries/beneficiary-utils.test.ts`, inside `describe('beneficiary date formatting', ...)`, add after the test `returns a safe label for missing or malformed values`:

```ts
  it('keeps one-digit days, trims whitespace and formats timestamps by their UTC day', () => {
    expect(formatDate('2026-01-05')).toBe('Jan 5, 2026')
    expect(formatDate(' 2026-06-18 ')).toBe('Jun 18, 2026')
    expect(formatDate('2026-06-18T23:30:00-08:00')).toBe('Jun 19, 2026')
    expect(formatDate('   ')).toBe('Date unavailable')
  })
```

In `apps/web/src/features/projects/activity-utils.test.ts`, add after the test `uses a safe fallback for missing, malformed, or impossible dates`:

```ts
  it('pads one-digit days, trims whitespace and formats timestamps by their UTC day', () => {
    expect(formatDate('2026-01-05')).toBe('Jan 05, 2026')
    expect(formatDate(' 2026-06-18 ')).toBe('Jun 18, 2026')
    expect(formatDate('2026-06-18T23:30:00-08:00')).toBe('Jun 19, 2026')
    expect(formatDate('   ')).toBe('Date unavailable')
  })
```

At the end of `apps/web/src/features/reports/reporting-workspace.test.tsx`, add:

```tsx
describe('project summary dates', () => {
  afterEach(cleanup)

  it('shows the project start and end dates as medium UTC calendar days', async () => {
    render(
      <ReportingWorkspace
        activities={[]}
        indicators={[]}
        initialKind="project-summary"
        journeyStages={[]}
        projects={[{ ...project, startDate: '2026-01-05', endDate: '2026-12-31' }]}
        reports={[]}
        surveyForms={[]}
        surveyResults={[]}
      />,
    )

    expect(await screen.findByText('Jan 5, 2026')).toBeTruthy()
    expect(screen.getByText('Dec 31, 2026')).toBeTruthy()
  })
})
```

Create `apps/web/src/features/reports/survey-report-overview.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { SurveyAggregateResultSet, SurveyFormDefinition } from '@/types/pathways'

import { SurveyReportOverview } from './survey-report-overview'

const form: SurveyFormDefinition = {
  id: 'form-a',
  title: 'Training feedback',
  formType: 'Training Survey',
  programName: 'Program A',
  projectId: 'project-a',
  fields: [],
}
const result: SurveyAggregateResultSet = {
  id: 'result-a',
  formId: 'form-a',
  projectId: 'project-a',
  location: 'Area A',
  responseDate: '2026-01-05',
  reportingPeriod: 'Q1 2026',
  responseCount: 4,
  questionResults: [],
  demographicBreakdowns: [],
}

afterEach(cleanup)

describe('SurveyReportOverview', () => {
  it('shows the exact response date as a medium UTC calendar day', () => {
    render(<SurveyReportOverview form={form} result={result} />)
    expect(screen.getByText('Jan 5, 2026')).toBeTruthy()
  })
})
```

The analytics copy is already pinned by `analytics-dashboard.test.tsx` (`SADDD opens when this project starts on Oct 15, 2026`).

Run: `pnpm --filter @pathways/web exec vitest run src/features/beneficiaries/beneficiary-utils.test.ts src/features/projects/activity-utils.test.ts src/features/reports/reporting-workspace.test.tsx src/features/reports/survey-report-overview.test.tsx src/features/analytics/analytics-dashboard.test.tsx`
Expected: PASS on the current code (5 files, 87 tests in the dry run).

- [ ] **Step 2: Write the failing shared date test**

Create `apps/web/src/lib/format/date.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { formatCalendarDay, formatDateOrUnavailable } from './date'

const twoDigitDay = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

describe('formatCalendarDay', () => {
  it('formats a calendar day as a medium UTC date', () => {
    expect(formatCalendarDay('2026-01-05')).toBe('Jan 5, 2026')
    expect(formatCalendarDay('2026-12-31')).toBe('Dec 31, 2026')
  })

  it('rolls an impossible day over and throws on a malformed one, as Intl does', () => {
    expect(formatCalendarDay('2026-02-31')).toBe('Mar 3, 2026')
    expect(() => formatCalendarDay('2026-13-01')).toThrow(RangeError)
    expect(() => formatCalendarDay('')).toThrow(RangeError)
  })
})

describe('formatDateOrUnavailable', () => {
  it('formats date-only values and timestamps by their UTC day', () => {
    expect(formatDateOrUnavailable('2026-01-05')).toBe('Jan 5, 2026')
    expect(formatDateOrUnavailable(' 2026-06-18 ')).toBe('Jun 18, 2026')
    expect(formatDateOrUnavailable('2026-06-18T23:30:00-08:00')).toBe('Jun 19, 2026')
    expect(formatDateOrUnavailable('2026-01-05', twoDigitDay)).toBe('Jan 05, 2026')
  })

  it('answers Date unavailable for missing, blank, malformed and impossible dates', () => {
    for (const value of [undefined, null, '', '   ', 'not-a-date', '2026-02-31'])
      expect(formatDateOrUnavailable(value)).toBe('Date unavailable')
  })
})
```

Run: `pnpm --filter @pathways/web exec vitest run src/lib/format/date.test.ts`
Expected: FAIL, cannot resolve `./date`.

- [ ] **Step 3: Create the shared date module**

Create `apps/web/src/lib/format/date.ts` (the second function's body is `activity-utils.ts` `formatDate` with `activityDateFormatter` replaced by `formatter`):

```ts
const mediumDateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeZone: 'UTC',
})

// Formats a YYYY-MM-DD calendar day as a medium UTC date; a malformed day throws as Intl does.
export const formatCalendarDay = (value: string) =>
  mediumDateFormatter.format(new Date(`${value}T00:00:00.000Z`))

// Formats a date-only or timestamp string, or answers Date unavailable for a blank or impossible date.
export const formatDateOrUnavailable = (
  value: string | null | undefined,
  formatter: Intl.DateTimeFormat = mediumDateFormatter,
) => {
  const normalizedValue = value?.trim()

  if (!normalizedValue) return 'Date unavailable'

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizedValue)
  const date = dateOnlyMatch
    ? new Date(
        Date.UTC(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3])),
      )
    : new Date(normalizedValue)

  const isInvalidDateOnly =
    dateOnlyMatch &&
    (date.getUTCFullYear() !== Number(dateOnlyMatch[1]) ||
      date.getUTCMonth() !== Number(dateOnlyMatch[2]) - 1 ||
      date.getUTCDate() !== Number(dateOnlyMatch[3]))

  if (Number.isNaN(date.getTime()) || isInvalidDateOnly) return 'Date unavailable'

  return formatter.format(date)
}
```

Run: `pnpm --filter @pathways/web exec vitest run src/lib/format/date.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 4: Replace the five copies**

Create `.tmp/f4b/date-edits.json`:

```json
{
  "apps/web/src/features/projects/activity-utils.ts": {
    "importAfter": "} from '@/types/pathways'",
    "import": "import { formatDateOrUnavailable } from '@/lib/format/date'",
    "declarations": {
      "formatDate": "export const formatDate = (value: string | null | undefined) =>\n  formatDateOrUnavailable(value, activityDateFormatter)"
    }
  },
  "apps/web/src/features/beneficiaries/beneficiary-utils.ts": {
    "importAfter": "} from '@/types/pathways'",
    "import": "import { formatDateOrUnavailable } from '@/lib/format/date'",
    "declarations": {
      "beneficiaryDateFormatter": "",
      "formatDate": "export const formatDate = (value: string | null | undefined) =>\n  formatDateOrUnavailable(value)"
    }
  },
  "apps/web/src/features/reports/survey-report-overview.tsx": {
    "importAfter": "} from '@/types/pathways'",
    "import": "import { formatCalendarDay } from '@/lib/format/date'",
    "declarations": { "formatDate": "" },
    "substitute": [["formatDate(result.responseDate)", "formatCalendarDay(result.responseDate)", 1]]
  },
  "apps/web/src/features/reports/reporting-workspace.tsx": {
    "importAfter": "import { useSafeProjectSelection } from '@/hooks/use-safe-project-selection'",
    "import": "import { formatCalendarDay } from '@/lib/format/date'",
    "declarations": {
      "formatDate": "const formatDate = (value?: string) => (value ? formatCalendarDay(value) : 'Date unavailable')"
    }
  },
  "apps/web/src/features/analytics/analytics-dashboard.tsx": {
    "substitute": [
      ["import { formatDate } from './analytics-utils'\n", "", 1],
      ["formatDate(selectedProject.startDate)", "formatCalendarDay(selectedProject.startDate)", 1]
    ],
    "importAfter": "import { formatCappedPercent } from '@/lib/format/percent'",
    "import": "import { formatCalendarDay } from '@/lib/format/date'"
  }
}
```

```bash
node .tmp/f4b/edit-declarations.mjs .tmp/f4b/date-edits.json
git rm -q apps/web/src/features/analytics/analytics-utils.ts
git add -N apps/web
git grep -n "analytics-utils\|beneficiaryDateFormatter" -- apps/web
git grep -n "T00:00:00.000Z\`))" -- apps/web/src
```

Expected script output:

```text
apps/web/src/features/projects/activity-utils.ts: replaced formatDate (22 lines)
apps/web/src/features/projects/activity-utils.ts: import added
apps/web/src/features/beneficiaries/beneficiary-utils.ts: deleted beneficiaryDateFormatter (4 lines)
apps/web/src/features/beneficiaries/beneficiary-utils.ts: replaced formatDate (26 lines)
apps/web/src/features/beneficiaries/beneficiary-utils.ts: import added
apps/web/src/features/reports/survey-report-overview.tsx: deleted formatDate (5 lines)
apps/web/src/features/reports/survey-report-overview.tsx: 1x formatDate(result.responseDate)
apps/web/src/features/reports/survey-report-overview.tsx: import added
apps/web/src/features/reports/reporting-workspace.tsx: replaced formatDate (10 lines)
apps/web/src/features/reports/reporting-workspace.tsx: import added
apps/web/src/features/analytics/analytics-dashboard.tsx: 1x import { formatDate } from './analytics-utils'
apps/web/src/features/analytics/analytics-dashboard.tsx: 1x formatDate(selectedProject.startDate)
apps/web/src/features/analytics/analytics-dashboard.tsx: import added
```

The first grep prints nothing; the second prints only `apps/web/src/lib/format/date.ts`.

- [ ] **Step 5: Run the tests and commit**

```bash
git add -N apps/web
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts' '*.tsx')
pnpm --filter @pathways/web exec vitest run src/lib/format src/features/beneficiaries src/features/projects/activity src/features/reports src/features/analytics/analytics-dashboard.test.tsx src/features/projects/budget-module
pnpm typecheck && pnpm lint
pnpm --filter @pathways/web test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/web
git commit -m "refactor(web): share calendar-day and validated date formatting from lib/format

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass (dry run: 40 files, 415 tests in the targeted run); web = `B_web + 9`.

---

### Task 3: Shared sticky table head and the dialog check

**Files:**
- Test (characterization, added first): `apps/web/src/features/projects/live-evaluation-workspace.test.tsx`
- Create: `apps/web/src/components/pathways/sticky-table-head.ts`
- Test: `apps/web/src/components/pathways/sticky-table-head.test.ts`
- Modify: `apps/web/src/features/projects/activity-list-table.tsx`, `apps/web/src/features/projects/indicator-library-manager.tsx`, `apps/web/src/features/projects/live-evaluation-workspace.tsx`, `apps/web/src/features/projects/project-indicators-workspace.tsx`

**Interfaces:**
- Consumes: `.tmp/f4b/edit-declarations.mjs` (Task 1).
- Produces: `stickyTableHeadClass: string` from `@/components/pathways/sticky-table-head`.

- [ ] **Step 1: Pin a rendered header row on the current code**

In `apps/web/src/features/projects/live-evaluation-workspace.test.tsx`, add directly before the test `shows a manual row without a note as a manual score with no note`:

```tsx
  it('renders the score table headers with the sticky table head classes', () => {
    state.evaluation = { ...openEvaluation }
    render(<LiveEvaluationWorkspace projectId={projectId} />)
    expect(screen.getAllByRole('columnheader').map((cell) => cell.className)).toEqual(
      Array(4).fill(
        'sticky top-0 z-10 h-10 bg-surface-subtle px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground',
      ),
    )
  })
```

Run: `pnpm --filter @pathways/web exec vitest run src/features/projects/live-evaluation-workspace.test.tsx`
Expected: PASS on the current code (11 tests).

- [ ] **Step 2: Write the failing class test**

Create `apps/web/src/components/pathways/sticky-table-head.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { cn } from '@/lib/utils'

import { stickyTableHeadClass } from './sticky-table-head'

const base =
  'sticky top-0 z-10 h-10 bg-surface-subtle px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground'

describe('stickyTableHeadClass', () => {
  it('keeps the left-aligned sticky header classes the four tables rendered', () => {
    expect(stickyTableHeadClass).toBe(
      'sticky top-0 z-10 h-10 bg-surface-subtle px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground',
    )
  })

  it('lets an alignment passed through cn replace text-left', () => {
    expect(cn(stickyTableHeadClass, 'text-center')).toBe(`${base} text-center`)
    expect(cn(stickyTableHeadClass, 'text-right')).toBe(`${base} text-right`)
  })
})
```

Run: `pnpm --filter @pathways/web exec vitest run src/components/pathways/sticky-table-head.test.ts`
Expected: FAIL, cannot resolve `./sticky-table-head`.

- [ ] **Step 3: Create the class and replace the four constants**

Create `apps/web/src/components/pathways/sticky-table-head.ts`:

```ts
// Header cell classes for scrolling data tables whose header row stays in view.
export const stickyTableHeadClass =
  'sticky top-0 z-10 h-10 bg-surface-subtle px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground'
```

Create `.tmp/f4b/table-head-edits.json`:

```json
{
  "apps/web/src/features/projects/activity-list-table.tsx": {
    "declarations": { "headClass": "" },
    "substitute": [["headClass", "stickyTableHeadClass", 8]],
    "importAfter": "import { CappedPercent, SectionCard, StatusBadge } from '@/components/pathways'",
    "import": "import { stickyTableHeadClass } from '@/components/pathways/sticky-table-head'"
  },
  "apps/web/src/features/projects/indicator-library-manager.tsx": {
    "declarations": { "headClass": "" },
    "substitute": [["headClass", "stickyTableHeadClass", 5]],
    "importAfter": "import { PageHeader } from '@/components/layout/page-header'",
    "import": "import { stickyTableHeadClass } from '@/components/pathways/sticky-table-head'"
  },
  "apps/web/src/features/projects/live-evaluation-workspace.tsx": {
    "declarations": { "headClass": "" },
    "substitute": [["headClass", "stickyTableHeadClass", 4]],
    "importAfter": "import { MetricTooltip } from '@/components/pathways/metric-tooltip'",
    "import": "import { stickyTableHeadClass } from '@/components/pathways/sticky-table-head'"
  },
  "apps/web/src/features/projects/project-indicators-workspace.tsx": {
    "declarations": { "headClass": "" },
    "substitute": [["headClass", "stickyTableHeadClass", 6]],
    "importAfter": "import { MetricTooltip } from '@/components/pathways/metric-tooltip'",
    "import": "import { stickyTableHeadClass } from '@/components/pathways/sticky-table-head'"
  }
}
```

```bash
node .tmp/f4b/edit-declarations.mjs .tmp/f4b/table-head-edits.json
git add -N apps/web
git grep -l "'sticky top-0 z-10 h-10 bg-surface-subtle px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground'" -- apps/web/src
git grep -nw "headClass" -- apps/web/src/features/projects
```

Expected: each file prints `deleted headClass (2 lines)`, its substitution count (8, 5, 4, 6: the 23 uses) and `import added`. The literal is left only in `components/pathways/sticky-table-head.ts`, its test and `live-evaluation-workspace.test.tsx`; the last grep prints nothing.

- [ ] **Step 4: Rerun the dialog check (ruling 6)**

```bash
git grep -n 'DialogContent className="rounded-lg"' -- apps/web/src
git grep -n "onOpenAutoFocus" -- apps/web/src | grep -v "\.test\."
git grep -l "<DialogContent" -- apps/web/src | grep -v "\.test\.\|components/ui/\|dialog-shell\|confirmation-dialog" | wc -l
```

Expected: the first prints only `components/pathways/dialog-shell.tsx`, the second only `components/pathways/confirmation-dialog.tsx`, the third `16` (13 raw-only files plus 3 mixed). No raw dialog renders a shared dialog's markup, so no dialog code changes; Task 7 records "no exact duplicate". If either grep lists another file, stop and report: that dialog needs a markup comparison before any change.

- [ ] **Step 5: Run the tests and commit**

```bash
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts' '*.tsx')
pnpm --filter @pathways/web exec vitest run src/components/pathways src/features/projects src/import-direction.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/web test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/web
git commit -m "refactor(web): share the sticky table head class across four data tables

A dialog check found no raw dialog whose markup equals DialogShell or ConfirmationDialog.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass (dry run: 46 files, 388 tests for the first two paths); web = `B_web + 12`.

---

### Task 4: lib/api/core request

**Files:**
- Create: `apps/web/src/lib/api/core/request.ts`
- Test: `apps/web/src/lib/api/core/request.test.ts`
- Modify: `apps/web/src/lib/services/pathways-client.ts` (moved lines removed, imports replaced), `apps/web/src/lib/services/source-mutation.ts` (subscription appended)
- Modify (import split, 37 files): listed by the script in Step 4
- Modify (mock move, 24 files): the 23 listed by the script in Step 4 plus `apps/web/src/lib/auth/beneficiary-step-up.test.ts` (manual)
- Modify (dynamic import, 3 files): `apps/web/src/features/collection/direct-entry-ownership.test.tsx`, `apps/web/src/features/projects/project-activities-workspace.test.tsx`, `apps/web/src/providers/authorized-query-cache.test.tsx`

**Interfaces:**
- Produces, from `@/lib/api/core/request` (definitions unchanged): `class PathwaysClientError extends Error` with `(message: string, code: 'not_configured' | 'network' | 'unauthorized' | 'forbidden' | 'not_found' | 'invalid', fieldErrors: FormValidationError[] = [], status?: number, stepUpRequired = false)`; `requestFoundationResponse(path: string, init: RequestInit = {}, isCurrent?: () => boolean): Promise<Response>`; `requestFoundation(path: string, init: RequestInit = {}, isCurrent?: () => boolean): Promise<any>`.
- Produces: `ensureSourceInvalidationSubscription(): void` exported from `@/lib/services/source-mutation`.
- Produces for later tasks: `.tmp/f4b/same-lines.mjs`, `.tmp/f4b/split-imports.mjs`, `.tmp/f4b/move-mock-entries.mjs`.

- [ ] **Step 1: Write the failing request test**

Create `apps/web/src/lib/api/core/request.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/env', () => ({ webEnv: { NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api' } }))
vi.mock('@/lib/supabase/client', () => ({ getBrowserSupabaseClient: () => null }))

import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'
import { sourceMutationTickets } from '@/lib/services/source-mutation'
import { PathwaysClientError, requestFoundationResponse } from './request'

const context = { principalKey: 'synthetic-owner-a', isCurrent: () => true }
const operation = 'POST:/projects/synthetic'

describe('requestFoundationResponse', () => {
  it('refuses a request whose ownership already changed', async () => {
    const request = requestFoundationResponse('/synthetic', {}, () => false)
    await expect(request).rejects.toBeInstanceOf(PathwaysClientError)
    await expect(request).rejects.toThrow('Request ownership changed.')
  })

  it('subscribes the source mutation tickets to sensitive draft invalidation when it requests', async () => {
    await expect(
      sourceMutationTickets.execute(
        context,
        operation,
        { title: 'Synthetic' },
        () => Promise.reject(new Error('lost response')),
        (value) => value,
      ),
    ).rejects.toThrow('lost response')
    clearSensitiveDraftStorage()
    expect(sourceMutationTickets.pendingRecovery(context, operation)).not.toBeNull()

    await expect(requestFoundationResponse('/synthetic')).rejects.toMatchObject({
      code: 'not_configured',
    })
    clearSensitiveDraftStorage()
    expect(sourceMutationTickets.pendingRecovery(context, operation)).toBeNull()
  })
})
```

The second test proves the ticket survives an invalidation before any request, and is cleared once a request has subscribed (it fails at the missing Supabase client, after the subscription).

Run: `pnpm --filter @pathways/web exec vitest run src/lib/api/core/request.test.ts`
Expected: FAIL, cannot resolve `./request`.

- [ ] **Step 2: Create the move scripts**

Create `.tmp/f4b/same-lines.mjs`:

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

Create `.tmp/f4b/split-imports.mjs`:

```js
// Moves the named imports listed in a map from one web module to new modules; unlisted names stay.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [mapFile, ...roots] = process.argv.slice(2)
const { from, names } = JSON.parse(readFileSync(mapFile, 'utf8'))
const web = path.resolve('apps/web/src')
const pattern = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*(['"])([^'"]+)\3/g

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

// The unchanged specifier for names that stay; a sibling is ./name; any other module uses the @/ alias.
const specifier = (file, spec, destination) => {
  if (destination === from) return spec
  const absolute = path.join(web, destination)
  return path.dirname(absolute) === path.dirname(file)
    ? `./${path.basename(absolute)}`
    : `@/${destination}`
}

let total = 0
for (const file of roots.flatMap((root) => walk(path.resolve(root)))) {
  let count = 0
  const text = readFileSync(file, 'utf8').replace(pattern, (whole, typeOnly, list, quote, spec) => {
    if (target(file, spec) !== from) return whole
    const groups = new Map()
    for (const item of list.split(',').map((part) => part.trim()).filter(Boolean)) {
      const name = item.replace(/^type\s+/, '').split(/\s+as\s+/)[0]
      const destination = names[name] ?? from
      groups.set(destination, [...(groups.get(destination) ?? []), item])
    }
    if (groups.size === 1 && groups.has(from)) return whole
    count++
    return [...groups]
      .map(
        ([destination, items]) =>
          `import ${typeOnly ?? ''}{ ${items.join(', ')} } from ${quote}${specifier(file, spec, destination)}${quote}`,
      )
      .join('\n')
  })
  if (!count) continue
  writeFileSync(file, text)
  total += count
  console.log(`${path.relative(process.cwd(), file).split(path.sep).join('/')}: ${count}`)
}
console.log(`total: ${total}`)
```

Create `.tmp/f4b/move-mock-entries.mjs`:

```js
// Moves the listed properties of vi.mock factories for one web module into a vi.mock of the module that now exports them.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [specFile, ...roots] = process.argv.slice(2)
const { from, to, names } = JSON.parse(readFileSync(specFile, 'utf8'))
const web = path.resolve('apps/web/src')
const call = /vi\.(mock|doMock)\(\s*(['"])([^'"]+)\2\s*,\s*/g

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

// A sibling module is ./name; every other web module uses the @/ alias.
const specifier = (file) =>
  path.dirname(path.join(web, to)) === path.dirname(file) ? `./${path.basename(to)}` : `@/${to}`

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
  return result
}

const key = (part) =>
  /^\s*(?:\/\/[^\n]*\n\s*)*([A-Za-z_$][\w$]*)\s*(?::|$)/.exec(part)?.[1] ?? null

let moved = 0
for (const file of roots.flatMap((root) => walk(path.resolve(root)))) {
  let text = readFileSync(file, 'utf8')
  const edits = []
  for (const match of text.matchAll(call)) {
    if (target(file, match[3]) !== from) continue
    const factoryStart = match.index + match[0].length
    const end = close(text, match.index + match[0].indexOf('('))
    const factory = text.slice(factoryStart, end - 1)
    const line = text.slice(0, match.index).split('\n').length
    const mentioned = names.filter((name) => new RegExp(`\\b${name}\\b`).test(factory))
    if (!mentioned.length) continue
    if (!/^\(\)\s*=>\s*\(\{/.test(factory)) {
      console.log(`${path.relative(process.cwd(), file).split(path.sep).join('/')}:${line}: manual`)
      continue
    }
    const open = factory.indexOf('{')
    const objectEnd = close(factory, open)
    const all = parts(factory.slice(open + 1, objectEnd - 1))
    const tail = all.at(-1).trim() === '' ? all.pop() : ''
    const keep = all.filter((part) => !names.includes(key(part)))
    const take = all.filter((part) => names.includes(key(part)))
    const quote = match[2]
    const newMock = `vi.${match[1]}(${quote}${specifier(file)}${quote}, () => ({ ${take.map((part) => part.trim()).join(', ')} }))`
    const replacement = keep.length
      ? `vi.${match[1]}(${quote}${match[3]}${quote}, ${factory.slice(0, open + 1)}${keep.join(',')},${tail}${factory.slice(objectEnd - 1)})\n${newMock}`
      : newMock
    edits.push({ start: match.index, end, replacement })
    moved++
    console.log(
      `${path.relative(process.cwd(), file).split(path.sep).join('/')}:${line}: ${keep.length ? 'split' : 'renamed'} (${take.map(key).join(', ')})`,
    )
  }
  for (const edit of edits.reverse())
    text = text.slice(0, edit.start) + edit.replacement + text.slice(edit.end)
  if (edits.length) writeFileSync(file, text)
}
console.log(`total: ${moved}`)
```

- [ ] **Step 3: Cut the request core out verbatim**

```bash
P=apps/web/src/lib/services/pathways-client.ts
R=apps/web/src/lib/api/core/request.ts
M=apps/web/src/lib/services/source-mutation.ts
git hash-object $P
git show HEAD:$P > .tmp/f4b/pathways-client.before.ts
cat > .tmp/f4b/request-imports.ts <<'EOF'
import { approvedApiBaseUrl } from '@/lib/api-base-url'
import { announceStepUpRequired } from '@/lib/auth/beneficiary-step-up-events'
import { sensitiveDraftGeneration } from '@/lib/auth/sensitive-drafts'
import { contextCookieName, decodeWorkspaceContext } from '@/lib/auth/workspace-access'
import { webEnv } from '@/lib/env'
import {
  announceAuthorizationDenied,
  announceWriteCommitted,
} from '@/lib/services/authorized-read-events'
import { ensureSourceInvalidationSubscription } from '@/lib/services/source-mutation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import type { FormValidationError } from '@/types/pathways'
import { STEP_UP_REQUIRED_CODE } from '@pathways/shared'

EOF
{ cat .tmp/f4b/request-imports.ts; sed -n '174,193p;1938,1946p;1962,2110p' $P; } > $R
{ printf '\n'; sed -n '1850,1855p' $P | sed -e 's/sourceTickets\.clear()/sourceMutationTickets.clear()/' -e 's/^function /export function /'; } >> $M
sed -i "1i import { subscribeSensitiveDraftInvalidation } from '@/lib/auth/sensitive-drafts'\n" $M
sed -i -e '2103,2111d' -e '1962,2102d' -e '1938,1946d' -e '1850,1855d' -e '174,193d' -e '111,112d' -e '83d' -e '47d' -e '19d' -e '16,17d' -e '1,4d' $P
sed -i "s#^  sourceMutationTickets,\$#  ensureSourceInvalidationSubscription,\n&#" $P
sed -i "s#^import { webEnv } from '@/lib/env'\$#import {\n  PathwaysClientError,\n  requestFoundation,\n  requestFoundationResponse,\n} from '@/lib/api/core/request'\n&#" $P
sed '111,112d' .tmp/f4b/pathways-client.before.ts > .tmp/f4b/pathways-client.body.ts
tail -n 7 $M > .tmp/f4b/moved-subscription.ts
wc -l $P $R $M
node .tmp/f4b/same-lines.mjs .tmp/f4b/pathways-client.body.ts $P $R .tmp/f4b/moved-subscription.ts "sourceMutationTickets.clear()=sourceTickets.clear()"
```

What the deletions remove from `pathways-client.ts`: lines 1 to 4 (the `sensitive-drafts` import, both names now unused), 16 and 17 (`approvedApiBaseUrl`, `contextCookieName`, `decodeWorkspaceContext`), 19 (`getBrowserSupabaseClient`), 47 (`FormValidationError` in the type list), 83 (`STEP_UP_REQUIRED_CODE`), 111 and 112 (the mid-file `announce*` imports), and the moved ranges. Line 1849 (`const sourceTickets = sourceMutationTickets`) and line 1856 (the top-level `ensureSourceInvalidationSubscription()` call) stay. The comparison drops the two mid-file imports from the original because `request.ts` re-declares them in its import block.

Expected: the hash is `c58dd57e6e818f93ca96a4a9ea58b2ea9ad52906`; `2596`, `192` and `356` lines; `same lines: 2520` with exit 0. Any other output from `same-lines.mjs`: stop, the cut is not verbatim.

- [ ] **Step 4: Repoint importers, mocks and dynamic imports**

Create `.tmp/f4b/request-map.json`:

```json
{
  "from": "lib/services/pathways-client",
  "names": {
    "PathwaysClientError": "lib/api/core/request",
    "requestFoundation": "lib/api/core/request",
    "requestFoundationResponse": "lib/api/core/request"
  }
}
```

Create `.tmp/f4b/request-mocks.json`:

```json
{
  "from": "lib/services/pathways-client",
  "to": "lib/api/core/request",
  "names": ["PathwaysClientError", "requestFoundation", "requestFoundationResponse"]
}
```

```bash
node .tmp/f4b/split-imports.mjs .tmp/f4b/request-map.json apps/web/src apps/web/e2e
node .tmp/f4b/move-mock-entries.mjs .tmp/f4b/request-mocks.json apps/web/src
sed -i "s#'@/lib/services/pathways-client'#'@/lib/api/core/request'#g" apps/web/src/lib/auth/beneficiary-step-up.test.ts
sed -i "s#^\(\s*\)const { PathwaysClientError } = await import('@/lib/services/pathways-client')\$#\1const { PathwaysClientError } = await import('@/lib/api/core/request')#" \
  apps/web/src/features/collection/direct-entry-ownership.test.tsx \
  apps/web/src/features/projects/project-activities-workspace.test.tsx \
  apps/web/src/providers/authorized-query-cache.test.tsx
```

Expected `split-imports.mjs` output: one line with `: 1` for each of these 37 files, then `total: 37`:

```text
apps/web/src/features/analytics/human-review-action.tsx
apps/web/src/features/analytics/rule-editor.tsx
apps/web/src/features/analytics/use-project-map.ts
apps/web/src/features/beneficiaries/beneficiary-detail-loader.tsx
apps/web/src/features/beneficiaries/beneficiary-form-loader.tsx
apps/web/src/features/beneficiaries/beneficiary-media-proof.tsx
apps/web/src/features/beneficiaries/journey-stages-loader.tsx
apps/web/src/features/collection/direct-form-entry-workspace.tsx
apps/web/src/features/projects/activity-explain-delay-dialog.test.tsx
apps/web/src/features/projects/activity-extension-panel.test.tsx
apps/web/src/features/projects/activity-extension-panel.tsx
apps/web/src/features/projects/activity-progress-dialog.test.tsx
apps/web/src/features/projects/activity-progress-dialog.tsx
apps/web/src/features/projects/activity-proof-dialog.test.tsx
apps/web/src/features/projects/activity-proof-dialog.tsx
apps/web/src/features/projects/indicator-library-manager.tsx
apps/web/src/features/projects/private-proof-inspection.tsx
apps/web/src/features/projects/private-proof-preview.tsx
apps/web/src/features/projects/project-activities-workspace.tsx
apps/web/src/features/projects/project-detail-view.test.tsx
apps/web/src/features/projects/project-detail-view.tsx
apps/web/src/features/projects/project-indicators-workspace.tsx
apps/web/src/features/projects/project-setup-form.tsx
apps/web/src/features/rules-board/rule-drawer.tsx
apps/web/src/lib/auth/beneficiary-step-up.test.ts
apps/web/src/lib/auth/beneficiary-step-up.ts
apps/web/src/lib/services/analytics-insights-client.ts
apps/web/src/lib/services/core-feature-client.ts
apps/web/src/lib/services/indicator-library-client.ts
apps/web/src/lib/services/own-profile-client.ts
apps/web/src/lib/services/pathways-client.activity-review.test.ts
apps/web/src/lib/services/pathways-client.capabilities.test.ts
apps/web/src/lib/services/pathways-client.project-data.test.ts
apps/web/src/lib/services/pathways-client.test.ts
apps/web/src/lib/services/private-proof-client.ts
apps/web/src/lib/services/rules-human-client.ts
apps/web/src/providers/authorized-query-provider.tsx
```

Expected `move-mock-entries.mjs` output (ruling 9):

```text
apps/web/src/features/analytics/recommendation-detail-workspace.test.tsx:39: split (PathwaysClientError)
apps/web/src/features/analytics/rule-editor.test.tsx:42: split (PathwaysClientError)
apps/web/src/features/beneficiaries/beneficiary-detail-loader.test.tsx:25: split (PathwaysClientError)
apps/web/src/features/beneficiaries/beneficiary-form-loader.test.tsx:21: split (PathwaysClientError)
apps/web/src/features/collection/direct-entry-ownership.test.tsx:28: split (PathwaysClientError)
apps/web/src/features/collection/direct-form-entry-workspace.test.tsx:27: split (PathwaysClientError)
apps/web/src/features/projects/indicator-library-manager.test.tsx:31: renamed (PathwaysClientError)
apps/web/src/features/projects/private-proof-inspection.test.tsx:24: renamed (PathwaysClientError)
apps/web/src/features/projects/project-activities-rbac.test.tsx:46: split (PathwaysClientError)
apps/web/src/features/projects/project-activities-workspace.test.tsx:47: split (PathwaysClientError)
apps/web/src/features/projects/project-indicators-workspace.reload.test.tsx:71: split (PathwaysClientError)
apps/web/src/features/projects/project-indicators-workspace.test.tsx:59: split (PathwaysClientError)
apps/web/src/features/projects/project-review-workspace.test.tsx:46: split (PathwaysClientError)
apps/web/src/features/projects/project-rules-panel.test.tsx:34: renamed (PathwaysClientError)
apps/web/src/features/projects/project-setup-form.test.tsx:21: split (PathwaysClientError)
apps/web/src/features/projects/project-team-editor-dialog.test.tsx:26: split (PathwaysClientError)
apps/web/src/features/rules-board/rule-drawer.test.tsx:28: split (PathwaysClientError)
apps/web/src/features/rules-board/rules-board.test.tsx:34: split (PathwaysClientError)
apps/web/src/features/settings/user-management-workspace.test.tsx:94: split (PathwaysClientError)
apps/web/src/lib/auth/beneficiary-step-up.test.ts:11: manual
apps/web/src/lib/services/private-proof-client.test.ts:4: renamed (PathwaysClientError, requestFoundation, requestFoundationResponse)
apps/web/src/lib/services/rules-human-client.test.ts:6: renamed (requestFoundationResponse, PathwaysClientError)
apps/web/src/providers/authorized-query-cache.test.tsx:35: renamed (PathwaysClientError)
apps/web/src/providers/authorized-query-provider.test.tsx:25: renamed (PathwaysClientError)
total: 23
```

The `manual` line is the `importActual` factory that the first `sed` swaps whole (its three `pathways-client` references become `'@/lib/api/core/request'`).

```bash
node .tmp/f4b/count-imports.mjs lib/services/pathways-client PathwaysClientError requestFoundation requestFoundationResponse
node .tmp/f4b/count-imports.mjs lib/api/core/request PathwaysClientError requestFoundation requestFoundationResponse
node .tmp/f4b/mock-scan.mjs lib/services/pathways-client PathwaysClientError requestFoundation requestFoundationResponse | tail -1
node .tmp/f4b/mock-scan.mjs lib/api/core/request PathwaysClientError requestFoundation requestFoundationResponse | tail -1
git grep -n "await import('@/lib/api/core/request')" -- apps/web/src | wc -l
git grep -n "pathways-client'" -- apps/web/src/lib/auth/beneficiary-step-up.test.ts
```

Expected (Review Focus 1): `PathwaysClientError 0, requestFoundation 0, requestFoundationResponse 0; files 0`; `PathwaysClientError 35, requestFoundation 8, requestFoundationResponse 7; files 39` (the 37 plus `pathways-client.ts` and `request.test.ts`); `factories 49, naming 0`; `factories 24, naming 24`; `3`; nothing.

- [ ] **Step 5: Run the tests and commit**

```bash
git add -N apps/web
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts' '*.tsx')
pnpm --filter @pathways/web exec vitest run src/lib src/providers src/features/projects src/features/beneficiaries src/features/collection src/features/analytics src/features/rules-board src/features/settings src/import-direction.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/web test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/web
git commit -m "refactor(web): move the request core from pathways-client into lib/api/core

PathwaysClientError, requestFoundationResponse and requestFoundation move verbatim; the source ticket invalidation subscription moves beside the tickets. 37 importers and 24 test mocks follow.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass; web = `B_web + 14` (the dry run: 1913 across 214 files).

---

### Task 5: Request owner capture

**Files:**
- Test (characterization, added first): `apps/web/src/lib/services/rules-human-client.test.ts`, `apps/web/src/lib/services/core-feature-client.test.ts`
- Create: `apps/web/src/lib/api/core/request-owner.ts`
- Test: `apps/web/src/lib/api/core/request-owner.test.ts`
- Modify: `apps/web/src/lib/services/core-feature-client.ts`, `apps/web/src/lib/services/rules-human-client.ts`

**Interfaces:**
- Consumes: `.tmp/f4b/edit-declarations.mjs` (Task 1).
- Produces: `captureRequestOwner(signal?: AbortSignal | null): () => boolean` from `@/lib/api/core/request-owner`.

- [ ] **Step 1: Pin the refusals on the current code**

In `apps/web/src/lib/services/rules-human-client.test.ts`, add directly before the test `rejects unknown query selectors and malformed optimistic revisions before dispatch`:

```ts
  it('refuses a read without a workspace cookie or with an aborted signal before dispatch', async () => {
    document.cookie = 'pathways-context=; Path=/; Max-Age=0'
    await expect(rulesHumanClient.getRecommendation(id)).rejects.toThrow(
      'Current workspace access is required.',
    )
    document.cookie = 'pathways-context=owner-a; Path=/'
    const controller = new AbortController()
    controller.abort()
    await expect(rulesHumanClient.getRecommendation(id, controller.signal)).rejects.toThrow(
      'Current workspace access is required.',
    )
    expect(transport).not.toHaveBeenCalled()
  })
```

In `apps/web/src/lib/services/core-feature-client.test.ts`, add directly before the test `cancels a JSON response arriving after ownership invalidation before reading its body`:

```ts
  it('refuses reads and downloads without a workspace cookie before dispatch', async () => {
    document.cookie = ''
    await expect(coreDataClient.evaluation(projectId)).rejects.toThrow('Current workspace access')
    await expect(
      downloadCoreArtifact('/synthetic-artifact', 'report-synthetic.pdf'),
    ).rejects.toThrow('Current artifact access')
    expect(fetcher).not.toHaveBeenCalled()
  })
```

The cookie-change and invalidation cases are already pinned by both files; the aborted case already by the core file.

Run: `pnpm --filter @pathways/web exec vitest run src/lib/services/rules-human-client.test.ts src/lib/services/core-feature-client.test.ts`
Expected: PASS on the current code.

- [ ] **Step 2: Write the failing capture test**

Create `apps/web/src/lib/api/core/request-owner.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'

import { captureRequestOwner } from './request-owner'

afterEach(() => {
  document.cookie = 'pathways-context=; Path=/; Max-Age=0'
})

describe('captureRequestOwner', () => {
  it('stays current while the workspace cookie and draft generation are unchanged', () => {
    document.cookie = 'theme=dark; Path=/'
    document.cookie = 'pathways-context=owner-a; Path=/'
    expect(captureRequestOwner()()).toBe(true)
  })

  it('fails without a workspace cookie', () => {
    expect(captureRequestOwner()()).toBe(false)
  })

  it('fails once the workspace cookie or the draft generation changes', () => {
    document.cookie = 'pathways-context=owner-a; Path=/'
    const cookieOwner = captureRequestOwner()
    document.cookie = 'pathways-context=owner-b; Path=/'
    expect(cookieOwner()).toBe(false)
    const generationOwner = captureRequestOwner()
    clearSensitiveDraftStorage()
    expect(generationOwner()).toBe(false)
  })

  it('fails once its signal aborts', () => {
    document.cookie = 'pathways-context=owner-a; Path=/'
    const controller = new AbortController()
    const current = captureRequestOwner(controller.signal)
    expect(current()).toBe(true)
    controller.abort()
    expect(current()).toBe(false)
  })
})
```

Run: `pnpm --filter @pathways/web exec vitest run src/lib/api/core/request-owner.test.ts`
Expected: FAIL, cannot resolve `./request-owner`.

- [ ] **Step 3: Create the capture and replace the three sites**

Create `apps/web/src/lib/api/core/request-owner.ts` (`ownerCookie` is lines 8 to 14 of `core-feature-client.ts`, identical to lines 34 to 40 of `rules-human-client.ts`):

```ts
import { sensitiveDraftGeneration } from '@/lib/auth/sensitive-drafts'
import { contextCookieName } from '@/lib/auth/workspace-access'

// The whole workspace context cookie entry, or null outside the browser or when it is missing.
const ownerCookie = () =>
  typeof document === 'undefined'
    ? null
    : (document.cookie
        .split(';')
        .map((value) => value.trim())
        .find((value) => value.startsWith(`${contextCookieName}=`)) ?? null)

// Captures the workspace cookie and draft generation; the check fails once either changes or the signal aborts.
export const captureRequestOwner = (signal?: AbortSignal | null) => {
  const owner = ownerCookie()
  const generation = sensitiveDraftGeneration()
  return () =>
    owner !== null &&
    owner === ownerCookie() &&
    generation === sensitiveDraftGeneration() &&
    !signal?.aborted
}
```

Create `.tmp/f4b/owner-edits.json`:

```json
{
  "apps/web/src/lib/services/core-feature-client.ts": {
    "declarations": { "ownerCookie": "" },
    "substitute": [
      ["import { sensitiveDraftGeneration } from '@/lib/auth/sensitive-drafts'\nimport { contextCookieName } from '@/lib/auth/workspace-access'\n", "import { captureRequestOwner } from '@/lib/api/core/request-owner'\n", 1],
      ["  const owner = ownerCookie()\n  const generation = sensitiveDraftGeneration()\n  const current = () =>\n    owner !== null &&\n    owner === ownerCookie() &&\n    generation === sensitiveDraftGeneration() &&\n    !init.signal?.aborted\n", "  const current = captureRequestOwner(init.signal)\n", 1],
      ["  const owner = ownerCookie()\n  const generation = sensitiveDraftGeneration()\n  const current = () =>\n    isOwnerCurrent() &&\n    owner !== null &&\n    owner === ownerCookie() &&\n    generation === sensitiveDraftGeneration()\n", "  const owned = captureRequestOwner()\n  const current = () => isOwnerCurrent() && owned()\n", 1]
    ]
  },
  "apps/web/src/lib/services/rules-human-client.ts": {
    "declarations": { "ownerCookie": "" },
    "substitute": [
      ["import { sensitiveDraftGeneration } from '@/lib/auth/sensitive-drafts'\nimport { contextCookieName } from '@/lib/auth/workspace-access'\n", "import { captureRequestOwner } from '@/lib/api/core/request-owner'\n", 1],
      ["  const cookie = ownerCookie()\n  const generation = sensitiveDraftGeneration()\n  const current = () =>\n    !init.signal?.aborted && generation === sensitiveDraftGeneration() && cookie === ownerCookie()\n  if (!cookie || !current())\n", "  const current = captureRequestOwner(init.signal)\n  if (!current())\n", 1]
    ]
  }
}
```

```bash
node .tmp/f4b/edit-declarations.mjs .tmp/f4b/owner-edits.json
git grep -n "ownerCookie\|sensitiveDraftGeneration\|contextCookieName" -- apps/web/src/lib/services/core-feature-client.ts apps/web/src/lib/services/rules-human-client.ts
```

Expected: each file prints `deleted ownerCookie (7 lines)` and its substitutions (3 and 2); the grep prints nothing. The `fetchCoreArtifact` check keeps its order: `isOwnerCurrent()` first, then the captured owner.

- [ ] **Step 4: Run the tests and commit**

```bash
git add -N apps/web
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts' '*.tsx')
pnpm --filter @pathways/web exec vitest run src/lib/services src/lib/api src/features/reports src/features/analytics/human-review-workspace.test.tsx src/features/analytics/recommendation-detail-workspace.test.tsx src/features/projects/live-evaluation-workspace.test.tsx
pnpm typecheck && pnpm lint
pnpm --filter @pathways/web test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/web
git commit -m "refactor(web): capture request ownership once in lib/api/core

The core and rules reads and the artifact download share captureRequestOwner; each keeps its own response handling.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass (dry run: 29 files, 335 tests in the targeted run); web = `B_web + 20`.

---

### Task 6: Thinner providers

**Files:**
- Create: `apps/web/src/hooks/use-authorized-read.ts` (declarations moved from the provider)
- Modify: `apps/web/src/providers/authorized-query-provider.tsx` (rewritten by the split script)
- Modify (import split, 27 files) and (mock path, 12 files): listed by the scripts in Step 2
- Test (characterization, added first): `apps/web/src/providers/current-role-provider.test.tsx`
- Modify: `apps/web/src/lib/auth/workspace-access.ts`, `apps/web/src/providers/current-role-provider.tsx`

**Interfaces:**
- Consumes: `.tmp/f4b/split-imports.mjs`, `.tmp/f4b/move-mock-entries.mjs`, `.tmp/f4b/same-lines.mjs` (Task 4), `.tmp/f4b/count-imports.mjs`, `.tmp/f4b/mock-scan.mjs` (Task 0).
- Produces (definitions unchanged): `useAuthorizedRead<T>(resource: string, projectId: string | null, permission: Permission, read: (signal: AbortSignal) => Promise<T>, enabled = true, options: { freshness?: 'summary' | 'live' } = {})`, `authorizedReadPolicy(resource: string, freshness: 'summary' | 'live')` and `SUMMARY_READ_STALE_MS` from `@/hooks/use-authorized-read`; `AuthorizedQueryContext`, `privateKey` and `isAuthorizationFailure` newly exported from `@/providers/authorized-query-provider`; `readWorkspaceContextCookie(): string | undefined` and `writeWorkspaceContext(profile: ApplicationProfile): void` from `@/lib/auth/workspace-access`.

- [ ] **Step 1: Split the hook out of the provider verbatim**

Create `.tmp/f4b/split-module.mjs`:

```js
// Splits a module's top-level declarations, verbatim and in order, into new files by declared name.
import { readFileSync, writeFileSync } from 'node:fs'

const [source, planFile] = process.argv.slice(2)
const plan = JSON.parse(readFileSync(planFile, 'utf8'))
const lines = readFileSync(source, 'utf8').split('\n')
const declaration = /^(?:export\s+)?(?:async\s+)?(?:const|let|function|class|type|interface)\s+([A-Za-z0-9_$]+)/
const starts = /^(?:\/\/|\/\*\*|export\s|const\s|let\s|function\s|async\s|class\s|type\s|interface\s)/

// Skip the import block: everything before the first top-level declaration or comment.
let index = lines.findIndex((line) => starts.test(line))
const chunks = []
let pending = []
for (; index < lines.length; index++) {
  const line = lines[index]
  const name = declaration.exec(line)?.[1]
  if (name) {
    chunks.push({ name, lines: [...pending, line] })
    pending = []
  } else if (line === '' || /^(?:\/\/|\/\*\*| \*)/.test(line)) pending.push(line)
  else {
    // Blank lines inside a declaration stay where they are.
    chunks.at(-1).lines.push(...pending, line)
    pending = []
  }
}
if (pending.some((line) => line !== '')) throw new Error('Trailing comment without a declaration.')

const owner = new Map()
for (const [file, { names }] of Object.entries(plan))
  for (const name of names) {
    if (owner.has(name)) throw new Error(`${name} is assigned twice.`)
    owner.set(name, file)
  }
const unassigned = chunks.filter((chunk) => !owner.has(chunk.name)).map((chunk) => chunk.name)
if (unassigned.length) throw new Error(`Unassigned declarations: ${unassigned.join(', ')}`)
const missing = [...owner.keys()].filter((name) => !chunks.some((chunk) => chunk.name === name))
if (missing.length) throw new Error(`Not declared in ${source}: ${missing.join(', ')}`)

for (const [file, { header }] of Object.entries(plan)) {
  const body = chunks
    .filter((chunk) => owner.get(chunk.name) === file)
    .flatMap((chunk) => chunk.lines)
  while (body[0] === '') body.shift()
  writeFileSync(file, `${header.join('\n')}\n\n${body.join('\n').replace(/\n*$/, '\n')}`)
  console.log(`${file}: ${body.length} lines`)
}
```

Create `.tmp/f4b/provider-split.json`:

```json
{
  "apps/web/src/providers/authorized-query-provider.tsx": {
    "header": [
      "'use client'",
      "",
      "import { useQueryClient } from '@tanstack/react-query'",
      "import { createContext, useEffect, useMemo, useRef, useState } from 'react'",
      "",
      "import { useCurrentRole } from '@/hooks/use-current-role'",
      "import { PathwaysClientError } from '@/lib/api/core/request'",
      "import type { ApplicationProfile } from '@/lib/auth/auth-access'",
      "import { sensitiveDraftGeneration, useSensitiveDraftOwner } from '@/lib/auth/sensitive-drafts'",
      "import { canAccessProjectForRole } from '@/lib/rbac/data-scope'",
      "import {",
      "  AUTHORIZATION_DENIED_EVENT,",
      "  WRITE_COMMITTED_EVENT,",
      "  authorizationDenialToken,",
      "} from '@/lib/services/authorized-read-events'"
    ],
    "names": ["Context", "AuthorizedQueryContext", "privateKey", "isAuthorizationFailure", "AuthorizedQueryProvider"]
  },
  "apps/web/src/hooks/use-authorized-read.ts": {
    "header": [
      "import { useQuery, useQueryClient } from '@tanstack/react-query'",
      "import { useCallback, useContext, useEffect, useState } from 'react'",
      "",
      "import { PathwaysClientError } from '@/lib/api/core/request'",
      "import { principalHasAtomicPermission } from '@/lib/rbac/policy'",
      "import {",
      "  AuthorizedQueryContext,",
      "  isAuthorizationFailure,",
      "  privateKey,",
      "} from '@/providers/authorized-query-provider'"
    ],
    "names": ["Permission", "Envelope", "AuthorizedReadFreshness", "SUMMARY_READ_STALE_MS", "LIVE_ONLY_RESOURCE", "authorizedReadPolicy", "useAuthorizedRead"]
  }
}
```

```bash
Q=apps/web/src/providers/authorized-query-provider.tsx
git hash-object $Q
git show HEAD:$Q > .tmp/f4b/authorized-query-provider.before.tsx
node .tmp/f4b/split-module.mjs $Q .tmp/f4b/provider-split.json
sed -i -e 's/^const AuthorizedQueryContext = /export const AuthorizedQueryContext = /' -e 's/^const privateKey = /export const privateKey = /' -e 's/^const isAuthorizationFailure = /export const isAuthorizationFailure = /' $Q
node .tmp/f4b/same-lines.mjs .tmp/f4b/authorized-query-provider.before.tsx $Q apps/web/src/hooks/use-authorized-read.ts
```

Expected: the hash is `097c6a1d9eda421559368623648a7bd2b50ffc0f` (Task 0's file with Task 4's import change, `PathwaysClientError` from `@/lib/api/core/request`, sorted by Biome below `use-current-role`); `apps/web/src/providers/authorized-query-provider.tsx: 176 lines`, `apps/web/src/hooks/use-authorized-read.ts: 135 lines`, `same lines: 306` with exit 0. Any other output: stop, the split is not verbatim.

- [ ] **Step 2: Repoint importers and mocks**

Create `.tmp/f4b/read-hook-map.json`:

```json
{
  "from": "providers/authorized-query-provider",
  "names": {
    "SUMMARY_READ_STALE_MS": "hooks/use-authorized-read",
    "authorizedReadPolicy": "hooks/use-authorized-read",
    "useAuthorizedRead": "hooks/use-authorized-read"
  }
}
```

Create `.tmp/f4b/read-hook-mocks.json`:

```json
{
  "from": "providers/authorized-query-provider",
  "to": "hooks/use-authorized-read",
  "names": ["SUMMARY_READ_STALE_MS", "authorizedReadPolicy", "useAuthorizedRead"]
}
```

```bash
node .tmp/f4b/split-imports.mjs .tmp/f4b/read-hook-map.json apps/web/src apps/web/e2e
node .tmp/f4b/move-mock-entries.mjs .tmp/f4b/read-hook-mocks.json apps/web/src
```

Expected: `split-imports.mjs` prints these 27 files with `: 1` each and `total: 27`:

```text
apps/web/src/features/analytics/analytics-dashboard.tsx
apps/web/src/features/analytics/human-review-workspace.tsx
apps/web/src/features/analytics/linked-alert-summary.tsx
apps/web/src/features/analytics/rule-editor.tsx
apps/web/src/features/analytics/use-analytics-insights.ts
apps/web/src/features/analytics/use-project-map.ts
apps/web/src/features/dashboard/action-kpi-row.tsx
apps/web/src/features/dashboard/pinned-charts.tsx
apps/web/src/features/dashboard/role-overview/role-overview.tsx
apps/web/src/features/dashboard/role-overview/use-role-overview.ts
apps/web/src/features/projects/budget-module/budget-actions.tsx
apps/web/src/features/projects/budget-module/use-budget-module.ts
apps/web/src/features/projects/indicator-library-manager.tsx
apps/web/src/features/projects/live-evaluation-workspace.tsx
apps/web/src/features/projects/project-activities-workspace.tsx
apps/web/src/features/projects/project-directory.tsx
apps/web/src/features/projects/project-indicators-workspace.tsx
apps/web/src/features/projects/project-rules-panel.tsx
apps/web/src/features/projects/use-project-reads.ts
apps/web/src/features/public/public-tracker-preview.tsx
apps/web/src/features/public/publication-queue-workspace.tsx
apps/web/src/features/reports/live-reporting-workspace.tsx
apps/web/src/features/rules-board/rule-condition-rows.tsx
apps/web/src/features/rules-board/rules-board.tsx
apps/web/src/features/settings/audit-log-workspace.tsx
apps/web/src/providers/authorized-query-cache.test.tsx
apps/web/src/providers/authorized-query-provider.test.tsx
```

`move-mock-entries.mjs` prints `renamed (useAuthorizedRead)` for these 12 and `total: 12`: `analytics-dashboard.test.tsx:92`, `pinned-charts.test.tsx:21`, `role-overview.test.tsx:13`, `indicator-library-manager.test.tsx:28`, `live-evaluation-workspace.test.tsx:76`, `project-directory.test.tsx:29`, `project-indicators-workspace.reload.test.tsx:68`, `project-indicators-workspace.test.tsx:47`, `public-tracker-preview.test.tsx:11`, `publication-queue-workspace.test.tsx:60`, `live-reporting-workspace.test.tsx:61`, `audit-log-workspace.test.tsx:27`.

```bash
node .tmp/f4b/count-imports.mjs hooks/use-authorized-read useAuthorizedRead authorizedReadPolicy SUMMARY_READ_STALE_MS
node .tmp/f4b/mock-scan.mjs providers/authorized-query-provider useAuthorizedRead | tail -1
node .tmp/f4b/mock-scan.mjs hooks/use-authorized-read useAuthorizedRead | tail -1
```

Expected (Review Focus 5): `useAuthorizedRead 27, authorizedReadPolicy 1, SUMMARY_READ_STALE_MS 1; files 27`; `factories 0, naming 0`; `factories 12, naming 12`. Every other reference to the provider module imports `AuthorizedQueryProvider` (app providers and test wrappers, including the `await import(...)` in `rule-editor.test.tsx`, which stays) or is the new hook's own import of the context.

- [ ] **Step 3: Test and commit the hook move**

```bash
git add -N apps/web
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts' '*.tsx')
pnpm --filter @pathways/web exec vitest run src/providers src/hooks src/features/analytics src/features/dashboard src/features/public src/features/settings src/features/reports src/features/rules-board src/features/projects src/import-direction.test.ts
pnpm typecheck && pnpm lint
git checkout -- apps/web/next-env.d.ts
git add -A apps/web
git commit -m "refactor(web): move useAuthorizedRead from its provider into hooks

The read hook, its cache policy and its types move verbatim; 27 importers and 12 test mocks follow.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass (the dry run's first eight paths: 54 files, 395 tests).

- [ ] **Step 4: Pin the role provider's cookie behavior on the current code**

In `apps/web/src/providers/current-role-provider.test.tsx`, add below `import type { ApplicationProfile } from '@/lib/auth/auth-access'`:

```ts
import { encodeWorkspaceContext } from '@/lib/auth/workspace-access'
```

and append at the end of the file:

```tsx
describe('CurrentRoleProvider workspace context cookie', () => {
  afterEach(() => {
    document.cookie = 'pathways-context=; Path=/; Max-Age=0'
    session.user.id = 'sub-1'
  })

  it('writes the verified workspace to the context cookie', async () => {
    verify.fn.mockResolvedValue(ready())
    render(
      <CurrentRoleProvider>
        <Probe />
      </CurrentRoleProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('role').textContent).toBe('SYSTEM_ADMINISTRATOR'))
    expect(document.cookie).toContain(`pathways-context=${encodeWorkspaceContext(profile())}`)
  })

  it('sends the workspace in the context cookie as the verification hint', async () => {
    const subject = '71000000-0000-4000-8000-000000000001'
    const context = {
      userId: '71000000-0000-4000-8000-000000000002',
      organizationId: '71000000-0000-4000-8000-000000000003',
    }
    session.user.id = subject
    document.cookie = 'theme=dark; Path=/'
    document.cookie = `pathways-context=${encodeURIComponent(JSON.stringify({ authUserId: subject, ...context }))}; Path=/`
    verify.fn.mockResolvedValue(ready())
    render(
      <CurrentRoleProvider>
        <Probe />
      </CurrentRoleProvider>,
    )

    await waitFor(() => expect(verify.fn).toHaveBeenCalledTimes(1))
    expect(verify.fn.mock.calls[0][4]).toEqual(context)
  })
})
```

The `theme` cookie sits before the context cookie, so the hint test also pins that the split tolerates the space after each `;`.

Run: `pnpm --filter @pathways/web exec vitest run src/providers/current-role-provider.test.tsx`
Expected: PASS on the current code, 3 tests.

- [ ] **Step 5: Move the cookie read and write into workspace-access**

In `apps/web/src/lib/auth/workspace-access.ts`, add directly after the `clearWorkspaceContext` declaration (its closing `}` line), with a blank line before:

```ts
// The workspace context cookie value, found by splitting document.cookie on '; '.
export const readWorkspaceContextCookie = () =>
  document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${contextCookieName}=`))
    ?.slice(contextCookieName.length + 1)

// Stores the verified workspace selection; Secure is added on HTTPS pages.
export const writeWorkspaceContext = (profile: ApplicationProfile) => {
  document.cookie = `${contextCookieName}=${encodeWorkspaceContext(profile)}; Path=/; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}`
}
```

In `apps/web/src/providers/current-role-provider.tsx`:

- In the `@/lib/auth/workspace-access` import, replace `  contextCookieName,` with nothing and `  encodeWorkspaceContext,` with `  readWorkspaceContextCookie,` followed by `  writeWorkspaceContext,` (the list becomes `clearWorkspaceContext`, `decodeWorkspaceContext`, `readWorkspaceContextCookie`, `writeWorkspaceContext`).
- Replace

```ts
    const cookie = document.cookie
      .split('; ')
      .find((part) => part.startsWith(`${contextCookieName}=`))
    const hint =
      selected.current?.context ??
      decodeWorkspaceContext(cookie?.slice(contextCookieName.length + 1), subject)
```

with

```ts
    const hint =
      selected.current?.context ?? decodeWorkspaceContext(readWorkspaceContextCookie(), subject)
```

(reading `document.cookie` has no side effect, so reading it only when no workspace is selected changes nothing).

- Replace the line ``          document.cookie = `${contextCookieName}=${encodeWorkspaceContext(value.profile)}; Path=/; SameSite=Strict${location.protocol === 'https:' ? '; Secure' : ''}` `` with `          writeWorkspaceContext(value.profile)` (it stays inside the same `try`).

```bash
git grep -n "document.cookie\|contextCookieName" -- apps/web/src/providers/current-role-provider.tsx
wc -l apps/web/src/providers/current-role-provider.tsx
```

Expected: the grep prints nothing; `277` lines (was 281).

- [ ] **Step 6: Run the tests, measure the middleware and commit**

```bash
pnpm exec biome check --write apps/web/src/lib/auth/workspace-access.ts apps/web/src/providers/current-role-provider.tsx apps/web/src/providers/current-role-provider.test.tsx
pnpm --filter @pathways/web exec vitest run src/providers src/lib/auth src/lib/rbac src/lib/middleware.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/web test 2>&1 | grep -E "Tests +[0-9]+"
pnpm --filter @pathways/web build > .tmp/f4b/web-build-task6.log 2>&1; echo "exit $?"
grep -E "Middleware" .tmp/f4b/web-build-task6.log
git checkout -- apps/web/next-env.d.ts
git add apps/web/src/lib/auth/workspace-access.ts apps/web/src/providers/current-role-provider.tsx apps/web/src/providers/current-role-provider.test.tsx
git commit -m "refactor(web): move the role provider's workspace cookie read and write into lib/auth

Web Middleware <M0> kB before, <M6> kB after.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass, including `auth-access.edge.test.ts` and the Edge case in `navigation-diagnostic.test.ts`; web = `B_web + 22` (the dry run: 1921 across 215 files); build exit 0 with `Middleware` equal to or smaller than `M0`. Replace `<M0>` and `<M6>` with the sizes. If the build fails or the size grows, do not commit: stop and report both sizes and the build log tail (ruling 13).

---

### Task 7: Records and SAD routing

**Files:**
- Modify: `scripts/sad/check.ts` (beneficiary privacy globs), `scripts/sad/check.test.ts`, `docs/sad-pathways.md:38`
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.3, 9)
- Modify: `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05, MOD-16 rows)
- Modify: `docs/load-performance-options.md:11`, `docs/deferred-features.md:62`
- Modify: `docs/index.md` (CR row status)
- Modify: `docs/activity-log.md`

- [ ] **Step 1: Route the web api core to the beneficiary privacy guardian (ruling 12)**

In `scripts/sad/check.test.ts`, directly after the test `routes request contracts and the zod pipe to the beneficiary privacy guardian`, add:

```ts
  it('routes the web api core to the beneficiary privacy guardian', () => {
    const files = [
      'apps/web/src/lib/api/core/request-owner.ts',
      'apps/web/src/lib/api/core/request.ts',
    ]
    const routed = routing(files.map((file) => change(file, 'new', 'old')))
    expect(routed['beneficiary-privacy-guardian']).toEqual(files)
  })
```

Run: `pnpm sad:test`
Expected: FAIL on the new test only.

In `scripts/sad/check.ts`, `beneficiary-privacy-guardian` globs, add directly after `'apps/web/src/lib/services/**/*.ts',`:

```ts
      'apps/web/src/lib/api/**/*.ts',
```

In `docs/sad-pathways.md` line 38, after `` `apps/web/src/lib/services/**/*.ts`, `` insert `` `apps/web/src/lib/api/**/*.ts`, `` (inside the same cell).

```bash
pnpm sad:test && pnpm sad:typecheck
```

Expected: PASS; sad = `B_sad + 1`.

- [ ] **Step 2: Amend the Change Record**

`docs/cr-pathways-codebase-modularization.md`:

Section 3.3, after the paragraph ending `(amended 2026-10-10 for F4a).`, add:

```text
`lib/format` holds `date` (`formatCalendarDay`, `formatDateOrUnavailable`), `percent`, `plural` and `tone` (`StatusTone`, `SignalTone`). `lib/api/core` holds `request` (`PathwaysClientError`, `requestFoundationResponse`, `requestFoundation`) and `request-owner` (`captureRequestOwner`); the source ticket invalidation subscription lives in `lib/services/source-mutation.ts` beside the tickets. `useAuthorizedRead` lives in `hooks/use-authorized-read.ts`, beside the provider that owns its context. Scrolling data tables share `stickyTableHeadClass` from `components/pathways/sticky-table-head.ts` (amended 2026-10-10 for F4b).
```

Section 9, append:

```markdown
F4b applied 2026-10-10 on refactor/f4b-web-helpers:
- Format: `lib/percent.ts` moved to `lib/format/percent.ts` (11 importers); `lib/format/plural.ts` replaced 3 copies (7 calls); `lib/format/date.ts` replaced 5 `formatDate` copies with `formatCalendarDay` (analytics, survey report, reporting) and `formatDateOrUnavailable` (beneficiaries, activities, which keep one-line `formatDate` wrappers); `lib/format/tone.ts` holds `StatusTone` and `SignalTone`, replacing 5 literal unions.
- Table head: `stickyTableHeadClass` replaced 4 identical header constants (23 uses); the two different ones stay.
- Dialogs: no raw `DialogContent` renders the same markup as `DialogShell` or `ConfirmationDialog`, so none was consolidated.
- Request core: `PathwaysClientError`, `requestFoundationResponse` and `requestFoundation` moved verbatim from `pathways-client.ts` to `lib/api/core/request.ts` (37 importers, 24 test mocks); the source ticket invalidation subscription moved to `source-mutation.ts`, with its start-up call left in `pathways-client.ts`.
- Owned read: `captureRequestOwner` in `lib/api/core/request-owner.ts` replaced the owner capture in the core and rules reads and the artifact download; response handling stays per client.
- Providers: `useAuthorizedRead`, `authorizedReadPolicy` and `SUMMARY_READ_STALE_MS` moved to `hooks/use-authorized-read.ts` (27 importers, 12 test mocks); the role provider's workspace cookie read and write moved to `lib/auth/workspace-access.ts`.
- SAD: beneficiary privacy routing covers `apps/web/src/lib/api/**/*.ts`.
- Middleware: <Task 6 sizes sentence>.
- Decisions: tone types are shared but no `statusTone` is annotated, because the executive dashboard passes its tone to a signal without neutral (ruling 3); `formatCalendarDay` keeps Intl's rollover and `RangeError` (ruling 4); the shared header is a class string, not a component, because call sites merge it with `cn` and template strings (ruling 5); `pathways-client.ts` re-exports nothing, so every importer and mock moved (rulings 7 and 9); the owned-read helper covers three sites, not two (ruling 10); the three workspace cookie reads stay separate because they split the cookie differently (ruling 11); `lib/api/core/request` still imports `lib/services` until the slices rename it (ruling 7); `DialogShell` and `ConfirmationDialog` are rendered by 17 and 8 files, not 19 and 10 (ruling 2).

Deferred: `lib/services/*` renamed to `lib/api/<domain>` and duplicated read resource keys (slices); the other date and tone helpers and `DashboardSeverity` (S7); the two non-sticky header classes (S5); raw dialogs restyled onto shared dialogs (slices, with a design review); the three workspace cookie reads (S8).
```

Replace `<Task 6 sizes sentence>` with `web Middleware went from <M0> kB to <M6> kB` using the Task 0 and Task 6 measurements.

- [ ] **Step 3: Update the audit, living docs and index**

- Audit: in the MOD-05 disposition cell replace `core part in F4b.` with `core part closed by F4b; domain modules in the slices.`; in the MOD-16 disposition cell replace `lib/format and the shared table head in F4b.` with `lib/format and the shared table head applied by F4b; read resource keys in the slices.`
- `docs/load-performance-options.md` line 11: replace `` `authorized-query-provider.tsx` `` with `` `hooks/use-authorized-read.ts` ``.
- `docs/deferred-features.md` line 62: replace `` `apps/web/src/providers/authorized-query-provider.tsx` `` with `` `apps/web/src/hooks/use-authorized-read.ts` ``.

```bash
git grep -nE "lib/percent|analytics-utils|authorized-query-provider\.tsx" -- docs ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/cr-*' ':!docs/superpowers/*'
```

Expected: nothing (no living doc names an old path; the QAD rows name the provider tests, which did not move).

- `docs/index.md`: CR row status becomes `Approved; F1, F2, F3a, F3b, F4a and F4b applied, S1 next`.

- [ ] **Step 4: Activity log**

Add to `docs/activity-log.md`:

```markdown
## 2026-10-10 Modularization F4b web helpers (refactor/f4b-web-helpers)
```

with one bullet per Task 1 to Task 6 stating what moved, was shared or was added, with its commit hashes and the web test count at the end of that task; a bullet with the Middleware sizes; a bullet stating the dialog check found no exact duplicate; a bullet saying the F4b decisions are recorded in the change record section 9; and a bullet listing the deferrals. Task 8 Step 5 appends the gate results.

- [ ] **Step 5: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint
git add docs scripts/sad
git commit -m "docs: record modularization F4b and route the web api core to the privacy guardian

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline.

---

### Task 8: Full release gates and merge

- [ ] **Step 1: Static gates and dist layout**

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm sad:test
git checkout -- apps/web/next-env.d.ts
test -f apps/api/dist/apps/api/src/main.js && test ! -e apps/api/dist/apps/web && echo "dist layout ok"
pnpm --filter @pathways/web build > .tmp/f4b/web-build-gates.log 2>&1; echo "exit $?"
grep -E "Middleware" .tmp/f4b/web-build-gates.log
git checkout -- apps/web/next-env.d.ts
```

Expected: all pass, `dist layout ok`, web build exit 0 with Middleware at most `M0`. Versus Task 0: web = `B_web + 22` (plural 1, date 8, table head 3, request 2, request owner 6, role provider 2), sad = `B_sad + 1`, config, shared, imports and api unchanged.

- [ ] **Step 2: Local DB replay**

```powershell
./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline
```

Expected: exit 0.

- [ ] **Step 3: Local stack, compiled API boot, e2e and smoke**

Stop anything on ports 3000 and 4000 first.

```bash
pnpm db:local:start && pnpm db:local:reset && pnpm db:local:demo
pnpm dev:local
```

`pnpm dev:local` builds the API and runs `dist`. In a second terminal:

```bash
curl -s http://127.0.0.1:4000/api/health
npx playwright test --config playwright.config.ts
npx playwright test --config playwright.auth-navigation.config.ts
```

Expected: `"status":"ok"`; auth-navigation 27/27; main suite 39 pass, 9 fail, 22 not run, with the same 9 failing as the F1 to F4a gate runs (MFA Verify helper, password-login harness, workflows seed end date). Browser smoke, each step as a demo user whose role allows it, comparing with dev:
- Dates, percents and plurals: an activity list and detail (two-digit days such as `Jan 05, 2026`, due labels, capped percents), a beneficiary profile and directory (`Jan 5, 2026` style, `Date unavailable` where a date is missing), the analytics SADDD notice for a project not yet started, a project summary report preview and a survey report overview (start, end and response dates), the Project Manager home (`Managing 2 projects`, overdue days) and the Program Manager portfolio (`N projects across M programs`), the import workspace suggestion notices.
- Tables: the activity list, indicator library, project indicators and evaluation score tables keep sticky left-aligned headers, with centered and right-aligned columns where they were.
- Requests: sign in with TOTP and land on `/workspace`; open a beneficiary as a Project Officer (step-up prompt still appears when required); trigger a denied read (for example a Program Manager on beneficiary records) and see the same denial as dev; open the rules board alerts and a recommendation (rules client), an evaluation round and a report artifact download (core client); save an activity edit and confirm a pending source mutation recovery still offers recovery.
- Providers: switch workspace or sign out and back in, reload, and confirm the same workspace is restored; open a dashboard and a project tab twice and confirm summary reads reuse data as on dev.
Every step must behave as on dev.

- [ ] **Step 4: SAD review**

```bash
pnpm sad:check --base dev --head HEAD --output .tmp/sad/f4b/manifest.json
```

Dispatch every role the manifest requires (expect `design-qa-agent`, `restraint-guardian`, `organization-isolation-checker` for `lib/auth/workspace-access.ts` and `lib/auth/beneficiary-step-up*.ts`, `beneficiary-privacy-guardian` for `lib/api` and `lib/services`, and `rule-engine-determinism-checker` because `features/analytics/rule-editor.tsx` changed its imports) with the section 4.2 handoff packet from `docs/sad-pathways.md`, save their section 4.4 envelopes to `.tmp/sad/f4b/reviews.json`, then:

```bash
pnpm sad:signoff -- --base dev --head HEAD --reviews .tmp/sad/f4b/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun.

- [ ] **Step 5: Record the gate results**

Append a final bullet to the Task 7 activity-log section with the gate results (per-package counts, Middleware size, replay exit code, e2e pass counts, smoke result, SAD sign-off), then:

```bash
git add docs/activity-log.md
git commit -m "docs: record modularization F4b release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Merge into local dev**

```bash
git checkout dev
git merge --no-ff refactor/f4b-web-helpers -m "Merge refactor/f4b-web-helpers into dev

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Remove the executed plan**

F4 is complete, so the plan goes (CR section 6). In `docs/index.md` section 1.6 delete the row starting `| [F4b web helpers plan]`, then:

```bash
git rm docs/superpowers/plans/2026-10-10-modularization-f4b-web-helpers.md
pnpm docs:check 2>&1 | tail -3
git add docs/index.md
git commit -m "docs: remove the executed F4b plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline. Do not push `origin dev` until the developer says so.
