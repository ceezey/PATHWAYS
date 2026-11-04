import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { type CheckField, checkImportFile } from '../../check/file-check'
import { consentHeld } from '../../check/held-rules'
import { readImportFile } from '../../check/read-import-file'
import { type DraftField, draftFormFromImport } from '../../form-draft/draft-form'
import { REGISTRATION } from '../../form-draft/draft-test-support'
import { parseSecureImport } from '../../parser/secure'
import { matchColumns } from '../../validation/match-columns'
import { type ColumnMapping, validateRows } from '../../validation/validate-rows'
import { type AnySourceFixture, buildAnySourceFixture } from './build'

const UPLOAD_DATE = '2026-10-28'

// No survey tool carries an operation or subject type, so the form has the defaults its first draft sets.
const DEFAULTS: Record<string, string> = {
  registration_operation: 'CREATE',
  subject_type: 'INDIVIDUAL',
}
const FORM = [
  ...REGISTRATION.map((field) =>
    DEFAULTS[field.code] ? { ...field, importDefault: DEFAULTS[field.code] } : field,
  ),
  // A multiple choice question, so the Kobo, ODK and Google Forms answers are read too.
  {
    id: 'field-training',
    code: 'training_interests',
    label: 'Training interests',
    dataType: 'MULTIPLE_SELECT',
    required: false,
    metadataKey: false,
    allowedValues: ['COOKING', 'SEWING', 'WELDING'],
  },
] as CheckField[]

// The identity, breakdown and location fields whose matching the corpus pins.
const KEY_FIELDS = [
  'display_name',
  'first_name',
  'last_name',
  'sex',
  'birth_date',
  'age_at_registration',
  'disability_status',
  'location_barangay',
  'location_city_municipality',
  'location_province',
]

const headerNote = 'Headers read from row 4. The rows above it were skipped as titles.'
const sexNote = (header: string) =>
  `No column feeds Sex, so this file adds nothing to the sex breakdown. The file's '${header}' was suggested.`
const disabilityNote = (header: string | null) =>
  `No column feeds Disability status, so this file adds nothing to the disability status breakdown.${header ? ` The file's '${header}' was suggested.` : ''}`

const MASTERLIST_FIELDS = {
  first_name: 'MAPPED',
  last_name: 'MAPPED',
  sex: 'SUGGESTED',
  birth_date: 'MAPPED',
  disability_status: 'SUGGESTED',
  location_barangay: 'MAPPED',
  location_city_municipality: 'MAPPED',
  location_province: 'MAPPED',
}
const ALL_MAPPED = {
  first_name: 'MAPPED',
  last_name: 'MAPPED',
  sex: 'MAPPED',
  birth_date: 'MAPPED',
  location_barangay: 'MAPPED',
  location_city_municipality: 'MAPPED',
  location_province: 'MAPPED',
}
// A Kobo or ODK group path is read by its leaf, which names the field exactly.
const MAPPED_WITH_DISABILITY = { ...ALL_MAPPED, disability_status: 'MAPPED' }
const DISABILITY_MAP = [
  { from: 'Hindi', to: 'WITHOUT_DISABILITY' },
  { from: 'Oo', to: 'WITH_DISABILITY' },
]

interface Expected {
  headerRowNumber: number
  fields: Record<string, string>
  systemColumns: string[]
  notes: string[]
  problems: string[]
  // The fields a form draft from the file adds.
  draft: string[]
  // What a reviewer maps by hand before validating: header to field code, with a value map when needed.
  reviewer: Array<[string, string, Array<{ from: string; to: string }>?]>
  // The second person's normalized values.
  second: Record<string, unknown>
}

