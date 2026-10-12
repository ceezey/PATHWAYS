# F4 Web Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the web app one-way dependencies (no lower layer imports `features/` or `app/`, and no api file imports web source), with the route table shared by both apps, `lib/rbac` split by purpose, the auth platform code in `lib/auth`, a `usePermission` hook, and tests that enforce the direction, with no change to any rendered text, class, route, redirect, cookie, header or API decision.

**Architecture:** F4 is split (ruling 1). This plan gives F4a in full (eight tasks including baseline and gates) and F4b as an outline at the end. F4a moves the route table and its decision functions verbatim into `packages/shared/src/rbac/route-policy.ts`, splits the rest of `apps/web/src/lib/rbac/route-access.ts` verbatim into four files, moves seven auth modules from `features/auth` to `lib/auth` with `git mv`, then adds Vitest direction tests (Biome 1.9.4 cannot express path globs) and `usePermission`. Mechanical rewrites use one-off Node scripts under `.tmp/f4a/` (gitignored, never committed) whose content is given in full; each was dry-run on a copy of `c07ab1c0` and the expected outputs below come from those runs.

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, Next 15.5.14 (App Router, Edge middleware), React 19, Vitest 3 (jsdom per file), Playwright, Biome 1.9.4, zod 3.25.76, NestJS 10.4.22.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.1, 3.3, 3.5, 3.7 row F4, 7, 9 including the F1, F2, F3a and F3b dispositions) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05, MOD-10 web side, MOD-16).

## Rulings

Controller rulings for F4 (2026-10-10). Each was checked against the code at `refactor/f3b-validation-wiring` `c07ab1c0`, the tree that becomes local dev once F3b merges (F3b does not touch `apps/web/src`).

1. **Split into F4a and F4b.** The F4 row holds eight work items; with baseline, records and gates that is about twelve tasks, over the split threshold. F4a (this plan, branch `refactor/f4a-web-boundaries`) takes the dependency direction work: shared route policy, `lib/rbac` split, `lib/auth`, the direction tests and `usePermission`. F4b (outline below, branch `refactor/f4b-web-helpers`) takes `lib/api/core` with the owned-read helper, `lib/format`, the shared table head and dialog check, and thinner providers. Both names replace `refactor/f4-web-platform`.
2. **The route table moves to `packages/shared`, verbatim.** Three api files import `apps/web/src/lib/rbac/route-access.ts` (`modules/auth/route-access.service.ts`, `route-access.service.test.ts`, `modules/dashboards/dashboard-home-authorization-parity.test.ts`); F2 named only two. They use `routePolicy`, `RouteKey`, `RouteSelection`, `RouteDecision`, `parseRouteSelection`, `routeAllowed` and `isAggregateOnly`. Those, with their closure (`RoutePrincipal`, `entry`, `Scope`, `hasRoutePermission`, `reportAtomic`, `matchRoute` and the UUID regex), move to `packages/shared/src/rbac/route-policy.ts` as lines 9 to 145, 152 to 158, 220 to 339 and 526 to 530 of the current file (git hash `e95129c7221a9b0582d4f7503173a419610f4370`, 636 lines). Two edits only: the private `const uuid` becomes `export const routeUuidPattern` (the web transport and routes still need it, and a generic `uuid` export would break CR 3.4 naming), and `hasRoutePermission` gains `export` (web `visibleFeatures` uses it). `reportKindPermissions` stays in the web because it maps to legacy web `PermissionCode` values. No shared module declares any of the moved names (checked with `git grep`), so the barrel stays free of TS2308. `URLSearchParams.size` and `Object.hasOwn` are already used by the API at runtime (Node 22) and typed by `tsconfig.base.json` (`ES2022`, `DOM`).
3. **`lib/rbac/{policy,routes,nav,transport}` are files.** The remaining web half of `route-access.ts` splits by declared name: `policy.ts` (`reportKindPermissions`, `getVerifiedRouteAccess`, `principalHasAtomicPermission`, `getRouteAccess`, `landingPath`), `routes.ts` (`isPublicPath`, `displayQueryKeys`, `authorizationPathForUiPath`, `isInternalPath`), `nav.ts` (`canonicalFeatures`, `visibleFeatures`, `filterDashboardNavGroups`, `WorkspaceTabAccess`, `filterWorkspaceTabs`) and `transport.ts` (`RouteCheckError`, `requestRouteCheck`). The other eight `lib/rbac` source files are already named for their purpose and stay. Three tests named after the old file are renamed: `route-access.frontend-aliases.test.ts` to `routes.frontend-aliases.test.ts`, `route-access.monitoring.test.ts` to `policy.monitoring.test.ts`, `route-check-transport.test.ts` to `transport.test.ts`.
4. **`lib/auth` absorbs seven modules, not one.** The 17 non-test imports from `lib/`, `hooks/` and `providers/` into `features/` point at `auth-access` (6), `workspace-access` (6), `workspace-verification` (1), `verification-flight` (1), `mfa-flow` (1), `password-recovery` (1) and `features/profile/own-profile-contract` (1). Moving only `workspace-access` would leave `lib/auth/workspace-access.ts` importing `features/auth/auth-access`. So `auth-access.ts`, `auth-access.test-fixtures.ts`, `workspace-access.ts`, `workspace-verification.ts`, `verification-flight.ts`, `mfa-flow.ts` and `password-recovery.ts` move with their nine tests (16 files) by `git mv`; `features/auth` keeps the 15 screen and form files. No name collides with the four existing `lib/auth` modules.
5. **Own profile response schema moves into its client.** `lib/services/own-profile-client.ts` imports `ownProfileResponseSchema` from `features/profile/own-profile-contract.ts`; the schema and its `OwnProfileRecord` type (8 lines) move into the client, and `own-profile-workspace.tsx` imports the type from there. The two form schemas stay in the feature. The two tests that mock `@/lib/services/own-profile-client` keep working: the type import is erased.
6. **Direction is enforced by three Vitest tests** (F3a ruling 2 applies: Biome 1.9.4 `noRestrictedImports` matches exact specifiers only). `apps/web/src/import-direction.test.ts`: non-test files under `components/`, `constants/`, `hooks/`, `lib/`, `providers/`, `types/` and directly under `src/` import neither `features/` nor `app/`; `features/` does not import `app/`; no non-test file imports outside `apps/web/src`. `packages/shared/src/package-import-boundary.test.ts`: no non-test file in `packages/{shared,imports,config}/src` imports an app alias or a path outside its own `src`. `apps/api/src/common/import-boundary.test.ts` gains an api to web case covering `src` and `prisma`, tests included. Test files are exempt from the web and package rules, as in the api `common` rule, because several import feature fixtures. `test/` (fixtures) and `app/` have no rule.
7. **`usePermission` reads `@/hooks/use-current-role`.** 60 tests mock that module, including the tests of the four components that get the hook and have their own test (`budget-ledger`, `rules-board`, `rule-drawer`, `publication-queue-workspace`), so the hook must import it there (not from the provider) for the mocks to keep applying. `permissionChecker(principal)` in `lib/rbac/policy.ts` serves the sixth wrapper, `canReadInsight` in `use-analytics-insights.ts`, which is a plain function that receives a profile. All six wrappers call `principalHasAtomicPermission(profile, permission)`, so decisions are unchanged.
8. **Mocks follow their module.** Two tests mock `@/lib/rbac/route-access` (`route-access-guard.test.tsx`, `pinned-charts.test.tsx`) and two mock moved auth modules (`mfa-form.test.tsx` mocks `./auth-access`, `current-role-provider.test.tsx` mocks `@/features/auth/workspace-verification`). Tasks 2 and 3 count them before and after; a mock left on an old path silently stops applying.
9. **Middleware must not grow.** F3b recorded 102 kB. The Edge bundle now reaches the route table through the `@pathways/shared` barrel (`"sideEffects": false`). Tasks 0, 1 and 7 run `next build` and compare the `Middleware` line; growth stops the task and is reported.
10. **SAD routing:** `apps/web/src/lib/auth/**/*.ts`, `apps/web/src/lib/rbac/**/*.ts`, `apps/web/src/lib/middleware.ts` and `apps/web/src/middleware.ts` route to organization-isolation-checker, beside `packages/shared/src/rbac/**/*.ts`. CR section 7 already requires that reviewer when auth or rbac code moves.
11. **Spec facts corrected by the baseline:** MOD-10's `lib/services/rules-human-client.ts` no longer imports `features/analytics` (F2 moved the rules contracts); it imports `features/auth/workspace-access`, fixed by ruling 4. The 17 lower-layer imports are 16 into `features/auth` and 1 into `features/profile`. MOD-16 counts are recorded for F4b in its outline (9 `statusTone` definitions, not 10, and none duplicates another).

## Global Constraints

- Behavior-preserving: no rendered text, class, route, redirect, cookie, header, Edge middleware decision or API route-check decision changes. Only file locations and import specifiers change, plus `usePermission`, which calls the same `principalHasAtomicPermission`.
- Direction (CR 3.1): `app -> features -> components, hooks, lib, providers -> @pathways/shared`; lower layers never import `features/` or `app/`; api never imports web; packages never import apps.
- File moves use `git mv` and carry only import-path changes. Splits are verbatim: `.tmp/f4a/same-lines.mjs` must exit 0 before Biome formats the new files.
- Every name exported through `packages/shared/src/index.ts` is unique (TS2308 otherwise).
- A `vi.mock` path moves with its module in the same commit.
- Kebab-case file names that describe purpose; comments are one sentence, no emojis; docs prose has no em dashes and no `--`.
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. New untracked files need `git add -N` before `git diff --name-only` lists them.
- `pnpm typecheck` and `next build` may rewrite `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` before every commit.
- After removing code, delete any import name left with no use (Biome 1.9 recommended rules do not flag unused imports).
- `git ls-files` with `':!*.test.ts'` pathspecs returns nothing in this Git for Windows setup; filter with `grep -v` as written. `git grep` pathspecs work.
- Web build: `pnpm --filter @pathways/web build > .tmp/f4a/<name>.log 2>&1; echo "exit $?"`, then `grep -E "Middleware" .tmp/f4a/<name>.log`. A pipe through `tee` would hide the exit code.
- One-off scripts live in `.tmp/f4a/` (gitignored) and are never committed; `.tmp/` also holds logs.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work in `C:\PATHWAYS` on branch `refactor/f4a-web-boundaries`; no new worktree. All paths are relative to `C:\PATHWAYS`. Do not push.
- Do not touch migrations, `.env` files, review evidence or `apps/api/prisma`.

