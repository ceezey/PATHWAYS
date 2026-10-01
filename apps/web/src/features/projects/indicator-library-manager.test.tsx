import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IndicatorLibraryManager } from './indicator-library-manager'

const state = vi.hoisted(() => ({
  roles: ['PROJECT_MANAGER'],
  permissions: ['indicators.library.read'],
  data: undefined as unknown,
  error: null as unknown,
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    access: 'ready',
    profile: {
      id: '79100000-0000-4000-8000-000000000004',
      organizationId: '79100000-0000-4000-8000-000000000005',
      userId: '79100000-0000-4000-8000-000000000006',
      roles: state.roles,
      permissions: state.permissions,
      assignedProjectIds: [],
      aal: 'aal2',
      fullName: 'Synthetic library manager',
    },
  }),
}))
vi.mock('@/providers/authorized-query-provider', () => ({
  useAuthorizedRead: () => ({ data: state.data, error: state.error, refetch: vi.fn() }),
}))
vi.mock('@/lib/services/pathways-client', () => ({ PathwaysClientError: class extends Error {} }))
vi.mock('@/lib/services/indicator-library-client', () => ({ indicatorLibraryClient: {} }))

const entry = {
  id: '79100000-0000-4000-8000-000000000001',
  code: 'WORKSHOP_ATTENDEES',
  name: 'Workshop attendees',
  description: null,
  unitLabel: 'people',
  dataSource: 'Attendance sheet',
  mode: 'MANUAL',
  numericKind: 'COUNT',
  direction: 'HIGHER_IS_BETTER',
  displayPrecision: 0,
  recipe: null,
  createdAt: '2026-10-01T00:00:00.000Z',
}
const render = () => renderToStaticMarkup(createElement(IndicatorLibraryManager))

describe('Indicator library page', () => {
  beforeEach(() => {
    state.roles = ['PROJECT_MANAGER']
    state.permissions = ['indicators.library.read']
    state.data = undefined
    state.error = null
  })
  it('shows a loading state, then the persisted empty state, with no invented entries', () => {
    expect(render()).toContain('Loading the indicator library')
    state.data = []
    const html = render()
    expect(html).toContain('No library entries yet')
    expect(html).not.toContain('WORKSHOP_ATTENDEES')
  })
  it('lists entries without management controls for a reader', () => {
    state.data = [entry]
    const html = render()
    expect(html).toContain('Workshop attendees')
    expect(html).toContain('WORKSHOP_ATTENDEES')
    expect(html).not.toContain('Add library entry')
    expect(html).not.toContain('Archive entry')
  })
  it('shows add and archive when the profile holds the permissions', () => {
    state.permissions = [
      'indicators.library.read',
      'indicators.library.create',
      'indicators.library.archive',
    ]
    state.data = [entry]
    const html = render()
    expect(html).toContain('Add library entry')
    expect(html).toContain('Archive entry')
    expect(html).toContain('rounded-xl')
  })
  it('hides management for a forged grant beyond the role ceiling', () => {
    state.roles = ['PROJECT_OFFICER']
    state.permissions = [
      'indicators.library.read',
      'indicators.library.create',
      'indicators.library.archive',
    ]
    state.data = [entry]
    const html = render()
    expect(html).not.toContain('Add library entry')
    expect(html).not.toContain('Archive entry')
  })
  it('shows a load failure instead of an empty library', () => {
    state.error = new Error('boom')
    const html = render()
    expect(html).toContain('could not be loaded')
    expect(html).not.toContain('No library entries yet')
  })
})
