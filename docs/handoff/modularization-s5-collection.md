# S5 Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the collection API (form metadata, direct entry and imports) shared zod request contracts, split `imports.service.ts` (2120 lines after S4), `metadata.service.ts` (1315) and `packages/imports` `smart-match.ts` (626) by responsibility, and remove the phase-coded file names, with no change to any route, status code, response body, audit row, permission decision, transaction boundary, SQL statement or matcher decision.

**Architecture:** S5 is split (ruling 1). This plan gives S5a in full (ten tasks including baseline and gates) and S5b, the web client and the one import flow, as an outline at the end. S5a first adds two input schemas beside the S1 field schemas, then replaces the imports and metadata DTOs after parity tests, then turns each service into a facade that keeps its constructor, its route methods and one `withAuthorizedOperation` wrapper per transaction, while the work inside each transaction moves verbatim into function modules that take the caller's `tx`. Mechanical edits use one-off Node scripts under `.tmp/s5a/` (gitignored, never committed) whose content is given in full. Every step was dry-run on an exported copy of `a101ad7c` (F4a complete) with the S1a field schemas and `requestIdentity` added from the S1 plan and the S4a registration service edits to the imports service, its three tests and two seeds applied as the S4 plan writes them (with a delegating `BeneficiaryRegistrationService` stand-in): the copy typechecked (api source, tests and seeds), its api, shared and imports suites passed apart from harness-only parse-worker faults that fail identically on an unmodified copy, and the outputs quoted below come from those runs.

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, NestJS 10.4.22, class-validator 0.14.4 on validator 13.15.26, class-transformer 0.5.1, zod 3.25.76, Prisma 6.19, Vitest 3.2, Biome 1.9.4, Next 15.5.14, Playwright.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.1 to 3.7 with roadmap row S5, 4, 6, 7, and 9 including the F1 to F4b and S1 to S4 dispositions) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-04, MOD-11 and MOD-17 for S5a; MOD-05, MOD-06, MOD-07, MOD-15 and MOD-16 for S5b).

## Rulings

Controller rulings for S5 (2026-10-12). Each was checked against `refactor/f4a-web-boundaries` `a101ad7c` (local dev `675a0b58` differs only in `docs/activity-log.md`). S1 to S4 run before S5; of their plans only S4 edits files this plan edits (`imports.service.ts`, three imports tests and two seeds, see "Interfaces assumed from earlier slices"), and Task 0 checks the file hashes of the others and that S4 changed only registration service names in those four, so a changed anchor stops the work before any edit.

1. **Split into S5a and S5b.** The S5 row covers contracts, two api service splits, `packages/imports`, the web client, the merge of the two web import flows (MOD-07) and three oversized components (`collection-workspace.tsx` 3182 lines, `import-workspace.tsx` 1130, `direct-form-entry-workspace.tsx` 657); that is about eighteen tasks. S5a (this plan, branch `refactor/s5a-collection-api`) takes the contracts, the api and `packages/imports`; S5b (outline below, branch `refactor/s5b-collection-web`) takes the web. Both names replace `refactor/s5-collection`.
2. **Two contract files.** `packages/shared/src/contracts/imports/import-requests.ts` (F3b) gains `uploadImportRequest`, `importMappingItemRequest`, `saveImportMappingRequest`, `automaticImportMappingRequest`, `processImportRequest` and `importRowsQuery`; `packages/shared/src/contracts/metadata/form-requests.ts` holds `digitalFormTypes`, `formResponseValues`, `formFieldRequest`, `createFormRequest`, `updateFormRequest`, `generateFormRequest`, `formVersionRequest`, `validateFormValuesRequest`, `saveSubmissionRequest`, `updateSubmissionRequest`, `submitSubmissionRequest` and `listSubmissionsQuery`, each with its inferred type (CR 3.6 names). They reuse the S1 field schemas (`lengthString`, `uuidString`, `isoDateString`, `trimmedInput`), so every length counts as class-validator counted it. S5 validates at the controller with `ZodPipe`, as S1 does (CR 3.6), not inside the service.
3. **Optional means nullish, with recorded exceptions.** Every `@IsOptional()` field is `.nullish()` (S1 ruling 3, CR 3.6), except `saveSubmissionRequest.beneficiaryId`, which is `.optional()`: `null` passed the DTO and then failed inside the service with 400 `An identified subject is supported only for a training survey.` (or the earlier 404 or 409 of the form checks), and `requireSurveySubject` would need a type change to accept it. Over 87 import and 131 metadata bodies the DTO and contract routes agree on accept or reject and on the accepted value, except: the F3b prototype keys (`__proto__`, `constructor`), now rejected; an array where a mapping, value map entry or form field object belongs, which the DTO pipe let through (`ValidateNested` accepts arrays) and the service then refused with 400 or 409, now 400 at the pipe; a `null` beneficiary, now 400 at the pipe; and a `constructor` key in response values, below. No client sends these bodies.
4. **Query bounds read like `@Type(() => Number)`, not `z.coerce`.** `queryInteger(min, max)` passes `Number(value)` for a scalar and leaves an array as it is, so `?take=0x10` is 16, `?offset=` is 0 and `?offset=1&offset=2` answers 400, as the DTO did; `z.coerce.number()` would read `['5']` as 5. Defaults come from `.default()`. CR 3.6 is amended.
5. **Response values keep class-transformer's copy rules.** `IsObject()` bodies were copied by class-transformer, which silently dropped own keys named after an `Object.prototype` method (`toString`, `valueOf`, `hasOwnProperty` and seven more) and crashed with a 500 on a `constructor` key at any depth. `formResponseValues` drops the same ten keys (otherwise the form validator would now report them as `unknown_field`) and answers 400 for a `constructor` key. `__proto__` is dropped by both. CR 3.6 is amended.
6. **Import bounds are literals pinned by a test.** `packages/shared` cannot import `@pathways/imports` (imports depends on shared), so `importRequestLimits` holds `maxSourceColumns: 500`, `maxValueMapEntries: 50` and `maxValueMapTextLength: 100`, and `packages/imports/src/limits.test.ts` fails if they drift from `IMPORT_ENGINEERING_LIMITS` or `IMPORT_VALUE_MAP_LIMITS`. `IMPORT_DATA_TYPES` in `imports.dto.ts` equals the shared `supportedFormFieldTypes` (pinned in the parity test) and goes with the DTO; `digitalFormTypes` replaces the private `formTypes` of `metadata.dto.ts` (the web copy in `form-builder-session-draft.ts` is S5b).
7. **Message wording.** Zod wording replaces class-validator wording on the 15 switched routes (CR 3.6). The value map keeps its custom message `Control characters and formula prefixes are not allowed.` The web validates mappings, form definitions and entries before it sends them, does not show or branch on these 400 texts (`git grep "formula prefixes" -- apps/web` is empty), and no api, web or e2e test asserts the old wording; two api tests that ran a DTO through class-validator (`automatic-mapping.service.test.ts`, `metadata.generate.test.ts`) now run the contract.
8. **Facade services.** CR 7 requires split services to take the caller's `tx`. `ImportsService` and `MetadataService` keep their constructors (two seeds and ten test files construct them positionally) and every method name, including the seven private methods that tests spy on or call by name (`claimRows`, `promoteGenericRow`, `promoteRegistrationRow`, `promoteParticipationRow`, `releaseFailedRow`, `finishClaim`, `finalizeUpload`); each method that opened a transaction still opens exactly one, with the same permission and options, and its callback now calls a function that takes `tx`. The moved code is the original text, produced from the TypeScript syntax tree by `.tmp/s5a/split-service.mjs`, which reports every moved line it cannot find in the original file. Function modules that touch the database are named `*.service.ts`, so the `apps/api/src/**/*.service.ts` organization isolation route still covers them; mappers are `*.mapper.ts` (S1 ruling 10). `imports.service.ts` lands at 519 lines, above the 500 review flag, because its upload and processing loops and the seven spied wrappers must stay on the instance.
9. **One field contract mapper.** `imports.service.ts` `contract` and `jsonStrings` have the same bodies as `metadata.service.ts` `contract` and `allowedValues` (checked by `.tmp/s5a/same-function.mjs` before the imports copy is removed). They become `formFieldContract` and `jsonStringArray` in `metadata.mapper.ts`, pinned by a characterization test first; `formFieldContract` takes `FormFieldContractRow` (a `Pick` of the eleven columns it reads) so the imports field rows fit; the bodies are unchanged.
10. **Promotion handlers.** The import promotion functions call S4's `BeneficiaryRegistrationService.promoteRegistration` and `readRegistrationForm` and `ParticipantsService.promoteParticipation` through a `PromotionHandlers` object (`{ registration, participants }`, a `Pick` of those methods) that the facade builds from its injected services at each call, so S4's exports are named in one interface. The facade's third constructor field, which S4 left named `beneficiaries` while it holds the registration service (an S4 deferral to S5), is renamed `registration`; the parameter position, type and injection token are S4's, so the seeds and the positional test fakes do not change.
11. **Renames.** `p07-w10-finalization-fault.ts` and its test become `upload-finalization-fault.ts`; the class name, the `P07_W10_FAIL_FINALIZATION_ONCE` variable and the error text stay, because they are what an operator sets and reads. `imports.f6-gates.test.ts` becomes `imports.review-flow.test.ts`, `metadata.f5-gates.test.ts` becomes `metadata.direct-entry.test.ts` and `form-definition-export.f5-gates.test.ts` becomes `form-definition-export.audit.test.ts`; the test titles keep their gate IDs, which QAD rows cite. Each rename is its own commit (CR 6).
12. **Smart match split.** `smart-match.ts` splits verbatim into `smart-match-rules.ts` (algorithm ID, limits, tiers, reasons, synonym data, stop words, input and output types), `smart-match-names.ts` (normalization and name scoring), `smart-match-values.ts` (sample value gates) and `smart-match.ts` (the matcher, which re-exports the public names). `AUTO_SMART_V2` and every threshold are unchanged, so no new algorithm ID is needed; `package-exports.test.ts` pins both entry points' export lists before the split.
13. **Kernel adoption.** Both controllers use S1's `requestIdentity` (S1 ruling 9) in place of their local `profile` helper. `FormDefinitionExportService.readForm` holds the last inline project scope lookup of the slice (an F3a leftover); its UUID check, scoped `findFirst` with `select: { id: true }` and 404 `Project unavailable.` are exactly `requireScopedProject`, which replaces them in Task 5 Step 6 after a characterization case pins the lower-cased id and the malformed id. Neither module holds a `Prisma.TransactionClient` annotation in production code; the eight in four imports and metadata test harnesses stay, because existing tests change only in import paths.
14. **SAD routing.** `apps/api/src/modules/metadata/**/*.ts` and `packages/shared/src/contracts/{imports,metadata}/**/*.ts` route to metadata-import-validator, beside `apps/api/src/modules/imports/**/*.ts` and `packages/imports/src/**/*.ts`: forms, direct entry and the import request bodies are that reviewer's subject.
15. **Response contracts move with the web client.** S5a adds request contracts only. The batch, row page, form, submission and submission page response shapes (`mapBatch`, `readBatchDetail`, `readBatchRows`, `mapForm`, `findSubmission`, `listOwnSubmissions`) become types-only response contracts in S5b Task 1, where the web client that reads them is written; the api change there is a return type annotation on each mapper, checked by `pnpm typecheck` (S1 ruling 6 pattern).
16. **The large imports tests stay whole.** `imports.service.test.ts` (860 lines, 22 tests) shares one 100-line mocked transaction and fixture harness across upload, mapping, validation and processing cases, and several tests cross those concerns; `imports.chunked-promotion.test.ts` (648) is already a concern file. Splitting either would duplicate the harness for no reader benefit, as S3 ruling 14 found for indicators; both run unchanged against the facade, which is the evidence Review Focus 4 relies on.
17. **Spec facts corrected by the baseline:** `imports.service.ts` is 2118 lines at `a101ad7c` and 2120 after S4's constructor edit (the audit counted 2165 at `d272ee18`) and `metadata.service.ts` 1315 (1365); eight files import the two DTO modules; `GenerateFormDto` and `AutomaticImportMappingDto` were never in the controller runtime metadata test; `automaticMapping` re-checks its body inside the service, which stays; there is no imports or metadata contract on the web yet (S5b).
18. **The unused `ParticipantsService` constructor parameter stays.** S4 left its `PrismaService` parameter to S5. Removing it changes the two `new ParticipantsService(runtime)` seed calls and the participants tests, none of which S5 otherwise touches, and the global constraints keep S5 out of `apps/api/prisma`; it is recorded for W1, which moves the seeds. The imports and metadata tests pass positional fakes, so S5 needs no change there.
19. Cross-plan: S5 appends only `trimmedLowercaseInput` and `queryInteger` to the S1 `field-schemas.ts`, after S2 appended `countInput` and `pesoAmountInput`; Task 0 greps the four S1 exports it uses and that its two new names are absent, so S2's two additions are tolerated, and `field-schemas.inputs.test.ts` stays a separate file so S2's edit to `field-schemas.test.ts` cannot conflict. S5 starts from S4's `imports.service.ts`, three imports tests and two seeds (hash check in Task 0) and from S1b's `source-mutation-request.ts` for S5b. Cost if wrong: an anchor mismatch stops Task 0, or a duplicate helper name fails the barrel.
20. Cross-plan (S1b): S5b extends S1b's `indexedFeatures` and `optimizePackageImports` instead of writing a second surface rule. Cost if wrong: two rules disagree, or the collection routes grow in First Load JS.
21. Cross-plan (S2b): after S2b the web has 40 `@/lib/services/pathways-client` factories (not 42 or 56), so recount in Task 0, and `collection-workspace.test.tsx` already mocks `activitiesClient`. Cross-plan (S3b): the count is 41 on dev and stays 41 after S3b (`rule-editor.test.tsx` keeps an empty factory), so recount in Task 0; `collection-workspace.test.tsx` also mocks `@/lib/api/indicators` (`getIndicators`) and `collection-workspace.extend-projects.test.tsx` gets `indicatorsClient: api`. Cost if wrong: a miscounted mock split, or a mock added twice.

## Interfaces assumed from earlier slices

S5a reuses this kernel, unchanged: `type Tx` (`apps/api/src/common/prisma/transaction.ts`), `requireScopedProject` (`common/authz/scoped-project.ts`), `writeAuditLog` (`common/audit/write-audit-log.ts`), `withAuthorizedOperation` (`common/authz/authorized-operation.ts`), `class ZodPipe<S extends z.ZodTypeAny>` (`common/validation/zod-pipe.ts`), `supportedFormFieldTypes` and `FormValidationMode` (`@pathways/shared`).

From S1a (names as the S1 plan defines them; Task 0 checks them):

- `lengthString(min: number, max: number)`, `uuidString`, `isoDateString`, `trimmedInput<T extends z.ZodTypeAny>(schema: T)` from `packages/shared/src/contracts/common/field-schemas.ts`, exported through `@pathways/shared`.
- `requestIdentity(request: AuthenticatedRequest): ApplicationIdentity` from `apps/api/src/common/authz/request-identity.ts`.
- The `apps/api/src/**/*.mapper.ts` beneficiary-privacy-guardian route in `scripts/sad/check.ts`.

From S4a (names as the S4 plan's "Produced for later slices" defines them; Task 0 checks them):

- `BeneficiaryRegistrationService` in `apps/api/src/modules/beneficiaries/beneficiary-registration.service.ts`, exported by `BeneficiariesModule`, with `readRegistrationForm(tx: Tx, actor: ApplicationIdentity, projectId: string, formId: string, source: 'DIRECT_ENTRY' | 'IMPORTED_DATASET')` and `promoteRegistration(tx: Tx, actor: ApplicationIdentity, input, preloaded?: { form: RegistrationImportForm })`, and `type RegistrationImportForm` from the same file.
- `ImportsService` constructor `(prisma: PrismaService, storage: StorageService, beneficiaries: BeneficiaryRegistrationService, participants: ParticipantsService)`: S4 changes only the import, the third parameter's type and its `@Inject` token in `imports.service.ts`, and the type import and cast in `imports.service.test.ts`, `imports.chunked-promotion.test.ts` and `imports.f6-gates.test.ts`; the seeds construct it with the registration service.
- `ParticipantsService.promoteParticipation(tx: Tx, actor: ApplicationIdentity, input: ParticipationPromotionInput)` in `apps/api/src/modules/participants/participants.service.ts`, exported by `ParticipantsModule`, unchanged.

If S4 landed other names or edited other lines of those four files, Task 0 stops; the controller then amends `PromotionHandlers` and the facade constructor (Task 6) to S4's names.

S5b assumes F4b's `apps/web/src/lib/api/core/request.ts` (`PathwaysClientError`, `requestFoundation`, `requestFoundationResponse`; `readContextCookie` is private there), `apps/web/src/lib/api/core/request-owner.ts` (`captureRequestOwner(signal?: AbortSignal | null)`), `apps/web/src/hooks/use-authorized-read.ts` and `apps/web/src/lib/format/{date,percent,plural,tone}.ts`, and S1b's `apps/web/src/lib/api/core/source-mutation-request.ts`.

## Global Constraints

- Behavior-preserving: no route, status code, response body, audit row, permission decision, transaction boundary, SQL statement or smart-match decision changes. The only accepted differences are 400 message wording on the 15 switched routes and the bodies of ruling 3.
- Direction (CR 3.1): `apps/api/src/common/**` never imports `apps/api/src/modules/**` (non-test files); `common/import-boundary.test.ts` and `packages/shared/src/package-import-boundary.test.ts` must pass at every commit.
- Production api code uses relative imports only; `@app/` is a Vitest alias used by tests.
- File moves use `git mv` and are committed separately from logic edits. Moved code is verbatim: `split-service.mjs` must print the expected `foreign` lines and no others before Biome formats the new files.
- Split code takes the caller's `tx`; no function module opens a transaction.
- Existing tests change only in import paths, the two DTO-runner tests of ruling 7 and the runtime metadata cases of the deleted DTOs; `form-definition-export.service.test.ts` gains one characterization case (Task 5 Step 6).
- Every name exported through `packages/shared/src/index.ts` is unique (TS2308 otherwise).
- Kebab-case file names that describe purpose; comments are one sentence, no emojis; docs prose has no em dashes and no `--`.
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. New untracked files need `git add -N` before `git diff --name-only` lists them.
- `pnpm typecheck` rewrites `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` before every commit.
- After removing code, delete any import name left with no use (Biome 1.9 recommended rules do not flag unused imports); the split modules were checked with `tsc --noUnusedLocals`.
- Inline `node - <<'EOF'` scripts in this plan contain no backslashes; scripts that need them are files.
- `git ls-files` with `':!*.test.ts'` pathspecs returns nothing in this Git for Windows setup; `git grep` pathspecs work.
- One-off scripts live in `.tmp/s5a/` (gitignored) and are never committed; `.tmp/` also holds logs.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work in `C:\PATHWAYS` on branch `refactor/s5a-collection-api`; no new worktree. All paths are relative to `C:\PATHWAYS`. Do not push.
- Do not touch migrations, `.env` files, review evidence, `apps/api/prisma` or `apps/web`.

## Review Focus

1. A row page read as `?offset=5&take=10` must reach the service as the numbers 5 and 10, an absent bound must default (0 and 50 for rows, 0 and 10 for submissions), and a repeated key must answer 400 as before. Task 2 and Task 4 pin all three over HTTP; Task 1 pins `0x10`, `''` and `['5']` in the parity table.
2. A multipart upload arrives as a null-prototype object built by multer; the contract must accept its two fields and the file must still reach the service. Task 2 Step 1 posts a real `FormData` with a CSV and an invalid form id.
3. A direct entry whose values carry a key such as `toString` must still be saved as before (the key dropped, not reported as an unknown field), and a `constructor` key must answer 400, not 500. Task 3 pins both in the parity table and Task 4 over HTTP.
4. Processing a claim must run in the same transactions with the same timeouts (20 seconds per registration or participation row, 30 per chunk and per staging) and must still release a failed row for retry while a revoked permission stops the loop. The unchanged `imports.service.test.ts` and `imports.chunked-promotion.test.ts` spy on the facade's private wrappers and assert the permission and timeout of every transaction; Task 6 Step 5 runs them.
5. A published form read twice by the same actor must still be served from the published-definition cache after a fingerprint check, and an edit, publish or archive must still evict it. The cache instance stays on the facade and is passed to the form modules; the unchanged `metadata.published-cache.test.ts` runs in Task 5 Step 5.

## Out of S5a (recorded for later sub-projects)

- Web client methods, the response contracts they read (ruling 15), the one import flow, the collection components and the web form types (MOD-05, MOD-06, MOD-07, MOD-15, MOD-16 for collection): S5b, outlined at the end.
- `apps/api/src/common/validation/field-schemas-parity.test.ts` and the class-validator dependency: removed by the slice that deletes the last DTO (S8).
- `form-definition-export.service.ts` (169 lines) and `form-definition-export.ts` already follow the layout and stay apart from the project lookup of ruling 13; their `../reports/report-artifact` import is left to S6, as the S6 plan records.
- The unused `ParticipantsService` constructor parameter (ruling 18) and the eight test-only `Prisma.TransactionClient` annotations in the imports and metadata test harnesses: W1.

---

### Task 0: Branch setup and baseline

**Files:**
- Create: `docs/superpowers/plans/2026-10-12-modularization-s5-collection.md` (this plan)
- Modify: `docs/index.md` (section 1.6 plan row)

- [ ] **Step 1: Confirm local dev contains S1 to S4 and create the branch**

```bash
cd /c/PATHWAYS
git status --short
git checkout dev
git log --oneline dev | grep -m1 -E "Merge refactor/s4[a-z]?-[a-z-]+ into dev"
test -f packages/shared/src/contracts/common/field-schemas.ts && test -f apps/api/src/common/authz/request-identity.ts && echo "S1 kernel present"
test -f apps/api/src/modules/beneficiaries/beneficiary-registration.service.ts && echo "S4 registration service present"
ls docs/superpowers/plans/
git checkout -b refactor/s5a-collection-api
pnpm install --frozen-lockfile
mkdir -p .tmp/s5a
```

Expected: clean status, an S4 merge commit, `S1 kernel present` and `S4 registration service present` printed, install succeeds. If any is missing, stop and report: S5 builds on S1 to S4. Write down the plan files `ls` lists; this plan does not touch other slices' plans.

- [ ] **Step 2: Record the baseline**

```bash
pnpm --filter @pathways/shared build
pnpm typecheck && pnpm test 2>&1 | grep -E "Tests +[0-9]+"
pnpm sad:test 2>&1 | grep -E "Tests +[0-9]+"
pnpm docs:check 2>&1 | tail -3
pnpm --filter @pathways/web build > .tmp/s5a/web-build-baseline.log 2>&1; echo "exit $?"
grep -E "Middleware" .tmp/s5a/web-build-baseline.log
git hash-object apps/api/src/modules/imports/imports.controller.ts apps/api/src/modules/imports/imports.dto.ts apps/api/src/modules/metadata/metadata.service.ts apps/api/src/modules/metadata/metadata.controller.ts apps/api/src/modules/metadata/metadata.dto.ts apps/api/src/modules/metadata/form-templates.ts packages/imports/src/mappers/smart-match.ts packages/shared/src/contracts/imports/import-requests.ts apps/api/src/modules/metadata/form-definition-export.service.ts
git hash-object apps/api/src/modules/imports/automatic-mapping.service.test.ts apps/api/src/modules/metadata/metadata.generate.test.ts apps/api/src/modules/imports/imports.controller.validation.test.ts packages/shared/src/contracts/imports/import-requests.test.ts apps/api/src/modules/metadata/form-definition-export.service.test.ts
git diff --name-only a101ad7c HEAD -- apps/api/src/modules/imports apps/api/src/modules/metadata packages/imports packages/shared/src/contracts/imports
git diff -U0 a101ad7c HEAD -- apps/api/src/modules/imports | grep -E '^[-+][^-+]' | grep -vE 'Beneficiar(ies|yRegistration)Service|beneficiar(ies|y-registration)[.]service' | wc -l
wc -l apps/api/src/modules/imports/imports.service.ts apps/api/src/modules/metadata/metadata.service.ts packages/imports/src/mappers/smart-match.ts
git grep -lE "imports\.dto'|metadata\.dto'" -- apps | wc -l
git grep -nE "src/modules/(imports/imports|metadata/metadata)\.controller\.ts" -- apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts | wc -l
git grep -nE "export (const|function) (lengthString|uuidString|isoDateString|trimmedInput)\b" -- packages/shared/src/contracts/common/field-schemas.ts | wc -l
git grep -nE "^  (async )?(promoteRegistration|readRegistrationForm|promoteParticipation)\(" -- apps/api/src/modules/beneficiaries/beneficiary-registration.service.ts apps/api/src/modules/participants/participants.service.ts | wc -l
git grep -n "export type RegistrationImportForm" -- apps/api/src/modules/beneficiaries/beneficiary-registration.service.ts | wc -l
git grep -n "private readonly beneficiaries: BeneficiaryRegistrationService" -- apps/api/src/modules/imports/imports.service.ts | wc -l
git grep -nF "'apps/api/src/**/*.mapper.ts'" -- scripts/sad/check.ts | wc -l
git grep -nwE "trimmedLowercaseInput|queryInteger|importRequestLimits|uploadImportRequest|importMappingItemRequest|saveImportMappingRequest|automaticImportMappingRequest|processImportRequest|importRowsQuery|digitalFormTypes|DigitalFormType|formResponseValues|formFieldRequest|createFormRequest|updateFormRequest|generateFormRequest|formVersionRequest|validateFormValuesRequest|saveSubmissionRequest|updateSubmissionRequest|submitSubmissionRequest|listSubmissionsQuery|formFieldContract|jsonStringArray|FormFieldContractRow|CachedFormDefinition|PromotionHandlers" -- packages apps/api | wc -l
git checkout -- apps/web/next-env.d.ts
```

Expected: typecheck clean; write down each package's passing and skipped test counts (config, shared, imports, api, web), the sad count, the docs check failure count, the web build exit code (0) and the `Middleware` size. Later tasks compare against these (`B_shared`, `B_imports`, `B_api`, `B_sad`, `M0`). The hashes print, in order: `10393eed4714d442cac7e0f61e56598713dd8384`, `0ee83c8e0ee4a23a0283391a352e63f2a3dd5ea6`, `34ab1a0a343539eac9e60fa871ebdd9c9fa575e5`, `fad0813f2a9ead8c09e3e5e0a125b190af80f81b`, `5ed04dc7109d4c10cdd9c331de8272aa946364a1`, `db8e7506589e03fccb15c28ac19a3d09bfa9cb58`, `88025a90ad5215c4d35d3a74f31a605501f8993b`, `708cbd12050e0fa8bc704e6bd082e69533455aa1`, `4760a3f49592cfbd6be1e7b66e612e2fc1d1bf53`, then `a2bce199fb6cc40820caad3140cacab375a21207`, `b9167fd18665af0a69ed56a89257d2e4aadca904`, `6662e5274d8969873986b15887af4589876c5d3e`, `8143dd48f53f989d150034e3846a0ba521719a90`, `78fa63b8ceabb6acecdd1f9d3c5fea772d8157a7`. The name-only diff lists exactly the four files S4 edits (`imports.chunked-promotion.test.ts`, `imports.f6-gates.test.ts`, `imports.service.test.ts`, `imports.service.ts`), and the filtered diff count is `0` (every changed line names the beneficiaries or registration service, as S4 Task 6 writes them). `wc` prints 2120, 1315 and 626; the greps print `8`, `2`, `4`, `3`, `1`, `1`, `1` and `0`. If any differs, stop and report: the edit anchors, codemod plans and counts below were taken at `a101ad7c` with S4's edits applied, and an earlier slice changed a file this plan edits (a `4` for the S1 schema grep and a `1` for the mapper route mean S1 is as planned; `3`, `1`, `1` for the S4 greps mean S4 is as planned).

- [ ] **Step 3: Add the plan and commit**

The controller has saved this plan as `docs/superpowers/plans/2026-10-12-modularization-s5-collection.md`.

In `docs/index.md` section 1.6, add as the last row of the table:

```markdown
| [S5 collection plan](superpowers/plans/2026-10-12-modularization-s5-collection.md) | 2026-10-12-modularization-s5-collection.md | 2026-10-12 | S5 of the codebase modularization: S5a imports and metadata contracts, imports and metadata service splits and the smart-match split; S5b outline | In progress |
```

```bash
git add docs/superpowers/plans/2026-10-12-modularization-s5-collection.md docs/index.md
pnpm docs:check 2>&1 | tail -3
git commit -m "docs: add the S5 collection plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Step 2 baseline.

---

### Task 1: Input schemas, import request contracts and parity evidence

**Files:**
- Modify: `packages/shared/src/contracts/common/field-schemas.ts` (two schemas appended)
- Test: `packages/shared/src/contracts/common/field-schemas.inputs.test.ts`
- Modify: `packages/shared/src/contracts/imports/import-requests.ts` (full content below)
- Test: `packages/shared/src/contracts/imports/import-requests.test.ts` (full content below)
- Test: `packages/imports/src/limits.test.ts`
- Create (deleted again in Task 2): `apps/api/src/modules/imports/import-request-parity.test.ts`

**Interfaces:**
- Consumes: S1 `lengthString`, `uuidString`, `trimmedInput`; shared `supportedFormFieldTypes`.
- Produces, from `@pathways/shared`: `trimmedLowercaseInput<T extends z.ZodTypeAny>(schema: T)` (a `z.preprocess` that trims and lower-cases a string); `queryInteger(min: number, max: number)` (a `z.preprocess` of `Number()` for scalars into `z.number().int().min(min).max(max)`); `importRequestLimits` (`{ maxSourceColumns: 500, maxValueMapEntries: 50, maxValueMapTextLength: 100 }`); `uploadImportRequest` with `type UploadImportRequest` (`{ formId: string; clientImportId: string }`); `importMappingItemRequest` with `type ImportMappingItemRequest` (`sourceFieldName: string`, `targetFieldCode?: string | null`, `ignored: boolean`, `dataType?: SupportedFormFieldType | null`, `valueMap?: { from: string; to: string }[] | null`); `saveImportMappingRequest` with `type SaveImportMappingRequest` (`{ expectedMappingRevision: number; mappings: ImportMappingItemRequest[] }`); `automaticImportMappingRequest` with `type AutomaticImportMappingRequest` (`{ expectedMappingRevision: 0 | 1 }`); `processImportRequest` with `type ProcessImportRequest` (`{ expectedValidationRevision: number }`); `importRowsQuery` with `type ImportRowsQuery` (`{ offset: number; take: number }`). `validateImportRequest` is unchanged.

- [ ] **Step 1: Write the failing input schema test**

Create `packages/shared/src/contracts/common/field-schemas.inputs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { queryInteger, trimmedLowercaseInput } from './field-schemas'

describe('lower-case and query input schemas', () => {
  it('trims and lower-cases a string before validating and leaves other values alone', () => {
    const code = trimmedLowercaseInput(z.string().regex(/^[a-z]+$/))
    expect(code.parse('  SEX ')).toBe('sex')
    expect(code.safeParse(5).success).toBe(false)
  })

  it.each([
    ['7', 7],
    [' 7 ', 7],
    ['0x10', 16],
    ['1e1', 10],
    ['', 0],
  ])('reads the query value %j as %d', (value, expected) => {
    expect(queryInteger(0, 100).parse(value)).toBe(expected)
  })

  it.each([['1.5'], ['abc'], ['-1'], ['101'], [['5']], [{ a: '5' }]])(
    'rejects the query value %j',
    (value) => {
      expect(queryInteger(0, 100).safeParse(value).success).toBe(false)
    },
  )
})
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/common/field-schemas.inputs.test.ts`
Expected: FAIL, `queryInteger` and `trimmedLowercaseInput` are not exported.

- [ ] **Step 2: Append the two schemas**

Append at the end of `packages/shared/src/contracts/common/field-schemas.ts`:

```ts

// A string Transform that trimmed and lower-cased the value before the DTO validators ran.
export const trimmedLowercaseInput = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (typeof value === 'string' ? value.trim().toLowerCase() : value), schema)

