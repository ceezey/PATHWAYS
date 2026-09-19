import { describe, expect, it } from 'vitest'

import { mockActivities } from '@/mocks/pathways/activities'

import {
  activityDueLabel,
  activityNextStep,
  activityProgressTone,
  buildActivityStatusUpdate,
  formatDate,
} from './activity-utils'

describe('activity card presentation helpers', () => {
  it('provides a clear next step for every activity status', () => {
    expect(activityNextStep('Planned')).toBe('Confirm readiness and start delivery')
    expect(activityNextStep('In Progress')).toBe('Record the next progress update')
    expect(activityNextStep('For Review')).toBe('Review the submitted update and proof')
    expect(activityNextStep('Overdue')).toBe('Record a recovery update')
    expect(activityNextStep('Completed')).toBe('Confirm the completed activity record')
  })

  it('keeps overdue and review progress visually distinct', () => {
    expect(activityProgressTone('Overdue', 95)).toBe('danger')
    expect(activityProgressTone('For Review', 70)).toBe('warning')
    expect(activityProgressTone('Completed', 100)).toBe('success')
    expect(activityProgressTone('In Progress', 45)).toBe('info')
  })

  it('makes overdue dates explicit without changing normal due dates', () => {
    expect(activityDueLabel('Overdue', '2026-06-15')).toBe('Overdue since Jun 15, 2026')
    expect(activityDueLabel('In Progress', '2026-08-30')).toBe('Due Aug 30, 2026')
  })

  it('formats date-only and timestamp values without throwing', () => {
    expect(formatDate('2026-06-18')).toBe('Jun 18, 2026')
    expect(formatDate('2026-06-18T14:30:00.000Z')).toBe('Jun 18, 2026')
  })

  it('uses a safe fallback for missing, malformed, or impossible dates', () => {
    expect(formatDate(undefined)).toBe('Date unavailable')
    expect(formatDate(null)).toBe('Date unavailable')
    expect(formatDate('')).toBe('Date unavailable')
    expect(formatDate('not-a-date')).toBe('Date unavailable')
    expect(formatDate('2026-02-31')).toBe('Date unavailable')
    expect(activityDueLabel('Overdue', '')).toBe('Overdue · date unavailable')
    expect(activityDueLabel('In Progress', '')).toBe('Due date unavailable')
  })

  it('builds a one-record status update without changing related activity fields', () => {
    const activity = mockActivities[1]
    if (!activity) {
      throw new Error('Expected activity fixture.')
    }

    const update = buildActivityStatusUpdate(activity, 'Completed')

    expect(update).toEqual({
      assignedTo: activity.assignedTo,
      beneficiariesReached: activity.beneficiariesReached,
      budgetAllocation: activity.budgetAllocation,
      budgetLogged: activity.budgetLogged,
      description: activity.description,
      dueDate: activity.dueDate,
      id: activity.id,
      indicatorIds: activity.indicatorIds,
      journeyStageId: activity.journeyStageId,
      progress: activity.progress,
      projectId: activity.projectId,
      startDate: activity.startDate,
      status: 'Completed',
      targetBeneficiaries: activity.targetBeneficiaries,
      title: activity.title,
    })
    expect(activity.status).toBe('In Progress')
  })
})
