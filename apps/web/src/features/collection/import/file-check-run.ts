import {
  type CheckField,
  type FileCheckReport,
  checkImportFile,
  readImportFile,
} from '@pathways/imports'

/**
 * The file check shared by the Web Worker and the main-thread fallback. Kept apart from
 * the module that creates the worker so the worker chunk never imports its own creator.
 */

export interface FileCheckRequest {
  buffer: ArrayBuffer
  fileType: 'XLSX' | 'XLS' | 'CSV'
  sheetName: string | null
  formType: string
  fields: CheckField[]
  uploadDate: string
}

/** What the file would need reviewed one by one, or null when it is clean or cannot be read here. */
export function runFileCheckRequest(request: FileCheckRequest): FileCheckReport | null {
  try {
    const report = checkImportFile({
      file: readImportFile(request.buffer, request.fileType, request.sheetName),
      formType: request.formType,
      fields: request.fields,
      uploadDate: request.uploadDate,
    })
    return report.problems.length ? report : null
  } catch {
    return null
  }
}
