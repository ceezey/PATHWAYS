/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ActivitySummary } from '@/types/pathways'
import type {
  DescriptiveAnalytics,
  SadddDashboard,
  SurveyAnalytics,
  TimelineAnalytics,
} from '@pathways/shared'

import { SURVEY_FROZEN_CAPTION, SURVEY_PERIOD_MESSAGE } from '../analytics.copy'
import { ChartPanel, UnavailableChart } from './chart-panel'
import { DescriptiveStatisticsTable } from './descriptive-statistics-table'
import { OpenAlertsPanel } from './open-alerts-panel'
import { SadddAnalysisPanel } from './saddd-analysis-panel'
import { SurveyAnalyticsPanel } from './survey-analytics-panel'
import { TimelineAnalyticsPanel } from './timeline-analytics-panel'

vi.mock('echarts-for-react', () => ({ default: () => <div>chart</div> }))

const uuid = '11111111-1111-4111-8111-111111111111'
const cell = (value: string) => ({ state: 'AVAILABLE', value, reason: null }) as const
const gap = (state: 'MISSING' | 'SUPPRESSED' | 'NOT_APPLICABLE', reason: string | null = null) =>
  ({ state, value: null, reason }) as const
const zero = { state: 'ZERO', value: '0', reason: null } as const

afterEach(cleanup)

/** Hovers the card so its tooltip opens, then reads the tooltip, the value and the tone class. */
const readCard = (label: string) => {
  const root = screen.getByText(label).closest('.relative') as HTMLElement
  fireEvent.mouseEnter(within(root).getByRole('button'))
  return {
    tip: within(root).getByRole('tooltip').textContent,
    value: root.querySelector('p.tabular-nums')?.textContent,
    tone: /bg-(\w+)-subtle/.exec(root.querySelector('div.h-10')?.className ?? '')?.[1],
  }
}

const readRows = (name: string) =>
  Array.from(screen.getByRole('table', { name }).querySelectorAll('tr'), (tr) =>
    Array.from(tr.children, (node) => node.textContent),
  )

describe('chart panel', () => {
  it('shows the title, the description only when given, and the default unavailable title', () => {
    const { rerender } = render(
      <ChartPanel description="Scoped to the project." title="Cohort">
        body
      </ChartPanel>,
    )
    expect(screen.getByRole('heading', { name: 'Cohort' })).toBeTruthy()
    expect(screen.getByText('Scoped to the project.')).toBeTruthy()
    rerender(<ChartPanel title="Cohort">body</ChartPanel>)
    expect(screen.queryByText('Scoped to the project.')).toBeNull()
    rerender(<UnavailableChart description="Not in this role." />)
    expect(screen.getByText('Data unavailable')).toBeTruthy()
    rerender(<UnavailableChart description="Nothing recorded." title="None yet" />)
    expect(screen.getByText('None yet')).toBeTruthy()
    expect(screen.queryByText('Data unavailable')).toBeNull()
  })
})

