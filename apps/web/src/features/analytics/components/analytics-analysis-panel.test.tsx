/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SURVEY_CLOSED_PERIOD_MESSAGE, SURVEY_RESTRICTED_MESSAGE } from '../analytics.copy'
import { AnalyticsAnalysisPanel } from './analytics-analysis-panel'

const seen = vi.hoisted(() => ({
  survey: null as Record<string, unknown> | null,
  timeline: null as Record<string, unknown> | null,
  insight: null as Record<string, unknown> | null,
  chart: null as Record<string, unknown> | null,
}))

vi.mock('./project-coverage-map-panel', () => ({
  ProjectCoverageMapPanel: () => <div data-testid="coverage-map" />,
}))
vi.mock('./survey-analytics-panel', () => ({
  SurveyAnalyticsPanel: (props: Record<string, unknown>) => {
    seen.survey = props
    return (
      <button onClick={props.onRetry as () => void} type="button">
        survey panel
      </button>
    )
  },
}))
vi.mock('./timeline-analytics-panel', () => ({
  TimelineAnalyticsPanel: (props: Record<string, unknown>) => {
    seen.timeline = props
    return (
      <button onClick={props.onRetry as () => void} type="button">
        timeline panel
      </button>
    )
  },
}))
vi.mock('./insight-status', () => ({
  InsightStatus: (props: {
    read: { data: unknown }
    label: string
    children: (data: unknown) => React.ReactNode
  }) => {
    seen.insight = props
    return (
      <div data-testid="insight">
        {props.label}|{props.children(props.read.data)}
      </div>
    )
  },
}))
vi.mock('./participation-breakdown-panel', () => ({
  ParticipationBreakdownPanel: ({ data }: { data: string }) => <span>{`breakdown ${data}`}</span>,
}))
vi.mock('./analytics-charts', () => ({
  DescriptiveAnalysisChart: (props: Record<string, unknown>) => {
    seen.chart = props
    return <div data-testid="chart" />
  },
}))

type Props = ComponentProps<typeof AnalyticsAnalysisPanel>
const period = { value: '2026-09', label: 'September 2026', start: '2026-09-01', end: '2026-09-30' }
const retryMapData = vi.fn()
const retrySurvey = vi.fn()
const retryTimeline = vi.fn()
const rows = [
  { id: 'indicator-1', label: 'Reach', value: 1234 },
  { id: 'indicator-2', label: 'Completion', value: 50 },
]
const base = {
  activities: [{ id: 'activity-1' }],
  analysisRows: rows,
  analysisView: 'kpi',
  canReadParticipation: true,
  canReadSurvey: true,
  canReadSurveyTimeline: true,
  mapDataError: '',
  mapDataLoading: false,
  monitoringReadable: true,
  participationRead: { data: 'participants' },
  periodsReadable: true,
  reportingPeriods: [period],
  retryMapData,
  retrySurvey,
  retryTimeline,
  selectedPeriod: period,
  survey: { id: 'survey-data' },
  surveyClosedPeriodRequired: false,
  surveyError: 'survey failed',
  surveyErrorKind: 'period',
  surveyFrozenOnly: false,
  surveyLoading: false,
  surveyPeriods: [period],
  timeline: { id: 'timeline-data' },
  timelineError: 'timeline failed',
  timelineLoading: true,
  visualizationType: 'bar',
}
const show = (overrides: Record<string, unknown> = {}) =>
  render(<AnalyticsAnalysisPanel {...({ ...base, ...overrides } as unknown as Props)} />)
const title = () => screen.getByRole('heading', { level: 2 }).textContent

