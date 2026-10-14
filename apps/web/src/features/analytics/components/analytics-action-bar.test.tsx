/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AnalyticsActionBar } from './analytics-action-bar'

const flags = vi.hoisted(() => ({ pins: true, exports: true }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const addPin = vi.hoisted(() => vi.fn())

vi.mock('@/constants/feature-flags', () => ({
  get DASHBOARD_PINS_UI_ENABLED() {
    return flags.pins
  },
  get ANALYTICS_AGGREGATE_EXPORT_UI_ENABLED() {
    return flags.exports
  },
}))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/lib/dashboard-pins', () => ({ addPin }))
// Plain buttons stand in for the Radix menu, matching the other workspace tests.
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onSelect,
  }: { children: React.ReactNode; onSelect?: () => void }) => (
    <button onClick={() => onSelect?.()} role="menuitem" type="button">
      {children}
    </button>
  ),
}))

type Props = ComponentProps<typeof AnalyticsActionBar>
const period = { value: '2026-09', label: 'September 2026', start: '2026-09-01', end: '2026-09-30' }
const previewExport = vi.fn()
const base = {
  analysisView: 'kpi',
  canExportAnalytics: true,
  canReadIndicators: true,
  canReadParticipation: true,
  canReadSurveyTimeline: true,
  exportPreview: null,
  exporting: false,
  pickerPeriod: period,
  previewExport,
  profile: { userId: 'user-1' },
  selectedPeriod: period,
  selectedProject: { id: 'project-a' },
  surveyUnavailable: false,
}
const show = (overrides: Record<string, unknown> = {}) =>
  render(<AnalyticsActionBar {...({ ...base, ...overrides } as unknown as Props)} />)
const pin = () =>
  screen.queryByRole('button', { name: 'Add to Dashboard' }) as HTMLButtonElement | null
const exporter = () =>
  screen.queryByRole('button', {
    name: /Export aggregates|Preparing preview/,
  }) as HTMLButtonElement | null
const reasons = {
  period: 'Choose a reporting period to pin this view.',
  survey: 'Survey improvement cannot be pinned.',
}