describe('descriptive statistics table', () => {
  const data: DescriptiveAnalytics = {
    contractVersion: 'analytics.descriptive.v1',
    projectId: uuid,
    generatedAt: '2026-09-27T04:00:00.000Z',
    monitoringPeriod: {
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      businessTimeZone: 'UTC',
    },
    sadddPeriod: { periodStart: null, periodEnd: null },
    sadddReleaseState: 'RELEASED',
    privacy: {
      threshold: 5,
      complementarySuppression: true,
      source: 'P06_SADDD_RELEASE',
      beneficiaryRows: false,
    },
    counts: [
      { key: 'a', label: 'Activities', metric: cell('4') },
      { key: 'm', label: 'Milestones', metric: gap('SUPPRESSED', 'SMALL_CELL') },
    ],
    distributions: [
      { section: 'SADDD_SEX', key: 'f', label: 'Female', metric: cell('6'), share: '0.6' },
      { section: 'ACTIVITY_STATE', key: 'd', label: 'Completed', metric: cell('2'), share: null },
    ],
    indicatorSummaries: [
      {
        unitLabel: 'people',
        numericKind: 'COUNT',
        indicatorCount: 5,
        reportedCount: 3,
        mean: '12.5',
        minimum: '2',
        maximum: '30',
      },
      {
        unitLabel: null,
        numericKind: null,
        indicatorCount: 1,
        reportedCount: 0,
        mean: null,
        minimum: null,
        maximum: null,
      },
    ],
  }

  it('lists the counts, the distributions with their share and the indicator means', () => {
    render(<DescriptiveStatisticsTable data={data} />)
    expect(readRows('Descriptive counts')).toEqual([
      ['Measure', 'Count'],
      ['Activities', '4'],
      ['Milestones', 'Suppressed'],
    ])
    expect(readRows('Distributions')).toEqual([
      ['Dimension', 'Category', 'Count', 'Share'],
      ['Sex', 'Female', '6', '60.0%'],
      ['Activity state', 'Completed', '2', 'Withheld'],
    ])
    expect(readRows('Indicator means by unit')).toEqual([
      ['Unit', 'Reported', 'Mean', 'Minimum', 'Maximum'],
      ['people', '3/5', '12.5', '2', '30'],
      ['No unit', '0/1', 'None yet', 'None yet', 'None yet'],
    ])
  })

  it('omits the indicator table when no indicator was summarised', () => {
    render(<DescriptiveStatisticsTable data={{ ...data, indicatorSummaries: [] }} />)
    expect(screen.queryByRole('table', { name: 'Indicator means by unit' })).toBeNull()
    expect(screen.getByRole('table', { name: 'Distributions' })).toBeTruthy()
  })
})

