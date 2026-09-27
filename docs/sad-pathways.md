# Subagent Document (SAD)

**Status:** Control

**Last reconciled:** 2026-09-28

**Basis:** developer-approved SAD adoption, 2026-09-26.

These are review roles, not autonomous project owners. This governance reconciles the supplied SAD with repository patterns and Locked PATHWAYS contracts. It does not change runtime authorization, privacy, migration history, or feature scope.

## 1. Roster and Trigger Paths

Paths are repository-relative globs normalized to forward slashes. `**` includes zero or more directories. Match both old and new paths for renames; deletions require review of affected callers. Semantic changes outside these paths still require the relevant specialist.

| Specialist | Trigger globs | ISO 25010 pillars | Model |
|---|---|---|---|
| organization-isolation-checker | `apps/api/src/**/*.service.ts`, `apps/api/prisma/schema.prisma`, `infra/supabase/**/*.sql`, `apps/api/prisma/migrations/**/*.sql`, `infra/supabase/phase6/*.ps1` | Security: confidentiality and accountability | sonnet |
| migration-integrity-guardian | `apps/api/prisma/migrations/**/*.sql`, `apps/api/prisma/schema.prisma`, `apps/api/prisma/history/**`, `infra/supabase/**/*.sql`, `infra/supabase/phase6/*.ps1`, `scripts/migrations/**`, `.github/workflows/ci.yml` | Reliability: fault tolerance and recoverability | opus |
| beneficiary-privacy-guardian | `apps/api/src/**/*.controller.ts`, `apps/web/src/api/**/*.ts`, `**/schemas/*.zod.ts`, `apps/web/src/lib/services/**/*.ts`, `packages/shared/src/validation/**/*.ts` | Compatibility: interoperability; Security: data protection | opus |
| metadata-import-validator | `packages/imports/src/**/*.ts`, `apps/api/src/modules/imports/**/*.ts` | Functional Suitability: correctness and appropriateness | sonnet |
| rule-engine-determinism-checker | `packages/shared/src/monitoring/**/*.ts`, `apps/api/src/modules/indicators/**/*.ts` | Performance Efficiency: time behaviour and resource utilization | sonnet |
| restraint-guardian | `**/package.json`, `pnpm-workspace.yaml`, `**/tsconfig*.json`, `scripts/sad/**` | Maintainability: modularity and reusability | opus |
| design-qa-agent | `apps/api/src/**`, `apps/web/src/**`, `packages/**`, `scripts/sad/**`, `infra/supabase/phase6/*.ps1`, `.github/workflows/ci.yml` | All eight pillars below | opus |

The core design QA role evaluates every modified or added application/package file before engineering sign-off. Review tooling and migration replay also receive QA because their correctness controls other reviews. Trigger routing is a minimum, not permission to omit an implicated specialist.

## 2. Mandatory Engineering Rules

### organization-isolation-checker

- Require structural tenant and assignment scope before retrieving multi-tenant data. Explicit `organizationId`/`projectId` predicates, verified shared predicates, relation filters, compound keys, and tenant-bound creation data are valid patterns. Never retrieve broadly and filter sensitive records in memory.
- Review unsafe raw-query calls for parameterization; reject dynamic SQL assembled from untrusted inputs. A lexical match is a review flag, not proof that a parameterized call violates isolation.
- RLS compares stored scope with trusted authenticated identity/claims natively where applicable. JWT metadata does not replace the verified identity, linked user, account state, organization, role, permissions, and assignment chain in the Locked auth RFC.

### migration-integrity-guardian

- Preserve exact applied SQL, archived bytes, and ledger checksums, including registered exceptions. Never silently rewrite applied migrations or introduce another Prisma ledger.
- Block destructive table/column removal or type changes without separate authorization, an out-of-band data-preservation routine, and tested recovery. A lexical SQL match requires review of its actual effect.
- Use backward-compatible defaults, nullable additions, or staged backfills for structural changes.
- Permit compatible `CREATE OR REPLACE FUNCTION`; review signatures, dependencies, ownership, ACLs, search path, and security behavior. Require explicit `DROP FUNCTION IF EXISTS` teardown only when replacement requires it, with dependency/recovery review.
- Verify replay against disposable databases. Baseline registration on populated databases must not execute baseline DDL.

### beneficiary-privacy-guardian

- Permit authorized Beneficiary detail only within the Locked RBAC/project scope. Aggregate-only roles receive aggregates with SADDD protections; public media needs separate approval/provenance.
- Omit unauthorized PII and internal secrets from responses and logs, including `pino.info()`. Review downstream ingestion, serializers, exports, and error paths.
- Require explicit output allowlists or validated output schemas to prevent implicit internal-key leakage. Existing DTO/class-validator and shared validation patterns remain valid; do not mandate Zod where another adequate pattern exists.

