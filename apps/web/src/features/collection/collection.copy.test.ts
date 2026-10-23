import {
  INTAKE_RULE_KINDS,
  type DigitalFormType as SharedDigitalFormType,
  digitalFormTypes,
  draftNeedsCheckReasons,
  importBatchResponse,
} from '@pathways/shared'
import { describe, expect, expectTypeOf, it } from 'vitest'

import type { DigitalFormType } from '@/types/pathways'

import {
  coverageNotice,
  enumLabel,
  formTypeLabels,
  importOutcomeMessage,
  needsCheckLabels,
  ruleKindLabels,
  warningLabel,
} from './collection.copy'

describe('enumLabel', () => {
  it('sentence-cases known and unknown enum values', () => {
    expect(enumLabel('PARTIALLY_PROCESSED')).toBe('Partially processed')
    expect(enumLabel('RECOVERY_REQUIRED')).toBe('Recovery required')
    expect(enumLabel('rows')).toBe('Rows')
    expect(enumLabel('SOME_NEW_CODE')).toBe('Some new code')
    expect(enumLabel('')).toBe('')
  })
})

describe('formTypeLabels', () => {
  it('labels exactly the shared form types, in their order', () => {
    expect(Object.keys(formTypeLabels)).toEqual([...digitalFormTypes])
    expect(formTypeLabels).toEqual({
      BENEFICIARY_REGISTRATION: 'Beneficiary registration',
      TRAINING_SURVEY: 'Training survey',
      PRE_TEST: 'Pre-test',
      POST_TEST: 'Post-test',
      OUTCOME_MONITORING: 'Outcome monitoring',
      ACTIVITY_MONITORING: 'Activity monitoring',
      OTHER: 'Other',
    })
  })

  it('names the same form types and import batch statuses as the shared contract', () => {
    expectTypeOf<DigitalFormType>().toEqualTypeOf<SharedDigitalFormType>()
    expect(importBatchResponse.shape.status.options).toEqual([
      'UPLOADING',
      'UPLOADED',
      'MAPPED',
      'VALIDATED',
      'PROCESSING',
      'PARTIALLY_PROCESSED',
      'PROCESSED',
      'RECOVERY_REQUIRED',
      'FAILED',
    ])
  })
})

describe('intake copy', () => {
  it('words every needs-check reason and rule kind in plain language', () => {
    expect(Object.keys(needsCheckLabels)).toEqual([...draftNeedsCheckReasons])
    expect(Object.keys(ruleKindLabels)).toEqual([...INTAKE_RULE_KINDS])
    for (const label of [...Object.values(needsCheckLabels), ...Object.values(ruleKindLabels)])
      expect(label).not.toMatch(/[A-Z]{2,}_[A-Z]/)
  })
})

describe('straight-through import copy', () => {
  it('words the coverage notice and the outcome as the brief gives them', () => {
    expect(coverageNotice({ uncoveredColumns: 3, unresolvedValues: 12 })).toBe(
      'Form needs updating: 3 columns, 12 answers',
    )
    expect(importOutcomeMessage({ processed: 84, unprocessed: 16, invalid: 2, warnings: 5 })).toBe(
      'Imported 84. 16 held for review, 2 invalid, 5 with warnings.',
    )
  })

  it('gives each row warning a plain label and never shows an unknown code raw', () => {
    for (const code of [
      'AGE_MISMATCH',
      'FOLLOW_UP_UNEXPECTED',
      'ID_PATTERN_MISMATCH',
      'CALCULATION_MISMATCH',
      'GUARDIAN_CONSENT_MISSING',
    ])
      expect(warningLabel(code)).not.toMatch(/[A-Z]{2,}_[A-Z]/)
    expect(warningLabel('SOMETHING_NEW')).toBe('Something new')
  })
})
