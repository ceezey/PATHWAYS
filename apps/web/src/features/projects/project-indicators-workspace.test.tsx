import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectIndicatorsWorkspace, indicatorInputFromForm } from './project-indicators-workspace'
import type { DigitalFormDefinition } from '@/types/pathways'

const state = vi.hoisted(() => ({ permissions: ['monitoring.read'], data: [] as unknown[] }))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => ({ profile: { permissions: state.permissions } }) }))
vi.mock('@/features/analytics/use-monitoring-read', () => ({ useMonitoringRead: () => ({ data: state.data, loading: false, error: null, reload: () => undefined, authorityKey: 'synthetic' }) }))
vi.mock('@/lib/services/pathways-client', () => ({ PathwaysClientError: class extends Error {}, pathwaysClient: {} }))

function form(overrides: Record<string, string> = {}) {
  const result = new FormData()
  for (const [key, value] of Object.entries({
    code: 'P06-01', name: 'Synthetic indicator', unitLabel: 'records', dataSource: 'Manual field evidence',
    mode: 'MANUAL', numericKind: 'COUNT', direction: 'DESCRIPTIVE', displayPrecision: '0',
    periodStart: '2026-06-01', periodEnd: '2026-06-30', baseline: '', target: '', ...overrides,
  })) result.set(key, value)
  return result
}
describe('P06 dedicated indicator workspace', () => {
  beforeEach(() => { state.permissions = ['monitoring.read']; state.data = [] })
  it('does not convert blank baseline/target into fabricated zero', () => {
    expect(indicatorInputFromForm(form(), [])).toMatchObject({ baseline: null, target: null, mode: 'MANUAL' })
  })
  it('preserves a deliberate zero measurement configuration', () => {
    expect(indicatorInputFromForm(form({ baseline: '0', target: '10' }), []).baseline).toBe('0')
  })
  it('rejects an unsupported formula and an invalid numeric count', () => {
    expect(() => indicatorInputFromForm(form({ mode: 'DERIVED', recipe: 'SELECT * FROM beneficiaries' }), [])).toThrow()
    expect(() => indicatorInputFromForm(form({ baseline: '1.25' }), [])).toThrow()
  })
  it('pins the selected form version rather than accepting a guessed client version', () => {
    const id = '79000000-0000-4000-8000-000000000001'
    const fieldId = '79000000-0000-4000-8000-000000000002'
    const parsed = indicatorInputFromForm(form({ mode: 'DERIVED', recipe: 'FORM_NUMERIC_SUM', formId: id, formVersion: '99', fieldId, numericKind: 'SIGNED_CHANGE' }), [{ id, version: 3 } as DigitalFormDefinition])
    expect(parsed.binding).toMatchObject({ formId: id, formVersion: 3, fieldId })
  })
  it('shows a persisted empty state and no management controls to monitoring readers', () => {
    const html = renderToStaticMarkup(createElement(ProjectIndicatorsWorkspace, { projectId: '79000000-0000-4000-8000-000000000003' }))
    expect(html).toContain('No indicators configured')
    expect(html).not.toContain('Add project indicator')
    expect(html).not.toContain('Save measurement')
  })
  it('shows creation only when the verified profile has indicator-create permission', () => {
    state.permissions = ['monitoring.read', 'indicators.create', 'indicators.update']
    const html = renderToStaticMarkup(createElement(ProjectIndicatorsWorkspace, { projectId: '79000000-0000-4000-8000-000000000003' }))
    expect(html).toContain('Add project indicator')
    expect(html).toContain('Manual measurement')
    expect(html).not.toContain('Indicator Library')
  })
})
