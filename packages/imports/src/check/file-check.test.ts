import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import { stageFixtureSheet } from '../form-draft/futuremakers-stage-fixture'
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

describe('checkImportFile canPrepareForm', () => {
  const score = field('score', 'Score', 'INTEGER')

  it('is true when a required column is missing and the file has a column a draft would add', () => {
    const report = check(
      [
        ['Score', 'Favourite colour'],
        [3, 'red'],
      ],
      [firstName, score],
    )
    expect(report.problems.map((problem) => problem.kind)).toContain('NO_COLUMN')
    expect(report.canPrepareForm).toBe(true)
  })

  it('is false when a required column is missing and a draft would have nothing to add', () => {
    const report = check([['Score'], [3]], [firstName, score])
    expect(report.problems.map((problem) => problem.kind)).toContain('NO_COLUMN')
    expect(report.canPrepareForm).toBe(false)
  })

  it('is true on a registration form when a draft would set a required field default', () => {
    const operation = field('registration_operation', 'Registration operation', 'SELECT', {
      required: true,
      allowedValues: ['CREATE', 'UPDATE'],
    })
    const report = check(
      [['First name'], ['Ana']],
      [firstName, operation],
      'BENEFICIARY_REGISTRATION',
    )
    expect(report.canPrepareForm).toBe(true)
  })

  it('is false for a header-only file, which the server refuses to draft from', () => {
    const operation = field('registration_operation', 'Registration operation', 'SELECT', {
      required: true,
      allowedValues: ['CREATE', 'UPDATE'],
    })
    const report = check([['First name']], [firstName, operation], 'BENEFICIARY_REGISTRATION')
    expect(report.problems.map((problem) => problem.kind)).toContain('NO_COLUMN')
    expect(report.canPrepareForm).toBe(false)
  })

  it('is false for a formula with no saved value, because the server refuses the upload', () => {
    const report = check(
      [
        ['Score', 'Favourite colour'],
        [3, 'red'],
      ],
      [firstName, score],
      'ACTIVITY',
      (sheet) => {
        sheet.A2 = { t: 'n', f: 'SUM(1,2)' }
      },
    )
    expect(report.problems.map((problem) => problem.kind)).toEqual(
      expect.arrayContaining(['NO_COLUMN', 'FORMULA_NO_VALUE']),
    )
    expect(report.canPrepareForm).toBe(false)
  })

  it('is false when only rows have problems, even with a column a draft would add', () => {
    const report = check(
      [
        ['First name', 'Score', 'Favourite colour'],
        ['Ana', 'abc', 'red'],
      ],
      [firstName, score],
    )
    expect(report.problems.map((problem) => problem.kind)).not.toContain('NO_COLUMN')
    expect(report.canPrepareForm).toBe(false)
  })
})

