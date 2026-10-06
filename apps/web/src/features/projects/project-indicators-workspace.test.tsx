// @vitest-environment jsdom
import type { DigitalFormDefinition } from '@/types/pathways'
import { formatMetricCell } from '@pathways/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ProjectIndicatorsWorkspace,
  generateIndicatorCode,
  indicatorInputFromForm,
  indicatorPeriod,
  suggestIndicatorCode,
} from './project-indicators-workspace'

const state = vi.hoisted(() => ({
  roles: ['PROJECT_MANAGER'],
  permissions: ['monitoring.read'],
  data: [] as unknown[],
  library: undefined as unknown,
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    access: 'ready',
    profile: {
      id: '79000000-0000-4000-8000-000000000004',
      organizationId: '79000000-0000-4000-8000-000000000005',
      userId: '79000000-0000-4000-8000-000000000006',
      roles: state.roles,
      permissions: state.permissions,
      assignedProjectIds: ['79000000-0000-4000-8000-000000000003'],
      aal: 'aal2',
      fullName: 'Synthetic indicator manager',
    },
  }),
}))
vi.mock('@/features/analytics/use-monitoring-read', () => ({
  useMonitoringRead: () => ({
    data: state.data,
    loading: false,
    error: null,
    reload: () => undefined,
    replaceData: () => undefined,
    authorityKey: 'synthetic',
  }),
}))
vi.mock('@/providers/authorized-query-provider', () => ({
  useAuthorizedRead: (
    resource: string,
    _project: unknown,
    _permission: string,
    _read: unknown,
    enabled = true,
  ) => ({
    data: resource === 'indicator-library' && enabled ? state.library : undefined,
    isError: false,
  }),
}))
vi.mock('@/lib/services/pathways-client', () => ({
  PathwaysClientError: class extends Error {},
  pathwaysClient: {},
}))

