# S4 Beneficiaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the beneficiaries, journey and beneficiary media API its shared zod request contracts, split the beneficiaries and participants services by responsibility, and hand the import slice one injectable registration service and the unchanged participation promotion, with no change to any route, status code, response body, audit row, permission decision, transaction boundary or SQL statement.

**Architecture:** S4 is split (ruling 1). This plan gives S4a in full (ten tasks including baseline and gates) and S4b, the web client and feature components, as an outline at the end. S4a converts the ten class-validator DTO classes of the slice (beneficiaries, identity review, journey events, journey stages, media reservation) into contracts after parity tests that run the old DTO and the new contract through the configured pipes, then moves the beneficiaries and participants code verbatim into purpose-named modules with an AST script, proves each move with a line-multiset check, and rewires Nest, the seeds and the tests. Mechanical edits use one-off Node scripts under `.tmp/s4a/` (gitignored, never committed) whose content is given in full. Every step below was replayed in order on an exported copy of `a101ad7c` (F4a complete) with S1's `field-schemas.ts` and `request-identity.ts` added as the S1 plan writes them and an S2 stand-in exporting the activity evidence constants from `@pathways/shared`: after every task the copy typechecked (`tsc` over `apps/api/src` and `apps/api/prisma`), Biome reported no fixes over `apps/api` and `packages/shared`, and the slice's Vitest suites passed; at the end the full api suite passed apart from the two `imports.service.test.ts` cases that fail only in that copy's module resolution harness, and the full shared suite passed. The expected outputs quoted below come from that replay.

**Tech Stack:** pnpm 11 workspace, TypeScript 5.9, NestJS 10.4.22, class-validator 0.14.4 on validator 13.15.26, class-transformer 0.5.1, zod 3.25.76, Prisma 6.19, Vitest 3.2, Biome 1.9.4, Next 15.5.14, Playwright.

**Spec:** `docs/cr-pathways-codebase-modularization.md` (sections 3.1 to 3.7 with roadmap row S4, 4, 6, 7, and 9 including the F1 to F4b dispositions and the S1 to S3 dispositions that land before this slice) and `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-04 and MOD-11 for S4a; MOD-05, MOD-06, MOD-16 and MOD-17 for S4b; MOD-B1 stays out of scope).

## Rulings

Controller rulings for S4 (2026-10-11). Each was checked against `refactor/f4a-web-boundaries` `a101ad7c`. S1 to S3 land before S4; their plans touch none of the S4 api files except where the "Interfaces assumed" section says so, and Task 0 recounts every number below.

1. **Split into S4a and S4b.** The S4 row covers contracts, the api split, the web client and the feature components. The api half alone is ten DTO classes in three modules, a 1461-line `beneficiaries.service.ts` and a 703-line `participants.service.ts`; the web half moves 19 beneficiary, media and journey methods out of `pathways-client.ts` (27 web files reference them, 13 of them production files, and 11 of the 56 `pathways-client` mock factories define one) and splits four oversized components (`beneficiary-form.tsx` 1388, `beneficiary-detail.tsx` 1172, `beneficiary-media-proof.tsx` 662, `beneficiary-directory.tsx` 565). Together that is about eighteen tasks. S4a (this plan, branch `refactor/s4a-beneficiaries-api`) takes the contracts and the api; S4b (outline below, branch `refactor/s4b-beneficiaries-web`) takes the web. Both names replace `refactor/s4-beneficiaries`.
2. **The journey stage configuration contract belongs to S4.** `SaveJourneyConfigurationDto` and `JourneyStageInputDto` sit in `apps/api/src/modules/activities/activities.dto.ts`, but their only route is `PUT projects/:projectId/journey-stages` in the participants module, so S4a converts them and deletes them from the activities DTO file together with `journey-stage-code.test.ts`, whose eight cases move into the shared contract test. This assumes S2 leaves both classes in place (see "Interfaces assumed"); the cross-plan check must confirm it.
3. **Parity holds except for prototype keys.** 109 beneficiary, 82 journey and 38 media bodies agree on accept or reject and on the accepted value (JSON `null` on every optional field included). The differences are all prototype keys, the class F3b ruling 3 accepted: own top-level `__proto__` and `constructor` keys, and the same keys inside a journey stage or a media file, were dropped by the DTO route and are rejected by `.strict()`; and a `constructor` key anywhere inside registration `values` made class-transformer throw a `TypeError` (a 500), while the contract forwards it and the service answers 400 `Registration values are invalid.` because `constructor` is not a form field. No client sends these keys. The parity tests pin each difference.
4. **The profile update audit keeps listing every field.** `apps/api/tsconfig.json` targets ES2022, so `useDefineForClassFields` is on and the compiled `UpdateBeneficiaryDto` instance owns all 13 declared fields, `undefined` when absent; `BeneficiariesService.update` audits `Object.keys(input)` without `expectedUpdatedAt`, so production audit rows always list the same 12 names. A zod output owns only the keys that were sent. The service therefore audits `auditedProfileFields`, the contract's shape keys without `expectedUpdatedAt`, which equal the DTO's declaration order; the parity test pins the DTO instance keys against the contract shape and a service test pins the audited list. No other S4 service reads key presence (`in`, `Object.keys` or spreading of an input).
5. **Optional means nullish, with no exception in S4.** As in S1 ruling 3, each `@IsOptional()` field becomes `.nullish()`, and every `null` still reaches the service where it did. `JourneyStageInputDto.terminal` had the initializer `false`; the contract keeps it with `.nullish().default(false)`, so an absent flag is `false` and an explicit `null` is still `null`. The list query `limit` keeps the DTO transform (`undefined` becomes 25, anything else goes through `Number`), so `' 7 '`, `'1e1'`, `'0x10'` and a repeated `?limit=10` are still accepted.
6. **Message wording.** Zod wording replaces class-validator wording (CR 3.6); the stage code keeps its custom message `Stage codes use capital letters, digits, dots, dashes or underscores.`. The beneficiary, journey and media screens validate before sending (`journey-config-utils.ts` checks the stage code, the registration and profile forms check their fields), and `git grep` finds no test or e2e spec asserting the old wording for these routes.
7. **The registration promotion becomes one injectable service.** `readRegistrationForm`, `promoteRegistration` and `registrationUpdateData` (413 lines with the form selection) move verbatim into `BeneficiaryRegistrationService` (`beneficiary-registration.service.ts`). It stays an injectable class, not a function module (S1 ruling 7), because `ImportsService` receives it by constructor injection and three imports test files pass a positional fake for it; only its type and token change there. It has no constructor dependency, because both methods take the caller's `tx`. `BeneficiariesService` takes it as a second constructor parameter for `register`, and `BeneficiariesModule` exports only the registration service, since nothing outside the module uses `BeneficiariesService`. The pure parsing and identifier rules move to `beneficiary-registration.helpers.ts`, the age band filter and profile edit rule to `beneficiaries.helpers.ts`, the row selections and mapping to `beneficiaries.mapper.ts`, and `loadRegistrationContext` to `registration-context.service.ts` as a function taking `tx`. `BeneficiariesService` lands at 409 lines and the registration service at 457, both under the CR 3.5 review flag of 500.
8. **ParticipantsService keeps participation promotion.** `promoteParticipation` is what imports and metadata inject, so it stays in `ParticipantsService` (166 lines); the stage configuration moves to `JourneyStagesService` and the history, transitions and corrections to `BeneficiaryJourneyService`, each with its own controller file (CR 3.2, one controller per file). `ParticipantsService` keeps its now unused `PrismaService` parameter, so the ten constructions in imports and metadata tests and the two seeds stay as they are; S5 may drop it with those sites.
9. **One beneficiary code rule.** `normalizedCode` in `participants.dto.ts` is `canonicalCode` in `beneficiaries.dto.ts` line for line. A characterization test runs both over 13 inputs before `normalizedCode` is deleted and promotion uses `canonicalCode`.
10. **Kernel adoption and what stays local.** `requestIdentity` replaces the local `profile()` helper in the four controller files of the slice (S1 ruling 9). `beneficiary-progress.ts` takes `Tx` (48 to 47 direct `Prisma.TransactionClient` annotations in api production code at `a101ad7c`; S1 to S3 remove others). The beneficiary media enrollment lookup keeps its inline project scope, because `requireScopedProject` would answer `Project unavailable.` where the route answers `Beneficiary media unavailable.`. `businessToday` keeps its own clock, because `currentBusinessDate` answers 503 on a bad time zone where these routes answer 500.
11. **Response contracts wait for S4b.** S1a typed its mapper with response contracts; S4a moves no response shape into shared, because the web client that would consume them moves in S4b. `RegistrationContextDto` leaves the DTO file as `RegistrationContext`, beside `loadRegistrationContext`. S4b adds the response contracts and annotates the two mappers.
12. **Tests follow their code.** `beneficiaries.service.test.ts` (871 lines) splits by the service split: the registration cases go to `beneficiary-registration.service.test.ts` (636 lines, kept as one file because every case shares one transaction fake) and the profile edit cases to `beneficiaries.helpers.test.ts`. The participants tests split into `participants.service.test.ts` (promotion) and `beneficiary-journey.service.test.ts` (the G-F4 gate cases, whose two stage-save cases use `JourneyStagesService`).
13. **SAD routing:** `apps/api/src/modules/beneficiaries/**/*.ts`, `apps/api/src/modules/beneficiary-media/**/*.ts` and `apps/api/src/modules/participants/**/*.ts` route to beneficiary-privacy-guardian, because the helpers decide which identity and profile fields are normalized and stored and the services decide which leave the api; CR section 7 requires that reviewer when beneficiary code moves. The split services keep organization isolation routing through their `.service.ts` names.
14. **Seeds.** `local-demo-seed.ts`, `defense-demo-seed.ts` and `hosted-realistic-seed.ts` construct the split services, and four stage files call the journey methods through `ctx.services.participants` (8 call sites), which now read `ctx.services.journeyStages` and `ctx.services.beneficiaryJourney`; `hosted-realistic-seed.ts` and `local-demo-stage-people.ts` type their registration input as `RegisterBeneficiaryRequest`. These are the only `apps/api/prisma` edits; the seeded rows do not change.
15. **Spec facts corrected by the baseline:** the audit's 1492 lines for `beneficiaries.service.ts` are 1461 at `a101ad7c`; `participants.service.ts` (703) is not in the audit table but is over the review flag; the DTO classes number ten (six in `beneficiaries.dto.ts`, two in `participants.dto.ts`, one exported and one nested in `beneficiary-media.dto.ts`, plus the two journey stage classes in `activities.dto.ts`). MOD-B1 (`'5-9'` age band in the web directory) stays open; the contract keeps the API's `sadddAgeBands`, and a parity row pins `'5-9'` as rejected on both routes.
16. Cross-plan: S4 consumes only produced names: S2's `contracts/activities/activity-evidence.ts` (`activityEvidenceContentTypes`, `ActivityEvidenceContentType`, `MAX_ACTIVITY_EVIDENCE_FILES`) and its two journey DTO classes in `activities.dto.ts`, S3's `sadddAgeBands` in `monitoring/metric-contract.ts`, and S1's `field-schemas.ts` and `requestIdentity`; nothing from S5 to S8. The inline `limit` preprocess in `beneficiaryListQuery` mirrors the DTO's own `@Transform` (absent is 25, `Number(['10'])` is 10) and is not S5's `queryInteger`, which mirrors `@Type(() => Number)` and rejects arrays, so the two stay separate. Cost if wrong: one list query parses a repeated `limit` differently from before.
17. Cross-plan (S2b): S2b created `activitiesClient` (`lib/api/activities.ts`) and `isFiniteNonNegative` (`lib/api/core/guards.ts`); `getBeneficiaryMediaLimits` in `lib/api/beneficiary-media.ts` imports the guard instead of a local copy, and `beneficiary-media-proof.tsx` keeps calling `activitiesClient.uploadActivityProofFile` unless a media-owned `PUT` is added. Cost if wrong: a duplicated guard, or an `undefined` method in a mocked test.

## Interfaces assumed from earlier slices

S4a assumes these, and Task 0 verifies each:

- **S1 (S1a Task 1):** from `@pathways/shared` (`packages/shared/src/contracts/common/field-schemas.ts`): `lengthString(min: number, max: number)` (a `z.string()` refinement counting as validator `isLength`), `uuidString` and `isoDateString` (`z.ZodString`), `strictIsoDateString` (refined `isoDateString`), `trimmedInput<T extends z.ZodTypeAny>(schema: T)` (a `z.preprocess` that trims strings), `hasUniqueItems(values: readonly unknown[]): boolean`.
- **S1 (S1a Task 7):** `requestIdentity(request: AuthenticatedRequest): ApplicationIdentity` from `apps/api/src/common/authz/request-identity.ts`, throwing `ForbiddenException('Application profile is required.')`.
- **S1 (S1a Task 8):** the line `'apps/api/src/**/*.mapper.ts',` in the beneficiary-privacy-guardian globs of `scripts/sad/check.ts` (Task 8 inserts after it).
- **S2:** `activityEvidenceContentTypes` (the seven-type tuple), `type ActivityEvidenceContentType` and `MAX_ACTIVITY_EVIDENCE_FILES` (10) exported from `@pathways/shared` by one module under `packages/shared/src/contracts/` (the replay used `packages/shared/src/contracts/activities/activity-evidence.ts`; Task 4 imports from whatever module Task 0 finds). `SaveJourneyConfigurationDto` and `JourneyStageInputDto` still declared in `apps/api/src/modules/activities/activities.dto.ts` (ruling 2). Whatever S2 did to the `activities.service` and `activities.dto` imports of `beneficiary-media.service.ts`, S4a leaves those lines alone.
- **F3a, F3b and F4b kernel, unchanged:** `type Tx` (`common/prisma/transaction.ts`), `withAuthorizedOperation` (`common/authz/authorized-operation.ts`), `requireScopedProject` and `requireScopedProjectRow` (`common/authz/scoped-project.ts`), `writeAuditLog` (`common/audit/write-audit-log.ts`), `class ZodPipe<S extends z.ZodTypeAny>` (`common/validation/zod-pipe.ts`). S4b assumes F4b's `PathwaysClientError`, `requestFoundation` and `requestFoundationResponse` (`apps/web/src/lib/api/core/request.ts`), `captureRequestOwner` (`apps/web/src/lib/api/core/request-owner.ts`), `useAuthorizedRead` (`apps/web/src/hooks/use-authorized-read.ts`) and `apps/web/src/lib/format/{date,percent,plural,tone}.ts`.

## Produced for later slices

- `BeneficiaryRegistrationService` (`apps/api/src/modules/beneficiaries/beneficiary-registration.service.ts`, exported by `BeneficiariesModule`): `readRegistrationForm(tx: Tx, actor: ApplicationIdentity, projectId: string, formId: string, source: 'DIRECT_ENTRY' | 'IMPORTED_DATASET')`, `promoteRegistration(tx: Tx, actor: ApplicationIdentity, input: { projectId: string; formId: string; clientRegistrationId: string; values: Record<string, unknown>; source: 'DIRECT_ENTRY' | 'IMPORTED_DATASET'; validatedById: string; importBatchId?: string; importRowId?: string }, preloaded?: { form: RegistrationImportForm }): Promise<{ kind: 'PROCESSED'; beneficiaryId: string; enrollmentId: string; submissionId: string } | { kind: 'REVIEW'; code: string }>`, and `type RegistrationImportForm`. S5 consumes it through `ImportsService`'s third constructor parameter.
- `ParticipantsService.promoteParticipation(tx: Tx, actor: ApplicationIdentity, input: ParticipationPromotionInput): Promise<{ participationId: string; enrollmentId: string }>` (`apps/api/src/modules/participants/participants.service.ts`, exported by `ParticipantsModule`), unchanged; constructor `(prisma: PrismaService)`.
- `canonicalCode`, `canonicalIdentifierType`, `canonicalIdentifierValue` (`apps/api/src/modules/beneficiaries/beneficiary-registration.helpers.ts`).
- From `@pathways/shared`: `beneficiaryListQuery`, `registerBeneficiaryRequest`, `updateBeneficiaryRequest`, `archiveBeneficiaryRequest`, `enrollBeneficiaryRequest`, `resolveDuplicateRequest`, `journeyStageInput`, `saveJourneyStagesRequest`, `recordJourneyEventRequest`, `correctJourneyEventRequest`, `reserveBeneficiaryMediaRequest`, each with its inferred type (`BeneficiaryListQuery`, `RegisterBeneficiaryRequest`, `UpdateBeneficiaryRequest`, `ArchiveBeneficiaryRequest`, `EnrollBeneficiaryRequest`, `ResolveDuplicateRequest`, `JourneyStageInput`, `SaveJourneyStagesRequest`, `RecordJourneyEventRequest`, `CorrectJourneyEventRequest`, `ReserveBeneficiaryMediaRequest`), plus `beneficiaryMediaContentTypes: readonly string[]` and `MAX_BENEFICIARY_MEDIA_FILES`.
- `JourneyStagesService` (`listStages`, `saveStages(identity, projectId, input: SaveJourneyStagesRequest)`) and `BeneficiaryJourneyService` (`history`, `transitionEnrollment(identity, projectId, beneficiaryId, input: RecordJourneyEventRequest)`, `correctEvent(identity, projectId, beneficiaryId, eventId, input: CorrectJourneyEventRequest)`), both module-internal.

## Global Constraints

- Behavior-preserving: no route, status code, response body, audit row, permission decision, transaction boundary or SQL statement changes. The only accepted differences are 400 message wording on the slice's routes and the prototype keys of ruling 3.
- Direction (CR 3.1): `apps/api/src/common/**` never imports `apps/api/src/modules/**` (non-test files); `common/import-boundary.test.ts` and `packages/shared/src/package-import-boundary.test.ts` must pass at every commit.
- Production api code uses relative imports only; `@app/` is a Vitest alias used by tests.
- Moves are verbatim: `.tmp/s4a/same-lines.mjs` must print the expected result before Biome formats the new files. Split services take the caller's `tx` or open their own `withAuthorizedOperation` exactly where the moved method did.
- Every name exported through `packages/shared/src/index.ts` is unique (TS2308 otherwise).
- Kebab-case file names that describe purpose; comments are one sentence, no emojis; docs prose has no em dashes and no `--`.
- Format touched files with `pnpm exec biome check --write <files>`; `pnpm lint` must pass before every commit. New untracked files need `git add -N` before `git diff --name-only` lists them.
- `pnpm typecheck` rewrites `apps/web/next-env.d.ts`; run `git checkout -- apps/web/next-env.d.ts` before every commit.
- After removing code, delete any import name left with no use (Biome 1.9 recommended rules do not flag unused imports); `move-declarations.mjs` with `"prune": true` does it for the files it is given.
- Do not type `\u` escapes for characters into source; build them with `String.fromCharCode` or `String.fromCodePoint`.
- `same-lines.mjs` arguments may start with `//`; run it with `MSYS_NO_PATHCONV=1` as written, or Git for Windows rewrites them.
- `git ls-files` with `':!*.test.ts'` pathspecs returns nothing in this Git for Windows setup; `git grep` pathspecs work.
- One-off scripts live in `.tmp/s4a/` (gitignored) and are never committed; `.tmp/` also holds logs.
- A `replace-exact.mjs` or `move-declarations.mjs` run that stops on a count or a missing name means an earlier slice changed the anchor: stop and report, do not loosen the anchor.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work in `C:\PATHWAYS` on branch `refactor/s4a-beneficiaries-api`; no new worktree. All paths are relative to `C:\PATHWAYS`. Do not push.
- Do not touch migrations, `.env` files, review evidence or `apps/web`; under `apps/api/prisma` only the seed edits of ruling 14 are allowed.

## Review Focus

1. A beneficiary list request whose `limit` arrives as `' 7 '`, `'1e1'`, `'0x10'` or a repeated `?limit=10`, or is absent, must be accepted as the number the DTO transform produced (25 when absent), and `'0'`, `'51'`, `''` or `'1.5'` must answer 400. Task 1 pins every case in the parity table; Task 2 pins the default and the coercion over HTTP.
2. A profile update that sends only some fields must still write an audit row listing all 12 profile field names in declaration order, as the compiled DTO did. Task 1 pins the DTO instance keys against the contract shape; Task 2 pins the audit row in `beneficiaries.service.test.ts`.
3. A JSON `null` on an optional field (`displayName`, `birthDate`, `ageAtRegistration`, the three locations, a journey `note`, `stageId` or `destinationProjectId`, a stage `id`, `parentStageId`, `terminal` or `description`, a media `note`) must still be accepted and reach the service as `null`. Tasks 1, 3 and 4 pin these rows in the parity tables.
4. An imported registration row must be promoted inside the import's transaction with the same writes after the move, through the injected `BeneficiaryRegistrationService`. Task 6 keeps `imports.chunked-promotion.test.ts`, `imports.f6-gates.test.ts` and `imports.service.test.ts` passing with only their type import changed, and the app module wiring test passes with the new provider registered once; the gates boot the compiled API and run the import smoke.
5. A stage code sent as `' j3.1 '` must be stored as `J3.1`, an absent `terminal` flag as `false`, and a repeated mapped activity id must answer 400. Task 3 pins all three over HTTP and in the contract test.

## Out of S4a (recorded for later sub-projects)

- Web client, feature folder and journey configuration screen (MOD-05, MOD-06, MOD-16 and MOD-17 for beneficiaries): S4b, outlined at the end, including the response contracts of ruling 11.
- The unused `PrismaService` parameter of `ParticipantsService` and the field name `beneficiaries` of `ImportsService`, which now holds the registration service: S5.
- `apps/api/src/common/validation/field-schemas-parity.test.ts` and the class-validator dependency: S8, which deletes the last DTO.
- MOD-B1 (web directory offers `'5-9'`, the API accepts `'0-9'`): a separate Change Record.

---

### Task 0: Branch setup and baseline

**Files:**
- Create: `docs/superpowers/plans/2026-10-11-modularization-s4-beneficiaries.md` (this plan)
- Modify: `docs/index.md` (section 1.6 plan row)

- [ ] **Step 1: Confirm local dev contains S1 to S3 and create the branch**

```bash
cd /c/PATHWAYS
git status --short
git checkout dev
git log --oneline dev | grep -m1 "Merge refactor/s3a-indicators-api into dev"
test -f packages/shared/src/contracts/common/field-schemas.ts && test -f apps/api/src/common/authz/request-identity.ts && echo "S1 kernel present"
grep -c "'apps/api/src/\*\*/\*\.mapper\.ts'," scripts/sad/check.ts
git grep -lE "export const (activityEvidenceContentTypes|MAX_ACTIVITY_EVIDENCE_FILES)|export type ActivityEvidenceContentType" -- packages/shared/src
git grep -cE "^export class (SaveJourneyConfigurationDto|JourneyStageInputDto)" -- apps/api/src/modules/activities/activities.dto.ts
ls docs/superpowers/plans/
git checkout -b refactor/s4a-beneficiaries-api
pnpm install --frozen-lockfile
mkdir -p .tmp/s4a
```

Expected: clean status; the S3a merge commit; `S1 kernel present`; `1`; exactly one shared file path for the evidence constants (write it down as `E`, for example `packages/shared/src/contracts/activities/activity-evidence.ts`); `apps/api/src/modules/activities/activities.dto.ts:2`; install succeeds. If S1's kernel or mapper glob is missing, or `E` is not exactly one file, stop and report (see "Interfaces assumed"). If the journey DTO count is 0, S2 already converted the journey stage DTOs: stop and report, because ruling 2 assigns that contract to S4a. If `ls` lists an S3 plan whose removal step did not run, Step 3 removes it and its `docs/index.md` row too.

- [ ] **Step 2: Record the baseline**

```bash
pnpm --filter @pathways/shared build
pnpm typecheck && pnpm test 2>&1 | grep -E "Tests +[0-9]+"
pnpm sad:test 2>&1 | grep -E "Tests +[0-9]+"
pnpm docs:check 2>&1 | tail -3
pnpm --filter @pathways/web build > .tmp/s4a/web-build-baseline.log 2>&1; echo "exit $?"
grep -E "Middleware" .tmp/s4a/web-build-baseline.log
B=apps/api/src/modules/beneficiaries; P=apps/api/src/modules/participants; M=apps/api/src/modules/beneficiary-media
git hash-object $B/beneficiaries.service.ts $B/beneficiaries.dto.ts $B/beneficiaries.controller.ts $B/identity-review.controller.ts $B/identity-review.service.ts $B/beneficiaries.service.test.ts $B/beneficiary-progress.ts $P/participants.service.ts $P/participants.controller.ts $P/participants.dto.ts $P/participants.service.test.ts $P/journey-note.test.ts $M/beneficiary-media.controller.ts $M/beneficiary-media.dto.ts
wc -l $B/beneficiaries.service.ts $P/participants.service.ts $B/beneficiaries.service.test.ts
git grep -n "new BeneficiariesService(\|new ParticipantsService(" -- apps | wc -l
git grep -n "services\.participants\." -- apps/api/prisma | wc -l
git grep -n "Application profile is required\.'" -- $B $P $M | wc -l
git grep -c "file: 'src/modules/" -- apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts
grep -cE "beneficiaries\.controller\.ts|participants\.controller\.ts|beneficiary-media\.controller\.ts" apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts
git grep -n "Prisma.TransactionClient" -- $B $P $M | grep -v "\.test\.ts" | wc -l
git grep -n "Prisma.TransactionClient" -- apps/api/src | grep -v "\.test\.ts" | wc -l
git grep -nwE "beneficiaryListQuery|BeneficiaryListQuery|registerBeneficiaryRequest|RegisterBeneficiaryRequest|updateBeneficiaryRequest|UpdateBeneficiaryRequest|archiveBeneficiaryRequest|ArchiveBeneficiaryRequest|enrollBeneficiaryRequest|EnrollBeneficiaryRequest|resolveDuplicateRequest|ResolveDuplicateRequest|journeyStageInput|JourneyStageInput|saveJourneyStagesRequest|SaveJourneyStagesRequest|recordJourneyEventRequest|RecordJourneyEventRequest|correctJourneyEventRequest|CorrectJourneyEventRequest|reserveBeneficiaryMediaRequest|ReserveBeneficiaryMediaRequest|BeneficiaryRegistrationService|JourneyStagesService|BeneficiaryJourneyService|auditedProfileFields|BeneficiaryRow|RegistrationContext" -- packages apps/api apps/web/src | wc -l
git checkout -- apps/web/next-env.d.ts
```

Expected: typecheck clean; write down each package's passing and skipped test counts (config, shared, imports, api, web), the sad count, the docs check failure count, the web build exit code (0) and the `Middleware` size (F4a recorded 102 kB). Later tasks compare against these (`B_shared`, `B_api`, `B_web`, `B_sad`, `M0`). The hashes print, in order: `eb11986d54541775a1e405002ef598b36584e5c5`, `3da670cddd055f5e8118003abbb3de3d5697aa04`, `8327445dbec9493df4b13b5232318151e86596da`, `51f49208906a5444178857c0be5ab23d7a57b5f7`, `bdbfd97c3a9c30dcb5f3e790f04cbc38386b1ab5`, `02f31d85848ba909471a8bd7afb874d5317cdb86`, `5cbb4d1bcdec35cf786abdf16352cbf51e6aa1f4`, `36b50b08e33c72500475ab478e107fe14015a345`, `66fac6f38e745c0fea33d66afcb22282244e13b3`, `a26871666e54491fd372fd9910a4c6e95e72cd47`, `720b88de478973713f4d5daf30a939c16c58633b`, `43ec008aecf68a4cb65ec4de784179af1fc2e848`, `12d40fd582b80a331ec03ec65c59ef91a1fa1eda`, `710868f3c59855f96269e54886f72e83e25c904b`; the line counts are 1461, 703 and 871; the greps print `15`, `8`, `4`, a case count (10 at `a101ad7c`; S1 and S2 removed theirs, so expect 7, and write it down as `MC`), `3`, `1`, a production count (48 at `a101ad7c`, fewer after S1 to S3; write it down as `TX`) and `0`. If a hash or any fixed count differs, stop and report: the anchors and counts below were taken at `a101ad7c`. `beneficiary-media.service.ts` is not in the hash list because S2 may have repointed its activities imports; Task 4 edits only lines S2 does not own.

- [ ] **Step 3: Add the plan and commit**

The controller has saved this plan as `docs/superpowers/plans/2026-10-11-modularization-s4-beneficiaries.md`.

In `docs/index.md` section 1.6, add as the last row of the table (and delete any S3 plan row found in Step 1, with `git rm` of that plan file):

```markdown
| [S4 beneficiaries plan](superpowers/plans/2026-10-11-modularization-s4-beneficiaries.md) | 2026-10-11-modularization-s4-beneficiaries.md | 2026-10-11 | S4 of the codebase modularization: S4a beneficiary, journey and media request contracts, beneficiaries and participants services split, registration service for imports; S4b outline | In progress |
```

```bash
git add docs/superpowers/plans/2026-10-11-modularization-s4-beneficiaries.md docs/index.md
pnpm docs:check 2>&1 | tail -3
git commit -m "docs: add the S4 beneficiaries plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Step 2 baseline.

