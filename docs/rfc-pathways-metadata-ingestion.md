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

## Provenance

Preserve uploader, org/project, storage object, batch, row index, mapping version, validation result, normalized references, timestamps.

## Tests

Invalid headers, missing fields, wrong types, duplicates, mixed rows, retries, cross-project access, malicious spreadsheet content, large bounded input, failed normalization recovery.