describe('timeline analytics panel', () => {
  const data: TimelineAnalytics = {
    contractVersion: 'analytics.descriptive.timeline.v1',
    projectId: uuid,
    generatedAt: '2026-09-27T04:00:00.000Z',
    reportingDate: '2026-09-27',
    elapsedPercent: cell('50'),
    remainingDays: cell('30'),
    overdueDays: cell('3'),
    activityCompletionPercent: cell('75'),
    activityOverdueCount: cell('2'),
    milestoneOnTimePercent: cell('80'),
  }
  const props = { error: '', loading: false, onRetry: vi.fn() }

  it.each([
    [
      'Elapsed',
      'Share of the project period elapsed as of the reporting date; 100% once completed.',
      '50%',
      'info',
    ],
    [
      'Remaining days',
      "Calendar days remaining before the project's recorded end date; 0 once completed.",
      '30',
      'info',
    ],
    [
      'Overdue days',
      "Calendar days past the project's recorded end date; once completed, how late its last activity finished.",
      '3',
      'warning',
    ],
    ['Activity completion', 'Share of in-scope activities marked Completed.', '75%', 'success'],
    [
      'Overdue activities',
      'In-scope activities past their planned end date and not yet Completed.',
      '2',
      'warning',
    ],
    [
      'Milestone on-time',
      'Completed milestones finished on or before their target date.',
      '80%',
      'success',
    ],
  ])('shows the %s card with its tooltip, value and tone', (label, tip, value, tone) => {
    render(<TimelineAnalyticsPanel {...props} data={data} />)
    expect(readCard(label)).toEqual({ tip, value, tone })
  })

  it('keeps the two overdue cards neutral for zero and for an unavailable count', () => {
    render(
      <TimelineAnalyticsPanel
        {...props}
        data={{ ...data, overdueDays: zero, activityOverdueCount: gap('MISSING', 'NO_ACTIVITIES') }}
      />,
    )
    expect(readCard('Overdue days')).toMatchObject({ value: '0', tone: 'info' })
    expect(readCard('Overdue activities').tone).toBe('info')
  })

  it('shows the loading, error and unavailable states', () => {
    const onRetry = vi.fn()
    const { rerender } = render(<TimelineAnalyticsPanel {...props} data={null} loading />)
    expect(screen.getByText('Loading timeline analytics')).toBeTruthy()
    expect(screen.getByText('Loading scoped activity and milestone data.')).toBeTruthy()
    rerender(
      <TimelineAnalyticsPanel {...props} data={null} error="Server said no." onRetry={onRetry} />,
    )
    expect(screen.getByText('Timeline analytics could not be loaded')).toBeTruthy()
    expect(screen.getByText('Server said no.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    rerender(<TimelineAnalyticsPanel {...props} data={null} />)
    expect(screen.getByText('Data unavailable')).toBeTruthy()
    expect(screen.getByText('Timeline adherence is not available for this selection.')).toBeTruthy()
  })

  it('lets loading win over an error and an error win over data', () => {
    const { rerender } = render(
      <TimelineAnalyticsPanel {...props} data={null} error="Server said no." loading />,
    )
    expect(screen.getByText('Loading timeline analytics')).toBeTruthy()
    expect(screen.queryByText('Server said no.')).toBeNull()
    rerender(<TimelineAnalyticsPanel {...props} data={data} error="Server said no." />)
    expect(screen.getByText('Timeline analytics could not be loaded')).toBeTruthy()
    expect(screen.getByText('Server said no.')).toBeTruthy()
    expect(screen.queryByTestId('timeline-analytics')).toBeNull()
  })
})

describe('survey analytics panel', () => {
  const group = (key: string, over: Partial<SurveyAnalytics['overall']> = {}) => ({
    key,
    label: key,
    pairs: cell('12'),
    meanPre: cell('40'),
    meanPost: cell('62'),
    meanChange: cell('22'),
    improved: cell('8'),
    same: cell('3'),
    declined: cell('1'),
    ...over,
  })
  const data: SurveyAnalytics = {
    contractVersion: 'analytics.descriptive.survey.v1',
    projectId: uuid,
    generatedAt: '2026-09-27T04:00:00.000Z',
    period: { periodStart: '2026-09-01', periodEnd: '2026-09-30' },
    excludedRecords: 0,
    overall: group('OVERALL'),
    byActivity: [
      group('act-1', {
        pairs: cell('6'),
        meanPre: cell('30'),
        meanPost: cell('45'),
        meanChange: cell('15'),
        improved: cell('4'),
        same: cell('1'),
        declined: cell('1'),
      }),
      group('gone', {
        pairs: cell('5'),
        meanPre: cell('20'),
        meanPost: cell('25'),
        meanChange: gap('MISSING', 'NO_MEASUREMENT'),
        improved: cell('2'),
        same: cell('2'),
        declined: cell('1'),
      }),
    ],
  }
  const activities = [{ id: 'act-1', title: 'Training day' }] as ActivitySummary[]
  const props: ComponentProps<typeof SurveyAnalyticsPanel> = {
    activities,
    data,
    error: '',
    errorKind: 'retry',
    frozen: false,
    loading: false,
    noUsablePeriod: false,
    onRetry: vi.fn(),
    periodsReadable: true,
    showChart: false,
  }
  const chartCaption = 'Cohort change (all activities) values'

  it.each([
    [
      'Paired assessments',
      'Enrollments with both a PRE_TEST and a POST_TEST in this period.',
      '12',
      'info',
    ],
    ['Mean pre-test', 'Cohort mean normalized pre-test score (0-100).', '40%', 'info'],
    ['Mean post-test', 'Cohort mean normalized post-test score (0-100).', '62%', 'info'],
    [
      'Mean cohort change',
      'Cohort-level change in mean normalized score. Never an individual verdict.',
      '22pp',
      'success',
    ],
  ])('shows the %s card with its tooltip, value and tone', (label, tip, value, tone) => {
    render(<SurveyAnalyticsPanel {...props} />)
    expect(readCard(label)).toEqual({ tip, value, tone })
  })

  it.each([
    [cell('-5.5'), '-5.5pp', 'warning'],
    [cell('0.5'), '0.5pp', 'success'],
    [cell('0'), '0pp', 'success'],
    [zero, '0pp', 'success'],
    [gap('MISSING', 'NO_MEASUREMENT'), 'None yet', 'info'],
  ])('colours the cohort change %# by its sign', (meanChange, value, tone) => {
    render(
      <SurveyAnalyticsPanel
        {...props}
        data={{ ...data, overall: group('OVERALL', { meanChange }) }}
      />,
    )
    expect(readCard('Mean cohort change')).toMatchObject({ value, tone })
  })

  it('lists the cohort and each activity group with a readable name and the right unit', () => {
    render(<SurveyAnalyticsPanel {...props} />)
    expect(readRows('Survey improvement by group')).toEqual([
      ['Group', 'Pairs', 'Mean pre', 'Mean post', 'Mean change', 'Improved', 'Same', 'Declined'],
      ['All activities (cohort change)', '12', '40%', '62%', '22pp', '8', '3', '1'],
      ['Training day', '6', '30%', '45%', '15pp', '4', '1', '1'],
      ['Activity (name unavailable)', '5', '20%', '25%', 'None yet', '2', '2', '1'],
    ])
  })

  it('shows the frozen caption and the chart only when asked', () => {
    const { rerender } = render(<SurveyAnalyticsPanel {...props} />)
    expect(screen.queryByText(SURVEY_FROZEN_CAPTION)).toBeNull()
    expect(screen.queryByText(chartCaption)).toBeNull()
    rerender(<SurveyAnalyticsPanel {...props} frozen showChart />)
    expect(screen.getByText(SURVEY_FROZEN_CAPTION)).toBeTruthy()
    expect(screen.getByText(chartCaption)).toBeTruthy()
  })

  it('replaces the chart with the suppression note for a suppressed cohort', () => {
    const overall = group('OVERALL', { pairs: gap('SUPPRESSED', 'SMALL_CELL') })
    render(<SurveyAnalyticsPanel {...props} data={{ ...data, overall }} showChart />)
    expect(screen.getByText('Suppressed (fewer than 5)', { selector: 'p.text-sm' })).toBeTruthy()
    expect(screen.queryByText(chartCaption)).toBeNull()
  })

  it('replaces the chart with the unavailable reason when the cohort has no pairs', () => {
    const overall = group('OVERALL', {
      pairs: zero,
      meanPre: gap('NOT_APPLICABLE'),
      meanPost: gap('NOT_APPLICABLE'),
      meanChange: gap('NOT_APPLICABLE'),
    })
    render(<SurveyAnalyticsPanel {...props} data={{ ...data, overall }} showChart />)
    expect(screen.getByText('None yet', { selector: 'p.text-base' })).toBeTruthy()
    expect(screen.getAllByText('Not applicable').length).toBeGreaterThan(3)
    expect(screen.queryByText(chartCaption)).toBeNull()
  })

  it('shows the loading state and the retryable error', () => {
    const onRetry = vi.fn()
    const { rerender } = render(<SurveyAnalyticsPanel {...props} data={null} loading />)
    expect(screen.getByText('Loading survey analytics')).toBeTruthy()
    expect(screen.getByText('Loading scoped paired assessment data.')).toBeTruthy()
    rerender(
      <SurveyAnalyticsPanel {...props} data={null} error="Network down." onRetry={onRetry} />,
    )
    expect(screen.getByText('Survey analytics could not be loaded')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows a final error without Retry', () => {
    render(
      <SurveyAnalyticsPanel
        {...props}
        data={null}
        error="Restricted for your role."
        errorKind="restricted"
      />,
    )
    expect(screen.getByText('Data unavailable')).toBeTruthy()
    expect(screen.getByText('Restricted for your role.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('shows a period error as a final error without Retry', () => {
    render(
      <SurveyAnalyticsPanel {...props} data={null} error="Pick a period." errorKind="period" />,
    )
    expect(screen.getByText('Data unavailable')).toBeTruthy()
    expect(screen.getByText('Pick a period.')).toBeTruthy()
    expect(screen.queryByText('Survey analytics could not be loaded')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it.each(['retry', 'restricted'] as const)('lets loading win over a %s error', (errorKind) => {
    render(
      <SurveyAnalyticsPanel
        {...props}
        data={null}
        error="Network down."
        errorKind={errorKind}
        loading
      />,
    )
    expect(screen.getByText('Loading survey analytics')).toBeTruthy()
    expect(screen.queryByText('Network down.')).toBeNull()
  })

  it.each([
    ['retry', 'Survey analytics could not be loaded'],
    ['restricted', 'Data unavailable'],
  ] as const)('lets a %s error win over data and the no usable period flag', (errorKind, title) => {
    render(
      <SurveyAnalyticsPanel
        {...props}
        error="Network down."
        errorKind={errorKind}
        noUsablePeriod
      />,
    )
    expect(screen.getByText(title)).toBeTruthy()
    expect(screen.getByText('Network down.')).toBeTruthy()
    expect(screen.queryByText(SURVEY_PERIOD_MESSAGE)).toBeNull()
    expect(screen.queryByTestId('survey-analytics')).toBeNull()
  })

  it('shows the data, not the no usable period message, when data is present', () => {
    render(<SurveyAnalyticsPanel {...props} noUsablePeriod />)
    expect(screen.getByTestId('survey-analytics')).toBeTruthy()
    expect(screen.queryByText(SURVEY_PERIOD_MESSAGE)).toBeNull()
  })

  it('charts the cohort group, not an activity group', () => {
    render(<SurveyAnalyticsPanel {...props} showChart />)
    expect(readRows('Cohort change (all activities) values')).toEqual([
      ['Improved', '8'],
      ['Same', '3'],
      ['Declined', '1'],
    ])
  })

  it('explains an empty panel by period usability and by role', () => {
    const { rerender } = render(<SurveyAnalyticsPanel {...props} data={null} noUsablePeriod />)
    expect(screen.getByText(SURVEY_PERIOD_MESSAGE)).toBeTruthy()
    rerender(<SurveyAnalyticsPanel {...props} data={null} />)
    expect(screen.getByText('None yet')).toBeTruthy()
    expect(
      screen.getByText('No active Indicator reporting period is available for this project.'),
    ).toBeTruthy()
    rerender(<SurveyAnalyticsPanel {...props} data={null} periodsReadable={false} />)
    expect(screen.getByText('Data unavailable')).toBeTruthy()
    expect(
      screen.getByText('Indicator reporting periods are not available for this role.'),
    ).toBeTruthy()
  })
})

describe('SADDD analysis panel data', () => {
  const bucket = (
    key: string,
    label: string,
    metric: ReturnType<typeof cell> | ReturnType<typeof gap> | typeof zero,
  ) => ({
    key,
    label,
    metric,
  })
  const saddd = {
    sex: [bucket('f', 'Female', cell('12')), bucket('m', 'Male', cell('9'))],
    age: [bucket('a1', '18 to 24', cell('7')), bucket('a2', '25 to 59', gap('SUPPRESSED'))],
    disability: [bucket('d1', 'With disability', cell('6')), bucket('d2', 'Not stated', zero)],
  } as unknown as SadddDashboard
  const props = {
    retrySaddd: vi.fn(),
    saddd,
    sadddEligible: true,
    sadddError: '',
    sadddLoading: false,
    sadddNotice: null,
    sadddOngoing: true,
  }

  it('lists the sex, age and disability rows in that order with the metric cell text', () => {
    const { container } = render(<SadddAnalysisPanel {...props} />)
    expect(screen.getByText('SADDD analysis loaded.')).toBeTruthy()
    expect(screen.getByText('Accessible SADDD data table')).toBeTruthy()
    const rows = Array.from(container.querySelectorAll('details table tr'), (tr) =>
      Array.from(tr.children, (node) => node.textContent),
    )
    expect(rows).toEqual([
      ['Dimension', 'Category', 'Count'],
      ['Sex', 'Female', '12'],
      ['Sex', 'Male', '9'],
      ['Age', '18 to 24', '7'],
      ['Age', '25 to 59', 'Suppressed'],
      ['Disability', 'With disability', '6'],
      ['Disability', 'Not stated', '0'],
    ])
  })

  it('captions the counts to date only for an ongoing project', () => {
    const caption = 'Counts to date; groups of fewer than 5 are hidden.'
    const { rerender } = render(<SadddAnalysisPanel {...props} />)
    expect(screen.getByText(caption)).toBeTruthy()
    rerender(<SadddAnalysisPanel {...props} sadddOngoing={false} />)
    expect(screen.queryByText(caption)).toBeNull()
    expect(screen.getByTestId('saddd-chart')).toBeTruthy()
  })
})

describe('Rule-Based Alerts panel without a count', () => {
  it('asks for a project when the role can read alerts and nothing was counted', () => {
    render(
      <OpenAlertsPanel
        alertRead={{ refetch: vi.fn() }}
        alertsFailed={false}
        alertsLoading={false}
        canReadAlerts
        openAlertText=""
        openAlerts={null}
      />,
    )
    expect(screen.getByText('Select a project to see its Rule-Based Alerts.')).toBeTruthy()
  })
})