---

### Task 1: Beneficiary request contracts and DTO parity evidence

**Files:**
- Create: `packages/shared/src/contracts/beneficiaries/beneficiary-requests.ts`
- Test: `packages/shared/src/contracts/beneficiaries/beneficiary-requests.test.ts`
- Modify: `packages/shared/src/index.ts` (barrel line)
- Create (deleted again in Task 2): `apps/api/src/modules/beneficiaries/beneficiary-request-parity.test.ts`

**Interfaces:**
- Consumes: `isoDateString`, `lengthString`, `strictIsoDateString`, `trimmedInput`, `uuidString` (S1); `sadddAgeBands` (`packages/shared/src/monitoring/metric-contract.ts`, kept there by S3).
- Produces, from `@pathways/shared`: `beneficiaryListQuery` / `BeneficiaryListQuery` (`limit: number` always present, every filter `T | null | undefined`), `registerBeneficiaryRequest` / `RegisterBeneficiaryRequest` (`formId`, `clientRegistrationId`, `values: Record<string, unknown>`), `updateBeneficiaryRequest` / `UpdateBeneficiaryRequest` (a `z.object(...).strict()` whose `.shape` keys are the 13 DTO fields in DTO order), `archiveBeneficiaryRequest` / `ArchiveBeneficiaryRequest`, `enrollBeneficiaryRequest` / `EnrollBeneficiaryRequest`, `resolveDuplicateRequest` / `ResolveDuplicateRequest`.

- [ ] **Step 1: Write the failing contract test**

Create `packages/shared/src/contracts/beneficiaries/beneficiary-requests.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  beneficiaryListQuery,
  registerBeneficiaryRequest,
  resolveDuplicateRequest,
  updateBeneficiaryRequest,
} from './beneficiary-requests'

const uuid = '10000000-0000-4000-8000-000000000001'
const person = {
  subjectType: 'INDIVIDUAL',
  sex: 'NOT_SPECIFIED',
  disabilityStatus: 'NOT_SPECIFIED',
  expectedUpdatedAt: '2026-09-24T00:00:00.000Z',
}

describe('beneficiary request contracts', () => {
  it('defaults the page size, coerces it from a string and trims the search', () => {
    expect(beneficiaryListQuery.parse({})).toEqual({ limit: 25 })
    expect(beneficiaryListQuery.parse({ limit: '10', search: '  Ana ' })).toEqual({
      limit: 10,
      search: 'Ana',
    })
  })

  it.each([{ limit: '0' }, { limit: '51' }, { search: '   ' }, { ageBand: '5-9' }, { page: '2' }])(
    'rejects the list query %j',
    (query) => {
      expect(beneficiaryListQuery.safeParse(query).success).toBe(false)
    },
  )

  it('keeps registration values as sent', () => {
    const body = { formId: uuid, clientRegistrationId: uuid, values: { a: [1], b: null } }
    expect(registerBeneficiaryRequest.parse(body)).toEqual(body)
    expect(registerBeneficiaryRequest.safeParse({ ...body, values: [] }).success).toBe(false)
  })

  it('keeps null on optional profile fields and lists the audited fields in order', () => {
    const body = { ...person, firstName: null, birthDate: null, ageAtRegistration: null }
    expect(updateBeneficiaryRequest.parse(body)).toEqual(body)
    expect(Object.keys(updateBeneficiaryRequest.shape)).toEqual([
      'subjectType',
      'displayName',
      'firstName',
      'middleName',
      'lastName',
      'sex',
      'birthDate',
      'ageAtRegistration',
      'disabilityStatus',
      'locationBarangay',
      'locationCityMunicipality',
      'locationProvince',
      'expectedUpdatedAt',
    ])
  })

  it.each([
    { birthDate: '2026-02-30' },
    { ageAtRegistration: '26' },
    { ageAtRegistration: 131 },
    { status: 'ACTIVE' },
    JSON.parse('{"__proto__":{"a":1}}'),
    { constructor: { a: 1 } },
  ])('rejects the profile update %j', (extra) => {
    expect(updateBeneficiaryRequest.safeParse({ ...person, ...extra }).success).toBe(false)
  })

  it('accepts only the two duplicate decisions', () => {
    expect(
      resolveDuplicateRequest.safeParse({ leftId: uuid, rightId: uuid, decision: 'LINK' }).success,
    ).toBe(true)
    expect(
      resolveDuplicateRequest.safeParse({ leftId: uuid, rightId: uuid, decision: 'MERGE' }).success,
    ).toBe(false)
  })
})
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/beneficiaries/beneficiary-requests.test.ts`
Expected: FAIL, cannot resolve `./beneficiary-requests`.

- [ ] **Step 2: Create the contracts and export them**

Create `packages/shared/src/contracts/beneficiaries/beneficiary-requests.ts` (key order of `updateBeneficiaryRequest` is load-bearing, ruling 4):

```ts
import { z } from 'zod'

import { sadddAgeBands } from '../../monitoring/metric-contract'
import {
  isoDateString,
  lengthString,
  strictIsoDateString,
  trimmedInput,
  uuidString,
} from '../common/field-schemas'

const beneficiarySexes = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY', 'NOT_SPECIFIED'] as const
const disabilityStatuses = ['WITH_DISABILITY', 'WITHOUT_DISABILITY', 'NOT_SPECIFIED'] as const

// Query of GET beneficiaries/projects/:projectId; limit defaults to 25 and arrives as a string.
export const beneficiaryListQuery = z
  .object({
    search: trimmedInput(lengthString(1, 80)).nullish(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).nullish(),
    sex: z.enum(beneficiarySexes).nullish(),
    disabilityStatus: z.enum(disabilityStatuses).nullish(),
    ageBand: z.enum(sadddAgeBands).nullish(),
    enrollmentStatus: z.enum(['ACTIVE', 'COMPLETED', 'EXITED']).nullish(),
    cursor: uuidString.nullish(),
    limit: z.preprocess(
      (value) => (value === undefined ? 25 : Number(value)),
      z.number().int().min(1).max(50),
    ),
  })
  .strict()
export type BeneficiaryListQuery = z.infer<typeof beneficiaryListQuery>

// Body of POST beneficiaries/projects/:projectId/registrations.
export const registerBeneficiaryRequest = z
  .object({
    formId: uuidString,
    clientRegistrationId: uuidString,
    values: z.record(z.string(), z.unknown()),
  })
  .strict()
export type RegisterBeneficiaryRequest = z.infer<typeof registerBeneficiaryRequest>

// Body of PATCH beneficiaries/projects/:projectId/:beneficiaryId; key order is the audited field order.
export const updateBeneficiaryRequest = z
  .object({
    subjectType: z.enum(['INDIVIDUAL', 'GROUP', 'COMMUNITY']),
    displayName: lengthString(1, 160).nullish(),
    firstName: lengthString(1, 120).nullish(),
    middleName: lengthString(1, 120).nullish(),
    lastName: lengthString(1, 120).nullish(),
    sex: z.enum(beneficiarySexes),
    birthDate: strictIsoDateString.nullish(),
    ageAtRegistration: z.number().int().min(0).max(130).nullish(),
    disabilityStatus: z.enum(disabilityStatuses),
    locationBarangay: lengthString(1, 160).nullish(),
    locationCityMunicipality: lengthString(1, 160).nullish(),
    locationProvince: lengthString(1, 160).nullish(),
    expectedUpdatedAt: isoDateString,
  })
  .strict()
export type UpdateBeneficiaryRequest = z.infer<typeof updateBeneficiaryRequest>

// Body of POST beneficiaries/projects/:projectId/:beneficiaryId/archive.
export const archiveBeneficiaryRequest = z.object({ expectedUpdatedAt: isoDateString }).strict()
export type ArchiveBeneficiaryRequest = z.infer<typeof archiveBeneficiaryRequest>

// Body of POST beneficiaries/projects/:projectId/:beneficiaryId/enrollments.
export const enrollBeneficiaryRequest = z.object({ enrollmentDate: strictIsoDateString }).strict()
export type EnrollBeneficiaryRequest = z.infer<typeof enrollBeneficiaryRequest>

// Body of POST beneficiaries/projects/:projectId/duplicate-candidates/resolve.
export const resolveDuplicateRequest = z
  .object({
    leftId: uuidString,
    rightId: uuidString,
    decision: z.enum(['KEEP_DISTINCT', 'LINK']),
  })
  .strict()
export type ResolveDuplicateRequest = z.infer<typeof resolveDuplicateRequest>
```

Append to `packages/shared/src/index.ts`, as its last line:

```ts
export * from './contracts/beneficiaries/beneficiary-requests'
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/beneficiaries/beneficiary-requests.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 3: Write the parity test**

Create `apps/api/src/modules/beneficiaries/beneficiary-request-parity.test.ts`:

```ts
import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import {
  archiveBeneficiaryRequest,
  beneficiaryListQuery,
  enrollBeneficiaryRequest,
  registerBeneficiaryRequest,
  resolveDuplicateRequest,
  updateBeneficiaryRequest,
} from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import {
  ArchiveBeneficiaryDto,
  BeneficiaryListQueryDto,
  EnrollBeneficiaryDto,
  RegisterBeneficiaryDto,
  ResolveDuplicateDto,
  UpdateBeneficiaryDto,
} from './beneficiaries.dto'

// Same options as main.ts.
const globalPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: false,
})

type Outcome = { accepted: boolean; value: unknown }
type Part = 'body' | 'query'
type Pipe = { transform(value: unknown): unknown }

// Records a pipe rejection, which must be a BadRequestException.
function rejected(error: unknown): Outcome {
  expect(error).toBeInstanceOf(BadRequestException)
  return { accepted: false, value: (error as BadRequestException).getResponse() }
}

// The old route: the global pipe with the DTO as design type, on a fresh copy of the input.
async function viaDto(input: unknown, metatype: new () => object, type: Part): Promise<Outcome> {
  try {
    const dto = await globalPipe.transform(structuredClone(input), { type, metatype })
    return { accepted: true, value: { ...dto } }
  } catch (error) {
    return rejected(error)
  }
}

