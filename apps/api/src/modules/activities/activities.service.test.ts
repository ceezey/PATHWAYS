import { describe, expect, it } from 'vitest'

import { activityPresentationStatus, activityTransitionAllowed } from './activities.service'

describe('P05 activity lifecycle presentation', () => {
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
