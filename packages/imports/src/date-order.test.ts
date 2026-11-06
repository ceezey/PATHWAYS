import { describe, expect, it } from 'vitest'

import { fittingDateOrders, readDate } from './date-order'

describe('text dates', () => {
  it('reads each order, two-digit years by the reference year, and refuses unreal dates', () => {
    expect(readDate('26/03/15', { order: 'YMD', referenceYear: 2026 })).toBe('2026-03-15')
    expect(readDate('15.3.2026', { order: 'DMY', referenceYear: 2026 })).toBe('2026-03-15')
    expect(readDate('3-15-26', { order: 'MDY', referenceYear: 2026 })).toBe('2026-03-15')
    expect(readDate('01/02/95', { order: 'DMY', referenceYear: 2026 })).toBe('1995-02-01')
    expect(readDate('31/02/2026', { order: 'DMY', referenceYear: 2026 })).toBeNull()
    expect(readDate('2026/13/01', { order: 'YMD', referenceYear: 2026 })).toBeNull()
    expect(readDate('next week', { order: 'DMY', referenceYear: 2026 })).toBeNull()
  })

  it('reads the date part of a text date that carries a time and zone', () => {
    expect(readDate('2026/01/10 9:15:22 AM GMT+8', { order: 'YMD', referenceYear: 2026 })).toBe(
      '2026-01-10',
    )
    expect(readDate('1/10/2026 14:05', { order: 'MDY', referenceYear: 2026 })).toBe('2026-01-10')
    expect(readDate('2026/01/10T09:15:22Z', { order: 'YMD', referenceYear: 2026 })).toBe(
      '2026-01-10',
    )
    expect(readDate('2026/01/10 25:99', { order: 'YMD', referenceYear: 2026 })).toBeNull()
    expect(readDate('2026/02/31 09:00', { order: 'YMD', referenceYear: 2026 })).toBeNull()
  })

  it('lists only the orders that read every value, ignoring blanks and ISO dates', () => {
    expect(fittingDateOrders(['15/03/2026', '01/02/2026', ''], 2026)).toEqual(['DMY'])
    expect(fittingDateOrders(['26/03/15', '26/05/31'], 2026)).toEqual(['YMD', 'DMY'])
    expect(fittingDateOrders(['01/02/2026'], 2026)).toEqual(['DMY', 'MDY'])
    expect(fittingDateOrders(['2026-03-15', null], 2026)).toEqual([])
    expect(fittingDateOrders(['soon'], 2026)).toEqual([])
  })
})
