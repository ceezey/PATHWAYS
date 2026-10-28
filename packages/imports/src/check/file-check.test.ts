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

const check = (
  rows: unknown[][],
  fields: CheckField[],
  formType = 'ACTIVITY',
  mutate?: (sheet: XLSX.WorkSheet) => void,
) => {
  const book = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  mutate?.(sheet)
  XLSX.utils.book_append_sheet(book, sheet, 'Data')
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
        rowCount: 2,
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

  it('an age that does not match is reported on the birth date column', () => {
    const report = check(
      [header, good, wrongAge, wrongAge, wrongAge, wrongAge, good],
      [firstName, birthDate, age],
    )
    expect(report.totalRows).toBe(6)
    expect(report.problems).toEqual([
      {
        kind: 'ROW',
        fieldCode: 'birth_date',
        fieldLabel: 'Birth date',
        columnHeader: 'Birth date',
        columnLetter: 'B',
        code: 'AGE_MISMATCH',
        message: 'The age does not match the birth date.',
        rowCount: 4,
        exampleRows: [3, 4, 5],
        date: {
          example: { row: 3, shown: '2000-01-01', read: '2000-01-01' },
          preferred: 'YYYY-MM-DD, for example 2008-08-17',
          fix: 'In Excel or Google Sheets, select the column and set its format to yyyy-mm-dd, or retype the dates in that order if they are wrong.',
          evidence: null,
        },
      },
    ])
  })

  it('a text date shows as the file has it', () => {
    const csv = [
      'First name,Birth date,Age at registration',
      'Ana,25/12/2004,40',
      'Ben,13/04/2005,21',
    ].join('\n')
    const file = readImportFile(toArrayBuffer(Buffer.from(csv)), 'CSV', null)
    const report = checkImportFile({
      file,
      formType: 'ACTIVITY',
      fields: [firstName, birthDate, age],
      uploadDate: '2026-10-28',
    })
    expect(report.problems[0].date?.example).toEqual({
      row: 2,
      shown: '25/12/2004',
      read: '2004-12-25',
    })
  })

  it('the date help is on the first line of a birth date column only', () => {
    const enrolled = field('enrollment_date', 'Enrollment date', 'DATE')
    const ageAtEnrollment = field('age_at_enrollment', 'Age at enrollment', 'INTEGER', {
      rule: { kind: 'AGE_AT_DATE', birthField: 'birth_date', atField: 'enrollment_date' },
    })
    const report = check(
      [
        [...header, 'Enrollment date'],
        ['Ana', '2000-01-01', 40, '2020-01-01'],
        ['Ben', '2000-01-01', 41, '2020-01-01'],
        ['Cai', '2000-01-01', 26, '1999-01-01'],
      ],
      [firstName, birthDate, age, enrolled, ageAtEnrollment],
    )
    expect(report.problems.map((problem) => [problem.code, !!problem.date])).toEqual([
      ['AGE_MISMATCH', true],
      ['BIRTH_AFTER_DATE', false],
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

  it('an unreadable date in a column with one fitting order is reported', () => {
    // 25/12/2004 and 13/04/2005 fit only day/month/year, so the server reads them without a reviewer.
    const report = check(
      [
        ['First name', 'Birth date'],
        ['Ana', '25/12/2004'],
        ['Ben', '13/04/2005'],
        ['Cai', 12345],
      ],
      [firstName, birthDate],
    )
    expect(report.problems).toMatchObject([
      {
        kind: 'ROW',
        fieldCode: 'birth_date',
        code: 'AMBIGUOUS_DATE',
        rowCount: 1,
        exampleRows: [4],
      },
    ])
    expect(report.problemRows).toBe(1)
  })

  it('a formula with no saved value is reported after missing columns', () => {
    const school = field('school', 'School', 'TEXT', { required: true })
    const report = check(
      [header, good, good],
      [firstName, birthDate, age, school],
      'ACTIVITY',
      (sheet) => {
        sheet.D2 = { t: 'n', f: 'A1+1' }
        sheet['!ref'] = 'A1:D3'
      },
    )
    expect(report.problems.map((problem) => problem.kind)).toEqual([
      'NO_COLUMN',
      'FORMULA_NO_VALUE',
    ])
    expect(report.problems[1]).toMatchObject({
      fieldCode: '',
      code: 'FORMULA_NO_VALUE',
      message:
        'Cell D2 has a formula with no saved value. Open and save the file in Excel or Google Sheets.',
      columnLetter: 'D',
      rowCount: 1,
      exampleRows: [2],
    })
  })

  it('rows sharing a client ID or a metadata key are reported', () => {
    const clientId = field('external_identifier_value', 'Client ID', 'TEXT')
    const code = field('activity_code', 'Activity code', 'TEXT', { metadataKey: true })
    const rows = [
      ['Client ID', 'Activity code'],
      ['S-12', 'A1'],
      ['S-30', 'A2'],
      [' S-12 ', 'A2'],
    ]
    const registration = check(rows, [clientId, code], 'BENEFICIARY_REGISTRATION')
    const byCode = Object.fromEntries(
      registration.problems.map((problem) => [problem.code, problem]),
    )
    expect(byCode.IDENTITY_CONFLICT).toMatchObject({
      fieldCode: 'external_identifier_value',
      columnLetter: 'A',
      rowCount: 2,
      exampleRows: [2, 4],
    })
    expect(byCode.DUPLICATE_BUSINESS_KEY).toMatchObject({
      fieldCode: 'activity_code',
      rowCount: 2,
      exampleRows: [3, 4],
    })
    // The client ID rule belongs to registration forms only.
    expect(check(rows, [clientId, code]).problems.map((problem) => problem.code)).toEqual([
      'DUPLICATE_BUSINESS_KEY',
    ])
  })
})
