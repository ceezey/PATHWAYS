import {
  type FieldIntakeRule,
  type FormFieldValidationContract,
  completedYearsAt,
} from '@pathways/shared'
import { comparableAnswer, stripLetterPrefix } from './answers'
import type { ImportValueMapEntry } from './value-map'

export type NormalizedImportValue = string | number | boolean | string[] | null

export interface ImportValueError {
  fieldCode: string
  code: string
  message: string
}

export interface IntakeField extends FormFieldValidationContract {
  sadddField?: boolean
  sourceNames?: readonly string[] | null
  valueAliases?: readonly ImportValueMapEntry[] | null
  importDefault?: string | null
  rule?: FieldIntakeRule | null
}

export type ImportWarningCode =
  | 'FOLLOW_UP_UNEXPECTED'
  | 'ID_PATTERN_MISMATCH'
  | 'CALCULATION_MISMATCH'
  | 'GUARDIAN_CONSENT_MISSING'

export interface ImportRowWarning {
  fieldCode: string
  code: ImportWarningCode
}

/** Washington Group answer texts for levels 1 to 4 (English and Tagalog), compared through comparableAnswer. */
export const WASHINGTON_GROUP_LEVELS_V1 = [
  ['Hindi - Hindi nahihirapan', 'No - no difficulty', 'No difficulty'],
  ['Oo - medyo nahihirapan', 'Yes - some difficulty', 'Some difficulty'],
  ['Oo - Madalas nahihirapan', 'Yes - a lot of difficulty', 'A lot of difficulty'],
  ['Walang akong kakayahang gawin', 'Cannot do at all', 'Cannot do'],
] as const satisfies readonly [
  readonly string[],
  readonly string[],
  readonly string[],
  readonly string[],
]

export function washingtonGroupLevel(text: string): 1 | 2 | 3 | 4 | null {
  const key = comparableAnswer(stripLetterPrefix(text))
  const index = WASHINGTON_GROUP_LEVELS_V1.findIndex((texts) =>
    texts.some((candidate) => comparableAnswer(candidate) === key),
  )
  return index < 0 ? null : ((index + 1) as 1 | 2 | 3 | 4)
}

const CALCULATED_KINDS: readonly string[] = [
  'AGE_AT_DATE',
  'MINOR_AT_DATE',
  'WASHINGTON_GROUP_DISABILITY',
  'SAME_ANSWER_AS',
]

const toDate = (value: NormalizedImportValue | undefined) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date
}

const isBlank = (value: NormalizedImportValue | undefined) =>
  value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)

const sameValue = (a: NormalizedImportValue | undefined, b: NormalizedImportValue) =>
  Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((item, i) => item === b[i])
    : a === b

/** Value of a calculated rule from its inputs, or null when an input is missing. */
function calculate(
  rule: FieldIntakeRule,
  inputs: Record<string, NormalizedImportValue>,
  sourceProvided: ReadonlySet<string>,
  upload: Date,
): NormalizedImportValue {
  switch (rule.kind) {
    case 'AGE_AT_DATE':
    case 'MINOR_AT_DATE': {
      const birth = toDate(inputs[rule.birthField])
      // Minor status is current: it is measured at the upload date, not at the rule's date field.
      const at = rule.kind === 'MINOR_AT_DATE' ? upload : toDate(inputs[rule.atField])
      if (!birth || !at) return null
      const years = completedYearsAt(birth, at)
      return rule.kind === 'AGE_AT_DATE' ? years : years < 18
    }
    case 'WASHINGTON_GROUP_DISABILITY': {
      if (!rule.questionFields.some((code) => sourceProvided.has(code))) return null
      const qualifying = new Set(rule.disabilityValues.map(comparableAnswer))
      const answers = rule.questionFields.map((code) => inputs[code])
      const qualifies = (answer: NormalizedImportValue) =>
        typeof answer === 'string' && qualifying.has(comparableAnswer(answer))
      if (answers.some(qualifies)) return 'WITH_DISABILITY'
      return answers.every((answer) => !isBlank(answer)) ? 'WITHOUT_DISABILITY' : 'NOT_SPECIFIED'
    }
    case 'SAME_ANSWER_AS':
      return inputs[rule.field] ?? null
    default:
      return null
  }
}

