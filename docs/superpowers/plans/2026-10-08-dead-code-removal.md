# Dead Code Removal Plan

Goal: delete stale, disconnected and unused code across the workspace without changing behavior.

Spec: none. The developer's request on 2026-10-08 was "Remove/delete any stale, disconnected, unused codes in the codebase." This plan is the authority; rulings are provisional.

Integration branch: `chore/dead-code-removal` (worktree `.worktrees/dead-code`), based on local `dev` e3bb2a07. Tasks 1-4 run in parallel on their own branches and worktrees, cut from the integration branch, and touch disjoint directories. Task 5 runs after Tasks 1-4 merge into the integration branch.

Evidence source: a knip 5 run (`pnpm dlx knip@5 --reporter json`) on 2026-10-08. Each task gets its candidate slice as a JSON file. knip is a lead, not proof: it misses PowerShell, SQL, YAML, Markdown, dynamic imports and framework conventions.

## Global Constraints

1. Behavior must not change. Delete only code that nothing reaches.
2. A candidate is dead only when a repo-wide search finds no live reference: `git grep -n` for the file stem and the export name across every tracked file, including `.ps1`, `.psm1`, `.sql`, `.yml`, `.yaml`, `.json`, `.mjs`, `.cjs` and `package.json` scripts. A reference from another file you are deleting in the same task does not count.
3. Keep anything intentionally hidden: code behind a `*_UI_ENABLED = false` (or similar) flag and every item in `docs/deferred-features.md`. Hidden is not dead.
4. Never touch database migrations (`apps/api/prisma/migrations/**`, `supabase/migrations/**`), `rbac-contract.json`, `schema.prisma`, seed data, or anything under `docs/` except as Task 5 states.
5. Keep framework conventions: Next.js route files and their named exports (`default`, `metadata`, `generateMetadata`, `dynamic`, `revalidate`, `runtime`, `GET`/`POST` handlers, `middleware`, `config`), NestJS modules, controllers, providers and decorators, Vitest/Playwright config files, and Vercel entry points.
6. An export used only inside its own file loses the `export` keyword; it is not deleted. An export used nowhere is deleted, and so is anything that becomes unused as a result (follow the chain inside your scope).
7. A test file whose only subject is deleted code is deleted with it. A test case covering a deleted export is removed; other cases stay.
8. Stay inside your task's directories. If a removal needs an edit outside them, do not make it; list it in the report under "Cross-scope follow-ups".
9. Match the surrounding code style. No new comments explaining deletions. No dependency or `package.json` / lockfile edits in Tasks 1-4.
10. Verification for every task: the affected app's `pnpm typecheck`, `pnpm exec biome check <changed paths>`, and `pnpm test` (Vitest) pass in the task worktree. Report the exact commands and pass counts.
11. Commit in small, focused commits with messages like `chore(web): remove unused ...`. End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
12. Append one dated entry to `docs/activity-log.md` only in Task 5.

## Task 1: Web features dead code

Scope: `apps/web/src/features/**`.

- Unused files under scope from the knip slice (for example `rule-configuration-workspace.tsx`, `authorized-workspace.tsx`, `staff-auth-shell.tsx`, `journey-stages-workspace.tsx`, `dashboard-preview-chart.tsx`, `activity-review-dialog.tsx`, `connected-delivery-workspace.tsx`, `milestone-progress-panel.tsx`, `project-milestones-section.tsx`, `public-project-components.tsx`, `pmerl-preview.tsx`, `label-settings-workspace.tsx`): verify each per constraint 2, then delete it with its dedicated tests.
- Unused exports and types under scope: delete or un-export per constraint 6.
- Duplicate export in `features/dashboard/role-dashboard.tsx` (`canLoadDashboardMonitoring` / `canOpenDashboardMonitoring`): keep one name and update callers inside scope.
- Run `pnpm exec tsc --noEmit --noUnusedLocals` in `apps/web` and remove unused locals and imports reported inside scope (not parameters).

## Task 2: Web shared dead code

Scope: `apps/web/src/**` outside `features/` (`app`, `components`, `lib`, `hooks`, `constants`, `providers` and so on).

- Unused files from the knip slice (for example `lib/client.ts`, `components/layout/back-button.tsx`, `components/ui/command.tsx`, `lib/demo-state/use-demo-state.ts`): verify, then delete with dedicated tests.
- Unused exports and types under scope: delete or un-export per constraint 6. Keep the public surface of `components/ui/*` primitives only where the DSD names them as the design-system component set; otherwise treat them like any export.
- Run `pnpm exec tsc --noEmit --noUnusedLocals` in `apps/web` and remove unused locals and imports reported inside scope.

## Task 3: API and packages dead code

Scope: `apps/api/src/**`, `apps/api/prisma/**/*.ts` except migrations, seeds' data files and `prisma/tests/**`, and `packages/*/src/**`.

- Unused file `apps/api/src/modules/dashboards/dashboard-contract.ts`: verify, then delete.
- Unused exports and types under scope: delete or un-export per constraint 6. Exports of `packages/*` count as used when any workspace imports them.
- Duplicate export in `packages/shared/src/monitoring/metric-contract.ts` (`monitoringIndicatorSchema` / `projectIndicatorSchema`): keep one name and update callers inside scope.
- Run `pnpm exec tsc --noEmit --noUnusedLocals` in `apps/api` and each package and remove unused locals and imports reported inside scope.
- Verification: `apps/api` and each changed package's typecheck and tests.

## Task 4: Scripts, infra, e2e and harness files

Scope: `scripts/**`, `infra/**`, `apps/api/scripts/**`, `apps/api/prisma/tests/**`, `apps/web/e2e/**`, root `playwright.*.config.ts`.

- These are mostly launched by PowerShell, CI, `package.json` scripts or runbooks, which knip cannot see. Delete a candidate only when constraint 2 finds no reference anywhere, including `docs/` runbooks and `.github/`. A runbook or doc reference means keep.
- Unused exports in `.mjs` helpers: un-export or delete per constraint 6 only when no other script, test or `.ps1` imports them.
- Verification: `node --test` for any changed `scripts/db/*.test.mjs` files, `pnpm sad:test` if `scripts/sad` changes, and `pnpm exec playwright test --list` if e2e files change. Do not run the replay harness.

## Task 5: Dependencies, second pass and integration check

Runs on the integration branch after Tasks 1-4 merge.

- Re-run knip. Remove unused dependencies it reports (candidates from the first run: `pino-pretty` in `apps/api`, `cmdk` and `@pathways/ui` in `apps/web`, `@sentry/nextjs` in `apps/web`, root `husky`) only after verifying no config, script or convention file loads them (`next.config`, `instrumentation*`, `sentry.*.config*`, `scripts/setup-husky.mjs`, `.husky/`). Update the lockfile with `pnpm install`.
- Remove anything newly unused that Tasks 1-4 exposed, in any scope, under the same constraints.
- Resolve the "Cross-scope follow-ups" the task reports listed.
- Full verification: `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm --filter @pathways/web build`.
- Append one entry to `docs/activity-log.md` summarizing what was removed and what was kept on purpose.
