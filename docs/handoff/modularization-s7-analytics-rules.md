# S7 Analytics, Dashboards and Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the rules board and the analytics rule screens into one `features/rules` folder with one exported component per file, a `rules.utils`, `rules.copy` and `rules.reads` module and a public `index.ts`, move the rules client to `lib/api/rules.ts`, and give the api rules module one controller per file with the shared `requestIdentity` and `Tx` kernel, with no change to any route, status code, response body, permission decision, rendered text, read key or SQL statement.

**Architecture:** S7 is split (ruling 1). This plan gives S7a, the rules domain end to end, in full (nine tasks including baseline and gates); S7b (analytics and dashboards: api, shared `monitoring` folder and web) follows as an outline. S7a moves files with `git mv` through a path-resolving codemod, then moves declarations verbatim between files with a second codemod that rewrites every affected import, and checks each move with a line-multiset comparison against `HEAD`. Every one-off script lives under `.tmp/s7a/` (gitignored, never committed) and is given in full. Every step was dry-run in sequence on a `git archive` export of `a101ad7c` (F4a complete) with a stand-in for S1's `request-identity.ts`; the copy typechecked, Biome passed, the full web suite passed (210 files, 1905 tests with the new tests) and the api rules and common suites passed. The script steps of Tasks 1 to 6 were replayed on 2026-10-12 on an export of `675a0b58` (dev after the F4a merge, the same source as `a101ad7c`) and printed the same output, and Biome found nothing to fix in the moved files; the outputs quoted below come from those runs.

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, NestJS 10.4.22, Next 15.5.14 (App Router), React 19, Vitest 3.2 (jsdom per file), Playwright, Biome 1.9.4, zod 3.25.76.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.1 to 3.7 with roadmap row S7, 4, 6, 7, and 9 including the F1 to F4a dispositions and the F4b and S1 to S6 dispositions present at execution) and `docs/audit-pathways-codebase-modularity-20261009.md` (S7a: MOD-05 rules client, MOD-10 none left, MOD-15 rules part, MOD-16 rule-binding read keys, MOD-17 rules controllers and `Owned*` names; S7b: MOD-04, MOD-05, MOD-06, MOD-11, MOD-15, MOD-16 and MOD-17 for analytics and dashboards). MOD-13 (`RulesHumanService` provided twice) was closed by F1 and needs nothing here.

## Rulings

Controller rulings for S7 (2026-10-11, revised 2026-10-12). Each was checked against `a101ad7c` and again against dev `675a0b58`, whose source is identical (only `docs/activity-log.md` changed). F4b and S1 to S6 land before S7a; Task 0 recounts every figure and stops on a difference it cannot explain by those slices.

