import { describe, expect, it } from 'vitest'

import type { ImportBatchDefinition } from '@/types/pathways'

import { noFormHint } from '../collection.copy'
import {
  automaticMatchReason,
  fieldsOfReason,
  guessFormType,
  ignoredReasonText,
  rowReason,
  rowReasonHelp,
  showsSurveys,
} from './import.utils'

describe('form a file needs when the project has none', () => {
  it('guesses the form type from the headers, registration last', () => {
    expect(guessFormType(['First Name', 'Birth date', 'Sex'])).toBe('BENEFICIARY_REGISTRATION')
    expect(guessFormType(['first_name', 'Pre-test score'])).toBe('PRE_TEST')
    expect(guessFormType(['Activity title', 'Venue', 'Attendance'])).toBe('ACTIVITY_MONITORING')
    expect(guessFormType(['Column A', 'Sexual'])).toBeNull()
  })

  it('asks for the registration form before a survey, and names who can create it', () => {
    expect(noFormHint(null, true)).toBe(
      'This project has no published form. Create and publish a beneficiary registration form on the Forms page first.',
    )
    expect(noFormHint('PRE_TEST', true)).toContain(
      'This file looks like a pre-test file. Create and publish a beneficiary registration form, then a pre-test form',
    )
    expect(noFormHint('ACTIVITY_MONITORING', false)).toBe(
      'This project has no published form. This file looks like an activity monitoring file. Ask a Monitoring and Evaluation Officer or System Administrator to publish an activity monitoring form first.',
    )
  })
})

const invalid = (code: string, fieldCode = 'age_at_registration') => ({
  status: 'INVALID' as const,
  processingErrorCode: null,
  validationErrors: [{ fieldCode, code, message: 'x' }],
})
const mappings = [
  { status: 'MAPPED', targetField: { code: 'age_at_registration', label: 'Age at registration' } },
] as unknown as ImportBatchDefinition['mappings']

describe('held row reasons', () => {
  it('names the field of a missing or unreadable value', () => {
    expect(rowReason(invalid('required'), mappings)).toBe('Age at registration is missing')
    expect(rowReason(invalid('AMBIGUOUS_DATE'), mappings)).toBe(
      'Age at registration is not a date PATHWAYS can read',
    )
    expect(rowReason(invalid('invalid_value'), mappings)).toBe('Age at registration is not valid')
  })

  it('says a duplicate repeats another row, on one key field or several', () => {
    const repeats = 'This row repeats another row in the file'
    expect(rowReason(invalid('DUPLICATE_BUSINESS_KEY', 'first_name,last_name'), mappings)).toBe(
      repeats,
    )
    expect(rowReason(invalid('DUPLICATE_BUSINESS_KEY', 'client_id'), mappings)).toBe(repeats)
  })

  it('keeps the plain reason when an error names no field', () => {
    expect(rowReason(invalid('some_code', ''), mappings)).toBe('A value in this row is not valid')
  })

  it('names the field whose file value differs from its calculated value', () => {
    expect(rowReason(invalid('CALCULATION_MISMATCH'), mappings)).toBe(
      'Age at registration in the file does not match its calculated value',
    )
    expect(rowReason(invalid('CALCULATION_MISMATCH', 'is_minor'), mappings)).toBe(
      'Is minor in the file does not match its calculated value',
    )
  })

  it('explains the confusing reasons and leaves plain holds alone', () => {
    expect(rowReasonHelp(invalid('BIRTH_AFTER_DATE'))).toMatch(/^The birth date is later than/)
    expect(rowReasonHelp(invalid('BIRTH_AFTER_DATE'))).toMatch(/upload date for minor status/)
    expect(rowReasonHelp(invalid('CALCULATION_MISMATCH'))).toMatch(/usually the birth date/)
    expect(
      rowReasonHelp({
        status: 'UNPROCESSED',
        processingErrorCode: 'GUARDIAN_CONSENT_REQUIRED',
        validationErrors: [],
      }),
    ).toBeUndefined()
  })

  it('points the review window of a held row at the field its hold names', () => {
    expect(fieldsOfReason.ENROLLMENT_DATE_REQUIRED).toEqual(['enrollment_date'])
    expect(fieldsOfReason.GUARDIAN_CONSENT_REQUIRED).toEqual(['guardian_consent_recorded'])
  })
})

