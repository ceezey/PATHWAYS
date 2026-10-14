/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  api,
  available,
  currentAccess,
  missing,
  resetAnalyticsMocks,
  surveyDefaults,
  zero,
} from '@/test/fixtures/analytics-dashboard-fixtures'

import { AnalyticsDashboard } from './analytics-dashboard'

describe('Analytics dashboard request dependencies', () => {
  beforeEach(() => {
    resetAnalyticsMocks()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('F9 survey and timeline analytics views', () => {
    beforeEach(() => {
      surveyDefaults()
    })

    it('does not add a chart-type suffix to the timeline panel title', async () => {
      api.getTimelineAnalytics.mockResolvedValue({
        contractVersion: 'analytics.descriptive.timeline.v1',
        projectId: 'project-a',
        generatedAt: '2026-09-27T04:00:00.000Z',
        reportingDate: '2026-09-27',
        elapsedPercent: available('50'),
        remainingDays: available('30'),
        overdueDays: zero,
        activityCompletionPercent: available('75'),
        activityOverdueCount: zero,
        milestoneOnTimePercent: available('100'),
      })
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'timeline' } })
      await screen.findByTestId('timeline-analytics')
      expect(screen.queryByText(/timeline adherence · /i)).toBeNull()
    })

    it('shows the loading state while the timeline read is pending', async () => {
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'timeline' } })

      expect(await screen.findByText('Loading timeline analytics')).toBeTruthy()
      expect(screen.queryByText('Loading survey analytics')).toBeNull()
    })

    it('renders timeline metric cards without requiring a reporting period', async () => {
      api.getTimelineAnalytics.mockResolvedValue({
        contractVersion: 'analytics.descriptive.timeline.v1',
        projectId: 'project-a',
        generatedAt: '2026-09-27T04:00:00.000Z',
        reportingDate: '2026-09-27',
        elapsedPercent: available('50'),
        remainingDays: available('30'),
        overdueDays: zero,
        activityCompletionPercent: available('75'),
        activityOverdueCount: zero,
        milestoneOnTimePercent: missing('NO_COMPLETED_MILESTONES'),
      })

      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), {
        target: { value: 'timeline' },
      })

      await waitFor(() =>
        expect(api.getTimelineAnalytics).toHaveBeenCalledWith({ projectId: 'project-a' }),
      )
      const panel = await screen.findByTestId('timeline-analytics')
      expect(within(panel).getByText('Elapsed')).toBeTruthy()
      expect(within(panel).getByText('No completed milestones yet')).toBeTruthy()
    })

    it('shows an error state with Retry when timeline analytics fails to load', async () => {
      api.getTimelineAnalytics.mockRejectedValue(
        new Error('Timeline analytics could not be loaded.'),
      )

      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), {
        target: { value: 'timeline' },
      })

      await waitFor(() =>
        expect(screen.getByText('Timeline analytics could not be loaded.')).toBeTruthy(),
      )
      const retry = screen.getByRole('button', { name: /retry/i })
      api.getTimelineAnalytics.mockResolvedValue({
        contractVersion: 'analytics.descriptive.timeline.v1',
        projectId: 'project-a',
        generatedAt: '2026-09-27T04:00:00.000Z',
        reportingDate: '2026-09-27',
        elapsedPercent: available('50'),
        remainingDays: available('30'),
        overdueDays: zero,
        activityCompletionPercent: available('75'),
        activityOverdueCount: zero,
        milestoneOnTimePercent: available('100'),
      })
      fireEvent.click(retry)
      await waitFor(() => expect(api.getTimelineAnalytics).toHaveBeenCalledTimes(2))
      expect(await screen.findByTestId('timeline-analytics')).toBeTruthy()
    })

    it.each([
      ['analytics.descriptive.read', 'monitoring.read'],
      ['monitoring.read', 'analytics.descriptive.read'],
    ])(
      'stops reading the timeline when %s is kept and %s is taken away, and reads again when it returns',
      async (kept, lost) => {
        api.getTimelineAnalytics.mockResolvedValue({
          contractVersion: 'analytics.descriptive.timeline.v1',
          projectId: 'project-a',
          generatedAt: '2026-09-27T04:00:00.000Z',
          reportingDate: '2026-09-27',
          elapsedPercent: available('50'),
          remainingDays: available('30'),
          overdueDays: zero,
          activityCompletionPercent: available('75'),
          activityOverdueCount: zero,
          milestoneOnTimePercent: available('100'),
        })
        const { rerender } = render(<AnalyticsDashboard />)
        await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
        fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'timeline' } })
        await screen.findByTestId('timeline-analytics')
        expect(api.getTimelineAnalytics).toHaveBeenCalledTimes(1)
        expect(currentAccess.profile.permissions).toContain(kept)
        currentAccess.profile.permissions = currentAccess.profile.permissions.filter(
          (permission) => permission !== lost,
        )
        rerender(<AnalyticsDashboard />)
        expect(
          await screen.findByText('Timeline adherence is not available for this role.'),
        ).toBeTruthy()
        expect(screen.queryByTestId('timeline-analytics')).toBeNull()
        expect(api.getTimelineAnalytics).toHaveBeenCalledTimes(1)
        currentAccess.profile.permissions = [...currentAccess.profile.permissions, lost]
        rerender(<AnalyticsDashboard />)
        await waitFor(() => expect(api.getTimelineAnalytics).toHaveBeenCalledTimes(2))
        expect(await screen.findByTestId('timeline-analytics')).toBeTruthy()
      },
    )
  })
})
