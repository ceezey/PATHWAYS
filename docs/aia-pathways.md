# AI Assurance Dossier (AIA)

**Status:** Working; not triggered
**Version:** 2.0
**Last reconciled:** 2026-10-01
**Owner:** PATHWAYS capstone team

## 0. Trigger and Scope

The AIA is not triggered. PATHWAYS has no AI or ML in the product: no model inference, training or generated content at runtime. AI coding assistants are development tools, not runtime dependencies.

## 1. System Card

| Item | Value |
|---|---|
| Decision support | Deterministic rule engine (`apps/api/src/modules/rules/rule-engine.ts`) |
| Inputs | Configured alert rules, conditions and project data |
| Outputs | Rule-based alerts and predefined, human-reviewed recommendation prompts |
| Learning | None; the same inputs give the same results |
| Human role | Staff review alerts and decide; no autonomous action |

## 2. Risk Register

| ID | Risk | Mitigation |
|---|---|---|
| AIA-R1 | Wrong source data yields a wrong alert | Import validation; alerts cite their inputs |
| AIA-R2 | Wrong metric definition | Rules are configured and reviewed before enabling |
| AIA-R3 | Inappropriate threshold | Threshold review by the project manager |
| AIA-R4 | Alert history rewritten | Snapshots preserved; history is not rewritten |

## 3. Self-Audit Checklist

- [x] no model, training data or inference service in the runtime
- [x] rules distinguished from AI in all docs
- [x] every recommendation is predefined and human-reviewed
- [ ] re-run this checklist when any trigger in section 4 is proposed

## 4. Cross-links and Escalation

A Change Record and explicit approval are required before any feature that predicts beneficiary outcomes, generates recommendations with ML or generative inference, ranks beneficiaries, makes autonomous decisions or trains on sensitive data. Escalate to privacy review per [CLR](clr-pathways.md) section 3. The rules module is in [SDD](sdd-pathways.md) section 3.2.

## 5. Regulatory Awareness

Not established: the manuscript states no AI-specific regulation. Only RA 10173 is cited, in [CLR](clr-pathways.md) section 0.

## 6. Materialization

Not applicable while the dossier is not triggered. If triggered, add a model card, data lineage and evaluation results here.

## Self-Check

- [x] no model falsely claimed
- [x] rules distinguished from AI
- [x] future AI trigger defined
