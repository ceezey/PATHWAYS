import { Buffer } from 'node:buffer'

import { isCalculatedRule } from '@pathways/shared'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'

import type { CoverageField } from '../mappers/coverage'
import { parseSecureImport } from '../parser/secure'
import { matchColumns } from '../validation/match-columns'
import {
  type ColumnMapping,
  isSupplied,
  unsuppliedRequired,
  validateRows,
} from '../validation/validate-rows'
import { type CheckField, checkImportFile } from './file-check'
import { consentHeld, dateOrderChoices, fixedOnce } from './held-rules'
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
async function serverView(bytes: Buffer, fileType: 'XLSX' | 'CSV', fields: CheckField[]) {
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
  const mappedCodes = new Set(mapped.map((item) => item.code))
  // As import-validation.service.ts: unmapped fields a default or calculation supplies are validated too.
  const results = validateRows({
    formType: 'BENEFICIARY_REGISTRATION',
    fields: [
      ...mapped,
      ...fields.filter((item) => !mappedCodes.has(item.code) && isSupplied(item, mappedCodes)),
    ],
    mappedFields: mapped,
    mappings,
    raws,
    uploadDate: UPLOAD_DATE,
  })
  const orderChoices = dateOrderChoices(mappings, raws, 2026)
  const held = new Set<number>()
  const fixedOnLater = new Set<number>()
  results.forEach((result, index) => {
    const number = parsed.rows[index].sourceRowNumber
    for (const error of result.errors) {
      const dataType = fields.find((item) => item.code === error.fieldCode)?.dataType
      ;(fixedOnce(error.code, dataType, orderChoices.has(error.fieldCode))
        ? fixedOnLater
        : held
      ).add(number)
    }
    if (consentHeld('BENEFICIARY_REGISTRATION', result)) held.add(number)
  })
  const noColumn = unsuppliedRequired(fields, mappedCodes).map((item) => item.code)
  return { held, fixedOnLater, noColumn, results }
}

function bothReadings(rows: unknown[][], fileType: 'XLSX' | 'CSV', fields: CheckField[]) {
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
  // Every row problem here has at most 3 rows, so the example rows are the whole set.
  const reported = new Set<number>()
  for (const problem of report.problems) {
    if (problem.kind !== 'ROW') continue
    expect(problem.exampleRows).toHaveLength(problem.rowCount)
    for (const number of problem.exampleRows) reported.add(number)
  }
  return { report, reported, server: serverView(bytes, fileType, fields) }
}

async function expectAgreement(
  rows: unknown[][],
  fileType: 'XLSX' | 'CSV' = 'XLSX',
  formFields = fields,
) {
  const { report, reported, server } = bothReadings(rows, fileType, formFields)
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

  it('an unlisted answer of a multiple choice field: reported by neither', async () => {
    const interests = field('interests', 'Interests', 'MULTIPLE_SELECT', {
      allowedValues: ['Reading', 'Sports'],
    })
    const { report, view } = await expectAgreement(
      [
        [...HEADER, 'Interests'],
        [...row('S-1'), '["Reading","Chess"]'],
        [...row('S-2'), '["Sports"]'],
      ],
      'XLSX',
      [...fields, interests],
    )
    expect(view.fixedOnLater.size).toBe(1)
    expect(report.problems).toEqual([])
  })

  it('a text date column several orders fit: excluded by both', async () => {
    // 03/04/2004 and 05/06/2004 fit day first and month first, so the reviewer picks one order.
    const { report, view } = await expectAgreement(
      [HEADER, row('S-1', '03/04/2004', 22), row('S-2', '05/06/2004', 22)],
      'CSV',
    )
    expect(view.fixedOnLater.size).toBe(2)
    expect(view.held.size).toBe(0)
    expect(report.problems).toEqual([])
  })

  it('a text date column no single order fits: reported by both', async () => {
    // 25/12/2004 fits only day first and 12/25/2004 only month first, so no choice is offered and both rows are held.
    const { report, view } = await expectAgreement(
      [HEADER, row('S-1', '25/12/2004', 21), row('S-2', '12/25/2004', 21)],
      'CSV',
    )
    expect(view.fixedOnLater.size).toBe(0)
    expect(sorted(view.held)).toEqual([2, 3])
    expect(report.problemRows).toBe(2)
  })

  it('a column left pending with a suggestion counts as mapped by both', async () => {
    const suggested = HEADER.map((name) => (name === 'First name' ? 'First nme' : name))
    const blankName = row('S-2')
    blankName[1] = ''
    const { report, view } = await expectAgreement([suggested, row('S-1'), blankName])
    expect(view.noColumn).toEqual([])
    expect(sorted(view.held)).toEqual([3])
    expect(report.problems).toMatchObject([{ fieldCode: 'first_name', code: 'required' }])
  })

  it('an unmapped required field with an import default: no missing column, its value validated', async () => {
    const household = field('household_size', 'Household size', 'INTEGER', {
      required: true,
      importDefault: '0',
      minimumValue: 1,
    })
    const { report, view } = await expectAgreement([HEADER, row('S-1'), row('S-2')], 'XLSX', [
      ...fields,
      household,
    ])
    expect(view.noColumn).toEqual([])
    // The default 0 is below the minimum, so every row is held for it.
    expect(sorted(view.held)).toEqual([2, 3])
    expect(view.results[0].errors.map((error) => error.fieldCode)).toEqual(['household_size'])
    expect(report.problems).toMatchObject([{ kind: 'ROW', fieldCode: 'household_size' }])
  })
})
