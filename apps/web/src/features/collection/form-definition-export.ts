import type { DigitalFormDefinition } from '@/types/pathways'

export type FormDefinitionExportFormat = 'csv' | 'xlsx' | 'xls' | 'pdf'

export type FormDefinitionExport = {
  content: string
  fileName: string
  mimeType: 'text/csv;charset=utf-8'
}

const header = [
  'form_id',
  'project_id',
  'form_code',
  'form_version',
  'form_name',
  'form_description',
  'form_status',
  'form_type',
  'activity_id',
  'journey_stage_id',
  'field_sequence',
  'field_code',
  'field_label',
  'field_type',
  'required',
  'metadata_key',
  'saddd_field',
  'allowed_values',
  'minimum_value',
  'maximum_value',
  'minimum_date',
  'maximum_date',
  'minimum_length',
  'maximum_length',
] as const

const safeCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value)
  const protectedText = /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text
  return `"${protectedText.replaceAll('"', '""')}"`
}

const slug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'form'

export function createFormDefinitionExport(
  form: DigitalFormDefinition,
  format: FormDefinitionExportFormat,
): FormDefinitionExport {
  if (format !== 'csv') {
    throw new Error(`${format.toUpperCase()} form export is not supported. Choose CSV.`)
  }

  const orderedFields = form.fields
    .map((field, index) => ({ field, index }))
    .sort(
      (left, right) =>
        (left.field.sequence ?? left.index) - (right.field.sequence ?? right.index) ||
        left.index - right.index,
    )
  const rows = orderedFields.map(({ field }, index) => [
    form.id,
    form.projectId,
    form.code,
    form.version,
    form.name,
    form.description,
    form.status,
    form.formType,
    form.activityId,
    form.journeyStageId,
    field.sequence ?? index,
    field.code,
    field.label,
    field.dataType,
    field.required,
    field.metadataKey,
    field.sadddField,
    JSON.stringify(field.allowedValues ?? []),
    field.minimumValue,
    field.maximumValue,
    field.minimumDate,
    field.maximumDate,
    field.minimumLength,
    field.maximumLength,
  ])
  const content = `${[header, ...rows].map((row) => row.map(safeCell).join(',')).join('\r\n')}\r\n`

  return {
    content,
    fileName: `${slug(form.code)}-v${form.version}.csv`,
    mimeType: 'text/csv;charset=utf-8',
  }
}
