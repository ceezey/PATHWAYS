# Pitch & Demo Script

## 1. Narrative Spine

1. HDO project information fragments after field collection.
2. Repeated preparation delays monitoring/review.
3. PATHWAYS centralizes project and Beneficiary information.
4. Metadata structures validation/mapping.
5. Monitoring/SADDD turn persisted records into usable summaries.
6. Rules flag explainable conditions and retrieve predefined recommendations.
7. Humans review outcomes.
8. Approved public visibility supports transparency without sensitive leakage.

## 2. Slide Outline

1. Problem/workflow basis
2. PATHWAYS identity/scope
3. Role/access model
4. Project monitoring structure
5. Metadata/forms/import
6. Beneficiary profile/journey
7. indicators/dashboard/SADDD
8. rules/recommendations
9. reports/public tracker
10. security/limitations/roadmap

## 3. Live Demo

```text
login
→ role-aware workspace
→ project
→ monitoring/form/import
→ Beneficiary profile/journey
→ indicator/dashboard/SADDD
→ alert/recommendation
→ report/public preview
```

Use synthetic/anonymized data.

## 4. Defense Guardrails

Do not demo a flow as complete unless:

- persistence is real;
- backend authorization is enforced;
- no runtime mock fallback fabricates the claimed behavior;
- relevant tests pass;
- no confidential Beneficiary data is used.

## 5. Anticipated Q&A

**Is PATHWAYS AI?**  
No. Current rules/recommendations are deterministic, predefined, and human-reviewed.

**Why metadata-driven?**  
Metadata defines field meaning, validation, mapping, and monitoring use.

**Why not just KOBO/Excel?**  
PATHWAYS focuses on post-collection project information, Beneficiary continuity, monitoring, audit, and controlled visibility.

## Self-Check

- [x] limitations are part of the pitch
- [x] AI scope accurate
- [x] demo requires real persistence/authz
