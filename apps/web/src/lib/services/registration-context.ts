import type { BeneficiaryRegistrationContext } from '@/types/pathways'
import {
  beneficiaryRegistrationDefinitionErrors,
  validateAndNormalizeFormData,
} from '@pathways/shared'
import { z } from 'zod'
const field = z
  .object({
    id: z.string().uuid(),
    code: z.string().max(64),
    label: z.string().max(160),
    dataType: z.enum([
      'TEXT',
      'LONG_TEXT',
      'INTEGER',
      'DECIMAL',
      'DATE',
      'BOOLEAN',
      'SELECT',
      'MULTIPLE_SELECT',
    ]),
    required: z.boolean(),
    metadataKey: z.boolean(),
    sadddField: z.boolean(),
    sequence: z.number().int().positive(),
    allowedValues: z.array(z.string().max(120)).max(100).nullable().optional(),
    minimumValue: z.string().nullable().optional(),
    maximumValue: z.string().nullable().optional(),
    minimumDate: z.string().nullable().optional(),
    maximumDate: z.string().nullable().optional(),
    minimumLength: z.number().int().nullable().optional(),
    maximumLength: z.number().int().nullable().optional(),
  })
  .strict()
const schema = z
  .object({
    projectId: z.string().uuid(),
    businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    definitions: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            code: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/),
            version: z.number().int().positive(),
            name: z.string().min(3).max(160),
            formType: z.literal('BENEFICIARY_REGISTRATION'),
            status: z.literal('PUBLISHED'),
            fields: z.array(field).min(1).max(100),
          })
          .strict(),
      )
      .max(100),
  })
  .strict()
export function parseRegistrationContext(
  value: unknown,
  projectId: string,
): BeneficiaryRegistrationContext {
  const result = schema.safeParse(value)
  if (!result.success || result.data.projectId !== projectId.toLowerCase())
    throw new Error('Invalid registration context response.')
  const { data } = result
  const date = new Date(`${data.businessDate}T00:00:00.000Z`)
  if (
    !Number.isFinite(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== data.businessDate ||
    new Set(data.definitions.map((definition) => definition.code)).size !==
      data.definitions.length ||
    data.definitions.some(
      (definition) =>
        beneficiaryRegistrationDefinitionErrors(definition.fields).length > 0 ||
        validateAndNormalizeFormData(definition.fields, {}, 'draft').errors.some(
          (error) => error.code === 'invalid_definition',
        ),
    )
  ) {
    throw new Error('Invalid registration context response.')
  }
  return data
}
