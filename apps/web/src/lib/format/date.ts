const mediumDateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeZone: 'UTC',
})

// Formats a YYYY-MM-DD calendar day as a medium UTC date; a malformed day throws as Intl does.
export const formatCalendarDay = (value: string) =>
  mediumDateFormatter.format(new Date(`${value}T00:00:00.000Z`))

// Formats a date-only or timestamp string, or answers Date unavailable for a blank or impossible date.
export const formatDateOrUnavailable = (
  value: string | null | undefined,
  formatter: Intl.DateTimeFormat = mediumDateFormatter,
) => {
  const normalizedValue = value?.trim()

  if (!normalizedValue) return 'Date unavailable'

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizedValue)
  const date = dateOnlyMatch
    ? new Date(
        Date.UTC(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3])),
      )
    : new Date(normalizedValue)

  const isInvalidDateOnly =
    dateOnlyMatch &&
    (date.getUTCFullYear() !== Number(dateOnlyMatch[1]) ||
      date.getUTCMonth() !== Number(dateOnlyMatch[2]) - 1 ||
      date.getUTCDate() !== Number(dateOnlyMatch[3]))

  if (Number.isNaN(date.getTime()) || isInvalidDateOnly) return 'Date unavailable'

  return formatter.format(date)
}