const EXPECTED: Record<AnySourceFixture, Expected> = {
  'masterlist-xlsx': {
    headerRowNumber: 4,
    fields: MASTERLIST_FIELDS,
    systemColumns: [],
    notes: [
      headerNote,
      'Merged cells in column H were copied down to rows 5 to 7.',
      'Merged cells in column H were copied down to rows 8 to 9.',
      sexNote('Kasarian'),
      disabilityNote('May kapansanan'),
    ],
    problems: [],
    draft: ['cellphone'],
    reviewer: [['May kapansanan', 'disability_status', DISABILITY_MAP]],
    second: {
      last_name: 'Cruz',
      sex: 'FEMALE',
      birth_date: '1999-04-03',
      disability_status: 'WITH_DISABILITY',
      location_barangay: 'San Isidro',
      enrollment_date: '2026-01-15',
    },
  },
  'masterlist-windows-csv': {
    headerRowNumber: 4,
    fields: MASTERLIST_FIELDS,
    systemColumns: [],
    notes: [
      headerNote,
      "This CSV was read as Windows text. Check that names look right, for example 'Peñafiel'.",
      sexNote('Kasarian'),
      disabilityNote('May kapansanan'),
    ],
    problems: [],
    draft: ['cellphone'],
    reviewer: [['May kapansanan', 'disability_status', DISABILITY_MAP]],
    // A CSV keeps a merged barangay on its first row only.
    second: { sex: 'FEMALE', birth_date: '1999-04-03', location_barangay: null },
  },
  'kobo-xlsx': {
    headerRowNumber: 1,
    fields: MAPPED_WITH_DISABILITY,
    systemColumns: ['_id', '_uuid', '_index'],
    notes: [],
    problems: ['NO_COLUMN enrollment_date'],
    draft: ['start', 'end', 'submission_time'],
    reviewer: [['_submission_time', 'enrollment_date']],
    second: {
      sex: 'FEMALE',
      birth_date: '1999-04-03',
      training_interests: ['SEWING', 'COOKING'],
      enrollment_date: '2026-01-10',
    },
  },
  'odk-csv': {
    headerRowNumber: 1,
    fields: MAPPED_WITH_DISABILITY,
    systemColumns: ['meta-instanceID', 'KEY'],
    notes: [],
    problems: ['NO_COLUMN enrollment_date'],
    draft: ['submissiondate', 'start', 'end', 'submitterid'],
    reviewer: [['SubmissionDate', 'enrollment_date']],
    second: {
      birth_date: '1999-04-03',
      training_interests: ['SEWING', 'COOKING'],
      enrollment_date: '2026-01-10',
    },
  },
  'google-forms-csv': {
    headerRowNumber: 1,
    fields: ALL_MAPPED,
    systemColumns: [],
    notes: [disabilityNote(null)],
    problems: ['NO_COLUMN enrollment_date'],
    draft: [
      'timestamp',
      'do_you_have_a_disability',
      'which_trainings_would_you_like_to_join_check_all_that_apply',
    ],
    reviewer: [
      ['Timestamp', 'enrollment_date'],
      [
        'Do you have a disability?',
        'disability_status',
        [
          { from: 'No', to: 'WITHOUT_DISABILITY' },
          { from: 'Yes', to: 'WITH_DISABILITY' },
        ],
      ],
      ['Which trainings would you like to join? (Check all that apply)', 'training_interests'],
    ],
    second: {
      birth_date: '1999-04-03',
      disability_status: 'WITH_DISABILITY',
      training_interests: ['SEWING', 'COOKING'],
      enrollment_date: '2026-01-10',
    },
  },
  'bom-semicolon-csv': {
    headerRowNumber: 1,
    fields: MAPPED_WITH_DISABILITY,
    systemColumns: [],
    notes: [],
    problems: [],
    draft: [],
    reviewer: [],
    second: { first_name: 'Liza', sex: 'FEMALE', disability_status: 'WITH_DISABILITY' },
  },
}

const FIXTURES = Object.keys(EXPECTED) as AnySourceFixture[]

async function readBoth(name: AnySourceFixture) {
  const { bytes, fileType } = buildAnySourceFixture(name)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const file = readImportFile(buffer as ArrayBuffer, fileType, null)
  const server = await parseSecureImport(Buffer.from(bytes), fileType)
  return { file, server }
}

const draftedFields = (
  file: ReturnType<typeof readImportFile>,
  decisions: ReturnType<typeof matchColumns>,
) =>
  draftFormFromImport({
    formType: 'BENEFICIARY_REGISTRATION',
    fields: FORM as unknown as DraftField[],
    columns: file.sourceColumns.map((column) => ({
      key: column.key,
      columnIndex: column.columnIndex,
      header: column.header,
      sourceCode: column.sourceCode,
      values: file.rows.map((row) => row[column.key]),
    })),
    decisions,
    uploadDate: UPLOAD_DATE,
  }).summary.addedFields

