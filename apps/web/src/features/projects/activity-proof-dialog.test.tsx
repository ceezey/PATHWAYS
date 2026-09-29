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
import { toast } from 'sonner'
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

  it('accepts the real first-commit finalize shape and shows the success toast without failing any file', async () => {
    const onSubmitted = vi.fn()
    const committedActivity = {
      ...activity,
      status: 'For Review',
      sourceAcknowledgement: { requestId: 'req-1', committed: true, replayed: false },
    }
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
    api.uploadActivityProofFile.mockResolvedValue(undefined)
    // The real API shape on the first commit: `{ status: 'COMMITTED', activity }`, not the
    // replay's `{ status: 'COMMITTED', acknowledgement }`.
    api.finalizeActivityProofFile.mockResolvedValueOnce({
      status: 'COMMITTED',
      activity: committedActivity,
    })
    renderDialog(onSubmitted)
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('a.pdf', 'application/pdf')])
    await screen.findByText('a.pdf')
    fireEvent.change(screen.getByLabelText(/Narrative Notes/), {
      target: { value: 'Synthetic proof note' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(committedActivity))
    expect(toast.success).toHaveBeenCalledOnce()
    expect(screen.queryByText(/Failed/)).toBeNull()
    // The first-commit shape already carries the current activity: no extra reload is needed.
    expect(api.getActivity).not.toHaveBeenCalled()
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

  it('resubmits after a partial failure by reusing the same clientUpdateId and reservation', async () => {
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
    renderDialog()
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('a.pdf', 'application/pdf')])
    await screen.findByText('a.pdf')
    fireEvent.change(screen.getByLabelText(/Narrative Notes/), {
      target: { value: 'Synthetic proof note' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() => expect(screen.getByText(/Failed:/)).toBeTruthy())
    api.uploadActivityProofFile.mockResolvedValueOnce(undefined)
    api.finalizeActivityProofFile.mockResolvedValueOnce({
      status: 'COMMITTED',
      acknowledgement: {},
    })
    api.getActivity.mockResolvedValue(activity)
    // Resubmit through the form's own Submit control, not the per-file Retry control: this is
    // the path that used to mint a second reservation.
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() => expect(api.getActivity).toHaveBeenCalledOnce())
    expect(api.reserveActivityProofUpload).toHaveBeenCalledOnce()
    const [reservedCall] = api.reserveActivityProofUpload.mock.calls
    expect(reservedCall[0].clientUpdateId).toBe(
      api.reserveActivityProofUpload.mock.calls[0][0].clientUpdateId,
    )
    expect(api.reserveActivityProofUpload).toHaveBeenCalledTimes(1)
  })

  it('locks the note, add-files and Remove controls after a partial failure, and a retry finalizes the originally reserved set', async () => {
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
    api.uploadActivityProofFile.mockImplementation(async (url: string) =>
      url.endsWith('evidence-1')
        ? Promise.reject(
            new PathwaysClientError(
              'The file could not be uploaded. Retry this file.',
              'network',
              [],
              503,
            ),
          )
        : undefined,
    )
    api.finalizeActivityProofFile.mockImplementation(async (_p, _a, _u, evidenceId: string) =>
      evidenceId === 'evidence-2'
        ? { status: 'UPLOADING', updateId: 'update-1', remaining: 1 }
        : undefined,
    )
    renderDialog()
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('a.pdf', 'application/pdf'), makeFile('b.jpg', 'image/jpeg')])
    await screen.findByText('b.jpg')
    fireEvent.change(screen.getByLabelText(/Narrative Notes/), {
      target: { value: 'Synthetic proof note' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() => expect(screen.getByText(/Failed:/)).toBeTruthy())
    // submitting has reset to false after the partial failure, but the reservation still stands:
    // the note, add-files and Remove controls must stay locked rather than re-enable.
    expect((screen.getByLabelText(/Narrative Notes/) as HTMLTextAreaElement).disabled).toBe(true)
    expect((screen.getByLabelText(/Upload proof of conduct/) as HTMLInputElement).disabled).toBe(
      true,
    )
    expect(
      (screen.getByRole('button', { name: 'Remove b.jpg' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(screen.getByText(/Files are locked while this submission is in progress/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Narrative Notes/), { target: { value: 'Edited' } })
    expect((screen.getByLabelText(/Narrative Notes/) as HTMLTextAreaElement).value).toBe(
      'Synthetic proof note',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove b.jpg' }))
    expect(screen.getByText('b.jpg')).toBeTruthy()
    selectFiles([makeFile('c.png', 'image/png')])
    expect(screen.queryByText('c.png')).toBeNull()
    api.uploadActivityProofFile.mockImplementation(async () => undefined)
    api.finalizeActivityProofFile.mockResolvedValue({
      status: 'COMMITTED',
      acknowledgement: {},
    })
    api.getActivity.mockResolvedValue(activity)
    fireEvent.click(screen.getByRole('button', { name: 'Retry a.pdf' }))
    await waitFor(() => expect(api.getActivity).toHaveBeenCalledOnce())
    // Only the originally reserved evidence ids were ever finalized.
    expect(api.reserveActivityProofUpload).toHaveBeenCalledTimes(1)
    expect(api.finalizeActivityProofFile).toHaveBeenCalledWith(
      'project-a',
      'activity-a',
      'update-1',
      'evidence-1',
    )
  })

  it('retries only the reload when finish() fails after the update already committed', async () => {
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
    api.uploadActivityProofFile.mockResolvedValue(undefined)
    api.finalizeActivityProofFile.mockResolvedValueOnce({
      status: 'COMMITTED',
      acknowledgement: {},
    })
    api.getActivity.mockRejectedValueOnce(new Error('network blip'))
    const onSubmitted = vi.fn()
    renderDialog(onSubmitted)
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('a.pdf', 'application/pdf')])
    await screen.findByText('a.pdf')
    fireEvent.change(screen.getByLabelText(/Narrative Notes/), {
      target: { value: 'Synthetic proof note' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('The proof is committed.'),
    )
    expect(onSubmitted).not.toHaveBeenCalled()
    api.getActivity.mockResolvedValueOnce(activity)
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(activity))
    // The retry only reloaded; it never reserved or uploaded a second time.
    expect(api.reserveActivityProofUpload).toHaveBeenCalledTimes(1)
    expect(api.uploadActivityProofFile).toHaveBeenCalledTimes(1)
    expect(api.finalizeActivityProofFile).toHaveBeenCalledTimes(1)
  })

  it('finalizes every file when the reservation reports READY_TO_COMMIT with all files storageReady', async () => {
    api.reserveActivityProofUpload.mockResolvedValue({
      clientUpdateId: 'client-1',
      updateId: 'update-1',
      status: 'READY_TO_COMMIT',
      files: [
        {
          evidenceId: 'evidence-1',
          fileName: 'a.pdf',
          contentType: 'application/pdf',
          byteSize: 1024,
          sha256: 'x'.repeat(64),
          storageReady: true,
          uploadUrl: null,
        },
      ],
    })
    api.finalizeActivityProofFile.mockResolvedValue({ status: 'COMMITTED', acknowledgement: {} })
    api.getActivity.mockResolvedValue(activity)
    const onSubmitted = vi.fn()
    renderDialog(onSubmitted)
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('a.pdf', 'application/pdf')])
    await screen.findByText('a.pdf')
    fireEvent.change(screen.getByLabelText(/Narrative Notes/), {
      target: { value: 'Synthetic proof note' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(activity))
    expect(api.uploadActivityProofFile).not.toHaveBeenCalled()
    expect(api.finalizeActivityProofFile).toHaveBeenCalledOnce()
    expect(api.finalizeActivityProofFile).toHaveBeenCalledWith(
      'project-a',
      'activity-a',
      'update-1',
      'evidence-1',
    )
  })

  it('hashes multiple files sequentially rather than all at once', async () => {
    const order: string[] = []
    let releaseFirst: (() => void) | undefined
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const originalDigest = crypto.subtle.digest.bind(crypto.subtle)
    const digestSpy = vi
      .spyOn(crypto.subtle, 'digest')
      .mockImplementation(async (...args: Parameters<typeof crypto.subtle.digest>) => {
        if (order.length === 0) {
          order.push('start-a')
          await first
          order.push('end-a')
        } else {
          order.push('start-b')
        }
        return originalDigest(...args)
      })
    api.reserveActivityProofUpload.mockImplementation(async () => {
      // By the time the reservation call fires, hashing must already be complete for both
      // files, and file b's hash must not have started before file a's finished.
      expect(order).toEqual(['start-a', 'end-a', 'start-b'])
      return {
        clientUpdateId: 'client-1',
        updateId: 'update-1',
        status: 'UPLOADING',
        files: [],
      }
    })
    renderDialog()
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('a.pdf', 'application/pdf'), makeFile('b.jpg', 'image/jpeg')])
    await screen.findByText('b.jpg')
    fireEvent.change(screen.getByLabelText(/Narrative Notes/), {
      target: { value: 'Synthetic proof note' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    // Only file a's hash has started; file b must not start until a's hashing resolves.
    await waitFor(() => expect(order).toEqual(['start-a']))
    releaseFirst?.()
    await waitFor(() => expect(api.reserveActivityProofUpload).toHaveBeenCalledOnce())
    expect(order).toEqual(['start-a', 'end-a', 'start-b'])
    digestSpy.mockRestore()
  })
})
