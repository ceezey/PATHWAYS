import type { INTAKE_RULE_KINDS, draftNeedsCheckReasons } from '@pathways/shared'

import { plural } from '@/lib/format/plural'
import type { DigitalFormType } from '@/types/pathways'

export const formTypeLabels: Record<DigitalFormType, string> = {
  BENEFICIARY_REGISTRATION: 'Beneficiary registration',
  TRAINING_SURVEY: 'Training survey',
  PRE_TEST: 'Pre-test',
  POST_TEST: 'Post-test',
  OUTCOME_MONITORING: 'Outcome monitoring',
  ACTIVITY_MONITORING: 'Activity monitoring',
  OTHER: 'Other',
}

/** What a person is asked to confirm for each "needs check" reason of a draft from an import. */
export const needsCheckLabels: Record<(typeof draftNeedsCheckReasons)[number], string> = {
  SUGGESTED_SOURCE_NAME: 'A column was matched to this field by a similar name. Confirm it fits.',
  ENUM_ANSWER_UNRESOLVED:
    'An answer in the file has no matching option. Choose how it should be stored.',
  IMPORT_DEFAULT: 'No column supplies this value, so a default was set. Confirm it.',
  RULE_PROPOSED: 'A calculation or check was proposed. Confirm it is right.',
  CONSENT_SOURCE_PROPOSED:
    'A column was proposed as the data processing consent answer. Confirm it.',
  PARTICIPATION_CONSENT_NO_SOURCE:
    'The file has no participation consent column. Link it to the data processing consent answer only if the signed consent covered both; otherwise every row is held.',
  IDENTIFIER_PROPOSED: 'A column was proposed as the ID number. Confirm the ID type.',
  WASHINGTON_GROUP_FLAG_DISAGREES:
    'The disability yes or no column disagrees with the Washington Group answers on some rows. Check before publishing.',
  COLUMN_MOVED_OFF_CALCULATED:
    'A column that did not match the calculated value was moved to a field of its own. Confirm the new field.',
}

/** What each part of a field's import metadata does, shown on hover in the form builder. */
export const intakeHelp = {
  sourceNames:
    'Column headers in an uploaded file that fill this field, such as the question text or the code in a coded header row. A matching column is linked without manual mapping.',
  answerAliases:
    'Answers written differently in a file, such as a lettered "A. Hindi", that are saved as one of this field\'s allowed answers instead of being rejected.',
  importDefault:
    'The value saved on every row when the uploaded file has no column for this field.',
  calculationOrCheck:
    "A rule run on every imported row: PATHWAYS works out this field's value from other answers, or checks the file's value against them and holds the row when they disagree.",
}

/** Plain names of the calculations and checks a field may carry. */
export const ruleKindLabels: Record<(typeof INTAKE_RULE_KINDS)[number], string> = {
  AGE_AT_DATE: 'Age in years at a date',
  MINOR_AT_DATE: 'Under 18 at a date',
  WASHINGTON_GROUP_DISABILITY: 'Disability status from the six Washington Group questions',
  SAME_ANSWER_AS: 'Same answer as the data processing consent',
  AGE_CHECK: 'Check the age column against a birth date',
  FOLLOW_UP_OF: 'Fill only when another field has certain answers',
  ID_FROM_INITIALS_AND_BIRTH_DATE: 'Check the ID against initials and birth date',
}

/** Sentence-cases a server enum such as PARTIALLY_PROCESSED into "Partially processed". */
export function enumLabel(value: string) {
  const text = value.replaceAll('_', ' ').trim().toLowerCase()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const warningLabels: Record<string, string> = {
  AGE_MISMATCH: 'The age does not match the birth date',
  FOLLOW_UP_UNEXPECTED: 'A follow-up answer was given where none was expected',
  ID_PATTERN_MISMATCH: 'The ID number does not match the initials and birth date',
  CALCULATION_MISMATCH: 'The value does not match the calculated value',
  GUARDIAN_CONSENT_MISSING: 'A guardian consent is needed for this minor',
}

/** Plain wording of a row warning code; an unknown code falls back to a sentence-cased name. */
export const warningLabel = (code: string) => warningLabels[code] ?? enumLabel(code)

/** Shown when the file needs the form to change before it can be imported. */
export const coverageNotice = (receipt: { uncoveredColumns: number; unresolvedValues: number }) =>
  `Form needs updating: ${plural(receipt.uncoveredColumns, 'column')}, ${plural(receipt.unresolvedValues, 'answer')}`

/** Shown after a straight-through import finishes. */
export const importOutcomeMessage = (totals: {
  processed: number
  unprocessed: number
  invalid: number
  warnings: number
}) =>
  `Imported ${totals.processed}. ${totals.unprocessed} held for review, ${totals.invalid} invalid, ${totals.warnings} with warnings.`
