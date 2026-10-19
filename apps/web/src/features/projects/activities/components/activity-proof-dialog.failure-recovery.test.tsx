// @vitest-environment jsdom

// biome-ignore organizeImports: the harness registers the module mocks and must load first
import {
  activity,
  api,
  makeFile,
  renderDialog,
  selectFiles,
  useProofDialogHarness,
} from './activity-proof-dialog.harness'

import type { Activity } from '@/types/pathways'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PathwaysClientError } from '@/lib/api/core/request'
import { toast } from 'sonner'
import { ActivityProofDialog } from './activity-proof-dialog'

useProofDialogHarness()

describe('ActivityProofDialog direct upload', () => {
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

  it('surfaces a failed upload instead of staying silent and keeps the update retryable', async () => {
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
    api.uploadActivityProofFile.mockRejectedValue(
      new PathwaysClientError(
        'The file could not be uploaded. Retry this file.',
        'network',
        [],
        500,
      ),
    )
    renderDialog()
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('a.pdf', 'application/pdf')])
    await screen.findByText('a.pdf')
    fireEvent.change(screen.getByLabelText(/Narrative Notes/), { target: { value: 'Note' } })
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Not every proof file was uploaded'),
    )
    expect(api.finalizeActivityProofFile).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Retry a.pdf' })).toBeTruthy()
  })

  it('resumes an incomplete reservation with its clientUpdateId, note and progress', async () => {
    const resumable = {
      ...activity,
      updateNotes: [
        {
          id: 'update-1',
          note: 'Participant Reached',
          progress: 0,
          beneficiariesReachedThisSession: null,
          status: 'Submitted',
          proofIncomplete: true,
          resumeClientUpdateId: 'resume-client-id',
        },
      ],
    } as unknown as Activity
    api.reserveActivityProofUpload.mockResolvedValue({
      clientUpdateId: 'resume-client-id',
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
    api.finalizeActivityProofFile.mockResolvedValue({ status: 'COMMITTED', activity: resumable })
    const onSubmitted = vi.fn()
    render(
      <ActivityProofDialog
        activity={resumable}
        onOpenChange={vi.fn()}
        onSubmitted={onSubmitted}
        open
      />,
    )
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    expect((screen.getByLabelText(/Narrative Notes/) as HTMLTextAreaElement).value).toBe(
      'Participant Reached',
    )
    selectFiles([makeFile('a.pdf', 'application/pdf')])
    await screen.findByText('a.pdf')
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled())
    expect(api.reserveActivityProofUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        clientUpdateId: 'resume-client-id',
        progressPercent: 0,
        note: 'Participant Reached',
      }),
    )
  })

  it('resumes an all-uploaded but uncommitted update with finalize only', async () => {
    const resumable = {
      ...activity,
      updateNotes: [
        {
          id: 'update-1',
          note: 'Participant Reached',
          progress: 0,
          beneficiariesReachedThisSession: null,
          status: 'Submitted',
          proofIncomplete: true,
          resumeClientUpdateId: 'resume-client-id',
        },
      ],
    } as unknown as Activity
    api.reserveActivityProofUpload.mockResolvedValue({
      clientUpdateId: 'resume-client-id',
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
    api.finalizeActivityProofFile.mockResolvedValue({ status: 'COMMITTED', activity: resumable })
    const onSubmitted = vi.fn()
    render(
      <ActivityProofDialog
        activity={resumable}
        onOpenChange={vi.fn()}
        onSubmitted={onSubmitted}
        open
      />,
    )
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('a.pdf', 'application/pdf')])
    await screen.findByText('a.pdf')
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled())
    expect(api.uploadActivityProofFile).not.toHaveBeenCalled()
    expect(api.finalizeActivityProofFile).toHaveBeenCalledTimes(1)
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

  it('explains a pending-review 409 from the reservation call and what unblocks it', async () => {
    api.reserveActivityProofUpload.mockRejectedValueOnce(
      new PathwaysClientError(
        'Another activity update is already awaiting review.',
        'invalid',
        [],
        409,
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
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('waiting for M&E review'),
    )
    expect(screen.getByRole('alert').textContent).toContain('approve or return that update')
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
})
