import { ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { monitoringSqlError } from './indicators.helpers'

describe('monitoringSqlError', () => {
  it.each([
    [{ code: 'P2002' }, ConflictException],
    [{ code: 'P2010', meta: { code: '40001' } }, ConflictException],
    [{ code: 'P2010', meta: { code: '42501' } }, ForbiddenException],
    [{ code: 'P2028' }, ServiceUnavailableException],
    [{ code: 'P2010', meta: { code: '57014' } }, ServiceUnavailableException],
  ])('maps %j to its HTTP exception', (error, type) => {
    expect(() => monitoringSqlError(error)).toThrow(type)
  })

  it('rethrows any other error unchanged', () => {
    const error = new Error('Synthetic driver fault')
    expect(() => monitoringSqlError(error)).toThrow(error)
  })
})