## Review Focus

1. A test mock left on `@/lib/rbac/route-access`, `./auth-access` or `@/features/auth/workspace-verification` silently stops applying and the real module runs. Tasks 2 and 3 count 2 and 2 mocks before, then zero old-path references and the new-path counts after.
2. The Edge middleware must still build for the Edge runtime and must not grow once it reaches the route table through the shared barrel. Task 1 Step 7 compares the `Middleware` line with Task 0; `auth-access.edge.test.ts` and the Edge case in `navigation-diagnostic.test.ts` run in Task 3.
3. The API route check must decide exactly as before: an uppercase project UUID is lowercased, an unknown key is refused, and the API's `checkAssignment = false` call leaves assignment to the database. Task 1 Step 1 pins all three in `route-policy.test.ts`; `route-access.service.test.ts` runs unchanged against the shared module.
4. The compiled API must boot without web source in `dist` and with a shared `dist` that exports the route policy (a stale shared build boots with `parseRouteSelection` undefined). Task 7 Step 1 checks the dist layout and Step 3 boots the compiled API and opens deep links.
5. A profile listing a grant its role does not hold must be denied by `usePermission`, as `principalHasAtomicPermission` does. Task 5 Step 1 pins it with a Program Manager holding `beneficiaries.records.read`.

## Out of F4a (recorded for later sub-projects)

- `lib/api/core` and the owned-read helper (MOD-05 core part), `lib/format/{date,percent,plural,tone}`, the shared table head and dialog check, and thinner providers (MOD-16 rest): F4b, outlined at the end.
- Feature public `index.ts` surfaces and analytics and rules-board cross-coupling (MOD-15): S7 and the slices.
- `lib/services/*` renamed to `lib/api/<domain>`, `components/pathways` renamed to `components/common`, and `lib/platform/{env,supabase,sentry}` (CR 3.3): slices and W1.
- `aggregateOnlyRoles` in `authorization-policy.ts` and the literal `['PROGRAM_MANAGER', 'GRANT_MANAGER']` in `route-policy.ts` stay separate; merging them is a logic edit outside a move (slice S8).

---

### Task 0: Branch setup and baseline

**Files:**
- Create: `docs/superpowers/plans/2026-10-10-modularization-f4-web-platform.md` (this plan)
- Modify: `docs/index.md` (section 1.6 plan row)

- [ ] **Step 1: Confirm local dev contains F3b and create the branch**

```bash
cd /c/PATHWAYS
git status --short
git checkout dev
git log --oneline dev | grep -m1 "Merge refactor/f3b-validation-wiring into dev"
test -f apps/api/src/common/validation/zod-pipe.ts && test -f apps/api/src/modules/storage/private-storage-factories.ts && echo "F3b tree present"
test -e docs/superpowers/plans/2026-10-10-modularization-f3b-validation-wiring.md && echo "F3b plan still present"
git checkout -b refactor/f4a-web-boundaries
pnpm install --frozen-lockfile
mkdir -p .tmp/f4a
```

Expected: clean status, the F3b merge commit and `F3b tree present` printed, install succeeds. If either is missing, stop and report: F4a builds on the F3b tree. If `F3b plan still present` prints, F3b Task 8 Step 7 did not run; Step 3 removes that plan and its index row too.

- [ ] **Step 2: Record the baseline**

```bash
pnpm --filter @pathways/shared build
pnpm typecheck && pnpm test 2>&1 | grep -E "Tests +[0-9]+"
pnpm sad:test 2>&1 | grep -E "Tests +[0-9]+"
pnpm docs:check 2>&1 | tail -3
pnpm --filter @pathways/web build > .tmp/f4a/web-build-baseline.log 2>&1; echo "exit $?"
grep -E "Middleware" .tmp/f4a/web-build-baseline.log
git hash-object apps/web/src/lib/rbac/route-access.ts
git grep -l "web/src/lib/rbac/route-access" -- apps/api | wc -l
git grep -nE "from '(@/features/|(\.\./)+features/)" -- apps/web/src/lib apps/web/src/hooks apps/web/src/providers apps/web/src/components | grep -vE '\.test\.tsx?:' | wc -l
git grep -l "rbac/route-access'" -- apps/web/src | wc -l
git grep -l "'\./route-access'" -- apps/web/src | wc -l
git grep -n "vi.mock('@/lib/rbac/route-access'" -- apps/web/src | wc -l
git grep -nE "vi.mock\('(\./auth-access|@/features/auth/workspace-verification)'" -- apps/web/src | wc -l
git grep -n 'principalHasAtomicPermission(profile, permission)' -- apps/web/src/features | wc -l
git ls-files apps/web/src/features/auth | wc -l
git checkout -- apps/web/next-env.d.ts
```

Expected: typecheck clean; write down each package's passing and skipped test counts (config, shared, imports, api, web), the sad count, the docs check failure count, the web build exit code (0) and the `Middleware` size (F3b recorded 102 kB). Later tasks compare against these (`B_shared`, `B_api`, `B_web`, `B_sad`, `M0`). The greps print, in order: `e95129c7221a9b0582d4f7503173a419610f4370`, `3`, `17`, `46`, `10`, `2`, `2`, `6`, `31`. If any differs, stop and report: the line ranges and lists below were counted at `c07ab1c0`.

- [ ] **Step 3: Add the plan and commit**

The controller has saved this plan as `docs/superpowers/plans/2026-10-10-modularization-f4-web-platform.md`.

In `docs/index.md` section 1.6, add as the last row of the table (and, only if Step 1 printed `F3b plan still present`, delete the row starting `| [F3b api validation and wiring plan]` and run `git rm docs/superpowers/plans/2026-10-10-modularization-f3b-validation-wiring.md`):

```markdown
| [F4 web platform plan](superpowers/plans/2026-10-10-modularization-f4-web-platform.md) | 2026-10-10-modularization-f4-web-platform.md | 2026-10-10 | F4 of the codebase modularization: F4a shared route policy, lib/rbac split, lib/auth, import direction tests and usePermission; F4b outline | In progress |
```

```bash
git add docs/superpowers/plans/2026-10-10-modularization-f4-web-platform.md docs/index.md
pnpm docs:check 2>&1 | tail -3
git commit -m "docs: add the F4 web platform plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Step 2 baseline.

---

### Task 1: Move the route policy into packages/shared

**Pre-flight amendments (controller, binding):**
- After Step 5, merge any second `from '@pathways/shared'` statement into the first by hand (Biome 1.9.4 does not merge them); check role-dashboard.tsx, server-access.test.ts and the two api tests at least.
- Out of F4a: `apps/web/src/lib/services/source-mutation.ts:63` holds a UUID regex identical to `routeUuidPattern`; leave it (S8) and do not import across.
- Give the new api-to-web boundary test a positive control like its sibling tests (a fixture specifier that must be detected, and an assertion that files were scanned) so it cannot pass vacuously.

**Files:**
- Create: `packages/shared/src/rbac/route-policy.ts`
- Test: `packages/shared/src/rbac/route-policy.test.ts`
- Modify: `packages/shared/src/index.ts` (barrel line)
- Modify: `apps/web/src/lib/rbac/route-access.ts` (shared lines removed, imports replaced)
- Modify (import split, 8 files): `apps/web/src/components/layout/route-access-guard.tsx`, `apps/web/src/features/dashboard/role-dashboard.tsx`, `apps/web/src/lib/middleware.ts`, `apps/web/src/lib/rbac/route-access.frontend-aliases.test.ts`, `apps/web/src/lib/rbac/route-access.monitoring.test.ts`, `apps/web/src/lib/rbac/route-check-transport.test.ts`, `apps/web/src/lib/rbac/server-access.test.ts`, `apps/web/src/lib/rbac/server-access.ts`
- Modify: `apps/web/src/components/layout/route-access-guard.test.tsx` (one mock line)
- Modify (specifier only, 3 files): `apps/api/src/modules/auth/route-access.service.ts`, `apps/api/src/modules/auth/route-access.service.test.ts`, `apps/api/src/modules/dashboards/dashboard-home-authorization-parity.test.ts`
- Test: `apps/api/src/common/import-boundary.test.ts` (api to web case)

**Interfaces:**
- Produces, from `@pathways/shared` (definitions unchanged): `type RoutePrincipal`, `routePolicy`, `type RouteKey`, `hasRoutePermission(role: string, granted: readonly string[], _route: RouteKey, permissions: readonly AtomicPermission[]): boolean`, `type RouteSelection`, `routeUuidPattern: RegExp`, `matchRoute(input: string): RouteSelection | null`, `parseRouteSelection(input: Record<string, unknown>): RouteSelection | null`, `routeAllowed(principal: RoutePrincipal, selection: RouteSelection, checkAssignment = true): boolean`, `isAggregateOnly(principal: RoutePrincipal): boolean`, `type RouteDecision`.
- `apps/web/src/lib/rbac/route-access.ts` keeps every other export until Task 2.

- [ ] **Step 1: Write the failing shared test**

Create `packages/shared/src/rbac/route-policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { rolePermissions } from './authorization-policy'
import type { CanonicalRole } from './role-catalog'
import {
  type RoutePrincipal,
  isAggregateOnly,
  matchRoute,
  parseRouteSelection,
  routeAllowed,
  routeUuidPattern,
} from './route-policy'

const projectId = 'a1000000-0000-4000-8000-00000000000b'
const otherProjectId = 'a2000000-0000-4000-8000-00000000000c'
const principal = (role: CanonicalRole): RoutePrincipal => ({
  roles: [role],
  permissions: rolePermissions[role],
  assignedProjectIds: [projectId],
})

