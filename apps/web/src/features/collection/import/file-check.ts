import { type CheckField, type FileCheckReport, IMPORT_ENGINEERING_LIMITS } from '@pathways/imports'
import { businessCalendarDate } from '@pathways/shared'

import type { DigitalFormDefinition } from '@/types/pathways'

import { type FileCheckRequest, runFileCheckRequest } from './file-check-run'

// A check that takes longer is given up and the file uploads as today.
const CHECK_TIMEOUT_MILLISECONDS = 30_000

/** The form's fields in the contract the shared check reads, the same one the server builds from the stored fields. */
export const checkFields = (form: DigitalFormDefinition): CheckField[] =>
  form.fields.map((field) => ({
    id: field.id,
    code: field.code,
    label: field.label,
    dataType: field.dataType,
    required: field.required,
    metadataKey: field.metadataKey,
    allowedValues: field.allowedValues,
    minimumValue: field.minimumValue,
    maximumValue: field.maximumValue,
    minimumDate: field.minimumDate,
    maximumDate: field.maximumDate,
    minimumLength: field.minimumLength,
    maximumLength: field.maximumLength,
    sadddField: field.sadddField,
    sourceNames: field.sourceNames,
    valueAliases: field.valueAliases,
    importDefault: field.importDefault,
    rule: field.rule,
  }))

/** The kind of file the browser can check, or null for anything else (a PDF is left to the server). */
export function fileTypeOf(file: File): 'XLSX' | 'XLS' | 'CSV' | null {
  const extension = /\.(xlsx|xls|csv)$/i.exec(file.name)?.[1].toUpperCase()
  return extension === 'XLSX' || extension === 'XLS' || extension === 'CSV' ? extension : null
}

// Runs the check off the page's thread; a worker that fails or takes too long skips the check.
function checkInWorker(request: FileCheckRequest) {
  return new Promise<FileCheckReport | null>((resolve) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./file-check.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      resolve(null)
      return
    }
    const finish = (report: FileCheckReport | null) => {
      window.clearTimeout(timer)
      worker.terminate()
      resolve(report)
    }
    const timer = window.setTimeout(() => finish(null), CHECK_TIMEOUT_MILLISECONDS)
    worker.onmessage = (event: MessageEvent<FileCheckReport | null>) => finish(event.data ?? null)
    worker.onerror = () => finish(null)
    worker.postMessage(request, [request.buffer])
  })
}

/** What the file would need reviewed one by one, or null when it is clean or cannot be read here (the server then reads it as before). */
export async function runFileCheck(
  file: File,
  form: DigitalFormDefinition,
  sheetName: string,
): Promise<FileCheckReport | null> {
  const fileType = fileTypeOf(file)
  if (!fileType || file.size > IMPORT_ENGINEERING_LIMITS.maxBytes) return null
  try {
    const request: FileCheckRequest = {
      buffer: await file.arrayBuffer(),
      fileType,
      sheetName: sheetName || null,
      formType: form.formType,
      fields: checkFields(form),
      uploadDate: businessCalendarDate(new Date(), 'Asia/Manila'),
    }
    // Where Worker is unavailable (tests), the check runs on the main thread.
    return typeof Worker === 'undefined' || typeof window === 'undefined'
      ? runFileCheckRequest(request)
      : await checkInWorker(request)
  } catch {
    return null
  }
}
