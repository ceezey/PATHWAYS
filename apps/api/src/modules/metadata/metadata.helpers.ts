import { BadRequestException, ConflictException } from '@nestjs/common'
import {
  type CreateFormRequest,
  DIRECT_ENTRY_FORM_TYPES,
  validateAndNormalizeFormData,
} from '@pathways/shared'
import { Prisma } from '@prisma/client'

export function assertDefinition(input: CreateFormRequest) {
  const result = validateAndNormalizeFormData(
    input.fields.map((field) => ({ ...field, required: field.required })),
    {},
    'draft',
  )
  if (!result.valid) {
    throw new BadRequestException({ message: 'Form definition is invalid.', errors: result.errors })
  }
}

export function fieldData(
  organizationId: string,
  projectId: string,
  formId: string,
  fields: CreateFormRequest['fields'],
): Prisma.FormFieldCreateManyInput[] {
  return fields.map((field, index) => ({
    organizationId,
    projectId,
    formId,
    code: field.code,
    label: field.label,
    dataType: field.dataType,
    isRequired: field.required,
    isMetadataKey: field.metadataKey,
    isSadddField: field.sadddField,
    allowedValues: field.allowedValues?.map((item) => item.trim()) ?? Prisma.DbNull,
    minimumValue: field.minimumValue,
    maximumValue: field.maximumValue,
    minimumDate: field.minimumDate ? new Date(`${field.minimumDate}T00:00:00.000Z`) : undefined,
    maximumDate: field.maximumDate ? new Date(`${field.maximumDate}T00:00:00.000Z`) : undefined,
    minimumLength: field.minimumLength,
    maximumLength: field.maximumLength,
    sequenceNo: index + 1,
  }))
}

export function sameValues(
  left: Record<string, string | number | boolean | string[] | null>,
  right: Record<string, string | number | boolean | string[] | null>,
) {
  const stable = (value: typeof left) =>
    JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))))
  return stable(left) === stable(right)
}

export function assertDirectEntryForm(form: { formType: string }) {
  if (form.formType === 'BENEFICIARY_REGISTRATION') {
    throw new ConflictException('Use the Beneficiary registration endpoint for this form.')
  }
  if (!(DIRECT_ENTRY_FORM_TYPES as readonly string[]).includes(form.formType)) {
    throw new ConflictException('Encode Project Data is retired; import this form instead.')
  }
}

export function expectedDate(value: string) {
  const expected = new Date(value)
  if (Number.isNaN(expected.valueOf())) throw new BadRequestException('Invalid revision timestamp.')
  return expected
}

export function assertValues(result: ReturnType<typeof validateAndNormalizeFormData>) {
  if (!result.valid) {
    throw new BadRequestException({
      message: 'Form responses are invalid.',
      errors: result.errors,
    })
  }
}
