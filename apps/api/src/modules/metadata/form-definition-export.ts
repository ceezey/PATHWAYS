import type { ReportFormat } from '../reports/report-artifact'

/** The blank form definition only: no responses, submissions or Beneficiary data. */
export const FORM_DEFINITION_EXPORT_COLUMNS = [
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

const FORM_DEFINITION_EXPORT_FORMATS = ['CSV', 'XLSX', 'XLS', 'PDF'] as const

export interface ExportableFormDefinition {
  id: string
  projectId: string
  code: string
  version: number
  name: string
  description: string | null
  status: string
  formType: string
  activityId: string | null
  journeyStageId: string | null
  fields: Array<{
    code: string
    label: string
    dataType: string
    required: boolean
    metadataKey: boolean
    sadddField: boolean
    allowedValues: string[] | null
    minimumValue?: string
    maximumValue?: string
    minimumDate?: string
    maximumDate?: string
    minimumLength: number | null
    maximumLength: number | null
    sequence: number
  }>
}

export function parseFormDefinitionExportFormat(value: unknown): ReportFormat | null {
  return typeof value === 'string' &&
    (FORM_DEFINITION_EXPORT_FORMATS as readonly string[]).includes(value)
    ? (value as ReportFormat)
    : null
}

const text = (value: unknown) => (value === null || value === undefined ? '' : String(value))

/** Header plus one row per field, ordered by the stored field sequence. */
export function formDefinitionExportRows(form: ExportableFormDefinition): string[][] {
  const fields = [...form.fields].sort(
    (left, right) => left.sequence - right.sequence || left.code.localeCompare(right.code),
  )
  return [
    [...FORM_DEFINITION_EXPORT_COLUMNS],
    ...fields.map((field) =>
      [
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
        field.sequence,
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
      ].map(text),
    ),
  ]
}

export function formDefinitionExportFileName(
  form: Pick<ExportableFormDefinition, 'code' | 'version'>,
  format: ReportFormat,
) {
  const slug =
    form.code
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'form'
  return `${slug}-v${form.version}.${format.toLowerCase()}`
}
