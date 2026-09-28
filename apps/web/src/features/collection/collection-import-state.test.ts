import { smartMatchColumns } from '@pathways/imports'
import { describe, expect, it } from 'vitest'

import {
  type PreviewMappingField,
  createQuestionnaireMappingRows,
  createSmartMappingRows,
  getMappingReadiness,
} from './collection-import-state'

const fields: PreviewMappingField[] = [
  { code: 'beneficiary_id', label: 'Beneficiary ID', dataType: 'TEXT' },
  {
    code: 'attendance_status',
    label: 'Attendance status',
    dataType: 'SELECT',
    allowedValues: ['Present', 'Absent'],
  },
  { code: 'birth_date', label: 'Birth date', dataType: 'DATE' },
  { code: 'sex', label: 'Sex', dataType: 'SELECT', allowedValues: ['MALE', 'FEMALE'] },
]

describe('advisory AUTO_SMART_V2 preview mapping', () => {
  it('pre-selects only high-confidence matches and offers weaker ones as suggestions', () => {
    const rows = createSmartMappingRows(
      ['Beneficiary ID', 'Attendance', 'DOB', 'Gender', 'Notes'],
      [
        { 'Beneficiary ID': 'BEN-1', Attendance: 'Present', DOB: '2012-04-01', Gender: 'MALE' },
        { 'Beneficiary ID': 'BEN-2', Attendance: 'Absent', DOB: '2011-01-09', Gender: 'FEMALE' },
      ],
      fields,
    )
    expect(rows.map((row) => [row.targetField, row.status, row.suggestedField])).toEqual([
      ['beneficiary_id', 'mapped', undefined],
      ['attendance_status', 'mapped', undefined],
      ['birth_date', 'mapped', undefined],
      ['', 'unmapped', 'sex'],
      ['', 'unmapped', undefined],
    ])
    expect(rows.filter((row) => row.autoMatched).length).toBe(3)
    expect(getMappingReadiness(rows)).toMatchObject({ canProceed: false, mapped: 3, unmapped: 2 })
  })

  it('never auto-selects gender for sex, even when the values fit', () => {
    const [row] = createSmartMappingRows(['Gender'], [{ Gender: 'FEMALE' }], fields)
    expect(row).toMatchObject({ targetField: '', status: 'unmapped', suggestedField: 'sex' })
  })

  it('holds a name match whose sampled values do not fit the field type', () => {
    const [row] = createSmartMappingRows(['Birth date'], [{ 'Birth date': 'unknown' }], fields)
    expect(row).toMatchObject({ targetField: '', status: 'unmapped', suggestedField: 'birth_date' })
  })

  it('matches the shared matcher exactly (API parity) and is deterministic', () => {
    const headers = ['Beneficiary ID', 'Attendance', 'DOB', 'Gender']
    const data = [
      { 'Beneficiary ID': 'BEN-1', Attendance: 'Present', DOB: '2012-04-01', Gender: 'x' },
    ]
    const preview = createSmartMappingRows(headers, data, fields)
    const server = smartMatchColumns(
      headers.map((header, index) => ({
        key: `column_${String(index + 1).padStart(4, '0')}`,
        columnIndex: index + 1,
        header,
        samples: data.map((row) => row[header as keyof (typeof data)[number]]),
      })),
      fields.map((field) => ({ ...field, id: field.code })),
    )
    expect(preview.map((row) => row.targetField || null)).toEqual(
      server.map((decision) => decision.targetFieldId),
    )
    expect(preview.map((row) => row.suggestedField ?? null)).toEqual(
      server.map((decision) => decision.suggestedFieldId),
    )
    expect(createSmartMappingRows(headers, data, fields)).toEqual(preview)
  })

  it('keeps positional identities and never maps two columns to one field', () => {
    const headers = ['Beneficiary ID', 'beneficiary_id', '', 'Beneficiary ID']
    const rows = createSmartMappingRows(headers, [], fields)
    expect(rows.map((row) => row.id)).toEqual(headers.map((_, index) => `mapping-${index}`))
    expect(rows.map((row) => row.sourceColumn)).toEqual(headers)
    const targets = rows.map((row) => row.targetField).filter(Boolean)
    expect(new Set(targets).size).toBe(targets.length)
    // No samples: nothing is pre-selected; one suggestion per field at most.
    expect(rows.every((row) => row.status === 'unmapped')).toBe(true)
  })

  it('falls back to unmatched rows beyond the import bounds', () => {
    const rows = createSmartMappingRows(['x'.repeat(200)], [], fields)
    expect(rows).toEqual([
      { id: 'mapping-0', sourceColumn: 'x'.repeat(200), targetField: '', status: 'unmapped' },
    ])
  })
})

describe('header-only questionnaire mapping', () => {
  it('turns each named column into its own draft field code', () => {
    const rows = createQuestionnaireMappingRows([
      'beneficiary_id',
      'Pre-test score',
      '',
      'pre test score',
    ])
    expect(rows.map((row) => [row.targetField, row.status])).toEqual([
      ['beneficiary_id', 'mapped'],
      ['pre_test_score', 'mapped'],
      ['', 'invalid'],
      ['', 'unmapped'],
    ])
  })
})

describe('collection import mapping readiness', () => {
  it('permits only a non-empty set of fully resolved mappings', () => {
    const valid = getMappingReadiness(
      createQuestionnaireMappingRows(['beneficiary_id', 'attendance_status']),
    )

    expect(valid).toMatchObject({
      canProceed: true,
      invalid: 0,
      mapped: 2,
      total: 2,
      unmapped: 0,
    })
    expect(valid.message).toBe('All 2 source columns are resolved. You can proceed.')
    expect(getMappingReadiness([]).canProceed).toBe(false)
  })

  it('blocks unmapped, invalid, and mapped-without-target rows with exact remaining counts', () => {
    const unmapped = getMappingReadiness(
      createSmartMappingRows(
        ['Beneficiary ID', 'unknown_column'],
        [{ 'Beneficiary ID': 'BEN-1', unknown_column: 'x' }],
        fields,
      ),
    )
    const invalid = getMappingReadiness(createQuestionnaireMappingRows(['']))
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
