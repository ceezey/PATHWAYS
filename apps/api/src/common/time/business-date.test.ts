import { ServiceUnavailableException } from '@nestjs/common'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { currentBusinessDate } from './business-date'

describe('currentBusinessDate', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('returns the calendar date in the configured business time zone', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-08T16:30:00.000Z'))
    vi.stubEnv('BUSINESS_TIME_ZONE', 'Asia/Manila')
    expect(currentBusinessDate()).toBe('2026-10-09')
    vi.stubEnv('BUSINESS_TIME_ZONE', 'UTC')
    expect(currentBusinessDate()).toBe('2026-10-08')
  })

  it('answers 503 when the business time zone is unusable', () => {
    vi.stubEnv('BUSINESS_TIME_ZONE', 'Not/AZone')
    const error = (() => {
      try {
        return currentBusinessDate()
      } catch (caught) {
        return caught as ServiceUnavailableException
      }
    })()
    expect(error).toBeInstanceOf(ServiceUnavailableException)
    expect((error as ServiceUnavailableException).message).toBe(
      'The configured business time zone is invalid.',
    )
  })
})
