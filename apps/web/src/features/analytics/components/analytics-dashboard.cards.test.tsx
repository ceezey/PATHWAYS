/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  alertHook,
  api,
  currentAccess,
  indicator,
  monitoring,
  resetAnalyticsMocks,
  rulesHumanClient,
} from '@/test/fixtures/analytics-dashboard-fixtures'

import { AnalyticsDashboard, countOpenAlerts } from './analytics-dashboard'

describe('Analytics dashboard request dependencies', () => {
  beforeEach(() => {
    resetAnalyticsMocks()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('overview metric cards', () => {
    const cardText = (label: string) =>
      screen
        .getAllByText(label)
        .map((node) => node.parentElement?.parentElement?.textContent ?? '')
        .join(' | ')

    it('hides the alerts card and panel without alerts.read', async () => {
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      expect(screen.queryByText('Rule-Based Alerts')).toBeNull()
      expect(screen.queryByText('Rule-Based Alerts are unavailable for this role.')).toBeNull()
      expect(screen.queryByText('Rule-Based Alerts unavailable')).toBeNull()
    })

    it('shows a loading state, not the role message, while alerts load', async () => {
      currentAccess.profile.permissions = [...currentAccess.profile.permissions, 'alerts.read']
      alertHook.result = { data: undefined, isError: false }
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      expect(cardText('Rule-Based Alerts')).toContain('Loading...')
      expect(screen.getByText('Loading Rule-Based Alerts')).toBeTruthy()
      expect(screen.queryByText('Rule-Based Alerts are unavailable for this role.')).toBeNull()
    })

    it('shows an error state with Retry when the alert read fails', async () => {
      const refetch = vi.fn()
      currentAccess.profile.permissions = [...currentAccess.profile.permissions, 'alerts.read']
      alertHook.result = { data: undefined, isError: true, refetch }
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      expect(screen.getByText('Rule-Based Alerts unavailable')).toBeTruthy()
      expect(screen.queryByText('Rule-Based Alerts are unavailable for this role.')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: /retry/i }))
      expect(refetch).toHaveBeenCalledTimes(1)
    })

    it.each([
      [{ count: 7, capped: false }, '7', '7 open alerts'],
      [{ count: 1, capped: false }, '1', '1 open alert in'],
      [{ count: 1000, capped: true }, '1000+', '1000+ open alerts'],
    ])('renders the open alert count %j', async (data, cardValue, panelText) => {
      currentAccess.profile.permissions = [...currentAccess.profile.permissions, 'alerts.read']
      alertHook.result = { data, isError: false }
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(api.getMonitoringDashboard).toHaveBeenCalled())
      expect(cardText('Rule-Based Alerts')).toContain(cardValue)
      expect(document.body.textContent).toContain(panelText)
    })

    it('shows Beneficiary reach from the released aggregate cell', async () => {
      api.getMonitoringDashboard.mockResolvedValue({
        ...monitoring,
        enrolledIndividuals: { state: 'AVAILABLE', value: '128', reason: null },
      })
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(cardText('Beneficiary reach')).toContain('128'))
    })

    it('shows suppression wording, never a number, for a suppressed Beneficiary reach', async () => {
      api.getMonitoringDashboard.mockResolvedValue({
        ...monitoring,
        enrolledIndividuals: { state: 'SUPPRESSED', value: null, reason: 'SMALL_COHORT' },
      })
      render(<AnalyticsDashboard />)
      await waitFor(() => expect(cardText('Beneficiary reach')).toContain('Suppressed'))
    })

    it('renders the Indicator progress chart only when a released progress value exists', async () => {
      api.getMonitoringDashboard.mockResolvedValue({
        ...monitoring,
        indicators: [
          {
            ...indicator('project-a', 'A-SEP', '2026-09-01', '2026-09-30'),
            progress: { state: 'AVAILABLE', value: '42', reason: null },
          },
        ],
      })
      render(<AnalyticsDashboard />)
      expect(await screen.findByText('Indicator progress chart')).toBeTruthy()
    })

    it('shows None yet, not the chart, when no indicator progress is released', async () => {
      api.getMonitoringDashboard.mockResolvedValue({
        ...monitoring,
        indicators: [indicator('project-a', 'A-SEP', '2026-09-01', '2026-09-30')],
      })
      render(<AnalyticsDashboard />)
      await waitFor(() =>
        expect(
          screen.getByText('No released indicator progress for this project and period.'),
        ).toBeTruthy(),
      )
      expect(screen.queryByText('Indicator progress chart')).toBeNull()
    })
  })

  describe('countOpenAlerts', () => {
    const page = (n: number, nextCursor: string | null) => ({
      items: Array.from({ length: n }, (_, i) => ({ id: `alert-${i}` })),
      nextCursor,
    })

    it('counts each open status with the server filter and follows cursors', async () => {
      const list = vi.mocked(rulesHumanClient.listAlerts)
      list.mockImplementation((async (input: { status?: string; cursor?: string }) => {
        if (input.status === 'NEW') return input.cursor ? page(5, null) : page(100, 'c1')
        if (input.status === 'REVIEWED') return page(3, null)
        return page(0, null)
      }) as never)
      await expect(countOpenAlerts('project-a')).resolves.toEqual({ count: 108, capped: false })
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'NEW', cursor: 'c1', projectId: 'project-a' }),
        undefined,
      )
    })

    it('stops at the page bound and reports the count as capped', async () => {
      const list = vi.mocked(rulesHumanClient.listAlerts)
      list.mockImplementation((async () => page(100, 'more')) as never)
      const result = await countOpenAlerts('project-a')
      expect(result.capped).toBe(true)
      expect(result.count).toBe(3 * 10 * 100)
      expect(list).toHaveBeenCalledTimes(30)
    })
  })
})
