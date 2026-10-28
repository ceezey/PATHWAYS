export type DateReading = 'DAY_MONTH_SWAPPED' | 'TYPED_YY_MM_DD'

export interface DateHelp {
  example: { row: number; shown: string | null; read: string } | null
  preferred: 'YYYY-MM-DD, for example 2008-08-17'
  fix: string
  evidence: { reading: DateReading; agreeing: number; of: number } | null
}

const READINGS: readonly DateReading[] = ['DAY_MONTH_SWAPPED', 'TYPED_YY_MM_DD']

const FIX =
  'In Excel or Google Sheets, select the column and set its format to yyyy-mm-dd, or retype the dates in that order if they are wrong.'

// Evidence needs at least this share of the flagged rows to agree.
const MIN_SHARE = 0.8

const realDate = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    : null
}

/** Other ways the person may have meant a stored YYYY-MM-DD date: day and month swapped, or typed YY/MM/DD and stored as MM/DD/YY. */
export function alternativeReadings(
  iso: string,
  uploadYear: number,
): Partial<Record<DateReading, string>> {
  const [year, month, day] = iso.split('-').map(Number)
  const typedYear = 2000 + month > uploadYear ? 1900 + month : 2000 + month
  const swapped = realDate(year, day, month)
  const typed = realDate(typedYear, day, year % 100)
  return {
    ...(swapped && swapped !== iso ? { DAY_MONTH_SWAPPED: swapped } : {}),
    ...(typed ? { TYPED_YY_MM_DD: typed } : {}),
  }
}

/** Explains how the first flagged birth date was read and which other reading makes most flagged rows agree. */
export function dateHelp(input: {
  uploadYear: number
  rows: number[]
  readOf: (row: number) => string | null
  rowNumber: (row: number) => number
  shown: (row: number) => string | null
  agrees: (row: number, iso: string) => boolean
}): DateHelp {
  const { rows, readOf, uploadYear, agrees } = input
  const first = rows.find((row) => readOf(row) !== null)
  let evidence: DateHelp['evidence'] = null
  for (const reading of READINGS) {
    const agreeing = rows.filter((row) => {
      const read = readOf(row)
      const alternative = read === null ? undefined : alternativeReadings(read, uploadYear)[reading]
      return alternative !== undefined && agrees(row, alternative)
    }).length
    if (agreeing >= MIN_SHARE * rows.length && agreeing > (evidence?.agreeing ?? 0))
      evidence = { reading, agreeing, of: rows.length }
  }
  return {
    example:
      first === undefined
        ? null
        : { row: input.rowNumber(first), shown: input.shown(first), read: readOf(first) as string },
    preferred: 'YYYY-MM-DD, for example 2008-08-17',
    fix: FIX,
    evidence,
  }
}
