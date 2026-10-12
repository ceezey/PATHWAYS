# S2 Activities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the activities, activity extensions, proofs, milestones and evidence API its zod contracts, mappers and pure helpers, and split the 2479-line `activities.service.ts` into services that each own one responsibility, with no change to any route, status code, response body, audit row, permission decision, transaction boundary or SQL statement.

**Architecture:** S2 is split (ruling 1). This plan gives S2a in full (twelve tasks including baseline and gates) and S2b, the web client and feature components, as an outline at the end. S2a first adds contracts that accept exactly what class-validator accepted, proves each with a parity test against the DTO, then switches the routes to `ZodPipe` and deletes the DTOs; it then splits the controllers by purpose, moves the row mapper, pure helpers and tenant-scoped function modules out of the service verbatim, and finally splits the injectable service into one service per responsibility, retargeting the tests and seeds with codemods. Mechanical edits use one-off Node scripts under `.tmp/s2/` (gitignored, never committed) whose content is given in full. Every step below was dry-run on an exported copy of `4a5806d0` with the S1a outputs it consumes added from the S1 plan: the copy typechecked, linted and passed its api and shared suites after every task, and the outputs quoted below come from those runs.

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, NestJS 10.4.22, class-validator 0.14.4 on validator 13.15.26, class-transformer 0.5.1, zod 3.25.76, Prisma 6.19, Vitest 3.2, Biome 1.9.4, Next 15.5.14, Playwright.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.1 to 3.7 with roadmap row S2, 4, 6, 7, and 9 including the F1, F2, F3a, F3b, F4a, F4b and S1a dispositions) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-04, MOD-08 residue and MOD-11 for S2a; MOD-05, MOD-06, MOD-15, MOD-16 and MOD-17 for S2b).

## Rulings

Controller rulings for S2 (2026-10-12). Each was checked against local dev `4a5806d0` (F1 to F4b merged); S1a changes no activities file, so every count below holds after S1a merges, and Task 0 recounts them.

1. **Split into S2a and S2b.** The S2 row covers contracts, the api split, the web client and the feature components. The api half alone is fifteen class-validator DTO classes in two modules, a 2479-line service and three controllers in one file, which becomes about twenty files; the web half moves 20 activity, extension, evidence and proof methods out of `pathways-client.ts` (51 files reference them, 18 of the 49 `pathways-client` mock factories define one), restructures 39 activity files in the 78-file `features/projects` folder and splits four components over 700 lines. S2a (this plan, branch `refactor/s2a-activities`) takes the contracts and the api; S2b (outline below, branch `refactor/s2b-activities-web`) takes the web. S2a is the largest api slice (CR 3.7 names it so) and runs twelve tasks where S1a ran ten; each task ends green, so a reviewer can stop at any boundary. S2a needs only S1a; S2b needs S1b.
2. **Eight injectable services and four function modules.** `ActivitiesService` keeps the reads (`context`, `assignableOfficers`, `list`, `get`). Seven new injectable services take the rest by responsibility: `ActivityLifecycleService` (`create`, `update`, `transition`), `ActivityProgressService` (`recordProgress`, `recordOverdueExplanation`), `ActivityEvidenceService` (`listEvidence`, `downloadProof`), `ActivityProofsService` (`proofUploadLimits`, `reserveProof`), `ActivityProofFinalizeService` (`finalizeProofFile`), `ActivityReviewService` (`reviewUpdate`) and `ActivityMilestonesService` (`listMilestones`, `createMilestone`, `updateMilestone`). Every public method keeps its name and arguments, so no route, audit row or transaction changes. The private helpers become function modules that take the caller's `tx` (CR 7 risk row): `activity-access.service.ts` (`readScopedActivity`, `requireProjectActivity`, `requireActivity`, `requireActiveAssignment`), `activity-metrics.service.ts` (`readMetrics`, `readReached`, `readListMetrics`, `mapWithMetrics`), `activity-links.service.ts` (assignee, indicator and journey stage links) and `activity-budget.service.ts` (`saveActivityBudget`). They keep the `.service.ts` name so the organization isolation route still covers their tenant-scoped writes. Cost if wrong: the constructors changed in 11 test files and the calls in 4 seed files; the codemod `retarget-service.mjs` does it and the suite proves it.
3. **Controllers split by purpose; fixed GET segments stay first.** `activities.controller.ts` held three controllers. It becomes `activities.controller.ts` (reads, lifecycle and the fixed segments `proof-upload-limits`, `context`, `assignable-officers`), `activity-updates.controller.ts` (progress, overdue explanation, proof reserve, finalize and review), `activity-proofs.controller.ts` (inspection and download), `activity-milestones.controller.ts` and `activity-evidence.controller.ts`. Express matches in registration order, so a fixed GET segment registered after `GET :activityId` would be captured by it; `ActivitiesController` stays first in the module and holds every fixed segment, and Task 4 pins the route table, the order and the three fixed routes over HTTP before the split.
4. **Optional means nullish, with two recorded exceptions.** `@IsOptional()` skipped every rule for `null`, so each optional field is `.nullish()` and `null` still reaches the service where it did. Two fields become `.optional()` because `null` already failed inside the service: `budgetAllocation: null` reached `new Prisma.Decimal(null)` (400 `Activity budget must be a valid non-negative PHP amount.`, or 403 for an actor without budget authority) and `indicatorIds: null` crashed `resolveIndicators` with a TypeError (500); both now answer 400 at the pipe. The parity table pins both as the only disagreements besides the F3b prototype keys. No client sends these bodies: the web form sends `undefined` for a missing budget and an array for the indicators.
5. **Field rules follow the DTO field by field.** Only `code`, `targetBeneficiaries` and `budgetAllocation` had a `@Transform`, so `title`, `description` and the milestone title are not trimmed before the length rule: a title of three spaces is valid and the service stores the trimmed empty string, as before (pinned in the parity table). `code` reuses S1a's `recordCodeInput`, which applies the same trim, upper-case and 2 to 40 rule. `requestedEndDate` of an extension keeps its extra `YYYY-MM-DD` shape rule; the extension versions use the strict ISO rule (`IsISO8601({ strict: true })`) while the activity versions use the plain one (`IsDateString()`), as the DTOs did.
6. **Two shared helpers join `field-schemas.ts`.** `countInput(max)` and `pesoAmountInput` were written inline in S1a's `project-requests.ts` and are needed again here (`targetBeneficiaries`, `budgetAllocation`); Task 1 adds them to `contracts/common/field-schemas.ts` and makes `project-requests.ts` use them (its contract tests and the S1a HTTP test guard that edit). Cost if wrong: two helper names in the barrel; the alternative is two more copies of the same regular expression.
7. **Evidence constants live in shared; the storage deadline stays in the api.** `activityEvidenceContentTypes`, `ActivityEvidenceContentType` and `MAX_ACTIVITY_EVIDENCE_FILES` are exported from `packages/shared/src/contracts/activities/activity-evidence.ts`, the path the S4 plan consumes. `PROOF_STORAGE_DEADLINE_MS` is an api timing constant and moves to `activity-proof.helpers.ts` with `evidenceExtension`, `activityEvidenceType` and `proofDeclarations`. `activities.dto.ts` keeps only `JourneyStageInputDto` and `SaveJourneyConfigurationDto`, which slice S4 converts; Task 0 of S4 checks for them.
8. **Response contracts are types only and annotate the code.** `activity-responses.ts` types the mapper (`mapActivity` returns `ActivityRecordResponse`, `mapActivityListItem` returns `ActivityListItemRecordResponse`) and every public service method that returns a mapped shape, so a drift fails `pnpm typecheck`; nothing parses them at runtime (CR 3.6). The overdue category is `z.string()` because the column is text. There is no milestone response contract: the routes return raw Prisma rows, no web code calls them, and a schema that nothing checks would document a shape that can drift. `activityExtensionSchema` stays in `packages/shared/src/monitoring/activity-extension.ts`: the web parses it at runtime, and S2b decides its place.
9. **`sourceMutationAcknowledgement` joins `contracts/common`.** Create, update, transition, review and finalize answer either the new record with a receipt or the receipt alone on a replay; the receipt shape was written by hand in the web (`SourceReplayAcknowledgement`). `contracts/common/source-mutation-acknowledgement.ts` exports the schema and `SourceMutationAcknowledgement`; S2b, S3 and S6 consume it.
10. **Kernel adoption, bounded by behavior.** `requestIdentity` replaces the guard copy in the six controllers of the two modules. `requireScopedProjectRow` replaces the inline project lookup in `context` and in both branches of `listEvidence` (same `where`, same select, no join strategy, same 404 text). `list` and `get` keep their inline lookups because they load with `relationLoadStrategy: 'join'`, which the helper does not pass; `private-proof-inspection.service.ts` keeps its lookup because it answers its own `unavailable()` error; the extension `requireActivity` keeps its activity-level scope. The assignment check was copied three times (`requireActiveAssignment`, an inline copy in `recordProgress`, an inline copy in the extension `request`); the two inline copies now call the shared function, after Task 6 Step 1 pins their 403 text. The one `Prisma.TransactionClient` annotation in the two modules becomes `Tx`.
11. **Test seams.** The DTO validation tests (`plainToInstance` plus `validate`) become contract tests with the same inputs; the three `importOriginal` mocks of `private-inspection-reader` that F3b left (two activities tests and the inspection service test) become injected fake factories; `activities.service.test.ts`, which after the DTO tests left held only pure helper tests, becomes `activities.helpers.test.ts`. The inspection file extension table is derived from `evidenceExtension` (the existing seven-type test pins it).
12. **One logic-shaped edit.** The typed reservation union needs a value test: `if ('acknowledgement' in reservation)` becomes `if (reservation.acknowledgement)` in `activity-proofs.service.ts`. The two are equivalent because only the replay branch carries the key, and its value is always an object. Every other moved line is verbatim; `.tmp/s2/same-lines.mjs` proves it before Biome formats.
13. **SAD routing needs no edit.** The new `*.service.ts`, `*.controller.ts` and `*.mapper.ts` files fall under the existing globs (the mapper glob is S1a's); Task 11 reads the manifest to confirm.
14. **Spec facts corrected by the baseline:** the audit's 2527 lines for `activities.service.ts` are 2479 at `4a5806d0`; `activities.dto.ts` holds twelve classes (ten become contracts, two stay for S4) and `activity-extensions.dto.ts` three; milestones have no web screen, so only the API tests and the replay cover them; the extension module is a separate Nest module and stays one (its service shrinks to 378 lines by moving the row mapper and three pure helpers out); `lib/services/pathways-client.ts` is 2596 lines after F4b.
15. Cross-plan: S2 runs before S3 and depends on none of S3's names (no `IndicatorResponse`, `indicatorResponse`, `monitoring/metric-cell` or `metric-fields` appears here); S3's codemod renames by import, so any S2 file that imports an old indicator name is rewritten there. Cost if wrong: an S2 file naming an S3 export fails typecheck until S3 merges.
16. Cross-plan: S2b's only web input from S1b is `requestSourceMutation<T>(path, method: 'POST' | 'PATCH', body: Record<string, unknown>, context: SourceMutationContext | undefined, parse: (value: unknown) => T): Promise<SourceMutationResult<T>>` exported by S1b Task 1 from `lib/api/core/source-mutation-request.ts`; the web `SourceReplayAcknowledgement` (`replayed: true`) stays a subtype of the new `SourceMutationAcknowledgement` (`replayed: boolean`). S2 appends only `countInput` and `pesoAmountInput` to the S1 `field-schemas.ts`; S5 appends two more. Cost if wrong: S2b Task 0 stops, or the barrel carries a duplicate helper.
17. Pre-flight (2026-10-12): Task 0 grep expects the 18 existing api hits, case rows use a hex-letter UUID, prose counts corrected, semicolon comments rewritten, the Task 6 progress test strengthens the existing one (counts from Task 6 on minus 1).
18. Cross-plan (S1b): S1b already put the route pages and `role-dashboard.tsx` behind `features/projects/index.ts` and its surface rule covers the whole feature, so S2b creates `activities/index.ts` as an internal sub-index that the feature index re-exports from, repoints those export lines, adds no rule, and reads `projects.reads.ts` for the old `use-project-reads.ts`. Cost if wrong: S2b writes a second rule or a deep import that fails the S1b rule.

## Interfaces assumed from earlier slices

S2a assumes S1a, merged on local dev. Task 0 stops if any of these is missing.

- From `@pathways/shared` (`packages/shared/src/contracts/common/field-schemas.ts`, S1a Task 1): `lengthString(min: number, max: number)`, `uuidString`, `isoDateString`, `strictIsoDateString`, `trimmedInput<T extends z.ZodTypeAny>(schema: T)`, `hasUniqueItems(values: readonly unknown[]): boolean`, `validatorLength(value: string): number`.
- From `@pathways/shared` (`packages/shared/src/contracts/projects/project-requests.ts`, S1a Task 2): `recordCodeInput`, and the file text that Task 1 edits (it declares `pesoAmountPattern` and builds `targetBeneficiaries` and `projectBudget` inline).
- `requestIdentity(request: AuthenticatedRequest): ApplicationIdentity` from `apps/api/src/common/authz/request-identity.ts` (S1a Task 7).
- The line `'apps/api/src/**/*.mapper.ts',` in the beneficiary-privacy-guardian globs of `scripts/sad/check.ts` (S1a Task 8).
- The kernel, unchanged since F3a and F3b: `type Tx` (`common/prisma/transaction.ts`), `requireScopedProjectRow<const S extends Prisma.ProjectSelect>(tx, actor, projectId, select)` and `projectDateFields` (`common/authz/scoped-project.ts`), `withAuthorizedOperation`, `writeAuditLog`, `readApplicationProfile`, `class ZodPipe<S extends z.ZodTypeAny>` (`common/validation/zod-pipe.ts`), `PRIVATE_STORAGE_FACTORIES` and `PrivateStorageFactories` (`modules/storage/private-storage-factories.ts`).

S2b assumes these web exports (names from the F4b disposition and the S1b outline; S2b Task 0 confirms them): `PathwaysClientError`, `requestFoundation`, `requestFoundationResponse` from `apps/web/src/lib/api/core/request.ts`; `captureRequestOwner` from `apps/web/src/lib/api/core/request-owner.ts`; `useAuthorizedRead` from `apps/web/src/hooks/use-authorized-read.ts`; `apps/web/src/lib/format/{date,percent,plural,tone}.ts`; from S1b, `requestSourceMutation<T>(path, method, body, context, parse)` in `apps/web/src/lib/api/core/source-mutation-request.ts` and the `features/projects` folder layout with its `index.ts`.

## Produced for later sub-projects

- Shared contracts, all exported from `@pathways/shared`: `createActivityRequest`, `updateActivityRequest`, `transitionActivityRequest`, `recordActivityProgressRequest`, `reserveActivityProofRequest`, `recordOverdueExplanationRequest`, `reviewActivityUpdateRequest`, `saveMilestoneRequest`, `updateMilestoneRequest`, `createActivityExtensionRequest`, `verifyActivityExtensionRequest`, `decideActivityExtensionRequest` (each with its `type` of the same name in PascalCase), `activityEvidenceFile` with `ActivityEvidenceFile`, `activityEvidenceContentTypes`, `ActivityEvidenceContentType`, `MAX_ACTIVITY_EVIDENCE_FILES`, the response schemas `activityResponse`, `activityMutationResponse`, `activityListItemResponse`, `activityContextItemResponse`, `assignableOfficerResponse`, `activityEvidenceListResponse`, `activityProofUploadLimitsResponse`, `activityProofReservationResponse`, `activityProofFinalizeResponse`, `activityCapabilitiesResponse` with their types, `ActivityRecordResponse`, `ActivityListItemRecordResponse`, `sourceMutationAcknowledgement` with `SourceMutationAcknowledgement`, and the helpers `countInput(max: number)` and `pesoAmountInput`.
- Api: `PROOF_STORAGE_DEADLINE_MS`, `evidenceExtension`, `activityEvidenceType` and `proofDeclarations` from `apps/api/src/modules/activities/activity-proof.helpers.ts` (the beneficiary media service imports them from there; S4 leaves those lines alone); `requireActiveAssignment(tx: Tx, actor: ApplicationIdentity, activity: { id: string; projectId: string })` and `requireActivity(tx, actor, projectId, activityId)` from `activity-access.service.ts`; `ActivitiesModule` providing the eight services and `PrivateProofInspectionService`.
- S6 note: the two activity expense dialogs stay in `features/projects` (S2b does not move them), so S6b claims them for `features/projects/budget/`.

## Global Constraints

- Behavior-preserving: no route, status code, response body, audit row, permission decision, transaction boundary or SQL statement changes. The only accepted differences are 400 message wording on the activity, milestone and extension routes, the four prototype-key bodies of F3b ruling 3 per contract, and the two bodies of ruling 4.
- Direction (CR 3.1): `apps/api/src/common/**` never imports `apps/api/src/modules/**` (non-test files); `common/import-boundary.test.ts`, `apps/web/src/import-direction.test.ts` and `packages/shared/src/package-import-boundary.test.ts` must pass at every commit. S2a adds no folder and no boundary.
- Production api code uses relative imports only; `@app/` is a Vitest alias used by tests.
- File moves use `git mv` and are committed separately from logic edits. Splits are verbatim: `.tmp/s2/same-lines.mjs` must print the expected result before Biome formats the new files.
- Split services take the caller's `tx` where they are function modules; the injectable services open their transaction through `withAuthorizedOperation` exactly where the original methods did, and `finalizeProofFile` keeps its storage verification between its two operations.
- Every name exported through `packages/shared/src/index.ts` is unique (TS2308 otherwise).
- Kebab-case file names that describe purpose; comments are one sentence, no emojis; docs prose has no em dashes and no double hyphen.
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. New untracked files need `git add -N` before `git diff --name-only` lists them.
- `pnpm typecheck` rewrites `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` before every commit.
- After removing code, delete any import name left with no use (Biome 1.9 recommended rules do not flag unused imports); `.tmp/s2/imports.mjs prune` does it.
- Do not type `\u` escapes for characters into source; build them with `String.fromCharCode` or `String.fromCodePoint`.
- `git ls-files` with `':!*.test.ts'` pathspecs returns nothing in this Git for Windows setup; `git grep` pathspecs work. Git Bash rewrites command arguments that contain `//`, so the codemods read such text from option files, never from arguments.
- One-off scripts live in `.tmp/s2/` (gitignored) and are never committed; `.tmp/` also holds logs. Create each script with the editor, not a shell heredoc, because Bash eats backslashes and backticks.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work in `C:\PATHWAYS` on branch `refactor/s2a-activities`; no new worktree. All paths are relative to `C:\PATHWAYS`. Do not push.
- Do not touch migrations, `.env` files, review evidence or `apps/web`; under `apps/api/prisma` only the seed edits of Tasks 2, 7 and 8 change.

## Review Focus

1. A JSON `null` on an optional activity, transition, milestone or reservation field (`code`, `description`, `activityType`, `timelineOverrideJustification`, `targetBeneficiaries`, `journeyStageId`, `reason`, `targetDate`, `completionDate`, `beneficiariesReachedThisSession`) must still be accepted and reach the service as `null`, because `@IsOptional()` let it through; `budgetAllocation: null` and `indicatorIds: null` are the two recorded rejections. Task 1 pins both in the contract tests and the parity table; Task 2 pins them over HTTP.
2. A client that retries a create, update, transition or review with the same `clientMutationId` across the deploy must replay, not conflict, because the stored and the new canonical bodies must match. Task 1 pins equal `sourceMutationBody` output for the DTO and contract routes, with padded, upper-case and `null` fields.
3. `GET proof-upload-limits`, `GET context` and `GET assignable-officers` must still reach their handlers, not `GET :activityId`, after the controller split, and no route may lose its permission. Task 4 pins the 20-route table and the order, and the five GET routes over HTTP, before the split.
4. An evidence file named with a slash or a backslash, longer than 128 characters, of an unknown content type, of zero bytes, over 100 MiB or with an upper-case digest must be refused at the pipe, and the configured per-file limit must still answer the coded 400 `PROOF_FILE_TOO_LARGE` from the service before any read. Task 1 pins the pipe cases; the existing proof tests keep the coded ones through Tasks 7 and 8.
5. `finalizeProofFile` must read its target in one operation, verify the stored object outside any transaction, and commit in a second operation, in that order, after it moves to its own service. Task 8 Step 1 adds the ordering test before the move.

## Out of S2a (recorded for later sub-projects)

- Web client, feature folder, hand-written web types and the dead proof upload code (MOD-05, MOD-06, MOD-15, MOD-16 and MOD-17 for activities): S2b, outlined at the end.
- The 18 controllers elsewhere that still repeat the request identity guard and the 40 direct `Prisma.TransactionClient` annotations left in api production code: their slices.
- `apps/api/src/modules/activities/activities.dto.ts` (the two journey classes), the `class-validator` dependency and `field-schemas-parity.test.ts`: S4 deletes the classes, S8 the dependency.
- `private-proof-inspection.service.ts` keeps its 398 lines: it is one responsibility under the 500-line flag, and the audit does not name it.
- Calendar-date regex unification (the F2 deferral): the extension contract's single `YYYY-MM-DD` shape rule is the DTO's `Matches` rule kept verbatim, so S2a adds no new date pattern and leaves the unification to W1.

---

### Task 0: Branch setup and baseline

**Files:**
- Create: `docs/superpowers/plans/2026-10-12-modularization-s2-activities.md` (this plan)
- Modify: `docs/index.md` (section 1.6 plan row)

- [ ] **Step 1: Confirm local dev contains F4b and S1a, and create the branch**

```bash
cd /c/PATHWAYS
git status --short
git checkout dev
git log --oneline dev | grep -m1 "Merge refactor/f4b-web-helpers into dev"
git log --oneline dev | grep -m1 "Merge refactor/s1a-projects-core into dev"
test -f packages/shared/src/contracts/common/field-schemas.ts && test -f packages/shared/src/contracts/projects/project-requests.ts && test -f apps/api/src/common/authz/request-identity.ts && echo "S1a outputs present"
grep -c "'apps/api/src/\*\*/\*\.mapper\.ts'," scripts/sad/check.ts
grep -c "pesoAmountPattern" packages/shared/src/contracts/projects/project-requests.ts
ls docs/superpowers/plans/
git checkout -b refactor/s2a-activities
pnpm install --frozen-lockfile
mkdir -p .tmp/s2
```

Expected: clean status, the two merge commits, `S1a outputs present`, `1`, `2`, install succeeds. If a merge commit or an S1a output is missing, stop and report: S2a builds on F4b and S1a. If `pesoAmountPattern` does not print `2`, S1a's `project-requests.ts` differs from its plan: stop and report before Task 1 edits it. If `ls` lists an S1 plan file whose removal step did not run, Step 3 leaves it (it holds the S1b outline) and removes nothing.

- [ ] **Step 2: Record the baseline**

```bash
pnpm --filter @pathways/shared build
pnpm typecheck && pnpm test 2>&1 | grep -E "Tests +[0-9]+"
pnpm sad:test 2>&1 | grep -E "Tests +[0-9]+"
pnpm docs:check 2>&1 | tail -3
pnpm --filter @pathways/web build > .tmp/s2/web-build-baseline.log 2>&1; echo "exit $?"
grep -E "Middleware" .tmp/s2/web-build-baseline.log
git hash-object apps/api/src/modules/activities/activities.service.ts apps/api/src/modules/activities/activities.controller.ts apps/api/src/modules/activities/activities.dto.ts apps/api/src/modules/activities/activities.module.ts apps/api/src/modules/activity-extensions/activity-extensions.service.ts apps/api/src/modules/activity-extensions/activity-extensions.controller.ts apps/api/src/modules/activity-extensions/activity-extensions.dto.ts apps/api/src/modules/activities/private-proof-inspection.service.ts apps/api/prisma/local-demo-stage-activities.ts apps/api/prisma/local-demo-seed.ts apps/api/prisma/defense-demo-seed.ts
git grep -c "new ActivitiesService(" -- apps/api | awk -F: '{n += $2} END {print n}'
git grep -c "^export class" -- apps/api/src/modules/activities/activities.dto.ts apps/api/src/modules/activity-extensions/activity-extensions.dto.ts
git grep -n "Prisma.TransactionClient" -- apps/api/src/modules/activities apps/api/src/modules/activity-extensions ':!*.test.ts' | wc -l
git grep -lE "Application profile is required\.'" -- apps/api/src/modules/activities apps/api/src/modules/activity-extensions | wc -l
git grep -nwE "createActivityRequest|activityEvidenceFile|activityEvidenceContentTypes|MAX_ACTIVITY_EVIDENCE_FILES|activityResponse|ActivityRecordResponse|sourceMutationAcknowledgement|countInput|pesoAmountInput|createActivityExtensionRequest" -- packages apps/api | wc -l
git grep -nwE "createActivityRequest|activityEvidenceFile|activityEvidenceContentTypes|MAX_ACTIVITY_EVIDENCE_FILES|activityResponse|ActivityRecordResponse|sourceMutationAcknowledgement|countInput|pesoAmountInput|createActivityExtensionRequest" -- packages | wc -l
wc -l apps/api/src/modules/activities/activities.service.ts apps/api/src/modules/activity-extensions/activity-extensions.service.ts apps/api/src/modules/activities/private-proof-inspection.service.ts
git checkout -- apps/web/next-env.d.ts
```

Expected: typecheck clean; write down each package's passing and skipped test counts (config, shared, imports, api, web), the sad count, the docs check failure count, the web build exit code (0) and the `Middleware` size (F4b recorded 102 kB). Later tasks compare against these (`B_shared`, `B_api`, `B_web`, `B_sad`, `M0`). The hashes print, in order: `ecb69df4ddd5004b564ea7758d326c8e1e02e2f2`, `25a1bc9a6fab3559d37566e63010dc0e526a12d3`, `927be24e7bb94f0712f89be91471480a02341187`, `10bb8405a11c3532b2f7816c7f96abf975c778e2`, `d7218fdd30b9ba8d102dde125c4cfb596c469142`, `0398e24caea98c97d91189b98f8ef4d6ebc7ad21`, `ce9f116503c62c41fb7832fb0350e6139b297398`, `d0837658d81a020e0d6807c1b62badee0b506218`, `274f043c37fb1b18239709c5d8e05d0bafe89cf0`, `0e16e2c805e62f06279bd16b1277997a236d7bfc`, `dd01d93182bc0fbb73d2b6bfd55dcbbc1a1d1f3b`; the counts print `18`, then `12` and `3` on two lines, `1`, `2`, `18`, `0`; the `18` are existing api definitions or uses that S2a moves (`activityEvidenceContentTypes` and `MAX_ACTIVITY_EVIDENCE_FILES` in `activities.dto.ts`, `activities.service.ts`, `private-proof-inspection.service.ts` and `beneficiary-media.dto.ts`) and the `0` is the packages-only grep; the line counts print `2479`, `454` and `398`. If any differs, stop and report: the anchors and counts below were taken at `4a5806d0`, and S1a changes none of these files.

- [ ] **Step 3: Add the plan and commit**

The controller has saved this plan as `docs/superpowers/plans/2026-10-12-modularization-s2-activities.md`.

In `docs/index.md` section 1.6, add as the last row of the table:

```markdown
| [S2 activities plan](superpowers/plans/2026-10-12-modularization-s2-activities.md) | 2026-10-12-modularization-s2-activities.md | 2026-10-12 | S2 of the codebase modularization: S2a activity, proof, milestone and extension contracts, controller split, mapper and helpers, function modules and the service split; S2b outline | In progress |
```

```bash
git add docs/superpowers/plans/2026-10-12-modularization-s2-activities.md docs/index.md
pnpm docs:check 2>&1 | tail -3
git commit -m "docs: add the S2 activities plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Step 2 baseline.

- [ ] **Step 4: Create the shared codemod tools**

Create each file with the editor (not a shell heredoc) and keep the text exactly. `.tmp/s2/` is gitignored.

Create `.tmp/s2/move-blocks.mjs`:

```js
// Moves line blocks out of a file into new files, or deletes them, by exact first and last lines.
// Usage: node move-blocks.mjs <plan.mjs>
// The plan's default export is one object or an array of them:
// { source, moves: [{ to, header, footer, dedent, replacements, blocks: [{ first, last, dedent }] }], sourceReplacements }
// A block's dedent (spaces removed from the start of its lines) overrides the move's.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const plans = [].concat((await import(pathToFileURL(resolve(process.argv[2])).href)).default)
const isComment = (line) => /^\s*(\/\/|\/\*|\*)/.test(line)

const replaceAll = (text, replacements = []) => {
  for (const [from, to, count] of replacements) {
    const found = text.split(from).length - 1
    if (found !== count) throw new Error(`Expected ${count} of ${JSON.stringify(from)}, found ${found}`)
    text = text.replaceAll(from, to)
  }
  return text
}

for (const plan of plans) {
  let lines = readFileSync(plan.source, 'utf8').split('\n')

  // Cuts one block and returns its lines; a leading comment run goes with it.
  const cut = ({ first, last }) => {
    const starts = lines.flatMap((line, index) => (line === first ? [index] : []))
    if (starts.length !== 1) throw new Error(`Expected one line ${JSON.stringify(first)}, found ${starts.length}`)
    let start = starts[0]
    const end = lines.indexOf(last, start)
    if (end < 0) throw new Error(`Last line not found after ${first.trim()}: ${last}`)
    while (start > 0 && isComment(lines[start - 1])) start--
    const blank = lines[end + 1] === '' ? 1 : 0
    const block = lines.slice(start, end + 1)
    lines = [...lines.slice(0, start), ...lines.slice(end + 1 + blank)]
    return block
  }

  for (const move of plan.moves) {
    const blocks = move.blocks.map((spec) => {
      const block = cut(spec)
      const pad = ' '.repeat(spec.dedent ?? move.dedent ?? 0)
      console.log(`cut ${block.length} lines from ${spec.first.trim()}`)
      return block.map((line) => (line.startsWith(pad) ? line.slice(pad.length) : line)).join('\n')
    })
    if (!move.to) continue
    const text = replaceAll(`${move.header ?? ''}${blocks.join('\n\n')}\n${move.footer ?? ''}`, move.replacements)
    mkdirSync(dirname(move.to), { recursive: true })
    writeFileSync(move.to, text)
    console.log(`${move.to}: ${text.split('\n').length} lines`)
  }
  const text = replaceAll(lines.join('\n'), plan.sourceReplacements)
  writeFileSync(plan.source, text)
  console.log(`${plan.source}: ${text.split('\n').length} lines`)
}
```

Create `.tmp/s2/imports.mjs`:

```js
// Edits named imports: add names to a module's import, move names between modules, or prune names the file no longer uses.
import { readFileSync, writeFileSync } from 'node:fs'

const [command, file, ...rest] = process.argv.slice(2)
const pattern = /^import\s+(type\s+)?\{([^}]*)\}\s*from\s*'([^']+)'\n/gm
let text = readFileSync(file, 'utf8')

// Named items of one statement, each carrying its own type marker.
const items = (typeOnly, list) =>
  list
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((item) => (typeOnly && !item.startsWith('type ') ? `type ${item}` : item))
const local = (item) => item.replace(/^type\s+/, '').split(/\s+as\s+/).at(-1)
const render = (list, module) =>
  list.length === 0
    ? ''
    : list.every((item) => item.startsWith('type '))
      ? `import type { ${list.map((item) => item.slice(5)).join(', ')} } from '${module}'\n`
      : `import { ${list.join(', ')} } from '${module}'\n`

