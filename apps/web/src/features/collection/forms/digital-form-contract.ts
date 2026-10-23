import type { FieldIntakeRule } from '@pathways/shared'

import type {
  DigitalFormDefinition,
  DigitalFormFieldDefinition,
  DigitalFormType,
  FormFieldDataType,
  SaveDigitalFormInput,
} from '@/types/pathways'

export type BuilderFieldType =
  | 'text'
  | 'long_text'
  | 'integer'
  | 'decimal'
  | 'date'
  | 'single_select'
  | 'multi_select'
  | 'boolean'

export interface BuilderFormField {
  id: string
  label: string
  code: string
  type: BuilderFieldType
  required: boolean
  metadataKey: boolean
  sadddField: boolean
  allowedValues: string[]
  minimumValue: string
  maximumValue: string
  minimumLength: string
  maximumLength: string
  mappingStatus: 'mapped' | 'unmapped' | 'ignored' | 'invalid'
  sourceNames: string[]
  valueAliases: Array<{ from: string; to: string }>
  importDefault: string
  rule: FieldIntakeRule | null
}

/** The import metadata of a field that has none yet. */
export const emptyIntake = {
  sourceNames: [],
  valueAliases: [],
  importDefault: '',
  rule: null,
} satisfies Pick<BuilderFormField, 'sourceNames' | 'valueAliases' | 'importDefault' | 'rule'>

const apiFieldTypes: Record<BuilderFieldType, FormFieldDataType> = {
  text: 'TEXT',
  long_text: 'LONG_TEXT',
  integer: 'INTEGER',
  decimal: 'DECIMAL',
  date: 'DATE',
  single_select: 'SELECT',
  multi_select: 'MULTIPLE_SELECT',
  boolean: 'BOOLEAN',
}

const builderFieldTypes = Object.fromEntries(
  Object.entries(apiFieldTypes).map(([builder, api]) => [api, builder]),
) as Record<FormFieldDataType, BuilderFieldType>

/** Snake-case field code derived from free text, as the builder has always generated it. */
export const fieldCodeFromText = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

/** Field code while typing; keeps a trailing underscore so the next word can follow. */
export const fieldCodeWhileTyping = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+/, '')

/** Readable, project-unique form code from the title, such as test_form_k3f9. */
export const neatFormCode = (title: string, now = Date.now()) => {
  const slug = fieldCodeFromText(title).slice(0, 40).replace(/_+$/, '')
  const base = /^[a-z]/.test(slug) ? slug : `form_${slug}`.replace(/_+$/, '')
  return `${base}_${now.toString(36).slice(-4)}`
}

const optionalNumber = (value: string) => (value.trim() === '' ? undefined : Number(value))
const optionalString = (value: string) => (value.trim() === '' ? undefined : value.trim())

const isChoice = (field: BuilderFormField) =>
  field.type === 'single_select' || field.type === 'multi_select'

/** Complete intake metadata only: blank names and half-filled aliases are dropped, aliases only on choice fields. */
const intakeInput = (field: BuilderFormField) => {
  const sourceNames = field.sourceNames.map((name) => name.trim()).filter(Boolean)
  const valueAliases = field.valueAliases.filter((alias) => alias.from.trim() && alias.to)
  return {
    sourceNames,
    valueAliases: isChoice(field) && valueAliases.length ? valueAliases : undefined,
    importDefault: optionalString(field.importDefault),
    rule: field.rule ?? undefined,
  }
}

export function toDigitalFormInput(input: {
  code: string
  name: string
  formType: DigitalFormType
  description?: string
  activityId?: string
  journeyStageId?: string
  fields: BuilderFormField[]
}): SaveDigitalFormInput {
  return {
    code: input.code.trim(),
    name: input.name.trim(),
    formType: input.formType,
    description: input.description?.trim() || undefined,
    activityId: input.activityId || undefined,
    journeyStageId: input.journeyStageId || undefined,
    fields: input.fields.map<DigitalFormFieldDefinition>((field) => ({
      code: field.code.trim(),
      label: field.label.trim(),
      dataType: apiFieldTypes[field.type],
      required: field.required,
      metadataKey: field.metadataKey,
      sadddField: field.sadddField,
      allowedValues:
        field.type === 'single_select' || field.type === 'multi_select'
          ? [...field.allowedValues]
          : undefined,
      minimumValue:
        field.type === 'integer' || field.type === 'decimal'
          ? optionalString(field.minimumValue)
          : undefined,
      maximumValue:
        field.type === 'integer' || field.type === 'decimal'
          ? optionalString(field.maximumValue)
          : undefined,
      minimumDate: field.type === 'date' ? optionalString(field.minimumValue) : undefined,
      maximumDate: field.type === 'date' ? optionalString(field.maximumValue) : undefined,
      ...(field.type === 'date' ? { minimumValue: undefined, maximumValue: undefined } : {}),
      minimumLength: ['text', 'long_text', 'multi_select'].includes(field.type)
        ? optionalNumber(field.minimumLength)
        : undefined,
      maximumLength: ['text', 'long_text', 'multi_select'].includes(field.type)
        ? optionalNumber(field.maximumLength)
        : undefined,
      ...intakeInput(field),
    })),
  }
}

export function fromDigitalForm(
  form: Omit<DigitalFormDefinition, 'fields'> & { fields: DigitalFormFieldDefinition[] },
): BuilderFormField[] {
  return form.fields.map((field, index) => ({
    id: field.id ?? `${form.id}-${field.code}`,
    label: field.label,
    code: field.code,
    type: builderFieldTypes[field.dataType],
    required: field.required,
    metadataKey: field.metadataKey,
    sadddField: field.sadddField,
    allowedValues: [...(field.allowedValues ?? [])],
    minimumValue:
      field.dataType === 'DATE' ? (field.minimumDate ?? '') : (field.minimumValue ?? ''),
    maximumValue:
      field.dataType === 'DATE' ? (field.maximumDate ?? '') : (field.maximumValue ?? ''),
    minimumLength: field.minimumLength == null ? '' : String(field.minimumLength),
    maximumLength: field.maximumLength == null ? '' : String(field.maximumLength),
    mappingStatus: 'mapped',
    sourceNames: [...(field.sourceNames ?? [])],
    valueAliases: (field.valueAliases ?? []).map((alias) => ({ ...alias })),
    importDefault: field.importDefault ?? '',
    rule: field.rule ?? null,
  }))
}
