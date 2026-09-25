# Operations & Observability Runbook (OPS)

## 0. Current Posture

Feature-development/defense reliability first.

Production deployment architecture is postponed.

## 1. Current Development Evidence to Track

- database connection failures;
- API errors;
- import failure/retry;
- storage failures;
- authorization-denial anomalies;
- scheduled rule-evaluation failures if introduced;
- backup/restore success.

Do not invent production SLOs.

## 2. Logging

Never log:
- passwords;
- bearer/refresh tokens;
- API secrets;
- full secret-bearing DB URLs;
- unnecessary Beneficiary content.

Prefer correlation/request IDs where supported.

## 3. Incident Runbooks

### Database / Migration
Stop writes when integrity is uncertain. Capture state. Never reset blindly. Verify migration lineage. Restore only from tested backup.

### Auth / Authorization
Disable affected privileged path if needed. Preserve evidence. Verify identity/profile/role/permission/assignment chain.

### Beneficiary Privacy
Stop exposure. Preserve evidence. Identify affected surfaces/users/records. Escalate before external claims.

### Import Processing
Preserve raw staging. Stop normalization. Fix safely. Reprocess only with idempotency controls.

### Storage / Publication
Revoke unintended exposure. Distinguish private evidence from approved public media.

### Rule Engine
Disable affected evaluation path/rule if necessary. Preserve snapshots. Do not rewrite history to erase incorrect alerts.

### Backup / Restore
Use `runbook-backup-restore.md`.

## 4. Routine Operations

- check migration state before schema work;
- maintain tested backups before destructive changes;
- review stale accounts/assignments;
- review failed imports/evaluations;
- keep docs Health Check current.

## 5. Postmortems

Use `postmortem-template.md`.

## Self-Check

- [x] no production SLO invented
- [x] security/privacy incidents covered
- [x] backup/recovery linked
