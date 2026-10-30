import { describe, expect, it } from 'vitest'

import type { ImportBatchDefinition } from '@/types/pathways'

import { rowReason, rowReasonHelp } from './import.utils'

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
})
