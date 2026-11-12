import { auditClient } from '@/lib/api/audit'
/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuditLogWorkspace } from './audit-log-workspace'

const state = vi.hoisted(() => ({
  user: 'reviewer-1',
  generation: 0,
  authorized: true,
  error: false,
  pending: false,
  empty: false,
  many: false,
  actorName: 'Fictional Reviewer' as string | null,
  actorUserId: '20000000-0000-4000-8000-000000000002' as string | null,
  reads: vi.fn(),
  refetch: vi.fn(),
  read: (_signal: AbortSignal) => undefined as unknown,
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({ profile: { userId: state.user } }),
}))
vi.mock('@/lib/auth/sensitive-drafts', () => ({
  useSensitiveDraftOwner: () =>
    state.authorized ? { key: state.user, generation: state.generation } : null,
}))
vi.mock('@/lib/api/audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/audit')>()),
  auditClient: { list: vi.fn() },
}))
vi.mock('@/components/ui/select', async () =>
  (await import('@/test/fixtures/beneficiary-form-fixtures')).selectMock(),
)
vi.mock('@/hooks/use-authorized-read', () => ({
  useAuthorizedRead: (
    key: string,
    _projectId: unknown,
    _permission: string,
    read: (signal: AbortSignal) => unknown,
    enabled = true,
  ) => {
    state.reads(key, enabled)
    state.read = read
    return {
      data: state.authorized
        ? {
            rows: state.empty
              ? []
              : Array.from({ length: state.many ? 12 : 1 }, (_, index) => ({
                  id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
                  occurredAt: '2026-09-27T16:30:00.123Z',
                  actorUserId: state.actorUserId,
                  actorName: state.actorName,
                  action: index === 11 ? 'UNIQUE_EVENT' : 'PROJECT_UPDATED',
                  entityType: 'Project',
                  entityId: '30000000-0000-4000-8000-000000000003',
                  projectId: '30000000-0000-4000-8000-000000000003',
                  details: index === 0 ? { source: 'TYPED', rowNumber: 5 } : {},
                })),
            nextCursor: '2026-09-27T16:30:00.123Z|10000000-0000-4000-8000-000000000001',
          }
        : undefined,
      isPending: state.pending,
      isError: state.error,
      refetch: state.refetch,
    }
  },
}))