// A query value read by Type(() => Number) with IsInt, Min and Max: Number() of a scalar, an array kept as it is.
export const queryInteger = (min: number, max: number) =>
  z.preprocess(
    (value) =>
      Array.isArray(value) || value === null || value === undefined ? value : Number(value),
    z.number().int().min(min).max(max),
  )
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/common/field-schemas.inputs.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 3: Write the failing contract test**

Replace the whole of `packages/shared/src/contracts/imports/import-requests.test.ts` with (the F3b `validateImportRequest` cases are kept as they were; the QAD-T54 cases move here from `imports.dto.value-map.test.ts`, which Task 2 deletes):

```ts
import { describe, expect, it } from 'vitest'

import {
  type ValidateImportRequest,
  automaticImportMappingRequest,
  importMappingItemRequest,
  importRowsQuery,
  processImportRequest,
  saveImportMappingRequest,
  uploadImportRequest,
  validateImportRequest,
} from './import-requests'

const uuid = '10000000-0000-4000-8000-000000000001'
const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success
const item = (valueMap: unknown, dataType?: string) => ({
  sourceFieldName: 'column_0001',
  targetFieldCode: 'sex',
  ignored: false,
  dataType,
  valueMap,
})

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
    JSON.parse('{"expectedMappingRevision":1,"__proto__":{"x":1}}'),
    { expectedMappingRevision: 1, constructor: { x: 1 } },
  ])('rejects %j', (body) => {
    expect(validateImportRequest.safeParse(body).success).toBe(false)
  })
})

// QAD-T54
describe('mapping value map contract', () => {
  it('accepts a bounded map and a known data type', () => {
    expect(accepts(importMappingItemRequest, item([{ from: 'M', to: 'Male' }], 'TEXT'))).toBe(true)
  })

  it('rejects an oversized map, an unknown type, and formula-like or control text', () => {
    const many = Array.from({ length: 51 }, (_, index) => ({ from: `k${index}`, to: 'v' }))
    expect(accepts(importMappingItemRequest, item(many))).toBe(false)
    expect(accepts(importMappingItemRequest, item([{ from: 'M', to: 'Male' }], 'JSON'))).toBe(false)
    expect(accepts(importMappingItemRequest, item([{ from: 'M', to: '=HYPERLINK("x")' }]))).toBe(
      false,
    )
    expect(accepts(importMappingItemRequest, item([{ from: '@SUM(1)', to: 'v' }]))).toBe(false)
    expect(accepts(importMappingItemRequest, item([{ from: 'M', to: '-cmd' }]))).toBe(false)
    const bell = String.fromCharCode(7)
    expect(accepts(importMappingItemRequest, item([{ from: 'M', to: `a${bell}b` }]))).toBe(false)
    expect(accepts(importMappingItemRequest, item([{ from: 'M', to: '-5' }]))).toBe(true)
  })
})

describe('import request contracts', () => {
  it('trims names and lower-cases the target code as the DTO transforms did', () => {
    expect(
      saveImportMappingRequest.parse({
        expectedMappingRevision: 0,
        mappings: [{ ...item([{ from: ' M ', to: ' Male ' }]), sourceFieldName: ' a ' }],
      }),
    ).toEqual({
      expectedMappingRevision: 0,
      mappings: [
        {
          sourceFieldName: 'a',
          targetFieldCode: 'sex',
          ignored: false,
          valueMap: [{ from: 'M', to: 'Male' }],
        },
      ],
    })
    expect(
      importMappingItemRequest.parse({ ...item(undefined), targetFieldCode: ' SEX ' }),
    ).toEqual({ sourceFieldName: 'column_0001', targetFieldCode: 'sex', ignored: false })
  })

  it('keeps null on the optional mapping fields the DTO let through', () => {
    const nulls = { targetFieldCode: null, dataType: null, valueMap: null }
    expect(importMappingItemRequest.parse({ ...item(undefined), ...nulls })).toEqual({
      sourceFieldName: 'column_0001',
      ignored: false,
      ...nulls,
    })
  })

  it('reads query bounds with Number() and applies the defaults', () => {
    expect(importRowsQuery.parse({})).toEqual({ offset: 0, take: 50 })
    expect(importRowsQuery.parse({ offset: ' 3 ', take: '0x10' })).toEqual({ offset: 3, take: 16 })
    expect(accepts(importRowsQuery, { offset: ['5'] })).toBe(false)
    expect(accepts(importRowsQuery, { take: '' })).toBe(false)
  })

  it.each([
    ['upload', uploadImportRequest, { formId: uuid, clientImportId: uuid }, true],
    ['upload', uploadImportRequest, { formId: uuid, clientImportId: uuid, extra: 'x' }, false],
    ['automatic', automaticImportMappingRequest, { expectedMappingRevision: 1 }, true],
    ['automatic', automaticImportMappingRequest, { expectedMappingRevision: 2 }, false],
    ['process', processImportRequest, { expectedValidationRevision: 1 }, true],
    ['process', processImportRequest, { expectedValidationRevision: 0 }, false],
  ] as const)('%s body %j is accepted: %s', (_route, schema, body, expected) => {
    expect(accepts(schema, body)).toBe(expected)
  })
})
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/imports/import-requests.test.ts`
Expected: FAIL, the new contracts are not exported.

- [ ] **Step 4: Write the contracts**

Replace the whole of `packages/shared/src/contracts/imports/import-requests.ts` with:

```ts
import { z } from 'zod'

import { supportedFormFieldTypes } from '../../validation/form-data'
import {
  lengthString,
  queryInteger,
  trimmedInput,
  trimmedLowercaseInput,
  uuidString,
} from '../common/field-schemas'

// Bounds shared with @pathways/imports, whose limits test pins them to its engineering limits.
export const importRequestLimits = {
  maxSourceColumns: 500,
  maxValueMapEntries: 50,
  maxValueMapTextLength: 100,
} as const

// No control characters, and no leading formula trigger (= + @ or a minus that is not a number).
const safeMapText = /^(?![=+@\t\r]|-(?!\d))\P{Cc}*$/u

// One side of a value map entry, trimmed first.
const valueMapText = (min: number) =>
  trimmedInput(
    lengthString(min, importRequestLimits.maxValueMapTextLength).refine(
      (value) => safeMapText.test(value),
      'Control characters and formula prefixes are not allowed.',
    ),
  )

// Multipart fields of POST imports/projects/:projectId/batches/upload.
export const uploadImportRequest = z
  .object({ formId: uuidString, clientImportId: uuidString })
  .strict()
export type UploadImportRequest = z.infer<typeof uploadImportRequest>

// One source column decision inside a saved import mapping.
export const importMappingItemRequest = z
  .object({
    sourceFieldName: trimmedInput(lengthString(1, 100)),
    targetFieldCode: trimmedLowercaseInput(
      z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, 'must be a lowercase field code'),
    ).nullish(),
    ignored: z.boolean(),
    dataType: z.enum(supportedFormFieldTypes).nullish(),
    valueMap: z
      .array(z.object({ from: valueMapText(1), to: valueMapText(0) }).strict())
      .min(1)
      .max(importRequestLimits.maxValueMapEntries)
      .nullish(),
  })
  .strict()
export type ImportMappingItemRequest = z.infer<typeof importMappingItemRequest>

// Body of PATCH imports/projects/:projectId/batches/:batchId/mapping.
export const saveImportMappingRequest = z
  .object({
    expectedMappingRevision: z.number().int().min(0),
    mappings: z.array(importMappingItemRequest).min(1).max(importRequestLimits.maxSourceColumns),
  })
  .strict()
export type SaveImportMappingRequest = z.infer<typeof saveImportMappingRequest>

// Body of POST imports/projects/:projectId/batches/:batchId/automatic-mapping.
export const automaticImportMappingRequest = z
  .object({ expectedMappingRevision: z.union([z.literal(0), z.literal(1)]) })
  .strict()
export type AutomaticImportMappingRequest = z.infer<typeof automaticImportMappingRequest>

// Body of POST imports/projects/:projectId/batches/:batchId/validate.
export const validateImportRequest = z
  .object({ expectedMappingRevision: z.number().int().min(1) })
  .strict()
export type ValidateImportRequest = z.infer<typeof validateImportRequest>

// Body of POST imports/projects/:projectId/batches/:batchId/process.
export const processImportRequest = z
  .object({ expectedValidationRevision: z.number().int().min(1) })
  .strict()
export type ProcessImportRequest = z.infer<typeof processImportRequest>

// Query of GET imports/projects/:projectId/batches/:batchId/rows.
export const importRowsQuery = z
  .object({
    offset: queryInteger(0, 50_000).default(0),
    take: queryInteger(1, 100).default(50),
  })
  .strict()
export type ImportRowsQuery = z.infer<typeof importRowsQuery>
```

The barrel already exports `./contracts/imports/import-requests` (F3b) and `./contracts/common/field-schemas` (S1).

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts`
Expected: PASS; `import-requests.test.ts` runs 19 tests.

- [ ] **Step 5: Pin the shared bounds to the import limits**

Create `packages/imports/src/limits.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { importRequestLimits } from '@pathways/shared'
import { IMPORT_ENGINEERING_LIMITS } from './limits'
import { IMPORT_VALUE_MAP_LIMITS } from './value-map'

describe('import request limits', () => {
  it('match the engineering and value map limits', () => {
    expect(importRequestLimits).toEqual({
      maxSourceColumns: IMPORT_ENGINEERING_LIMITS.maxSourceColumns,
      maxValueMapEntries: IMPORT_VALUE_MAP_LIMITS.maxEntries,
      maxValueMapTextLength: IMPORT_VALUE_MAP_LIMITS.maxTextLength,
    })
  })
})
```

Run: `pnpm --filter @pathways/imports exec vitest run src/limits.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 6: Write the parity test**

Create `apps/api/src/modules/imports/import-request-parity.test.ts`. Vitest emits no decorator metadata, so the test passes each DTO as the metatype explicitly, exactly as Nest does with the compiled metadata (F3b ruling 3, S1 ruling 12):

```ts
import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import {
  automaticImportMappingRequest,
  importRowsQuery,
  processImportRequest,
  saveImportMappingRequest,
  supportedFormFieldTypes,
  uploadImportRequest,
} from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import {
  AutomaticImportMappingDto,
  IMPORT_DATA_TYPES,
  ImportRowsQueryDto,
  ProcessImportDto,
  SaveImportMappingDto,
  UploadImportDto,
} from './imports.dto'

// Same options as main.ts.
const globalPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: false,
})

type Kind = 'body' | 'query'
type Outcome = { accepted: boolean; value: unknown }
type Pipe = { transform(value: unknown): unknown }

// Records a pipe rejection; an error that is not a 400 is recorded by its class name.
function rejected(error: unknown): Outcome {
  if (!(error instanceof BadRequestException)) {
    return { accepted: false, value: (error as Error).name }
  }
  return { accepted: false, value: error.getResponse() }
}

// The old route: the global pipe with the DTO as metatype.
async function viaDto(input: unknown, metatype: new () => object, type: Kind): Promise<Outcome> {
  try {
    const dto = await globalPipe.transform(input, { type, metatype })
    return { accepted: true, value: JSON.parse(JSON.stringify(dto)) }
  } catch (error) {
    return rejected(error)
  }
}

// The new route: the global pipe with an Object metatype, then the zod pipe.
async function viaZod(input: unknown, pipe: Pipe, type: Kind): Promise<Outcome> {
  try {
    const value = await globalPipe.transform(input, { type, metatype: Object })
    return { accepted: true, value: JSON.parse(JSON.stringify(pipe.transform(value))) }
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
const bell = String.fromCharCode(7)
// Multer builds multipart fields on a null-prototype object.
const multipart = (fields: Record<string, unknown>) =>
  Object.assign(Object.create(null) as Record<string, unknown>, fields)
const item = (extra: Record<string, unknown> = {}) => ({
  sourceFieldName: 'column_0001',
  targetFieldCode: 'sex',
  ignored: false,
  ...extra,
})
const mapping = (mappings: unknown, revision: unknown = 0) =>
  JSON.stringify({ expectedMappingRevision: revision, mappings })
const entries = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ from: `k${index}`, to: 'v' }))
const routes: Record<string, [new () => object, Pipe, Kind]> = {
  upload: [UploadImportDto, new ZodPipe(uploadImportRequest), 'body'],
  mapping: [SaveImportMappingDto, new ZodPipe(saveImportMappingRequest), 'body'],
  automatic: [AutomaticImportMappingDto, new ZodPipe(automaticImportMappingRequest), 'body'],
  process: [ProcessImportDto, new ZodPipe(processImportRequest), 'body'],
  rows: [ImportRowsQueryDto, new ZodPipe(importRowsQuery), 'query'],
}
type Case = [string, unknown]

// A JSON string is parsed fresh for each pipe; multipart fields and query objects pass as built.
const input = (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : value)
async function both(route: string, value: unknown) {
  const [dto, pipe, type] = routes[route]
  return {
    dto: await viaDto(input(value), dto, type),
    zod: await viaZod(input(value), pipe, type),
  }
}

const acceptedCases: Case[] = [
  ['upload', multipart({ formId: uuid, clientImportId: uuid.toUpperCase() })],
  ['mapping', mapping([item()])],
  ['mapping', mapping([item({ sourceFieldName: '  column_0001  ', targetFieldCode: ' SEX ' })])],
  [
    'mapping',
    mapping([item({ targetFieldCode: null, ignored: true, dataType: null, valueMap: null })]),
  ],
  ['mapping', mapping([{ sourceFieldName: 'column_0001', ignored: true }])],
  ['mapping', mapping([item({ dataType: 'TEXT', valueMap: [{ from: ' M ', to: ' Male ' }] })])],
  [
    'mapping',
    mapping([
      item({
        valueMap: [
          { from: 'M', to: '-5' },
          { from: 'F', to: '' },
        ],
      }),
    ]),
  ],
  ['mapping', mapping([item({ valueMap: entries(50) })])],
  ['mapping', mapping([item({ sourceFieldName: 'x'.repeat(100) })])],
  ['mapping', mapping([item({ targetFieldCode: `a${'b'.repeat(63)}` })])],
  ['mapping', mapping(Array.from({ length: 500 }, () => item()))],
  ['mapping', mapping([item()], 7)],
  ['automatic', '{"expectedMappingRevision":0}'],
  ['automatic', '{"expectedMappingRevision":1}'],
  ['automatic', '{"expectedMappingRevision":-0}'],
  ['automatic', '{"expectedMappingRevision":1.0}'],
  ['process', '{"expectedValidationRevision":1}'],
  ['process', '{"expectedValidationRevision":9007199254740993}'],
  ['rows', {}],
  ['rows', { offset: '0', take: '1' }],
  ['rows', { offset: '50000', take: '100' }],
  ['rows', { offset: '', take: '7' }],
  ['rows', { offset: ' 3 ', take: '0x10' }],
  ['rows', { offset: '1e3' }],
]

const rejectedCases: Case[] = [
  ['upload', multipart({ formId: uuid })],
  ['upload', multipart({ formId: 'not-a-uuid', clientImportId: uuid })],
  ['upload', multipart({ formId: [uuid, uuid], clientImportId: uuid })],
  ['upload', multipart({ formId: uuid, clientImportId: uuid, extra: 'x' })],
  ['upload', multipart({ formId: '10000000-0000-0000-8000-000000000001', clientImportId: uuid })],
  ['mapping', mapping([])],
  ['mapping', mapping(Array.from({ length: 501 }, () => item()))],
  ['mapping', mapping([item()], -1)],
  ['mapping', mapping([item()], 1.5)],
  ['mapping', mapping([item()], '1')],
  ['mapping', mapping({ 0: item() })],
  ['mapping', mapping([null])],
  ['mapping', mapping(['column_0001'])],
  ['mapping', mapping([item({ extra: 1 })])],
  ['mapping', mapping([item({ sourceFieldName: '   ' })])],
  ['mapping', mapping([item({ sourceFieldName: 'x'.repeat(101) })])],
  ['mapping', mapping([item({ sourceFieldName: 7 })])],
  ['mapping', mapping([item({ targetFieldCode: '' })])],
  ['mapping', mapping([item({ targetFieldCode: '1sex' })])],
  ['mapping', mapping([item({ targetFieldCode: `a${'b'.repeat(64)}` })])],
  ['mapping', mapping([item({ targetFieldCode: 5 })])],
  ['mapping', mapping([item({ ignored: 'false' })])],
  ['mapping', mapping([{ sourceFieldName: 'column_0001', targetFieldCode: 'sex' }])],
  ['mapping', mapping([item({ dataType: 'JSON' })])],
  ['mapping', mapping([item({ valueMap: [] })])],
  ['mapping', mapping([item({ valueMap: entries(51) })])],
  ['mapping', mapping([item({ valueMap: { from: 'M', to: 'Male' } })])],
  ['mapping', mapping([item({ valueMap: [null] })])],
  ['mapping', mapping([item({ valueMap: [{ from: 'M', to: 'Male', note: 'x' }] })])],
  ['mapping', mapping([item({ valueMap: [{ from: '  ', to: 'v' }] })])],
  ['mapping', mapping([item({ valueMap: [{ from: 'M', to: '=HYPERLINK("x")' }] })])],
  ['mapping', mapping([item({ valueMap: [{ from: '@SUM(1)', to: 'v' }] })])],
  ['mapping', mapping([item({ valueMap: [{ from: '+1', to: 'v' }] })])],
  ['mapping', mapping([item({ valueMap: [{ from: 'M', to: '-cmd' }] })])],
  ['mapping', mapping([item({ valueMap: [{ from: 'M', to: `a${bell}b` }] })])],
  ['mapping', mapping([item({ valueMap: [{ from: 'M', to: 'x'.repeat(101) }] })])],
  ['mapping', mapping([item({ valueMap: [{ from: 'M' }] })])],
  ['mapping', '{"mappings":[]}'],
  ['mapping', '[]'],
  ['automatic', '{"expectedMappingRevision":2}'],
  ['automatic', '{"expectedMappingRevision":"0"}'],
  ['automatic', '{"expectedMappingRevision":null}'],
  ['automatic', '{}'],
  ['automatic', '{"expectedMappingRevision":0,"target":"private"}'],
  ['process', '{"expectedValidationRevision":0}'],
  ['process', '{"expectedValidationRevision":"1"}'],
  ['process', '{"expectedValidationRevision":1,"extra":true}'],
  ['rows', { offset: '-1' }],
  ['rows', { offset: '50001' }],
  ['rows', { take: '0' }],
  ['rows', { take: '' }],
  ['rows', { take: '101' }],
  ['rows', { offset: '1.5' }],
  ['rows', { offset: 'abc' }],
  ['rows', { offset: ['5'] }],
  ['rows', { offset: { a: '5' } }],
  ['rows', { foo: '1' }],
]

describe('import DTOs and request contracts parity', () => {
  it('keeps the import data types equal to the shared form field types', () => {
    expect([...IMPORT_DATA_TYPES]).toEqual([...supportedFormFieldTypes])
  })

  it.each(acceptedCases)('%s accepts %j with the same value', async (route, value) => {
    const { dto, zod } = await both(route, value)
    expect(dto.accepted).toBe(true)
    expect(zod).toEqual(dto)
  })

  it.each(rejectedCases)('%s answers the 400 shape for %j', async (route, value) => {
    const { dto, zod } = await both(route, value)
    expect(dto).toEqual(badRequestShape)
    expect(zod).toEqual(badRequestShape)
  })

  // Ruling 3: the DTO pipe let an array through where an entry object belongs; the service then answered 400 or 409.
  it.each([
    ['mapping', mapping([[]])],
    ['mapping', mapping([item({ valueMap: [[]] })])],
  ] as Case[])('only the contract rejects the array entry in %s %j', async (route, value) => {
    const { dto, zod } = await both(route, value)
    expect(dto.accepted).toBe(true)
    expect(zod).toEqual(badRequestShape)
  })

  // F3b ruling 3: the DTO pipe dropped own prototype keys; strict contracts reject them.
  it.each([
    [
      'mapping',
      '{"expectedMappingRevision":0,"mappings":[{"sourceFieldName":"a","ignored":true}],"__proto__":{"a":1}}',
    ],
    [
      'mapping',
      '{"expectedMappingRevision":0,"mappings":[{"sourceFieldName":"a","ignored":true,"constructor":{"a":1}}]}',
    ],
    ['automatic', '{"expectedMappingRevision":0,"__proto__":{"a":1}}'],
    ['process', '{"expectedValidationRevision":1,"constructor":{"a":1}}'],
  ] as Case[])('only the contract rejects the prototype key in %s %j', async (route, value) => {
    const { dto, zod } = await both(route, value)
    expect(dto.accepted).toBe(true)
    expect(zod).toEqual(badRequestShape)
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/imports/import-request-parity.test.ts`
Expected: PASS, 88 tests (1 type list, 24 accepted, 57 rejected, 2 array entries, 4 prototype keys). Any failure means a contract differs from its DTO: stop and report the row; do not edit the table to match.

