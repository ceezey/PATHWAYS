# Change Record: Default Registration Form and Minimum Beneficiary Age

**ID:** `cr-pathways-default-registration-form`

**Date:** 2026-09-28

**Status:** Approved; implementation pending

## 1. Trigger

Audit findings J and K (2026-09-28, `dev` at `002d3ac`) for PRD-F3.

**Finding J: Add Beneficiary needs a published registration form that nothing provides.**

- `promoteRegistration` requires a published `BENEFICIARY_REGISTRATION` form (`apps/api/src/modules/beneficiaries/beneficiaries.service.ts:650-665`, 404 "Published registration form unavailable.").
- No seed or project set-up creates such a form.
- The web form stops with "No published registration form is available for this project." (`apps/web/src/features/beneficiaries/beneficiary-form.tsx:721`) and blocks submission (`:568`, `:630`).
- Publishing one needs two people. The `p2_guard_form` trigger (`apps/api/prisma/migrations/0000_pathways_baseline_through_0026/migration.sql:3074-3128`, bound by trigger `p2_form` at `:6113`) enforces:
  - new forms must start as DRAFT (`:3079-3085`);
  - publication is rejected when `published_by_id`, `published_at` or `created_by_id` is null, or when `published_by_id = created_by_id` ("Publication requires a different attributable reviewer", `:3114-3119`).
- Consent records bind to a `form_submissions` row, so registration cannot bypass forms (`0000...migration.sql:626-627`).

**Finding K: the age rules are incomplete.**

- The client computes age from the birth date (`beneficiary-form.tsx:46-71`), but it returns `null` without a message for a future birth date. The birth-date input has no `max`, and the age input allows `min="0"` (`:921`).
- The server accepts `age_at_registration` from 0 through 130 (`beneficiaries.service.ts:193-199`) and has no minimum age.
- The server rejects a birth date after the enrollment date (`:215-217`) but not one after the business date.
- The edit path (`assertSubjectProfile`, `:1189-1225`) repeats the same checks.

The developer decided on 2026-09-28:

- Add Beneficiary works whenever the project exists;
- the minimum Beneficiary age is 5;
- a future date of birth is rejected.

## 2. Current Contract

- **PRD-F3.** Sensitive Beneficiary profiles, normalized enrollment, project scope, and consent and provenance as required.
- **[Core P1 supporting operations](cr-pathways-core-p1-supporting-operations.md), "Registration context".**
  - `GET /beneficiaries/projects/:projectId/registration-context` requires `beneficiaries.records.register` with the full protected request path.
  - It returns eligible published registration definitions; zero definitions is a 200 with an empty list.
  - Registration POST pins and locks the exact published definition (`p29_lock_registration_definition`) and validates its fields.
- **Registration field contract.** `beneficiaryRegistrationDefinitionErrors` checks the canonical rules in `beneficiaryRegistrationFieldRules` (`packages/shared/src/validation/beneficiary-registration.ts:9-61,75-110`).
- **`beneficiaries.records.register` holders.** Project Officer, M&E Officer and Project Manager (`authorization-policy.ts:199,251,322`), within assignments.
- **[SADDD RFC](rfc-pathways-saddd-privacy.md) (Locked).** Age is completed years at the reporting-period end date. The bands start at 0-9. Suppression is part of correctness.
- **[Beneficiary step-up](cr-pathways-beneficiary-step-up.md).** Registration POST requires a fresh step-up.

## 3. Proposed Change

### 3.1 System default registration form

