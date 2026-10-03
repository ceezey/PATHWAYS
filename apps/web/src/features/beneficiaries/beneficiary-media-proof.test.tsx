// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  listBeneficiaryMedia: vi.fn(),
  getBeneficiaryMediaLimits: vi.fn(),
  reserveBeneficiaryMedia: vi.fn(),
  uploadActivityProofFile: vi.fn(),
  finalizeBeneficiaryMedia: vi.fn(),
  getBeneficiaryMediaBlob: vi.fn(),
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
vi.mock('@/lib/services/pathways-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/pathways-client')>()),
  pathwaysClient: api,
}))

import { BeneficiaryMediaProof } from './beneficiary-media-proof'

const item = {
  id: 'media-a',
  type: 'PHOTO' as const,
  fileName: 'visit.jpg',
  contentType: 'image/jpeg',
  byteSize: 420_000,
  description: 'Home visit',
  submittedAt: '2026-10-01T00:00:00.000Z',
  submittedBy: 'Synthetic officer',
  storageReady: true,
}
const limits = {
  maxFiles: 3,
  maxFileBytes: 5 * 1024 * 1024,
  contentTypes: ['image/jpeg', 'image/png', 'video/mp4'],
}
const sha = 'a'.repeat(64)

const renderMedia = (canManage = true) =>
  render(
    <BeneficiaryMediaProof beneficiaryId="ben-a" canManage={canManage} projectId="project-a" />,
  )

const selectFile = (name = 'new.jpg', type = 'image/jpeg') =>
  fireEvent.change(screen.getByLabelText('Photo or video files'), {
    target: { files: [new File([new Uint8Array(1024)], name, { type })] },
  })

const openDialog = async () => {
  await screen.findByText('visit.jpg')
  fireEvent.click(screen.getAllByRole('button', { name: /Add media/ })[0])
  await screen.findByText(/up to 3 files/)
}

beforeEach(() => {
  vi.clearAllMocks()
  api.listBeneficiaryMedia.mockResolvedValue([item])
  api.getBeneficiaryMediaLimits.mockResolvedValue(limits)
  api.reserveBeneficiaryMedia.mockResolvedValue([
    {
      mediaId: 'media-new',
      fileName: 'new.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
      sha256: sha,
      uploadUrl: 'https://upload.test/x',
    },
  ])
  api.uploadActivityProofFile.mockResolvedValue(undefined)
  api.finalizeBeneficiaryMedia.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('BeneficiaryMediaProof', () => {
  it('lists real items with Uploaded status and no review metric', async () => {
    renderMedia()
    await screen.findByText('visit.jpg')
    expect(api.listBeneficiaryMedia).toHaveBeenCalledWith('project-a', 'ben-a')
    expect(screen.getByText('Uploaded')).toBeTruthy()
    expect(screen.getByText('Media items')).toBeTruthy()
    expect(screen.queryByText(/for review/i)).toBeNull()
  })

  it('shows None yet when empty and a Retry when loading fails', async () => {
    api.listBeneficiaryMedia.mockResolvedValueOnce([])
    renderMedia()
    await screen.findByText('None yet')
    cleanup()
    api.listBeneficiaryMedia.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce([item])
    renderMedia()
    await screen.findByText('Media proof could not be loaded.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('visit.jpg')
  })

  it('hides Add media without the manage permission', async () => {
    renderMedia(false)
    await screen.findByText('visit.jpg')
    expect(screen.queryByRole('button', { name: /Add media/ })).toBeNull()
  })

  it('uploads through reserve, signed upload and finalize, then reloads the list', async () => {
    renderMedia()
    await openDialog()
    expect(api.getBeneficiaryMediaLimits).toHaveBeenCalledWith('project-a', 'ben-a')
    selectFile()
    await screen.findByText(/new\.jpg/)
    fireEvent.click(screen.getByRole('button', { name: /Upload media/ }))
    await waitFor(() =>
      expect(api.finalizeBeneficiaryMedia).toHaveBeenCalledWith('project-a', 'ben-a', 'media-new'),
    )
    expect(api.reserveBeneficiaryMedia.mock.calls[0][2].files[0]).toMatchObject({
      fileName: 'new.jpg',
      contentType: 'image/jpeg',
      byteSize: 1024,
      sha256: sha,
    })
    expect(api.uploadActivityProofFile).toHaveBeenCalledWith(
      'https://upload.test/x',
      expect.any(File),
    )
    await waitFor(() => expect(api.listBeneficiaryMedia).toHaveBeenCalledTimes(2))
  })

  it('rejects unsupported types before any request', async () => {
    renderMedia()
    await openDialog()
    selectFile('doc.pdf', 'application/pdf')
    await screen.findByText(/unsupported type/)
    expect(api.reserveBeneficiaryMedia).not.toHaveBeenCalled()
  })

  it('marks a failed finalize and retries without reserving or uploading again', async () => {
    api.finalizeBeneficiaryMedia.mockRejectedValueOnce(new Error('verify down'))
    renderMedia()
    await openDialog()
    selectFile()
    await screen.findByText(/new\.jpg/)
    fireEvent.click(screen.getByRole('button', { name: /Upload media/ }))
    const retry = await screen.findByRole('button', { name: 'Retry new.jpg' })
    expect(screen.getByText('Failed')).toBeTruthy()
    fireEvent.click(retry)
    await waitFor(() => expect(api.finalizeBeneficiaryMedia).toHaveBeenCalledTimes(2))
    expect(api.reserveBeneficiaryMedia).toHaveBeenCalledTimes(1)
    expect(api.uploadActivityProofFile).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(api.listBeneficiaryMedia).toHaveBeenCalledTimes(2))
  })

  it('loads a preview as an authorized blob only when requested', async () => {
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() })
    api.getBeneficiaryMediaBlob.mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))
    renderMedia()
    await screen.findByText('visit.jpg')
    expect(api.getBeneficiaryMediaBlob).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Preview visit.jpg' }))
    await screen.findByAltText('Preview: visit.jpg')
    expect(api.getBeneficiaryMediaBlob).toHaveBeenCalledWith('project-a', 'ben-a', 'media-a')
  })
})
