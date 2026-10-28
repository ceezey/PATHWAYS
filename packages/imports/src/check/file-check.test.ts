import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { type CheckField, checkImportFile } from './file-check'
import { readImportFile } from './read-import-file'

const toArrayBuffer = (bytes: Uint8Array) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

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

const firstName = field('first_name', 'First name', 'TEXT', { required: true })
const birthDate = field('birth_date', 'Birth date', 'DATE')
const age = field('age_at_registration', 'Age at registration', 'INTEGER', {
  rule: { kind: 'AGE_CHECK', birthField: 'birth_date', atFields: ['birth_date'] },
})
const sex = field('sex', 'Sex', 'SELECT', { allowedValues: ['Female', 'Male'] })
const consent = field('consent_recorded', 'Consent recorded', 'BOOLEAN')
const dataConsent = field('data_processing_consent_recorded', 'Data processing consent', 'BOOLEAN')

const check = (rows: unknown[][], fields: CheckField[], formType = 'ACTIVITY') => {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Data')
  const bytes = Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }))
  const file = readImportFile(toArrayBuffer(bytes), 'XLSX', null)
  return checkImportFile({ file, formType, fields, uploadDate: '2026-10-28' })
}

const header = ['First name', 'Birth date', 'Age at registration']
// A person born 2000-01-01 is 26 on the upload date.
const good = ['Ana', '2000-01-01', 26]
const wrongAge = ['Ben', '2000-01-01', 40]

describe('checkImportFile', () => {
  it('a clean file has no problems', () => {
    const report = check([header, good, ['Cai', '1999-05-05', 27]], [firstName, birthDate, age])
    expect(report).toEqual({ totalRows: 2, problemRows: 0, problems: [] })
  })

  it('a missing required column is reported once', () => {
    const school = field('school', 'School', 'TEXT', { required: true })
    const report = check([header, good, good], [firstName, birthDate, age, school])
    expect(report.problems).toEqual([
      {
        kind: 'NO_COLUMN',
        fieldCode: 'school',
        fieldLabel: 'School',
        columnHeader: null,
        columnLetter: null,
        code: 'NO_COLUMN',
        message:
          'No column matches. Rename the column, or add its header as a source name under Advanced Configuration.',
        rowCount: 0,
        exampleRows: [],
      },
    ])
    expect(report.problemRows).toBe(0)
  })

  it('a suggested column counts as mapped', () => {
    // "First nme" is only a suggestion for First name, yet its blank cell is still checked.
    const report = check(
      [
        ['First nme', 'Birth date'],
        ['Ana', '2000-01-01'],
        ['', '2000-01-01'],
      ],
      [firstName, birthDate],
    )
    expect(
      report.problems.map((problem) => [problem.kind, problem.fieldCode, problem.code]),
    ).toEqual([['ROW', 'first_name', 'required']])
    expect(report.problems[0]).toMatchObject({
      columnHeader: 'First nme',
      columnLetter: 'A',
      rowCount: 1,
      exampleRows: [3],
    })
  })

  it('an unlisted answer and an ambiguous text date are not reported', () => {
    const report = check(
      [
        [...header, 'Sex'],
        ['Ana', '03/04/05', '', 'Female'],
        ['Ben', '01/02/03', '', 'Male'],
        ['Cai', '2000-01-01', 26, 'Other'],
      ],
      [firstName, birthDate, age, sex],
    )
    expect(report).toEqual({ totalRows: 3, problemRows: 0, problems: [] })
  })

  it('missing consent is reported only on a registration form', () => {
    const rows = [
      [...header, 'Consent recorded', 'Data processing consent'],
      [...good, true, true],
      [...good, true, false],
    ]
    const fields = [firstName, birthDate, age, consent, dataConsent]
    const registration = check(rows, fields, 'BENEFICIARY_REGISTRATION')
    expect(registration.problems).toMatchObject([
      {
        kind: 'ROW',
        code: 'CONSENT_REQUIRED',
        message: 'Consent is not recorded',
        rowCount: 1,
        exampleRows: [3],
      },
    ])
    expect(registration.problemRows).toBe(1)
    expect(check(rows, fields).problems).toEqual([])
  })

  it('an age that does not match is reported with its rows', () => {
    const report = check(
      [header, good, wrongAge, wrongAge, wrongAge, wrongAge, good],
      [firstName, birthDate, age],
    )
    expect(report.totalRows).toBe(6)
    expect(report.problems).toEqual([
      {
        kind: 'ROW',
        fieldCode: 'age_at_registration',
        fieldLabel: 'Age at registration',
        columnHeader: 'Age at registration',
        columnLetter: 'C',
        code: 'AGE_MISMATCH',
        message: 'The age does not match the birth date.',
        rowCount: 4,
        exampleRows: [3, 4, 5],
      },
    ])
  })

  it('problemRows counts each row once', () => {
    const report = check(
      [header, ['', '2000-01-01', 40], wrongAge, good],
      [firstName, birthDate, age],
    )
    expect(report.problems.map((problem) => [problem.code, problem.rowCount])).toEqual([
      ['AGE_MISMATCH', 2],
      ['required', 1],
    ])
    expect(report.problemRows).toBe(2)
  })
})
