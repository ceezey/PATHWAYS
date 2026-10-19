/* @vitest-environment jsdom */
import type { RuleCondition } from '@pathways/shared'
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBindingChoices } from './use-binding-choices'

const state = vi.hoisted(() => ({ read: vi.fn(), permissions: [] as string[] }))
vi.mock('@/hooks/use-authorized-read', () => ({ useAuthorizedRead: state.read }))
vi.mock('@/hooks/use-permission', () => ({
  usePermission: () => (permission: string) => state.permissions.includes(permission),
}))
vi.mock('@/lib/api/indicators', () => ({ indicatorsClient: {} }))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: {} }))

const row = (metric: string) => ({ metric }) as RuleCondition
const project = '40000000-0000-4000-8000-000000000001'
// The enabled flag each of the three reads was made with, in call order.
const enabled = () => state.read.mock.calls.map((call) => call[4])

afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  state.permissions = []
  state.read.mockImplementation((key: string) => ({
    data:
      key === 'rule-binding-indicators'
        ? [{ id: 'i1', name: 'Indicator one' }]
        : [{ id: 'a1', title: key === 'rule-binding-activities' ? 'Full' : 'Context' }],
  }))
})

describe('useBindingChoices', () => {
  it.each([
    [
      'an indicator metric',
      'INDICATOR_PROGRESS_PERCENT',
      ['activities.read'],
      [true, false, false],
    ],
    [
      'an overdue metric with full activity access',
      'ACTIVITY_OVERDUE_DAYS',
      ['activities.read'],
      [false, true, false],
    ],
    [
      'an overdue metric with both activity grants',
      'ACTIVITY_OVERDUE_DAYS',
      ['activities.read', 'activities.context.read'],
      [false, true, false],
    ],
    [
      'an overdue metric with context access only',
      'ACTIVITY_OVERDUE_DAYS',
      ['activities.context.read'],
      [false, false, true],
    ],
    ['an overdue metric with neither', 'ACTIVITY_OVERDUE_DAYS', [], [false, false, false]],
    ['a project metric', 'PROJECT_REMAINING_DAYS', ['activities.read'], [false, false, false]],
  ])('enables the reads for %s', (_name, metric, permissions, expected) => {
    state.permissions = permissions
    renderHook(() => useBindingChoices(project, [row(metric)]))
    expect(enabled()).toEqual(expected)
  })

  it('reads nothing without a scope project', () => {
    state.permissions = ['activities.read']
    renderHook(() =>
      useBindingChoices(null, [row('INDICATOR_PROGRESS_PERCENT'), row('ACTIVITY_OVERDUE_DAYS')]),
    )
    expect(enabled()).toEqual([false, false, false])
  })

  it('offers the full activity list to a role with activities.read and the context list otherwise', () => {
    state.permissions = ['activities.read', 'activities.context.read']
    const full = renderHook(() => useBindingChoices(project, [row('ACTIVITY_OVERDUE_DAYS')]))
    expect(full.result.current).toEqual({
      indicators: [{ id: 'i1', name: 'Indicator one' }],
      activities: [{ id: 'a1', name: 'Full' }],
    })
    state.permissions = ['activities.context.read']
    const context = renderHook(() => useBindingChoices(project, [row('ACTIVITY_OVERDUE_DAYS')]))
    expect(context.result.current.activities).toEqual([{ id: 'a1', name: 'Context' }])
  })
})
