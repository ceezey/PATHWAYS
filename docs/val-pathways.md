# Validation Brief (VALIDATION)

**Status:** Working
**Version:** 2.0
**Last reconciled:** 2026-10-01
**Owner:** PATHWAYS capstone team

This brief tests whether PATHWAYS is worth building as scoped. Problems P1-P8 are defined in `IDEA.md`; evidence here comes from the rev-2026 manuscript and is not extended with new empirical claims.

## 1. Problem Evidence

Source: manuscript Chapter 1 (Problem Analysis, Fishbone Diagram) and Chapter 2 (Field Data Collection and Post-Collection Data Preparation), rev-2026.

| Problem | Evidence in the manuscript | Strength |
|---|---|---|
| P1 | Fishbone People category: dependence on technical staff and uneven usability across roles limit direct access to monitoring outputs | Stated by the study; no measured user count |
| P2 | Repeated export-import handling across KOBO, YES!ME and PMERL; estimate of about forty cumulative working hours per reporting cycle | Estimate, to be confirmed in evaluation |
| P3 | Datasets are exported, imported, verified, mapped and configured into indicators and dashboards before use | Stated workflow description |
| P4 | Absence of standard project structures named in the fishbone Process category | Stated by the study |
| P5 | Fragmented records across tools and files make participation harder to trace | Stated by the study |
| P6 | Literature: mobile collection tools often lack beneficiary identity verification and record linking over time (Roberts et al., 2023) | Published literature |
| P7 | Delays in turning field data into usable information limit prompt response | Stated by the study |
| P8 | Transparency literature and Philippine public systems justify controlled public visibility (Chapter 2) | Published literature |

The pilot setting is Plan International Pilipinas. No primary interview or survey data are reproduced in this repository; further evidence is Not established here.

## 2. Competitor / Substitute Scan

Sources: manuscript Chapter 2 (related systems) and Chapter 1 (coexisting tools).

| System or tool | What it does well | What PATHWAYS does | What PATHWAYS does not replace |
|---|---|---|---|
| KOBO / KoboCollect | Offline-capable structured field collection | Prepares collected records after collection: mapping, validation, linking to project structures | Field data capture itself |
| YES!ME | Existing monitoring and data platform in the pilot workflow | Takes exported data into project records, indicators and reports | The platform's own data collection and configuration |
| PMERL | Existing planning, monitoring and reporting platform in the pilot workflow | Adds beneficiary continuity, rule-based alerts and controlled public visibility | Its reporting role inside the organization |
| Excel / Google Sheets | Flexible manual consolidation | Structured records, audit trail and role-scoped access | Ad hoc analysis by individual staff |
| CBMS, Listahanan | Government community and beneficiary databases | Organization-owned project and beneficiary records | National targeting databases |
| SubayBAYAN, DBM Project DIME | Government project monitoring and transparency | Approved public project information for donors and sponsors | Government infrastructure oversight |
| KALAHI-CIDSS PIMS, PPP Center PIMS | Centralized project records and reporting in public projects | Humanitarian and development focus on beneficiaries, indicators and inclusion | Public-sector project registries |
| RabDash DC and Philippine academic monitoring systems | Dashboards and decision support in health and university contexts | Combines dashboards with metadata-driven preparation and beneficiary journeys | Domain-specific analytics |

PATHWAYS is an interoperable information layer beside existing tools. It makes no claim of real-time synchronization with them.

## 3. Feasibility in Timebox

Calendar timebox: Not established in the source material for this brief. Feasibility is judged from scope restraint and current repository state.

- Project-owned indicators; no Project Template Library.
- Descriptive analytics and deterministic, typed rules; no predictive models.
- Import and preparation instead of full enterprise synchronization.
- Core features (PRD-F1 to PRD-F11) built first; deployment, SSO and cloud hosting deferred (`docs/deferred-features.md`).
- Delivery status of each feature is tracked in `docs/prd-pathways.md` and `docs/build-pathways.md`, not claimed here.

## 4. Kill Criteria

Stop or reduce scope if any of these hold:

- Server-side organization and project isolation cannot be enforced.
- Beneficiary privacy cannot be enforced, including SADDD aggregate-only reporting.
- Monitoring calculations cannot be explained to a user.
- Rules would require arbitrary executable expressions.
- Core features depend on an unverified external integration.
- Supporting features block the core features.

## 5. Concept Visual Reactions

No recorded stakeholder reactions to concept visuals exist. Reactions are therefore Not established, and none are implied. The UI foundations in `docs/dsd-pathways.md` are the design basis until role-based UAT records real reactions.

Keep user-facing setup simple, but do not remove backend provenance, scope or security because a field is hidden from the UI.

## Self-Check

- [x] no unsupported market or user claims
- [x] existing tools treated as complements, with what is and is not replaced
- [x] security and privacy treated as feasibility gates
- [x] unrecorded items marked Not established
