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
