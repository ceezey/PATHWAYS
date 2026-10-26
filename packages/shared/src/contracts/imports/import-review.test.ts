import { describe, expect, it } from 'vitest'

import { importSourceColumnResponse } from './import-responses'
import {
  approveGuardianConsentRequest,
  importCheckpointRows,
  resolveImportRowRequest,
} from './import-review'

const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success

describe('resolveImportRowRequest', () => {
  const body = (choices: Record<string, string>, own: Record<string, unknown>) => ({
    expectedValidationRevision: 2,
    saveAs: 'UPDATE',
    choices,
    own,
  })

  it('accepts an own value whose choice is OWN', () => {
    expect(accepts(resolveImportRowRequest, body({ age: 'OWN', sex: 'FILE' }, { age: 21 }))).toBe(
      true,
    )
  })

  it('own value without OWN choice is refused', () => {
    expect(accepts(resolveImportRowRequest, body({ age: 'FILE' }, { age: 21 }))).toBe(false)
    expect(accepts(resolveImportRowRequest, body({}, { age: 21 }))).toBe(false)
  })
})

describe('approveGuardianConsentRequest', () => {
  const rows = (count: number) => Array.from({ length: count }, (_, i) => uuid(i + 1))

  it('accepts 25 distinct rows without guardian details', () => {
    expect(accepts(approveGuardianConsentRequest, { rowIds: rows(importCheckpointRows) })).toBe(
      true,
    )
  })

  it('accepts the guardian details for exactly one row', () => {
    expect(
      accepts(approveGuardianConsentRequest, {
        rowIds: [uuid(1)],
        guardianName: 'Parent Name',
        consentDate: '2026-10-26',
        note: 'Signed form seen.',
      }),
    ).toBe(true)
  })

  it('refuses the guardian details on a request for more than one row', () => {
    for (const details of [
      { guardianName: 'Parent Name' },
      { consentDate: '2026-10-26' },
      { note: 'Signed form seen.' },
    ]) {
      expect(accepts(approveGuardianConsentRequest, { rowIds: rows(2), ...details })).toBe(false)
    }
  })

  it('26 guardian rows are refused', () => {
    expect(accepts(approveGuardianConsentRequest, { rowIds: rows(importCheckpointRows + 1) })).toBe(
      false,
    )
    expect(accepts(approveGuardianConsentRequest, { rowIds: [] })).toBe(false)
  })

  it('duplicate guardian rows are refused', () => {
    expect(accepts(approveGuardianConsentRequest, { rowIds: [uuid(1), uuid(1)] })).toBe(false)
  })

  it('consentDate must be a calendar date', () => {
    for (const consentDate of ['2026-02-30', '2026-13-01', '26-10-26', '2026-10-26T00:00:00Z']) {
      expect(accepts(approveGuardianConsentRequest, { rowIds: [uuid(1)], consentDate })).toBe(false)
    }
  })
})

describe('importSourceColumnResponse', () => {
  const column = { key: 'column_0001', header: 'Age', columnIndex: 0 }

  it('sourceCode is optional and bounded', () => {
    expect(accepts(importSourceColumnResponse, column)).toBe(true)
    expect(accepts(importSourceColumnResponse, { ...column, sourceCode: 'a'.repeat(40) })).toBe(
      true,
    )
    expect(accepts(importSourceColumnResponse, { ...column, sourceCode: '' })).toBe(false)
    expect(accepts(importSourceColumnResponse, { ...column, sourceCode: 'a'.repeat(41) })).toBe(
      false,
    )
  })
})
