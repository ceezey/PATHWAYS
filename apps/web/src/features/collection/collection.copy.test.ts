import {
  INTAKE_RULE_KINDS,
  type DigitalFormType as SharedDigitalFormType,
  digitalFormTypes,
  draftNeedsCheckReasons,
  importBatchResponse,
} from '@pathways/shared'
import { describe, expect, expectTypeOf, it } from 'vitest'

import type { DigitalFormType } from '@/types/pathways'

import { enumLabel, formTypeLabels, needsCheckLabels, ruleKindLabels } from './collection.copy'

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