1. **Split into S7a and S7b, by domain.** The slice spans api `modules/dashboards` (19 files, 4747 lines), `modules/rules` (31 files, 4842 lines) and `modules/analytics-insights` (5 files, 756 lines), web `features/analytics` (37 files, 9463 lines), `features/rules-board` (14 files, 2644 lines) and `features/dashboard` (27 files, 3790 lines), shared `monitoring/` (14 files, 3192 lines; 7 sources, 1534 lines) and the analytics and dashboard methods of `pathways-client.ts`: about twenty tasks. The rules part is self-contained (its api has no DTO and its contracts already live in `packages/shared/src/rules`) and is the roadmap's reason for the slice's position, so S7a (this plan, branch `refactor/s7a-rules`) takes rules end to end in nine tasks. S7b (outline, branch `refactor/s7b-analytics-dashboards`) takes analytics and dashboards: api, the shared `monitoring` folder and web. The outline counts about twelve S7b tasks in two parts (api and shared, then web); when the S7b plan is written and passes ten tasks, it splits along that line into S7b and S7c, as F4 split. Both names replace `refactor/s7-analytics-rules`; SAD evidence goes to `.tmp/sad/s7a/` and `.tmp/sad/s7b/`.
2. **`features/rules` takes 30 files.** The 14 `features/rules-board` files, 13 rules files from `features/analytics` (8 sources: `alerts-workspace`, `human-review-action`, `human-review-workspace`, `linked-alert-summary`, `recommendations-workspace`, `rule-condition-editor`, `rule-editor`, `rule-test-workspace`; 5 tests), `features/projects/project-rules-panel.tsx` with its test (S1b's outline leaves the rules panel to S7), and the new `recommendation-fields.test.tsx` of Task 2. Sources go under `components/`; four files are renamed for what they hold: `rule-board-model.ts` to `rules.utils.ts` (and its test), `rule-condition-rows.tsx` to `components/condition-builder.tsx`, `recommendation-detail-workspace.test.tsx` to `components/human-review-workspace.recommendations.test.tsx` (CR 3.5 concern name). After the move no analytics file imports a rules file and no rules file imports an analytics file (MOD-15 "analytics and rules-board import each other" closed).
3. **Route pages and other features import `features/rules` through its index, as S1b, S5 and S6 do.** CR 3.3 says other features import a feature only through `index.ts`, and the S1b outline extends `apps/web/src/import-direction.test.ts` so that any non-test file outside `features/projects`, route pages included, imports it only through its index; S5 and S6 route their pages the same way. `features/rules/index.ts` therefore exports exactly the four components used outside the feature: `AlertsWorkspace`, `RulesBoard`, `RecommendationsWorkspace` (the three route pages) and `ProjectRulesPanel` (the project review workspace). A barrel can pull every re-exported client module into a route's client bundle, so Task 0 records the First Load JS of `/alerts`, `/alerts/repository`, `/recommendations/[recommendationId]` and `/projects/[projectId]/monitor-evaluate` and Task 6 compares them after the switch; any growth stops the task and is reported, as F4a ruling 9 did for Middleware. If CR section 9 already records an S1b decision that route pages keep component imports, Task 6 follows that decision instead (Task 0 Step 2 reads it).
4. **One exported component per file (CR 3.3), verbatim.** Task 3 moves exported helpers into `rules.utils.ts`, labels into `rules.copy.ts`, the `useBindingChoices` hook into `hooks/`, and the second and third exported components of a file into their own files: `RuleTreeView`, `ApplyToFields`, `SeverityField`, `RecommendationFields`, `RulePreview`; `rule-drawer-shared.ts` and `rule-output-fields.tsx` are emptied and deleted. Private sub-components stay with their screen, except the three in `human-review-workspace.tsx` (`AlertEvidence`, `EvidenceTable`, `NotificationRow`, 646 to 493 lines), and the rule template data leaves `rule-editor.tsx` for `rule-templates.ts` (709 to 635 lines). Three files stay above the CR 3.5 flag of 500 lines: `rule-editor.tsx` (631 after Task 4), `rule-test-workspace.tsx` (603) and `rules-board.tsx` (503); each is one stateful form or board body whose private parts share its module constants, so a further split lifts state into props, a logic edit outside this slice. They are recorded in CR section 9, not hidden.
5. **Names by purpose.** `OwnedDrawer`, `OwnedRuleEditor`, `OwnedRuleTest` and `OwnedAction` become `RuleDrawerForm`, `RuleEditorForm`, `RuleTestForm` and `HumanReviewActionForm` (CR 3.3 replaces `Owned*`). The private `copy` and `instant` helpers of `human-review-workspace.tsx` become exported `codeLabel` and `manilaTime` once they move to `rules.utils.ts`; a longer name pushed a JSX text line past 100 columns in an earlier trial and Biome re-wrapped it. The private `label(value) => metricLabel(value)` wrapper in `rule-condition-editor.tsx` is removed and its three calls read `metricLabel`, because `RuleTreeView` leaves that file and an exported `label` would name nothing.
6. **`rules.reads.ts` holds the read hooks.** The three `rule-binding-*` reads are written twice with the same key, scope, permission and fetcher (`rule-condition-rows.tsx` and `rule-editor.tsx`, MOD-16). They become `useRuleBindingIndicators`, `useRuleBindingActivities` and `useRuleBindingActivityContext(scopeProjectId, enabled)`; each caller passes its own enabled expression, so both call sites send the same five arguments as before and hook order is unchanged. `binding-reads.mjs` writes the hooks from the fetchers it finds and stops if the two copies differ, so S2 or S3b moving `getProjectIndicators`, `getActivities` or `getActivityContext` to `lib/api` needs no edit here. CR 3.3's `.reads.ts` row is amended to include the hooks, as S3b's `useProjectIndicatorsRead` does. The three `getProjects` reads (`rules-editor-projects`, `rules-project-choices`, `review-projects`) keep their keys: merging them would make three cache entries one.
7. **The NUL separator becomes an escape.** `rule-output-fields.tsx` builds the recommendation reuse key with two literal U+0000 characters, so git treats the file as binary (F2 deferral). Task 2 writes the six characters `\u0000` instead, the same string at runtime; a characterization test written first shows a saved recommendation `a` / `bc` is still offered beside a rule recommendation `ab` / `c`, which a lost separator would hide.
8. **`alertSeverityRank` reads the shared list.** `SEVERITY_RANK` (`CRITICAL: 0` to `LOW: 3`, otherwise 4) equals the index in shared `alertSeverities` (F2 deferral). The only input ranked differently is a prototype key such as `constructor` (a function before, 4 after), unreachable because `alertOutputSchema` parses `severity` as an enum of four. A characterization test of the queue's severity sort is written and passes before the change.
9. **`lib/api/rules.ts` takes the rules client by `git mv`** (CR 3.3 `lib/api/<domain>`). The export keeps its name `rulesHumanClient`: it is the human review API as against the machine endpoints, and a rename would rewrite 9 mock factories for no reader gain. After Task 3 there are 22 specifiers in 21 files, 9 of them `vi.mock` paths, all moved in one commit.
10. **One api controller per file (MOD-17).** `rules-human.controller.ts` holds four controllers; they move verbatim to `rules.controller.ts`, `alerts.controller.ts`, `recommendations.controller.ts` and `notifications.controller.ts`, methods in the same order, so `GET alerts/escalated` is still declared before `GET alerts/:id`. `rules-human.module.ts` keeps its name and class: `modules/rules` wires three modules that register separately. `rules.routes.test.ts`, written first, reads the module metadata and pins all 23 routes (with source operations), their permission and their `Cache-Control` header, and that every handler answers 403 without an identity; it passes before and after.
11. **`requestIdentity` from S1.** S1a adds `requestIdentity(request)` to `common/authz/request-identity.ts` and leaves the other controllers to their slices. S7a adopts it in the four rules controllers (the shared `actor` function, 22 calls) and in `rules-source-operations.controller.ts`; message and status are unchanged. The analytics and dashboards controllers are S7b's.
12. **`Tx` in the rules module.** The 7 `Prisma.TransactionClient` annotations in rules production code (2 in `rules-human.service.ts`, 5 in `rules-source-operation.ts`) become `Tx` (F3a deferral); type-only. Test annotations stay, as in S1a.
13. **No contract or DTO work in S7a.** `modules/rules` has no class-validator DTO (it is absent from `controller-dto-runtime-metadata.test.ts`): bodies and queries arrive as `unknown` and the service parses them with `packages/shared/src/rules/rules-human-contract.ts`, so no parity test applies and the rules contracts stay in `packages/shared/src/rules` (CR 3.4 lists `rules/`). S1's class-validator field schemas are not adopted: replacing the existing zod rules would change acceptance.
14. **SAD routing.** The determinism checker's `apps/web/src/features/analytics/rule*.ts(x)` globs become `apps/web/src/features/rules/**/*.ts` and `**/*.tsx`, which widens the role to the review screens that render rule conditions and evidence. `lib/api/**` already routes to beneficiary-privacy-guardian (F4b); `*.controller.ts` and `*.service.ts` keep their routes. A dry run of `sad:check` over the whole S7a diff required all five roles.
15. **Tooling pitfalls found in the dry run.** A Bash heredoc in this Git Bash setup dropped one backslash from `\\b` in a script, so every `.tmp/s7a` file is created with the editor's Write tool exactly as printed. Git Bash also rewrites a command argument that starts with `@/` (a `git grep "@/features/rules/"` printed nothing); every pattern below starts with a quote character or another word.
16. **Spec facts corrected by the baseline:** MOD-17's "several controllers per file in four" modules are rules (S7a), activities (S2), participants (S4) and public (S8). The rule board model held one dead private helper (`firstMetric`, no caller), deleted in Task 4. MOD-10 has no rules item left (F4a closed it). `modules/dashboards/dashboards.dto.ts` is a zod parse helper, not a class-validator DTO, but it is one of the seventeen `*.dto.ts` files the S8 plan expects S1 to S7 to reduce to five, so S7b deletes it.
17. **Hand-offs from earlier plans land in S7b, not S7a.** The S1 plan leaves the overview metrics and project map schemas in `monitoring/` and the stored project status union copies (`role-overview.ts`, `rule-contract.ts`, `rule-metrics.ts` twice, `descriptive-analytics.ts`) to S7; the S3 plan leaves the dashboard and SADDD remainder of `metric-contract.ts` and the analytics `use-monitoring-read` import of the indicators workspace to S7; the S6 plan records the module pair `dashboards <-> reports` in `apps/api/src/common/import-boundary.test.ts` for S7 to shrink; F4b leaves `DashboardSeverity` to S7; the S8 plan expects, after S7, five `*.dto.ts` files and two controllers with an inline identity check. All of these are analytics or dashboards code (the rules status unions sit beside them and are switched in one pass with the others), so S7a leaves `packages/shared` untouched, edits analytics files only where Task 5 repoints the rules client specifier (`analytics-dashboard.tsx` and its test), and the S7b outline carries each item. S7a adds no import between api modules, so the S6 pair list is unchanged by it.
18. Cross-plan: S7a depends on S2b and S3b only through the specifier-resolving codemod (ruling in Interfaces); S7b Task 5 moves files that S3 (`contracts/indicators`), S4 (`contracts/beneficiaries`) and S2b (`activityExtensionResponse`) import by relative path, so it repoints those imports; S7b adopts `requestIdentity` in `action-counts`, `analytics`, `dashboards`, `role-overview` and `analytics-insights` controllers, which S8 expects to be the last ones before its two. Cost if wrong: a broken relative import after the `git mv`, or an S8 Task 0 count that differs.
19. Cross-plan (S1b): S7a Task 6 adds `'@/features/rules'` to `experimental.optimizePackageImports` in `apps/web/next.config.ts` (S1b's test requires every indexed feature there) and S7b Task 10 does the same for analytics and dashboard; the workspace is `features/projects/components/project-review-workspace.tsx` importing `../project-rules-panel`; the map fetcher is `projectsClient.getProjectMap`; `projects.utils` and `projects.reads` replace the old names. Cost if wrong: the new indexed-feature test fails, or the routes grow First Load JS as S1b measured (397 kB on /projects).
20. Cross-plan (S2b): the activity fetchers in ruling 18 and the `binding-reads.mjs` expected output are `activitiesClient.getActivities(...)` and `activitiesClient.getActivityContext(...)` (S2b), and the extension move is S2b Task 7, not Task 4. Cost if wrong: `binding-reads.mjs` stops on `fetchers differ`, or the move is looked for in the wrong task.

## Interfaces assumed from earlier slices

- **S1a:** `requestIdentity(request: AuthenticatedRequest): ApplicationIdentity` from `apps/api/src/common/authz/request-identity.ts`, throwing `ForbiddenException('Application profile is required.')` when `request.user` is missing. If it is missing at Task 0, stop: Task 1 builds on it.
- **F4b:** `useAuthorizedRead` from `apps/web/src/hooks/use-authorized-read.ts` (Task 4's test mocks that path); `PathwaysClientError` and `requestFoundationResponse` from `apps/web/src/lib/api/core/request.ts` and `captureRequestOwner` from `apps/web/src/lib/api/core/request-owner.ts`, which `rules-human-client.ts` imports and which move with it untouched; `apps/web/src/lib/api/**/*.ts` routed to beneficiary-privacy-guardian; `lib/format` (no rules file is edited by it here).
- **S1b:** the project review workspace (`ProjectReviewWorkspace`, at `a101ad7c` `features/projects/project-review-workspace.tsx`) at `apps/web/src/features/projects/components/project-review-workspace.tsx`, importing `ProjectRulesPanel` from `../project-rules-panel` and mocking that path in its test; the codemods resolve specifiers by path, so any location works. S1b adds a feature surface rule to `apps/web/src/import-direction.test.ts` (a non-test file outside `features/projects` imports it only through its index); its function names are not fixed by the outline, so Task 6 adds `'rules'` to whatever feature list that rule keeps, and writes the rule given in Task 6 only when Task 0 finds none.
- **S2 and S3b:** whatever client now serves `getProjectIndicators`, `getActivities` and `getActivityContext` (`binding-reads.mjs` copies the fetcher and its import as found).
- **F2 (no slice changes it before S7b):** `alertSeverities` (`['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const`) exported from `@pathways/shared`, declared at `a101ad7c` in `packages/shared/src/monitoring/role-overview.ts`; S7b may move the file, the barrel name stays.
- **S6:** `apps/api/src/common/import-boundary.test.ts` holds the module pair list `['dashboards <-> reports']`; S7a adds no api module import, so the list stays as S6 left it.

## Global Constraints

- Behavior-preserving: no route, status code, response body, permission decision, rendered text or class, read resource key, enabled condition, hook order or SQL statement changes. Only file locations, import specifiers, private identifier names, the escape of rule 7 and the shared rank of rule 8 change.
- Direction (CR 3.1): `app -> features -> components, constants, hooks, lib, providers, types -> @pathways/shared`; `apps/api/src/common/**` never imports `modules/**`; the web, package and api import tests pass at every commit.
- Production api code uses relative imports only; `@app/` is a Vitest alias used by tests.
- Moves and renames are committed separately from logic edits (CR 6). Verbatim moves must make `.tmp/s7a/same-lines.mjs` print `same lines: <n>` with exit 0 before Biome formats them.
- A `vi.mock` path moves with its module in the same commit.
- Kebab-case file names that describe purpose; comments are one sentence, no emojis; docs prose has no em dashes and no `--`.
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. New untracked files need `git add -N` (or `git add`) before `git diff --name-only` lists them; pass `--diff-filter=AMR` so a deleted file is not handed to Biome.
- `pnpm typecheck` rewrites `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` before every commit.
- After removing code, delete any import name left with no use (Biome 1.9 does not flag unused imports); the codemods below prune for you.
- Create every `.tmp/s7a` file with the Write tool, exactly as printed (ruling 15). Patterns passed to commands never start with `@/`.
- `git ls-files` with `':!*.test.ts'` pathspecs returns nothing in this Git for Windows setup; filter with `grep -v` as written. `git grep` pathspecs work.
- One-off scripts live in `.tmp/s7a/` (gitignored) and are never committed; `.tmp/` also holds logs.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work in `C:\PATHWAYS` on branch `refactor/s7a-rules`; no new worktree. All paths are relative to `C:\PATHWAYS`. Do not push.
- Do not touch migrations, `.env` files, review evidence, `apps/api/prisma` or `packages/shared`.

## Review Focus

1. A test mock left on `@/lib/services/rules-human-client`, `./project-rules-panel` or a deleted module silently stops applying and the real client runs. Task 5 counts 9 rules client mocks before, none on the old path and 9 on `@/lib/api/rules` after; `split-declarations.mjs` refuses to run when another file mocks a module it splits; Task 2 moves the recommendations page test mock and the project review workspace mock with their imports, and Task 6 moves both again to `@/features/rules` and greps that no file outside the feature still names `features/rules/components/` in an import or mock.
2. A recommendation saved on another rule must still be offered for reuse when its title and text concatenate to the same string as one on the rule but are different pairs, and must still be hidden when the pair is equal. Task 2 Step 1 pins it before the NUL escape, and the test moves with the component through Task 3.
3. Sorting the alert queue by severity must still put CRITICAL, HIGH, MEDIUM, LOW in that order and anything unknown last. Task 4 Step 1 pins the screen order before the change and Step 2 the rank function, including `''` and `constructor`.
4. A request reaching any rules route without an attached identity must still answer 403 `Application profile is required.` before the service runs, and `GET alerts/escalated` must stay registered before `GET alerts/:id`. Task 1 Step 1 pins all 23 handlers and the route order before the controllers change.
5. A role without `activities.read` must still bind activity conditions through the context read, and a project change must still clear bindings. Task 4 pins the three read keys, scopes, permissions and enabled flags in `rules.reads.test.ts`; the existing `rule-drawer.test.tsx` and `rule-editor.test.tsx` cases run unchanged after every task.

## Out of S7a (recorded for S7b and later sub-projects)

- Analytics and dashboards api, the shared `monitoring` folder, the `descriptive-analytics` split, the `role-overview` split, `dashboards.dto.ts`, their `requestIdentity` and `Tx` adoption, the inline insights scope lookup, the stored project status union copies (including the three in `packages/shared/src/rules`) and the S6 `dashboards <-> reports` pair: S7b part 1, outlined at the end.
- Analytics and dashboards web: `lib/api/analytics` and `lib/api/dashboards`, the 1741-line `analytics-dashboard.tsx`, `role-dashboard.tsx`, feature indexes for `analytics` and `dashboard`, `DashboardSeverity`: S7b part 2, outlined at the end.
- The three rules files above 500 lines (ruling 4): no later rules slice exists; a state-lifting split needs its own Change Record if wanted.

## Risks

- A barrel import can grow a route's client bundle (ruling 3). Task 6 measures four routes against the Task 0 build and stops on growth; the fallback (pages keep component imports, the rule exempts `app/` for `rules`) is the controller's call, because it would differ from S1b.
- S1b's surface rule is only outlined, so its exact shape is unknown. Task 6 Step 1 adapts to it; if S1b wrote no rule, Task 6 adds one that S1b's convention would accept (any non-test file outside the feature, route pages included).
- S8a Task 0 finds S7 by `grep -m1 "Merge refactor/s7"`, which an S7a merge alone satisfies. S8a must not start before S7b merges: its DTO and identity check counts would then fail. Task 7 records this in the activity log for the controller.
- Earlier slices may change lines the codemods read (F4b import lines in `rule-drawer.tsx`, `rule-editor.tsx`, `human-review-action.tsx` and the rules client; S2 or S3b fetchers). Each script resolves by path and declaration name and stops on an unexpected shape (`mocks ...`, `fetchers differ`, `does not declare`), never guessing.

---

### Task 0: Branch setup and baseline

**Files:**
- Create: `docs/superpowers/plans/2026-10-12-modularization-s7-analytics-rules.md` (this plan)
- Modify: `docs/index.md` (section 1.6 plan row)

- [ ] **Step 1: Confirm local dev contains S6 and create the branch**

```bash
cd /c/PATHWAYS
git status --short
git checkout dev
git log --oneline dev | grep -m1 -E "Merge refactor/s6[a-z]?-.* into dev"
test -f apps/api/src/common/authz/request-identity.ts && test -f apps/web/src/hooks/use-authorized-read.ts && test -f apps/web/src/lib/api/core/request.ts && echo "S1 and F4b present"
ls docs/superpowers/plans/
git checkout -b refactor/s7a-rules
pnpm install --frozen-lockfile
mkdir -p .tmp/s7a
```

Expected: clean status, the last S6 merge commit, `S1 and F4b present`, install succeeds. If the merge or either file is missing, stop and report: S7a builds on them. If `ls` lists an earlier modularization plan, that slice's removal step did not run; Step 3 removes it and its `docs/index.md` row too.

- [ ] **Step 2: Record the baseline**

```bash
pnpm --filter @pathways/shared build
pnpm typecheck && pnpm test 2>&1 | grep -E "Tests +[0-9]+"
pnpm sad:test 2>&1 | grep -E "Tests +[0-9]+"
pnpm docs:check 2>&1 | tail -3
git ls-files apps/web/src/features/rules-board | wc -l
git ls-files apps/web/src/features/rules | wc -l
node -e "console.log(require('fs').readFileSync('apps/web/src/features/rules-board/rule-output-fields.tsx','utf8').split(String.fromCharCode(0)).length - 1)"
git grep -n "rules-human-client'" -- apps/web | wc -l
git grep -l "rules-human-client'" -- apps/web | wc -l
git grep -n "vi.mock('@/lib/services/rules-human-client'" -- apps/web | wc -l
grep -c "^@Controller" apps/api/src/modules/rules/rules-human.controller.ts
grep -c "actor(request)" apps/api/src/modules/rules/rules-human.controller.ts
git grep -n "Prisma.TransactionClient" -- apps/api/src/modules/rules | grep -v "\.test\.ts:" | wc -l
git grep -nwE "OwnedDrawer|OwnedRuleEditor|OwnedRuleTest|OwnedAction" -- apps/web/src | wc -l
git grep -n "SEVERITY_RANK" -- apps/web/src | wc -l
git grep -n "^type Choice = { id: string; name: string }" -- apps/web/src/features | wc -l
git grep -nw "firstMetric" -- apps/web/src | wc -l
git grep -n "'rule-binding-" -- apps/web/src | wc -l
git grep -n -A3 "'rule-binding-" -- apps/web/src | grep "(signal) =>"
git grep -n "project-rules-panel" -- apps/web/src
grep -n "indexedFeatures\|index.ts\|surface\|'projects'" apps/web/src/import-direction.test.ts
grep -n "route page\|Route page" docs/cr-pathways-codebase-modularization.md
git checkout -- apps/web/next-env.d.ts
pnpm --filter @pathways/web build > .tmp/s7a/web-build-baseline.log 2>&1; echo "exit $?"
grep -E "Middleware|/alerts|/recommendations/|/projects/\[projectId\]/monitor-evaluate" .tmp/s7a/web-build-baseline.log
git checkout -- apps/web/next-env.d.ts
```

Expected: typecheck clean; write down each package's passing and skipped test counts (`B_config`, `B_shared`, `B_imports`, `B_api`, `B_web`) and the sad count (`B_sad`); write down the docs check failure count; web build exit 0, and write down the `Middleware` size (`M0`) and the First Load JS of `/alerts`, `/alerts/repository`, `/recommendations/[recommendationId]` and `/projects/[projectId]/monitor-evaluate` (`R0`, four numbers). At `a101ad7c` the greps print, in order: `14`, `0`, `2`, `20`, `19`, `9`, `4`, `22`, `7`, `9`, `2`, `2`, `2`, `6`; then six fetcher lines (three per file, the same three in `rule-condition-rows.tsx` and `rule-editor.tsx`; at `a101ad7c` they call `pathwaysClient.getProjectIndicators`, `getActivities` and `getActivityContext`, and S2 or S3b may have changed the client, which is fine as long as both files match); then the four `project-rules-panel` lines (the panel, its test, the project review workspace and its test mock, at whatever path S1b gave them); then the direction test grep, which at `a101ad7c` prints nothing and after S1b prints the lines of its feature surface rule (write down the name of its feature list; Task 6 Step 1 adds `'rules'` to it); then the CR grep, which at `a101ad7c` prints nothing: if it prints a section 9 decision that route pages keep importing component files, Task 6 follows it (ruling 3). Any other difference: stop and report, because the counts below were taken at `a101ad7c`.

- [ ] **Step 3: Add the plan and commit**

The controller has saved this plan as `docs/superpowers/plans/2026-10-12-modularization-s7-analytics-rules.md`.

In `docs/index.md` section 1.6, add as the last row of the table (and delete any earlier modularization plan row found in Step 1, with `git rm` of that plan):

```markdown
| [S7 analytics, dashboards and rules plan](superpowers/plans/2026-10-12-modularization-s7-analytics-rules.md) | 2026-10-12-modularization-s7-analytics-rules.md | 2026-10-12 | S7 of the codebase modularization: S7a features/rules, lib/api/rules, rule-binding reads and one rules controller per file; S7b outline | In progress |
```

```bash
git add docs/superpowers/plans/2026-10-12-modularization-s7-analytics-rules.md docs/index.md
pnpm docs:check 2>&1 | tail -3
git commit -m "docs: add the S7 analytics, dashboards and rules plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Step 2 baseline.

---

### Task 1: One controller per file in the api rules module

**Files:**
- Test: `apps/api/src/modules/rules/rules.routes.test.ts`
- Modify: `apps/api/src/modules/rules/rules-human.controller.ts`, `apps/api/src/modules/rules/rules-source-operations.controller.ts` (commit 1)
- Modify: `apps/api/src/modules/rules/rules-human.service.ts`, `apps/api/src/modules/rules/rules-source-operation.ts` (commit 1, `Tx`)
- Create: `apps/api/src/modules/rules/rules.controller.ts`, `alerts.controller.ts`, `recommendations.controller.ts`, `notifications.controller.ts` (commit 2)
- Delete: `apps/api/src/modules/rules/rules-human.controller.ts` (commit 2)
- Modify: `apps/api/src/modules/rules/rules-human.module.ts`, `apps/api/src/modules/rules/rules-human-escalated.test.ts` (commit 2)

**Interfaces:**
- Consumes: `requestIdentity` from `../../common/authz/request-identity` (S1a); `type Tx` from `../../common/prisma/transaction` (F3a).
- Produces (definitions unchanged): `RulesController` from `./rules.controller`, `AlertsController` from `./alerts.controller`, `RecommendationsController` from `./recommendations.controller`, `NotificationsController` from `./notifications.controller`.

- [ ] **Step 1: Write the route characterization test**

Create `apps/api/src/modules/rules/rules.routes.test.ts`:

```ts
import 'reflect-metadata'

import { PERMISSION_KEY } from '@app/common/decorators/permission.decorator'
import { RequestMethod } from '@nestjs/common'
import { HEADERS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { describe, expect, it } from 'vitest'
import { RulesHumanModule } from './rules-human.module'
import { RulesSourceOperationsModule } from './rules-source-operations.module'

type Handler = (request: object) => unknown
type ControllerClass = { new (service: unknown): Record<string, Handler>; prototype: object }

const controllers = (): ControllerClass[] => [
  ...Reflect.getMetadata('controllers', RulesHumanModule),
  ...Reflect.getMetadata('controllers', RulesSourceOperationsModule),
]
const handlers = (controller: ControllerClass) =>
  Object.getOwnPropertyNames(controller.prototype).filter((name) => name !== 'constructor')

// One line per route in registration order: method, full path, permission and Cache-Control header.
function routeTable(): string[] {
  return controllers().flatMap((controller) => {
    const base = Reflect.getMetadata(PATH_METADATA, controller)
    return handlers(controller).map((name) => {
      const handler = (controller.prototype as Record<string, Handler>)[name]
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler)]
      const route = Reflect.getMetadata(PATH_METADATA, handler)
      const headers: Array<{ name: string; value: string }> =
        Reflect.getMetadata(HEADERS_METADATA, handler) ?? []
      const cache = headers.find((header) => header.name === 'Cache-Control')?.value
      const path = route === '/' ? `/${base}` : `/${base}/${route}`
      return `${method} ${path} ${Reflect.getMetadata(PERMISSION_KEY, handler)} ${cache}`
    })
  })
}

describe('rules routes', () => {
  it('registers every route with its permission and no-store header in a stable order', () => {
    expect(routeTable()).toEqual([
      'GET /rules rules.read private, no-store',
      'POST /rules rules.create private, no-store',
      'POST /rules/dry-run rules.read private, no-store',
      'GET /rules/:id rules.read private, no-store',
      'POST /rules/:id/drafts rules.update private, no-store',
      'POST /rules/:id/activate rules.activate private, no-store',
      'POST /rules/:id/archive rules.update private, no-store',
      'GET /alerts alerts.read private, no-store',
      'GET /alerts/escalated alerts.read private, no-store',
      'GET /alerts/:id alerts.read private, no-store',
      'GET /alerts/:id/history alerts.read private, no-store',
      'POST /alerts/:id/review alerts.review private, no-store',
      'POST /alerts/:id/disposition alerts.outcome.record private, no-store',
      'POST /alerts/:id/outcome-preview alerts.outcome.record private, no-store',
      'POST /alerts/:id/outcomes alerts.outcome.record private, no-store',
      'GET /recommendations recommendations.read private, no-store',
      'GET /recommendations/:id recommendations.read private, no-store',
      'POST /recommendations/:id/review recommendations.review private, no-store',
      'POST /recommendations/:id/outcome-preview recommendations.outcome.record private, no-store',
      'POST /recommendations/:id/outcomes recommendations.outcome.record private, no-store',
      'GET /notifications alerts.read private, no-store',
      'POST /notifications/:id/read alerts.read private, no-store',
      'POST /projects/:projectId/source-operations/abandon undefined private, no-store',
    ])
  })

  it('answers 403 on every route when no application identity is attached', () => {
    const service = new Proxy({}, { get: () => () => 'service reached' })
    const calls = controllers().flatMap((controller) => {
      const instance = new controller(service)
      return handlers(controller).map((name) => () => instance[name]({ headers: {} }))
    })
    expect(calls).toHaveLength(23)
    for (const call of calls) expect(call).toThrow('Application profile is required.')
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/rules/rules.routes.test.ts`
Expected: PASS, 2 tests. This is a characterization test: it must pass before and after every change below. The source operations route has no `@RequirePermission` today (it is authorized in the service); the `undefined` pins that, not a new decision.

- [ ] **Step 2: Adopt requestIdentity and Tx**

`apps/api/src/modules/rules/rules-human.controller.ts`:
- Delete these four lines:

```ts
function actor(request: AuthenticatedRequest) {
  if (!request.user) throw new ForbiddenException('Application profile is required.')
  return request.user
}
```

- Replace every `actor(request)` with `requestIdentity(request)` (22).
- Delete the line `  ForbiddenException,` from the `@nestjs/common` import.
- Add `import { requestIdentity } from '../../common/authz/request-identity'` directly below the `application-identity` import.

`apps/api/src/modules/rules/rules-source-operations.controller.ts`:
- Replace the two lines `    if (!request.user) throw new ForbiddenException('Application profile is required.')` and `    return this.service.abandon(request.user, projectId, value)` with `    return this.service.abandon(requestIdentity(request), projectId, value)`.
- Delete `  ForbiddenException,` from the `@nestjs/common` import; add `import { requestIdentity } from '../../common/authz/request-identity'` below the `application-identity` import.

```bash
R=apps/api/src/modules/rules
sed -i -e "s#^import type { Prisma } from '@prisma/client'\$#import type { Tx } from '../../common/prisma/transaction'#" -e 's/\bPrisma\.TransactionClient\b/Tx/g' $R/rules-source-operation.ts
sed -i -e 's/\bPrisma\.TransactionClient\b/Tx/g' -e "s#^import { withAuthorizedOperation } from '../../common/authz/authorized-operation'\$#&\nimport type { Tx } from '../../common/prisma/transaction'#" $R/rules-human.service.ts
git grep -n "Prisma.TransactionClient\|ForbiddenException\|actor(" -- $R | grep -v "\.test\.ts:"
grep -c "requestIdentity(request)" $R/rules-human.controller.ts $R/rules-source-operations.controller.ts
```

Expected: the first grep prints only the seven `ForbiddenException` lines of `rules-human.service.ts`, `rules-machine-boundary.ts` and `rules-source-operation.ts` (their own errors, untouched), no `Prisma.TransactionClient` and no `actor(`; the counts are `22` and `1`. `rules-human.service.ts` keeps `import { Prisma } from '@prisma/client'` because it builds `Prisma.sql`.

- [ ] **Step 3: Run the tests and commit**

```bash
pnpm exec biome check --write apps/api/src/modules/rules
pnpm --filter @pathways/api exec vitest run src/modules/rules src/common
pnpm typecheck && pnpm lint
git checkout -- apps/web/next-env.d.ts
git add apps/api/src/modules/rules
git commit -m "refactor(api): use requestIdentity and Tx in the rules module

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass, including both route tests.

- [ ] **Step 4: Create the split script and its plan**

Create `.tmp/s7a/split-module.mjs`:

```js
// Splits a module's top-level declarations, verbatim and in order, into new files by declared name; decorators travel with their class.
import { readFileSync, writeFileSync } from 'node:fs'

const [source, planFile] = process.argv.slice(2)
const plan = JSON.parse(readFileSync(planFile, 'utf8'))
const lines = readFileSync(source, 'utf8').split('\n')
const declaration = /^(?:export\s+)?(?:async\s+)?(?:const|let|function|class|type|interface)\s+([A-Za-z0-9_$]+)/
const starts = /^(?:\/\/|\/\*\*|@|export\s|const\s|let\s|function\s|async\s|class\s|type\s|interface\s)/
const leading = /^(?:\/\/|\/\*\*| \*|@)/

// Skip the import block: everything before the first top-level declaration, comment or decorator.
let index = lines.findIndex((line) => starts.test(line))
const chunks = []
let pending = []
for (; index < lines.length; index++) {
  const line = lines[index]
  const name = declaration.exec(line)?.[1]
  if (name) {
    chunks.push({ name, lines: [...pending, line] })
    pending = []
  } else if (line === '' || leading.test(line)) pending.push(line)
  else {
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
  const body = chunks.filter((chunk) => owner.get(chunk.name) === file).flatMap((chunk) => chunk.lines)
  while (body[0] === '') body.shift()
  writeFileSync(file, `${header.join('\n')}\n\n${body.join('\n').replace(/\n*$/, '\n')}`)
  console.log(`${file}: ${body.length} lines`)
}
```

Create `.tmp/s7a/same-lines.mjs`:

```js
// Fails unless the listed files hold the same declaration lines as at HEAD, ignoring imports, order, blanks and export keywords.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const renames = args.filter((arg) => arg.includes('=')).map((arg) => arg.split('='))
const files = args.filter((arg) => !arg.includes('='))
const start = /^(?:\/\/|\/\*\*|@|export\s|const\s|let\s|function\s|async\s|class\s|type\s|interface\s)/

// Declaration lines after the import block, with renames applied and export keywords dropped.
const body = (text) => {
  const lines = text.split('\n')
  const first = lines.findIndex((line) => start.test(line))
  return (first < 0 ? [] : lines.slice(first))
    .filter((line) => line.trim() !== '')
    .map((line) => renames.reduce((out, [from, to]) => out.replace(new RegExp(`\\b${from}\\b`, 'g'), to), line))
    .map((line) => line.replace(/^export /, ''))
}
const head = (file) => {
  try {
    return execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return ''
  }
}
const count = (lines) => lines.reduce((map, line) => map.set(line, (map.get(line) ?? 0) + 1), new Map())
const before = count(files.flatMap((file) => body(head(file))))
const after = count(files.flatMap((file) => (existsSync(file) ? body(readFileSync(file, 'utf8')) : [])))
const problems = []
for (const [line, n] of before)
  if ((after.get(line) ?? 0) !== n) problems.push(`before ${n}x, after ${after.get(line) ?? 0}x: ${line}`)
for (const [line, n] of after) if (!before.has(line)) problems.push(`after only ${n}x: ${line}`)
console.log(problems.length ? problems.join('\n') : `same lines: ${[...before.values()].reduce((a, b) => a + b, 0)}`)
process.exitCode = problems.length ? 1 : 0
```

Create `.tmp/s7a/controller-split.json`:

```json
{
  "apps/api/src/modules/rules/rules.controller.ts": {
    "header": [
      "import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req } from '@nestjs/common'",
      "import type { AuthenticatedRequest } from '../../common/authz/application-identity'",
      "import { requestIdentity } from '../../common/authz/request-identity'",
      "import { RequirePermission } from '../../common/decorators/permission.decorator'",
      "import { RulesHumanService } from './rules-human.service'"
    ],
    "names": ["RulesController"]
  },
  "apps/api/src/modules/rules/alerts.controller.ts": {
    "header": [
      "import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req } from '@nestjs/common'",
      "import type { AuthenticatedRequest } from '../../common/authz/application-identity'",
      "import { requestIdentity } from '../../common/authz/request-identity'",
      "import { RequirePermission } from '../../common/decorators/permission.decorator'",
      "import { RulesHumanService } from './rules-human.service'"
    ],
    "names": ["AlertsController"]
  },
  "apps/api/src/modules/rules/recommendations.controller.ts": {
    "header": [
      "import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req } from '@nestjs/common'",
      "import type { AuthenticatedRequest } from '../../common/authz/application-identity'",
      "import { requestIdentity } from '../../common/authz/request-identity'",
      "import { RequirePermission } from '../../common/decorators/permission.decorator'",
      "import { RulesHumanService } from './rules-human.service'"
    ],
    "names": ["RecommendationsController"]
  },
  "apps/api/src/modules/rules/notifications.controller.ts": {
    "header": [
      "import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req } from '@nestjs/common'",
      "import type { AuthenticatedRequest } from '../../common/authz/application-identity'",
      "import { requestIdentity } from '../../common/authz/request-identity'",
      "import { RequirePermission } from '../../common/decorators/permission.decorator'",
      "import { RulesHumanService } from './rules-human.service'"
    ],
    "names": ["NotificationsController"]
  }
}
```

Every controller uses all nine Nest decorators and helpers in the header (each has a `GET` with `@Query`, a `GET`/`POST` with `@Param`, and a `POST` with `@Body`), so no header names an unused import.

- [ ] **Step 5: Split, check and delete the old file**

```bash
R=apps/api/src/modules/rules
node .tmp/s7a/split-module.mjs $R/rules-human.controller.ts .tmp/s7a/controller-split.json
git rm -q $R/rules-human.controller.ts
node .tmp/s7a/same-lines.mjs $R/rules-human.controller.ts $R/rules.controller.ts $R/alerts.controller.ts $R/recommendations.controller.ts $R/notifications.controller.ts
```

Expected: `rules.controller.ts: 46 lines`, `alerts.controller.ts: 57 lines`, `recommendations.controller.ts: 34 lines`, `notifications.controller.ts: 16 lines`, then `same lines: 153` with exit 0. Any other output from `same-lines.mjs`: stop, the split is not verbatim.

In `apps/api/src/modules/rules/rules-human.module.ts` replace

```ts
import {
  AlertsController,
  NotificationsController,
  RecommendationsController,
  RulesController,
} from './rules-human.controller'
```

with

```ts
import { AlertsController } from './alerts.controller'
import { NotificationsController } from './notifications.controller'
import { RecommendationsController } from './recommendations.controller'
import { RulesController } from './rules.controller'
```

and keep the `controllers` array order (`RulesController`, `AlertsController`, `RecommendationsController`, `NotificationsController`), which is the registration order the route test pins.

```bash
sed -i "s#from './rules-human.controller'#from './alerts.controller'#" apps/api/src/modules/rules/rules-human-escalated.test.ts
git grep -n "rules-human.controller" -- apps
```

Expected: the grep prints nothing.

- [ ] **Step 6: Run the tests and commit**

```bash
git add -A apps/api/src/modules/rules
pnpm exec biome check --write apps/api/src/modules/rules
pnpm --filter @pathways/api exec vitest run src/modules/rules src/common src/app-module-wiring.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api/src/modules/rules
git status --short apps/api/src/modules/rules
git commit -m "refactor(api): one controller per file in the rules module

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass; api = `B_api + 2`. If `src/app-module-wiring.test.ts` is not at that path, run `git ls-files apps/api/src | grep wiring` and pass the listed file.

---

### Task 2: Escape the NUL separator and move the rules files into features/rules

**Files:**
- Test: `apps/web/src/features/rules-board/recommendation-fields.test.tsx` (commit 1, moved in commit 2)
- Modify: `apps/web/src/features/rules-board/rule-output-fields.tsx` (commit 1)
- Move (30 files, commit 2): as listed in `.tmp/s7a/rules-move.json` below
- Modify (specifiers only, commit 2): the 3 route pages, `recommendations/[recommendationId]/page.test.tsx`, the project review workspace and its test, the moved files that import each other
- Modify: `apps/web/src/features/ui-copy-cleanup.contract.test.ts` (one path string)

**Interfaces:**
- Produces: the files of the move map at their new paths, with unchanged exports.

- [ ] **Step 1: Write the reuse characterization test**

Create `apps/web/src/features/rules-board/recommendation-fields.test.tsx`:

```tsx
/* @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RecommendationFields } from './rule-output-fields'

afterEach(cleanup)

describe('RecommendationFields reuse list', () => {
  it('offers a saved recommendation once, unless the rule already has the same title and text', () => {
    render(
      <RecommendationFields
        hasRule
        recs={[{ id: 'r1', title: 'ab', text: 'c' }]}
        onRecs={vi.fn()}
        library={[
          { id: 'l1', title: 'ab', text: 'c' },
          { id: 'l2', title: 'a', text: 'bc' },
          { id: 'l3', title: 'a', text: 'bc' },
        ]}
      />,
    )
    expect(screen.getAllByRole('button', { name: 'Reuse' })).toHaveLength(1)
    expect(screen.getByRole('listitem').textContent).toBe('aReuse')
  })
})
```

Run: `pnpm --filter @pathways/web exec vitest run src/features/rules-board/recommendation-fields.test.tsx`
Expected: PASS, 1 test, against the file with literal NUL characters. In the dry run the same test FAILED when the separator was removed, so it pins the separator (Review Focus 2).

- [ ] **Step 2: Replace the NUL characters and commit**

Create `.tmp/s7a/escape-nul.mjs`:

```js
// Replaces every literal NUL character in one source file with the six-character escape \u0000.
import { readFileSync, writeFileSync } from 'node:fs'

const [file] = process.argv.slice(2)
const text = readFileSync(file, 'utf8')
const nul = String.fromCharCode(0)
const count = text.split(nul).length - 1
writeFileSync(file, text.split(nul).join(`\\u${'0'.repeat(4)}`))
console.log(`${file}: ${count} replaced`)
```

```bash
F=apps/web/src/features/rules-board/rule-output-fields.tsx
node .tmp/s7a/escape-nul.mjs $F
grep -c 'u0000' $F
pnpm exec biome check --write $F apps/web/src/features/rules-board/recommendation-fields.test.tsx
pnpm --filter @pathways/web exec vitest run src/features/rules-board
pnpm lint
git add $F apps/web/src/features/rules-board/recommendation-fields.test.tsx
git commit -m "refactor(web): write the rule recommendation key separator as an escape

The two literal NUL characters become the same string written as an escape, so git stops treating the file as binary.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git grep -I -l "" -- $F
```

Expected: `2 replaced`, `2`, the rules-board tests pass, and the last grep prints the file path (git now reads it as text; before this commit it printed nothing).

- [ ] **Step 3: Create the move script and map**

Create `.tmp/s7a/move-modules.mjs`:

```js
// Moves web files with git mv and rewrites every import, re-export, dynamic import and vi.mock specifier that the moves change.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [mapFile, ...roots] = process.argv.slice(2)
const web = path.resolve('apps/web/src')
const files = JSON.parse(readFileSync(mapFile, 'utf8'))
const strip = (file) => file.replace(/\.tsx?$/, '')
const moves = new Map(Object.entries(files).map(([from, to]) => [strip(from), strip(to)]))
const pattern =
  /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|vi\.(?:mock|doMock|importActual)(?:<[^>]*>)?\(\s*)(['"])([^'"]+)\2/g

// TypeScript files under a folder.
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })

const rel = (file) => path.relative(web, file).split(path.sep).join('/')
const inWeb = (file) => !path.relative(web, file).startsWith('..')
// The feature folder of a web-relative path (features/<name>), or its top folder elsewhere.
const area = (relative) => relative.split('/').slice(0, relative.startsWith('features/') ? 2 : 1).join('/')

// The web-relative module a specifier names, or null when it points outside apps/web/src.
const target = (file, spec) => {
  if (spec.startsWith('@/')) return spec.slice(2)
  if (!spec.startsWith('.')) return null
  const resolved = path.resolve(path.dirname(file), spec)
  return inWeb(resolved) ? rel(resolved) : null
}

// A sibling is ./name, a module in the importer's feature or top folder is relative, anything else is an alias.
const specifier = (importer, module) => {
  const absolute = path.join(web, module)
  if (path.dirname(absolute) === path.dirname(importer)) return `./${path.basename(absolute)}`
  if (!inWeb(importer) || area(rel(importer)) !== area(module)) return `@/${module}`
  const relative = path.relative(path.dirname(importer), absolute).split(path.sep).join('/')
  return relative.startsWith('.') ? relative : `./${relative}`
}

let total = 0
for (const file of roots.flatMap((root) => walk(path.resolve(root)))) {
  const old = rel(file)
  const moved = moves.get(strip(old))
  const importer = moved ? path.join(web, `${moved}${path.extname(file)}`) : file
  let count = 0
  const text = readFileSync(file, 'utf8').replace(pattern, (whole, lead, quote, spec) => {
    const module = target(file, spec)
    if (module === null) return whole
    const next = moves.get(module) ?? module
    if (next === module && !moved) return whole
    if (next === module && spec.startsWith('@/')) return whole
    const replacement = specifier(importer, next)
    if (replacement === spec) return whole
    count++
    return `${lead}${quote}${replacement}${quote}`
  })
  if (!count) continue
  writeFileSync(file, text)
  total += count
  console.log(`${old}: ${count}`)
}
for (const [from, to] of Object.entries(files)) {
  const destination = path.join(web, to)
  if (existsSync(destination)) throw new Error(`${to} already exists`)
  mkdirSync(path.dirname(destination), { recursive: true })
  execFileSync('git', ['mv', path.join(web, from), destination])
}
console.log(`total: ${total}; moved: ${Object.keys(files).length}`)
```

Create `.tmp/s7a/rules-move.json`:

```json
{
  "features/rules-board/rule-board-model.ts": "features/rules/rules.utils.ts",
  "features/rules-board/rule-board-model.test.ts": "features/rules/rules.utils.test.ts",
  "features/rules-board/rule-drawer-shared.ts": "features/rules/rule-drawer-shared.ts",
  "features/rules-board/review-card-list.tsx": "features/rules/components/review-card-list.tsx",
  "features/rules-board/review-card-list.test.tsx": "features/rules/components/review-card-list.test.tsx",
  "features/rules-board/rule-condition-rows.tsx": "features/rules/components/condition-builder.tsx",
  "features/rules-board/rule-drawer-footer.tsx": "features/rules/components/rule-drawer-footer.tsx",
  "features/rules-board/rule-drawer.tsx": "features/rules/components/rule-drawer.tsx",
  "features/rules-board/rule-drawer.test.tsx": "features/rules/components/rule-drawer.test.tsx",
  "features/rules-board/rule-lifecycle-prompt.tsx": "features/rules/components/rule-lifecycle-prompt.tsx",
  "features/rules-board/rule-output-fields.tsx": "features/rules/components/rule-output-fields.tsx",
  "features/rules-board/recommendation-fields.test.tsx": "features/rules/components/recommendation-fields.test.tsx",
  "features/rules-board/rule-step-card.tsx": "features/rules/components/rule-step-card.tsx",
  "features/rules-board/rules-board.tsx": "features/rules/components/rules-board.tsx",
  "features/rules-board/rules-board.test.tsx": "features/rules/components/rules-board.test.tsx",
  "features/analytics/alerts-workspace.tsx": "features/rules/components/alerts-workspace.tsx",
  "features/analytics/human-review-action.tsx": "features/rules/components/human-review-action.tsx",
  "features/analytics/human-review-action.test.tsx": "features/rules/components/human-review-action.test.tsx",
  "features/analytics/human-review-workspace.tsx": "features/rules/components/human-review-workspace.tsx",
  "features/analytics/human-review-workspace.test.tsx": "features/rules/components/human-review-workspace.test.tsx",
  "features/analytics/recommendation-detail-workspace.test.tsx": "features/rules/components/human-review-workspace.recommendations.test.tsx",
  "features/analytics/linked-alert-summary.tsx": "features/rules/components/linked-alert-summary.tsx",
  "features/analytics/recommendations-workspace.tsx": "features/rules/components/recommendations-workspace.tsx",
  "features/analytics/rule-condition-editor.tsx": "features/rules/components/rule-condition-editor.tsx",
  "features/analytics/rule-editor.tsx": "features/rules/components/rule-editor.tsx",
  "features/analytics/rule-editor.test.tsx": "features/rules/components/rule-editor.test.tsx",
  "features/analytics/rule-test-workspace.tsx": "features/rules/components/rule-test-workspace.tsx",
  "features/analytics/rule-test-workspace.test.tsx": "features/rules/components/rule-test-workspace.test.tsx",
  "features/projects/project-rules-panel.tsx": "features/rules/components/project-rules-panel.tsx",
  "features/projects/project-rules-panel.test.tsx": "features/rules/components/project-rules-panel.test.tsx"
}
```

- [ ] **Step 4: Move the files and repoint every specifier**

```bash
node .tmp/s7a/move-modules.mjs .tmp/s7a/rules-move.json apps/web/src apps/web/e2e
sed -i "s#'features/projects/project-rules-panel.tsx'#'features/rules/components/project-rules-panel.tsx'#" apps/web/src/features/ui-copy-cleanup.contract.test.ts
git ls-files apps/web/src/features/rules-board | wc -l
git grep -nE "features/rules-board|features/analytics/(alerts-workspace|human-review|linked-alert|recommendation|rule-)|projects/project-rules-panel" -- apps
```

Expected output of the script (dry run at `a101ad7c`):

```text
app/(dashboard)/alerts/page.tsx: 1
app/(dashboard)/alerts/repository/page.tsx: 1
app/(dashboard)/recommendations/[recommendationId]/page.test.tsx: 1
app/(dashboard)/recommendations/[recommendationId]/page.tsx: 1
features/analytics/human-review-workspace.tsx: 2
features/analytics/linked-alert-summary.tsx: 2
features/analytics/rule-condition-editor.tsx: 1
features/analytics/rule-test-workspace.tsx: 2
features/projects/project-review-workspace.test.tsx: 1
features/projects/project-review-workspace.tsx: 1
features/rules-board/review-card-list.tsx: 1
features/rules-board/rule-board-model.test.ts: 1
features/rules-board/rule-condition-rows.tsx: 3
features/rules-board/rule-drawer.tsx: 6
features/rules-board/rule-output-fields.tsx: 1
features/rules-board/rules-board.tsx: 1
total: 26; moved: 30
```

The two `project-review-workspace` lines carry whatever path S1b gave that file. Then `0` (the folder is gone) and an empty grep. The importers outside the feature now read `@/features/rules/components/<file>`; files inside it import each other relatively (`./rule-editor`, `../rules.utils`).

- [ ] **Step 5: Run the tests and commit**

```bash
git add -A apps/web
pnpm exec biome check --write $(git diff --cached --name-only --diff-filter=AMR -- '*.ts' '*.tsx')
pnpm --filter @pathways/web exec vitest run src/features/rules src/features/projects src/features/analytics "src/app/(dashboard)/recommendations" src/features/ui-copy-cleanup.contract.test.ts src/import-direction.test.ts
pnpm typecheck && pnpm lint
git checkout -- apps/web/next-env.d.ts
git add -A apps/web
git status --short apps/web | grep -c "^R"
git commit -m "refactor(web): move the rules board, rule and review screens into features/rules

Thirty files move unchanged; 26 specifiers follow, including one route page test mock and the project review workspace mock.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass (Biome reorders the rewritten import lines in about seven files); `30` renames.

---

### Task 3: Split the rules files by purpose

**Files:**
- Modify (renames, commit 1): `apps/web/src/features/rules/components/rule-condition-editor.tsx`, `human-review-workspace.tsx`, `rule-drawer.tsx`, `rule-editor.tsx`, `rule-test-workspace.tsx`, `human-review-action.tsx`
- Create (commit 2): `apps/web/src/features/rules/rules.copy.ts`, `rule-templates.ts`, `hooks/use-binding-choices.ts`, `components/rule-tree-view.tsx`, `components/apply-to-fields.tsx`, `components/severity-field.tsx`, `components/recommendation-fields.tsx`, `components/rule-preview.tsx`, `components/alert-evidence.tsx`, `components/evidence-table.tsx`, `components/notification-row.tsx`
- Delete (commit 2): `apps/web/src/features/rules/rule-drawer-shared.ts`, `apps/web/src/features/rules/components/rule-output-fields.tsx`
- Modify (commit 2): `rules.utils.ts`, `components/rule-condition-editor.tsx`, `components/condition-builder.tsx`, `components/review-card-list.tsx`, `components/human-review-workspace.tsx`, `components/rule-editor.tsx`; importers `components/linked-alert-summary.tsx`, `components/review-card-list.test.tsx`, `components/rule-drawer.tsx`, `components/rule-test-workspace.tsx`, `components/recommendation-fields.test.tsx`

**Interfaces:**
- Produces, inside `features/rules` (definitions unchanged unless noted): `rules.utils.ts` adds `selectClass`, `type Rec`, `type Mode`, `severities`, `recordBound`, `newRow`, `newRec`, `nodeKey`, `newCondition`, `leafCount`, `clearRecordBindings`, `type Choice`, `basisLine`, `codeLabel(value: string): string`, `manilaTime(value: string): string`; `rules.copy.ts` holds `DEFAULT_REC`, `comparisonCopy`, `severityCopy`, `STATUS_LABELS`, `statusLabel(status: string): string`, `BASIS_LABELS`, `basisLabel(basis: string): string`; `rule-templates.ts` holds `type RuleTemplateSpec`, `ruleTemplates`; `hooks/use-binding-choices.ts` holds `useBindingChoices(scopeProjectId: string | null, rows: RuleCondition[])`; one component per file under `components/`: `RuleTreeView`, `ApplyToFields`, `ConditionBuilder`, `SeverityField`, `RecommendationFields`, `RulePreview`, `AlertEvidence`, `EvidenceTable`, `NotificationRow`. Private screens renamed: `RuleDrawerForm`, `RuleEditorForm`, `RuleTestForm`, `HumanReviewActionForm`.

- [ ] **Step 1: Rename the private helpers and screens**

```bash
C=apps/web/src/features/rules/components
sed -i -e '/^const label = (value: string) => metricLabel(value)$/d' -e 's/{label(/{metricLabel(/g' $C/rule-condition-editor.tsx
sed -i -e 's/\bcopy(/codeLabel(/g' -e 's/^const copy = /const codeLabel = /' -e 's/\binstant(/manilaTime(/g' -e 's/^const instant = /const manilaTime = /' $C/human-review-workspace.tsx
sed -i 's/\bOwnedDrawer\b/RuleDrawerForm/g' $C/rule-drawer.tsx
sed -i 's/\bOwnedRuleEditor\b/RuleEditorForm/g' $C/rule-editor.tsx
sed -i 's/\bOwnedRuleTest\b/RuleTestForm/g' $C/rule-test-workspace.tsx
sed -i 's/\bOwnedAction\b/HumanReviewActionForm/g' $C/human-review-action.tsx
grep -c "codeLabel(\|manilaTime(" $C/human-review-workspace.tsx
git grep -nwE "Owned[A-Za-z]+|label|instant" -- $C/rule-condition-editor.tsx $C/human-review-workspace.tsx $C/rule-drawer.tsx $C/rule-editor.tsx $C/rule-test-workspace.tsx $C/human-review-action.tsx | grep -v "aria-label\|label:\|\.label\|ui/label"
node .tmp/s7a/same-lines.mjs $C/rule-condition-editor.tsx $C/human-review-workspace.tsx $C/rule-drawer.tsx $C/rule-editor.tsx $C/rule-test-workspace.tsx $C/human-review-action.tsx label=metricLabel copy=codeLabel instant=manilaTime OwnedDrawer=RuleDrawerForm OwnedRuleEditor=RuleEditorForm OwnedRuleTest=RuleTestForm OwnedAction=HumanReviewActionForm
```

Expected: `12`; the grep prints nothing; `same-lines.mjs` prints exactly one line, `before 1x, after 0x: const metricLabel = (value: string) => metricLabel(value)` (the deleted wrapper, renamed by the check itself), and exits 1. Any other line: stop.

```bash
pnpm exec biome check --write $C
pnpm --filter @pathways/web exec vitest run src/features/rules
pnpm typecheck && pnpm lint
git checkout -- apps/web/next-env.d.ts
git add $C
git commit -m "refactor(web): name the rules screens and helpers for their purpose

Owned* screens become *Form, copy and instant become codeLabel and manilaTime, and the label wrapper gives way to metricLabel.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass.

- [ ] **Step 2: Create the declaration split script and its plan**

Create `.tmp/s7a/split-declarations.mjs`:

```js
// Moves named top-level declarations verbatim between web modules and rewrites every import the moves affect.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [planFile] = process.argv.slice(2)
const web = path.resolve('apps/web/src')
const moves = JSON.parse(readFileSync(planFile, 'utf8'))
const declaration =
  /^(?:export\s+)?(?:async\s+)?(?:const|let|function|class|type|interface)\s+([A-Za-z0-9_$]+)/
const starts = /^(?:\/\/|\/\*\*|export\s|const\s|let\s|function\s|async\s|class\s|type\s|interface\s)/
const importPattern = /^import\s+(type\s+)?([^'";]*?)\s*from\s*'([^']+)'\n?/gm
const mockPattern = /vi\.(?:mock|doMock)\(\s*'([^']+)'/g

const strip = (file) => file.replace(/\.tsx?$/, '')
const rel = (file) => path.relative(web, file).split(path.sep).join('/')
const area = (module) => module.split('/').slice(0, module.startsWith('features/') ? 2 : 1).join('/')
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })

// The web-relative module a specifier names, or the specifier itself for a package.
const resolve = (file, spec) =>
  spec.startsWith('@/')
    ? spec.slice(2)
    : spec.startsWith('.')
      ? rel(path.resolve(path.dirname(path.join(web, file)), spec))
      : spec
const isWebModule = (module) => module.includes('/') && !module.startsWith('@') && !module.startsWith('next/')
// A sibling is ./name, a module in the same feature or top folder is relative, anything else is an alias.
const specifier = (file, module) => {
  if (!isWebModule(module)) return module
  if (area(file) !== area(module)) return `@/${module}`
  const relative = path.posix.relative(path.posix.dirname(file), module)
  return relative.startsWith('.') ? relative : `./${relative}`
}
const items = (typeOnly, list) =>
  list
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (typeOnly && !item.startsWith('type ') ? `type ${item}` : item))
const local = (item) => item.replace(/^type\s+/, '').split(/\s+as\s+/).at(-1)
const imported = (item) => item.replace(/^type\s+/, '').split(/\s+as\s+/)[0]

// Splits a file into its directive, import statements and top-level declaration chunks.
function parse(file) {
  const full = path.join(web, file)
  const lines = existsSync(full) ? readFileSync(full, 'utf8').split('\n') : []
  let index = lines.findIndex((line) => starts.test(line))
  if (index < 0) index = lines.length
  const head = `${lines.slice(0, index).join('\n')}\n`
  const imports = [...head.matchAll(importPattern)].map(([, typeOnly, clause, spec]) => ({
    module: resolve(file, spec),
    fallback: clause.replace(/\{[^}]*\}/, '').replace(/,\s*$/, '').trim() || null,
    items: items(typeOnly, /\{([^}]*)\}/.exec(clause)?.[1] ?? ''),
  }))
  const rest = head.replace(importPattern, '').replace(/^'use client'\n?/, '').trim()
  if (rest) throw new Error(`${file}: unexpected header text ${rest.slice(0, 60)}`)
  const chunks = []
  let pending = []
  for (; index < lines.length; index++) {
    const line = lines[index]
    const name = declaration.exec(line)?.[1]
    if (name) {
      chunks.push({ name, origin: file, lines: [...pending, line] })
      pending = []
    } else if (line === '' || /^(?:\/\/|\/\*\*| \*)/.test(line)) pending.push(line)
    else {
      chunks.at(-1).lines.push(...pending, line)
      pending = []
    }
  }
  return { directive: /^'use client'/.test(head), imports, chunks, created: !existsSync(full) }
}

// Code of a chunk with comments dropped and quoted strings blanked, so names inside them do not count.
const code = (chunk) =>
  chunk.lines
    .filter((line) => !/^\s*(?:\/\/|\/\*\*|\*)/.test(line))
    .join('\n')
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''")
const uses = (text, name) => new RegExp(`(?<![.\\w$])${name.replace(/\$/g, '\\$')}\\b`).test(text)
const copy = (imports) => imports.map((entry) => ({ ...entry, items: [...entry.items] }))

// Load every source and target, then move chunks in plan order.
const files = new Map()
const load = (file) => {
  if (!files.has(file)) files.set(file, parse(file))
  return files.get(file)
}
const declared = new Map()
const owner = new Map()
for (const { from, to, names } of moves) {
  const source = load(from)
  const target = load(to)
  if (!declared.has(from)) declared.set(from, new Set(source.chunks.map((chunk) => chunk.name)))
  for (const name of names) {
    const chunk = source.chunks.find((item) => item.name === name)
    if (!chunk) throw new Error(`${from} does not declare ${name}`)
    source.chunks.splice(source.chunks.indexOf(chunk), 1)
    target.chunks.push(chunk)
    owner.set(`${strip(from)}#${name}`, strip(to))
  }
  if (target.created) target.directive ||= source.directive && to.endsWith('.tsx')
  target.imports.push(...copy(source.imports))
}

// A chunk now apart from a former sibling it uses imports that sibling, which becomes exported.
for (const [file, data] of files)
  for (const chunk of data.chunks)
    for (const name of declared.get(chunk.origin) ?? []) {
      if (name === chunk.name || !uses(code(chunk), name)) continue
      const [home, holder] = [...files].find(([, other]) =>
        other.chunks.some((item) => item.name === name && item.origin === chunk.origin),
      )
      if (home === file) continue
      const sibling = holder.chunks.find((item) => item.name === name && item.origin === chunk.origin)
      const at = sibling.lines.findIndex((line) => declaration.test(line))
      const typeOnly = /^(?:export\s+)?(?:type|interface)\s/.test(sibling.lines[at])
      if (!sibling.lines[at].startsWith('export ')) sibling.lines[at] = `export ${sibling.lines[at]}`
      data.imports.push({ module: strip(home), fallback: null, items: [typeOnly ? `type ${name}` : name] })
    }

// The module that now declares an imported name.
const repoint = (module, item) => owner.get(`${module}#${imported(item)}`) ?? module

// Merged, repointed and pruned import statements for one file.
function render(file, imports, body) {
  const self = strip(file)
  const merged = new Map()
  const slot = (module) => {
    if (!merged.has(module)) merged.set(module, { fallback: null, items: [] })
    return merged.get(module)
  }
  for (const entry of imports) {
    for (const item of entry.items) {
      const module = repoint(entry.module, item)
      if (module === self) continue
      const list = slot(module).items
      if (!list.some((existing) => local(existing) === local(item))) list.push(item)
    }
    if (entry.fallback && entry.module !== self) slot(entry.module).fallback = entry.fallback
  }
  const lines = []
  for (const [module, { fallback, items: list }] of merged) {
    const kept = list.filter((item) => uses(body, local(item)))
    const keepFallback = fallback && uses(body, fallback.replace(/^\*\s+as\s+/, ''))
    if (!kept.length && !keepFallback) continue
    const allTypes = !keepFallback && kept.every((item) => item.startsWith('type '))
    const named = kept.length
      ? `{ ${kept.map((item) => (allTypes ? item.slice(5) : item)).join(', ')} }`
      : ''
    const clause = [keepFallback ? fallback : '', named].filter(Boolean).join(', ')
    lines.push(`import ${allTypes ? 'type ' : ''}${clause} from '${specifier(file, module)}'`)
  }
  return lines
}

for (const [file, data] of files) {
  if (data.chunks.length === 0) {
    execFileSync('git', ['rm', '-q', path.join(web, file)])
    console.log(`${file}: deleted`)
    continue
  }
  const header = render(file, data.imports, data.chunks.map(code).join('\n'))
  const body = data.chunks.flatMap((chunk) => chunk.lines).join('\n')
  const text = [
    ...(data.directive ? ["'use client'", ''] : []),
    ...header,
    '',
    body.replace(/^\n+/, '').replace(/\n*$/, '\n'),
  ].join('\n')
  mkdirSync(path.dirname(path.join(web, file)), { recursive: true })
  writeFileSync(path.join(web, file), text)
  console.log(`${file}: ${data.chunks.length} declarations`)
}

// Every other web file that imported a moved name now imports it from the module that declares it.
const sources = new Set([...owner.keys()].map((key) => key.split('#')[0]))
let repointed = 0
for (const full of walk(web)) {
  const file = rel(full)
  if (files.has(file)) continue
  const text = readFileSync(full, 'utf8')
  for (const [, spec] of text.matchAll(mockPattern))
    if (sources.has(resolve(file, spec))) throw new Error(`${file} mocks ${spec}; split that mock by hand`)
  let changed = false
  const next = text.replace(importPattern, (whole, typeOnly, clause, spec) => {
    const module = resolve(file, spec)
    const named = /\{([^}]*)\}/.exec(clause)?.[1]
    if (!named || !sources.has(module)) return whole
    const list = items(null, named)
    if (list.every((item) => repoint(module, item) === module)) return whole
    changed = true
    const fallback = clause.replace(/\{[^}]*\}/, '').replace(/,\s*$/, '').trim()
    const groups = new Map(fallback ? [[module, []]] : [])
    for (const item of list) {
      const target = repoint(module, item)
      groups.set(target, [...(groups.get(target) ?? []), item])
    }
    return [...groups]
      .map(([target, group]) => {
        const lead = target === module && fallback ? fallback : ''
        const clauseText = [lead, group.length ? `{ ${group.join(', ')} }` : ''].filter(Boolean).join(', ')
        return `import ${typeOnly ?? ''}${clauseText} from '${specifier(file, target)}'\n`
      })
      .join('')
  })
  if (!changed) continue
  writeFileSync(full, next)
  repointed++
  console.log(`${file}: repointed`)
}
console.log(`moved: ${owner.size}; repointed files: ${repointed}`)
```

How it works, for the reviewer: each moved chunk carries its source's import statements, which are re-resolved for the new location, merged by module, repointed to wherever a name now lives, and pruned to the names the file's code uses; a chunk separated from a former sibling it uses gets an import of that sibling, and the sibling gains `export`; any other web file importing a moved name is repointed; a file that mocks a split module stops the run. `'use client'` is kept on new `.tsx` component files and not added to `.ts` modules.

Create `.tmp/s7a/rules-split.json`:

```json
[
  {
    "from": "features/rules/rule-drawer-shared.ts",
    "to": "features/rules/rules.utils.ts",
    "names": ["selectClass", "Rec", "Mode", "severities", "recordBound", "newRow", "newRec"]
  },
  { "from": "features/rules/rule-drawer-shared.ts", "to": "features/rules/rules.copy.ts", "names": ["DEFAULT_REC"] },
  {
    "from": "features/rules/components/rule-condition-editor.tsx",
    "to": "features/rules/rules.copy.ts",
    "names": ["comparisonCopy"]
  },
  {
    "from": "features/rules/components/rule-condition-editor.tsx",
    "to": "features/rules/rules.utils.ts",
    "names": ["nodeKey", "newCondition", "leafCount", "clearRecordBindings"]
  },
  {
    "from": "features/rules/components/rule-condition-editor.tsx",
    "to": "features/rules/components/rule-tree-view.tsx",
    "names": ["RuleTreeView"]
  },
  { "from": "features/rules/components/condition-builder.tsx", "to": "features/rules/rules.utils.ts", "names": ["Choice"] },
  {
    "from": "features/rules/components/condition-builder.tsx",
    "to": "features/rules/hooks/use-binding-choices.ts",
    "names": ["useBindingChoices"]
  },
  {
    "from": "features/rules/components/condition-builder.tsx",
    "to": "features/rules/components/apply-to-fields.tsx",
    "names": ["ApplyToFields"]
  },
  {
    "from": "features/rules/components/rule-output-fields.tsx",
    "to": "features/rules/rules.copy.ts",
    "names": ["severityCopy"]
  },
  {
    "from": "features/rules/components/rule-output-fields.tsx",
    "to": "features/rules/components/severity-field.tsx",
    "names": ["SeverityField"]
  },
  {
    "from": "features/rules/components/rule-output-fields.tsx",
    "to": "features/rules/components/recommendation-fields.tsx",
    "names": ["complete", "RecommendationFields"]
  },
  {
    "from": "features/rules/components/rule-output-fields.tsx",
    "to": "features/rules/components/rule-preview.tsx",
    "names": ["RulePreview"]
  },
  {
    "from": "features/rules/components/review-card-list.tsx",
    "to": "features/rules/rules.copy.ts",
    "names": ["STATUS_LABELS", "statusLabel", "BASIS_LABELS", "basisLabel"]
  },
  { "from": "features/rules/components/review-card-list.tsx", "to": "features/rules/rules.utils.ts", "names": ["basisLine"] },
  {
    "from": "features/rules/components/human-review-workspace.tsx",
    "to": "features/rules/rules.utils.ts",
    "names": ["codeLabel", "manilaTime"]
  },
  {
    "from": "features/rules/components/human-review-workspace.tsx",
    "to": "features/rules/components/alert-evidence.tsx",
    "names": ["AlertEvidence"]
  },
  {
    "from": "features/rules/components/human-review-workspace.tsx",
    "to": "features/rules/components/evidence-table.tsx",
    "names": ["EvidenceTable"]
  },
  {
    "from": "features/rules/components/human-review-workspace.tsx",
    "to": "features/rules/components/notification-row.tsx",
    "names": ["NotificationRow"]
  },
  {
    "from": "features/rules/components/rule-editor.tsx",
    "to": "features/rules/rule-templates.ts",
    "names": ["RuleTemplateSpec", "ruleTemplates"]
  }
]
```

`EvidenceTable` gets its own file because the workspace renders it too; leaving it beside `AlertEvidence` would export two components from one file.

- [ ] **Step 3: Split and check**

```bash
F=apps/web/src/features/rules
C=$F/components
node .tmp/s7a/split-declarations.mjs .tmp/s7a/rules-split.json
node .tmp/s7a/same-lines.mjs $F/rules.utils.ts $F/rules.copy.ts $F/rule-drawer-shared.ts $F/rule-templates.ts $F/hooks/use-binding-choices.ts $C/rule-condition-editor.tsx $C/rule-tree-view.tsx $C/condition-builder.tsx $C/apply-to-fields.tsx $C/rule-output-fields.tsx $C/severity-field.tsx $C/recommendation-fields.tsx $C/rule-preview.tsx $C/review-card-list.tsx $C/human-review-workspace.tsx $C/alert-evidence.tsx $C/evidence-table.tsx $C/notification-row.tsx $C/rule-editor.tsx
```

Expected output of the split (dry run):

```text
features/rules/rule-drawer-shared.ts: deleted
features/rules/rules.utils.ts: 51 declarations
features/rules/rules.copy.ts: 7 declarations
features/rules/components/rule-condition-editor.tsx: 3 declarations
features/rules/components/rule-tree-view.tsx: 1 declarations
features/rules/components/condition-builder.tsx: 1 declarations
features/rules/hooks/use-binding-choices.ts: 1 declarations
features/rules/components/apply-to-fields.tsx: 1 declarations
features/rules/components/rule-output-fields.tsx: deleted
features/rules/components/severity-field.tsx: 1 declarations
features/rules/components/recommendation-fields.tsx: 2 declarations
features/rules/components/rule-preview.tsx: 1 declarations
features/rules/components/review-card-list.tsx: 4 declarations
features/rules/components/human-review-workspace.tsx: 5 declarations
features/rules/components/alert-evidence.tsx: 1 declarations
features/rules/components/evidence-table.tsx: 1 declarations
features/rules/components/notification-row.tsx: 1 declarations
features/rules/components/rule-editor.tsx: 8 declarations
features/rules/rule-templates.ts: 2 declarations
features/rules/components/linked-alert-summary.tsx: repointed
features/rules/components/review-card-list.test.tsx: repointed
features/rules/components/rule-drawer.tsx: repointed
features/rules/components/rule-test-workspace.tsx: repointed
features/rules/components/recommendation-fields.test.tsx: repointed
moved: 34; repointed files: 5
```

then `same lines: 2435` with exit 0. If S2 or S3b changed a fetcher line the total may differ; only a `before`, `after` or `after only` line fails the step. If the script stops with `mocks ...; split that mock by hand`, a later slice added a mock of a split module: stop and report.

```bash
git grep -c "^export function\|^export const [A-Z]" -- $C/*.tsx | grep -v ":1$"
```

Expected: nothing (each component file exports one component; `rule-drawer.tsx` also exports its two types, which the grep ignores).

- [ ] **Step 4: Run the tests and commit**

```bash
git add -A apps/web
pnpm exec biome check --write $(git diff --cached --name-only --diff-filter=AMR -- '*.ts' '*.tsx')
pnpm --filter @pathways/web exec vitest run src/features/rules src/features/projects src/import-direction.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/web test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/web
git commit -m "refactor(web): split the rules files into utils, copy, hooks and one component per file

Declarations move verbatim; rule-drawer-shared.ts and rule-output-fields.tsx are emptied and removed.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass (Biome fixes about 16 files' import order and wraps); web = `B_web + 1` (the Task 2 test). `wc -l` in the dry run: `rules.utils.ts` 248, `human-review-workspace.tsx` 493, `rule-editor.tsx` 635, every new file under 140.

---

### Task 4: Remove the rules duplicates

**Files:**
- Test: `apps/web/src/features/rules/components/human-review-workspace.test.tsx` (characterization, first)
- Test: `apps/web/src/features/rules/rules.utils.test.ts`
- Test: `apps/web/src/features/rules/rules.reads.test.ts`
- Create: `apps/web/src/features/rules/rules.reads.ts` (written by script)
- Modify: `apps/web/src/features/rules/rules.utils.ts`, `components/human-review-workspace.tsx`, `components/rule-condition-editor.tsx`, `hooks/use-binding-choices.ts`, `components/rule-editor.tsx`

**Interfaces:**
- Consumes: `alertSeverities` from `@pathways/shared`; `useAuthorizedRead` (F4b path); `type Choice` (Task 3).
- Produces: `alertSeverityRank(value: string): number` from `features/rules/rules.utils.ts`; `useRuleBindingIndicators(scopeProjectId: string | null, enabled: boolean)`, `useRuleBindingActivities(scopeProjectId: string | null, enabled: boolean)`, `useRuleBindingActivityContext(scopeProjectId: string | null, enabled: boolean)` from `features/rules/rules.reads.ts`, each returning the `useAuthorizedRead` result of its fetcher.

- [ ] **Step 1: Pin the severity sort of the queue**

In `apps/web/src/features/rules/components/human-review-workspace.test.tsx` replace `import { cleanup, render, screen } from '@testing-library/react'` with `import { cleanup, fireEvent, render, screen } from '@testing-library/react'`, and inside `describe('alert outcome controls', ...)`, directly before the test `labels a linked recommendation by its title`, add:

```tsx
  it('sorts the loaded queue most severe first on request', async () => {
    state.alerts.mockResolvedValue({
      items: ['LOW', 'CRITICAL', 'MEDIUM', 'HIGH'].map((severity, index) => ({
        ...alert,
        id: `30000000-0000-4000-8000-00000000001${index}`,
        title: `${severity} alert`,
        severity,
      })),
      nextCursor: null,
    })
    renderWorkspace()
    await screen.findByText('LOW alert')
    fireEvent.click(screen.getByRole('button', { name: 'Sort by severity' }))
    const titles = screen.getAllByText(/ alert$/).map((node) => node.textContent)
    expect(titles).toEqual(['CRITICAL alert', 'HIGH alert', 'MEDIUM alert', 'LOW alert'])
  })
```

Run: `pnpm --filter @pathways/web exec vitest run src/features/rules/components/human-review-workspace.test.tsx`
Expected: PASS against `SEVERITY_RANK` (characterization; 8 tests in the dry run).

- [ ] **Step 2: Write the failing rank and read tests**

In `apps/web/src/features/rules/rules.utils.test.ts`, add `alertSeverityRank,` as the first name of the `./rules.utils` import, and append:

```ts
describe('alertSeverityRank', () => {
  it('ranks the four severities most severe first and anything else last', () => {
    expect(
      ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', '', 'UNKNOWN', 'constructor'].map(alertSeverityRank),
    ).toEqual([0, 1, 2, 3, 4, 4, 4])
  })
})
```

Create `apps/web/src/features/rules/rules.reads.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

const read = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/use-authorized-read', () => ({ useAuthorizedRead: read }))

import {
  useRuleBindingActivities,
  useRuleBindingActivityContext,
  useRuleBindingIndicators,
} from './rules.reads'

const projectId = 'a1000000-0000-4000-8000-00000000000b'

describe('rule binding reads', () => {
  it('keeps one resource key, scope and permission per bound record kind', () => {
    useRuleBindingIndicators(projectId, true)
    useRuleBindingActivities(projectId, false)
    useRuleBindingActivityContext(null, true)
    expect(
      read.mock.calls.map(([key, scope, permission, , enabled]) => [
        key,
        scope,
        permission,
        enabled,
      ]),
    ).toEqual([
      ['rule-binding-indicators', projectId, 'indicators.read', true],
      ['rule-binding-activities', projectId, 'activities.read', false],
      ['rule-binding-activities-context', null, 'activities.context.read', true],
    ])
  })
})
```

The mock path is F4b's home of `useAuthorizedRead`; the dry run (before F4b) mocked `@/providers/authorized-query-provider`. If Step 4 shows `rules.reads.ts` importing `useAuthorizedRead` from elsewhere, mock that path.

Run: `pnpm --filter @pathways/web exec vitest run src/features/rules/rules.utils.test.ts src/features/rules/rules.reads.test.ts`
Expected: FAIL: `alertSeverityRank` is not exported and `./rules.reads` cannot be resolved.

- [ ] **Step 3: Share the severity rank, drop the Choice copy and the dead helper**

`apps/web/src/features/rules/rules.utils.ts`:
- In the `@pathways/shared` import add `alertSeverities,` after `type RuleNode,`.
- Delete the two lines `const firstMetric = (node: RuleNode): string =>` and `  node.kind === 'CONDITION' ? node.metric : firstMetric(node.children[0] as RuleNode)` (no caller anywhere).
- Append:

```ts
// Most severe first when the queue is sorted; unknown severities sort last.
export const alertSeverityRank = (value: string) => {
  const rank = (alertSeverities as readonly string[]).indexOf(value)
  return rank === -1 ? alertSeverities.length : rank
}
```

`apps/web/src/features/rules/components/human-review-workspace.tsx`:
- Delete the three lines (and the blank line after them):

```ts
// Most severe first when the queue is sorted; unknown severities sort last.
const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
const severityRank = (value: string) => SEVERITY_RANK[value] ?? 4
```

- Replace both `severityRank(` calls with `alertSeverityRank(`, and the import `import { codeLabel, manilaTime } from '../rules.utils'` with `import { alertSeverityRank, codeLabel, manilaTime } from '../rules.utils'`.

`apps/web/src/features/rules/components/rule-condition-editor.tsx`:
- Delete the line `type Choice = { id: string; name: string }`; in its `../rules.utils` import add `type Choice,` as the first name.

```bash
git grep -n "SEVERITY_RANK\|severityRank\|firstMetric\|^type Choice" -- apps/web/src/features/rules
```

Expected: only the two `alertSeverityRank(` calls, its declaration, its test lines and `export type Choice` in `rules.utils.ts`.

- [ ] **Step 4: Move the rule-binding reads into rules.reads.ts**

Create `.tmp/s7a/binding-reads.mjs`:

```js
// Moves the duplicated rule-binding authorized reads into rules.reads.ts hooks, after checking both copies match.
import { readFileSync, writeFileSync } from 'node:fs'

const dir = 'apps/web/src/features/rules'
const callers = [`${dir}/hooks/use-binding-choices.ts`, `${dir}/components/rule-editor.tsx`]
const reads = [
  ['rule-binding-indicators', 'indicators.read', 'useRuleBindingIndicators', 'Indicators of the scope project that an indicator condition can bind to.'],
  ['rule-binding-activities', 'activities.read', 'useRuleBindingActivities', 'Activities of the scope project for a role that reads full activity records.'],
  ['rule-binding-activities-context', 'activities.context.read', 'useRuleBindingActivityContext', 'Activity names of the scope project for a role that reads only activity context.'],
]
const importPattern = /^import\s+(type\s+)?([^'";]*?)\s*from\s*'([^']+)'\n/gm
const local = (item) => item.replace(/^type\s+/, '').split(/\s+as\s+/).at(-1)
const used = (text, item) => new RegExp(`(?<![.\\w$])${local(item)}\\b`).test(text)

// Keeps only the named imports a body uses; statements left empty disappear.
function imports(head, body) {
  return head.replace(importPattern, (whole, typeOnly, clause, spec) => {
    const named = /\{([^}]*)\}/.exec(clause)
    if (!named || clause.replace(named[0], '').trim()) return whole
    const kept = named[1].split(',').map((item) => item.trim()).filter(Boolean).filter((item) => used(body, item))
    return kept.length ? `import ${typeOnly ?? ''}{ ${kept.join(', ')} } from '${spec}'\n` : ''
  })
}
const split = (text) => {
  const matches = [...text.matchAll(importPattern)]
  const end = matches.at(-1).index + matches.at(-1)[0].length
  return [text.slice(0, end), text.slice(end)]
}

const fetchers = new Map()
let readsHead = ''
for (const file of callers) {
  let text = readFileSync(file, 'utf8')
  for (const [key, permission, hook] of reads) {
    const call = new RegExp(
      `useAuthorizedRead\\(\\s*'${key}',\\s*scopeProjectId,\\s*'${permission.replaceAll('.', '\\.')}',\\s*(\\(signal\\) =>[^\\n]*?),\\s*\\n`,
    )
    const match = call.exec(text)
    if (!match) throw new Error(`${file}: no ${key} read`)
    if (fetchers.has(key) && fetchers.get(key) !== match[1])
      throw new Error(`${key} fetchers differ:\n${fetchers.get(key)}\n${match[1]}`)
    fetchers.set(key, match[1])
    text = text.replace(call, `${hook}(\n    scopeProjectId,\n`)
  }
  const [head, body] = split(text)
  if (!readsHead) readsHead = head
  const added = `import { ${reads.map(([, , hook]) => hook).join(', ')} } from '../rules.reads'\n`
  writeFileSync(file, imports(head, body) + added + body)
  console.log(`${file}: ${reads.length} reads replaced`)
}

const hooks = reads.map(
  ([key, permission, hook, comment]) =>
    `// ${comment}\nexport const ${hook} = (scopeProjectId: string | null, enabled: boolean) =>\n  useAuthorizedRead(\n    '${key}',\n    scopeProjectId,\n    '${permission}',\n    ${fetchers.get(key)},\n    enabled,\n  )\n`,
)
const body = hooks.join('\n')
writeFileSync(`${dir}/rules.reads.ts`, `${imports(readsHead, body).replace(/^'use client'\n\n?/, '')}\n${body}`)
for (const [key, fetcher] of fetchers) console.log(`${key}: ${fetcher}`)
```

```bash
node .tmp/s7a/binding-reads.mjs
git grep -n "'rule-binding-" -- apps/web/src
cat apps/web/src/features/rules/rules.reads.ts
```

Expected: `hooks/use-binding-choices.ts: 3 reads replaced`, `components/rule-editor.tsx: 3 reads replaced`, then the three fetchers (dry run: `(signal) => pathwaysClient.getProjectIndicators(scopeProjectId ?? '', signal)`, `(signal) => pathwaysClient.getActivities(scopeProjectId ?? '', signal)`, `(signal) => pathwaysClient.getActivityContext(scopeProjectId ?? '', signal)`; after S2b the last two are `activitiesClient.getActivities(...)` and `activitiesClient.getActivityContext(...)`, and after S3b the first is `(signal) => indicatorsClient.getProjectIndicators(scopeProjectId ?? '', signal)` from `@/lib/api/indicators`, and `rule-editor.test.tsx` mocks that module plus an empty `pathwaysClient` factory instead of `pathwaysClient.getProjectIndicators`). The grep prints three lines, all in `rules.reads.ts`. The file holds two imports (the client of each fetcher and `useAuthorizedRead`, both from the paths `use-binding-choices.ts` used) and the three hooks, each passing `enabled` as the fifth argument. If the script stops with `fetchers differ`, the two copies were not duplicates any more: stop and report. In the callers each enabled expression stays where it was, so `use-binding-choices.ts` still passes `needs(...)` and `rule-editor.tsx` its `Boolean(...)` expressions.

- [ ] **Step 5: Run the tests and commit**

```bash
git add -A apps/web
pnpm exec biome check --write $(git diff --cached --name-only --diff-filter=AMR -- '*.ts' '*.tsx')
pnpm --filter @pathways/web exec vitest run src/features/rules
pnpm typecheck && pnpm lint
pnpm --filter @pathways/web test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/web
git commit -m "refactor(web): share the rule-binding reads and the alert severity rank

The two copies of the three rule-binding reads become rules.reads hooks with the same keys, scopes, permissions and enabled flags; the queue rank reads shared alertSeverities; a duplicate type and a dead helper go.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass, including the unchanged `rule-drawer.test.tsx` and `rule-editor.test.tsx` cases (Review Focus 5); web = `B_web + 4`.

---

### Task 5: Move the rules client to lib/api/rules

**Files:**
- Move: `apps/web/src/lib/services/rules-human-client.ts` -> `apps/web/src/lib/api/rules.ts`; `apps/web/src/lib/services/rules-human-client.test.ts` -> `apps/web/src/lib/api/rules.test.ts`
- Modify (specifier or mock path only, 21 files): listed by the script

**Interfaces:**
- Produces: `rulesHumanClient` from `@/lib/api/rules` (object unchanged).

- [ ] **Step 1: Count, move and repoint**

Create `.tmp/s7a/rules-client-move.json`:

```json
{
  "lib/services/rules-human-client.ts": "lib/api/rules.ts",
  "lib/services/rules-human-client.test.ts": "lib/api/rules.test.ts"
}
```

```bash
git grep -n "rules-human-client'" -- apps/web | wc -l
git grep -l "rules-human-client'" -- apps/web | wc -l
git grep -n "vi.mock('@/lib/services/rules-human-client'" -- apps/web | wc -l
node .tmp/s7a/move-modules.mjs .tmp/s7a/rules-client-move.json apps/web/src apps/web/e2e
git grep -n "rules-human-client" -- apps
git grep -n "vi.mock('@/lib/api/rules'" -- apps/web | wc -l
```

Expected: `22`, `21`, `9`; the script prints (dry run):

```text
features/analytics/analytics-dashboard.test.tsx: 2
features/analytics/analytics-dashboard.tsx: 1
features/rules/components/alert-evidence.tsx: 1
features/rules/components/human-review-action.test.tsx: 1
features/rules/components/human-review-action.tsx: 1
features/rules/components/human-review-workspace.recommendations.test.tsx: 1
features/rules/components/human-review-workspace.test.tsx: 1
features/rules/components/human-review-workspace.tsx: 1
features/rules/components/linked-alert-summary.tsx: 1
features/rules/components/notification-row.tsx: 1
features/rules/components/project-rules-panel.test.tsx: 1
features/rules/components/project-rules-panel.tsx: 1
features/rules/components/rule-drawer.test.tsx: 1
features/rules/components/rule-drawer.tsx: 1
features/rules/components/rule-editor.test.tsx: 1
features/rules/components/rule-editor.tsx: 1
features/rules/components/rule-test-workspace.test.tsx: 1
features/rules/components/rule-test-workspace.tsx: 1
features/rules/components/rules-board.test.tsx: 1
features/rules/components/rules-board.tsx: 1
lib/services/rules-human-client.test.ts: 1
total: 22; moved: 2
```

then nothing, then `9` (Review Focus 1). The client's own imports are aliases (`@/lib/auth/...`, `@/lib/api/core/...`), so it needs no edit; if F4b left a relative `./pathways-client` import in it, the script rewrites it to `../services/pathways-client`, which is expected.

- [ ] **Step 2: Run the tests and commit**

```bash
git add -A apps/web
pnpm exec biome check --write $(git diff --cached --name-only --diff-filter=AMR -- '*.ts' '*.tsx')
pnpm --filter @pathways/web exec vitest run src/lib/api src/features/rules src/features/analytics
pnpm typecheck && pnpm lint
git checkout -- apps/web/next-env.d.ts
git add -A apps/web
git status --short apps/web/src/lib | grep "^R"
git commit -m "refactor(web): move the rules client to lib/api/rules

Twenty-two specifiers in 21 files follow, nine of them test mocks.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass (Biome reorders about ten import blocks); two `R` renames.

---

### Task 6: The features/rules public surface

**Files:**
- Create: `apps/web/src/features/rules/index.ts`
- Test: `apps/web/src/import-direction.test.ts` (feature surface rule)
- Modify (specifier and mock path only): `apps/web/src/app/(dashboard)/alerts/page.tsx`, `apps/web/src/app/(dashboard)/alerts/repository/page.tsx`, `apps/web/src/app/(dashboard)/recommendations/[recommendationId]/page.tsx`, `apps/web/src/app/(dashboard)/recommendations/[recommendationId]/page.test.tsx`, the project review workspace and its test

**Interfaces:**
- Consumes: S1b's feature surface rule in `apps/web/src/import-direction.test.ts`, when Task 0 Step 2 found one.
- Produces: `AlertsWorkspace`, `RulesBoard`, `RecommendationsWorkspace` and `ProjectRulesPanel` from `@/features/rules` (definitions unchanged); `'rules'` in the surface rule's feature list, or, when S1b wrote no rule, `indexedFeatures: readonly string[]` and `surfaceViolation(file: string, specifier: string): string | null` in `apps/web/src/import-direction.test.ts`, which S7b extends by adding `'analytics'` and `'dashboard'`.

- [ ] **Step 1: Write the failing surface rule**

If Task 0 Step 2 printed a feature surface rule that S1b added, add `'rules'` to its feature list, skip the code below, and expect the same four failures in the run (its message text may differ). S1b's test also requires every indexed feature in `experimental.optimizePackageImports` in `apps/web/next.config.ts`, so add `'@/features/rules'` to that list in this task and measure the four rules routes against Task 0. Otherwise, in `apps/web/src/import-direction.test.ts`, add directly above the comment `// Non-test TypeScript files under a folder; tests may import fixtures across layers.`:

```ts
// Features whose index.ts is their only surface for files outside them (CR section 3.3).
const indexedFeatures: readonly string[] = ['rules']

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

and append at the end of the file:

```ts
describe('feature public surfaces', () => {
  it('detects an import that bypasses an indexed feature', () => {
    const file = path.join(src, 'features', 'projects', 'example.tsx')
    const source = [
      "import { a } from '@/features/rules/components/rule-drawer'",
      "import { b } from '../rules/rules.utils'",
      "const c = await import('@/features/rules/hooks/use-binding-choices')",
      "import { d } from '@/features/rules'",
      "import { e } from '@/features/rules/index'",
      "import { f } from '@/features/reports/reporting-workspace'",
      "import { g } from './project-utils'",
    ].join('\n')
    expect(specifiers(source).map((specifier) => surfaceViolation(file, specifier))).toEqual([
      'import features/rules only through its index',
      'import features/rules only through its index',
      'import features/rules only through its index',
      null,
      null,
      null,
      null,
    ])
    const page = path.join(src, 'app', '(dashboard)', 'alerts', 'page.tsx')
    expect(surfaceViolation(page, '@/features/rules/components/alerts-workspace')).toBe(
      'import features/rules only through its index',
    )
    expect(surfaceViolation(page, '@/features/rules')).toBeNull()
    const inside = path.join(src, 'features', 'rules', 'components', 'example.tsx')
    expect(surfaceViolation(inside, '../rules.utils')).toBeNull()
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
})
```

The page case pins ruling 3: route pages go through the index like other features.

Run: `pnpm --filter @pathways/web exec vitest run src/import-direction.test.ts`
Expected: the detection test passes; the scan FAILS with exactly these four entries (replayed on the `675a0b58` export; the last path is wherever S1b put the workspace):

```text
app/(dashboard)/alerts/page.tsx -> @/features/rules/components/alerts-workspace (import features/rules only through its index)
app/(dashboard)/alerts/repository/page.tsx -> @/features/rules/components/rules-board (import features/rules only through its index)
app/(dashboard)/recommendations/[recommendationId]/page.tsx -> @/features/rules/components/recommendations-workspace (import features/rules only through its index)
features/projects/project-review-workspace.tsx -> @/features/rules/components/project-rules-panel (import features/rules only through its index)
```

- [ ] **Step 2: Add the index and repoint the four importers**

Create `apps/web/src/features/rules/index.ts`:

```ts
export { AlertsWorkspace } from './components/alerts-workspace'
export { ProjectRulesPanel } from './components/project-rules-panel'
export { RecommendationsWorkspace } from './components/recommendations-workspace'
export { RulesBoard } from './components/rules-board'
```

```bash
for f in $(git grep -lE "'@/features/rules/components/(alerts-workspace|project-rules-panel|recommendations-workspace|rules-board)'" -- apps/web/src/app apps/web/src/features/projects); do
  sed -i -E "s#'@/features/rules/components/(alerts-workspace|project-rules-panel|recommendations-workspace|rules-board)'#'@/features/rules'#" "$f"
done
git grep -n "'@/features/rules'" -- apps/web/src
git grep -n "features/rules/components" -- apps/web/src ':!apps/web/src/features/rules'
```

Expected: six lines (replayed):

```text
apps/web/src/app/(dashboard)/alerts/page.tsx:3:import { AlertsWorkspace } from '@/features/rules'
apps/web/src/app/(dashboard)/alerts/repository/page.tsx:1:import { RulesBoard } from '@/features/rules'
apps/web/src/app/(dashboard)/recommendations/[recommendationId]/page.test.tsx:6:vi.mock('@/features/rules', () => ({
apps/web/src/app/(dashboard)/recommendations/[recommendationId]/page.tsx:1:import { RecommendationsWorkspace } from '@/features/rules'
apps/web/src/features/projects/project-review-workspace.test.tsx:63:vi.mock('@/features/rules', () => ({
apps/web/src/features/projects/project-review-workspace.tsx:4:import { ProjectRulesPanel } from '@/features/rules'
```

then one line, `apps/web/src/features/ui-copy-cleanup.contract.test.ts:73:      'features/rules/components/project-rules-panel.tsx',` (a file path string the copy contract reads, not an import). Each of the two mock factories returns the one name its subject imports from the index (`RecommendationsWorkspace`, `ProjectRulesPanel`), so both mocks still apply (Review Focus 1).

- [ ] **Step 3: Run the tests and compare the route bundles**

```bash
git add -A apps/web
pnpm exec biome check --write apps/web/src/import-direction.test.ts apps/web/src/features/rules/index.ts $(git diff --cached --name-only --diff-filter=AMR -- apps/web/src/app apps/web/src/features/projects)
pnpm --filter @pathways/web exec vitest run src/import-direction.test.ts src/features/projects src/features/rules "src/app/(dashboard)/recommendations"
pnpm typecheck && pnpm lint
pnpm --filter @pathways/web test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
pnpm --filter @pathways/web build > .tmp/s7a/web-build-task6.log 2>&1; echo "exit $?"
grep -E "Middleware|/alerts|/recommendations/|/projects/\[projectId\]/monitor-evaluate" .tmp/s7a/web-build-task6.log
git checkout -- apps/web/next-env.d.ts
```

Expected: all pass; web = `B_web + 6` (with S1b's rule extended instead, `B_web + 4`); build exit 0; `Middleware` equals `M0` and each of the four First Load JS figures is at most its `R0` value. If any route grows, stop without committing and report the four before and after figures: ruling 3 leaves that trade to the controller.

- [ ] **Step 4: Commit**

```bash
git add -A apps/web
git commit -m "refactor(web): give features/rules a public index and route its importers through it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Records and SAD routing

**Files:**
- Modify: `scripts/sad/check.ts`, `scripts/sad/check.test.ts`, `docs/sad-pathways.md:40`
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.3, 3.7, 9)
- Modify: `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-15, MOD-16, MOD-17 rows)
- Modify: `docs/qad-pathways.md` (rows QAD-T10, QAD-T69, QAD-T70), `docs/deferred-features.md:37`
- Modify: `docs/index.md` (CR row status), `docs/activity-log.md`

- [ ] **Step 1: Route the rules feature to the determinism checker (ruling 14)**

In `scripts/sad/check.test.ts`, test `routes rules engine and rule editor changes to the determinism checker`: replace both occurrences of `apps/web/src/features/analytics/rule-editor.tsx` with `apps/web/src/features/rules/components/rule-editor.tsx`, add the line `      change('apps/web/src/features/rules/rules.utils.ts', 'new', 'old'),` after the rule editor `change(...)` line, and add `      'apps/web/src/features/rules/rules.utils.ts',` after the rule editor path in the expected array.

Run: `pnpm sad:test`
Expected: FAIL on that test (the old globs match neither new path).

In `scripts/sad/check.ts`, `rule-engine-determinism-checker` globs, replace

```ts
      'apps/web/src/features/analytics/rule*.ts',
      'apps/web/src/features/analytics/rule*.tsx',
```

with

```ts
      'apps/web/src/features/rules/**/*.ts',
      'apps/web/src/features/rules/**/*.tsx',
```

In `docs/sad-pathways.md` line 40 replace `` `apps/web/src/features/analytics/rule*.ts`, `apps/web/src/features/analytics/rule*.tsx` `` with `` `apps/web/src/features/rules/**/*.ts`, `apps/web/src/features/rules/**/*.tsx` ``.

```bash
pnpm sad:test && pnpm sad:typecheck
```

Expected: PASS; sad = `B_sad` (one test changed, none added).

- [ ] **Step 2: Amend the Change Record**

`docs/cr-pathways-codebase-modularization.md`:

Section 3.3 table, replace the row `| <domain>.reads.ts | Authorized-read resource keys and fetchers |` (written with backticks around the file name) with `` | `<domain>.reads.ts` | Authorized-read resource keys, fetchers and the hooks that call them | `` (if S3b already amended that row the same way, leave it). Then run `grep -n "index.ts" docs/cr-pathways-codebase-modularization.md`: if no sentence in section 3.3 yet says that route pages import a feature through its index and which test enforces it (S1b may have added one), add after the paragraph starting `` `lib/rbac/{policy,routes,nav,transport}` are files ``:

```text
Route pages under `app/` import a feature through its `index.ts`, like other features; the features listed in the surface rule of `apps/web/src/import-direction.test.ts` are enforced (amended 2026-10-12 for S7a).
```

Section 3.7, replace the S7 row reason cell `` Merges rules-board and analytics rule files into `features/rules` `` with `` Merges rules-board and analytics rule files into `features/rules`; split into S7a (rules) and S7b (analytics and dashboards) ``.

Section 9, append:

```markdown
S7a applied <date> on refactor/s7a-rules:
- Feature: 30 files from `features/rules-board`, the analytics rule and review screens and `features/projects/project-rules-panel.tsx` moved to `features/rules` (`components/`, `hooks/`, `rules.utils.ts`, `rules.copy.ts`, `rules.reads.ts`, `rule-templates.ts`, `index.ts`); analytics and rules no longer import each other.
- Split: one exported component per file; `rule-drawer-shared.ts` and `rule-output-fields.tsx` were emptied and removed; `Owned*` screens became `*Form`; declarations moved verbatim (`same lines: <n>`).
- Duplicates: the two copies of the three `rule-binding-*` reads became `rules.reads` hooks with the same keys, scopes, permissions and enabled flags; `SEVERITY_RANK` became `alertSeverityRank` over shared `alertSeverities`; a duplicate `Choice` type and the dead `firstMetric` were removed; the literal NUL key separator became an escape.
- Client: `lib/services/rules-human-client.ts` moved to `lib/api/rules.ts` (22 specifiers in 21 files, 9 mocks).
- Surface: `features/rules/index.ts` exports `AlertsWorkspace`, `RulesBoard`, `RecommendationsWorkspace` and `ProjectRulesPanel`; the three route pages and the project review workspace import it; `import-direction.test.ts` lists `rules` among the indexed features; route First Load JS unchanged (`<sizes>`).
- Api: four controllers in `rules-human.controller.ts` became one per file; the five rules controllers use `requestIdentity`; seven `Prisma.TransactionClient` annotations became `Tx`; `rules.routes.test.ts` pins 23 routes and the 403 without identity.
- SAD: rule-engine determinism routing covers `apps/web/src/features/rules/**`.
- Decisions: split into S7a and S7b by domain (ruling 1); route pages import `features/rules` through its index, as S1b does (ruling 3); three rules files stay above 500 lines, `rule-editor.tsx` (631), `rule-test-workspace.tsx` (603) and `rules-board.tsx` (503), because each is one stateful body (ruling 4); the client keeps the name `rulesHumanClient` (ruling 9); no contract or DTO work, because the rules api has no DTO (ruling 13).

Deferred to S7b: analytics and dashboards api, web and the shared `monitoring` folder, including `dashboards.dto.ts`, the `descriptive-analytics` and `role-overview` splits, `requestIdentity` and `Tx` in the five analytics and dashboards controllers and their services, the stored project status union copies (three of them in `packages/shared/src/rules`), the `dashboards <-> reports` module pair, `analytics-dashboard.tsx`, `DashboardSeverity` and the analytics and dashboard indexes.
```

Replace `<date>` with today's date, `<n>` with the Task 3 Step 3 count and `<sizes>` with the four Task 6 figures.

- [ ] **Step 3: Update the audit, living docs and index**

- Audit: append to the disposition cell of MOD-15 `; rules part closed by S7a (features/rules, index).`, of MOD-16 `; rule-binding read keys closed by S7a.`, and of MOD-17 `; rules controllers and Owned* rules screens closed by S7a.`
- `docs/qad-pathways.md` and `docs/deferred-features.md`:

```bash
sed -i -e 's#apps/web/src/features/analytics/recommendation-detail-workspace\.test\.tsx#apps/web/src/features/rules/components/human-review-workspace.recommendations.test.tsx#g' -e 's#apps/web/src/features/analytics/human-review-action\.test\.tsx#apps/web/src/features/rules/components/human-review-action.test.tsx#g' docs/qad-pathways.md
sed -i '37s#apps/web/src/features/analytics/rule-editor\.tsx#apps/web/src/features/rules/components/rule-editor.tsx#' docs/deferred-features.md
git grep -nE "features/rules-board|features/analytics/(rule-|human-review|alerts-workspace|recommendations-workspace|linked-alert|recommendation-detail)|projects/project-rules-panel|rules-human-client|rules-human\.controller" -- docs ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/cr-*' ':!docs/superpowers/*'
```

Expected: the grep prints only `docs/deferred-features.md:20`, a historical removal record whose restore instructions name the paths at commit `98a9004`, kept on purpose. Check line 37 still names `UNFINISHED_CONTROLS_UI_ENABLED`, which `rule-editor.tsx` still reads.

- `docs/index.md`: in the CR row status keep the applied list the previous slice wrote, add S7a to it and end with `S7b next`.

- [ ] **Step 4: Activity log**

Add to `docs/activity-log.md`:

```markdown
## <date> Modularization S7a rules (refactor/s7a-rules)
```

with one bullet per Task 1 to Task 6 stating what moved, split or was added, with its commit hash and the api and web test counts at the end of that task; a bullet saying the S7a decisions are recorded in the change record section 9 (the plan stays until S7b is planned, because it holds the S7b outline); a bullet listing the S7b deferrals; and a bullet for the controller: S8a must start only after S7b merges, because its Task 0 merge grep `Merge refactor/s7` is already satisfied by S7a (Risks). Task 8 Step 5 appends the gate results.

- [ ] **Step 5: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint
git add docs scripts/sad
git commit -m "docs: record modularization S7a and route features/rules to the determinism checker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline.

---

### Task 8: Full release gates and merge

- [ ] **Step 1: Static gates**

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm sad:test
git checkout -- apps/web/next-env.d.ts
pnpm --filter @pathways/web build > .tmp/s7a/web-build-gates.log 2>&1; echo "exit $?"
grep -E "Middleware|/alerts|/recommendations/|/projects/\[projectId\]/monitor-evaluate" .tmp/s7a/web-build-gates.log
git checkout -- apps/web/next-env.d.ts
```

Expected: all pass; web build exit 0, `Middleware` equal to `M0` and the four route First Load JS figures at most `R0` (Task 6 checked them; Task 7 changes no web source). Versus Task 0: api = `B_api + 2`, web = `B_web + 6` (or `+ 4`, Task 6), sad = `B_sad`, config, shared and imports unchanged.

- [ ] **Step 2: Local DB replay**

```powershell
./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline
```

Expected: exit 0. (After W1 the folder is `replay/`; S7a runs before W1.)

- [ ] **Step 3: Local stack, compiled API boot, e2e and smoke**

Stop anything on ports 3000 and 4000 first.

```bash
pnpm db:local:start && pnpm db:local:reset && pnpm db:local:demo
pnpm dev:local
```

`pnpm dev:local` builds the API and runs `dist`. In a second terminal:

```bash
curl -s http://127.0.0.1:4000/api/health
for p in rules alerts alerts/escalated recommendations notifications; do curl -s -o /dev/null -w "$p %{http_code}\n" http://127.0.0.1:4000/api/$p; done
npx playwright test --config playwright.config.ts
npx playwright test --config playwright.auth-navigation.config.ts
```

Expected: `"status":"ok"`; each rules path answers 401 (registered and guarded), never 404; a Nest `can't resolve dependencies` error or a module-resolution error in the `pnpm dev:local` output fails the gate; auth-navigation 27/27; main suite 39 pass, 9 fail, 22 not run, with the same 9 failing as the earlier slices' gate runs (MFA Verify helper, password-login harness, workflows seed end date). Browser smoke, each step as a demo user whose role allows it: open `/alerts/repository`, the Manage Rules table and a rule drawer, add an indicator condition and an activity overdue condition in an assigned project scope and see the binding pickers fill (rules.reads, as Project Manager and as a role holding only `activities.context.read`), reuse a saved recommendation and see an identical one hidden (escape), test the rule (`RuleTestForm`); open `/alerts`, sort by severity, open an alert and its evidence, history and linked recommendation (`AlertEvidence`, `EvidenceTable`); open `/recommendations/<id>` and record an outcome as the outcome role, and confirm a role without it sees it read-only; open a project's review tab and see the rules panel (`@/features/rules` index); open `/analytics` and confirm the open alert count (`lib/api/rules`). Every step must behave as on dev.

- [ ] **Step 4: SAD review**

```bash
pnpm sad:check --base dev --head HEAD --output .tmp/sad/s7a/manifest.json
```

Dispatch every role the manifest requires (expect `design-qa-agent`, `restraint-guardian` for `scripts/sad`, `organization-isolation-checker` for `rules-human.service.ts` and `rules-source-operations.service.ts` reach, `beneficiary-privacy-guardian` for the controllers and `lib/api/rules.ts`, and `rule-engine-determinism-checker` for `modules/rules` and `features/rules`) with the section 4.2 handoff packet from `docs/sad-pathways.md`, save their section 4.4 envelopes to `.tmp/sad/s7a/reviews.json`, then:

```bash
pnpm sad:signoff -- --base dev --head HEAD --reviews .tmp/sad/s7a/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun.

- [ ] **Step 5: Record the gate results**

Append a final bullet to the Task 7 activity-log section with the gate results (per-package counts, Middleware size, replay exit code, e2e pass counts, smoke result, SAD sign-off), then:

```bash
git add docs/activity-log.md
git commit -m "docs: record modularization S7a release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Merge into local dev**

```bash
git checkout dev
git merge --no-ff refactor/s7a-rules -m "Merge refactor/s7a-rules into dev

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Keep the plan for S7b**

The plan holds the S7b outline, so it stays on dev (as the F4 plan did for F4b). In `docs/index.md` section 1.6 change the S7 plan row status to `S7a executed; holds the S7b outline`, then:

```bash
pnpm docs:check 2>&1 | tail -3
git add docs/index.md
git commit -m "docs: mark S7a executed in the plan index

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline. Do not push `origin dev` until the developer says so.

---

## S7b outline (analytics and dashboards, branch `refactor/s7b-analytics-dashboards`)

To be written as its own plan from dev after S7a merges; that plan's Task 0 removes this file and its index row. It holds about twelve tasks in two parts. If the written plan passes ten tasks, part 1 becomes S7b (`refactor/s7b-analytics-api`, evidence `.tmp/sad/s7b/`) and part 2 becomes S7c (`refactor/s7c-analytics-web`, evidence `.tmp/sad/s7c/`), each with its own records and gates task, and CR 3.7 and the S8 plan's merge grep are updated to name the last one. Counts below were taken at `a101ad7c` (source identical to dev `675a0b58`) and must be recounted in Task 0, because S1, S2, S3, S6 and F4b change files listed here.

Interfaces assumed: S1 `requestIdentity` (`apps/api/src/common/authz/request-identity.ts`), `storedProjectStatuses` and `StoredProjectStatus` (`packages/shared/src/contracts/projects/project-requests.ts`), the projects index and its surface rule, and S1b's `projectsClient.getProjectMap` in `lib/api/projects.ts`; S3 `metricCellSchema` in `packages/shared/src/monitoring/metric-cell.ts`, `date` and `uuid` field schemas in `monitoring/metric-fields.ts` (outside the barrel), the dashboard and SADDD remainder of `metric-contract.ts`, and `monitoringSqlError` in `apps/api/src/modules/indicators/indicators.helpers.ts`; S6 the pair list `['dashboards <-> reports']` in `apps/api/src/common/import-boundary.test.ts` and `modules/reports/report-artifact.ts` staying in reports; F4b `useAuthorizedRead`, `lib/format` and `DashboardSeverity` left in `types/pathways.ts`; S7a `.tmp/s7a/{split-module,same-lines,move-modules,split-declarations}.mjs` (copy them from this plan), the `rules.routes.test.ts` pattern and the surface rule feature list.

### Part 1: api and shared

- **Task 0, baseline:** recount; hashes of `dashboards.service.ts`, `analytics.service.ts`, `descriptive-analytics.ts` (api and shared), `role-overview.service.ts`, `analytics-insights.service.ts`; `Middleware` and First Load JS of `/analytics` and `/dashboard`; `git ls-files 'apps/api/src/*.dto.ts'` and the controllers holding `Application profile is required.'`, which must end S7b at the five S8 DTO files and the two S8 controllers the S8 plan expects.
- **Task 1, route table and kernel adoption:** first a route test like `rules.routes.test.ts` over `DashboardsModule` and `AnalyticsInsightsModule` (method, path, permission, `Cache-Control`, 403 without identity). Then `requestIdentity` in `dashboards.controller.ts` (private `identity`), `analytics.controller.ts`, `action-counts.controller.ts`, `role-overview.controller.ts` and `analytics-insights.controller.ts`; the 13 production `Prisma.TransactionClient` annotations become `Tx` (`analytics.service.ts` 9, `dashboards.service.ts` 3, `analytics-insights.service.ts` 1); the insights inline scope lookup (`{ AND: [projectScope(actor), { id: query.projectId }] }`, 404 `Project unavailable.`, id already lowercased by its zod schema) becomes `requireScopedProject` with the same select and message; the SADDD lookup keeps its own 404 `Monitoring scope unavailable.` and `sadddReleasable` keeps returning false, so both stay inline.
- **Task 2, `modules/analytics` and the S6 pair:** `dashboards.dto.ts` is a zod parse helper (CR 3.2: no `*.dto.ts`); `parseSadddQuery` and `parseDashboardQuery` move verbatim to `dashboards.helpers.ts`, joined by `suppressSmallCount` and `SMALL_CELL_THRESHOLD` from `descriptive-analytics.ts` (pure, no DI), so `evaluations/evaluation-metrics.ts` and `projects/project-overview-metrics.service.ts` repoint to `../dashboards/dashboards.helpers`. `AnalyticsController`, `AnalyticsService`, `descriptive-analytics.ts` and their tests move out of `modules/dashboards`, and `modules/analytics-insights` merges in, as one `AnalyticsModule` in `modules/analytics/` importing `DashboardsModule` (which exports `DashboardsService`); `app.module.ts` lists `AnalyticsModule` in place of `AnalyticsInsightsModule`; `insights-math.ts` becomes `analytics-insights.helpers.ts`; `c8-runtime.local.test.ts` is renamed for what it tests, keeping `PATHWAYS_C8_LOCAL_TESTS` because scripts set it. Effect: `modules/dashboards` then imports only `indicators` and `rules`, so the `dashboards <-> reports` pair and the longer cycles through `dashboards` disappear without moving `report-artifact.ts` (S6 ruling 2), and the recorded pair list in `import-boundary.test.ts` becomes `[]`. The wiring test and the compiled API boot in the gates cover the module change.
- **Task 3, `descriptive-analytics` split (F2 deferral):** the api file (435 lines) splits verbatim into `descriptive-analytics.helpers.ts` (the builder, about lines 21 to 189), `timeline-analytics.helpers.ts` (about 191 to 305) and `analytics-export.helpers.ts` (the CSV and table builders, about 307 to 435, plus `exportFormats`, `parseExportFormat` and `exportArtifact` from `analytics.service.ts`, which falls from 515 to about 460 lines; the moved logger keeps the context `AnalyticsService`). The three identical export header literals become one constant only after `descriptive-analytics.test.ts` pins each table's header.
- **Task 4, `role-overview.service.ts` (545 lines):** the eight transaction readers (`projects`, `myActivities`, `flaggedProof`, `submissions`, `proofQueue`, `approvalQueue`, `myExtensions`, `extensionQueue`, none uses `this`) become exported functions taking `tx` in `role-overview-work.service.ts` and `role-overview-queues.service.ts` (S1 ruling 7 pattern); the class keeps `alerts` and `read`.
- **Task 5, shared folder and status unions:** `monitoring/` has no place in CR 3.4. Move by `git mv`, names unchanged (everything goes through the barrel): the dashboard and SADDD remainder of `metric-contract.ts`, `action-counts.ts` and `role-overview.ts` (with `alertSeverities`) to `contracts/dashboards/`; `analytics-insights.ts` and `descriptive-analytics.ts` to `contracts/analytics/`, splitting the 558-line file verbatim into `descriptive-analytics.ts` (query and response, about lines 1 to 95), `survey-analytics.ts` (about 96 to 486) and `timeline-analytics.ts` (about 487 to 558) with `same-lines.mjs`; `overview-metrics.ts` and `project-map.ts` to `contracts/projects/` (S1 ruling 6); `metric-math.ts`, `metric-cell.ts` and `metric-fields.ts` to `metrics/` (`metric-fields.ts` stays out of the barrel, S3 ruling 3); `activity-extension.ts` to `contracts/activities/` unless S2b moved it (S2b Task 7 does, as `activityExtensionResponse`). After the `git mv`, repoint the relative imports that S3 and S4 left in `contracts/indicators/*` (`../../monitoring/metric-fields`, `../../monitoring/metric-cell`) and `contracts/beneficiaries/*` (`../../monitoring/metric-contract` for `sadddAgeBands`), and every remaining `monitoring/` relative import, with a typecheck of shared before the commit. The five copies of the stored project status union (`role-overview.ts:23`, `rules/rule-contract.ts:249`, `rules/rule-metrics.ts:188` and `:416`, api `descriptive-analytics.ts:238`) switch to `storedProjectStatuses` and `StoredProjectStatus`, after a test pins each schema's accepted values and its enum error text. SAD: the determinism checker's `packages/shared/src/monitoring/**/*.ts` glob follows to `contracts/analytics/**`, `contracts/dashboards/**`, `contracts/projects/project-map.ts`, `contracts/projects/overview-metrics.ts` and `metrics/**`, or the role silently stops reviewing them. Section 3.6 renames (`dashboardQuerySchema` to `dashboardQuery` and so on) are decided in the S7b plan, with a string-safe codemod like S3's and importer counts first.

### Part 2: web

- **Task 6, `lib/api/analytics.ts` and `lib/api/dashboards.ts`:** move `getMonitoringDashboard`, `getDashboardActionCounts`, `getRoleOverview`, `getSadddDashboard`, `getDescriptiveAnalytics`, `getSurveyAnalytics`, `getTimelineAnalytics`, the export and export preview methods and `getDashboard(role)` out of `pathways-client.ts`, plus the insights fetchers in `features/analytics/use-analytics-insights.ts`; every `pathways-client` mock factory that stubs one of them splits into a `@/lib/api/...` mock in the same commit, counted before and after (S7a Review Focus 1).
- **Task 7, `features/analytics` layout:** `components/`, `hooks/`, `analytics.reads.ts`, `analytics.utils.ts`, `analytics.copy.ts` with `move-modules.mjs` and `split-declarations.mjs`; the project map card stays in analytics (S1 kept its UI here).
- **Task 8, `analytics-dashboard.tsx` (1741 lines, MOD-06):** first move the private panels verbatim (`SurveyAnalyticsPanel` 138, `TimelineAnalyticsPanel` 88, `DescriptiveStatisticsTable` 71, `ChartPanel`, `UnavailableChart`) to `components/` and the constants (`analysisViews`, `visualizationTypes`, survey messages, `exportFormats`) to `analytics.copy.ts`; then extract the reads and state of the 1207-line `AnalyticsDashboard` into hooks, with characterization tests over `analytics-dashboard.test.tsx` (1690 lines, split by concern above 600) before any line moves.
- **Task 9, `features/dashboard`:** `role-dashboard.tsx` (691 lines) split the same way; its imports of `activity-detail-panel`, `activity-proof-dialog`, `project-utils` and `use-project-reads` go through the projects index (MOD-15 "dashboard reaches into `../projects/` internals"); `project-utils` and `use-project-reads` are `projects.utils` and `projects.reads` after S1b and the dashboard already imports them through the index; S7 may share the three `projects.read` list keys only where fetcher, permission and freshness match.
- **Task 10, surfaces and duplicates:** `features/analytics/index.ts` and `features/dashboard/index.ts`; add `'analytics'` and `'dashboard'` to `indexedFeatures` and `'@/features/analytics'` and `'@/features/dashboard'` to `optimizePackageImports` in `apps/web/next.config.ts`; the `/analytics` and `/dashboard` pages, `pinned-charts.tsx` (5 analytics imports) and `features/projects/indicators/components/project-indicators-workspace.tsx` (`use-monitoring-read`, left by S3) import through the indexes, with route First Load JS compared to Task 0 as in S7a Task 6. MOD-16: analytics and dashboard read keys used twice; `DashboardSeverity` in `types/pathways.ts` (F4b deferral); `statusTone` in `executive-dashboard.tsx` kept per vocabulary (F4b ruling 3).
- **Task 11, records** and **Task 12, gates** as S7a Tasks 7 and 8, with a smoke of `/dashboard` for each role, `/analytics` (every view and every export format), the pinned charts, the SADDD panel and the project map, and a check that `git ls-files 'apps/api/src/*.dto.ts'` lists only the five S8 DTO files and only `authorized-data.controller.ts` and `users.controller.ts` still hold `Application profile is required.'`. After merge, remove this plan and its index row.
