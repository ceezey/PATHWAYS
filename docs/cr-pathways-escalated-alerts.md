# Change Record: Escalated Alerts Queue

**ID:** `cr-pathways-escalated-alerts`  
**Date:** 2026-10-04  
**Status:** Applied (2026-10-04; 0062 on PATHWAYS-devV2, 37-row ledger)

## 1. Trigger

User decision 2026-10-04: Program and Grant Managers need a read-only queue of alerts that a project team escalated. ESCALATE already records an outcome without changing the alert lifecycle (PRD-F10 UC, `prd-pathways.md` main flow at the alert outcome step), but nothing listed escalated alerts.

## 2. Current Contract

`f10_alert_list` filters by lifecycle only. Decision outcomes live in `pathways_rules_internal.decisions`, readable only by the rules owner roles, so the API could not tell which alerts were escalated.

## 3. Change

- Migration `0062_rules_escalated_alert_list` adds `pathways.f10_escalated_alert_list(jsonb)`, SECURITY DEFINER, owned by `rules_human_owner`, EXECUTE for `pathways_runtime` only.
- It lists alerts whose latest decision outcome is ESCALATE. It reads only the decision columns granted to `rules_human_owner` (id, organization, project, alert, outcome, created_at), never the note or the actor, and filters every row with `p06_can('alerts.read')` and `rule_exposure_allowed`, like `f10_alert_list`.
- Input `{ projectId?, cursor?, limit }` through `read_page_input`; pages are cut by alert id and sorted by latest escalation time inside a page. Items are `alert_json` plus `escalatedAt`.
- API `GET /alerts/escalated` (`alerts.read`, declared before `GET /alerts/:id`); `limit` defaults to 25 like `listAlerts`.
- The role overview gains `alerts.escalated` and `alerts.escalatedOpen`; the Program and Grant Manager portfolio shows "Escalated alerts, requiring program-level decision" and falls back to open alerts when none are escalated. The Grant Manager sees no Decide button.
- ESCALATE still never changes the alert lifecycle.

## 4. Impact

### Data / Migration
One function; no table, column, policy or grant outside it. DBA prerequisite: `hosted-rules-escalation-preprovision.sql` (temporary SET-only membership from prisma to `rules_human_owner`) before 0062 and `hosted-rules-escalation-cleanup.sql` right after it, also after a failure (run `prisma migrate resolve --rolled-back` first). The schema owner lends CREATE on `pathways` inside the migration and takes it back. Ledger 37 rows through 0062.

### Tests
- `apps/api/prisma/tests/escalated-alert-list-runtime.sql` (11 assertions, runs after `f10-f11-rules-runtime.sql` in `Verify-Forward.ps1`)
- `apps/api/src/modules/rules/rules-human-escalated.test.ts`
- `apps/api/src/modules/dashboards/role-overview.service.test.ts`
- `apps/web/src/features/dashboard/role-overview/portfolio-overview.test.tsx`

QAD-T118 and QAD-A44.

## 5. Documents Updated

- `docs/prd-pathways.md`: PRD-F8 and PRD-F10 bounds.
- `docs/qad-pathways.md`: QAD-T118, QAD-A44.
- `docs/runbook-role-staging-build.md`: the 37-row ledger and the new preprovision pair.