function form(overrides: Record<string, string> = {}) {
  const result = new FormData()
  for (const [key, value] of Object.entries({
    code: 'P06-01',
    name: 'Synthetic indicator',
    unitLabel: 'records',
    dataSource: 'Manual field evidence',
    mode: 'MANUAL',
    numericKind: 'COUNT',
    direction: 'DESCRIPTIVE',
    displayPrecision: '0',
    periodStart: '2026-06-01',
    periodEnd: '2026-06-30',
    baseline: '',
    target: '',
    ...overrides,
  }))
    result.set(key, value)
  return result
}
describe('P06 dedicated indicator workspace', () => {
  afterEach(cleanup)
  beforeEach(() => {
    state.roles = ['PROJECT_MANAGER']
    state.permissions = ['monitoring.read']
    state.data = []
    state.library = undefined
  })
  it('does not convert blank baseline/target into fabricated zero', () => {
    expect(indicatorInputFromForm(form(), [])).toMatchObject({
      baseline: null,
      target: null,
      mode: 'MANUAL',
    })
  })
  it('preserves a deliberate zero measurement configuration', () => {
    expect(indicatorInputFromForm(form({ baseline: '0', target: '10' }), []).baseline).toBe('0')
  })
  it('rejects an unsupported formula and an invalid numeric count', () => {
    expect(() =>
      indicatorInputFromForm(form({ mode: 'DERIVED', recipe: 'SELECT * FROM beneficiaries' }), []),
    ).toThrow()
    expect(() => indicatorInputFromForm(form({ baseline: '1.25' }), [])).toThrow()
  })
  it('pins the selected form version rather than accepting a guessed client version', () => {
    const id = '79000000-0000-4000-8000-000000000001'
    const fieldId = '79000000-0000-4000-8000-000000000002'
    const parsed = indicatorInputFromForm(
      form({
        mode: 'DERIVED',
        recipe: 'FORM_NUMERIC_SUM',
        formId: id,
        formVersion: '99',
        fieldId,
        numericKind: 'SIGNED_CHANGE',
      }),
      [{ id, version: 3 } as DigitalFormDefinition],
    )
    expect(parsed.binding).toMatchObject({ formId: id, formVersion: 3, fieldId })
  })
  it('shows a persisted empty state and no management controls to monitoring readers', () => {
    const html = renderToStaticMarkup(
      createElement(ProjectIndicatorsWorkspace, {
        projectId: '79000000-0000-4000-8000-000000000003',
      }),
    )
    expect(html).toContain('No indicators configured')
    expect(html).not.toContain('Add project indicator')
    expect(html).not.toContain('Save measurement')
  })
  it('shows creation only when the verified profile has indicator-create permission', () => {
    state.permissions = ['monitoring.read', 'indicators.create', 'indicators.update']
    const html = renderToStaticMarkup(
      createElement(ProjectIndicatorsWorkspace, {
        projectId: '79000000-0000-4000-8000-000000000003',
      }),
    )
    expect(html).toContain('Add project indicator')
    expect(html).not.toContain('Indicator Library')
  })
  it('suggests a contract-valid code from the name', () => {
    expect(suggestIndicatorCode('Session attendance rate')).toBe('SESSION_ATTENDANCE_RATE')
    expect(suggestIndicatorCode('2026 enrolment')).toBe('I_2026_ENROLMENT')
    expect(suggestIndicatorCode('  ')).toBe('')
  })
  it('shows name, type, target, recipe and source in the add dialog', () => {
    state.permissions = ['monitoring.read', 'indicators.create']
    render(
      createElement(ProjectIndicatorsWorkspace, {
        projectId: '79000000-0000-4000-8000-000000000003',
      }),
    )
    expect(screen.queryByText('Activity completion percentage')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add project indicator' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Households reached' } })
    expect(screen.getByText('Indicator code: HR-01')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Recipe' }).textContent).toContain(
      'Activity completion percentage',
    )
    expect(screen.getByRole('combobox', { name: 'Type' }).textContent).toContain('Activity')
    expect(screen.getByText(/it does not change the calculation/)).toBeTruthy()
    const target = screen.getByLabelText('Target') as HTMLInputElement
    expect(target.value).toBe('100')
    expect(target.readOnly).toBe(false)
    for (const removed of [
      'Code',
      'Baseline',
      'Authority',
      'Unit label',
      'Numeric domain',
      'Direction',
      'Period start',
    ])
      expect(screen.queryByLabelText(removed)).toBeNull()
    expect(screen.queryByText('Advanced settings')).toBeNull()
    expect(screen.getByLabelText('Source description').tagName).toBe('TEXTAREA')
  })
  it('generates readable indicator codes and skips taken numbers', () => {
    expect(generateIndicatorCode('Households reached', [])).toBe('HR-01')
    expect(generateIndicatorCode('Share of activities completed', ['SAC-01'])).toBe('SAC-02')
    expect(generateIndicatorCode('Attendance', [])).toBe('ATT-01')
    expect(generateIndicatorCode('  ', [])).toBe('')
  })
  it('sends a derived completion contract with two decimals and a capped period', () => {
    const form = new FormData()
    for (const [key, value] of Object.entries({
      code: 'DONE_PCT',
      indicatorType: 'OUTCOME',
      name: 'Completion',
      dataSource: 'Activity records',
      mode: 'DERIVED',
      direction: 'HIGHER_IS_BETTER',
      numericKind: 'PERCENTAGE',
      displayPrecision: '2',
      unitLabel: '%',
      recipe: 'ACTIVITY_COMPLETION_PERCENTAGE',
      baseline: '0',
      target: '100',
      ...indicatorPeriod('2026-01-01', '2027-12-31'),
    }))
      form.set(key, value)
    expect(indicatorPeriod('2026-01-01', '2027-12-31').periodEnd).toBe('2027-01-01')
    expect(indicatorInputFromForm(form, [])).toMatchObject({
      mode: 'DERIVED',
      numericKind: 'PERCENTAGE',
      displayPrecision: 2,
      indicatorType: 'OUTCOME',
      binding: { recipe: 'ACTIVITY_COMPLETION_PERCENTAGE' },
    })
  })
  it('hides use-from-library and the library link while the library flag is off', () => {
    const props = { projectId: '79000000-0000-4000-8000-000000000003' }
    state.permissions = ['monitoring.read', 'indicators.create', 'indicators.library.read']
    state.library = [
      {
        id: '79000000-0000-4000-8000-000000000020',
        code: 'WORKSHOP_ATTENDEES',
        name: 'Workshop attendees',
        recipe: null,
      },
    ]
    const html = renderToStaticMarkup(createElement(ProjectIndicatorsWorkspace, props))
    expect(html).not.toContain('Use from library')
    expect(html).not.toContain('/indicators/library')
    expect(html).not.toContain('No automatic project-success rating')
  })
  it('hides creation for a forged grant beyond the role ceiling', () => {
    // A Project Officer never holds indicators.create; a stray grant cannot show the action.
    state.roles = ['PROJECT_OFFICER']
    state.permissions = ['monitoring.read', 'indicators.create', 'indicators.update']
    const html = renderToStaticMarkup(
      createElement(ProjectIndicatorsWorkspace, {
        projectId: '79000000-0000-4000-8000-000000000003',
      }),
    )
    expect(html).not.toContain('Add project indicator')
  })
  it('shows native indicator target and progress without the retired project comparison', () => {
    state.data = [
      {
        id: '79000000-0000-4000-8000-000000000010',
        projectId: '79000000-0000-4000-8000-000000000003',
        code: 'P06-02',
        name: 'Synthetic percentage',
        description: null,
        unitLabel: 'participants',
        dataSource: 'Validated attendance',
        mode: 'MANUAL',
        numericKind: 'COUNT',
        direction: 'HIGHER_IS_BETTER',
        displayPrecision: 0,
        periodStart: '2026-06-01',
        periodEnd: '2026-06-30',
        baseline: '0',
        target: '20',
        current: { value: '15', reason: null },
        progress: { value: '75', reason: null },
        binding: null,
        measurementId: null,
        measuredAt: null,
        measurementSource: null,
        revision: 1,
        status: 'ACTIVE',
        contractVersion: 'p06.v1',
      },
    ]

    const html = renderToStaticMarkup(
      createElement(ProjectIndicatorsWorkspace, {
        projectId: '79000000-0000-4000-8000-000000000003',
      }),
    )
    expect(html).toMatch(/<td[^>]*>20<[/]td>/)
    expect(html).not.toContain('Project target comparison:')
    expect(html).not.toContain('At project target')
    expect(html).toContain('Progress toward configured change: 75%')
  })
  it('shows 0 and 0% only for no measurement yet; other unavailable states keep their label', () => {
    const base = {
      projectId: '79000000-0000-4000-8000-000000000003',
      code: 'P06-02',
      name: 'Synthetic completion',
      description: null,
      unitLabel: '%',
      dataSource: 'Activity records',
      mode: 'MANUAL',
      numericKind: 'PERCENTAGE',
      direction: 'HIGHER_IS_BETTER',
      displayPrecision: 2,
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      baseline: '0',
      target: '100',
      binding: null,
      measurementId: null,
      measuredAt: null,
      measurementSource: null,
      revision: 1,
      status: 'ACTIVE',
      contractVersion: 'p06.v1',
    }
    const missing = { state: 'MISSING', value: null, reason: 'NO_MEASUREMENT' }
    const suppressed = { state: 'SUPPRESSED', value: null, reason: 'SMALL_COHORT' }
    const withheld = { state: 'MISSING', value: null, reason: 'SENSITIVE_RELEASE_NOT_ENABLED_V1' }
    const noTarget = {
      state: 'NOT_APPLICABLE',
      value: null,
      reason: 'BASELINE_TARGET_DIRECTION_REQUIRED',
    }
    const row = (n: number, current: unknown, progress: unknown, extra = {}) => ({
      ...base,
      id: `79000000-0000-4000-8000-0000000000${n}`,
      code: `P06-${n}`,
      current,
      progress,
      ...extra,
    })
    const render = () =>
      renderToStaticMarkup(
        createElement(ProjectIndicatorsWorkspace, {
          projectId: '79000000-0000-4000-8000-000000000003',
        }),
      )
    state.data = [row(11, missing, missing)]
    const empty = render()
    expect(empty).toMatch(/<td[^>]*>0<[/]td>/)
    expect(empty).toMatch(/>0%</)
    state.data = [
      row(12, suppressed, suppressed),
      row(13, withheld, withheld),
      row(14, { state: 'AVAILABLE', value: '7', reason: null }, noTarget, { target: null }),
    ]
    const labelled = render()
    expect(labelled).not.toMatch(/<td[^>]*>0<[/]td>/)
    expect(labelled).not.toMatch(/>0%</)
    expect(labelled).toContain(formatMetricCell(suppressed as never))
    expect(labelled).toContain(formatMetricCell(withheld as never))
    expect(labelled).toContain(formatMetricCell(noTarget as never))
  })
  it('renders a derived definition with baseline 0, a generated code and the chosen type', () => {
    state.permissions = ['monitoring.read', 'indicators.create']
    render(
      createElement(ProjectIndicatorsWorkspace, {
        projectId: '79000000-0000-4000-8000-000000000003',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add project indicator' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Households reached' } })
    const form = screen.getByLabelText('Name').closest('form') as HTMLFormElement
    const values = Object.fromEntries(new FormData(form).entries())
    expect(values).toMatchObject({
      mode: 'DERIVED',
      baseline: '0',
      code: 'HR-01',
      indicatorType: 'ACTIVITY',
      direction: 'HIGHER_IS_BETTER',
      numericKind: 'PERCENTAGE',
      displayPrecision: '2',
    })
    // Without loaded project dates Save stays disabled instead of guessing a period.
    expect(
      (screen.getByRole('button', { name: 'Save indicator' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})
