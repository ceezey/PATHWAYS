import { z } from 'zod'

import { validateAndNormalizeFormData } from '../../validation/form-data'
import { lengthString, trimmedInput, trimmedLowercaseInput } from '../common/field-schemas'
import { valueMapText } from '../imports/import-requests'
import type { FormFieldRequest } from './form-requests'

// The fixed rule kinds a form field may carry; nobody types a formula.
export const INTAKE_RULE_KINDS = [
  'AGE_AT_DATE',
  'MINOR_AT_DATE',
  'WASHINGTON_GROUP_DISABILITY',
  'SAME_ANSWER_AS',
  'AGE_CHECK',
  'FOLLOW_UP_OF',
  'ID_FROM_INITIALS_AND_BIRTH_DATE',
] as const

// Kinds that write a value into the row; the rest only cross-check.
export const CALCULATED_RULE_KINDS = [
  'AGE_AT_DATE',
  'MINOR_AT_DATE',
  'WASHINGTON_GROUP_DISABILITY',
  'SAME_ANSWER_AS',
] as const

// Consent is never defaulted from a form, so these fields refuse importDefault.
export const CONSENT_FIELD_CODES = [
  'consent_recorded',
  'data_processing_consent_recorded',
  'guardian_consent_recorded',
] as const

// SAME_ANSWER_AS links only these two consent fields.
const sameAnswerCodes: readonly string[] = ['consent_recorded', 'data_processing_consent_recorded']

export const formFieldCode = trimmedLowercaseInput(
  z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, 'must be a lowercase field code'),
)
const ruleText = trimmedInput(lengthString(1, 120))

// One calculation or cross-check, discriminated on kind.
export const fieldIntakeRule = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('AGE_AT_DATE'), birthField: formFieldCode, atField: formFieldCode })
    .strict(),
  z
    .object({ kind: z.literal('MINOR_AT_DATE'), birthField: formFieldCode, atField: formFieldCode })
    .strict(),
  z
    .object({
      kind: z.literal('WASHINGTON_GROUP_DISABILITY'),
      questionFields: z.array(formFieldCode).length(6),
      disabilityValues: z.array(ruleText).min(1).max(8),
    })
    .strict(),
  z.object({ kind: z.literal('SAME_ANSWER_AS'), field: formFieldCode }).strict(),
  z
    .object({
      kind: z.literal('AGE_CHECK'),
      birthField: formFieldCode,
      atFields: z.array(formFieldCode).min(1).max(10),
    })
    .strict(),
  z
    .object({
      kind: z.literal('FOLLOW_UP_OF'),
      parentField: formFieldCode,
      whenValues: z.array(ruleText).min(1).max(20),
    })
    .strict(),
  z
    .object({
      kind: z.literal('ID_FROM_INITIALS_AND_BIRTH_DATE'),
      firstNameField: formFieldCode,
      lastNameField: formFieldCode,
      birthField: formFieldCode,
    })
    .strict(),
])
export type FieldIntakeRule = z.infer<typeof fieldIntakeRule>

// The four import metadata properties of a form field, spread into its request and response.
export const fieldIntakeProperties = {
  sourceNames: z
    .array(trimmedInput(lengthString(1, 100)))
    .max(20)
    .nullish(),
  valueAliases: z
    .array(z.object({ from: valueMapText(1), to: valueMapText(1) }).strict())
    .max(100)
    .nullish(),
  importDefault: trimmedInput(lengthString(1, 120)).nullish(),
  rule: fieldIntakeRule.nullish(),
}

// Field codes a rule reads from.
const ruleFieldCodes = (rule: FieldIntakeRule): string[] => {
  switch (rule.kind) {
    case 'AGE_AT_DATE':
    case 'MINOR_AT_DATE':
      return [rule.birthField, rule.atField]
    case 'WASHINGTON_GROUP_DISABILITY':
      return rule.questionFields
    case 'SAME_ANSWER_AS':
      return [rule.field]
    case 'AGE_CHECK':
      return [rule.birthField, ...rule.atFields]
    case 'FOLLOW_UP_OF':
      return [rule.parentField]
    case 'ID_FROM_INITIALS_AND_BIRTH_DATE':
      return [rule.firstNameField, rule.lastNameField, rule.birthField]
  }
}

const isChoice = (field: FormFieldRequest) =>
  field.dataType === 'SELECT' || field.dataType === 'MULTIPLE_SELECT'

// Structural checks of the intake properties; source name uniqueness across fields is checked in the API.
export function formIntakeDefinitionErrors(
  fields: readonly FormFieldRequest[],
): Array<{ fieldCode: string; code: 'invalid_definition'; message: string }> {
  const errors: Array<{ fieldCode: string; code: 'invalid_definition'; message: string }> = []
  const codes = new Set(fields.map((field) => field.code))
  for (const field of fields) {
    const flag = (message: string) =>
      errors.push({ fieldCode: field.code, code: 'invalid_definition', message })
    const allowed = field.allowedValues ?? []
    if (field.valueAliases?.length) {
      if (!isChoice(field)) flag('Value aliases apply only to select fields.')
      else if (field.valueAliases.some((alias) => !allowed.includes(alias.to)))
        flag('Every value alias must point at an allowed value.')
    }
    if (field.importDefault != null) {
      if ((CONSENT_FIELD_CODES as readonly string[]).includes(field.code))
        flag('Consent is never defaulted.')
      else if (field.rule && (CALCULATED_RULE_KINDS as readonly string[]).includes(field.rule.kind))
        flag('A calculated field cannot also have an import default.')
      else {
        let value: unknown =
          field.dataType === 'MULTIPLE_SELECT' ? [field.importDefault] : field.importDefault
        // Boolean text is checked as a boolean, matching import normalization.
        if (field.dataType === 'BOOLEAN' && /^(true|false)$/i.test(field.importDefault.trim()))
          value = field.importDefault.trim().toLowerCase() === 'true'
        const result = validateAndNormalizeFormData([field], { [field.code]: value }, 'draft')
        if (result.errors.some((item) => item.code !== 'invalid_definition'))
          flag('Import default does not pass the field type and allowed values.')
      }
    }
    if (field.rule) {
      if (ruleFieldCodes(field.rule).some((code) => !codes.has(code)))
        flag('Rule names a field that is not on this form.')
      if (
        field.rule.kind === 'SAME_ANSWER_AS' &&
        !(
          sameAnswerCodes.includes(field.code) &&
          sameAnswerCodes.includes(field.rule.field) &&
          field.code !== field.rule.field
        )
      )
        flag('SAME_ANSWER_AS links only the two consent fields.')
    }
  }
  return errors
}