// The new route: the global pipe with an Object design type, then the zod pipe.
async function viaZod(input: unknown, pipe: Pipe, type: Part): Promise<Outcome> {
  try {
    const value = await globalPipe.transform(structuredClone(input), { type, metatype: Object })
    return { accepted: true, value: pipe.transform(value) }
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
const mixed = 'ABCDEF00-0000-4000-8000-00000000000A'
const grin = String.fromCodePoint(0x1f600)
const person = {
  subjectType: 'INDIVIDUAL',
  firstName: 'Synthetic',
  lastName: 'Person',
  sex: 'NOT_SPECIFIED',
  disabilityStatus: 'NOT_SPECIFIED',
  expectedUpdatedAt: '2026-09-24T00:00:00.000Z',
}
const update = (extra: Record<string, unknown>) => ({ ...person, ...extra })
const register = (extra: Record<string, unknown>) => ({
  formId: uuid,
  clientRegistrationId: uuid,
  values: { beneficiary_code: 'BEN-1' },
  ...extra,
})

type Case = {
  name: string
  dto: new () => object
  pipe: Pipe
  type: Part
  accepted: unknown[]
  rejected: unknown[]
}

const cases: Case[] = [
  {
    name: 'BeneficiaryListQueryDto and beneficiaryListQuery',
    dto: BeneficiaryListQueryDto,
    pipe: new ZodPipe(beneficiaryListQuery),
    type: 'query',
    accepted: [
      {},
      { limit: '10' },
      { limit: '1' },
      { limit: '50' },
      { limit: ' 7 ' },
      { limit: '1e1' },
      { limit: '0x10' },
      { limit: ['10'] },
      { search: '  Ana  ' },
      { search: 'x'.repeat(80) },
      { search: grin.repeat(80) },
      { status: 'ARCHIVED', sex: 'FEMALE', disabilityStatus: 'WITH_DISABILITY' },
      { ageBand: '0-9' },
      { ageBand: 'Unknown' },
      { enrollmentStatus: 'EXITED' },
      { cursor: uuid },
      { cursor: mixed },
      { cursor: '00000000-0000-0000-0000-000000000000' },
    ],
    rejected: [
      { limit: '0' },
      { limit: '51' },
      { limit: '' },
      { limit: 'abc' },
      { limit: '1.5' },
      { limit: ['1', '2'] },
      { search: '' },
      { search: '   ' },
      { search: 'x'.repeat(81) },
      { search: ['a', 'b'] },
      { search: { a: '1' } },
      { status: 'active' },
      { status: ['ACTIVE', 'ARCHIVED'] },
      { sex: 'M' },
      { disabilityStatus: '' },
      { ageBand: '5-9' },
      { enrollmentStatus: 'DROPPED' },
      { cursor: 'abc' },
      { cursor: '10000000-0000-0000-8000-000000000001' },
      { page: '2' },
    ],
  },
  {
    name: 'RegisterBeneficiaryDto and registerBeneficiaryRequest',
    dto: RegisterBeneficiaryDto,
    pipe: new ZodPipe(registerBeneficiaryRequest),
    type: 'body',
    accepted: [
      register({}),
      register({ values: {} }),
      register({ values: { a: [1, 2], b: { c: null }, d: '2026-01-01' } }),
      register({ formId: mixed }),
    ],
    rejected: [
      register({ formId: 'x' }),
      register({ clientRegistrationId: null }),
      register({ values: [] }),
      register({ values: null }),
      register({ values: 'x' }),
      register({ extra: 1 }),
      { formId: uuid, clientRegistrationId: uuid },
      [],
    ],
  },
  {
    name: 'UpdateBeneficiaryDto and updateBeneficiaryRequest',
    dto: UpdateBeneficiaryDto,
    pipe: new ZodPipe(updateBeneficiaryRequest),
    type: 'body',
    accepted: [
      update({}),
      update({ displayName: 'x'.repeat(160), middleName: 'M' }),
      update({ displayName: null, firstName: null, middleName: null, lastName: null }),
      update({ birthDate: '2000-01-01', ageAtRegistration: 26 }),
      update({ birthDate: null, ageAtRegistration: null }),
      update({ birthDate: '2024-02-29' }),
      update({ birthDate: '20000101' }),
      update({ ageAtRegistration: 0 }),
      update({ ageAtRegistration: 130 }),
      update({ firstName: grin.repeat(120) }),
      update({ locationBarangay: 'B', locationCityMunicipality: 'C', locationProvince: 'P' }),
      update({ locationBarangay: null, locationCityMunicipality: null, locationProvince: null }),
      update({ subjectType: 'GROUP', displayName: 'Group' }),
      update({ expectedUpdatedAt: '2026-02-30' }),
      update({ expectedUpdatedAt: '2026-09-24' }),
    ],
    rejected: [
      update({ subjectType: 'PERSON' }),
      update({ subjectType: null }),
      update({ displayName: '' }),
      update({ displayName: 'x'.repeat(161) }),
      update({ firstName: '' }),
      update({ firstName: 'x'.repeat(121) }),
      update({ firstName: 1 }),
      update({ sex: null }),
      update({ sex: 'male' }),
      update({ birthDate: '2026-02-30' }),
      update({ birthDate: '2026-1-1' }),
      update({ birthDate: '' }),
      update({ ageAtRegistration: -1 }),
      update({ ageAtRegistration: 131 }),
      update({ ageAtRegistration: 1.5 }),
      update({ ageAtRegistration: '26' }),
      update({ disabilityStatus: 'NONE' }),
      update({ locationProvince: '' }),
      update({ expectedUpdatedAt: 'yesterday' }),
      update({ expectedUpdatedAt: null }),
      update({ status: 'ACTIVE' }),
      { subjectType: 'INDIVIDUAL', sex: 'NOT_SPECIFIED', disabilityStatus: 'NOT_SPECIFIED' },
      [],
    ],
  },
  {
    name: 'ArchiveBeneficiaryDto and archiveBeneficiaryRequest',
    dto: ArchiveBeneficiaryDto,
    pipe: new ZodPipe(archiveBeneficiaryRequest),
    type: 'body',
    accepted: [
      { expectedUpdatedAt: '2026-09-24T00:00:00.000Z' },
      { expectedUpdatedAt: '2026-09-24' },
      { expectedUpdatedAt: '2026-W01-1' },
    ],
    rejected: [
      {},
      { expectedUpdatedAt: '' },
      { expectedUpdatedAt: 1 },
      { expectedUpdatedAt: '2026-09-24', extra: true },
    ],
  },
  {
    name: 'EnrollBeneficiaryDto and enrollBeneficiaryRequest',
    dto: EnrollBeneficiaryDto,
    pipe: new ZodPipe(enrollBeneficiaryRequest),
    type: 'body',
    accepted: [
      { enrollmentDate: '2026-01-01' },
      { enrollmentDate: '2024-02-29' },
      { enrollmentDate: '2026-01-01T00:00:00Z' },
    ],
    rejected: [
      {},
      { enrollmentDate: '2026-02-29' },
      { enrollmentDate: '2026-13-01' },
      { enrollmentDate: null },
      { enrollmentDate: '2026-01-01', extra: true },
    ],
  },
  {
    name: 'ResolveDuplicateDto and resolveDuplicateRequest',
    dto: ResolveDuplicateDto,
    pipe: new ZodPipe(resolveDuplicateRequest),
    type: 'body',
    accepted: [
      { leftId: uuid, rightId: uuid, decision: 'LINK' },
      { leftId: mixed, rightId: uuid, decision: 'KEEP_DISTINCT' },
    ],
    rejected: [
      { leftId: uuid, rightId: uuid, decision: 'MERGE' },
      { leftId: 'x', rightId: uuid, decision: 'LINK' },
      { leftId: uuid, decision: 'LINK' },
      { leftId: uuid, rightId: uuid, decision: 'LINK', note: 'x' },
    ],
  },
]

describe.each(cases)('$name parity', ({ dto, pipe, type, accepted, rejected: denied }) => {
  it.each(accepted)('both accept %j with the same value', async (input) => {
    const [old, next] = await Promise.all([viaDto(input, dto, type), viaZod(input, pipe, type)])
    expect(old.accepted).toBe(true)
    expect(next).toEqual(old)
  })

  it.each(denied)('both answer the 400 shape for %j', async (input) => {
    expect(await viaDto(input, dto, type)).toEqual(badRequestShape)
    expect(await viaZod(input, pipe, type)).toEqual(badRequestShape)
  })
})

// Ruling 3: the DTO route dropped top-level prototype keys; strict zod rejects them.
describe('UpdateBeneficiaryDto prototype keys', () => {
  it.each(['__proto__', 'constructor'])(
    'only the contract rejects a top-level %s key',
    async (key) => {
      const body = JSON.parse(`{"${key}":{"a":1},${JSON.stringify(person).slice(1)}`)
      expect((await viaDto(body, UpdateBeneficiaryDto, 'body')).accepted).toBe(true)
      expect(await viaZod(body, new ZodPipe(updateBeneficiaryRequest), 'body')).toEqual(
        badRequestShape,
      )
    },
  )
})

// Ruling 3: class-transformer threw a TypeError (500) on a constructor key inside values.
describe('RegisterBeneficiaryDto nested constructor key', () => {
  it('crashed the DTO route and now reaches the service, which rejects the unknown field', async () => {
    const body = `{"formId":"${uuid}","clientRegistrationId":"${uuid}","values":{"constructor":1}}`
    await expect(
      globalPipe.transform(JSON.parse(body), { type: 'body', metatype: RegisterBeneficiaryDto }),
    ).rejects.toBeInstanceOf(TypeError)
    expect(await viaZod(JSON.parse(body), new ZodPipe(registerBeneficiaryRequest), 'body')).toEqual(
      { accepted: true, value: JSON.parse(body) },
    )
  })
})

// Ruling 4: the compiled DTO instance carried every declared field, so the update audit listed all of them.
describe('UpdateBeneficiaryDto audited fields', () => {
  it('lists every declared field in contract shape order whatever the body holds', async () => {
    const old = await viaDto(update({}), UpdateBeneficiaryDto, 'body')
    expect(Object.keys(old.value as object)).toEqual(Object.keys(updateBeneficiaryRequest.shape))
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/beneficiaries/beneficiary-request-parity.test.ts`
Expected: PASS, 113 tests (38 list query, 12 registration, 38 update, 7 archive, 8 enroll and 6 duplicate rows, 2 top-level prototype keys, 1 nested `constructor` key, 1 audited field order). Any failure means a contract differs from its DTO: stop and report the row, do not edit the table to match.

- [ ] **Step 4: Commit the contracts and the evidence**

```bash
git add -N packages/shared apps/api
pnpm exec biome check --write packages/shared/src/contracts/beneficiaries packages/shared/src/index.ts apps/api/src/modules/beneficiaries/beneficiary-request-parity.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/shared test 2>&1 | grep -E "Tests +[0-9]+"
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add packages/shared/src/contracts/beneficiaries packages/shared/src/index.ts apps/api/src/modules/beneficiaries/beneficiary-request-parity.test.ts
git commit -m "feat(shared): add the beneficiary request contracts with their DTO parity test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: shared = `B_shared + 15`, api = `B_api + 113`.

---

### Task 2: Switch the beneficiary and identity review routes

**Files:**
- Test: `apps/api/src/modules/beneficiaries/beneficiaries.controller.validation.test.ts`
- Test: `apps/api/src/modules/beneficiaries/beneficiaries.service.test.ts` (one describe appended)
- Replace: `apps/api/src/modules/beneficiaries/beneficiaries.controller.ts`, `apps/api/src/modules/beneficiaries/identity-review.controller.ts`
- Modify: `apps/api/src/modules/beneficiaries/beneficiaries.service.ts`, `apps/api/src/modules/beneficiaries/identity-review.service.ts`, `apps/api/src/modules/beneficiaries/beneficiaries.dto.ts` (DTO classes removed; the code helpers and `RegistrationContextDto` stay until Task 5)
- Modify: `apps/api/prisma/hosted-realistic-seed.ts`, `apps/api/prisma/local-demo-stage-people.ts` (type import only), `apps/api/src/modules/dashboards/c8-runtime.local.test.ts` (type import only)
- Modify: `apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts` (beneficiaries case)
- Delete: `apps/api/src/modules/beneficiaries/beneficiary-request-parity.test.ts`
- Create (not committed): `.tmp/s4a/replace-exact.mjs`, `.tmp/s4a/move-declarations.mjs`, `.tmp/s4a/task2-edits.json`, `.tmp/s4a/beneficiary-dto-classes.json`

**Interfaces:**
- Consumes: the Task 1 contracts; `ZodPipe` (F3b); `requestIdentity` (S1).
- Produces: `BeneficiariesService.list(identity, projectId, query: BeneficiaryListQuery)`, `register(identity, projectId, input: RegisterBeneficiaryRequest)`, `update(identity, projectId, beneficiaryId, input: UpdateBeneficiaryRequest)`, `archive(identity, projectId, beneficiaryId, input: ArchiveBeneficiaryRequest)`, `enroll(identity, projectId, beneficiaryId, input: EnrollBeneficiaryRequest)`; `IdentityReviewService.resolve(identity, projectId, input: ResolveDuplicateRequest)`.

- [ ] **Step 1: Write the HTTP and audit tests**

Create `apps/api/src/modules/beneficiaries/beneficiaries.controller.validation.test.ts`:

```ts
import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { BeneficiariesController } from './beneficiaries.controller'
import { BeneficiariesService } from './beneficiaries.service'
import { IdentityReviewController } from './identity-review.controller'
import { IdentityReviewService } from './identity-review.service'

const projectId = '10000000-0000-4000-8000-000000000001'
const beneficiaryId = '20000000-0000-4000-8000-000000000002'
const actor = { id: '30000000-0000-4000-8000-000000000003', aal: 'aal2' }
const beneficiaries = {
  list: vi.fn(),
  register: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  enroll: vi.fn(),
}
const review = { resolve: vi.fn() }
const person = {
  subjectType: 'INDIVIDUAL',
  firstName: 'Synthetic',
  lastName: 'Person',
  sex: 'NOT_SPECIFIED',
  disabilityStatus: 'NOT_SPECIFIED',
  expectedUpdatedAt: '2026-09-24T00:00:00.000Z',
}
let app: INestApplication
let base: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [IdentityReviewController, BeneficiariesController],
    providers: [
      { provide: BeneficiariesService, useValue: beneficiaries },
      { provide: IdentityReviewService, useValue: review },
    ],
  }).compile()
  app = module.createNestApplication({ logger: false })
  // Stands in for the identity the auth guard attaches; the guard is not under test here.
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
  base = `http://127.0.0.1:${port}/beneficiaries/projects/${projectId}`
})

beforeEach(() => {
  for (const mock of [...Object.values(beneficiaries), review.resolve])
    mock.mockReset().mockResolvedValue({ id: beneficiaryId })
})
afterAll(async () => app?.close())

// Sends a request with an optional raw JSON body and returns the status and parsed body.
async function send(method: string, url: string, body?: string) {
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body,
  })
  return { status: response.status, body: await response.json() }
}

const badRequest = {
  status: 400,
  body: {
    statusCode: 400,
    error: 'Bad Request',
    message: expect.arrayContaining([expect.any(String)]),
  },
}

describe('beneficiary request validation', () => {
  it('defaults the page size and trims the search on the list query', async () => {
    expect((await send('GET', `${base}?search=%20Ana%20`)).status).toBe(200)
    expect(beneficiaries.list).toHaveBeenCalledWith(actor, projectId, { search: 'Ana', limit: 25 })
  })

  it('coerces a numeric page size from the query string', async () => {
    expect((await send('GET', `${base}?limit=10&ageBand=0-9`)).status).toBe(200)
    expect(beneficiaries.list).toHaveBeenCalledWith(actor, projectId, { limit: 10, ageBand: '0-9' })
  })

  it.each([
    ['a page size above 50', '?limit=51'],
    ['the retired 5-9 age band', '?ageBand=5-9'],
    ['an unknown filter', '?page=2'],
  ])('answers 400 for %s without listing', async (_label, query) => {
    expect(await send('GET', `${base}${query}`)).toEqual(badRequest)
    expect(beneficiaries.list).not.toHaveBeenCalled()
  })

  it('forwards a registration with its values untouched', async () => {
    const body = {
      formId: projectId,
      clientRegistrationId: beneficiaryId,
      values: { beneficiary_code: 'BEN-1', is_minor: false },
    }
    expect((await send('POST', `${base}/registrations`, JSON.stringify(body))).status).toBe(201)
    expect(beneficiaries.register).toHaveBeenCalledWith(actor, projectId, body)
  })

  it('forwards a profile update with null optional fields', async () => {
    const body = { ...person, middleName: null, birthDate: null, ageAtRegistration: 30 }
    const result = await send('PATCH', `${base}/${beneficiaryId}`, JSON.stringify(body))
    expect(result.status).toBe(200)
    expect(beneficiaries.update).toHaveBeenCalledWith(actor, projectId, beneficiaryId, body)
  })

  it.each([
    ['an impossible birth date', 'PATCH', '', { ...person, birthDate: '2026-02-30' }],
    ['a numeric-string age', 'PATCH', '', { ...person, ageAtRegistration: '30' }],
    ['an unparseable version', 'POST', '/archive', { expectedUpdatedAt: 'yesterday' }],
    ['an impossible enrollment date', 'POST', '/enrollments', { enrollmentDate: '2026-02-29' }],
  ])('answers 400 for %s without calling the service', async (_label, method, path, body) => {
    expect(await send(method, `${base}/${beneficiaryId}${path}`, JSON.stringify(body))).toEqual(
      badRequest,
    )
    for (const mock of Object.values(beneficiaries)) expect(mock).not.toHaveBeenCalled()
  })

  it('forwards an archive and an enrollment', async () => {
    const archive = { expectedUpdatedAt: '2026-09-24T00:00:00.000Z' }
    const enroll = { enrollmentDate: '2026-01-01' }
    await send('POST', `${base}/${beneficiaryId}/archive`, JSON.stringify(archive))
    await send('POST', `${base}/${beneficiaryId}/enrollments`, JSON.stringify(enroll))
    expect(beneficiaries.archive).toHaveBeenCalledWith(actor, projectId, beneficiaryId, archive)
    expect(beneficiaries.enroll).toHaveBeenCalledWith(actor, projectId, beneficiaryId, enroll)
  })

  it('validates a duplicate decision before the identity review service', async () => {
    const url = `${base}/duplicate-candidates/resolve`
    const body = { leftId: projectId, rightId: beneficiaryId, decision: 'LINK' }
    expect((await send('POST', url, JSON.stringify(body))).status).toBe(201)
    expect(review.resolve).toHaveBeenCalledWith(actor, projectId, body)
    review.resolve.mockClear()
    expect(await send('POST', url, JSON.stringify({ ...body, decision: 'MERGE' }))).toEqual(
      badRequest,
    )
    expect(review.resolve).not.toHaveBeenCalled()
  })
})
```

Append to the end of `apps/api/src/modules/beneficiaries/beneficiaries.service.test.ts`, after a blank line (Review Focus 2, ruling 4):

```ts
describe('profile update audit', () => {
  const at = new Date('2026-01-01T00:00:00.000Z')
  const row = {
    id: beneficiaryId,
    code: 'GRP-001',
    subjectType: 'GROUP',
    displayName: 'Synthetic Group',
    status: 'ACTIVE',
    birthDate: null,
    ageAtRegistration: null,
    isMinor: false,
    updatedAt: at,
    beneficiaryProjectEnrollment_beneficiary: [
      { id: enrollmentId, enrollmentDate: at, status: 'ACTIVE', updatedAt: at },
    ],
    beneficiaryConsentRecord_beneficiary: [],
  }
  const writeTx = {
    project: { findFirst: vi.fn() },
    beneficiary: { findFirst: vi.fn(), updateMany: vi.fn() },
    beneficiaryProjectEnrollment: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    readState.tx = writeTx
    writeTx.project.findFirst.mockResolvedValue({ id: projectId, startDate: at, endDate: null })
    writeTx.beneficiary.findFirst.mockResolvedValue(row)
    writeTx.beneficiary.updateMany.mockResolvedValue({ count: 1 })
    writeTx.beneficiaryProjectEnrollment.findFirst.mockResolvedValue(null)
  })

  it('lists every profile field whatever the body holds, as the compiled DTO did', async () => {
    const service = new BeneficiariesService({} as PrismaService)
    await service.update(actor, projectId, beneficiaryId, {
      subjectType: 'GROUP',
      displayName: 'Synthetic Group',
      sex: 'NOT_SPECIFIED',
      disabilityStatus: 'NOT_SPECIFIED',
      expectedUpdatedAt: at.toISOString(),
    })
    expect(writeTx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'BENEFICIARY_PROFILE_UPDATED',
        changes: {
          fields: [
            'subjectType',
            'displayName',
            'firstName',
            'middleName',
            'lastName',
            'sex',
            'birthDate',
            'ageAtRegistration',
            'disabilityStatus',
            'locationBarangay',
            'locationCityMunicipality',
            'locationProvince',
          ],
        },
      }),
    })
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/beneficiaries/beneficiaries.controller.validation.test.ts src/modules/beneficiaries/beneficiaries.service.test.ts`
Expected: FAIL, 10 of the 13 HTTP tests (the registration, profile update and archive and enrollment forwards pass) because Vitest emits no decorator metadata and the global pipe forwards every DTO route body raw, and the audit test, because the service still lists only the keys the test sent.

- [ ] **Step 2: Write the edit scripts**

Create `.tmp/s4a/replace-exact.mjs`:

```js
// Applies exact text replacements, failing unless each one matches the expected number of times.
// Usage: node .tmp/s4a/replace-exact.mjs <replacements.json>, a list of [file, from, to, count].
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

Create `.tmp/s4a/move-declarations.mjs`:

```js
// Moves named top-level declarations and class members, verbatim with their leading comments, out of one module.
// Usage: node .tmp/s4a/move-declarations.mjs <source> <plan.json>
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const ts = createRequire(path.resolve('apps/api/package.json'))('typescript')
const [source, planFile] = process.argv.slice(2)
const plan = JSON.parse(readFileSync(planFile, 'utf8'))
const { targets = {}, drop = [], sourceHeader, prune = false } = plan
const text = readFileSync(source, 'utf8')
const file = ts.createSourceFile(source, text, ts.ScriptTarget.Latest, true)

// The declared name of a top-level statement or class member; describe and vi.mock calls go by their first argument.
const nameOf = (node) => {
  if (ts.isVariableStatement(node)) return node.declarationList.declarations[0].name.getText(file)
  const call = ts.isExpressionStatement(node) ? node.expression : undefined
  const callee = call && ts.isCallExpression(call) ? call.expression.getText(file) : undefined
  if (callee === 'describe' || callee === 'vi.mock') return `${callee}:${call.arguments[0].text}`
  return node.name?.getText(file)
}
const exported = (node) =>
  node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false

// A node with its leading comments but without the blank lines before them.
const piece = (node) => text.slice(node.getFullStart(), node.getEnd()).replace(/^\s*\n/, '')

// A class method rewritten as an exported top-level function, one indent level out.
const asFunction = (node) => {
  const comments = text.slice(node.getFullStart(), node.getStart(file)).replace(/^\s*\n/, '')
  const body = text
    .slice(node.getStart(file), node.getEnd())
    .replace(/^(?:private |public )?(async )?/, (_, async) => `export ${async ?? ''}function `)
  return `${comments}${body}`
    .split('\n')
    .map((line) => (line.startsWith('  ') ? line.slice(2) : line))
    .join('\n')
}

const topLevel = new Map(file.statements.filter(nameOf).map((node) => [nameOf(node), node]))
const members = new Map(
  file.statements
    .filter(ts.isClassDeclaration)
    .flatMap((node) => node.members.filter(nameOf).map((member) => [nameOf(member), member])),
)
const removed = []
const take = (map, name) => {
  const node = map.get(name)
  if (!node) throw new Error(`${source} has no declaration named ${name}.`)
  if (removed.includes(node)) throw new Error(`${name} is assigned twice.`)
  removed.push(node)
  return node
}

for (const [target, spec] of Object.entries(targets)) {
  const { header = [], top = [], exportTop = [], functions = [], members: names = [] } = spec
  const pieces = top.map((name) => {
    const node = take(topLevel, name)
    const add = (exportTop === true || exportTop.includes(name)) && !exported(node)
    const comments = text.slice(node.getFullStart(), node.getStart(file)).replace(/^\s*\n/, '')
    return add ? `${comments}export ${text.slice(node.getStart(file), node.getEnd())}` : piece(node)
  })
  pieces.push(...functions.map((name) => asFunction(take(members, name))))
  if (spec.open) {
    const body = names.map((name) => piece(take(members, name))).join('\n\n')
    pieces.push(`${spec.open.join('\n')}\n${body}\n}`)
  }
  const before =
    spec.append && existsSync(target) ? readFileSync(target, 'utf8').trimEnd() : header.join('\n')
  writeFileSync(target, `${[before, ...pieces].join('\n\n').replace(/^\n+/, '')}\n`)
  console.log(`${target}: ${top.length + functions.length} declarations, ${names.length} members`)
}
for (const name of drop) take(topLevel.has(name) ? topLevel : members, name)

// Cut the moved nodes, last first, then replace or prune the source import block.
let rest = text
for (const node of [...removed].sort((a, b) => b.getFullStart() - a.getFullStart()))
  rest = rest.slice(0, node.getFullStart()) + rest.slice(node.getEnd())
const reparsed = () => ts.createSourceFile(source, rest, ts.ScriptTarget.Latest, true)
if (sourceHeader) {
  const first = reparsed().statements.find((node) => !ts.isImportDeclaration(node))
  rest = `${sourceHeader.join('\n')}\n${first ? rest.slice(first.getFullStart()) : ''}`
}
if (prune) {
  const parsed = reparsed()
  const imports = parsed.statements.filter(ts.isImportDeclaration)
  const body = rest.slice(imports.at(-1)?.getEnd() ?? 0)
  // A name counts as used unless it only appears as a property after a single dot.
  const used = (name) =>
    new RegExp(`(?<![\\w$])(?<![^.]\\.)${name.replace('$', '\\$')}(?![\\w$])`).test(body)
  for (const node of [...imports].reverse()) {
    const named = node.importClause?.namedBindings
    if (!named || !ts.isNamedImports(named) || node.importClause.name) continue
    const keep = named.elements.filter((element) => used(element.name.text))
    if (keep.length === named.elements.length) continue
    const names = keep.map((element) => element.getText(parsed)).join(', ')
    const statement = rest.slice(node.getStart(parsed), node.getEnd())
    const replacement = keep.length ? statement.replace(/\{[\s\S]*\}/, `{ ${names} }`) : ''
    const end = keep.length ? node.getEnd() : rest.indexOf('\n', node.getEnd()) + 1
    rest = rest.slice(0, node.getStart(parsed)) + replacement + rest.slice(end)
  }
}
rest = rest.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '\n')
writeFileSync(source, rest.trim() ? rest : '')
const left = rest.trim() ? rest.split('\n').length - 1 : 0
console.log(`${source}: ${removed.length} moved, ${left} lines left`)
```

Create `.tmp/s4a/task2-edits.json` (each entry is `[file, from, to, expected count]`):

```json
[
  [
    "apps/api/src/modules/beneficiaries/beneficiaries.service.ts",
    "import {\n  type FormFieldValidationContract,\n",
    "import {\n  type ArchiveBeneficiaryRequest,\n  type BeneficiaryListQuery,\n  type EnrollBeneficiaryRequest,\n  type FormFieldValidationContract,\n  type RegisterBeneficiaryRequest,\n  type UpdateBeneficiaryRequest,\n",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/beneficiaries.service.ts",
    "  minimumBeneficiaryAge,\n  validateAndNormalizeFormData,\n} from '@pathways/shared'",
    "  minimumBeneficiaryAge,\n  updateBeneficiaryRequest,\n  validateAndNormalizeFormData,\n} from '@pathways/shared'",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/beneficiaries.service.ts",
    "import {\n  type ArchiveBeneficiaryDto,\n  type BeneficiaryListQueryDto,\n  type EnrollBeneficiaryDto,\n  type RegisterBeneficiaryDto,\n  type RegistrationContextDto,\n  type UpdateBeneficiaryDto,\n  canonicalCode,",
    "import {\n  type RegistrationContextDto,\n  canonicalCode,",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/beneficiaries.service.ts",
    "query: BeneficiaryListQueryDto",
    "query: BeneficiaryListQuery",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/beneficiaries.service.ts",
    "input: RegisterBeneficiaryDto",
    "input: RegisterBeneficiaryRequest",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/beneficiaries.service.ts",
    "input: UpdateBeneficiaryDto",
    "input: UpdateBeneficiaryRequest",
    2
  ],
  [
    "apps/api/src/modules/beneficiaries/beneficiaries.service.ts",
    "input: ArchiveBeneficiaryDto",
    "input: ArchiveBeneficiaryRequest",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/beneficiaries.service.ts",
    "input: EnrollBeneficiaryDto",
    "input: EnrollBeneficiaryRequest",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/beneficiaries.service.ts",
    "changes: { fields: Object.keys(input).filter((key) => key !== 'expectedUpdatedAt') },",
    "changes: { fields: auditedProfileFields },",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/beneficiaries.service.ts",
    "type NormalizedValue = string | number | boolean | string[] | null\n",
    "type NormalizedValue = string | number | boolean | string[] | null\n// The compiled update DTO carried every declared field, so the profile update audit lists all of them.\nconst auditedProfileFields = Object.keys(updateBeneficiaryRequest.shape).filter(\n  (key) => key !== 'expectedUpdatedAt',\n)\n",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/identity-review.service.ts",
    "import { writeAuditLog } from '../../common/audit/write-audit-log'\n",
    "import type { ResolveDuplicateRequest } from '@pathways/shared'\nimport { writeAuditLog } from '../../common/audit/write-audit-log'\n",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/identity-review.service.ts",
    "import type { ResolveDuplicateDto } from './beneficiaries.dto'\n",
    "",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/identity-review.service.ts",
    "input: ResolveDuplicateDto",
    "input: ResolveDuplicateRequest",
    1
  ],
  [
    "apps/api/prisma/hosted-realistic-seed.ts",
    "import type { RegisterBeneficiaryDto } from '../src/modules/beneficiaries/beneficiaries.dto'",
    "import type { RegisterBeneficiaryRequest } from '@pathways/shared'",
    1
  ],
  [
    "apps/api/prisma/hosted-realistic-seed.ts",
    "registerDto: RegisterBeneficiaryDto",
    "registerDto: RegisterBeneficiaryRequest",
    1
  ],
  [
    "apps/api/prisma/local-demo-stage-people.ts",
    "import type { RegisterBeneficiaryDto } from '../src/modules/beneficiaries/beneficiaries.dto'",
    "import type { RegisterBeneficiaryRequest } from '@pathways/shared'",
    1
  ],
  [
    "apps/api/prisma/local-demo-stage-people.ts",
    "dto: RegisterBeneficiaryDto",
    "dto: RegisterBeneficiaryRequest",
    1
  ],
  [
    "apps/api/src/modules/dashboards/c8-runtime.local.test.ts",
    "import type { BeneficiaryListQueryDto } from '@app/modules/beneficiaries/beneficiaries.dto'",
    "import type { BeneficiaryListQuery } from '@pathways/shared'",
    1
  ],
  [
    "apps/api/src/modules/dashboards/c8-runtime.local.test.ts",
    "Partial<BeneficiaryListQueryDto>",
    "Partial<BeneficiaryListQuery>",
    1
  ],
  [
    "apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts",
    "  {\n    file: 'src/modules/beneficiaries/beneficiaries.controller.ts',\n    dtoNames: [\n      'ArchiveBeneficiaryDto',\n      'BeneficiaryListQueryDto',\n      'EnrollBeneficiaryDto',\n      'RegisterBeneficiaryDto',\n      'UpdateBeneficiaryDto',\n    ],\n  },\n",
    "",
    1
  ]
]
```

Create `.tmp/s4a/beneficiary-dto-classes.json`:

```json
{
  "drop": [
    "BeneficiaryListQueryDto",
    "RegisterBeneficiaryDto",
    "UpdateBeneficiaryDto",
    "ArchiveBeneficiaryDto",
    "EnrollBeneficiaryDto",
    "ResolveDuplicateDto"
  ],
  "prune": true
}
```

- [ ] **Step 3: Switch the routes and remove the DTO classes**

Replace the whole of `apps/api/src/modules/beneficiaries/beneficiaries.controller.ts` with:

```ts
import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common'

import {
  type ArchiveBeneficiaryRequest,
  type BeneficiaryListQuery,
  type EnrollBeneficiaryRequest,
  type RegisterBeneficiaryRequest,
  type UpdateBeneficiaryRequest,
  archiveBeneficiaryRequest,
  beneficiaryListQuery,
  enrollBeneficiaryRequest,
  registerBeneficiaryRequest,
  updateBeneficiaryRequest,
} from '@pathways/shared'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequireBeneficiaryStepUp } from '../../common/decorators/beneficiary-step-up.decorator'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { BeneficiariesService } from './beneficiaries.service'

@Controller('beneficiaries/projects/:projectId')
export class BeneficiariesController {
  constructor(@Inject(BeneficiariesService) private readonly beneficiaries: BeneficiariesService) {}

  @Get()
  @RequirePermission('beneficiaries.records.read')
  @RequireBeneficiaryStepUp()
  list(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Query(new ZodPipe(beneficiaryListQuery)) query: BeneficiaryListQuery,
  ) {
    return this.beneficiaries.list(requestIdentity(request), projectId, query)
  }

  @Post('registrations')
  @RequirePermission('beneficiaries.records.register')
  @RequireBeneficiaryStepUp()
  register(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body(new ZodPipe(registerBeneficiaryRequest)) body: RegisterBeneficiaryRequest,
  ) {
    return this.beneficiaries.register(requestIdentity(request), projectId, body)
  }

  @Get('registration-context')
  @RequirePermission('beneficiaries.records.register')
  registrationContext(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.beneficiaries.registrationContext(requestIdentity(request), projectId)
  }

  // Provisions only the fixed system template and returns blank definitions, no Beneficiary data,
  // so it follows registration context (no step-up) rather than the registration POST.
  @Post('registration-context/default-form')
  @RequirePermission('beneficiaries.records.register')
  ensureDefaultRegistrationForm(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ) {
    return this.beneficiaries.ensureDefaultRegistrationForm(requestIdentity(request), projectId)
  }

  @Get(':beneficiaryId')
  @RequirePermission('beneficiaries.records.read')
  @RequireBeneficiaryStepUp()
  get(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
  ) {
    return this.beneficiaries.get(requestIdentity(request), projectId, beneficiaryId)
  }

  @Patch(':beneficiaryId')
  @RequirePermission('beneficiaries.profiles.update')
  @RequireBeneficiaryStepUp()
  update(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
    @Body(new ZodPipe(updateBeneficiaryRequest)) body: UpdateBeneficiaryRequest,
  ) {
    return this.beneficiaries.update(requestIdentity(request), projectId, beneficiaryId, body)
  }

  @Post(':beneficiaryId/archive')
  @RequirePermission('beneficiaries.records.archive')
  @RequireBeneficiaryStepUp()
  archive(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
    @Body(new ZodPipe(archiveBeneficiaryRequest)) body: ArchiveBeneficiaryRequest,
  ) {
    return this.beneficiaries.archive(requestIdentity(request), projectId, beneficiaryId, body)
  }

  @Post(':beneficiaryId/enrollments')
  @RequirePermission('beneficiaries.enrollments.manage')
  @RequireBeneficiaryStepUp()
  enroll(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
    @Body(new ZodPipe(enrollBeneficiaryRequest)) body: EnrollBeneficiaryRequest,
  ) {
    return this.beneficiaries.enroll(requestIdentity(request), projectId, beneficiaryId, body)
  }
}
```

Replace the whole of `apps/api/src/modules/beneficiaries/identity-review.controller.ts` with:

```ts
import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common'

import { type ResolveDuplicateRequest, resolveDuplicateRequest } from '@pathways/shared'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequireBeneficiaryStepUp } from '../../common/decorators/beneficiary-step-up.decorator'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { IdentityReviewService } from './identity-review.service'

// Declared before BeneficiariesController so its fixed paths win over ':beneficiaryId'.
@Controller('beneficiaries/projects/:projectId/duplicate-candidates')
export class IdentityReviewController {
  constructor(@Inject(IdentityReviewService) private readonly review: IdentityReviewService) {}

  @Get()
  @RequirePermission('beneficiaries.identities.review')
  @RequireBeneficiaryStepUp()
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.review.candidates(requestIdentity(request), projectId)
  }

  @Post('resolve')
  @RequirePermission('beneficiaries.identities.review')
  @RequireBeneficiaryStepUp()
  resolve(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body(new ZodPipe(resolveDuplicateRequest)) body: ResolveDuplicateRequest,
  ) {
    return this.review.resolve(requestIdentity(request), projectId, body)
  }
}
```

```bash
B=apps/api/src/modules/beneficiaries
node .tmp/s4a/replace-exact.mjs .tmp/s4a/task2-edits.json
node .tmp/s4a/move-declarations.mjs $B/beneficiaries.dto.ts .tmp/s4a/beneficiary-dto-classes.json
git rm -q $B/beneficiary-request-parity.test.ts
git grep -nE "BeneficiaryListQueryDto|RegisterBeneficiaryDto|UpdateBeneficiaryDto|ArchiveBeneficiaryDto|EnrollBeneficiaryDto|ResolveDuplicateDto" -- apps packages
```

Expected: `20 replacements in 6 files`; `apps/api/src/modules/beneficiaries/beneficiaries.dto.ts: 6 moved, 43 lines left` (the three code helpers, their two patterns and `RegistrationContextDto`; the class-validator and class-transformer imports are pruned); the grep prints nothing.

- [ ] **Step 4: Run the tests and commit**

```bash
pnpm exec biome check --write apps/api/src/modules/beneficiaries apps/api/src/modules/dashboards/c8-runtime.local.test.ts apps/api/prisma/hosted-realistic-seed.ts apps/api/prisma/local-demo-stage-people.ts apps/api/src/common/validation
pnpm --filter @pathways/api exec vitest run src/modules/beneficiaries src/common
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api/src/modules/beneficiaries apps/api/src/modules/dashboards/c8-runtime.local.test.ts apps/api/prisma/hosted-realistic-seed.ts apps/api/prisma/local-demo-stage-people.ts apps/api/src/common/validation
git commit -m "refactor(api): validate beneficiary and identity review requests with the shared contracts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: the beneficiaries and common suites pass; api = `B_api + 13` (113 parity removed, 13 HTTP and 1 audit added, 1 metadata case removed).

---

### Task 3: Journey request contracts, parity and route switch

**Files:**
- Create: `packages/shared/src/contracts/journeys/journey-requests.ts`
- Test: `packages/shared/src/contracts/journeys/journey-requests.test.ts`
- Modify: `packages/shared/src/index.ts` (barrel line)
- Create then delete: `apps/api/src/modules/participants/journey-request-parity.test.ts`
- Test: `apps/api/src/modules/participants/journey-routes.validation.test.ts`
- Replace: `apps/api/src/modules/participants/participants.controller.ts`
- Modify: `apps/api/src/modules/participants/participants.service.ts`, `apps/api/src/modules/participants/participants.dto.ts` (DTO classes removed; `normalizedCode` and `normalizedText` stay until Task 7), `apps/api/src/modules/activities/activities.dto.ts` (the two journey stage classes removed, ruling 2)
- Modify: `apps/api/src/modules/participants/journey-note.test.ts`, `apps/api/src/modules/participants/participants.service.test.ts`, `apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts` (participants case)
- Delete: `apps/api/src/modules/activities/journey-stage-code.test.ts` (its eight codes are in the contract test)
- Create (not committed): `.tmp/s4a/task3-edits.json`, `.tmp/s4a/participants-dto-classes.json`, `.tmp/s4a/activities-journey-dto.json`

**Interfaces:**
- Consumes: `hasUniqueItems`, `isoDateString`, `lengthString`, `strictIsoDateString`, `trimmedInput`, `uuidString` (S1); `requestIdentity` (S1); `ZodPipe`.
- Produces, from `@pathways/shared`: `journeyStageInput` / `JourneyStageInput` (`terminal: boolean | null` after the default), `saveJourneyStagesRequest` / `SaveJourneyStagesRequest`, `recordJourneyEventRequest` / `RecordJourneyEventRequest`, `correctJourneyEventRequest` / `CorrectJourneyEventRequest`. `ParticipantsService.saveStages(identity, projectId, input: SaveJourneyStagesRequest)`, `transitionEnrollment(identity, projectId, beneficiaryId, input: RecordJourneyEventRequest)`, `correctEvent(identity, projectId, beneficiaryId, eventId, input: CorrectJourneyEventRequest)`.

- [ ] **Step 1: Write the failing contract test**

Create `packages/shared/src/contracts/journeys/journey-requests.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  correctJourneyEventRequest,
  journeyStageInput,
  recordJourneyEventRequest,
  saveJourneyStagesRequest,
} from './journey-requests'

