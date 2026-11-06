/** Synthetic sheet in the Futuremakers staged layout: a code row, a label row, then rows derived from the row index. */

const STAGE_CODES = ['XXtSj0HEVSk', 'vzTQfNC1OsP', 'dncN8wvE6yq', 'nqDMsGh85wm', 'WQfvrxJemeS']
const STAGE_LABELS = [
  'Consent to the collection and use of data for the purposes',
  'Student ID/Barangay Certificate No - YEE',
  'Pangalan - YEE',
  'Gitnang Pangalan - YEE',
  'Apelyido - YEE',
]
const TOTAL_SCORE = ['sXg6A3ZbPmA', 'Total Score - Futuremaker']

const REGISTRATION = [
  ['enrollmentDate', ''],
  ['Hk3mNp9Qw2s', 'First Name'],
  ['Bv7tRc4Lx8d', 'Last Name'],
  ['Zgi47Dql2Ei', 'Date of Birth'],
  ['Gj5wZa2Yu6e', 'Sex'],
]

// Each stage is taken by the rows its test accepts; Technical and CBED never share a row.
const STAGES: Array<{ code: string; name: string; score: boolean; taken: (i: number) => boolean }> =
  [
    { code: 'y8678aMM8o3', name: 'LST Survey', score: true, taken: (i) => i % 4 !== 3 },
    {
      code: 'rNP4mvl5PFF',
      name: 'Technical Skills Survey',
      score: false,
      taken: (i) => i % 2 === 0,
    },
    { code: 'p7Wcfe1p4lp', name: 'CBED Skills Survey', score: false, taken: (i) => i % 2 === 1 },
    { code: 'TQFHPAzCaeI', name: 'Alumni Survey', score: false, taken: (i) => i % 3 === 0 },
  ]

const day = (i: number, offset: number) =>
  new Date(Date.UTC(2026, 0, 1 + ((i * 7 + offset) % 200))).toISOString().slice(0, 10)

/** Row 1 holds the source codes, row 2 the labels, and the data starts on row 3. */
export function stageFixtureSheet(rows: number): unknown[][] {
  const columns = [
    ...REGISTRATION,
    ...STAGES.flatMap((stage) => [
      [stage.code, stage.name],
      ...STAGE_CODES.map((code, index) => [code, STAGE_LABELS[index]]),
      ...(stage.score ? [TOTAL_SCORE] : []),
    ]),
  ]
  const body = Array.from({ length: rows }, (_, i) => [
    day(i, 0),
    `First${i}`,
    `Last${i}`,
    day(i, 90),
    i % 2 === 0 ? 'A. Babae' : 'B. Lalaki',
    ...STAGES.flatMap((stage, s) => {
      const taken = stage.taken(i)
      return [
        taken ? day(i, 10 * (s + 1)) : '',
        ...STAGE_CODES.map((_, index) => (taken ? `S${s}R${i}C${index}` : '')),
        ...(stage.score ? [taken ? 40 + (i % 50) : ''] : []),
      ]
    }),
  ])
  return [columns.map(([code]) => code), columns.map(([, label]) => label), ...body]
}