- [ ] **Step 7: Check and commit**

```bash
git add -N packages/shared packages/imports apps/api
pnpm exec biome check --write packages/shared/src/contracts packages/imports/src/limits.test.ts apps/api/src/modules/imports/import-request-parity.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/shared test 2>&1 | grep -E "Tests +[0-9]+"
pnpm --filter @pathways/imports test 2>&1 | grep -E "Tests +[0-9]+"
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add packages/shared/src/contracts packages/imports/src/limits.test.ts apps/api/src/modules/imports/import-request-parity.test.ts
git commit -m "feat(shared): add the import request contracts with their DTO parity test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: shared = `B_shared + 23` (input schemas 12, import requests 11), imports = `B_imports + 1`, api = `B_api + 88`.

---

### Task 2: Switch the import routes and delete the imports DTO

**Files:**
- Test: `apps/api/src/modules/imports/imports.controller.validation.test.ts` (full content below)
- Modify: `apps/api/src/modules/imports/imports.controller.ts` (full content below)
- Modify: `apps/api/src/modules/imports/imports.service.ts` (import block and parameter types)
- Modify: `apps/api/src/modules/imports/automatic-mapping.service.test.ts` (the DTO runner test runs the contract)
- Modify: `apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts` (imports case removed)
- Delete: `apps/api/src/modules/imports/imports.dto.ts`, `apps/api/src/modules/imports/imports.dto.value-map.test.ts`, `apps/api/src/modules/imports/import-request-parity.test.ts`

**Interfaces:**
- Consumes: Task 1 contracts; S1 `requestIdentity`; `ZodPipe`.
- Produces: `ImportsService` methods take `UploadImportRequest`, `ImportRowsQuery`, `AutomaticImportMappingRequest`, `SaveImportMappingRequest`, `ValidateImportRequest` and `ProcessImportRequest`; signatures otherwise unchanged.

- [ ] **Step 1: Write the HTTP test**

Replace the whole of `apps/api/src/modules/imports/imports.controller.validation.test.ts` with (the five F3b validate tests are unchanged; the service stub now covers the other routes):

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
const formId = '40000000-0000-4000-8000-000000000004'
const actor = { id: '30000000-0000-4000-8000-000000000003', aal: 'aal2' }
const imports = {
  validate: vi.fn(),
  saveMapping: vi.fn(),
  process: vi.fn(),
  automaticMapping: vi.fn(),
  listRows: vi.fn(),
  upload: vi.fn(),
}
let app: INestApplication
let base: string
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
  base = `http://127.0.0.1:${port}/imports/projects/${projectId}/batches`
  url = `${base}/${batchId}/validate`
})

beforeEach(() => {
  for (const method of Object.values(imports)) method.mockReset().mockResolvedValue({ id: batchId })
})
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

// Sends a raw JSON body to one batch route and returns the status with the parsed response body.
async function send(method: string, route: string, body: string) {
  const response = await fetch(`${base}/${batchId}/${route}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  })
  return { status: response.status, body: await response.json() }
}

const badRequest = {
  statusCode: 400,
  error: 'Bad Request',
  message: expect.arrayContaining([expect.any(String)]),
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

describe('import mapping, automatic mapping and process bodies', () => {
  it('forwards a mapping with trimmed names, a lower-cased code and a trimmed value map', async () => {
    const result = await send(
      'PATCH',
      'mapping',
      JSON.stringify({
        expectedMappingRevision: 0,
        mappings: [
          {
            sourceFieldName: ' column_0001 ',
            targetFieldCode: ' SEX ',
            ignored: false,
            valueMap: [{ from: ' M ', to: ' Male ' }],
          },
        ],
      }),
    )
    expect(result.status).toBe(200)
    expect(imports.saveMapping).toHaveBeenCalledWith(actor, projectId, batchId, {
      expectedMappingRevision: 0,
      mappings: [
        {
          sourceFieldName: 'column_0001',
          targetFieldCode: 'sex',
          ignored: false,
          valueMap: [{ from: 'M', to: 'Male' }],
        },
      ],
    })
  })

  it.each([
    ['a formula-like value map entry', '[{"from":"M","to":"=HYPERLINK(1)"}]'],
    ['an empty value map', '[]'],
  ])('answers 400 for %s without calling the service', async (_label, valueMap) => {
    const body = `{"expectedMappingRevision":0,"mappings":[{"sourceFieldName":"a","targetFieldCode":"sex","ignored":false,"valueMap":${valueMap}}]}`
    expect(await send('PATCH', 'mapping', body)).toEqual({ status: 400, body: badRequest })
    expect(imports.saveMapping).not.toHaveBeenCalled()
  })

  it('answers 400 for a third automatic mapping revision or an extra key', async () => {
    const third = await send('POST', 'automatic-mapping', '{"expectedMappingRevision":2}')
    const extra = await send(
      'POST',
      'automatic-mapping',
      '{"expectedMappingRevision":0,"target":"private"}',
    )
    expect([third.status, extra.status]).toEqual([400, 400])
    expect(imports.automaticMapping).not.toHaveBeenCalled()
  })

  it('forwards a process revision and refuses a numeric string', async () => {
    expect((await send('POST', 'process', '{"expectedValidationRevision":3}')).status).toBe(201)
    expect(imports.process).toHaveBeenCalledWith(actor, projectId, batchId, {
      expectedValidationRevision: 3,
    })
    expect(await send('POST', 'process', '{"expectedValidationRevision":"3"}')).toEqual({
      status: 400,
      body: badRequest,
    })
    expect(imports.process).toHaveBeenCalledTimes(1)
  })
})

describe('import rows query and upload fields', () => {
  it('reads the row page bounds as numbers and applies the defaults', async () => {
    await fetch(`${base}/${batchId}/rows?offset=5&take=10`)
    await fetch(`${base}/${batchId}/rows`)
    expect(imports.listRows.mock.calls.map((call) => call[3])).toEqual([
      { offset: 5, take: 10 },
      { offset: 0, take: 50 },
    ])
  })

  it.each(['take=0', 'offset=-1', 'offset=1&offset=2', 'page=1'])(
    'answers 400 for the row query %s without calling the service',
    async (query) => {
      const response = await fetch(`${base}/${batchId}/rows?${query}`)
      expect(response.status).toBe(400)
      expect(imports.listRows).not.toHaveBeenCalled()
    },
  )

  it('forwards the multipart fields and the file, and refuses an invalid form id', async () => {
    const form = (id: string) => {
      const body = new FormData()
      body.set('formId', id)
      body.set('clientImportId', batchId)
      body.set('file', new Blob(['name\nAna\n'], { type: 'text/csv' }), 'register.csv')
      return body
    }
    const accepted = await fetch(`${base}/upload`, { method: 'POST', body: form(formId) })
    const refused = await fetch(`${base}/upload`, { method: 'POST', body: form('not-a-uuid') })
    expect([accepted.status, refused.status]).toEqual([201, 400])
    expect(imports.upload).toHaveBeenCalledTimes(1)
    expect(imports.upload).toHaveBeenCalledWith(
      actor,
      projectId,
      { formId, clientImportId: batchId },
      expect.objectContaining({ originalname: 'register.csv', mimetype: 'text/csv' }),
    )
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/imports/imports.controller.validation.test.ts`
Expected: FAIL, 11 of 16: the DTO routes see no metatype under Vitest and forward every body raw (S1 ruling 12); the five validate tests pass.

- [ ] **Step 2: Switch the controller**

Replace the whole of `apps/api/src/modules/imports/imports.controller.ts` with:

```ts
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'

import { IMPORT_ENGINEERING_LIMITS } from '@pathways/imports'
import {
  type AutomaticImportMappingRequest,
  type ImportRowsQuery,
  type ProcessImportRequest,
  type SaveImportMappingRequest,
  type UploadImportRequest,
  type ValidateImportRequest,
  automaticImportMappingRequest,
  importRowsQuery,
  processImportRequest,
  saveImportMappingRequest,
  uploadImportRequest,
  validateImportRequest,
} from '@pathways/shared'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { ImportsService, type UploadedImportFile } from './imports.service'

@Controller('imports/projects/:projectId/batches')
export class ImportsController {
  constructor(@Inject(ImportsService) private readonly imports: ImportsService) {}

  @Get()
  @RequirePermission('imports.read')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.imports.listBatches(requestIdentity(request), projectId)
  }

  @Post('upload')
  @RequirePermission('imports.upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: IMPORT_ENGINEERING_LIMITS.maxBytes,
        files: 1,
        fields: 2,
        fieldNameSize: 64,
        fieldSize: 256,
        parts: 4,
      },
    }),
  )
  upload(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body(new ZodPipe(uploadImportRequest)) body: UploadImportRequest,
    @UploadedFile() file?: UploadedImportFile,
  ) {
    return this.imports.upload(requestIdentity(request), projectId, body, file)
  }

  @Get(':batchId')
  @RequirePermission('imports.read')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.imports.getBatch(requestIdentity(request), projectId, batchId)
  }

  @Post(':batchId/resume')
  @RequirePermission('imports.upload')
  resume(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.imports.resumeUpload(requestIdentity(request), projectId, batchId)
  }

  @Get(':batchId/rows')
  @RequirePermission('imports.read')
  rows(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('batchId') batchId: string,
    @Query(new ZodPipe(importRowsQuery)) query: ImportRowsQuery,
  ) {
    return this.imports.listRows(requestIdentity(request), projectId, batchId, query)
  }

  @Post(':batchId/automatic-mapping')
  @RequirePermission('imports.upload')
  automaticMapping(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('batchId') batchId: string,
    @Body(new ZodPipe(automaticImportMappingRequest)) body: AutomaticImportMappingRequest,
  ) {
    return this.imports.automaticMapping(requestIdentity(request), projectId, batchId, body)
  }

  @Patch(':batchId/mapping')
  @RequirePermission('imports.review')
  map(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('batchId') batchId: string,
    @Body(new ZodPipe(saveImportMappingRequest)) body: SaveImportMappingRequest,
  ) {
    return this.imports.saveMapping(requestIdentity(request), projectId, batchId, body)
  }

  @Post(':batchId/validate')
  @RequirePermission('imports.validate')
  validate(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('batchId') batchId: string,
    @Body(new ZodPipe(validateImportRequest)) body: ValidateImportRequest,
  ) {
    return this.imports.validate(requestIdentity(request), projectId, batchId, body)
  }

  @Post(':batchId/process')
  @RequirePermission('imports.process')
  process(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('batchId') batchId: string,
    @Body(new ZodPipe(processImportRequest)) body: ProcessImportRequest,
  ) {
    return this.imports.process(requestIdentity(request), projectId, batchId, body)
  }
}
```

- [ ] **Step 3: Create the edit scripts and point the service and tests at the contracts**

Create `.tmp/s5a/rename-words.mjs` (Tasks 2 and 4 use it):

```js
// Renames whole identifiers in files: node rename-words.mjs <from=to,...> <file...>
import { readFileSync, writeFileSync } from 'node:fs'

const [pairs, ...files] = process.argv.slice(2)
const renames = pairs.split(',').map((pair) => pair.split('='))
for (const file of files) {
  let text = readFileSync(file, 'utf8')
  let count = 0
  for (const [from, to] of renames) {
    text = text.replace(new RegExp(`\\b${from}\\b`, 'g'), () => {
      count++
      return to
    })
  }
  writeFileSync(file, text)
  console.log(`${file}: ${count}`)
}
```

Create `.tmp/s5a/import-route-edits.mjs`:

```js
// Points the imports service and tests at the shared request contracts and drops the imports DTO metadata case.
import { readFileSync, writeFileSync } from 'node:fs'

const edit = (file, from, to) => {
  const text = readFileSync(file, 'utf8')
  if (text.split(from).length !== 2) throw new Error(`${file}: expected one copy of ${from}`)
  writeFileSync(file, text.replace(from, to))
  console.log(`edited ${file}`)
}

const service = 'apps/api/src/modules/imports/imports.service.ts'
edit(
  service,
  `import type {
  AutomaticImportMappingDto,
  ImportRowsQueryDto,
  ProcessImportDto,
  SaveImportMappingDto,
  UploadImportDto,
} from './imports.dto'
`,
  '',
)
edit(
  service,
  `import type { FormFieldValidationContract, ValidateImportRequest } from '@pathways/shared'`,
  `import type {
  AutomaticImportMappingRequest,
  FormFieldValidationContract,
  ImportRowsQuery,
  ProcessImportRequest,
  SaveImportMappingRequest,
  UploadImportRequest,
  ValidateImportRequest,
} from '@pathways/shared'`,
)

const automatic = 'apps/api/src/modules/imports/automatic-mapping.service.test.ts'
edit(
  automatic,
  `import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
`,
  '',
)
edit(
  automatic,
  `import { AutomaticImportMappingDto } from './imports.dto'
`,
  `import { automaticImportMappingRequest } from '@pathways/shared'
`,
)
edit(
  automatic,
  `  it('DTO validation rejects extra fields under the actual whitelist settings', async () => {
    const errors = await validate(
      plainToInstance(AutomaticImportMappingDto, { expectedMappingRevision: 0, target: 'private' }),
      { whitelist: true, forbidNonWhitelisted: true },
    )
    expect(errors.some((error) => error.property === 'target')).toBe(true)
  })`,
  `  it('the request contract rejects extra fields', () => {
    const result = automaticImportMappingRequest.safeParse({
      expectedMappingRevision: 0,
      target: 'private',
    })
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ code: 'unrecognized_keys', keys: ['target'] }),
    ])
  })`,
)

edit(
  'apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts',
  `  {
    file: 'src/modules/imports/imports.controller.ts',
    dtoNames: ['ImportRowsQueryDto', 'ProcessImportDto', 'SaveImportMappingDto', 'UploadImportDto'],
  },
`,
  '',
)
```

```bash
node .tmp/s5a/import-route-edits.mjs
node .tmp/s5a/rename-words.mjs AutomaticImportMappingDto=AutomaticImportMappingRequest,ImportRowsQueryDto=ImportRowsQuery,ProcessImportDto=ProcessImportRequest,SaveImportMappingDto=SaveImportMappingRequest,UploadImportDto=UploadImportRequest apps/api/src/modules/imports/imports.service.ts
git rm -q apps/api/src/modules/imports/imports.dto.ts apps/api/src/modules/imports/imports.dto.value-map.test.ts apps/api/src/modules/imports/import-request-parity.test.ts
git grep -nE "imports\.dto|ImportMappingItemDto|IMPORT_DATA_TYPES|Dto\b" -- apps/api/src/modules/imports
```

Expected: six `edited` lines (two for the service, three for the automatic mapping test, one for the runtime metadata test), then `apps/api/src/modules/imports/imports.service.ts: 8`; the grep prints nothing.

- [ ] **Step 4: Run the tests and commit**

```bash
pnpm --filter @pathways/api exec vitest run src/modules/imports src/common/validation
pnpm exec biome check --write apps/api/src/modules/imports apps/api/src/common/validation
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api/src/modules/imports apps/api/src/common/validation
git commit -m "refactor(api): validate the import routes with the shared zod contracts

The imports DTO, its value map test and the parity test are removed; QAD-T54 runs against the contract.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the HTTP test passes 16 of 16; api = `B_api + 8` (Task 1 count minus 88 parity, minus 2 value map, minus 1 runtime metadata case, plus 11 HTTP).

---

### Task 3: Metadata request contracts and parity evidence

**Files:**
- Create: `packages/shared/src/contracts/metadata/form-requests.ts`
- Test: `packages/shared/src/contracts/metadata/form-requests.test.ts`
- Modify: `packages/shared/src/index.ts` (barrel line)
- Create (deleted again in Task 4): `apps/api/src/modules/metadata/form-request-parity.test.ts`

**Interfaces:**
- Consumes: S1 `lengthString`, `uuidString`, `isoDateString`, `trimmedInput`; Task 1 `trimmedLowercaseInput`, `queryInteger`; shared `supportedFormFieldTypes`.
- Produces, from `@pathways/shared`: `digitalFormTypes` (the seven stored form types) with `type DigitalFormType`; `formResponseValues` (a record of response values, ruling 5); `formFieldRequest` with `type FormFieldRequest`; `createFormRequest` with `type CreateFormRequest` (`code`, `name`, `description?`, `formType`, `activityId?`, `journeyStageId?`, `fields: FormFieldRequest[]`); `updateFormRequest` with `type UpdateFormRequest` (create fields plus `expectedUpdatedAt: string`); `generateFormRequest` with `type GenerateFormRequest` (`templateKey?`, `sourceFormId?`, `code`, `name`); `formVersionRequest` with `type FormVersionRequest` (`{ expectedUpdatedAt: string }`); `validateFormValuesRequest` with `type ValidateFormValuesRequest` (`{ values: Record<string, unknown> }`); `saveSubmissionRequest` with `type SaveSubmissionRequest` (`beneficiaryId?: string`, `clientSubmissionId: string`, `values`); `updateSubmissionRequest` with `type UpdateSubmissionRequest` (`expectedUpdatedAt`, `values`); `submitSubmissionRequest` with `type SubmitSubmissionRequest` (`{ expectedUpdatedAt: string }`); `listSubmissionsQuery` with `type ListSubmissionsQuery` (`{ offset: number; limit: number }`). Optional fields are `T | null | undefined` except `beneficiaryId` (ruling 3).

- [ ] **Step 1: Write the failing contract test**

Create `packages/shared/src/contracts/metadata/form-requests.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  createFormRequest,
  digitalFormTypes,
  formResponseValues,
  generateFormRequest,
  listSubmissionsQuery,
  saveSubmissionRequest,
  updateFormRequest,
} from './form-requests'

const field = {
  code: 'first_name',
  label: 'First name',
  dataType: 'TEXT',
  required: true,
  metadataKey: false,
  sadddField: false,
}
const form = { code: 'intake', name: 'Intake form', formType: 'TRAINING_SURVEY', fields: [field] }
const uuid = '10000000-0000-4000-8000-000000000001'

describe('form request contracts', () => {
  it('lists the seven form types in their stored order', () => {
    expect(digitalFormTypes).toEqual([
      'BENEFICIARY_REGISTRATION',
      'TRAINING_SURVEY',
      'PRE_TEST',
      'POST_TEST',
      'OUTCOME_MONITORING',
      'ACTIVITY_MONITORING',
      'OTHER',
    ])
  })

  it('trims and lower-cases codes and trims names as the DTO transforms did', () => {
    expect(
      createFormRequest.parse({
        ...form,
        code: ' INTAKE ',
        name: '  Intake form  ',
        fields: [{ ...field, code: ' FIRST_NAME ', label: '  First name  ' }],
      }),
    ).toEqual(form)
  })

  it('keeps null on the optional fields the DTO let through', () => {
    const nulls = { description: null, activityId: null, journeyStageId: null }
    const fieldNulls = {
      allowedValues: null,
      minimumValue: null,
      minimumDate: null,
      maximumLength: null,
    }
    expect(
      createFormRequest.parse({ ...form, ...nulls, fields: [{ ...field, ...fieldNulls }] }),
    ).toEqual({ ...form, ...nulls, fields: [{ ...field, ...fieldNulls }] })
    expect(generateFormRequest.parse({ templateKey: null, code: 'ok_code', name: 'Okay' })).toEqual(
      {
        templateKey: null,
        code: 'ok_code',
        name: 'Okay',
      },
    )
  })

  it('requires the version stamp on update only', () => {
    const stamp = { expectedUpdatedAt: '2026-09-24T00:00:00.000Z' }
    expect(updateFormRequest.safeParse({ ...form, ...stamp }).success).toBe(true)
    expect(updateFormRequest.safeParse(form).success).toBe(false)
    expect(createFormRequest.safeParse({ ...form, ...stamp }).success).toBe(false)
  })

  it('drops method-named value keys and refuses a constructor key at any depth', () => {
    expect(formResponseValues.parse({ first_name: 'Ana', toString: 'x', valueOf: 1 })).toEqual({
      first_name: 'Ana',
    })
    expect(formResponseValues.safeParse({ constructor: 'x' }).success).toBe(false)
    expect(formResponseValues.safeParse({ tags: [{ constructor: 1 }] }).success).toBe(false)
    expect(formResponseValues.safeParse([1]).success).toBe(false)
  })

  it('refuses a null beneficiary and reads page bounds with Number()', () => {
    const save = { clientSubmissionId: uuid, values: {} }
    expect(saveSubmissionRequest.safeParse({ ...save, beneficiaryId: uuid }).success).toBe(true)
    expect(saveSubmissionRequest.safeParse({ ...save, beneficiaryId: null }).success).toBe(false)
    expect(listSubmissionsQuery.parse({})).toEqual({ offset: 0, limit: 10 })
    expect(listSubmissionsQuery.parse({ offset: '2', limit: '0x5' })).toEqual({
      offset: 2,
      limit: 5,
    })
    expect(listSubmissionsQuery.safeParse({ limit: '51' }).success).toBe(false)
  })
})
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/metadata/form-requests.test.ts`
Expected: FAIL, cannot resolve `./form-requests`.

- [ ] **Step 2: Create the contracts and export them**

Create `packages/shared/src/contracts/metadata/form-requests.ts`:

```ts
import { z } from 'zod'

import { supportedFormFieldTypes } from '../../validation/form-data'
import {
  isoDateString,
  lengthString,
  queryInteger,
  trimmedInput,
  trimmedLowercaseInput,
  uuidString,
} from '../common/field-schemas'

// Form types a digital form may declare.
export const digitalFormTypes = [
  'BENEFICIARY_REGISTRATION',
  'TRAINING_SURVEY',
  'PRE_TEST',
  'POST_TEST',
  'OUTCOME_MONITORING',
  'ACTIVITY_MONITORING',
  'OTHER',
] as const
export type DigitalFormType = (typeof digitalFormTypes)[number]

const decimalBound = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,4})?$/
const calendarDay = /^\d{4}-\d{2}-\d{2}$/

// Object.prototype method names that class-transformer skipped when it copied a values object.
const skippedValueKeys = new Set([
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  'toString',
  'valueOf',
])

// True when an object at any depth has an own constructor key, which crashed class-transformer.
const hasConstructorKey = (value: unknown): boolean =>
  Array.isArray(value)
    ? value.some(hasConstructorKey)
    : value !== null &&
      typeof value === 'object' &&
      (Object.hasOwn(value, 'constructor') || Object.values(value).some(hasConstructorKey))

