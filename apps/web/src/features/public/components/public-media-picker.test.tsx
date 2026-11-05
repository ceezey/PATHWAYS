/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PathwaysClientError } from '@/lib/api/core/request'
import {
  STEP_UP_COMPLETED_EVENT,
  STEP_UP_REQUIRED_EVENT,
} from '@/lib/auth/beneficiary-step-up-events'

import { PublicMediaPicker } from './public-media-picker'

const projectId = '10000000-0000-4000-8000-000000000001'
const ids = [1, 2, 3, 4].map((n) => `20000000-0000-4000-8000-00000000000${n}`)
const item = (n: number, patch: object = {}) => ({
  id: ids[n],
  type: 'PHOTO',
  contentType: 'image/jpeg',
  fileName: `photo-${n}.jpg`,
  source: 'UPLOAD',
  status: 'PENDING',
  publicStatus: 'APPROVED',
  submittedById: 'someone',
  publicSubmittedById: 'someone',
  rejectionReason: null,
  pickable: true,
  ...patch,
})

const state = vi.hoisted(() => ({
  permissions: [] as string[],
  items: [] as object[],
  needsStepUp: false,
  error: null as unknown,
  refetch: vi.fn(),
  submit: vi.fn(),
  toastError: vi.fn(),
  reads: [] as boolean[],
}))
vi.mock('@/hooks/use-permission', () => ({
  usePermission: () => (permission: string) => state.permissions.includes(permission),
}))
vi.mock('@/hooks/use-authorized-read', () => ({
  useAuthorizedRead: (
    _key: string,
    _id: string,
    _permission: string,
    _read: unknown,
    enabled = true,
  ) => {
    state.reads.push(enabled)
    return {
      data:
        enabled && !state.error
          ? { items: state.items, beneficiaryMediaNeedsStepUp: state.needsStepUp }
          : undefined,
      isPending: false,
      isError: Boolean(state.error),
      error: state.error,
      refetch: state.refetch,
    }
  },
}))
vi.mock('@/lib/api/public-media', () => ({
  publicMediaClient: { list: vi.fn(), submit: (...args: unknown[]) => state.submit(...args) },
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: (m: string) => state.toastError(m) },
}))
vi.mock('./public-media-thumb', () => ({ PublicMediaThumb: () => <span data-testid="thumb" /> }))
vi.mock('./add-public-media-dialog', () => ({
  AddPublicMediaDialog: () => <dialog open>Upload dialog</dialog>,
}))