describe('surveys of a file', () => {
  const batch = (coverage: 'COVERED' | 'NOT_COVERED' | null, parts = 1) =>
    ({
      fileParts: Array.from({ length: parts }, (_, i) => ({ code: `p${i}` })),
      mappingRevision: 1,
      coverage: coverage ? { coverage, uncoveredColumns: 0, unresolvedValues: 0 } : null,
    }) as unknown as ImportBatchDefinition

  it('wait while the registration form does not cover the file', () => {
    expect(showsSurveys(batch('NOT_COVERED'))).toBe(false)
    expect(showsSurveys(batch(null), { coverage: 'NOT_COVERED', mappingRevision: 1 })).toBe(false)
  })

  it('show once the registration columns are covered or reviewed', () => {
    expect(showsSurveys(batch('COVERED'))).toBe(true)
    expect(showsSurveys(batch(null))).toBe(true)
    expect(showsSurveys(batch(null), { coverage: 'NOT_COVERED', mappingRevision: 0 })).toBe(true)
  })

  it('never show for a file without surveys', () => {
    expect(showsSurveys(batch('COVERED', 0))).toBe(false)
  })
})

type StoredMapping = NonNullable<ImportBatchDefinition['mappings']>[number]
const stored = (status: string, validationMessage: string, matchReason: string | null = null) =>
  ({ status, validationMessage, matchReason }) as unknown as StoredMapping

describe('automatic match reason of a stored mapping', () => {
  it('reads AUTO_SMART_V3 and AUTO_SMART_V4 matches alike', () => {
    expect(automaticMatchReason(stored('MAPPED', 'AUTO_SMART_V3:AUTO_MATCH', 'SYNONYM'))).toBe(
      'known synonym',
    )
    expect(automaticMatchReason(stored('MAPPED', 'AUTO_SMART_V4:AUTO_MATCH', 'SYNONYM'))).toBe(
      'known synonym',
    )
    expect(automaticMatchReason(stored('MAPPED', 'AUTO_SMART_V5:AUTO_MATCH', 'SYNONYM'))).toBe(
      'known synonym',
    )
  })
})

describe('ignored reason of a stored mapping', () => {
  const reason = (message: string | null, formType = 'PRE_TEST', status = 'IGNORED') =>
    ignoredReasonText({ status, validationMessage: message }, formType)

  it('words each reason the matcher gives', () => {
    expect(reason('AUTO_SMART_V5:CALCULATED_FIELD')).toBe(
      'Ignored: the form works this out from other answers.',
    )
    expect(reason('AUTO_SMART_V5:BLANK_COLUMN')).toBe('Ignored: the column is empty.')
    expect(reason('AUTO_SMART_V4:SYSTEM_COLUMN')).toBe(
      'Ignored: a Kobo or ODK record column, not about the person.',
    )
  })

  it('words a submission time by form type', () => {
    expect(reason('AUTO_SMART_V5:SUBMISSION_TIME', 'BENEFICIARY_REGISTRATION')).toBe(
      'Ignored: used only to propose enrollment dates.',
    )
    expect(reason('AUTO_SMART_V5:SUBMISSION_TIME', 'PRE_TEST')).toBe(
      'Ignored: the time the form was submitted.',
    )
  })

  it('gives nothing for an unknown reason, a person ignore or another status', () => {
    expect(reason('AUTO_SMART_V5:SOMETHING_NEW')).toBeNull()
    expect(reason(null)).toBeNull()
    expect(reason('AUTO_SMART_V2:BLANK_COLUMN')).toBeNull()
    expect(reason('AUTO_SMART_V5:BLANK_COLUMN', 'PRE_TEST', 'MAPPED')).toBeNull()
  })
})
