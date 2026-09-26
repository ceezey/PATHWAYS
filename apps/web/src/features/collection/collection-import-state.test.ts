import { describe, expect, it } from 'vitest'

import {
  createDefinitionMappingRows,
  createMappingRows,
  getMappingReadiness,
} from './collection-import-state'

const expectedHeaders = ['beneficiary_id', 'attendance_status']

describe('collection import mapping readiness', () => {
  it('matches unique definition codes and labels without fuzzy punctuation matching', () => {
    expect(
      createDefinitionMappingRows(
        ['Age at registration', 'birth-date', 'birth.date'],
        [
          { code: 'age_at_registration', label: 'Age' },
          { code: 'birth_date', label: 'Birth date' },
        ],
      ).map((row) => row.status),
    ).toEqual(['mapped', 'mapped', 'unmapped'])
  })

  it('leaves ambiguous labels and competing source columns unresolved', () => {
    const fields = [
      { code: 'first', label: 'Shared label' },
      { code: 'second', label: 'Shared label' },
    ]
    expect(createDefinitionMappingRows(['Shared label'], fields)[0].status).toBe('unmapped')
    expect(
      createDefinitionMappingRows(['first', 'first'], fields).map((row) => row.status),
    ).toEqual(['unmapped', 'unmapped'])
  })

  it('permits only a non-empty set of fully resolved mappings', () => {
    const valid = getMappingReadiness(
      createMappingRows(['beneficiary_id', 'attendance_status'], expectedHeaders),
    )

    expect(valid).toMatchObject({
      canProceed: true,
      invalid: 0,
      mapped: 2,
      total: 2,
      unmapped: 0,
    })
    expect(valid.message).toBe('All 2 source columns are resolved. You can proceed.')
  })

  it('blocks unmapped, invalid, and mapped-without-target rows with exact remaining counts', () => {
    const unmapped = getMappingReadiness(
      createMappingRows(['beneficiary_id', 'unknown_column'], expectedHeaders),
    )
    const invalid = getMappingReadiness(createMappingRows([''], expectedHeaders))
    const missingTarget = getMappingReadiness([
      {
        id: 'missing-target',
        sourceColumn: 'beneficiary_id',
        status: 'mapped',
        targetField: '',
      },
    ])

    expect(unmapped.canProceed).toBe(false)
    expect(unmapped.unmapped).toBe(1)
    expect(unmapped.message).toContain('1 unmapped source column remains')

    expect(invalid.canProceed).toBe(false)
    expect(invalid.invalid).toBe(1)
    expect(invalid.message).toContain('1 invalid source column remains')

    expect(missingTarget.canProceed).toBe(false)
    expect(missingTarget.unmapped).toBe(1)
  })

  it('treats an explicitly ignored source column as resolved under the no-override policy', () => {
    const readiness = getMappingReadiness([
      {
        id: 'ignored',
        sourceColumn: 'internal_note',
        status: 'ignored',
        targetField: '',
      },
    ])

    expect(readiness).toMatchObject({ canProceed: true, ignored: 1, resolved: 1, total: 1 })
  })
})
