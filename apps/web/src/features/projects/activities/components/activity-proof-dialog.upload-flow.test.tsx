// @vitest-environment jsdom

// biome-ignore organizeImports: the harness registers the module mocks and must load first
import {
  activity,
  api,
  limits,
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

  it('re-finalizes once when concurrent finalizes all report UPLOADING', async () => {
    const onSubmitted = vi.fn()
    const files = ['a.pdf', 'b.jpg'].map((fileName, index) => ({
      evidenceId: `evidence-${index + 1}`,
      fileName,
      contentType: index ? 'image/jpeg' : 'application/pdf',
      byteSize: 1024,
      sha256: (index ? 'y' : 'x').repeat(64),
      storageReady: true,
      uploadUrl: null,
    }))
    api.reserveActivityProofUpload.mockResolvedValue({
      clientUpdateId: 'client-1',
      updateId: 'update-1',
      status: 'READY_TO_COMMIT',
      files,
    })
    api.finalizeActivityProofFile
      .mockResolvedValueOnce({ status: 'UPLOADING', updateId: 'update-1', remaining: 1 })
      .mockResolvedValueOnce({ status: 'UPLOADING', updateId: 'update-1', remaining: 1 })
      .mockResolvedValueOnce({ status: 'COMMITTED', acknowledgement: {} })
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
    expect(api.finalizeActivityProofFile).toHaveBeenCalledTimes(3)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('completes when the user retries Submit proof after every file is uploaded', async () => {
    const onSubmitted = vi.fn()
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
    api.finalizeActivityProofFile
      .mockResolvedValueOnce({ status: 'UPLOADING', updateId: 'update-1', remaining: 1 })
      .mockResolvedValueOnce({ status: 'UPLOADING', updateId: 'update-1', remaining: 1 })
      .mockResolvedValueOnce({ status: 'COMMITTED', acknowledgement: {} })
    api.getActivity.mockResolvedValue(activity)
    renderDialog(onSubmitted)
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('a.pdf', 'application/pdf')])
    await screen.findByText('a.pdf')
    fireEvent.change(screen.getByLabelText(/Narrative Notes/), {
      target: { value: 'Synthetic proof note' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('not submitted for review'),
    )
    expect(api.finalizeActivityProofFile).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(activity))
    expect(api.finalizeActivityProofFile).toHaveBeenCalledTimes(3)
  })

  it('never re-uploads for the extra finalize when uploads were signed', async () => {
    const onSubmitted = vi.fn()
    api.reserveActivityProofUpload.mockResolvedValue({
      clientUpdateId: 'client-1',
      updateId: 'update-1',
      status: 'UPLOADING',
      files: ['a.pdf', 'b.jpg'].map((fileName, index) => ({
        evidenceId: `evidence-${index + 1}`,
        fileName,
        contentType: index ? 'image/jpeg' : 'application/pdf',
        byteSize: 1024,
        sha256: (index ? 'y' : 'x').repeat(64),
        storageReady: false,
        uploadUrl: `https://storage.invalid/evidence-${index + 1}`,
      })),
    })
    api.uploadActivityProofFile.mockResolvedValue(undefined)
    api.getActivity.mockResolvedValue(activity)
    api.finalizeActivityProofFile
      .mockResolvedValueOnce({ status: 'UPLOADING', updateId: 'update-1', remaining: 1 })
      .mockResolvedValueOnce({ status: 'UPLOADING', updateId: 'update-1', remaining: 1 })
      .mockResolvedValueOnce({ status: 'COMMITTED', acknowledgement: {} })
    renderDialog(onSubmitted)
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('a.pdf', 'application/pdf'), makeFile('b.jpg', 'image/jpeg')])
    await screen.findByText('b.jpg')
    fireEvent.change(screen.getByLabelText(/Narrative Notes/), {
      target: { value: 'Synthetic proof note' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(activity))
    expect(api.uploadActivityProofFile).toHaveBeenCalledTimes(2)
    expect(api.finalizeActivityProofFile).toHaveBeenCalledTimes(3)
  })

  it('retries Submit proof with one finalize and no second upload', async () => {
    const onSubmitted = vi.fn()
    api.reserveActivityProofUpload.mockResolvedValue({
      clientUpdateId: 'client-1',
      updateId: 'update-1',
      status: 'UPLOADING',
      files: ['a.pdf', 'b.jpg'].map((fileName, index) => ({
        evidenceId: `evidence-${index + 1}`,
        fileName,
        contentType: index ? 'image/jpeg' : 'application/pdf',
        byteSize: 1024,
        sha256: (index ? 'y' : 'x').repeat(64),
        storageReady: false,
        uploadUrl: `https://storage.invalid/evidence-${index + 1}`,
      })),
    })
    api.uploadActivityProofFile.mockResolvedValue(undefined)
    api.getActivity.mockResolvedValue(activity)
    api.finalizeActivityProofFile
      .mockResolvedValueOnce({ status: 'UPLOADING', updateId: 'update-1', remaining: 1 })
      .mockResolvedValueOnce({ status: 'UPLOADING', updateId: 'update-1', remaining: 1 })
      .mockResolvedValueOnce({ status: 'UPLOADING', updateId: 'update-1', remaining: 1 })
      .mockResolvedValueOnce({ status: 'COMMITTED', acknowledgement: {} })
    renderDialog(onSubmitted)
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('a.pdf', 'application/pdf'), makeFile('b.jpg', 'image/jpeg')])
    await screen.findByText('b.jpg')
    fireEvent.change(screen.getByLabelText(/Narrative Notes/), {
      target: { value: 'Synthetic proof note' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('not submitted for review'),
    )
    expect(api.finalizeActivityProofFile).toHaveBeenCalledTimes(3)
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(activity))
    expect(api.uploadActivityProofFile).toHaveBeenCalledTimes(2)
    expect(api.finalizeActivityProofFile).toHaveBeenCalledTimes(4)
  })

  it('retries a failed finalize without uploading the file again', async () => {
    const onSubmitted = vi.fn()
    api.reserveActivityProofUpload.mockResolvedValue({
      clientUpdateId: 'client-1',
      updateId: 'update-1',
      status: 'UPLOADING',
      files: ['a.pdf', 'b.jpg'].map((fileName, index) => ({
        evidenceId: `evidence-${index + 1}`,
        fileName,
        contentType: index ? 'image/jpeg' : 'application/pdf',
        byteSize: 1024,
        sha256: (index ? 'y' : 'x').repeat(64),
        storageReady: false,
        uploadUrl: `https://storage.invalid/evidence-${index + 1}`,
      })),
    })
    api.uploadActivityProofFile.mockResolvedValue(undefined)
    api.getActivity.mockResolvedValue(activity)
    api.finalizeActivityProofFile.mockImplementation(async (_p, _a, _u, id: string) => {
      if (id === 'evidence-1' && api.finalizeActivityProofFile.mock.calls.length <= 2)
        throw new PathwaysClientError('Finalize failed. Retry.', 'network', [], 503)
      return { status: 'COMMITTED', acknowledgement: {} }
    })
    renderDialog(onSubmitted)
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('a.pdf', 'application/pdf'), makeFile('b.jpg', 'image/jpeg')])
    await screen.findByText('b.jpg')
    fireEvent.change(screen.getByLabelText(/Narrative Notes/), {
      target: { value: 'Synthetic proof note' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() => expect(screen.getByText(/Failed:/)).toBeTruthy())
    fireEvent.click(screen.getAllByRole('button', { name: /Retry/ })[0])
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(activity))
    expect(api.uploadActivityProofFile).toHaveBeenCalledTimes(2)
  })

  it('retrying the last failed finalize commits or reports the unfinished update', async () => {
    const onSubmitted = vi.fn()
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
    api.finalizeActivityProofFile
      .mockRejectedValueOnce(new PathwaysClientError('Finalize failed.', 'network', [], 503))
      .mockResolvedValueOnce({ status: 'UPLOADING', updateId: 'update-1', remaining: 1 })
      .mockResolvedValueOnce({ status: 'COMMITTED', acknowledgement: {} })
    api.getActivity.mockResolvedValue(activity)
    renderDialog(onSubmitted)
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('a.pdf', 'application/pdf')])
    await screen.findByText('a.pdf')
    fireEvent.change(screen.getByLabelText(/Narrative Notes/), {
      target: { value: 'Synthetic proof note' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() => expect(screen.getByText(/Failed:/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Retry a.pdf' }))
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(activity))
    expect(api.finalizeActivityProofFile).toHaveBeenCalledTimes(3)
  })

  it('reports an unfinished update when the retried finalize still does not commit', async () => {
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
    api.finalizeActivityProofFile
      .mockRejectedValueOnce(new PathwaysClientError('Finalize failed.', 'network', [], 503))
      .mockResolvedValue({ status: 'UPLOADING', updateId: 'update-1', remaining: 1 })
    renderDialog()
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('a.pdf', 'application/pdf')])
    await screen.findByText('a.pdf')
    fireEvent.change(screen.getByLabelText(/Narrative Notes/), {
      target: { value: 'Synthetic proof note' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() => expect(screen.getByText(/Failed:/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Retry a.pdf' }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('not submitted for review'),
    )
  })

  it('tells the user when every file is uploaded but the update did not commit', async () => {
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
    api.finalizeActivityProofFile.mockResolvedValue({
      status: 'UPLOADING',
      updateId: 'update-1',
      remaining: 1,
    })
    renderDialog()
    await waitFor(() => expect(api.getActivityProofUploadLimits).toHaveBeenCalledOnce())
    selectFiles([makeFile('a.pdf', 'application/pdf')])
    await screen.findByText('a.pdf')
    fireEvent.change(screen.getByLabelText(/Narrative Notes/), {
      target: { value: 'Synthetic proof note' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Submit proof/ }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('not submitted for review'),
    )
  })
})