const stage = { code: 'J1', name: 'Intake', order: 1, type: 'ENTRY', mappedActivityIds: [] }
const codeAccepted = (code: unknown) => journeyStageInput.safeParse({ ...stage, code }).success

describe('journey request contracts', () => {
  it.each(['J1', 'J3.1', 'J3-1', 'FOLLOW_UP', ' j3.1 '])('accepts the stage code %j', (code) => {
    expect(codeAccepted(code)).toBe(true)
  })

  it.each(['J', '.J3', 'J3 1', 'J3/1', 'X'.repeat(41), 12])('rejects the stage code %j', (code) => {
    expect(codeAccepted(code)).toBe(false)
  })

  it('upper-cases the code and defaults an absent terminal flag to false', () => {
    expect(saveJourneyStagesRequest.parse({ stages: [{ ...stage, code: ' j3.1 ' }] })).toEqual({
      stages: [{ ...stage, code: 'J3.1', terminal: false }],
    })
    expect(journeyStageInput.parse({ ...stage, terminal: null }).terminal).toBeNull()
  })

  it('trims a journey note and rejects one left empty', () => {
    const event = { eventType: 'FOLLOW_UP', eventDate: '2026-06-01', description: 'Checked in' }
    expect(recordJourneyEventRequest.parse({ ...event, note: '  Visited  ' }).note).toBe('Visited')
    expect(recordJourneyEventRequest.safeParse({ ...event, note: '   ' }).success).toBe(false)
  })

  it('requires a non-empty correction reason', () => {
    const fix = { eventDate: '2026-06-02', description: 'Corrected' }
    expect(correctJourneyEventRequest.safeParse({ ...fix, reason: 'Typo' }).success).toBe(true)
    expect(correctJourneyEventRequest.safeParse({ ...fix, reason: '' }).success).toBe(false)
  })
})
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/journeys/journey-requests.test.ts`
Expected: FAIL, cannot resolve `./journey-requests`.

- [ ] **Step 2: Create the contracts and export them**

Create `packages/shared/src/contracts/journeys/journey-requests.ts`:

```ts
import { z } from 'zod'

import {
  hasUniqueItems,
  isoDateString,
  lengthString,
  strictIsoDateString,
  trimmedInput,
  uuidString,
} from '../common/field-schemas'

const stageCodePattern = /^[A-Z0-9][A-Z0-9._-]*$/

// One stage of PUT projects/:projectId/journey-stages; the code is trimmed and upper-cased first.
export const journeyStageInput = z
  .object({
    id: uuidString.nullish(),
    code: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
      lengthString(2, 40).refine(
        (value) => stageCodePattern.test(value),
        'Stage codes use capital letters, digits, dots, dashes or underscores.',
      ),
    ),
    name: lengthString(2, 160),
    order: z.number().int().min(1).max(500),
    type: z.enum(['ENTRY', 'CORE', 'BRANCH', 'FOLLOW_UP']),
    parentStageId: uuidString.nullish(),
    terminal: z.boolean().nullish().default(false),
    description: lengthString(0, 2000).nullish(),
    mappedActivityIds: z
      .array(uuidString)
      .max(100)
      .refine(hasUniqueItems, 'must not repeat an activity'),
    expectedUpdatedAt: isoDateString.nullish(),
  })
  .strict()
export type JourneyStageInput = z.infer<typeof journeyStageInput>

// Body of PUT projects/:projectId/journey-stages.
export const saveJourneyStagesRequest = z
  .object({ stages: z.array(journeyStageInput).max(100) })
  .strict()
export type SaveJourneyStagesRequest = z.infer<typeof saveJourneyStagesRequest>

const journeyNote = trimmedInput(lengthString(1, 1000)).nullish()

// Body of POST beneficiaries/projects/:projectId/:beneficiaryId/journey/events.
export const recordJourneyEventRequest = z
  .object({
    eventType: z.enum(['COMPLETION', 'FOLLOW_UP', 'DROPOUT', 'TRANSFER']),
    eventDate: strictIsoDateString,
    description: lengthString(1, 2000),
    stageId: uuidString.nullish(),
    destinationProjectId: uuidString.nullish(),
    note: journeyNote,
  })
  .strict()
export type RecordJourneyEventRequest = z.infer<typeof recordJourneyEventRequest>

// Body of POST beneficiaries/projects/:projectId/:beneficiaryId/journey/events/:eventId/corrections.
export const correctJourneyEventRequest = z
  .object({
    eventDate: strictIsoDateString,
    description: lengthString(1, 2000),
    reason: lengthString(1, 1000),
    note: journeyNote,
    stageId: uuidString.nullish(),
  })
  .strict()
export type CorrectJourneyEventRequest = z.infer<typeof correctJourneyEventRequest>
```

Append to `packages/shared/src/index.ts`, as its last line:

```ts
export * from './contracts/journeys/journey-requests'
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/journeys/journey-requests.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 3: Write the parity test and commit the evidence**

Create `apps/api/src/modules/participants/journey-request-parity.test.ts`:

```ts
import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import {
  correctJourneyEventRequest,
  recordJourneyEventRequest,
  saveJourneyStagesRequest,
} from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { SaveJourneyConfigurationDto } from '../activities/activities.dto'
import { CorrectJourneyEventDto, EnrollmentJourneyEventDto } from './participants.dto'

// Same options as main.ts.
const globalPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: false,
})

type Outcome = { accepted: boolean; value: unknown }
type Pipe = { transform(value: unknown): unknown }

// Records a pipe rejection, which must be a BadRequestException.
function rejected(error: unknown): Outcome {
  expect(error).toBeInstanceOf(BadRequestException)
  return { accepted: false, value: (error as BadRequestException).getResponse() }
}

// Copies a validated DTO, and each nested stage DTO, into plain objects.
const plain = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(plain)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]))
      : value

// The old route: the global pipe with the DTO as design type, on a fresh copy of the body.
async function viaDto(body: unknown, metatype: new () => object): Promise<Outcome> {
  try {
    const dto = await globalPipe.transform(structuredClone(body), { type: 'body', metatype })
    return { accepted: true, value: plain(dto) }
  } catch (error) {
    return rejected(error)
  }
}

// The new route: the global pipe with an Object design type, then the zod pipe.
async function viaZod(body: unknown, pipe: Pipe): Promise<Outcome> {
  try {
    const value = await globalPipe.transform(structuredClone(body), {
      type: 'body',
      metatype: Object,
    })
    return { accepted: true, value: pipe.transform(value) }
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
const other = '10000000-0000-4000-8000-000000000002'
const mixed = 'ABCDEF00-0000-4000-8000-00000000000A'
const event = { eventType: 'FOLLOW_UP', eventDate: '2026-06-01', description: 'Checked in' }
const record = (extra: Record<string, unknown>) => ({ ...event, ...extra })
const fix = { eventDate: '2026-06-02', description: 'Corrected', reason: 'Typo' }
const correct = (extra: Record<string, unknown>) => ({ ...fix, ...extra })
const stage = { code: 'J1', name: 'Intake', order: 1, type: 'ENTRY', mappedActivityIds: [] }
const stages = (...items: Record<string, unknown>[]) => ({
  stages: items.map((item) => ({ ...stage, ...item })),
})

type Case = {
  name: string
  dto: new () => object
  pipe: Pipe
  accepted: unknown[]
  rejected: unknown[]
}

const cases: Case[] = [
  {
    name: 'EnrollmentJourneyEventDto and recordJourneyEventRequest',
    dto: EnrollmentJourneyEventDto,
    pipe: new ZodPipe(recordJourneyEventRequest),
    accepted: [
      record({}),
      record({ eventType: 'COMPLETION' }),
      record({ eventType: 'TRANSFER', destinationProjectId: uuid }),
      record({ stageId: mixed }),
      record({ stageId: null, destinationProjectId: null, note: null }),
      record({ note: '  Brought documents  ' }),
      record({ note: 'x'.repeat(1000) }),
      record({ description: 'x'.repeat(2000) }),
      record({ eventDate: '2024-02-29' }),
      record({ eventDate: '2026-06-01T10:00:00Z' }),
    ],
    rejected: [
      record({ eventType: 'PARTICIPATION' }),
      record({ eventDate: '2026-02-29' }),
      record({ eventDate: '06/01/2026' }),
      record({ description: '' }),
      record({ description: 'x'.repeat(2001) }),
      record({ stageId: 'x' }),
      record({ destinationProjectId: '10000000-0000-0000-8000-000000000001' }),
      record({ note: '' }),
      record({ note: '   ' }),
      record({ note: 'x'.repeat(1001) }),
      record({ note: 42 }),
      record({ reason: 'x' }),
      { eventType: 'FOLLOW_UP', eventDate: '2026-06-01' },
      [],
    ],
  },
  {
    name: 'CorrectJourneyEventDto and correctJourneyEventRequest',
    dto: CorrectJourneyEventDto,
    pipe: new ZodPipe(correctJourneyEventRequest),
    accepted: [
      correct({}),
      correct({ note: '  Clarified  ', stageId: uuid }),
      correct({ note: null, stageId: null }),
      correct({ reason: 'x'.repeat(1000) }),
    ],
    rejected: [
      correct({ reason: '' }),
      correct({ reason: 'x'.repeat(1001) }),
      correct({ description: '' }),
      correct({ eventDate: '2026-13-01' }),
      correct({ note: ' ' }),
      correct({ stageId: 'x' }),
      correct({ eventType: 'FOLLOW_UP' }),
      { eventDate: '2026-06-02', description: 'Corrected' },
    ],
  },
  {
    name: 'SaveJourneyConfigurationDto and saveJourneyStagesRequest',
    dto: SaveJourneyConfigurationDto,
    pipe: new ZodPipe(saveJourneyStagesRequest),
    accepted: [
      { stages: [] },
      stages({}),
      stages({ code: ' j3.1 ' }),
      stages({ code: 'FOLLOW_UP' }),
      stages({ code: 'J3-1' }),
      stages({ id: uuid, expectedUpdatedAt: '2026-06-01T00:00:00.000Z' }),
      stages({ id: null, parentStageId: null, terminal: null, description: null }),
      stages({ terminal: true, description: '' }),
      stages({ description: 'x'.repeat(2000) }),
      stages({ parentStageId: uuid }),
      stages({ mappedActivityIds: [uuid, other] }),
      stages({ mappedActivityIds: [mixed, mixed.toLowerCase()] }),
      stages({ order: 500, type: 'FOLLOW_UP' }),
      stages({ name: 'x'.repeat(160) }),
      stages({ expectedUpdatedAt: '2026-02-30' }),
      stages({ code: 'J1' }, { code: 'J2', order: 2, type: 'CORE' }),
    ],
    rejected: [
      {},
      { stages: null },
      { stages: {} },
      { stages: [1] },
      { stages: [null] },
      stages({ code: 'J' }),
      stages({ code: '.J3' }),
      stages({ code: 'J3 1' }),
      stages({ code: 'J3/1' }),
      stages({ code: 'x'.repeat(41) }),
      stages({ code: 12 }),
      stages({ name: 'x' }),
      stages({ name: 'x'.repeat(161) }),
      stages({ order: 0 }),
      stages({ order: 501 }),
      stages({ order: 1.5 }),
      stages({ order: '1' }),
      stages({ type: 'EXIT' }),
      stages({ id: 'x' }),
      stages({ parentStageId: 'x' }),
      stages({ terminal: 'yes' }),
      stages({ description: 'x'.repeat(2001) }),
      stages({ mappedActivityIds: [uuid, uuid] }),
      stages({ mappedActivityIds: ['x'] }),
      stages({ mappedActivityIds: null }),
      stages({
        mappedActivityIds: Array.from(
          { length: 101 },
          (_, i) => `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        ),
      }),
      stages({ expectedUpdatedAt: 'later' }),
      stages({ extra: true }),
      { stages: Array.from({ length: 101 }, (_, i) => ({ ...stage, order: i + 1 })) },
      { stages: [], extra: true },
    ],
  },
]

describe.each(cases)('$name parity', ({ dto, pipe, accepted, rejected: denied }) => {
  it.each(accepted)('both accept %j with the same value', async (body) => {
    const [old, next] = await Promise.all([viaDto(body, dto), viaZod(body, pipe)])
    expect(old.accepted).toBe(true)
    expect(next).toEqual(old)
  })

  it.each(denied)('both answer the 400 shape for %j', async (body) => {
    expect(await viaDto(body, dto)).toEqual(badRequestShape)
    expect(await viaZod(body, pipe)).toEqual(badRequestShape)
  })
})

describe('journey stage terminal default', () => {
  it('defaults an absent terminal flag to false on both routes', async () => {
    const [old, next] = await Promise.all([
      viaDto(stages({}), SaveJourneyConfigurationDto),
      viaZod(stages({}), new ZodPipe(saveJourneyStagesRequest)),
    ])
    expect((old.value as { stages: { terminal: unknown }[] }).stages[0].terminal).toBe(false)
    expect((next.value as { stages: { terminal: unknown }[] }).stages[0].terminal).toBe(false)
  })
})

// Ruling 3: the DTO routes dropped prototype keys, also inside a stage; strict zod rejects them.
describe('journey prototype keys', () => {
  it.each(['__proto__', 'constructor'])('only the contracts reject a %s key', async (key) => {
    const body = JSON.parse(`{"${key}":{"a":1},${JSON.stringify(event).slice(1)}`)
    expect((await viaDto(body, EnrollmentJourneyEventDto)).accepted).toBe(true)
    expect(await viaZod(body, new ZodPipe(recordJourneyEventRequest))).toEqual(badRequestShape)
    const nested = JSON.parse(`{"stages":[{"${key}":{"a":1},${JSON.stringify(stage).slice(1)}]}`)
    expect((await viaDto(nested, SaveJourneyConfigurationDto)).accepted).toBe(true)
    expect(await viaZod(nested, new ZodPipe(saveJourneyStagesRequest))).toEqual(badRequestShape)
  })
})
```

```bash
pnpm --filter @pathways/api exec vitest run src/modules/participants/journey-request-parity.test.ts
git add -N packages/shared apps/api
pnpm exec biome check --write packages/shared/src/contracts/journeys packages/shared/src/index.ts apps/api/src/modules/participants/journey-request-parity.test.ts
pnpm typecheck && pnpm lint
git checkout -- apps/web/next-env.d.ts
git add packages/shared/src/contracts/journeys packages/shared/src/index.ts apps/api/src/modules/participants/journey-request-parity.test.ts
git commit -m "feat(shared): add the journey request contracts with their DTO parity test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: PASS, 85 tests (24 recorded event, 12 correction and 46 stage configuration rows, 1 terminal default, 2 prototype key cases); stop and report any failing row. Shared = `B_shared + 29`, api = `B_api + 98`.

- [ ] **Step 4: Write the HTTP test**

Create `apps/api/src/modules/participants/journey-routes.validation.test.ts`:

```ts
import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { BeneficiaryJourneyController, JourneyStagesController } from './participants.controller'
import { ParticipantsService } from './participants.service'

const projectId = '10000000-0000-4000-8000-000000000001'
const beneficiaryId = '20000000-0000-4000-8000-000000000002'
const eventId = '40000000-0000-4000-8000-000000000004'
const actor = { id: '30000000-0000-4000-8000-000000000003', aal: 'aal2' }
const participants = { saveStages: vi.fn(), transitionEnrollment: vi.fn(), correctEvent: vi.fn() }
const stage = { code: 'J1', name: 'Intake', order: 1, type: 'ENTRY', mappedActivityIds: [] }
let app: INestApplication
let port: number

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [JourneyStagesController, BeneficiaryJourneyController],
    providers: [{ provide: ParticipantsService, useValue: participants }],
  }).compile()
  app = module.createNestApplication({ logger: false })
  // Stands in for the identity the auth guard attaches; the guard is not under test here.
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
  port = (app.getHttpServer().address() as AddressInfo).port
})

beforeEach(() => {
  for (const mock of Object.values(participants)) mock.mockReset().mockResolvedValue({})
})
afterAll(async () => app?.close())

// Sends a raw JSON body and returns the status with the parsed response body.
async function send(method: 'POST' | 'PUT', path: string, body: unknown) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

const stagesPath = `/projects/${projectId}/journey-stages`
const eventsPath = `/beneficiaries/projects/${projectId}/${beneficiaryId}/journey/events`
const badRequest = {
  status: 400,
  body: {
    statusCode: 400,
    error: 'Bad Request',
    message: expect.arrayContaining([expect.any(String)]),
  },
}

describe('journey request validation', () => {
  it('forwards stages with an upper-cased code and a default terminal flag', async () => {
    const result = await send('PUT', stagesPath, { stages: [{ ...stage, code: ' j3.1 ' }] })
    expect(result.status).toBe(200)
    expect(participants.saveStages).toHaveBeenCalledWith(actor, projectId, {
      stages: [{ ...stage, code: 'J3.1', terminal: false }],
    })
  })

  it('forwards a recorded event with a trimmed note', async () => {
    const body = { eventType: 'FOLLOW_UP', eventDate: '2026-06-01', description: 'Checked in' }
    expect((await send('POST', eventsPath, { ...body, note: '  Visited  ' })).status).toBe(201)
    expect(participants.transitionEnrollment).toHaveBeenCalledWith(
      actor,
      projectId,
      beneficiaryId,
      {
        ...body,
        note: 'Visited',
      },
    )
  })

  it('forwards a correction', async () => {
    const body = { eventDate: '2026-06-02', description: 'Corrected', reason: 'Typo' }
    const result = await send('POST', `${eventsPath}/${eventId}/corrections`, body)
    expect(result.status).toBe(201)
    expect(participants.correctEvent).toHaveBeenCalledWith(
      actor,
      projectId,
      beneficiaryId,
      eventId,
      body,
    )
  })

  it.each([
    ['a stage code with a space', 'PUT', stagesPath, { stages: [{ ...stage, code: 'J3 1' }] }],
    [
      'a repeated mapped activity',
      'PUT',
      stagesPath,
      { stages: [{ ...stage, mappedActivityIds: [projectId, projectId] }] },
    ],
    [
      'a participation event type',
      'POST',
      eventsPath,
      { eventType: 'PARTICIPATION', eventDate: '2026-06-01', description: 'x' },
    ],
    [
      'a blank correction reason',
      'POST',
      `${eventsPath}/${eventId}/corrections`,
      { eventDate: '2026-06-02', description: 'x', reason: '' },
    ],
  ] as const)(
    'answers 400 for %s without calling the service',
    async (_label, method, path, body) => {
      expect(await send(method, path, body)).toEqual(badRequest)
      for (const mock of Object.values(participants)) expect(mock).not.toHaveBeenCalled()
    },
  )
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/participants/journey-routes.validation.test.ts`
Expected: FAIL, 6 of 7 tests (only the correction forward passes; the DTO routes forward raw bodies under Vitest).

- [ ] **Step 5: Switch the routes and remove the DTO classes**

Replace the whole of `apps/api/src/modules/participants/participants.controller.ts` with:

```ts
import { Body, Controller, Get, Inject, Param, Post, Put, Req } from '@nestjs/common'

import {
  type CorrectJourneyEventRequest,
  type RecordJourneyEventRequest,
  type SaveJourneyStagesRequest,
  correctJourneyEventRequest,
  recordJourneyEventRequest,
  saveJourneyStagesRequest,
} from '@pathways/shared'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequireBeneficiaryStepUp } from '../../common/decorators/beneficiary-step-up.decorator'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { ParticipantsService } from './participants.service'

@Controller('projects/:projectId/journey-stages')
export class JourneyStagesController {
  constructor(@Inject(ParticipantsService) private readonly participants: ParticipantsService) {}
  // Project-level configuration read: Admin holds journeys.manage only.
  @Get()
  @RequirePermission('journeys.read', 'journeys.manage')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.participants.listStages(requestIdentity(request), projectId)
  }
  @Put()
  @RequirePermission('journeys.manage')
  save(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body(new ZodPipe(saveJourneyStagesRequest)) body: SaveJourneyStagesRequest,
  ) {
    return this.participants.saveStages(requestIdentity(request), projectId, body)
  }
}

@Controller('beneficiaries/projects/:projectId/:beneficiaryId/journey')
export class BeneficiaryJourneyController {
  constructor(@Inject(ParticipantsService) private readonly participants: ParticipantsService) {}
  @Get()
  @RequirePermission('journeys.read')
  @RequireBeneficiaryStepUp()
  history(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
  ) {
    return this.participants.history(requestIdentity(request), projectId, beneficiaryId)
  }
  @Post('events')
  @RequirePermission('beneficiaries.enrollments.manage')
  @RequireBeneficiaryStepUp()
  transition(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
    @Body(new ZodPipe(recordJourneyEventRequest)) body: RecordJourneyEventRequest,
  ) {
    return this.participants.transitionEnrollment(
      requestIdentity(request),
      projectId,
      beneficiaryId,
      body,
    )
  }
  @Post('events/:eventId/corrections')
  @RequirePermission('participation.record')
  @RequireBeneficiaryStepUp()
  correct(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('beneficiaryId') beneficiaryId: string,
    @Param('eventId') eventId: string,
    @Body(new ZodPipe(correctJourneyEventRequest)) body: CorrectJourneyEventRequest,
  ) {
    return this.participants.correctEvent(
      requestIdentity(request),
      projectId,
      beneficiaryId,
      eventId,
      body,
    )
  }
}
```

Create `.tmp/s4a/task3-edits.json`:

```json
[
  [
    "apps/api/src/modules/participants/participants.service.ts",
    "import { aggregateOnlyRoles, hasAtomicPermission } from '@pathways/shared'\n",
    "import {\n  type CorrectJourneyEventRequest,\n  type RecordJourneyEventRequest,\n  type SaveJourneyStagesRequest,\n  aggregateOnlyRoles,\n  hasAtomicPermission,\n} from '@pathways/shared'\n",
    1
  ],
  [
    "apps/api/src/modules/participants/participants.service.ts",
    "import type { CorrectJourneyEventDto, EnrollmentJourneyEventDto } from './participants.dto'\n",
    "",
    1
  ],
  [
    "apps/api/src/modules/participants/participants.service.ts",
    "    input: {\n      stages: Array<{\n        id?: string\n        code: string\n        name: string\n        order: number\n        type: 'ENTRY' | 'CORE' | 'BRANCH' | 'FOLLOW_UP'\n        parentStageId?: string\n        terminal?: boolean\n        description?: string\n        mappedActivityIds: string[]\n        expectedUpdatedAt?: string\n      }>\n    },\n",
    "    input: SaveJourneyStagesRequest,\n",
    1
  ],
  [
    "apps/api/src/modules/participants/participants.service.ts",
    "input: EnrollmentJourneyEventDto,",
    "input: RecordJourneyEventRequest,",
    1
  ],
  [
    "apps/api/src/modules/participants/participants.service.ts",
    "input: CorrectJourneyEventDto,",
    "input: CorrectJourneyEventRequest,",
    1
  ],
  [
    "apps/api/src/modules/participants/journey-note.test.ts",
    "import { plainToInstance } from 'class-transformer'\nimport { validate } from 'class-validator'\nimport { beforeEach, describe, expect, it, vi } from 'vitest'\n",
    "import { beforeEach, describe, expect, it, vi } from 'vitest'\nimport type { z } from 'zod'\n",
    1
  ],
  [
    "apps/api/src/modules/participants/journey-note.test.ts",
    "import type { PrismaService } from '@app/prisma/prisma.service'\n",
    "import type { PrismaService } from '@app/prisma/prisma.service'\nimport { correctJourneyEventRequest, recordJourneyEventRequest } from '@pathways/shared'\n",
    1
  ],
  [
    "apps/api/src/modules/participants/journey-note.test.ts",
    "import { CorrectJourneyEventDto, EnrollmentJourneyEventDto } from './participants.dto'\n",
    "",
    1
  ],
  [
    "apps/api/src/modules/participants/journey-note.test.ts",
    "const check = async (cls: new () => object, body: Record<string, unknown>) =>\n  validate(plainToInstance(cls, body))",
    "const check = (schema: z.ZodTypeAny, body: Record<string, unknown>) =>\n  schema.safeParse(body).error?.issues ?? []",
    1
  ],
  [
    "apps/api/src/modules/participants/journey-note.test.ts",
    "    const dto = plainToInstance(EnrollmentJourneyEventDto, { ...base, note: `  ${secret}  ` })\n    expect(await validate(dto)).toEqual([])\n    await service.transitionEnrollment(actor, projectId, beneficiaryId, dto)",
    "    const body = recordJourneyEventRequest.parse({ ...base, note: `  ${secret}  ` })\n    await service.transitionEnrollment(actor, projectId, beneficiaryId, body)",
    1
  ],
  [
    "apps/api/src/modules/participants/journey-note.test.ts",
    "await check(EnrollmentJourneyEventDto,",
    "check(recordJourneyEventRequest,",
    4
  ],
  [
    "apps/api/src/modules/participants/journey-note.test.ts",
    "await check(CorrectJourneyEventDto,",
    "check(correctJourneyEventRequest,",
    2
  ],
  [
    "apps/api/src/modules/participants/participants.service.test.ts",
    "import { plainToInstance } from 'class-transformer'\nimport { validate } from 'class-validator'\n",
    "",
    1
  ],
  [
    "apps/api/src/modules/participants/participants.service.test.ts",
    "import { hasAtomicPermission, rolePermissions } from '@pathways/shared'\nimport { CorrectJourneyEventDto } from './participants.dto'\n",
    "import { correctJourneyEventRequest, hasAtomicPermission, rolePermissions } from '@pathways/shared'\n",
    1
  ],
  [
    "apps/api/src/modules/participants/participants.service.test.ts",
    "  it('G-F4-4 requires a non-empty reason at the request boundary', async () => {\n    const dto = plainToInstance(CorrectJourneyEventDto, {\n      eventDate: '2026-06-16',\n      description: 'Fix',\n      reason: '',\n    })\n    expect((await validate(dto)).map((error) => error.property)).toContain('reason')\n  })",
    "  it('G-F4-4 requires a non-empty reason at the request boundary', () => {\n    const parsed = correctJourneyEventRequest.safeParse({\n      eventDate: '2026-06-16',\n      description: 'Fix',\n      reason: '',\n    })\n    expect(parsed.error?.issues.map((issue) => issue.path[0])).toContain('reason')\n  })",
    1
  ],
  [
    "apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts",
    "  {\n    file: 'src/modules/participants/participants.controller.ts',\n    dtoNames: [\n      'SaveJourneyConfigurationDto',\n      'CorrectJourneyEventDto',\n      'EnrollmentJourneyEventDto',\n    ],\n  },\n",
    "",
    1
  ]
]
```