describe('audit screen current access and server filters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.user = 'reviewer-1'
    state.generation = 0
    state.authorized = true
    state.error = false
    state.pending = false
    state.empty = false
    state.many = false
    state.actorName = 'Fictional Reviewer'
    state.actorUserId = '20000000-0000-4000-8000-000000000002'
  })
  afterEach(cleanup)
  it('offers readable module names and labels rows with them', () => {
    render(<AuditLogWorkspace />)
    expect(screen.getByRole('option', { name: 'Projects' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'Project' })).toBeNull()
    expect(screen.getByRole('cell', { name: 'Projects' })).toBeTruthy()
  })
  it('sends module and dates to the server and resets the cursor', () => {
    render(<AuditLogWorkspace />)
    fireEvent.click(screen.getByRole('button', { name: 'Load older events' }))
    fireEvent.change(screen.getByLabelText('Module'), { target: { value: 'projects' } })
    expect(state.reads).toHaveBeenLastCalledWith('audit-events:module=projects', true)
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-09-28' } })
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-09-28' } })
    expect(state.reads).toHaveBeenLastCalledWith(
      'audit-events:module=projects&from=2026-09-28&to=2026-09-28',
      true,
    )
    const signal = new AbortController().signal
    state.read(signal)
    expect(auditClient.list).toHaveBeenLastCalledWith(
      { module: 'projects', from: '2026-09-28', to: '2026-09-28', q: undefined },
      undefined,
      signal,
    )
  })
  it('applies the keyword only on search', () => {
    render(<AuditLogWorkspace />)
    fireEvent.change(screen.getByLabelText('Actor, action, target, or event ID'), {
      target: { value: 'UNIQUE_EVENT' },
    })
    expect(state.reads).toHaveBeenLastCalledWith('audit-events:first', true)
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(state.reads).toHaveBeenLastCalledWith('audit-events:q=UNIQUE_EVENT', true)
  })
  it('blocks a reversed date range without reading', () => {
    render(<AuditLogWorkspace />)
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-09-29' } })
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-09-28' } })
    expect(state.reads.mock.lastCall?.[1]).toBe(false)
    expect(screen.getByText('Choose a From date on or before the To date.')).toBeTruthy()
    expect(screen.queryByText('PROJECT_UPDATED')).toBeNull()
  })
  it('a filter change returns to the first table page', () => {
    state.many = true
    render(<AuditLogWorkspace />)
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Page 2 of 2')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Module'), { target: { value: 'projects' } })
    expect(screen.getByText('Page 1 of 2')).toBeTruthy()
  })
  it('announces loading politely without an error alert, retry or unavailable state', () => {
    state.pending = true
    render(<AuditLogWorkspace />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry audit access' })).toBeNull()
    expect(screen.queryByText('Audit records unavailable')).toBeNull()
    expect(screen.getByLabelText('Loading content')).toBeTruthy()
    expect(screen.queryByText('PROJECT_UPDATED')).toBeNull()
  })
  it('shows the allowlisted details of an event in its detail dialog', () => {
    render(<AuditLogWorkspace />)
    fireEvent.click(screen.getByRole('button', { name: /View PROJECT_UPDATED for/ }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('Source').nextElementSibling?.textContent).toBe('TYPED')
    expect(dialog.getByText('Row number').nextElementSibling?.textContent).toBe('5')
  })
  it('shows no details for an event without any', () => {
    state.many = true
    render(<AuditLogWorkspace />)
    fireEvent.click(screen.getAllByRole('button', { name: /View PROJECT_UPDATED for/ })[1])
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('10000000-0000-4000-8000-000000000002')).toBeTruthy()
    expect(dialog.queryByText('Source')).toBeNull()
    expect(dialog.queryByText('Row number')).toBeNull()
  })
  it('hides an open detail and cached rows when current audit verification fails', () => {
    const view = render(<AuditLogWorkspace />)
    fireEvent.click(screen.getByRole('button', { name: /View PROJECT_UPDATED for/ }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    state.error = true
    view.rerender(<AuditLogWorkspace />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('PROJECT_UPDATED')).toBeNull()
    expect((screen.getByLabelText('Module') as HTMLSelectElement).value).toBe('All')
    expect(screen.getByRole('button', { name: 'Load older events' }).hasAttribute('disabled')).toBe(
      true,
    )
    expect(screen.getByRole('alert').textContent).toContain(
      'Current audit access could not be verified.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry audit access' }))
    expect(state.refetch).toHaveBeenCalledOnce()
  })
  it.each(['identity', 'generation', 'revocation'])(
    'clears dialog, private filters and cursor when %s ownership changes',
    (boundary) => {
      const view = render(<AuditLogWorkspace />)
      fireEvent.change(screen.getByLabelText('Actor, action, target, or event ID'), {
        target: { value: 'PROJECT_UPDATED' },
      })
      fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-09-28' } })
      fireEvent.click(screen.getByRole('button', { name: 'Load older events' }))
      expect(state.reads).toHaveBeenLastCalledWith(
        `audit-events:from=2026-09-28&cursor=${encodeURIComponent('2026-09-27T16:30:00.123Z|10000000-0000-4000-8000-000000000001')}`,
        true,
      )
      fireEvent.click(screen.getByRole('button', { name: /View PROJECT_UPDATED for/ }))
      expect(screen.getByRole('dialog')).toBeTruthy()
      if (boundary === 'identity') state.user = 'reviewer-2'
      if (boundary === 'generation') state.generation++
      if (boundary === 'revocation') state.authorized = false
      state.empty = true
      view.rerender(<AuditLogWorkspace />)
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.queryByText('PROJECT_UPDATED')).toBeNull()
      expect((screen.getByLabelText('From date') as HTMLInputElement).value).toBe('')
      expect(
        (screen.getByLabelText('Actor, action, target, or event ID') as HTMLInputElement).value,
      ).toBe('')
      expect(state.reads).toHaveBeenLastCalledWith('audit-events:first', true)
    },
  )
  it('shows the resolved actor name', () => {
    render(<AuditLogWorkspace />)
    expect(screen.getByText('Fictional Reviewer')).toBeTruthy()
  })
  it('shows "Unknown user" with the id when the actor cannot be resolved in scope', () => {
    state.actorName = null
    render(<AuditLogWorkspace />)
    expect(screen.getByText('Unknown user')).toBeTruthy()
    expect(screen.getByText(state.actorUserId as string)).toBeTruthy()
  })
  it('shows "System" when there is no actor at all', () => {
    state.actorName = null
    state.actorUserId = null
    render(<AuditLogWorkspace />)
    expect(screen.getByText('System')).toBeTruthy()
  })
})