/** Runs calculations, then cross-checks, then the guardian check; mutates values for calculated fields. */
export function applyIntakeRules(
  fields: readonly IntakeField[],
  values: Record<string, NormalizedImportValue>,
  sourceProvided: ReadonlySet<string>,
  uploadDate: string,
): { errors: ImportValueError[]; warnings: ImportRowWarning[] } {
  const errors: ImportValueError[] = []
  const warnings: ImportRowWarning[] = []
  const upload = toDate(uploadDate)
  if (!upload) throw new Error('applyIntakeRules needs uploadDate as a YYYY-MM-DD calendar date')
  const inputs: Record<string, NormalizedImportValue> = Object.assign(Object.create(null), values)

  for (const field of fields) {
    const rule = field.rule
    if (!rule || !CALCULATED_KINDS.includes(rule.kind)) continue
    if (rule.kind === 'SAME_ANSWER_AS' && sourceProvided.has(field.code)) continue
    if (rule.kind === 'AGE_AT_DATE' || rule.kind === 'MINOR_AT_DATE') {
      const birth = toDate(inputs[rule.birthField])
      // Minor status is measured at the upload date, but a birth after the rule's own date is still held.
      const dates = [
        toDate(inputs[rule.atField]),
        ...(rule.kind === 'MINOR_AT_DATE' ? [upload] : []),
      ]
      // A birth after the measuring date gives no age; the row is held with the reason.
      if (birth && dates.some((at) => at && birth > at)) {
        if (!errors.some((e) => e.code === 'BIRTH_AFTER_DATE' && e.fieldCode === rule.birthField))
          errors.push({
            fieldCode: rule.birthField,
            code: 'BIRTH_AFTER_DATE',
            message: 'The date of birth is after the date the age is measured at.',
          })
        continue
      }
    }
    const calculated = calculate(rule, inputs, sourceProvided, upload)
    if (calculated === null) continue
    const given = values[field.code]
    const birth = rule.kind === 'AGE_AT_DATE' ? toDate(inputs[rule.birthField]) : null
    // A file's Age is a check only and may come from a TODAY formula, so one year from the upload-date age passes.
    const ageFits =
      birth !== null &&
      typeof given === 'number' &&
      Math.abs(given - completedYearsAt(birth, upload)) <= 1
    if (sourceProvided.has(field.code) && !sameValue(given, calculated) && !ageFits) {
      if (field.sadddField)
        errors.push({
          fieldCode: field.code,
          code: 'CALCULATION_MISMATCH',
          message: 'The source value does not match the calculated value.',
        })
      else warnings.push({ fieldCode: field.code, code: 'CALCULATION_MISMATCH' })
    }
    values[field.code] = calculated
  }

  for (const field of fields) {
    const rule = field.rule
    const value = values[field.code]
    if (!rule || isBlank(value)) continue
    const warn = (code: ImportWarningCode) => warnings.push({ fieldCode: field.code, code })
    if (rule.kind === 'AGE_CHECK') {
      const birth = toDate(values[rule.birthField])
      if (!birth || typeof value !== 'number') continue
      // The file's Age may come from a TODAY formula, so one year of drift is allowed.
      if (Math.abs(value - completedYearsAt(birth, upload)) > 1)
        errors.push({
          fieldCode: field.code,
          code: 'AGE_MISMATCH',
          message: 'The age does not match the birth date.',
        })
    } else if (rule.kind === 'FOLLOW_UP_OF') {
      const parent = values[rule.parentField]
      const bare = (text: string) => comparableAnswer(stripLetterPrefix(text))
      const expected = rule.whenValues.map(bare)
      const answers = Array.isArray(parent) ? parent : [parent]
      if (!answers.some((answer) => typeof answer === 'string' && expected.includes(bare(answer))))
        warn('FOLLOW_UP_UNEXPECTED')
    } else if (rule.kind === 'ID_FROM_INITIALS_AND_BIRTH_DATE') {
      const first = values[rule.firstNameField]
      const last = values[rule.lastNameField]
      const birth = values[rule.birthField]
      if (typeof value !== 'string' || typeof first !== 'string' || typeof last !== 'string')
        continue
      if (!toDate(birth) || !first.trim() || !last.trim()) continue
      const [year, month, day] = (birth as string).split('-')
      const expected = `${first.trim()[0]}${last.trim()[0]}${month}${day}${year}`
      if (value.trim().toUpperCase() !== expected.toUpperCase()) warn('ID_PATTERN_MISMATCH')
    }
  }

  if (values.is_minor === true && values.guardian_consent_recorded !== true)
    warnings.push({ fieldCode: 'guardian_consent_recorded', code: 'GUARDIAN_CONSENT_MISSING' })
  return { errors, warnings }
}
