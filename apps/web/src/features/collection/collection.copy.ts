import type { INTAKE_RULE_KINDS, draftNeedsCheckReasons } from '@pathways/shared'

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