describe('AnalyticsActionBar', () => {
  beforeEach(() => {
    flags.pins = true
    flags.exports = true
    addPin.mockReturnValue('added')
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('keeps the two actions in one wrapping row', () => {
    const { container } = show()

    expect(container.firstElementChild?.className).toBe('flex flex-wrap items-center gap-2')
    expect(container.firstElementChild?.children).toHaveLength(2)
  })

  describe('Add to Dashboard', () => {
    it.each([
      ['kpi', { canReadIndicators: false }],
      ['participation', { canReadParticipation: false }],
      ['timeline', { canReadSurveyTimeline: false }],
    ])('is hidden in the %s view when the role cannot read it', (analysisView, denied) => {
      show({ analysisView, ...denied })

      expect(pin()).toBeNull()
    })

    it.each(['kpi', 'participation', 'timeline'])(
      'is shown in the %s view for a role that can read it',
      (analysisView) => {
        show({ analysisView })

        expect(pin()).not.toBeNull()
      },
    )

    it('stays shown in the survey view whatever the role reads', () => {
      show({
        analysisView: 'survey',
        canReadIndicators: false,
        canReadParticipation: false,
        canReadSurveyTimeline: false,
      })

      expect(pin()).not.toBeNull()
    })

    it('is hidden when the pins flag is off', () => {
      flags.pins = false
      show()

      expect(pin()).toBeNull()
    })

    it('can be pinned without a reason', () => {
      show()

      expect(pin()?.disabled).toBe(false)
      expect(pin()?.hasAttribute('title')).toBe(false)
      expect(pin()?.hasAttribute('aria-describedby')).toBe(false)
      expect(document.getElementById('pin-blocked-reason')).toBeNull()
    })

    it.each([
      ['kpi', { selectedPeriod: undefined }, reasons.period],
      ['survey', {}, reasons.survey],
    ])('blocks the %s view with its reason', (analysisView, overrides, reason) => {
      show({ analysisView, ...overrides })

      expect(pin()?.disabled).toBe(true)
      expect(pin()?.title).toBe(reason)
      expect(pin()?.getAttribute('aria-describedby')).toBe('pin-blocked-reason')
      expect(document.getElementById('pin-blocked-reason')?.textContent).toBe(reason)
      fireEvent.click(pin() as HTMLButtonElement)
      expect(addPin).not.toHaveBeenCalled()
    })

    it.each([
      ['no project', { selectedProject: undefined }],
      ['no profile', { profile: null }],
      ['no user id', { profile: { userId: '' } }],
    ])('is disabled with %s and gives no reason', (_name, overrides) => {
      show(overrides)

      expect(pin()?.disabled).toBe(true)
      expect(pin()?.hasAttribute('title')).toBe(false)
      fireEvent.click(pin() as HTMLButtonElement)
      expect(addPin).not.toHaveBeenCalled()
    })

    it.each([
      ['kpi', { periodStart: '2026-09-01', periodEnd: '2026-09-30' }],
      ['participation', { periodStart: '2026-09-01', periodEnd: '2026-09-30' }],
      ['timeline', {}],
    ])('stores the %s view for the project', (analysisView, range) => {
      show({ analysisView })

      fireEvent.click(pin() as HTMLButtonElement)

      expect(addPin).toHaveBeenCalledTimes(1)
      expect(addPin).toHaveBeenCalledWith('user-1', {
        view: analysisView,
        projectId: 'project-a',
        ...range,
      })
    })

    it('stores a timeline pin without a period even when none is selected', () => {
      show({ analysisView: 'timeline', selectedPeriod: undefined })

      fireEvent.click(pin() as HTMLButtonElement)

      expect(addPin).toHaveBeenCalledWith('user-1', { view: 'timeline', projectId: 'project-a' })
    })

    it('stores a participation pin without a period when none is selected', () => {
      show({ analysisView: 'participation', selectedPeriod: undefined })

      fireEvent.click(pin() as HTMLButtonElement)

      expect(addPin).toHaveBeenCalledWith('user-1', {
        view: 'participation',
        projectId: 'project-a',
      })
    })

    it.each([
      ['added', 'Added to your dashboard.', 'success'],
      ['duplicate', 'Already on your dashboard.', 'error'],
      ['full', 'Your dashboard is full. Unpin a chart first.', 'error'],
      ['unavailable', 'Browser storage is unavailable, so the chart could not be pinned.', 'error'],
    ])('answers %s with one %s toast', (result, message, kind) => {
      addPin.mockReturnValue(result)
      show()

      fireEvent.click(pin() as HTMLButtonElement)

      const other = kind === 'success' ? toast.error : toast.success
      expect(toast[kind as 'success' | 'error']).toHaveBeenCalledWith(message)
      expect(toast.success.mock.calls.length + toast.error.mock.calls.length).toBe(1)
      expect(other).not.toHaveBeenCalled()
    })
  })

  describe('Export aggregates', () => {
    it('is hidden when the export flag is off', () => {
      flags.exports = false
      show()

      expect(exporter()).toBeNull()
    })

    it('is hidden for a role that cannot export', () => {
      show({ canExportAnalytics: false })

      expect(exporter()).toBeNull()
    })

    it('is enabled with a project and a period', () => {
      show()

      expect(exporter()?.textContent).toBe('Export aggregates')
      expect(exporter()?.disabled).toBe(false)
    })

    it.each([
      ['no project', { selectedProject: undefined }],
      ['an export running', { exporting: true }],
      ['the kpi view without a period', { pickerPeriod: undefined }],
      [
        'the participation view without a period',
        { analysisView: 'participation', pickerPeriod: undefined },
      ],
      ['the survey view without a period', { analysisView: 'survey', pickerPeriod: undefined }],
      ['the survey view unavailable', { analysisView: 'survey', surveyUnavailable: true }],
    ])('is disabled with %s', (_name, overrides) => {
      show(overrides)

      expect(exporter()?.disabled).toBe(true)
    })

    it.each([
      ['the timeline view without a period', { analysisView: 'timeline', pickerPeriod: undefined }],
      [
        'the timeline view with the survey unavailable',
        { analysisView: 'timeline', surveyUnavailable: true },
      ],
      ['the kpi view with the survey unavailable', { surveyUnavailable: true }],
      ['the survey view with a period', { analysisView: 'survey' }],
    ])('is enabled with %s', (_name, overrides) => {
      show(overrides)

      expect(exporter()?.disabled).toBe(false)
    })

    it('says Preparing preview only while a preview is being prepared', () => {
      show({ exporting: true })
      expect(exporter()?.textContent).toBe('Preparing preview')
      cleanup()

      show({ exporting: true, exportPreview: { format: 'CSV' } })
      expect(exporter()?.textContent).toBe('Export aggregates')
      cleanup()

      show({ exportPreview: null })
      expect(exporter()?.textContent).toBe('Export aggregates')
    })

    it('lists the four formats in order and previews the chosen one', () => {
      show()

      const items = screen.getAllByRole('menuitem')
      expect(items.map((item) => item.textContent)).toEqual(['CSV', 'XLS', 'XLSX', 'PDF'])
      fireEvent.click(items[2])
      expect(previewExport).toHaveBeenCalledTimes(1)
      expect(previewExport).toHaveBeenCalledWith('XLSX')
    })
  })
})