// IsObject() response values: method-named keys are dropped as before, and a constructor key is refused.
export const formResponseValues = z.preprocess(
  (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter(([key]) => !skippedValueKeys.has(key)))
      : value,
  z
    .record(z.unknown())
    .refine((values) => !hasConstructorKey(values), 'must not contain a constructor key'),
)

// One field of a form definition.
export const formFieldRequest = z
  .object({
    code: trimmedLowercaseInput(
      z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, 'must be a lowercase field code'),
    ),
    label: trimmedInput(lengthString(1, 160)),
    dataType: z.enum(supportedFormFieldTypes),
    required: z.boolean(),
    metadataKey: z.boolean(),
    sadddField: z.boolean(),
    allowedValues: z.array(lengthString(0, 120)).min(1).max(100).nullish(),
    minimumValue: z.string().regex(decimalBound, 'must be a decimal number').nullish(),
    maximumValue: z.string().regex(decimalBound, 'must be a decimal number').nullish(),
    minimumDate: z.string().regex(calendarDay, 'must be a YYYY-MM-DD date').nullish(),
    maximumDate: z.string().regex(calendarDay, 'must be a YYYY-MM-DD date').nullish(),
    minimumLength: z.number().int().min(0).max(10_000).nullish(),
    maximumLength: z.number().int().min(1).max(10_000).nullish(),
  })
  .strict()
export type FormFieldRequest = z.infer<typeof formFieldRequest>

const formCode = trimmedLowercaseInput(
  z.string().regex(/^[a-z][a-z0-9_]{1,63}$/, 'must be a lowercase form code'),
)
const formName = trimmedInput(lengthString(3, 160))
const formDefinitionFields = {
  code: formCode,
  name: formName,
  description: lengthString(0, 2_000).nullish(),
  formType: z.enum(digitalFormTypes),
  activityId: uuidString.nullish(),
  journeyStageId: uuidString.nullish(),
  fields: z.array(formFieldRequest).min(1).max(100),
}

// Body of POST metadata/projects/:projectId/forms.
export const createFormRequest = z.object(formDefinitionFields).strict()
export type CreateFormRequest = z.infer<typeof createFormRequest>

// Body of PATCH metadata/projects/:projectId/forms/:formId.
export const updateFormRequest = z
  .object({ ...formDefinitionFields, expectedUpdatedAt: isoDateString })
  .strict()
export type UpdateFormRequest = z.infer<typeof updateFormRequest>

// Body of POST metadata/projects/:projectId/forms/generate.
export const generateFormRequest = z
  .object({
    templateKey: lengthString(0, 64).nullish(),
    sourceFormId: uuidString.nullish(),
    code: formCode,
    name: formName,
  })
  .strict()
export type GenerateFormRequest = z.infer<typeof generateFormRequest>

// Body of the form publish and archive routes.
export const formVersionRequest = z.object({ expectedUpdatedAt: isoDateString }).strict()
export type FormVersionRequest = z.infer<typeof formVersionRequest>

// Body of POST metadata/projects/:projectId/forms/:formId/validate.
export const validateFormValuesRequest = z.object({ values: formResponseValues }).strict()
export type ValidateFormValuesRequest = z.infer<typeof validateFormValuesRequest>

// Body of POST metadata/projects/:projectId/forms/:formId/submissions.
export const saveSubmissionRequest = z
  .object({
    beneficiaryId: uuidString.optional(),
    clientSubmissionId: uuidString,
    values: formResponseValues,
  })
  .strict()
export type SaveSubmissionRequest = z.infer<typeof saveSubmissionRequest>

// Body of PATCH metadata/projects/:projectId/forms/:formId/submissions/:submissionId.
export const updateSubmissionRequest = z
  .object({ expectedUpdatedAt: isoDateString, values: formResponseValues })
  .strict()
export type UpdateSubmissionRequest = z.infer<typeof updateSubmissionRequest>

// Body of POST metadata/projects/:projectId/forms/:formId/submissions/:submissionId/submit.
export const submitSubmissionRequest = z.object({ expectedUpdatedAt: isoDateString }).strict()
export type SubmitSubmissionRequest = z.infer<typeof submitSubmissionRequest>

// Query of GET metadata/projects/:projectId/forms/:formId/submissions.
export const listSubmissionsQuery = z
  .object({
    offset: queryInteger(0, 10_000).default(0),
    limit: queryInteger(1, 50).default(10),
  })
  .strict()
export type ListSubmissionsQuery = z.infer<typeof listSubmissionsQuery>
```

Append to `packages/shared/src/index.ts`, as the last line:

```ts
export * from './contracts/metadata/form-requests'
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/metadata/form-requests.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 3: Write the parity test**

Create `apps/api/src/modules/metadata/form-request-parity.test.ts`:

```ts
import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import {
  createFormRequest,
  digitalFormTypes,
  formVersionRequest,
  generateFormRequest,
  listSubmissionsQuery,
  saveSubmissionRequest,
  submitSubmissionRequest,
  updateFormRequest,
  updateSubmissionRequest,
  validateFormValuesRequest,
} from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import {
  CreateFormDto,
  ExpectedVersionDto,
  GenerateFormDto,
  ListSubmissionsQueryDto,
  SaveSubmissionDto,
  SubmitSubmissionDto,
  UpdateFormDto,
  UpdateSubmissionDto,
  ValidateValuesDto,
} from './metadata.dto'

// Same options as main.ts.
const globalPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: false,
})

type Kind = 'body' | 'query'
type Outcome = { accepted: boolean; value: unknown }
type Pipe = { transform(value: unknown): unknown }

// Records a pipe rejection; an error that is not a 400 is recorded by its class name.
function rejected(error: unknown): Outcome {
  if (!(error instanceof BadRequestException)) {
    return { accepted: false, value: (error as Error).name }
  }
  return { accepted: false, value: error.getResponse() }
}

// The old route: the global pipe with the DTO as metatype.
async function viaDto(input: unknown, metatype: new () => object, type: Kind): Promise<Outcome> {
  try {
    const dto = await globalPipe.transform(input, { type, metatype })
    return { accepted: true, value: JSON.parse(JSON.stringify(dto)) }
  } catch (error) {
    return rejected(error)
  }
}

// The new route: the global pipe with an Object metatype, then the zod pipe.
async function viaZod(input: unknown, pipe: Pipe, type: Kind): Promise<Outcome> {
  try {
    const value = await globalPipe.transform(input, { type, metatype: Object })
    return { accepted: true, value: JSON.parse(JSON.stringify(pipe.transform(value))) }
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
const grin = String.fromCodePoint(0x1f600)
const routes: Record<string, [new () => object, Pipe, Kind]> = {
  create: [CreateFormDto, new ZodPipe(createFormRequest), 'body'],
  update: [UpdateFormDto, new ZodPipe(updateFormRequest), 'body'],
  generate: [GenerateFormDto, new ZodPipe(generateFormRequest), 'body'],
  version: [ExpectedVersionDto, new ZodPipe(formVersionRequest), 'body'],
  values: [ValidateValuesDto, new ZodPipe(validateFormValuesRequest), 'body'],
  save: [SaveSubmissionDto, new ZodPipe(saveSubmissionRequest), 'body'],
  edit: [UpdateSubmissionDto, new ZodPipe(updateSubmissionRequest), 'body'],
  submit: [SubmitSubmissionDto, new ZodPipe(submitSubmissionRequest), 'body'],
  list: [ListSubmissionsQueryDto, new ZodPipe(listSubmissionsQuery), 'query'],
}
type Case = [string, unknown]

// A JSON string is parsed fresh for each pipe; query objects pass as built.
const input = (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : value)
async function both(route: string, value: unknown) {
  const [dto, pipe, type] = routes[route]
  return {
    dto: await viaDto(input(value), dto, type),
    zod: await viaZod(input(value), pipe, type),
  }
}

const field = (extra: Record<string, unknown> = {}) => ({
  code: 'first_name',
  label: 'First name',
  dataType: 'TEXT',
  required: true,
  metadataKey: false,
  sadddField: false,
  ...extra,
})
const form = (extra: Record<string, unknown> = {}, fields: unknown = [field()]) =>
  JSON.stringify({
    code: 'intake',
    name: 'Intake form',
    formType: 'TRAINING_SURVEY',
    fields,
    ...extra,
  })
const withField = (extra: Record<string, unknown>) => form({}, [field(extra)])
const stamp = '2026-09-24T00:00:00.000Z'
const save = (extra: Record<string, unknown>) =>
  JSON.stringify({ clientSubmissionId: uuid, values: { first_name: 'Ana' }, ...extra })

const acceptedCases: Case[] = [
  ['create', form()],
  ...digitalFormTypes.map((formType): Case => ['create', form({ formType })]),
  ['create', form({ code: '  INTAKE_2026 ', name: '  Intake form  ' })],
  ['create', form({ name: grin.repeat(3) })],
  ['create', form({ description: null, activityId: null, journeyStageId: null })],
  [
    'create',
    form({ description: 'x'.repeat(2000), activityId: uuid, journeyStageId: uuid.toUpperCase() }),
  ],
  ['create', form({ code: `a${'b'.repeat(63)}` })],
  [
    'create',
    form(
      {},
      Array.from({ length: 100 }, () => field()),
    ),
  ],
  ['create', withField({ code: ' FIRST_NAME ', label: '  Given name  ' })],
  ['create', withField({ allowedValues: ['Yes', 'No'], dataType: 'SELECT' })],
  ['create', withField({ allowedValues: ['x'.repeat(120)] })],
  ['create', withField({ allowedValues: [''] })],
  [
    'create',
    withField({ allowedValues: null, minimumValue: null, minimumDate: null, minimumLength: null }),
  ],
  ['create', withField({ minimumValue: '-12.5', maximumValue: '1000.1234' })],
  ['create', withField({ minimumDate: '2026-02-30', maximumDate: '2026-12-31' })],
  ['create', withField({ minimumLength: 0, maximumLength: 10000 })],
  ['update', form({ expectedUpdatedAt: stamp })],
  ['update', form({ expectedUpdatedAt: '2026-W01-1' })],
  ['generate', '{"templateKey":"training_survey","code":"ok_code","name":"Okay"}'],
  ['generate', `{"sourceFormId":"${uuid}","code":" OK_CODE ","name":"  Okay  "}`],
  ['generate', '{"templateKey":null,"sourceFormId":null,"code":"ok_code","name":"Okay"}'],
  ['generate', '{"templateKey":"","code":"ok_code","name":"Okay"}'],
  ['version', `{"expectedUpdatedAt":"${stamp}"}`],
  ['version', '{"expectedUpdatedAt":"20260924"}'],
  ['values', '{"values":{}}'],
  ['values', '{"values":{"first_name":"Ana","age":3,"tags":["a","b"],"ok":true,"empty":null}}'],
  ['values', '{"values":{"first_name":"Ana","hasOwnProperty":1,"toString":"x","valueOf":2}}'],
  ['values', '{"values":{"__proto__":{"a":1},"first_name":"Ana"}}'],
  ['save', save({})],
  ['save', save({ beneficiaryId: uuid })],
  ['edit', `{"expectedUpdatedAt":"${stamp}","values":{"first_name":"Ana"}}`],
  ['submit', `{"expectedUpdatedAt":"${stamp}"}`],
  ['list', {}],
  ['list', { offset: '10000', limit: '50' }],
  ['list', { offset: '', limit: '1' }],
  ['list', { offset: ' 2 ', limit: '0x5' }],
]

const rejectedCases: Case[] = [
  ['create', form({ code: 'a' })],
  ['create', form({ code: '1intake' })],
  ['create', form({ code: `a${'b'.repeat(64)}` })],
  ['create', form({ code: 7 })],
  ['create', form({ name: 'ab' })],
  ['create', form({ name: '   ab   ' })],
  ['create', form({ name: grin.repeat(2) })],
  ['create', form({ name: 'x'.repeat(161) })],
  ['create', form({ description: 'x'.repeat(2001) })],
  ['create', form({ description: 7 })],
  ['create', form({ formType: 'SURVEY' })],
  ['create', form({ activityId: 'not-a-uuid' })],
  ['create', form({ journeyStageId: '10000000-0000-0000-8000-000000000001' })],
  ['create', form({ extra: true })],
  ['create', form({}, [])],
  [
    'create',
    form(
      {},
      Array.from({ length: 101 }, () => field()),
    ),
  ],
  ['create', form({}, [null])],
  ['create', form({}, ['first_name'])],
  ['create', form({}, { 0: field() })],
  ['create', JSON.stringify({ code: 'intake', name: 'Intake form', formType: 'OTHER' })],
  ['create', withField({ code: '' })],
  ['create', withField({ code: 'First Name' })],
  ['create', withField({ code: `a${'b'.repeat(64)}` })],
  ['create', withField({ label: '   ' })],
  ['create', withField({ label: 'x'.repeat(161) })],
  ['create', withField({ dataType: 'JSON' })],
  ['create', withField({ required: 'true' })],
  ['create', withField({ metadataKey: 1 })],
  ['create', withField({ sadddField: null })],
  ['create', withField({ allowedValues: [] })],
  ['create', withField({ allowedValues: Array.from({ length: 101 }, (_, i) => `v${i}`) })],
  ['create', withField({ allowedValues: ['x'.repeat(121)] })],
  ['create', withField({ allowedValues: [1] })],
  ['create', withField({ allowedValues: 'Yes' })],
  ['create', withField({ minimumValue: '1.23456' })],
  ['create', withField({ minimumValue: '01' })],
  ['create', withField({ minimumValue: 5 })],
  ['create', withField({ maximumValue: '1e3' })],
  ['create', withField({ minimumDate: '2026-1-1' })],
  ['create', withField({ maximumDate: '2026-01-01T00:00:00Z' })],
  ['create', withField({ minimumLength: -1 })],
  ['create', withField({ minimumLength: 1.5 })],
  ['create', withField({ maximumLength: 0 })],
  ['create', withField({ maximumLength: 10001 })],
  ['create', withField({ maximumLength: '5' })],
  ['create', withField({ extra: 1 })],
  ['update', form()],
  ['update', form({ expectedUpdatedAt: 'yesterday' })],
  ['update', form({ expectedUpdatedAt: 5 })],
  ['generate', '{"code":"ok_code"}'],
  ['generate', '{"templateKey":7,"code":"ok_code","name":"x"}'],
  ['generate', `{"templateKey":"${'k'.repeat(65)}","code":"ok_code","name":"Okay"}`],
  ['generate', '{"sourceFormId":"not-a-uuid","code":"ok_code","name":"Okay"}'],
  ['generate', '{"templateKey":"training_survey","code":"1bad","name":"Okay"}'],
  ['generate', '{"templateKey":"training_survey","code":"ok_code","name":"Okay","fields":[]}'],
  ['version', '{}'],
  ['version', '{"expectedUpdatedAt":"not a date"}'],
  ['version', `{"expectedUpdatedAt":"${stamp}","extra":1}`],
  ['values', '{}'],
  ['values', '{"values":null}'],
  ['values', '{"values":[1]}'],
  ['values', '{"values":"x"}'],
  ['values', '{"values":{},"extra":1}'],
  ['save', save({ clientSubmissionId: 'not-a-uuid' })],
  ['save', save({ clientSubmissionId: undefined })],
  ['save', save({ beneficiaryId: 'x' })],
  ['save', save({ values: [] })],
  ['save', save({ extra: 1 })],
  ['edit', '{"values":{}}'],
  ['edit', `{"expectedUpdatedAt":"${stamp}"}`],
  ['submit', '{"expectedUpdatedAt":"x"}'],
  ['list', { offset: '-1' }],
  ['list', { offset: '10001' }],
  ['list', { limit: '0' }],
  ['list', { limit: '' }],
  ['list', { limit: '51' }],
  ['list', { offset: '2.5' }],
  ['list', { offset: ['1'] }],
  ['list', { offset: { a: '1' } }],
  ['list', { page: '1' }],
]

describe('metadata DTOs and request contracts parity', () => {
  it.each(acceptedCases)('%s accepts %j with the same value', async (route, value) => {
    const { dto, zod } = await both(route, value)
    expect(dto.accepted).toBe(true)
    expect(zod).toEqual(dto)
  })

  it.each(rejectedCases)('%s answers the 400 shape for %j', async (route, value) => {
    const { dto, zod } = await both(route, value)
    expect(dto).toEqual(badRequestShape)
    expect(zod).toEqual(badRequestShape)
  })

  // Ruling 3: the DTO pipe let an array through where a field object belongs; the service then answered 400.
  it('only the contract rejects an array in place of a field', async () => {
    const { dto, zod } = await both('create', form({}, [[]]))
    expect(dto.accepted).toBe(true)
    expect(zod).toEqual(badRequestShape)
  })

  // Ruling 3: a null beneficiary passed the DTO pipe and failed inside the service, after the form checks.
  it('only the contract rejects a null beneficiary', async () => {
    const { dto, zod } = await both('save', save({ beneficiaryId: null }))
    expect(dto.accepted).toBe(true)
    expect(zod).toEqual(badRequestShape)
  })

  // Ruling 5: a constructor key at any depth of the values crashed class-transformer, which answered 500.
  it.each([
    ['values', '{"values":{"constructor":"x"}}'],
    ['save', save({ values: { first_name: { constructor: 1 } } })],
    ['edit', `{"expectedUpdatedAt":"${stamp}","values":{"tags":[{"constructor":1}]}}`],
  ] as Case[])(
    'only the contract answers 400 for the constructor key in %s %j',
    async (route, value) => {
      const { dto, zod } = await both(route, value)
      expect(dto).toEqual({ accepted: false, value: 'TypeError' })
      expect(zod).toEqual(badRequestShape)
    },
  )

  // F3b ruling 3: the DTO pipe dropped own prototype keys; strict contracts reject them.
  it.each([
    [
      'create',
      '{"code":"intake","name":"Intake form","formType":"OTHER","fields":[{"code":"a","label":"A","dataType":"TEXT","required":true,"metadataKey":false,"sadddField":false}],"__proto__":{"a":1}}',
    ],
    [
      'create',
      '{"code":"intake","name":"Intake form","formType":"OTHER","fields":[{"code":"a","label":"A","dataType":"TEXT","required":true,"metadataKey":false,"sadddField":false,"constructor":{"a":1}}]}',
    ],
    ['version', `{"expectedUpdatedAt":"${stamp}","constructor":{"a":1}}`],
    ['save', `{"clientSubmissionId":"${uuid}","values":{},"__proto__":{"a":1}}`],
  ] as Case[])('only the contract rejects the prototype key in %s %j', async (route, value) => {
    const { dto, zod } = await both(route, value)
    expect(dto.accepted).toBe(true)
    expect(zod).toEqual(badRequestShape)
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/metadata/form-request-parity.test.ts`
Expected: PASS, 131 tests (42 accepted, 80 rejected, 1 array field, 1 null beneficiary, 3 constructor keys, 4 prototype keys). Any failure means a contract differs from its DTO: stop and report the row.

- [ ] **Step 4: Check and commit**

```bash
git add -N packages/shared apps/api
pnpm exec biome check --write packages/shared/src/contracts packages/shared/src/index.ts apps/api/src/modules/metadata/form-request-parity.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/shared test 2>&1 | grep -E "Tests +[0-9]+"
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add packages/shared/src/contracts packages/shared/src/index.ts apps/api/src/modules/metadata/form-request-parity.test.ts
git commit -m "feat(shared): add the form metadata request contracts with their DTO parity test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: shared = `B_shared + 29`, api = `B_api + 139` (Task 2 count plus 131).

---

### Task 4: Switch the metadata routes and delete the metadata DTO

**Files:**
- Test: `apps/api/src/modules/metadata/metadata.controller.validation.test.ts`
- Modify: `apps/api/src/modules/metadata/metadata.controller.ts` (full content below)
- Modify: `apps/api/src/modules/metadata/metadata.service.ts` (import block, parameter types, `requireLinks` parameter types)
- Modify: `apps/api/src/modules/metadata/form-templates.ts` (type import)
- Modify: `apps/api/src/modules/metadata/metadata.generate.test.ts` (the DTO runner test runs the contract)
- Modify: `apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts` (metadata case removed)
- Delete: `apps/api/src/modules/metadata/metadata.dto.ts`, `apps/api/src/modules/metadata/form-request-parity.test.ts`

**Interfaces:**
- Consumes: Task 3 contracts; S1 `requestIdentity`; `ZodPipe`.
- Produces: `MetadataService` methods take the Task 3 request types; `requireLinks` accepts `activityId?: string | null` and `journeyStageId?: string | null` (type only: its body tests both for truthiness); `form-templates.ts` types its fields as `FormFieldRequest`.

- [ ] **Step 1: Write the HTTP test**

Create `apps/api/src/modules/metadata/metadata.controller.validation.test.ts`:

```ts
import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { FormDefinitionExportService } from './form-definition-export.service'
import { MetadataController } from './metadata.controller'
import { MetadataService } from './metadata.service'

const projectId = '10000000-0000-4000-8000-000000000001'
const formId = '20000000-0000-4000-8000-000000000002'
const clientSubmissionId = '40000000-0000-4000-8000-000000000004'
const actor = { id: '30000000-0000-4000-8000-000000000003', aal: 'aal2' }
const metadata = {
  createForm: vi.fn(),
  generateForm: vi.fn(),
  publishForm: vi.fn(),
  validateValues: vi.fn(),
  saveSubmission: vi.fn(),
  listSubmissions: vi.fn(),
}
let app: INestApplication
let base: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [MetadataController],
    providers: [
      { provide: MetadataService, useValue: metadata },
      { provide: FormDefinitionExportService, useValue: {} },
    ],
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
  base = `http://127.0.0.1:${port}/metadata/projects/${projectId}/forms`
})

beforeEach(() => {
  for (const method of Object.values(metadata)) method.mockReset().mockResolvedValue({ id: formId })
})
afterAll(async () => app?.close())

// Sends a raw JSON body to a forms route and returns the status.
async function send(method: string, route: string, body: string) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  })
  return response.status
}

const field = {
  code: ' FIRST_NAME ',
  label: '  First name  ',
  dataType: 'TEXT',
  required: true,
  metadataKey: false,
  sadddField: false,
}

describe('metadata form bodies', () => {
  it('forwards a form with trimmed and lower-cased codes and trimmed names', async () => {
    const body = { code: ' INTAKE ', name: '  Intake form  ', formType: 'OTHER', fields: [field] }
    expect(await send('POST', '', JSON.stringify(body))).toBe(201)
    expect(metadata.createForm).toHaveBeenCalledWith(actor, projectId, {
      code: 'intake',
      name: 'Intake form',
      formType: 'OTHER',
      fields: [{ ...field, code: 'first_name', label: 'First name' }],
    })
  })

  it('answers 400 for an unknown field key or a bad publish timestamp without calling the service', async () => {
    const extra = {
      code: 'intake',
      name: 'Intake',
      formType: 'OTHER',
      fields: [{ ...field, x: 1 }],
    }
    expect(await send('POST', '', JSON.stringify(extra))).toBe(400)
    expect(await send('POST', `/${formId}/publish`, '{"expectedUpdatedAt":"not a date"}')).toBe(400)
    expect(metadata.createForm).not.toHaveBeenCalled()
    expect(metadata.publishForm).not.toHaveBeenCalled()
  })

  it('forwards a null template key and normalizes the code and name', async () => {
    const body = '{"templateKey":null,"code":" OK_CODE ","name":" Okay "}'
    expect(await send('POST', '/generate', body)).toBe(201)
    expect(metadata.generateForm).toHaveBeenCalledWith(actor, projectId, {
      templateKey: null,
      code: 'ok_code',
      name: 'Okay',
    })
  })
})

