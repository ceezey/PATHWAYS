# Archived migration history

`through-0026.zip` preserves all 26 original SQL files and the provider lock. `through-0026.json` records exact byte checksums, canonical Git blob hashes, source commit, historical purposes, superseded definitions, and security invariants. Migration 0001 retains the CRLF bytes required by the historical 0006 guard. The 0015 CRLF explanation and approved 0020 applied-byte exception remain recorded; no historical ledger checksum is changed.

Verify with `python scripts/migrations/history.py`. Extract only into an empty isolated repository `.tmp` directory with `--extract <directory>`. The guarded historical replay performs this extraction automatically. The archive is immutable evidence and a local replay source, not another database migration ledger or a hosted deployment path.

Fresh databases use `0000_pathways_baseline_through_0026` with established provider prerequisites and administrator capabilities for portable Prisma/Postgres ownership. Existing databases never execute that baseline: verify catalog equivalence and register it as applied through Prisma while retaining every historical ledger row. Subsequent corrections use forward migrations. See the registered auth RFC and Change Record for the active contract and application gates.
