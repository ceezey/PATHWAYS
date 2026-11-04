// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => [] as string[])
const api = vi.hoisted(() => ({
  limits: vi.fn(),
  reserve: vi.fn(),
  finalize: vi.fn(),
  uploadActivityProofFile: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('@/lib/files/proof-file-hash', () => ({ sha256Hex: vi.fn(async () => 'a'.repeat(64)) }))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: ReactNode; open?: boolean }) =>
    open === false ? null : <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/lib/api/public-media', () => ({ publicMediaClient: api }))
vi.mock('@/lib/api/activities', () => ({ activitiesClient: api }))

import { AddPublicMediaDialog } from './add-public-media-dialog'

const projectId = '10000000-0000-4000-8000-000000000001'
const sha = 'a'.repeat(64)
const limits = {
  maxFiles: 3,
  maxFileBytes: 5 * 1024 * 1024,
  contentTypes: ['image/jpeg', 'video/mp4'],
}
const onUploaded = vi.fn()
const onOpenChange = vi.fn()

const selectFile = (name = 'new.jpg', type = 'image/jpeg') =>
  fireEvent.change(screen.getByLabelText('Photo or video files'), {
    target: { files: [new File([new Uint8Array(1024)], name, { type })] },
  })

const openDialog = async () => {
  render(
    <AddPublicMediaDialog
      projectId={projectId}
      onOpenChange={onOpenChange}
      onUploaded={onUploaded}
    />,
  )
  await screen.findByText(/up to 3 files/)
}

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  api.limits.mockResolvedValue(limits)
  api.reserve.mockImplementation(async () => {
    calls.push('reserve')
    return [
      {
        mediaId: 'media-new',
        fileName: 'new.jpg',
        contentType: 'image/jpeg',
        byteSize: 1024,
        sha256: sha,
        uploadUrl: 'https://upload.test/x',
      },
    ]
  })
  api.uploadActivityProofFile.mockImplementation(async () => {
    calls.push('upload')
  })
  api.finalize.mockImplementation(async () => {
    calls.push('finalize')
  })
})
afterEach(cleanup)

describe('AddPublicMediaDialog', () => {
  it('hashes, reserves, uploads and finalizes in order, then reports the upload', async () => {
    await openDialog()
    expect(api.limits).toHaveBeenCalledWith(projectId)
    selectFile()
    await screen.findByText(/new\.jpg/)
    fireEvent.click(screen.getByRole('button', { name: /Upload media/ }))
    await waitFor(() => expect(onUploaded).toHaveBeenCalledOnce())
    expect(calls).toEqual(['reserve', 'upload', 'finalize'])
    expect(api.reserve).toHaveBeenCalledWith(projectId, {
      files: [{ fileName: 'new.jpg', contentType: 'image/jpeg', byteSize: 1024, sha256: sha }],
    })
    expect(api.uploadActivityProofFile).toHaveBeenCalledWith(
      'https://upload.test/x',
      expect.any(File),
    )
    expect(api.finalize).toHaveBeenCalledWith(projectId, 'media-new')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('rejects an unsupported type before any request', async () => {
    await openDialog()
    selectFile('doc.pdf', 'application/pdf')
    await screen.findByText(/unsupported type/)
    fireEvent.click(screen.getByRole('button', { name: /Upload media/ }))
    expect(api.reserve).not.toHaveBeenCalled()
  })

  it('retries one failed file without reserving again', async () => {
    api.finalize.mockRejectedValueOnce(new Error('verify down'))
    await openDialog()
    selectFile()
    await screen.findByText(/new\.jpg/)
    fireEvent.click(screen.getByRole('button', { name: /Upload media/ }))
    const retry = await screen.findByRole('button', { name: 'Retry new.jpg' })
    expect(onUploaded).not.toHaveBeenCalled()
    fireEvent.click(retry)
    await waitFor(() => expect(onUploaded).toHaveBeenCalledOnce())
    expect(api.reserve).toHaveBeenCalledTimes(1)
    expect(api.finalize).toHaveBeenCalledTimes(2)
    // A failed finalize may have deleted the object, so the retry uploads it again.
    expect(api.uploadActivityProofFile).toHaveBeenCalledTimes(2)
  })
})
