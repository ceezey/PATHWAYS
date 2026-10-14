/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  api,
  available,
  indicator,
  missing,
  resetAnalyticsMocks,
  suppressed,
  surveyDefaults,
  surveyGroup,
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

    it('renders survey metric cards, chart and per-activity table, with activity titles instead of raw IDs', async () => {
      const activityId = '40000000-0000-4000-8000-000000000099'
      const unknownActivityId = '40000000-0000-4000-8000-0000000000aa'
      api.getActivities.mockResolvedValue([
        { id: activityId, projectId: 'project-a', code: 'A-1', title: 'Community Training' },
      ])
      api.getSurveyAnalytics.mockResolvedValue({
        contractVersion: 'analytics.descriptive.survey.v1',
        projectId: 'project-a',
        generatedAt: '2026-09-27T04:00:00.000Z',
        period: { periodStart: '2026-09-01', periodEnd: '2026-09-30' },
        excludedRecords: 0,
        overall: surveyGroup(),
        byActivity: [
          { ...surveyGroup(), key: activityId, label: activityId, pairs: available('5') },
          {
            ...surveyGroup(),
            key: unknownActivityId,
            label: unknownActivityId,
            pairs: available('2'),
          },
        ],
      })

      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), {
        target: { value: 'survey' },
      })

      await waitFor(() =>
        expect(api.getSurveyAnalytics).toHaveBeenCalledWith({
          projectId: 'project-a',
          periodStart: '2026-09-01',
          periodEnd: '2026-09-30',
        }),
      )
      const panel = await screen.findByTestId('survey-analytics')
      expect(within(panel).getByText('Paired assessments')).toBeTruthy()
      expect(within(panel).getByText('Survey chart')).toBeTruthy()
      expect(within(panel).getByText('Community Training')).toBeTruthy()
      expect(within(panel).getByText('Activity (name unavailable)')).toBeTruthy()
      expect(panel.textContent).not.toMatch(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
      )
    })

    it('labels survey mean pre/post in % and mean change in pp, never %', async () => {
      const activityId = '40000000-0000-4000-8000-000000000099'
      api.getActivities.mockResolvedValue([
        { id: activityId, projectId: 'project-a', code: 'A-1', title: 'Community Training' },
      ])
      api.getSurveyAnalytics.mockResolvedValue({
        contractVersion: 'analytics.descriptive.survey.v1',
        projectId: 'project-a',
        generatedAt: '2026-09-27T04:00:00.000Z',
        period: { periodStart: '2026-09-01', periodEnd: '2026-09-30' },
        excludedRecords: 0,
        overall: surveyGroup({ pairs: available('12') }),
        byActivity: [
          {
            ...surveyGroup({ pairs: available('12') }),
            key: activityId,
            label: activityId,
            meanPre: available('41.5'),
            meanPost: available('63.5'),
            meanChange: available('22.5'),
          },
        ],
      })

      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
      const panel = await screen.findByTestId('survey-analytics')

      // Cards (overall) and the per-activity table.
      expect(within(panel).getAllByText('40%').length).toBeGreaterThan(0)
      expect(within(panel).getAllByText('62%').length).toBeGreaterThan(0)
      expect(within(panel).getAllByText('22pp').length).toBeGreaterThan(0)
      expect(within(panel).getByText('41.5%')).toBeTruthy()
      expect(within(panel).getByText('63.5%')).toBeTruthy()
      expect(within(panel).getByText('22.5pp')).toBeTruthy()
      expect(within(panel).queryByText('22%')).toBeNull()
      expect(within(panel).queryByText('22.5%')).toBeNull()
    })

    it('labels timeline percentages with % and leaves day and count cells unitless', async () => {
      api.getTimelineAnalytics.mockResolvedValue({
        contractVersion: 'analytics.descriptive.timeline.v1',
        projectId: 'project-a',
        generatedAt: '2026-09-27T04:00:00.000Z',
        reportingDate: '2026-09-27',
        elapsedPercent: available('51'),
        remainingDays: available('33'),
        overdueDays: available('4'),
        activityCompletionPercent: available('76'),
        activityOverdueCount: available('3'),
        milestoneOnTimePercent: available('88'),
      })

      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'timeline' } })
      const panel = await screen.findByTestId('timeline-analytics')

      expect(within(panel).getByText('51%')).toBeTruthy()
      expect(within(panel).getByText('76%')).toBeTruthy()
      expect(within(panel).getByText('88%')).toBeTruthy()
      expect(within(panel).getByText('33')).toBeTruthy()
      expect(within(panel).getByText('4')).toBeTruthy()
      expect(within(panel).getByText('3')).toBeTruthy()
      expect(within(panel).queryByText('33%')).toBeNull()
      expect(within(panel).queryByText('4%')).toBeNull()
      expect(within(panel).queryByText('3%')).toBeNull()
    })

    it('shows the suppression label, never a raw count, when survey pairs are suppressed', async () => {
      api.getSurveyAnalytics.mockResolvedValue({
        contractVersion: 'analytics.descriptive.survey.v1',
        projectId: 'project-a',
        generatedAt: '2026-09-27T04:00:00.000Z',
        period: { periodStart: '2026-09-01', periodEnd: '2026-09-30' },
        excludedRecords: 0,
        overall: surveyGroup({
          pairs: suppressed,
          meanPre: suppressed,
          meanPost: suppressed,
          meanChange: suppressed,
          improved: suppressed,
          same: suppressed,
          declined: suppressed,
        }),
        byActivity: [],
      })

      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), {
        target: { value: 'survey' },
      })

      const panel = await screen.findByTestId('survey-analytics')
      expect(within(panel).getAllByText('Suppressed (fewer than 5)').length).toBeGreaterThan(0)
      expect(within(panel).queryByText('Survey chart')).toBeNull()
    })

    it('shows reason-coded guidance, never a fabricated zero, when survey has no paired assessments', async () => {
      api.getSurveyAnalytics.mockResolvedValue({
        contractVersion: 'analytics.descriptive.survey.v1',
        projectId: 'project-a',
        generatedAt: '2026-09-27T04:00:00.000Z',
        period: { periodStart: '2026-09-01', periodEnd: '2026-09-30' },
        excludedRecords: 0,
        overall: surveyGroup({
          pairs: zero,
          meanPre: missing('NO_PAIRED_ASSESSMENTS'),
          meanPost: missing('NO_PAIRED_ASSESSMENTS'),
          meanChange: missing('NO_PAIRED_ASSESSMENTS'),
          improved: missing('NO_PAIRED_ASSESSMENTS'),
          same: missing('NO_PAIRED_ASSESSMENTS'),
          declined: missing('NO_PAIRED_ASSESSMENTS'),
        }),
        byActivity: [],
      })

      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), {
        target: { value: 'survey' },
      })

      const panel = await screen.findByTestId('survey-analytics')
      expect(
        within(panel).getAllByText('No paired pre/post assessments yet').length,
      ).toBeGreaterThan(0)
      expect(within(panel).queryByText('0%')).toBeNull()
    })

    it('shows an error state with Retry when survey analytics fails to load', async () => {
      api.getSurveyAnalytics.mockRejectedValue(new Error('Survey analytics could not be loaded.'))

      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), {
        target: { value: 'survey' },
      })

      await waitFor(() =>
        expect(screen.getByText('Survey analytics could not be loaded.')).toBeTruthy(),
      )
      const retry = screen.getByRole('button', { name: /retry/i })
      api.getSurveyAnalytics.mockResolvedValue({
        contractVersion: 'analytics.descriptive.survey.v1',
        projectId: 'project-a',
        generatedAt: '2026-09-27T04:00:00.000Z',
        period: { periodStart: '2026-09-01', periodEnd: '2026-09-30' },
        excludedRecords: 0,
        overall: surveyGroup(),
        byActivity: [],
      })
      fireEvent.click(retry)
      await waitFor(() => expect(api.getSurveyAnalytics).toHaveBeenCalledTimes(2))
      expect(await screen.findByTestId('survey-analytics')).toBeTruthy()
    })

    it('shows period wording with no Retry when the survey fetch is refused with a 400', async () => {
      api.getSurveyAnalytics.mockRejectedValue(
        Object.assign(new Error('Survey analytics requires exactly one defined period.'), {
          status: 400,
        }),
      )
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
      expect(
        await screen.findByText('This reporting period cannot be used for survey results.'),
      ).toBeTruthy()
      expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
      expect(screen.queryByText('Survey analytics could not be loaded')).toBeNull()
      expect(api.getSurveyAnalytics).toHaveBeenCalledTimes(1)
    })

    it('maps a 403 from the survey fetch to the restricted wording with no Retry', async () => {
      api.getSurveyAnalytics.mockRejectedValue(
        Object.assign(new Error('Survey improvement is restricted for your role.'), {
          status: 403,
        }),
      )
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
      expect(
        await screen.findByText('Survey improvement is restricted for your role.'),
      ).toBeTruthy()
      expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
    })

    it('keeps Retry for a network or 5xx survey failure', async () => {
      api.getSurveyAnalytics.mockRejectedValue(
        Object.assign(new Error('The requested operation could not be completed.'), {
          status: 503,
        }),
      )
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
      await screen.findByText('The requested operation could not be completed.')
      expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
    })

    it('offers only the project defined reporting periods to the survey view', async () => {
      api.getSurveyAnalytics.mockResolvedValue({
        contractVersion: 'analytics.descriptive.survey.v1',
        projectId: 'project-a',
        generatedAt: '2026-09-27T04:00:00.000Z',
        period: { periodStart: '2026-09-01', periodEnd: '2026-09-30' },
        excludedRecords: 0,
        overall: surveyGroup(),
        byActivity: [],
      })
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
      await waitFor(() => expect(api.getSurveyAnalytics).toHaveBeenCalled())
      const period = screen.getByLabelText('Reporting period') as HTMLSelectElement
      const values = [...period.options].map((option) => option.value).filter(Boolean)
      expect(values).toEqual(['2026-09-01::2026-09-30', '2026-08-01::2026-08-31'])
      for (const call of api.getSurveyAnalytics.mock.calls) {
        expect(['2026-09-01', '2026-08-01']).toContain(call[0].periodStart)
      }
    })

    it('hides overlapping periods from the survey period picker only', async () => {
      api.getProjectIndicators.mockImplementation((projectId: string) =>
        Promise.resolve(
          projectId === 'project-a'
            ? [
                indicator('project-a', 'A-SEP', '2026-09-01', '2026-09-30'),
                indicator('project-a', 'A-WIDE', '2026-08-15', '2026-09-15'),
                indicator('project-a', 'A-JUL', '2026-07-01', '2026-07-31'),
              ]
            : [],
        ),
      )
      api.getSurveyAnalytics.mockResolvedValue({
        contractVersion: 'analytics.descriptive.survey.v1',
        projectId: 'project-a',
        generatedAt: '2026-09-27T04:00:00.000Z',
        period: { periodStart: '2026-07-01', periodEnd: '2026-07-31' },
        excludedRecords: 0,
        overall: surveyGroup(),
        byActivity: [],
      })
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      const values = () =>
        [...(screen.getByLabelText('Reporting period') as HTMLSelectElement).options]
          .map((option) => option.value)
          .filter(Boolean)
      expect(values()).toHaveLength(3)
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
      await waitFor(() => expect(values()).toEqual(['2026-07-01::2026-07-31']))
      await waitFor(() => expect(api.getSurveyAnalytics).toHaveBeenCalled())
      for (const call of api.getSurveyAnalytics.mock.calls) {
        expect(call[0].periodStart).toBe('2026-07-01')
      }
    })

    it('keeps the other panels on their period when every period overlaps, and restores it after the survey view', async () => {
      api.getProjectIndicators.mockImplementation((projectId: string) =>
        Promise.resolve(
          projectId === 'project-a'
            ? [
                indicator('project-a', 'A-SEP', '2026-09-01', '2026-09-30'),
                indicator('project-a', 'A-WIDE', '2026-08-15', '2026-09-15'),
              ]
            : [],
        ),
      )
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getDescriptiveAnalytics).toHaveBeenCalled())
      const selected = () => (screen.getByLabelText('Reporting period') as HTMLSelectElement).value
      const before = selected()
      expect(before).not.toBe('')
      const periodCalls = () =>
        api.getDescriptiveAnalytics.mock.calls.map((call) => {
          const query = call[0] as { periodStart: string; periodEnd: string }
          return `${query.periodStart}::${query.periodEnd}`
        })
      expect(new Set(periodCalls())).toEqual(new Set([before]))

      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
      expect(
        await screen.findByText('This reporting period cannot be used for survey results.'),
      ).toBeTruthy()
      expect(api.getSurveyAnalytics).not.toHaveBeenCalled()
      // The descriptive panel keeps its loaded period and never falls back to "None yet".
      expect(new Set(periodCalls())).toEqual(new Set([before]))
      expect(
        screen.queryByText('No active Indicator reporting period is available for this project.'),
      ).toBeNull()

      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'kpi' } })
      await waitFor(() => expect(selected()).toBe(before))
      expect(new Set(periodCalls())).toEqual(new Set([before]))
    })
  })
})
