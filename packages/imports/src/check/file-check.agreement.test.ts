import { Buffer } from 'node:buffer'

import { isCalculatedRule } from '@pathways/shared'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import type { CoverageField } from '../mappers/coverage'
import { parseSecureImport } from '../parser/secure'
import { matchColumns } from '../validation/match-columns'
import { type ColumnMapping, columnRules, validateRows } from '../validation/validate-rows'
import { type CheckField, checkImportFile } from './file-check'
import { readImportFile } from './read-import-file'

const UPLOAD_DATE = '2026-10-28'

const sorted = (set: Set<number>) => [...set].sort((a, b) => a - b)

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
  field('external_identifier_value', 'Client ID', 'TEXT'),
  field('first_name', 'First name', 'TEXT', { required: true }),
  field('birth_date', 'Birth date', 'DATE'),
  field('age_at_registration', 'Age at registration', 'INTEGER', {
    rule: { kind: 'AGE_CHECK', birthField: 'birth_date', atFields: ['birth_date'] },
  }),
  field('sex', 'Sex', 'SELECT', { allowedValues: ['Female', 'Male'] }),
  field('consent_recorded', 'Consent recorded', 'BOOLEAN'),
  field('data_processing_consent_recorded', 'Data processing consent', 'BOOLEAN'),
]

const HEADER = [
  'Client ID',
  'First name',
  'Birth date',
  'Age at registration',
  'Sex',
  'Consent recorded',
  'Data processing consent',
]
// A person born 2000-01-01 is 26 on the upload date.
const row = (id: string, birth = '2000-01-01', age = 26, sex = 'Female', consent = true) => [
  id,
  'Ana',
  birth,
  age,
  sex,
  true,
  consent,
]

// The server's reading of the file: its parser, matcher with suggestions accepted, validation and consent rule.
async function serverView(bytes: Buffer, fileType: 'XLSX' | 'CSV') {
  const parsed = await parseSecureImport(bytes, fileType)
  const raws = parsed.rows.map((item) => item.values)
  const decisions = matchColumns(
    parsed.sourceColumns,
    raws,
    fields.map((item): CoverageField => ({ ...item, calculated: isCalculatedRule(item.rule) })),
  )
  const mappings: ColumnMapping[] = []
  const mapped: CheckField[] = []
  for (const decision of decisions) {
    const target = fields.find(
      (item) => item.id === (decision.targetFieldId ?? decision.suggestedFieldId),
    )
    if (!target || mapped.includes(target)) continue
    mapped.push(target)
    mappings.push({
      sourceFieldName: decision.sourceKey,
      status: 'MAPPED',
      dataType: null,
      valueMap: null,
      dateOrder: null,
      targetField: { code: target.code, dataType: target.dataType },
    })
  }
  const results = validateRows({
    formType: 'BENEFICIARY_REGISTRATION',
    fields: mapped,
    mappedFields: mapped,
    mappings,
    raws,
    uploadDate: UPLOAD_DATE,
  })
  const rules = columnRules(mappings, raws, 2026)
  const mappedCodes = new Set(mapped.map((item) => item.code))
  const held = new Set<number>()
  const fixedOnLater = new Set<number>()
  results.forEach((result, index) => {
    const number = parsed.rows[index].sourceRowNumber
    for (const error of result.errors) {
      const dataType = fields.find((item) => item.code === error.fieldCode)?.dataType
      const fixedOnce =
        (error.code === 'AMBIGUOUS_DATE' && !rules[error.fieldCode]?.date) ||
        (error.code === 'invalid_value' && dataType === 'SELECT')
      ;(fixedOnce ? fixedOnLater : held).add(number)
    }
    if (
      result.valid &&
      (result.values.consent_recorded !== true ||
        result.values.data_processing_consent_recorded !== true)
    )
      held.add(number)
  })
  const noColumn = fields.filter((item) => item.required && !mappedCodes.has(item.code))
  return { held, fixedOnLater, noColumn: noColumn.map((item) => item.code) }
}