describe('metadata response values and submissions', () => {
  it('drops method-named value keys and refuses a constructor key', async () => {
    const values = '{"values":{"first_name":"Ana","toString":"x"}}'
    expect(await send('POST', `/${formId}/validate`, values)).toBe(201)
    expect(metadata.validateValues).toHaveBeenCalledWith(actor, projectId, formId, {
      first_name: 'Ana',
    })
    expect(await send('POST', `/${formId}/validate`, '{"values":{"constructor":"x"}}')).toBe(400)
    expect(metadata.validateValues).toHaveBeenCalledTimes(1)
  })

  it('forwards a submission and refuses a null beneficiary at the pipe', async () => {
    const body = { clientSubmissionId, values: { first_name: 'Ana' } }
    expect(await send('POST', `/${formId}/submissions`, JSON.stringify(body))).toBe(201)
    expect(metadata.saveSubmission).toHaveBeenCalledWith(actor, projectId, formId, body)
    const unnamed = JSON.stringify({ ...body, beneficiaryId: null })
    expect(await send('POST', `/${formId}/submissions`, unnamed)).toBe(400)
    expect(metadata.saveSubmission).toHaveBeenCalledTimes(1)
  })

  it('reads the submission page bounds as numbers, applies the defaults and refuses a large page', async () => {
    await fetch(`${base}/${formId}/submissions?offset=2&limit=5`)
    await fetch(`${base}/${formId}/submissions`)
    const refused = await fetch(`${base}/${formId}/submissions?limit=51`)
    expect(refused.status).toBe(400)
    expect(metadata.listSubmissions.mock.calls.map((call) => call[3])).toEqual([
      { offset: 2, limit: 5 },
      { offset: 0, limit: 10 },
    ])
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/metadata/metadata.controller.validation.test.ts`
Expected: FAIL, 6 of 6 (the DTO routes forward raw bodies under Vitest).

- [ ] **Step 2: Switch the controller**

Replace the whole of `apps/api/src/modules/metadata/metadata.controller.ts` with:

```ts
import {
  Body,
  Controller,
  Get,
  Header,
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
  type CreateFormRequest,
  type FormVersionRequest,
  type GenerateFormRequest,
  type ListSubmissionsQuery,
  type SaveSubmissionRequest,
  type SubmitSubmissionRequest,
  type UpdateFormRequest,
  type UpdateSubmissionRequest,
  type ValidateFormValuesRequest,
  createFormRequest,
  formVersionRequest,
  generateFormRequest,
  listSubmissionsQuery,
  saveSubmissionRequest,
  submitSubmissionRequest,
  updateFormRequest,
  updateSubmissionRequest,
  validateFormValuesRequest,
} from '@pathways/shared'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { FormDefinitionExportService } from './form-definition-export.service'
import { MetadataService } from './metadata.service'

@Controller('metadata/projects/:projectId/forms')
export class MetadataController {
  constructor(
    @Inject(MetadataService) private readonly metadata: MetadataService,
    @Inject(FormDefinitionExportService) private readonly formExport: FormDefinitionExportService,
  ) {}

  @Get()
  @RequirePermission('forms.read')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.metadata.listForms(requestIdentity(request), projectId)
  }

  @Post()
  @RequirePermission('forms.manage')
  create(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body(new ZodPipe(createFormRequest)) body: CreateFormRequest,
  ) {
    return this.metadata.createForm(requestIdentity(request), projectId, body)
  }

  @Post('generate')
  @RequirePermission('forms.generate')
  generate(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body(new ZodPipe(generateFormRequest)) body: GenerateFormRequest,
  ) {
    return this.metadata.generateForm(requestIdentity(request), projectId, body)
  }

  @Get(':formId')
  @RequirePermission('forms.read')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
  ) {
    return this.metadata.getForm(requestIdentity(request), projectId, formId)
  }

  @Get(':formId/export')
  @Header('Cache-Control', 'private, no-store')
  @RequirePermission('forms.export')
  async exportDefinition(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Query('format') format: unknown,
    @Res({ passthrough: true }) res: { setHeader: (name: string, value: string) => void },
  ) {
    const result = await this.formExport.export(requestIdentity(request), projectId, formId, format)
    res.setHeader('Content-Type', result.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    return new StreamableFile(result.bytes)
  }

  @Patch(':formId')
  @RequirePermission('forms.manage')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Body(new ZodPipe(updateFormRequest)) body: UpdateFormRequest,
  ) {
    return this.metadata.updateForm(requestIdentity(request), projectId, formId, body)
  }

  @Post(':formId/publish')
  @RequirePermission('forms.publish')
  publish(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Body(new ZodPipe(formVersionRequest)) body: FormVersionRequest,
  ) {
    return this.metadata.publishForm(requestIdentity(request), projectId, formId, body)
  }

  @Post(':formId/archive')
  @RequirePermission('forms.archive')
  archive(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Body(new ZodPipe(formVersionRequest)) body: FormVersionRequest,
  ) {
    return this.metadata.archiveForm(requestIdentity(request), projectId, formId, body)
  }

  @Post(':formId/versions')
  @RequirePermission('forms.manage')
  newVersion(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
  ) {
    return this.metadata.newVersion(requestIdentity(request), projectId, formId)
  }

  @Post(':formId/validate')
  @RequirePermission('submissions.write')
  validateValues(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Body(new ZodPipe(validateFormValuesRequest)) body: ValidateFormValuesRequest,
  ) {
    return this.metadata.validateValues(requestIdentity(request), projectId, formId, body.values)
  }

  @Post(':formId/submissions')
  @RequirePermission('submissions.write')
  saveSubmission(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Body(new ZodPipe(saveSubmissionRequest)) body: SaveSubmissionRequest,
  ) {
    return this.metadata.saveSubmission(requestIdentity(request), projectId, formId, body)
  }

  @Get(':formId/submissions')
  @RequirePermission('submissions.write')
  listSubmissions(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Query(new ZodPipe(listSubmissionsQuery)) query: ListSubmissionsQuery,
  ) {
    return this.metadata.listSubmissions(requestIdentity(request), projectId, formId, query)
  }

  @Get(':formId/submissions/:submissionId')
  @RequirePermission('submissions.write')
  getSubmission(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Param('submissionId') submissionId: string,
  ) {
    return this.metadata.getSubmission(requestIdentity(request), projectId, formId, submissionId)
  }

  @Get(':formId/submissions/by-client/:clientSubmissionId')
  @RequirePermission('submissions.write')
  getSubmissionByClientId(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Param('clientSubmissionId') clientSubmissionId: string,
  ) {
    return this.metadata.getSubmissionByClientId(
      requestIdentity(request),
      projectId,
      formId,
      clientSubmissionId,
    )
  }

  @Patch(':formId/submissions/:submissionId')
  @RequirePermission('submissions.write')
  updateSubmission(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Param('submissionId') submissionId: string,
    @Body(new ZodPipe(updateSubmissionRequest)) body: UpdateSubmissionRequest,
  ) {
    return this.metadata.updateSubmission(
      requestIdentity(request),
      projectId,
      formId,
      submissionId,
      body,
    )
  }

  @Post(':formId/submissions/:submissionId/validate')
  @RequirePermission('submissions.write')
  validateSubmission(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Param('submissionId') submissionId: string,
  ) {
    return this.metadata.validateSubmission(
      requestIdentity(request),
      projectId,
      formId,
      submissionId,
    )
  }

  @Post(':formId/submissions/:submissionId/submit')
  @RequirePermission('submissions.write')
  submitSubmission(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('formId') formId: string,
    @Param('submissionId') submissionId: string,
    @Body(new ZodPipe(submitSubmissionRequest)) body: SubmitSubmissionRequest,
  ) {
    return this.metadata.submitSubmission(
      requestIdentity(request),
      projectId,
      formId,
      submissionId,
      body,
    )
  }
}
```

- [ ] **Step 3: Point the service, templates and tests at the contracts**

Create `.tmp/s5a/metadata-route-edits.mjs`:

```js
// Points the metadata service, templates and tests at the shared request contracts and drops the metadata DTO metadata case.
import { readFileSync, writeFileSync } from 'node:fs'

const edit = (file, from, to) => {
  const text = readFileSync(file, 'utf8')
  if (text.split(from).length !== 2) throw new Error(`${file}: expected one copy of ${from}`)
  writeFileSync(file, text.replace(from, to))
  console.log(`edited ${file}`)
}

const service = 'apps/api/src/modules/metadata/metadata.service.ts'
edit(
  service,
  `import type {
  CreateFormDto,
  ExpectedVersionDto,
  GenerateFormDto,
  ListSubmissionsQueryDto,
  SaveSubmissionDto,
  SubmitSubmissionDto,
  UpdateFormDto,
  UpdateSubmissionDto,
} from './metadata.dto'
`,
  '',
)
edit(
  service,
  `import {
  DIRECT_ENTRY_FORM_TYPES,
  type FormFieldValidationContract,
  type FormValidationMode,
`,
  `import {
  type CreateFormRequest,
  DIRECT_ENTRY_FORM_TYPES,
  type FormFieldValidationContract,
  type FormValidationMode,
  type FormVersionRequest,
  type GenerateFormRequest,
  type ListSubmissionsQuery,
  type SaveSubmissionRequest,
  type SubmitSubmissionRequest,
  type UpdateFormRequest,
  type UpdateSubmissionRequest,
`,
)
// Nullish contract fields reach requireLinks; its body already tests both ids for truthiness.
edit(
  service,
  `    activityId?: string,
    journeyStageId?: string,
`,
  `    activityId?: string | null,
    journeyStageId?: string | null,
`,
)

edit(
  'apps/api/src/modules/metadata/form-templates.ts',
  `import type { CreateFormDto, FormFieldDto } from './metadata.dto'`,
  `import type { CreateFormRequest, FormFieldRequest } from '@pathways/shared'`,
)

const generate = 'apps/api/src/modules/metadata/metadata.generate.test.ts'
edit(
  generate,
  `import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
`,
  '',
)
edit(
  generate,
  `import { rolePermissions } from '@pathways/shared'`,
  `import { generateFormRequest, rolePermissions } from '@pathways/shared'`,
)
edit(
  generate,
  `import { GenerateFormDto } from './metadata.dto'
`,
  '',
)
edit(
  generate,
  `    const errors = (value: unknown) =>
      validateSync(plainToInstance(GenerateFormDto, value)).map((error) => error.property)`,
  `    const errors = (value: unknown) =>
      (generateFormRequest.safeParse(value).error?.issues ?? []).map((issue) => issue.path[0])`,
)

edit(
  'apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts',
  `  {
    file: 'src/modules/metadata/metadata.controller.ts',
    dtoNames: [
      'CreateFormDto',
      'ExpectedVersionDto',
      'ListSubmissionsQueryDto',
      'SaveSubmissionDto',
      'SubmitSubmissionDto',
      'UpdateFormDto',
      'UpdateSubmissionDto',
      'ValidateValuesDto',
    ],
  },
`,
  '',
)
```

```bash
node .tmp/s5a/metadata-route-edits.mjs
node .tmp/s5a/rename-words.mjs CreateFormDto=CreateFormRequest,ExpectedVersionDto=FormVersionRequest,GenerateFormDto=GenerateFormRequest,ListSubmissionsQueryDto=ListSubmissionsQuery,SaveSubmissionDto=SaveSubmissionRequest,SubmitSubmissionDto=SubmitSubmissionRequest,UpdateFormDto=UpdateFormRequest,UpdateSubmissionDto=UpdateSubmissionRequest,FormFieldDto=FormFieldRequest apps/api/src/modules/metadata/metadata.service.ts apps/api/src/modules/metadata/form-templates.ts
git rm -q apps/api/src/modules/metadata/metadata.dto.ts apps/api/src/modules/metadata/form-request-parity.test.ts
git grep -nE "metadata\.dto|Dto\b" -- apps/api/src/modules/metadata
git grep -lE "imports\.dto'|metadata\.dto'" -- apps | wc -l
```

Expected: nine `edited` lines (three for the service, one for the templates, four for the generate test, one for the runtime metadata test), then `apps/api/src/modules/metadata/metadata.service.ts: 15` and `apps/api/src/modules/metadata/form-templates.ts: 5`; the first grep prints nothing and the count is `0`.

- [ ] **Step 4: Run the tests and commit**

```bash
pnpm --filter @pathways/api exec vitest run src/modules/metadata src/common/validation
pnpm exec biome check --write apps/api/src/modules/metadata apps/api/src/common/validation
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api/src/modules/metadata apps/api/src/common/validation
git commit -m "refactor(api): validate the form metadata routes with the shared zod contracts

The metadata DTO and its parity test are removed; the controller reads the identity with requestIdentity.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the HTTP test passes 6 of 6; `pnpm typecheck` also compiles the two seeds that construct `MetadataService` and `ImportsService` (`local-demo-seed.ts`, `defense-demo-seed.ts`) and the stages that call them; api = `B_api + 13` (Task 3 count minus 131 parity, minus 1 runtime metadata case, plus 6 HTTP).

---

### Task 5: Split the metadata service

**Files:**
- Move: `apps/api/src/modules/metadata/metadata.f5-gates.test.ts` -> `metadata.direct-entry.test.ts`, `apps/api/src/modules/metadata/form-definition-export.f5-gates.test.ts` -> `form-definition-export.audit.test.ts` (commit 1)
- Create: `apps/api/src/modules/metadata/metadata.mapper.ts`, `metadata.helpers.ts`, `form-lookup.service.ts`, `form-definitions.service.ts`, `form-versions.service.ts`, `form-submissions.service.ts`, `form-submission-reads.service.ts` (generated)
- Modify: `apps/api/src/modules/metadata/metadata.service.ts` (full content below)
- Test: `apps/api/src/modules/metadata/metadata.mapper.test.ts`
- Modify: `apps/api/src/modules/metadata/form-definition-export.service.ts` (Step 7, project lookup only)
- Test: `apps/api/src/modules/metadata/form-definition-export.service.test.ts` (Step 6, one characterization case)

**Interfaces:**
- Consumes: Task 4 request types; `requireScopedProject(tx: Tx, actor: ApplicationIdentity, projectId: string): Promise<string>` from `apps/api/src/common/authz/scoped-project.ts` (F3a).
- Produces: from `metadata.mapper.ts`, `fieldSelection`, `formSelection`, `type FormRow`, `type FormFieldContractRow`, `type CachedFormDefinition`, `jsonStringArray(value: Prisma.JsonValue | null): string[] | null`, `formFieldContract(field: FormFieldContractRow): FormFieldValidationContract`, `mapForm(form: FormRow, actor: ApplicationIdentity)`, `fieldInput(field: FormRow['formField_form'][number]): CreateFormRequest['fields'][number]`; from `metadata.helpers.ts`, `assertDefinition`, `fieldData`, `sameValues`, `assertDirectEntryForm`, `expectedDate`, `assertValues`; from `form-lookup.service.ts`, `requireForm`, `findForm`, `requireLinks`, `requireSurveySubject`, `findSubmission`, `requireDraftSubmission`, `replaceResponses` (each `(tx: Tx, actor: ApplicationIdentity, ...)` with its original parameters); the route functions named in the facade below, each taking `tx: Tx, actor: ApplicationIdentity` first. `MetadataService` keeps its constructor and every public method signature.

- [ ] **Step 1: Rename the phase-coded tests and commit**

```bash
git mv apps/api/src/modules/metadata/metadata.f5-gates.test.ts apps/api/src/modules/metadata/metadata.direct-entry.test.ts
git mv apps/api/src/modules/metadata/form-definition-export.f5-gates.test.ts apps/api/src/modules/metadata/form-definition-export.audit.test.ts
pnpm --filter @pathways/api exec vitest run src/modules/metadata
git status --short apps/api/src/modules/metadata | grep "^R"
git commit -m "test(api): name the metadata gate tests after what they check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: tests pass; two `R` renames.

- [ ] **Step 2: Write the failing mapper characterization test**

Create `apps/api/src/modules/metadata/metadata.mapper.test.ts` (it pins the field contract mapping before Task 6 removes the imports copy, ruling 9):

```ts
import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { type FormFieldContractRow, formFieldContract, jsonStringArray } from './metadata.mapper'

const row = (patch: Partial<FormFieldContractRow> = {}): FormFieldContractRow => ({
  code: 'score',
  label: 'Score',
  dataType: 'DECIMAL',
  isRequired: true,
  allowedValues: null,
  minimumValue: null,
  maximumValue: null,
  minimumDate: null,
  maximumDate: null,
  minimumLength: null,
  maximumLength: null,
  ...patch,
})

describe('form field contract mapping', () => {
  it('maps decimals to strings, dates to calendar days and keeps null limits', () => {
    expect(
      formFieldContract(
        row({
          minimumValue: new Prisma.Decimal('-1.50'),
          maximumValue: new Prisma.Decimal('100'),
          minimumDate: new Date('2026-01-31T00:00:00.000Z'),
          maximumDate: new Date('2026-12-31T23:59:59.000Z'),
          minimumLength: 0,
          maximumLength: 40,
        }),
      ),
    ).toEqual({
      code: 'score',
      label: 'Score',
      dataType: 'DECIMAL',
      required: true,
      allowedValues: null,
      minimumValue: '-1.5',
      maximumValue: '100',
      minimumDate: '2026-01-31',
      maximumDate: '2026-12-31',
      minimumLength: 0,
      maximumLength: 40,
    })
    expect(formFieldContract(row())).toEqual({
      code: 'score',
      label: 'Score',
      dataType: 'DECIMAL',
      required: true,
      allowedValues: null,
      minimumValue: undefined,
      maximumValue: undefined,
      minimumDate: undefined,
      maximumDate: undefined,
      minimumLength: null,
      maximumLength: null,
    })
  })

  it('keeps only an array of strings as allowed values', () => {
    expect(jsonStringArray(['Yes', 'No'])).toEqual(['Yes', 'No'])
    expect(jsonStringArray([])).toEqual([])
    expect(jsonStringArray(['Yes', 1])).toBeNull()
    expect(jsonStringArray({ value: 'Yes' })).toBeNull()
    expect(jsonStringArray('Yes')).toBeNull()
    expect(jsonStringArray(null)).toBeNull()
    expect(
      formFieldContract(row({ dataType: 'SELECT', allowedValues: ['A'] })).allowedValues,
    ).toEqual(['A'])
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/metadata/metadata.mapper.test.ts`
Expected: FAIL, cannot resolve `./metadata.mapper`.

- [ ] **Step 3: Create the split script and plan, then run it**

Create `.tmp/s5a/split-service.mjs` (Tasks 5, 6 and 7 use it). It reads the plan, copies each named top-level declaration (exported unless listed as private, renamed when the plan says `as`), turns each named class method into a function with the same body, or wraps the body of a method's `withAuthorizedOperation` callback in a new function with the planned parameters, applies the plan's text replacements, adds the original imports this module still uses plus imports of names that moved to sibling modules, and prints every moved line it cannot find in the original file once the replacements are undone:

```js
// Moves top-level declarations and class members of one file into new modules by a JSON plan.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const plan = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const sourceText = readFileSync(plan.source, 'utf8')
const source = ts.createSourceFile(plan.source, sourceText, ts.ScriptTarget.Latest, true)
const importBlock = source.statements
  .filter(ts.isImportDeclaration)
  .map((statement) => statement.getText())
  .join('\n')
  .concat('\n')

// Text of a node from its first leading comment.
const withComments = (node) => {
  const comments = ts.getLeadingCommentRanges(sourceText, node.getFullStart()) ?? []
  return sourceText.slice(comments.length ? comments[0].pos : node.getStart(), node.getEnd())
}
const declaredName = (statement) =>
  ts.isVariableStatement(statement)
    ? statement.declarationList.declarations[0].name.getText()
    : statement.name?.getText()
const topLevel = new Map(
  source.statements.filter(declaredName).map((statement) => [declaredName(statement), statement]),
)
const serviceClass = source.statements.find(
  (statement) => ts.isClassDeclaration(statement) && statement.name?.getText() === plan.className,
)
const members = new Map(
  (serviceClass?.members ?? [])
    .filter((member) => member.name)
    .map((member) => [member.name.getText(), member]),
)

// The arrow function passed to the first withAuthorizedOperation call inside a member.
function findCallback(member) {
  let found
  const visit = (node) => {
    if (found) return
    if (ts.isCallExpression(node) && node.expression.getText() === 'withAuthorizedOperation') {
      found = node.arguments[3]
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(member)
  if (!found || !ts.isArrowFunction(found) || !ts.isBlock(found.body)) {
    throw new Error(`No withAuthorizedOperation callback block in ${member.name.getText()}`)
  }
  return found.body
}

// A class member as a function declaration, or a callback body wrapped in a new function.
function memberFunction(spec) {
  const member = members.get(spec.name)
  if (!member) throw new Error(`Missing member ${spec.name}`)
  const exported = spec.export === false ? '' : 'export '
  const full = withComments(member)
  const leading = full.slice(0, full.length - member.getText().length)
  if (spec.callback) {
    const returns = spec.returns ? `: ${spec.returns}` : ''
    const signature = `${exported}async function ${spec.callback}(${spec.params})${returns} {`
    const comments = spec.comments ? leading : ''
    return { signature, text: `${comments}${signature}${findCallback(member).getText().slice(1)}` }
  }
  const isAsync = member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)
  const params = spec.params ?? member.parameters.map((parameter) => parameter.getText()).join(', ')
  const returns = member.type ? `: ${member.type.getText()}` : ''
  const signature = `${exported}${isAsync ? 'async ' : ''}function ${spec.as ?? spec.name}(${params})${returns} {`
  return { signature, text: `${leading}${signature}${member.body.getText().slice(1)}` }
}

// A top-level declaration with its comments, exported unless private, renamed when the plan says so.
function declarationText(entry, exported) {
  const { name, as } = typeof entry === 'string' ? { name: entry } : entry
  const statement = topLevel.get(name)
  if (!statement) throw new Error(`Missing declaration ${name}`)
  const text = withComments(statement)
  const comments = text.slice(0, text.length - statement.getText().length)
  let code = statement.getText()
  if (as) code = code.replace(new RegExp(`^(function|const|type|interface) ${name}\\b`), `$1 ${as}`)
  return comments + (exported && !code.startsWith('export ') ? `export ${code}` : code)
}
const entryName = (entry) => (typeof entry === 'string' ? entry : entry.as)
const sourceName = (entry) => (typeof entry === 'string' ? entry : entry.name)

const pattern = /^import\s+(type\s+)?\{([^}]*)\}\s*from\s*'([^']+)'\n/gm
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
// An identifier use outside quoted strings and property accesses.
const uses = (code, name) =>
  new RegExp(`(?<![.\\w$])${name.replace(/\$/g, '\\$')}\\b`).test(
    code.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''"),
  )

// Exported names of every planned module and of external modules, with their specifier and kind.
const owners = new Map(
  Object.entries(plan.externals ?? {}).map(([name, owner]) => [name, owner]),
)
for (const module of plan.modules) {
  const specifier = `./${path.basename(module.file).replace(/\.ts$/, '')}`
  for (const entry of module.declarations ?? []) {
    if ((module.private ?? []).includes(sourceName(entry))) continue
    const statement = topLevel.get(sourceName(entry))
    const type = ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)
    owners.set(entryName(entry), { specifier, type })
  }
  for (const [name, type] of Object.entries(module.extraNames ?? {})) {
    owners.set(name, { specifier, type: type === 'type' })
  }
  for (const spec of module.members ?? []) {
    if (spec.export !== false) owners.set(spec.callback ?? spec.as ?? spec.name, { specifier, type: false })
  }
}

const originalLines = new Set(sourceText.split('\n').map((line) => line.trim()))
const undo = (line) => plan.replacements.reduce((text, [from, to]) => text.replaceAll(to, from), line)
for (const module of plan.modules) {
  const specifier = `./${path.basename(module.file).replace(/\.ts$/, '')}`
  const functions = (module.members ?? []).map(memberFunction)
  const parts = [
    ...(module.declarations ?? []).map((entry) =>
      declarationText(entry, !(module.private ?? []).includes(sourceName(entry))),
    ),
    ...(module.extra ?? []),
    ...functions.map((fn) => fn.text),
  ]
  let body = parts.join('\n\n')
  for (const [from, to] of plan.replacements) body = body.replaceAll(from, to)
  // The original imports pruned to the names this module uses, then imports of moved names.
  const kept = importBlock.replace(pattern, (_whole, type, list, from) =>
    render(
      items(type, list).filter((item) => uses(body, local(item))),
      from,
    ),
  )
  const siblings = new Map()
  for (const [name, owner] of owners) {
    if (owner.specifier === specifier || !uses(body, name)) continue
    siblings.set(owner.specifier, [
      ...(siblings.get(owner.specifier) ?? []),
      owner.type ? `type ${name}` : name,
    ])
  }
  const added = [...siblings].map(([from, list]) => render(list, from)).join('')
  const preamble = module.preamble ? `${module.preamble}\n` : ''
  const text = `${kept}${added}${preamble}\n${body}\n`.replace(/\n{3,}/g, '\n\n')
  writeFileSync(module.file, text)
  // A body line is foreign unless it is a new signature, extra code, or an original line after undoing replacements.
  const allowed = new Set([
    ...functions.map((fn) => fn.signature.trim()),
    ...(module.extra ?? []).flatMap((code) => code.split('\n').map((line) => line.trim())),
  ])
  const foreign = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !allowed.has(line))
    .filter((line) => !originalLines.has(undo(line)) && !originalLines.has(undo(line).replace(/^export /, '')))
  console.log(`${module.file}: ${text.split('\n').length} lines, foreign ${foreign.length}`)
  for (const line of foreign) console.log(`  foreign: ${line}`)
}
```

Create `.tmp/s5a/metadata-split.json`:

```json
{
  "source": "apps/api/src/modules/metadata/metadata.service.ts",
  "className": "MetadataService",
  "modules": [
    {
      "file": "apps/api/src/modules/metadata/metadata.mapper.ts",
      "declarations": [
        "fieldSelection",
        "formSelection",
        "FormRow",
        { "name": "allowedValues", "as": "jsonStringArray" },
        { "name": "contract", "as": "formFieldContract" },
        "mapForm",
        "fieldInput"
      ],
      "extra": [
        "// The form field columns a validation contract reads.\nexport type FormFieldContractRow = Pick<\n  FormRow['formField_form'][number],\n  | 'code'\n  | 'label'\n  | 'dataType'\n  | 'isRequired'\n  | 'allowedValues'\n  | 'minimumValue'\n  | 'maximumValue'\n  | 'minimumDate'\n  | 'maximumDate'\n  | 'minimumLength'\n  | 'maximumLength'\n>",
        "// A published form payload cached under the fingerprint of its source rows.\nexport type CachedFormDefinition = { fingerprint: string; value: ReturnType<typeof mapForm> }"
      ],
      "extraNames": { "FormFieldContractRow": "type", "CachedFormDefinition": "type" }
    },
    {
      "file": "apps/api/src/modules/metadata/metadata.helpers.ts",
      "declarations": ["assertDefinition", "fieldData", "sameValues"],
      "members": [
        { "name": "assertDirectEntryForm" },
        { "name": "expectedDate" },
        { "name": "assertValues" }
      ]
    },
    {
      "file": "apps/api/src/modules/metadata/form-lookup.service.ts",
      "members": [
        { "name": "requireForm" },
        { "name": "findForm" },
        { "name": "requireLinks" },
        { "name": "requireSurveySubject" },
        { "name": "findSubmission" },
        { "name": "requireDraftSubmission" },
        { "name": "replaceResponses" }
      ]
    },
    {
      "file": "apps/api/src/modules/metadata/form-definitions.service.ts",
      "members": [
        {
          "name": "listForms",
          "callback": "listProjectForms",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string"
        },
        {
          "name": "getForm",
          "callback": "readFormDefinition",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, formId: string, cache: PublishedDefinitionCache<CachedFormDefinition>"
        },
        {
          "name": "createForm",
          "callback": "createDraftForm",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, input: CreateFormRequest"
        },
        {
          "name": "generateForm",
          "callback": "generateDraftForm",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, input: GenerateFormRequest, hasTemplate: boolean"
        },
        { "name": "insertDraft", "export": false },
        { "name": "currentDefinition", "export": false }
      ]
    },
    {
      "file": "apps/api/src/modules/metadata/form-versions.service.ts",
      "members": [
        {
          "name": "updateForm",
          "callback": "updateFormDefinition",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, formId: string, input: UpdateFormRequest, cache: PublishedDefinitionCache<CachedFormDefinition>"
        },
        {
          "name": "publishForm",
          "callback": "publishFormVersion",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, formId: string, input: FormVersionRequest, cache: PublishedDefinitionCache<CachedFormDefinition>"
        },
        {
          "name": "archiveForm",
          "callback": "archiveFormVersion",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, formId: string, input: FormVersionRequest, cache: PublishedDefinitionCache<CachedFormDefinition>"
        },
        {
          "name": "newVersion",
          "callback": "createNextFormVersion",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, formId: string"
        },
        { "name": "createVersion", "export": false }
      ]
    },
    {
      "file": "apps/api/src/modules/metadata/form-submissions.service.ts",
      "members": [
        {
          "name": "saveSubmission",
          "callback": "saveDraftSubmission",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, formId: string, input: SaveSubmissionRequest"
        },
        {
          "name": "updateSubmission",
          "callback": "updateDraftSubmission",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, formId: string, submissionId: string, input: UpdateSubmissionRequest"
        },
        {
          "name": "submitSubmission",
          "callback": "submitDraftSubmission",
          "params": "tx: Tx, actor: ApplicationIdentity, participants: Pick<ParticipantsService, 'promoteParticipation'>, projectId: string, formId: string, submissionId: string, input: SubmitSubmissionRequest"
        }
      ]
    },
    {
      "file": "apps/api/src/modules/metadata/form-submission-reads.service.ts",
      "members": [
        {
          "name": "validateValues",
          "callback": "validateFormValues",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, formId: string, values: unknown, mode: FormValidationMode"
        },
        {
          "name": "listSubmissions",
          "callback": "listOwnSubmissions",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, formId: string, query: ListSubmissionsQuery"
        },
        {
          "name": "getSubmission",
          "callback": "readSubmission",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, formId: string, submissionId: string"
        },
        {
          "name": "getSubmissionByClientId",
          "callback": "readSubmissionByClientId",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, formId: string, clientSubmissionId: string"
        },
        {
          "name": "validateSubmission",
          "callback": "validateStoredSubmission",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, formId: string, submissionId: string"
        }
      ]
    }
  ],
  "replacements": [
    ["this.publishedDefinitions.", "cache."],
    ["this.currentDefinition(", "currentDefinition("],
    ["this.findForm(", "findForm("],
    ["this.requireForm(", "requireForm("],
    ["this.insertDraft(", "insertDraft("],
    ["this.requireLinks(", "requireLinks("],
    ["this.createVersion(", "createVersion("],
    ["this.expectedDate(", "expectedDate("],
    ["this.assertDirectEntryForm(", "assertDirectEntryForm("],
    ["this.assertValues(", "assertValues("],
    ["this.requireSurveySubject(", "requireSurveySubject("],
    ["this.findSubmission(", "findSubmission("],
    ["this.requireDraftSubmission(", "requireDraftSubmission("],
    ["this.replaceResponses(", "replaceResponses("],
    ["this.participants.", "participants."],
    ["allowedValues(field.allowedValues)", "jsonStringArray(field.allowedValues)"],
    ["map(contract)", "map(formFieldContract)"],
    [
      "function formFieldContract(field: FormRow['formField_form'][number])",
      "function formFieldContract(field: FormFieldContractRow)"
    ]
  ]
}
```

```bash
node .tmp/s5a/split-service.mjs .tmp/s5a/metadata-split.json
```

Expected, exactly:

```text
apps/api/src/modules/metadata/metadata.mapper.ts: 137 lines, foreign 2
  foreign: export function jsonStringArray(value: Prisma.JsonValue | null) {
  foreign: export function formFieldContract(field: FormFieldContractRow): FormFieldValidationContract {
apps/api/src/modules/metadata/metadata.helpers.ts: 76 lines, foreign 0
apps/api/src/modules/metadata/form-lookup.service.ts: 165 lines, foreign 0
apps/api/src/modules/metadata/form-definitions.service.ts: 216 lines, foreign 0
apps/api/src/modules/metadata/form-versions.service.ts: 266 lines, foreign 0
apps/api/src/modules/metadata/form-submissions.service.ts: 201 lines, foreign 0
apps/api/src/modules/metadata/form-submission-reads.service.ts: 93 lines, foreign 0
```

The two foreign lines are the renamed declarations of ruling 9. Any other foreign line, or a thrown `Missing member` or `Missing declaration`, means the service differs from the one this plan was written against: stop and report.

- [ ] **Step 4: Replace the service with the facade**

Replace the whole of `apps/api/src/modules/metadata/metadata.service.ts` with (each method keeps its permission and wraps one call; `generateForm`, `createForm` and `updateForm` keep their checks before the transaction):

```ts
import { BadRequestException, Inject, Injectable } from '@nestjs/common'

import type {
  CreateFormRequest,
  FormValidationMode,
  FormVersionRequest,
  GenerateFormRequest,
  ListSubmissionsQuery,
  SaveSubmissionRequest,
  SubmitSubmissionRequest,
  UpdateFormRequest,
  UpdateSubmissionRequest,
} from '@pathways/shared'
import type { ApplicationIdentity } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { PrismaService } from '../../prisma/prisma.service'
import { ParticipantsService } from '../participants/participants.service'
import {
  createDraftForm,
  generateDraftForm,
  listProjectForms,
  readFormDefinition,
} from './form-definitions.service'
import {
  listOwnSubmissions,
  readSubmission,
  readSubmissionByClientId,
  validateFormValues,
  validateStoredSubmission,
} from './form-submission-reads.service'
import {
  saveDraftSubmission,
  submitDraftSubmission,
  updateDraftSubmission,
} from './form-submissions.service'
import { formTemplates } from './form-templates'
import {
  archiveFormVersion,
  createNextFormVersion,
  publishFormVersion,
  updateFormDefinition,
} from './form-versions.service'
import { assertDefinition } from './metadata.helpers'
import type { CachedFormDefinition } from './metadata.mapper'
import { PublishedDefinitionCache } from './published-definition-cache'

// Form definition and direct entry routes; each opens one authorized transaction and delegates to a form module.
@Injectable()
export class MetadataService {
  private readonly publishedDefinitions = new PublishedDefinitionCache<CachedFormDefinition>()
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ParticipantsService) private readonly participants: ParticipantsService,
  ) {}

  listForms(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'forms.read', (tx, actor) =>
      listProjectForms(tx, actor, projectId),
    )
  }

  getForm(identity: ApplicationIdentity, projectId: string, formId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'forms.read', (tx, actor) =>
      readFormDefinition(tx, actor, projectId, formId, this.publishedDefinitions),
    )
  }

  createForm(identity: ApplicationIdentity, projectId: string, input: CreateFormRequest) {
    assertDefinition(input)
    return withAuthorizedOperation(this.prisma, identity, 'forms.manage', (tx, actor) =>
      createDraftForm(tx, actor, projectId, input),
    )
  }

  /**
   * `forms.generate`: new version-1 draft from a server-owned template or an
   * existing form in the same scoped project. Exactly one source is allowed.
   */
  async generateForm(identity: ApplicationIdentity, projectId: string, input: GenerateFormRequest) {
    const hasTemplate = input.templateKey !== undefined
    const hasSource = input.sourceFormId !== undefined
    if (hasTemplate === hasSource)
      throw new BadRequestException('Provide exactly one of templateKey or sourceFormId.')
    if (hasTemplate && !Object.hasOwn(formTemplates, input.templateKey as string))
      throw new BadRequestException('Unknown form template.')
    return withAuthorizedOperation(this.prisma, identity, 'forms.generate', (tx, actor) =>
      generateDraftForm(tx, actor, projectId, input, hasTemplate),
    )
  }

  updateForm(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    input: UpdateFormRequest,
  ) {
    assertDefinition(input)
    return withAuthorizedOperation(this.prisma, identity, 'forms.manage', (tx, actor) =>
      updateFormDefinition(tx, actor, projectId, formId, input, this.publishedDefinitions),
    )
  }

  publishForm(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    input: FormVersionRequest,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'forms.publish', (tx, actor) =>
      publishFormVersion(tx, actor, projectId, formId, input, this.publishedDefinitions),
    )
  }

  archiveForm(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    input: FormVersionRequest,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'forms.archive', (tx, actor) =>
      archiveFormVersion(tx, actor, projectId, formId, input, this.publishedDefinitions),
    )
  }

  newVersion(identity: ApplicationIdentity, projectId: string, formId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'forms.manage', (tx, actor) =>
      createNextFormVersion(tx, actor, projectId, formId),
    )
  }

  validateValues(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    values: unknown,
    mode: FormValidationMode = 'final',
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'submissions.write', (tx, actor) =>
      validateFormValues(tx, actor, projectId, formId, values, mode),
    )
  }

  saveSubmission(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    input: SaveSubmissionRequest,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'submissions.write', (tx, actor) =>
      saveDraftSubmission(tx, actor, projectId, formId, input),
    )
  }

  listSubmissions(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    query: ListSubmissionsQuery,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'submissions.write', (tx, actor) =>
      listOwnSubmissions(tx, actor, projectId, formId, query),
    )
  }

  updateSubmission(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    submissionId: string,
    input: UpdateSubmissionRequest,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'submissions.write', (tx, actor) =>
      updateDraftSubmission(tx, actor, projectId, formId, submissionId, input),
    )
  }

  getSubmission(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    submissionId: string,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'submissions.write', (tx, actor) =>
      readSubmission(tx, actor, projectId, formId, submissionId),
    )
  }

  getSubmissionByClientId(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    clientSubmissionId: string,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'submissions.write', (tx, actor) =>
      readSubmissionByClientId(tx, actor, projectId, formId, clientSubmissionId),
    )
  }

  validateSubmission(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    submissionId: string,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'submissions.write', (tx, actor) =>
      validateStoredSubmission(tx, actor, projectId, formId, submissionId),
    )
  }

  submitSubmission(
    identity: ApplicationIdentity,
    projectId: string,
    formId: string,
    submissionId: string,
    input: SubmitSubmissionRequest,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'submissions.write', (tx, actor) =>
      submitDraftSubmission(tx, actor, this.participants, projectId, formId, submissionId, input),
    )
  }
}
```

- [ ] **Step 5: Run the tests and commit**

```bash
git add -N apps/api/src/modules/metadata
pnpm exec biome check --write apps/api/src/modules/metadata
wc -l apps/api/src/modules/metadata/*.ts | grep -v test
pnpm --filter @pathways/api exec vitest run src/modules/metadata src/app-module-wiring.test.ts src/common
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api/src/modules/metadata
git commit -m "refactor(api): split the metadata service into form modules that take the caller's tx

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: Biome reformats the generated files and fixes their type-only imports; `wc` shows `metadata.service.ts` 221, `metadata.mapper.ts` 138, `metadata.helpers.ts` 78, `form-lookup.service.ts` 204, `form-definitions.service.ts` 240, `form-versions.service.ts` 301, `form-submissions.service.ts` 232, `form-submission-reads.service.ts` 127; every metadata test passes unchanged (the published-definition cache test included, Review Focus 5); api = `B_api + 15` (mapper test 2).

- [ ] **Step 6: Pin the form export project lookup (ruling 13)**

In `apps/api/src/modules/metadata/form-definition-export.service.test.ts`, directly before the test `fails whole when the definition exceeds the artifact bounds`, add:

```ts
  it('reads an upper-case project id as the stored id and refuses a malformed one before any query', async () => {
    await service.export(state.actor, projectId.toUpperCase(), formId, 'CSV')
    expect(tx.project.findFirst).toHaveBeenCalledWith({
      where: { AND: [expect.anything(), { id: projectId }] },
      select: { id: true },
    })
    expect(tx.digitalForm.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ projectId }) }),
    )
    vi.clearAllMocks()
    await expect(service.export(state.actor, 'not-a-uuid', formId, 'CSV')).rejects.toThrow(
      'Project unavailable.',
    )
    expect(tx.project.findFirst).not.toHaveBeenCalled()
  })
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/metadata/form-definition-export.service.test.ts`
Expected: PASS, 17 tests, against the inline lookup. This is a characterization case: it pins what the shared helper must keep (`vi.clearAllMocks` clears calls only, so the scoped project mock of `beforeEach` still applies).

- [ ] **Step 7: Read the export project through requireScopedProject and commit**

In `apps/api/src/modules/metadata/form-definition-export.service.ts`:
- Replace `import { projectScope } from '../../common/authz/project-scope'` with `import { requireScopedProject } from '../../common/authz/scoped-project'`.
- In `readForm`, replace these six lines

```ts
    if (!UUID_PATTERN.test(projectId)) throw new NotFoundException('Project unavailable.')
    const project = await tx.project.findFirst({
      where: { AND: [projectScope(actor), { id: projectId.toLowerCase() }] },
      select: { id: true },
    })
    if (!project) throw new NotFoundException('Project unavailable.')
```

with

```ts
    const scopedProjectId = await requireScopedProject(tx, actor, projectId)
```

- In the `tx.digitalForm.findFirst` call of `readForm`, replace `        projectId: project.id,` with `        projectId: scopedProjectId,`.

`UUID_PATTERN` and `NotFoundException` stay imported: the form id check still uses them.

```bash
git grep -nE "projectScope|tx\.project\.findFirst" -- apps/api/src/modules/metadata/form-definition-export.service.ts
pnpm exec biome check --write apps/api/src/modules/metadata/form-definition-export.service.ts apps/api/src/modules/metadata/form-definition-export.service.test.ts
pnpm --filter @pathways/api exec vitest run src/modules/metadata/form-definition-export.service.test.ts src/modules/metadata/form-definition-export.audit.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add apps/api/src/modules/metadata/form-definition-export.service.ts apps/api/src/modules/metadata/form-definition-export.service.test.ts
git commit -m "refactor(api): read the form export project through requireScopedProject

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the grep prints nothing; 21 tests pass (17 export service, 4 export audit), including the cross-project denial and the organization scoping cases; `form-definition-export.service.ts` is 164 lines; api = `B_api + 16`.

---

### Task 6: Split the imports service

**Files:**
- Move: `apps/api/src/modules/imports/p07-w10-finalization-fault.ts` -> `upload-finalization-fault.ts`, its test likewise, `imports.f6-gates.test.ts` -> `imports.review-flow.test.ts` (commit 1, with three import specifiers)
- Create: `apps/api/src/modules/imports/imports.helpers.ts`, `imports.mapper.ts`, `import-batches.service.ts`, `automatic-mapping.service.ts`, `import-mapping.service.ts`, `import-validation.service.ts`, `import-upload.service.ts`, `import-promotion-context.service.ts`, `import-row-promotion.service.ts`, `import-promotion.service.ts`, `import-claims.service.ts` (generated)
- Modify: `apps/api/src/modules/imports/imports.service.ts` (full content below)

**Interfaces:**
- Consumes: `formFieldContract`, `jsonStringArray` from `../metadata/metadata.mapper` (Task 5); S4 `BeneficiaryRegistrationService` and `type RegistrationImportForm` from `../beneficiaries/beneficiary-registration.service`, `ParticipantsService` from `../participants/participants.service`.
- Produces: from `imports.helpers.ts`, `type UploadedImportFile` (re-exported by `imports.service.ts`, so the controller and tests keep their import), `checksum`, `stableJson`, `storedValueMap`, `fileMetadata`, `safeSourceColumns`, `safeRawData`; from `imports.mapper.ts`, `batchSelection`, `type BatchRow`, `fieldSelection`, `type FieldRow`, `mapBatch`; from `import-promotion-context.service.ts`, `type PromotionHandlers` (`{ registration: Pick<BeneficiaryRegistrationService, 'promoteRegistration' | 'readRegistrationForm'>; participants: Pick<ParticipantsService, 'promoteParticipation'> }`), `type PromotionContext`, `type PromotionKind`, `loadPromotionContext`, `loadFormFields`, `loadParticipationForm`; from `import-claims.service.ts`, `type ProcessingClaim`, `claimBatchRows`, `releaseClaimedRow`, `finishBatchClaim`, `reconcileBatch`; the route functions named in the facade below, each taking `tx: Tx, actor: ApplicationIdentity` first. `ImportsService` keeps its constructor parameters (S4's order, types and tokens), every method name and every transaction option; its third field is renamed `registration` (ruling 10).

- [ ] **Step 1: Rename the phase-coded files and commit**

```bash
git mv apps/api/src/modules/imports/p07-w10-finalization-fault.ts apps/api/src/modules/imports/upload-finalization-fault.ts
git mv apps/api/src/modules/imports/p07-w10-finalization-fault.test.ts apps/api/src/modules/imports/upload-finalization-fault.test.ts
git mv apps/api/src/modules/imports/imports.f6-gates.test.ts apps/api/src/modules/imports/imports.review-flow.test.ts
sed -i "s#'./p07-w10-finalization-fault'#'./upload-finalization-fault'#" apps/api/src/modules/imports/imports.service.ts apps/api/src/modules/imports/imports.service.test.ts apps/api/src/modules/imports/upload-finalization-fault.test.ts
git grep -n "p07-w10" -- apps
pnpm --filter @pathways/api exec vitest run src/modules/imports
pnpm typecheck
git checkout -- apps/web/next-env.d.ts
git add -A apps/api/src/modules/imports
git status --short apps/api/src/modules/imports | grep "^R"
git commit -m "refactor(api): name the upload finalization fault and the import gate test after their purpose

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the grep prints nothing; tests and typecheck pass; three `R` renames.

- [ ] **Step 2: Check the duplicate field contract mapping**

Create `.tmp/s5a/same-function.mjs`:

```js
// Fails unless two top-level functions have the same body text once the given renames are applied to the first.
// Usage: node same-function.mjs <fileA> <nameA> <fileB> <nameB> [from=to ...]
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const [fileA, nameA, fileB, nameB, ...pairs] = process.argv.slice(2)
const body = (file, name) => {
  const text = readFileSync(file, 'utf8')
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const found = source.statements.find(
    (statement) => ts.isFunctionDeclaration(statement) && statement.name?.getText() === name,
  )
  if (!found) throw new Error(`${file}: no function ${name}`)
  return found.body.getText()
}
const renamed = pairs
  .map((pair) => pair.split('='))
  .reduce((text, [from, to]) => text.replaceAll(from, to), body(fileA, nameA))
const same = renamed === body(fileB, nameB)
console.log(same ? `same body: ${nameA} and ${nameB}` : `different:\n${renamed}\n---\n${body(fileB, nameB)}`)
process.exitCode = same ? 0 : 1
```

```bash
node .tmp/s5a/same-function.mjs apps/api/src/modules/imports/imports.service.ts contract apps/api/src/modules/metadata/metadata.mapper.ts formFieldContract jsonStrings=jsonStringArray
node .tmp/s5a/same-function.mjs apps/api/src/modules/imports/imports.service.ts jsonStrings apps/api/src/modules/metadata/metadata.mapper.ts jsonStringArray
```

Expected: `same body: contract and formFieldContract` and `same body: jsonStrings and jsonStringArray`. A difference stops the task: the imports copy cannot be replaced (ruling 9).

- [ ] **Step 3: Create the split plan and run it**

Create `.tmp/s5a/imports-split.json` (the imports `contract` and `jsonStrings` are not moved; their uses are replaced with the Task 5 mapper functions, imported from `../metadata/metadata.mapper`):

```json
{
  "source": "apps/api/src/modules/imports/imports.service.ts",
  "className": "ImportsService",
  "modules": [
    {
      "file": "apps/api/src/modules/imports/imports.helpers.ts",
      "declarations": [
        "UploadedImportFile",
        "fileTypes",
        "storedValueMap",
        "checksum",
        "stableJson",
        "fileMetadata",
        "sourceColumnKey",
        "safeSourceColumns",
        "safeRawData"
      ],
      "private": [
        "fileTypes",
        "sourceColumnKey"
      ]
    },
    {
      "file": "apps/api/src/modules/imports/imports.mapper.ts",
      "declarations": [
        "batchSelection",
        "BatchRow",
        "fieldSelection",
        "FieldRow",
        "mapBatch"
      ]
    },
    {
      "file": "apps/api/src/modules/imports/import-batches.service.ts",
      "members": [
        {
          "name": "listBatches",
          "callback": "listProjectBatches",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string"
        },
        {
          "name": "getBatch",
          "callback": "readBatchDetail",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, batchId: string"
        },
        {
          "name": "listRows",
          "callback": "readBatchRows",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, batchId: string, query: ImportRowsQuery"
        },
        {
          "name": "mapStoredBatch"
        },
        {
          "name": "lockBatch"
        },
        {
          "name": "requireBatch"
        },
        {
          "name": "requireBatchWithHeaders"
        }
      ]
    },
    {
      "file": "apps/api/src/modules/imports/automatic-mapping.service.ts",
      "members": [
        {
          "name": "automaticMapping",
          "callback": "recordAutomaticMapping",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, batchId: string, input: AutomaticImportMappingRequest"
        },
        {
          "name": "smartMappingDecisions",
          "export": false
        }
      ]
    },
    {
      "file": "apps/api/src/modules/imports/import-mapping.service.ts",
      "members": [
        {
          "name": "saveMapping",
          "callback": "saveBatchMapping",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, batchId: string, input: SaveImportMappingRequest"
        }
      ]
    },
    {
      "file": "apps/api/src/modules/imports/import-validation.service.ts",
      "members": [
        {
          "name": "validate",
          "callback": "validateBatchRows",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, batchId: string, input: ValidateImportRequest"
        }
      ]
    },
    {
      "file": "apps/api/src/modules/imports/import-upload.service.ts",
      "members": [
        {
          "name": "resumeUpload",
          "callback": "readUploadRecovery",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, batchId: string"
        },
        {
          "name": "reserveUpload",
          "callback": "reserveBatchUpload",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, input: UploadImportRequest, metadata: ReturnType<typeof fileMetadata>, uploadsBucket: string"
        },
        {
          "name": "finalizeUpload",
          "callback": "stageUploadedRows",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, batchId: string, parsed: Awaited<ReturnType<typeof parseSecureImport>>, fault: W10FinalizationFault"
        },
        {
          "name": "markUploadFailure",
          "callback": "recordUploadFailure",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, batchId: string, failureCode: string, stored: boolean"
        },
        {
          "name": "markRecoveryRequired",
          "callback": "recordUploadRecoveryRequired",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, batchId: string"
        }
      ]
    },
    {
      "file": "apps/api/src/modules/imports/import-promotion-context.service.ts",
      "declarations": [
        "PromotionBatch",
        "ParticipationForm",
        "PromotionContext",
        "PromotionKind"
      ],
      "members": [
        {
          "name": "loadPromotionContext",
          "params": "tx: Tx, actor: ApplicationIdentity, promotion: PromotionHandlers, batch: { id: string; projectId: string; formId: string; formVersion: number; mappingRevision: number; validationRevision: number; reviewedById: string | null; form: { formType: string } }"
        },
        {
          "name": "loadFormFields"
        },
        {
          "name": "loadParticipationForm"
        }
      ],
      "extra": [
        "// The registration and participation services a row promotion calls.\nexport interface PromotionHandlers {\n  registration: Pick<BeneficiaryRegistrationService, 'promoteRegistration' | 'readRegistrationForm'>\n  participants: Pick<ParticipantsService, 'promoteParticipation'>\n}"
      ],
      "extraNames": {
        "PromotionHandlers": "type"
      }
    },
    {
      "file": "apps/api/src/modules/imports/import-row-promotion.service.ts",
      "members": [
        {
          "name": "promoteRegistrationInTx",
          "params": "tx: Tx, actor: ApplicationIdentity, promotion: PromotionHandlers, context: PromotionContext, rowId: string, claimId: string"
        },
        {
          "name": "promoteParticipationInTx",
          "params": "tx: Tx, actor: ApplicationIdentity, promotion: PromotionHandlers, context: PromotionContext, rowId: string, claimId: string"
        },
        {
          "name": "promoteGenericInTx"
        }
      ]
    },
    {
      "file": "apps/api/src/modules/imports/import-promotion.service.ts",
      "members": [
        {
          "name": "promoteChunk",
          "callback": "promoteChunkRows",
          "params": "tx: Tx, actor: ApplicationIdentity, promotion: PromotionHandlers, projectId: string, claimId: string, validationRevision: number, kind: PromotionKind, context: PromotionContext, rowIds: string[]",
          "comments": true
        },
        {
          "name": "promoteRegistrationRow",
          "callback": "promoteClaimedRegistrationRow",
          "params": "tx: Tx, actor: ApplicationIdentity, promotion: PromotionHandlers, projectId: string, batchId: string, rowId: string, claimId: string, validationRevision: number"
        },
        {
          "name": "promoteParticipationRow",
          "callback": "promoteClaimedParticipationRow",
          "params": "tx: Tx, actor: ApplicationIdentity, promotion: PromotionHandlers, projectId: string, batchId: string, rowId: string, claimId: string, validationRevision: number"
        },
        {
          "name": "promoteGenericRow",
          "callback": "promoteClaimedGenericRow",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, batchId: string, rowId: string, claimId: string, validationRevision: number"
        }
      ]
    },
    {
      "file": "apps/api/src/modules/imports/import-claims.service.ts",
      "declarations": [
        "PROCESSING_CLAIM_ROWS",
        "ProcessingClaim"
      ],
      "private": [
        "PROCESSING_CLAIM_ROWS"
      ],
      "members": [
        {
          "name": "claimRows",
          "callback": "claimBatchRows",
          "params": "tx: Tx, actor: ApplicationIdentity, promotion: PromotionHandlers, projectId: string, batchId: string, input: ProcessImportRequest",
          "returns": "Promise<ProcessingClaim>"
        },
        {
          "name": "releaseFailedRow",
          "callback": "releaseClaimedRow",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, batchId: string, rowId: string, claimId: string"
        },
        {
          "name": "finishClaim",
          "callback": "finishBatchClaim",
          "params": "tx: Tx, actor: ApplicationIdentity, projectId: string, batchId: string, claimId: string"
        },
        {
          "name": "reconcileBatch"
        }
      ]
    }
  ],
  "replacements": [
    [
      "this.promoteRegistrationInTx(\n          tx,\n          actor,\n",
      "promoteRegistrationInTx(\n          tx,\n          actor,\n          promotion,\n"
    ],
    [
      "this.promoteParticipationInTx(\n          tx,\n          actor,\n",
      "promoteParticipationInTx(\n          tx,\n          actor,\n          promotion,\n"
    ],
    [
      "this.lockBatch(",
      "lockBatch("
    ],
    [
      "this.requireBatchWithHeaders(",
      "requireBatchWithHeaders("
    ],
    [
      "this.requireBatch(",
      "requireBatch("
    ],
    [
      "this.mapStoredBatch(",
      "mapStoredBatch("
    ],
    [
      "this.smartMappingDecisions(",
      "smartMappingDecisions("
    ],
    [
      "this.reconcileBatch(",
      "reconcileBatch("
    ],
    [
      "this.loadPromotionContext(tx, actor, batch)",
      "loadPromotionContext(tx, actor, promotion, batch)"
    ],
    [
      "this.loadFormFields(",
      "loadFormFields("
    ],
    [
      "this.loadParticipationForm(",
      "loadParticipationForm("
    ],
    [
      "this.promoteRegistrationInTx(tx, actor, ",
      "promoteRegistrationInTx(tx, actor, promotion, "
    ],
    [
      "this.promoteParticipationInTx(tx, actor, ",
      "promoteParticipationInTx(tx, actor, promotion, "
    ],
    [
      "this.promoteGenericInTx(",
      "promoteGenericInTx("
    ],
    [
      "this.beneficiaries.",
      "promotion.registration."
    ],
    [
      "this.participants.",
      "promotion.participants."
    ],
    [
      "this.env.UPLOADS_BUCKET",
      "uploadsBucket"
    ],
    [
      "this.w10FinalizationFault.consume(",
      "fault.consume("
    ],
    [
      "map(contract)",
      "map(formFieldContract)"
    ],
    [
      "jsonStrings(field.allowedValues)",
      "jsonStringArray(field.allowedValues)"
    ]
  ],
  "externals": {
    "formFieldContract": {
      "specifier": "../metadata/metadata.mapper",
      "type": false
    },
    "jsonStringArray": {
      "specifier": "../metadata/metadata.mapper",
      "type": false
    }
  }
}
```

```bash
node .tmp/s5a/split-service.mjs .tmp/s5a/imports-split.json
```

Expected, exactly:

```text
apps/api/src/modules/imports/imports.helpers.ts: 125 lines, foreign 0
apps/api/src/modules/imports/imports.mapper.ts: 89 lines, foreign 0
apps/api/src/modules/imports/import-batches.service.ts: 135 lines, foreign 0
apps/api/src/modules/imports/automatic-mapping.service.ts: 128 lines, foreign 0
apps/api/src/modules/imports/import-mapping.service.ts: 150 lines, foreign 0
apps/api/src/modules/imports/import-validation.service.ts: 187 lines, foreign 0
apps/api/src/modules/imports/import-upload.service.ts: 199 lines, foreign 0
apps/api/src/modules/imports/import-promotion-context.service.ts: 98 lines, foreign 0
apps/api/src/modules/imports/import-row-promotion.service.ts: 296 lines, foreign 0
apps/api/src/modules/imports/import-promotion.service.ts: 122 lines, foreign 4
  foreign: await promoteRegistrationInTx(
  foreign: promotion,
  foreign: await promoteParticipationInTx(
  foreign: promotion,
apps/api/src/modules/imports/import-claims.service.ts: 217 lines, foreign 0
```

The four foreign lines are the two multi-line calls that gain the `promotion` argument (the first two replacements of the plan). Any other output means the service differs from the one this plan was written against: stop and report.

- [ ] **Step 4: Replace the service with the facade**

Replace the whole of `apps/api/src/modules/imports/imports.service.ts` with (the upload and processing loops and the comments in them are the original text; every other method wraps one call with its original permission and options):

```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common'

import { readApiEnv } from '@pathways/config'
import {
  IMPORT_ENGINEERING_LIMITS,
  ImportParseError,
  parseSecureImport,
} from '@pathways/imports/server'
import type {
  AutomaticImportMappingRequest,
  ImportRowsQuery,
  ProcessImportRequest,
  SaveImportMappingRequest,
  UploadImportRequest,
  ValidateImportRequest,
} from '@pathways/shared'
import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'
import { withAuthorizedOperation } from '../../common/authz/authorized-operation'
import { PrismaService } from '../../prisma/prisma.service'
import { BeneficiaryRegistrationService } from '../beneficiaries/beneficiary-registration.service'
import { ParticipantsService } from '../participants/participants.service'
import { StorageService } from '../storage/storage.service'
import { recordAutomaticMapping } from './automatic-mapping.service'
import { listProjectBatches, readBatchDetail, readBatchRows } from './import-batches.service'
import {
  type ProcessingClaim,
  claimBatchRows,
  finishBatchClaim,
  releaseClaimedRow,
} from './import-claims.service'
import { saveBatchMapping } from './import-mapping.service'
import type {
  PromotionContext,
  PromotionHandlers,
  PromotionKind,
} from './import-promotion-context.service'
import {
  promoteChunkRows,
  promoteClaimedGenericRow,
  promoteClaimedParticipationRow,
  promoteClaimedRegistrationRow,
} from './import-promotion.service'
import {
  readUploadRecovery,
  recordUploadFailure,
  recordUploadRecoveryRequired,
  reserveBatchUpload,
  stageUploadedRows,
} from './import-upload.service'
import { validateBatchRows } from './import-validation.service'
import { type UploadedImportFile, checksum, fileMetadata } from './imports.helpers'
import { W10FinalizationFault } from './upload-finalization-fault'

export type { UploadedImportFile } from './imports.helpers'

const REGISTRATION_IMPORT_TRANSACTION_TIMEOUT_MS = 20_000
const PARTICIPATION_IMPORT_TRANSACTION_TIMEOUT_MS = 20_000
// One chunk promotes at most processingCheckpointRows rows. The verified-transaction
// ceiling is 30 seconds; a 25-row registration chunk stays well inside it.
const PROMOTION_CHUNK_TRANSACTION_TIMEOUT_MS = 30_000
const STAGED_ROWS_TRANSACTION_TIMEOUT_MS = 30_000

// Import batch routes; each step runs in one authorized transaction whose tx the import modules take.
@Injectable()
export class ImportsService {
  private readonly w10FinalizationFault = new W10FinalizationFault()
  private readonly env = readApiEnv(process.env)

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(BeneficiaryRegistrationService)
    private readonly registration: BeneficiaryRegistrationService,
    @Inject(ParticipantsService) private readonly participants: ParticipantsService,
  ) {}

  // The domain services a row promotion calls, read when a transaction starts.
  private get promotion(): PromotionHandlers {
    return { registration: this.registration, participants: this.participants }
  }

  listBatches(identity: ApplicationIdentity, projectId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.read', (tx, actor) =>
      listProjectBatches(tx, actor, projectId),
    )
  }

  getBatch(identity: ApplicationIdentity, projectId: string, batchId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.read', (tx, actor) =>
      readBatchDetail(tx, actor, projectId, batchId),
    )
  }

  automaticMapping(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    input: AutomaticImportMappingRequest,
  ) {
    if (
      !UUID_PATTERN.test(projectId) ||
      !UUID_PATTERN.test(batchId) ||
      !input ||
      Object.keys(input).length !== 1 ||
      !Object.hasOwn(input, 'expectedMappingRevision') ||
      (input.expectedMappingRevision !== 0 && input.expectedMappingRevision !== 1)
    ) {
      throw new BadRequestException('Invalid automatic mapping request.')
    }
    return withAuthorizedOperation(this.prisma, identity, 'imports.upload', (tx, actor) =>
      recordAutomaticMapping(tx, actor, projectId, batchId, input),
    )
  }

  listRows(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    query: ImportRowsQuery,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.read', (tx, actor) =>
      readBatchRows(tx, actor, projectId, batchId, query),
    )
  }

  async upload(
    identity: ApplicationIdentity,
    projectId: string,
    input: UploadImportRequest,
    file?: UploadedImportFile,
  ) {
    if (!file) throw new BadRequestException('A source file is required.')
    const metadata = fileMetadata(file)
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException('Private upload storage is not configured.')
    }
    const reservation = await this.reserveUpload(identity, projectId, input, metadata)
    if (!reservation.requiresFinalization) {
      return this.getBatch(identity, projectId, reservation.batchId)
    }

    let stored = false
    try {
      await this.storage.uploadPrivateFile(
        reservation.storageBucket,
        reservation.storageObjectKey,
        file.buffer,
        file.mimetype,
      )
      stored = true
    } catch {
      try {
        const existing = await this.storage.downloadPrivateFile(
          reservation.storageBucket,
          reservation.storageObjectKey,
        )
        if (checksum(existing) !== metadata.checksum) throw new Error('Stored checksum mismatch.')
        stored = true
      } catch {
        await this.markUploadFailure(
          identity,
          projectId,
          reservation.batchId,
          'STORAGE_WRITE_FAILED',
        )
        throw new ServiceUnavailableException('The private source file could not be stored.')
      }
    }

    let parsed: Awaited<ReturnType<typeof parseSecureImport>>
    try {
      parsed = await parseSecureImport(file.buffer, metadata.type)
    } catch (error) {
      const failureCode =
        error instanceof ImportParseError ? error.code.slice(0, 64) : 'PARSER_REJECTED_INPUT'
      await this.markUploadFailure(identity, projectId, reservation.batchId, failureCode, stored)
      if (error instanceof ImportParseError) {
        throw new BadRequestException({ message: error.message, code: error.code })
      }
      throw new BadRequestException('The source file could not be parsed safely.')
    }

    try {
      return await this.finalizeUpload(identity, projectId, reservation.batchId, parsed)
    } catch (error) {
      const recoveryRecorded = await this.markRecoveryRequired(
        identity,
        projectId,
        reservation.batchId,
      )
      if (
        error instanceof HttpException &&
        !(error instanceof ForbiddenException && recoveryRecorded)
      ) {
        throw error
      }
      throw new ServiceUnavailableException(
        'The file is stored privately, but database finalization must be retried.',
      )
    }
  }

  async resumeUpload(identity: ApplicationIdentity, projectId: string, batchId: string) {
    const reservation = await withAuthorizedOperation(
      this.prisma,
      identity,
      'imports.upload',
      (tx, actor) => readUploadRecovery(tx, actor, projectId, batchId),
    )
    if (reservation.complete) return this.getBatch(identity, projectId, reservation.batchId)
    let source: Buffer
    try {
      source = await this.storage.downloadPrivateFile(
        reservation.storageBucket,
        reservation.storageObjectKey,
      )
    } catch {
      throw new ServiceUnavailableException(
        'The private source object is unavailable for recovery.',
      )
    }
    if (checksum(source) !== reservation.sourceChecksum) {
      await this.markUploadFailure(identity, projectId, batchId, 'STORAGE_CHECKSUM_MISMATCH')
      throw new ConflictException('The stored source checksum does not match its reservation.')
    }
    const parsed = await parseSecureImport(source, reservation.fileType)
    return this.finalizeUpload(identity, projectId, batchId, parsed)
  }

  saveMapping(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    input: SaveImportMappingRequest,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.review', (tx, actor) =>
      saveBatchMapping(tx, actor, projectId, batchId, input),
    )
  }

  validate(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    input: ValidateImportRequest,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.validate', (tx, actor) =>
      validateBatchRows(tx, actor, projectId, batchId, input),
    )
  }

  async process(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    input: ProcessImportRequest,
  ) {
    const claim = await this.claimRows(identity, projectId, batchId, input)
    if (claim.complete) return this.getBatch(identity, projectId, batchId)
    const kind: PromotionKind = claim.registrationHandler
      ? 'REGISTRATION'
      : claim.participationHandler
        ? 'PARTICIPATION'
        : 'GENERIC'
    const chunkSize = IMPORT_ENGINEERING_LIMITS.processingCheckpointRows
    for (let offset = 0; offset < claim.rowIds.length; offset += chunkSize) {
      const chunk = claim.rowIds.slice(offset, offset + chunkSize)
      if (claim.context) {
        try {
          await this.promoteChunk(
            identity,
            projectId,
            claim.claimId,
            input.expectedValidationRevision,
            kind,
            claim.context,
            chunk,
          )
          continue
        } catch {
          // The chunk rolled back as a unit. Rerun its rows on the single-row path,
          // which keeps the per-row release, retry and ForbiddenException behaviour.
        }
      }
      await this.promoteRowsIndividually(identity, projectId, batchId, claim, chunk, input)
    }
    return this.finishClaim(identity, projectId, batchId, claim.claimId)
  }

  private async promoteRowsIndividually(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    claim: ProcessingClaim,
    rowIds: string[],
    input: ProcessImportRequest,
  ) {
    for (const rowId of rowIds) {
      try {
        if (claim.registrationHandler) {
          await this.promoteRegistrationRow(
            identity,
            projectId,
            batchId,
            rowId,
            claim.claimId,
            input.expectedValidationRevision,
          )
        } else if (claim.participationHandler) {
          await this.promoteParticipationRow(
            identity,
            projectId,
            batchId,
            rowId,
            claim.claimId,
            input.expectedValidationRevision,
          )
        } else {
          await this.promoteGenericRow(
            identity,
            projectId,
            batchId,
            rowId,
            claim.claimId,
            input.expectedValidationRevision,
          )
        }
      } catch (error) {
        if (error instanceof ForbiddenException) throw error
        await this.releaseFailedRow(identity, projectId, batchId, rowId, claim.claimId).catch(
          () => undefined,
        )
      }
    }
  }

  private promoteChunk(
    identity: ApplicationIdentity,
    projectId: string,
    claimId: string,
    validationRevision: number,
    kind: PromotionKind,
    context: PromotionContext,
    rowIds: string[],
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'imports.process',
      (tx, actor) =>
        promoteChunkRows(
          tx,
          actor,
          this.promotion,
          projectId,
          claimId,
          validationRevision,
          kind,
          context,
          rowIds,
        ),
      { transactionTimeoutMs: PROMOTION_CHUNK_TRANSACTION_TIMEOUT_MS },
    )
  }

  private reserveUpload(
    identity: ApplicationIdentity,
    projectId: string,
    input: UploadImportRequest,
    metadata: ReturnType<typeof fileMetadata>,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.upload', (tx, actor) =>
      reserveBatchUpload(tx, actor, projectId, input, metadata, this.env.UPLOADS_BUCKET),
    )
  }

  private finalizeUpload(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    parsed: Awaited<ReturnType<typeof parseSecureImport>>,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'imports.upload',
      (tx, actor) =>
        stageUploadedRows(tx, actor, projectId, batchId, parsed, this.w10FinalizationFault),
      { transactionTimeoutMs: STAGED_ROWS_TRANSACTION_TIMEOUT_MS },
    )
  }

  private markUploadFailure(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    failureCode: string,
    stored = false,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.upload', (tx, actor) =>
      recordUploadFailure(tx, actor, projectId, batchId, failureCode, stored),
    )
  }

  private markRecoveryRequired(identity: ApplicationIdentity, projectId: string, batchId: string) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.upload', (tx, actor) =>
      recordUploadRecoveryRequired(tx, actor, projectId, batchId),
    ).catch(() => false)
  }

  private claimRows(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    input: ProcessImportRequest,
  ): Promise<ProcessingClaim> {
    return withAuthorizedOperation(this.prisma, identity, 'imports.process', (tx, actor) =>
      claimBatchRows(tx, actor, this.promotion, projectId, batchId, input),
    )
  }

  private promoteRegistrationRow(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    rowId: string,
    claimId: string,
    validationRevision: number,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'imports.process',
      (tx, actor) =>
        promoteClaimedRegistrationRow(
          tx,
          actor,
          this.promotion,
          projectId,
          batchId,
          rowId,
          claimId,
          validationRevision,
        ),
      { transactionTimeoutMs: REGISTRATION_IMPORT_TRANSACTION_TIMEOUT_MS },
    )
  }

  private promoteParticipationRow(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    rowId: string,
    claimId: string,
    validationRevision: number,
  ) {
    return withAuthorizedOperation(
      this.prisma,
      identity,
      'imports.process',
      (tx, actor) =>
        promoteClaimedParticipationRow(
          tx,
          actor,
          this.promotion,
          projectId,
          batchId,
          rowId,
          claimId,
          validationRevision,
        ),
      { transactionTimeoutMs: PARTICIPATION_IMPORT_TRANSACTION_TIMEOUT_MS },
    )
  }

  private promoteGenericRow(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    rowId: string,
    claimId: string,
    validationRevision: number,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.process', (tx, actor) =>
      promoteClaimedGenericRow(tx, actor, projectId, batchId, rowId, claimId, validationRevision),
    )
  }

  private releaseFailedRow(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    rowId: string,
    claimId: string,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.process', (tx, actor) =>
      releaseClaimedRow(tx, actor, projectId, batchId, rowId, claimId),
    )
  }

  private finishClaim(
    identity: ApplicationIdentity,
    projectId: string,
    batchId: string,
    claimId: string,
  ) {
    return withAuthorizedOperation(this.prisma, identity, 'imports.process', (tx, actor) =>
      finishBatchClaim(tx, actor, projectId, batchId, claimId),
    )
  }
}
```

- [ ] **Step 5: Run the tests and commit**

```bash
git add -N apps/api/src/modules/imports
pnpm exec biome check --write apps/api/src/modules/imports
wc -l apps/api/src/modules/imports/*.ts | grep -v test
git grep -nE "function (contract|jsonStrings)\b" -- apps/api/src/modules/imports
pnpm --filter @pathways/api exec vitest run src/modules/imports src/app-module-wiring.test.ts src/common
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api/src/modules/imports
git commit -m "refactor(api): split the imports service into batch, mapping, validation, upload and promotion modules

The field contract mapping now has one owner in metadata.mapper.ts.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `wc` shows `imports.service.ts` 519 (ruling 8), `imports.helpers.ts` 128, `imports.mapper.ts` 88, `import-batches.service.ts` 165, `automatic-mapping.service.ts` 147, `import-mapping.service.ts` 157, `import-validation.service.ts` 197, `import-upload.service.ts` 237, `import-promotion-context.service.ts` 114, `import-row-promotion.service.ts` 320, `import-promotion.service.ts` 165, `import-claims.service.ts` 236; the grep prints nothing; every imports test passes unchanged, including the spies on the seven private wrappers and the transaction timeout assertions (Review Focus 4); `git grep -nE "(this|promotion)[.]beneficiaries|readonly beneficiaries" -- apps/api/src/modules/imports` prints nothing; api = `B_api + 16`.

---

### Task 7: Split smart-match

**Files:**
- Test: `packages/imports/src/package-exports.test.ts`
- Create: `packages/imports/src/mappers/smart-match-rules.ts`, `smart-match-names.ts`, `smart-match-values.ts` (generated)
- Modify: `packages/imports/src/mappers/smart-match.ts` (generated: the matcher and the public re-exports)

**Interfaces:**
- Produces: `@pathways/imports` and `@pathways/imports/server` export exactly the names they exported before. Inside the package: `smart-match-rules.ts` exports the algorithm constants, `TIER`, `STOP_WORDS`, the reason lists and the column, field and decision types and `SmartMatchInputError`; `smart-match-names.ts` exports `normalizeMappingNameV1`, `type PreparedName`, `prepareName`, `boundedEditDistance`, `type PreparedField`, `nameScore`; `smart-match-values.ts` exports `boundedSamples` and `valueGate`.

- [ ] **Step 1: Pin the package exports**

Create `packages/imports/src/package-exports.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import * as browser from './index'
import * as server from './server'

const smartMatch = [
  'AUTO_SMART_V2',
  'AUTO_SMART_V2_LIMITS',
  'SMART_DECISION_REASONS',
  'SMART_MATCH_REASONS',
  'SMART_REVIEW_SYNONYMS_V2',
  'SMART_SYNONYMS_V2',
  'SMART_SYNONYMS_V2_ID',
  'SmartMatchInputError',
  'boundedEditDistance',
  'normalizeMappingNameV1',
  'smartMatchColumns',
]

describe('package entry points', () => {
  it('keeps the browser entry exports', () => {
    expect(Object.keys(browser).sort()).toEqual(
      [
        ...smartMatch,
        'IMPORT_ENGINEERING_LIMITS',
        'IMPORT_VALUE_MAP_LIMITS',
        'buildImportValueMap',
        'compareHeaders',
        'compatibleImportDataTypes',
        'createFileSummary',
        'formatPmerlRows',
        'importHeaderLabel',
        'mapKey',
        'parseCsv',
        'parseWorkbook',
        'suggestValueMap',
        'toCsv',
        'toWorkbookBytes',
        'toXlsxBuffer',
      ].sort(),
    )
  })

  it('keeps the server entry exports', () => {
    expect(Object.keys(server).sort()).toEqual(
      [
        ...smartMatch,
        'IMPORT_ENGINEERING_LIMITS',
        'IMPORT_VALUE_MAP_LIMITS',
        'ImportParseError',
        'buildImportValueMap',
        'compatibleImportDataTypes',
        'mapKey',
        'normalizeImportedRow',
        'parseSecureImport',
      ].sort(),
    )
  })
})
```

Run: `pnpm --filter @pathways/imports exec vitest run src/package-exports.test.ts`
Expected: PASS, 2 tests, before any change (characterization).

- [ ] **Step 2: Create the split plan and run it**

Create `.tmp/s5a/smart-match-split.json`:

```json
{
  "source": "packages/imports/src/mappers/smart-match.ts",
  "modules": [
    {
      "file": "packages/imports/src/mappers/smart-match-rules.ts",
      "declarations": [
        "AUTO_SMART_V2",
        "SMART_SYNONYMS_V2_ID",
        "AUTO_SMART_V2_LIMITS",
        "TIER",
        "SMART_MATCH_REASONS",
        "SmartMatchReason",
        "SMART_DECISION_REASONS",
        "SmartDecisionReason",
        "SMART_SYNONYMS_V2",
        "SMART_REVIEW_SYNONYMS_V2",
        "STOP_WORDS",
        "SmartMatchColumn",
        "SmartMatchField",
        "SmartMatchDecision",
        "SmartMatchInputError"
      ]
    },
    {
      "file": "packages/imports/src/mappers/smart-match-names.ts",
      "declarations": [
        "normalizeMappingNameV1",
        "tokensOf",
        "PreparedName",
        "prepareName",
        "canonicalSynonyms",
        "AUTOMATIC_SYNONYMS",
        "REVIEW_SYNONYMS",
        "setsEqual",
        "rowBuffers",
        "boundedEditDistance",
        "ScoredName",
        "similarity",
        "PreparedField",
        "nameScore"
      ],
      "private": [
        "tokensOf",
        "canonicalSynonyms",
        "AUTOMATIC_SYNONYMS",
        "REVIEW_SYNONYMS",
        "setsEqual",
        "rowBuffers",
        "ScoredName",
        "similarity"
      ]
    },
    {
      "file": "packages/imports/src/mappers/smart-match-values.ts",
      "declarations": [
        "sampleText",
        "isBlank",
        "MONTHS",
        "BOOLEAN_TOKENS",
        "dayMonthValid",
        "looksLikeDate",
        "choiceParts",
        "compatible",
        "boundedSamples",
        "valueGate"
      ],
      "private": [
        "sampleText",
        "isBlank",
        "MONTHS",
        "BOOLEAN_TOKENS",
        "dayMonthValid",
        "looksLikeDate",
        "choiceParts",
        "compatible"
      ]
    },
    {
      "file": "packages/imports/src/mappers/smart-match.ts",
      "preamble": "export {\n  AUTO_SMART_V2,\n  AUTO_SMART_V2_LIMITS,\n  SMART_DECISION_REASONS,\n  SMART_MATCH_REASONS,\n  SMART_REVIEW_SYNONYMS_V2,\n  SMART_SYNONYMS_V2,\n  SMART_SYNONYMS_V2_ID,\n  type SmartDecisionReason,\n  type SmartMatchColumn,\n  type SmartMatchDecision,\n  type SmartMatchField,\n  SmartMatchInputError,\n  type SmartMatchReason,\n} from './smart-match-rules'\nexport { boundedEditDistance, normalizeMappingNameV1 } from './smart-match-names'",
      "declarations": ["compareText", "Candidate", "smartMatchColumns"],
      "private": ["compareText", "Candidate"]
    }
  ],
  "replacements": []
}
```

```bash
node .tmp/s5a/split-service.mjs .tmp/s5a/smart-match-split.json
```

Expected, exactly:

```text
packages/imports/src/mappers/smart-match-rules.ts: 170 lines, foreign 0
packages/imports/src/mappers/smart-match-names.ts: 168 lines, foreign 0
packages/imports/src/mappers/smart-match-values.ts: 162 lines, foreign 0
packages/imports/src/mappers/smart-match.ts: 156 lines, foreign 0
```

- [ ] **Step 3: Run the tests and commit**

```bash
git add -N packages/imports
pnpm exec biome check --write packages/imports/src
wc -l packages/imports/src/mappers/smart-match*.ts
git diff --stat HEAD -- packages/imports/src/mappers/smart-match.test.ts
pnpm --filter @pathways/imports test 2>&1 | grep -E "Tests +[0-9]+"
pnpm --filter @pathways/web exec vitest run src/features/collection/collection-import-state.test.ts src/features/collection/import-value-map-editor.suggest.test.tsx
pnpm typecheck && pnpm lint
git checkout -- apps/web/next-env.d.ts
git add -A packages/imports/src
git commit -m "refactor(imports): split smart-match into rules, name scoring and value gates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `wc` shows `smart-match-rules.ts` 169, `smart-match-names.ts` 175, `smart-match-values.ts` 161, `smart-match.ts` 168; `smart-match.test.ts` is unchanged (no diff); imports = `B_imports + 3` (limits 1, exports 2), with all 33 smart-match tests passing; the two web tests that load `@pathways/imports` in the browser preview (the matcher and the value map editor) pass.

---

### Task 8: Records and SAD routing

**Files:**
- Modify: `scripts/sad/check.ts` (metadata-import-validator globs), `scripts/sad/check.test.ts`, `docs/sad-pathways.md:39`
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.4, 3.6, 3.7, 9)
- Modify: `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-04, MOD-11, MOD-17 rows)
- Modify: `docs/qad-pathways.md`, `docs/prd-pathways.md:897`
- Modify: `docs/index.md` (CR row status)
- Modify: `docs/activity-log.md`

- [ ] **Step 1: Route form metadata and the collection contracts to the metadata import validator (ruling 14)**

In `scripts/sad/check.test.ts`, directly before the test `routes the rules dispatch workflow to design-qa-agent`, add:

```ts
  it('routes form metadata modules and collection contracts to the metadata import validator', () => {
    const files = [
      'apps/api/src/modules/metadata/form-lookup.service.ts',
      'packages/shared/src/contracts/imports/import-requests.ts',
      'packages/shared/src/contracts/metadata/form-requests.ts',
    ]
    const routed = routing(files.map((file) => change(file, 'new', 'old')))
    expect(routed['metadata-import-validator']).toEqual(files)
  })
```

Run: `pnpm sad:test`
Expected: FAIL on the new test (`expected undefined to deeply equal [ ... ]`: none of the three files reaches the validator yet).

In `scripts/sad/check.ts`, replace the `metadata-import-validator` globs line

```ts
    globs: ['packages/imports/src/**/*.ts', 'apps/api/src/modules/imports/**/*.ts'],
