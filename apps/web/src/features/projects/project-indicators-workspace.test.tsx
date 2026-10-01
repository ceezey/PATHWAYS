import type { DigitalFormDefinition } from '@/types/pathways'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectIndicatorsWorkspace, indicatorInputFromForm } from './project-indicators-workspace'

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
    expect(html).toContain('Manual measurement')
    expect(html).not.toContain('Indicator Library')
  })
  it('offers use-from-library only with library read and an existing entry', () => {
    const props = { projectId: '79000000-0000-4000-8000-000000000003' }
    state.permissions = ['monitoring.read', 'indicators.create', 'indicators.library.read']
    expect(renderToStaticMarkup(createElement(ProjectIndicatorsWorkspace, props))).not.toContain(
      'Use from library',
    )
    state.library = [
      {
        id: '79000000-0000-4000-8000-000000000020',
        code: 'WORKSHOP_ATTENDEES',
        name: 'Workshop attendees',
        recipe: null,
      },
    ]
    const html = renderToStaticMarkup(createElement(ProjectIndicatorsWorkspace, props))
    expect(html).toContain('Use from library')
    expect(html).toContain('WORKSHOP_ATTENDEES')
    expect(html).toContain('href="/indicators/library"')
    state.permissions = ['monitoring.read', 'indicators.create']
    const denied = renderToStaticMarkup(createElement(ProjectIndicatorsWorkspace, props))
    expect(denied).not.toContain('Use from library')
    expect(denied).not.toContain('/indicators/library')
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
    expect(html).toContain('Target</dt><dd>20</dd>')
    expect(html).not.toContain('Project target comparison:')
    expect(html).not.toContain('At project target')
    expect(html).toContain('Progress toward configured change: 75%')
  })
})
