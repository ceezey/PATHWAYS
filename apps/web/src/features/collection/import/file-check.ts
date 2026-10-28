import {
  type CheckField,
  type FileCheckReport,
  IMPORT_ENGINEERING_LIMITS,
  checkImportFile,
  readImportFile,
} from '@pathways/imports'
import { businessCalendarDate } from '@pathways/shared'

import type { DigitalFormDefinition } from '@/types/pathways'

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

/** What the file would need reviewed one by one, or null when it is clean or cannot be read here (the server then reads it as before). */
export async function runFileCheck(
  file: File,
  form: DigitalFormDefinition,
  sheetName: string,
): Promise<FileCheckReport | null> {
  const fileType = fileTypeOf(file)
  if (!fileType || file.size > IMPORT_ENGINEERING_LIMITS.maxBytes) return null
  try {
    const report = checkImportFile({
      file: readImportFile(await file.arrayBuffer(), fileType, sheetName || null),
      formType: form.formType,
      fields: checkFields(form),
      uploadDate: businessCalendarDate(new Date(), 'Asia/Manila'),
    })
    return report.problems.length ? report : null
  } catch {
    return null
  }
}
