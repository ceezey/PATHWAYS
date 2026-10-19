import { AlertTriangle, BarChart3, Clock, FolderKanban } from 'lucide-react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DashboardAction } from '@/types/pathways'

import {
  actionWorkflowHref,
  dashboardActivityTarget,
  metricIcons,
  severityTone,
  statusTone,
  trailingYearPeriod,
} from './dashboard.utils'

const action = (label: string, dialogTitle?: string) =>
  ({ id: 'a', label, kind: 'navigate', ...(dialogTitle ? { dialogTitle } : {}) }) as DashboardAction

describe('severityTone', () => {
  it.each([
    ['danger', 'danger'],
    ['warning', 'warning'],
    ['success', 'success'],
    ['info', 'info'],
    ['neutral', 'info'],
    [undefined, 'info'],
  ] as const)('maps %s to %s', (severity, tone) => {
    expect(severityTone(severity)).toBe(tone)
  })
})

describe('statusTone', () => {
  it.each([
    ['danger', 'danger'],
    ['warning', 'warning'],
    ['success', 'success'],
    ['info', 'info'],
    ['neutral', 'neutral'],
    [undefined, 'info'],
  ] as const)('maps %s to %s', (severity, tone) => {
    expect(statusTone(severity)).toBe(tone)
  })
})

describe('metricIcons', () => {
  it('rotates folders, alerts, time and charts', () => {
    expect(metricIcons).toEqual([FolderKanban, AlertTriangle, Clock, BarChart3])
  })
})

describe('actionWorkflowHref', () => {
  it.each([
    ['Approve budget', undefined, '/projects'],
    ['Review Proof', undefined, '/projects'],
    ['Record recommendation', undefined, '/alerts'],
    ['Make a decision', undefined, '/alerts'],
    ['Log outcome', undefined, '/alerts'],
    ['Escalated alert', undefined, '/alerts'],
    ['Flag a risk', undefined, '/alerts'],
    ['View orientation summary', undefined, '/projects'],
    ['Open activity update', undefined, '/projects'],
    ['Something else', undefined, '/projects'],
    ['Open', 'Record outcome', '/alerts'],
    ['Open', 'Review proof', '/projects'],
    ['Open', undefined, '/projects'],
    ['Budget alert', undefined, '/projects'],
    ['Proof of the alert', undefined, '/projects'],
    ['Alert on the proof decision', undefined, '/projects'],
    ['Decision about the activity', undefined, '/alerts'],
    ['Flag the activity', undefined, '/alerts'],
  ])('sends %s with dialog %s to %s', (label, dialogTitle, href) => {
    expect(actionWorkflowHref(action(label, dialogTitle))).toBe(href)
  })
})

describe('dashboardActivityTarget', () => {
  it.each([
    [undefined],
    [''],
    ['/projects/p1'],
    ['/projects/p1/activities'],
    ['/projects/p1/activities/'],
    ['/projects//activities/a1'],
    ['/projects/p1/x/activities/a1'],
    ['/other/p1/activities/a1'],
    ['https://example.test/projects/p1/activities/a1'],
  ])('finds no target in %s', (href) => {
    expect(dashboardActivityTarget(href)).toBeNull()
  })

  it.each([
    ['/projects/p1/activities/a1', undefined, undefined],
    ['/projects/p1/activities/a1?expense=e1', 'e1', undefined],
    ['/projects/p1/activities/a1?review=r1', undefined, 'r1'],
    ['/projects/p1/activities/a1?proof=q1', undefined, 'q1'],
    ['/projects/p1/activities/a1?review=r1&proof=q1', undefined, 'r1'],
    ['/projects/p1/activities/a1?expense=e1&review=r1', 'e1', 'r1'],
    ['/projects/p1/activities/a1?other=x', undefined, undefined],
    ['/projects/p1/activities/a1/more', undefined, undefined],
    ['/projects/p1/activities/a1#top', undefined, undefined],
  ])('reads the ids of %s', (href, expenseId, proofId) => {
    expect(dashboardActivityTarget(href)).toEqual({
      projectId: 'p1',
      activityId: 'a1',
      expenseId,
      proofId,
    })
  })

  it('stops the activity id at a query', () => {
    expect(dashboardActivityTarget('/projects/p1/activities/a1?x=1')?.activityId).toBe('a1')
  })
})

describe('trailingYearPeriod', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    ['2026-09-27T04:00:00.000Z', '2025-09-27', '2026-09-27'],
    ['2026-09-26T17:30:00.000Z', '2025-09-27', '2026-09-27'],
    ['2026-09-26T15:59:59.000Z', '2025-09-26', '2026-09-26'],
    ['2024-03-01T04:00:00.000Z', '2023-03-02', '2024-03-01'],
    ['2026-01-01T00:00:00.000Z', '2025-01-01', '2026-01-01'],
  ])('at %s covers %s to %s', (now, periodStart, periodEnd) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(now))

    expect(trailingYearPeriod()).toEqual({ periodStart, periodEnd })
  })
})
