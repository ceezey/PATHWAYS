# Compliance & Legal Readiness Register (CLR)

**Status:** Working
**Version:** 2.0
**Last reconciled:** 2026-10-01
**Owner:** PATHWAYS capstone team

Engineering readiness register, not legal advice. Legal obligations are limited to what the manuscript ethics section states.

## 0. Operating Jurisdiction

| Item | Value |
|---|---|
| Deployment context | Philippines-based; the partner organization is Plan International Pilipinas |
| Stated statute | Republic Act No. 10173, the Data Privacy Act of 2012 (personal and sensitive information processed with confidentiality, limited access and proper protection) |
| Other stated statute | Republic Act No. 8293 (Intellectual Property Code) for attribution and academic integrity |
| Organizational standards | Plan International MERL Standards and MERL Policy (consent, parent or guardian consent under 18, confidentiality, safeguarding) |
| Other obligations (retention periods, breach notification, registration, cross-border transfer) | Not established: the manuscript ethics section does not state them |

## 1. Data Inventory / Record of Processing

Modules are those of [SDD](sdd-pathways.md) section 3.2.

| Module | Data class | Sensitivity | Handling |
|---|---|---|---|
| Beneficiary and Journey | Identity and contact, demographics, consent, participation, journey events | High | Internal users only; encoded or imported, never self-submitted; consent recorded |
| Collection and Metadata | Form responses, import rows | High | Raw staging preserved; access by permission |
| Indicators and Monitoring | Measurements, assessments, aggregate releases | Medium to high | Aggregates released only when approved |
| Evidence, Reporting and Publication | Private evidence media, reports, publications | High (media), low (approved publications) | Private bucket by default; public only after approval |
| Identity and Organization | Staff roles, permissions, audit log, step-up state | Medium | Append-only audit; tenant isolation |
| Project and Activity, Finance, Evaluation, Rules | Project, budget, evaluation and alert data | Low to medium | Role-scoped access |

## 2. Obligations Matrix

| Obligation | Source | Engineering control | Status |
|---|---|---|---|
| Confidentiality and limited access (RA 10173) | Manuscript ethics | Role-based permissions, row-level security, organization isolation | Implemented; legal sufficiency not established |
| No public beneficiary self-registration | Manuscript ethics | No public intake route | Implemented |
| Dummy or anonymized data for testing and demonstration | Manuscript ethics | Synthetic data in development and defense | Practice; not enforced by tooling |
| Beneficiary data hidden from public pages unless approved, aggregated or anonymized | Manuscript ethics | Public Project Tracker shows approved items only | Implemented |
| Informed, documented consent; guardian consent under 18 | Plan International MERL Standards | Consent record per beneficiary | Recorded; verification is organizational |
| Retention and deletion periods | Not stated | None | Not established |

## 3. Escalation Flags

Require organizational privacy or legal review before proceeding:

- onboarding real beneficiary data;
- identifiable public media;
- retention and deletion policy;
- hosting location changes, including `docs/rfc-pathways-aws-hosting-migration.md`;
- single sign-on or identity provider changes;
- a new external data-sharing integration;
- any AI or ML proposal (see [AIA](aia-pathways.md));
- incident and breach procedures.

## 4. Terms of Use Readiness

Not established: no terms of use or privacy notice exists in the repository, and the manuscript does not require one. The system is internal, so no public user accepts terms.

## 5. IP Protection Readiness

Not established: no license file or IP assignment is tracked by these docs. The manuscript cites RA 8293 for attribution only.

## 6. Platform Compliance

| Platform | Use | Compliance status |
|---|---|---|
| Vercel | Web and API hosting | Not established; no data-processing review recorded |
| Supabase | Database, Auth, Storage | Not established; hosted region and terms not reviewed here |
| Sentry | API error reporting | Not established; events must exclude secrets and beneficiary content |

## Self-Check

- [x] legal obligations limited to the manuscript ethics section
- [x] RA 10173 cited as stated
- [x] unknowns marked Not established
- [x] legal approval not implied