Create `.tmp/s4a/participants-dto-classes.json`:

```json
{
  "drop": [
    "EnrollmentJourneyEventDto",
    "CorrectJourneyEventDto"
  ],
  "prune": true
}
```

Create `.tmp/s4a/activities-journey-dto.json`:

```json
{
  "drop": [
    "JourneyStageInputDto",
    "SaveJourneyConfigurationDto"
  ],
  "prune": true
}
```

```bash
P=apps/api/src/modules/participants
node .tmp/s4a/replace-exact.mjs .tmp/s4a/task3-edits.json
node .tmp/s4a/move-declarations.mjs $P/participants.dto.ts .tmp/s4a/participants-dto-classes.json
node .tmp/s4a/move-declarations.mjs apps/api/src/modules/activities/activities.dto.ts .tmp/s4a/activities-journey-dto.json
git rm -q $P/journey-request-parity.test.ts apps/api/src/modules/activities/journey-stage-code.test.ts
git grep -nE "EnrollmentJourneyEventDto|CorrectJourneyEventDto|SaveJourneyConfigurationDto|JourneyStageInputDto" -- apps packages
```

Expected: `16 replacements in 4 files`; `participants.dto.ts: 2 moved, 13 lines left`; `activities.dto.ts: 2 moved, <n> lines left` (240 at `a101ad7c`; S2 changes that file, so only the `2 moved` is fixed, and `IsBoolean`, used only by `terminal`, is pruned from the class-validator import if nothing else uses it); the grep prints nothing. If the activities file reports `0 lines left`, S2 left nothing else in it: `git rm` it.

- [ ] **Step 6: Run the tests and commit**

```bash
pnpm exec biome check --write apps/api/src/modules/participants apps/api/src/modules/activities/activities.dto.ts apps/api/src/common/validation
pnpm --filter @pathways/api exec vitest run src/modules/participants src/modules/activities src/common
pnpm typecheck && pnpm lint
pnpm --filter @pathways/shared test 2>&1 | grep -E "Tests +[0-9]+"
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api/src/modules/participants apps/api/src/modules/activities apps/api/src/common/validation
git commit -m "refactor(api): validate journey stage and event requests with the shared contracts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass; shared = `B_shared + 29`, api = `B_api + 11` (85 parity and 8 stage code tests removed, 7 HTTP tests added, 1 metadata case removed).

---

### Task 4: Beneficiary media contract, parity and route switch

**Files:**
- Create: `packages/shared/src/contracts/beneficiaries/beneficiary-media-requests.ts`
- Test: `packages/shared/src/contracts/beneficiaries/beneficiary-media-requests.test.ts`
- Modify: `packages/shared/src/index.ts` (barrel line)
- Create then delete: `apps/api/src/modules/beneficiary-media/beneficiary-media-request-parity.test.ts`
- Test: `apps/api/src/modules/beneficiary-media/beneficiary-media.controller.validation.test.ts`
- Modify: `apps/api/src/modules/beneficiary-media/beneficiary-media.controller.ts`, `apps/api/src/modules/beneficiary-media/beneficiary-media.service.ts` (contract import and input type only), `apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts` (media case)
- Delete: `apps/api/src/modules/beneficiary-media/beneficiary-media.dto.ts`
- Create (not committed): `.tmp/s4a/task4-edits.json`

**Interfaces:**
- Consumes: `activityEvidenceContentTypes`, `MAX_ACTIVITY_EVIDENCE_FILES` from the shared module `E` (S2, Task 0); `lengthString` (S1).
- Produces, from `@pathways/shared`: `beneficiaryMediaContentTypes: readonly string[]` (the evidence types without `application/pdf`), `MAX_BENEFICIARY_MEDIA_FILES`, `reserveBeneficiaryMediaRequest` / `ReserveBeneficiaryMediaRequest` (`files[].contentType: ActivityEvidenceContentType`, `note?: string | null`).

- [ ] **Step 1: Write the failing contract test**

Create `packages/shared/src/contracts/beneficiaries/beneficiary-media-requests.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  MAX_BENEFICIARY_MEDIA_FILES,
  beneficiaryMediaContentTypes,
  reserveBeneficiaryMediaRequest,
} from './beneficiary-media-requests'

const file = {
  fileName: 'photo.jpg',
  contentType: 'image/jpeg',
  byteSize: 1,
  sha256: 'a'.repeat(64),
}

describe('beneficiary media request contract', () => {
  it('allows the activity evidence types except documents, up to ten files', () => {
    expect(beneficiaryMediaContentTypes).not.toContain('application/pdf')
    expect(beneficiaryMediaContentTypes).toContain('video/webm')
    expect(MAX_BENEFICIARY_MEDIA_FILES).toBe(10)
  })

  it.each([
    { files: [{ ...file, contentType: 'application/pdf' }] },
    { files: [{ ...file, fileName: 'a/b.jpg' }] },
    { files: Array.from({ length: 11 }, () => file) },
    { files: [file], note: 'x'.repeat(501) },
  ])('rejects %j', (body) => {
    expect(reserveBeneficiaryMediaRequest.safeParse(body).success).toBe(false)
  })

  it('accepts a backslash in a file name, as the DTO did', () => {
    const body = { files: [{ ...file, fileName: 'a\\b.jpg' }] }
    expect(reserveBeneficiaryMediaRequest.parse(body)).toEqual(body)
  })
})
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/beneficiaries/beneficiary-media-requests.test.ts`
Expected: FAIL, cannot resolve `./beneficiary-media-requests`.

- [ ] **Step 2: Create the contract and export it**

Create `packages/shared/src/contracts/beneficiaries/beneficiary-media-requests.ts`. The import of the two evidence constants names the module `E` from Task 0 relative to `packages/shared/src/contracts/beneficiaries/`; with the replay's `contracts/activities/activity-evidence.ts` it reads as below. The file name pattern `/^[^/]+$/` is the DTO's `/^[^\/]+$/` without the redundant escape: it rejects a forward slash only, so a backslash is still accepted (pinned in the test):

```ts
import { z } from 'zod'

import {
  MAX_ACTIVITY_EVIDENCE_FILES,
  activityEvidenceContentTypes,
} from '../activities/activity-evidence'
import { lengthString } from '../common/field-schemas'

// Beneficiary media allows the activity-proof types except documents.
export const beneficiaryMediaContentTypes: readonly string[] = activityEvidenceContentTypes.filter(
  (type) => type !== 'application/pdf',
)
export const MAX_BENEFICIARY_MEDIA_FILES = MAX_ACTIVITY_EVIDENCE_FILES

const beneficiaryMediaFile = z
  .object({
    fileName: lengthString(1, 128).refine(
      (value) => /^[^/]+$/.test(value),
      'must not contain a forward slash',
    ),
    contentType: z
      .enum(activityEvidenceContentTypes)
      .refine(
        (value) => beneficiaryMediaContentTypes.includes(value),
        'is not an allowed media type',
      ),
    // Structural ceiling only; the service enforces the configured EVIDENCE_MAX_FILE_BYTES.
    byteSize: z.number().int().min(1).max(104_857_600),
    sha256: z.string().regex(/^[0-9a-f]{64}$/, 'must be a lowercase SHA-256 hex digest'),
  })
  .strict()

// Body of POST beneficiaries/projects/:projectId/:beneficiaryId/media/reservations.
export const reserveBeneficiaryMediaRequest = z
  .object({
    files: z.array(beneficiaryMediaFile).min(1).max(MAX_BENEFICIARY_MEDIA_FILES),
    note: lengthString(0, 500).nullish(),
  })
  .strict()
export type ReserveBeneficiaryMediaRequest = z.infer<typeof reserveBeneficiaryMediaRequest>
```

Append to `packages/shared/src/index.ts`, as its last line:

```ts
export * from './contracts/beneficiaries/beneficiary-media-requests'
```

Run: `pnpm --filter @pathways/shared exec vitest run src/contracts/beneficiaries/beneficiary-media-requests.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 3: Write the parity test and commit the evidence**

Create `apps/api/src/modules/beneficiary-media/beneficiary-media-request-parity.test.ts`:

```ts
import 'reflect-metadata'

import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import { reserveBeneficiaryMediaRequest } from '@pathways/shared'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { ReserveBeneficiaryMediaDto } from './beneficiary-media.dto'

// Same options as main.ts.
const globalPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  forbidUnknownValues: false,
})
const zodPipe = new ZodPipe(reserveBeneficiaryMediaRequest)

type Outcome = { accepted: boolean; value: unknown }

// Records a pipe rejection, which must be a BadRequestException.
function rejected(error: unknown): Outcome {
  expect(error).toBeInstanceOf(BadRequestException)
  return { accepted: false, value: (error as BadRequestException).getResponse() }
}

// Copies a validated DTO, and each nested file DTO, into plain objects.
const plain = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(plain)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]))
      : value

// The old route: the global pipe with the DTO as design type, on a fresh copy of the body.
async function viaDto(body: unknown): Promise<Outcome> {
  try {
    const dto = await globalPipe.transform(structuredClone(body), {
      type: 'body',
      metatype: ReserveBeneficiaryMediaDto,
    })
    return { accepted: true, value: plain(dto) }
  } catch (error) {
    return rejected(error)
  }
}

// The new route: the global pipe with an Object design type, then the zod pipe.
async function viaZod(body: unknown): Promise<Outcome> {
  try {
    const value = await globalPipe.transform(structuredClone(body), {
      type: 'body',
      metatype: Object,
    })
    return { accepted: true, value: zodPipe.transform(value) }
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
const file = {
  fileName: 'photo.jpg',
  contentType: 'image/jpeg',
  byteSize: 1024,
  sha256: 'a'.repeat(64),
}
const reserve = (patch: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  files: [{ ...file, ...patch }],
  ...extra,
})

const accepted = [
  reserve({}),
  reserve({}, { note: 'Visit photo' }),
  reserve({}, { note: '' }),
  reserve({}, { note: null }),
  reserve({}, { note: 'x'.repeat(500) }),
  reserve({ fileName: 'x'.repeat(128) }),
  reserve({ fileName: 'back\\slash.png', contentType: 'image/png' }),
  reserve({ contentType: 'image/webp' }),
  reserve({ contentType: 'video/mp4' }),
  reserve({ contentType: 'video/quicktime' }),
  reserve({ contentType: 'video/webm' }),
  reserve({ byteSize: 1 }),
  reserve({ byteSize: 104_857_600 }),
  { files: Array.from({ length: 10 }, (_, i) => ({ ...file, fileName: `p${i}.jpg` })) },
]

const denied = [
  {},
  { files: [] },
  { files: null },
  { files: 'x' },
  { files: [1] },
  { files: Array.from({ length: 11 }, () => file) },
  reserve({ fileName: '' }),
  reserve({ fileName: 'x'.repeat(129) }),
  reserve({ fileName: 'a/b.jpg' }),
  reserve({ fileName: 1 }),
  reserve({ contentType: 'application/pdf' }),
  reserve({ contentType: 'image/gif' }),
  reserve({ contentType: 'IMAGE/JPEG' }),
  reserve({ byteSize: 0 }),
  reserve({ byteSize: 104_857_601 }),
  reserve({ byteSize: 1.5 }),
  reserve({ byteSize: '1024' }),
  reserve({ sha256: 'A'.repeat(64) }),
  reserve({ sha256: 'a'.repeat(63) }),
  reserve({ sha256: null }),
  reserve({ extra: true }),
  reserve({}, { note: 'x'.repeat(501) }),
  reserve({}, { note: 5 }),
  reserve({}, { extra: true }),
]

describe('ReserveBeneficiaryMediaDto and reserveBeneficiaryMediaRequest parity', () => {
  it.each(accepted)('both accept %j with the same value', async (body) => {
    const [old, next] = await Promise.all([viaDto(body), viaZod(body)])
    expect(old.accepted).toBe(true)
    expect(next).toEqual(old)
  })

  it.each(denied)('both answer the 400 shape for %j', async (body) => {
    expect(await viaDto(body)).toEqual(badRequestShape)
    expect(await viaZod(body)).toEqual(badRequestShape)
  })

  // Ruling 3: the DTO route dropped prototype keys, also inside a file; strict zod rejects them.
  it.each(['__proto__', 'constructor'])('only the contract rejects a %s key', async (key) => {
    const top = JSON.parse(`{"${key}":{"a":1},${JSON.stringify(reserve({})).slice(1)}`)
    const nested = JSON.parse(`{"files":[{"${key}":{"a":1},${JSON.stringify(file).slice(1)}]}`)
    for (const body of [top, nested]) {
      expect((await viaDto(body)).accepted).toBe(true)
      expect(await viaZod(body)).toEqual(badRequestShape)
    }
  })
})
```

```bash
pnpm --filter @pathways/api exec vitest run src/modules/beneficiary-media/beneficiary-media-request-parity.test.ts
git add -N packages/shared apps/api
pnpm exec biome check --write packages/shared/src/contracts/beneficiaries packages/shared/src/index.ts apps/api/src/modules/beneficiary-media/beneficiary-media-request-parity.test.ts
pnpm typecheck && pnpm lint
git checkout -- apps/web/next-env.d.ts
git add packages/shared/src/contracts/beneficiaries packages/shared/src/index.ts apps/api/src/modules/beneficiary-media/beneficiary-media-request-parity.test.ts
git commit -m "feat(shared): add the beneficiary media request contract with its DTO parity test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: PASS, 40 tests (14 accepted and 24 rejected bodies, 2 prototype key cases); stop and report any failing row. Shared = `B_shared + 35`, api = `B_api + 51`.

- [ ] **Step 4: Write the HTTP test**

Create `apps/api/src/modules/beneficiary-media/beneficiary-media.controller.validation.test.ts`:

```ts
import 'reflect-metadata'

import type { AddressInfo } from 'node:net'
import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { BeneficiaryMediaController } from './beneficiary-media.controller'
import { BeneficiaryMediaService } from './beneficiary-media.service'

const projectId = '10000000-0000-4000-8000-000000000001'
const beneficiaryId = '20000000-0000-4000-8000-000000000002'
const actor = { id: '30000000-0000-4000-8000-000000000003', aal: 'aal2' }
const media = { reserve: vi.fn() }
const file = {
  fileName: 'photo.jpg',
  contentType: 'image/jpeg',
  byteSize: 1024,
  sha256: 'a'.repeat(64),
}
let app: INestApplication
let url: string

beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [BeneficiaryMediaController],
    providers: [{ provide: BeneficiaryMediaService, useValue: media }],
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
  url = `http://127.0.0.1:${port}/beneficiaries/projects/${projectId}/${beneficiaryId}/media/reservations`
})

beforeEach(() => media.reserve.mockReset().mockResolvedValue({ files: [] }))
afterAll(async () => app?.close())

// Posts a JSON body and returns the status with the parsed response body.
async function post(body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

describe('beneficiary media reservation validation', () => {
  it('forwards declared files and a note to the service', async () => {
    const body = { files: [file], note: 'Visit photo' }
    expect((await post(body)).status).toBe(201)
    expect(media.reserve).toHaveBeenCalledWith(actor, projectId, beneficiaryId, body)
  })

  it.each([
    ['a document', { files: [{ ...file, contentType: 'application/pdf' }] }],
    ['a slash in the file name', { files: [{ ...file, fileName: 'a/b.jpg' }] }],
    ['no files', { files: [] }],
    ['an undeclared file key', { files: [{ ...file, path: '/tmp' }] }],
  ])('answers 400 for %s without calling the service', async (_label, body) => {
    expect(await post(body)).toEqual({
      status: 400,
      body: {
        statusCode: 400,
        error: 'Bad Request',
        message: expect.arrayContaining([expect.any(String)]),
      },
    })
    expect(media.reserve).not.toHaveBeenCalled()
  })
})
```

Run: `pnpm --filter @pathways/api exec vitest run src/modules/beneficiary-media/beneficiary-media.controller.validation.test.ts`
Expected: FAIL, 4 of 5 tests (only the valid forward passes).

- [ ] **Step 5: Switch the route and delete the DTO**

Create `.tmp/s4a/task4-edits.json`:

```json
[
  [
    "apps/api/src/modules/beneficiary-media/beneficiary-media.controller.ts",
    "  Controller,\n  ForbiddenException,\n",
    "  Controller,\n",
    1
  ],
  [
    "apps/api/src/modules/beneficiary-media/beneficiary-media.controller.ts",
    "} from '@nestjs/common'\n\nimport type { AuthenticatedRequest } from '../../common/authz/application-identity'\n",
    "} from '@nestjs/common'\n\nimport { type ReserveBeneficiaryMediaRequest, reserveBeneficiaryMediaRequest } from '@pathways/shared'\nimport type { AuthenticatedRequest } from '../../common/authz/application-identity'\nimport { requestIdentity } from '../../common/authz/request-identity'\n",
    1
  ],
  [
    "apps/api/src/modules/beneficiary-media/beneficiary-media.controller.ts",
    "// biome-ignore lint/style/useImportType: Nest validation needs the DTO constructor at runtime.\nimport { ReserveBeneficiaryMediaDto } from './beneficiary-media.dto'\n",
    "import { ZodPipe } from '../../common/validation/zod-pipe'\n",
    1
  ],
  [
    "apps/api/src/modules/beneficiary-media/beneficiary-media.controller.ts",
    "function profile(request: AuthenticatedRequest) {\n  if (!request.user) throw new ForbiddenException('Application profile is required.')\n  return request.user\n}\n\n",
    "",
    1
  ],
  [
    "apps/api/src/modules/beneficiary-media/beneficiary-media.controller.ts",
    "@Body() body: ReserveBeneficiaryMediaDto,",
    "@Body(new ZodPipe(reserveBeneficiaryMediaRequest)) body: ReserveBeneficiaryMediaRequest,",
    1
  ],
  [
    "apps/api/src/modules/beneficiary-media/beneficiary-media.controller.ts",
    "profile(request)",
    "requestIdentity(request)",
    4
  ],
  [
    "apps/api/src/modules/beneficiary-media/beneficiary-media.service.ts",
    "import { aggregateOnlyRoles } from '@pathways/shared'\n",
    "import {\n  MAX_BENEFICIARY_MEDIA_FILES,\n  type ReserveBeneficiaryMediaRequest,\n  aggregateOnlyRoles,\n  beneficiaryMediaContentTypes,\n} from '@pathways/shared'\n",
    1
  ],
  [
    "apps/api/src/modules/beneficiary-media/beneficiary-media.service.ts",
    "import {\n  MAX_BENEFICIARY_MEDIA_FILES,\n  type ReserveBeneficiaryMediaDto,\n  beneficiaryMediaContentTypes,\n} from './beneficiary-media.dto'\n",
    "",
    1
  ],
  [
    "apps/api/src/modules/beneficiary-media/beneficiary-media.service.ts",
    "input: ReserveBeneficiaryMediaDto,",
    "input: ReserveBeneficiaryMediaRequest,",
    1
  ],
  [
    "apps/api/src/common/validation/controller-dto-runtime-metadata.test.ts",
    "  {\n    file: 'src/modules/beneficiary-media/beneficiary-media.controller.ts',\n    dtoNames: ['ReserveBeneficiaryMediaDto'],\n  },\n",
    "",
    1
  ]
]
```

```bash
M=apps/api/src/modules/beneficiary-media
node .tmp/s4a/replace-exact.mjs .tmp/s4a/task4-edits.json
git rm -q $M/beneficiary-media.dto.ts $M/beneficiary-media-request-parity.test.ts
git grep -n "beneficiary-media\.dto\|ReserveBeneficiaryMediaDto" -- apps packages
pnpm exec biome check --write $M apps/api/src/common/validation
```

Expected: `10 replacements in 3 files`; the grep prints nothing. After Biome the controller's import block reads:

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common'

import { type ReserveBeneficiaryMediaRequest, reserveBeneficiaryMediaRequest } from '@pathways/shared'
import type { AuthenticatedRequest } from '../../common/authz/application-identity'
import { requestIdentity } from '../../common/authz/request-identity'
import { RequireBeneficiaryStepUp } from '../../common/decorators/beneficiary-step-up.decorator'
import { RequirePermission } from '../../common/decorators/permission.decorator'
import { ZodPipe } from '../../common/validation/zod-pipe'
import { BeneficiaryMediaService } from './beneficiary-media.service'
```

The enrollment lookup with its inline project scope stays as it is (ruling 10).

- [ ] **Step 6: Run the tests and commit**

```bash
pnpm --filter @pathways/api exec vitest run src/modules/beneficiary-media src/common src/modules/auth/beneficiary-step-up.test.ts
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A apps/api/src/modules/beneficiary-media apps/api/src/common/validation
git commit -m "refactor(api): validate beneficiary media reservations with the shared contract

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: all pass; api = `B_api + 15` (40 parity removed, 5 HTTP added, 1 metadata case removed); the metadata test now holds `MC - 3` cases.

---

### Task 5: Move the beneficiary helpers, mapper and registration context out of BeneficiariesService

**Files:**
- Create: `apps/api/src/modules/beneficiaries/beneficiary-registration.helpers.ts` (code rules from the DTO file; date, text, age, identifier and registration parsing from the service), `apps/api/src/modules/beneficiaries/beneficiaries.helpers.ts` (age band filter, profile edit rule), `apps/api/src/modules/beneficiaries/beneficiaries.mapper.ts` (field and include selections, `contract`, `mapBeneficiary`, `BeneficiaryRow`), `apps/api/src/modules/beneficiaries/registration-context.service.ts` (`RegistrationContext`, `loadRegistrationContext`)
- Modify: `apps/api/src/modules/beneficiaries/beneficiaries.service.ts`, `apps/api/src/modules/beneficiaries/beneficiary-progress.ts` (`Tx`)
- Delete: `apps/api/src/modules/beneficiaries/beneficiaries.dto.ts`
- Test: `apps/api/src/modules/beneficiaries/beneficiaries.helpers.test.ts` (the three profile edit cases move here from `beneficiaries.service.test.ts`, plus two age band cases)
- Create (not committed): `.tmp/s4a/dto-split.json`, `.tmp/s4a/service-split.json`, `.tmp/s4a/task5-renames.json`, `.tmp/s4a/prune.json`, `.tmp/s4a/task5-cut.json`, `.tmp/s4a/progress-tx.json`, `.tmp/s4a/same-lines.mjs`, `.tmp/s4a/cut-blocks.mjs`

**Interfaces:**
- Produces: from `beneficiary-registration.helpers.ts`, `canonicalCode(value: unknown): string | null`, `canonicalIdentifierType(value: unknown): string | null`, `canonicalIdentifierValue(value: unknown): string | null`, `type NormalizedValue`, `exactDate(value: NormalizedValue | undefined, field: string): Date | null`, `yearsAt` (`completedYearsAt`), `businessToday(): Date`, `assertRegistrationAge(birthDate: Date | null, age: number | null, today: Date): void`, `stableValues(value: Record<string, NormalizedValue>): string`, `normalizeIdentifier(value: string): string`, `type RegistrationProfile`, `parseRegistration(values: Record<string, NormalizedValue>, today?: Date): RegistrationProfile`; from `beneficiaries.helpers.ts`, `ageBandWhere(referenceDate: Date, band?: SadddAgeBand): Prisma.BeneficiaryWhereInput`, `assertSubjectProfile(input: UpdateBeneficiaryRequest, current: BeneficiaryRow): void`; from `beneficiaries.mapper.ts`, `fieldSelection`, `contract(field: FieldRow): FormFieldValidationContract`, `scopedIncludes(organizationId: string, projectId: string)`, `type BeneficiaryRow = Prisma.BeneficiaryGetPayload<{ include: ReturnType<typeof scopedIncludes> }>`, `mapBeneficiary(row: BeneficiaryRow, projectId: string)`; from `registration-context.service.ts`, `interface RegistrationContext` (was `RegistrationContextDto`), `loadRegistrationContext(tx: Tx, actor: ApplicationIdentity, projectId: string): Promise<RegistrationContext>`.

- [ ] **Step 1: Write the scripts and plans**

Create `.tmp/s4a/same-lines.mjs`:

```js
// Fails unless the new files hold the original files' non-import lines, ignoring order, indentation, blanks and export keywords.
// Usage: node same-lines.mjs <original...> -- <new...> [new-text=original-text ...] [+added line ...] [~removed line ...]
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const split = args.indexOf('--')
const originals = args.slice(0, split)
const rest = args.slice(split + 1)
const added = rest.filter((arg) => arg.startsWith('+')).map((arg) => arg.slice(1))
const removedLines = rest.filter((arg) => arg.startsWith('~')).map((arg) => arg.slice(1))
const plain = (arg) => !arg.startsWith('+') && !arg.startsWith('~')
const renames = rest
  .filter((arg) => plain(arg) && arg.includes('='))
  .map((arg) => arg.split('='))
const files = rest.filter((arg) => plain(arg) && !arg.includes('='))
const start = /^(?:\/\/|\/\*\*|export\s|const\s|let\s|function\s|async\s|class\s|type\s|interface\s|@)/

// Trimmed declaration lines after the import block, with renames undone in new files and export keywords dropped.
const body = (file, undo = []) => {
  const lines = readFileSync(file, 'utf8').split('\n')
  return lines
    .slice(lines.findIndex((line) => start.test(line)))
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => undo.reduce((text, [from, to]) => text.replaceAll(from, to), line))
    .map((line) => line.replace(/^export /, ''))
}
const count = (lines) => lines.reduce((map, line) => map.set(line, (map.get(line) ?? 0) + 1), new Map())
const before = count([...originals.flatMap((file) => body(file)), ...added])
const after = count([...files.flatMap((file) => body(file, renames)), ...removedLines])
const problems = []
for (const [line, n] of before)
  if ((after.get(line) ?? 0) !== n) problems.push(`original ${n}x, new ${after.get(line) ?? 0}x: ${line}`)
