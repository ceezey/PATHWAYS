import {
  type ImportPreviewRequest,
  type ImportPreviewResponse,
  type ImportPreviewResult,
  parseImportPreviewRequest,
} from './import-preview-parse'

export type { ImportPreviewResult } from './import-preview-parse'
export { parseImportPreviewRequest } from './import-preview-parse'

/**
 * Advisory client preview of a selected source file. The server sandbox parse stays
 * authoritative. Parsing runs in a Web Worker so a large workbook does not block the
 * page; environments without Worker support parse on the main thread.
 */

const PREVIEW_TIMEOUT_MILLISECONDS = 30_000

function parseInWorker(request: ImportPreviewRequest) {
  return new Promise<ImportPreviewResult>((resolve, reject) => {
    const worker = new Worker(new URL('./import-preview.worker.ts', import.meta.url), {
      type: 'module',
    })
    const finish = () => {
      window.clearTimeout(timer)
      worker.terminate()
    }
    const timer = window.setTimeout(() => {
      finish()
      reject(new Error('The file preview took too long. Choose a smaller file.'))
    }, PREVIEW_TIMEOUT_MILLISECONDS)
    worker.onmessage = (event: MessageEvent<ImportPreviewResponse>) => {
      finish()
      if (event.data?.ok) resolve(event.data.result)
      else reject(new Error(event.data?.message || 'Unable to parse this file.'))
    }
    worker.onerror = () => {
      finish()
      reject(new Error('Unable to parse this file.'))
    }
    if (request.kind === 'workbook') worker.postMessage(request, [request.buffer])
    else worker.postMessage(request)
  })
}

export async function parseImportPreview(file: File): Promise<ImportPreviewResult> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  let request: ImportPreviewRequest
  if (extension === 'csv') request = { kind: 'csv', text: await file.text() }
  else if (extension === 'xlsx' || extension === 'xls')
    request = { kind: 'workbook', buffer: await file.arrayBuffer() }
  else throw new Error('Choose a CSV, XLS, or XLSX file.')
  if (typeof Worker === 'undefined' || typeof window === 'undefined') {
    return parseImportPreviewRequest(request)
  }
  return parseInWorker(request)
}
