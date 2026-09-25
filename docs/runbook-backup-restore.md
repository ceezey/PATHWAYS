# Runbook — PostgreSQL Backup and Restore Rehearsal

**Status:** Development runbook based on the verified PATHWAYS-dev workflow used during database migration work.

## Principles

A `.dump` file alone is not trusted.

A trusted backup requires:

```text
successful pg_dump
→ archive inspection
→ SHA-256
→ isolated restore
→ source/restored verification
```

Supabase CLI is not required.

## Connections

Remote Supabase:
- use SSL;
- Session Pooler port 5432 when appropriate for the current environment.

Local PostgreSQL:
- local SSL may be disabled depending on workstation configuration.

Never restore into PATHWAYS-dev.

Never use the Prisma shadow DB as the restore rehearsal DB.

## Mixed-Case Table Names

Prefer PostgreSQL 18 filter files for quoted mixed-case identifiers rather than fragile repeated PowerShell `--table` arguments.

## Restore Target

Use a fresh timestamped disposable local DB.

Use a single transaction where appropriate for the small application backup.

## Evidence

Record:
- source;
- timestamp;
- backup file;
- SHA-256;
- row counts;
- migration ledger state/checksum when present;
- restore result;
- Auth/Storage untouched state.

## Final Rule

A dump becomes trusted only after restore and verification.
