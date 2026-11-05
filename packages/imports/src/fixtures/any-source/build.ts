import * as XLSX from 'xlsx'

/** Synthetic source files, one per export shape of cr-pathways-any-source-file-import section 7. */
export type AnySourceFixture =
  | 'masterlist-xlsx'
  | 'masterlist-windows-csv'
  | 'kobo-xlsx'
  | 'odk-csv'
  | 'google-forms-csv'
  | 'bom-semicolon-csv'

// Synthetic people. Consent answers are true or false, the only text a BOOLEAN field reads without a value map.
const PEOPLE = [
  ['MLN-001', 'Ana', 'Peñafiel', 'Female', [25, 12, 2001], 'Hindi', 'San Isidro', ['cooking']],
  ['MLN-002', 'Liza', 'Cruz', 'Female', [3, 4, 1999], 'Oo', 'San Isidro', ['sewing', 'cooking']],
  ['MLN-003', 'Mark', 'Santos', 'Male', [14, 7, 2003], 'Hindi', 'San Isidro', ['welding']],
  ['MLN-004', 'Joy', 'Flores', 'Female', [30, 1, 2000], 'Hindi', 'Poblacion', ['sewing']],
  ['MLN-005', 'Paul', 'Ramos', 'Male', [9, 9, 1998], 'Hindi', 'Poblacion', ['cooking', 'welding']],
] as const

const pad = (value: number) => String(value).padStart(2, '0')
const dayFirst = ([day, month, year]: readonly number[]) => `${pad(day)}/${pad(month)}/${year}`
const iso = ([day, month, year]: readonly number[]) => `${year}-${pad(month)}-${pad(day)}`
const phone = (index: number) => `+63900000000${index + 1}`
const town = 'Bayambang'
const province = 'Pangasinan'

const MASTERLIST_HEADER = [
  'Participant ID',
  'Unang pangalan',
  'Apelyido',
  'Kasarian',
  'Petsa ng kapanganakan',
  'May kapansanan',
  'Cellphone',
  'Barangay',
  'Bayan',
  'Lalawigan',
  'Consent',
  'Data processing consent',
  'Enrollment date',
]

// A merged barangay is written once at the top of its run, as Excel stores it.
const masterlistRows = () =>
  PEOPLE.map(([id, first, last, sex, birth, disability, barangay], index) => [
    id,
    first,
    last,
    sex,
    dayFirst(birth),
    disability,
    phone(index),
    index === 0 || index === 3 ? barangay : null,
    town,
    province,
    true,
    true,
    '15/01/2026',
  ])

// Title, blank and group rows above the header, as a hand-made masterlist has them.
const masterlistMatrix = () => [
  ['Masterlist ng mga Kalahok', ...Array(12).fill(null)],
  Array(13).fill(null),
  ['Personal information', ...Array(6).fill(null), 'Address', null, null, 'Consent', null, null],
  MASTERLIST_HEADER,
  ...masterlistRows(),
]

const KOBO_HEADER = [
  'start',
  'end',
  'participant/participant_id',
  'participant/first_name',
  'participant/last_name',
  'participant/sex',
  'participant/birth_date',
  'participant/disability',
  'location/barangay',
  'location/municipality',
  'location/province',
  'training/training_interests',
  'consent/consent_given',
  'consent/data_processing_consent',
  '_id',
  '_uuid',
  '_submission_time',
  '_validation_status',
  '_index',
]

const koboRows = () =>
  PEOPLE.map(([id, first, last, sex, birth, disability, barangay, interests], index) => [
    `2026-01-10T09:1${index}:00.000+08:00`,
    `2026-01-10T09:2${index}:00.000+08:00`,
    id,
    first,
    last,
    sex.toLowerCase(),
    iso(birth),
    disability === 'Oo' ? 'with_disability' : 'without_disability',
    barangay,
    town,
    province,
    interests.join(' '),
    'true',
    'true',
    String(1000 + index),
    `00000000-0000-4000-8000-00000000000${index + 1}`,
    `2026-01-10T01:2${index}:30`,
    '',
    String(index + 1),
  ])

const ODK_HEADER = [
  'SubmissionDate',
  'start',
  'end',
  'participant-participant_id',
  'participant-first_name',
  'participant-last_name',
  'participant-sex',
  'participant-birth_date',
  'participant-disability',
  'location-barangay',
  'location-municipality',
  'location-province',
  'training-training_interests',
  'consent-consent_given',
  'consent-data_processing_consent',
  'meta-instanceID',
  'KEY',
  'SubmitterID',
  'ReviewState',
]