1. **Tag column.** Add `digital_forms.system_template_key` (nullable text, check `system_template_key IS NULL OR system_template_key = 'SYSTEM_DEFAULT_REGISTRATION_V1'`). A partial unique index allows one tagged form per organization and project.
2. **`pathways.ensure_default_registration_form(project uuid)`**, SECURITY DEFINER, idempotent:
   - owner `prisma`, empty `search_path`, qualified names, `EXECUTE` only for `pathways_runtime`, revoked from PUBLIC, anon, authenticated and service_role;
   - it derives organization and actor from the runtime context, and requires `beneficiaries.records.register` with project scope, rechecked after its locks;
   - it returns the existing tagged form if one exists, including an archived one;
   - otherwise it creates the form as DRAFT with code `SYSTEM_DEFAULT_REGISTRATION`, version 1 and type `BENEFICIARY_REGISTRATION`, inserts the fixed field set, and publishes it. The code is stored as `system_default_registration`, because registration context accepts only lowercase definition codes.
3. **Fixed field set.** Exactly the canonical fields in `beneficiaryRegistrationFieldRules`, with their data types, required flags and allowed values, and no custom fields. The form therefore passes `beneficiaryRegistrationDefinitionErrors`. Labels and SADDD flags follow the existing registration convention and are fixed at pre-implementation review. Any change to the set requires a new template key.
4. **Attribution.** `created_by_id` is null, because the system authored the form. `published_by_id` is the registrar whose action caused provisioning, with `published_at` at that time. The audit row `DEFAULT_REGISTRATION_FORM_PROVISIONED` records both.
5. **Narrow maker-checker exemption.** `p2_guard_form` is replaced with `CREATE OR REPLACE`. The only new allowance is that a row tagged `SYSTEM_DEFAULT_REGISTRATION_V1` may be published with a null `created_by_id`, and only when the change is made inside the definer function (`current_user` is the function owner, not `pathways_runtime`). Also:
   - `pathways_runtime` cannot set, change or clear the tag;
   - the tag is immutable after insert;
   - every other form keeps the current rule unchanged;
   - published and archived immutability is unchanged;
   - the trigger binding is unchanged.
6. **Who may cause provisioning.** Only callers who can already register Beneficiaries in that project. They cannot choose any form content, so this is not a form-management authority. No `forms.*` grant changes.
7. **Endpoint.** `POST /beneficiaries/projects/:projectId/registration-context/default-form` under `beneficiaries.records.register` with the full protected request path. The final path is fixed at pre-implementation review. It returns the same blank definition shape as registration context and no Beneficiary data.
8. **Registration context.** The tagged template is listed only when the project has no other eligible published registration form. When a project publishes its own form, that form is offered instead, and the template stays as history.
9. **Web.** When registration context returns no definitions and the user holds `beneficiaries.records.register`, the web calls the endpoint once and reloads the context. The "No published registration form" block is removed.
10. Every registration still flows through `promoteRegistration`, with the pinned definition lock, validation, consent records and audit, into the same tables. No second registration path exists.
11. An archived template is not recreated. That project then needs its own published form.

### 3.2 Minimum age and future birth dates

1. **Server (`parseRegistration`):**
   - reject `birth_date` later than the configured business date: "Date of birth cannot be in the future.";
   - reject a derived or supplied age at the enrollment date below 5: "Beneficiary must be at least 5 years old.";
   - keep the upper bound of 130.

   Imported registration rows go through the same function, so a violating row fails promotion on the existing row-error path.
2. **Server edits (`assertSubjectProfile`).** The same two rules apply only when the birth date or `ageAtRegistration` changes. Other edits to existing records whose age is under 5 stay valid.
3. **No database constraint.** Existing rows stay valid, and historical data is not rewritten.
4. **Client:**
   - the birth-date input gets `max` set to the business date;
   - age is computed automatically and shown read-only when a birth date is given;
   - the age input minimum becomes 5;
   - both messages above are shown inline with the existing accessible error pattern;
   - `registrationAgeAtDate` reports a future date as an error, not a silent `null`.
5. **SADDD is unaffected.** The Locked bands, the age-at-period-end rule and suppression are unchanged. The 0-9 band still exists. Its 0-4 range simply receives no new registrations, while existing records and normal ageing continue. Smaller counts in that band are handled by the existing suppression rules.

### 3.3 Migration `0040_default_registration_form`

Migration 0040 adds:

- the tag column, its check constraint and the partial unique index;
- the replaced `p2_guard_form`;
- `ensure_default_registration_form` with grants;
- a postcondition block asserting owners, `search_path`, ACLs and the unchanged trigger binding.

It creates no forms itself, because provisioning happens on first use with an attributable actor.

## 4. Impact

### Product
Add Beneficiary works in every project. Registration enforces a minimum age of 5 and rejects future birth dates.

### Data / Migration
- 0040 adds one column, one index, one function and a guard replacement.
- Tagged forms are created lazily, one per project.
- No existing row changes.

### Authorization / Privacy
- No permission change.
- The single-reviewer publication exception is limited to one fixed, versioned template, and only a definer function can write it.
- The template carries field definitions only, no Beneficiary data.
- Registration keeps step-up, scope, consent and audit.

### API
- Adds the provisioning endpoint.
- Registration context may list the template.
- Adds two new validation messages.

### UI
- The blocking message is removed.
- The date of birth is capped, age is auto-derived, and the minimum is 5.

### Tests
- **Idempotent provisioning:**
  - parallel first calls create one form;
  - a second call returns the same form;
  - an archived template is not recreated.
- **Guard behaviour:**
  - the guard still rejects same-person publication of untagged forms;
  - runtime cannot set or alter the tag;
  - the tagged form is immutable.
- **Denials:**
  - Admin, Program and Grant Manager are denied;
  - an unassigned project is denied;
  - cross-organization calls are denied.
- **Registration and age:**
  - registration through the template creates the same rows as a custom form;
  - ages 4 and 5 at the boundary;
  - a future birth date on create, edit and import;
  - an edit that does not touch the birth date keeps an under-5 record valid.
- **SADDD:** band output is unchanged for existing fixtures.
- **SQL (0040):** runtime tests.

### Documentation
- PRD-F3 acceptance: minimum age 5, no future birth date, default form.
- SDD Beneficiary and forms sections.
- The ingestion RFC notes that imports inherit the age rule.
- QAD rows and index.

## 5. Alternatives Considered

- **Restraint: seed one form per project with two synthetic reviewers.** Rejected. It fabricates attribution and does not cover new projects.
- **Relax maker-checker for all registration forms.** Rejected. It weakens an existing control well beyond the need.
- **Registration without any form.** Rejected. Consent records and the promotion path depend on a form submission.
- **Backfill templates for every project in the migration.** Rejected. The migration would write domain rows with no attributable actor.
- **Database age constraint.** Rejected. Existing rows under 5 would block the migration or need rewriting.

## 6. Migration / Rollback

- 0040 is forward-only with the 0030-style migration identity and ledger precondition. Numbers follow merge order.
- Rollback:
  - revert the code, so the provisioning endpoint is gone;
  - a later forward migration can restore the prior guard;
  - templates already provisioned remain valid published history, because registrations reference them.
- The age rule reverts with code only.
- Hosted application needs separate developer authorization.

## 7. Verification

- Section 4 tests, SQL runtime suites against a reset local database, `pnpm -r typecheck`, `pnpm test`, `pnpm docs:check` and `pnpm sad:check`.
- Digest-bound `pnpm sad:signoff` with reviews from beneficiary-privacy-guardian, organization-isolation-checker, migration-integrity-guardian, metadata-import-validator and design-qa-agent.
- In the local app:
  - Add Beneficiary works on a project with no form;
  - ages under 5 and future birth dates are rejected with the stated messages.
- **Dependencies.**
  - This record's branch follows [import throughput and PDF](cr-pathways-import-throughput-and-pdf.md), which changes how `promoteRegistration` receives preloaded context.
  - The approved `cr-pathways-performance-scaling` (branch `feature/perf-optimizations`, merged in Wave A) keeps Beneficiary reads uncached. Registration context must stay uncached as well.

## 8. Approval

Developer reply on 2026-09-28: "Approve all CRs, Evidence: change constraint, Signed links: no".

## 9. Disposition

Implemented on feature branch; hosted pending.