describe('checkImportFile', () => {
  it('a clean file has no problems', () => {
    const report = check([header, good, ['Cai', '1999-05-05', 27]], [firstName, birthDate, age])
    expect(report).toEqual({
      totalRows: 2,
      problemRows: 0,
      problems: [],
      notes: [],
      canPrepareForm: false,
    })
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
    expect(report).toMatchObject({
      totalRows: 3,
      problemRows: 0,
      problems: [],
      canPrepareForm: false,
    })
    // The column is held with the sex field suggested, because 'Other' is not an option.
    expect(report.notes.map((note) => note.fieldCode)).toEqual(['sex'])
  })

  it('a date no order can read is reported', () => {
    const report = check(
      [
        ['First name', 'Birth date'],
        ['Ana', '2000-01-01'],
        ['Ben', 'not-a-date'],
      ],
      [firstName, birthDate],
    )
    expect(report.problemRows).toBe(1)
    expect(report.problems).toMatchObject([
      { fieldCode: 'birth_date', code: 'AMBIGUOUS_DATE', rowCount: 1, exampleRows: [3] },
    ])
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
      message: 'Client ID S-12 is on rows 2 and 4',
      rowCount: 2,
      exampleRows: [2, 4],
    })
    expect(byCode.DUPLICATE_BUSINESS_KEY).toMatchObject({
      fieldCode: 'activity_code',
      message: 'Activity code A2 is on rows 3 and 4',
      rowCount: 2,
      exampleRows: [3, 4],
    })
    // The client ID rule belongs to registration forms only.
    expect(check(rows, [clientId, code]).problems.map((problem) => problem.code)).toEqual([
      'DUPLICATE_BUSINESS_KEY',
    ])
  })

  it('each duplicated client ID gets its own line with all its rows', () => {
    const clientId = field('external_identifier_value', 'Student ID', 'TEXT')
    const ids = ['S-12', 'S-30', 'S-12', 'S-30', 'S-31', 'S-12', 'S-12']
    const report = check(
      [
        ['Student ID', 'Consent recorded', 'Data processing consent'],
        ...ids.map((id) => [id, true, true]),
      ],
      [clientId, consent, dataConsent],
      'BENEFICIARY_REGISTRATION',
    )
    expect(
      report.problems.map(({ message, rowCount, exampleRows }) => [message, rowCount, exampleRows]),
    ).toEqual([
      ['Student ID S-12 is on rows 2, 4, 7 and 8', 4, [2, 4, 7]],
      ['Student ID S-30 is on rows 3 and 5', 2, [3, 5]],
    ])
    expect(report.problemRows).toBe(6)
  })

  it('a key of two fields names both, and more than 10 duplicated values share one line', () => {
    const code = field('activity_code', 'Activity code', 'TEXT', { metadataKey: true })
    const session = field('session', 'Session', 'TEXT', { metadataKey: true })
    const pair = check(
      [
        ['Activity code', 'Session'],
        ['A1', 'S1'],
        ['A1', 'S2'],
        ['A1', 'S1'],
      ],
      [code, session],
    )
    expect(pair.problems.map((problem) => problem.message)).toEqual([
      'Activity code and Session A1, S1 is on rows 2 and 4',
    ])
    // Twelve codes each on two rows: ten lines, then one line for the last two codes' four rows.
    const codes = Array.from({ length: 12 }, (_, index) => [`C${index}`])
    const many = check([['Activity code'], ...codes, ...codes], [code])
    expect(many.problems).toHaveLength(11)
    expect(many.problems[0].message).toBe('Activity code C0 is on rows 2 and 14')
    expect(many.problems[10]).toMatchObject({
      message: '2 more Activity code values are on more than one row',
      rowCount: 4,
      exampleRows: [12, 13, 24],
    })
    expect(many.problemRows).toBe(24)
  })
})

describe('checkImportFile on a file with parts', () => {
  it('the check reads only the registration columns of a file with parts', () => {
    // Dates are written as real Excel date cells, as a client file has them.
    const rows = stageFixtureSheet(12).map((row) =>
      row.map((cell) =>
        typeof cell === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cell)
          ? new Date(`${cell}T12:00:00Z`)
          : cell,
      ),
    )
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows, { cellDates: true }), 'Data')
    const bytes = Buffer.from(
      XLSX.write(book, { type: 'buffer', bookType: 'xlsx', cellDates: true }),
    )
    const file = readImportFile(toArrayBuffer(bytes), 'XLSX', null)
    expect(file.sourceColumns.map((column) => column.header)).toEqual([
      'enrollmentDate',
      'First Name',
      'Last Name',
      'Date of Birth',
      'Sex',
    ])
    expect(file.rows).toHaveLength(12)
    expect(file.rowNumbers[0]).toBe(3)
    const report = checkImportFile({
      file,
      formType: 'ACTIVITY',
      fields: [firstName],
      uploadDate: '2026-10-28',
    })
    expect(report.problems).toEqual([])
    expect(report.totalRows).toBe(12)
  })
})

