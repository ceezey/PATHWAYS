import { BadRequestException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'

import {
  activityPresentationStatus,
  activityTransitionAllowed,
  validateActivityDates,
} from './activities.helpers'

describe('activity lifecycle presentation', () => {
  const dueDate = new Date('2026-09-13T00:00:00.000Z')

  it('does not mark a non-terminal activity overdue until the business date passes its due date', () => {
    expect(activityPresentationStatus('NOT_STARTED', dueDate, '2026-09-13')).toEqual({
      overdue: false,
      status: 'Planned',
    })
    expect(activityPresentationStatus('IN_PROGRESS', dueDate, '2026-09-14')).toEqual({
      overdue: true,
      status: 'Overdue',
    })
    expect(activityPresentationStatus('FOR_REVIEW', dueDate, '2026-09-14')).toEqual({
      overdue: true,
      status: 'Overdue',
    })
  })

  it('keeps completed and cancelled activities terminal after the due date', () => {
    expect(activityPresentationStatus('COMPLETED', dueDate, '2026-09-14')).toEqual({
      overdue: false,
      status: 'Completed',
    })
    expect(activityPresentationStatus('CANCELLED', dueDate, '2026-09-14')).toEqual({
      overdue: false,
      status: 'Cancelled',
    })
  })

  it('allows only the explicit manager-driven lifecycle transitions', () => {
    expect(activityTransitionAllowed('NOT_STARTED', 'IN_PROGRESS')).toBe(true)
    expect(activityTransitionAllowed('NOT_STARTED', 'CANCELLED')).toBe(true)
    expect(activityTransitionAllowed('IN_PROGRESS', 'CANCELLED')).toBe(true)
    expect(activityTransitionAllowed('IN_PROGRESS', 'IN_PROGRESS')).toBe(false)
    expect(activityTransitionAllowed('FOR_REVIEW', 'CANCELLED')).toBe(false)
    expect(activityTransitionAllowed('COMPLETED', 'IN_PROGRESS')).toBe(false)
    expect(activityTransitionAllowed('CANCELLED', 'IN_PROGRESS')).toBe(false)
  })
})

describe('activity date validation', () => {
  const project = {
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T00:00:00.000Z'),
  }

  it('accepts dates inside the project and returns no justification', () => {
    expect(validateActivityDates('2026-02-01', '2026-03-01', project)).toBeNull()
  })

  it('rejects an end date before the start date', () => {
    expect(() => validateActivityDates('2026-03-01', '2026-02-01', project)).toThrow(
      'Activity end date must not precede its start date.',
    )
  })

  it('needs a justification outside the project dates and returns it trimmed', () => {
    expect(() => validateActivityDates('2025-12-01', '2026-03-01', project)).toThrow(
      BadRequestException,
    )
    expect(
      validateActivityDates('2025-12-01', '2026-03-01', project, '  Early mobilization  '),
    ).toBe('Early mobilization')
  })

  it('does not bound an activity in a project without dates', () => {
    expect(
      validateActivityDates('2020-01-01', '2030-01-01', { startDate: null, endDate: null }),
    ).toBeNull()
  })
})
