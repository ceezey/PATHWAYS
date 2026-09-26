# Runbook: Local Development

## Principles

- use repository package manager/scripts;
- copy environment templates rather than committing secrets;
- never point destructive commands at production;
- use local/disposable DBs for migration experiments;
- use synthetic test identities/data.

## Session Start

1. Read `docs/index.md`.
2. Read `AGENTS.md`.
3. Read the relevant registered PRD/SDD/RFC/DSD/QAD documents for the task.
4. Load the developer-supplied disposable task/phase context.
5. Inspect current branch/status.
6. Confirm environment target.
7. Run repository-defined install/build/test/validate commands.

Exact commands must be filled from the current repo; do not invent them here.

## Environment Safety

Never print full secret-bearing URLs.

Separate:
- runtime DB credentials;
- migration credentials;
- local shadow DB;
- restore-test DB.

## End of Session

- tests;
- diff review;
- update durable registered docs only when an approved contract or verified repository fact changes;
- keep disposable task status outside the repository;
- chat phase report;
- hard stop.
