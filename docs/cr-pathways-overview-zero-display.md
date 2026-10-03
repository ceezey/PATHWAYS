# Change Record: Overview Zero Display

**ID:** `cr-pathways-overview-zero-display`  
**Date:** 2026-10-03  
**Status:** Applied (2026-10-03; web only, no API or data change)

## 1. Trigger

The product owner asked on 2026-10-03 that the Project overview show the numeral 0 instead of text for Budget utilization and Beneficiaries reached when there is no data yet.

## 2. Current Contract

DSD rule: missing data is never shown as 0; a real zero from the server is shown as 0. Missing budget and reach tiles read "None yet", "Budget not recorded" or "After project close". QAD-P04 asserted this.

## 3. Proposed Change

- Budget utilization shows `0%` when its metric is MISSING or NOT_APPLICABLE.
- Beneficiaries reached shows `0` when its metric is MISSING or NOT_APPLICABLE, and a missing target shows `0`.
- Dashboard Project monitoring cards (Participation records, Distinct attending individuals, Enrolled individuals) show `0` when MISSING or NOT_APPLICABLE (added 2026-10-03, `apps/web/src/features/dashboard/role-dashboard.tsx`).
- Unchanged: suppressed counts (1-4) still read "Suppressed (fewer than 5)", a section withheld by permission still reads "Unavailable", load failures keep their error and retry, and KPI achievement and Timeline keep their "None yet" style labels.

## 4. Impact

### Product
Two overview tiles read 0 before data exists. Viewers cannot tell "no data yet" from a true zero on those tiles; the Budget tab and reports keep the detailed state.

### Data / Migration
None.

### Tests
`apps/web/src/features/projects/project-detail-view.test.tsx` asserts `0%` and `0 / <target>` for missing sources and keeps "Unavailable" for permission-null sections. QAD-P04 is reworded to match.

## 5. Documents Updated

- `docs/dsd-pathways.md`: the zero rule names this exception.
- `docs/qad-pathways.md`: QAD-P04.