for (const [line, n] of after) if (!before.has(line)) problems.push(`new only ${n}x: ${line}`)
const total = [...before.values()].reduce((a, b) => a + b, 0)
console.log(problems.length ? problems.join('\n') : `same lines: ${total}`)
process.exitCode = problems.length ? 1 : 0
```

Create `.tmp/s4a/cut-blocks.mjs`:

```js
// Cuts line blocks out of files: from an exact first line to the first exact last line after it.
// Usage: node .tmp/s4a/cut-blocks.mjs <blocks.json>, a list of { file, first, last }.
import { readFileSync, writeFileSync } from 'node:fs'

for (const { file, first, last } of JSON.parse(readFileSync(process.argv[2], 'utf8'))) {
  const lines = readFileSync(file, 'utf8').split('\n')
  const start = lines.indexOf(first)
  if (start < 0 || lines.indexOf(first, start + 1) >= 0) throw new Error(`${file}: first line not unique: ${first}`)
  const end = lines.indexOf(last, start)
  if (end < 0) throw new Error(`${file}: last line not found after ${first}`)
  // A blank line left before the cut goes with the block.
  const from = lines[start - 1] === '' ? start - 1 : start
  writeFileSync(file, [...lines.slice(0, from), ...lines.slice(end + 1)].join('\n'))
  console.log(`${file}: cut ${end - from + 1} lines from ${first.trim()}`)
}
```

Create `.tmp/s4a/prune.json`:

```json
{ "prune": true }
```

Create `.tmp/s4a/dto-split.json`:

```json
{
  "targets": {
    "apps/api/src/modules/beneficiaries/beneficiary-registration.helpers.ts": {
      "header": [
        "import { BadRequestException } from '@nestjs/common'",
        "import { readApiEnv } from '@pathways/config'",
        "",
        "import {",
        "  beneficiaryAgeRuleMessages,",
        "  businessCalendarDate,",
        "  completedYearsAt,",
        "  minimumBeneficiaryAge,",
        "} from '@pathways/shared'"
      ],
      "top": [
        "registrationCodePattern",
        "externalIdentifierTypePattern",
        "canonicalCode",
        "canonicalIdentifierType",
        "canonicalIdentifierValue"
      ]
    },
    "apps/api/src/modules/beneficiaries/registration-context.service.ts": {
      "header": [
        "import { ConflictException } from '@nestjs/common'",
        "import { readApiEnv } from '@pathways/config'",
        "import type { Prisma } from '@prisma/client'",
        "",
        "import {",
        "  beneficiaryRegistrationDefinitionErrors,",
        "  businessCalendarDate,",
        "  validateAndNormalizeFormData,",
        "} from '@pathways/shared'",
        "import type { ApplicationIdentity } from '../../common/authz/application-identity'",
        "import type { Tx } from '../../common/prisma/transaction'",
        "import { contract, fieldSelection } from './beneficiaries.mapper'"
      ],
      "top": ["RegistrationContextDto"]
    }
  }
}
```

Create `.tmp/s4a/service-split.json` (the `sourceHeader` is a superset; the prune pass in Step 3 drops what the service no longer uses):

```json
{
  "targets": {
    "apps/api/src/modules/beneficiaries/beneficiary-registration.helpers.ts": {
      "append": true,
      "top": [
        "NormalizedValue",
        "writableProfileFields",
        "exactDate",
        "text",
        "enumValue",
        "yearsAt",
        "businessToday",
        "assertRegistrationAge",
        "stableValues",
        "normalizeIdentifier",
        "RegistrationProfile",
        "parseRegistration"
      ],
      "exportTop": [
        "NormalizedValue",
        "exactDate",
        "yearsAt",
        "businessToday",
        "assertRegistrationAge",
        "stableValues",
        "normalizeIdentifier",
        "RegistrationProfile",
        "parseRegistration"
      ]
    },
    "apps/api/src/modules/beneficiaries/beneficiaries.mapper.ts": {
      "header": [
        "import type { Prisma } from '@prisma/client'",
        "",
        "import type { FormFieldValidationContract } from '@pathways/shared'"
      ],
      "top": [
        "fieldSelection",
        "FieldRow",
        "jsonStrings",
        "contract"
      ],
      "exportTop": [
        "fieldSelection",
        "contract"
      ],
      "functions": [
        "scopedIncludes",
        "mapBeneficiary"
      ]
    },
    "apps/api/src/modules/beneficiaries/beneficiaries.helpers.ts": {
      "header": [
        "import { BadRequestException } from '@nestjs/common'",
        "import type { Prisma } from '@prisma/client'",
        "",
        "import { type UpdateBeneficiaryRequest, beneficiaryAgeRuleMessages } from '@pathways/shared'",
        "import type { BeneficiaryRow } from './beneficiaries.mapper'",
        "import {",
        "  assertRegistrationAge,",
        "  businessToday,",
        "  exactDate,",
        "  yearsAt,",
        "} from './beneficiary-registration.helpers'"
      ],
      "top": [
        "SadddAgeBand",
        "calendarDateParts",
        "calendarDate",
        "yearsBefore",
        "ageBandWhere"
      ],
      "exportTop": [
        "ageBandWhere"
      ],
      "functions": [
        "assertSubjectProfile"
      ]
    },
    "apps/api/src/modules/beneficiaries/registration-context.service.ts": {
      "append": true,
      "top": [
        "DEFAULT_REGISTRATION_TEMPLATE_KEY"
      ],
      "functions": [
        "loadRegistrationContext"
      ]
    }
  },
  "sourceHeader": [
    "import { randomUUID } from 'node:crypto'",
    "import {",
    "  BadRequestException,",
    "  ConflictException,",
    "  ForbiddenException,",
    "  Inject,",
    "  Injectable,",
    "  NotFoundException,",
    "} from '@nestjs/common'",
    "import { Prisma } from '@prisma/client'",
    "",
    "import {",
    "  type ArchiveBeneficiaryRequest,",
    "  type BeneficiaryListQuery,",
    "  type EnrollBeneficiaryRequest,",
    "  type RegisterBeneficiaryRequest,",
    "  type UpdateBeneficiaryRequest,",
    "  beneficiaryRegistrationDefinitionErrors,",
    "  hasAtomicPermission,",
    "  updateBeneficiaryRequest,",
    "  validateAndNormalizeFormData,",
    "} from '@pathways/shared'",
    "import { writeAuditLog } from '../../common/audit/write-audit-log'",
    "import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'",
    "import { withAuthorizedOperation } from '../../common/authz/authorized-operation'",
    "import { projectDateFields, requireScopedProjectRow } from '../../common/authz/scoped-project'",
    "import type { Tx } from '../../common/prisma/transaction'",
    "import { PrismaService } from '../../prisma/prisma.service'",
    "import { ageBandWhere, assertSubjectProfile } from './beneficiaries.helpers'",
    "import { contract, fieldSelection, mapBeneficiary, scopedIncludes } from './beneficiaries.mapper'",
    "import { canReadProgress, loadProgress } from './beneficiary-progress'",
    "import {",
    "  type NormalizedValue,",
    "  type RegistrationProfile,",
    "  businessToday,",
    "  exactDate,",
    "  normalizeIdentifier,",
    "  parseRegistration,",
    "  stableValues,",
    "} from './beneficiary-registration.helpers'",
    "import { type RegistrationContext, loadRegistrationContext } from './registration-context.service'"
  ]
}
```

Create `.tmp/s4a/task5-renames.json` (the three private methods become functions, so their `this.` calls go; `RegistrationContextDto` loses its suffix; the two row types point at the new `BeneficiaryRow` instead of the service class):

```json
[
  ["apps/api/src/modules/beneficiaries/registration-context.service.ts", "RegistrationContextDto", "RegistrationContext", 2],
  ["apps/api/src/modules/beneficiaries/beneficiaries.service.ts", "Promise<RegistrationContextDto>", "Promise<RegistrationContext>", 2],
  ["apps/api/src/modules/beneficiaries/beneficiaries.service.ts", "this.loadRegistrationContext(", "loadRegistrationContext(", 2],
  ["apps/api/src/modules/beneficiaries/beneficiaries.service.ts", "this.mapBeneficiary(", "mapBeneficiary(", 4],
  ["apps/api/src/modules/beneficiaries/beneficiaries.service.ts", "this.scopedIncludes(", "scopedIncludes(", 2],
  ["apps/api/src/modules/beneficiaries/beneficiaries.service.ts", "this.assertSubjectProfile(", "assertSubjectProfile(", 1],
  ["apps/api/src/modules/beneficiaries/beneficiaries.helpers.ts", "current: Awaited<ReturnType<BeneficiariesService['requireBeneficiary']>>,", "current: BeneficiaryRow,", 1],
  ["apps/api/src/modules/beneficiaries/beneficiaries.mapper.ts", "row: Awaited<ReturnType<BeneficiariesService['requireBeneficiary']>>,", "row: BeneficiaryRow,", 1],
  ["apps/api/src/modules/beneficiaries/beneficiaries.mapper.ts", "  } satisfies Prisma.BeneficiaryInclude\n}\n", "  } satisfies Prisma.BeneficiaryInclude\n}\n\n// A beneficiary row read with the scoped enrollment and consent includes.\nexport type BeneficiaryRow = Prisma.BeneficiaryGetPayload<{\n  include: ReturnType<typeof scopedIncludes>\n}>\n", 1]
]
```

Create `.tmp/s4a/task5-cut.json`:

```json
[
  {
    "file": "apps/api/src/modules/beneficiaries/beneficiaries.service.test.ts",
    "first": "    describe('profile edits', () => {",
    "last": "    })"
  }
]
```

Create `.tmp/s4a/progress-tx.json`:

```json
[
  ["apps/api/src/modules/beneficiaries/beneficiary-progress.ts", "import type { Prisma } from '@prisma/client'\n\n", "", 1],
  ["apps/api/src/modules/beneficiaries/beneficiary-progress.ts", "import type { ApplicationIdentity } from '../../common/authz/application-identity'\n", "import type { ApplicationIdentity } from '../../common/authz/application-identity'\nimport type { Tx } from '../../common/prisma/transaction'\n", 1],
  ["apps/api/src/modules/beneficiaries/beneficiary-progress.ts", "  tx: Prisma.TransactionClient,", "  tx: Tx,", 1]
]
```

- [ ] **Step 2: Snapshot the originals**

```bash
B=apps/api/src/modules/beneficiaries
git show HEAD:$B/beneficiaries.service.ts > .tmp/s4a/beneficiaries.service.before.ts
git show HEAD:$B/beneficiaries.dto.ts > .tmp/s4a/beneficiaries.dto.before.ts
```

- [ ] **Step 3: Move the declarations and prove the move**

```bash
B=apps/api/src/modules/beneficiaries
node .tmp/s4a/move-declarations.mjs $B/beneficiaries.dto.ts .tmp/s4a/dto-split.json
node .tmp/s4a/move-declarations.mjs $B/beneficiaries.service.ts .tmp/s4a/service-split.json
node .tmp/s4a/replace-exact.mjs .tmp/s4a/task5-renames.json
for f in beneficiaries.service.ts beneficiary-registration.helpers.ts registration-context.service.ts beneficiaries.mapper.ts beneficiaries.helpers.ts; do node .tmp/s4a/move-declarations.mjs $B/$f .tmp/s4a/prune.json; done
git rm -qf $B/beneficiaries.dto.ts
MSYS_NO_PATHCONV=1 node .tmp/s4a/same-lines.mjs .tmp/s4a/beneficiaries.service.before.ts .tmp/s4a/beneficiaries.dto.before.ts -- $B/beneficiaries.service.ts $B/beneficiary-registration.helpers.ts $B/registration-context.service.ts $B/beneficiaries.mapper.ts $B/beneficiaries.helpers.ts \
 'include: scopedIncludes(=include: this.scopedIncludes(' '...mapBeneficiary(=...this.mapBeneficiary(' 'return mapBeneficiary(=return this.mapBeneficiary(' 'RegistrationContext>=RegistrationContextDto>' 'interface RegistrationContext {=interface RegistrationContextDto {' 'return loadRegistrationContext(=return this.loadRegistrationContext(' 'assertSubjectProfile(input=this.assertSubjectProfile(input' 'async function loadRegistrationContext(=private async loadRegistrationContext(' 'function scopedIncludes(=private scopedIncludes(' 'function mapBeneficiary(=private mapBeneficiary(' 'function assertSubjectProfile(=private assertSubjectProfile(' "current: BeneficiaryRow,=current: Awaited<ReturnType<BeneficiariesService['requireBeneficiary']>>," "row: BeneficiaryRow,=row: Awaited<ReturnType<BeneficiariesService['requireBeneficiary']>>," '+// A beneficiary row read with the scoped enrollment and consent includes.' '+type BeneficiaryRow = Prisma.BeneficiaryGetPayload<{' '+include: ReturnType<typeof scopedIncludes>' '+}>'
