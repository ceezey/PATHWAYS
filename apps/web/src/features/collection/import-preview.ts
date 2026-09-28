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

// The worker could not start or load its script; the caller parses on the main thread.
class PreviewWorkerUnavailable extends Error {}

function parseInWorker(request: ImportPreviewRequest) {
  return new Promise<ImportPreviewResult>((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./import-preview.worker.ts', import.meta.url), {
        type: 'module',
      })
    } catch {
      reject(new PreviewWorkerUnavailable())
      return
    }
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
    // The worker answers every parse, including failures, with a message, so an
    // error event before any message means the worker itself is unavailable.
    worker.onerror = () => {
      finish()
      reject(new PreviewWorkerUnavailable())
    }
    if (request.kind === 'workbook') worker.postMessage(request, [request.buffer])
    else worker.postMessage(request)
  })
}

async function readPreviewRequest(file: File): Promise<ImportPreviewRequest> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'csv') return { kind: 'csv', text: await file.text() }
  if (extension === 'xlsx' || extension === 'xls')
    return { kind: 'workbook', buffer: await file.arrayBuffer() }
  throw new Error('Choose a CSV, XLS, or XLSX file.')
}

export async function parseImportPreview(file: File): Promise<ImportPreviewResult> {
  const request = await readPreviewRequest(file)
  if (typeof Worker === 'undefined' || typeof window === 'undefined') {
    return parseImportPreviewRequest(request)
  }
  try {
    return await parseInWorker(request)
  } catch (error) {
    if (!(error instanceof PreviewWorkerUnavailable)) throw error
    // A transferred workbook buffer is detached, so read the file again.
    return parseImportPreviewRequest(await readPreviewRequest(file))
  }
}
