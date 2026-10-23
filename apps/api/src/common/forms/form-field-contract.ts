import type { FormFieldValidationContract } from '@pathways/shared'
import type { FormField, Prisma } from '@prisma/client'

export function jsonStringArray(value: Prisma.JsonValue | null) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? (value as string[])
    : null
}

// The form field columns a validation contract reads.
export type FormFieldContractRow = Pick<
  FormField,
  | 'code'
  | 'label'
  | 'dataType'
  | 'isRequired'
  | 'allowedValues'
  | 'minimumValue'
  | 'maximumValue'
  | 'minimumDate'
  | 'maximumDate'
  | 'minimumLength'
  | 'maximumLength'
>

export function formFieldContract(field: FormFieldContractRow): FormFieldValidationContract {
  return {
    code: field.code,
    label: field.label,
    dataType: field.dataType,
    required: field.isRequired,
    allowedValues: jsonStringArray(field.allowedValues),
    minimumValue: field.minimumValue?.toString(),
    maximumValue: field.maximumValue?.toString(),
    minimumDate: field.minimumDate?.toISOString().slice(0, 10),
    maximumDate: field.maximumDate?.toISOString().slice(0, 10),
    minimumLength: field.minimumLength,
    maximumLength: field.maximumLength,
  }
}
