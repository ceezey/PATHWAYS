import { describe, expect, it } from 'vitest'

import { stageFixtureSheet } from '../form-draft/futuremakers-stage-fixture'
import { detectFileParts, registrationRange, selectPartColumns } from './file-parts'
import { normalizeMatrix } from './matrix'

const parsedFixture = (rows: number) => normalizeMatrix(stageFixtureSheet(rows))

describe('detectFileParts', () => {
  it('finds stages in the client layout', () => {
    expect(detectFileParts(parsedFixture(12))).toEqual([
      {
        code: 'y8678aMM8o3',
        name: 'LST Survey',
        firstColumn: 5,
        lastColumn: 11,
        rows: 9,
        branchOf: null,
      },
      {
        code: 'rNP4mvl5PFF',
        name: 'Technical Skills Survey',
        firstColumn: 12,
        lastColumn: 17,
        rows: 6,
        branchOf: 'y8678aMM8o3',
      },
      {
        code: 'p7Wcfe1p4lp',
        name: 'CBED Skills Survey',
        firstColumn: 18,
        lastColumn: 23,
        rows: 6,
        branchOf: 'y8678aMM8o3',
      },
      {
        code: 'TQFHPAzCaeI',
        name: 'Alumni Survey',
        firstColumn: 24,
        lastColumn: 29,
        rows: 4,
        branchOf: null,
      },
    ])
  })

  it('stages with no respondents in common are branches of the stage before them', () => {
    const [lst, technical, cbed, alumni] = detectFileParts(parsedFixture(12))
    expect([lst.branchOf, technical.branchOf, cbed.branchOf, alumni.branchOf]).toEqual([
      null,
      lst.code,
      lst.code,
      null,
    ])
  })

  it('date of birth and enrollment date are not stages', () => {
    const parts = detectFileParts(parsedFixture(12))
    expect(parts.map((part) => part.name)).not.toContain('Date of Birth')
    expect(parts[0].firstColumn).toBe(5)
    expect(registrationRange(parts)).toEqual({ firstColumn: 0, lastColumn: 4 })
  })

  it('a stage date column holding other text is not a stage', () => {
    const sheet = stageFixtureSheet(12)
    // Column 5 is the LST date.
    for (let row = 2; row < sheet.length; row += 1) sheet[row][5] = 'yes'
    const parts = detectFileParts(normalizeMatrix(sheet))
    expect(parts.map((part) => part.name)).toEqual([
      'Technical Skills Survey',
      'CBED Skills Survey',
      'Alumni Survey',
    ])
  })

  it('one header file has no parts', () => {
    expect(
      detectFileParts(
        normalizeMatrix([
          ['Name', 'Joined'],
          ['Ana', '2026-01-01'],
        ]),
      ),
    ).toEqual([])
  })

  it('a lone date column followed by unrepeated codes has no parts', () => {
    const matrix = [
      ['Hk3mNp9Qw2s', 'y8678aMM8o3', 'XXtSj0HEVSk', 'vzTQfNC1OsP'],
      ['First Name', 'LST Survey', 'Consent to the data', 'Student ID no'],
      ['Ana', '2026-01-01', 'yes', 'S1'],
    ]
    expect(detectFileParts(normalizeMatrix(matrix))).toEqual([])
  })
})

describe('selectPartColumns', () => {
  it('selecting a part keeps file row numbers', () => {
    const parsed = parsedFixture(12)
    const [, , cbed] = detectFileParts(parsed)
    const selected = selectPartColumns(parsed, cbed)
    expect(selected.rows.map((row) => row.sourceRowNumber)).toEqual([4, 6, 8, 10, 12, 14])
    expect(selected.sourceColumns.map((column) => column.columnIndex)).toEqual([
      19, 20, 21, 22, 23, 24,
    ])
    expect(Object.keys(selected.rows[0].values)).toEqual(
      selected.sourceColumns.map((column) => column.key),
    )
  })

  it('a stage nobody took has no rows', () => {
    const parsed = parsedFixture(1)
    const parts = detectFileParts(parsed)
    const cbed = parts[2]
    expect(cbed.rows).toBe(0)
    expect(selectPartColumns(parsed, cbed).rows).toEqual([])
  })
})
