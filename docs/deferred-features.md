# Deferred / Hidden Web Controls

Record of web controls removed or hidden from a page, with the reason and a pointer to the
code for re-enabling later.

| Feature | State | Decided | Why | Where | How to re-enable |
|---|---|---|---|---|---|
| Download Format control on the extend import page | Hidden | 2026-09-29 | removed from the extend import page at the developer's request | `apps/web/src/features/collection/collection-workspace.tsx`, the Download format select bound to exportFormat/downloadSavedForm | Remove the view !== 'import' guard around the Download format label block; exportFormat state, formDefinitionExportFormats, and downloadSavedForm (server forms.export endpoint) are unchanged |
