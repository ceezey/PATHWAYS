/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  api,
  currentAccess,
  resetAnalyticsMocks,
  surveyDefaults,
  surveyGroup,
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

    const restrictedProfiles = {
      'a Project Officer without analytics.descriptive.read': [
        'projects.read',
        'activities.read',
        'monitoring.read',
        'analytics.read',
      ],
      'a role with analytics.descriptive.read but without monitoring.read': [
        'projects.read',
        'activities.read',
        'analytics.read',
        'analytics.descriptive.read',
      ],
    } as const

    describe.each(Object.entries(restrictedProfiles))('for %s', (_label, permissions) => {
      beforeEach(() => {
        currentAccess.profile.permissions = [...permissions]
      })

      it('does not list the survey and timeline options and never fetches them', async () => {
        render(<AnalyticsDashboard />)
        await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalled())
        await screen.findByLabelText('Analysis view')
        for (const name of ['Survey improvement', 'Project / activity timeline adherence']) {
          expect(screen.queryByText(name, { selector: 'option' })).toBeNull()
        }
        expect(api.getSurveyAnalytics).not.toHaveBeenCalled()
        expect(api.getTimelineAnalytics).not.toHaveBeenCalled()
      })

      it.each(['survey', 'timeline'])(
        'does not offer the %s view and renders no restricted or empty-data panel',
        async (view) => {
          render(<AnalyticsDashboard />)
          await waitFor(() => expect(api.getProjectsForRole).toHaveBeenCalled())
          const select = (await screen.findByLabelText('Analysis view')) as HTMLSelectElement
          expect(Array.from(select.options).some((option) => option.value === view)).toBe(false)
          expect(screen.queryByText('Survey improvement is restricted for your role.')).toBeNull()
          expect(
            screen.queryByText('Timeline adherence is not available for this role.'),
          ).toBeNull()
          expect(screen.queryByText('No paired pre/post assessments yet')).toBeNull()
          expect(screen.queryByText('No activities recorded yet')).toBeNull()
          expect(screen.queryByText(/No active reporting period/)).toBeNull()
          expect(screen.queryByText(/No project is available for this filter/)).toBeNull()
          expect(screen.queryByTestId('survey-analytics')).toBeNull()
          expect(screen.queryByTestId('timeline-analytics')).toBeNull()
          expect(api.getSurveyAnalytics).not.toHaveBeenCalled()
          expect(api.getTimelineAnalytics).not.toHaveBeenCalled()
        },
      )
    })

    describe('aggregate-only roles (Program/Grant Manager) without assessments.detail.read', () => {
      beforeEach(() => {
        currentAccess.profile.permissions = [
          'projects.read',
          'monitoring.read',
          'analytics.read',
          'analytics.descriptive.read',
          'analytics.export',
          'reports.indicator.read',
        ]
      })

      const surveyResult = () => ({
        contractVersion: 'analytics.descriptive.survey.v1',
        projectId: 'project-a',
        generatedAt: '2026-09-27T04:00:00.000Z',
        overall: surveyGroup(),
        byActivity: [],
      })

      it('loads the frozen release and shows the caption for a closed period', async () => {
        api.getSurveyAnalytics.mockResolvedValue(surveyResult())
        render(<AnalyticsDashboard />)
        await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
        const survey = screen.getByText('Survey improvement', {
          selector: 'option',
        }) as HTMLOptionElement
        expect(survey.disabled).toBe(false)
        fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
        fireEvent.change(screen.getByLabelText('Reporting period'), {
          target: { value: '2026-08-01::2026-08-31' },
        })
        expect(await screen.findByTestId('survey-analytics')).toBeTruthy()
        expect(
          screen.getByText(
            'Released once for this closed period; figures do not change on later views.',
          ),
        ).toBeTruthy()
        expect(api.getSurveyAnalytics).toHaveBeenCalledWith({
          projectId: 'project-a',
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
        })
      })

      it('shows the closed-period message without calling the survey client for an open period', async () => {
        render(<AnalyticsDashboard />)
        await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
        fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
        expect(
          await screen.findByText(
            'Survey results for your role are released after the reporting period closes. Choose a closed period.',
          ),
        ).toBeTruthy()
        expect(screen.queryByTestId('survey-analytics')).toBeNull()
        expect(api.getSurveyAnalytics).not.toHaveBeenCalled()
      })

      it('maps a 400 on a closed period to the closed-period message', async () => {
        api.getSurveyAnalytics.mockRejectedValue(
          Object.assign(new Error('refused'), { status: 400 }),
        )
        render(<AnalyticsDashboard />)
        await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
        fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
        fireEvent.change(screen.getByLabelText('Reporting period'), {
          target: { value: '2026-08-01::2026-08-31' },
        })
        expect(await screen.findByText(/released after the reporting period closes/)).toBeTruthy()
      })
    })

    describe('detail roles keep the live survey', () => {
      it('loads the survey for the open period without the frozen caption', async () => {
        api.getSurveyAnalytics.mockResolvedValue({
          contractVersion: 'analytics.descriptive.survey.v1',
          projectId: 'project-a',
          generatedAt: '2026-09-27T04:00:00.000Z',
          overall: surveyGroup(),
          byActivity: [],
        })
        render(<AnalyticsDashboard />)
        await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
        fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
        expect(await screen.findByTestId('survey-analytics')).toBeTruthy()
        expect(screen.queryByText(/Released once for this closed period/)).toBeNull()
        expect(api.getSurveyAnalytics).toHaveBeenCalledWith({
          projectId: 'project-a',
          periodStart: '2026-09-01',
          periodEnd: '2026-09-30',
        })
      })
    })

    it('enables survey and timeline for a role holding both analytics.descriptive.read and monitoring.read', async () => {
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      const survey = screen.getByText('Survey improvement', {
        selector: 'option',
      }) as HTMLOptionElement
      const timeline = screen.getByText('Project / activity timeline adherence', {
        selector: 'option',
      }) as HTMLOptionElement
      expect(survey.disabled).toBe(false)
      expect(timeline.disabled).toBe(false)
    })
  })
})
