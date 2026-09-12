# Deferred legacy public-table retirement

The prior, unapplied `0006_retire_legacy_public_application_tables` migration was
removed from the executable Prisma history during the Stage 4 session-liveness
resequencing. PATHWAYS-dev contains preserved rows in five of the fifteen legacy
tables, so no current workflow may drop, truncate, migrate, or mark those tables
retired.

`deferred-retire-legacy-public-application-tables.sql` is retained only as a
historical review artifact. It is not a Prisma migration and has no enabled
deployment target or runner. Do not execute it. Any future disposition requires
new data classification, an additive data-preserving design, fresh backup/restore
evidence, a new migration identity, and separate authorization.
