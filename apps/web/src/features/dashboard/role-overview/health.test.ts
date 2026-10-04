import { describe, expect, it } from 'vitest'
import { greeting, healthOf } from './health'

describe('healthOf', () => {
  it('labels from the highest open alert severity', () => {
    expect(healthOf('ONGOING', { open: 1, maxSeverity: 'CRITICAL' })).toEqual({
      label: 'Critical',
      tone: 'danger',
    })
    expect(healthOf('ONGOING', { open: 2, maxSeverity: 'MEDIUM' })).toEqual({
      label: 'At risk',
      tone: 'warning',
    })
    expect(healthOf('ONGOING', { open: 1, maxSeverity: 'LOW' })).toEqual({
      label: 'On track',
      tone: 'success',
    })
    expect(healthOf('ONGOING', undefined)).toEqual({ label: 'On track', tone: 'success' })
    expect(healthOf('PLANNED', undefined)).toEqual({ label: 'Planned', tone: 'neutral' })
  })
})

describe('greeting', () => {
  it('uses the first name and the time of day', () => {
    expect(greeting(new Date('2026-10-04T01:00:00Z'), 'Ron Perez')).toBe('Good morning, Ron.')
    expect(greeting(new Date('2026-10-04T07:00:00Z'), 'Leah')).toBe('Good afternoon, Leah.')
    expect(greeting(new Date('2026-10-04T12:00:00Z'), '')).toBe('Good evening.')
  })
})
