/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { AnalyticsSummaryCards } from './analytics-summary-cards'

type Props = ComponentProps<typeof AnalyticsSummaryCards>

afterEach(cleanup)

const currencyRow = (currency: string, utilizationPercent: number | null) => ({
  currency,
  planned: 1000,
  approved: 500,
  pending: 0,
  utilizationPercent,
})
const budgetOf = (...rows: ReturnType<typeof currencyRow>[]) =>
  ({ data: { currencies: rows }, isError: false }) as unknown as Props['budgetRead']
const budgetLoading = { data: undefined, isError: false } as unknown as Props['budgetRead']
const budgetFailed = { data: undefined, isError: true } as unknown as Props['budgetRead']

const base: Props = {
  activities: [],
  alertsFailed: false,
  alertsLoading: false,
  averageKpi: null,
  budgetRead: budgetLoading,
  canReadActivities: true,
  canReadAlerts: true,
  canReadBudgetUtilization: true,
  canReadIndicators: true,
  monitoring: null,
  monitoringReadable: true,
  openAlertText: '',
  openAlerts: null,
}

/** Hovers the card so its tooltip opens, then reads the tooltip, the value and the tone class. */
const readCard = (label: string, props: Partial<Props>) => {
  render(<AnalyticsSummaryCards {...base} {...props} />)
  const root = screen.getByText(label).closest('.relative') as HTMLElement
  const trigger = within(root).getByRole('button')
  fireEvent.mouseEnter(trigger)
  // The tooltip renders in a portal, linked to its trigger by aria-describedby.
  const tipId = trigger.getAttribute('aria-describedby') ?? ''
  return {
    tip: document.getElementById(tipId)?.textContent,
    value: root.querySelector('p.tabular-nums')?.textContent,
    tone: /bg-(\w+)-subtle/.exec(root.querySelector('div.h-10')?.className ?? '')?.[1],
  }
}

describe('KPI achievement card', () => {
  it.each([
    [null, true, 'None yet', 'info'],
    [null, false, 'Unavailable', 'info'],
    [69, true, '69%', 'warning'],
    [70, true, '70%', 'success'],
    [71, true, '71%', 'success'],
  ])(
    'shows the average %s (readable %s) as %s with the %s tone',
    (averageKpi, readable, value, tone) => {
      const card = readCard('KPI achievement', { averageKpi, monitoringReadable: readable })
      expect(card).toMatchObject({ value, tone })
    },
  )
})

describe('Budget utilization card', () => {
  const approved = 'Approved expenses against planned budget allocations; pending is not counted.'
  const several = 'Several currencies are recorded; see the Budget utilization panel.'
  it.each([
    ['loading', budgetLoading, 'Loading...', 'info', approved],
    ['failed', budgetFailed, 'Unavailable', 'info', 'Budget utilization could not be loaded.'],
    ['without allocations', budgetOf(), 'No budget', 'info', approved],
    ['without a utilization', budgetOf(currencyRow('PHP', null)), 'No budget', 'info', approved],
    [
      'in several currencies',
      budgetOf(currencyRow('PHP', 50), currencyRow('USD', 150)),
      'Multiple currencies',
      'info',
      several,
    ],
    ['under the plan', budgetOf(currencyRow('PHP', 99.9)), '99.9%', 'success', approved],
    ['exactly on the plan', budgetOf(currencyRow('PHP', 100)), '100%', 'success', approved],
    ['over the plan', budgetOf(currencyRow('PHP', 120)), '100% (+20%)', 'warning', approved],
  ])('reads %s', (_name, budgetRead, value, tone, tip) => {
    expect(readCard('Budget utilization', { budgetRead })).toEqual({ tip, value, tone })
  })
})

describe('Rule-Based Alerts card', () => {
  const tip = 'Open alerts (new, reviewed or actioned) in the selected project.'
  it.each([
    ['no open alert', { openAlerts: { count: 0, capped: false }, openAlertText: '0' }, '0', 'info'],
    [
      'one open alert',
      { openAlerts: { count: 1, capped: false }, openAlertText: '1' },
      '1',
      'warning',
    ],
    [
      'a capped count',
      { openAlerts: { count: 1000, capped: true }, openAlertText: '1000+' },
      '1000+',
      'warning',
    ],
    ['an unread count', {}, 'Unavailable', 'info'],
    ['a loading read', { alertsLoading: true }, 'Loading...', 'info'],
  ] as [string, Partial<Props>, string, string][])('reads %s', (_name, props, value, tone) => {
    expect(readCard('Rule-Based Alerts', props)).toEqual({ tip, value, tone })
  })
})