// Adds names to a module's statement, or returns null when the file has none.
const addTo = (source, module, wanted) => {
  let found = false
  const next = source.replace(pattern, (whole, type, list, from) => {
    if (from !== module || found) return whole
    found = true
    const current = items(type, list)
    return render([...current, ...wanted.filter((name) => !current.includes(name))], module)
  })
  return found ? next : null
}

if (command === 'add') {
  const [module, ...names] = rest
  const wanted = names.map((name) => name.replace(/^type:/, 'type '))
  const next = addTo(text, module, wanted)
  if (next !== null) text = next
  else {
    const matches = [...text.matchAll(pattern)]
    const end = matches.length ? matches.at(-1).index + matches.at(-1)[0].length : 0
    text = text.slice(0, end) + render(wanted, module) + text.slice(end)
  }
} else if (command === 'move') {
  const [from, to, ...names] = rest
  const hasTarget = [...text.matchAll(pattern)].some((match) => match[3] === to)
  let moved = []
  text = text.replace(pattern, (whole, type, list, source) => {
    if (source !== from) return whole
    const current = items(type, list)
    moved = current.filter((item) => names.includes(local(item)))
    if (moved.length !== names.length) throw new Error(`${file}: ${from} lacks ${names.join(', ')}`)
    const kept = render(
      current.filter((item) => !moved.includes(item)),
      from,
    )
    return hasTarget ? kept : kept + render(moved, to)
  })
  if (!moved.length) throw new Error(`${file}: no import from ${from}`)
  if (hasTarget) text = addTo(text, to, moved)
} else if (command === 'prune') {
  // Code outside the import statements, with quoted strings blanked so a name in a string literal is not a use.
  const code = text.replace(pattern, '').replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''")
  const used = (item) => new RegExp(`\\b${local(item).replace(/\$/g, '\\$')}\\b`).test(code)
  const removed = []
  text = text.replace(pattern, (_whole, type, list, from) => {
    const all = items(type, list)
    removed.push(...all.filter((item) => !used(item)).map(local))
    return render(all.filter(used), from)
  })
  console.log(`${file}: pruned ${removed.length ? removed.join(', ') : 'nothing'}`)
} else throw new Error(`Unknown command ${command}`)
writeFileSync(file, text)
```

Create `.tmp/s2/replace-exact.mjs`:

```js
// Applies text replacements to files and fails unless each one matches the expected number of times.
// Usage: node replace-exact.mjs <edits.mjs>   (default export: [{ file, edits: [[from, to, count], ...] }]; from is a string or a RegExp)
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const plans = (await import(pathToFileURL(resolve(process.argv[2])).href)).default
for (const { file, edits } of plans) {
  let text = readFileSync(file, 'utf8')
  for (const [from, to, count] of edits) {
    const pattern = from instanceof RegExp ? new RegExp(from.source, from.flags.replace('g', '') + 'g') : null
    const found = pattern ? (text.match(pattern) ?? []).length : text.split(from).length - 1
    if (found !== count) throw new Error(`${file}: expected ${count} of ${from}, found ${found}`)
    text = pattern ? text.replace(pattern, to) : text.replaceAll(from, to)
  }
  writeFileSync(file, text)
  console.log(`${file}: ${edits.length} edits`)
}
```

Create `.tmp/s2/same-lines.mjs`:

```js
// Fails unless the new files hold the original files' non-import lines, ignoring order, indentation, blanks and export keywords.
// Usage: node same-lines.mjs <original...> -- <new...> [--opts options.mjs]
// The options module's default export may hold:
//   both:    [[from, to], ...]  rewrites both sides before comparing (for example ['this.', ''])
//   renames: [[from, to], ...]  rewrites the new files only, for a rename the split made on purpose
//   more:    [line, ...]        trimmed lines the new files may hold more often than the originals
//   fewer:   [line, ...]        trimmed lines the new files may hold less often than the originals
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const optsAt = args.indexOf('--opts')
const opts = optsAt < 0 ? {} : (await import(pathToFileURL(resolve(args[optsAt + 1])).href)).default
const names = optsAt < 0 ? args : args.slice(0, optsAt)
const split = names.indexOf('--')
const originals = names.slice(0, split)
const files = names.slice(split + 1)
const both = opts.both ?? []
const renames = opts.renames ?? []
const more = new Set(opts.more ?? [])
const fewer = new Set(opts.fewer ?? [])
const start = /^(?:\/\/|\/\*\*|export\s|const\s|let\s|function\s|async\s|class\s|type\s|interface\s|@|private\s|constructor)/

// Trimmed declaration lines after the import block, with rewrites applied and export keywords dropped.
const body = (file, extra) => {
  const lines = readFileSync(file, 'utf8').split('\n')
  return lines
    .slice(lines.findIndex((line) => start.test(line)))
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => both.reduce((text, [from, to]) => text.replaceAll(from, to), line))
    .map((line) => extra.reduce((text, [from, to]) => text.replaceAll(from, to), line))
    .map((line) => line.replace(/^export /, ''))
}
const count = (lines) => lines.reduce((map, line) => map.set(line, (map.get(line) ?? 0) + 1), new Map())
const before = count(originals.flatMap((file) => body(file, [])))
const after = count(files.flatMap((file) => body(file, renames)))
const problems = []
for (const [line, n] of before) {
  const found = after.get(line) ?? 0
  if (found !== n && !(found < n && fewer.has(line)) && !(found > n && more.has(line)))
    problems.push(`original ${n}x, new ${found}x: ${line}`)
}
for (const [line, n] of after) if (!before.has(line) && !more.has(line)) problems.push(`new only ${n}x: ${line}`)
console.log(problems.length ? problems.join('\n') : `same lines: ${[...before.values()].reduce((a, b) => a + b, 0)}`)
process.exitCode = problems.length ? 1 : 0
```

Create `.tmp/s2/append-argument.mjs`:

```js
// Renames a call and appends one argument to every call of it, matching each call's closing parenthesis by depth.
// Usage: node append-argument.mjs <file> <call> <renamed-call> <argument>
// Example: node append-argument.mjs service.ts "this.mapWithMetrics(" "mapWithMetrics(" "this.env.BUSINESS_TIME_ZONE"
import { readFileSync, writeFileSync } from 'node:fs'

const [file, call, renamed, argument] = process.argv.slice(2)
let text = readFileSync(file, 'utf8')
let at = 0
let calls = 0
for (;;) {
  const start = text.indexOf(call, at)
  if (start < 0) break
  // Walk to the matching closing parenthesis, skipping quoted text.
  let depth = 0
  let end = -1
  let quote = ''
  for (let index = start + call.length - 1; index < text.length; index++) {
    const char = text[index]
    if (quote) {
      if (char === '\\') index++
      else if (char === quote) quote = ''
    } else if (char === "'" || char === '"' || char === '`') quote = char
    else if (char === '(') depth++
    else if (char === ')' && --depth === 0) {
      end = index
      break
    }
  }
  if (end < 0) throw new Error(`${file}: no closing parenthesis for the call at ${start}`)
  const inner = text.slice(start + call.length, end)
  const extra = inner.trimEnd().endsWith(',') ? ` ${argument},` : `, ${argument}`
  const rewritten = renamed + inner.trimEnd() + extra + inner.slice(inner.trimEnd().length) + ')'
  text = text.slice(0, start) + rewritten + text.slice(end + 1)
  at = start + rewritten.length
  calls++
}
writeFileSync(file, text)
console.log(`${file}: ${calls} calls of ${call.trim()} rewritten`)
```

Create `.tmp/s2/retarget-service.mjs`:

```js
// Points tests and seeds at the split activity services: each `new ActivitiesService(...)` construction is followed by one
// construction per split service whose listed methods the file calls on that variable, and those calls move to the new variable.
// Usage: node retarget-service.mjs <file> <method,method,...>
//   Only the listed methods move. A construction left with no calls is removed; one that stays keeps its arguments, except
//   that the reads service takes the first argument alone once its own methods are listed.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const services = [
  { name: 'ActivitiesService', module: './activities.service', variable: null, args: 1, methods: ['context', 'assignableOfficers', 'list', 'get'] },
  { name: 'ActivityLifecycleService', module: './activity-lifecycle.service', variable: 'lifecycleService', args: 1, methods: ['create', 'update', 'transition'] },
  { name: 'ActivityProgressService', module: './activity-progress.service', variable: 'progressService', args: 1, methods: ['recordProgress', 'recordOverdueExplanation'] },
  { name: 'ActivityEvidenceService', module: './activity-evidence.service', variable: 'evidenceService', args: 2, methods: ['listEvidence', 'downloadProof'] },
  { name: 'ActivityProofsService', module: './activity-proofs.service', variable: 'proofsService', args: 2, methods: ['proofUploadLimits', 'reserveProof'] },
  { name: 'ActivityProofFinalizeService', module: './activity-proof-finalize.service', variable: 'finalizeService', args: 3, methods: ['finalizeProofFile'] },
  { name: 'ActivityReviewService', module: './activity-review.service', variable: 'reviewService', args: 1, methods: ['reviewUpdate'] },
  { name: 'ActivityMilestonesService', module: './activity-milestones.service', variable: 'milestonesService', args: 1, methods: ['listMilestones', 'createMilestone', 'updateMilestone'] },
]

