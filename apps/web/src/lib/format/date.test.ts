import { describe, expect, it } from 'vitest'

import { formatCalendarDay, formatDateOrUnavailable } from './date'

const twoDigitDay = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

describe('formatCalendarDay', () => {
  it('formats a calendar day as a medium UTC date', () => {
    expect(formatCalendarDay('2026-01-05')).toBe('Jan 5, 2026')
    expect(formatCalendarDay('2026-12-31')).toBe('Dec 31, 2026')
  })

  it('rolls an impossible day over and throws on a malformed one, as Intl does', () => {
    expect(formatCalendarDay('2026-02-31')).toBe('Mar 3, 2026')
    expect(() => formatCalendarDay('2026-13-01')).toThrow(RangeError)
    expect(() => formatCalendarDay('')).toThrow(RangeError)
  })
})

describe('formatDateOrUnavailable', () => {
  it('formats date-only values and timestamps by their UTC day', () => {
    expect(formatDateOrUnavailable('2026-01-05')).toBe('Jan 5, 2026')
    expect(formatDateOrUnavailable(' 2026-06-18 ')).toBe('Jun 18, 2026')
    expect(formatDateOrUnavailable('2026-06-18T23:30:00-08:00')).toBe('Jun 19, 2026')
    expect(formatDateOrUnavailable('2026-01-05', twoDigitDay)).toBe('Jan 05, 2026')
  })

  it('answers Date unavailable for missing, blank, malformed and impossible dates', () => {
    for (const value of [undefined, null, '', '   ', 'not-a-date', '2026-02-31'])
      expect(formatDateOrUnavailable(value)).toBe('Date unavailable')
  })
})
