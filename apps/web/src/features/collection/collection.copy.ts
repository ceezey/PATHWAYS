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

/** Sentence-cases a server enum such as PARTIALLY_PROCESSED into "Partially processed". */
export function enumLabel(value: string) {
  const text = value.replaceAll('_', ' ').trim().toLowerCase()
  return text.charAt(0).toUpperCase() + text.slice(1)
}
