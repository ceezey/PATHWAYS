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
  allowedValues: string
  minimumValue: string
  maximumValue: string
  minimumLength: string
  maximumLength: string
  mappingStatus: 'mapped' | 'unmapped' | 'ignored' | 'invalid'
}

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

export const formTypeLabels: Record<DigitalFormType, string> = {
  BENEFICIARY_REGISTRATION: 'Beneficiary registration',
  TRAINING_SURVEY: 'Training survey',
  PRE_TEST: 'Pre-test',
  POST_TEST: 'Post-test',
  OUTCOME_MONITORING: 'Outcome monitoring',
  ACTIVITY_MONITORING: 'Activity monitoring',
  OTHER: 'Other',
}

const optionalNumber = (value: string) => (value.trim() === '' ? undefined : Number(value))
const optionalString = (value: string) => (value.trim() === '' ? undefined : value.trim())

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
          ? field.allowedValues
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean)
          : undefined,
      minimumValue: optionalString(field.minimumValue),
      maximumValue: optionalString(field.maximumValue),
      minimumDate: field.type === 'date' ? optionalString(field.minimumValue) : undefined,
      maximumDate: field.type === 'date' ? optionalString(field.maximumValue) : undefined,
      ...(field.type === 'date' ? { minimumValue: undefined, maximumValue: undefined } : {}),
      minimumLength: optionalNumber(field.minimumLength),
      maximumLength: optionalNumber(field.maximumLength),
    })),
  }
}

export function fromDigitalForm(form: DigitalFormDefinition): BuilderFormField[] {
  return form.fields.map((field, index) => ({
    id: field.id ?? `${form.id}-${field.code}`,
    label: field.label,
    code: field.code,
    type: builderFieldTypes[field.dataType],
    required: field.required,
    metadataKey: field.metadataKey,
    sadddField: field.sadddField,
    allowedValues: field.allowedValues?.join(', ') ?? '',
    minimumValue:
      field.dataType === 'DATE' ? (field.minimumDate ?? '') : (field.minimumValue ?? ''),
    maximumValue:
      field.dataType === 'DATE' ? (field.maximumDate ?? '') : (field.maximumValue ?? ''),
    minimumLength: field.minimumLength == null ? '' : String(field.minimumLength),
    maximumLength: field.maximumLength == null ? '' : String(field.maximumLength),
    mappingStatus: 'mapped',
  }))
}
