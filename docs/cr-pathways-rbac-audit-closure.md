# Change Record: RBAC Audit Closure

**ID:** `cr-pathways-rbac-audit-closure`
**Date:** 2026-09-28
**Status:** Applied locally (2026-09-28); integration verified on `dev`. Descriptive analytics also suppress person-derived counts 1-4 and omit the duplicate enrolled total when SADDD is released.

## 1. Trigger

The [revised RBAC CSV audit](audit-pathways-rbac-csv-20260928.md) recorded two Medium findings (A-01, A-02), three Low findings (A-03 to A-05) and one Info item (A-06). Its closure path requires each material finding to be closed through an approved Change Record, explicitly deferred with rationale, or shown false. This record carries the developer decisions made on 2026-09-28.

## 2. Decisions

### A-01 Evidence listing for aggregate-only roles

Add `GET projects/:projectId/evidence`, gated by `evidence.read` and resolved through the protected request path, including project scope, before any query runs. Project roles receive evidence entries within their assignments. Program Manager and Grant Manager receive aggregate metadata only: counts and status per activity, with no Beneficiary fields. The web `pathwaysClient.getEvidence` uses this endpoint instead of the activity list.

### A-02 Granted actions without implementation

Implement:

- `activities.progress.update`;
- `forms.generate`;
- `assessments.detail.read` (System Administrator remains denied);
- `analytics.descriptive.read`, with SADDD suppression per the [SADDD RFC](rfc-pathways-saddd-privacy.md);
- `analytics.export`, with every export audited.

Defer `activities.escalations.read`, `activities.escalations.raise` and `dashboards.customize`. They need new tables, so implementing them requires a separate Change Record with migration authorization.

Defer `forms.import` (CSV row 63). `DataImportBatch` requires an existing `DigitalForm` through its `formId` and `formVersion` foreign keys, and `MetadataMapping` targets `FormField` rows, so staging an imported form definition needs a schema change and a separate Change Record. `forms.generate` stays in scope. The grants stay; permissions alone are not feature completion.

### A-03 Web-only gates

Hide or disable the archive-project and backup create and restore controls, which have no backend. The remaining web-only gates were verified as drawing their data under other permissions and need no change.

### A-04 Unused supporting permissions

`evaluations.submit`, `evaluations.approve`, `evaluations.signoff`, `evaluations.archive`, `settings.read` and `settings.labels.manage` are reserved supporting permissions. They stay defined and are documented as reserved in the [auth RFC](rfc-pathways-auth-rbac-isolation.md). The four evaluation permissions and `settings.labels.manage` are currently granted to no role; `settings.read` keeps its existing grants. No grant changes.

### A-05 Unreachable project-create branch

Remove `SYSTEM_ADMINISTRATOR` from the project creation allow list in `projects.service.ts`. The permission check already denies that role, so behavior does not change.

### A-06 User-management hierarchy

The developer confirmed the hierarchy: Program Manager authorizes Project Manager and M&E Officer; Project Manager authorizes Project Officer and M&E Officer; only System Administrator assigns Grant Manager. The auth RFC cites it next to CSV rows 23-27.

## 3. Changes

- Documentation (this record): auth RFC notes for A-04 and A-06, index registration and an audit disposition note.
- Implementation (pending): the A-01 endpoint and web client change, the A-02 handlers, the A-03 UI change and the A-05 code cleanup. No migration, grant or role-ceiling change is in scope.

## 4. Verification

- QAD happy, sad and abuse tests for each new endpoint, including cross-project and cross-organization denial.
- Aggregate-only responses for Program Manager and Grant Manager contain no Beneficiary fields.
- Descriptive analytics apply SADDD suppression; exports write audit entries.
- System Administrator stays denied for `assessments.detail.read`.
- `csv-rbac.test.ts` still passes with the grant set unchanged.

## 5. Disposition

Mark Applied after implementation, SAD sign-off and verification. The deferred A-02 items stay open until their own Change Record.
