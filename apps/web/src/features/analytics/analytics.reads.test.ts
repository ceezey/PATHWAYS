import { describe, expect, it, vi } from 'vitest'

import { analyticsAccess } from './analytics.reads'

// The grant check is replaced by a plain list lookup so these cases pin only how the flags combine grants.
vi.mock('@/lib/rbac/policy', () => {
  const has = (profile: { permissions: string[] } | null, permission: string) =>
    Boolean(profile?.permissions.includes(permission))
  return {
    principalHasAtomicPermission: has,
    permissionChecker: (profile: { permissions: string[] } | null) => (permission: string) =>
      has(profile, permission),
  }
})

const profile = (...permissions: string[]) =>
  ({ roles: [], permissions, assignedProjectIds: [] }) as never

// Every grant a flag needs: the flag is true with all of them and false when any one is missing.
const needs: Record<string, string[]> = {
  canReadActivities: ['activities.read'],
  canReadIndicators: ['monitoring.read'],
  canReadIndicatorDefinitions: ['monitoring.read', 'indicators.read'],
  canReadIndicatorValues: ['monitoring.read', 'reports.indicator.read'],
  canReadDescriptive: ['analytics.descriptive.read'],
  canReadSurveyTimeline: ['analytics.descriptive.read', 'monitoring.read'],
  canReadSurvey: ['analytics.descriptive.read', 'monitoring.read'],
  canExportAnalytics: ['analytics.descriptive.read', 'analytics.export'],
  canReadBudgetUtilization: [
    'analytics.descriptive.read',
    'monitoring.read',
    'budgets.read',
    'expenses.read',
  ],
  canReadTrends: ['analytics.descriptive.read', 'monitoring.read', 'indicators.read'],
  canReadParticipation: [
    'analytics.descriptive.read',
    'monitoring.read',
    'journeys.read',
    'beneficiaries.records.read',
    'assessments.detail.read',
  ],
  canReadAlerts: ['alerts.read'],
  canReadSaddd: ['analytics.saddd.read'],
}
const everything = [...new Set(Object.values(needs).flat())]

describe('analyticsAccess', () => {
  it.each(Object.entries(needs))('%s needs exactly its grants', (flag, grants) => {
    const access = analyticsAccess(profile(...grants)) as Record<string, boolean>
    expect(access[flag]).toBe(true)

    for (const missing of grants) {
      const without = analyticsAccess(profile(...grants.filter((grant) => grant !== missing)))
      expect((without as Record<string, boolean>)[flag], `without ${missing}`).toBe(false)
    }
  })

  it('reads the participation grants of a role that submits instead of assessing in detail', () => {
    const grants = [
      ...needs.canReadParticipation.filter((grant) => grant !== 'assessments.detail.read'),
      'submissions.write',
    ]

    expect(analyticsAccess(profile(...grants)).canReadParticipation).toBe(true)
  })

  it('freezes the survey release for a role without assessments.detail.read only', () => {
    expect(analyticsAccess(profile()).surveyFrozenOnly).toBe(true)
    expect(analyticsAccess(profile('assessments.detail.read')).surveyFrozenOnly).toBe(false)
  })

  it('grants nothing without a profile', () => {
    expect(Object.values({ ...analyticsAccess(null), surveyFrozenOnly: false })).not.toContain(true)
  })

  it('grants every flag to a role with every grant, and the survey is not frozen', () => {
    const access = analyticsAccess(profile(...everything)) as Record<string, boolean>

    expect(Object.keys(access).sort()).toEqual([...Object.keys(needs), 'surveyFrozenOnly'].sort())
    expect(access.surveyFrozenOnly).toBe(false)
    expect(
      Object.entries(access).filter(([flag, value]) => flag !== 'surveyFrozenOnly' && !value),
    ).toEqual([])
  })
})
