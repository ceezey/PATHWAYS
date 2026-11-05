// Local check of the untracked CCM dummy workbooks: per-header mapping decisions and held-row counts, never cell values.
// Usage: pnpm --filter @pathways/imports run build, then node scripts/check-ccm-workbooks.mjs [workbook.xlsx ...]
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'packages/imports/dist/index.js')
if (!existsSync(dist)) {
  console.error('Build @pathways/imports first: pnpm --filter @pathways/imports run build')
  process.exit(1)
}
const { AUTO_SMART_V2_LIMITS, checkImportFile, matchColumns, readImportFile, smartMatchColumnsV3 } =
  createRequire(import.meta.url)(dist)

// The default registration form of migration 0040, as packages/imports draft-test-support.ts has it.
const SPECS = [
  [
    'registration_operation',
    'Registration operation',
    'SELECT',
    true,
    false,
    ['CREATE', 'LINK', 'UPDATE'],
  ],
  ['beneficiary_code', 'Beneficiary code', 'TEXT', true, true],
  ['subject_type', 'Subject type', 'SELECT', true, false, ['INDIVIDUAL', 'GROUP', 'COMMUNITY']],
  ['display_name', 'Display name', 'TEXT', false, false],
  ['first_name', 'First name', 'TEXT', false, false],
  ['middle_name', 'Middle name', 'TEXT', false, false],
  ['last_name', 'Last name', 'TEXT', false, false],
  [
    'sex',
    'Sex',
    'SELECT',
    false,
    false,
    ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY', 'NOT_SPECIFIED'],
  ],
  ['birth_date', 'Birth date', 'DATE', false, false],
  ['age_at_registration', 'Age at registration', 'INTEGER', false, false],
  [
    'disability_status',
    'Disability status',
    'SELECT',
    false,
    false,
    ['WITH_DISABILITY', 'WITHOUT_DISABILITY', 'NOT_SPECIFIED'],
  ],
  ['location_barangay', 'Barangay', 'TEXT', false, false],
  ['location_city_municipality', 'City or municipality', 'TEXT', false, false],
  ['location_province', 'Province', 'TEXT', false, false],
  ['consent_recorded', 'Participation consent', 'BOOLEAN', true, false],
  ['data_processing_consent_recorded', 'Data processing consent', 'BOOLEAN', true, false],
  ['is_minor', 'Minor status', 'BOOLEAN', false, false],
  ['guardian_consent_recorded', 'Guardian consent', 'BOOLEAN', false, false],
  ['enrollment_date', 'Enrollment date', 'DATE', true, false],
  ['external_identifier_type', 'External identifier namespace', 'TEXT', false, false],
  ['external_identifier_value', 'External identifier value', 'TEXT', false, false],
  [
    'profile_update_fields',
    'Profile fields to update',
    'MULTIPLE_SELECT',
    false,
    false,
    [
      'display_name',
      'first_name',
      'middle_name',
      'last_name',
      'sex',
      'birth_date',
      'age_at_registration',
      'disability_status',
      'location_barangay',
      'location_city_municipality',
      'location_province',
    ],
  ],
]
const FIELDS = SPECS.map(
  ([code, label, dataType, required, metadataKey, allowedValues], index) => ({
    id: `field-${index + 1}`,
    code,
    label,
    dataType,
    required,
    metadataKey,
    ...(allowedValues ? { allowedValues } : {}),
  }),
)
const codeOf = (id) => FIELDS.find((field) => field.id === id)?.code ?? '-'
// A fixed upload date keeps the age checks deterministic.
const UPLOAD_DATE = '2026-10-28'

const docs = join(root, 'docs')
const paths = process.argv.slice(2).length
  ? process.argv.slice(2)
  : existsSync(docs)
    ? readdirSync(docs)
        .filter((name) => name.endsWith('.xlsx'))
        .map((name) => join(docs, name))
    : []
if (paths.length === 0) console.log('No workbooks given and none under docs/.')

for (const path of paths) {
  console.log(`\n== ${basename(path)}`)
  const bytes = readFileSync(path)
  let file
  try {
    file = readImportFile(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      'XLSX',
      null,
    )
  } catch (error) {
    console.log(`refused: ${error.code ?? 'UNREADABLE'}`)
    continue
  }
  console.log(
    `header row ${file.headerRowNumber}, ${file.rows.length} rows, ${file.sourceColumns.length} columns`,
  )
  const decisions = matchColumns(file.sourceColumns, file.rows, FIELDS)
  // V3, the matcher before this branch, on the columns no source code mapped.
  const smart = file.sourceColumns.filter(
    (column) =>
      decisions.find((item) => item.sourceKey === column.key)?.matchReason !==
      'METADATA_SOURCE_NAME',
  )
  const coded = new Set(
    decisions
      .filter((item) => item.matchReason === 'METADATA_SOURCE_NAME')
      .map((item) => codeOf(item.targetFieldId)),
  )
  const v3 = smartMatchColumnsV3(
    smart.map((column) => ({
      key: column.key,
      columnIndex: column.columnIndex,
      header: column.header,
      samples: file.rows.slice(0, AUTO_SMART_V2_LIMITS.sampleRows).map((row) => row[column.key]),
      blank: file.rows.every(
        (row) =>
          row[column.key] === null ||
          row[column.key] === undefined ||
          (typeof row[column.key] === 'string' && row[column.key].trim() === ''),
      ),
    })),
    FIELDS.filter((field) => !coded.has(field.code)),
  )
  const view = (decision) =>
    `${decision.status} ${codeOf(decision.targetFieldId ?? decision.suggestedFieldId)} ${decision.reason}`
  for (const decision of decisions) {
    const header = file.sourceColumns.find((column) => column.key === decision.sourceKey)?.header
    const before = v3.find((item) => item.sourceKey === decision.sourceKey)
    const changed = before && view(before) !== view(decision) ? `   (V3: ${view(before)})` : ''
    console.log(`  ${header} | ${view(decision)}${changed}`)
  }
  const report = checkImportFile({
    file,
    formType: 'BENEFICIARY_REGISTRATION',
    fields: FIELDS,
    uploadDate: UPLOAD_DATE,
  })
  const held = new Map()
  for (const problem of report.problems) {
    if (problem.kind !== 'ROW') console.log(`  ${problem.kind} ${problem.fieldCode}`)
    else held.set(problem.code, (held.get(problem.code) ?? 0) + problem.rowCount)
  }
  console.log(`held rows: ${report.problemRows} of ${report.totalRows}`)
  for (const [reason, rows] of held) console.log(`  ${reason}: ${rows}`)
  for (const note of report.notes)
    console.log(`  note ${note.kind}${note.fieldCode ? ` ${note.fieldCode}` : ''}`)
}
