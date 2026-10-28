import { Buffer } from 'node:buffer'

import { completedYearsAt } from '@pathways/shared'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { alternativeReadings } from './date-help'
import { type CheckField, checkImportFile } from './file-check'
import { readImportFile } from './read-import-file'

const field = (
  code: string,
  label: string,
  dataType: CheckField['dataType'],
  extra: Partial<CheckField> = {},
): CheckField => ({
  id: `id-${code}`,
  code,
  label,
  dataType,
  required: false,
  metadataKey: false,
  ...extra,
})

const fields = [
  field('birth_date', 'Date of Birth', 'DATE'),
  field('age_at_registration', 'Age', 'INTEGER', {
    rule: { kind: 'AGE_CHECK', birthField: 'birth_date', atFields: ['birth_date'] },
  }),
  field('enrollment_date', 'Enrollment date', 'DATE'),
  field('age_at_enrollment', 'Age at enrollment', 'INTEGER', {
    rule: {
      kind: 'AGE_AT_DATE',
      birthField: 'birth_date',
      atField: 'enrollment_date',
    },
  }),
]

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const serial = (iso: string) => (day(iso).getTime() - Date.UTC(1899, 11, 30)) / 86_400_000

// Real date cells as a spreadsheet stores them, shown as the given format.
function check(rows: Array<[born: string, age: number]>, format: string) {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Date of Birth', 'Age', 'Enrollment date'],
    ...rows.map(([born, age]) => [serial(born), age, serial('2024-01-15')]),
  ])
  for (let row = 2; row <= rows.length + 1; row++) {
    sheet[`A${row}`].z = format
    sheet[`C${row}`].z = 'yyyy-mm-dd'
  }
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Data')
  const bytes = Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }))
  const file = readImportFile(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    'XLSX',
    null,
  )
  return checkImportFile({ file, formType: 'ACTIVITY', fields, uploadDate: '2026-10-28' })
}

describe('alternativeReadings', () => {
  it('reads a stored MM/DD/YY date as typed YY/MM/DD', () => {
    // 2017-08-08 swapped is itself, so only the typed reading is offered.
    expect(alternativeReadings('2017-08-08', 2026)).toEqual({ TYPED_YY_MM_DD: '2008-08-17' })
  })

  it('offers the swapped day and month and the typed reading', () => {
    expect(alternativeReadings('2005-04-09', 2026)).toEqual({
      DAY_MONTH_SWAPPED: '2005-09-04',
      TYPED_YY_MM_DD: '2004-09-05',
    })
  })

  it('offers nothing that is not a real date', () => {
    expect(alternativeReadings('2005-04-31', 2026)).toEqual({})
  })
})

describe('date help in the file check', () => {
  // Typed YY/MM/DD as 05..12 / month / 10..29, stored as MM/DD/YY: year 2010..2029, month YY, day MM.
  const intended = Array.from({ length: 20 }, (_, i) => {
    const [yy, month, dd] = [5 + (i % 8), 1 + (i % 12), 10 + i]
    const pad = (n: number) => String(n).padStart(2, '0')
    return {
      born: `20${pad(yy)}-${pad(month)}-${pad(dd)}`,
      stored: `20${dd}-${pad(yy)}-${pad(month)}`,
    }
  })

  it('the Sheets copy fixture reports TYPED_YY_MM_DD evidence', () => {
    const rows = intended.map(({ born, stored }): [string, number] => [
      stored,
      completedYearsAt(day(born), day('2026-10-28')),
    ])
    const report = check(rows, 'mm/dd/yy')
    expect(report.problemRows).toBe(20)
    const lines = report.problems.filter((problem) => problem.fieldCode === 'birth_date')
    expect(lines.map((problem) => problem.code).sort()).toEqual([
      'AGE_MISMATCH',
      'BIRTH_AFTER_DATE',
    ])
    // The age field is not blamed for what the date column caused.
    expect(report.problems.map((problem) => problem.fieldCode)).not.toContain('age_at_registration')
    const [first] = lines
    expect(first).toMatchObject({
      fieldLabel: 'Date of Birth',
      columnHeader: 'Date of Birth',
      columnLetter: 'A',
    })
    const date = first.date
    expect(date?.evidence?.reading).toBe('TYPED_YY_MM_DD')
    expect((date?.evidence?.agreeing ?? 0) / (date?.evidence?.of ?? 1)).toBeGreaterThanOrEqual(0.8)
    expect(date?.example).toEqual({ row: 2, shown: '05/01/10', read: intended[0].stored })
    expect(date?.preferred).toBe('YYYY-MM-DD, for example 2008-08-17')
    expect(date?.fix).toBe(
      'In Excel or Google Sheets, select the column and set its format to yyyy-mm-dd, or retype the dates in that order if they are wrong.',
    )
    expect(lines[1].date).toBe(date)
  })

  it('a correct file gets no date help', () => {
    const rows = intended.map(({ born }): [string, number] => [
      born,
      completedYearsAt(day(born), day('2026-10-28')),
    ])
    const report = check(rows, 'yyyy-mm-dd')
    expect(report).toEqual({ totalRows: 20, problemRows: 0, problems: [] })
  })
})
