import type { Activity } from '@/types/pathways'
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  profile: {
    organizationId: 'org-a',
    userId: 'actor-a',
    roles: ['PROJECT_OFFICER'],
    permissions: ['activities.proof.submit'],
    assignedProjectIds: ['project-a', 'project-b'],
  },
}))
const api = vi.hoisted(() => ({
  getActivityProofUploadLimits: vi.fn(),
  reserveActivityProofUpload: vi.fn(),
  uploadActivityProofFile: vi.fn(),
  finalizeActivityProofFile: vi.fn(),
  getActivity: vi.fn(),
}))
vi.mock('@/hooks/use-current-role', () => ({ useCurrentRole: () => ({ profile: state.profile }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('@/components/pathways', () => ({
  DialogShell: ({ children, title }: { children: ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/lib/services/pathways-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/pathways-client')>()),
  pathwaysClient: api,
}))

import { PathwaysClientError } from '@/lib/services/pathways-client'
import { ActivityProofDialog } from './activity-proof-dialog'

const activity = { id: 'activity-a', projectId: 'project-a', progress: 40 } as Activity

const limits = {
  maxFiles: 10,
  maxFileBytes: 5 * 1024 * 1024,
  maxTotalBytes: 25 * 1024 * 1024,
  contentTypes: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/webm',
  ],
}

const makeFile = (name: string, type: string, size = 1024) =>
  new File([new Uint8Array(size)], name, { type })

const selectFiles = (files: File[]) =>
  fireEvent.change(screen.getByLabelText(/Upload proof of conduct/), { target: { files } })

const renderDialog = (onSubmitted = vi.fn(), onOpenChange = vi.fn()) =>
  render(
    <ActivityProofDialog
      activity={activity}
      onOpenChange={onOpenChange}
      onSubmitted={onSubmitted}
      open
    />,
  )

beforeEach(() => {
  vi.clearAllMocks()
  api.getActivityProofUploadLimits.mockResolvedValue(limits)
})
afterEach(cleanup)

describe('ActivityProofDialog direct upload', () => {
  it('adds files additively across multiple selections', async () => {
    renderDialog()
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('a.pdf', 'application/pdf')])
    await screen.findByText('a.pdf')
    selectFiles([makeFile('b.jpg', 'image/jpeg')])
    await screen.findByText('b.jpg')
    expect(screen.getByText('a.pdf')).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('removes a selected file with its own remove control', async () => {
    renderDialog()
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('a.pdf', 'application/pdf'), makeFile('b.jpg', 'image/jpeg')])
    await screen.findByText('b.jpg')
    fireEvent.click(screen.getByRole('button', { name: 'Remove a.pdf' }))
    expect(screen.queryByText('a.pdf')).toBeNull()
    expect(screen.getByText('b.jpg')).toBeTruthy()
  })

  it('accepts a video file client-side', async () => {
    renderDialog()
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('clip.webm', 'video/webm')])
    await screen.findByText('clip.webm')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('rejects an unsupported type client-side without a network call', async () => {
    renderDialog()
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('note.gif', 'image/gif')])
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('not added'))
    expect(screen.queryByText('note.gif')).toBeNull()
    expect(api.reserveActivityProofUpload).not.toHaveBeenCalled()
  })

  it('rejects an oversize file client-side', async () => {
    renderDialog()
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('big.pdf', 'application/pdf', limits.maxFileBytes + 1)])
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('not added'))
    expect(screen.queryByText('big.pdf')).toBeNull()
  })

  it('submits a multi-file update and refreshes the activity on completion', async () => {
    const onSubmitted = vi.fn()
    api.reserveActivityProofUpload.mockResolvedValue({
      clientUpdateId: 'client-1',
      updateId: 'update-1',
      status: 'UPLOADING',
      files: [
        {
          evidenceId: 'evidence-1',
          fileName: 'a.pdf',
          contentType: 'application/pdf',
          byteSize: 1024,
          sha256: 'x'.repeat(64),
          storageReady: false,
          uploadUrl: 'https://storage.invalid/evidence-1',
        },
        {
          evidenceId: 'evidence-2',
          fileName: 'b.jpg',
          contentType: 'image/jpeg',
          byteSize: 1024,
          sha256: 'y'.repeat(64),
          storageReady: false,
          uploadUrl: 'https://storage.invalid/evidence-2',
        },
      ],
    })
    api.uploadActivityProofFile.mockResolvedValue(undefined)
    api.finalizeActivityProofFile.mockImplementation(async (_p, _a, _u, evidenceId: string) =>
      evidenceId === 'evidence-2'
        ? { status: 'COMMITTED', acknowledgement: {} }
        : { status: 'UPLOADING', updateId: 'update-1', remaining: 1 },
    )
    api.getActivity.mockResolvedValue(activity)
    renderDialog(onSubmitted)
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('a.pdf', 'application/pdf'), makeFile('b.jpg', 'image/jpeg')])
    await screen.findByText('b.jpg')
    fireEvent.change(screen.getByLabelText(/Narrative Notes/), {
      target: { value: 'Synthetic proof note' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(activity))
    expect(api.reserveActivityProofUpload).toHaveBeenCalledOnce()
    expect(api.uploadActivityProofFile).toHaveBeenCalledTimes(2)
    expect(api.finalizeActivityProofFile).toHaveBeenCalledTimes(2)
  })

  it('marks one failing file Failed and recovers it with Retry', async () => {
    const onSubmitted = vi.fn()
    api.reserveActivityProofUpload.mockResolvedValue({
      clientUpdateId: 'client-1',
      updateId: 'update-1',
      status: 'UPLOADING',
      files: [
        {
          evidenceId: 'evidence-1',
          fileName: 'a.pdf',
          contentType: 'application/pdf',
          byteSize: 1024,
          sha256: 'x'.repeat(64),
          storageReady: false,
          uploadUrl: 'https://storage.invalid/evidence-1',
        },
      ],
    })
    api.uploadActivityProofFile.mockRejectedValueOnce(
      new PathwaysClientError(
        'The file could not be uploaded. Retry this file.',
        'network',
        [],
        503,
      ),
    )
    renderDialog(onSubmitted)
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('a.pdf', 'application/pdf')])
    await screen.findByText('a.pdf')
    fireEvent.change(screen.getByLabelText(/Narrative Notes/), {
      target: { value: 'Synthetic proof note' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() =>
      expect(screen.getByText(/Failed:/).textContent).toContain(
        'The file could not be uploaded. Retry this file.',
      ),
    )
    api.uploadActivityProofFile.mockResolvedValueOnce(undefined)
    api.finalizeActivityProofFile.mockResolvedValueOnce({
      status: 'COMMITTED',
      acknowledgement: {},
    })
    api.getActivity.mockResolvedValue(activity)
    fireEvent.click(screen.getByRole('button', { name: 'Retry a.pdf' }))
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(activity))
    expect(api.uploadActivityProofFile).toHaveBeenCalledTimes(2)
  })

  it('shows a server rejection from the reservation call', async () => {
    api.reserveActivityProofUpload.mockRejectedValueOnce(
      new PathwaysClientError('Attach between one and ten evidence files.', 'invalid', [], 400),
    )
    renderDialog()
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('a.pdf', 'application/pdf')])
    await screen.findByText('a.pdf')
    fireEvent.change(screen.getByLabelText(/Narrative Notes/), {
      target: { value: 'Synthetic proof note' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Attach between one and ten evidence files.',
      ),
    )
    expect(api.uploadActivityProofFile).not.toHaveBeenCalled()
  })
})