describe('any-source corpus', () => {
  it.each(FIXTURES)('%s: the browser check reads it as the server does', async (name) => {
    const { file, server } = await readBoth(name)
    expect(file.sourceColumns).toEqual(server.sourceColumns)
    expect(file.rowNumbers).toEqual(server.rows.map((row) => row.sourceRowNumber))
    expect(file.rows).toEqual(server.rows.map((row) => row.values))
    expect([file.headerRowNumber, server.headerRowNumber]).toEqual([
      EXPECTED[name].headerRowNumber,
      EXPECTED[name].headerRowNumber,
    ])
    expect(file.filledMerges).toEqual(server.filledMerges)
    expect(file.encoding).toBe(server.csvEncoding)
  })

  it.each(FIXTURES)('%s: maps, notes, problems and drafts as expected', async (name) => {
    const { file } = await readBoth(name)
    const expected = EXPECTED[name]
    const decisions = matchColumns(file.sourceColumns, file.rows, FORM)
    const headerOf = (key: string) =>
      file.sourceColumns.find((column) => column.key === key)?.header
    const codeOf = (id: string | null) => FORM.find((field) => field.id === id)?.code ?? ''
    const fields: Record<string, string> = {}
    for (const decision of decisions) {
      const code = codeOf(decision.targetFieldId ?? decision.suggestedFieldId)
      if (!KEY_FIELDS.includes(code)) continue
      fields[code] = decision.status === 'MAPPED' ? 'MAPPED' : 'SUGGESTED'
    }
    expect(fields).toEqual(expected.fields)
    expect(
      decisions
        .filter((decision) => decision.reason === 'SYSTEM_COLUMN')
        .map((decision) => headerOf(decision.sourceKey)),
    ).toEqual(expected.systemColumns)

    const report = checkImportFile({
      file,
      formType: 'BENEFICIARY_REGISTRATION',
      fields: FORM,
      uploadDate: UPLOAD_DATE,
    })
    expect(report.notes.map((note) => note.message)).toEqual(expected.notes)
    expect(report.problems.map((problem) => `${problem.kind} ${problem.fieldCode}`)).toEqual(
      expected.problems,
    )
    expect(report.problemRows).toBe(0)
    expect(draftedFields(file, decisions)).toEqual(expected.draft)
  })

  it.each(FIXTURES)(
    "%s: the server validates every row of the reviewer's mapping",
    async (name) => {
      const { server } = await readBoth(name)
      const expected = EXPECTED[name]
      const raws = server.rows.map((row) => row.values)
      const decisions = matchColumns(server.sourceColumns, raws, FORM)
      const targets = new Map<
        string,
        { code: string; valueMap?: Array<{ from: string; to: string }> }
      >()
      for (const decision of decisions) {
        const code = FORM.find(
          (field) => field.id === (decision.targetFieldId ?? decision.suggestedFieldId),
        )?.code
        if (code) targets.set(decision.sourceKey, { code })
      }
      for (const [header, code, valueMap] of expected.reviewer) {
        const key = server.sourceColumns.find((candidate) => candidate.header === header)?.key
        expect(key).toBeDefined()
        targets.set(key as string, { code, valueMap })
      }
      const mapped = FORM.filter((field) =>
        [...targets.values()].some((target) => target.code === field.code),
      )
      const mappings: ColumnMapping[] = [...targets].map(([key, { code, valueMap }]) => ({
        sourceFieldName: key,
        status: 'MAPPED',
        dataType: null,
        valueMap: valueMap ?? null,
        dateOrder: null,
        targetField: {
          code,
          dataType: (FORM.find((field) => field.code === code) as CheckField).dataType,
        },
      }))
      const results = validateRows({
        formType: 'BENEFICIARY_REGISTRATION',
        fields: [...mapped, ...FORM.filter((field) => DEFAULTS[field.code])],
        mappedFields: mapped,
        mappings,
        raws,
        uploadDate: UPLOAD_DATE,
      })
      expect(results.flatMap((result) => result.errors)).toEqual([])
      expect(results.some((result) => consentHeld('BENEFICIARY_REGISTRATION', result))).toBe(false)
      expect(results[1].values).toMatchObject(expected.second)
    },
  )
})
