/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AnalyticsFilterBar } from './analytics-filter-bar'

const flags = vi.hoisted(() => ({ maps: false }))

vi.mock('@/constants/feature-flags', () => ({
  get MAPS_UI_ENABLED() {
    return flags.maps
  },
}))
// A native select stands in for the Radix one and keeps the placeholder on a data attribute.
vi.mock('@/components/ui/select', async () => {
  const React = await import('react')
  type PartProps = {
    children?: React.ReactNode
    'aria-label'?: string
    placeholder?: string
    value?: string
  }
  type SelectProps = {
    children?: React.ReactNode
    disabled?: boolean
    value?: string
    onValueChange?: (value: string) => void
  }
  const SelectTrigger = ({ children }: PartProps) => <>{children}</>
  const SelectContent = ({ children }: PartProps) => <>{children}</>
  const SelectItem = ({ children, value }: PartProps) => <option value={value}>{children}</option>
  const SelectValue = (_props: PartProps) => null
  const Select = ({ children, disabled, value, onValueChange }: SelectProps) => {
    const parts = React.Children.toArray(children)
    const trigger = parts.find(
      (part) => React.isValidElement(part) && part.type === SelectTrigger,
    ) as React.ReactElement<PartProps> | undefined
    const content = parts.find(
      (part) => React.isValidElement(part) && part.type === SelectContent,
    ) as React.ReactElement<PartProps> | undefined
    const valueNode = React.Children.toArray(trigger?.props.children).find(
      (part) => React.isValidElement(part) && part.type === SelectValue,
    ) as React.ReactElement<PartProps> | undefined
    return (
      <select
        aria-label={trigger?.props['aria-label']}
        data-placeholder={valueNode?.props.placeholder}
        disabled={disabled}
        onChange={(event) => onValueChange?.(event.target.value)}
        value={value}
      >
        {content?.props.children}
      </select>
    )
  }
  return { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
})

type Props = ComponentProps<typeof AnalyticsFilterBar>
const septemberPeriod = {
  value: '2026-09',
  label: 'September 2026',
  start: '2026-09-01',
  end: '2026-09-30',
}
const augustPeriod = {
  value: '2026-08',
  label: 'August 2026',
  start: '2026-08-01',
  end: '2026-08-31',
}
const handlers = {
  handleProjectChange: vi.fn(),
  setAnalysisView: vi.fn(),
  setIndicatorId: vi.fn(),
  setPeriod: vi.fn(),
  setVisualizationType: vi.fn(),
}
const base = {
  ...handlers,
  analysisView: 'kpi',
  canReadParticipation: true,
  canReadSurvey: true,
  canReadSurveyTimeline: true,
  indicatorId: 'all',
  indicators: [
    { id: 'indicator-1', code: 'IND-1', name: 'Reach' },
    { id: 'indicator-2', code: 'IND-2', name: 'Completion' },
  ],
  pickerPeriod: septemberPeriod,
  pickerPeriods: [septemberPeriod, augustPeriod],
  projectId: 'project-b',
  projects: [
    { id: 'project-a', title: 'Project A' },
    { id: 'project-b', title: 'Project B' },
  ],
  visualizationType: 'bar',
}
const show = (overrides: Record<string, unknown> = {}) =>
  render(
    <AnalyticsFilterBar {...({ ...base, ...overrides } as unknown as Props)}>
      <button type="button">child action</button>
    </AnalyticsFilterBar>,
  )
const field = (label: string) => screen.getByLabelText(label) as HTMLSelectElement
const optionsOf = (label: string) =>
  Array.from(field(label).options).map((option) => [option.value, option.textContent])
const labelsOf = (label: string) => optionsOf(label).map(([, text]) => text)

describe('AnalyticsFilterBar', () => {
  beforeEach(() => {
    flags.maps = false
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('names its section by the heading and puts the children beside the heading', () => {
    const { container } = show()

    const section = container.querySelector('section')
    const heading = screen.getByRole('heading', { name: 'Analysis and visualization' })
    expect(section?.getAttribute('aria-labelledby')).toBe('analytics-view-title')
    expect(heading.id).toBe('analytics-view-title')
    expect(heading.parentElement?.className).toBe(
      'flex flex-wrap items-center justify-between gap-3 sm:col-span-2 xl:col-span-12',
    )
    expect(heading.parentElement?.contains(screen.getByText('child action'))).toBe(true)
    expect(section?.className).toBe(
      'grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 xl:grid-cols-12',
    )
  })

  it.each([
    ['Project filter', 'space-y-2 sm:col-span-2 xl:col-span-5'],
    ['Reporting period', 'space-y-2 xl:col-span-3'],
    ['Analysis view', 'space-y-2 xl:col-span-4'],
    ['Indicator filter', 'space-y-2 xl:col-span-8'],
    ['Visualization type', 'space-y-2 xl:col-span-4'],
  ])('lays the %s field out with %s', (label, classes) => {
    show()

    expect(field(label).parentElement?.className).toBe(classes)
  })

  it.each([
    ['Project filter', 'Project filter'],
    ['Reporting period', 'Reporting period'],
    ['Analysis view', 'Analysis view'],
    ['Indicator filter', 'Indicator'],
    ['Visualization type', 'Visualization type'],
  ])('shows the caption of the %s field', (label, caption) => {
    show()

    expect(field(label).parentElement?.querySelector('span')?.textContent).toBe(caption)
  })

  describe('project', () => {
    it('lists the projects and shows the current one', () => {
      show()

      expect(optionsOf('Project filter')).toEqual([
        ['project-a', 'Project A'],
        ['project-b', 'Project B'],
      ])
      expect(field('Project filter').value).toBe('project-b')
      expect(field('Project filter').getAttribute('data-placeholder')).toBe(
        'No authorized projects',
      )
    })

    it('reports the chosen project', () => {
      show()

      fireEvent.change(field('Project filter'), { target: { value: 'project-a' } })

      expect(handlers.handleProjectChange).toHaveBeenCalledWith('project-a')
    })
  })

  describe('reporting period', () => {
    it('lists the picker periods and shows the picked one', () => {
      show({ pickerPeriod: augustPeriod })

      expect(optionsOf('Reporting period')).toEqual([
        ['2026-09', 'September 2026'],
        ['2026-08', 'August 2026'],
      ])
      expect(field('Reporting period').value).toBe('2026-08')
      expect(field('Reporting period').disabled).toBe(false)
      expect(field('Reporting period').getAttribute('data-placeholder')).toBe(
        'No reporting periods',
      )
    })

    it('is disabled and empty without periods', () => {
      show({ pickerPeriod: undefined, pickerPeriods: [] })

      expect(field('Reporting period').disabled).toBe(true)
      expect(field('Reporting period').value).toBe('')
    })

    it('stays enabled with one period', () => {
      show({ pickerPeriods: [septemberPeriod] })

      expect(field('Reporting period').disabled).toBe(false)
    })

    it('reports the chosen period', () => {
      show()

      fireEvent.change(field('Reporting period'), { target: { value: '2026-08' } })

      expect(handlers.setPeriod).toHaveBeenCalledWith('2026-08')
    })
  })

  describe('analysis view', () => {
    const all = [
      'KPI / indicator performance',
      'Participation patterns',
      'Survey improvement',
      'Project / activity timeline adherence',
    ]

    it('lists every view for a role that reads them all', () => {
      show({ analysisView: 'survey' })

      expect(labelsOf('Analysis view')).toEqual(all)
      expect(field('Analysis view').value).toBe('survey')
    })

    it.each([
      ['participation', { canReadParticipation: false }, [all[0], all[2], all[3]]],
      ['survey', { canReadSurvey: false }, [all[0], all[1], all[3]]],
      ['timeline', { canReadSurveyTimeline: false }, [all[0], all[1], all[2]]],
      [
        'every other view',
        { canReadParticipation: false, canReadSurvey: false, canReadSurveyTimeline: false },
        [all[0]],
      ],
    ])('hides the %s view the role cannot read', (_name, overrides, labels) => {
      show(overrides)

      expect(labelsOf('Analysis view')).toEqual(labels)
    })

    it('reports the chosen view', () => {
      show()

      fireEvent.change(field('Analysis view'), { target: { value: 'timeline' } })

      expect(handlers.setAnalysisView).toHaveBeenCalledWith('timeline')
    })
  })

  describe('indicator', () => {
    it('lists all indicators first, then each code and name', () => {
      show({ indicatorId: 'indicator-2' })

      expect(optionsOf('Indicator filter')).toEqual([
        ['all', 'All indicators / project KPI'],
        ['indicator-1', 'IND-1 · Reach'],
        ['indicator-2', 'IND-2 · Completion'],
      ])
      expect(field('Indicator filter').value).toBe('indicator-2')
    })

    it.each([
      ['kpi', false],
      ['participation', true],
      ['survey', true],
      ['timeline', true],
    ])('in the %s view is disabled: %s', (analysisView, disabled) => {
      show({ analysisView })

      expect(field('Indicator filter').disabled).toBe(disabled)
    })

    it('reports the chosen indicator', () => {
      show()

      fireEvent.change(field('Indicator filter'), { target: { value: 'indicator-1' } })

      expect(handlers.setIndicatorId).toHaveBeenCalledWith('indicator-1')
    })
  })

  describe('visualization type', () => {
    it('lists bar, line and table while maps are off', () => {
      show({ visualizationType: 'line' })

      expect(optionsOf('Visualization type')).toEqual([
        ['bar', 'Bar chart'],
        ['line', 'Line chart'],
        ['table', 'Table'],
      ])
      expect(field('Visualization type').value).toBe('line')
    })

    it('adds the map when maps are on', () => {
      flags.maps = true
      show()

      expect(labelsOf('Visualization type')).toEqual(['Bar chart', 'Line chart', 'Table', 'Map'])
    })

    it('reports the chosen type', () => {
      show()

      fireEvent.change(field('Visualization type'), { target: { value: 'table' } })

      expect(handlers.setVisualizationType).toHaveBeenCalledWith('table')
    })
  })
})
