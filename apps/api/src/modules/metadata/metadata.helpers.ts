import { BadRequestException, ConflictException } from '@nestjs/common'
import { sourceNameKey } from '@pathways/imports/server'
import {
  type CreateFormRequest,
  DIRECT_ENTRY_FORM_TYPES,
  formIntakeDefinitionErrors,
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
  assertFormIntakeDefinition(input.fields)
}

// Structural intake errors plus a source name used by two fields, compared on the matcher key.
export function assertFormIntakeDefinition(fields: CreateFormRequest['fields']) {
  const errors: Array<{ fieldCode: string; code: string; message: string }> =
    formIntakeDefinitionErrors(fields)
  const owner = new Map<string, string>()
  for (const field of fields) {
    for (const key of new Set((field.sourceNames ?? []).map(sourceNameKey))) {
      const first = owner.get(key)
      if (first === undefined) owner.set(key, field.code)
      else if (first !== field.code) {
        errors.push({
          fieldCode: field.code,
          code: 'DUPLICATE_SOURCE_NAME',
          message: `A source name is already used by field ${first}.`,
        })
      }
    }
  }
  if (errors.length > 0) {
    throw new BadRequestException({ message: 'Form intake metadata is invalid.', errors })
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
    sourceNames: field.sourceNames ?? [],
    valueAliases: field.valueAliases ?? Prisma.DbNull,
    importDefault: field.importDefault ?? null,
    rule: field.rule ?? Prisma.DbNull,
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
