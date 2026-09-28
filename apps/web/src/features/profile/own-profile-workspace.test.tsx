import { clearSensitiveDraftStorage } from '@/lib/auth/sensitive-drafts'
/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OwnProfileWorkspace } from './own-profile-workspace'

const state = vi.hoisted(() => ({
  subject: 'synthetic-a',
  permissions: ['profile.manage'],
  read: vi.fn(),
  update: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('@/hooks/use-session', () => ({
  useSession: () => ({
    email: `${state.subject}@example.invalid`,
    session: { user: { id: state.subject } },
  }),
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({
    profile: {
      id: state.subject,
      userId: state.subject,
      organizationId: 'synthetic-org',
      roles: ['PROJECT_MANAGER'],
      assignedProjectIds: [],
      permissions: state.permissions,
    },
    access: 'ready',
    refreshAccess: state.refresh,
  }),
}))
vi.mock('@/lib/services/own-profile-client', () => ({
  ownProfileClient: { read: state.read, update: state.update },
}))
vi.mock('./own-password-form', () => ({
  OwnPasswordForm: () => <button type="button">Verify password</button>,
}))
vi.mock('./own-step-up-pin-form', () => ({
  OwnStepUpPinForm: () => <p>Beneficiary PIN form</p>,
}))
vi.mock('@/components/layout/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

const record = {
  fullName: 'Synthetic Person A',
  contactNumber: '+63000000000',
  updatedAt: '2026-09-27T01:00:00.001Z',
}
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  state.subject = 'synthetic-a'
  state.permissions = ['profile.manage']
  state.read.mockResolvedValue(record)
  state.update.mockResolvedValue({
    ...record,
    fullName: 'Revised Synthetic Name',
    updatedAt: '2026-09-27T01:00:00.002Z',
  })
})

describe('own profile editing', () => {
  it('shows the Beneficiary access PIN section only to Beneficiary detail roles', async () => {
    render(<OwnProfileWorkspace />)
    await screen.findByLabelText('Name')
    expect(screen.queryByText('Beneficiary PIN form')).toBeNull()
    cleanup()
    state.permissions = ['profile.manage', 'beneficiaries.records.read']
    render(<OwnProfileWorkspace />)
    expect(await screen.findByText('Beneficiary PIN form')).toBeTruthy()
    expect(screen.getByText('Beneficiary access PIN')).toBeTruthy()
  })

  it('updates only approved editable fields with the loaded revision', async () => {
    render(<OwnProfileWorkspace />)
    const input = await screen.findByLabelText('Name')
    fireEvent.change(input, { target: { value: 'Revised Synthetic Name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(() =>
      expect(state.update).toHaveBeenCalledWith({
        fullName: 'Revised Synthetic Name',
        contactNumber: '+63000000000',
        expectedUpdatedAt: record.updatedAt,
      }),
    )
    expect(screen.queryByLabelText(/email|role|organization|account status/i)).toBeNull()
    await waitFor(() => expect(state.refresh).toHaveBeenCalledOnce())
  })

  it('ignores a previous account read that finishes after switching accounts', async () => {
    let complete!: (value: typeof record) => void
    state.read.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve
      }),
    )
    const view = render(<OwnProfileWorkspace />)
    state.subject = 'synthetic-b'
    state.read.mockResolvedValue({ ...record, fullName: 'Synthetic Person B' })
    view.rerender(<OwnProfileWorkspace />)
    await screen.findByDisplayValue('Synthetic Person B')
    await act(async () => {
      complete(record)
    })
    expect(screen.queryByDisplayValue('Synthetic Person A')).toBeNull()
    expect(screen.getByDisplayValue('Synthetic Person B')).toBeTruthy()
  })

  it('does not render a dispatched read response after logout and returning to the same account', async () => {
    let complete!: (value: typeof record) => void
    state.read.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve
      }),
    )
    render(<OwnProfileWorkspace />)
    state.read.mockResolvedValue({ ...record, fullName: 'Synthetic Fresh Session' })
    await act(async () => {
      clearSensitiveDraftStorage()
    })
    await screen.findByDisplayValue('Synthetic Fresh Session')
    await act(async () => {
      complete(record)
    })
    expect(screen.queryByDisplayValue('Synthetic Person A')).toBeNull()
    expect(screen.getByDisplayValue('Synthetic Fresh Session')).toBeTruthy()
  })

  it('does not apply an old save result or notice to a new session for the same account', async () => {
    let complete!: (value: typeof record) => void
    state.update.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve
      }),
    )
    render(<OwnProfileWorkspace />)
    await screen.findByLabelText('Name')
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(() => expect(state.update).toHaveBeenCalledOnce())
    state.read.mockResolvedValue({ ...record, fullName: 'Synthetic Fresh Session' })
    await act(async () => {
      clearSensitiveDraftStorage()
    })
    await screen.findByDisplayValue('Synthetic Fresh Session')
    await act(async () => {
      complete({ ...record, fullName: 'Old Save Result' })
    })
    expect(screen.queryByDisplayValue('Old Save Result')).toBeNull()
    expect(screen.queryByText('Profile saved.')).toBeNull()
    expect(state.refresh).not.toHaveBeenCalled()
  })

  it('removes editable personal data and password controls when the grant disappears', async () => {
    const view = render(<OwnProfileWorkspace />)
    await screen.findByLabelText('Name')
    state.permissions = []
    view.rerender(<OwnProfileWorkspace />)
    expect(screen.queryByLabelText('Name')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Verify password' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save profile' })).toBeNull()
  })
})
