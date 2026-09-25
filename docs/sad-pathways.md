# Specialist Agent Roster (SAD)

These are review roles, not autonomous project owners.

## 1. Roster

### organization-isolation-checker
Proves org/project scope cannot be bypassed.

### migration-integrity-guardian
Protects migration lineage, schema integrity, backup/rollback gates.

### beneficiary-privacy-guardian
Checks Beneficiary scope, public media, exports, logs, SADDD privacy.

### metadata-import-validator
Checks untrusted files, mappings, staging, idempotency, normalization.

### rule-engine-determinism-checker
Checks typed metrics, operators, ALL/ANY, snapshots, dedup, missing-data behavior, no arbitrary SQL/code.

### restraint-guardian
Challenges unnecessary abstractions/dependencies without cutting security/privacy/tests/accessibility.

## 2. Required Review Triggers

| Change | Specialist |
|---|---|
| authorization/query scope | organization-isolation-checker |
| migration/schema | migration-integrity-guardian |
| Beneficiary/media/SADDD/public | beneficiary-privacy-guardian |
| forms/import/metadata | metadata-import-validator |
| rule/alert/recommendation | rule-engine-determinism-checker |
| new framework/dependency/abstraction | restraint-guardian |

## 3. Review Output

Return:
- PASS / BLOCKED;
- evidence;
- risks;
- exact required fix;
- no unrelated implementation.

## 4. Platform Materialization

Optional future `.claude/agents/*.md` or other platform-specific files may be generated from this roster.

Do not claim they exist until they do.
