import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'
import type { Activity, ActivityProof } from '@/types/pathways'
/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Children, type ReactNode, createElement, isValidElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const access = vi.hoisted(() => ({
  access: 'ready',
  profile: {
    id: '50000000-0000-4000-8000-000000000005',
    userId: '60000000-0000-4000-8000-000000000006',
    organizationId: '10000000-0000-4000-8000-000000000001',
    roles: ['MONITORING_AND_EVALUATION_OFFICER'],
    permissions: ['evidence.review'],
    assignedProjectIds: ['20000000-0000-4000-8000-000000000002'],
    aal: 'aal2',
    fullName: 'Synthetic reviewer',
  },
}))
const api = vi.hoisted(() => ({ reviewActivityUpdate: vi.fn() }))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => access }))
vi.mock('@/hooks/use-session', () => ({
  useSession: () => ({ session: { user: { id: access.profile.id } } }),
}))
vi.mock('@/lib/services/pathways-client', () => ({ pathwaysClient: api }))
vi.mock('./private-proof-inspection', () => ({
  PrivateProofInspection: () => <div>Private verification controls</div>,
}))
vi.mock('./activity-proof-files', () => ({ ActivityProofFiles: () => <div>Proof metadata</div> }))
vi.mock('@/components/pathways', () => ({
  DialogShell: ({ children, title }: { children: ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
  StatusBadge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/ui/select', () => {
  const SelectContent = () => null
  const SelectItem = () => null
  const SelectTrigger = () => null
  return {
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue: () => null,
    Select: ({
      children,
      value,
      onValueChange,
      disabled,
    }: {
      children: ReactNode
      value: string
      onValueChange(value: string): void
      disabled: boolean
    }) => {
      let trigger: Record<string, unknown> = {}
      const options: ReactNode[] = []
      Children.forEach(children, (child) => {
        if (!isValidElement(child)) return
        if (child.type === SelectTrigger) trigger = child.props as Record<string, unknown>
        if (child.type === SelectContent)
          Children.forEach((child.props as { children: ReactNode }).children, (item) => {
            if (!isValidElement(item) || item.type !== SelectItem) return
            const props = item.props as { value: string; children: ReactNode }
            options.push(
              createElement('option', { key: props.value, value: props.value }, props.children),
            )
          })
      })
      return createElement(
        'select',
        {
          ...trigger,
          value,
          disabled,
          onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
            onValueChange(event.target.value),
        },
        options,
      )
    },
  }
})
import { ActivityProofReviewDialog } from './activity-proof-review-dialog'
const projectId = '20000000-0000-4000-8000-000000000002'
const activityId = '30000000-0000-4000-8000-000000000003'
const updateId = '40000000-0000-4000-8000-000000000004'
const revision = '2026-09-27T00:00:00.000Z'
const activity = {
  id: activityId,
  projectId,
  title: 'Synthetic activity',
  updateNotes: [{ id: updateId, progress: 45, status: 'Submitted', updatedAt: revision }],
} as Activity
const proof = {
  id: '80000000-0000-4000-8000-000000000008',
  updateId,
  status: 'Submitted',
  updateUpdatedAt: revision,
} as ActivityProof
const onUpdated = vi.fn()
const onOpenChange = vi.fn()
const props = { activity, proof, open: true, mode: 'validate' as const, onUpdated, onOpenChange }
beforeEach(() => {
  vi.resetAllMocks()
  access.access = 'ready'
  access.profile.roles = ['MONITORING_AND_EVALUATION_OFFICER']
  access.profile.permissions = ['evidence.review']
  access.profile.assignedProjectIds = [projectId]
  api.reviewActivityUpdate.mockResolvedValue(activity)
})
afterEach(cleanup)
describe('active canonical M&E review dialog', () => {
  it('submits exact pending update/revision and required reason to the existing review API', async () => {
    render(<ActivityProofReviewDialog {...props} />)
    expect(screen.getByRole('button', { name: 'Approve update' }).hasAttribute('disabled')).toBe(
      true,
    )
    expect(
      screen.getByRole('combobox', { name: 'Review decision' }).getAttribute('aria-required'),
    ).toBe('true')
    fireEvent.change(screen.getByLabelText('Review reason'), {
      target: { value: ' Evidence checked ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Approve update' }))
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(activity))
    expect(api.reviewActivityUpdate).toHaveBeenCalledWith(
      projectId,
      activityId,
      updateId,
      'APPROVE',
      'Evidence checked',
      revision,
      expect.objectContaining({
        principalKey: expect.any(String),
        isCurrent: expect.any(Function),
      }),
    )
    expect(api.reviewActivityUpdate.mock.calls[0][6].isCurrent()).toBe(true)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
  it('returns the same bound update without a PM second-stage capability', async () => {
    render(<ActivityProofReviewDialog {...props} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Review decision' }), {
      target: { value: 'RETURN' },
    })
    fireEvent.change(screen.getByLabelText('Review reason'), {
      target: { value: 'Correct the evidence.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Return for revision' }))
    await waitFor(() =>
      expect(api.reviewActivityUpdate).toHaveBeenCalledWith(
        projectId,
        activityId,
        updateId,
        'RETURN',
        'Correct the evidence.',
        revision,
        expect.objectContaining({
          principalKey: expect.any(String),
          isCurrent: expect.any(Function),
        }),
      ),
    )
    expect(api.reviewActivityUpdate.mock.calls[0][6].isCurrent()).toBe(true)
  })
  it.each(['PROJECT_OFFICER', 'PROJECT_MANAGER'])(
    'does not render review controls for %s',
    (role) => {
      access.profile.roles = [role]
      render(<ActivityProofReviewDialog {...props} />)
      expect(screen.queryByRole('button', { name: 'Approve update' })).toBeNull()
      expect(api.reviewActivityUpdate).not.toHaveBeenCalled()
    },
  )
  it('disables review when selected proof and pending update revisions differ', () => {
    render(
      <ActivityProofReviewDialog
        {...props}
        proof={{ ...proof, updateUpdatedAt: '2026-09-27T00:00:00.001Z' }}
      />,
    )
    expect(screen.getByRole('alert').textContent).toContain('changed')
    expect(screen.getByRole('button', { name: 'Approve update' }).hasAttribute('disabled')).toBe(
      true,
    )
  })
  it.each(['grant', 'assignment', 'logout', 'unmount'])(
    'discards delayed completion after %s invalidation',
    async (reason) => {
      let resolve!: (value: Activity) => void
      api.reviewActivityUpdate.mockReturnValue(
        new Promise((done) => {
          resolve = done
        }),
      )
      const view = render(<ActivityProofReviewDialog {...props} />)
      fireEvent.change(screen.getByLabelText('Review reason'), { target: { value: 'Checked.' } })
      fireEvent.click(screen.getByRole('button', { name: 'Approve update' }))
      if (reason === 'unmount') view.unmount()
      else if (reason === 'logout') act(() => clearSensitiveDraftStorage())
      else {
        if (reason === 'grant') access.profile.permissions = []
        else access.profile.assignedProjectIds = []
        view.rerender(<ActivityProofReviewDialog {...props} />)
      }
      await act(async () => resolve(activity))
      expect(onUpdated).not.toHaveBeenCalled()
      expect(onOpenChange).not.toHaveBeenCalled()
    },
  )
  it('prevents duplicate pending requests and reports uncertain failure without automatic replay', async () => {
    let reject!: (error: Error) => void
    api.reviewActivityUpdate.mockReturnValue(
      new Promise((_done, fail) => {
        reject = fail
      }),
    )
    render(<ActivityProofReviewDialog {...props} />)
    fireEvent.change(screen.getByLabelText('Review reason'), { target: { value: 'Checked.' } })
    const button = screen.getByRole('button', { name: 'Approve update' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(api.reviewActivityUpdate).toHaveBeenCalledTimes(1)
    await act(async () => reject(new Error('synthetic uncertain transport')))
    expect(screen.getByRole('alert').textContent).toContain('Reload the activity')
    expect(onUpdated).not.toHaveBeenCalled()
  })
})