### metadata-import-validator

- Validate bounded file envelopes before parsing, then normalize decoded untrusted records before domain use. Use `Zod.safeParse()` where Zod is the established boundary; preserve equivalent validated repository patterns.
- Keep related database mutations atomic through established transactions. Do not wrap file parsing or external storage operations in long database transactions.
- Preserve raw staging, validation failures, explicit mappings, authorization, retries, idempotency, and audit history.

### rule-engine-determinism-checker

- Handle divide-by-zero, empty sets, nulls, and missing properties in calculations and observation streams. Missing/unavailable metrics remain unavailable; do not invent a zero value.
- Reject arbitrary executable expressions, `eval`, dynamic `Function`, arbitrary SQL, and unvalidated logic maps. Use typed metrics/operators, deterministic evaluation snapshots, and bounded execution.

### restraint-guardian

- Flag new external npm dependencies for explicit justification against native capabilities, existing dependencies, and small explicit implementations.
- Avoid unnecessary abstractions and coupling without cutting validation, security, privacy, recovery, tests, or accessibility.

### design-qa-agent

| ISO 25010 pillar | Required review |
|---|---|
| Functional Suitability | Typed interfaces, acceptance criteria, edge/error bounds, deterministic validation |
| Performance Efficiency | Bounded loops/lookups, query relationships, indexes, N+1 risks, resource limits |
| Compatibility | Workspace imports and shared/config/imports contracts remain compatible |
| Usability | ARIA semantics, keyboard/focus behavior, Radix primitives, hook/view separation where relevant |
| Reliability | Descriptive errors, recovery, telemetry; established centralized handling/Sentry interception is acceptable |
| Security | Validated inputs, trusted roles/scope, safe paths, no loose executable inputs or secret leakage |
| Maintainability | Cohesion, testability, limited coupling/boilerplate/conditional complexity |
| Portability | Established localized configuration wrappers, including `packages/config/src/env.ts`; no machine-specific runtime assumptions |

Mark irrelevant pillar details as not applicable in evidence; a PASS must still state all eight were considered. Passing this review does not establish complete ISO certification.

## 3. Sequenced Review Pipeline

Stages run in order. A gate failure stops every later stage.

| Stage | Action | Output |
|---|---|---|
| S0 Ground | Read the manifest, build guide, applicable contracts and proposed changed paths. | contract list |
| S1 Route | Run `pnpm sad:check --output .tmp/sad/<run>/manifest.json`. | roles, role/path pairs, digest |
| S2 Pre-review | Dispatch matching specialists and design QA concurrently, in bounded batches within available agent slots. | evaluation envelopes |
| G1 Block gate | Any BLOCKED entry stops dependent implementation until corrected. Remediation returns to the implementer. | pass or remediation list |
| S3 Implement | The main session or developer implements only the authorized reviewed scope and runs tests. The orchestrator never edits source. | changed content |
| S4 Re-route | Rerun S1. A new digest invalidates earlier evidence; newly matched paths add roles. | final manifest |
| S5 Final review | Repeat specialist and design review against the final digest. | final envelopes |
| S6 Assemble | Merge final envelopes into `.tmp/sad/<run>/reviews.json` with the final digest, sorted by role then path. | evidence file |
| G2 Sign-off gate | Run `pnpm sad:signoff -- --reviews <evidence>`. Sign off only when all required roles have valid matching PASS evidence and required tests pass; otherwise raise a Human Intervention block from the build guide. | sign-off or block |

Missing required evidence withholds engineering sign-off. Unmatched roles are omitted; documentation-only changes do not imply code compliance.

### 3.1 Handoff Packet

The orchestrator dispatches one role per specialist call with this packet:

```json
{
  "run_id": "<timestamp-slug>",
  "stage": "S2",
  "change_digest": "<manifest digest>",
  "role": "beneficiary-privacy-guardian",
  "paths": ["apps/web/src/lib/services/pathways-client.ts"],
  "contracts": ["docs/sad-pathways.md#2", "docs/clr-pathways.md"],
  "prior_findings": [],
  "constraints": ["read-only", "review listed paths only", "return section 5 envelope only"]
}
```

The specialist returns exactly the section 5 envelope, with one entry per finding or one PASS entry per reviewed path, and its role's required ISO pillars. Specialists never edit files. The orchestrator discards a return whose packet digest differs from the current manifest, and redispatches a malformed return once before recording BLOCKED. `prior_findings` carries unresolved G1 findings into S5 so remediation is verified.