function bothReadings(rows: unknown[][], fileType: 'XLSX' | 'CSV') {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Data')
  const bytes = Buffer.from(
    fileType === 'CSV'
      ? rows.map((cells) => cells.map((cell) => cell ?? '').join(',')).join('\n')
      : XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }),
  )
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
  const report = checkImportFile({
    file: readImportFile(buffer, fileType, null),
    formType: 'BENEFICIARY_REGISTRATION',
    fields,
    uploadDate: UPLOAD_DATE,
  })
  // Every problem here has at most 3 rows, so the example rows are the whole set.
  const reported = new Set<number>()
  for (const problem of report.problems) {
    expect(problem.exampleRows).toHaveLength(problem.rowCount)
    if (problem.kind === 'ROW') for (const number of problem.exampleRows) reported.add(number)
  }
  return { report, reported, server: serverView(bytes, fileType) }
}

async function expectAgreement(rows: unknown[][], fileType: 'XLSX' | 'CSV' = 'XLSX') {
  const { report, reported, server } = bothReadings(rows, fileType)
  const view = await server
  expect(sorted(reported)).toEqual(sorted(view.held))
  expect(report.problemRows).toBe(view.held.size)
  expect(
    report.problems.filter((problem) => problem.kind === 'NO_COLUMN').map((p) => p.fieldCode),
  ).toEqual(view.noColumn)
  return { report, view }
}

describe('file check agrees with the server', () => {
  it('a clean file: nothing held, nothing reported', async () => {
    const { report, view } = await expectAgreement([
      HEADER,
      row('S-1'),
      row('S-2', '1999-05-05', 27, 'Male'),
    ])
    expect(view.held.size).toBe(0)
    expect(report.problems).toEqual([])
  })

  it('birth dates the Age column contradicts are held and reported', async () => {
    // Typed in the wrong order: the dates read as 2008, but the ages say 26 and 27.
    const { view } = await expectAgreement([
      HEADER,
      row('S-1'),
      row('S-2', '2008-08-05'),
      row('S-3', '2008-05-08', 27),
      row('S-4', '2017-08-05'),
    ])
    expect(sorted(view.held)).toEqual([3, 4, 5])
  })

  it('a missing consent is held and reported', async () => {
    const { view } = await expectAgreement([
      HEADER,
      row('S-1'),
      row('S-2', '2000-01-01', 26, 'Female', false),
      [...row('S-3').slice(0, 6), null],
    ])
    expect(sorted(view.held)).toEqual([3, 4])
  })

  it('rows sharing a client ID are held and reported', async () => {
    const { view } = await expectAgreement([
      HEADER,
      row('S-12'),
      row('S-30'),
      row(' S-12 '),
      row('S-31'),
    ])
    expect(sorted(view.held)).toEqual([2, 4])
  })

  it('a renamed required column is reported once and holds no rows', async () => {
    const renamed = HEADER.map((name) => (name === 'First name' ? 'Pangalan' : name))
    const { report, view } = await expectAgreement([renamed, row('S-1'), row('S-2')])
    expect(view.noColumn).toEqual(['first_name'])
    expect(report.problems.map((problem) => problem.kind)).toEqual(['NO_COLUMN'])
  })

  it('unlisted answers only: the server needs a value map, so the check reports nothing', async () => {
    const { report, view } = await expectAgreement([
      HEADER,
      row('S-1', '2000-01-01', 26, 'Other'),
      row('S-2', '2000-01-01', 26, 'Prefer not to say'),
      row('S-3'),
    ])
    expect(view.fixedOnLater.size).toBe(2)
    expect(view.held.size).toBe(0)
    expect(report).toEqual({ totalRows: 3, problemRows: 0, problems: [] })
  })

  it('a CSV with text dates: held and reported alike', async () => {
    const { view } = await expectAgreement(
      [
        HEADER,
        row('S-1', '25/12/2004', 21),
        row('S-2', '13/04/2005', 40),
        row('S-3', '01/02/2000', 26, 'Female', false),
        row('S-1', '05/06/2001', 25),
      ],
      'CSV',
    )
    expect(sorted(view.held)).toEqual([2, 3, 4, 5])
  })
})
