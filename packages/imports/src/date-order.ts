// Where the year, month and day sit in a text date such as 26/03/15.
export const DATE_ORDERS = ['YMD', 'DMY', 'MDY'] as const
export type DateOrder = (typeof DATE_ORDERS)[number]

export interface ImportDateRule {
  order: DateOrder
  // A two-digit year reads as 20yy unless that is after this year, then as 19yy.
  referenceYear: number
}

const datePattern = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})$/
const isoDate = /^\d{4}-\d{2}-\d{2}$/

/** Reads a text date in the given order as YYYY-MM-DD, or null when it is not a real calendar date. */
export function readDate(text: string, rule: ImportDateRule): string | null {
  const match = datePattern.exec(text.trim())
  if (!match) return null
  const [first, second, third] = [match[1], match[2], match[3]]
  const [year, month, day] =
    rule.order === 'YMD'
      ? [first, second, third]
      : rule.order === 'DMY'
        ? [third, second, first]
        : [third, first, second]
  if ((year.length !== 2 && year.length !== 4) || month.length > 2 || day.length > 2) return null
  let fullYear = Number(year)
  if (year.length === 2) {
    fullYear += 2000
    if (fullYear > rule.referenceYear) fullYear -= 100
  }
  const m = Number(month)
  const d = Number(day)
  const date = new Date(Date.UTC(fullYear, m - 1, d))
  if (date.getUTCFullYear() !== fullYear || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
    return null
  return `${String(fullYear).padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

/** The orders that read every non-ISO text value of a column as a real date; empty when none needs one. */
export function fittingDateOrders(values: readonly unknown[], referenceYear: number): DateOrder[] {
  const texts = values.filter(
    (value): value is string =>
      typeof value === 'string' && value.trim() !== '' && !isoDate.test(value.trim()),
  )
  if (texts.length === 0) return []
  return DATE_ORDERS.filter((order) =>
    texts.every((text) => readDate(text, { order, referenceYear }) !== null),
  )
}
