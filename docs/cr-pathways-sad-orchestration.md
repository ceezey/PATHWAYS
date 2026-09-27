# Change Record: SAD orchestration, handoff and release sequence

**ID:** `cr-pathways-sad-orchestration`

**Date:** 2026-09-28

**Status:** Applied

**Approval:** On 2026-09-27 and 2026-09-28 the developer approved a coordinate-only SAD orchestrator in `.claude/agents/`, a staged review pipeline with typed handoff packets, and a multi-branch release sequence. The developer authorized autonomous merge and push of `dev` into `master` once every release gate passes on the exact commit.

## 1. Trigger and current contract

The SAD defined seven review roles and a concurrent review protocol. No agent definitions existed. There was no handoff packet, stage order or release sequence, so each session re-derived orchestration and evidence assembly.

## 2. Approved changes

### Review pipeline and handoff

The SAD section 3 becomes a staged pipeline with two gates: ground, route, pre-implementation review, block gate, implement, re-route, final review, evidence assembly and sign-off gate. Section 3.1 defines the handoff packet the orchestrator passes to one specialist per dispatch. The return packet is the section 5 evaluation envelope. Packets bound to a stale digest are discarded.

### Agent definitions

`.claude/agents/` holds `sad-orchestrator`, `release-integrator`, the seven SAD specialists and `requirements-qa-gate`. The definitions point to SAD, BUILD, PRD and QAD sections instead of restating rules; the registered docs stay authoritative. Specialists are read-only. The orchestrator writes only disposable files under `.tmp`. Claude Code subagents cannot spawn subagents, so both coordinators run as the main thread.

### Release sequence

BUILD section 2 adds a release sequence: independent feature review, integration merge from `dev`, merged-digest review, requirements QA gate, `dev` push with preview verification, then `master` push. Merge conflicts halt the run. Schema or migration releases stop before `master` for human authorization. Force-push, history rewriting and migration application remain prohibited.

### Model tiers

The developer assigned agent models on 2026-09-28. Opus: `release-integrator`, `requirements-qa-gate`, `beneficiary-privacy-guardian`, `migration-integrity-guardian`, `design-qa-agent`, `restraint-guardian`. Sonnet: `sad-orchestrator`, `organization-isolation-checker`, `metadata-import-validator`, `rule-engine-determinism-checker`. The SAD roster Model column and section 3.1 record them; agent frontmatter must match.

### Drift guard

`pnpm docs:check` fails when SAD roster role names or models and `.claude/agents` definitions differ, or when an agent lacks a valid `model:`.

### Checker index lookup

Applying this change exposed a checker defect: `<ref>:<path>` revision syntax fails for dot-prefixed paths such as `.claude/agents/*`, and bracketed route paths fall back to pathspec matching and can return empty or sibling bytes. `scripts/sad/check.ts` now resolves index and revision blobs through literal-pathspec `git ls-files -s` or `git ls-tree`, requires an exact path match, and fails closed on unmerged index entries. Regression tests cover dot-prefixed, bracketed and conflicted paths.

## 3. Propagation

| Artifact | Affected | Done |
|---|---|---|
| `docs/sad-pathways.md` sections 3, 3.1 | Yes | [x] |
| `docs/build-pathways.md` sections 2, 7 | Yes | [x] |
| `AGENTS.md` (materialized) | Yes | [x] |
| `docs/index.md` change log | Yes | [x] |
| `scripts/docs/check.py` roster guard | Yes | [x] |
| `scripts/sad/check.ts` index lookup and test | Yes | [x] |
| `.claude/agents/*.md` | Yes | [x] |
| SAD roster Model column and agent `model:` frontmatter | Yes | [x] |
| Runtime authorization, privacy, migrations | No | n/a |

## 4. Verification

`pnpm docs:materialize`, `pnpm docs:check` and `pnpm sad:check` on the resulting change.