const [file, list] = process.argv.slice(2)
const moving = new Set(list.split(','))
let text = readFileSync(file, 'utf8')
const used = new Set()
const construction = /(\n[ \t]*)(const|let) (\w+) = new ActivitiesService\(/g

// The text of the balanced parentheses that open at `open`, and the index after the closing one.
function balanced(source, open) {
  let depth = 0
  for (let index = open; index < source.length; index++) {
    if (source[index] === '(') depth++
    else if (source[index] === ')' && --depth === 0) return index
  }
  throw new Error(`${file}: unbalanced parentheses`)
}

// The top-level arguments of one call, trimmed.
function splitArguments(inner) {
  const parts = []
  let depth = 0
  let start = 0
  for (let index = 0; index < inner.length; index++) {
    const char = inner[index]
    if ('([{'.includes(char)) depth++
    else if (')]}'.includes(char)) depth--
    else if (char === ',' && depth === 0) {
      parts.push(inner.slice(start, index).trim())
      start = index + 1
    }
  }
  const last = inner.slice(start).trim()
  if (last) parts.push(last)
  return parts
}

let match = construction.exec(text)
while (match) {
  const [whole, indent, keyword, variable] = match
  const open = match.index + whole.length - 1
  const close = balanced(text, open)
  const args = splitArguments(text.slice(open + 1, close))
  const next = (() => {
    const rest = new RegExp(construction.source, 'g')
    rest.lastIndex = close
    return rest.exec(text)?.index ?? text.length
  })()
  let scope = text.slice(close + 1, next)
  const created = []
  for (const service of services) {
    const methods = service.methods.filter(
      (method) => moving.has(method) && new RegExp(`\\b${variable}\\s*\\.\\s*${method}\\b`).test(scope),
    )
    if (methods.length === 0) continue
    if (service.variable) {
      for (const method of methods)
        scope = scope.replace(
          new RegExp(`\\b${variable}\\s*\\.\\s*${method}\\b`, 'g'),
          `${service.variable}.${method}`,
        )
      created.push(`${indent}${keyword} ${service.variable} = new ${service.name}(${args.slice(0, service.args).join(', ')})`)
    }
    used.add(service)
  }
  const reads = services[0]
  const readsMoving = reads.methods.some((method) => moving.has(method))
  // Comments and quoted text do not count as a use of the variable.
  const code = scope.replace(/\/\/[^\n]*/g, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
  const stillUsed = new RegExp(`\\b${variable}\\b`).test(code)
  const original = stillUsed
    ? `${indent}${keyword} ${variable} = new ActivitiesService(${(readsMoving ? args.slice(0, 1) : args).join(', ')})`
    : ''
  const replacement = original + created.join('')
  text = text.slice(0, match.index) + replacement + scope + text.slice(next)
  construction.lastIndex = match.index + replacement.length
  match = construction.exec(text)
}
writeFileSync(file, text)
// A file outside the activities folder reaches the services through the folder name.
const moduleFor = (service) => (file.includes('/modules/activities/') ? service.module : service.module.replace('./', '../activities/'))
for (const service of used)
  if (service.variable) execFileSync('node', ['.tmp/s2/imports.mjs', 'add', file, moduleFor(service), service.name])
execFileSync('node', ['.tmp/s2/imports.mjs', 'prune', file], { stdio: 'inherit' })
console.log(`${file}: ${[...used].map((service) => service.name).join(', ') || 'no calls moved'}`)
```

Create `.tmp/s2/seed-services.mjs`:

```js
// Gives the demo seeds one split activity service and points their calls at it.
// Usage: node seed-services.mjs <Class> <key> <module-file> <argument-count> <method,method,...>
// Example: node seed-services.mjs ActivityReviewService activityReview activity-review.service 1 reviewUpdate
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const [name, key, moduleFile, count, list] = process.argv.slice(2)
const methods = list.split(',')
const argumentsFor = ['runtime', 'storage', 'privateStorageFactories'].slice(0, Number(count)).join(', ')
const modulePath = `../src/modules/activities/${moduleFile}`
const seeds = 'apps/api/prisma'

// Writes the file and, when asked, imports the new class into it.
const edit = (file, change, withImport, optional = false) => {
  const before = readFileSync(file, 'utf8')
  const after = change(before)
  if (after === before && optional) return console.log(`${file}: no calls to move`)
  if (after === before) throw new Error(`${file}: nothing changed`)
  writeFileSync(file, after)
  if (withImport) execFileSync('node', ['.tmp/s2/imports.mjs', 'add', file, modulePath, name])
  console.log(`${file}: ${name}`)
}

// Adds a line after the one line matching the pattern, with the same indentation.
const addAfter = (text, pattern, line) => {
  if ((text.match(new RegExp(pattern.source, 'gm')) ?? []).length !== 1) throw new Error(`Expected one ${pattern}`)
  return text.replace(pattern, (whole, indent) => `${whole}\n${indent}${line}`)
}

for (const file of ['local-demo-seed.ts', 'defense-demo-seed.ts']) {
  edit(
    `${seeds}/${file}`,
    (text) => {
      const next = addAfter(
        text,
        /^([ \t]*)activities: new ActivitiesService\(runtime, storage, privateStorageFactories\),$/m,
        `${key}: new ${name}(${argumentsFor}),`,
      )
      return file === 'local-demo-seed.ts'
        ? addAfter(next, /^([ \t]*)activities: ActivitiesService$/m, `${key}: ${name}`)
        : next
    },
    true,
  )
}
edit(
  `${seeds}/hosted-realistic-seed.ts`,
  (text) => {
    if (!methods.some((method) => text.includes(`activitiesService.${method}(`))) return text
    let next = addAfter(
      text,
      /^([ \t]*)const activitiesService = new ActivitiesService\(runtime, storage, privateStorageFactories\)$/m,
      `const ${key}Service = new ${name}(${argumentsFor})`,
    )
    for (const method of methods) next = next.replaceAll(`activitiesService.${method}(`, `${key}Service.${method}(`)
    return next
  },
  true,
  true,
)
edit(
  `${seeds}/local-demo-stage-activities.ts`,
  (text) => {
    let next = text
    for (const method of methods)
      next = next.replaceAll(`ctx.services.activities.${method}(`, `ctx.services.${key}.${method}(`)
    return next
  },
  false,
  true,
)
```

Expected: seven files in `.tmp/s2/`. They are used from Task 2 on; each task below names the script it runs, and the per-task option files (`*-edits.mjs`, `*-split.mjs`, `*-lines.mjs`) are created in the task that runs them.

---

### Task 1: Activity request contracts and DTO parity evidence

**Files:**
- Create: `packages/shared/src/contracts/activities/activity-evidence.ts`, `packages/shared/src/contracts/activities/activity-requests.ts`
- Test: `packages/shared/src/contracts/activities/activity-requests.test.ts`
- Modify: `packages/shared/src/contracts/common/field-schemas.ts` (two helpers), `packages/shared/src/contracts/common/field-schemas.test.ts`, `packages/shared/src/contracts/projects/project-requests.ts` (use the helpers), `packages/shared/src/index.ts` (barrel lines)
- Create (deleted again in Task 2): `apps/api/src/modules/activities/activity-request-parity.test.ts`
- Create: `.tmp/s2/field-helpers-edits.mjs`

**Interfaces:**
- Consumes: the S1a field schemas (`lengthString`, `uuidString`, `isoDateString`, `strictIsoDateString`, `trimmedInput`, `hasUniqueItems`) and `recordCodeInput`.
- Produces, from `@pathways/shared`: `countInput(max: number)` (a `z.preprocess` that turns numeric text into a number and leaves blank text and `null` for the number rule to refuse) and `pesoAmountInput` (a trimmed `z.string()` that accepts a non-negative PHP amount with at most 2 decimals); `activityEvidenceContentTypes` (the seven-type tuple), `type ActivityEvidenceContentType`, `MAX_ACTIVITY_EVIDENCE_FILES` (10), `activityEvidenceFile` with `type ActivityEvidenceFile`; the nine request schemas `createActivityRequest`, `updateActivityRequest` (create plus `expectedUpdatedAt`), `transitionActivityRequest`, `recordActivityProgressRequest`, `reserveActivityProofRequest`, `recordOverdueExplanationRequest`, `reviewActivityUpdateRequest`, `saveMilestoneRequest`, `updateMilestoneRequest` with their `type`s. Optional fields are `T | null | undefined` except `budgetAllocation?: string` and `indicatorIds?: string[]` (ruling 4).

- [ ] **Step 1: Write the failing shared tests**

Append to `packages/shared/src/contracts/common/field-schemas.test.ts` (the diff shows the import lines and the two new tests; keep the existing tests):

```diff
@@ -1,9 +1,11 @@
 import { describe, expect, it } from 'vitest'
 
 import {
+  countInput,
   hasUniqueItems,
   isoDateString,
   lengthString,
+  pesoAmountInput,
   strictIsoDateString,
   trimmedInput,
   uuidString,
@@ -61,4 +63,24 @@ describe('class-validator field schemas', () => {
     expect(hasUniqueItems(['a', 'a'])).toBe(false)
     expect(hasUniqueItems(['a', 'A'])).toBe(true)
   })
+
+  it('turns numeric text into a count and rejects blanks and out-of-range numbers', () => {
+    expect(countInput(100).parse('50')).toBe(50)
+    expect(countInput(100).parse(true)).toBe(1)
+    expect(countInput(100).parse([5])).toBe(5)
+    expect(accepts(countInput(100), '')).toBe(false)
+    expect(accepts(countInput(100), null)).toBe(false)
+    expect(accepts(countInput(100), -1)).toBe(false)
+    expect(accepts(countInput(100), 1.5)).toBe(false)
+    expect(accepts(countInput(100), 101)).toBe(false)
+    expect(accepts(countInput(100).nullish(), null)).toBe(true)
+  })
+
+  it('trims a PHP amount and allows at most two decimals', () => {
+    expect(pesoAmountInput.parse(' 125000.50 ')).toBe('125000.50')
+    for (const value of ['0', '10', '0.5', '9999999999999999.99'])
+      expect(accepts(pesoAmountInput, value)).toBe(true)
+    for (const value of ['-1', '1.001', '1e3', '01', '', 10])
+      expect(accepts(pesoAmountInput, value)).toBe(false)
+  })
 })
```

Create `packages/shared/src/contracts/activities/activity-requests.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { activityEvidenceContentTypes } from './activity-evidence'
import {
  createActivityRequest,
  recordActivityProgressRequest,
  recordOverdueExplanationRequest,
  reserveActivityProofRequest,
  reviewActivityUpdateRequest,
  saveMilestoneRequest,
  transitionActivityRequest,
  updateActivityRequest,
  updateMilestoneRequest,
} from './activity-requests'

const uuid = '10000000-0000-4000-8000-000000000001'
const instant = '2026-09-24T00:00:00.000Z'
const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success
const create = {
  clientMutationId: uuid,
  title: 'Synthetic activity',
  plannedStartDate: '2026-01-01',
  plannedEndDate: '2026-12-31',
  assignedUserIds: [],
}
const progress = { clientUpdateId: uuid, progressPercent: 45, note: 'Halfway through sessions.' }
const sha = (n: number) => n.toString(16).padStart(64, '0')
const file = {
  fileName: 'report.pdf',
  contentType: 'application/pdf',
  byteSize: 1_048_576,
  sha256: sha(1),
}

describe('activity request contracts', () => {
  it('normalizes the code, the count and the budget as the DTO transforms did', () => {
    expect(
      createActivityRequest.parse({
        ...create,
        code: ' act-01 ',
        targetBeneficiaries: '50',
        budgetAllocation: ' 25000.25 ',
      }),
    ).toEqual({ ...create, code: 'ACT-01', targetBeneficiaries: 50, budgetAllocation: '25000.25' })
  })

  it('keeps null on the optional fields the DTO let through', () => {
    const nulls = {
      code: null,
      description: null,
      activityType: null,
      timelineOverrideJustification: null,
      targetBeneficiaries: null,
      journeyStageId: null,
    }
    expect(createActivityRequest.parse({ ...create, ...nulls })).toEqual({ ...create, ...nulls })
  })

  it.each([
    { budgetAllocation: null },
    { indicatorIds: null },
    { assignedUserIds: [uuid, uuid] },
    { indicatorIds: [uuid, uuid] },
    { targetBeneficiaries: -1 },
    { targetBeneficiaries: 2_147_483_648 },
    { targetBeneficiaries: 1.5 },
    { budgetAllocation: '-1' },
    { budgetAllocation: '100.001' },
    { budgetAllocation: '1e3' },
    { plannedStartDate: '2026-02-30' },
    { code: '-AB' },
    { targetGoal: 1 },
    JSON.parse('{"__proto__":{"a":1}}'),
  ])('rejects %j on create', (extra) => {
    expect(accepts(createActivityRequest, { ...create, ...extra })).toBe(false)
  })

  it('accepts the complete repaired transport contract with blank links', () => {
    const parsed = createActivityRequest.parse({
      ...create,
      plannedStartDate: '2025-12-01',
      timelineOverrideJustification: 'Approved early mobilization',
      targetBeneficiaries: '50',
      budgetAllocation: '25000.25',
      indicatorIds: [],
      journeyStageId: null,
    })
    expect(parsed.targetBeneficiaries).toBe(50)
  })

  it('requires the version only on update, and takes any ISO 8601 form for it', () => {
    expect(accepts(updateActivityRequest, { ...create, expectedUpdatedAt: instant })).toBe(true)
    expect(accepts(updateActivityRequest, { ...create, expectedUpdatedAt: '2026-02-30' })).toBe(
      true,
    )
    expect(accepts(updateActivityRequest, create)).toBe(false)
    expect(accepts(createActivityRequest, { ...create, expectedUpdatedAt: instant })).toBe(false)
  })

  it('takes only the two requested transition statuses', () => {
    const body = { clientMutationId: uuid, status: 'IN_PROGRESS', expectedUpdatedAt: instant }
    expect(accepts(transitionActivityRequest, body)).toBe(true)
    expect(accepts(transitionActivityRequest, { ...body, status: 'CANCELLED', reason: null })).toBe(
      true,
    )
    expect(accepts(transitionActivityRequest, { ...body, status: 'COMPLETED' })).toBe(false)
  })

  it.each([
    { progressPercent: 101 },
    { progressPercent: -1 },
    { progressPercent: '50' },
    { clientUpdateId: 'not-a-uuid' },
    { note: '' },
  ])('rejects the progress input %j', (invalid) => {
    expect(accepts(recordActivityProgressRequest, { ...progress, ...invalid })).toBe(false)
  })

  it('accepts a complete progress note and rejects one without a note', () => {
    expect(accepts(recordActivityProgressRequest, progress)).toBe(true)
    expect(
      accepts(recordActivityProgressRequest, { clientUpdateId: uuid, progressPercent: 10 }),
    ).toBe(false)
  })

  it('checks the overdue category and the explanation length', () => {
    const body = {
      clientMutationId: uuid,
      category: 'WEATHER',
      explanation: 'Valid enough explanation text here.',
    }
    expect(accepts(recordOverdueExplanationRequest, body)).toBe(true)
    for (const invalid of [
      { category: 'HURRICANE' },
      { explanation: 'too short' },
      { explanation: 'x'.repeat(2001) },
      { clientMutationId: 'not-a-uuid' },
    ])
      expect(accepts(recordOverdueExplanationRequest, { ...body, ...invalid })).toBe(false)
    expect(
      accepts(recordOverdueExplanationRequest, {
        category: 'WEATHER',
        explanation: body.explanation,
      }),
    ).toBe(false)
  })

  it('checks the review decision and reason', () => {
    const body = {
      clientMutationId: uuid,
      decision: 'APPROVE',
      reason: 'Evidence verified.',
      expectedUpdatedAt: instant,
    }
    expect(accepts(reviewActivityUpdateRequest, body)).toBe(true)
    expect(accepts(reviewActivityUpdateRequest, { ...body, decision: 'REJECT' })).toBe(false)
    expect(accepts(reviewActivityUpdateRequest, { ...body, reason: '' })).toBe(false)
  })

  it('takes optional dates and null text on milestones and checks the status on update', () => {
    expect(
      accepts(saveMilestoneRequest, { title: 'Phase one', description: null, targetDate: null }),
    ).toBe(true)
    expect(accepts(saveMilestoneRequest, { title: 'Phase one', targetDate: '2026-02-30' })).toBe(
      false,
    )
    const update = {
      title: 'Phase one',
      status: 'COMPLETED',
      completionDate: '2026-03-01',
      expectedUpdatedAt: instant,
    }
    expect(accepts(updateMilestoneRequest, update)).toBe(true)
    expect(accepts(updateMilestoneRequest, { ...update, status: 'DONE' })).toBe(false)
    expect(accepts(updateMilestoneRequest, { ...update, expectedUpdatedAt: undefined })).toBe(false)
  })
})

describe('proof reservation contract', () => {
  const reserve = { ...progress, note: '  Sessions held with evidence.  ', files: [file] }

  it('accepts one to ten files and an optional session count', () => {
    expect(accepts(reserveActivityProofRequest, reserve)).toBe(true)
    expect(
      accepts(reserveActivityProofRequest, { ...reserve, beneficiariesReachedThisSession: null }),
    ).toBe(true)
    expect(accepts(reserveActivityProofRequest, { ...reserve, files: [] })).toBe(false)
    const eleven = Array.from({ length: 11 }, (_, index) => ({ ...file, sha256: sha(index + 20) }))
    expect(accepts(reserveActivityProofRequest, { ...reserve, files: eleven })).toBe(false)
  })

  it.each([
    { ...file, contentType: 'text/html' },
    { ...file, contentType: 'image/gif' },
    { ...file, fileName: '../escape.pdf' },
    { ...file, fileName: 'a\\b.pdf' },
    { ...file, fileName: 'x'.repeat(129) },
    { ...file, sha256: 'F'.repeat(64) },
    { ...file, byteSize: 0 },
    { ...file, byteSize: 104_857_601 },
    { ...file, unexpected: true },
  ])('rejects the evidence file %j', (invalid) => {
    expect(accepts(reserveActivityProofRequest, { ...reserve, files: [invalid] })).toBe(false)
  })

  it.each([-1, 1.5, 100001])('rejects the session count %s', (value) => {
    expect(
      accepts(reserveActivityProofRequest, { ...reserve, beneficiariesReachedThisSession: value }),
    ).toBe(false)
  })

  it('declares the seven evidence content types', () => {
    expect(activityEvidenceContentTypes).toHaveLength(7)
  })
})
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts`
Expected: FAIL, cannot resolve `./activity-requests` and `countInput` is not exported.

- [ ] **Step 2: Add the helpers and use them in the project contract**

Append to `packages/shared/src/contracts/common/field-schemas.ts`:

```ts
// Accepts a count sent as a number or numeric text, and blank text or null reach the number rule unchanged and fail it.
export const countInput = (max: number) =>
  z.preprocess(
    (value) => (value === '' || value === null ? value : Number(value)),
    z.number().int().min(0).max(max),
  )

// A non-negative PHP amount with at most 2 decimal places, trimmed first.
export const pesoAmountInput = trimmedInput(
  z
    .string()
    .regex(
      /^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/,
      'must be a non-negative PHP amount with at most 2 decimal places.',
    ),
)
```

Create `.tmp/s2/field-helpers-edits.mjs` (it tolerates the whitespace Biome gave S1a's file):

```js
const file = 'packages/shared/src/contracts/projects/project-requests.ts'
export default [
  {
    file,
    edits: [
      [/const pesoAmountPattern = [^\n]*\n/, '', 1],
      [
        /targetBeneficiaries: z\s*\.preprocess\([^]*?\)\s*\.nullish\(\),/,
        'targetBeneficiaries: countInput(2_147_483_647).nullish(),',
        1,
      ],
      [
        /projectBudget: trimmedInput\([^]*?\)\.optional\(\),/,
        'projectBudget: pesoAmountInput.optional(),',
        1,
      ],
      ['import {\n  hasUniqueItems,', 'import {\n  countInput,\n  hasUniqueItems,', 1],
      ['  lengthString,\n', '  lengthString,\n  pesoAmountInput,\n', 1],
    ],
  },
]
```

```bash
node .tmp/s2/replace-exact.mjs .tmp/s2/field-helpers-edits.mjs
git diff --stat packages/shared/src/contracts/projects/project-requests.ts
pnpm --filter @pathways/shared exec vitest run src/contracts/projects src/contracts/common
```

Expected: `packages/shared/src/contracts/projects/project-requests.ts: 5 edits`; the diff removes the `pesoAmountPattern` line and the inline `targetBeneficiaries` and `projectBudget` builders, and the S1a contract tests (13) and the field schema tests (19 plus the 2 new) pass. A "expected 1 of ..., found 0" error means S1a's file differs from its plan: stop and report.

- [ ] **Step 3: Create the evidence constants and the request contracts**

Create `packages/shared/src/contracts/activities/activity-evidence.ts`:

```ts
import { z } from 'zod'

import { lengthString } from '../common/field-schemas'

// Content types accepted for activity evidence (cr-pathways-activity-progress-media).
export const activityEvidenceContentTypes = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const
export type ActivityEvidenceContentType = (typeof activityEvidenceContentTypes)[number]
export const MAX_ACTIVITY_EVIDENCE_FILES = 10

// Declares one evidence file before upload, with the configured per-file byte limit enforced by the service.
export const activityEvidenceFile = z
  .object({
    fileName: lengthString(1, 128).refine(
      (value) => /^[^\\/]+$/.test(value),
      'must not contain a slash',
    ),
    contentType: z.enum(activityEvidenceContentTypes),
    byteSize: z.number().int().min(1).max(104_857_600),
    sha256: z.string().regex(/^[0-9a-f]{64}$/, 'must be a lower-case SHA-256 digest'),
  })
  .strict()
export type ActivityEvidenceFile = z.infer<typeof activityEvidenceFile>
```

Create `packages/shared/src/contracts/activities/activity-requests.ts`:

```ts
import { z } from 'zod'

import { overdueExplanationCategories } from '../../constants/domain-codes'
import {
  countInput,
  hasUniqueItems,
  isoDateString,
  lengthString,
  pesoAmountInput,
  strictIsoDateString,
  uuidString,
} from '../common/field-schemas'
import { recordCodeInput } from '../projects/project-requests'
import { MAX_ACTIVITY_EVIDENCE_FILES, activityEvidenceFile } from './activity-evidence'

const activityFields = {
  clientMutationId: uuidString,
  code: recordCodeInput.nullish(),
  title: lengthString(3, 160),
  description: lengthString(0, 4000).nullish(),
  activityType: lengthString(1, 80).nullish(),
  plannedStartDate: strictIsoDateString,
  plannedEndDate: strictIsoDateString,
  timelineOverrideJustification: lengthString(1, 1000).nullish(),
  targetBeneficiaries: countInput(2_147_483_647).nullish(),
  budgetAllocation: pesoAmountInput.optional(),
  assignedUserIds: z
    .array(uuidString)
    .max(50)
    .refine(hasUniqueItems, 'must not repeat an assignee'),
  indicatorIds: z
    .array(uuidString)
    .max(100)
    .refine(hasUniqueItems, 'must not repeat an indicator')
    .optional(),
  journeyStageId: uuidString.nullish(),
}

// Body of POST /projects/:projectId/activities.
export const createActivityRequest = z.object(activityFields).strict()
export type CreateActivityRequest = z.infer<typeof createActivityRequest>

// Body of PATCH /projects/:projectId/activities/:activityId.
export const updateActivityRequest = z
  .object({ ...activityFields, expectedUpdatedAt: isoDateString })
  .strict()
export type UpdateActivityRequest = z.infer<typeof updateActivityRequest>

// Body of POST /projects/:projectId/activities/:activityId/transition.
export const transitionActivityRequest = z
  .object({
    clientMutationId: uuidString,
    status: z.enum(['IN_PROGRESS', 'CANCELLED']),
    reason: lengthString(1, 1000).nullish(),
    expectedUpdatedAt: isoDateString,
  })
  .strict()
export type TransitionActivityRequest = z.infer<typeof transitionActivityRequest>

const progressFields = {
  clientUpdateId: uuidString,
  progressPercent: z.number().int().min(0).max(100),
  note: lengthString(1, 4000),
}

// Body of POST /projects/:projectId/activities/:activityId/progress.
export const recordActivityProgressRequest = z.object(progressFields).strict()
export type RecordActivityProgressRequest = z.infer<typeof recordActivityProgressRequest>

// Body of POST /projects/:projectId/activities/:activityId/updates/reservations.
export const reserveActivityProofRequest = z
  .object({
    ...progressFields,
    files: z.array(activityEvidenceFile).min(1).max(MAX_ACTIVITY_EVIDENCE_FILES),
    beneficiariesReachedThisSession: z.number().int().min(0).max(100000).nullish(),
  })
  .strict()
export type ReserveActivityProofRequest = z.infer<typeof reserveActivityProofRequest>

// Body of POST /projects/:projectId/activities/:activityId/overdue-explanations.
export const recordOverdueExplanationRequest = z
  .object({
    clientMutationId: uuidString,
    category: z.enum(overdueExplanationCategories),
    explanation: lengthString(10, 2000),
  })
  .strict()
export type RecordOverdueExplanationRequest = z.infer<typeof recordOverdueExplanationRequest>

// Body of POST /projects/:projectId/activities/:activityId/updates/:updateId/review.
export const reviewActivityUpdateRequest = z
  .object({
    clientMutationId: uuidString,
    decision: z.enum(['APPROVE', 'RETURN']),
    reason: lengthString(1, 1000),
    expectedUpdatedAt: isoDateString,
  })
  .strict()
export type ReviewActivityUpdateRequest = z.infer<typeof reviewActivityUpdateRequest>

const milestoneFields = {
  title: lengthString(3, 160),
  description: lengthString(0, 2000).nullish(),
  targetDate: strictIsoDateString.nullish(),
}

// Body of POST /projects/:projectId/milestones.
export const saveMilestoneRequest = z.object(milestoneFields).strict()
export type SaveMilestoneRequest = z.infer<typeof saveMilestoneRequest>

// Body of PATCH /projects/:projectId/milestones/:milestoneId.
export const updateMilestoneRequest = z
  .object({
    ...milestoneFields,
    status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
    completionDate: strictIsoDateString.nullish(),
    expectedUpdatedAt: isoDateString,
  })
  .strict()
export type UpdateMilestoneRequest = z.infer<typeof updateMilestoneRequest>
```

Add to `packages/shared/src/index.ts`, directly after `export * from './contracts/projects/project-requests'`:

```ts
export * from './contracts/activities/activity-evidence'
export * from './contracts/activities/activity-requests'
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts`
Expected: PASS; `activity-requests.test.ts` runs 42 tests.

- [ ] **Step 4: Write the parity test**

The test runs every DTO and its contract through the configured pipes over the same JSON bodies and compares accepted values and the 400 shape, then pins the bodies the DTO route let through and the contracts reject, and the equal `sourceMutationBody` output of the old and new routes. Create `apps/api/src/modules/activities/activity-request-parity.test.ts`:

```ts
import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import {
  createActivityRequest,
  recordActivityProgressRequest,
  recordOverdueExplanationRequest,
  reserveActivityProofRequest,
  reviewActivityUpdateRequest,
  saveMilestoneRequest,
  transitionActivityRequest,
  updateActivityRequest,
  updateMilestoneRequest,
} from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { sourceMutationBody } from '../rules/rules-source-operation'
import {
  CreateActivityDto,
  RecordActivityProgressDto,
  RecordOverdueExplanationDto,
  ReserveActivityProofDto,
  ReviewActivityUpdateDto,
  SaveMilestoneDto,
  TransitionActivityDto,
  UpdateActivityDto,
  UpdateMilestoneDto,
} from './activities.dto'

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
const uuid = '10000000-0000-4000-8000-000000000001'
const upperId = 'ABCDEFAB-CDEF-4ABC-8ABC-ABCDEFABCDEF'
const instant = '2026-09-24T00:00:00.000Z'
const grin = String.fromCodePoint(0x1f600)
const sha = (n: number) => n.toString(16).padStart(64, '0')
const ids = (count: number) =>
  Array.from({ length: count }, (_, i) => `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
const file = {
  fileName: 'report.pdf',
  contentType: 'application/pdf',
  byteSize: 1_048_576,
  sha256: sha(1),
}

type ParityCase = {
  name: string
  dto: new () => object
  pipe: ZodPipe<never>
  base: Record<string, unknown>
  accepted: Record<string, unknown>[]
  rejected: Record<string, unknown>[]
  // Bodies the DTO route let through and the contract rejects.
  contractOnly?: Record<string, unknown>[]
}

const createBase = {
  clientMutationId: uuid,
  title: 'Synthetic activity',
  plannedStartDate: '2026-01-01',
  plannedEndDate: '2026-12-31',
  assignedUserIds: [],
}
const createCases = {
  accepted: [
    {},
    { title: '   ' },
    { title: grin.repeat(3) },
    { title: 'x'.repeat(160) },
    { code: ' act-01 ' },
    { code: null },
    { description: null, activityType: null, timelineOverrideJustification: null },
    { description: 'x'.repeat(4000) },
    { activityType: 'x'.repeat(80) },
    { timelineOverrideJustification: 'x'.repeat(1000) },
    { targetBeneficiaries: 50 },
    { targetBeneficiaries: '50' },
    { targetBeneficiaries: null },
    { targetBeneficiaries: true },
    { targetBeneficiaries: [5] },
    { targetBeneficiaries: [] },
    { targetBeneficiaries: ' 7 ' },
    { targetBeneficiaries: '0x10' },
    { targetBeneficiaries: 2_147_483_647 },
    { budgetAllocation: '25000.25' },
    { budgetAllocation: ' 10 ' },
    { budgetAllocation: '0' },
    { assignedUserIds: [uuid] },
    { assignedUserIds: [upperId] },
    { assignedUserIds: ids(50) },
    { indicatorIds: [] },
    { indicatorIds: ids(100) },
    { journeyStageId: null },
    { journeyStageId: uuid },
    { journeyStageId: '00000000-0000-0000-0000-000000000000' },
    { plannedStartDate: '2024-02-29' },
    { plannedStartDate: '2026-01-01T00:00:00Z' },
    { plannedEndDate: '20261231' },
    { plannedEndDate: '2026-W53' },
  ],
  rejected: [
    { clientMutationId: 'x' },
    { clientMutationId: null },
    { code: 'A' },
    { code: '-AB' },
    { code: 'AB CD' },
    { title: 'ab' },
    { title: grin.repeat(2) },
    { title: 'x'.repeat(161) },
    { title: null },
    { description: 'x'.repeat(4001) },
    { activityType: '' },
    { activityType: 'x'.repeat(81) },
    { timelineOverrideJustification: '' },
    { targetBeneficiaries: '' },
    { targetBeneficiaries: -1 },
    { targetBeneficiaries: 1.5 },
    { targetBeneficiaries: 2_147_483_648 },
    { targetBeneficiaries: 'abc' },
    { targetBeneficiaries: {} },
    { budgetAllocation: '-1' },
    { budgetAllocation: '100.001' },
    { budgetAllocation: '1e3' },
    { budgetAllocation: '01' },
    { budgetAllocation: 10 },
    { budgetAllocation: '' },
    { assignedUserIds: undefined },
    { assignedUserIds: null },
    { assignedUserIds: [uuid, uuid] },
    { assignedUserIds: ids(51) },
    { assignedUserIds: ['x'] },
    { indicatorIds: [uuid, uuid] },
    { indicatorIds: ids(101) },
    { journeyStageId: 'x' },
    { plannedStartDate: '2026-02-30' },
    { plannedStartDate: '2026-1-1' },
    { plannedStartDate: null },
    { plannedEndDate: '' },
    { plannedEndDate: 20261231 },
    { targetGoal: 1 },
    { extra: true },
    { expectedUpdatedAt: instant },
  ],
  contractOnly: [{ budgetAllocation: null }, { indicatorIds: null }],
}

const cases: ParityCase[] = [
  {
    name: 'CreateActivityDto and createActivityRequest',
    dto: CreateActivityDto,
    pipe: new ZodPipe(createActivityRequest) as never,
    base: createBase,
    ...createCases,
  },
  {
    name: 'UpdateActivityDto and updateActivityRequest',
    dto: UpdateActivityDto,
    pipe: new ZodPipe(updateActivityRequest) as never,
    base: { ...createBase, expectedUpdatedAt: instant },
    accepted: [
      ...createCases.accepted,
      { expectedUpdatedAt: '2026-09-24' },
      { expectedUpdatedAt: '2026-02-30' },
    ],
    rejected: [
      ...createCases.rejected.filter((extra) => !('expectedUpdatedAt' in extra)),
      { expectedUpdatedAt: 'yesterday' },
      { expectedUpdatedAt: null },
      { expectedUpdatedAt: undefined },
    ],
    contractOnly: createCases.contractOnly,
  },
  {
    name: 'TransitionActivityDto and transitionActivityRequest',
    dto: TransitionActivityDto,
    pipe: new ZodPipe(transitionActivityRequest) as never,
    base: { clientMutationId: uuid, status: 'IN_PROGRESS', expectedUpdatedAt: instant },
    accepted: [
      {},
      { status: 'CANCELLED', reason: 'Funding withdrawn.' },
      { status: 'CANCELLED', reason: null },
      { reason: 'x'.repeat(1000) },
    ],
    rejected: [
      { status: 'COMPLETED' },
      { status: 'in_progress' },
      { reason: '' },
      { reason: 'x'.repeat(1001) },
      { clientMutationId: 'x' },
      { expectedUpdatedAt: 'x' },
      { expectedUpdatedAt: undefined },
      { extra: true },
    ],
  },
  {
    name: 'RecordActivityProgressDto and recordActivityProgressRequest',
    dto: RecordActivityProgressDto,
    pipe: new ZodPipe(recordActivityProgressRequest) as never,
    base: { clientUpdateId: uuid, progressPercent: 45, note: 'Halfway through sessions.' },
    accepted: [{}, { progressPercent: 0 }, { progressPercent: 100 }, { note: 'x'.repeat(4000) }],
    rejected: [
      { progressPercent: 101 },
      { progressPercent: -1 },
      { progressPercent: '50' },
      { progressPercent: 1.5 },
      { clientUpdateId: 'not-a-uuid' },
      { note: '' },
      { note: 'x'.repeat(4001) },
      { note: undefined },
      { extra: true },
    ],
  },
  {
    name: 'RecordOverdueExplanationDto and recordOverdueExplanationRequest',
    dto: RecordOverdueExplanationDto,
    pipe: new ZodPipe(recordOverdueExplanationRequest) as never,
    base: {
      clientMutationId: uuid,
      category: 'WEATHER',
      explanation: 'Valid enough explanation text here.',
    },
    accepted: [{}, { explanation: 'x'.repeat(10) }, { explanation: 'x'.repeat(2000) }],
    rejected: [
      { category: 'HURRICANE' },
      { category: 'weather' },
      { explanation: 'too short' },
      { explanation: 'x'.repeat(2001) },
      { clientMutationId: 'not-a-uuid' },
      { clientMutationId: undefined },
      { extra: true },
    ],
  },
  {
    name: 'ReviewActivityUpdateDto and reviewActivityUpdateRequest',
    dto: ReviewActivityUpdateDto,
    pipe: new ZodPipe(reviewActivityUpdateRequest) as never,
    base: {
      clientMutationId: uuid,
      decision: 'APPROVE',
      reason: 'Evidence verified.',
      expectedUpdatedAt: instant,
    },
    accepted: [
      {},
      { decision: 'RETURN' },
      { reason: 'x'.repeat(1000) },
      { expectedUpdatedAt: '2026-02-30' },
    ],
    rejected: [
      { decision: 'REJECT' },
      { reason: '' },
      { reason: 'x'.repeat(1001) },
      { expectedUpdatedAt: 'x' },
      { expectedUpdatedAt: undefined },
      { clientMutationId: 'x' },
      { extra: true },
    ],
  },
  {
    name: 'SaveMilestoneDto and saveMilestoneRequest',
    dto: SaveMilestoneDto,
    pipe: new ZodPipe(saveMilestoneRequest) as never,
    base: { title: 'Phase one' },
    accepted: [
      {},
      { title: '   ' },
      { description: null },
      { description: 'x'.repeat(2000) },
      { targetDate: '2026-03-01' },
      { targetDate: null },
      { targetDate: '2026-03-01T00:00:00Z' },
    ],
    rejected: [
      { title: 'ab' },
      { title: 'x'.repeat(161) },
      { title: null },
      { description: 'x'.repeat(2001) },
      { targetDate: '2026-02-30' },
      { targetDate: '' },
      { targetDate: 20260301 },
      { extra: true },
    ],
  },
  {
    name: 'UpdateMilestoneDto and updateMilestoneRequest',
    dto: UpdateMilestoneDto,
    pipe: new ZodPipe(updateMilestoneRequest) as never,
    base: { title: 'Phase one', status: 'PENDING', expectedUpdatedAt: instant },
    accepted: [
      {},
      { status: 'COMPLETED', completionDate: '2026-03-01' },
      { status: 'COMPLETED' },
      { completionDate: null },
      { targetDate: null, description: null },
    ],
    rejected: [
      { status: 'DONE' },
      { status: null },
      { completionDate: '2026-02-30' },
      { expectedUpdatedAt: 'x' },
      { expectedUpdatedAt: undefined },
      { extra: true },
    ],
  },
  {
    name: 'ReserveActivityProofDto and reserveActivityProofRequest',
    dto: ReserveActivityProofDto,
    pipe: new ZodPipe(reserveActivityProofRequest) as never,
    base: { clientUpdateId: uuid, progressPercent: 60, note: '  Sessions held.  ', files: [file] },
    accepted: [
      {},
      { files: Array.from({ length: 10 }, (_, i) => ({ ...file, sha256: sha(i + 1) })) },
      { files: [{ ...file, contentType: 'video/quicktime', fileName: 'clip.mov' }] },
      { files: [{ ...file, byteSize: 104_857_600 }] },
      { files: [{ ...file, fileName: grin.repeat(128) }] },
      { beneficiariesReachedThisSession: 0 },
      { beneficiariesReachedThisSession: 100000 },
      { beneficiariesReachedThisSession: null },
    ],
    rejected: [
      { files: [] },
      { files: undefined },
      { files: null },
      { files: 'x' },
      { files: ['x'] },
      { files: [null] },
      { files: Array.from({ length: 11 }, (_, i) => ({ ...file, sha256: sha(i + 1) })) },
      { files: [{ ...file, contentType: 'text/html' }] },
      { files: [{ ...file, contentType: 'image/gif' }] },
      { files: [{ ...file, fileName: '../escape.pdf' }] },
      { files: [{ ...file, fileName: 'a\\b.pdf' }] },
      { files: [{ ...file, fileName: '' }] },
      { files: [{ ...file, fileName: 'x'.repeat(129) }] },
      { files: [{ ...file, sha256: 'F'.repeat(64) }] },
      { files: [{ ...file, sha256: 'a'.repeat(63) }] },
      { files: [{ ...file, byteSize: 0 }] },
      { files: [{ ...file, byteSize: 104_857_601 }] },
      { files: [{ ...file, byteSize: 1.5 }] },
      { files: [{ ...file, unexpected: true }] },
      { beneficiariesReachedThisSession: -1 },
      { beneficiariesReachedThisSession: 1.5 },
      { beneficiariesReachedThisSession: 100001 },
      { progressPercent: 101 },
      { note: '' },
      { extra: true },
    ],
  },
]

// A request body: the base with each extra key set, and a key set to undefined removed.
const body = (base: Record<string, unknown>, extra: Record<string, unknown>) => {
  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) delete merged[key]
    else merged[key] = value
  }
  return JSON.stringify(merged)
}

// The base body with one raw member added, for keys an object literal cannot carry as own properties.
const withMember = (base: Record<string, unknown>, member: string) =>
  JSON.stringify(base).replace(/}$/, `,${member}}`)

describe.each(cases)(
  '$name parity',
  ({ dto, pipe, base, accepted, rejected: rejectedExtras, contractOnly }) => {
    it.each(accepted.map((extra) => [JSON.stringify(extra), extra] as const))(
      'both accept the base with %s and keep the same value',
      async (_label, extra) => {
        const json = body(base, extra)
        const [old, next] = await Promise.all([viaDto(json, dto), viaZod(json, pipe)])
        expect(old.accepted).toBe(true)
        expect(next).toEqual(old)
      },
    )

    it.each(rejectedExtras.map((extra) => [JSON.stringify(extra) ?? 'undefined', extra] as const))(
      'both answer the 400 shape for the base with %s',
      async (_label, extra) => {
        const json = body(base, extra)
        expect(await viaDto(json, dto)).toEqual(badRequestShape)
        expect(await viaZod(json, pipe)).toEqual(badRequestShape)
      },
    )

    // Ruling 4: the DTO route let these through (and failed later in the service); the contract rejects them.
    it.each((contractOnly ?? []).map((extra) => [JSON.stringify(extra), extra] as const))(
      'only the contract rejects the base with %s',
      async (_label, extra) => {
        const json = body(base, extra)
        expect((await viaDto(json, dto)).accepted).toBe(true)
        expect(await viaZod(json, pipe)).toEqual(badRequestShape)
      },
    )

    // F3b ruling 3: the DTO route dropped own prototype keys; the strict contract rejects them.
    it.each(['"__proto__":{"a":1}', '"constructor":{"a":1}'])(
      'only the contract rejects the own key %s',
      async (member) => {
        const json = withMember(base, member)
        expect((await viaDto(json, dto)).accepted).toBe(true)
        expect(await viaZod(json, pipe)).toEqual(badRequestShape)
      },
    )
  },
)

const replayCases = [
  [
    'create',
    CreateActivityDto,
    createActivityRequest,
    {
      ...createBase,
      code: ' act-01 ',
      targetBeneficiaries: '5',
      description: null,
      assignedUserIds: [upperId],
    },
  ],
  [
    'update',
    UpdateActivityDto,
    updateActivityRequest,
    {
      ...createBase,
      expectedUpdatedAt: instant,
      code: ' act-01 ',
      budgetAllocation: ' 10 ',
      indicatorIds: [upperId],
    },
  ],
  [
    'transition',
    TransitionActivityDto,
    transitionActivityRequest,
    {
      clientMutationId: uuid,
      status: 'CANCELLED',
      reason: ' Funding withdrawn. ',
      expectedUpdatedAt: instant,
    },
  ],
  [
    'review',
    ReviewActivityUpdateDto,
    reviewActivityUpdateRequest,
    {
      clientMutationId: uuid,
      decision: 'APPROVE',
      reason: ' Verified. ',
      expectedUpdatedAt: instant,
    },
  ],
] as const

describe('replay across the deploy', () => {
  // A retry of the same request must hash to the same stored body on the old and the new route.
  it.each(replayCases)(
    'gives the same source mutation body for %s',
    async (_name, dto, schema, input) => {
      const json = JSON.stringify(input)
      const [old, next] = await Promise.all([
        viaDto(json, dto),
        viaZod(json, new ZodPipe(schema as never)),
      ])
      expect(old.accepted).toBe(true)
      expect(sourceMutationBody(next.value as object)).toEqual(
        sourceMutationBody(old.value as object),
      )
    },
  )
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/activities/activity-request-parity.test.ts`
Expected: PASS, 285 tests (the accepted and rejected bodies of nine DTO and contract pairs, the null budget and null indicator bodies of the create and update pairs, the two prototype keys of every pair, and four replay checks). Any failure means the contract differs from the DTO: stop and report the row, do not edit the table to match.

- [ ] **Step 5: Check and commit**

```bash
git add -N packages/shared apps/api
pnpm exec biome check --write packages/shared/src apps/api/src/modules/activities/activity-request-parity.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/shared test 2>&1 | grep -E "Tests +[0-9]+"
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add packages/shared apps/api/src/modules/activities/activity-request-parity.test.ts
git commit -m "feat(shared): add the activity request contracts with their DTO parity test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: shared = `B_shared + 44`, api = `B_api + 285`.

---

### Task 2: Switch the activity and milestone routes to the contracts

**Files:**
- Test: `apps/api/src/modules/activities/activities.controller.validation.test.ts`
- Modify: `apps/api/src/modules/activities/activities.controller.ts`, `apps/api/src/modules/activities/activities.service.ts`, `apps/api/src/modules/activities/activities.dto.ts` (twelve classes become two), `apps/api/src/modules/activities/private-proof-inspection.service.ts`, `apps/api/src/modules/beneficiary-media/beneficiary-media.dto.ts`, `apps/api/src/modules/beneficiary-media/beneficiary-media.service.ts`, `apps/api/prisma/hosted-realistic-seed.ts` (type import and one local), `apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts` (activities case), `activities.service.test.ts`, `activity-overdue-explanation.test.ts`, `activity-progress.test.ts`, `activity-proof-media.test.ts` (their DTO validation cases)
- Create: `apps/api/src/modules/activities/activity-proof.helpers.ts` (the storage deadline only; Task 5 completes it)
- Delete: `apps/api/src/modules/activities/activity-request-parity.test.ts`
- Create: `.tmp/s2/dto-cut.mjs`, `.tmp/s2/dto-test-cuts.mjs`, `.tmp/s2/switch-edits.mjs`, `.tmp/s2/switch-fixes.mjs`

**Interfaces:**
- Consumes: the Task 1 contracts; `ZodPipe`.
- Produces: the controllers and services take `CreateActivityRequest` and the other request types; `PROOF_STORAGE_DEADLINE_MS` is exported from `activity-proof.helpers.ts`; `activities.dto.ts` holds only `JourneyStageInputDto` and `SaveJourneyConfigurationDto`; the beneficiary media service and DTO read the evidence constants from `@pathways/shared`.

- [ ] **Step 1: Write the HTTP test**

Vitest emits no decorator metadata, so the global pipe sees no DTO metatype and forwards every body raw (ruling 4 of S1a); this test therefore fails against the DTO routes and passes once they use `ZodPipe`. Create `apps/api/src/modules/activities/activities.controller.validation.test.ts`:

```ts
import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ActivitiesController, MilestonesController } from './activities.controller'
import { ActivitiesService } from './activities.service'
import { PrivateProofInspectionService } from './private-proof-inspection.service'

const projectId = '10000000-0000-4000-8000-000000000001'
const activityId = '20000000-0000-4000-8000-000000000002'
const updateId = '30000000-0000-4000-8000-000000000003'
const mutationId = '40000000-0000-4000-8000-000000000004'
const actor = { id: '50000000-0000-4000-8000-000000000005', aal: 'aal2' }
const instant = '2026-09-24T00:00:00.000Z'
const methods = [
  'create',
  'update',
  'transition',
  'recordProgress',
  'recordOverdueExplanation',
  'reserveProof',
  'reviewUpdate',
  'createMilestone',
  'updateMilestone',
] as const
const activities = Object.fromEntries(methods.map((name) => [name, vi.fn()])) as Record<
  (typeof methods)[number],
  ReturnType<typeof vi.fn>
>
let app: INestApplication
let base: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [ActivitiesController, MilestonesController],
    providers: [
      { provide: ActivitiesService, useValue: activities },
      { provide: PrivateProofInspectionService, useValue: {} },
    ],
  }).compile()
  app = module.createNestApplication({ logger: false })
  // Stands in for the identity the auth guard attaches, since the guard is not under test here.
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
  base = `http://127.0.0.1:${port}/projects/${projectId}`
})

beforeEach(() => {
  for (const name of methods) activities[name].mockReset().mockResolvedValue({ id: activityId })
})
afterAll(async () => app?.close())