describe('checkImportFile notes on breakdown fields with no column', () => {
  const disability = field('disability_status', 'Disability status', 'SELECT', {
    allowedValues: ['With disability', 'Without disability'],
  })
  const displayName = field('display_name', 'Display name', 'TEXT')
  const registration = [displayName, sex, birthDate, age, disability]

  it('names the header suggested for sex and says nothing of birth date when age is fed', () => {
    const report = check(
      [
        ['Kasarian', 'Pangalan', 'Edad'],
        ['Babae', 'Ana', 26],
      ],
      [displayName, sex, birthDate, age],
      'BENEFICIARY_REGISTRATION',
    )
    expect(report.notes).toEqual([
      {
        kind: 'SADDD_NO_COLUMN',
        fieldCode: 'sex',
        message:
          "No column feeds Sex, so this file adds nothing to the sex breakdown. The file's 'Kasarian' was suggested.",
      },
    ])
  })

  it('words a group with no suggestion without one', () => {
    const report = check([['Pangalan'], ['Ana']], [displayName, disability])
    expect(report.notes).toEqual([
      {
        kind: 'SADDD_NO_COLUMN',
        fieldCode: 'disability_status',
        message:
          'No column feeds Disability status, so this file adds nothing to the disability status breakdown.',
      },
    ])
  })

  it('counts a disability status the Washington Group questions compute as fed', () => {
    const questions = ['seeing', 'hearing', 'walking', 'remembering', 'self_care', 'talking'].map(
      (code) =>
        field(`wg_${code}`, `Difficulty ${code}`, 'SELECT', {
          allowedValues: ['No difficulty', 'Some difficulty', 'A lot of difficulty'],
        }),
    )
    const computed = field('disability_status', 'Disability status', 'SELECT', {
      allowedValues: ['WITH_DISABILITY', 'WITHOUT_DISABILITY', 'NOT_SPECIFIED'],
      rule: {
        kind: 'WASHINGTON_GROUP_DISABILITY',
        questionFields: questions.map((question) => question.code),
        disabilityValues: ['A lot of difficulty'],
      },
    })
    const report = check(
      [questions.map((question) => question.label), questions.map(() => 'No difficulty')],
      [...questions, computed],
    )
    expect(report.notes).toEqual([])
  })

  it('counts a column with only blank cells as feeding nothing, as the draft does', () => {
    const report = check(
      [
        ['Pangalan', 'Sex'],
        ['Ana', ''],
      ],
      [displayName, sex],
    )
    expect(report.notes.map((note) => note.fieldCode)).toEqual(['sex'])
  })

  it('gives no note when all three groups have a column', () => {
    const report = check(
      [
        ['Sex', 'Age at registration', 'Disability status'],
        ['Female', 26, 'With disability'],
      ],
      registration,
    )
    expect(report.notes).toEqual([])
  })
})