Agent definitions live in `.claude/agents/`: `sad-orchestrator`, one file per section 1 specialist, `release-integrator` and `requirements-qa-gate`. Each definition sets its `model:` frontmatter: specialists use the section 1 Model column, `release-integrator` and `requirements-qa-gate` use opus, and `sad-orchestrator` uses sonnet. Changing a model is a SAD change. Definitions point to this document instead of restating rules; this document stays authoritative, and `pnpm docs:check` fails on roster drift. Claude Code subagents cannot spawn subagents, so coordinators run as the main thread (`claude --agent sad-orchestrator`). The release sequence that composes this pipeline is in the build guide section 2.

Review reports, manifests, and task tracking belong outside tracked repository files. Use paths outside the repository or a Git-ignored disposable directory such as `.tmp`; unignored in-repository reports are prohibited. Evidence input and manifest output must use different paths. Do not commit disposable review artifacts.

## 4. Commands and Evidence

- `pnpm sad:check` scans local staged, unstaged, and untracked changes against HEAD. Use `--base REV --head REV` for an explicit committed range.
- `pnpm sad:check --output <external-json-path>` writes the change manifest, SHA-256 digest, required roles, and automated diagnostics separately; stdout remains the evaluation envelope below.
- `pnpm sad:test` runs checker regression tests.
- `pnpm sad:typecheck` checks the review tooling's TypeScript interfaces.
- `pnpm sad:signoff -- --reviews <external-json-path>` validates external specialist evidence against the current change digest. Range/output flags follow the checker interface.

The digest binds normalized changed paths, base and final file contents, and differing staged contents, including deletion/rename context. Staged code remains reviewed even when working content restores HEAD; re-staging invalidates its evidence. Ordering is deterministic. Automated checks route reviews, detect executable `eval`/`Function` through the TypeScript AST, flag unsafe raw queries/destructive SQL/dependency additions, and protect preserved migration history. Warning entries use PASS with explicit warning evidence and no semantic certification. Semantic safety still requires specialist evidence.

The [approved rollout Change Record](cr-pathways-self-managed-rollout-scenarios.md) permits one exact unapplied 0031 source transition at its existing path: SHA-256 `210f0f52abdf273c134e4aa66423dd1c5cbce5a3d61e4ad711c73f2a5fd34551` to `2ad17c0810939c8f392f4a35062643ad692c423517ff124b8bea0dbaae5e6375`. The checker emits a required semantic-review diagnostic for this pair; it does not certify migration execution. Renames, deletion, different bytes, differing staged content and all other existing migration/history changes retain the integrity block. Final digest-bound specialist evidence and replay/recovery checks remain mandatory.

CI runs automated SAD checks independently on PRs and `dev`/`master` pushes, publishing diagnostics as artifacts. Automated CI is not an authenticated reviewer or full SAD approval system. Missing, stale, malformed, or BLOCKED external evidence fails final agent sign-off.

## 5. Deterministic Output Schema

Every evaluation uses exactly the supplied envelope. `implicated_lines` is an integer array of positive line numbers, with `[]` when no line applies. Emit one entry per finding or one PASS entry per completed role/file review. External sign-off evidence must cover every routed role/path pair, including both renamed paths, and all required ISO pillars. File paths are normalized and repository-relative; whole-change evidence does not substitute for file coverage.

```json
{
  "subagent_evaluations": [
    {
      "subagent": "organization-isolation-checker",
      "status": "BLOCKED",
      "iso_25010_compliance": ["Security"],
      "findings": {
        "file_path": "apps/api/src/modules/projects/projects.service.ts",
        "implicated_lines": [42],
        "violation_evidence": "Illustrative finding: a multi-tenant query retrieves records before tenant scope is applied."
      },
      "prescribed_remediation": "Apply the verified organization and project-assignment predicate before retrieval."
    }
  ]
}
```

The external evidence file binds that envelope to the manifest digest:

```json
{
  "change_digest": "<copy the SHA-256 digest from the current manifest>",
  "subagent_evaluations": [
    {
      "subagent": "restraint-guardian",
      "status": "PASS",
      "iso_25010_compliance": ["Maintainability"],
      "findings": {
        "file_path": "package.json",
        "implicated_lines": [],
        "violation_evidence": "Illustrative completed review: no external dependency added; existing tooling provides the implementation."
      },
      "prescribed_remediation": "None."
    }
  ]
}
```

Examples are schema illustrations, not executable review evidence. An empty evaluation array means no role evaluation was executed or required; it is not blanket PASS.
