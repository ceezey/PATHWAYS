# Scrutiny Gate (SCRUTINY)

**Status:** Working
**Version:** 2.0
**Last reconciled:** 2026-10-01
**Owner:** PATHWAYS capstone team

## 1. Verdict

Decision: `PROCEED WITH FIXES`

Claims extracted: 10 (8 verified, 2 caveated) from the rev-2026 manuscript and repository baseline.

The concept is coherent and bounded. The main risks are documentation drift from code and overclaiming implementation maturity; both are controlled by `pnpm docs:check` and the PRD gate criteria.

## 2. Claim & Reference Audit

| # | Claim | Finding | Source |
|---|---|---|---|
| 1 | Field data move through separate tools and need repeated preparation | Verified | Manuscript Chapter 1, Problem and Solution Statement, rev-2026 |
| 2 | About forty working hours of preparation per reporting cycle | Caveated: estimate, not a measured saving | Manuscript Chapter 1, Problem Analysis, rev-2026 |
| 3 | Mobile collection tools often lack identity verification and record linking | Verified | Manuscript Chapter 2, Field Data Collection, Roberts et al. 2023 |
| 4 | A monitoring layer need not replace KOBO | Verified | Manuscript Chapter 2, Field Data Collection, rev-2026 |
| 5 | Decision support is rule-based and human-led | Verified | Manuscript Chapter 2, Decision Support, rev-2026 |
| 6 | Role-based access is enforced server-side | Verified | Repository 2026, `apps/api/src/common/guards/supabase-auth.guard.ts` (reads the permission decorator on each route); grants defined in `apps/api/src/modules/auth/rbac-contract.json` and checked by `csv-rbac.test.ts` |
| 7 | Data model covers organizations, projects and beneficiaries | Verified | Repository 2026, `apps/api/prisma/schema.prisma` |
| 8 | Schema changes are versioned migrations | Verified | Repository 2026, `apps/api/prisma/migrations` |
| 9 | Documentation set passes automated checks | Verified | Repository 2026, `scripts/docs/check.py` |
| 10 | Pilot results prove the workflow saves effort | Caveated: no evaluation data yet | Manuscript Chapter 3, Evaluation Plan, rev-2026 |

## 3. Gap Analysis

| Gap | Status | Required treatment |
|---|---|---|
| Docs and code drift | Active | Keep `pnpm docs:check` at 0 failures and 0 warnings |
| Feature completion | Active | Verify feature by feature against PRD gates |
| Server-side isolation | Invariant | Keep abuse tests mandatory |
| Beneficiary privacy | Invariant | Verify aggregate-only and project rules |
| Import reliability | Active | Staging, validation, idempotency |
| Rule engine explainability | Supporting | Typed metrics, deterministic evaluation |
| Public publishing | Supporting | Separate approval step before publication |
| Hosting, SSO, cloud move | Deferred | Not a current feature blocker; hosting and cloud are the hosting and AWS row of `docs/deferred-features.md`, and the identity provider is an open decision in `docs/rfc-pathways-aws-hosting-migration.md` section 9 |
| UI maturity wording | Active | No prototype, mock or demo labels in user-facing copy |

## 4. Assumption Stress-Test

- Simple UI does not imply simple security.
- Metadata-driven does not imply automatic semantic inference.
- Decision support does not imply AI.
- A public tracker does not imply public internal records.
- System Administrator does not imply unrestricted cross-organization access.
- Progress does not imply one universal project percentage.

## 5. Feasibility & Scope

Scope is bounded by project-owned indicators, descriptive analytics, deterministic rules and import-based integration. Calendar feasibility: Not established in the source material. Scope-reduction triggers are the kill criteria in `docs/val-pathways.md` section 4.

## 6. Risk & Compliance Pre-flight

Highest risks:

- beneficiary identity, demographics and media;
- imports and mapping errors;
- cross-organization and cross-project access;
- public publication of unapproved information;
- account and assignment changes;
- SADDD reconstruction from small groups;
- budget and indicator rule explainability.

Compliance: Philippine data privacy obligations apply to beneficiary data. A formal legal review is Not established here and is a blocking question below.

## 7. Blocking Questions

1. Who signs off public-tracker publication for each organization?
2. What retention period applies to beneficiary records and media?
3. Has legal counsel reviewed the privacy treatment of beneficiary data?
4. What evaluation data will confirm or replace the forty-hour estimate?

## Self-Check

- [x] decision explicit and within allowed values
- [x] every Verified claim carries a manuscript section or repository path
- [x] estimates and unmeasured results caveated
- [x] security and privacy treated as blockers
