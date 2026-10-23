import { describe, expect, it } from 'vitest'

import { excelSerialToIsoDate } from './excel-date'

describe('excelSerialToIsoDate', () => {
  it('converts 1900-system serials to ISO dates', () => {
    expect(excelSerialToIsoDate(39677, false)).toBe('2008-08-17')
    expect(excelSerialToIsoDate(46170, false)).toBe('2026-05-28')
  })

  it('drops the time fraction', () => {
    expect(excelSerialToIsoDate(39677.75, false)).toBe('2008-08-17')
  })

  it('honours the 1904 date system', () => {
    expect(excelSerialToIsoDate(38215, true)).toBe('2008-08-17')
  })

  it('returns null outside 1900-01-01 to 2100-12-31 and for unusable numbers', () => {
    expect(excelSerialToIsoDate(0, false)).toBeNull()
    expect(excelSerialToIsoDate(0.5, false)).toBeNull()
    expect(excelSerialToIsoDate(-5, false)).toBeNull()
    expect(excelSerialToIsoDate(2, false)).toBe('1900-01-01')
    expect(excelSerialToIsoDate(73415, false)).toBe('2100-12-31')
    expect(excelSerialToIsoDate(73416, false)).toBeNull()
    expect(excelSerialToIsoDate(Number.NaN, false)).toBeNull()
    expect(excelSerialToIsoDate(Number.POSITIVE_INFINITY, false)).toBeNull()
  })
})