```

Expected, in order: `beneficiary-registration.helpers.ts: 5 declarations`, `registration-context.service.ts: 1 declarations`, `beneficiaries.dto.ts: 6 moved, 0 lines left`, `beneficiary-registration.helpers.ts: 12 declarations`, `beneficiaries.mapper.ts: 6 declarations`, `beneficiaries.helpers.ts: 6 declarations`, `registration-context.service.ts: 2 declarations`, `beneficiaries.service.ts: 26 moved, 843 lines left`, `9 replacements in 4 files`, five prune lines with `0 moved` (843, 291, 147, 118 and 153 lines), and `same lines: 1406`. Any other same-lines output names the line that changed: stop and report it.

- [ ] **Step 4: Move the profile edit cases and characterize the age bands**

```bash
node .tmp/s4a/cut-blocks.mjs .tmp/s4a/task5-cut.json
node .tmp/s4a/replace-exact.mjs .tmp/s4a/progress-tx.json
```

Expected: `cut 46 lines from describe('profile edits', () => {` and `3 replacements in 1 files`.

Create `apps/api/src/modules/beneficiaries/beneficiaries.helpers.test.ts` (the first describe is the block just cut, now calling the exported function; the age band cases pin `ageBandWhere` as it was moved):

```ts
import { describe, expect, it } from 'vitest'

import { ageBandWhere, assertSubjectProfile } from './beneficiaries.helpers'

// A calendar date safely after the business date in any time zone.
const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)

describe('profile edits', () => {
  const subjectProfile = assertSubjectProfile as (input: unknown, current: unknown) => void
  const check = (input: Record<string, unknown>) =>
    subjectProfile(
      {
        subjectType: 'INDIVIDUAL',
        firstName: 'Synthetic',
        lastName: 'Legacy',
        sex: 'NOT_SPECIFIED',
        disabilityStatus: 'NOT_SPECIFIED',
        expectedUpdatedAt: '2026-02-01T00:00:00.000Z',
        ...input,
      },
      {
        birthDate: new Date('2023-01-01T00:00:00.000Z'),
        ageAtRegistration: 3,
        isMinor: true,
        beneficiaryProjectEnrollment_beneficiary: [
          { enrollmentDate: new Date('2026-01-01T00:00:00.000Z') },
        ],
      },
    )

  it('keeps a legacy under-5 record editable when birth date and age are unchanged', () => {
    expect(() => check({ birthDate: '2023-01-01', ageAtRegistration: 3 })).not.toThrow()
    expect(() => check({ birthDate: '2023-01-01' })).not.toThrow()
  })

  it('applies the minimum age when the birth date or age changes', () => {
    expect(() => check({ birthDate: '2022-01-01', ageAtRegistration: 4 })).toThrow(
      'Beneficiary must be at least 5 years old.',
    )
    expect(() => check({ birthDate: '2022-01-01' })).toThrow(
      'Beneficiary must be at least 5 years old.',
    )
    expect(() => check({ birthDate: undefined, ageAtRegistration: 4 })).toThrow(
      'Beneficiary must be at least 5 years old.',
    )
    expect(() => check({ birthDate: '2021-01-01', ageAtRegistration: 5 })).not.toThrow()
  })

  it('rejects a changed future birth date with the exact message', () => {
    expect(() => check({ birthDate: future })).toThrow('Date of birth cannot be in the future.')
  })
})

describe('age band filters', () => {
  const end = new Date('2026-12-31T00:00:00.000Z')

  it('bounds each band by whole years before the project end date', () => {
    expect(ageBandWhere(end, '18-24')).toEqual({
      subjectType: 'INDIVIDUAL',
      birthDate: {
        gt: new Date('2001-12-31T00:00:00.000Z'),
        lte: new Date('2008-12-31T00:00:00.000Z'),
      },
    })
    expect(ageBandWhere(end, 'Unknown')).toEqual({ subjectType: 'INDIVIDUAL', birthDate: null })
    expect(ageBandWhere(end)).toEqual({})
  })

  it('clamps a leap-day reference to the last day of February', () => {
    expect(ageBandWhere(new Date('2028-02-29T00:00:00.000Z'), '10-14')).toEqual({
      subjectType: 'INDIVIDUAL',
      birthDate: {
        gt: new Date('2013-02-28T00:00:00.000Z'),
        lte: new Date('2018-02-28T00:00:00.000Z'),
      },
    })
  })
})
```

- [ ] **Step 5: Check and commit**

```bash
B=apps/api/src/modules/beneficiaries
git add -N $B
pnpm exec biome check --write $B
wc -l $B/beneficiaries.service.ts $B/beneficiary-registration.helpers.ts $B/beneficiaries.helpers.ts $B/beneficiaries.mapper.ts $B/registration-context.service.ts
pnpm --filter @pathways/api exec vitest run src/modules/beneficiaries src/modules/imports src/common
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A $B
git commit -m "refactor(api): move beneficiary helpers, mapper and registration context out of BeneficiariesService

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: line counts 843, 291, 152, 115 and 144; all pass; api = `B_api + 17` (5 helper tests added, 3 moved out of the service test).

---

### Task 6: Move registration promotion into BeneficiaryRegistrationService

**Files:**
- Create: `apps/api/src/modules/beneficiaries/beneficiary-registration.service.ts`
- Modify: `apps/api/src/modules/beneficiaries/beneficiaries.service.ts`, `apps/api/src/modules/beneficiaries/beneficiaries.module.ts`
- Modify: `apps/api/src/modules/imports/imports.service.ts` (import and constructor parameter type only), `apps/api/src/modules/imports/imports.chunked-promotion.test.ts`, `apps/api/src/modules/imports/imports.f6-gates.test.ts`, `apps/api/src/modules/imports/imports.service.test.ts` (type import and cast only)
- Modify: `apps/api/src/modules/beneficiaries/registration-context.test.ts`, `apps/api/src/modules/beneficiaries/default-registration-form.test.ts`, `apps/api/src/modules/dashboards/c8-runtime.local.test.ts` (constructor argument)
- Modify: `apps/api/prisma/local-demo-seed.ts`, `apps/api/prisma/defense-demo-seed.ts`, `apps/api/prisma/hosted-realistic-seed.ts` (construction only)
- Create: `apps/api/src/modules/beneficiaries/beneficiary-registration.service.test.ts` (the registration describe of `beneficiaries.service.test.ts`)
- Modify: `apps/api/src/modules/beneficiaries/beneficiaries.service.test.ts`
- Create (not committed): `.tmp/s4a/registration-split.json`, `.tmp/s4a/task6-service.json`, `.tmp/s4a/task6-consumers.json`, `.tmp/s4a/task6-seeds.json`, `.tmp/s4a/registration-test-split.json`, `.tmp/s4a/service-test-split.json`, `.tmp/s4a/task6-tests.json`

**Interfaces:**
- Consumes: the Task 5 helpers and mapper.
- Produces: `BeneficiaryRegistrationService` with `readRegistrationForm` and `promoteRegistration` exactly as listed in "Produced for later slices", and `type RegistrationImportForm`, from `beneficiary-registration.service.ts`; `BeneficiariesService` constructor `(prisma: PrismaService, registration: BeneficiaryRegistrationService)`; `BeneficiariesModule` exports `[BeneficiaryRegistrationService]`; `ImportsService` constructor `(prisma, storage, beneficiaries: BeneficiaryRegistrationService, participants: ParticipantsService)`.

- [ ] **Step 1: Write the plans**

Create `.tmp/s4a/registration-split.json`:

```json
{
  "targets": {
    "apps/api/src/modules/beneficiaries/beneficiary-registration.service.ts": {
      "header": [
        "import { randomUUID } from 'node:crypto'",
        "import {",
        "  BadRequestException,",
        "  ConflictException,",
        "  ForbiddenException,",
        "  Injectable,",
        "  NotFoundException,",
        "} from '@nestjs/common'",
        "import { Prisma } from '@prisma/client'",
        "",
        "import {",
        "  beneficiaryRegistrationDefinitionErrors,",
        "  hasAtomicPermission,",
        "  validateAndNormalizeFormData,",
        "} from '@pathways/shared'",
        "import { writeAuditLog } from '../../common/audit/write-audit-log'",
        "import type { ApplicationIdentity } from '../../common/authz/application-identity'",
        "import type { Tx } from '../../common/prisma/transaction'",
        "import { contract, fieldSelection } from './beneficiaries.mapper'",
        "import {",
        "  type NormalizedValue,",
        "  type RegistrationProfile,",
        "  normalizeIdentifier,",
        "  parseRegistration,",
        "  stableValues,",
        "} from './beneficiary-registration.helpers'"
      ],
      "top": ["registrationFormSelection", "RegistrationImportForm"],
      "members": ["readRegistrationForm", "promoteRegistration", "registrationUpdateData"],
      "open": [
        "// Promotes a direct or imported registration inside the caller's transaction.",
        "@Injectable()",
        "export class BeneficiaryRegistrationService {"
      ]
    }
  }
}
```

Create `.tmp/s4a/task6-service.json`:

```json
[
  [
    "apps/api/src/modules/beneficiaries/beneficiaries.service.ts",
    "  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}",
    "  constructor(\n    @Inject(PrismaService) private readonly prisma: PrismaService,\n    @Inject(BeneficiaryRegistrationService)\n    private readonly registration: BeneficiaryRegistrationService,\n  ) {}",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/beneficiaries.service.ts",
    "await this.promoteRegistration(tx, actor, {",
    "await this.registration.promoteRegistration(tx, actor, {",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/beneficiaries.service.ts",
    "import { canReadProgress, loadProgress } from './beneficiary-progress'\n",
    "import { canReadProgress, loadProgress } from './beneficiary-progress'\nimport { BeneficiaryRegistrationService } from './beneficiary-registration.service'\n",
    1
  ]
]
```

Create `.tmp/s4a/task6-consumers.json`:

```json
[
  [
    "apps/api/src/modules/imports/imports.service.ts",
    "import {\n  BeneficiariesService,\n  type RegistrationImportForm,\n} from '../beneficiaries/beneficiaries.service'\n",
    "import {\n  BeneficiaryRegistrationService,\n  type RegistrationImportForm,\n} from '../beneficiaries/beneficiary-registration.service'\n",
    1
  ],
  [
    "apps/api/src/modules/imports/imports.service.ts",
    "    @Inject(BeneficiariesService) private readonly beneficiaries: BeneficiariesService,\n",
    "    @Inject(BeneficiaryRegistrationService)\n    private readonly beneficiaries: BeneficiaryRegistrationService,\n",
    1
  ],
  [
    "apps/api/src/modules/imports/imports.chunked-promotion.test.ts",
    "import type { BeneficiariesService } from '../beneficiaries/beneficiaries.service'",
    "import type { BeneficiaryRegistrationService } from '../beneficiaries/beneficiary-registration.service'",
    1
  ],
  [
    "apps/api/src/modules/imports/imports.chunked-promotion.test.ts",
    "as unknown as BeneficiariesService,",
    "as unknown as BeneficiaryRegistrationService,",
    1
  ],
  [
    "apps/api/src/modules/imports/imports.f6-gates.test.ts",
    "import type { BeneficiariesService } from '../beneficiaries/beneficiaries.service'",
    "import type { BeneficiaryRegistrationService } from '../beneficiaries/beneficiary-registration.service'",
    1
  ],
  [
    "apps/api/src/modules/imports/imports.f6-gates.test.ts",
    "as unknown as BeneficiariesService,",
    "as unknown as BeneficiaryRegistrationService,",
    1
  ],
  [
    "apps/api/src/modules/imports/imports.service.test.ts",
    "import type { BeneficiariesService } from '../beneficiaries/beneficiaries.service'",
    "import type { BeneficiaryRegistrationService } from '../beneficiaries/beneficiary-registration.service'",
    1
  ],
  [
    "apps/api/src/modules/imports/imports.service.test.ts",
    "as unknown as BeneficiariesService,",
    "as unknown as BeneficiaryRegistrationService,",
    1
  ],
  [
    "apps/api/src/modules/dashboards/c8-runtime.local.test.ts",
    "import { BeneficiariesService } from '@app/modules/beneficiaries/beneficiaries.service'\n",
    "import { BeneficiariesService } from '@app/modules/beneficiaries/beneficiaries.service'\nimport { BeneficiaryRegistrationService } from '@app/modules/beneficiaries/beneficiary-registration.service'\n",
    1
  ],
  [
    "apps/api/src/modules/dashboards/c8-runtime.local.test.ts",
    "new BeneficiariesService(scoped)",
    "new BeneficiariesService(scoped, new BeneficiaryRegistrationService())",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/registration-context.test.ts",
    "new BeneficiariesService({} as PrismaService)",
    "new BeneficiariesService({} as PrismaService, new BeneficiaryRegistrationService())",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/default-registration-form.test.ts",
    "  service = new BeneficiariesService({\n    withVerifiedContext: vi.fn(async (_context, work) => work(tx)),\n  } as unknown as PrismaService)",
    "  service = new BeneficiariesService(\n    { withVerifiedContext: vi.fn(async (_context, work) => work(tx)) } as unknown as PrismaService,\n    new BeneficiaryRegistrationService(),\n  )",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/registration-context.test.ts",
    "import { BeneficiariesService } from './beneficiaries.service'\n",
    "import { BeneficiariesService } from './beneficiaries.service'\nimport { BeneficiaryRegistrationService } from './beneficiary-registration.service'\n",
    1
  ],
  [
    "apps/api/src/modules/beneficiaries/default-registration-form.test.ts",
    "import { BeneficiariesService } from './beneficiaries.service'\n",
    "import { BeneficiariesService } from './beneficiaries.service'\nimport { BeneficiaryRegistrationService } from './beneficiary-registration.service'\n",
    1
  ]
]
```

Create `.tmp/s4a/task6-seeds.json`:

```json
[
  [
    "apps/api/prisma/local-demo-seed.ts",
    "  const beneficiaries = new BeneficiariesService(runtime)\n",
    "  const registration = new BeneficiaryRegistrationService()\n  const beneficiaries = new BeneficiariesService(runtime, registration)\n",
    1
  ],
  [
    "apps/api/prisma/local-demo-seed.ts",
    "new ImportsService(runtime, storage, beneficiaries, participants)",
    "new ImportsService(runtime, storage, registration, participants)",
    1
  ],
  [
    "apps/api/prisma/defense-demo-seed.ts",
    "    const beneficiaries = new BeneficiariesService(runtime)\n",
    "    const registration = new BeneficiaryRegistrationService()\n    const beneficiaries = new BeneficiariesService(runtime, registration)\n",
    1
  ],
  [
    "apps/api/prisma/defense-demo-seed.ts",
    "new ImportsService(runtime, storage, beneficiaries, participants)",
    "new ImportsService(runtime, storage, registration, participants)",
    1
  ],
  [
    "apps/api/prisma/hosted-realistic-seed.ts",
    "new BeneficiariesService(runtime)",
    "new BeneficiariesService(runtime, new BeneficiaryRegistrationService())",
    1
  ],
  [
    "apps/api/prisma/local-demo-seed.ts",
    "import { BeneficiariesService } from '../src/modules/beneficiaries/beneficiaries.service'\n",
    "import { BeneficiariesService } from '../src/modules/beneficiaries/beneficiaries.service'\nimport { BeneficiaryRegistrationService } from '../src/modules/beneficiaries/beneficiary-registration.service'\n",
    1
  ],
  [
    "apps/api/prisma/defense-demo-seed.ts",
    "import { BeneficiariesService } from '../src/modules/beneficiaries/beneficiaries.service'\n",
    "import { BeneficiariesService } from '../src/modules/beneficiaries/beneficiaries.service'\nimport { BeneficiaryRegistrationService } from '../src/modules/beneficiaries/beneficiary-registration.service'\n",
    1
  ],
  [
    "apps/api/prisma/hosted-realistic-seed.ts",
    "import { BeneficiariesService } from '../src/modules/beneficiaries/beneficiaries.service'\n",
    "import { BeneficiariesService } from '../src/modules/beneficiaries/beneficiaries.service'\nimport { BeneficiaryRegistrationService } from '../src/modules/beneficiaries/beneficiary-registration.service'\n",
    1
  ]
]
```

Create `.tmp/s4a/registration-test-split.json`:

```json
{
  "drop": [
    "readState",
    "vi.mock:../../common/authz/authorized-operation",
    "otherProjectId",
    "describe:F3 scoped read and denial gates",
    "describe:directory progress rules",
    "describe:profile update audit"
  ]
}
```

Create `.tmp/s4a/service-test-split.json`:

```json
{
  "drop": [
    "vi.mock:node:crypto",
    "formId",
    "submissionId",
    "registrationId",
    "field",
    "fields",
    "values",
    "describe:P04 beneficiary registration service"
  ]
}
```

Create `.tmp/s4a/task6-tests.json`:

```json
[
  ["apps/api/src/modules/beneficiaries/beneficiary-registration.service.test.ts", "import { BeneficiariesService } from './beneficiaries.service'", "import { BeneficiaryRegistrationService } from './beneficiary-registration.service'", 1],
  ["apps/api/src/modules/beneficiaries/beneficiary-registration.service.test.ts", "let service: BeneficiariesService", "let service: BeneficiaryRegistrationService", 1],
  ["apps/api/src/modules/beneficiaries/beneficiary-registration.service.test.ts", "service = new BeneficiariesService({} as PrismaService)", "service = new BeneficiaryRegistrationService()", 1],
  ["apps/api/src/modules/beneficiaries/beneficiaries.service.test.ts", "new BeneficiariesService({} as PrismaService)", "new BeneficiariesService({} as PrismaService, new BeneficiaryRegistrationService())", 2],
  ["apps/api/src/modules/beneficiaries/beneficiaries.service.test.ts", "import { canReadProgress, progressPercent } from './beneficiary-progress'\n", "import { canReadProgress, progressPercent } from './beneficiary-progress'\nimport { BeneficiaryRegistrationService } from './beneficiary-registration.service'\n", 1]
]
```

- [ ] **Step 2: Move the promotion and prove the move**

```bash
B=apps/api/src/modules/beneficiaries
git show HEAD:$B/beneficiaries.service.ts > .tmp/s4a/beneficiaries.service.task6-before.ts
node .tmp/s4a/move-declarations.mjs $B/beneficiaries.service.ts .tmp/s4a/registration-split.json
node .tmp/s4a/replace-exact.mjs .tmp/s4a/task6-service.json
node .tmp/s4a/move-declarations.mjs $B/beneficiaries.service.ts .tmp/s4a/prune.json
node .tmp/s4a/move-declarations.mjs $B/beneficiary-registration.service.ts .tmp/s4a/prune.json
MSYS_NO_PATHCONV=1 node .tmp/s4a/same-lines.mjs .tmp/s4a/beneficiaries.service.task6-before.ts -- $B/beneficiaries.service.ts $B/beneficiary-registration.service.ts 'await this.registration.promoteRegistration(tx, actor, {=await this.promoteRegistration(tx, actor, {' '~constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}' '+constructor(' '+@Inject(PrismaService) private readonly prisma: PrismaService,' '+@Inject(BeneficiaryRegistrationService)' '+private readonly registration: BeneficiaryRegistrationService,' '+) {}' "+// Promotes a direct or imported registration inside the caller's transaction." '+@Injectable()' '+class BeneficiaryRegistrationService {' '+}'
```

Expected: `beneficiary-registration.service.ts: 2 declarations, 3 members`, `beneficiaries.service.ts: 5 moved, 416 lines left`, `3 replacements in 1 files`, `beneficiaries.service.ts: 0 moved, 402 lines left`, `beneficiary-registration.service.ts: 0 moved, 457 lines left`, `same lines: 785`.

- [ ] **Step 3: Wire Nest, imports and the seeds**

Replace the whole of `apps/api/src/modules/beneficiaries/beneficiaries.module.ts` with:

```ts
import { Module } from '@nestjs/common'

import { BeneficiariesController } from './beneficiaries.controller'
import { BeneficiariesService } from './beneficiaries.service'
import { BeneficiaryRegistrationService } from './beneficiary-registration.service'
import { IdentityReviewController } from './identity-review.controller'
import { IdentityReviewService } from './identity-review.service'

@Module({
  controllers: [IdentityReviewController, BeneficiariesController],
  providers: [BeneficiariesService, BeneficiaryRegistrationService, IdentityReviewService],
  exports: [BeneficiaryRegistrationService],
})
export class BeneficiariesModule {}
```

```bash
node .tmp/s4a/replace-exact.mjs .tmp/s4a/task6-consumers.json
node .tmp/s4a/replace-exact.mjs .tmp/s4a/task6-seeds.json
git grep -n "BeneficiariesService" -- apps/api/src/modules/imports
```

Expected: `14 replacements in 7 files`, `8 replacements in 3 files`; the grep prints nothing (imports now names only `BeneficiaryRegistrationService`).

- [ ] **Step 4: Split the service test by concern**

```bash
B=apps/api/src/modules/beneficiaries
cp $B/beneficiaries.service.test.ts $B/beneficiary-registration.service.test.ts
node .tmp/s4a/move-declarations.mjs $B/beneficiary-registration.service.test.ts .tmp/s4a/registration-test-split.json
node .tmp/s4a/move-declarations.mjs $B/beneficiaries.service.test.ts .tmp/s4a/service-test-split.json
node .tmp/s4a/replace-exact.mjs .tmp/s4a/task6-tests.json
for f in beneficiary-registration.service.test.ts beneficiaries.service.test.ts; do node .tmp/s4a/move-declarations.mjs $B/$f .tmp/s4a/prune.json; done
```

Expected: `6 moved, 644 lines left`, `8 moved, 283 lines left`, `5 replacements in 2 files`, then `636` and `279` lines left.

- [ ] **Step 5: Check and commit**

```bash
B=apps/api/src/modules/beneficiaries
git add -N $B
pnpm exec biome check --write $B apps/api/src/modules/imports apps/api/src/modules/dashboards/c8-runtime.local.test.ts apps/api/prisma
wc -l $B/beneficiaries.service.ts $B/beneficiary-registration.service.ts $B/beneficiaries.service.test.ts $B/beneficiary-registration.service.test.ts
pnpm --filter @pathways/api exec vitest run src/modules/beneficiaries src/modules/imports src/app-module-wiring.test.ts src/common
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A $B apps/api/src/modules/imports apps/api/src/modules/dashboards/c8-runtime.local.test.ts apps/api/prisma/local-demo-seed.ts apps/api/prisma/defense-demo-seed.ts apps/api/prisma/hosted-realistic-seed.ts
git commit -m "refactor(api): move registration promotion into BeneficiaryRegistrationService

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: line counts 409, 457, 282 and 636; all pass (the registration describe has 37 tests, the service file 14); api = `B_api + 17`. `app-module-wiring.test.ts` passes, so `BeneficiaryRegistrationService` is provided once.

---

### Task 7: Split the participants module by purpose

**Files:**
- Test: `apps/api/src/modules/participants/participants.helpers.test.ts` (commit 1)
- Create: `apps/api/src/modules/participants/journey-stages.service.ts`, `apps/api/src/modules/participants/journey-stages.mapper.ts`, `apps/api/src/modules/participants/journey-stages.controller.ts`, `apps/api/src/modules/participants/beneficiary-journey.service.ts`, `apps/api/src/modules/participants/beneficiary-journey.controller.ts`, `apps/api/src/modules/participants/participants.helpers.ts`
- Modify: `apps/api/src/modules/participants/participants.service.ts`, `apps/api/src/modules/participants/participants.module.ts`
- Delete: `apps/api/src/modules/participants/participants.controller.ts`, `apps/api/src/modules/participants/participants.dto.ts`
- Create: `apps/api/src/modules/participants/beneficiary-journey.service.test.ts` (the two G-F4 describes of `participants.service.test.ts`)
- Modify: `apps/api/src/modules/participants/participants.service.test.ts`, `journeys-access.test.ts`, `journey-note.test.ts`, `journey-routes.validation.test.ts`, `apps/api/src/modules/auth/beneficiary-step-up.test.ts` (imports and constructions)
- Modify: `apps/api/prisma/local-demo-seed.ts`, `apps/api/prisma/defense-demo-seed.ts`, `apps/api/prisma/defense-demo-stage-participation.ts`, `apps/api/prisma/local-demo-stage-forms.ts`, `apps/api/prisma/local-demo-stage-journeys.ts`, `apps/api/prisma/local-demo-stage-outcomes.ts`
- Create (not committed): `.tmp/s4a/participants-dto-split.json`, `.tmp/s4a/participants-split.json`, `.tmp/s4a/participants-controller-split.json`, `.tmp/s4a/task7-renames.json`, `.tmp/s4a/journey-test-split.json`, `.tmp/s4a/participation-test-split.json`, `.tmp/s4a/task7-tests.json`, `.tmp/s4a/task7-seeds.json`

**Interfaces:**
- Consumes: `canonicalCode` (Task 5).
- Produces: `JourneyStagesService` (`listStages`, `saveStages`) and `JourneyStagesController`; `BeneficiaryJourneyService` (`history`, `transitionEnrollment`, `correctEvent`) and `BeneficiaryJourneyController`; `stageSelection`, `mapStage` from `journey-stages.mapper.ts`; `normalizedText(value: unknown, maximum = 2000): string | null` from `participants.helpers.ts`; `ParticipantsService.promoteParticipation` unchanged; seed context keys `journeyStages: JourneyStagesService` and `beneficiaryJourney: BeneficiaryJourneyService` replace `participants`.

- [ ] **Step 1: Characterize the duplicated code rule, then commit**

Create `apps/api/src/modules/participants/participants.helpers.test.ts` (each code row runs both `canonicalCode` and `normalizedCode`, ruling 9):

```ts
import { describe, expect, it } from 'vitest'

import { canonicalCode } from '../beneficiaries/beneficiary-registration.helpers'
import { normalizedCode, normalizedText } from './participants.dto'

const grin = String.fromCodePoint(0x1f600)

describe('participation beneficiary code', () => {
  it.each([
    ['BEN-001', 'BEN-001'],
    [' ben_001 ', 'BEN_001'],
    ['b1', 'B1'],
    ['B', null],
    ['-BEN', null],
    ['BEN 001', null],
    ['BEN.001', null],
    ['X'.repeat(40), 'X'.repeat(40)],
    ['X'.repeat(41), null],
    [`BEN${grin}`, null],
    ['', null],
    [null, null],
    [42, null],
  ])('reads %j as %j with the registration code rule', (value, expected) => {
    expect(canonicalCode(value)).toBe(expected)
    expect(normalizedCode(value)).toBe(expected)
  })
})

describe('normalizedText', () => {
  it.each([
    [undefined, null],
    [null, null],
    ['', null],
    ['   ', null],
    [7, null],
    ['  Attended.  ', 'Attended.'],
    ['x'.repeat(2000), 'x'.repeat(2000)],
    ['x'.repeat(2001), null],
  ])('reads %j as %j', (value, expected) => {
    expect(normalizedText(value)).toBe(expected)
  })

  it('applies a shorter maximum when given', () => {
    expect(normalizedText('abcd', 3)).toBeNull()
    expect(normalizedText('abc', 3)).toBe('abc')
  })
})
```

```bash
pnpm --filter @pathways/api exec vitest run src/modules/participants/participants.helpers.test.ts
pnpm exec biome check --write apps/api/src/modules/participants/participants.helpers.test.ts
git add apps/api/src/modules/participants/participants.helpers.test.ts
git commit -m "test(api): pin the participation code and note rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: PASS, 22 tests; api = `B_api + 39`.

- [ ] **Step 2: Write the plans**

Create `.tmp/s4a/participants-dto-split.json`:

```json
{
  "targets": {
    "apps/api/src/modules/participants/participants.helpers.ts": {
      "top": ["normalizedText"]
    }
  },
  "drop": ["normalizedCode"]
}
```

Create `.tmp/s4a/participants-split.json` (each new service class opens with the same constructor as `ParticipantsService`, which keeps its own):

```json
{
  "targets": {
    "apps/api/src/modules/participants/journey-stages.mapper.ts": {
      "header": ["import type { Prisma } from '@prisma/client'"],
      "top": ["stageSelection", "mapStage"],
      "exportTop": ["stageSelection", "mapStage"]
    },
    "apps/api/src/modules/participants/journey-stages.service.ts": {
      "header": [
        "import { randomUUID } from 'node:crypto'",
        "import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'",
        "",
        "import { type SaveJourneyStagesRequest, hasAtomicPermission } from '@pathways/shared'",
        "import { writeAuditLog } from '../../common/audit/write-audit-log'",
        "import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'",
        "import { withAuthorizedOperation } from '../../common/authz/authorized-operation'",
        "import { requireScopedProject } from '../../common/authz/scoped-project'",
        "import { PrismaService } from '../../prisma/prisma.service'",
        "import { mapStage, stageSelection } from './journey-stages.mapper'"
      ],
      "members": ["listStages", "saveStages"],
      "open": [
        "// Reads and saves a project's journey stages and their activity mappings.",
        "@Injectable()",
        "export class JourneyStagesService {",
        "  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}",
        ""
      ]
    },
    "apps/api/src/modules/participants/beneficiary-journey.service.ts": {
      "header": [
        "import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'",
        "",
        "import {",
        "  type CorrectJourneyEventRequest,",
        "  type RecordJourneyEventRequest,",
        "  aggregateOnlyRoles,",
        "} from '@pathways/shared'",
        "import { writeAuditLog } from '../../common/audit/write-audit-log'",
        "import { type ApplicationIdentity, UUID_PATTERN } from '../../common/authz/application-identity'",
        "import { withAuthorizedOperation } from '../../common/authz/authorized-operation'",
        "import { requireScopedProject } from '../../common/authz/scoped-project'",
        "import { PrismaService } from '../../prisma/prisma.service'"
      ],
      "members": ["history", "transitionEnrollment", "correctEvent"],
      "open": [
        "// Reads a beneficiary's journey and records enrollment events and corrections.",
        "@Injectable()",
        "export class BeneficiaryJourneyService {",
        "  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}",
        ""
      ]
    }
  },
  "sourceHeader": [
    "import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common'",
    "",
    "import { writeAuditLog } from '../../common/audit/write-audit-log'",
    "import type { ApplicationIdentity } from '../../common/authz/application-identity'",
    "import type { Tx } from '../../common/prisma/transaction'",
    "import { PrismaService } from '../../prisma/prisma.service'",
    "import { canonicalCode } from '../beneficiaries/beneficiary-registration.helpers'",
    "import { normalizedText } from './participants.helpers'"
  ]
}
```

Create `.tmp/s4a/participants-controller-split.json`:

```json
{
  "targets": {
    "apps/api/src/modules/participants/journey-stages.controller.ts": {
      "header": [
        "import { Body, Controller, Get, Inject, Param, Put, Req } from '@nestjs/common'",
        "",
        "import { type SaveJourneyStagesRequest, saveJourneyStagesRequest } from '@pathways/shared'",
        "import type { AuthenticatedRequest } from '../../common/authz/application-identity'",
        "import { requestIdentity } from '../../common/authz/request-identity'",
        "import { RequirePermission } from '../../common/decorators/permission.decorator'",
        "import { ZodPipe } from '../../common/validation/zod-pipe'",
        "import { JourneyStagesService } from './journey-stages.service'"
      ],
      "top": ["JourneyStagesController"]
    },
    "apps/api/src/modules/participants/beneficiary-journey.controller.ts": {
      "header": [
        "import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common'",
        "",
        "import {",
        "  type CorrectJourneyEventRequest,",
        "  type RecordJourneyEventRequest,",
        "  correctJourneyEventRequest,",
        "  recordJourneyEventRequest,",
        "} from '@pathways/shared'",
        "import type { AuthenticatedRequest } from '../../common/authz/application-identity'",
        "import { requestIdentity } from '../../common/authz/request-identity'",
        "import { RequireBeneficiaryStepUp } from '../../common/decorators/beneficiary-step-up.decorator'",
        "import { RequirePermission } from '../../common/decorators/permission.decorator'",
        "import { ZodPipe } from '../../common/validation/zod-pipe'",
        "import { BeneficiaryJourneyService } from './beneficiary-journey.service'"
      ],
      "top": ["BeneficiaryJourneyController"]
    }
  }
}
```

Create `.tmp/s4a/task7-renames.json`:

```json
[
  ["apps/api/src/modules/participants/participants.service.ts", "normalizedCode(input.values.beneficiary_code)", "canonicalCode(input.values.beneficiary_code)", 1],
  ["apps/api/src/modules/participants/journey-stages.controller.ts", "@Inject(ParticipantsService) private readonly participants: ParticipantsService", "@Inject(JourneyStagesService) private readonly stages: JourneyStagesService", 1],
  ["apps/api/src/modules/participants/journey-stages.controller.ts", "this.participants.", "this.stages.", 2],
  ["apps/api/src/modules/participants/beneficiary-journey.controller.ts", "@Inject(ParticipantsService) private readonly participants: ParticipantsService", "@Inject(BeneficiaryJourneyService) private readonly journey: BeneficiaryJourneyService", 1],
  ["apps/api/src/modules/participants/beneficiary-journey.controller.ts", "this.participants.", "this.journey.", 3]
]
```

Create `.tmp/s4a/journey-test-split.json`:

```json
{
  "drop": ["stageId", "submissionId", "input", "tx", "describe:P05 participation promotion contract"]
}
```

Create `.tmp/s4a/participation-test-split.json`:

```json
{
  "drop": [
    "state",
    "txOps",
    "vi.mock:@app/common/authz/authorized-operation",
    "describe:F4 journey stage, enrollment closure and correction gates",
    "describe:F4 journey history reads"
  ]
}
```

Create `.tmp/s4a/task7-tests.json` (the last two entries turn the characterization test into a test of `canonicalCode` alone):

```json
[
  [
    "apps/api/src/modules/participants/beneficiary-journey.service.test.ts",
    "import { ParticipantsService } from './participants.service'\n",
    "import { BeneficiaryJourneyService } from './beneficiary-journey.service'\nimport { JourneyStagesService } from './journey-stages.service'\n",
    1
  ],
  [
    "apps/api/src/modules/participants/beneficiary-journey.service.test.ts",
    "describe('F4 journey stage, enrollment closure and correction gates', () => {\n",
    "describe('F4 journey stage, enrollment closure and correction gates', () => {\n  const stages = new JourneyStagesService({} as PrismaService)\n",
    1
  ],
  [
    "apps/api/src/modules/participants/beneficiary-journey.service.test.ts",
    "new ParticipantsService({} as PrismaService)",
    "new BeneficiaryJourneyService({} as PrismaService)",
    2
  ],
  [
    "apps/api/src/modules/participants/beneficiary-journey.service.test.ts",
    "service.saveStages(",
    "stages.saveStages(",
    2
  ],
  [
    "apps/api/src/modules/participants/journeys-access.test.ts",
    "import { BeneficiaryJourneyController, JourneyStagesController } from './participants.controller'\nimport { ParticipantsService } from './participants.service'\n",
    "import { BeneficiaryJourneyController } from './beneficiary-journey.controller'\nimport { BeneficiaryJourneyService } from './beneficiary-journey.service'\nimport { JourneyStagesController } from './journey-stages.controller'\nimport { JourneyStagesService } from './journey-stages.service'\n",
    1
  ],
  [
    "apps/api/src/modules/participants/journeys-access.test.ts",
    "const service = new ParticipantsService({} as PrismaService)\n",
    "const stages = new JourneyStagesService({} as PrismaService)\nconst journey = new BeneficiaryJourneyService({} as PrismaService)\n",
    1
  ],
  [
    "apps/api/src/modules/participants/journeys-access.test.ts",
    "service.listStages(",
    "stages.listStages(",
    3
  ],
  [
    "apps/api/src/modules/participants/journeys-access.test.ts",
    "service.saveStages(",
    "stages.saveStages(",
    1
  ],
  [
    "apps/api/src/modules/participants/journeys-access.test.ts",
    "service.history(",
    "journey.history(",
    1
  ],
  [
    "apps/api/src/modules/participants/journey-note.test.ts",
    "import { ParticipantsService } from './participants.service'",
    "import { BeneficiaryJourneyService } from './beneficiary-journey.service'",
    1
  ],
  [
    "apps/api/src/modules/participants/journey-note.test.ts",
    "new ParticipantsService({} as PrismaService)",
    "new BeneficiaryJourneyService({} as PrismaService)",
    1
  ],
  [
    "apps/api/src/modules/participants/journey-routes.validation.test.ts",
    "import { BeneficiaryJourneyController, JourneyStagesController } from './participants.controller'\nimport { ParticipantsService } from './participants.service'\n",
    "import { BeneficiaryJourneyController } from './beneficiary-journey.controller'\nimport { BeneficiaryJourneyService } from './beneficiary-journey.service'\nimport { JourneyStagesController } from './journey-stages.controller'\nimport { JourneyStagesService } from './journey-stages.service'\n",
    1
  ],
  [
    "apps/api/src/modules/participants/journey-routes.validation.test.ts",
    "    providers: [{ provide: ParticipantsService, useValue: participants }],\n",
    "    providers: [\n      { provide: JourneyStagesService, useValue: participants },\n      { provide: BeneficiaryJourneyService, useValue: participants },\n    ],\n",
    1
  ],
  [
    "apps/api/src/modules/participants/participants.helpers.test.ts",
    "import { normalizedCode, normalizedText } from './participants.dto'",
    "import { normalizedText } from './participants.helpers'",
    1
  ],
  [
    "apps/api/src/modules/participants/participants.helpers.test.ts",
    "    expect(normalizedCode(value)).toBe(expected)\n",
    "",
    1
  ],
  [
    "apps/api/src/modules/auth/beneficiary-step-up.test.ts",
    "import {\n  BeneficiaryJourneyController,\n  JourneyStagesController,\n} from '../participants/participants.controller'\n",
    "import { BeneficiaryJourneyController } from '../participants/beneficiary-journey.controller'\nimport { JourneyStagesController } from '../participants/journey-stages.controller'\n",
    1
  ]
]
```

Create `.tmp/s4a/task7-seeds.json`:

```json
[
  ["apps/api/prisma/local-demo-seed.ts", "    participants: ParticipantsService\n", "    journeyStages: JourneyStagesService\n    beneficiaryJourney: BeneficiaryJourneyService\n", 1],
  ["apps/api/prisma/local-demo-seed.ts", "    participants,\n", "    journeyStages: new JourneyStagesService(runtime),\n    beneficiaryJourney: new BeneficiaryJourneyService(runtime),\n", 1],
  ["apps/api/prisma/local-demo-seed.ts", "import { ParticipantsService } from '../src/modules/participants/participants.service'\n", "import { BeneficiaryJourneyService } from '../src/modules/participants/beneficiary-journey.service'\nimport { JourneyStagesService } from '../src/modules/participants/journey-stages.service'\nimport { ParticipantsService } from '../src/modules/participants/participants.service'\n", 1],
  ["apps/api/prisma/defense-demo-seed.ts", "        participants,\n", "        journeyStages: new JourneyStagesService(runtime),\n        beneficiaryJourney: new BeneficiaryJourneyService(runtime),\n", 1],
  ["apps/api/prisma/defense-demo-seed.ts", "import { ParticipantsService } from '../src/modules/participants/participants.service'\n", "import { BeneficiaryJourneyService } from '../src/modules/participants/beneficiary-journey.service'\nimport { JourneyStagesService } from '../src/modules/participants/journey-stages.service'\nimport { ParticipantsService } from '../src/modules/participants/participants.service'\n", 1],
  ["apps/api/prisma/defense-demo-stage-participation.ts", "ctx.services.participants.listStages(", "ctx.services.journeyStages.listStages(", 1],
  ["apps/api/prisma/defense-demo-stage-participation.ts", "ctx.services.participants.correctEvent(", "ctx.services.beneficiaryJourney.correctEvent(", 1],
  ["apps/api/prisma/local-demo-stage-forms.ts", "ctx.services.participants.listStages(", "ctx.services.journeyStages.listStages(", 2],
  ["apps/api/prisma/local-demo-stage-forms.ts", "ctx.services.participants.saveStages(", "ctx.services.journeyStages.saveStages(", 1],
  ["apps/api/prisma/local-demo-stage-journeys.ts", "ctx.services.participants.correctEvent(", "ctx.services.beneficiaryJourney.correctEvent(", 1],
  ["apps/api/prisma/local-demo-stage-outcomes.ts", "ctx.services.participants.listStages(", "ctx.services.journeyStages.listStages(", 1],
  ["apps/api/prisma/local-demo-stage-outcomes.ts", "ctx.services.participants.transitionEnrollment(", "ctx.services.beneficiaryJourney.transitionEnrollment(", 1]
]
```

- [ ] **Step 3: Move the declarations and prove the move**

```bash
P=apps/api/src/modules/participants
for f in participants.service.ts participants.controller.ts participants.dto.ts; do git show HEAD:$P/$f > .tmp/s4a/${f%.ts}.before.ts; done
node .tmp/s4a/move-declarations.mjs $P/participants.dto.ts .tmp/s4a/participants-dto-split.json
node .tmp/s4a/move-declarations.mjs $P/participants.service.ts .tmp/s4a/participants-split.json
node .tmp/s4a/move-declarations.mjs $P/participants.controller.ts .tmp/s4a/participants-controller-split.json
git rm -qf $P/participants.dto.ts $P/participants.controller.ts
node .tmp/s4a/replace-exact.mjs .tmp/s4a/task7-renames.json
for f in participants.service.ts journey-stages.mapper.ts journey-stages.service.ts beneficiary-journey.service.ts journey-stages.controller.ts beneficiary-journey.controller.ts participants.helpers.ts; do node .tmp/s4a/move-declarations.mjs $P/$f .tmp/s4a/prune.json; done
MSYS_NO_PATHCONV=1 node .tmp/s4a/same-lines.mjs .tmp/s4a/participants.service.before.ts .tmp/s4a/participants.controller.before.ts .tmp/s4a/participants.dto.before.ts -- $P/participants.service.ts $P/journey-stages.mapper.ts $P/journey-stages.service.ts $P/beneficiary-journey.service.ts $P/journey-stages.controller.ts $P/beneficiary-journey.controller.ts $P/participants.helpers.ts \
 'canonicalCode(input.values.beneficiary_code)=normalizedCode(input.values.beneficiary_code)' '@Inject(JourneyStagesService) private readonly stages: JourneyStagesService=@Inject(ParticipantsService) private readonly participants: ParticipantsService' '@Inject(BeneficiaryJourneyService) private readonly journey: BeneficiaryJourneyService=@Inject(ParticipantsService) private readonly participants: ParticipantsService' 'this.stages.=this.participants.' 'this.journey.=this.participants.' \
 '~function normalizedCode(value: unknown) {' "~if (typeof value !== 'string') return null" '~const code = value.trim().toUpperCase()' '~return /^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code) ? code : null' '~}' \
 "+// Reads and saves a project's journey stages and their activity mappings." "+// Reads a beneficiary's journey and records enrollment events and corrections." '+@Injectable()' '+@Injectable()' '+class JourneyStagesService {' '+class BeneficiaryJourneyService {' '+constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}' '+constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}' '+}' '+}'
```

Expected: `participants.helpers.ts: 1 declarations`, `participants.dto.ts: 2 moved, 0 lines left`, `journey-stages.mapper.ts: 2 declarations`, `journey-stages.service.ts: 0 declarations, 2 members`, `beneficiary-journey.service.ts: 0 declarations, 3 members`, `participants.service.ts: 7 moved, 166 lines left`, the two controller files with 1 declaration each, `participants.controller.ts: 2 moved, 16 lines left` (its imports only, deleted by the `git rm`), `5 replacements in 3 files`, seven prune lines with `0 moved`, and `same lines: 741`.

- [ ] **Step 4: Wire Nest, split the tests and repoint the seeds**

Replace the whole of `apps/api/src/modules/participants/participants.module.ts` with:

```ts
import { Module } from '@nestjs/common'

import { BeneficiaryJourneyController } from './beneficiary-journey.controller'
import { BeneficiaryJourneyService } from './beneficiary-journey.service'
import { JourneyStagesController } from './journey-stages.controller'
import { JourneyStagesService } from './journey-stages.service'
import { ParticipantsService } from './participants.service'

@Module({
  controllers: [JourneyStagesController, BeneficiaryJourneyController],
  providers: [ParticipantsService, JourneyStagesService, BeneficiaryJourneyService],
  exports: [ParticipantsService],
})
export class ParticipantsModule {}
```

```bash
P=apps/api/src/modules/participants
cp $P/participants.service.test.ts $P/beneficiary-journey.service.test.ts
node .tmp/s4a/move-declarations.mjs $P/beneficiary-journey.service.test.ts .tmp/s4a/journey-test-split.json
node .tmp/s4a/move-declarations.mjs $P/participants.service.test.ts .tmp/s4a/participation-test-split.json
node .tmp/s4a/replace-exact.mjs .tmp/s4a/task7-tests.json
for f in beneficiary-journey.service.test.ts participants.service.test.ts; do node .tmp/s4a/move-declarations.mjs $P/$f .tmp/s4a/prune.json; done
node .tmp/s4a/replace-exact.mjs .tmp/s4a/task7-seeds.json
git grep -nE "participants\.controller|participants\.dto|normalizedCode|services\.participants" -- apps
```

Expected: `5 moved, 256 lines left`, `5 moved, 154 lines left`, `16 replacements in 6 files`, then `257` and `152` lines left, `12 replacements in 6 files`; the grep prints nothing.

- [ ] **Step 5: Check and commit**

```bash
P=apps/api/src/modules/participants
git add -N $P
pnpm exec biome check --write $P apps/api/src/modules/auth/beneficiary-step-up.test.ts apps/api/prisma
wc -l $P/*.ts
pnpm --filter @pathways/api exec vitest run src/modules/participants src/modules/auth src/modules/metadata src/modules/imports src/app-module-wiring.test.ts src/common
pnpm typecheck && pnpm lint
pnpm --filter @pathways/api test 2>&1 | grep -E "Tests +[0-9]+"
git checkout -- apps/web/next-env.d.ts
git add -A $P apps/api/src/modules/auth/beneficiary-step-up.test.ts apps/api/prisma
git commit -m "refactor(api): split the participants module into journey stages, beneficiary journey and participation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `participants.service.ts` 166, `journey-stages.service.ts` 255, `beneficiary-journey.service.ts` 256, `journey-stages.mapper.ts` 39, the controllers 28 and 65, `participants.helpers.ts` 6; all pass (`beneficiary-journey.service.test.ts` 13 tests, `participants.service.test.ts` 6); api = `B_api + 39`. `git diff --stat HEAD~1 -- apps/api/prisma` lists only the six seed files of this task.

---

### Task 8: Records and SAD routing

**Files:**
- Modify: `scripts/sad/check.ts` (beneficiary-privacy-guardian globs), `scripts/sad/check.test.ts`, `docs/sad-pathways.md:38`
- Modify: `docs/cr-pathways-codebase-modularization.md` (sections 3.6, 3.7, 9)
- Modify: `docs/audit-pathways-codebase-modularity-20261009.md` (MOD-04, MOD-11 rows)
- Modify: `docs/qad-pathways.md` (QAD-T03, T04, T49, T50, T51, A23 evidence paths)
- Modify: `docs/index.md` (CR row status)
- Modify: `docs/activity-log.md`
- Create (not committed): `.tmp/s4a/task8-qad.json`

- [ ] **Step 1: Route the beneficiary modules to the beneficiary privacy guardian (ruling 13)**

In `scripts/sad/check.test.ts`, directly before the test `routes the rules dispatch workflow to design-qa-agent`, add:

```ts
  it('routes beneficiary, journey and media module code to the privacy guardian', () => {
    const files = [
      'apps/api/src/modules/beneficiaries/beneficiary-registration.helpers.ts',
      'apps/api/src/modules/beneficiary-media/beneficiary-media.service.ts',
      'apps/api/src/modules/participants/participants.helpers.ts',
    ]
    const routed = routing(files.map((file) => change(file, 'new', 'old')))
    expect(routed['beneficiary-privacy-guardian']).toEqual(files)
  })
```

Run: `pnpm sad:test`
Expected: FAIL on the new test.

In `scripts/sad/check.ts`, `beneficiary-privacy-guardian` globs, add directly after `'apps/api/src/**/*.mapper.ts',`:

```ts
      'apps/api/src/modules/beneficiaries/**/*.ts',
      'apps/api/src/modules/beneficiary-media/**/*.ts',
      'apps/api/src/modules/participants/**/*.ts',
```

In `docs/sad-pathways.md` line 38, after `` `apps/api/src/**/*.mapper.ts` `` insert `` , `apps/api/src/modules/beneficiaries/**/*.ts`, `apps/api/src/modules/beneficiary-media/**/*.ts`, `apps/api/src/modules/participants/**/*.ts` `` (inside the same cell).

```bash
pnpm sad:test && pnpm sad:typecheck
```

Expected: PASS; sad = `B_sad + 1`.

- [ ] **Step 2: Amend the Change Record**

`docs/cr-pathways-codebase-modularization.md`:

Section 3.6, add after the bullet that starts `` - The pipe keeps `400 ``:

```markdown
- A compiled DTO instance owns every declared field, `undefined` when absent, because the api compiles with `useDefineForClassFields`; a zod output owns only the keys that were sent. A service that reads which keys its input holds derives the list from the contract shape instead, and the slice's parity test pins the DTO instance keys (amended <date> for S4a: the beneficiary profile update audit).
```

Section 3.7, replace the row

```markdown
| S4 | Beneficiaries, participants, journey, media | Provides `promoteRegistration` and `promoteParticipation` to imports |
```

with

```markdown
| S4a, S4b | Beneficiaries, participants, journey, media. S4a: request contracts and api split; S4b: web client and feature components | Provides `promoteRegistration` and `promoteParticipation` to imports |
```

Section 9, append:

```markdown
S4a applied <date> on refactor/s4a-beneficiaries-api:
- Contracts: `beneficiaryListQuery`, `registerBeneficiaryRequest`, `updateBeneficiaryRequest`, `archiveBeneficiaryRequest`, `enrollBeneficiaryRequest` and `resolveDuplicateRequest` (`contracts/beneficiaries/beneficiary-requests.ts`), `journeyStageInput`, `saveJourneyStagesRequest`, `recordJourneyEventRequest` and `correctJourneyEventRequest` (`contracts/journeys/journey-requests.ts`) and `reserveBeneficiaryMediaRequest` (`contracts/beneficiaries/beneficiary-media-requests.ts`) replaced the DTO classes of the beneficiaries, participants and beneficiary media modules and the two journey stage classes of `activities.dto.ts`; parity tests ran each DTO and contract through the configured pipes over 109 beneficiary, 82 journey and 38 media bodies before the DTOs were deleted.
- Services: `beneficiaries.service.ts` (1461 lines) split into `beneficiaries.service.ts`, `beneficiary-registration.service.ts` (`BeneficiaryRegistrationService`, which `ImportsService` now injects), `beneficiary-registration.helpers.ts`, `beneficiaries.helpers.ts`, `beneficiaries.mapper.ts` and `registration-context.service.ts`; `participants.service.ts` (703 lines) split into `participants.service.ts` (participation promotion), `journey-stages.service.ts`, `beneficiary-journey.service.ts` and `journey-stages.mapper.ts`, with one controller per file; every move was checked line for line.
- Duplicates: the participation `normalizedCode` was removed for the identical `canonicalCode` after a characterization test.
- Kernel: `requestIdentity` in the beneficiaries, identity review, journey and media controllers; `beneficiary-progress.ts` takes `Tx`.
- SAD: beneficiary privacy routing covers `apps/api/src/modules/beneficiaries/**/*.ts`, `apps/api/src/modules/beneficiary-media/**/*.ts` and `apps/api/src/modules/participants/**/*.ts`.
- Decisions: S4 split into S4a and S4b (ruling 1); the journey stage DTOs in `activities.dto.ts` belonged to S4 (ruling 2); prototype keys are the only accepted input differences, including a `constructor` key inside registration values, which crashed the DTO route with a 500 and now answers 400 (ruling 3); the profile update audit still lists every field (ruling 4); `BeneficiaryRegistrationService` is injectable so imports keep constructor injection (ruling 7); `ParticipantsService` keeps promotion and its unused `PrismaService` parameter (ruling 8); the media enrollment lookup and `businessToday` stay local because the kernel helpers answer different errors (ruling 10).

Deferred to S4b: the 19 beneficiary, journey and media client methods of `pathways-client.ts` in `lib/api`, the beneficiary and journey response contracts, the `features/beneficiaries` layout and public `index.ts`, the four oversized components and the `ScopedBeneficiaryForm` name. Left to S5: the unused `PrismaService` parameter of `ParticipantsService` and the `beneficiaries` field name in `ImportsService`.
```

Replace `<date>` (twice) with the merge date.

- [ ] **Step 3: Update the audit, the QAD evidence paths and the index**

- Audit: append to the disposition cell of MOD-04 `; beneficiaries and participants services split by S4a.` and of MOD-11 `; beneficiary, journey and media DTOs replaced by S4a.`

Create `.tmp/s4a/task8-qad.json`:

```json
[
  [
    "docs/qad-pathways.md",
    "apps/api/src/modules/participants/participants.service.test.ts",
    "apps/api/src/modules/participants/beneficiary-journey.service.test.ts",
    4
  ],
  [
    "docs/qad-pathways.md",
    "| G-F3-1 | UC-F3-1 | `apps/api/src/modules/beneficiaries/beneficiaries.service.test.ts` |",
    "| G-F3-1 | UC-F3-1 | `apps/api/src/modules/beneficiaries/beneficiaries.service.test.ts`; `apps/api/src/modules/beneficiaries/beneficiary-registration.service.test.ts` |",
    1
  ],
  [
    "docs/qad-pathways.md",
    "| UC-F3-3 | `apps/api/src/modules/beneficiaries/beneficiaries.service.test.ts` |",
    "| UC-F3-3 | `apps/api/src/modules/beneficiaries/beneficiary-registration.service.test.ts` |",
    1
  ]
]
```

```bash
node .tmp/s4a/replace-exact.mjs .tmp/s4a/task8-qad.json
git grep -nE "beneficiaries\.dto|participants\.dto|beneficiary-media\.dto|participants\.controller|participants\.service\.test|journey-stage-code" -- docs ':!docs/activity-log.md' ':!docs/audit-*' ':!docs/cr-*' ':!docs/superpowers/*'
```

Expected: `3 replacements in 1 files`; the grep prints nothing (QAD-T04 and T49 to T51 now cite the journey gate tests, QAD-T03 both the scoped read and the registration tests, QAD-A23 the registration tests).

- `docs/index.md`: in the CR row status, record S4a as applied and S4b as next, keeping any earlier slice part that is still open named (for example `Approved; F1 to F4b, S1 to S3 and S4a applied, S4b next`).

- [ ] **Step 4: Activity log**

Add to `docs/activity-log.md`:

```markdown
## <date> Modularization S4a beneficiaries api (refactor/s4a-beneficiaries-api)
```

with one bullet per Task 1 to Task 7 stating what moved, split or was added, with its commit hash and the shared and api test counts at the end of that task; a bullet saying the S4a decisions are recorded in the change record section 9 (the plan stays until S4b is planned, because it holds the S4b outline); and a bullet listing the S4b and S5 deferrals. Task 9 Step 5 appends the gate results.

- [ ] **Step 5: Check and commit**

```bash
pnpm docs:check 2>&1 | tail -3
pnpm lint
git add docs scripts/sad
git commit -m "docs: record modularization S4a and route the beneficiary modules to the privacy guardian

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline.

---

### Task 9: Full release gates and merge

- [ ] **Step 1: Static gates and dist layout**

```bash
pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm sad:test
git checkout -- apps/web/next-env.d.ts
test -f packages/shared/dist/contracts/beneficiaries/beneficiary-requests.js && test -f packages/shared/dist/contracts/journeys/journey-requests.js && test -f packages/shared/dist/contracts/beneficiaries/beneficiary-media-requests.js && test -f apps/api/dist/apps/api/src/modules/beneficiaries/beneficiary-registration.service.js && test -f apps/api/dist/apps/api/src/modules/participants/journey-stages.controller.js && test -f apps/api/dist/apps/api/src/modules/participants/beneficiary-journey.controller.js && test ! -e apps/api/dist/apps/api/src/modules/beneficiaries/beneficiaries.dto.js && test ! -e apps/api/dist/apps/api/src/modules/participants/participants.dto.js && test ! -e apps/api/dist/apps/api/src/modules/participants/participants.controller.js && test ! -e apps/api/dist/apps/api/src/modules/beneficiary-media/beneficiary-media.dto.js && echo "dist layout ok"
pnpm --filter @pathways/web build > .tmp/s4a/web-build-gates.log 2>&1; echo "exit $?"
grep -E "Middleware" .tmp/s4a/web-build-gates.log
git checkout -- apps/web/next-env.d.ts
```

Expected: all pass and `dist layout ok` (nest `deleteOutDir` removes the old output); web build exit 0 with Middleware at most `M0` (`"sideEffects": false` keeps the new contracts out of the Edge bundle). Versus Task 0: shared = `B_shared + 35` (beneficiary requests 15, journey requests 14, media request 6), api = `B_api + 39` (HTTP 13, 7 and 5, audit 1, helpers 5, participation rules 22; 8 stage code tests and 3 metadata cases removed, 3 profile edit cases moved), sad = `B_sad + 1`, config, imports and web unchanged.

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

`pnpm db:local:demo` runs the seeds that now construct `BeneficiaryRegistrationService`, `JourneyStagesService` and `BeneficiaryJourneyService` (ruling 14) and must finish with the same row counts as on dev; `pnpm dev:local` builds the API and runs `dist`. In a second terminal:

```bash
curl -s http://127.0.0.1:4000/api/health
npx playwright test --config playwright.config.ts
npx playwright test --config playwright.auth-navigation.config.ts
```

Expected: `"status":"ok"`; a module-resolution error, a Nest `UnknownDependenciesException` (for example `BeneficiaryRegistrationService` not exported to `ImportsModule`) or `beneficiaryListQuery` undefined in the `pnpm dev:local` output fails the gate; auth-navigation 27/27; main suite 39 pass, 9 fail, 22 not run, with the same 9 failing as the F1 to S3 gate runs (MFA Verify helper, password-login harness, workflows seed end date). Browser smoke against the compiled API, each step as a demo user whose role allows it, after the Beneficiary step-up: as Project Officer open the beneficiary directory, search with surrounding spaces, filter by the `0-9` age band on a project with an end date, and page forward (list query, cursor); register a beneficiary through the registration form, including the default form on a project without one (registration context, `BeneficiaryRegistrationService`); edit the profile and save, then save again from a stale tab and expect the reload conflict (update, 409); archive a beneficiary and enroll an existing one in a second project; as Monitoring and Evaluation Officer open the duplicate review and resolve a pair; as Project Manager open the project journey stages, add a stage with a lower-case code and save (stored upper-cased, Review Focus 5); open a beneficiary journey, record a follow-up with a note padded with spaces, then correct that event with a reason; open the beneficiary media tab and upload a photo, then view it (reserve, finalize, content); run a registration import and a participation import to completion (`ImportsService` with both injected services, Review Focus 4); submit an activity monitoring form (metadata promotion); confirm a Program Manager cannot open beneficiary records, as on dev. Every step must behave as on dev.

- [ ] **Step 4: SAD review**

```bash
pnpm sad:check --base dev --head HEAD --output .tmp/sad/s4a/manifest.json
```

Dispatch every role the manifest requires (expect `design-qa-agent`, `restraint-guardian`, `organization-isolation-checker`, `beneficiary-privacy-guardian` and `metadata-import-validator`, the last because the imports service and three imports tests changed) with the section 4.2 handoff packet from `docs/sad-pathways.md`, save their section 4.4 envelopes to `.tmp/sad/s4a/reviews.json`, then:

```bash
pnpm sad:signoff -- --base dev --head HEAD --reviews .tmp/sad/s4a/reviews.json
```

Expected: sign-off. Any finding is fixed on this branch and the affected gates rerun.

- [ ] **Step 5: Record the gate results**

Append a final bullet to the Task 8 activity-log section with the gate results (per-package counts, Middleware size, replay exit code, seed result, e2e pass counts, smoke result, SAD sign-off), then:

```bash
git add docs/activity-log.md
git commit -m "docs: record modularization S4a release gate results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Merge into local dev**

```bash
git checkout dev
git merge --no-ff refactor/s4a-beneficiaries-api -m "Merge refactor/s4a-beneficiaries-api into dev

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Keep the plan for S4b**

The plan holds the S4b outline, so it stays on dev. In `docs/index.md` section 1.6 change the S4 plan row status to `S4a executed; holds the S4b outline`, then:

```bash
pnpm docs:check 2>&1 | tail -3
git add docs/index.md
git commit -m "docs: mark S4a executed in the plan index

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: docs check failure count equals the Task 0 baseline. Do not push `origin dev` until the developer says so.

---

## S4b outline (beneficiaries web, branch `refactor/s4b-beneficiaries-web`)

To be written as its own plan from dev after S4a merges; that plan's Task 0 removes this file and its index row. Counts below were taken at `a101ad7c` and must be recounted in S4b Task 0 (F4b moves `requestFoundation` and `PathwaysClientError` into `lib/api/core/request.ts` and edits `beneficiary-utils.ts` for `lib/format`; S1b to S3b move other `pathways-client.ts` methods).

- **Task 0, baseline:** recount every number below; record web Middleware; confirm F4b's `lib/api/core/request.ts`, `lib/api/core/request-owner.ts`, `hooks/use-authorized-read.ts` and `lib/format/*` exist.
- **Task 1, response contracts:** add `beneficiaryResponse` (the `mapBeneficiary` shape with its `progress` union), `registrationContextResponse` (moving `RegistrationContext` out of the api; its fields reuse `FormFieldValidationContract`, so decide in the plan between a zod schema and a plain shared type), `journeyStageResponse` (`mapStage`), `beneficiaryJourneyResponse` (`history`), `duplicateCandidatePairResponse`, `beneficiaryMediaItemResponse`, `beneficiaryMediaLimitsResponse` and the archive and enroll results in `packages/shared/src/contracts/{beneficiaries,journeys}`; annotate `mapBeneficiary`, `mapStage` and the service returns so a drift fails `pnpm typecheck` (CR 3.6, types only).
- **Task 2, `lib/api/beneficiaries.ts`, `lib/api/journeys.ts`, `lib/api/beneficiary-media.ts`:** move the 19 methods (`getBeneficiaryRecordsForRole`, `getSurveySubjectPage`, `getBeneficiaryRecordForRole`, `registerBeneficiary`, `updateBeneficiary`, `getDuplicateCandidates`, `resolveDuplicate`, `getBeneficiaryRegistrationContext`, `ensureDefaultRegistrationForm`; `getJourneyStages`, `saveJourneyStages`, `getBeneficiaryJourneyHistory`, `transitionBeneficiaryJourney`, `correctBeneficiaryJourneyEvent`; `listBeneficiaryMedia`, `getBeneficiaryMediaLimits`, `reserveBeneficiaryMedia`, `finalizeBeneficiaryMedia`, `getBeneficiaryMediaBlob`) and `lib/services/registration-context.ts` (81 lines) out of `pathways-client.ts` (2786 lines) with unchanged signatures. 27 web files reference them (13 production, among them `collection-workspace.tsx`, `use-project-reads.ts` and `evaluation-center-lookup.tsx`); 11 of the 56 `vi.mock('@/lib/services/pathways-client', ...)` factories define one and must split into the new module mock in the same commit, counted before and after. `RegisterBeneficiaryInput`, `UpdateBeneficiaryInput`, `EnrollmentJourneyEventInput`, `CorrectJourneyEventInput` and `ResolveDuplicateInput` in `types/pathways.ts` give way to the S4a request types where they are equal; view models whose labels differ from the API (`JourneyStageConfig` uses `Entry` where the API sends `ENTRY`, `BeneficiaryRecord`, `BeneficiaryFilters`) stay. `getBeneficiaryAssessments` belongs to evaluations (S6). After S2b, `beneficiary-media-proof.tsx` calls `activitiesClient.uploadActivityProofFile` (keep that call or add a media-owned `PUT`), the media limits read needs `isFiniteNonNegative` from `@/lib/api/core/guards`, and the beneficiary loaders call `activitiesClient.getActivities` and `getActivityContext`.
- **Task 3, feature layout:** `features/beneficiaries` (25 files) and `features/journey-config` (8 files) are 33 files, over the CR 3.3 threshold, so they become `features/beneficiaries/{directory,registration,profile,media,identity-review,journey}` with one `index.ts` exporting what the seven route pages import (`app/(dashboard)/beneficiaries/**` and `projects/[projectId]/(workspace)/journey-stages`); no other feature imports either folder. The loaders call the client in effects and none uses `useAuthorizedRead`, so there is no read key to deduplicate; moving them onto `useAuthorizedRead` would change caching and is out of scope.
- **Task 4, `beneficiary-form.tsx` (1388 lines):** `ScopedBeneficiaryForm` (about 1020 lines) gets a purpose name (MOD-17) and splits into hooks (registration context, draft state) and components (`Field`, `ToggleField`, `PreviewRow`); `registrationAgeAtDate`, `projectRegistrationValues` and `draftFromBeneficiary` move to a `.utils.ts`. `beneficiary-form.test.tsx` (869 lines) splits by concern.
- **Task 5, `beneficiary-detail.tsx` (1172 lines):** `BeneficiaryDetail` (about 950 lines) splits into summary, enrollment actions, journey timeline, notes and media entry components with a detail hook; `SummaryRow`, `RecordList`, `StageActivityList` and `JourneyNoteList` move to `components/`. `beneficiary-detail.test.tsx` (635 lines) splits by concern.
- **Task 6, `beneficiary-media-proof.tsx` (662 lines) and `beneficiary-directory.tsx` (565 lines):** `AddMediaDialog`, `MediaViewer` and `MediaKpi`, and the directory's `FilterSelect`, move to `components/`. The directory's `'5-9'` age band option stays as it is (MOD-B1, behavior).
- **Task 7, records:** CR section 9 S4b disposition, audit MOD-05, MOD-06, MOD-16 and MOD-17, index, activity log; SAD routing for the new `lib/api` files is already covered by F4b's `apps/web/src/lib/api/**/*.ts` route to beneficiary-privacy-guardian.
- **Task 8, gates and merge:** as S4a Task 9, with a smoke over every beneficiary, journey, media and duplicate screen and the collection and evaluation lookups that read beneficiaries. After merge, remove this plan and its index row.
