/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PublicMediaQueue } from './public-media-queue'

const projectId = '10000000-0000-4000-8000-000000000001'
const mediaId = '20000000-0000-4000-8000-000000000001'
const item = (patch: object = {}) => ({
  id: mediaId,
  type: 'PHOTO',
  contentType: 'image/jpeg',
  fileName: 'visit.jpg',
  source: 'UPLOAD',
  status: 'PENDING',
  publicStatus: 'FOR_REVIEW',
  submittedById: 'uploader',
  publicSubmittedById: 'uploader',
  rejectionReason: null,
  pickable: false,
  ...patch,
})

const state = vi.hoisted(() => ({
  user: 'reviewer',
  permissions: [] as string[],
  items: [] as object[],
  needsStepUp: false,
  refetch: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('@/hooks/use-current-role', () => ({
  useCurrentRole: () => ({ profile: { userId: state.user } }),
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
  ) => ({
    data: enabled
      ? { items: state.items, beneficiaryMediaNeedsStepUp: state.needsStepUp }
      : undefined,
    isPending: false,
    isError: false,
    error: null,
    refetch: state.refetch,
  }),
}))
vi.mock('@/lib/api/public-media', () => ({
  publicMediaClient: {
    list: vi.fn(),
    approve: (...args: unknown[]) => state.approve(...args),
    reject: (...args: unknown[]) => state.reject(...args),
  },
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: (m: string) => state.toastError(m) },
}))
vi.mock('./public-media-thumb', () => ({ PublicMediaThumb: () => <span data-testid="thumb" /> }))

describe('public media queue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.user = 'reviewer'
    state.permissions = ['public.preview', 'public.approve', 'evidence.read']
    state.items = [item()]
    state.needsStepUp = false
    state.refetch.mockResolvedValue(undefined)
    state.approve.mockResolvedValue(undefined)
    state.reject.mockResolvedValue(undefined)
  })
  afterEach(cleanup)

  it('offers step-up when beneficiary media is hidden from the queue', () => {
    state.needsStepUp = true
    render(<PublicMediaQueue projectId={projectId} />)
    expect(
      screen.getByText('Beneficiary photos and videos are hidden until you verify again.'),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Verify again' })).toBeTruthy()
  })

  it('lists only items awaiting approval under the queue title', () => {
    state.items = [
      item(),
      item({
        id: '20000000-0000-4000-8000-000000000002',
        fileName: 'done.jpg',
        publicStatus: 'APPROVED',
      }),
      item({ id: '20000000-0000-4000-8000-000000000003', fileName: 'no.jpg', status: 'REJECTED' }),
    ]
    render(<PublicMediaQueue projectId={projectId} />)
    expect(screen.getByText('Awaiting public media approval')).toBeTruthy()
    expect(screen.getByText('visit.jpg')).toBeTruthy()
    expect(screen.queryByText('done.jpg')).toBeNull()
    expect(screen.queryByText('no.jpg')).toBeNull()
    expect(screen.getAllByTestId('thumb')).toHaveLength(1)
  })

  it('approves one item and reloads the list', async () => {
    render(<PublicMediaQueue projectId={projectId} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve visit.jpg' }))
    await waitFor(() => expect(state.approve).toHaveBeenCalledWith(projectId, mediaId))
    await waitFor(() => expect(state.refetch).toHaveBeenCalled())
  })

  it.each([
    ['uploader', { submittedById: 'reviewer' }],
    ['queue sender', { publicSubmittedById: 'reviewer' }],
  ])('hides Approve for the %s', (_who, patch) => {
    state.items = [item(patch)]
    render(<PublicMediaQueue projectId={projectId} />)
    expect(screen.queryByRole('button', { name: 'Approve visit.jpg' })).toBeNull()
  })

  it('shows no actions without the approve permission', () => {
    state.permissions = ['public.preview', 'evidence.read']
    render(<PublicMediaQueue projectId={projectId} />)
    expect(screen.getByText('visit.jpg')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Approve|Reject/ })).toBeNull()
  })

  it('requires a reason before rejecting and sends it trimmed', async () => {
    render(<PublicMediaQueue projectId={projectId} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reject visit.jpg' }))
    const confirm = screen.getByRole('button', { name: 'Reject media' }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    const reason = screen.getByLabelText('Rejection reason') as HTMLTextAreaElement
    expect(reason.maxLength).toBe(2000)
    fireEvent.change(reason, { target: { value: '   ' } })
    expect(confirm.disabled).toBe(true)
    fireEvent.change(reason, { target: { value: '  Shows a minor  ' } })
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    await waitFor(() =>
      expect(state.reject).toHaveBeenCalledWith(projectId, mediaId, 'Shows a minor'),
    )
    await waitFor(() => expect(state.refetch).toHaveBeenCalled())
  })

  it('shows the server message when approval fails', async () => {
    state.approve.mockRejectedValue(new Error('A different reviewer must approve this media.'))
    render(<PublicMediaQueue projectId={projectId} />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve visit.jpg' }))
    await waitFor(() =>
      expect(state.toastError).toHaveBeenCalledWith(
        'A different reviewer must approve this media.',
      ),
    )
  })

  it('explains missing evidence access instead of an empty queue', () => {
    state.permissions = ['public.preview', 'public.approve']
    render(<PublicMediaQueue projectId={projectId} />)
    expect(screen.getByText('You need evidence access to review the media queue.')).toBeTruthy()
  })
})
