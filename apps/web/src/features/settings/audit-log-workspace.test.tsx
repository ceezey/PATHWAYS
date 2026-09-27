/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  reads: vi.fn(),
  refetch: vi.fn(),
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({ profile: { userId: state.user } }),
}))
vi.mock('@/lib/auth/sensitive-drafts', () => ({
  useSensitiveDraftOwner: () =>
    state.authorized ? { key: state.user, generation: state.generation } : null,
}))
vi.mock('@/lib/services/core-feature-client', () => ({ coreDataClient: { audit: vi.fn() } }))
vi.mock('@/providers/authorized-query-provider', () => ({
  useAuthorizedRead: (key: string) => {
    state.reads(key)
    return {
      data: state.authorized
        ? {
            rows: state.empty
              ? []
              : Array.from({ length: state.many ? 12 : 1 }, (_, index) => ({
                  id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
                  occurredAt: '2026-09-27T16:30:00.123Z',
                  actorUserId: '20000000-0000-4000-8000-000000000002',
                  action: index === 11 ? 'UNIQUE_EVENT' : 'PROJECT_UPDATED',
                  entityType: 'Project',
                  entityId: '30000000-0000-4000-8000-000000000003',
                  projectId: '30000000-0000-4000-8000-000000000003',
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

describe('audit screen current access and business date', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.user = 'reviewer-1'
    state.generation = 0
    state.authorized = true
    state.error = false
    state.pending = false
    state.empty = false
    state.many = false
  })
  afterEach(cleanup)
  it('filters the next Manila business date rather than the UTC calendar date', () => {
    render(<AuditLogWorkspace />)
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-09-28' } })
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-09-28' } })
    expect(screen.getByText('PROJECT_UPDATED')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-09-27' } })
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-09-27' } })
    expect(screen.queryByText('PROJECT_UPDATED')).toBeNull()
    expect(screen.getByText('No matching audit records')).toBeTruthy()
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
  it('hides an open detail and cached rows when current audit verification fails', () => {
    const view = render(<AuditLogWorkspace />)
    fireEvent.click(screen.getByRole('button', { name: /View PROJECT_UPDATED for/ }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    state.error = true
    view.rerender(<AuditLogWorkspace />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('PROJECT_UPDATED')).toBeNull()
    expect(screen.getByLabelText('Module').textContent).toBe('All')
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
        'audit-events:2026-09-27T16:30:00.123Z|10000000-0000-4000-8000-000000000001',
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
      expect(state.reads).toHaveBeenLastCalledWith('audit-events:first')
    },
  )
  it('identifies each row action and resets pagination when search narrows a later page', () => {
    state.many = true
    render(<AuditLogWorkspace />)
    expect(screen.getAllByRole('button', { name: /View PROJECT_UPDATED for/ })).toHaveLength(10)
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('Page 2 of 2')).toBeTruthy()
    expect(screen.getByRole('button', { name: /View UNIQUE_EVENT for/ })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Actor, action, target, or event ID'), {
      target: { value: 'UNIQUE_EVENT' },
    })
    expect(screen.getByText('Page 1 of 1')).toBeTruthy()
    expect(screen.getByRole('button', { name: /View UNIQUE_EVENT for/ })).toBeTruthy()
  })
})