describe('public media picker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.permissions = ['public.preview', 'evidence.read']
    state.items = []
    state.needsStepUp = false
    state.error = null
    state.reads = []
    state.refetch.mockResolvedValue(undefined)
    state.submit.mockResolvedValue(undefined)
  })
  afterEach(cleanup)

  it('offers only pickable items and adds one with a blank caption', () => {
    state.items = [
      item(0),
      item(1, { pickable: false, publicStatus: 'FOR_REVIEW' }),
      item(2, { pickable: false, status: 'REJECTED', rejectionReason: 'Too blurry' }),
    ]
    const onChange = vi.fn()
    render(<PublicMediaPicker projectId={projectId} value={[]} onChange={onChange} />)
    expect(screen.getByRole('tab', { name: 'From the system' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Upload new' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add photo-1.jpg' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add photo-2.jpg' })).toBeNull()
    expect(screen.getByText('Awaiting public media approval')).toBeTruthy()
    expect(screen.getByText('Rejected: Too blurry')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add photo-0.jpg' }))
    expect(onChange).toHaveBeenCalledWith([{ id: ids[0], caption: '' }])
  })

  it('stops adding at 24 items and while disabled', () => {
    state.items = [item(0)]
    const full = Array.from({ length: 24 }, (_, n) => ({
      id: `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      caption: 'c',
    }))
    const view = render(<PublicMediaPicker projectId={projectId} value={full} onChange={vi.fn()} />)
    expect(
      (screen.getByRole('button', { name: 'Add photo-0.jpg' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    view.rerender(
      <PublicMediaPicker projectId={projectId} value={[]} onChange={vi.fn()} disabled />,
    )
    expect(
      (screen.getByRole('button', { name: 'Add photo-0.jpg' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it('sends a beneficiary item for public approval and reloads the list', async () => {
    state.items = [
      item(0, {
        source: 'BENEFICIARY',
        pickable: false,
        publicStatus: 'PRIVATE',
        status: 'PENDING',
      }),
      item(1, { source: 'ACTIVITY', pickable: false, publicStatus: 'PRIVATE', status: 'PENDING' }),
    ]
    render(<PublicMediaPicker projectId={projectId} value={[]} onChange={vi.fn()} />)
    const send = screen.getAllByRole('button', { name: 'Send for public approval' })
    expect(send).toHaveLength(1)
    fireEvent.click(send[0])
    await waitFor(() => expect(state.submit).toHaveBeenCalledWith(projectId, ids[0]))
    await waitFor(() => expect(state.refetch).toHaveBeenCalled())
  })

  it('shows the server message when sending for approval fails', async () => {
    state.items = [item(0, { source: 'BENEFICIARY', pickable: false, publicStatus: 'PRIVATE' })]
    state.submit.mockRejectedValue(new Error('Beneficiary media access is required.'))
    render(<PublicMediaPicker projectId={projectId} value={[]} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Send for public approval' }))
    await waitFor(() =>
      expect(state.toastError).toHaveBeenCalledWith('Beneficiary media access is required.'),
    )
  })

  it.each(['no permission', 'forbidden answer'] as const)(
    'explains missing evidence access on From the system and keeps Upload new (%s)',
    (cause) => {
      if (cause === 'no permission') state.permissions = ['public.preview']
      else
        state.error = new PathwaysClientError(
          'Evidence access is required to view media.',
          'forbidden',
          [],
          403,
        )
      render(<PublicMediaPicker projectId={projectId} value={[]} onChange={vi.fn()} />)
      expect(
        screen.getByText('You need evidence access to pick existing media. Upload new instead.'),
      ).toBeTruthy()
      if (cause === 'no permission') expect(state.reads.every((enabled) => !enabled)).toBe(true)
      fireEvent.mouseDown(screen.getByRole('tab', { name: 'Upload new' }))
      fireEvent.click(screen.getByRole('button', { name: 'Choose photos or videos' }))
      expect(screen.getByText('Upload dialog')).toBeTruthy()
    },
  )

  it('edits captions, flags a blank one and keeps the 300 character limit', () => {
    state.items = [item(0), item(1)]
    const onChange = vi.fn()
    const value = [
      { id: ids[0], caption: 'First' },
      { id: ids[1], caption: '' },
    ]
    render(<PublicMediaPicker projectId={projectId} value={value} onChange={onChange} />)
    const blank = screen.getByLabelText('Public caption for photo-1.jpg') as HTMLInputElement
    expect(blank.getAttribute('aria-invalid')).toBe('true')
    expect(blank.maxLength).toBe(300)
    expect(screen.getByText('A caption is required for every photo or video.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Public caption for photo-0.jpg'), {
      target: { value: 'Edited' },
    })
    expect(onChange).toHaveBeenCalledWith([{ id: ids[0], caption: 'Edited' }, value[1]])
  })

  it('reorders and removes chosen items', () => {
    state.items = [item(0), item(1)]
    const onChange = vi.fn()
    const value = [
      { id: ids[0], caption: 'A' },
      { id: ids[1], caption: 'B' },
    ]
    render(<PublicMediaPicker projectId={projectId} value={value} onChange={onChange} />)
    expect(
      (screen.getByRole('button', { name: 'Move photo-0.jpg up' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Move photo-1.jpg down' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Move photo-0.jpg down' }))
    expect(onChange).toHaveBeenLastCalledWith([value[1], value[0]])
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo-0.jpg' }))
    expect(onChange).toHaveBeenLastCalledWith([value[1]])
  })

  it('lists a chosen item once and marks it added in the system list', () => {
    state.items = [item(0)]
    render(
      <PublicMediaPicker
        projectId={projectId}
        value={[{ id: ids[0], caption: 'A' }]}
        onChange={vi.fn()}
      />,
    )
    const existing = within(screen.getByRole('list', { name: 'Existing media' }))
    expect(existing.getByText('Added')).toBeTruthy()
    expect(existing.queryByRole('button', { name: 'Add photo-0.jpg' })).toBeNull()
    expect(
      within(screen.getByRole('list', { name: 'Chosen media' })).getAllByRole('listitem'),
    ).toHaveLength(1)
  })

  it('flags chosen items that are no longer publishable and reports the block', () => {
    state.items = [item(0), item(1, { pickable: false, status: 'REJECTED' })]
    const onBlockedChange = vi.fn()
    const value = [
      { id: ids[0], caption: 'A' },
      { id: ids[1], caption: 'B' },
    ]
    const view = render(
      <PublicMediaPicker
        projectId={projectId}
        value={value}
        onChange={vi.fn()}
        onBlockedChange={onBlockedChange}
      />,
    )
    const chosen = within(screen.getByRole('list', { name: 'Chosen media' }))
    expect(chosen.getAllByText('No longer publishable. Remove it to submit.')).toHaveLength(1)
    expect(screen.getByRole('alert').textContent).toBe(
      'A chosen photo or video is no longer publishable. Remove it to submit.',
    )
    expect(onBlockedChange).toHaveBeenLastCalledWith(true)
    view.rerender(
      <PublicMediaPicker
        projectId={projectId}
        value={[value[0]]}
        onChange={vi.fn()}
        onBlockedChange={onBlockedChange}
      />,
    )
    expect(screen.queryByText('No longer publishable. Remove it to submit.')).toBeNull()
    expect(onBlockedChange).toHaveBeenLastCalledWith(false)
  })

  it('does not flag or block a chosen item that is absent from the list', () => {
    state.items = [item(0)]
    const onBlockedChange = vi.fn()
    render(
      <PublicMediaPicker
        projectId={projectId}
        value={[{ id: ids[2], caption: 'Beneficiary item an aggregate-only user cannot see' }]}
        onChange={vi.fn()}
        onBlockedChange={onBlockedChange}
      />,
    )
    expect(screen.queryByText('No longer publishable. Remove it to submit.')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(onBlockedChange).toHaveBeenLastCalledWith(false)
  })

  it('offers step-up when beneficiary media is hidden and reloads once verified', () => {
    state.items = [item(0)]
    state.needsStepUp = true
    const onBlockedChange = vi.fn()
    const required = vi.fn()
    window.addEventListener(STEP_UP_REQUIRED_EVENT, required)
    render(
      <PublicMediaPicker
        projectId={projectId}
        value={[{ id: ids[2], caption: 'Hidden' }]}
        onChange={vi.fn()}
        onBlockedChange={onBlockedChange}
      />,
    )
    expect(
      screen.getByText('Beneficiary photos and videos are hidden until you verify again.'),
    ).toBeTruthy()
    expect(screen.queryByText('No longer publishable. Remove it to submit.')).toBeNull()
    expect(onBlockedChange).toHaveBeenLastCalledWith(false)
    fireEvent.click(screen.getByRole('button', { name: 'Verify again' }))
    expect(required).toHaveBeenCalledOnce()
    window.dispatchEvent(new Event(STEP_UP_COMPLETED_EVENT))
    expect(state.refetch).toHaveBeenCalled()
    window.removeEventListener(STEP_UP_REQUIRED_EVENT, required)
  })
})
