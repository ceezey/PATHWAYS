# RFC: Metadata, Forms, Direct Entry, and Dataset Ingestion

## Objective

Provide project-scoped structured forms and safe spreadsheet/KOBO-like processing without trusting external files as application truth.

## Metadata

Field definitions carry stable identity/code, label, type, required state, validation, ownership, mapping use, and approved monitoring/domain linkage.

## Pipeline

```text
private upload
→ import batch
→ raw rows
→ source headers
→ explicit mapping
→ validation
→ error review
→ authorized normalization
→ domain records
```

Invalid rows remain staged/error.

## File Safety

- bound file size/rows/columns;
- approved file types;
- no macro/formula execution;
- sanitized parser errors;
- private storage;
- object path never grants authorization;
- idempotent/recoverable processing.

## Mapping Safety

Only approved system/form fields are mapping targets.

No arbitrary DB column names, SQL, or executable expressions.

### Conservative code/label matching V1

Preview suggestions use stable parser source-column keys rather than display labels as identity. Compare each source label with the union of approved field codes and labels. Normalize names with Unicode NFKC, trim only ASCII space/tab/LF/CR/form-feed/vertical-tab, fold only ASCII A-Z, then replace runs of those whitespace characters or hyphen with underscore. Preserve other punctuation and non-ASCII case. Aliases are excluded until an approved representation exists.

A source is suggested only when it has exactly one candidate and no other source claims that candidate, including an ambiguous source whose candidate set contains it. Unknown, blank, ambiguous or competing sources remain unresolved. Missing required mappings block validation/normalization. Suggestions confer no manual review or processing authority; existing explicit reviewer confirmation and canonical server validation remain required. This matching definition does not install a server automatic-mapping endpoint or its supporting SQL.

## Provenance

Preserve uploader, org/project, storage object, batch, row index, mapping version, validation result, normalized references, timestamps.

## Tests

Invalid headers, missing fields, wrong types, duplicates, mixed rows, retries, cross-project access, malicious spreadsheet content, large bounded input, failed normalization recovery.

## Server-derived mapping support

The [core P1 supporting operations](cr-pathways-core-p1-supporting-operations.md) contract extends the same conservative code/label algorithm to bounded, scoped server-derived choices. The request supplies batch identity and expected revision only; it cannot choose targets, ignore columns or impersonate a reviewer. All ambiguous claims count, including claims sharing another source's sole candidate. Unresolved columns remain PENDING. One attributable immutable automatic revision and audit commit atomically; stale/frozen/changed retries conflict. A complete automatic mapping may be MAPPED, but status alone grants no review or processing authority: existing explicit authorized review confirmation, canonical validation and authorized normalization remain required. No aliases, external parsing inside long database transactions, or application capability is installed by this contract.