```

with

```ts
    globs: [
      'packages/imports/src/**/*.ts',
      'apps/api/src/modules/imports/**/*.ts',
      'apps/api/src/modules/metadata/**/*.ts',
      'packages/shared/src/contracts/imports/**/*.ts',
      'packages/shared/src/contracts/metadata/**/*.ts',
    ],
```

In `docs/sad-pathways.md` line 39, replace `` `packages/imports/src/**/*.ts`, `apps/api/src/modules/imports/**/*.ts` `` with `` `packages/imports/src/**/*.ts`, `apps/api/src/modules/imports/**/*.ts`, `apps/api/src/modules/metadata/**/*.ts`, `packages/shared/src/contracts/imports/**/*.ts`, `packages/shared/src/contracts/metadata/**/*.ts` `` (inside the same cell).

```bash
pnpm sad:test && pnpm sad:typecheck
```

Expected: PASS; sad = `B_sad + 1`.

- [ ] **Step 2: Amend the Change Record**

`docs/cr-pathways-codebase-modularization.md`:

Section 3.4, append to the paragraph (after the S1a sentence on `contracts/common/field-schemas.ts`):

```text
The same file holds `trimmedLowercaseInput` and `queryInteger`, which port a trim and lower-case `@Transform` and an `@Type(() => Number)` query bound (amended <date> for S5a).
```

Section 3.6, in the first bullet replace

```text
queries use `z.coerce` in place of `transform: true`.
```

with:

```text
queries use `queryInteger` in place of `transform: true`; it reads a scalar with `Number()` and leaves an array to fail, as `@Type(() => Number)` did, where `z.coerce.number()` would read `['5']` as 5 (amended <date> for S5a).
```

Section 3.6, insert before the bullet starting `` - Web `lib/api/<domain>.ts` ``:

```markdown
- A free-form `IsObject()` record keeps the class-transformer copy rules: own keys named after an `Object.prototype` method are dropped, and a `constructor` key, which crashed the old pipe with a 500, answers 400 (`formResponseValues`; amended <date> for S5a).
```

Section 3.7, replace the row

```markdown
| S5 | Collection: metadata, imports, `packages/imports` | Merges the two import flows; splits `smart-match` |
```

with

```markdown
| S5a, S5b | Collection: metadata, imports, `packages/imports`. S5a: imports and metadata contracts, api service splits, smart-match split; S5b: web client, one import flow, collection components | Merges the two import flows; splits `smart-match` |
```

Section 9, append:

```markdown
S5a applied <date> on refactor/s5a-collection-api:
- Contracts: `uploadImportRequest`, `importMappingItemRequest`, `saveImportMappingRequest`, `automaticImportMappingRequest`, `processImportRequest` and `importRowsQuery` (beside F3b `validateImportRequest`) and the form metadata contracts in `packages/shared/src/contracts/metadata/form-requests.ts` replaced the 15 remaining class-validator bodies and queries of the imports and metadata routes; parity tests ran each DTO and contract through the configured pipes over 87 import and 131 metadata bodies before the DTOs were deleted; `trimmedLowercaseInput` and `queryInteger` joined the field schemas; `importRequestLimits` is pinned to the `@pathways/imports` limits by a test.
- Services: `imports.service.ts` (2118 lines) and `metadata.service.ts` (1315) became facades that keep their constructors, methods and one authorized transaction per method; the work inside each transaction moved verbatim into function modules that take the caller's `tx` (imports: `imports.helpers.ts`, `imports.mapper.ts` and the batches, automatic mapping, mapping, validation, upload, promotion context, row promotion, promotion and claims services; metadata: `metadata.mapper.ts`, `metadata.helpers.ts` and the form lookup, definitions, versions, submissions and submission reads services); the duplicated field contract mapping has one owner, `formFieldContract` in `metadata.mapper.ts`; the import promotion modules call S4's `BeneficiaryRegistrationService` through `PromotionHandlers`, and the facade field that holds it is named `registration` (the S4 deferral).
- Scope: the form definition export reads its project through `requireScopedProject`, closing the last F3a inline project lookup in the slice.
- Package: `smart-match.ts` split into rules, name scoring and value gates with the same exports and the same `AUTO_SMART_V2` decisions.
- Names: `p07-w10-finalization-fault.ts` became `upload-finalization-fault.ts`; the F5 and F6 gate tests are named after what they check.
- SAD: metadata-import-validator routing covers `apps/api/src/modules/metadata/**/*.ts` and the imports and metadata contract folders.
- Decisions: S5 split into S5a and S5b (ruling 1); `beneficiaryId` is `.optional()`, and an array in place of a mapping, value map or field object now answers 400 at the pipe, beside the F3b prototype keys (ruling 3); query bounds use `queryInteger`, not `z.coerce` (ruling 4); response values drop the ten `Object.prototype` method keys and refuse `constructor`, which answered 500 (ruling 5); import bounds are literals pinned by a test because shared cannot import `@pathways/imports` (ruling 6); the services are facades because seeds and tests construct them positionally and tests spy on seven private wrappers, so `imports.service.ts` stays at 519 lines (ruling 8); the unused `ParticipantsService` constructor parameter that S4 left to S5 stays, because removing it edits seeds S5 does not touch (ruling 18).