describe('AnalyticsAnalysisPanel', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    seen.survey = seen.timeline = seen.insight = seen.chart = null
  })

  describe('title', () => {
    it.each([
      ['kpi', 'bar', 'KPI / indicator performance · Bar chart'],
      ['kpi', 'line', 'KPI / indicator performance · Line chart'],
      ['kpi', 'table', 'KPI / indicator performance · Table'],
      ['participation', 'bar', 'Participation patterns · Bar chart'],
      ['survey', 'bar', 'Survey improvement · Bar chart'],
      ['survey', 'table', 'Survey improvement · Table'],
      ['survey', 'line', 'Survey improvement'],
      ['timeline', 'bar', 'Project / activity timeline adherence'],
      ['timeline', 'table', 'Project / activity timeline adherence'],
    ])('in the %s view as %s reads %s', (analysisView, visualizationType, expected) => {
      show({ analysisView, visualizationType })

      expect(title()).toBe(expected)
    })
  })

  describe('map', () => {
    it('shows the coverage map under its own title and description', () => {
      show({ visualizationType: 'map' })

      expect(title()).toBe('Project Coverage Map')
      expect(
        screen.getByText(
          'Projects placed by implementation area. Hover or tap a point for its KPI, progress and SADDD overview.',
        ),
      ).toBeTruthy()
      expect(screen.getByTestId('coverage-map')).toBeTruthy()
      expect(screen.queryByRole('alert')).toBeNull()
      expect(screen.queryByText('Updating project analytics.')).toBeNull()
    })

    it('shows the map whatever the analysis view is', () => {
      show({ analysisView: 'survey', canReadSurvey: false, visualizationType: 'map' })

      expect(screen.getByTestId('coverage-map')).toBeTruthy()
      expect(screen.queryByText(SURVEY_RESTRICTED_MESSAGE)).toBeNull()
    })

    it('has no description and no map outside the map type', () => {
      const { container } = show()

      expect(screen.queryByTestId('coverage-map')).toBeNull()
      expect(screen.queryByText(/^Projects placed by implementation area/)).toBeNull()
      expect(container.querySelectorAll('p')).toHaveLength(0)
    })

    it('says the analytics are updating while they load, ahead of an error', () => {
      show({ visualizationType: 'map', mapDataLoading: true, mapDataError: 'down' })

      expect(screen.getByText('Updating project analytics.').tagName).toBe('OUTPUT')
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('shows the error with a Retry analytics button that reloads', () => {
      show({ visualizationType: 'map', mapDataError: 'down' })

      expect(screen.getByRole('alert').textContent).toContain('down')
      fireEvent.click(screen.getByRole('button', { name: 'Retry analytics' }))
      expect(retryMapData).toHaveBeenCalledTimes(1)
    })
  })

  describe('survey view', () => {
    it('gives a role that cannot read the survey the restricted message', () => {
      show({ analysisView: 'survey', canReadSurvey: false, surveyClosedPeriodRequired: true })

      expect(screen.getByText(SURVEY_RESTRICTED_MESSAGE)).toBeTruthy()
      expect(screen.queryByText(SURVEY_CLOSED_PERIOD_MESSAGE)).toBeNull()
      expect(screen.getByText('Data unavailable')).toBeTruthy()
    })

    it('asks for a closed period when only closed periods are released', () => {
      show({ analysisView: 'survey', surveyClosedPeriodRequired: true })

      expect(screen.getByText(SURVEY_CLOSED_PERIOD_MESSAGE)).toBeTruthy()
      expect(seen.survey).toBeNull()
    })

    it('hands the survey read to the survey panel', () => {
      show({ analysisView: 'survey' })

      expect(seen.survey).toMatchObject({
        activities: base.activities,
        data: base.survey,
        error: 'survey failed',
        errorKind: 'period',
        frozen: false,
        loading: false,
        noUsablePeriod: false,
        periodsReadable: true,
        showChart: true,
      })
      fireEvent.click(screen.getByRole('button', { name: 'survey panel' }))
      expect(retrySurvey).toHaveBeenCalledTimes(1)
    })

    it.each([
      ['frozen', { surveyFrozenOnly: true }, { frozen: true }],
      ['loading', { surveyLoading: true }, { loading: true }],
      ['unreadable periods', { periodsReadable: false }, { periodsReadable: false }],
      ['the table type', { visualizationType: 'table' }, { showChart: false }],
      ['the line type', { visualizationType: 'line' }, { showChart: true }],
      ['periods but no usable one', { surveyPeriods: [] }, { noUsablePeriod: true }],
      ['no periods at all', { reportingPeriods: [], surveyPeriods: [] }, { noUsablePeriod: false }],
    ])('passes %s on', (_name, overrides, expected) => {
      show({ analysisView: 'survey', ...overrides })

      expect(seen.survey).toMatchObject(expected)
    })
  })

  describe('timeline view', () => {
    it('gives a role without the timeline the unavailable message', () => {
      show({ analysisView: 'timeline', canReadSurveyTimeline: false })

      expect(screen.getByText('Timeline adherence is not available for this role.')).toBeTruthy()
      expect(seen.timeline).toBeNull()
    })

    it('hands the timeline read to the timeline panel', () => {
      show({ analysisView: 'timeline' })

      expect(seen.timeline).toMatchObject({
        data: base.timeline,
        error: 'timeline failed',
        loading: true,
      })
      fireEvent.click(screen.getByRole('button', { name: 'timeline panel' }))
      expect(retryTimeline).toHaveBeenCalledTimes(1)
    })
  })

  describe('participation view', () => {
    it('reads the participation breakdown for a role that can', () => {
      show({ analysisView: 'participation' })

      expect(screen.getByTestId('insight').textContent).toBe(
        'Participation patterns|breakdown participants',
      )
      expect(seen.insight?.read).toBe(base.participationRead)
    })

    it('restricts a role that cannot', () => {
      show({ analysisView: 'participation', canReadParticipation: false })

      expect(screen.getByText('Participation patterns are restricted for your role.')).toBeTruthy()
      expect(screen.getByText('Restricted')).toBeTruthy()
      expect(screen.queryByTestId('insight')).toBeNull()
    })
  })

  describe('kpi view', () => {
    it.each([
      [true, 'No active Indicator reporting period is available for this project.', 'None yet'],
      [false, 'Indicator reporting periods are not available for this role.', 'Data unavailable'],
    ])(
      'without a period and readable periods %s explains %s',
      (periodsReadable, description, heading) => {
        show({ periodsReadable, selectedPeriod: undefined })

        expect(screen.getByText(description)).toBeTruthy()
        expect(screen.getByText(heading)).toBeTruthy()
      },
    )

    it.each([
      [true, 'None yet'],
      [false, 'Data unavailable'],
    ])('without rows and a readable monitoring read %s says %s', (monitoringReadable, heading) => {
      show({ analysisRows: [], monitoringReadable })

      expect(screen.getByText('No released values are available for this selection.')).toBeTruthy()
      expect(screen.getByText(heading)).toBeTruthy()
    })

    it('lists the rows in a table with the unit', () => {
      const { container } = show({ visualizationType: 'table' })

      expect(container.querySelector('caption')?.className).toBe('sr-only')
      expect(container.querySelector('caption')?.textContent).toBe('KPI / indicator performance')
      expect(Array.from(container.querySelectorAll('th')).map((cell) => cell.textContent)).toEqual([
        'Project',
        'Value',
      ])
      expect(
        Array.from(container.querySelectorAll('tbody tr')).map((row) => row.textContent),
      ).toEqual([`Reach${(1234).toLocaleString()} %`, 'Completion50 %'])
      expect(seen.chart).toBeNull()
    })

    it.each(['bar', 'line'])('draws the rows as a %s chart', (visualizationType) => {
      show({ visualizationType })

      expect(seen.chart).toEqual({
        rows,
        title: 'KPI / indicator performance',
        type: visualizationType,
        unit: '%',
      })
      expect(screen.queryByRole('table')).toBeNull()
    })

    it('ignores the rows in the other views', () => {
      show({ analysisView: 'timeline', analysisRows: [] })

      expect(screen.queryByText('No released values are available for this selection.')).toBeNull()
    })
  })
})
