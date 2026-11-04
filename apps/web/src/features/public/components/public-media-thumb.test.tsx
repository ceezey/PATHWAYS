/* @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({ contentBlob: vi.fn() }))
vi.mock('@/lib/api/public-media', () => ({ publicMediaClient: client }))

import { PublicMediaThumb } from './public-media-thumb'

const projectId = '10000000-0000-4000-8000-000000000001'
const mediaId = '20000000-0000-4000-8000-000000000001'

describe('public media thumbnail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:thumb'), revokeObjectURL: vi.fn() })
    client.contentBlob.mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }))
  })
  afterEach(cleanup)

  it('shows a photo from an object URL and revokes it on unmount', async () => {
    const view = render(
      <PublicMediaThumb projectId={projectId} mediaId={mediaId} type="PHOTO" label="visit.jpg" />,
    )
    const image = await screen.findByAltText('visit.jpg')
    expect(image.getAttribute('src')).toBe('blob:thumb')
    view.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:thumb')
  })

  it('does not download a video and keeps a labelled placeholder', () => {
    render(
      <PublicMediaThumb projectId={projectId} mediaId={mediaId} type="VIDEO" label="clip.mp4" />,
    )
    expect(screen.getByRole('img', { name: 'Video: clip.mp4' })).toBeTruthy()
    expect(client.contentBlob).not.toHaveBeenCalled()
  })

  it('revokes nothing when the download resolves after unmount', async () => {
    let finish: (blob: Blob) => void = () => {}
    client.contentBlob.mockReturnValue(
      new Promise<Blob>((resolve) => {
        finish = resolve
      }),
    )
    const view = render(
      <PublicMediaThumb projectId={projectId} mediaId={mediaId} type="PHOTO" label="visit.jpg" />,
    )
    view.unmount()
    finish(new Blob(['x']))
    await waitFor(() => expect(client.contentBlob).toHaveBeenCalled())
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('shows a placeholder when the download fails', async () => {
    client.contentBlob.mockRejectedValue(new Error('no'))
    render(
      <PublicMediaThumb projectId={projectId} mediaId={mediaId} type="PHOTO" label="visit.jpg" />,
    )
    expect(await screen.findByRole('img', { name: 'Preview unavailable: visit.jpg' })).toBeTruthy()
  })
})