Deferred to S5b: `lib/api` collection clients for the 24 metadata and import methods of `pathways-client.ts` (with `validateImport` typed from `ValidateImportRequest`, the F3b deferral), one `use-import-batch` hook for the two web import flows, the split of `collection-workspace.tsx`, `import-workspace.tsx` and `direct-form-entry-workspace.tsx`, the `features/collection` layout and public `index.ts`, and the web form type copies (`form-builder-session-draft.ts`, `types/pathways.ts` `DigitalFormType`). Deferred to W1: the unused `ParticipantsService` `PrismaService` parameter with its two seed constructions, and the eight test-only `Prisma.TransactionClient` annotations in the imports and metadata test harnesses.
```

Replace `<date>` with the merge date (four places).

- [ ] **Step 3: Update the audit, living docs and index**

- Audit: append to the disposition cell of MOD-04 `; imports and metadata services split by S5a.`, of MOD-11 `; imports and metadata DTOs replaced by S5a.` and of MOD-17 `; imports and metadata phase-coded names removed by S5a.`

```bash
sed -i -e 's#apps/api/src/modules/imports/imports.dto.value-map.test.ts#packages/shared/src/contracts/imports/import-requests.test.ts#g' -e 's#apps/api/src/modules/imports/imports.f6-gates.test.ts#apps/api/src/modules/imports/imports.review-flow.test.ts#g' -e 's#apps/api/src/modules/metadata/metadata.f5-gates.test.ts#apps/api/src/modules/metadata/metadata.direct-entry.test.ts#g' -e 's#apps/api/src/modules/metadata/form-definition-export.f5-gates.test.ts#apps/api/src/modules/metadata/form-definition-export.audit.test.ts#g' docs/qad-pathways.md
sed -i 's#(`ImportStatus`, `apps/api/src/modules/imports/imports.service.ts`)#(`ImportStatus`, the upload, mapping, validation and claims services in `apps/api/src/modules/imports`)#' docs/prd-pathways.md
git grep -nE "imports\.dto|metadata\.dto|f5-gates|f6-gates|p07-w10|modules/imports/imports\.service\.ts" -- docs ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/cr-*' ':!docs/superpowers/*'
```

Expected: the grep prints nothing (at `a101ad7c` the replacements touch 10 references in `qad-pathways.md` and 1 in `prd-pathways.md`).

- `docs/index.md`: the CR row status becomes `Approved; F1 to F4b, S1 to S4 and S5a applied, S5b next`.

- [ ] **Step 4: Activity log**

Add to `docs/activity-log.md`:

```markdown
## <date> Modularization S5a collection api (refactor/s5a-collection-api)
```

with one bullet per Task 1 to Task 7 stating what was added, switched, split or renamed, with its commit hash and the shared, imports and api test counts at the end of that task; a bullet saying the S5a decisions are recorded in the change record section 9 (the plan stays until S5b is planned, because it holds the S5b outline); and a bullet listing the S5b deferrals. Task 9 Step 5 appends the gate results.

- [ ] **Step 5: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint
git add docs scripts/sad
git commit -m "docs: record modularization S5a and route form metadata to the import validator

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline.

---

### Task 9: Full release gates and merge

- [ ] **Step 1: Static gates, dist layout and compiled pipes**

Create `.tmp/s5a/probe-pipes.cjs`:

```js
// Lists the compiled imports and metadata routes whose parameters carry a ZodPipe, with that parameter's design type.
const path = require('node:path')
const { createRequire } = require('node:module')

const api = path.resolve('apps/api')
const load = createRequire(path.join(api, 'package.json'))
load('reflect-metadata')
const { ROUTE_ARGS_METADATA } = load('@nestjs/common/constants')
const dist = path.join(api, 'dist/apps/api/src')
const { ZodPipe } = load(path.join(dist, 'common/validation/zod-pipe.js'))
const controllers = [
  ['modules/imports/imports.controller.js', 'ImportsController'],
  ['modules/metadata/metadata.controller.js', 'MetadataController'],
]
for (const [file, name] of controllers) {
  const controller = load(path.join(dist, file))[name]
  const found = []
  for (const route of Object.getOwnPropertyNames(controller.prototype)) {
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, route) ?? {}
    const types = Reflect.getMetadata('design:paramtypes', controller.prototype, route) ?? []
    for (const arg of Object.values(args)) {
      if (arg.pipes.some((pipe) => pipe instanceof ZodPipe)) {
        found.push(`${route}:${types[arg.index]?.name}`)
      }
    }
  }
  console.log(`${name}: ${found.join(' ')}`)
}
```

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm sad:test
git checkout -- apps/web/next-env.d.ts
test -f packages/shared/dist/contracts/metadata/form-requests.js && test -f apps/api/dist/packages/shared/src/contracts/metadata/form-requests.js && test -f apps/api/dist/apps/api/src/modules/imports/import-claims.service.js && test -f apps/api/dist/apps/api/src/modules/metadata/metadata.mapper.js && test -f packages/imports/dist/mappers/smart-match-rules.js && test -f apps/api/dist/packages/imports/src/mappers/smart-match-rules.js && test ! -e apps/api/dist/apps/api/src/modules/imports/imports.dto.js && test ! -e apps/api/dist/apps/api/src/modules/metadata/metadata.dto.js && echo "dist layout ok"
node .tmp/s5a/probe-pipes.cjs
pnpm --filter @pathways/web build > .tmp/s5a/web-build-gates.log 2>&1; echo "exit $?"
grep -E "Middleware" .tmp/s5a/web-build-gates.log
git checkout -- apps/web/next-env.d.ts
```

Expected: all pass and `dist layout ok` (nest `deleteOutDir` removes the old DTO output); the probe prints

```text
ImportsController: upload:Object rows:Object automaticMapping:Object map:Object validate:Object process:Object
MetadataController: create:Object generate:Object update:Object publish:Object archive:Object validateValues:Object saveSubmission:Object listSubmissions:Object updateSubmission:Object submitSubmission:Object
```

(every switched body and query carries a `ZodPipe` in the compiled API, and its design type is `Object`, so the global `ValidationPipe` passes it through unchanged; Vitest cannot show this, CR 3.6); web build exit 0 with Middleware at most `M0` (the barrel grows; `"sideEffects": false` must keep the new contracts out of the Edge bundle). Versus Task 0: shared = `B_shared + 29`, imports = `B_imports + 3`, api = `B_api + 16`, sad = `B_sad + 1`, config and web unchanged.

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

`pnpm db:local:demo` drives the split services against the database: its form stages create, generate and publish forms and save and submit direct entries through `MetadataService`, and its import stage uploads, auto-maps, validates and processes batches through `ImportsService`; it must finish as it did on dev. `pnpm dev:local` builds the API and runs `dist`. In a second terminal:

```bash
curl -s http://127.0.0.1:4000/api/health
npx playwright test --config playwright.config.ts
npx playwright test --config playwright.auth-navigation.config.ts
```

Expected: `"status":"ok"`; a module-resolution error or an undefined contract in the `pnpm dev:local` output fails the gate; auth-navigation 27/27; the main suite fails exactly the tests the previous slice's gate run recorded in `docs/activity-log.md`. Browser smoke against the compiled API, each step as a demo user whose role allows it: as M&E Officer open Collection, Forms, create a draft form whose form code and one field code are typed in upper case with spaces, and confirm both are saved lower-cased (Review Focus 1 for bodies); edit and save it; generate a form from a template; as a different publisher publish it, and confirm the author still cannot publish their own form; archive a form and create a new version of another; export a form definition as CSV and PDF, and confirm that pasting an unassigned project's id into the export URL answers 404 as on dev (ruling 13). As Project Officer open a published training survey, save a draft entry with a survey subject, edit it and submit it, and list the entries. Import on the collection screen: upload a CSV, accept the automatic mapping, validate and process to completion; on the import screen: upload, set a value map, save the mapping as M&E Officer, validate, process one checkpoint at a time, and open the row preview (Review Focus 1 for queries, 2 for multipart). Import a beneficiary registration CSV and an activity monitoring CSV and confirm the rows are promoted (Review Focus 4). Every step must behave as on dev.

- [ ] **Step 4: SAD review**

```bash
pnpm sad:check --base dev --head HEAD --output .tmp/sad/s5/manifest.json
```

Dispatch every role the manifest requires (expect `design-qa-agent`, `restraint-guardian`, `organization-isolation-checker`, `beneficiary-privacy-guardian` and `metadata-import-validator`) with the section 4.2 handoff packet from `docs/sad-pathways.md`, save their section 4.4 envelopes to `.tmp/sad/s5/reviews.json`, then:

```bash
pnpm sad:signoff -- --base dev --head HEAD --reviews .tmp/sad/s5/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun.

- [ ] **Step 5: Record the gate results**

Append a final bullet to the Task 8 activity-log section with the gate results (per-package counts, Middleware size, compiled pipe probe, replay exit code, demo seed result, e2e pass counts, smoke result, SAD sign-off), then:

```bash
git add docs/activity-log.md
git commit -m "docs: record modularization S5a release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Merge into local dev**

```bash
git checkout dev
git merge --no-ff refactor/s5a-collection-api -m "Merge refactor/s5a-collection-api into dev

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Keep the plan for S5b**

The plan holds the S5b outline, so it stays on dev. In `docs/index.md` section 1.6 change the S5 plan row status to `S5a executed; holds the S5b outline`, then:

```bash
pnpm docs:check 2>&1 | tail -3
git add docs/index.md
git commit -m "docs: mark S5a executed in the plan index

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline. Do not push `origin dev` until the developer says so.

---

## S5b outline (collection web, branch `refactor/s5b-collection-web`)

To be written as its own plan from dev after S5a merges; that plan's Task 0 removes this file and its index row. Counts below were taken at `a101ad7c` (before F4b and S1b) and must be recounted in S5b Task 0, because F4b and S1b rewrite `pathways-client.ts` imports and mocks.

- **Task 0, baseline:** recount every number below; confirm the F4b and S1b exports listed under "Interfaces assumed"; record web Middleware.
- **Task 1, `lib/api/forms.ts` and `lib/api/imports.ts`:** move the 14 form metadata and direct entry methods (`getDigitalForms` to `submitDirectSubmission`) and the 10 import methods (`getImportBatches` to `processImport`) out of `pathways-client.ts` as `formsClient` and `importsClient` with the same signatures, on F4b's `requestFoundation`. Request bodies take the S5a contract types where they are identical (`ValidateImportRequest` for `validateImport`, the F3b deferral; `SaveImportMappingRequest['mappings']` for `ImportMappingInput` only if a characterization test shows the same JSON). Add the types-only response contracts of S5a ruling 15 (`packages/shared/src/contracts/imports/import-responses.ts`, `contracts/metadata/form-responses.ts`), annotate the api mappers and read functions with them so `pnpm typecheck` catches drift, and replace `ImportBatchDefinition`, `ImportRowsPage`, `DigitalFormDefinition` and `DirectFormSubmission` in `types/pathways.ts` where they match; nothing parses responses at runtime (CR 3.6). 18 files reference the methods (7 production: `collection-workspace.tsx`, `import-workspace.tsx`, `direct-form-entry-workspace.tsx`, `beneficiary-detail.tsx`, `beneficiary-detail-loader.tsx`, `project-indicators-workspace.tsx` and the client); 10 of the 56 `vi.mock('@/lib/services/pathways-client', ...)` factories define one and must split into a second mock of the new module in the same commit, counted before and after. `collection-workspace.test.tsx` already has an `activitiesClient` mock beside its `pathwaysClient` factory after S2b, and after S3b a `vi.mock('@/lib/api/indicators', ...)` split off that factory (`getIndicators`), while `collection-workspace.extend-projects.test.tsx` gets `indicatorsClient: api` and `collection-workspace.tsx` calls `indicatorsClient.getIndicators`; add the new mocks beside them and do not delete any. SAD: `apps/web/src/lib/api/**/*.ts` already routes to beneficiary-privacy-guardian from F4b.
- **Task 2, one import flow (MOD-07):** characterization tests first for both drivers: the collection screen's one-shot flow (upload, automatic mapping, save mapping, validate, then `processImport` repeated until the batch completes, a call fails or the user stops) and the import screen's reviewed flow (one checkpoint per click, value maps, ownership checks in `import-workspace.ownership.test.tsx`). Then `features/collection/hooks/use-import-batch.ts` holds the shared batch state, request ownership (F4b `captureRequestOwner`) and step calls; each screen keeps its own process policy as a parameter, so neither screen's clicks, texts or request sequence change. Record any difference the tests find as a ruling instead of unifying it.
- **Task 3, `collection-workspace.tsx` (3182 lines):** split `OwnedCollectionWorkspace` (about 1560 lines, 40 `useState`, 18 direct client calls) into hooks (`use-form-builder`, `use-form-list`, the Task 2 hook) and move the 14 inline components (`FormsGeneratorView`, `BuilderView`, `FormInfoPanel`, `JourneyStageSelector`, `FieldEditor`, `ToggleRow`, `MetadataMapPanel`, `FormPreviewPanel`, `ImportView`, `SummaryMetric`, `MappingTable`, `DataPreview`, `ImportValidationPanel`, `SummaryPill`; the audit counted 11) into `features/collection/components/`, one per file, verbatim. The 1632-line `collection-workspace.test.tsx` splits by concern as `collection-workspace.<concern>.test.tsx`.
- **Task 4, `import-workspace.tsx` (1130) and `direct-form-entry-workspace.tsx` (657):** split by component and hook, verbatim, with characterization tests first where the existing tests do not render the moved part.
- **Task 5, `features/collection` layout:** the folder has 37 files; move components and hooks into subfolders, `import-status-labels.ts` and `formTypeLabels` into `collection.copy.ts`, pure helpers into `collection.utils.ts`; add `features/collection/index.ts` and repoint the six route pages and `features/beneficiaries/beneficiary-form.tsx` (`FormDefinitionEntryField`) through it; add `'collection'` to S1b's `indexedFeatures` in `apps/web/src/import-direction.test.ts` and `'@/features/collection'` to `experimental.optimizePackageImports` in `apps/web/next.config.ts`, instead of writing a new rule.
- **Task 6, web types:** `form-builder-session-draft.ts` `formTypes` and `types/pathways.ts` `DigitalFormType` become the shared `digitalFormTypes` and `DigitalFormType` (identical seven codes, pinned by a test before the copies go); other collection view models stay where the contracts do not cover them.
- **Task 7, records:** CR 3.3 and section 9 S5b disposition, audit MOD-05, MOD-06, MOD-07, MOD-15 and MOD-16 (collection parts), index, activity log.
- **Task 8, gates and merge:** as S5a Task 9 (SAD evidence under `.tmp/sad/s5b/`), with Middleware measured and a smoke over every collection screen, both import flows, direct entry, the beneficiary form's dynamic fields and the project indicators screen. After merge, remove this plan and its index row.
