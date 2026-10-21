/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  api,
  currentAccess,
  indicator,
  insightCalls,
  loadDashboard,
  project,
  resetAnalyticsMocks,
  surveyDefaults,
} from '@/test/fixtures/analytics-dashboard-fixtures'

import { AnalyticsDashboard } from './analytics-dashboard'

const grant = (...permissions: string[]) => {
  currentAccess.profile.permissions = [...currentAccess.profile.permissions, ...permissions]
}
const withoutGrant = (permission: string) => {
  currentAccess.profile.permissions = currentAccess.profile.permissions.filter(
    (candidate) => candidate !== permission,
  )
}
const dated = (start: string, end: string) =>
  api.getProjectsForRole.mockResolvedValue([project('project-a', 'Project A', start, end)])
const ready = () => waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
const closedOnly = [
  'projects.read',
  'monitoring.read',
  'analytics.read',
  'analytics.descriptive.read',
  'reports.indicator.read',
]
const onlyIndicator = (start: string, end: string) =>
  api.getProjectIndicatorValues.mockResolvedValue([indicator('project-a', 'A-ONE', start, end)])

describe('Analytics dashboard grants and date rules that stay in the shell', () => {
  beforeEach(() => {
    resetAnalyticsMocks()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('insight reads', () => {
    it('keeps the budget summary off without the budget grants and names the project', async () => {
      render(<AnalyticsDashboard />)
      await ready()

      expect(insightCalls.budget.at(-1)).toEqual([{ projectId: 'project-a' }, false])
    })

    it('turns the budget summary on with every budget grant', async () => {
      currentAccess.profile.roles = ['PROJECT_MANAGER']
      grant('analytics.descriptive.read', 'budgets.read', 'expenses.read')
      render(<AnalyticsDashboard />)
      await ready()

      expect(insightCalls.budget.at(-1)).toEqual([{ projectId: 'project-a' }, true])
    })

    it('reads the trends in the KPI view and the participation in its own view, for the chosen period', async () => {
      grant(
        'analytics.descriptive.read',
        'journeys.read',
        'beneficiaries.records.read',
        'submissions.write',
      )
      const period = { periodStart: '2026-09-01', periodEnd: '2026-09-30' }
      render(<AnalyticsDashboard />)
      await ready()

      expect(insightCalls.trends.at(-1)).toEqual([{ projectId: 'project-a', ...period }, true])
      expect(insightCalls.participation.at(-1)).toEqual([
        { projectId: 'project-a', ...period },
        false,
      ])

      fireEvent.change(screen.getByLabelText('Analysis view'), {
        target: { value: 'participation' },
      })
      await waitFor(() =>
        expect(insightCalls.participation.at(-1)).toEqual([
          { projectId: 'project-a', ...period },
          true,
        ]),
      )
      expect(insightCalls.trends.at(-1)).toEqual([{ projectId: 'project-a', ...period }, false])
    })
  })

  describe('SADDD', () => {
    it('requests nothing and shows no panel without analytics.saddd.read', async () => {
      withoutGrant('analytics.saddd.read')
      dated('2026-01-01', '2026-12-31')
      render(<AnalyticsDashboard />)
      await ready()

      expect(api.getSadddDashboard).not.toHaveBeenCalled()
      expect(screen.queryByText('SADDD Analysis')).toBeNull()
    })

    it('opens on the day the project starts', async () => {
      dated('2026-09-27', '2026-12-31')
      render(<AnalyticsDashboard />)

      await waitFor(() => expect(api.getSadddDashboard).toHaveBeenCalled())
      expect(screen.queryByText(/SADDD opens when this project starts/)).toBeNull()
    })

    it('waits with a notice and no request until the day after', async () => {
      dated('2026-09-28', '2026-12-31')
      render(<AnalyticsDashboard />)
      await ready()

      expect(await screen.findByText(/SADDD opens when this project starts/)).toBeTruthy()
      expect(api.getSadddDashboard).not.toHaveBeenCalled()
    })

    it('says the counts are to date through the last day of the project and not after it', async () => {
      dated('2026-01-01', '2026-09-27')
      const view = render(<AnalyticsDashboard />)
      expect(await screen.findByText('Counts to date.')).toBeTruthy()
      view.unmount()

      dated('2026-01-01', '2026-09-26')
      render(<AnalyticsDashboard />)
      expect(await screen.findByText('SADDD analysis loaded.')).toBeTruthy()
      expect(screen.queryByText('Counts to date.')).toBeNull()
    })
  })

  describe('survey release for a role that sees closed periods only', () => {
    beforeEach(() => {
      surveyDefaults()
      currentAccess.profile.permissions = [...closedOnly]
    })

    it('asks for a closed period when the period ends today', async () => {
      onlyIndicator('2026-09-01', '2026-09-27')
      render(<AnalyticsDashboard />)
      await ready()
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })

      expect(
        await screen.findByText(
          'Survey results for your role are released after the reporting period closes. Choose a closed period.',
        ),
      ).toBeTruthy()
      expect(api.getSurveyAnalytics).not.toHaveBeenCalled()
    })

    it('reads the survey for a period that ended yesterday', async () => {
      onlyIndicator('2026-09-01', '2026-09-26')
      render(<AnalyticsDashboard />)
      await ready()
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })

      await waitFor(() =>
        expect(api.getSurveyAnalytics).toHaveBeenCalledWith({
          projectId: 'project-a',
          periodStart: '2026-09-01',
          periodEnd: '2026-09-26',
        }),
      )
    })
  })

  describe('survey read after the role loses the grant', () => {
    it('sends no survey request for a project chosen after the grant is gone', async () => {
      surveyDefaults()
      const view = render(<AnalyticsDashboard />)
      await ready()
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })
      await waitFor(() => expect(api.getSurveyAnalytics).toHaveBeenCalled())
      const before = api.getSurveyAnalytics.mock.calls.length

      withoutGrant('analytics.descriptive.read')
      view.rerender(<AnalyticsDashboard />)
      expect(
        await screen.findByText('Survey improvement is restricted for your role.'),
      ).toBeTruthy()
      fireEvent.change(screen.getByLabelText('Project filter'), { target: { value: 'project-b' } })
      await waitFor(() =>
        expect(api.getMonitoringDashboard).toHaveBeenCalledWith(
          expect.objectContaining({ projectId: 'project-b' }),
        ),
      )

      expect(api.getSurveyAnalytics).toHaveBeenCalledTimes(before)
    })
  })

  describe('reporting period of the survey view', () => {
    it('selects a period the survey can use when the chosen period overlaps another', async () => {
      surveyDefaults()
      api.getProjectIndicators.mockResolvedValue([
        indicator('project-a', 'A-SEP', '2026-09-01', '2026-09-30'),
        indicator('project-a', 'A-WIDE', '2026-08-15', '2026-09-15'),
        indicator('project-a', 'A-JUL', '2026-07-01', '2026-07-31'),
      ])
      render(<AnalyticsDashboard />)
      await ready()
      const picker = () => screen.getByLabelText('Reporting period') as HTMLSelectElement
      expect(picker().value).toBe('2026-09-01::2026-09-30')

      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'survey' } })

      await waitFor(() => expect(picker().value).toBe('2026-07-01::2026-07-31'))
    })
  })

  describe('what the filters and the analysis panel take from the grants', () => {
    const optionValues = (label: string) =>
      Array.from((screen.getByLabelText(label) as HTMLSelectElement).options)
        .map((option) => option.value)
        .filter(Boolean)
    const descriptiveOnly = [
      'projects.read',
      'monitoring.read',
      'analytics.read',
      'analytics.descriptive.read',
      'reports.indicator.read',
    ]
    const participationGrants = [
      'analytics.descriptive.read',
      'journeys.read',
      'beneficiaries.records.read',
      'assessments.detail.read',
    ]
    const emptyTitle = (description: string) =>
      screen.getByText(description).previousElementSibling?.textContent

    it.each([
      ['trends but no participation grants', ['analytics.descriptive.read'], 'kpi,survey,timeline'],
      ['descriptive and monitoring only', descriptiveOnly, 'kpi,survey,timeline'],
      ['every participation grant', participationGrants, 'kpi,participation,survey,timeline'],
    ])('lists the views of a role with %s', async (_name, granted, views) => {
      currentAccess.profile.permissions =
        granted === descriptiveOnly
          ? [...granted]
          : [...currentAccess.profile.permissions, ...granted]
      render(<AnalyticsDashboard />)
      await ready()

      expect(optionValues('Analysis view').join(',')).toBe(views)
    })

    it('shows the timeline panel, not the unavailable text, to a role without indicator definitions', async () => {
      currentAccess.profile.permissions = [...descriptiveOnly]
      render(<AnalyticsDashboard />)
      await ready()
      fireEvent.change(screen.getByLabelText('Analysis view'), { target: { value: 'timeline' } })

      expect(await screen.findByText('Loading timeline analytics')).toBeTruthy()
      expect(screen.queryByText('Timeline adherence is not available for this role.')).toBeNull()
    })

    it('restricts the participation view once the role loses a participation grant', async () => {
      grant(...participationGrants)
      const view = render(<AnalyticsDashboard />)
      await ready()
      fireEvent.change(screen.getByLabelText('Analysis view'), {
        target: { value: 'participation' },
      })
      expect(screen.queryByText('Participation patterns are restricted for your role.')).toBeNull()

      withoutGrant('journeys.read')
      view.rerender(<AnalyticsDashboard />)

      expect(
        await screen.findByText('Participation patterns are restricted for your role.'),
      ).toBeTruthy()
    })

    it('says periods are unavailable, not none yet, for a role that reads no indicator source', async () => {
      currentAccess.profile.permissions = ['projects.read', 'monitoring.read', 'analytics.read']
      render(<AnalyticsDashboard />)

      const description = 'Indicator reporting periods are not available for this role.'
      expect(await screen.findByText(description)).toBeTruthy()
      expect(emptyTitle(description)).toBe('Data unavailable')
    })

    it('says none yet when the monitoring read came back without indicators', async () => {
      render(<AnalyticsDashboard />)
      await ready()

      const description = 'No released values are available for this selection.'
      expect(await screen.findByText(description)).toBeTruthy()
      expect(emptyTitle(description)).toBe('None yet')
    })
  })

  describe('map view while the project data has not arrived', () => {
    const wording = 'Indicator reporting periods are not available for this role.'

    it('does not call the periods readable while the project data loads', async () => {
      grant('analytics.descriptive.read')
      api.getActivities.mockReturnValue(new Promise(() => {}))
      const MapsDashboard = await loadDashboard({ maps: true })
      render(<MapsDashboard />)
      await waitFor(() => expect(api.getActivities).toHaveBeenCalled())

      fireEvent.change(screen.getByLabelText('Visualization type'), { target: { value: 'map' } })

      expect(await screen.findByText(wording)).toBeTruthy()
    })

    it('does not call the periods readable after the project data failed', async () => {
      grant('analytics.descriptive.read')
      api.getActivities.mockRejectedValue(new Error('Activities are unavailable.'))
      const MapsDashboard = await loadDashboard({ maps: true })
      render(<MapsDashboard />)
      await screen.findByText('Activities are unavailable.')

      fireEvent.change(screen.getByLabelText('Visualization type'), { target: { value: 'map' } })

      expect(await screen.findByText(wording)).toBeTruthy()
    })
  })
})