describe('checkImportFile notes on how the file was read', () => {
  const disability = field('disability_status', 'Disability status', 'SELECT', {
    allowedValues: ['With disability', 'Without disability'],
  })
  const fields = [firstName, sex, birthDate, age, disability]
  const checkCsv = (bytes: Buffer) =>
    checkImportFile({
      file: readImportFile(toArrayBuffer(bytes), 'CSV', null),
      formType: 'ACTIVITY',
      fields,
      uploadDate: '2026-10-28',
    })

  it('a CSV with a title row, Windows-1252 text and no Sex column gives the three notes', () => {
    const csv = [
      'Masterlist',
      'First name,Age at registration,Disability status',
      'Ana,26,With disability',
      'Peñafiel,27,Without disability',
    ].join('\n')
    const report = checkCsv(Buffer.from(csv, 'latin1'))
    expect(report.notes).toEqual([
      {
        kind: 'HEADER_ROW',
        message: 'Headers read from row 2. The rows above it were skipped as titles.',
      },
      {
        kind: 'ENCODING',
        message:
          "This CSV was read as Windows text. Check that names look right, for example 'Peñafiel'.",
      },
      {
        kind: 'SADDD_NO_COLUMN',
        fieldCode: 'sex',
        message: 'No column feeds Sex, so this file adds nothing to the sex breakdown.',
      },
    ])
  })

  it('gives no header note when only blank rows are above the header', () => {
    const csv = [
      '',
      ',,,',
      'First name,Sex,Age at registration,Disability status',
      'Ana,Female,26,With disability',
    ].join('\n')
    const file = readImportFile(toArrayBuffer(Buffer.from(csv)), 'CSV', null)
    expect(file.headerRowNumber).toBe(3)
    expect(checkCsv(Buffer.from(csv)).notes).toEqual([])
  })

  it('a clean file gives no notes', () => {
    const csv = [
      'First name,Sex,Age at registration,Disability status',
      'Ana,Female,26,With disability',
    ].join('\n')
    expect(checkCsv(Buffer.from(csv)).notes).toEqual([])
  })

  it('names each merged run by its column letter and rows, and caps the lines at ten', () => {
    const rows = [
      ['First name', 'Sex', 'Age at registration', 'Disability status'],
      ...Array.from({ length: 24 }, (_, index) => [
        `Person ${index}`,
        index % 2 === 0 ? 'Female' : '',
        26,
        'With disability',
      ]),
    ]
    const report = check(rows, fields, 'ACTIVITY', (sheet) => {
      // Twelve merges in column B (Sex), each two rows tall.
      sheet['!merges'] = Array.from({ length: 12 }, (_, index) => ({
        s: { r: 1 + index * 2, c: 1 },
        e: { r: 2 + index * 2, c: 1 },
      }))
    })
    const merged = report.notes.filter((note) => note.kind === 'MERGED_FILL')
    expect(merged).toHaveLength(11)
    expect(merged[0].message).toBe('Merged cells in column B were copied down to rows 2 to 3.')
    expect(merged[9].message).toBe('Merged cells in column B were copied down to rows 20 to 21.')
    expect(merged[10].message).toBe('and 2 more')
  })
})

describe('checkImportFile enrollment date left for confirmation', () => {
  const enrollment = field('enrollment_date', 'Enrollment date', 'DATE', { required: true })
  const fields = [firstName, enrollment]
  // A registration file with no consent column also reports its held rows, which these tests leave out.
  const missing = (report: ReturnType<typeof check>) =>
    report.problems
      .filter((problem) => problem.kind === 'NO_COLUMN')
      .map((problem) => problem.fieldCode)
  const noteKinds = (report: ReturnType<typeof check>) =>
    report.notes.filter((note) => note.kind === 'ENROLLMENT_DATE_LATER')

  it('tells the person the dates are confirmed after upload, naming the time column', () => {
    const report = check(
      [
        ['First name', 'Timestamp'],
        ['Ana', '2026-01-10 09:30:00'],
      ],
      fields,
      'BENEFICIARY_REGISTRATION',
    )
    expect(missing(report)).toEqual([])
    expect(noteKinds(report).map((note) => note.message)).toEqual([
      "No enrollment date column. You will confirm enrollment dates after upload (proposed from 'Timestamp').",
    ])
    expect(noteKinds(report)[0].fieldCode).toBe('enrollment_date')
  })

  it('words the note without a header when the file has no time column', () => {
    const report = check([['First name'], ['Ana']], fields, 'BENEFICIARY_REGISTRATION')
    expect(missing(report)).toEqual([])
    expect(noteKinds(report).map((note) => note.message)).toEqual([
      'No enrollment date column. You will confirm enrollment dates after upload.',
    ])
  })

  it('gives no note when the file has an enrollment date column', () => {
    const report = check(
      [
        ['First name', 'Enrollment date'],
        ['Ana', '2026-01-10'],
      ],
      fields,
      'BENEFICIARY_REGISTRATION',
    )
    expect(missing(report)).toEqual([])
    expect(noteKinds(report)).toEqual([])
  })

  it('keeps the missing column problem on any other form type', () => {
    const report = check([['First name'], ['Ana']], fields, 'ACTIVITY_MONITORING')
    expect(missing(report)).toEqual(['enrollment_date'])
    expect(noteKinds(report)).toEqual([])
  })
})
