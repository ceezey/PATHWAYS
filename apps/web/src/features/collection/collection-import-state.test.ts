import { describe, expect, it } from 'vitest'

import {
  createDefinitionMappingRows,
  createMappingRows,
  getMappingReadiness,
  normalizeMappingNameV1,
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

describe('conservative approved-definition mapping V1 preview', () => {
  it.each([
    [' \tAGE\nAT\rREGISTRATION\f\v ', 'age_at_registration'],
    ['Birth---Date', 'birth_date'],
    ['ＡＧＥ　ＡＴ　ＲＥＧＩＳＴＲＡＴＩＯＮ', 'age_at_registration'],
    ['É', 'É'],
    ['é', 'é'],
    ['Å', 'Å'],
    ['å', 'å'],
    ['\u0085Age\u0085', '\u0085age\u0085'],
    ['\u2028Age\u2028', '\u2028age\u2028'],
    ['Birth.Date', 'birth.date'],
    ['', ''],
    [' \t\n\r\f\v', ''],
  ])('normalizes %j conservatively to %j', (source, expected) => {
    expect(normalizeMappingNameV1(source)).toBe(expected)
  })

  it('preserves non-ASCII letter case and whitespace when matching approved names', () => {
    const rows = createDefinitionMappingRows(
      ['É', 'Å', '\u0085age', '\u2028age', 'é', 'å', 'age'],
      [
        { code: 'accent_e', label: 'é' },
        { code: 'accent_a', label: 'å' },
        { code: 'age', label: 'Age' },
      ],
    )
    expect(rows.map((row) => row.targetField)).toEqual([
      '',
      '',
      '',
      '',
      'accent_e',
      'accent_a',
      'age',
    ])
  })

  it('keeps every ambiguous candidate claim in competing-source detection', () => {
    const rows = createDefinitionMappingRows(
      ['first', 'Shared label'],
      [
        { code: 'first', label: 'Shared label' },
        { code: 'second', label: 'Shared label' },
      ],
    )
    expect(rows.map((row) => row.status)).toEqual(['unmapped', 'unmapped'])
    expect(rows.map((row) => row.targetField)).toEqual(['', ''])
    expect(getMappingReadiness(rows).canProceed).toBe(false)
  })

  it('never lets an exact code override another approved field label', () => {
    const rows = createDefinitionMappingRows(
      ['first'],
      [
        { code: 'first', label: 'First field' },
        { code: 'other', label: 'first' },
      ],
    )
    expect(rows[0]).toMatchObject({ sourceColumn: 'first', targetField: '', status: 'unmapped' })
  })

  it('preserves original headers and distinct positional identities for unresolved sources', () => {
    const headers = ['Age', 'Ａｇｅ', '', '', 'unknown_alias', 'birth.date']
    const rows = createDefinitionMappingRows(headers, [{ code: 'age', label: 'Age' }])
    expect(rows.map((row) => row.id)).toEqual(headers.map((_, index) => `mapping-${index}`))
    expect(rows.map((row) => row.sourceColumn)).toEqual(headers)
    expect(rows.map((row) => row.status)).toEqual(headers.map(() => 'unmapped'))
    expect(rows.every((row) => row.targetField === '')).toBe(true)
    expect(new Set(rows.map((row) => row.id)).size).toBe(headers.length)
    expect(getMappingReadiness(rows)).toMatchObject({ canProceed: false, ignored: 0, unmapped: 6 })
  })
})