const odkRows = () =>
  koboRows().map((row, index) => [
    `2026-01-10T01:2${index}:30.000Z`,
    ...row.slice(0, 14),
    `uuid:00000000-0000-4000-8000-00000000000${index + 1}`,
    `uuid:00000000-0000-4000-8000-00000000000${index + 1}`,
    '7',
    '',
  ])

const GOOGLE_HEADER = [
  'Timestamp',
  'Participant ID',
  'First name',
  'Last name',
  'Sex',
  'Date of birth',
  'Do you have a disability?',
  'Barangay',
  'City or municipality',
  'Province',
  'Which trainings would you like to join? (Check all that apply)',
  'Consent',
  'Data processing consent',
]

const TRAINING_LABELS: Record<string, string> = {
  cooking: 'Cooking',
  sewing: 'Sewing',
  welding: 'Welding',
}

const googleRows = () =>
  PEOPLE.map(
    ([id, first, last, sex, [day, month, year], disability, barangay, interests], index) => [
      `2026/01/10 9:1${index}:22 AM GMT+8`,
      id,
      first,
      last,
      sex,
      `${month}/${day}/${year}`,
      disability === 'Oo' ? 'Yes' : 'No',
      barangay,
      town,
      province,
      interests.map((code) => TRAINING_LABELS[code]).join(', '),
      'TRUE',
      'TRUE',
    ],
  )

const BOM_HEADER = [
  'Participant ID',
  'First name',
  'Last name',
  'Sex',
  'Birth date',
  'Disability status',
  'Barangay',
  'City or municipality',
  'Province',
  'Consent',
  'Data processing consent',
  'Enrollment date',
]

const bomRows = () =>
  PEOPLE.map(([id, first, last, sex, birth, disability, barangay]) => [
    id,
    first,
    last,
    sex.toUpperCase(),
    iso(birth),
    disability === 'Oo' ? 'WITH_DISABILITY' : 'WITHOUT_DISABILITY',
    barangay,
    town,
    province,
    'true',
    'true',
    '2026-01-15',
  ])

// Quoted only where needed and CRLF-ended, as Excel and the survey tools write CSV.
const csvCell = (cell: unknown, delimiter: string) => {
  const text = typeof cell === 'boolean' ? String(cell).toUpperCase() : String(cell ?? '')
  return text.includes(delimiter) || text.includes('"') ? `"${text.replace(/"/g, '""')}"` : text
}
const csvText = (rows: readonly (readonly unknown[])[], delimiter = ',') =>
  `${rows.map((row) => row.map((cell) => csvCell(cell, delimiter)).join(delimiter)).join('\r\n')}\r\n`

// Windows-1252 matches Latin-1 for every character the fixtures use.
const windows1252 = (text: string) =>
  Uint8Array.from(text, (character) => {
    const code = character.charCodeAt(0)
    if (code > 0xff || (code >= 0x80 && code < 0xa0)) throw new Error('Not Latin-1')
    return code
  })

const xlsxBytes = (rows: unknown[][], merges: XLSX.Range[] = []) => {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet['!merges'] = merges
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Data')
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}

const range = (row: number, firstColumn: number, lastRow: number, lastColumn: number) => ({
  s: { r: row, c: firstColumn },
  e: { r: lastRow, c: lastColumn },
})

/** Builds one fixture as the bytes its source tool would write. */
export function buildAnySourceFixture(name: AnySourceFixture): {
  bytes: Uint8Array
  fileType: 'XLSX' | 'CSV'
} {
  switch (name) {
    case 'masterlist-xlsx':
      return {
        fileType: 'XLSX',
        bytes: xlsxBytes(masterlistMatrix(), [
          range(0, 0, 0, 12),
          range(2, 0, 2, 6),
          range(2, 7, 2, 9),
          range(2, 10, 2, 12),
          // Barangay H5:H7 and H8:H9.
          range(4, 7, 6, 7),
          range(7, 7, 8, 7),
        ]),
      }
    case 'masterlist-windows-csv':
      return { fileType: 'CSV', bytes: windows1252(csvText(masterlistMatrix())) }
    case 'kobo-xlsx':
      return { fileType: 'XLSX', bytes: xlsxBytes([KOBO_HEADER, ...koboRows()]) }
    case 'odk-csv':
      return {
        fileType: 'CSV',
        bytes: new TextEncoder().encode(csvText([ODK_HEADER, ...odkRows()])),
      }
    case 'google-forms-csv':
      return {
        fileType: 'CSV',
        bytes: new TextEncoder().encode(csvText([GOOGLE_HEADER, ...googleRows()])),
      }
    case 'bom-semicolon-csv':
      return {
        fileType: 'CSV',
        bytes: new TextEncoder().encode(
          String.fromCharCode(0xfeff) + csvText([BOM_HEADER, ...bomRows()], ';'),
        ),
      }
  }
}