// Sends a JSON body and returns the status with the parsed response body.
async function send(method: 'POST' | 'PATCH', url: string, body: unknown) {
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

const create = {
  clientMutationId: mutationId,
  title: 'Synthetic activity',
  plannedStartDate: '2026-01-01',
  plannedEndDate: '2026-12-31',
  assignedUserIds: [],
}

describe('activity body validation', () => {
  it('forwards the normalized create body', async () => {
    const result = await send('POST', `${base}/activities`, {
      ...create,
      code: ' act-01 ',
      targetBeneficiaries: '50',
      budgetAllocation: ' 25000.25 ',
    })
    expect(result.status).toBe(201)
    expect(activities.create).toHaveBeenCalledWith(actor, projectId, {
      ...create,
      code: 'ACT-01',
      targetBeneficiaries: 50,
      budgetAllocation: '25000.25',
    })
  })

  it('forwards update, transition, progress, explanation and review bodies as sent', async () => {
    const update = { ...create, expectedUpdatedAt: instant }
    expect((await send('PATCH', `${base}/activities/${activityId}`, update)).status).toBe(200)
    expect(activities.update).toHaveBeenCalledWith(actor, projectId, activityId, update)

    const transition = {
      clientMutationId: mutationId,
      status: 'IN_PROGRESS',
      expectedUpdatedAt: instant,
    }
    expect(
      (await send('POST', `${base}/activities/${activityId}/transition`, transition)).status,
    ).toBe(201)
    expect(activities.transition).toHaveBeenCalledWith(actor, projectId, activityId, transition)

    const progress = { clientUpdateId: mutationId, progressPercent: 45, note: 'Halfway.' }
    expect((await send('POST', `${base}/activities/${activityId}/progress`, progress)).status).toBe(
      201,
    )
    expect(activities.recordProgress).toHaveBeenCalledWith(actor, projectId, activityId, progress)

    const explanation = {
      clientMutationId: mutationId,
      category: 'WEATHER',
      explanation: 'Valid enough explanation text here.',
    }
    expect(
      (await send('POST', `${base}/activities/${activityId}/overdue-explanations`, explanation))
        .status,
    ).toBe(201)
    expect(activities.recordOverdueExplanation).toHaveBeenCalledWith(
      actor,
      projectId,
      activityId,
      explanation,
    )

    const review = {
      clientMutationId: mutationId,
      decision: 'APPROVE',
      reason: 'Verified.',
      expectedUpdatedAt: instant,
    }
    expect(
      (await send('POST', `${base}/activities/${activityId}/updates/${updateId}/review`, review))
        .status,
    ).toBe(201)
    expect(activities.reviewUpdate).toHaveBeenCalledWith(
      actor,
      projectId,
      activityId,
      updateId,
      review,
    )
  })

  it('forwards a proof reservation and the milestone bodies as sent', async () => {
    const reservation = {
      clientUpdateId: mutationId,
      progressPercent: 60,
      note: 'Sessions held.',
      files: [
        {
          fileName: 'report.pdf',
          contentType: 'application/pdf',
          byteSize: 1024,
          sha256: 'a'.repeat(64),
        },
      ],
    }
    expect(
      (await send('POST', `${base}/activities/${activityId}/updates/reservations`, reservation))
        .status,
    ).toBe(201)
    expect(activities.reserveProof).toHaveBeenCalledWith(actor, projectId, activityId, reservation)

    const milestone = { title: 'Phase one', targetDate: '2026-03-01' }
    expect((await send('POST', `${base}/milestones`, milestone)).status).toBe(201)
    expect(activities.createMilestone).toHaveBeenCalledWith(actor, projectId, milestone)

    const milestoneId = '60000000-0000-4000-8000-000000000006'
    const change = {
      ...milestone,
      status: 'COMPLETED',
      completionDate: '2026-03-02',
      expectedUpdatedAt: instant,
    }
    expect((await send('PATCH', `${base}/milestones/${milestoneId}`, change)).status).toBe(200)
    expect(activities.updateMilestone).toHaveBeenCalledWith(actor, projectId, milestoneId, change)
  })

  it.each([
    [
      'an impossible planned date',
      'POST',
      '/activities',
      { ...create, plannedStartDate: '2026-02-30' },
    ],
    ['a null indicator list', 'POST', '/activities', { ...create, indicatorIds: null }],
    ['a null budget', 'POST', '/activities', { ...create, budgetAllocation: null }],
    [
      'an unknown status',
      'POST',
      `/activities/${activityId}/transition`,
      { clientMutationId: mutationId, status: 'COMPLETED', expectedUpdatedAt: instant },
    ],
    [
      'an out-of-range progress',
      'POST',
      `/activities/${activityId}/progress`,
      { clientUpdateId: mutationId, progressPercent: 101, note: 'x' },
    ],
    [
      'no evidence files',
      'POST',
      `/activities/${activityId}/updates/reservations`,
      { clientUpdateId: mutationId, progressPercent: 60, note: 'x', files: [] },
    ],
    [
      'a bad milestone status',
      'PATCH',
      `/milestones/${updateId}`,
      { title: 'Phase one', status: 'DONE', expectedUpdatedAt: instant },
    ],
  ] as const)(
    'answers 400 for %s without calling the service',
    async (_label, method, path, body) => {
      expect(await send(method, `${base}${path}`, body)).toEqual({
        status: 400,
        body: {
          statusCode: 400,
          error: 'Bad Request',
          message: expect.arrayContaining([expect.any(String)]),
        },
      })
      for (const name of methods) expect(activities[name]).not.toHaveBeenCalled()
    },
  )

  it('answers 400 naming a retired key without calling the service', async () => {
    const result = await send('POST', `${base}/activities`, { ...create, targetGoal: 75 })
    expect(result.status).toBe(400)
    expect(result.body.message).toContain("Unrecognized key(s) in object: 'targetGoal'")
    expect(activities.create).not.toHaveBeenCalled()
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/activities/activities.controller.validation.test.ts`
Expected: FAIL, 9 of 11 tests (the two "forwards ... as sent" tests pass against the raw bodies).

- [ ] **Step 2: Create the option files**

Create `.tmp/s2/dto-cut.mjs` (the twelve DTO classes become two; the evidence constants and the unused money validator go too):

```js
const cls = (name) => ({ first: `export class ${name} {`, last: '}' })
export default {
  source: 'apps/api/src/modules/activities/activities.dto.ts',
  moves: [
    {
      to: null,
      blocks: [
        { first: 'const IsMoneyAmount = () =>', last: '  })' },
        cls('CreateActivityDto'),
        { first: 'export class UpdateActivityDto extends CreateActivityDto {', last: '}' },
        cls('TransitionActivityDto'),
        { first: 'export const activityEvidenceContentTypes = [', last: '] as const' },
        { first: 'export type ActivityEvidenceContentType = (typeof activityEvidenceContentTypes)[number]', last: 'export type ActivityEvidenceContentType = (typeof activityEvidenceContentTypes)[number]' },
        { first: 'export const MAX_ACTIVITY_EVIDENCE_FILES = 10', last: 'export const MAX_ACTIVITY_EVIDENCE_FILES = 10' },
        { first: 'export const PROOF_STORAGE_DEADLINE_MS = 60_000', last: 'export const PROOF_STORAGE_DEADLINE_MS = 60_000' },
        cls('ActivityEvidenceFileDto'),
        cls('ReserveActivityProofDto'),
        cls('RecordActivityProgressDto'),
        cls('RecordOverdueExplanationDto'),
        cls('ReviewActivityUpdateDto'),
        cls('SaveMilestoneDto'),
        { first: 'export class UpdateMilestoneDto extends SaveMilestoneDto {', last: '}' },
      ],
    },
  ],
  sourceReplacements: [],
}
```

Create `.tmp/s2/dto-test-cuts.mjs` (the DTO validation cases; the contract tests of Task 1 carry the same inputs):

```js
const dir = 'apps/api/src/modules/activities'
const drop = (first) => ({ first, last: '  })' })
export default [
  {
    source: `${dir}/activities.service.test.ts`,
    moves: [
      {
        to: null,
        blocks: [
          drop('  it.each(['),
          drop("  it('accepts optional blank links and the complete repaired Activity transport contract', async () => {"),
        ],
      },
    ],
  },
  {
    source: `${dir}/activity-overdue-explanation.test.ts`,
    moves: [{ to: null, blocks: [drop("  it('rejects invalid category or explanation length at the DTO boundary (sad)', async () => {")] }],
  },
  {
    source: `${dir}/activity-progress.test.ts`,
    moves: [{ to: null, blocks: [drop("  it('rejects invalid input at the DTO boundary (sad)', async () => {")] }],
  },
  {
    source: `${dir}/activity-proof-media.test.ts`,
    moves: [
      {
        to: null,
        blocks: [
          drop("  it('rejects unsupported types, names and digests at the DTO boundary', async () => {"),
          { first: '  it.each([-1, 1.5, 100001])(', last: '  )' },
        ],
      },
    ],
  },
]
```

Create `.tmp/s2/switch-edits.mjs`:

```js
export default [
  {
    file: 'apps/api/src/modules/activities/activity-proof-media.test.ts',
    edits: [
      [
        "  it('rejects an eleventh file at the DTO and in the service before any read', async () => {",
        "  it('rejects an eleventh file in the service before any read', async () => {",
        1,
      ],
      [
        `    const errors = await validate(
      plainToInstance(ReserveActivityProofDto, reserveInput({ files: eleven })),
    )
    expect(errors.map((error) => error.property)).toContain('files')
`,
        '',
        1,
      ],
      ['Partial<ReserveActivityProofDto>', 'Partial<ReserveActivityProofRequest>', 1],
    ],
  },
  {
    file: 'apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts',
    edits: [
      [
        /  \{\n    file: 'src\/modules\/activities\/activities\.controller\.ts',\n    dtoNames: \[[^\]]*\],\n  \},\n/,
        '',
        1,
      ],
    ],
  },
]
```

Create `.tmp/s2/switch-fixes.mjs` (the nullish fields reach three places typed for `string | undefined`):

```js
export default [
  {
    file: 'apps/api/prisma/hosted-realistic-seed.ts',
    edits: [
      [
        "        const createDto: CreateActivityRequest = {\n          clientMutationId,\n          code: `ACT-${plan.code}-${String(i + 1).padStart(2, '0')}`,\n",
        "        const code = `ACT-${plan.code}-${String(i + 1).padStart(2, '0')}`\n        const createDto: CreateActivityRequest = {\n          clientMutationId,\n          code,\n",
        1,
      ],
      ['projectId, code: createDto.code }', 'projectId, code }', 2],
    ],
  },
  {
    file: 'apps/api/src/modules/activities/activities.service.ts',
    edits: [['    timelineOverrideJustification?: string,\n', '    timelineOverrideJustification?: string | null,\n', 1]],
  },
]
```

- [ ] **Step 3: Switch the routes, delete the DTO classes and retarget the importers**

The script deletes lines 20 to 31 of `activities.controller.ts` (the `biome-ignore` comment and the DTO import block); Task 0's hash check guarantees those lines. It also writes the one-line `activity-proof.helpers.ts` that Task 5 completes.

Create `.tmp/s2/s2-switch.sh`:

```bash
A=apps/api/src/modules/activities
S=$A/activities.service.ts
C=$A/activities.controller.ts
# Service and controller: DTO classes become contract types and zod pipes.
sed -i -e 's/\bCreateActivityDto\b/CreateActivityRequest/g' -e 's/\bUpdateActivityDto\b/UpdateActivityRequest/g' -e 's/\bTransitionActivityDto\b/TransitionActivityRequest/g' -e 's/\bRecordActivityProgressDto\b/RecordActivityProgressRequest/g' -e 's/\bRecordOverdueExplanationDto\b/RecordOverdueExplanationRequest/g' -e 's/\bReserveActivityProofDto\b/ReserveActivityProofRequest/g' -e 's/\bReviewActivityUpdateDto\b/ReviewActivityUpdateRequest/g' -e 's/\bSaveMilestoneDto\b/SaveMilestoneRequest/g' -e 's/\bUpdateMilestoneDto\b/UpdateMilestoneRequest/g' -e 's/\bActivityEvidenceFileDto\b/ActivityEvidenceFile/g' $S
node .tmp/s2/imports.mjs move $S './activities.dto' '@pathways/shared' ActivityEvidenceContentType ActivityEvidenceFile CreateActivityRequest MAX_ACTIVITY_EVIDENCE_FILES RecordActivityProgressRequest RecordOverdueExplanationRequest ReserveActivityProofRequest ReviewActivityUpdateRequest SaveMilestoneRequest TransitionActivityRequest UpdateActivityRequest UpdateMilestoneRequest activityEvidenceContentTypes
node .tmp/s2/imports.mjs move $S './activities.dto' './activity-proof.helpers' PROOF_STORAGE_DEADLINE_MS
sed -i '20,31d' $C
sed -i -e 's/@Body() body: CreateActivityDto/@Body(new ZodPipe(createActivityRequest)) body: CreateActivityRequest/' -e 's/@Body() body: UpdateActivityDto/@Body(new ZodPipe(updateActivityRequest)) body: UpdateActivityRequest/' -e 's/@Body() body: TransitionActivityDto/@Body(new ZodPipe(transitionActivityRequest)) body: TransitionActivityRequest/' -e 's/@Body() body: RecordActivityProgressDto/@Body(new ZodPipe(recordActivityProgressRequest)) body: RecordActivityProgressRequest/' -e 's/@Body() body: RecordOverdueExplanationDto/@Body(new ZodPipe(recordOverdueExplanationRequest)) body: RecordOverdueExplanationRequest/' -e 's/@Body() body: ReserveActivityProofDto/@Body(new ZodPipe(reserveActivityProofRequest)) body: ReserveActivityProofRequest/' -e 's/@Body() body: ReviewActivityUpdateDto/@Body(new ZodPipe(reviewActivityUpdateRequest)) body: ReviewActivityUpdateRequest/' -e 's/@Body() body: SaveMilestoneDto/@Body(new ZodPipe(saveMilestoneRequest)) body: SaveMilestoneRequest/' -e 's/@Body() body: UpdateMilestoneDto/@Body(new ZodPipe(updateMilestoneRequest)) body: UpdateMilestoneRequest/' $C
node .tmp/s2/imports.mjs add $C '@pathways/shared' type:CreateActivityRequest type:RecordActivityProgressRequest type:RecordOverdueExplanationRequest type:ReserveActivityProofRequest type:ReviewActivityUpdateRequest type:SaveMilestoneRequest type:TransitionActivityRequest type:UpdateActivityRequest type:UpdateMilestoneRequest createActivityRequest recordActivityProgressRequest recordOverdueExplanationRequest reserveActivityProofRequest reviewActivityUpdateRequest saveMilestoneRequest transitionActivityRequest updateActivityRequest updateMilestoneRequest
node .tmp/s2/imports.mjs add $C '../../common/validation/zod-pipe' ZodPipe
grep -c "ZodPipe(" $C
# The DTO file keeps only the two journey classes, which slice S4 converts.
node .tmp/s2/move-blocks.mjs .tmp/s2/dto-cut.mjs
node .tmp/s2/imports.mjs prune $A/activities.dto.ts
cat > $A/activity-proof.helpers.ts <<'TS'
// Storage deadline per finalize or inspection read (cr-pathways-activity-progress-media 3.5).
export const PROOF_STORAGE_DEADLINE_MS = 60_000
TS
# Importers of the removed DTO exports.
P=$A/private-proof-inspection.service.ts
node .tmp/s2/imports.mjs move $P './activities.dto' './activity-proof.helpers' PROOF_STORAGE_DEADLINE_MS
node .tmp/s2/imports.mjs move $P './activities.dto' '@pathways/shared' activityEvidenceContentTypes
M=apps/api/src/modules/beneficiary-media
node .tmp/s2/imports.mjs move $M/beneficiary-media.dto.ts '../activities/activities.dto' '@pathways/shared' ActivityEvidenceContentType MAX_ACTIVITY_EVIDENCE_FILES activityEvidenceContentTypes
node .tmp/s2/imports.mjs move $M/beneficiary-media.service.ts '../activities/activities.dto' '../activities/activity-proof.helpers' PROOF_STORAGE_DEADLINE_MS
H=apps/api/prisma/hosted-realistic-seed.ts
sed -i -e 's/\bCreateActivityDto\b/CreateActivityRequest/g' -e 's/\bTransitionActivityDto\b/TransitionActivityRequest/g' $H
node .tmp/s2/imports.mjs move $H '../src/modules/activities/activities.dto' '@pathways/shared' CreateActivityRequest TransitionActivityRequest
git rm -q $A/activity-request-parity.test.ts
node .tmp/s2/move-blocks.mjs .tmp/s2/dto-test-cuts.mjs
node .tmp/s2/replace-exact.mjs .tmp/s2/switch-edits.mjs
node .tmp/s2/imports.mjs add $A/activity-proof-media.test.ts '@pathways/shared' type:ReserveActivityProofRequest
for f in activities.service activity-overdue-explanation activity-progress activity-proof-media; do node .tmp/s2/imports.mjs prune $A/$f.test.ts; done
git grep -n "activities\.dto'" -- apps
```

Run it as one block and stop at the first error:

```bash
bash -e .tmp/s2/s2-switch.sh
```

Expected: `9` (nine `ZodPipe` pipes in the controller); the cut summary for `activities.dto.ts` ends `apps/api/src/modules/activities/activities.dto.ts: 82 lines`, its prune line names `OverdueExplanationCategory, overdueExplanationCategories, ArrayMinSize, ValidateBy`; the test cuts end `activity-proof-media.test.ts: 675 lines`; the four test prunes name `plainToInstance, validate` and the removed DTO; the last command prints two lines, `journey-stage-code.test.ts:7` and `participants.controller.ts:17`, the S4 importers.

Apply the typing fixes:

```bash
node .tmp/s2/replace-exact.mjs .tmp/s2/switch-fixes.mjs
```

Expected: `hosted-realistic-seed.ts: 2 edits` and `activities.service.ts: 1 edits`.

- [ ] **Step 4: Run the tests and commit**

```bash
git add -N apps/api packages/shared
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts')
pnpm --filter @pathways/api exec vitest run src/modules/activities src/modules/activity-extensions src/modules/beneficiary-media src/modules/rules src/common
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api packages/shared
git commit -m "refactor(api): validate the activity and milestone bodies with the shared contracts

The activity DTO classes and their parity test are removed; the routes keep the 400 shape.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the 11 HTTP tests pass; typecheck (which also checks the hosted seed) and lint pass; api = `B_api - 3` (the 285 parity tests leave, 13 DTO validation tests and 1 runtime-metadata case leave, 11 HTTP tests arrive), shared unchanged from Task 1.

---

### Task 3: Extension request contracts, route switch and service tidy

**Files:**
- Create: `packages/shared/src/contracts/activities/activity-extension-requests.ts`
- Test: `packages/shared/src/contracts/activities/activity-extension-requests.test.ts`
- Modify: `packages/shared/src/index.ts` (barrel line)
- Create (deleted again in this task): `apps/api/src/modules/activity-extensions/activity-extension-request-parity.test.ts`
- Test: `apps/api/src/modules/activity-extensions/activity-extensions.controller.validation.test.ts`
- Modify: `apps/api/src/modules/activity-extensions/activity-extensions.controller.ts`, `apps/api/src/modules/activity-extensions/activity-extensions.service.ts`
- Create: `apps/api/src/modules/activity-extensions/activity-extensions.mapper.ts`, `apps/api/src/modules/activity-extensions/activity-extensions.helpers.ts`
- Delete: `apps/api/src/modules/activity-extensions/activity-extensions.dto.ts`
- Create: `.tmp/s2/extension-edits.mjs`, `.tmp/s2/extension-split.mjs`

**Interfaces:**
- Consumes: the Task 1 field schemas; `requestIdentity`; `ZodPipe`.
- Produces, from `@pathways/shared`: `createActivityExtensionRequest` (`clientMutationId`, a `YYYY-MM-DD` `requestedEndDate`, `reason` of 10 to 2000 characters), `verifyActivityExtensionRequest` (`decision: 'VERIFY' | 'RETURN'`, `note`, strict `expectedUpdatedAt`), `decideActivityExtensionRequest` (`clientMutationId`, `decision: 'APPROVE' | 'DECLINE'`, `note`, strict `expectedUpdatedAt`, strict `activityExpectedUpdatedAt`) with their `type`s; from `activity-extensions.mapper.ts`, `extensionSelection`, `type ExtensionRow`, `day`, `mapExtension(row: ExtensionRow): ActivityExtension`; from `activity-extensions.helpers.ts`, `writeError(error: unknown): never`, `soleRole(actor, role, permission)`, `sameInstant(expected, actual)`.

- [ ] **Step 1: Write the failing contract test**

Create `packages/shared/src/contracts/activities/activity-extension-requests.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  createActivityExtensionRequest,
  decideActivityExtensionRequest,
  verifyActivityExtensionRequest,
} from './activity-extension-requests'

const uuid = '10000000-0000-4000-8000-000000000001'
const instant = '2026-09-24T00:00:00.000Z'
const note = 'A note of ten or more characters.'
const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success

describe('activity extension request contracts', () => {
  const create = { clientMutationId: uuid, requestedEndDate: '2026-12-31', reason: note }

  it('takes a plain calendar day for the requested end date and no other date form', () => {
    expect(accepts(createActivityExtensionRequest, create)).toBe(true)
    for (const requestedEndDate of [
      '2026-02-30',
      '2026-12-31T00:00:00Z',
      '20261231',
      '2026-W53',
      '',
    ])
      expect(accepts(createActivityExtensionRequest, { ...create, requestedEndDate })).toBe(false)
  })

  it('checks the reason length and refuses unknown keys', () => {
    expect(accepts(createActivityExtensionRequest, { ...create, reason: 'too short' })).toBe(false)
    expect(accepts(createActivityExtensionRequest, { ...create, reason: 'x'.repeat(2001) })).toBe(
      false,
    )
    expect(accepts(createActivityExtensionRequest, { ...create, extra: true })).toBe(false)
  })

  it('verifies with a decision, a note and a real-day version', () => {
    const verify = { decision: 'VERIFY', note, expectedUpdatedAt: instant }
    expect(accepts(verifyActivityExtensionRequest, verify)).toBe(true)
    expect(accepts(verifyActivityExtensionRequest, { ...verify, decision: 'APPROVE' })).toBe(false)
    expect(
      accepts(verifyActivityExtensionRequest, { ...verify, expectedUpdatedAt: '2026-02-30' }),
    ).toBe(false)
  })

  it('decides with both versions and takes only approve or decline', () => {
    const decide = {
      clientMutationId: uuid,
      decision: 'APPROVE',
      note,
      expectedUpdatedAt: instant,
      activityExpectedUpdatedAt: instant,
    }
    expect(accepts(decideActivityExtensionRequest, decide)).toBe(true)
    expect(accepts(decideActivityExtensionRequest, { ...decide, decision: 'VERIFY' })).toBe(false)
    expect(
      accepts(decideActivityExtensionRequest, { ...decide, activityExpectedUpdatedAt: undefined }),
    ).toBe(false)
  })
})
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/activities/activity-extension-requests.test.ts`
Expected: FAIL, cannot resolve `./activity-extension-requests`.

- [ ] **Step 2: Create the contracts**

Create `packages/shared/src/contracts/activities/activity-extension-requests.ts`:

```ts
import { z } from 'zod'

import { lengthString, strictIsoDateString, uuidString } from '../common/field-schemas'

// Body of POST /projects/:projectId/activities/:activityId/extension-requests.
export const createActivityExtensionRequest = z
  .object({
    clientMutationId: uuidString,
    requestedEndDate: strictIsoDateString.refine(
      (value) => /^\d{4}-\d{2}-\d{2}$/.test(value),
      'must be a calendar day written YYYY-MM-DD',
    ),
    reason: lengthString(10, 2000),
  })
  .strict()
export type CreateActivityExtensionRequest = z.infer<typeof createActivityExtensionRequest>

// Body of POST .../extension-requests/:requestId/verify.
export const verifyActivityExtensionRequest = z
  .object({
    decision: z.enum(['VERIFY', 'RETURN']),
    note: lengthString(10, 2000),
    expectedUpdatedAt: strictIsoDateString,
  })
  .strict()
export type VerifyActivityExtensionRequest = z.infer<typeof verifyActivityExtensionRequest>

// Body of POST .../extension-requests/:requestId/decide.
export const decideActivityExtensionRequest = z
  .object({
    clientMutationId: uuidString,
    decision: z.enum(['APPROVE', 'DECLINE']),
    note: lengthString(10, 2000),
    expectedUpdatedAt: strictIsoDateString,
    activityExpectedUpdatedAt: strictIsoDateString,
  })
  .strict()
export type DecideActivityExtensionRequest = z.infer<typeof decideActivityExtensionRequest>
```

Add to `packages/shared/src/index.ts`, directly after `export * from './contracts/activities/activity-evidence'`:

```ts
export * from './contracts/activities/activity-extension-requests'
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/activities`
Expected: PASS; 4 extension tests and the 42 activity tests.

- [ ] **Step 3: Write the parity test**

Create `apps/api/src/modules/activity-extensions/activity-extension-request-parity.test.ts`:

```ts
import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import {
  createActivityExtensionRequest,
  decideActivityExtensionRequest,
  verifyActivityExtensionRequest,
} from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import {
  DecideActivityExtensionDto,
  RequestActivityExtensionDto,
  VerifyActivityExtensionDto,
} from './activity-extensions.dto'

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
const uuid = '10000000-0000-4000-8000-000000000001'
const upperId = 'ABCDEFAB-CDEF-4ABC-8ABC-ABCDEFABCDEF'
const instant = '2026-09-24T00:00:00.000Z'
const note = 'A note of ten or more characters.'

const cases = [
  {
    name: 'RequestActivityExtensionDto and createActivityExtensionRequest',
    dto: RequestActivityExtensionDto,
    pipe: new ZodPipe(createActivityExtensionRequest),
    base: { clientMutationId: uuid, requestedEndDate: '2026-12-31', reason: note },
    accepted: [
      {},
      { requestedEndDate: '2024-02-29' },
      { reason: 'x'.repeat(10) },
      { reason: 'x'.repeat(2000) },
      { clientMutationId: upperId },
    ],
    rejected: [
      { requestedEndDate: '2026-02-30' },
      { requestedEndDate: '2026-12-31T00:00:00Z' },
      { requestedEndDate: '20261231' },
      { requestedEndDate: '2026-W53' },
      { requestedEndDate: '2026-1-1' },
      { requestedEndDate: '' },
      { requestedEndDate: null },
      { reason: 'too short' },
      { reason: 'x'.repeat(2001) },
      { reason: null },
      { clientMutationId: 'x' },
      { clientMutationId: null },
      { extra: true },
    ],
  },
  {
    name: 'VerifyActivityExtensionDto and verifyActivityExtensionRequest',
    dto: VerifyActivityExtensionDto,
    pipe: new ZodPipe(verifyActivityExtensionRequest),
    base: { decision: 'VERIFY', note, expectedUpdatedAt: instant },
    accepted: [
      {},
      { decision: 'RETURN' },
      { expectedUpdatedAt: '2026-09-24' },
      { expectedUpdatedAt: '2026-W39-4' },
      { note: 'x'.repeat(2000) },
    ],
    rejected: [
      { decision: 'APPROVE' },
      { decision: 'verify' },
      { note: 'short' },
      { note: 'x'.repeat(2001) },
      { expectedUpdatedAt: '2026-02-30' },
      { expectedUpdatedAt: 'yesterday' },
      { expectedUpdatedAt: null },
      { extra: true },
    ],
  },
  {
    name: 'DecideActivityExtensionDto and decideActivityExtensionRequest',
    dto: DecideActivityExtensionDto,
    pipe: new ZodPipe(decideActivityExtensionRequest),
    base: {
      clientMutationId: uuid,
      decision: 'APPROVE',
      note,
      expectedUpdatedAt: instant,
      activityExpectedUpdatedAt: instant,
    },
    accepted: [{}, { decision: 'DECLINE' }, { activityExpectedUpdatedAt: '2026-09-24' }],
    rejected: [
      { decision: 'VERIFY' },
      { note: 'short' },
      { expectedUpdatedAt: '2026-02-30' },
      { activityExpectedUpdatedAt: '2026-02-30' },
      { activityExpectedUpdatedAt: undefined },
      { clientMutationId: 'x' },
      { extra: true },
    ],
  },
]

// A request body: the base with each extra key set, and a key set to undefined removed.
const body = (base: Record<string, unknown>, extra: Record<string, unknown>) => {
  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) delete merged[key]
    else merged[key] = value
  }
  return JSON.stringify(merged)
}

// The base body with one raw member added, for keys an object literal cannot carry as own properties.
const withMember = (base: Record<string, unknown>, member: string) =>
  JSON.stringify(base).replace(/}$/, `,${member}}`)

describe.each(cases)('$name parity', ({ dto, pipe, base, accepted, rejected: rejectedExtras }) => {
  it.each(accepted.map((extra) => [JSON.stringify(extra), extra] as const))(
    'both accept the base with %s and keep the same value',
    async (_label, extra) => {
      const json = body(base, extra)
      const [old, next] = await Promise.all([viaDto(json, dto), viaZod(json, pipe)])
      expect(old.accepted).toBe(true)
      expect(next).toEqual(old)
    },
  )

  it.each(rejectedExtras.map((extra) => [JSON.stringify(extra) ?? 'undefined', extra] as const))(
    'both answer the 400 shape for the base with %s',
    async (_label, extra) => {
      const json = body(base, extra)
      expect(await viaDto(json, dto)).toEqual(badRequestShape)
      expect(await viaZod(json, pipe)).toEqual(badRequestShape)
    },
  )

  // F3b ruling 3: the DTO route dropped own prototype keys; the strict contract rejects them.
  it.each(['"__proto__":{"a":1}', '"constructor":{"a":1}'])(
    'only the contract rejects the own key %s',
    async (member) => {
      const json = withMember(base, member)
      expect((await viaDto(json, dto)).accepted).toBe(true)
      expect(await viaZod(json, pipe)).toEqual(badRequestShape)
    },
  )
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/activity-extensions/activity-extension-request-parity.test.ts`
Expected: PASS, 47 tests (the accepted and rejected bodies of three pairs and the two prototype keys of each). Any failure means the contract differs from the DTO: stop and report the row.

- [ ] **Step 4: Write the HTTP test**

Create `apps/api/src/modules/activity-extensions/activity-extensions.controller.validation.test.ts`:

```ts
import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ActivityExtensionsController } from './activity-extensions.controller'
import { ActivityExtensionsService } from './activity-extensions.service'

const projectId = '10000000-0000-4000-8000-000000000001'
const activityId = '20000000-0000-4000-8000-000000000002'
const requestId = '30000000-0000-4000-8000-000000000003'
const mutationId = '40000000-0000-4000-8000-000000000004'
const actor = { id: '50000000-0000-4000-8000-000000000005', aal: 'aal2' }
const instant = '2026-09-24T00:00:00.000Z'
const note = 'A note of ten or more characters.'
const service = { list: vi.fn(), request: vi.fn(), verify: vi.fn(), decide: vi.fn() }
let app: INestApplication
let base: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [ActivityExtensionsController],
    providers: [{ provide: ActivityExtensionsService, useValue: service }],
  }).compile()
  app = module.createNestApplication({ logger: false })
  // Stands in for the identity the auth guard attaches, since the guard is not under test here.
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
  base = `http://127.0.0.1:${port}/projects/${projectId}/activities/${activityId}/extension-requests`
})

beforeEach(() => {
  for (const method of Object.values(service))
    method.mockReset().mockResolvedValue({ id: requestId })
})
afterAll(async () => app?.close())

// Sends a JSON body and returns the status with the parsed response body.
async function post(path: string, body: unknown) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

describe('extension request body validation', () => {
  it('forwards the request, verify and decide bodies as sent', async () => {
    const created = { clientMutationId: mutationId, requestedEndDate: '2026-12-31', reason: note }
    expect((await post('', created)).status).toBe(201)
    expect(service.request).toHaveBeenCalledWith(actor, projectId, activityId, created)

    const verify = { decision: 'VERIFY', note, expectedUpdatedAt: instant }
    expect((await post(`/${requestId}/verify`, verify)).status).toBe(201)
    expect(service.verify).toHaveBeenCalledWith(actor, projectId, activityId, requestId, verify)

    const decide = {
      clientMutationId: mutationId,
      decision: 'APPROVE',
      note,
      expectedUpdatedAt: instant,
      activityExpectedUpdatedAt: instant,
    }
    expect((await post(`/${requestId}/decide`, decide)).status).toBe(201)
    expect(service.decide).toHaveBeenCalledWith(actor, projectId, activityId, requestId, decide)
  })

  it.each([
    [
      'a timestamp as the requested end date',
      '',
      { clientMutationId: mutationId, requestedEndDate: instant, reason: note },
    ],
    [
      'a short reason',
      '',
      { clientMutationId: mutationId, requestedEndDate: '2026-12-31', reason: 'short' },
    ],
    [
      'an unknown verify decision',
      `/${requestId}/verify`,
      { decision: 'APPROVE', note, expectedUpdatedAt: instant },
    ],
    [
      'a decide body without the activity version',
      `/${requestId}/decide`,
      { clientMutationId: mutationId, decision: 'DECLINE', note, expectedUpdatedAt: instant },
    ],
    [
      'an unknown key',
      '',
      { clientMutationId: mutationId, requestedEndDate: '2026-12-31', reason: note, extra: true },
    ],
  ])('answers 400 for %s without calling the service', async (_label, path, body) => {
    expect(await post(path, body)).toEqual({
      status: 400,
      body: {
        statusCode: 400,
        error: 'Bad Request',
        message: expect.arrayContaining([expect.any(String)]),
      },
    })
    for (const method of Object.values(service)) expect(method).not.toHaveBeenCalled()
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/activity-extensions/activity-extensions.controller.validation.test.ts`
Expected: FAIL, 5 of 6 tests (the raw-body forwarding test passes).

- [ ] **Step 5: Create the option files and run the switch and the tidy**

Create `.tmp/s2/extension-edits.mjs` (the controller loses its DTO import and its private identity guard):

```js
export default [
  {
    file: 'apps/api/src/modules/activity-extensions/activity-extensions.controller.ts',
    edits: [
      [/\/\/ biome-ignore lint\/style\/useImportType[^\n]*\nimport \{[^}]*\} from '\.\/activity-extensions\.dto'\n/, '', 1],
      [/function profile\(request: AuthenticatedRequest\) \{\n[^}]*\}\n\n/, '', 1],
    ],
  },
]
```

Create `.tmp/s2/extension-split.mjs` (the row mapper and three pure helpers leave the service verbatim):

```js
const dir = 'apps/api/src/modules/activity-extensions'
export default {
  source: `${dir}/activity-extensions.service.ts`,
  moves: [
    {
      to: `${dir}/activity-extensions.mapper.ts`,
      header: `import type { ActivityExtension } from '@pathways/shared'
import type { Prisma } from '@prisma/client'

`,
      replacements: [
        ['const extensionSelection = {', 'export const extensionSelection = {', 1],
        ['type ExtensionRow =', 'export type ExtensionRow =', 1],
        ['const day = (', 'export const day = (', 1],
        ['function mapExtension(', 'export function mapExtension(', 1],
      ],
      blocks: [
        { first: 'const person = { select: { id: true, fullName: true } } as const', last: 'const person = { select: { id: true, fullName: true } } as const' },
        { first: 'const extensionSelection = {', last: '} as const' },
        { first: 'type ExtensionRow = Prisma.ActivityExtensionRequestGetPayload<{', last: '}>' },
        { first: 'const day = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null)', last: 'const day = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null)' },
        { first: 'const named = (value: { id: string; fullName: string } | null) =>', last: '  value ? { id: value.id, name: value.fullName.slice(0, 200) } : null' },
        { first: 'function mapExtension(row: ExtensionRow): ActivityExtension {', last: '}' },
      ],
    },
    {
      to: `${dir}/activity-extensions.helpers.ts`,
      header: `import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { hasAtomicPermission } from '@pathways/shared'

import type { ApplicationIdentity } from '../../common/authz/application-identity'

`,
      replacements: [
        ['function writeError(', 'export function writeError(', 1],
        ['function soleRole(', 'export function soleRole(', 1],
        ['function sameInstant(', 'export function sameInstant(', 1],
      ],
      blocks: [
        { first: 'function writeError(error: unknown): never {', last: '}' },
        { first: 'function soleRole(actor: ApplicationIdentity, role: string, permission: string) {', last: '}' },
        { first: 'function sameInstant(expected: string, actual: Date) {', last: '}' },
      ],
    },
  ],
  sourceReplacements: [],
}
```

Create `.tmp/s2/s3-extensions.sh`:

```bash
D=apps/api/src/modules/activity-extensions
C=$D/activity-extensions.controller.ts
S=$D/activity-extensions.service.ts
# Controller: contracts and the shared identity guard.
node .tmp/s2/replace-exact.mjs .tmp/s2/extension-edits.mjs
sed -i -e 's/@Body() body: RequestActivityExtensionDto/@Body(new ZodPipe(createActivityExtensionRequest)) body: CreateActivityExtensionRequest/' -e 's/@Body() body: VerifyActivityExtensionDto/@Body(new ZodPipe(verifyActivityExtensionRequest)) body: VerifyActivityExtensionRequest/' -e 's/@Body() body: DecideActivityExtensionDto/@Body(new ZodPipe(decideActivityExtensionRequest)) body: DecideActivityExtensionRequest/' -e 's/profile(request)/requestIdentity(request)/g' $C
node .tmp/s2/imports.mjs add $C '@pathways/shared' type:CreateActivityExtensionRequest type:DecideActivityExtensionRequest type:VerifyActivityExtensionRequest createActivityExtensionRequest decideActivityExtensionRequest verifyActivityExtensionRequest
node .tmp/s2/imports.mjs add $C '../../common/validation/zod-pipe' ZodPipe
node .tmp/s2/imports.mjs add $C '../../common/authz/request-identity' requestIdentity
grep -c "ZodPipe(" $C
# Service: contract types.
sed -i -e 's/\bRequestActivityExtensionDto\b/CreateActivityExtensionRequest/g' -e 's/\bVerifyActivityExtensionDto\b/VerifyActivityExtensionRequest/g' -e 's/\bDecideActivityExtensionDto\b/DecideActivityExtensionRequest/g' $S
node .tmp/s2/imports.mjs move $S './activity-extensions.dto' '@pathways/shared' CreateActivityExtensionRequest VerifyActivityExtensionRequest DecideActivityExtensionRequest
git rm -q $D/activity-extensions.dto.ts $D/activity-extension-request-parity.test.ts
cp $S .tmp/s2/activity-extensions.service.before-split.ts
node .tmp/s2/move-blocks.mjs .tmp/s2/extension-split.mjs
node .tmp/s2/imports.mjs add $S './activity-extensions.mapper' type:ExtensionRow day extensionSelection mapExtension
node .tmp/s2/imports.mjs add $S './activity-extensions.helpers' sameInstant soleRole writeError
node .tmp/s2/imports.mjs prune $S
node .tmp/s2/imports.mjs prune $C
node .tmp/s2/imports.mjs prune $D/activity-extensions.mapper.ts
node .tmp/s2/imports.mjs prune $D/activity-extensions.helpers.ts
node .tmp/s2/same-lines.mjs .tmp/s2/activity-extensions.service.before-split.ts -- $S $D/activity-extensions.mapper.ts $D/activity-extensions.helpers.ts
```

Run it as one block and stop at the first error:

```bash
bash -e .tmp/s2/s3-extensions.sh
```

Expected: `extension-edits.mjs` prints `activity-extensions.controller.ts: 2 edits`, then `3` (three `ZodPipe` pipes); the moves print `activity-extensions.mapper.ts: 57 lines`, `activity-extensions.helpers.ts: 35 lines` and `activity-extensions.service.ts: 369 lines`; the prune lines name `ActivityExtension, hasAtomicPermission, Prisma` for the service and `ForbiddenException` for the controller; the last command prints `same lines: 412`. Any other `same-lines` output: stop, the move is not verbatim.

- [ ] **Step 6: Run the tests and commit**

```bash
git add -N apps/api packages/shared
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts')
pnpm --filter @pathways/api exec vitest run src/modules/activity-extensions src/common
pnpm --filter @pathways/shared exec vitest run src/contracts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/shared test 2>&1 | grep -E "Tests +[0-9]+"
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api packages/shared
git commit -m "refactor(api): validate the activity extension bodies with the shared contracts

The extension DTOs are removed; the service moves its row mapper and pure helpers into their own files.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the 6 HTTP tests and the 13 service tests pass; shared = `B_shared + 48`, api = `B_api + 3` (the 47 parity tests leave, 6 HTTP tests arrive). The extension service is 378 lines; it stays one service because the four operations share the request, scope and read-back helpers.

---

### Task 4: Split the controllers by purpose

**Files:**
- Test: `apps/api/src/modules/activities/activities.module.routes.test.ts`, `apps/api/src/modules/activities/activities.controller.routing.test.ts`
- Create: `apps/api/src/modules/activities/activity-updates.controller.ts`, `apps/api/src/modules/activities/activity-proofs.controller.ts`, `apps/api/src/modules/activities/activity-milestones.controller.ts`, `apps/api/src/modules/activities/activity-evidence.controller.ts`
- Modify: `apps/api/src/modules/activities/activities.controller.ts`, `apps/api/src/modules/activities/activities.module.ts`, and the tests that name a moved controller: `activities.controller.validation.test.ts`, `activities.inspection-controller.test.ts`, `activity-capabilities.test.ts`, `activity-milestones.test.ts`, `activity-overdue-explanation.test.ts`, `activity-progress.test.ts`, `activity-proof-media.test.ts`, `evidence-list.access.test.ts`
- Create: `.tmp/s2/controller-split.mjs`, `.tmp/s2/controller-edits.mjs`

**Interfaces:**
- Consumes: `requestIdentity`; `ZodPipe`.
- Produces: `ActivitiesController` (list, `proof-upload-limits`, `context`, `assignable-officers`, create, detail, update, transition), `ActivityUpdatesController` (progress, overdue explanation, reserve, finalize, review), `ActivityProofsController` (inspection context, inspection, proof download), `MilestonesController` in `activity-milestones.controller.ts`, `EvidenceController` in `activity-evidence.controller.ts`; the module lists `ActivitiesController` first. Every route keeps its verb, path and permission.

- [ ] **Step 1: Pin the route table, the order and the fixed GET routes**

The first test reads the controllers from the module metadata, so it holds before and after the split: the 20 routes with their permissions, each fixed GET segment registered before `GET :activityId`, and no retired multipart route. Create `apps/api/src/modules/activities/activities.module.routes.test.ts`:

```ts
import 'reflect-metadata'

import { RequestMethod } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { describe, expect, it } from 'vitest'

import { PERMISSION_KEY } from '../../common/decorators/permission.decorator'
import { ActivitiesModule } from './activities.module'

type Route = { verb: string; path: string; permission: string }

// Every route the module registers, in Nest registration order: controller order, then method order.
function registeredRoutes(): Route[] {
  const controllers: (new (...args: never[]) => object)[] =
    Reflect.getMetadata('controllers', ActivitiesModule) ?? []
  return controllers.flatMap((controller) => {
    const prefix = Reflect.getMetadata(PATH_METADATA, controller) as string
    return Object.getOwnPropertyNames(controller.prototype).flatMap((name) => {
      if (name === 'constructor') return []
      const handler = (controller.prototype as Record<string, object>)[name]
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined
      if (method === undefined) return []
      // Nest stores the bare decorator as "/", so slashes at either end are not part of the segment.
      const path = String(Reflect.getMetadata(PATH_METADATA, handler) ?? '').replace(
        /^\/+|\/+$/g,
        '',
      )
      return [
        {
          verb: RequestMethod[method],
          path: path ? `${prefix}/${path}` : prefix,
          permission: Reflect.getMetadata(PERMISSION_KEY, handler) as string,
        },
      ]
    })
  })
}

const activities = 'projects/:projectId/activities'
const expected: Route[] = [
  { verb: 'GET', path: activities, permission: 'activities.read' },
  { verb: 'GET', path: `${activities}/proof-upload-limits`, permission: 'activities.proof.submit' },
  { verb: 'GET', path: `${activities}/context`, permission: 'activities.context.read' },
  { verb: 'GET', path: `${activities}/assignable-officers`, permission: 'activities.read' },
  { verb: 'POST', path: activities, permission: 'activities.create' },
  { verb: 'GET', path: `${activities}/:activityId`, permission: 'activities.read' },
  { verb: 'PATCH', path: `${activities}/:activityId`, permission: 'activities.update' },
  { verb: 'POST', path: `${activities}/:activityId/transition`, permission: 'activities.read' },
  {
    verb: 'POST',
    path: `${activities}/:activityId/progress`,
    permission: 'activities.progress.update',
  },
  {
    verb: 'POST',
    path: `${activities}/:activityId/overdue-explanations`,
    permission: 'monitoring.review',
  },
  {
    verb: 'POST',
    path: `${activities}/:activityId/updates/reservations`,
    permission: 'activities.proof.submit',
  },
  {
    verb: 'POST',
    path: `${activities}/:activityId/updates/:updateId/files/:evidenceId/finalize`,
    permission: 'activities.proof.submit',
  },
  {
    verb: 'POST',
    path: `${activities}/:activityId/updates/:updateId/review`,
    permission: 'evidence.review',
  },
  {
    verb: 'GET',
    path: `${activities}/:activityId/updates/:updateId/inspection-context`,
    permission: 'evidence.review',
  },
  {
    verb: 'GET',
    path: `${activities}/:activityId/updates/:updateId/proof/:evidenceId/inspection`,
    permission: 'evidence.review',
  },
  { verb: 'GET', path: `${activities}/:activityId/proof/:evidenceId`, permission: 'evidence.read' },
  { verb: 'GET', path: 'projects/:projectId/milestones', permission: 'activities.read' },
  { verb: 'POST', path: 'projects/:projectId/milestones', permission: 'milestones.manage' },
  {
    verb: 'PATCH',
    path: 'projects/:projectId/milestones/:milestoneId',
    permission: 'milestones.manage',
  },
  { verb: 'GET', path: 'projects/:projectId/evidence', permission: 'evidence.read' },
]

const key = (route: Route) => `${route.verb} ${route.path}`

describe('activities module routes', () => {
  it('registers the same routes with the same permissions after any controller split', () => {
    const actual = registeredRoutes()
    expect(actual.map(key).sort()).toEqual(expected.map(key).sort())
    for (const route of expected)
      expect(actual.find((item) => key(item) === key(route))?.permission).toBe(route.permission)
  })

  it('registers each fixed GET segment before the :activityId detail route', () => {
    const order = registeredRoutes().map(key)
    const detail = order.indexOf(`GET ${activities}/:activityId`)
    for (const segment of ['proof-upload-limits', 'context', 'assignable-officers'])
      expect(order.indexOf(`GET ${activities}/${segment}`)).toBeLessThan(detail)
  })

  it('has no retired multipart update route', () => {
    expect(registeredRoutes().map((route) => route.path)).not.toContain(
      `${activities}/:activityId/updates`,
    )
  })
})
```

The second test serves the module's controllers over HTTP with a stand-in service that answers with its own method name, so a route that reaches the wrong handler shows. Create `apps/api/src/modules/activities/activities.controller.routing.test.ts`:

```ts
import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import type { INestApplication, Type } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { ActivitiesModule } from './activities.module'

const projectId = '10000000-0000-4000-8000-000000000001'
const activityId = '20000000-0000-4000-8000-000000000002'
const actor = { id: '50000000-0000-4000-8000-000000000005', aal: 'aal2' }

// A stand-in service whose every method answers with its own name, so a route shows which handler ran.
const fake = () => {
  const methods = new Map<string | symbol, unknown>()
  return new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === 'then') return undefined
        if (!methods.has(property))
          methods.set(
            property,
            vi.fn(async () => ({ handled: String(property) })),
          )
        return methods.get(property)
      },
    },
  )
}

let app: INestApplication
let base: string

beforeAll(async () => {
  const providers: Type<unknown>[] = Reflect.getMetadata('providers', ActivitiesModule)
  const module = await Test.createTestingModule({
    controllers: Reflect.getMetadata('controllers', ActivitiesModule),
    providers: providers.map((provider) => ({ provide: provider, useValue: fake() })),
  }).compile()
  app = module.createNestApplication({ logger: false })
  // Stands in for the identity the auth guard attaches, since the guard is not under test here.
  app.use((request: { user?: unknown }, _response: unknown, next: () => void) => {
    request.user = actor
    next()
  })
  await app.listen(0, '127.0.0.1')
  const { port } = app.getHttpServer().address() as AddressInfo
  base = `http://127.0.0.1:${port}/projects/${projectId}/activities`
})
afterAll(async () => app?.close())

const handled = async (path: string) => {
  const response = await fetch(`${base}${path}`)
  return { status: response.status, body: await response.json() }
}

describe('activity routes over HTTP', () => {
  it.each([
    ['/proof-upload-limits', 'proofUploadLimits'],
    ['/context', 'context'],
    ['/assignable-officers', 'assignableOfficers'],
    [`/${activityId}`, 'get'],
    ['', 'list'],
  ])('GET %s reaches the %s handler, not the :activityId detail route', async (path, name) => {
    expect(await handled(path)).toEqual({ status: 200, body: { handled: name } })
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/activities/activities.module.routes.test.ts src/modules/activities/activities.controller.routing.test.ts`
Expected: PASS, 3 and 5 tests, against the single controller file.

- [ ] **Step 2: Create the option files**

Create `.tmp/s2/controller-split.mjs` (each route method moves verbatim, with its decorators and its leading comment; `profile(request)` becomes `requestIdentity(request)`):

```js
const dir = 'apps/api/src/modules/activities'
const imports = `import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common'

import {
  type CreateActivityRequest,
  type RecordActivityProgressRequest,
  type RecordOverdueExplanationRequest,
  type ReserveActivityProofRequest,
  type ReviewActivityUpdateRequest,
  type SaveMilestoneRequest,
  type TransitionActivityRequest,
  type UpdateActivityRequest,
  type UpdateMilestoneRequest,
  recordActivityProgressRequest,
  recordOverdueExplanationRequest,
  reserveActivityProofRequest,
  reviewActivityUpdateRequest,
  saveMilestoneRequest,
  updateMilestoneRequest,
} from '@pathways/shared'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { inspectionRequestBudget } from '../../common/network/inspection-request-budget'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { ActivitiesService } from './activities.service'
import {
  PrivateProofInspectionService,
  inspectionRevisions,
} from './private-proof-inspection.service'

`
const method = (first) => ({ first, last: '  }' })
export default {
  source: `${dir}/activities.controller.ts`,
  moves: [
    {
      to: `${dir}/activity-updates.controller.ts`,
      header: `${imports}// Progress notes, overdue explanations and the proof reserve, finalize and review steps of one activity.
@Controller('projects/:projectId/activities')
export class ActivityUpdatesController {
  constructor(@Inject(ActivitiesService) private readonly activities: ActivitiesService) {}

`,
      footer: '}\n',
      replacements: [['profile(request)', 'requestIdentity(request)', 5]],
      blocks: [
        method("  @Post(':activityId/progress')"),
        method("  @Post(':activityId/overdue-explanations')"),
        method("  @Post(':activityId/updates/reservations')"),
        method("  @Post(':activityId/updates/:updateId/files/:evidenceId/finalize')"),
        method("  @Post(':activityId/updates/:updateId/review')"),
      ],
    },
    {
      to: `${dir}/activity-proofs.controller.ts`,
      header: `${imports}// Private proof inspection and download for reviewers.
@Controller('projects/:projectId/activities')
export class ActivityProofsController {
  constructor(
    @Inject(ActivitiesService) private readonly activities: ActivitiesService,
    @Inject(PrivateProofInspectionService)
    private readonly inspection: PrivateProofInspectionService,
  ) {}

`,
      footer: '}\n',
      replacements: [['profile(request)', 'requestIdentity(request)', 3]],
      blocks: [
        method("  @Get(':activityId/updates/:updateId/inspection-context')"),
        method("  @Get(':activityId/updates/:updateId/proof/:evidenceId/inspection')"),
        method("  @Get(':activityId/proof/:evidenceId')"),
      ],
    },
    {
      to: `${dir}/activity-milestones.controller.ts`,
      header: imports,
      replacements: [['profile(request)', 'requestIdentity(request)', 3]],
      blocks: [{ first: "@Controller('projects/:projectId/milestones')", last: '}' }],
    },
    {
      to: `${dir}/activity-evidence.controller.ts`,
      header: imports,
      replacements: [['profile(request)', 'requestIdentity(request)', 1]],
      blocks: [{ first: "@Controller('projects/:projectId/evidence')", last: '}' }],
    },
    {
      to: null,
      blocks: [{ first: 'function profile(request: AuthenticatedRequest) {', last: '}' }],
    },
  ],
  sourceReplacements: [['profile(request)', 'requestIdentity(request)', 7]],
}
```

Create `.tmp/s2/controller-edits.mjs` (module wiring, the one constructor that loses its inspection service, and the tests that name a moved class):

```js
const dir = 'apps/api/src/modules/activities'
export default [
  {
    file: `${dir}/activities.controller.ts`,
    edits: [
      [
        `  constructor(
    @Inject(ActivitiesService) private readonly activities: ActivitiesService,
    @Inject(PrivateProofInspectionService)
    private readonly inspection: PrivateProofInspectionService,
  ) {}
`,
        '  constructor(@Inject(ActivitiesService) private readonly activities: ActivitiesService) {}\n',
        1,
      ],
    ],
  },
  {
    file: `${dir}/activities.module.ts`,
    edits: [
      [
        "import {\n  ActivitiesController,\n  EvidenceController,\n  MilestonesController,\n} from './activities.controller'\n",
        "import { ActivitiesController } from './activities.controller'\nimport { EvidenceController } from './activity-evidence.controller'\nimport { MilestonesController } from './activity-milestones.controller'\nimport { ActivityProofsController } from './activity-proofs.controller'\nimport { ActivityUpdatesController } from './activity-updates.controller'\n",
        1,
      ],
      [
        '  controllers: [ActivitiesController, EvidenceController, MilestonesController],\n',
        '  // The fixed GET segments of ActivitiesController register before any :activityId route.\n  controllers: [\n    ActivitiesController,\n    ActivityUpdatesController,\n    ActivityProofsController,\n    MilestonesController,\n    EvidenceController,\n  ],\n',
        1,
      ],
    ],
  },
  {
    file: `${dir}/activities.controller.validation.test.ts`,
    edits: [
      [
        "import { ActivitiesController, MilestonesController } from './activities.controller'\n",
        "import { ActivitiesController } from './activities.controller'\nimport { MilestonesController } from './activity-milestones.controller'\nimport { ActivityUpdatesController } from './activity-updates.controller'\n",
        1,
      ],
      ['controllers: [ActivitiesController, MilestonesController],', 'controllers: [ActivitiesController, ActivityUpdatesController, MilestonesController],', 1],
    ],
  },
  {
    file: `${dir}/activities.inspection-controller.test.ts`,
    edits: [
      ["import { ActivitiesController } from './activities.controller'\nimport type { ActivitiesService } from './activities.service'\n", "import type { ActivitiesService } from './activities.service'\nimport { ActivityProofsController } from './activity-proofs.controller'\n", 1],
      ['new ActivitiesController(', 'new ActivityProofsController(', 1],
    ],
  },
  {
    file: `${dir}/activity-capabilities.test.ts`,
    edits: [
      [
        "    const controller = new ActivitiesController(\n      { assignableOfficers: vi.fn() } as unknown as ActivitiesService,\n      {} as never,\n    )\n",
        "    const controller = new ActivitiesController({\n      assignableOfficers: vi.fn(),\n    } as unknown as ActivitiesService)\n",
        1,
      ],
    ],
  },
  {
    file: `${dir}/activity-milestones.test.ts`,
    edits: [["import { MilestonesController } from './activities.controller'", "import { MilestonesController } from './activity-milestones.controller'", 1]],
  },
  {
    file: `${dir}/evidence-list.access.test.ts`,
    edits: [["import { EvidenceController } from './activities.controller'", "import { EvidenceController } from './activity-evidence.controller'", 1]],
  },
  {
    file: `${dir}/activity-overdue-explanation.test.ts`,
    edits: [
      ["import { ActivitiesController } from './activities.controller'", "import { ActivityUpdatesController } from './activity-updates.controller'", 1],
      ['ActivitiesController.prototype.recordOverdueExplanation', 'ActivityUpdatesController.prototype.recordOverdueExplanation', 1],
    ],
  },
  {
    file: `${dir}/activity-progress.test.ts`,
    edits: [
      ["import { ActivitiesController } from './activities.controller'", "import { ActivityUpdatesController } from './activity-updates.controller'", 1],
      ['ActivitiesController.prototype.recordProgress', 'ActivityUpdatesController.prototype.recordProgress', 1],
    ],
  },
  {
    file: `${dir}/activity-proof-media.test.ts`,
    edits: [
      ["import { ActivitiesController } from './activities.controller'\n", "import { ActivitiesController } from './activities.controller'\nimport { ActivityUpdatesController } from './activity-updates.controller'\n", 1],
      [
        `    for (const method of ['reserveProof', 'finalizeProofFile', 'proofUploadLimits'] as const)
      expect(Reflect.getMetadata(PERMISSION_KEY, ActivitiesController.prototype[method])).toBe(
        'activities.proof.submit',
      )
    const paths = Object.getOwnPropertyNames(ActivitiesController.prototype).map((name) =>
      Reflect.getMetadata(
        PATH_METADATA,
        (ActivitiesController.prototype as unknown as Record<string, object>)[name],
      ),
    )
`,
        `    for (const method of ['reserveProof', 'finalizeProofFile'] as const)
      expect(Reflect.getMetadata(PERMISSION_KEY, ActivityUpdatesController.prototype[method])).toBe(
        'activities.proof.submit',
      )
    expect(
      Reflect.getMetadata(PERMISSION_KEY, ActivitiesController.prototype.proofUploadLimits),
    ).toBe('activities.proof.submit')
    const paths = [ActivitiesController, ActivityUpdatesController].flatMap((controller) =>
      Object.getOwnPropertyNames(controller.prototype).map((name) =>
        Reflect.getMetadata(
          PATH_METADATA,
          (controller.prototype as unknown as Record<string, object>)[name],
        ),
      ),
    )
`,
        1,
      ],
      ["    expect('submitUpdate' in ActivitiesController.prototype).toBe(false)\n", "    expect('submitUpdate' in ActivityUpdatesController.prototype).toBe(false)\n", 1],
    ],
  },
]
```

- [ ] **Step 3: Split**

Create `.tmp/s2/s4-controllers.sh`:

```bash
A=apps/api/src/modules/activities
node .tmp/s2/move-blocks.mjs .tmp/s2/controller-split.mjs
node .tmp/s2/replace-exact.mjs .tmp/s2/controller-edits.mjs
node .tmp/s2/imports.mjs add $A/activities.controller.ts '../../common/authz/request-identity' requestIdentity
for f in activities activity-updates activity-proofs activity-milestones activity-evidence; do node .tmp/s2/imports.mjs prune $A/$f.controller.ts; done
```

Run it as one block and stop at the first error:

```bash
bash -e .tmp/s2/s4-controllers.sh
```

Expected: the cuts print `10`, `10`, `12`, `17`, `11` lines for the five update routes (`activity-updates.controller.ts: 115 lines`), `13`, `40`, `22` for the three proof routes (`activity-proofs.controller.ts: 132 lines`), `31` for the milestones class (`activity-milestones.controller.ts: 76 lines`), `10` for the evidence class (`activity-evidence.controller.ts: 55 lines`) and `4` for the identity guard (`activities.controller.ts: 130 lines`); the edit script prints ten files with `1 edits` to `3 edits`; each controller prune names the imports it does not use.

- [ ] **Step 4: Run the tests and commit**

```bash
git add -N apps/api packages/shared
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts')
pnpm --filter @pathways/api exec vitest run src/modules/activities src/app-module-wiring.test.ts src/common
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api
git commit -m "refactor(api): split the activities controller by purpose

ActivitiesController keeps every fixed GET segment and registers first; the route table, order and permissions are pinned by tests.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the route table and HTTP tests still pass, typecheck and lint pass, wiring test passes; api = `B_api + 11`.

---

### Task 5: Response contracts, the activity mapper and the pure helpers

**Files:**
- Create: `packages/shared/src/contracts/common/source-mutation-acknowledgement.ts`, `packages/shared/src/contracts/activities/activity-responses.ts`
- Modify: `packages/shared/src/index.ts` (barrel lines)
- Create: `apps/api/src/modules/activities/activities.mapper.ts`, `apps/api/src/modules/activities/activities.helpers.ts`
- Modify: `apps/api/src/modules/activities/activity-proof.helpers.ts` (completed), `apps/api/src/modules/activities/activities.service.ts` (the moved blocks removed), `apps/api/src/modules/beneficiary-media/beneficiary-media.service.ts`, `apps/api/src/modules/activities/activity-capabilities.test.ts`, `apps/api/src/modules/activities/activity-proof-media.test.ts` (imports)
- Move: `apps/api/src/modules/activities/activities.service.test.ts` -> `activities.helpers.test.ts`
- Create: `.tmp/s2/helpers-split.mjs`, `.tmp/s2/helpers-lines.mjs`, `.tmp/s2/helpers-test-cut.mjs`

**Interfaces:**
- Consumes: the Task 1 evidence constants; `hasAtomicPermission`.
- Produces, from `@pathways/shared`: `sourceMutationAcknowledgement` with `type SourceMutationAcknowledgement`; `activityCapabilitiesResponse`, `activityResponse` (the detail record plus `capabilities`), `activityMutationResponse` (plus `sourceAcknowledgement`), `activityListItemResponse`, `activityContextItemResponse`, `assignableOfficerResponse`, `activityEvidenceListResponse`, `activityProofUploadLimitsResponse`, `activityProofReservationResponse`, `activityProofFinalizeResponse` with their types, and the mapper-side types `ActivityRecordResponse` and `ActivityListItemRecordResponse`. From `activities.mapper.ts`: `activitySelection`, `activityListSelection`, `personalAssignmentCount(actor)`, `type ActivityRow`, `type ActivityListRow`, `type ActivityReadMetrics`, `emptyActivityReadMetrics`, `mapActivity(row, businessDate, metrics?, viewerId?): ActivityRecordResponse`, `mapActivityListItem(row, businessDate): ActivityListItemRecordResponse`. From `activities.helpers.ts`: `assignableOfficerLimit`, `storedStatus`, `reviewStatus`, `calendarDate`, `activityPresentationStatus`, `activityTransitionAllowed`, `activityCapabilities`, `updateKind`, `hasExplanationSinceDue`, `validateActivityDates(start: string, end: string, project: { startDate: Date | null; endDate: Date | null }, timelineOverrideJustification?: string | null): string | null`. From `activity-proof.helpers.ts`: `PROOF_STORAGE_DEADLINE_MS`, `evidenceExtension`, `activityEvidenceType`, `activityEvidenceLimits`, `proofDeclarations`, `declarationKey`, `verificationFailure`, `proofFinalizeBody`.

- [ ] **Step 1: Add the response contracts**

Create `packages/shared/src/contracts/common/source-mutation-acknowledgement.ts`:

```ts
import { z } from 'zod'

// Receipt the source mutation routes answer with when a retry replays a committed request or accompanies a new record.
export const sourceMutationAcknowledgement = z.object({
  requestId: z.string(),
  committed: z.literal(true),
  replayed: z.boolean(),
})
export type SourceMutationAcknowledgement = z.infer<typeof sourceMutationAcknowledgement>
```

Create `packages/shared/src/contracts/activities/activity-responses.ts`:

```ts
import { z } from 'zod'

import { sourceMutationAcknowledgement } from '../common/source-mutation-acknowledgement'
import { activityEvidenceContentTypes } from './activity-evidence'

// Types the response shapes of the activity routes, which are never parsed at runtime.

const storedStatus = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'FOR_REVIEW', 'COMPLETED', 'CANCELLED'])
const presentedStatus = z.enum([
  'Planned',
  'In Progress',
  'For Review',
  'Completed',
  'Cancelled',
  'Overdue',
])
const reviewLabel = z.enum(['Submitted', 'Accepted', 'Flagged'])

// Holds advisory per-activity flags for the calling user, while every mutation re-checks its own authority.
export const activityCapabilitiesResponse = z.object({
  canEdit: z.boolean(),
  canRecordProgress: z.boolean(),
  canSubmitProof: z.boolean(),
  canExplainOverdue: z.boolean(),
})
export type ActivityCapabilitiesResponse = z.infer<typeof activityCapabilitiesResponse>

const activityRecord = z.object({
  id: z.string(),
  projectId: z.string(),
  code: z.string(),
  title: z.string(),
  description: z.string(),
  activityType: z.string().nullable(),
  timelineOverrideJustification: z.string().nullable(),
  storedStatus,
  status: presentedStatus,
  overdue: z.boolean(),
  startDate: z.string(),
  dueDate: z.string(),
  actualStartDate: z.string().nullable(),
  actualEndDate: z.string().nullable(),
  assignedUserIds: z.array(z.string()),
  assignedTo: z.array(z.string()),
  assignedEmails: z.array(z.string()),
  journeyStageIds: z.array(z.string()),
  journeyStageId: z.string(),
  indicatorIds: z.array(z.string()),
  targetBeneficiaries: z.number(),
  beneficiariesReached: z.number(),
  budgetAllocation: z.string().nullable(),
  progress: z.number(),
  reviewedById: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  submittedProof: z.array(
    z.object({
      id: z.string(),
      updateId: z.string(),
      fileName: z.string(),
      status: reviewLabel,
      rejectionReason: z.string().nullable(),
      submittedAt: z.string(),
      submittedBy: z.string(),
      updateUpdatedAt: z.string(),
      note: z.string(),
    }),
  ),
  updateNotes: z.array(
    z.object({
      id: z.string(),
      proofIncomplete: z.boolean(),
      resumeClientUpdateId: z.string().nullable(),
      kind: z.enum(['proof', 'progress']),
      note: z.string(),
      progress: z.number(),
      beneficiariesReachedThisSession: z.number().nullable(),
      status: reviewLabel,
      submittedBy: z.string(),
      submittedAt: z.string(),
      reviewedBy: z.string().nullable(),
      reviewedAt: z.string().nullable(),
      reviewReason: z.string().nullable(),
      updatedAt: z.string(),
    }),
  ),
  updatedAt: z.string(),
  budgetLogged: z.string().nullable(),
  budgetLoggedEntries: z.number().nullable(),
  overdueExplanations: z.array(
    z.object({
      id: z.string(),
      category: z.string(),
      explanation: z.string(),
      actorName: z.string(),
      recordedAt: z.string(),
    }),
  ),
  overdueExplanationNeeded: z.boolean(),
})
// The activity as the mapper builds it, before the caller's capabilities are added.
export type ActivityRecordResponse = z.infer<typeof activityRecord>

// One activity as the detail, progress, explanation and read-back routes return it.
export const activityResponse = activityRecord.extend({
  capabilities: activityCapabilitiesResponse,
})
export type ActivityResponse = z.infer<typeof activityResponse>

// One activity after a source mutation, with the receipt of the committed request.
export const activityMutationResponse = activityResponse.extend({
  sourceAcknowledgement: sourceMutationAcknowledgement,
})
export type ActivityMutationResponse = z.infer<typeof activityMutationResponse>

const activityListRecord = z.object({
  id: z.string(),
  projectId: z.string(),
  code: z.string(),
  title: z.string(),
  description: z.string(),
  storedStatus,
  status: presentedStatus,
  overdue: z.boolean(),
  startDate: z.string(),
  dueDate: z.string(),
  assignedUserIds: z.array(z.string()),
  assignedTo: z.array(z.string()),
  journeyStageIds: z.array(z.string()),
  journeyStageId: z.string(),
  indicatorIds: z.array(z.string()),
  targetBeneficiaries: z.number(),
  progress: z.number(),
  updatedAt: z.string(),
  overdueExplanationNeeded: z.boolean(),
})
// A list row as the mapper builds it, before the per-viewer metrics are added.
export type ActivityListItemRecordResponse = z.infer<typeof activityListRecord>

// One row of GET /projects/:projectId/activities.
export const activityListItemResponse = activityListRecord.extend({
  indicatorCount: z.number(),
  beneficiariesTarget: z.number().nullable(),
  beneficiariesReached: z.number().nullable(),
  budgetUtilization: z.number().nullable(),
  capabilities: activityCapabilitiesResponse,
})
export type ActivityListItemResponse = z.infer<typeof activityListItemResponse>

// One row of GET /projects/:projectId/activities/context.
export const activityContextItemResponse = z.object({
  id: z.string(),
  title: z.string(),
  status: storedStatus,
  journeyStageId: z.string(),
})
export type ActivityContextItemResponse = z.infer<typeof activityContextItemResponse>

// One row of GET /projects/:projectId/activities/assignable-officers.
export const assignableOfficerResponse = z.object({ userId: z.string(), displayName: z.string() })
export type AssignableOfficerResponse = z.infer<typeof assignableOfficerResponse>

// Body of GET /projects/:projectId/evidence: counts for aggregate-only roles, records for the rest.
export const activityEvidenceListResponse = z.union([
  z.object({
    scope: z.literal('aggregate'),
    activities: z.array(
      z.object({
        activityId: z.string(),
        activityTitle: z.string(),
        total: z.number(),
        submitted: z.number(),
        approved: z.number(),
        returned: z.number(),
      }),
    ),
  }),
  z.object({
    scope: z.literal('detail'),
    records: z.array(
      z.object({
        id: z.string(),
        projectId: z.string(),
        activityId: z.string(),
        updateId: z.string(),
        updateUpdatedAt: z.string(),
        fileName: z.string(),
        reportTitle: z.string(),
        status: z.enum(['Approved', 'Returned', 'Submitted']),
        submitter: z.string(),
        submittedDate: z.string(),
        contentType: z.string().nullable(),
        byteSize: z.number(),
        isIdentifying: z.boolean(),
        reviewedDate: z.string().nullable(),
        reviewer: z.string().nullable(),
        previewSummary: z.string(),
      }),
    ),
  }),
])
export type ActivityEvidenceListResponse = z.infer<typeof activityEvidenceListResponse>

// Body of GET /projects/:projectId/activities/proof-upload-limits.
export const activityProofUploadLimitsResponse = z.object({
  maxFiles: z.number(),
  maxFileBytes: z.number(),
  maxTotalBytes: z.number(),
  contentTypes: z.array(z.enum(activityEvidenceContentTypes)),
})
export type ActivityProofUploadLimitsResponse = z.infer<typeof activityProofUploadLimitsResponse>

// Answer to a proof reservation: the signed upload targets, or the receipt of an already committed update.
export const activityProofReservationResponse = z.union([
  z.object({
    clientUpdateId: z.string(),
    status: z.literal('COMMITTED'),
    acknowledgement: sourceMutationAcknowledgement,
  }),
  z.object({
    clientUpdateId: z.string(),
    updateId: z.string(),
    status: z.enum(['UPLOADING', 'READY_TO_COMMIT']),
    files: z.array(
      z.object({
        evidenceId: z.string(),
        fileName: z.string(),
        contentType: z.string().nullable(),
        byteSize: z.number(),
        sha256: z.string(),
        storageReady: z.boolean(),
        uploadUrl: z.string().nullable(),
      }),
    ),
  }),
])
export type ActivityProofReservationResponse = z.infer<typeof activityProofReservationResponse>

// Answer to finalizing one evidence file: more files pending, or the update committed for review.
export const activityProofFinalizeResponse = z.union([
  z.object({
    status: z.literal('UPLOADING'),
    updateId: z.string(),
    remaining: z.number(),
  }),
  z.object({ status: z.literal('COMMITTED'), acknowledgement: sourceMutationAcknowledgement }),
  z.object({ status: z.literal('COMMITTED'), activity: activityMutationResponse }),
])
export type ActivityProofFinalizeResponse = z.infer<typeof activityProofFinalizeResponse>
```

Add to `packages/shared/src/index.ts`:

```diff
@@ -27,7 +27,9 @@ export * from './rules/rules-human-contract'
 
 export * from './contracts/imports/import-requests'
 export * from './contracts/common/field-schemas'
+export * from './contracts/common/source-mutation-acknowledgement'
 export * from './contracts/projects/project-requests'
 export * from './contracts/activities/activity-evidence'
 export * from './contracts/activities/activity-extension-requests'
 export * from './contracts/activities/activity-requests'
+export * from './contracts/activities/activity-responses'
```

Run: `pnpm --filter @pathways/shared typecheck`
Expected: PASS.

- [ ] **Step 2: Create the option files**

Create `.tmp/s2/helpers-split.mjs` (three destinations: the proof helpers, the pure activity helpers and the mapper; each block moves verbatim, `validateDates` becomes the function `validateActivityDates`, `finalizeBody` becomes `proofFinalizeBody`, and the two mappers gain their return types):

```js
const dir = 'apps/api/src/modules/activities'
const one = (line) => ({ first: line, last: line })
const top = (first) => ({ first, last: '}' })
const method = (first) => ({ first, last: '  }', dedent: 2 })
export default {
  source: `${dir}/activities.service.ts`,
  moves: [
    {
      to: `${dir}/activity-proof.helpers.ts`,
      header: `import { BadRequestException } from '@nestjs/common'
import {
  type ActivityEvidenceContentType,
  type ActivityEvidenceFile,
  MAX_ACTIVITY_EVIDENCE_FILES,
  activityEvidenceContentTypes,
} from '@pathways/shared'

import { sourceMutationBody } from '../rules/rules-source-operation'
import type { UploadVerification } from '../storage/private-inspection-reader'

// Storage deadline per finalize or inspection read (cr-pathways-activity-progress-media 3.5).
export const PROOF_STORAGE_DEADLINE_MS = 60_000

`,
      replacements: [
        ['function activityEvidenceLimits(', 'export function activityEvidenceLimits(', 1],
        ['const declarationKey = (', 'export const declarationKey = (', 1],
        ['const verificationFailure:', 'export const verificationFailure:', 1],
        ['private finalizeBody(', 'export function proofFinalizeBody(', 1],
      ],
      blocks: [
        {
          first: 'export const evidenceExtension: Record<ActivityEvidenceContentType, string> = {',
          last: '}',
        },
        top('export function activityEvidenceType(contentType: ActivityEvidenceContentType) {'),
        top('function activityEvidenceLimits(maxFileBytes: number) {'),
        {
          first: 'const proofRejection = (code: string, message: string) =>',
          last: "  new BadRequestException({ statusCode: 400, error: 'Bad Request', code, message })",
        },
        top('export function proofDeclarations(files: ActivityEvidenceFile[], maxFileBytes: number) {'),
        {
          first: 'const declarationKey = (file: {',
          last: '}) => JSON.stringify([file.fileName, file.sha256, file.contentType, String(file.byteSize)])',
        },
        top(
          "const verificationFailure: Record<Exclude<UploadVerification, 'VERIFIED'>, string> = {",
        ),
        method('  private finalizeBody('),
      ],
    },
    {
      to: `${dir}/activities.helpers.ts`,
      header: `import { BadRequestException } from '@nestjs/common'
import { hasAtomicPermission } from '@pathways/shared'

import type { ApplicationIdentity } from '../../common/authz/application-identity'

`,
      replacements: [
        ['const assignableOfficerLimit =', 'export const assignableOfficerLimit =', 1],
        ['const storedStatus = {', 'export const storedStatus = {', 1],
        ['const reviewStatus = {', 'export const reviewStatus = {', 1],
        ['function calendarDate(', 'export function calendarDate(', 1],
        ['function updateKind(', 'export function updateKind(', 1],
        ['function hasExplanationSinceDue(', 'export function hasExplanationSinceDue(', 1],
        ['private validateDates(', 'export function validateActivityDates(', 1],
      ],
      blocks: [
        one('const assignableOfficerLimit = 50'),
        { first: 'const storedStatus = {', last: '} as const' },
        { first: 'const reviewStatus = {', last: '} as const' },
        top('function calendarDate(date: Date | null) {'),
        top('export function activityPresentationStatus('),
        top('export function activityTransitionAllowed('),
        top('export function activityCapabilities('),
        top('function updateKind(update: {'),
        top(
          'function hasExplanationSinceDue(explanations: { recordedAt: Date }[], plannedEndDate: Date | null) {',
        ),
        method('  private validateDates('),
      ],
    },
    {
      to: `${dir}/activities.mapper.ts`,
      header: `import type { ActivityListItemRecordResponse, ActivityRecordResponse } from '@pathways/shared'
import type { Prisma } from '@prisma/client'

import type { ApplicationIdentity } from '../../common/authz/application-identity'
import {
  activityPresentationStatus,
  calendarDate,
  hasExplanationSinceDue,
  reviewStatus,
  updateKind,
} from './activities.helpers'

`,
      replacements: [
        ['const activitySelection = {', 'export const activitySelection = {', 1],
        ['type ActivityRow =', 'export type ActivityRow =', 1],
        ['const activityListSelection = {', 'export const activityListSelection = {', 1],
        ['type ActivityListRow =', 'export type ActivityListRow =', 1],
        ['function personalAssignmentCount(', 'export function personalAssignmentCount(', 1],
        ['type ActivityReadMetrics =', 'export type ActivityReadMetrics =', 1],
        ['const emptyActivityReadMetrics:', 'export const emptyActivityReadMetrics:', 1],
        [
          '  viewerId?: string,\n) {',
          '  viewerId?: string,\n): ActivityRecordResponse {',
          1,
        ],
        ['function mapActivity(', 'export function mapActivity(', 1],
        [
          'function mapActivityListItem(row: ActivityListRow, businessDate: string) {',
          'export function mapActivityListItem(row: ActivityListRow, businessDate: string): ActivityListItemRecordResponse {',
          1,
        ],
      ],
      blocks: [
        { first: 'const activitySelection = {', last: '} satisfies Prisma.ProjectActivitySelect' },
        one(
          'type ActivityRow = Prisma.ProjectActivityGetPayload<{ select: typeof activitySelection }>',
        ),
        { first: 'const activityListSelection = {', last: '} satisfies Prisma.ProjectActivitySelect' },
        one(
          'type ActivityListRow = Prisma.ProjectActivityGetPayload<{ select: typeof activityListSelection }>',
        ),
        top('function personalAssignmentCount(actor: ApplicationIdentity) {'),
        top('type ActivityReadMetrics = {'),
        top('const emptyActivityReadMetrics: ActivityReadMetrics = {'),
        top('function mapActivity('),
        top('function mapActivityListItem(row: ActivityListRow, businessDate: string) {'),
      ],
    },
  ],
  sourceReplacements: [
    ['this.validateDates(', 'validateActivityDates(', 5],
    ['this.finalizeBody(', 'proofFinalizeBody(', 2],
  ],
}
```

Create `.tmp/s2/helpers-lines.mjs` (the lines the verbatim check must tolerate: the renames, the return types and the constant's comment):

```js
export default {
  both: [
    ['this.', ''],
    ['private ', 'function '],
  ],
  renames: [
    ['validateActivityDates', 'validateDates'],
    ['proofFinalizeBody', 'finalizeBody'],
    [': ActivityRecordResponse', ''],
    [': ActivityListItemRecordResponse', ''],
  ],
  more: [
    '// Storage deadline per finalize or inspection read (cr-pathways-activity-progress-media 3.5).',
    'const PROOF_STORAGE_DEADLINE_MS = 60_000',
  ],
}
```

Create `.tmp/s2/helpers-test-cut.mjs`:

```js
export default {
  source: 'apps/api/src/modules/activities/activities.helpers.test.ts',
  moves: [
    {
      to: null,
      blocks: [{ first: "vi.mock('../rules/rules-source-operation', async (importOriginal) => ({", last: '}))' }],
    },
  ],
  sourceReplacements: [
    ["import 'reflect-metadata'\n\n", '', 1],
    ["from './activities.service'", "from './activities.helpers'", 1],
    ['describe(\'P05 activity lifecycle presentation\'', "describe('activity lifecycle presentation'", 1],
  ],
}
```

- [ ] **Step 3: Move the blocks and repoint the importers**

Create `.tmp/s2/s5-helpers.sh`:

```bash
A=apps/api/src/modules/activities
S=$A/activities.service.ts
cp $S .tmp/s2/activities.service.helpers-before.ts
node .tmp/s2/move-blocks.mjs .tmp/s2/helpers-split.mjs
node .tmp/s2/imports.mjs add $S './activities.mapper' type:ActivityReadMetrics type:ActivityRow activityListSelection activitySelection emptyActivityReadMetrics mapActivity mapActivityListItem personalAssignmentCount
node .tmp/s2/imports.mjs add $S './activities.helpers' activityCapabilities activityPresentationStatus activityTransitionAllowed assignableOfficerLimit reviewStatus validateActivityDates
node .tmp/s2/imports.mjs add $S './activity-proof.helpers' PROOF_STORAGE_DEADLINE_MS activityEvidenceLimits activityEvidenceType declarationKey evidenceExtension proofDeclarations proofFinalizeBody verificationFailure
for f in activities.service activities.helpers activities.mapper activity-proof.helpers; do node .tmp/s2/imports.mjs prune $A/$f.ts; done
node .tmp/s2/same-lines.mjs .tmp/s2/activities.service.helpers-before.ts -- $S $A/activities.helpers.ts $A/activities.mapper.ts $A/activity-proof.helpers.ts --opts .tmp/s2/helpers-lines.mjs
node .tmp/s2/imports.mjs move apps/api/src/modules/beneficiary-media/beneficiary-media.service.ts '../activities/activities.service' '../activities/activity-proof.helpers' activityEvidenceType evidenceExtension proofDeclarations
node .tmp/s2/imports.mjs move $A/activity-capabilities.test.ts './activities.service' './activities.helpers' activityCapabilities
node .tmp/s2/imports.mjs move $A/activity-proof-media.test.ts './activities.service' './activity-proof.helpers' activityEvidenceType proofDeclarations
git mv $A/activities.service.test.ts $A/activities.helpers.test.ts
node .tmp/s2/move-blocks.mjs .tmp/s2/helpers-test-cut.mjs
node .tmp/s2/imports.mjs prune $A/activities.helpers.test.ts
```

Run it as one block and stop at the first error:

```bash
bash -e .tmp/s2/s5-helpers.sh
```

Expected: the proof helpers print `activity-proof.helpers.ts: 116 lines`, the pure helpers `activities.helpers.ts: 115 lines`, the mapper `activities.mapper.ts: 309 lines`, the service `activities.service.ts: 1973 lines`, all prune lines print `pruned nothing` except the service's (`ActivityEvidenceContentType, ActivityEvidenceFile, activityEvidenceContentTypes, emptyActivityReadMetrics`), then `same lines: 2361`, then the helpers test cut (`activities.helpers.test.ts: 44 lines`, `pruned vi`). Any other `same-lines` output: stop, the move is not verbatim.

- [ ] **Step 4: Add the date validation tests**

`validateDates` was a private method with no direct test. Replace the contents of `apps/api/src/modules/activities/activities.helpers.test.ts` with:

```ts
import { BadRequestException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import {
  activityPresentationStatus,
  activityTransitionAllowed,
  validateActivityDates,
} from './activities.helpers'

describe('activity lifecycle presentation', () => {
  const dueDate = new Date('2026-09-13T00:00:00.000Z')

  it('does not mark a non-terminal activity overdue until the business date passes its due date', () => {
    expect(activityPresentationStatus('NOT_STARTED', dueDate, '2026-09-13')).toEqual({
      overdue: false,
      status: 'Planned',
    })
    expect(activityPresentationStatus('IN_PROGRESS', dueDate, '2026-09-14')).toEqual({
      overdue: true,
      status: 'Overdue',
    })
    expect(activityPresentationStatus('FOR_REVIEW', dueDate, '2026-09-14')).toEqual({
      overdue: true,
      status: 'Overdue',
    })
  })

  it('keeps completed and cancelled activities terminal after the due date', () => {
    expect(activityPresentationStatus('COMPLETED', dueDate, '2026-09-14')).toEqual({
      overdue: false,
      status: 'Completed',
    })
    expect(activityPresentationStatus('CANCELLED', dueDate, '2026-09-14')).toEqual({
      overdue: false,
      status: 'Cancelled',
    })
  })

  it('allows only the explicit manager-driven lifecycle transitions', () => {
    expect(activityTransitionAllowed('NOT_STARTED', 'IN_PROGRESS')).toBe(true)
    expect(activityTransitionAllowed('NOT_STARTED', 'CANCELLED')).toBe(true)
    expect(activityTransitionAllowed('IN_PROGRESS', 'CANCELLED')).toBe(true)
    expect(activityTransitionAllowed('IN_PROGRESS', 'IN_PROGRESS')).toBe(false)
    expect(activityTransitionAllowed('FOR_REVIEW', 'CANCELLED')).toBe(false)
    expect(activityTransitionAllowed('COMPLETED', 'IN_PROGRESS')).toBe(false)
    expect(activityTransitionAllowed('CANCELLED', 'IN_PROGRESS')).toBe(false)
  })
})

describe('activity date validation', () => {
  const project = {
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T00:00:00.000Z'),
  }

  it('accepts dates inside the project and returns no justification', () => {
    expect(validateActivityDates('2026-02-01', '2026-03-01', project)).toBeNull()
  })

  it('rejects an end date before the start date', () => {
    expect(() => validateActivityDates('2026-03-01', '2026-02-01', project)).toThrow(
      'Activity end date must not precede its start date.',
    )
  })

  it('needs a justification outside the project dates and returns it trimmed', () => {
    expect(() => validateActivityDates('2025-12-01', '2026-03-01', project)).toThrow(
      BadRequestException,
    )
    expect(
      validateActivityDates('2025-12-01', '2026-03-01', project, '  Early mobilization  '),
    ).toBe('Early mobilization')
  })

  it('does not bound an activity in a project without dates', () => {
    expect(
      validateActivityDates('2020-01-01', '2030-01-01', { startDate: null, endDate: null }),
    ).toBeNull()
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/activities/activities.helpers.test.ts`
Expected: PASS, 7 tests (3 moved, 4 new).

- [ ] **Step 5: Run the tests and commit**

```bash
git add -N apps/api packages/shared
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts')
pnpm --filter @pathways/api exec vitest run src/modules/activities src/modules/beneficiary-media
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api packages/shared
git commit -m "refactor(api): move the activity mapper and pure helpers out of the service with shared response types

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: typecheck passes, so `mapActivity` and `mapActivityListItem` return exactly their response types; api = `B_api + 15`.

---

### Task 6: Tenant-scoped function modules and the kernel

**Files:**
- Create: `apps/api/src/modules/activities/activity-access.service.ts`, `activity-metrics.service.ts`, `activity-links.service.ts`, `activity-budget.service.ts`
- Modify: `apps/api/src/modules/activities/activities.service.ts`, `apps/api/src/modules/activity-extensions/activity-extensions.service.ts`
- Test: `apps/api/src/modules/activities/activity-progress.test.ts`, `apps/api/src/modules/activity-extensions/activity-extensions.service.test.ts`
- Create: `.tmp/s2/assignment-tests.mjs`, `.tmp/s2/function-modules-split.mjs`, `.tmp/s2/function-modules-lines.mjs`, `.tmp/s2/kernel-edits.mjs`

**Interfaces:**
- Consumes: the Task 5 mapper (`activitySelection`, `personalAssignmentCount`, `mapActivity`, `ActivityRow`, `ActivityReadMetrics`) and helpers (`activityCapabilities`); `requireScopedProjectRow`, `projectDateFields`.
- Produces, all taking the caller's `tx` and none opening a transaction: from `activity-access.service.ts`, `readScopedActivity(tx, actor, verifiedProjectId, activityId)`, `requireProjectActivity(tx, actor, projectId, activityId)`, `requireActivity(tx, actor, projectId, activityId)` and `requireActiveAssignment(tx: Tx, actor: ApplicationIdentity, activity: { id: string; projectId: string }): Promise<void>`; from `activity-metrics.service.ts`, `readMetrics(tx, actor, projectId, activityIds)`, `readReached(tx, actor, projectId, activityIds)`, `readListMetrics(tx, actor, projectId, activityIds)` and `mapWithMetrics(tx, actor, row, businessTimeZone: string)`; from `activity-links.service.ts`, `resolveAssignments`, `resolveIndicators`, `resolveJourneyStage` and `replaceActivityLinks`; from `activity-budget.service.ts`, `saveActivityBudget(tx, actor, projectId, activityId, value, operation)`.

- [ ] **Step 1: Pin the assignment check before it is shared**

`recordProgress` and the extension `request` each carry an inline copy of `requireActiveAssignment`. Pin their 403 text first, by strengthening the existing test `denies an actor without an active assignment on the activity (abuse)` in `activity-progress.test.ts` (it already pins the 403 class and the query `where`) with the message text, instead of adding a duplicate test. Create `.tmp/s2/assignment-tests.mjs`:

```js
const dir = 'apps/api/src/modules'
export default [
  {
    file: `${dir}/activities/activity-progress.test.ts`,
    edits: [
      [
        `    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.projectActivityAssignment.findFirst.mock.calls[0][0].where).toMatchObject({`,
        `    ).rejects.toBeInstanceOf(ForbiddenException)
    await expect(service.recordProgress(actor, projectId, activityId, input)).rejects.toThrow(
      'An active activity assignment is required.',
    )
    expect(tx.projectActivityAssignment.findFirst.mock.calls[0][0].where).toMatchObject({`,
        1,
      ],
    ],
  },
  {
    file: `${dir}/activity-extensions/activity-extensions.service.test.ts`,
    edits: [
      [
        `    ).rejects.toMatchObject({ status: 403 })
    expect(tx.activityExtensionRequest.create).not.toHaveBeenCalled()`,
        `    ).rejects.toThrow('An active activity assignment is required.')
    expect(tx.activityExtensionRequest.create).not.toHaveBeenCalled()`,
        1,
      ],
    ],
  },
]
```

```bash
node .tmp/s2/replace-exact.mjs .tmp/s2/assignment-tests.mjs
pnpm exec biome check --write apps/api/src/modules/activities/activity-progress.test.ts apps/api/src/modules/activity-extensions/activity-extensions.service.test.ts
pnpm --filter @pathways/api exec vitest run src/modules/activities/activity-progress.test.ts src/modules/activity-extensions
```

Expected: `activity-progress.test.ts: 1 edits` and `activity-extensions.service.test.ts: 1 edits`; PASS against the inline copies (the progress test gains the message assertion and no test is added; the extension assertion is tightened from the status to the message).

- [ ] **Step 2: Create the option files**

Create `.tmp/s2/function-modules-split.mjs` (four destination files; the methods become functions, `private async` becomes `export async function`, and `mapWithMetrics` takes the time zone as an argument):

```js
const dir = 'apps/api/src/modules/activities'
const method = (first) => ({ first, last: '  }', dedent: 2 })
export default {
  source: `${dir}/activities.service.ts`,
  moves: [
    {
      to: `${dir}/activity-access.service.ts`,
      header: `import { ForbiddenException, NotFoundException } from '@nestjs/common'

import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { projectDateFields, requireScopedProjectRow } from '../../common/authz/scoped-project'
import type { Tx } from '../../common/prisma/transaction'
import { activitySelection, personalAssignmentCount } from './activities.mapper'

`,
      replacements: [['private async ', 'export async function ', 4]],
      blocks: [
        method('  private async readScopedActivity('),
        method('  private async requireProjectActivity('),
        method('  private async requireActivity('),
        method('  private async requireActiveAssignment('),
      ],
    },
    {
      to: `${dir}/activity-metrics.service.ts`,
      header: `import { businessCalendarDate, hasAtomicPermission } from '@pathways/shared'
import { Prisma } from '@prisma/client'

import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'
import { activityCapabilities } from './activities.helpers'
import { type ActivityReadMetrics, type ActivityRow, mapActivity } from './activities.mapper'

`,
      replacements: [
        ['private async ', 'export async function ', 4],
        [
          '  row: ActivityRow & { _count?: { projectActivityAssignment_activity: number } },\n) {',
          '  row: ActivityRow & { _count?: { projectActivityAssignment_activity: number } },\n  businessTimeZone: string,\n) {',
          1,
        ],
        ['this.env.BUSINESS_TIME_ZONE', 'businessTimeZone', 1],
      ],
      blocks: [
        method('  private async readMetrics('),
        method('  private async readReached('),
        method('  private async readListMetrics('),
        method('  private async mapWithMetrics('),
      ],
    },
    {
      to: `${dir}/activity-links.service.ts`,
      header: `import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { hasAtomicPermission } from '@pathways/shared'

import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'

`,
      replacements: [['private async ', 'export async function ', 4]],
      blocks: [
        method('  private async resolveAssignments('),
        method('  private async resolveIndicators('),
        method('  private async resolveJourneyStage('),
        method('  private async replaceActivityLinks('),
      ],
    },
    {
      to: `${dir}/activity-budget.service.ts`,
      header: `import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { hasAtomicPermission } from '@pathways/shared'
import { Prisma } from '@prisma/client'

import type { ApplicationIdentity } from '../../common/authz/application-identity'
import type { Tx } from '../../common/prisma/transaction'

`,
      replacements: [
        ['private async saveActivityBudget(', 'export async function saveActivityBudget(', 1],
        ['private activityBudgetValue(', 'function activityBudgetValue(', 1],
      ],
      blocks: [
        {
          first: "const activityBudgetCategory = 'ACTIVITY_PROFILE_TOTAL'",
          last: "const activityBudgetCategory = 'ACTIVITY_PROFILE_TOTAL'",
        },
        method('  private activityBudgetValue(value: string) {'),
        method('  private async saveActivityBudget('),
      ],
    },
  ],
  sourceReplacements: [],
}
```

Create `.tmp/s2/function-modules-lines.mjs`:

```js
export default {
  both: [
    ['this.', ''],
    ['private async ', 'async function '],
    ['private ', 'function '],
  ],
  renames: [['businessTimeZone', 'env.BUSINESS_TIME_ZONE']],
  more: ['env.BUSINESS_TIME_ZONE: string,'],
}
```

Create `.tmp/s2/kernel-edits.mjs` (the two assignment copies call the shared function; `context` and both branches of `listEvidence` use `requireScopedProjectRow`, which runs the same `where` and the same select as the inline lookups they replace):

```js
const dir = 'apps/api/src/modules'
const assignmentQuery = `        const assigned = await tx.projectActivityAssignment.findFirst({
          where: {
            organizationId: actor.organizationId,
            projectId: activity.projectId,
            activityId: activity.id,
            status: 'ACTIVE',
            endedAt: null,
            projectAssignment: { userId: actor.userId, status: 'ACTIVE', endedAt: null },
          },
          select: { id: true },
        })
        if (!assigned) throw new ForbiddenException('An active activity assignment is required.')
`
export default [
  {
    file: `${dir}/activities/activities.service.ts`,
    edits: [
      [
        `${assignmentQuery}        const clientUpdateId = input.clientUpdateId.toLowerCase()`,
        '        await requireActiveAssignment(tx, actor, activity)\n        const clientUpdateId = input.clientUpdateId.toLowerCase()',
        1,
      ],
      [
        `        if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
        const project = await tx.project.findFirst({
          where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
          select: {
            projectActivity_project: {
              where: { organizationId: actor.organizationId, archivedAt: null },
              select: {
                id: true,
                title: true,
                status: true,
                activityJourneyStageMapping_activity: {
                  select: { stageId: true },
                  orderBy: { sequenceOrder: 'asc' },
                  take: 100,
                },
              },
              orderBy: [{ title: 'asc' }, { id: 'asc' }],
              take: 100,
            },
          },
        })
        if (!project) throw new NotFoundException('Project unavailable.')
`,
        `        const project = await requireScopedProjectRow(tx, actor, projectId, {
          projectActivity_project: {
            where: { organizationId: actor.organizationId, archivedAt: null },
            select: {
              id: true,
              title: true,
              status: true,
              activityJourneyStageMapping_activity: {
                select: { stageId: true },
                orderBy: { sequenceOrder: 'asc' },
                take: 100,
              },
            },
            orderBy: [{ title: 'asc' }, { id: 'asc' }],
            take: 100,
          },
        })
`,
        1,
      ],
      [
        `      if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
      const where = { AND: [projectScope(actor), { id: projectId.toLowerCase() }] }
      const activityWhere =`,
        '      const activityWhere =',
        1,
      ],
      [
        `        const project = await tx.project.findFirst({
          where,
          select: {
            projectActivity_project: {
              where: activityWhere,
              select: { id: true, title: true },
              orderBy: [{ plannedEndDate: 'asc' }, { id: 'asc' }],
              take: 100,
            },
          },
        })
        if (!project) throw new NotFoundException('Project unavailable.')
`,
        `        const project = await requireScopedProjectRow(tx, actor, projectId, {
          projectActivity_project: {
            where: activityWhere,
            select: { id: true, title: true },
            orderBy: [{ plannedEndDate: 'asc' }, { id: 'asc' }],
            take: 100,
          },
        })
`,
        1,
      ],
      [
        `      const project = await tx.project.findFirst({
        where,
        select: {
          projectActivity_project: {
            where: activityWhere,`,
        `      const project = await requireScopedProjectRow(tx, actor, projectId, {
          projectActivity_project: {
            where: activityWhere,`,
        1,
      ],
      [
        `            take: 100,
          },
        },
      })
      if (!project) throw new NotFoundException('Project unavailable.')
      return {
        scope: 'detail' as const,`,
        `            take: 100,
          },
      })
      return {
        scope: 'detail' as const,`,
        1,
      ],
    ],
  },
  {
    file: `${dir}/activity-extensions/activity-extensions.service.ts`,
    edits: [
      [
        `${assignmentQuery}        const currentEnd = day(activity.plannedEndDate)`,
        '        await requireActiveAssignment(tx, actor, activity)\n        const currentEnd = day(activity.plannedEndDate)',
        1,
      ],
    ],
  },
]
```

- [ ] **Step 3: Move the methods and adopt the kernel**

Create `.tmp/s2/s6-function-modules.sh`:

```bash
A=apps/api/src/modules/activities
S=$A/activities.service.ts
# Characterization first: the inline assignment checks must keep answering 403 with the same text.
# The metrics mapper takes the business time zone as an argument instead of reading the instance env.
node .tmp/s2/append-argument.mjs $S 'this.mapWithMetrics(' 'mapWithMetrics(' 'this.env.BUSINESS_TIME_ZONE'
cp $S .tmp/s2/activities.service.function-modules-before.ts
node .tmp/s2/move-blocks.mjs .tmp/s2/function-modules-split.mjs
sed -i -E 's/this\.(readScopedActivity|requireProjectActivity|requireActivity|requireActiveAssignment|readMetrics|readReached|readListMetrics|resolveAssignments|resolveIndicators|resolveJourneyStage|replaceActivityLinks|activityBudgetValue|saveActivityBudget)\(/\1(/g' $S $A/activity-access.service.ts $A/activity-metrics.service.ts $A/activity-links.service.ts $A/activity-budget.service.ts
node .tmp/s2/same-lines.mjs .tmp/s2/activities.service.function-modules-before.ts -- $S $A/activity-access.service.ts $A/activity-metrics.service.ts $A/activity-links.service.ts $A/activity-budget.service.ts --opts .tmp/s2/function-modules-lines.mjs
node .tmp/s2/imports.mjs add $S './activity-access.service' readScopedActivity requireActiveAssignment requireActivity requireProjectActivity
node .tmp/s2/imports.mjs add $S './activity-metrics.service' mapWithMetrics readListMetrics
node .tmp/s2/imports.mjs add $S './activity-links.service' replaceActivityLinks resolveAssignments resolveIndicators resolveJourneyStage
node .tmp/s2/imports.mjs add $S './activity-budget.service' saveActivityBudget
node .tmp/s2/replace-exact.mjs .tmp/s2/kernel-edits.mjs
node .tmp/s2/imports.mjs add apps/api/src/modules/activity-extensions/activity-extensions.service.ts '../activities/activity-access.service' requireActiveAssignment
for f in activities.service activity-access.service activity-metrics.service activity-links.service activity-budget.service; do node .tmp/s2/imports.mjs prune $A/$f.ts; done
node .tmp/s2/imports.mjs prune apps/api/src/modules/activity-extensions/activity-extensions.service.ts
```

Run it as one block and stop at the first error:

```bash
bash -e .tmp/s2/s6-function-modules.sh
```

Expected: `10 calls of this.mapWithMetrics( rewritten`; the cuts print `24, 10, 8, 18` lines for the access module (`activity-access.service.ts: 71 lines`), `61, 30, 49, 20` for the metrics module (`activity-metrics.service.ts: 173 lines`), `33, 27, 19, 42` for the links module (`activity-links.service.ts: 131 lines`) and `1, 7, 45` for the budget module (`activity-budget.service.ts: 63 lines`); then `activities.service.ts: 1587 lines` and `same lines: 1880`; the kernel edits print `activities.service.ts: 6 edits` and `activity-extensions.service.ts: 1 edits`. Any other `same-lines` output: stop, the move is not verbatim.

- [ ] **Step 4: Run the tests and commit**

```bash
git add -N apps/api packages/shared
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts')
pnpm --filter @pathways/api exec vitest run src/modules/activities src/modules/activity-extensions
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api
git commit -m "refactor(api): move the activity scope, metrics, link and budget helpers into function modules

The two inline assignment checks and the inline project lookups of context and listEvidence use the shared kernel helpers.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: typecheck passes; api = `B_api + 15` (unchanged from Task 5, because Step 1 strengthens an existing test). `activities.service.ts` is about 1500 lines.

---

### Task 7: Milestone, evidence, review and progress services

**Files:**
- Create: `apps/api/src/modules/activities/activity-milestones.service.ts`, `activity-evidence.service.ts`, `activity-review.service.ts`, `activity-progress.service.ts`
- Modify: `apps/api/src/modules/activities/activities.service.ts`, `activity-milestones.controller.ts`, `activity-evidence.controller.ts`, `activity-proofs.controller.ts`, `activity-updates.controller.ts`, `activities.module.ts`
- Modify (tests): `activities.access.test.ts`, `activities.controller.validation.test.ts`, `activities.inspection-controller.test.ts`, `activity-capabilities.test.ts`, `activity-milestones.test.ts`, `activity-overdue-explanation.test.ts`, `activity-progress.test.ts`, `activity-proof-review-flow.test.ts`, `activity-review-completion.test.ts`, `evidence-list.access.test.ts`, `apps/api/src/modules/rules/rules-source-domains.test.ts`
- Modify (seeds): `apps/api/prisma/local-demo-seed.ts`, `apps/api/prisma/defense-demo-seed.ts`, `apps/api/prisma/local-demo-stage-activities.ts`
- Create: `.tmp/s2/services-a-split.mjs`, `.tmp/s2/services-a-edits.mjs`, `.tmp/s2/services-a-lines.mjs`

**Interfaces:**
- Consumes: the Task 5 and Task 6 modules.
- Produces, each an `@Injectable()` registered by `ActivitiesModule`: `ActivityMilestonesService(prisma)` with `listMilestones(identity, projectId)`, `createMilestone(identity, projectId, input: SaveMilestoneRequest)`, `updateMilestone(identity, projectId, milestoneId, input: UpdateMilestoneRequest)`; `ActivityEvidenceService(prisma, storage)` with `listEvidence(identity, projectId): Promise<ActivityEvidenceListResponse>` and `downloadProof(identity, projectId, activityId, evidenceId)`; `ActivityReviewService(prisma)` with `reviewUpdate(identity, projectId, activityId, updateId, input: ReviewActivityUpdateRequest): Promise<ActivityMutationResponse | SourceMutationAcknowledgement>`; `ActivityProgressService(prisma)` with `recordProgress(identity, projectId, activityId, input: RecordActivityProgressRequest): Promise<ActivityResponse>` and `recordOverdueExplanation(identity, projectId, activityId, input: RecordOverdueExplanationRequest): Promise<ActivityResponse>`. Method names, arguments and bodies are unchanged. The demo seeds gain `ctx.services.activityProgress` and `ctx.services.activityReview`.

- [ ] **Step 1: Create the option files**

Create `.tmp/s2/services-a-split.mjs` (each new service starts from the full import block of the source and the prune step drops what it does not use; the class shells and the return types are the only new text):

```js
import { readFileSync } from 'node:fs'

const dir = 'apps/api/src/modules/activities'
const source = `${dir}/activities.service.ts`

// Every import statement of the source; the new services start from all of them and the prune step drops what they do not use.
const text = readFileSync(source, 'utf8')
const statements = [...text.matchAll(/^import\s+(?:type\s+)?\{[^}]*\}\s*from\s*'[^']+'\n/gm)]
const last = statements.at(-1)
const imports = `${text.slice(0, last.index + last[0].length)}\n`

const method = (first) => ({ first, last: '  }' })
const shell = (name, summary, constructorText, env = false) =>
  `${imports}// ${summary}\n@Injectable()\nexport class ${name} {\n${env ? '  private readonly env = readApiEnv(process.env)\n\n' : ''}${constructorText}\n\n`
const prismaOnly = '  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}'

export default {
  source,
  moves: [
    {
      to: `${dir}/activity-milestones.service.ts`,
      header: shell(
        'ActivityMilestonesService',
        'Lists, creates and updates the milestones of one project.',
        prismaOnly,
      ),
      footer: '}\n',
      blocks: [
        method('  listMilestones(identity: ApplicationIdentity, projectId: string) {'),
        method(
          '  createMilestone(identity: ApplicationIdentity, projectId: string, input: SaveMilestoneRequest) {',
        ),
        method('  updateMilestone('),
      ],
    },
    {
      to: `${dir}/activity-evidence.service.ts`,
      header: shell(
        'ActivityEvidenceService',
        'Lists the evidence of one project and releases one stored proof file.',
        `  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}`,
      ),
      footer: '}\n',
      replacements: [
        [
          '  listEvidence(identity: ApplicationIdentity, projectId: string) {',
          '  listEvidence(identity: ApplicationIdentity, projectId: string): Promise<ActivityEvidenceListResponse> {',
          1,
        ],
      ],
      blocks: [method('  listEvidence(identity: ApplicationIdentity, projectId: string) {'), method('  async downloadProof(')],
    },
    {
      to: `${dir}/activity-review.service.ts`,
      header: shell(
        'ActivityReviewService',
        'Records the monitoring and evaluation decision on one submitted activity update.',
        prismaOnly,
        true,
      ),
      footer: '}\n',
      replacements: [
        [
          '    input: ReviewActivityUpdateRequest,\n  ) {',
          '    input: ReviewActivityUpdateRequest,\n  ): Promise<ActivityMutationResponse | SourceMutationAcknowledgement> {',
          1,
        ],
      ],
      blocks: [method('  reviewUpdate(')],
    },
    {
      to: `${dir}/activity-progress.service.ts`,
      header: shell(
        'ActivityProgressService',
        'Records progress notes and overdue explanations against one activity.',
        prismaOnly,
        true,
      ),
      footer: '}\n',
      replacements: [
        [
          '    input: RecordActivityProgressRequest,\n  ) {',
          '    input: RecordActivityProgressRequest,\n  ): Promise<ActivityResponse> {',
          1,
        ],
        [
          '    input: RecordOverdueExplanationRequest,\n  ) {',
          '    input: RecordOverdueExplanationRequest,\n  ): Promise<ActivityResponse> {',
          1,
        ],
      ],
      blocks: [method('  recordProgress('), method('  recordOverdueExplanation(')],
    },
  ],
  sourceReplacements: [],
}
```

Create `.tmp/s2/services-a-lines.mjs`:

```js
export default {
  more: [
    '}',
    '@Injectable()',
    'constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}',
    'private readonly env = readApiEnv(process.env)',
    'constructor(',
    '@Inject(PrismaService) private readonly prisma: PrismaService,',
    '@Inject(StorageService) private readonly storage: StorageService,',
    ') {}',
    'class ActivityMilestonesService {',
    'class ActivityEvidenceService {',
    'class ActivityReviewService {',
    'class ActivityProgressService {',
    '// Lists, creates and updates the milestones of one project.',
    '// Lists the evidence of one project and releases one stored proof file.',
    '// Records the monitoring and evaluation decision on one submitted activity update.',
    '// Records progress notes and overdue explanations against one activity.',
  ],
  both: [[': Promise<ActivityEvidenceListResponse> {', ' {'], [': Promise<ActivityMutationResponse | SourceMutationAcknowledgement> {', ' {'], [': Promise<ActivityResponse> {', ' {']],
}
```

Create `.tmp/s2/services-a-edits.mjs` (controllers inject the service that now owns each method; the module provides the four services; the HTTP validation test provides one mock for every service the module lists, so it follows later splits):

```js
const dir = 'apps/api/src/modules/activities'
const only = (service, name) =>
  `  constructor(@Inject(${service}) private readonly ${name}: ${service}) {}`
export default [
  {
    file: `${dir}/activities.controller.validation.test.ts`,
    edits: [
      [
        "import { type INestApplication, ValidationPipe } from '@nestjs/common'",
        "import { type INestApplication, type Type, ValidationPipe } from '@nestjs/common'",
        1,
      ],
      [
        "import { ActivitiesService } from './activities.service'\n",
        "import { ActivitiesModule } from './activities.module'\n",
        1,
      ],
      ["import { PrivateProofInspectionService } from './private-proof-inspection.service'\n", '', 1],
      [
        `    providers: [
      { provide: ActivitiesService, useValue: activities },
      { provide: PrivateProofInspectionService, useValue: {} },
    ],`,
        `    // One mock answers for every service the module provides, so the test follows the service split.
    providers: (Reflect.getMetadata('providers', ActivitiesModule) as Type<unknown>[]).map(
      (provide) => ({ provide, useValue: activities }),
    ),`,
        1,
      ],
    ],
  },
  {
    file: `${dir}/activity-milestones.controller.ts`,
    edits: [
      ["import { ActivitiesService } from './activities.service'", "import { ActivityMilestonesService } from './activity-milestones.service'", 1],
      [only('ActivitiesService', 'activities'), only('ActivityMilestonesService', 'milestones'), 1],
      ['this.activities.', 'this.milestones.', 3],
    ],
  },
  {
    file: `${dir}/activity-evidence.controller.ts`,
    edits: [
      ["import { ActivitiesService } from './activities.service'", "import { ActivityEvidenceService } from './activity-evidence.service'", 1],
      [only('ActivitiesService', 'activities'), only('ActivityEvidenceService', 'evidence'), 1],
      ['this.activities.', 'this.evidence.', 1],
    ],
  },
  {
    file: `${dir}/activity-proofs.controller.ts`,
    edits: [
      ["import { ActivitiesService } from './activities.service'", "import { ActivityEvidenceService } from './activity-evidence.service'", 1],
      [
        '    @Inject(ActivitiesService) private readonly activities: ActivitiesService,',
        '    @Inject(ActivityEvidenceService) private readonly evidence: ActivityEvidenceService,',
        1,
      ],
      ['this.activities.downloadProof(', 'this.evidence.downloadProof(', 1],
    ],
  },
  {
    file: `${dir}/activity-updates.controller.ts`,
    edits: [
      [
        "import { ActivitiesService } from './activities.service'\n",
        "import { ActivitiesService } from './activities.service'\nimport { ActivityProgressService } from './activity-progress.service'\nimport { ActivityReviewService } from './activity-review.service'\n",
        1,
      ],
      [
        only('ActivitiesService', 'activities'),
        `  constructor(
    @Inject(ActivitiesService) private readonly activities: ActivitiesService,
    @Inject(ActivityProgressService) private readonly progress: ActivityProgressService,
    @Inject(ActivityReviewService) private readonly review: ActivityReviewService,
  ) {}`,
        1,
      ],
      ['this.activities.recordProgress(', 'this.progress.recordProgress(', 1],
      ['this.activities.recordOverdueExplanation(', 'this.progress.recordOverdueExplanation(', 1],
      ['this.activities.reviewUpdate(', 'this.review.reviewUpdate(', 1],
    ],
  },
  {
    file: `${dir}/activities.module.ts`,
    edits: [
      [
        "import { ActivitiesService } from './activities.service'\n",
        "import { ActivitiesService } from './activities.service'\nimport { ActivityEvidenceService } from './activity-evidence.service'\nimport { ActivityMilestonesService } from './activity-milestones.service'\nimport { ActivityProgressService } from './activity-progress.service'\nimport { ActivityReviewService } from './activity-review.service'\n",
        1,
      ],
      [
        '  providers: [ActivitiesService, PrivateProofInspectionService],',
        '  providers: [\n    ActivitiesService,\n    ActivityEvidenceService,\n    ActivityMilestonesService,\n    ActivityProgressService,\n    ActivityReviewService,\n    PrivateProofInspectionService,\n  ],',
        1,
      ],
    ],
  },
  {
    file: `${dir}/activities.inspection-controller.test.ts`,
    edits: [
      ["import type { ActivitiesService } from './activities.service'\n", "import type { ActivityEvidenceService } from './activity-evidence.service'\n", 1],
      ['{} as ActivitiesService,', '{} as ActivityEvidenceService,', 1],
    ],
  },
]
```

- [ ] **Step 2: Move the methods, retarget the tests and the seeds**

`retarget-service.mjs` rewrites each `new ActivitiesService(...)` in a test or seed into one construction per split service whose listed methods the file calls on that variable, moves those calls to the new variable, drops a construction left with no calls and fixes the imports.

Create `.tmp/s2/s7-services-a.sh`:

```bash
A=apps/api/src/modules/activities
S=$A/activities.service.ts
cp $S .tmp/s2/activities.service.services-a-before.ts
node .tmp/s2/move-blocks.mjs .tmp/s2/services-a-split.mjs
node .tmp/s2/imports.mjs add $A/activity-evidence.service.ts '@pathways/shared' type:ActivityEvidenceListResponse
node .tmp/s2/imports.mjs add $A/activity-review.service.ts '@pathways/shared' type:ActivityMutationResponse type:SourceMutationAcknowledgement
node .tmp/s2/imports.mjs add $A/activity-progress.service.ts '@pathways/shared' type:ActivityResponse
for f in activities.service activity-milestones.service activity-evidence.service activity-review.service activity-progress.service; do node .tmp/s2/imports.mjs prune $A/$f.ts; done
node .tmp/s2/same-lines.mjs .tmp/s2/activities.service.services-a-before.ts -- $S $A/activity-milestones.service.ts $A/activity-evidence.service.ts $A/activity-review.service.ts $A/activity-progress.service.ts --opts .tmp/s2/services-a-lines.mjs
node .tmp/s2/replace-exact.mjs .tmp/s2/services-a-edits.mjs
# Tests and seeds call the services that now own each method.
node .tmp/s2/retarget-service.mjs $A/activity-milestones.test.ts listMilestones,createMilestone,updateMilestone
node .tmp/s2/retarget-service.mjs $A/evidence-list.access.test.ts listEvidence,downloadProof
node .tmp/s2/retarget-service.mjs $A/activities.access.test.ts downloadProof,reviewUpdate
node .tmp/s2/retarget-service.mjs $A/activity-capabilities.test.ts recordProgress
node .tmp/s2/retarget-service.mjs $A/activity-review-completion.test.ts reviewUpdate
node .tmp/s2/retarget-service.mjs $A/activity-proof-review-flow.test.ts reviewUpdate,recordProgress
node .tmp/s2/retarget-service.mjs $A/activity-overdue-explanation.test.ts recordOverdueExplanation
node .tmp/s2/retarget-service.mjs $A/activity-progress.test.ts recordProgress
node .tmp/s2/retarget-service.mjs apps/api/src/modules/rules/rules-source-domains.test.ts reviewUpdate
node .tmp/s2/seed-services.mjs ActivityProgressService activityProgress activity-progress.service 1 recordProgress,recordOverdueExplanation
node .tmp/s2/seed-services.mjs ActivityReviewService activityReview activity-review.service 1 reviewUpdate
```

Run it as one block and stop at the first error:

```bash
bash -e .tmp/s2/s7-services-a.sh
```

Expected: the cuts print `10, 29, 58` lines for the milestones (`activity-milestones.service.ts: 196 lines`), `110, 41` for the evidence service (`252 lines`), `171` for the review service (`270 lines`) and `83, 84` for the progress service (`267 lines`); `activities.service.ts: 967 lines`; `same lines: 1449`; the edit script prints `activities.controller.validation.test.ts: 4 edits` and the controller and module edits; the retarget lines name the services each file now builds (`activities.access.test.ts: ActivityEvidenceService, ActivityReviewService`, `activity-proof-review-flow.test.ts: ActivityProgressService, ActivityReviewService` and so on); the seed lines add `ActivityProgressService` and `ActivityReviewService` to the local and defense seeds (`hosted-realistic-seed.ts: no calls to move`, because it only creates and transitions). Any other `same-lines` output: stop, the move is not verbatim.

- [ ] **Step 3: Run the tests and commit**

```bash
git add -N apps/api packages/shared
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts')
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api
git commit -m "refactor(api): split milestones, evidence, review and progress out of ActivitiesService

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: typecheck passes, so every public method returns exactly its response type; the api count is unchanged from Task 6 (`B_api + 15`), because no test was added or removed. `activities.service.ts` is about 970 lines.

---

### Task 8: Lifecycle, proof reservation and proof finalize services

**Files:**
- Create: `apps/api/src/modules/activities/activity-lifecycle.service.ts`, `activity-proofs.service.ts`, `activity-proof-finalize.service.ts`
- Modify: `apps/api/src/modules/activities/activities.service.ts` (reads only; constructor takes the Prisma service alone), `activities.controller.ts`, `activity-updates.controller.ts`, `activities.module.ts`, `activity-proofs.service.ts` (one line, ruling 12)
- Modify (tests): `activities.access.test.ts`, `activity-capabilities.test.ts`, `activity-overdue-explanation.test.ts`, `activity-proof-media.test.ts`, `activity-proof-review-flow.test.ts`, `feature-read.local.test.ts`, `apps/api/src/modules/rules/rules-source-domains.test.ts`
- Modify (seeds): `apps/api/prisma/local-demo-seed.ts`, `defense-demo-seed.ts`, `hosted-realistic-seed.ts`, `local-demo-stage-activities.ts`
- Create: `.tmp/s2/finalize-order-test.mjs`, `.tmp/s2/services-b-split.mjs`, `.tmp/s2/services-b-edits.mjs`, `.tmp/s2/services-b-lines.mjs`

**Interfaces:**
- Produces, each an `@Injectable()` registered by `ActivitiesModule`: `ActivityLifecycleService(prisma)` with `create(identity, projectId, input: CreateActivityRequest)`, `update(identity, projectId, activityId, input: UpdateActivityRequest)` and `transition(identity, projectId, activityId, input: TransitionActivityRequest)`, each returning `Promise<ActivityMutationResponse | SourceMutationAcknowledgement>`, with `create` and `update` keeping their 20 second save timeout; `ActivityProofsService(prisma, storage)` with `proofUploadLimits(projectId): ActivityProofUploadLimitsResponse` and `reserveProof(identity, projectId, activityId, input: ReserveActivityProofRequest): Promise<ActivityProofReservationResponse>`; `ActivityProofFinalizeService(prisma, storage, storageFactories)` with `finalizeProofFile(identity, projectId, activityId, updateId, evidenceId): Promise<ActivityProofFinalizeResponse>`; `ActivitiesService(prisma)` with `context`, `assignableOfficers`, `list` and `get`. The seeds gain `activityLifecycle`, `activityProofs` and `activityProofFinalize`.

- [ ] **Step 1: Pin the finalize order before the move**

`finalizeProofFile` reads its target in one operation, verifies the stored object outside any transaction and commits in a second operation. Create `.tmp/s2/finalize-order-test.mjs`:

```js
export default [
  {
    file: 'apps/api/src/modules/activities/activity-proof-media.test.ts',
    edits: [
      [
        "import { PrivateInspectionReadError } from '@app/modules/storage/private-inspection-reader'\n",
        "import { withAuthorizedOperation } from '@app/common/authz/authorized-operation'\nimport { PrivateInspectionReadError } from '@app/modules/storage/private-inspection-reader'\n",
        1,
      ],
      [
        "  it('verifies the exact server-derived object, marks it ready and commits the last file for review', async () => {",
        `  it('reads the file, verifies the stored object, then commits in a second operation', async () => {
    await finalize()
    const operations = vi.mocked(withAuthorizedOperation).mock.invocationCallOrder
    const reads = tx.evidenceMedia.findFirst.mock.invocationCallOrder
    const verified = state.verify.mock.invocationCallOrder[0]
    expect(operations).toHaveLength(2)
    expect(reads).toHaveLength(2)
    expect(reads[0]).toBeLessThan(verified)
    expect(verified).toBeLessThan(reads[1])
    expect(state.begin.mock.invocationCallOrder[0]).toBeGreaterThan(verified)
  })

  it('verifies the exact server-derived object, marks it ready and commits the last file for review', async () => {`,
        1,
      ],
    ],
  },
]
```

```bash
node .tmp/s2/replace-exact.mjs .tmp/s2/finalize-order-test.mjs
pnpm exec biome check --write apps/api/src/modules/activities/activity-proof-media.test.ts
pnpm --filter @pathways/api exec vitest run src/modules/activities/activity-proof-media.test.ts
```

Expected: `activity-proof-media.test.ts: 2 edits`; PASS, 40 tests (39 and the new order test), against the unsplit service.

- [ ] **Step 2: Create the option files**

Create `.tmp/s2/services-b-split.mjs`:

```js
import { readFileSync } from 'node:fs'

const dir = 'apps/api/src/modules/activities'
const source = `${dir}/activities.service.ts`

// Every import statement of the source; the new services start from all of them and the prune step drops what they do not use.
const text = readFileSync(source, 'utf8')
const statements = [...text.matchAll(/^import\s+(?:type\s+)?\{[^}]*\}\s*from\s*'[^']+'\n/gm)]
const last = statements.at(-1)
const imports = `${text.slice(0, last.index + last[0].length)}\n`

const method = (first) => ({ first, last: '  }' })
const timeout = `// Create and update write assignments, links, budget and rule sources in one transaction; 5s is too short on the pooled remote DB.
const ACTIVITY_SAVE_TRANSACTION_TIMEOUT_MS = 20_000

`
const shell = (name, summary, constructorText) =>
  `// ${summary}\n@Injectable()\nexport class ${name} {\n  private readonly env = readApiEnv(process.env)\n\n${constructorText}\n\n`
const prismaOnly = '  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}'
const prismaAndStorage = `  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}`
const mutation = 'Promise<ActivityMutationResponse | SourceMutationAcknowledgement>'

export default {
  source,
  moves: [
    {
      to: `${dir}/activity-lifecycle.service.ts`,
      header: `${imports}${timeout}${shell(
        'ActivityLifecycleService',
        'Creates, edits, starts and cancels activities through the rule source operations.',
        prismaOnly,
      )}`,
      footer: '}\n',
      replacements: [
        [
          '  create(identity: ApplicationIdentity, projectId: string, input: CreateActivityRequest) {',
          `  create(identity: ApplicationIdentity, projectId: string, input: CreateActivityRequest): ${mutation} {`,
          1,
        ],
        ['    input: UpdateActivityRequest,\n  ) {', `    input: UpdateActivityRequest,\n  ): ${mutation} {`, 1],
        ['    input: TransitionActivityRequest,\n  ) {', `    input: TransitionActivityRequest,\n  ): ${mutation} {`, 1],
      ],
      blocks: [
        method('  create(identity: ApplicationIdentity, projectId: string, input: CreateActivityRequest) {'),
        method('  update('),
        method('  transition('),
      ],
    },
    {
      to: null,
      blocks: [
        {
          first: 'const ACTIVITY_SAVE_TRANSACTION_TIMEOUT_MS = 20_000',
          last: 'const ACTIVITY_SAVE_TRANSACTION_TIMEOUT_MS = 20_000',
        },
      ],
    },
    {
      to: `${dir}/activity-proofs.service.ts`,
      header: `${imports}${shell(
        'ActivityProofsService',
        'Publishes the upload limits and reserves the private evidence rows of one activity update.',
        prismaAndStorage,
      )}`,
      footer: '}\n',
      replacements: [
        [
          '  proofUploadLimits(projectId: string) {',
          '  proofUploadLimits(projectId: string): ActivityProofUploadLimitsResponse {',
          1,
        ],
        [
          '    input: ReserveActivityProofRequest,\n  ) {',
          '    input: ReserveActivityProofRequest,\n  ): Promise<ActivityProofReservationResponse> {',
          1,
        ],
      ],
      blocks: [method('  proofUploadLimits(projectId: string) {'), method('  async reserveProof(')],
    },
    {
      to: `${dir}/activity-proof-finalize.service.ts`,
      header: `${imports}${shell(
        'ActivityProofFinalizeService',
        'Verifies one uploaded evidence object and commits the update for review once every file is ready.',
        `  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(PRIVATE_STORAGE_FACTORIES) private readonly storageFactories: PrivateStorageFactories,
  ) {}`,
      )}`,
      footer: '}\n',
      replacements: [
        [
          '    evidenceId: string,\n  ) {',
          '    evidenceId: string,\n  ): Promise<ActivityProofFinalizeResponse> {',
          1,
        ],
      ],
      blocks: [method('  async finalizeProofFile(')],
    },
  ],
  sourceReplacements: [
    [
      '@Injectable()\nexport class ActivitiesService {',
      '// Reads the activities of one project: list, detail, editor context and assignable officers.\n@Injectable()\nexport class ActivitiesService {',
      1,
    ],
    [
      `  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(PRIVATE_STORAGE_FACTORIES) private readonly storageFactories: PrivateStorageFactories,
  ) {}`,
      prismaOnly,
      1,
    ],
    ['  context(identity: ApplicationIdentity, projectId: string) {', '  context(identity: ApplicationIdentity, projectId: string): Promise<ActivityContextItemResponse[]> {', 1],
    ['  assignableOfficers(identity: ApplicationIdentity, projectId: string) {', '  assignableOfficers(identity: ApplicationIdentity, projectId: string): Promise<AssignableOfficerResponse[]> {', 1],
    ['  list(identity: ApplicationIdentity, projectId: string) {', '  list(identity: ApplicationIdentity, projectId: string): Promise<ActivityListItemResponse[]> {', 1],
    ['  get(identity: ApplicationIdentity, projectId: string, activityId: string) {', '  get(identity: ApplicationIdentity, projectId: string, activityId: string): Promise<ActivityResponse> {', 1],
  ],
}
```

Create `.tmp/s2/services-b-lines.mjs`:

```js
export default {
  both: [
    [': Promise<ActivityMutationResponse | SourceMutationAcknowledgement> {', ' {'],
    [': ActivityProofUploadLimitsResponse {', ' {'],
    [': Promise<ActivityProofReservationResponse> {', ' {'],
    [': Promise<ActivityProofFinalizeResponse> {', ' {'],
    [': Promise<ActivityContextItemResponse[]> {', ' {'],
    [': Promise<AssignableOfficerResponse[]> {', ' {'],
    [': Promise<ActivityListItemResponse[]> {', ' {'],
    [': Promise<ActivityResponse> {', ' {'],
  ],
  more: [
    '// Reads the activities of one project: list, detail, editor context and assignable officers.',
    '}',
    '@Injectable()',
    'private readonly env = readApiEnv(process.env)',
    'constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}',
    'constructor(',
    '@Inject(PrismaService) private readonly prisma: PrismaService,',
    '@Inject(StorageService) private readonly storage: StorageService,',
    '@Inject(PRIVATE_STORAGE_FACTORIES) private readonly storageFactories: PrivateStorageFactories,',
    ') {}',
    'class ActivityLifecycleService {',
    'class ActivityProofsService {',
    'class ActivityProofFinalizeService {',
    '// Creates, edits, starts and cancels activities through the rule source operations.',
    '// Publishes the upload limits and reserves the private evidence rows of one activity update.',
    '// Verifies one uploaded evidence object and commits the update for review once every file is ready.',
  ],
  fewer: [
    'constructor(',
    '@Inject(PrismaService) private readonly prisma: PrismaService,',
    '@Inject(StorageService) private readonly storage: StorageService,',
    '@Inject(PRIVATE_STORAGE_FACTORIES) private readonly storageFactories: PrivateStorageFactories,',
    ') {}',
  ],
}
```

Create `.tmp/s2/services-b-edits.mjs` (controllers and module; the hosted seed stops building the reads service it no longer calls and the other two build it with the Prisma service alone; `reserveProof` tests the receipt's value instead of the key's presence, ruling 12):

```js
const dir = 'apps/api/src/modules/activities'
export default [
  {
    file: `${dir}/activities.controller.ts`,
    edits: [
      [
        "import { ActivitiesService } from './activities.service'\n",
        "import { ActivitiesService } from './activities.service'\nimport { ActivityLifecycleService } from './activity-lifecycle.service'\nimport { ActivityProofsService } from './activity-proofs.service'\n",
        1,
      ],
      [
        '  constructor(@Inject(ActivitiesService) private readonly activities: ActivitiesService) {}',
        `  constructor(
    @Inject(ActivitiesService) private readonly activities: ActivitiesService,
    @Inject(ActivityLifecycleService) private readonly lifecycle: ActivityLifecycleService,
    @Inject(ActivityProofsService) private readonly proofs: ActivityProofsService,
  ) {}`,
        1,
      ],
      ['this.activities.create(', 'this.lifecycle.create(', 1],
      ['this.activities.update(', 'this.lifecycle.update(', 1],
      ['this.activities.transition(', 'this.lifecycle.transition(', 1],
      ['this.activities.proofUploadLimits(', 'this.proofs.proofUploadLimits(', 1],
    ],
  },
  {
    file: `${dir}/activity-updates.controller.ts`,
    edits: [
      [
        "import { ActivitiesService } from './activities.service'\nimport { ActivityProgressService } from './activity-progress.service'\n",
        "import { ActivityProgressService } from './activity-progress.service'\nimport { ActivityProofFinalizeService } from './activity-proof-finalize.service'\nimport { ActivityProofsService } from './activity-proofs.service'\n",
        1,
      ],
      [
        '    @Inject(ActivitiesService) private readonly activities: ActivitiesService,\n    @Inject(ActivityProgressService) private readonly progress: ActivityProgressService,\n',
        '    @Inject(ActivityProgressService) private readonly progress: ActivityProgressService,\n    @Inject(ActivityProofsService) private readonly proofs: ActivityProofsService,\n    @Inject(ActivityProofFinalizeService) private readonly finalize: ActivityProofFinalizeService,\n',
        1,
      ],
      ['this.activities.reserveProof(', 'this.proofs.reserveProof(', 1],
      ['this.activities.finalizeProofFile(', 'this.finalize.finalizeProofFile(', 1],
    ],
  },
  {
    file: `${dir}/activities.module.ts`,
    edits: [
      [
        "import { ActivityEvidenceService } from './activity-evidence.service'\n",
        "import { ActivityEvidenceService } from './activity-evidence.service'\nimport { ActivityLifecycleService } from './activity-lifecycle.service'\n",
        1,
      ],
      [
        "import { ActivityProgressService } from './activity-progress.service'\n",
        "import { ActivityProgressService } from './activity-progress.service'\nimport { ActivityProofFinalizeService } from './activity-proof-finalize.service'\nimport { ActivityProofsService } from './activity-proofs.service'\n",
        1,
      ],
      [
        '    ActivityEvidenceService,\n    ActivityMilestonesService,\n    ActivityProgressService,\n    ActivityReviewService,\n',
        '    ActivityEvidenceService,\n    ActivityLifecycleService,\n    ActivityMilestonesService,\n    ActivityProgressService,\n    ActivityProofFinalizeService,\n    ActivityProofsService,\n    ActivityReviewService,\n',
        1,
      ],
    ],
  },
  {
    file: `${dir}/activity-proofs.service.ts`,
    edits: [
      // The typed reservation union needs a value test; the key test left the receipt possibly undefined.
      ["    if ('acknowledgement' in reservation)", '    if (reservation.acknowledgement)', 1],
    ],
  },
  {
    file: `${dir}/activity-capabilities.test.ts`,
    edits: [
      [
        `    const controller = new ActivitiesController({
      assignableOfficers: vi.fn(),
    } as unknown as ActivitiesService)`,
        `    const controller = new ActivitiesController(
      { assignableOfficers: vi.fn() } as unknown as ActivitiesService,
      {} as never,
      {} as never,
    )`,
        1,
      ],
    ],
  },
  {
    file: 'apps/api/prisma/local-demo-seed.ts',
    edits: [
      [
        'activities: new ActivitiesService(runtime, storage, privateStorageFactories),',
        'activities: new ActivitiesService(runtime),',
        1,
      ],
    ],
  },
  {
    file: 'apps/api/prisma/defense-demo-seed.ts',
    edits: [
      [
        'activities: new ActivitiesService(runtime, storage, privateStorageFactories),',
        'activities: new ActivitiesService(runtime),',
        1,
      ],
    ],
  },
  {
    file: 'apps/api/prisma/hosted-realistic-seed.ts',
    edits: [
      // Every call it made moved to the lifecycle service, so the reads service is no longer built here.
      [
        '  const activitiesService = new ActivitiesService(runtime, storage, privateStorageFactories)\n',
        '',
        1,
      ],
    ],
  },
]
```

- [ ] **Step 3: Move the methods, retarget the tests and the seeds**

Create `.tmp/s2/s8-services-b.sh`:

```bash
A=apps/api/src/modules/activities
S=$A/activities.service.ts
cp $S .tmp/s2/activities.service.services-b-before.ts
node .tmp/s2/move-blocks.mjs .tmp/s2/services-b-split.mjs
node .tmp/s2/imports.mjs add $S '@pathways/shared' type:ActivityContextItemResponse type:ActivityListItemResponse type:ActivityResponse type:AssignableOfficerResponse
node .tmp/s2/imports.mjs add $A/activity-lifecycle.service.ts '@pathways/shared' type:ActivityMutationResponse type:SourceMutationAcknowledgement
node .tmp/s2/imports.mjs add $A/activity-proofs.service.ts '@pathways/shared' type:ActivityProofReservationResponse type:ActivityProofUploadLimitsResponse
node .tmp/s2/imports.mjs add $A/activity-proof-finalize.service.ts '@pathways/shared' type:ActivityProofFinalizeResponse
for f in activities.service activity-lifecycle.service activity-proofs.service activity-proof-finalize.service; do node .tmp/s2/imports.mjs prune $A/$f.ts; done
node .tmp/s2/same-lines.mjs .tmp/s2/activities.service.services-b-before.ts -- $S $A/activity-lifecycle.service.ts $A/activity-proofs.service.ts $A/activity-proof-finalize.service.ts --opts .tmp/s2/services-b-lines.mjs
# Tests and seeds call the services that now own each method.
node .tmp/s2/seed-services.mjs ActivityLifecycleService activityLifecycle activity-lifecycle.service 1 create,transition
node .tmp/s2/seed-services.mjs ActivityProofsService activityProofs activity-proofs.service 2 reserveProof
node .tmp/s2/seed-services.mjs ActivityProofFinalizeService activityProofFinalize activity-proof-finalize.service 3 finalizeProofFile
node .tmp/s2/replace-exact.mjs .tmp/s2/services-b-edits.mjs
M=create,update,transition,proofUploadLimits,reserveProof,finalizeProofFile,context,assignableOfficers,list,get
for f in activities.access activity-capabilities activity-overdue-explanation activity-proof-media activity-proof-review-flow feature-read.local; do node .tmp/s2/retarget-service.mjs $A/$f.test.ts $M; done
node .tmp/s2/retarget-service.mjs apps/api/src/modules/rules/rules-source-domains.test.ts $M
node .tmp/s2/imports.mjs prune apps/api/prisma/hosted-realistic-seed.ts
```

Run it as one block and stop at the first error:

```bash
bash -e .tmp/s2/s8-services-b.sh
```

Expected: the cuts print `101, 124, 72` lines for the lifecycle service (`activity-lifecycle.service.ts: 392 lines`), `2` for the timeout constant, `5, 187` for the proofs service (`activity-proofs.service.ts: 286 lines`) and `228` for the finalize service (`activity-proof-finalize.service.ts: 322 lines`); `activities.service.ts: 229 lines`; `same lines: 863`; the seed lines add `ActivityLifecycleService`, `ActivityProofsService` and `ActivityProofFinalizeService` to the local and defense seeds and `ActivityLifecycleService` to the hosted seed; the edit script prints `activities.controller.ts: 6 edits`, `activity-updates.controller.ts: 4 edits`, `activities.module.ts: 3 edits`, `activity-proofs.service.ts: 1 edits` and the seed edits; the retarget lines name the services each test now builds (`rules-source-domains.test.ts: ActivityLifecycleService, ActivityProofsService, ActivityProofFinalizeService`). Any other `same-lines` output: stop, the move is not verbatim.

- [ ] **Step 4: Run the tests and commit**

```bash
git add -N apps/api packages/shared
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts')
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api
git commit -m "refactor(api): split lifecycle and proof services out of ActivitiesService

ActivitiesService now holds the four reads; finalizeProofFile keeps its storage verification between its two operations.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: typecheck passes (it also checks the four seeds); api = `B_api + 16`. No service file is over 400 lines.

---

### Task 9: Storage test seams and the inspection service

**Files:**
- Modify: `apps/api/src/modules/activities/private-proof-inspection.service.ts`, `private-proof-inspection.service.test.ts`, `activity-proof-media.test.ts`, `activity-proof-review-flow.test.ts`
- Create: `.tmp/s2/seams-edits.mjs`, `.tmp/s2/seams-mock-cuts.mjs`

**Interfaces:**
- Consumes: `PRIVATE_STORAGE_FACTORIES` as the services already take it; `evidenceExtension` from Task 5.
- Produces: no new export. The three `vi.mock` calls of `private-inspection-reader` that F3b left are gone; the tests inject `{ ...privateStorageFactories, createPrivateUploadVerifier }` or `{ ...privateStorageFactories, createPrivateObjectStreamer }`. `private-proof-inspection.service.ts` takes `Tx` and derives its file extensions from `evidenceExtension`.

- [ ] **Step 1: Create the option files**

Create `.tmp/s2/seams-mock-cuts.mjs`:

```js
const dir = 'apps/api/src/modules/activities'
const mock = (first) => ({ first, last: '}))' })
export default [
  {
    source: `${dir}/activity-proof-media.test.ts`,
    moves: [
      {
        to: null,
        blocks: [
          mock(
            "vi.mock('@app/modules/storage/private-inspection-reader', async (importOriginal) => ({",
          ),
        ],
      },
    ],
  },
  {
    source: `${dir}/activity-proof-review-flow.test.ts`,
    moves: [
      {
        to: null,
        blocks: [
          mock(
            "vi.mock('@app/modules/storage/private-inspection-reader', async (importOriginal) => ({",
          ),
        ],
      },
    ],
  },
  {
    source: `${dir}/private-proof-inspection.service.test.ts`,
    moves: [
      {
        to: null,
        blocks: [mock("vi.mock('../storage/private-inspection-reader', async (importOriginal) => ({")],
      },
    ],
  },
]
```

Create `.tmp/s2/seams-edits.mjs` (the inspection service's seven-entry extension table was a second copy of `evidenceExtension` without the dot; its existing seven-type test pins every extension):

```js
const dir = 'apps/api/src/modules/activities'
const verifier = `const finalizeService = new ActivityProofFinalizeService(
  {} as PrismaService,
  storage as unknown as StorageService,
  privateStorageFactories,
)`
const injectedVerifier = `// The upload verifier is injected, so the real storage reader module is never mocked.
const finalizeService = new ActivityProofFinalizeService(
  {} as PrismaService,
  storage as unknown as StorageService,
  { ...privateStorageFactories, createPrivateUploadVerifier: () => state.verify },
)`
export default [
  {
    file: `${dir}/activity-proof-media.test.ts`,
    edits: [[verifier, injectedVerifier, 1]],
  },
  {
    file: `${dir}/activity-proof-review-flow.test.ts`,
    edits: [[verifier, injectedVerifier, 1]],
  },
  {
    file: `${dir}/private-proof-inspection.service.test.ts`,
    edits: [
      [
        'const service = new PrivateProofInspectionService({} as PrismaService, privateStorageFactories)',
        `// \`read\` is the verification pass and \`release\` is the streamed pass after final audit.
const service = new PrivateProofInspectionService({} as PrismaService, {
  ...privateStorageFactories,
  createPrivateObjectStreamer: () => ({ verify: state.read, release: state.release }),
})`,
        1,
      ],
    ],
  },
  {
    file: `${dir}/private-proof-inspection.service.ts`,
    edits: [
      [/const proofExtensions: Record<string, string> = \{[^}]*\}\n\n/, '', 1],
      [
        'proofExtensions[contentType]',
        'evidenceExtension[contentType as ActivityEvidenceContentType].slice(1)',
        1,
      ],
      ['tx: Prisma.TransactionClient,', 'tx: Tx,', 1],
    ],
  },
]
```

- [ ] **Step 2: Apply**

Create `.tmp/s2/s9-seams.sh`:

```bash
A=apps/api/src/modules/activities
node .tmp/s2/move-blocks.mjs .tmp/s2/seams-mock-cuts.mjs
node .tmp/s2/replace-exact.mjs .tmp/s2/seams-edits.mjs
P=$A/private-proof-inspection.service.ts
node .tmp/s2/imports.mjs add $P '@pathways/shared' type:ActivityEvidenceContentType
node .tmp/s2/imports.mjs add $P './activity-proof.helpers' evidenceExtension
node .tmp/s2/imports.mjs add $P '../../common/prisma/transaction' type:Tx
for f in private-proof-inspection.service.ts activity-proof-media.test.ts activity-proof-review-flow.test.ts private-proof-inspection.service.test.ts; do node .tmp/s2/imports.mjs prune $A/$f; done
```

Run it as one block and stop at the first error:

```bash
bash -e .tmp/s2/s9-seams.sh
```

Expected: the three cuts print `4`, `4` and `5` lines (`activity-proof-media.test.ts: 690 lines`, `activity-proof-review-flow.test.ts: 462 lines`, `private-proof-inspection.service.test.ts: 416 lines`); the edit script prints `1 edits` for each test and `3 edits` for the service; the prunes print `pruned nothing`.

- [ ] **Step 3: Run the tests and commit**

```bash
git add -N apps/api packages/shared
pnpm exec biome check --write $(git diff --name-only --diff-filter=AMR HEAD -- '*.ts')
pnpm --filter @pathways/api exec vitest run src/modules/activities src/app-module-wiring.test.ts src/common
pnpm typecheck && pnpm lint
git grep -n "private-inspection-reader" -- apps/api/src/modules/activities | grep "vi.mock"
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api
git commit -m "refactor(api): inject storage factories in the proof tests and tidy the inspection service

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the `git grep` prints nothing; api = `B_api + 16` (unchanged by this task).

---

### Task 10: Records

**Files:**
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.2, 3.4, 3.7, 9)
- Modify: `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-04, MOD-11 rows)
- Modify: `docs/index.md` (CR row status), `docs/deferred-features.md`, `docs/qad-pathways.md`, `docs/activity-log.md`

- [ ] **Step 1: Amend the Change Record**

`docs/cr-pathways-codebase-modularization.md`:

Section 3.2, append to the paragraph below the table:

```text
Private helpers that need the caller's transaction become function modules named `<purpose>.service.ts` that take `tx` (S1a: `project-team.service.ts`; S2a: `activity-access.service.ts`, `activity-metrics.service.ts`, `activity-links.service.ts`, `activity-budget.service.ts`); injectable services are split by responsibility and keep the public method names of the service they came from (amended 2026-10-12 for S2a).
```

Section 3.4, append to the paragraph:

```text
`contracts/common/source-mutation-acknowledgement.ts` holds the receipt shape of the source mutation routes; `contracts/activities/` holds the activity, milestone, proof and extension contracts and the evidence content type constants (amended 2026-10-12 for S2a).
```

Section 3.7, replace the row

```markdown
| S2 | Activities, extensions, proofs, milestones | Largest service; depends on S1 |
```

with

```markdown
| S2a, S2b | Activities, extensions, proofs, milestones. S2a: contracts, controller split, mapper, helpers and the service split; S2b: web client and feature components | Largest service; depends on S1 |
```

Section 9, append (replace `<date>` with the merge date):

```markdown
S2a applied <date> on refactor/s2a-activities:
- Contracts: `createActivityRequest`, `updateActivityRequest`, `transitionActivityRequest`, `recordActivityProgressRequest`, `reserveActivityProofRequest`, `recordOverdueExplanationRequest`, `reviewActivityUpdateRequest`, `saveMilestoneRequest`, `updateMilestoneRequest` (`contracts/activities/activity-requests.ts`) and `createActivityExtensionRequest`, `verifyActivityExtensionRequest`, `decideActivityExtensionRequest` replaced thirteen class-validator DTO classes; parity tests ran each DTO and contract through the configured pipes (285 checks for the activity and milestone DTOs, 47 for the extension DTOs) before the classes were deleted; `activities.dto.ts` keeps `JourneyStageInputDto` and `SaveJourneyConfigurationDto` for S4. `countInput` and `pesoAmountInput` joined `field-schemas.ts` and `project-requests.ts` uses them; the evidence constants live in `contracts/activities/activity-evidence.ts`; `activity-responses.ts` and `sourceMutationAcknowledgement` type the mapper and every public service method that returns a mapped shape.
- Controllers: `activities.controller.ts` (three controllers) became five files by purpose (`activities`, `activity-updates`, `activity-proofs`, `activity-milestones`, `activity-evidence`); a module route table test and an HTTP routing test pin the 20 routes, their permissions and the order of the fixed GET segments.
- Services: the 2479-line `activities.service.ts` became eight injectable services (`ActivitiesService` about 180 lines for the reads, `ActivityLifecycleService`, `ActivityProgressService`, `ActivityEvidenceService`, `ActivityProofsService`, `ActivityProofFinalizeService`, `ActivityReviewService`, `ActivityMilestonesService`, each under 360 lines), four function modules that take the caller's `tx`, `activities.mapper.ts`, `activities.helpers.ts` and `activity-proof.helpers.ts`; the extension service moved its row mapper and three pure helpers out (454 to about 370 lines). Public method names and bodies are unchanged and the moves were proven verbatim line by line.
- Kernel: `requestIdentity` replaced the guard copy in six controllers; `requireScopedProjectRow` replaced three inline project lookups; the two inline copies of the active assignment check call `requireActiveAssignment`; the inspection service takes `Tx` and derives its file extensions from `evidenceExtension`.
- Tests: the DTO validation cases became contract tests; the three `importOriginal` mocks of `private-inspection-reader` that F3b left became injected fake factories; eleven test files and four seed files build the split services (`retarget-service.mjs` and `seed-services.mjs`).
- Decisions: S2 split into S2a and S2b (ruling 1); eight injectable services and four function modules (ruling 2); controllers split with the fixed GET segments first (ruling 3); optional DTO fields became `.nullish()`, and `null` for `budgetAllocation` (400 or 403 inside the service) and `indicatorIds` (a 500) now answers 400 at the pipe, beside the F3b prototype keys (ruling 4); `title` and `description` stay untrimmed before the length rule, as the DTOs had them (ruling 5); no milestone response contract (ruling 8); `list`, `get` and the inspection lookup keep their inline project lookups (ruling 10); `if ('acknowledgement' in reservation)` became `if (reservation.acknowledgement)` (ruling 12).

Deferred to S2b: `lib/api/activities` and the activity, extension, evidence and proof methods of `pathways-client.ts`, `private-proof-client.ts`, the `features/projects` activity folder layout, the four oversized components, the hand-written web activity types, the place of `activityExtensionSchema`, and the dead `files` option and `proofSnapshot` of `source-mutation.ts` (F1 deferral). Left to later slices: 18 controllers that still repeat the request identity check and 40 direct `Prisma.TransactionClient` annotations in api production code.
```

- [ ] **Step 2: Update the audit, the index and the living docs**

- Audit: append to the disposition cell of MOD-04 `; activities service split by S2a.` and of MOD-11 `; activity, milestone and extension DTOs replaced by S2a.`
- `docs/index.md`: in the CR row status, add `S2a` to the applied list and name as next the first sub-project in roadmap order that is not applied (for example `Approved; F1 to F4b, S1a, S1b and S2a applied, S2b next`); change the S2 plan row status to `S2a executed; holds the S2b outline` after Task 11.
- Moved paths named by living docs:

```bash
sed -i 's#`apps/api/src/modules/activities/activities.service.ts` (`readMetrics`)#`apps/api/src/modules/activities/activity-metrics.service.ts` (`readMetrics`)#; s#`apps/api/src/modules/activities/activities.service.ts` `readReached`#`apps/api/src/modules/activities/activity-metrics.service.ts` `readReached`#' docs/deferred-features.md
sed -i 's#apps/api/src/modules/activities/activities.service.test.ts#apps/api/src/modules/activities/activities.helpers.test.ts#' docs/qad-pathways.md
git grep -nE "activities\.dto|activity-extensions\.dto|activities\.service\.test|activities\.service\.ts. .readMetrics|activities\.service\.ts. .readReached" -- docs ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/cr-*' ':!docs/superpowers/*'
```

Expected: the `git grep` prints nothing (no living doc names a removed path; the historical CRs and audits keep the paths they were written against).

- [ ] **Step 3: Activity log**

Add to `docs/activity-log.md`:

```markdown
## <date> Modularization S2a activities api (refactor/s2a-activities)
```

with one bullet per Task 1 to Task 9 stating what was added, switched, split or adopted, with its commit hash and the shared and api test counts at the end of that task (`B_shared + 44` and `B_api + 285` after Task 1 down to `B_shared + 48` and `B_api + 16` after Task 9); a bullet with the parity results (285 activity and milestone checks and 47 extension checks agree; the accepted differences are the prototype keys and the two null bodies of ruling 4); a bullet saying the S2a decisions are recorded in the change record section 9 (the plan stays until S2b is planned, because it holds the S2b outline); and a bullet listing the S2b deferrals. Task 11 Step 5 appends the gate results.

- [ ] **Step 4: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint
git add docs
git commit -m "docs: record modularization S2a

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline.

---

### Task 11: Full release gates and merge

- [ ] **Step 1: Static gates and dist layout**

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm sad:test
git checkout -- apps/web/next-env.d.ts
test -f packages/shared/dist/contracts/activities/activity-requests.js && test -f packages/shared/dist/contracts/activities/activity-responses.js && test -f packages/shared/dist/contracts/common/source-mutation-acknowledgement.js && test -f apps/api/dist/packages/shared/src/contracts/activities/activity-evidence.js && test -f apps/api/dist/apps/api/src/modules/activities/activities.mapper.js && test -f apps/api/dist/apps/api/src/modules/activities/activity-lifecycle.service.js && test -f apps/api/dist/apps/api/src/modules/activities/activity-proof-finalize.service.js && test -f apps/api/dist/apps/api/src/modules/activity-extensions/activity-extensions.mapper.js && test ! -e apps/api/dist/apps/api/src/modules/activity-extensions/activity-extensions.dto.js && echo "dist layout ok"
pnpm --filter @pathways/web build > .tmp/s2/web-build-gates.log 2>&1; echo "exit $?"
grep -E "Middleware" .tmp/s2/web-build-gates.log
git checkout -- apps/web/next-env.d.ts
```

Expected: all pass and `dist layout ok` (nest `deleteOutDir` removes the old extension DTO output; `activities.dto.js` stays for the two journey classes); web build exit 0 with Middleware at most `M0` (the barrel grows, and `"sideEffects": false` must keep the new contracts out of the Edge bundle). Versus Task 0: shared = `B_shared + 48` (field helpers 2, activity requests 42, extension requests 4), api = `B_api + 16` (HTTP validation 11 and 6, route table 3, routing 5, date validation 4, finalize order 1, minus 13 DTO validation tests and 1 runtime-metadata case), sad unchanged, config, imports and web unchanged.

- [ ] **Step 2: Local DB replay**

```powershell
./infra/supabase/phase6/Replay-Local.ps1 -MigrationBaseline
```

Expected: exit 0 (it runs `feature-read.local.test.ts`, which constructs `ActivitiesService` against the database, and `activity-extensions.local.test.ts`).

- [ ] **Step 3: Local stack, compiled API boot, e2e and smoke**

Stop anything on ports 3000 and 4000 first.

```bash
pnpm db:local:start && pnpm db:local:reset && pnpm db:local:demo
pnpm dev:local
```

`pnpm db:local:demo` runs the seeds that now build the split activity services (it creates activities, records progress, reserves and finalizes proofs, reviews them and records an overdue explanation through `ctx.services`); `pnpm dev:local` builds the API and runs `dist`, so a Nest dependency error naming any of the eight services stops it. In a second terminal:

```bash
curl -s http://127.0.0.1:4000/api/health
npx playwright test --config playwright.config.ts
npx playwright test --config playwright.auth-navigation.config.ts
```

Expected: `"status":"ok"`; a module-resolution error, a `createActivityRequest` undefined error or `Nest can't resolve dependencies` in the `pnpm dev:local` output fails the gate; auth-navigation 27/27; main suite 39 pass, 9 fail, 22 not run, with the same 9 failing as the F1 to S1a gate runs (MFA Verify helper, password-login harness, workflows seed end date). Browser smoke against the compiled API, each step as a demo user whose role allows it: as Project Manager open a project's Activities tab, open the editor (assignable officers list), create an activity with a lower-case code padded with spaces, a target count and a budget and confirm the list shows the code upper-cased, start it, then edit its dates and save, then cancel another with a reason (the lifecycle service and the replay body); as an assigned Project Officer record a progress note and submit a proof with two files (reserve, signed upload, finalize); as the M&E Officer open the pending update, inspect a proof file and approve it, return another, and open the proof download; open an overdue activity as M&E and record an explanation; as the officer request an extension, as M&E verify it, as a Project Manager approve it and confirm the new end date; open the Evidence tab as a Project Manager (records) and as a Program Manager (counts only, no file names); open the activity detail of a project outside the role's scope and expect the same denial as on dev; call `GET /projects/<id>/activities/proof-upload-limits` from the proof dialog and confirm the limits show. Milestones have no screen: their routes are covered by `activity-milestones.test.ts` and the HTTP validation test. Every step must behave as on dev.

- [ ] **Step 4: SAD review**

```bash
pnpm sad:check --base dev --head HEAD --output .tmp/sad/s2a/manifest.json
```

Dispatch every role the manifest requires (expect `design-qa-agent`, `restraint-guardian`, `organization-isolation-checker` and `beneficiary-privacy-guardian`: the new `*.service.ts` files route to the isolation checker, the controllers, the mapper and `packages/shared/src/contracts/**` to the privacy guardian) with the section 4.2 handoff packet from `docs/sad-pathways.md`, save their section 4.4 envelopes to `.tmp/sad/s2a/reviews.json`, then:

```bash
pnpm sad:signoff -- --base dev --head HEAD --reviews .tmp/sad/s2a/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun.

- [ ] **Step 5: Record the gate results**

Append a final bullet to the Task 10 activity-log section with the gate results (per-package counts, Middleware size, replay exit code, e2e pass counts, smoke result, SAD sign-off), then:

```bash
git add docs/activity-log.md
git commit -m "docs: record modularization S2a release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Merge into local dev**

```bash
git checkout dev
git merge --no-ff refactor/s2a-activities -m "Merge refactor/s2a-activities into dev

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Keep the plan for S2b**

The plan holds the S2b outline, so it stays on dev. In `docs/index.md` section 1.6 change the S2 plan row status to `S2a executed; holds the S2b outline`, then:

```bash
pnpm docs:check 2>&1 | tail -3
git add docs/index.md
git commit -m "docs: mark S2a executed in the plan index

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline. Do not push `origin dev` until the developer says so.

---

## S2b outline (activities web, branch `refactor/s2b-activities-web`)

To be written as its own plan from dev after S2a and S1b merge; that plan's Task 0 removes this file and its index row. Counts below were taken at `4a5806d0` (before S1b) and must be recounted in S2b Task 0, because S1b rewrites `pathways-client.ts` imports and moves the `features/projects` project files.

- **Task 0, baseline:** recount every number below; confirm the F4b exports and the S1b exports listed under "Interfaces assumed", including `indexedFeatures`, `surfaceViolation` and the `optimizePackageImports: ['@/features/projects']` entry; record web Middleware.
- **Task 1, `lib/api/activities.ts`, `lib/api/activity-extensions.ts` and `lib/api/proof-inspection.ts`:** move the 20 activity, evidence and proof methods of `PathwaysClient` (`getActivityContext`, `getActivities`, `getActivity`, `getAssignableProjectOfficers`, `createActivity`, `updateActivity`, `transitionActivity`, `recordActivityProgress`, `recordOverdueExplanation`, `reviewActivityUpdate`, `downloadActivityProof`, `getEvidence`, `getActivityProofUploadLimits`, `reserveActivityProofUpload`, `uploadActivityProofFile`, `finalizeActivityProofFile` and the four extension methods) out of `pathways-client.ts` (2596 lines) as an `activitiesClient` object and an `activityExtensionsClient` object with the same signatures, and move `privateProofClient` (`lib/services/private-proof-client.ts`, 99 lines) beside them. The mutations use S1b's `requestSourceMutation`; the activity branch of `recoverSourceMutation` stays with that function. The hand-written parsers (`parseActivity`, `parseActivitySummaries`, `parseEvidenceList`, the proof reservation parsers) stay because they check untrusted responses; their return types become the S2a response types (`ActivityResponse`, `ActivityListItemResponse`, `ActivityEvidenceListResponse`, `ActivityProofReservationResponse`, `ActivityProofFinalizeResponse`) wherever the shapes match exactly, and a mismatch is reported, not fixed by a cast. Inputs keep the view-model fields the forms use (`projectId`, `id`) and are typed `Omit<CreateActivityRequest, 'clientMutationId'>` plus those fields. 51 files reference the methods (26 production); 18 of the 49 `vi.mock('@/lib/services/pathways-client', ...)` factories define one and must split into a second `vi.mock('@/lib/api/activities', ...)` in the same commit, counted before and after, because a stub left behind silently stops applying and the real client runs. `getActivities`, `getActivityContext` and `getEvidence` are also called from analytics, the rules board, collection and the beneficiary loaders; S7's binding-reads codemod copies the fetcher as it finds it. SAD: `apps/web/src/lib/api/**/*.ts` already routes to the privacy guardian from F4b.
- **Task 2, feature folder:** `git mv` the 35 activity, evidence and proof files of `features/projects` (everything matching `activity-*`, `evidence-panels`, `private-proof-*` and `project-activities-*` except the four expense files, which S6 claims) into `features/projects/activities/{components,hooks}` with `activities.reads.ts`, `activities.utils.ts` (`activity-utils.ts`, `activity-form-validation.ts`) and `activities.copy.ts`, together with their tests, and add `features/projects/activities/index.ts` exporting `ProjectActivitiesWorkspace`, `ActivityDetailPage`, `ActivityDetailPanel` and `ActivityProofDialog`. The route pages and `role-dashboard.tsx` already import through `features/projects/index.ts` (S1b), and S1b's surface rule already covers the whole feature, so `activities/index.ts` is an internal sub-index that `features/projects/index.ts` re-exports from: repoint those export lines and add no rule (MOD-15 for activities).
- **Task 3, oversized components (MOD-06):** split `activity-form-dialog.tsx` (846 lines), `activity-detail-panel.tsx` (800), `activity-proof-dialog.tsx` (773) and `project-activities-workspace.tsx` (750) by component and hook, verbatim, with characterization tests first where the existing tests (`activity-form-dialog.test.tsx`, `activity-detail-panel.test.tsx`, `activity-proof-dialog.test.tsx`, `project-activities-workspace.test.tsx`, `project-activities-rbac.test.tsx`) do not render the moved part. The permission checks in these components use `usePermission` already or stay as `principalHasAtomicPermission` calls where F4a left no wrapper. The F4b dialog check found no raw `DialogContent` repeating `DialogShell`, so no activity dialog is restyled here; restyling raw dialogs needs a design review and is not part of S2.
- **Task 4, web types and reads (MOD-05, MOD-16):** `types/pathways.ts` holds 23 activity, proof and evidence types (`Activity`, `ActivitySummary`, `ActivityCapabilities`, `ActivityProof`, `ActivityUpdateNote`, `CreateActivityInput`, `UpdateActivityInput`, `ActivityProofReservation`, `EvidenceList` and others); replace each that is identical to a contract type with the contract type and keep the view models the contracts do not cover (UI status labels, form inputs). Move `activityExtensionSchema` from `packages/shared/src/monitoring/activity-extension.ts` to `contracts/activities/activity-extension-response.ts` as `activityExtensionResponse` (the web parses it at runtime and the api service test imports it; 4 call sites in `pathways-client.ts`, 1 api test), keeping the barrel names unique. `activities.reads.ts` holds the `project-activities` key now in `projects.reads.ts` (was `use-project-reads.ts`) and the `activity-assignable-officers` and `activity-update-review` keys now in the workspace and the review dialog; share a key across call sites only where the fetcher, permission and freshness are identical, because one key is one cache entry.
- **Task 5, dead proof upload code (F1 deferral):** `lib/services/source-mutation.ts` still carries the multipart-era `files` option of `execute` (count, size and total byte bounds) and `proofSnapshot`; production code no longer passes files (the direct upload routes replaced it) and only `source-mutation.test.ts` exercises them. Recount the production callers, then delete the option, `proofSnapshot`, the file bounds and the test cases that only cover them.
- **Task 6, records:** CR 3.3 and section 9 S2b disposition, audit MOD-05, MOD-06, MOD-15, MOD-16 and MOD-17 (activities parts), index, activity log.
- **Task 7, gates and merge:** as S2a Task 11, with Middleware measured and a smoke over the activities tab, the detail page, the form, the progress, proof and explanation dialogs, the review dialog and private inspection, the extension panel, the evidence tab, the dashboard widgets that open an activity, the analytics and rules pickers that list activities, and the beneficiary loaders that read the activity context. After merge, remove this plan and its index row.
