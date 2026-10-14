import {
  type DigitalFormType as SharedDigitalFormType,
  digitalFormTypes,
  importBatchResponse,
} from '@pathways/shared'
import { describe, expect, expectTypeOf, it } from 'vitest'

import type { DigitalFormType } from '@/types/pathways'

import { enumLabel, formTypeLabels } from './collection.copy'

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
