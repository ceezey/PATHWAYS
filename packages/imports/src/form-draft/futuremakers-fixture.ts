import type { DraftColumn } from './draft-form'

/** Synthetic 100-row file in the Futuremakers layout; every value derives from the row index. */

const FIRST = ['Ana', 'Liza', 'Mae', 'Faith', 'Grace', 'Joy', 'Mark', 'John', 'Paul']
const LAST = [
  'Reyes',
  'Cruz',
  'Santos',
  'Flores',
  'Mendoza',
  'Ramos',
  'Castro',
  'Garcia',
  'Bautista',
  'Dela Cruz',
]
const WG_HEADERS = [
  'Do you have difficulty seeing, even if wearing glasses?',
  'Do you have difficulty hearing, even if using a hearing aid?',
  'Do you have difficulty walking or climbing steps?',
  'Do you have difficulty remembering or concentrating?',
  'Do you have difficulty (with self-care such as) washing all over or dressing?',
  'Using your usual (customary) language, do you have difficulty communicating, for example understanding or being understood?',
]
const WG = {
  A: 'A. Hindi – Hindi nahihirapan',
  B: 'B. Oo – medyo nahihirapan',
  C: 'C. Oo – Madalas nahihirapan',
  D: 'D. Walang akong kakayahang gawin',
}
// Severe answers each question allows: seeing and walking have no D, self-care has no C.
const WG_SEVERE: Array<Array<'C' | 'D'>> = [['C'], ['C', 'D'], ['C'], ['C', 'D'], ['D'], ['C', 'D']]
const EDUCATION = [
  'E. Junior High School',
  'F. Senior High School',
  'G. Technical and Vocational School',
  'H. University Undergraduate',
  'I. University Graduate',
]
const JOB_SECTORS = [
  'A. construction',
  'B. retail store',
  'C. manufacturing industry',
  'D. BPO',
  'E. fastfood chain',
  'F. Iba pa',
]
const BUSINESS_SECTORS = [
  'B. food business ( including processing)',
  'C. buy and sell',
  'D. RTW',
  'E. reloading business',
  'F. motorcycle repair / repair shop',
  'G. beauty and nail care',
  'H. haircut/rebonding',
  'I. Iba pa',
]
const SKILLS = [
  'A. Welding',
  'B. Electrical installation',
  'C. Plumbing',
  'D. Carpentry',
  'E. Automotive servicing',
  'F. Masonry',
  'G. Cookery',
  'H. Food processing',
  'I. Dressmaking',
  'J. Bartending / hotel and restaurant services',
  'K. Iba pa',
]
const CIVIL = ['A. Single', 'B. Married', 'C. Living-in with Partner', 'E. Separated']
const OTHER_JOBS = ['Fisherman', 'Driver', 'Farmer']
const OTHER_BUSINESSES = ['Printing', 'Reselling']
const REFERENCE_DATE = Date.UTC(2026, 9, 22)
const DAY = 86_400_000

const HEADERS = [
  'orgUnit',
  'enrollmentDate',
  'Consent to the collection and use of your data for the purposes - Futuremaker',
  'Participant ID',
  'Province',
  'Municipality - OU',
  'Barangay',
  'Project Donor/Name',
  'Student ID/Barangay Certificate No',
  'First Name',
  'Middle Name',
  'Last Name',
  'Gender - YEE',
  'Date of Birth',
  'Age',
  'Civil Status',
  'Contact Number',
  'Email Address',
  ...WG_HEADERS,
  'Living With Disability',
  'Are you a past program participant of Plan International?',
  "Is your family a 4P's beneficiary?",
  'What is your highest educational attainment?',
  'Where you employed or started a business in the past?',
  'What sector does your job belongs to?',
  'If other sector, what job?',
  'What sector does your business belongs to?',
  'If other sector, what business?',
  'What technical skills do you wish to learn?',
  'If other technical skills, what specific skills do you want to learn?',
  'What Youth Economic Empowerment Track are you taking with Plan International?  ',
]

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

