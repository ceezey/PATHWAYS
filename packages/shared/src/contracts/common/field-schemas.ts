import { z } from 'zod'

// Field schemas that accept exactly what class-validator 0.14.4 on validator 13.15.26 accepted.

const uuidPattern =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i
const iso8601 =
  /^([+-]?\d{4}(?!\d{2}\b))((-?)((0[1-9]|1[0-2])(\3([12]\d|0[1-9]|3[01]))?|W([0-4]\d|5[0-3])(-?[1-7])?|(00[1-9]|0[1-9]\d|[12]\d{2}|3([0-5]\d|6[1-6])))([T\s]((([01]\d|2[0-3])((:?)[0-5]\d)?|24:?00)([.,]\d+(?!:))?)?(\17[0-5]\d([.,]\d+)?)?([zZ]|([+-])([01]\d|2[0-3]):?([0-5]\d)?)?)?)?$/

const isPresentationSelector = (code: number) => code === 0xfe0e || code === 0xfe0f
const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff

// Length as validator isLength counts it: a surrogate pair or a selector-marked character counts once.
export function validatorLength(value: string): number {
  let length = value.length
  for (let index = 1; index < value.length; index++) {
    const previous = value.charCodeAt(index - 1)
    const code = value.charCodeAt(index)
    if (isPresentationSelector(code) && !isPresentationSelector(previous)) length--
    else if (isLowSurrogate(code) && isHighSurrogate(previous)) length--
  }
  return length
}

// The validator isISO8601 strict check: an ordinal day within its year, or a month and day that exist.
function realCalendarDay(value: string): boolean {
  const ordinal = value.match(/^(\d{4})-?(\d{3})([ T]{1}\.*|$)/)
  if (ordinal) {
    const year = Number(ordinal[1])
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    return Number(ordinal[2]) <= (leap ? 366 : 365)
  }
  const [, year, month, day] = (value.match(/(\d{4})-?(\d{0,2})-?(\d*)/) ?? []).map(Number)
  if (!month || !day) return true
  const date = new Date(`${year}-${`0${month}`.slice(-2)}-${`0${day}`.slice(-2)}`)
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
  )
}

// IsString with Length(min, max).
export const lengthString = (min: number, max: number) =>
  z.string().refine((value) => {
    const length = validatorLength(value)
    return length >= min && length <= max
  }, `must be ${min} to ${max} characters long`)

// IsUUID(): a version 1 to 8 UUID, the nil UUID or the max UUID, in either case.
export const uuidString = z.string().regex(uuidPattern, 'must be a UUID')

// IsDateString(): any ISO 8601 date, week, ordinal or date-time form.
export const isoDateString = z.string().regex(iso8601, 'must be a valid ISO 8601 date string')

// IsDateString({ strict: true }): an ISO 8601 string that also names a real calendar day.
export const strictIsoDateString = isoDateString.refine(
  realCalendarDay,
  'must be a valid ISO 8601 date string',
)

// A string Transform that trimmed the value before the DTO validators ran.
export const trimmedInput = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), schema)

// ArrayUnique: no item appears twice.
export const hasUniqueItems = (values: readonly unknown[]) =>
  values.every((value, index) => values.indexOf(value) === index)
