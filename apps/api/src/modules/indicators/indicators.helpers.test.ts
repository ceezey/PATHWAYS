import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { indicatorIdOrNotFound, monitoringSqlError } from './indicators.helpers'

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

  it.each([
    [{ code: 'P2028' }, 'DATABASE_BUSY'],
    [{ code: 'P2010', meta: { code: '57014' } }, 'DATABASE_BUSY'],
    [{ code: 'P2010', meta: { code: '42883' } }, 'MONITORING_SCHEMA_UNAVAILABLE'],
    [{ code: 'P2010', meta: { code: '42P01' } }, 'MONITORING_SCHEMA_UNAVAILABLE'],
    [{ code: 'P2010', meta: { code: '22023' } }, 'MONITORING_UNSUPPORTED'],
  ])('tells a timeout apart from a schema or input fault for %j', (error, code) => {
    let caught: unknown
    try {
      monitoringSqlError(error)
    } catch (thrown) {
      caught = thrown
    }
    expect(caught).toBeInstanceOf(ServiceUnavailableException)
    expect((caught as ServiceUnavailableException).getResponse()).toMatchObject({ code })
  })

  it('rethrows any other error unchanged', () => {
    const error = new Error('Synthetic driver fault')
    expect(() => monitoringSqlError(error)).toThrow(error)
  })
})

describe('indicatorIdOrNotFound', () => {
  it('lowercases an uppercase indicator id', () => {
    expect(indicatorIdOrNotFound('77000000-0000-4000-8000-00000000000A')).toBe(
      '77000000-0000-4000-8000-00000000000a',
    )
  })

  it('answers 404 for a path segment that is not a UUID', () => {
    expect(() => indicatorIdOrNotFound('not-a-uuid')).toThrow(
      new NotFoundException('Indicator unavailable.'),
    )
  })
})
