import {
  type ImportPreviewRequest,
  type ImportPreviewResponse,
  parseImportPreviewRequest,
} from './import-preview-parse'

// Dedicated worker scope, typed locally so the DOM library stays the project default.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ImportPreviewRequest>) => void) | null
  postMessage: (message: ImportPreviewResponse) => void
}

scope.onmessage = (event) => {
  try {
    scope.postMessage({ ok: true, result: parseImportPreviewRequest(event.data) })
  } catch (error) {
    scope.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : 'Unable to parse this file.',
    })
  }
}
