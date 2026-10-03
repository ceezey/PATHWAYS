/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BudgetSummaryCard } from './budget-summary-card'
import { IndicatorTrendChart, indicatorTrendOption } from './indicator-trend-chart'
import {
  ParticipationBreakdownPanel,
  participationBarOption,
} from './participation-breakdown-panel'

vi.mock('echarts-for-react', () => ({ default: () => <div>chart</div> }))

const uuid = '11111111-1111-4111-8111-111111111111'
afterEach(cleanup)

describe('participation breakdown panel', () => {
  it('labels suppressed cells as "Fewer than 5" and never plots them as zero', () => {
    render(
      <ParticipationBreakdownPanel
        data={{
          projectId: uuid,
          total: null,
          totalSuppressed: true,
          byActivity: [
            { activityId: uuid, activityName: 'Training', count: null, suppressed: true },
            { activityId: uuid, activityName: 'Workshop', count: 12, suppressed: false },
          ],
          byMonth: [{ month: '2026-02', count: 7, suppressed: false }],
          byAttendanceStatus: [{ status: 'NOT_COMPLETED', count: null, suppressed: true }],
        }}
      />,
    )
    expect(screen.getByText(/Total participation/).textContent).toContain('Fewer than 5')
    expect(screen.getAllByText('Fewer than 5').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Not completed')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
    const option = participationBarOption('By activity', [
      { label: 'Training', count: null, suppressed: true },
    ])
    expect(option.series[0].data).toEqual([null])
  })
})

describe('indicator trends', () => {
  const trends = {
    projectId: uuid,
    indicators: [
      {
        indicatorId: uuid,
        name: 'Enrolled',
        unit: 'people',
        target: 100,
        points: [
          { periodStart: '2026-01-01', periodEnd: '2026-01-31', value: 10 },
          { periodStart: '2026-02-01', periodEnd: '2026-02-28', value: 40 },
        ],
      },
      {
        indicatorId: uuid,
        name: 'Trained',
        unit: '',
        target: null,
        points: [{ periodStart: '2026-02-01', periodEnd: '2026-02-28', value: 5 }],
      },
    ],
  }

  it('builds one series per indicator with a dashed target line only when a target exists', () => {
    const option = indicatorTrendOption(trends)
    expect(option.xAxis.data).toEqual(['2026-01-31', '2026-02-28'])
    expect(option.series).toHaveLength(2)
    expect(option.series[0]).toMatchObject({
      markLine: { data: [{ yAxis: 100 }], lineStyle: { type: 'dashed' } },
    })
    expect(option.series[1]).not.toHaveProperty('markLine')
    expect(option.series[1].data).toEqual([null, 5])
  })

  it('shows "None yet" when there are no points', () => {
    render(<IndicatorTrendChart data={{ projectId: uuid, indicators: [] }} />)
    expect(screen.getByText('None yet')).toBeTruthy()
  })
})

describe('budget summary card', () => {
  it('shows "No budget" for a null utilization and one row per currency', () => {
    render(
      <BudgetSummaryCard
        data={{
          projectId: uuid,
          currencies: [
            { currency: 'PHP', planned: 1000, approved: 450, pending: 900, utilizationPercent: 45 },
            { currency: 'USD', planned: 0, approved: 10, pending: 0, utilizationPercent: null },
          ],
        }}
      />,
    )
    expect(screen.getByText('45%')).toBeTruthy()
    expect(screen.getByText('No budget')).toBeTruthy()
    expect(screen.getByText('PHP')).toBeTruthy()
    expect(screen.getByText('USD')).toBeTruthy()
    expect(screen.getByText('Pending')).toBeTruthy()
  })

  it('shows "No budget" when no currency rows exist', () => {
    render(<BudgetSummaryCard data={{ projectId: uuid, currencies: [] }} />)
    expect(screen.getByText('No budget')).toBeTruthy()
  })
})
