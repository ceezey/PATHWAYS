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

import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PathwaysClientError } from '@/lib/api/core/request'

useProofDialogHarness()

describe('ActivityProofDialog direct upload', () => {
  it('enables the beneficiaries-reached-this-session field with the new hint', async () => {
    renderDialog()
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    const field = screen.getByLabelText(/Beneficiaries reached this session/) as HTMLInputElement
    expect(field.disabled).toBe(false)
    expect(
      screen.getByText(/Counts toward the activity's beneficiaries reached once M&E approves/),
    ).toBeTruthy()
    expect(screen.queryByText(/not available yet/i)).toBeNull()
  })

  it.each(['-1', '1.5', '100001'])(
    'rejects an invalid beneficiaries-reached-this-session value client-side: %s',
    async (invalid) => {
      renderDialog()
      await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
      selectFiles([makeFile('a.pdf', 'application/pdf')])
      await screen.findByText('a.pdf')
      fireEvent.change(screen.getByLabelText(/Narrative Notes/), {
        target: { value: 'Synthetic proof note' },
      })
      fireEvent.change(screen.getByLabelText(/Beneficiaries reached this session/), {
        target: { value: invalid },
      })
      fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
      await waitFor(() =>
        expect(screen.getByRole('alert').textContent).toContain(
          'Beneficiaries reached this session must be a whole number from 0 to 100000.',
        ),
      )
      const field = screen.getByLabelText(/Beneficiaries reached this session/)
      expect(field.getAttribute('aria-invalid')).toBe('true')
      expect(field.getAttribute('aria-describedby')).toContain(
        'activity-beneficiaries-reached-error',
      )
      expect(
        document.getElementById('activity-beneficiaries-reached-error')?.textContent,
      ).toContain('must be a whole number from 0 to 100000')
      expect(api.reserveActivityProofUpload).not.toHaveBeenCalled()
    },
  )

  it('allows an empty beneficiaries-reached-this-session value and omits it from the request', async () => {
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
    renderDialog()
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('a.pdf', 'application/pdf')])
    await screen.findByText('a.pdf')
    fireEvent.change(screen.getByLabelText(/Narrative Notes/), {
      target: { value: 'Synthetic proof note' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() => expect(api.reserveActivityProofUpload).toHaveBeenCalledOnce())
    const request = api.reserveActivityProofUpload.mock.calls[0][0]
    expect('beneficiariesReachedThisSession' in request).toBe(false)
  })

  it('sends a valid beneficiaries-reached-this-session value in the reservation request', async () => {
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
    renderDialog()
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('a.pdf', 'application/pdf')])
    await screen.findByText('a.pdf')
    fireEvent.change(screen.getByLabelText(/Narrative Notes/), {
      target: { value: 'Synthetic proof note' },
    })
    fireEvent.change(screen.getByLabelText(/Beneficiaries reached this session/), {
      target: { value: '42' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() => expect(api.reserveActivityProofUpload).toHaveBeenCalledOnce())
    expect(api.reserveActivityProofUpload).toHaveBeenCalledWith(
      expect.objectContaining({ beneficiariesReachedThisSession: 42 }),
    )
  })

  it('locks the beneficiaries-reached-this-session field after a partial failure', async () => {
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
    fireEvent.change(screen.getByLabelText(/Beneficiaries reached this session/), {
      target: { value: '7' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() => expect(screen.getByText(/Failed:/)).toBeTruthy())
    expect(
      (screen.getByLabelText(/Beneficiaries reached this session/) as HTMLInputElement).disabled,
    ).toBe(true)
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