function completedYears(birth: number, at: number) {
  const b = new Date(birth)
  const a = new Date(at)
  const before =
    a.getUTCMonth() < b.getUTCMonth() ||
    (a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() < b.getUTCDate())
  return a.getUTCFullYear() - b.getUTCFullYear() - (before ? 1 : 0)
}

function buildRow(i: number): unknown[] {
  const enrolled = Date.UTC(2026, 0, 1) + ((i * 37) % 151) * DAY
  // Every sixth row below 96 is 17 at enrollment (16 rows); the rest are 19 or older.
  const minor = i % 6 === 0 && i < 96
  const years = minor ? 17 : 19 + (i % 20)
  const shift = minor ? (i * 3) % 360 : (i * 7) % 300
  const at = new Date(enrolled)
  const birth =
    Date.UTC(at.getUTCFullYear() - years, at.getUTCMonth(), at.getUTCDate()) - shift * DAY
  const first = FIRST[i % FIRST.length]
  const last = LAST[(i * 3) % LAST.length]
  const b = new Date(birth)
  const month = String(b.getUTCMonth() + 1).padStart(2, '0')
  const day = String(b.getUTCDate()).padStart(2, '0')
  const disabled = i % 4 === 1
  const wg = WG_HEADERS.map((_, q) => {
    if (disabled && q === i % 6) return WG[WG_SEVERE[q][i % WG_SEVERE[q].length]]
    return (i + q) % 3 === 0 ? WG.B : WG.A
  })
  const employment = i % 3
  const jobSector = employment === 0 ? JOB_SECTORS[Math.floor(i / 3) % 6] : ''
  const businessSector = employment === 1 ? BUSINESS_SECTORS[Math.floor(i / 3) % 8] : ''
  const skill = SKILLS[(i * 7) % SKILLS.length]
  return [
    i < 40 ? 'OU_A' : i < 70 ? 'OU_B' : 'OU_C',
    isoDay(enrolled),
    true,
    `${first[0]}${last[0]}${month}${day}${b.getUTCFullYear()}`,
    '',
    ['Navotas', 'Catarman', 'Catbalogan'][i % 3],
    '',
    '',
    `NS-${1000 + i}`,
    first,
    LAST[(i + 4) % LAST.length],
    last,
    i % 20 < 12 ? 'A. Babae' : i % 20 < 19 ? 'B. Lalaki' : 'C. Non-binary',
    isoDay(birth),
    completedYears(birth, REFERENCE_DATE),
    CIVIL[i % 4],
    `09${String(170_000_000 + i * 1_234_567).padStart(9, '0')}`,
    `user${i}@example.invalid`,
    ...wg,
    disabled,
    i % 3 === 0,
    i % 2 === 0,
    EDUCATION[i % 5],
    ['A. Nag-trabaho', 'B. Nag-negosyo', 'C. Hindi pa'][employment],
    jobSector,
    jobSector.endsWith('Iba pa') ? OTHER_JOBS[i % 3] : '',
    businessSector,
    businessSector.endsWith('Iba pa') ? OTHER_BUSINESSES[i % 2] : '',
    skill,
    skill.endsWith('Iba pa') ? 'Welding basics' : '',
    i % 2 === 0 ? 'A. Employment Track' : 'B. Entrepreneurship Track',
  ]
}

const columnKey = (index: number) => `column_${String(index + 1).padStart(4, '0')}`

/** Rows are keyed column_0001 to column_0036, as the staged import keys them. */
export function buildFuturemakersFixture() {
  const rows = Array.from({ length: 100 }, (_, i) =>
    Object.fromEntries(buildRow(i).map((value, index) => [columnKey(index), value])),
  )
  return { headers: HEADERS, rows }
}

export function fixtureColumns(fixture = buildFuturemakersFixture()): DraftColumn[] {
  return fixture.headers.map((header, index) => ({
    key: columnKey(index),
    columnIndex: index + 1,
    header,
    values: fixture.rows.map((row) => row[columnKey(index)]),
  }))
}
