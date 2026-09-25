# Compliance & Legal Readiness Register (CLR)

> Engineering readiness register, not legal advice.

## 1. Sensitive Data Inventory

High-sensitivity classes:

- Beneficiary identity/contact data;
- age/sex/disability demographics;
- participation/journey history;
- assessments/survey data;
- consent/provenance;
- private photos/videos/evidence;
- staff roles/permissions/audit data.

## 2. Engineering Rules

- collect only necessary fields;
- private by default;
- public publication requires approval;
- do not log secrets/sensitive record content unnecessarily;
- retention policy required before real production use;
- synthetic/anonymized data for development/defense.

## 3. Escalation Before Production

Requires organizational privacy/legal review:

- onboarding real Beneficiary data;
- identifiable public media;
- retention/deletion policy;
- cross-border hosting changes;
- SSO/IdP changes;
- new external data-sharing integration;
- AI/ML proposal;
- incident/breach procedures.

## 4. Open Register

| ID | Topic | Status |
|---|---|---|
| CLR-E1 | retention durations | Deferred / policy required |
| CLR-E2 | public Beneficiary media consent/publication | policy + implementation evidence required |
| CLR-E3 | incident/breach process | organizational validation required |
| CLR-E4 | SSO/IdP | deferred |
| CLR-E5 | AI/ML | not approved |

## Self-Check

- [x] sensitive data identified
- [x] legal approval not implied
- [x] deployment/SSO deferral respected
