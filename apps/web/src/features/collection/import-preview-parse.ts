import { parseCsv, parseWorkbook } from '@pathways/imports'

/**
 * Preview parsing shared by the Web Worker and the main-thread fallback. Kept apart
 * from the module that creates the worker so the worker chunk never imports its own
 * creator.
 */

export type ImportPreviewRequest =
  | { kind: 'csv'; text: string }
  | { kind: 'workbook'; buffer: ArrayBuffer }

export interface ImportPreviewResult {
  fileType: 'csv' | 'xlsx'
  headers: string[]
  rows: Record<string, unknown>[]
  errors: string[]
  sheetNames?: string[]
}

export type ImportPreviewResponse =
  | { ok: true; result: ImportPreviewResult }
  | { ok: false; message: string }

export function parseImportPreviewRequest(request: ImportPreviewRequest): ImportPreviewResult {
  if (request.kind === 'csv') {
    const result = parseCsv<Record<string, string>>(request.text)
    return { fileType: 'csv', headers: result.headers, rows: result.data, errors: result.errors }
  }
  const result = parseWorkbook(request.buffer)
  return {
    fileType: 'xlsx',
    headers: result.headers,
    rows: result.rows,
    errors: [],
    sheetNames: result.sheetNames,
  }
}
