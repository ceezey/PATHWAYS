import { type DateOrder, readDate } from './date-order'
import { excelSerialToIsoDate } from './parser/excel-date'

// Kobo, ODK and Google Forms name their submission time column differently; the list order is the search order.
export const SUBMISSION_TIME_HEADERS = ['_submission_time', 'SubmissionDate', 'Timestamp'] as const

const MANILA_OFFSET_MS = 8 * 3_600_000
const dateOnly = /^\d{4}-\d{2}-\d{2}$/
const dateTime =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(?:Z|([+-])(\d{2}):?(\d{2})?)?$/i

/** The batch's submission time column: the first header equal to a known one ignoring case, in list order. */
export function submissionTimeColumn(
  headers: readonly { key: string; header: string }[],
): { key: string; header: string } | null {
  for (const name of SUBMISSION_TIME_HEADERS) {
    const found = headers.find(
      (column) => column.header.trim().toLowerCase() === name.toLowerCase(),
    )
    if (found) return found
  }
  return null
}

function isRealDate(iso: string): boolean {
  const time = Date.parse(`${iso}T00:00:00Z`)
  return !Number.isNaN(time) && new Date(time).toISOString().startsWith(iso)
}

/**
 * The enrollment date a submission time proposes, as YYYY-MM-DD in Manila (UTC+8, no daylight saving).
 * A date-only value is kept as written, a time with no zone is UTC, and non-ISO text is Google Forms local time read in `order`.
 */
export function proposedEnrollmentDate(
  value: unknown,
  _header: string,
  order: DateOrder | null,
): string | null {
  if (typeof value === 'number') return excelSerialToIsoDate(value, false)
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (dateOnly.test(text)) return isRealDate(text) ? text : null
  const match = dateTime.exec(text)
  if (match) {
    const zone = match[3] ? `${match[3]}${match[4]}:${match[5] ?? '00'}` : 'Z'
    const time = Date.parse(`${match[1]}T${match[2]}${zone}`)
    return Number.isNaN(time) ? null : new Date(time + MANILA_OFFSET_MS).toISOString().slice(0, 10)
  }
  if (!order) return null
  const referenceYear = new Date(Date.now() + MANILA_OFFSET_MS).getUTCFullYear()
  return readDate(text, { order, referenceYear })
}