describe('route policy', () => {
  it('matches a project path and lowercases its id', () => {
    expect(matchRoute(`/projects/${projectId.toUpperCase()}`)).toEqual({
      route: 'project',
      projectId,
    })
  })

  it('parses only known routes with valid ids and no extra keys', () => {
    expect(parseRouteSelection({ route: 'project', projectId })).toEqual({
      route: 'project',
      projectId,
    })
    expect(parseRouteSelection({ route: 'project', projectId: 'not-a-uuid' })).toBeNull()
    expect(parseRouteSelection({ route: 'project', projectId, extra: 'x' })).toBeNull()
    expect(parseRouteSelection({ route: 'unknown' })).toBeNull()
  })

  it('checks project assignment unless the caller verifies it in the database', () => {
    const other = { route: 'project' as const, projectId: otherProjectId }
    expect(routeAllowed(principal('PROJECT_OFFICER'), { route: 'project', projectId })).toBe(true)
    expect(routeAllowed(principal('PROJECT_OFFICER'), other)).toBe(false)
    expect(routeAllowed(principal('PROJECT_OFFICER'), other, false)).toBe(true)
  })

  it('treats only program and grant managers as aggregate-only', () => {
    expect(isAggregateOnly(principal('PROGRAM_MANAGER'))).toBe(true)
    expect(isAggregateOnly(principal('GRANT_MANAGER'))).toBe(true)
    expect(isAggregateOnly(principal('PROJECT_MANAGER'))).toBe(false)
  })

  it('accepts version 1 to 8 UUIDs only', () => {
    expect(routeUuidPattern.test(projectId)).toBe(true)
    expect(routeUuidPattern.test('a1000000-0000-0000-8000-00000000000b')).toBe(false)
  })
})
```

Run: `pnpm --filter @pathways/shared exec vitest run src/rbac/route-policy.test.ts`
Expected: FAIL, cannot resolve `./route-policy`.

- [ ] **Step 2: Write the failing api to web boundary test**

In `apps/api/src/common/import-boundary.test.ts`, add below `sourceFiles`:

```ts
// Every TypeScript file under a folder, tests included, skipping installed packages.
function allFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : allFiles(full)
    return entry.name.endsWith('.ts') ? [full] : []
  })
}
```

and append at the end of the file:

```ts
describe('api to web boundary', () => {
  it('keeps api source, tests and seeds free of imports from apps/web', () => {
    const web = path.resolve(src, '../../web')
    const files = [...allFiles(src), ...allFiles(path.resolve(src, '../prisma'))]
    expect(files.length).toBeGreaterThan(100)
    const violations = files.flatMap((file) =>
      specifiers(readFileSync(file, 'utf8'))
        .filter(
          (specifier) =>
            specifier.startsWith('.') &&
            path.resolve(path.dirname(file), specifier).startsWith(`${web}${path.sep}`),
        )
        .map(
          (specifier) => `${path.relative(src, file).split(path.sep).join('/')} -> ${specifier}`,
        ),
    )
    expect(violations).toEqual([])
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/common/import-boundary.test.ts`
Expected: the new test FAILS listing exactly the three api files of ruling 2, each `-> ../../../../web/src/lib/rbac/route-access`; the two existing tests pass.

- [ ] **Step 3: Create the import split and line check scripts**

Create `.tmp/f4a/split-imports.mjs`:

```js
// Splits named imports of one web module across new modules by imported name.
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

const top = (file) => path.relative(web, file).split(path.sep)[0]
const inWeb = (file) => !path.relative(web, file).startsWith('..')

// The web-relative module a specifier names, or null when it points outside apps/web/src.
const target = (file, spec) => {
  if (spec.startsWith('@/')) return spec.slice(2)
  if (!spec.startsWith('.')) return null
  const resolved = path.resolve(path.dirname(file), spec)
  return inWeb(resolved) ? path.relative(web, resolved).split(path.sep).join('/') : null
}

// A package name stays as is; a sibling is ./name; otherwise a web module keeps the old specifier style.
const specifier = (file, spec, destination) => {
  if (destination.startsWith('@pathways/')) return destination
  const absolute = path.join(web, destination)
  if (path.dirname(absolute) === path.dirname(file)) return `./${path.basename(absolute)}`
  if (spec.startsWith('@/') || top(file) !== top(absolute)) return `@/${destination}`
  const relative = path.relative(path.dirname(file), absolute).split(path.sep).join('/')
  return relative.startsWith('.') ? relative : `./${relative}`
}

let total = 0
for (const file of roots.flatMap((root) => walk(path.resolve(root)))) {
  let count = 0
  const text = readFileSync(file, 'utf8').replace(pattern, (whole, typeOnly, list, quote, spec) => {
    if (target(file, spec) !== from) return whole
    const groups = new Map()
    for (const item of list.split(',').map((part) => part.trim()).filter(Boolean)) {
      const name = item.replace(/^type\s+/, '').split(/\s+as\s+/)[0]
      const destination = names[name]
      if (!destination) throw new Error(`${file}: no destination for ${name}`)
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

Create `.tmp/f4a/same-lines.mjs`:

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

Create `.tmp/f4a/route-policy-map.json`:

```json
{
  "from": "lib/rbac/route-access",
  "names": {
    "RouteDecision": "@pathways/shared",
    "RouteKey": "@pathways/shared",
    "RoutePrincipal": "@pathways/shared",
    "RouteSelection": "@pathways/shared",
    "isAggregateOnly": "@pathways/shared",
    "matchRoute": "@pathways/shared",
    "parseRouteSelection": "@pathways/shared",
    "routeAllowed": "@pathways/shared",
    "routePolicy": "@pathways/shared",
    "RouteCheckError": "lib/rbac/route-access",
    "authorizationPathForUiPath": "lib/rbac/route-access",
    "canonicalFeatures": "lib/rbac/route-access",
    "displayQueryKeys": "lib/rbac/route-access",
    "filterDashboardNavGroups": "lib/rbac/route-access",
    "filterWorkspaceTabs": "lib/rbac/route-access",
    "getRouteAccess": "lib/rbac/route-access",
    "getVerifiedRouteAccess": "lib/rbac/route-access",
    "isInternalPath": "lib/rbac/route-access",
    "isPublicPath": "lib/rbac/route-access",
    "landingPath": "lib/rbac/route-access",
    "principalHasAtomicPermission": "lib/rbac/route-access",
    "reportKindPermissions": "lib/rbac/route-access",
    "requestRouteCheck": "lib/rbac/route-access",
    "visibleFeatures": "lib/rbac/route-access",
    "WorkspaceTabAccess": "lib/rbac/route-access"
  }
}
```

- [ ] **Step 4: Cut the shared lines out verbatim**

```bash
R=apps/web/src/lib/rbac/route-access.ts
S=packages/shared/src/rbac/route-policy.ts
git show HEAD:$R > .tmp/f4a/route-access.before.ts
{ printf "%s\n" "import { type AtomicPermission, hasAtomicPermission } from './authorization-policy'" ""; sed -n '9,145p;152,158p;220,339p;526,530p' $R; } > $S
sed -i -e 's/^const uuid = /export const routeUuidPattern = /' -e 's/\buuid\.test(/routeUuidPattern.test(/g' -e 's/^const hasRoutePermission = /export const hasRoutePermission = /' $S
sed -i -e '526,530d' -e '220,339d' -e '152,158d' -e '9,145d' -e '1,8d' -e 's/\buuid\.test(/routeUuidPattern.test(/g' $R
cat > .tmp/f4a/route-access-imports.ts <<'EOF'
import {
  type AtomicPermission,
  type RoleName,
  type RouteDecision,
  type RouteKey,
  type RoutePrincipal,
  type RouteSelection,
  hasAtomicPermission,
  hasRoutePermission,
  matchRoute,
  parseRouteSelection,
  roleCodeFor,
  rolePermissions,
  routeAllowed,
  routePolicy,
  routeUuidPattern,
} from '@pathways/shared'
import { approvedApiBaseUrl } from '../api-base-url'
EOF
cat .tmp/f4a/route-access-imports.ts $R > .tmp/f4a/route-access.next.ts && mv .tmp/f4a/route-access.next.ts $R
sed -i "s#^export \* from './rbac/beneficiary-step-up'\$#&\nexport * from './rbac/route-policy'#" packages/shared/src/index.ts
wc -l $S $R
node .tmp/f4a/same-lines.mjs .tmp/f4a/route-access.before.ts $S $R routeUuidPattern=uuid
grep -n "route-policy" packages/shared/src/index.ts
```

Expected: `271` and `377` lines; `same lines: 623` (exit 0); the barrel shows `export * from './rbac/route-policy'` directly after the `beneficiary-step-up` line. Any other output from `same-lines.mjs`: stop, the cut is not verbatim.

- [ ] **Step 5: Repoint the web and api importers**

```bash
node .tmp/f4a/split-imports.mjs .tmp/f4a/route-policy-map.json apps/web/src apps/web/e2e
sed -i "s#'\.\./\.\./\.\./\.\./web/src/lib/rbac/route-access'#'@pathways/shared'#" \
  apps/api/src/modules/auth/route-access.service.ts \
  apps/api/src/modules/auth/route-access.service.test.ts \
  apps/api/src/modules/dashboards/dashboard-home-authorization-parity.test.ts
git grep -n "web/src/lib/rbac" -- apps/api
```

Expected: the script prints the 8 files listed under Files with `1` each and `total: 8`; the final grep prints nothing.

In `apps/web/src/components/layout/route-access-guard.test.tsx`, inside the `vi.mock('@/lib/rbac/route-access', ...)` factory, delete the line `    matchRoute: () => ({ route: 'beneficiaries' }),`. The guard now imports `matchRoute` from `@pathways/shared`; the real `matchRoute('/beneficiaries')` returns the same `{ route: 'beneficiaries' }` the mock returned.

- [ ] **Step 6: Run the tests**

```bash
git add -N packages/shared apps/web apps/api
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts' '*.tsx')
pnpm --filter @pathways/shared exec vitest run src/rbac
pnpm --filter @pathways/api exec vitest run src/common/import-boundary.test.ts src/modules/auth/route-access.service.test.ts src/modules/dashboards/dashboard-home-authorization-parity.test.ts
pnpm --filter @pathways/web exec vitest run src/lib/rbac src/lib/middleware.test.ts src/components/layout src/features/dashboard
pnpm typecheck && pnpm lint
pnpm test 2>&1 | grep -E "Tests +[0-9]+"
```

Expected: 5 route policy tests and all three boundary tests pass; typecheck and lint pass; shared = `B_shared + 5`, api = `B_api + 1`, web = `B_web`.

- [ ] **Step 7: Measure the middleware and commit**

```bash
pnpm --filter @pathways/shared build
pnpm --filter @pathways/web build > .tmp/f4a/web-build-task1.log 2>&1; echo "exit $?"
grep -E "Middleware" .tmp/f4a/web-build-task1.log
git checkout -- apps/web/next-env.d.ts
git add -A packages/shared apps/web apps/api
git commit -m "refactor(shared): move the route policy table into packages/shared

The api route check and its tests import @pathways/shared, so no api file imports web source. Web Middleware <M0> kB before, <M1> kB after.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: exit 0 and a `Middleware` size equal to or smaller than `M0`. Replace `<M0>` and `<M1>` with the sizes. If the build fails or the size grows, do not commit: stop and report both sizes and the build log tail (ruling 9).

---

### Task 2: Split lib/rbac route access by purpose

**Pre-flight amendments (controller, binding):**
- Where this task replaces the guard mock, replace the whole `vi.mock('@/lib/rbac/route-access', ...)` call (Biome may have reflowed it after Task 1), not an exact quoted string.

**Files:**
- Create: `apps/web/src/lib/rbac/policy.ts`, `apps/web/src/lib/rbac/routes.ts`, `apps/web/src/lib/rbac/nav.ts`, `apps/web/src/lib/rbac/transport.ts`
- Delete: `apps/web/src/lib/rbac/route-access.ts`
- Move: `apps/web/src/lib/rbac/route-access.frontend-aliases.test.ts` -> `apps/web/src/lib/rbac/routes.frontend-aliases.test.ts`
- Move: `apps/web/src/lib/rbac/route-access.monitoring.test.ts` -> `apps/web/src/lib/rbac/policy.monitoring.test.ts`
- Move: `apps/web/src/lib/rbac/route-check-transport.test.ts` -> `apps/web/src/lib/rbac/transport.test.ts`
- Modify (import split, 54 files): every file that imports from `@/lib/rbac/route-access` or `./route-access` (the script lists them)
- Modify (mock path): `apps/web/src/components/layout/route-access-guard.test.tsx`, `apps/web/src/features/dashboard/pinned-charts.test.tsx`

**Interfaces:**
- Consumes: the shared names of Task 1.
- Produces (definitions unchanged): `@/lib/rbac/policy`: `reportKindPermissions`, `getVerifiedRouteAccess(principal: RoutePrincipal, path: string): RouteAccessResult`, `principalHasAtomicPermission(principal: RoutePrincipal | null | undefined, permission: AtomicPermission): boolean`, `getRouteAccess(role: RoleName, path: string, assignedProjectIds?: readonly string[])`, `landingPath(principal)`. `@/lib/rbac/routes`: `isPublicPath`, `displayQueryKeys`, `authorizationPathForUiPath(input: string): string | null`, `isInternalPath`. `@/lib/rbac/nav`: `canonicalFeatures`, `visibleFeatures`, `filterDashboardNavGroups`, `WorkspaceTabAccess`, `filterWorkspaceTabs`. `@/lib/rbac/transport`: `RouteCheckError`, `requestRouteCheck`.

- [ ] **Step 1: Confirm the starting file**

```bash
git grep -n "vi.mock('@/lib/rbac/route-access'" -- apps/web/src | wc -l
git grep -l "rbac/route-access'" -- apps/web/src | wc -l
git grep -l "'\./route-access'" -- apps/web/src | wc -l
```

Expected: `2`; `46`; `10`.

- [ ] **Step 2: Create the module split script and its plan**

Create `.tmp/f4a/split-module.mjs`:

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

Create `.tmp/f4a/rbac-split.json`:

```json
{
  "apps/web/src/lib/rbac/policy.ts": {
    "header": [
      "import {",
      "  type AtomicPermission,",
      "  type RoleName,",
      "  type RoutePrincipal,",
      "  hasAtomicPermission,",
      "  matchRoute,",
      "  roleCodeFor,",
      "  rolePermissions,",
      "  routeAllowed,",
      "  routePolicy,",
      "} from '@pathways/shared'"
    ],
    "names": ["reportKindPermissions", "RouteAccessResult", "getVerifiedRouteAccess", "principalHasAtomicPermission", "getRouteAccess", "landingPath"]
  },
  "apps/web/src/lib/rbac/routes.ts": {
    "header": ["import { type RouteKey, matchRoute, routePolicy, routeUuidPattern } from '@pathways/shared'"],
    "names": ["isPublicPath", "displayQueryKeys", "authorizationPathForUiPath", "isInternalPath"]
  },
  "apps/web/src/lib/rbac/nav.ts": {
    "header": [
      "import {",
      "  type RoleName,",
      "  type RouteKey,",
      "  type RoutePrincipal,",
      "  hasAtomicPermission,",
      "  hasRoutePermission,",
      "  roleCodeFor,",
      "  rolePermissions,",
      "  routePolicy,",
      "} from '@pathways/shared'",
      "import { getRouteAccess, getVerifiedRouteAccess } from './policy'"
    ],
    "names": ["canonicalFeatures", "visibleFeatures", "filterDashboardNavGroups", "WorkspaceTabAccess", "filterWorkspaceTabs"]
  },
  "apps/web/src/lib/rbac/transport.ts": {
    "header": [
      "import {",
      "  type RouteDecision,",
      "  type RouteSelection,",
      "  parseRouteSelection,",
      "  routeUuidPattern,",
      "} from '@pathways/shared'",
      "import { approvedApiBaseUrl } from '../api-base-url'"
    ],
    "names": ["RouteCheckFailure", "RouteCheckError", "requestRouteCheck"]
  }
}
```

Create `.tmp/f4a/rbac-map.json`:

```json
{
  "from": "lib/rbac/route-access",
  "names": {
    "reportKindPermissions": "lib/rbac/policy",
    "getVerifiedRouteAccess": "lib/rbac/policy",
    "principalHasAtomicPermission": "lib/rbac/policy",
    "getRouteAccess": "lib/rbac/policy",
    "landingPath": "lib/rbac/policy",
    "isPublicPath": "lib/rbac/routes",
    "displayQueryKeys": "lib/rbac/routes",
    "authorizationPathForUiPath": "lib/rbac/routes",
    "isInternalPath": "lib/rbac/routes",
    "canonicalFeatures": "lib/rbac/nav",
    "visibleFeatures": "lib/rbac/nav",
    "filterDashboardNavGroups": "lib/rbac/nav",
    "WorkspaceTabAccess": "lib/rbac/nav",
    "filterWorkspaceTabs": "lib/rbac/nav",
    "RouteCheckError": "lib/rbac/transport",
    "requestRouteCheck": "lib/rbac/transport"
  }
}
```

- [ ] **Step 3: Split, check and delete the old file**

```bash
R=apps/web/src/lib/rbac/route-access.ts
D=apps/web/src/lib/rbac
git show HEAD:$R > .tmp/f4a/route-access.task1.ts
node .tmp/f4a/split-module.mjs $R .tmp/f4a/rbac-split.json
node .tmp/f4a/same-lines.mjs .tmp/f4a/route-access.task1.ts $D/policy.ts $D/routes.ts $D/nav.ts $D/transport.ts
git rm -q $R
git mv $D/route-access.frontend-aliases.test.ts $D/routes.frontend-aliases.test.ts
git mv $D/route-access.monitoring.test.ts $D/policy.monitoring.test.ts
git mv $D/route-check-transport.test.ts $D/transport.test.ts
```

Expected: four files written (about 58, 61, 140 and 99 lines); `same lines: <n>` with exit 0. Any other output: stop, the split is not verbatim.

- [ ] **Step 4: Repoint the importers and the two mocks**

```bash
node .tmp/f4a/split-imports.mjs .tmp/f4a/rbac-map.json apps/web/src apps/web/e2e
```

Expected: 54 files with `1` each and `total: 54` (the 46 alias files of Step 1 minus the two that only mock the module, plus the 10 relative importers, three of them under their new test names).

In `apps/web/src/components/layout/route-access-guard.test.tsx` replace

```ts
vi.mock('@/lib/rbac/route-access', () => {
  return {
    RouteCheckError: RouteCheckErrorMock,
    authorizationPathForUiPath: () => '/beneficiaries',
    getVerifiedRouteAccess: () => ({ allowed: true }),
    requestRouteCheck,
  }
})
```

with

```ts
vi.mock('@/lib/rbac/transport', () => ({ RouteCheckError: RouteCheckErrorMock, requestRouteCheck }))
vi.mock('@/lib/rbac/routes', () => ({ authorizationPathForUiPath: () => '/beneficiaries' }))
vi.mock('@/lib/rbac/policy', () => ({ getVerifiedRouteAccess: () => ({ allowed: true }) }))
```

In `apps/web/src/features/dashboard/pinned-charts.test.tsx` replace `vi.mock('@/lib/rbac/route-access', () => ({` with `vi.mock('@/lib/rbac/policy', () => ({`.

```bash
git grep -n "route-access'" -- apps packages
git grep -nE "vi.mock\('@/lib/rbac/(policy|routes|transport)'" -- apps/web/src | wc -l
```

Expected: the first grep prints nothing; `4` mocks on the new paths (Review Focus 1).

- [ ] **Step 5: Run the tests and commit**

```bash
git add -N apps/web
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts' '*.tsx')
pnpm --filter @pathways/web exec vitest run src/lib src/components/layout src/features/dashboard src/features/auth src/providers
pnpm typecheck && pnpm lint
pnpm --filter @pathways/web test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/web
git status --short apps/web/src/lib/rbac | grep "^R"
git commit -m "refactor(web): split lib/rbac route access into policy, routes, nav and transport

Declarations move verbatim; 54 importers and 2 test mocks follow.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass; web = Task 1 web count; `git status` shows at least the three `R` test renames.

---

### Task 3: Move the auth platform modules to lib/auth

**Pre-flight amendments (controller, binding):**
- At Step 4 also run the web build (`pnpm --filter @pathways/web build`, exit 0) and record the Middleware line, because this task rewrites `lib/middleware.ts` imports.

**Files:**
- Move (16 files) from `apps/web/src/features/auth/` to `apps/web/src/lib/auth/`: `auth-access.ts`, `auth-access.test.ts`, `auth-access.edge.test.ts`, `auth-access.test-fixtures.ts`, `mfa-flow.ts`, `mfa-flow.test.ts`, `password-recovery.ts`, `password-recovery.test.ts`, `password-recovery-routes.test.ts`, `verification-flight.ts`, `verification-flight.test.ts`, `workspace-access.ts`, `workspace-access.test.ts`, `workspace-resolution.test.ts`, `workspace-verification.ts`, `workspace-verification.test.ts`
- Modify (import or mock path only, 31 files): listed by the script in Step 3, including `apps/web/e2e/fixtures/role-routes.tsx` and the esbuild entry string in `apps/web/src/lib/rbac/navigation-diagnostic.test.ts`

**Interfaces:**
- Produces (definitions unchanged): `@/lib/auth/auth-access` (`ApplicationProfile`, `ApplicationContext`, `MfaStatus`, `AuthAccessError`, `getProfileRole`, `requestAuthJson`, ...), `@/lib/auth/workspace-access` (`contextCookieName`, `decodeWorkspaceContext`, `encodeWorkspaceContext`, `clearWorkspaceContext`, `resolveWorkspaceProfile`, ...), `@/lib/auth/workspace-verification`, `@/lib/auth/verification-flight`, `@/lib/auth/mfa-flow`, `@/lib/auth/password-recovery`, `@/lib/auth/auth-access.test-fixtures`.

- [ ] **Step 1: Move the files**

```bash
for f in auth-access.ts auth-access.test.ts auth-access.edge.test.ts auth-access.test-fixtures.ts \
  mfa-flow.ts mfa-flow.test.ts password-recovery.ts password-recovery.test.ts password-recovery-routes.test.ts \
  verification-flight.ts verification-flight.test.ts workspace-access.ts workspace-access.test.ts \
  workspace-resolution.test.ts workspace-verification.ts workspace-verification.test.ts; do
  git mv apps/web/src/features/auth/$f apps/web/src/lib/auth/$f
done
git ls-files apps/web/src/features/auth | wc -l
```

Expected: `15`.

- [ ] **Step 2: Create the repoint script and map**

Create `.tmp/f4a/repoint.mjs`:

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

Create `.tmp/f4a/auth-map.json`:

```json
{
  "features/auth/auth-access": "lib/auth/auth-access",
  "features/auth/auth-access.test-fixtures": "lib/auth/auth-access.test-fixtures",
  "features/auth/mfa-flow": "lib/auth/mfa-flow",
  "features/auth/password-recovery": "lib/auth/password-recovery",
  "features/auth/verification-flight": "lib/auth/verification-flight",
  "features/auth/workspace-access": "lib/auth/workspace-access",
  "features/auth/workspace-verification": "lib/auth/workspace-verification"
}
```

The pattern also matches `from '...'` inside the esbuild `stdin` template string of `navigation-diagnostic.test.ts`; that file is under `lib/`, so the rewrite stays relative (`'../auth/auth-access'`), which esbuild resolves from `resolveDir`.

- [ ] **Step 3: Repoint every importer and mock**

```bash
node .tmp/f4a/repoint.mjs .tmp/f4a/auth-map.json apps/web/src apps/web/e2e
```

Expected output (the dry run on `c07ab1c0` printed exactly this after Tasks 1 and 2):

```text
apps/web/src/app/(staff-auth)/auth/recovery/callback/route.ts: 1
apps/web/src/app/(staff-auth)/auth/recovery/complete/route.ts: 1
apps/web/src/app/(staff-auth)/staff/forgot-password/page.tsx: 1
apps/web/src/features/auth/account-recovery-workspace.tsx: 1
apps/web/src/features/auth/mfa-form.test.tsx: 1
apps/web/src/features/auth/mfa-form.tsx: 2
apps/web/src/features/auth/password-recovery-request-form.tsx: 1
apps/web/src/features/auth/password-update-form.tsx: 1
apps/web/src/features/auth/reset-password-workspace.tsx: 1
apps/web/src/hooks/use-pending-create.test.tsx: 1
apps/web/src/hooks/use-pending-create.ts: 1
apps/web/src/hooks/use-source-mutation-context.test.tsx: 1
apps/web/src/hooks/use-source-mutation-context.ts: 1
apps/web/src/lib/auth/beneficiary-step-up.ts: 1
apps/web/src/lib/auth/sensitive-drafts.test.ts: 1
apps/web/src/lib/auth/sensitive-drafts.ts: 1
apps/web/src/lib/middleware.test.ts: 2
apps/web/src/lib/middleware.ts: 1
apps/web/src/lib/rbac/navigation-diagnostic.test.ts: 2
apps/web/src/lib/rbac/navigation-diagnostic.ts: 1
apps/web/src/lib/rbac/server-access.test.ts: 3
apps/web/src/lib/rbac/server-access.ts: 1
apps/web/src/lib/services/core-feature-client.ts: 1
apps/web/src/lib/services/pathways-client.ts: 1
apps/web/src/lib/services/rules-human-client.ts: 1
apps/web/src/lib/supabase/recovery-server.test.ts: 2
apps/web/src/lib/supabase/recovery-server.ts: 1
apps/web/src/providers/authorized-query-provider.tsx: 1
apps/web/src/providers/current-role-provider.test.tsx: 3
apps/web/src/providers/current-role-provider.tsx: 4
apps/web/e2e/fixtures/role-routes.tsx: 1
total: 42
```

```bash
git grep -nE "features/auth/(auth-access|workspace-access|workspace-verification|verification-flight|mfa-flow|password-recovery)" -- apps
git grep -nE "'\./(auth-access|workspace-access|workspace-verification|verification-flight|mfa-flow|password-recovery)'" -- apps/web/src/features
git grep -nE "vi.mock\('(\./auth-access|@/lib/auth/(auth-access|workspace-verification))'" -- apps/web/src
git grep -nE "from '(@/features/|(\.\./)+features/)" -- apps/web/src/lib apps/web/src/hooks apps/web/src/providers apps/web/src/components | grep -vE '\.test\.tsx?:'
```

Expected: the first two print nothing; the third prints two mocks, `mfa-form.test.tsx` on `'@/lib/auth/auth-access'` and `current-role-provider.test.tsx` on `'@/lib/auth/workspace-verification'` (Review Focus 1); the last prints only `apps/web/src/lib/services/own-profile-client.ts` (Task 4).

- [ ] **Step 4: Run the tests and commit**

```bash
git add -N apps/web
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts' '*.tsx')
pnpm --filter @pathways/web exec vitest run src/lib/auth src/lib/rbac src/lib/middleware.test.ts src/lib/supabase src/features/auth src/hooks src/providers
pnpm typecheck && pnpm lint
pnpm --filter @pathways/web test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/web
git status --short apps/web/src | grep -c "^R"
git commit -m "refactor(web): move auth platform modules from features/auth to lib/auth

Seven modules with their tests move unchanged; 42 specifiers in 31 files follow, including two test mocks and the e2e role fixture.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass, including `auth-access.edge.test.ts` and the Edge runtime case in `navigation-diagnostic.test.ts` (Review Focus 2); web = Task 1 web count; `16` renames.

---

### Task 4: Enforce web and package import direction

**Files:**
- Test: `apps/web/src/import-direction.test.ts`
- Test: `packages/shared/src/package-import-boundary.test.ts`
- Modify: `apps/web/src/lib/services/own-profile-client.ts`, `apps/web/src/features/profile/own-profile-contract.ts`, `apps/web/src/features/profile/own-profile-workspace.tsx`

**Interfaces:**
- Produces: `type OwnProfileRecord` exported from `@/lib/services/own-profile-client` (was `@/features/profile/own-profile-contract`); `ownProfileResponseSchema` becomes private to the client.

- [ ] **Step 1: Write the web direction test**

Create `apps/web/src/import-direction.test.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const src = __dirname

// Top folders each folder may not import (CR section 3.1); '.' is a file directly under src.
const forbidden: Record<string, readonly string[]> = {
  '.': ['app', 'features'],
  components: ['app', 'features'],
  constants: ['app', 'features'],
  features: ['app'],
  hooks: ['app', 'features'],
  lib: ['app', 'features'],
  providers: ['app', 'features'],
  types: ['app', 'features'],
}

// Every module specifier in a source text: static, type-only, side-effect, re-export and dynamic imports.
function specifiers(source: string): string[] {
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g
  return [...source.matchAll(pattern)].map((match) => match[1])
}

// The top folder of a src-relative path, or '.' for a file directly under src.
const layer = (relative: string) => (relative.includes('/') ? relative.split('/')[0] : '.')

const relativeToSrc = (file: string) => path.relative(src, file).split(path.sep).join('/')

// The src-relative path a specifier names, or null for a package import.
function target(file: string, specifier: string): string | null {
  if (specifier.startsWith('@/')) return specifier.slice(2)
  if (!specifier.startsWith('.')) return null
  return relativeToSrc(path.resolve(path.dirname(file), specifier))
}

// The rule an import breaks, or null when the direction allows it.
function violation(file: string, specifier: string): string | null {
  const to = target(file, specifier)
  if (to === null) return null
  if (to.startsWith('../')) return 'outside apps/web/src'
  const from = layer(relativeToSrc(file))
  return forbidden[from]?.includes(layer(to)) ? `${from} must not import ${layer(to)}` : null
}

// Non-test TypeScript files under a folder; tests may import fixtures across layers.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : []
  })
}

describe('web import direction', () => {
  it('detects every import form that breaks the direction', () => {
    const file = path.join(src, 'lib', 'rbac', 'example.ts')
    const source = [
      "import { a } from '@/features/auth/a'",
      "import type { B } from '../../features/profile/b'",
      "import '@/app/layout'",
      "export { d } from '../../../../api/src/modules/d'",
      "const e = await import('@/features/reports/e')",
      "import { f } from '@/lib/utils'",
      "import { g } from '@pathways/shared'",
      "import { h } from './policy'",
    ].join('\n')
    expect(specifiers(source).map((specifier) => violation(file, specifier))).toEqual([
      'lib must not import features',
      'lib must not import features',
      'lib must not import app',
      'outside apps/web/src',
      'lib must not import features',
      null,
      null,
      null,
    ])
  })

  it('keeps lower layers off features and app, and features off app', () => {
    const files = sourceFiles(src)
    expect(files.length).toBeGreaterThan(300)
    const violations = files.flatMap((file) =>
      specifiers(readFileSync(file, 'utf8')).flatMap((specifier) => {
        const rule = violation(file, specifier)
        return rule ? [`${relativeToSrc(file)} -> ${specifier} (${rule})`] : []
      }),
    )
    expect(violations).toEqual([])
  })
})
```

Run: `pnpm --filter @pathways/web exec vitest run src/import-direction.test.ts`
Expected: the first test passes; the second FAILS with exactly `lib/services/own-profile-client.ts -> @/features/profile/own-profile-contract (lib must not import features)`.

- [ ] **Step 2: Write the package boundary test**

Create `packages/shared/src/package-import-boundary.test.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const packagesRoot = path.resolve(__dirname, '../..')
const sources = ['shared', 'imports', 'config'].map((name) => path.join(packagesRoot, name, 'src'))

// Every module specifier in a source text: static, type-only, side-effect, re-export and dynamic imports.
function specifiers(source: string): string[] {
  const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g
  return [...source.matchAll(pattern)].map((match) => match[1])
}

// True when a specifier in a package file names an app alias or leaves that package's src.
function leavesPackage(file: string, root: string, specifier: string): boolean {
  if (specifier.startsWith('@/') || specifier.startsWith('@app/')) return true
  if (!specifier.startsWith('.')) return false
  const resolved = path.resolve(path.dirname(file), specifier)
  return resolved !== root && !resolved.startsWith(`${root}${path.sep}`)
}

// Non-test TypeScript files under a folder.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : []
  })
}

describe('package import boundary', () => {
  it('detects app aliases and paths that leave the package', () => {
    const root = sources[0]
    const file = path.join(root, 'rbac', 'example.ts')
    expect(
      [
        '@/lib/rbac/policy',
        '@app/common/authz/application-identity',
        '../../../../apps/web/src/lib/env',
        './role-catalog',
        '../rules/rule-contract',
        'zod',
        '@pathways/imports',
      ].map((specifier) => leavesPackage(file, root, specifier)),
    ).toEqual([true, true, true, false, false, false, false])
  })

  it('keeps shared, imports and config free of app imports', () => {
    const violations = sources.flatMap((root) =>
      sourceFiles(root).flatMap((file) =>
        specifiers(readFileSync(file, 'utf8'))
          .filter((specifier) => leavesPackage(file, root, specifier))
          .map(
            (specifier) =>
              `${path.relative(packagesRoot, file).split(path.sep).join('/')} -> ${specifier}`,
          ),
      ),
    )
    expect(violations).toEqual([])
  })
})
```

Run: `pnpm --filter @pathways/shared exec vitest run src/package-import-boundary.test.ts`
Expected: PASS, 2 tests. No package imports an app today, so the scan passes at once; the first test proves it would catch one.

- [ ] **Step 3: Move the own profile response schema into its client**

`apps/web/src/features/profile/own-profile-contract.ts`: delete this block (8 lines); `z` stays imported for the two form schemas:

```ts
export const ownProfileResponseSchema = z
  .object({
    fullName: z.string(),
    contactNumber: z.string().nullable(),
    updatedAt: z.string().datetime(),
  })
  .strict()
export type OwnProfileRecord = z.infer<typeof ownProfileResponseSchema>
```

`apps/web/src/lib/services/own-profile-client.ts`: replace the line `import { ownProfileResponseSchema } from '@/features/profile/own-profile-contract'` with `import { z } from 'zod'`, and add directly after the `./pathways-client` import line, with a blank line before and after:

```ts
const ownProfileResponseSchema = z
  .object({
    fullName: z.string(),
    contactNumber: z.string().nullable(),
    updatedAt: z.string().datetime(),
  })
  .strict()
export type OwnProfileRecord = z.infer<typeof ownProfileResponseSchema>
```

`apps/web/src/features/profile/own-profile-workspace.tsx`: replace `import { ownProfileClient } from '@/lib/services/own-profile-client'` with `import { type OwnProfileRecord, ownProfileClient } from '@/lib/services/own-profile-client'`, and `import { type OwnProfileRecord, ownProfileSchema } from './own-profile-contract'` with `import { ownProfileSchema } from './own-profile-contract'`.

```bash
git grep -n "ownProfileResponseSchema\|OwnProfileRecord" -- apps/web/src
```

Expected: `ownProfileResponseSchema` appears only in `own-profile-client.ts` (definition and two parse calls); `OwnProfileRecord` only in the client and `own-profile-workspace.tsx`.

- [ ] **Step 4: Run the tests and commit**

```bash
git add -N apps/web packages/shared
pnpm exec biome check --write apps/web/src/import-direction.test.ts packages/shared/src/package-import-boundary.test.ts apps/web/src/lib/services/own-profile-client.ts apps/web/src/features/profile/own-profile-contract.ts apps/web/src/features/profile/own-profile-workspace.tsx
pnpm --filter @pathways/web exec vitest run src/import-direction.test.ts src/features/profile
pnpm --filter @pathways/shared exec vitest run src/package-import-boundary.test.ts
pnpm typecheck && pnpm lint
pnpm test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add apps/web/src/import-direction.test.ts packages/shared/src/package-import-boundary.test.ts apps/web/src/lib/services/own-profile-client.ts apps/web/src/features/profile/own-profile-contract.ts apps/web/src/features/profile/own-profile-workspace.tsx
git commit -m "test: enforce web and package import direction

The own profile response schema moves into its client so lib no longer imports features.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: both direction tests and the profile tests pass; web = `B_web + 2`, shared = `B_shared + 7`, api = `B_api + 1`.

---

### Task 5: usePermission

**Pre-flight amendments (controller, binding):**
- Rename test 1 so its title says the permission is absent from the grant list (PROJECT_MANAGER holds `activities.create` by policy), not that the role policy denies it.

**Files:**
- Modify: `apps/web/src/lib/rbac/policy.ts` (add `permissionChecker`)
- Create: `apps/web/src/hooks/use-permission.ts`
- Test: `apps/web/src/hooks/use-permission.test.tsx`
- Modify (wrappers): `apps/web/src/features/projects/budget-module/budget-ledger.tsx`, `apps/web/src/features/rules-board/rule-condition-rows.tsx`, `apps/web/src/features/rules-board/rule-drawer.tsx`, `apps/web/src/features/rules-board/rules-board.tsx`, `apps/web/src/features/public/publication-queue-workspace.tsx`, `apps/web/src/features/analytics/use-analytics-insights.ts`

**Interfaces:**
- Consumes: `principalHasAtomicPermission` from `@/lib/rbac/policy` (Task 2); `useCurrentRole` from `@/hooks/use-current-role`.
- Produces: `permissionChecker(principal: RoutePrincipal | null | undefined): (permission: AtomicPermission) => boolean` from `@/lib/rbac/policy`; `usePermission(): (permission: AtomicPermission) => boolean` from `@/hooks/use-permission`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/hooks/use-permission.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const role = vi.hoisted(() => ({
  profile: null as null | { roles: string[]; permissions: string[]; assignedProjectIds: string[] },
}))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => role }))

import { permissionChecker } from '@/lib/rbac/policy'
import { usePermission } from './use-permission'

afterEach(cleanup)

describe('usePermission', () => {
  it('checks the current profile grants against the role policy', () => {
    role.profile = {
      roles: ['PROJECT_MANAGER'],
      permissions: ['activities.read'],
      assignedProjectIds: [],
    }
    const { result } = renderHook(() => usePermission())
    expect(result.current('activities.read')).toBe(true)
    expect(result.current('activities.create')).toBe(false)
  })

  it('denies without a profile and when the role does not hold a listed grant', () => {
    expect(permissionChecker(null)('activities.read')).toBe(false)
    const manager = {
      roles: ['PROGRAM_MANAGER'],
      permissions: ['beneficiaries.records.read'],
      assignedProjectIds: [],
    }
    expect(permissionChecker(manager)('beneficiaries.records.read')).toBe(false)
  })
})
```

Run: `pnpm --filter @pathways/web exec vitest run src/hooks/use-permission.test.tsx`
Expected: FAIL, cannot resolve `./use-permission` (and `permissionChecker` is not exported).

- [ ] **Step 2: Add the checker and the hook**

In `apps/web/src/lib/rbac/policy.ts`, directly after the `principalHasAtomicPermission` declaration, add:

```ts
// One principal's atomic permission check, for code that tests several grants.
export const permissionChecker =
  (principal: RoutePrincipal | null | undefined) => (permission: AtomicPermission) =>
    principalHasAtomicPermission(principal, permission)
```

Create `apps/web/src/hooks/use-permission.ts`:

```ts
import { useCurrentRole } from '@/hooks/use-current-role'
import { permissionChecker } from '@/lib/rbac/policy'

// The current profile's atomic permission check; the API still authorizes every request.
export const usePermission = () => permissionChecker(useCurrentRole().profile)
```

Run: `pnpm --filter @pathways/web exec vitest run src/hooks/use-permission.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 3: Replace the six wrappers**

Each replaced line sits at the top level of its component or hook, before any early return, so hook order is unchanged.

`apps/web/src/features/projects/budget-module/budget-ledger.tsx`:
- Replace the two lines `  const can = (permission: Parameters<typeof principalHasAtomicPermission>[1]) =>` and `    principalHasAtomicPermission(profile, permission)` with `  const can = usePermission()` (`profile` stays: `me` reads it).
- Delete `import { principalHasAtomicPermission } from '@/lib/rbac/policy'`; add `import { usePermission } from '@/hooks/use-permission'` below the `use-current-role` import.

`apps/web/src/features/rules-board/rule-condition-rows.tsx`:
- Replace the three lines `  const { profile } = useCurrentRole()`, `  const has = (permission: Parameters<typeof principalHasAtomicPermission>[1]) =>` and `    principalHasAtomicPermission(profile, permission)` with `  const has = usePermission()`.
- Replace `import { useCurrentRole } from '@/hooks/use-current-role'` with `import { usePermission } from '@/hooks/use-permission'`; delete the `principalHasAtomicPermission` import (no other use in this file).

`apps/web/src/features/rules-board/rule-drawer.tsx` (in `OwnedDrawer`):
- Replace `  const has = (permission: Parameters<typeof principalHasAtomicPermission>[1]) =>` and `    principalHasAtomicPermission(profile, permission)` with `  const has = usePermission()`. Keep `const { profile, access } = useCurrentRole()` (later lines use both) and the policy import (the outer `RuleDrawer` uses it).
- Add `import { usePermission } from '@/hooks/use-permission'` below the `use-current-role` import.

`apps/web/src/features/rules-board/rules-board.tsx` (in `ManageTable`):
- Replace the three lines `  const { profile } = useCurrentRole()`, `  const can = (permission: Parameters<typeof principalHasAtomicPermission>[1]) =>` and `    principalHasAtomicPermission(profile, permission)` that sit directly above `  if (!rules.length)` with `  const can = usePermission()`. The other `useCurrentRole()` call and `principalHasAtomicPermission(profile, 'rules.create')` in `RulesBoard` stay.
- Add `import { usePermission } from '@/hooks/use-permission'` below the `use-current-role` import.

`apps/web/src/features/public/publication-queue-workspace.tsx`:
- Replace `  const permitted = (permission: 'public.preview' | 'public.approve' | 'public.publish') =>` and `    principalHasAtomicPermission(profile, permission)` with `  const permitted = usePermission()`.
- Delete `import { principalHasAtomicPermission } from '@/lib/rbac/policy'`; add `import { usePermission } from '@/hooks/use-permission'` below the `use-current-role` import.

`apps/web/src/features/analytics/use-analytics-insights.ts`:
- Replace `  const has = (permission: Permission) => principalHasAtomicPermission(profile, permission)` with `  const has = permissionChecker(profile)`.
- Replace `import { principalHasAtomicPermission } from '@/lib/rbac/policy'` with `import { permissionChecker, principalHasAtomicPermission } from '@/lib/rbac/policy'` (the `Principal` and `Permission` types still derive from it).

```bash
git grep -n 'principalHasAtomicPermission(profile, permission)' -- apps/web/src/features
git grep -n "= usePermission()" -- apps/web/src/features | wc -l
git grep -n "permissionChecker(profile)" -- apps/web/src/features | wc -l
```

Expected: nothing; `5`; `1`.

- [ ] **Step 4: Run the tests and commit**

```bash
git add -N apps/web
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts' '*.tsx')
pnpm --filter @pathways/web exec vitest run src/hooks src/features/rules-board src/features/projects/budget-module src/features/public src/features/analytics src/features/dashboard
pnpm typecheck && pnpm lint
pnpm --filter @pathways/web test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/web
git commit -m "refactor(web): add usePermission and replace six local permission wrappers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass; web = `B_web + 4`.

---

### Task 6: Records and SAD routing

**Pre-flight amendments (controller, binding):**
- Also in the CR: update the section 3.7 F4 row to name F4a and F4b, replace the stale section 9 'Left open ... proposed for F4' sentence about the api to web route-access import with its closure by F4a, and add providers, constants and types to the section 3.1 web dependency diagram where the plan's rule covers them.
- Add to the section 9 F4a Deferred line: the duplicated `['PROGRAM_MANAGER','GRANT_MANAGER']` literal versus shared `aggregateOnlyRoles`, and the `source-mutation.ts` UUID regex (S8).
- In the audit MOD-10 cell, replace the words 'web side F4.' with 'web side closed by F4a.' rather than appending (avoid 'F4.;').

**Files:**
- Modify: `scripts/sad/check.ts` (organization isolation globs), `scripts/sad/check.test.ts`, `docs/sad-pathways.md:36`
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.1, 3.3, 9)
- Modify: `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-05, MOD-10, MOD-16 rows)
- Modify: `docs/prd-pathways.md:1539`, `docs/qad-pathways.md:88,423`, `docs/rfc-pathways-aws-hosting-migration.md:46`
- Modify: `docs/index.md` (CR row status)
- Modify: `docs/activity-log.md`

- [ ] **Step 1: Route web auth and rbac to the organization isolation checker (ruling 10)**

In `scripts/sad/check.test.ts`, directly after the test `routes api authz, audit and guard changes to the organization isolation checker`, add:

```ts
  it('routes web auth, rbac and middleware changes to the organization isolation checker', () => {
    const files = [
      'apps/web/src/lib/auth/workspace-access.ts',
      'apps/web/src/lib/rbac/policy.ts',
      'apps/web/src/lib/middleware.ts',
      'apps/web/src/middleware.ts',
    ]
    const routed = routing(files.map((file) => change(file, 'new', 'old')))
    expect(routed['organization-isolation-checker']).toEqual(files)
  })
```

Run: `pnpm sad:test`
Expected: FAIL on the new test.

In `scripts/sad/check.ts`, `organization-isolation-checker` globs, add directly after `'apps/api/src/modules/auth/guards/**/*.ts',`:

```ts
      'apps/web/src/lib/auth/**/*.ts',
      'apps/web/src/lib/rbac/**/*.ts',
      'apps/web/src/lib/middleware.ts',
      'apps/web/src/middleware.ts',
```

In `docs/sad-pathways.md` line 36, after `` `apps/api/src/modules/auth/guards/**/*.ts` `` insert `` , `apps/web/src/lib/auth/**/*.ts`, `apps/web/src/lib/rbac/**/*.ts`, `apps/web/src/lib/middleware.ts`, `apps/web/src/middleware.ts` `` (inside the same cell).

```bash
pnpm sad:test && pnpm sad:typecheck
```

Expected: PASS; sad = `B_sad + 1`.

- [ ] **Step 2: Amend the Change Record**

`docs/cr-pathways-codebase-modularization.md`:

Section 3.1, replace

```text
Web and package import direction is enforced in F4, with the tool chosen there (Biome 1.9.4 cannot express path globs).
```

with

```text
The web direction is enforced by `apps/web/src/import-direction.test.ts` (non-test files under `components/`, `constants/`, `hooks/`, `lib/`, `providers/`, `types/` and directly under `src/` import neither `features/` nor `app/`, `features/` does not import `app/`, and no file leaves `apps/web/src`), the package direction by `packages/shared/src/package-import-boundary.test.ts`, and the api to web direction by a case in `apps/api/src/common/import-boundary.test.ts`; all three are Vitest tests for the same Biome limit (amended 2026-10-10 for F4a).
```

Section 3.3, after the paragraph starting `Outside features:`, add:

```text
`lib/rbac/{policy,routes,nav,transport}` are files; the route table and the decisions the API also makes (`routePolicy`, `matchRoute`, `parseRouteSelection`, `routeAllowed`, `isAggregateOnly`) live in `packages/shared/src/rbac/route-policy.ts`. `lib/auth` holds the auth platform modules (`auth-access`, `workspace-access`, `workspace-verification`, `verification-flight`, `mfa-flow`, `password-recovery`); `features/auth` keeps the sign-in, MFA and recovery screens. Components read permissions through `usePermission` (amended 2026-10-10 for F4a).
```

Section 9, append:

```markdown
F4a applied 2026-10-10 on refactor/f4a-web-boundaries:
- Route policy: the route table, `matchRoute`, `parseRouteSelection`, `routeAllowed`, `isAggregateOnly`, `hasRoutePermission`, `routeUuidPattern` and the route types moved verbatim from `apps/web/src/lib/rbac/route-access.ts` to `packages/shared/src/rbac/route-policy.ts`; `route-access.service.ts` and its two tests import `@pathways/shared`, so no api file imports web source.
- RBAC: the rest of `route-access.ts` split verbatim into `lib/rbac/policy.ts`, `routes.ts`, `nav.ts` and `transport.ts` (54 importers and 2 test mocks repointed).
- Auth: `auth-access`, `workspace-access`, `workspace-verification`, `verification-flight`, `mfa-flow` and `password-recovery` moved with their tests and fixtures from `features/auth` to `lib/auth` (42 specifiers in 31 files, 2 test mocks).
- Profile: the own profile response schema moved into `lib/services/own-profile-client.ts`.
- Direction: `apps/web/src/import-direction.test.ts`, `packages/shared/src/package-import-boundary.test.ts` and an api to web case in `apps/api/src/common/import-boundary.test.ts`.
- Permissions: `usePermission` (`hooks/use-permission.ts`) and `permissionChecker` (`lib/rbac/policy.ts`) replace six local wrappers.
- SAD: organization isolation routing covers `apps/web/src/lib/auth/**/*.ts`, `apps/web/src/lib/rbac/**/*.ts` and both middleware files.
- Middleware: <Task 1 sizes sentence>.
- Decisions: F4 split into F4a and F4b (ruling 1); three api files, not two, imported the web route table (ruling 2); `lib/auth` absorbed seven modules because `lib`, `hooks` and `providers` imported all of them (ruling 4); `usePermission` reads `@/hooks/use-current-role` so the 60 existing mocks of that module keep applying (ruling 7); test files stay exempt from the direction tests (ruling 6); `rules-human-client.ts` no longer imported `features/analytics` at F4 start, and the 17 lower-layer imports were 16 into `features/auth` and 1 into `features/profile` (ruling 11).

Deferred to F4b: `lib/api/core` with the owned-read helper (MOD-05 core part), `lib/format/{date,percent,plural,tone}`, the shared table head and dialog check, thinner providers.
```

Replace `<Task 1 sizes sentence>` with `web Middleware went from <M0> kB to <M1> kB` using the Task 0 and Task 1 measurements.

- [ ] **Step 3: Update the audit, living docs and index**

- Audit: append to the disposition cell of MOD-05 `; core part in F4b.`, of MOD-10 `; web side closed by F4a.` and of MOD-16 `; usePermission applied by F4a, lib/format and the shared table head in F4b.`
- `docs/prd-pathways.md` line 1539: replace `` `apps/web/src/lib/rbac/route-access.ts` `` with `` `packages/shared/src/rbac/route-policy.ts` ``.
- `docs/qad-pathways.md` and `docs/rfc-pathways-aws-hosting-migration.md`:

```bash
sed -i 's#apps/web/src/features/auth/\(password-recovery\|mfa-flow\)#apps/web/src/lib/auth/\1#g' docs/qad-pathways.md docs/rfc-pathways-aws-hosting-migration.md
sed -i 's#apps/web/src/lib/rbac/route-access\.frontend-aliases\.test\.ts#apps/web/src/lib/rbac/routes.frontend-aliases.test.ts#' docs/qad-pathways.md
git grep -nE "lib/rbac/route-access|route-check-transport|features/auth/(auth-access|workspace-access|workspace-verification|verification-flight|mfa-flow|password-recovery)" -- docs ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/cr-*' ':!docs/superpowers/*'
```

Expected: the grep prints nothing (no living doc names an old path).

- `docs/index.md`: CR row status becomes `Approved; F1, F2, F3a, F3b and F4a applied, F4b next`.

- [ ] **Step 4: Activity log**

Add to `docs/activity-log.md`:

```markdown
## 2026-10-10 Modularization F4a web boundaries (refactor/f4a-web-boundaries)
```

with one bullet per Task 1 to Task 5 stating what moved, split or was added, with its commit hash and the shared, api and web test counts at the end of that task; a bullet with the Middleware sizes; a bullet saying the F4a decisions are recorded in the change record section 9 (the plan stays until F4b is planned, because it holds the F4b outline); and a bullet listing the F4b deferrals. Task 7 Step 5 appends the gate results.

- [ ] **Step 5: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint
git add docs scripts/sad
git commit -m "docs: record modularization F4a and route web auth and rbac to the isolation checker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline.

---

### Task 7: Full release gates and merge

- [ ] **Step 1: Static gates and dist layout**

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm sad:test
git checkout -- apps/web/next-env.d.ts
test -f packages/shared/dist/rbac/route-policy.js && test -f apps/api/dist/packages/shared/src/rbac/route-policy.js && test ! -e apps/api/dist/apps/web && test -f apps/api/dist/apps/api/src/main.js && echo "dist layout ok"
pnpm --filter @pathways/web build > .tmp/f4a/web-build-gates.log 2>&1; echo "exit $?"
grep -E "Middleware" .tmp/f4a/web-build-gates.log
git checkout -- apps/web/next-env.d.ts
```

Expected: all pass, `dist layout ok` (nest `deleteOutDir` removes the old `dist/apps/web` copy; Review Focus 4), web build exit 0 with Middleware at most `M0`. Versus Task 0: shared = `B_shared + 7` (route policy 5, package boundary 2), api = `B_api + 1`, web = `B_web + 4` (direction 2, usePermission 2), sad = `B_sad + 1`, config and imports unchanged.

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

Expected: `"status":"ok"`; a module-resolution error or `parseRouteSelection is not a function` in the `pnpm dev:local` output fails the gate; auth-navigation 27/27; main suite 39 pass, 9 fail, 22 not run, with the same 9 failing as the F1, F2, F3a and F3b gate runs (MFA Verify helper, password-login harness, workflows seed end date). Browser smoke, each step as a demo user whose role allows it: sign in with TOTP (`mfa-flow`, `auth-access`) and land on `/workspace`, and as System Administrator on `/settings/users` (`landingPath`); check the sidebar groups for a Project Officer and a Program Manager (`nav.ts`); open an assigned project and its tabs (`filterWorkspaceTabs`), then paste an unassigned project URL with an uppercase UUID and expect the same denial page as on dev (middleware `routes.ts`, server page `transport.ts`, API route check through the shared policy); open a beneficiary as Project Officer and confirm a Program Manager cannot open beneficiary records, as on dev; open `/staff/forgot-password` (`password-recovery`); open the rules board manage table, a rule drawer, a budget ledger and the public tracker queue, and confirm each shows the same actions as on dev (`usePermission`); open My Profile and save the contact number (`own-profile-client`). Every step must behave as on dev.

- [ ] **Step 4: SAD review**

```bash
pnpm sad:check --base dev --head HEAD --output .tmp/sad/f4a/manifest.json
```

Dispatch every role the manifest requires (expect `design-qa-agent`, `restraint-guardian`, `organization-isolation-checker`, `beneficiary-privacy-guardian` and `rule-engine-determinism-checker`, the last because `features/analytics/rule-editor.tsx` changed its import) with the section 4.2 handoff packet from `docs/sad-pathways.md`, save their section 4.4 envelopes to `.tmp/sad/f4a/reviews.json`, then:

```bash
pnpm sad:signoff -- --base dev --head HEAD --reviews .tmp/sad/f4a/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun.

- [ ] **Step 5: Record the gate results**

Append a final bullet to the Task 6 activity-log section with the gate results (per-package counts, Middleware size, replay exit code, e2e pass counts, smoke result, SAD sign-off), then:

```bash
git add docs/activity-log.md
git commit -m "docs: record modularization F4a release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Merge into local dev**

```bash
git checkout dev
git merge --no-ff refactor/f4a-web-boundaries -m "Merge refactor/f4a-web-boundaries into dev

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Keep the plan for F4b**

The plan holds the F4b outline, so it stays on dev (as the F3 plan did for F3b). In `docs/index.md` section 1.6 change the F4 plan row status to `F4a executed; holds the F4b outline`, then:

```bash
pnpm docs:check 2>&1 | tail -3
git add docs/index.md
git commit -m "docs: mark F4a executed in the plan index

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline. Do not push `origin dev` until the developer says so.

---

## F4b outline (web helpers, branch `refactor/f4b-web-helpers`)

To be written as its own plan from dev after F4a merges; that plan's Task 0 removes this file and its index row. Counts below were taken at `c07ab1c0` and must be recounted in F4b Task 0 (F4a changes import lines in several of these files).

- **Task 0, baseline:** recount every number below; record web Middleware.
- **Task 1, `lib/format`:**
  - `percent.ts`: `git mv apps/web/src/lib/percent.ts` and `percent.test.ts` into `lib/format/`; 11 importer lines repointed with `repoint.mjs`.
  - `plural.ts`: one `plural(count, word)` replaces the three identical copies in `import-workspace.tsx`, `manager-overview.tsx` and `portfolio-overview.tsx` (7 calls).
  - `date.ts`: the five `formatDate` copies have two behaviors, so two functions. `formatCalendarDay(value)` is the exact `Intl` medium UTC formatting of `${value}T00:00:00.000Z` used by `analytics-utils.ts`, `survey-report-overview.tsx` and `reporting-workspace.tsx` (which keeps its own empty guard). `formatDateOrUnavailable(value, formatter)` is the validated copy in `beneficiary-utils.ts` and `activity-utils.ts`; activities pass their own two-digit-day formatter, so `Jan 05, 2026` stays `Jan 05, 2026`. Characterization tests pin each copy's output, including invalid and empty input, before any copy is removed.
  - `tone.ts`: holds only the `StatusTone` union that `StatusBadge` accepts. The 9 `statusTone` definitions (audit said 10) map 9 different status vocabularies, so none is merged; each is typed to return `StatusTone`.
- **Task 2, shared table head and dialog check:** the 6 header class constants are 4 identical (`activity-list-table.tsx`, `indicator-library-manager.tsx`, `live-evaluation-workspace.tsx`, `project-indicators-workspace.tsx`, 23 uses) and 2 different (`collection-workspace.tsx`, `import-workspace.tsx`, which stay). Share the class string, not a component: call sites combine it both with `cn(...)` (tailwind-merge drops `text-left` when `text-center` is added) and with template strings (both kept), and a component would change one of those rendered class strings. Dialogs: `DialogShell` (19 files) and `ConfirmationDialog` (10 files) already exist; 13 files (12 in features, plus `proof-preview-dialog.tsx`) render only a raw `DialogContent`, and 3 more mix raw and shared dialogs. Consolidate only a raw dialog whose rendered markup equals a shared one exactly; the first candidate checked (`project-archive-dialog.tsx`) lacks `ConfirmationDialog`'s warning icon and cancel-button focus, so the expected outcome is a recorded "no exact duplicate".
- **Task 3, `lib/api/core`:** move `PathwaysClientError`, `requestFoundationResponse`, `requestFoundation` and `readContextCookie` out of `pathways-client.ts` (2786 lines) into `lib/api/core/request.ts`. `requestFoundationResponse` calls `ensureSourceInvalidationSubscription`, which clears the source mutation tickets, so that subscription moves with it to `source-mutation.ts` (where the tickets live) and a test pins the call. The owned-read helper is the request ownership capture: `ownerCookie()` is identical in `core-feature-client.ts` and `rules-human-client.ts`, and both `read()` functions capture the cookie and draft generation and re-check them with the same boolean; `captureRequestOwner(signal)` in `lib/api/core/request-owner.ts` replaces that part only. The two `read()` bodies keep their own response handling, because they differ in body limit (2 MB stream versus `response.json()`) and in error text. Mock risk: 57 test files mock `@/lib/services/pathways-client`; 23 of those factories define `PathwaysClientError` or `requestFoundation*` and 1 uses `importActual`. Each moves to a `@/lib/api/core/request` mock in the same commit, counted before and after. Named imports to repoint: `PathwaysClientError` 33, `requestFoundation` 7, `requestFoundationResponse` 5. SAD: add `apps/web/src/lib/api/**/*.ts` to beneficiary-privacy-guardian.
- **Task 4, thinner providers:** move `useAuthorizedRead`, `authorizedReadPolicy` and `SUMMARY_READ_STALE_MS` from `providers/authorized-query-provider.tsx` (328 lines) to `hooks/use-authorized-read.ts`, with the context exported from the provider file. 25 named imports and the 12 `vi.mock('@/providers/authorized-query-provider', ...)` factories that stub `useAuthorizedRead` move together. `current-role-provider.tsx` (281 lines) keeps its verification state machine; its workspace cookie reads and writes move to `lib/auth/workspace-access.ts` only where the moved code is byte-identical (it splits `document.cookie` on `'; '` while `pathways-client` splits on `';'` and trims, so those two stay separate).
- **Task 5, records:** CR 3.3 and section 9 F4b disposition, audit MOD-05 (core part closed), MOD-16 (closed), index, activity log, SAD routing.
- **Task 6, gates and merge:** as F4a Task 7, with a smoke over date, percent and plural text on activities, beneficiaries, analytics, reports and the dashboards, and the four table headers. After merge, remove this plan and its index row.
